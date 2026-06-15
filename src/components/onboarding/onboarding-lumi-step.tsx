"use client";

/**
 * Passo "aha moment" do onboarding: uma caixa do agente Lumi ao vivo.
 *
 * Em vez de um questionário ou demo fake, o usuário digita o que precisa
 * ("tenho prova de cálculo semana que vem") e o agente REAL resolve —
 * cria matéria, monta plano, agenda prova. O usuário vê o Lumi agir = aha
 * moment, e o dashboard sai cheio em vez de vazio.
 *
 * Reusa o store global de streaming (lib/lumi-stream-store) + /api/lumi/agent,
 * exatamente como /lumi. O chat criado aqui persiste — o usuário pode continuar
 * a conversa em /lumi depois.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, Send, Sparkles } from "lucide-react";
import {
  startLumiStream,
  subscribeStream,
  getStreamSnapshot,
} from "@/lib/lumi-stream-store";
import {
  appendMessage,
  createChat,
  getChat,
  type LumiChatMessage,
} from "@/lib/lumi-chats";
import { LumiCharacter } from "@/components/brand/lumi";
import { cn } from "@/lib/utils";

const SUGESTOES = [
  "Tenho prova daqui 2 semanas, me ajuda a organizar",
  "Cria a matéria de Cálculo I pra mim",
  "Monta um plano de estudos de Anatomia",
];

// Tradução amigável dos nomes de tool pros chips de "o Lumi fez X"
const TOOL_LABEL: Record<string, string> = {
  criar_materia: "Criou a matéria",
  criar_pasta: "Criou a pasta",
  criar_plano_de_estudos: "Montou o plano de estudos",
  gerar_rotina_estudo: "Montou a rotina de estudo",
  agendar_evento: "Agendou no calendário",
  gerar_resumo: "Gerou o resumo",
  criar_flashcards: "Criou os flashcards",
  criar_quiz: "Criou o quiz",
  criar_mapa_mental: "Criou o mapa mental",
  renomear_materia: "Renomeou a matéria",
  listar_materias: "Conferiu suas matérias",
};

function toolChipLabel(name: string): string {
  return TOOL_LABEL[name] ?? "Trabalhou no app";
}

export function OnboardingLumiStep({
  userId,
  onProceed,
}: {
  userId: string;
  onProceed: () => void;
}) {
  // Cria um chat real pro onboarding — persiste, e o user continua em /lumi depois.
  const [chatId] = useState(() => {
    const c = createChat(userId, { title: "Primeira conversa" });
    return c.id;
  });
  const [messages, setMessages] = useState<LumiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [interacted, setInteracted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const snap = useSyncExternalStore(
    useCallback((cb: () => void) => subscribeStream(chatId, cb), [chatId]),
    useCallback(() => getStreamSnapshot(chatId), [chatId]),
    () => undefined,
  );

  const sending = snap?.status === "running";
  const partial = snap?.partial ?? "";
  const liveTools = snap?.tools ?? [];

  // Auto-scroll pro fim conforme a conversa cresce
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, partial, liveTools.length]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      setInteracted(true);
      const userMsg: LumiChatMessage = {
        id: `u_${Date.now()}`,
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      const optimistic = appendMessage(userId, chatId, userMsg);
      setMessages(optimistic?.messages ?? [userMsg]);
      setInput("");
      startLumiStream({
        chatId,
        userId,
        url: "/api/lumi/agent",
        body: {
          message: trimmed,
          history: (optimistic?.messages ?? [])
            .slice(-10)
            .map((m) => ({ role: m.role, content: m.content })),
        },
        onDone: () => {
          const updated = getChat(userId, chatId);
          if (updated) setMessages(updated.messages);
        },
      });
    },
    [chatId, sending, userId],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">
          Me conta o que você quer estudar
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tua próxima prova, uma matéria, um perrengue — o Lumi resolve agora.
        </p>
      </div>

      {/* Janela da conversa */}
      <div
        ref={scrollRef}
        className="min-h-[220px] max-h-[42vh] overflow-y-auto rounded-2xl border border-border/60 bg-secondary/20 p-4 flex flex-col gap-3"
      >
        {messages.length === 0 && !sending && (
          <div className="m-auto flex flex-col items-center gap-3 text-center py-6">
            <LumiCharacter className="h-16 w-16" />
            <p className="max-w-xs text-sm text-muted-foreground">
              Escreve embaixo ou toca numa sugestão. Vou criar, organizar e
              agendar pra você ver na hora. ✨
            </p>
          </div>
        )}

        {messages.map((m) => (
          <MessageRow key={m.id} role={m.role} content={m.content} tools={m.tools} />
        ))}

        {/* Stream ao vivo (assistant em progresso) */}
        {sending && (
          <div className="flex flex-col gap-2">
            {liveTools.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {liveTools.map((t) => (
                  <ToolChip key={t.id} name={t.name} status={t.status} />
                ))}
              </div>
            )}
            <div className="self-start max-w-[85%] rounded-2xl rounded-tl-sm bg-card border border-border/60 px-3.5 py-2.5 text-sm">
              {partial ? (
                <span className="whitespace-pre-wrap">{partial}</span>
              ) : (
                <span className="inline-flex gap-1">
                  <Dot /> <Dot /> <Dot />
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sugestões */}
      {!interacted && (
        <div className="flex flex-wrap gap-2">
          {SUGESTOES.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-3 py-2"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ex: tenho prova de fisiologia sexta…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40 transition-opacity"
          aria-label="Enviar"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {/* Avançar */}
      <button
        onClick={onProceed}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 text-sm font-medium transition-colors mx-auto",
          interacted
            ? "rounded-xl bg-primary px-5 py-2.5 text-primary-foreground hover:bg-primary/90"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {interacted ? "Pronto, ir pro meu painel" : "Pular e ir pro app"}
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function MessageRow({
  role,
  content,
  tools,
}: {
  role: string;
  content: string;
  tools?: { name: string; status: string }[];
}) {
  if (role === "user") {
    return (
      <div className="self-end max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">
        {content}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {tools && tools.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tools.map((t, i) => (
            <ToolChip key={i} name={t.name} status={t.status} />
          ))}
        </div>
      )}
      <div className="self-start max-w-[85%] rounded-2xl rounded-tl-sm bg-card border border-border/60 px-3.5 py-2.5 text-sm whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}

function ToolChip({ name, status }: { name: string; status: string }) {
  const ok = status === "done";
  const err = status === "error";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
        err
          ? "bg-destructive/10 text-destructive ring-destructive/20"
          : ok
            ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400"
            : "bg-primary/10 text-primary ring-primary/20",
      )}
    >
      {ok ? "✓" : err ? "✕" : "⟳"} {toolChipLabel(name)}
    </span>
  );
}

function Dot() {
  return (
    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:var(--d)]" />
  );
}
