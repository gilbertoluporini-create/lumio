"use client";

/**
 * Lumi Chat Panel — chat contextual reutilizável pra telas ricas
 * (resumo, deck, quiz-banco, mapa). Conversa via POST /api/ai/chat-summary,
 * que cobra 1 coin por mensagem do usuário.
 *
 * Histórico ficou só client-side por enquanto — não persiste entre reloads.
 * Quando criar a tabela `chat_summary_messages`, pluga aqui sem mexer no resto.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Analytics } from "@/lib/analytics";

export type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type LumiChatPanelProps = {
  /** lectureId origem do conteúdo (sempre tem uma lecture base, mesmo pra decks/quizzes/mapas). */
  lectureId: string;
  /** Título do material que aparece como contexto pro usuário. */
  contextLabel?: string;
  /** Sugestões fixas que viram chips clicáveis acima do input. */
  suggestedQuestions?: string[];
  /** Placeholder do input. */
  placeholder?: string;
  /** Variante visual — define o tom da pergunta (resumo/deck/quiz/mapa). */
  variant?: "summary" | "deck" | "quiz" | "mindmap";
  /** Altura interna do histórico — default 240px. */
  historyHeight?: number;
  /** Classe extra no wrapper. */
  className?: string;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Sanitiza artifacts que a IA às vezes vaza no output:
 *   - `{{PLACEHOLDER}}` ou `{{{{...}}}}` (templates não substituídos)
 *   - Separadores tipo `*---*`, `---***`, `***---` que aparecem entre frases
 *   - Linhas com 3+ asteriscos/hífens misturados (separador corrompido)
 */
function cleanAssistantText(text: string): string {
  return text
    .replace(/\{\{+\s*[\w-]*\s*\}+\}+/g, "")
    .replace(/\*+\s*-{2,}\s*\*+/g, "")
    .replace(/(^|\n)\s*[*-]{3,}\s*[*-]{2,}\s*($|\n)/g, "$1\n$2");
}

const VARIANT_HEADLINE: Record<NonNullable<LumiChatPanelProps["variant"]>, string> = {
  summary: "Pergunte sobre este resumo",
  deck: "Pergunte sobre estes cards",
  quiz: "Pergunte sobre este tópico",
  mindmap: "Pergunte sobre este mapa",
};

const VARIANT_SUBTITLE: Record<NonNullable<LumiChatPanelProps["variant"]>, string> = {
  summary: "O Lumio responde com base no resumo. Cada pergunta usa 1 coin.",
  deck: "O Lumio responde com base nos flashcards. Cada pergunta usa 1 coin.",
  quiz: "O Lumio explica conceitos das questões. Cada pergunta usa 1 coin.",
  mindmap: "O Lumio explica as conexões do mapa. Cada pergunta usa 1 coin.",
};

export function LumiChatPanel({
  lectureId,
  contextLabel,
  suggestedQuestions,
  placeholder,
  variant = "summary",
  historyHeight = 240,
  className,
}: LumiChatPanelProps) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const stickyToBottomRef = useRef(true);
  const lastTurnCountRef = useRef(0);

  const headline = VARIANT_HEADLINE[variant];
  const subtitle = VARIANT_SUBTITLE[variant];
  const effectiveSuggestions = useMemo(() => {
    if (suggestedQuestions && suggestedQuestions.length > 0) {
      return suggestedQuestions.slice(0, 3);
    }
    if (variant === "deck") {
      return [
        "Quais cards são mais importantes?",
        "Explique o conceito mais difícil deste deck.",
        "Como aplicar isso na prática?",
      ];
    }
    if (variant === "quiz") {
      return [
        "Quais os erros mais comuns nesse tema?",
        "Explique a alternativa mais difícil.",
        "Como diferenciar conceitos parecidos?",
      ];
    }
    if (variant === "mindmap") {
      return [
        "Qual o conceito central?",
        "Como os ramos se conectam?",
        "Qual ramo aprofundar primeiro?",
      ];
    }
    return [
      "Qual o principal conceito?",
      "Como aplicar isso na prática?",
      "Me dê um exemplo concreto.",
    ];
  }, [suggestedQuestions, variant]);

  // Detecta scroll manual pra cima — para o auto-scroll enquanto user lê
  // mensagens anteriores. Volta a stickar quando user scrolla pro fim.
  useEffect(() => {
    const box = historyRef.current;
    if (!box) return;
    function onScroll() {
      if (!box) return;
      const nearBottom =
        box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      stickyToBottomRef.current = nearBottom;
    }
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => box.removeEventListener("scroll", onScroll);
  }, []);

  // Toda mensagem nova do user re-ativa sticky.
  useEffect(() => {
    if (turns.length > lastTurnCountRef.current) {
      stickyToBottomRef.current = true;
    }
    lastTurnCountRef.current = turns.length;
  }, [turns.length]);

  // useLayoutEffect + rAF pra rodar depois do paint (scrollHeight novo).
  useLayoutEffect(() => {
    if (!stickyToBottomRef.current) return;
    const box = historyRef.current;
    if (!box) return;
    const raf = requestAnimationFrame(() => {
      box.scrollTop = box.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [turns, sending]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      const userTurn: ChatTurn = {
        id: newId(),
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      setTurns((prev) => [...prev, userTurn]);
      setInput("");
      setSending(true);
      try {
        const res = await fetch("/api/ai/chat-summary", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lectureId,
            message: trimmed,
            history: turns.map((t) => ({ role: t.role, content: t.content })),
            stream: true,
          }),
        });
        if (!res.ok || !res.body) {
          let errMsg = "Erro ao consultar o Lumio.";
          let upgrade: string | undefined;
          try {
            const j = (await res.json()) as {
              error?: string;
              upgrade?: string;
            };
            if (j.error) errMsg = j.error;
            if (j.upgrade) upgrade = j.upgrade;
          } catch {
            /* ignore */
          }
          if (res.status === 402 && upgrade) {
            Analytics.paywallView("no_coins", "lumi_chat");
            toast.error(errMsg, {
              action: {
                label: "Comprar coins",
                onClick: () => {
                  Analytics.upgradeClicked("paywall");
                  window.location.href = upgrade;
                },
              },
            });
          } else {
            toast.error(errMsg);
          }
          // Rollback: tira a pergunta do histórico pra evitar confusão visual.
          setTurns((prev) => prev.filter((t) => t.id !== userTurn.id));
          return;
        }

        const assistantId = newId();
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";
        let streamError: string | null = null;
        let placeholderAdded = false;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            const json = line.slice(5).trim();
            if (!json) continue;
            try {
              const ev = JSON.parse(json) as {
                delta?: string;
                done?: boolean;
                reply?: string;
                error?: string;
              };
              if (ev.error) {
                streamError = ev.error;
                continue;
              }
              if (typeof ev.delta === "string") {
                accumulated += ev.delta;
                if (!placeholderAdded) {
                  placeholderAdded = true;
                  setTurns((prev) => [
                    ...prev,
                    {
                      id: assistantId,
                      role: "assistant",
                      content: accumulated,
                      createdAt: new Date().toISOString(),
                    },
                  ]);
                } else {
                  setTurns((prev) =>
                    prev.map((t) =>
                      t.id === assistantId ? { ...t, content: accumulated } : t,
                    ),
                  );
                }
              }
              if (ev.done && typeof ev.reply === "string") {
                accumulated = ev.reply;
                setTurns((prev) =>
                  prev.map((t) =>
                    t.id === assistantId ? { ...t, content: ev.reply ?? "" } : t,
                  ),
                );
              }
            } catch {
              /* ignora chunk inválido */
            }
          }
        }

        if (streamError) {
          toast.error(streamError);
          setTurns((prev) => prev.filter((t) => t.id !== userTurn.id));
        }
      } catch (err) {
        toast.error(`Falha de rede: ${(err as Error).message}`);
        setTurns((prev) => prev.filter((t) => t.id !== userTurn.id));
      } finally {
        setSending(false);
      }
    },
    [lectureId, sending, turns],
  );

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/5 via-card to-fuchsia-500/5 p-4",
        className,
      )}
    >
      <div className="flex items-start gap-2.5 mb-3">
        <div className="h-8 w-8 shrink-0 rounded-lg bg-gradient-to-br from-primary to-fuchsia-500 flex items-center justify-center shadow-sm">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight">{headline}</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground leading-tight">
            {contextLabel ? `${contextLabel} · ` : ""}
            {subtitle}
          </p>
        </div>
      </div>

      {/* Histórico — só aparece quando há mensagens */}
      {turns.length > 0 && (
        <div
          ref={historyRef}
          className="mb-3 overflow-y-auto rounded-lg border border-border/40 bg-background/60 p-3 space-y-3"
          style={{ maxHeight: historyHeight }}
        >
          {turns.map((t) => (
            <div
              key={t.id}
              className={cn(
                "text-xs leading-relaxed",
                t.role === "user"
                  ? "text-foreground/85"
                  : "text-foreground",
              )}
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">
                {t.role === "user" ? "Você" : "Lumio"}
              </div>
              {t.role === "assistant" ? (
                <div className="prose prose-xs dark:prose-invert max-w-none prose-p:my-1 prose-p:leading-relaxed prose-strong:text-foreground prose-ul:my-1">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {cleanAssistantText(t.content)}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{t.content}</p>
              )}
            </div>
          ))}
          {sending && (
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Lumio está pensando…
            </div>
          )}
        </div>
      )}

      {/* Sugestões — chips */}
      {turns.length === 0 && effectiveSuggestions.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {effectiveSuggestions.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void sendMessage(q)}
              disabled={sending}
              className="text-[11px] rounded-full bg-background/80 hover:bg-background border border-border/60 hover:border-primary/40 px-2.5 py-1 text-foreground/80 hover:text-foreground transition-colors disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 items-end">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={
            placeholder ??
            "Ex.: Qual a função do cortisol? (Enter envia, Shift+Enter quebra linha)"
          }
          className="min-h-[56px] max-h-[180px] resize-none text-sm bg-background/80"
          rows={1}
          disabled={sending}
        />
        <Button
          type="button"
          variant="gradient"
          size="icon"
          onClick={() => void sendMessage(input)}
          disabled={sending || !input.trim()}
          className="h-10 w-10 shrink-0 rounded-full"
          aria-label="Enviar pergunta"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
