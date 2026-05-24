"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Coins,
  Info,
  Loader2,
  Paperclip,
  PanelRightOpen,
  Send,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { AuthGuard } from "@/components/app/auth-guard";
import {
  LumiContextPicker,
  type LumiContext,
} from "@/components/lumi/lumi-context-picker";
import { LumiMessageBubble } from "@/components/lumi/lumi-message-bubble";
import {
  LumiQuickActions,
  QUICK_ACTIONS,
  type QuickAction,
} from "@/components/lumi/lumi-quick-actions";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  LumiGenerateDialog,
  type LumiGenerateKind,
} from "@/components/lumi/lumi-generate-dialog";
import {
  createLectureAsync,
  getLectureAsync,
  listLecturesAsync,
  listSubjectsAsync,
  updateLectureAsync,
} from "@/lib/db";
import {
  appendMessage,
  createChat,
  getChat,
  type LumiChat,
  type LumiChatCategory,
  type LumiChatMessage,
} from "@/lib/lumi-chats";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Lecture, Subject, User } from "@/lib/types";
import { cn } from "@/lib/utils";

const NEXT_STEPS: { id: QuickAction["id"]; label: string; cost: number }[] = [
  { id: "summary", label: "Gerar resumo", cost: 8 },
  { id: "flashcards", label: "Criar flashcards", cost: 12 },
  { id: "quiz", label: "Quiz sobre o tema", cost: 10 },
  { id: "english", label: "Explicar em inglês médico", cost: 6 },
];

export default function LumiPage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <LumiAssistant user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function LumiAssistant({ user }: { user: User }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const chatIdParam = searchParams.get("chatId") ?? searchParams.get("id");
  const isNew = searchParams.get("new") === "1";

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [context, setContext] = useState<LumiContext>({});
  const [chat, setChat] = useState<LumiChat | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [genDialogKind, setGenDialogKind] = useState<LumiGenerateKind | null>(
    null,
  );
  const [generating, setGenerating] = useState(false);
  const englishMode = useRef(false);

  const messages = chat?.messages ?? [];
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    Promise.all([listSubjectsAsync(user.id), listLecturesAsync(user.id)]).then(
      ([s, l]) => {
        if (!active) return;
        setSubjects(s);
        setLectures(l);
      },
    );
    return () => {
      active = false;
    };
  }, [user.id]);

  useEffect(() => {
    let active = true;
    fetch("/api/coins", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d && typeof d.balance === "number") {
          setCoinBalance(d.balance);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (chatIdParam) {
      const existing = getChat(user.id, chatIdParam);
      if (existing) {
        setChat(existing);
        if (existing.subjectId || existing.subjectName) {
          setContext({
            subjectId: existing.subjectId,
            subjectName: existing.subjectName,
          });
        }
        return;
      }
    }
    if (isNew) {
      setChat(null);
    }
  }, [chatIdParam, isNew, user.id]);

  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    box.scrollTop = box.scrollHeight;
  }, [messages.length, sending]);

  const refreshBalance = useCallback(() => {
    fetch("/api/coins", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.balance === "number") setCoinBalance(d.balance);
      })
      .catch(() => {});
  }, []);

  const contextLabel = useMemo(() => {
    if (context.lectureTitle) {
      return `${context.subjectName ?? "Geral"} · ${context.lectureTitle}`;
    }
    if (context.subjectName) return context.subjectName;
    return null;
  }, [context]);

  const sendMessage = useCallback(
    async (text: string, opts?: { mode?: "english_medical" | "default" }) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      let currentChat = chat;
      if (!currentChat) {
        currentChat = createChat(user.id, {
          subjectId: context.subjectId,
          subjectName: context.subjectName,
          category: "chat",
        });
        setChat(currentChat);
        router.replace(`/lumi?id=${currentChat.id}`);
      }

      const userMsg: LumiChatMessage = {
        id: `tmp_${Date.now()}`,
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      const optimisticChat = appendMessage(user.id, currentChat.id, userMsg);
      if (optimisticChat) setChat(optimisticChat);
      setInput("");
      setSending(true);

      const mode = opts?.mode ?? (englishMode.current ? "english_medical" : "default");

      try {
        const res = await fetch("/api/ai/chat-summary", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lectureId: context.lectureId,
            message: trimmed,
            mode,
            contextLabel,
            history: (optimisticChat?.messages ?? []).slice(-10).map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });
        if (!res.ok) {
          let errMsg = "Erro ao consultar o Lumi.";
          let upgrade: string | undefined;
          try {
            const j = (await res.json()) as { error?: string; upgrade?: string };
            if (j.error) errMsg = j.error;
            if (j.upgrade) upgrade = j.upgrade;
          } catch {
            /* ignore */
          }
          if (res.status === 402 && upgrade) {
            toast.error(errMsg, {
              action: {
                label: "Comprar coins",
                onClick: () => router.push(upgrade),
              },
            });
          } else {
            toast.error(errMsg);
          }
          return;
        }
        const data = (await res.json()) as { reply: string };
        const assistantMsg: LumiChatMessage = {
          id: `a_${Date.now()}`,
          role: "assistant",
          content: data.reply || "(Sem resposta)",
          createdAt: new Date().toISOString(),
        };
        const next = appendMessage(user.id, currentChat.id, assistantMsg);
        if (next) setChat(next);
        refreshBalance();
      } catch (err) {
        toast.error(`Falha de rede: ${(err as Error).message}`);
      } finally {
        setSending(false);
      }
    },
    [
      chat,
      context.lectureId,
      context.subjectId,
      context.subjectName,
      contextLabel,
      refreshBalance,
      router,
      sending,
      user.id,
    ],
  );

  const runGenerate = useCallback(
    async (kind: LumiGenerateKind) => {
      if (generating) return;

      const hasLecture = !!context.lectureId;
      const transcript = await (async () => {
        if (hasLecture && context.lectureId) {
          const lec = await getLectureAsync(user.id, context.lectureId);
          const t = (lec?.transcript ?? "").trim();
          if (t.length > 80) return t;
        }
        const convo = (chat?.messages ?? [])
          .slice(-30)
          .map(
            (m) =>
              `[${m.role === "user" ? "Aluno" : "Lumi"}] ${m.content}`,
          )
          .join("\n\n")
          .trim();
        return convo;
      })();

      if (!transcript || transcript.length < 30) {
        toast.error(
          "Sem contexto suficiente. Selecione uma aula ou converse antes de gerar.",
        );
        return;
      }

      setGenerating(true);

      let currentChat = chat;
      if (!currentChat) {
        currentChat = createChat(user.id, {
          subjectId: context.subjectId,
          subjectName: context.subjectName,
          category: kind as LumiChatCategory,
        });
        setChat(currentChat);
        router.replace(`/lumi?id=${currentChat.id}`);
      }

      const pendingId = `pending_${Date.now()}`;
      const pendingMsg: LumiChatMessage = {
        id: pendingId,
        role: "assistant",
        content: "Lumi está pensando...",
        createdAt: new Date().toISOString(),
      };
      const optimisticChat = appendMessage(
        user.id,
        currentChat.id,
        pendingMsg,
      );
      if (optimisticChat) setChat(optimisticChat);

      try {
        const resp = await fetch("/api/ai/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: kind,
            sources: { transcripts: [transcript] },
            options: {},
          }),
        });
        const json = (await resp.json()) as {
          mode?: LumiGenerateKind;
          content?: unknown;
          coinsCharged?: number;
          error?: string;
          upgrade?: string;
        };
        if (!resp.ok) {
          const errMsg = json.error ?? "Falha na geração.";
          if (resp.status === 402 && json.upgrade) {
            const upgrade = json.upgrade;
            toast.error(errMsg, {
              action: {
                label: "Comprar coins",
                onClick: () => router.push(upgrade),
              },
            });
          } else {
            toast.error(errMsg);
          }
          return;
        }

        const titleBase = context.lectureTitle
          ? `${context.lectureTitle}`
          : context.subjectName
            ? `${context.subjectName}`
            : `Conversa com Lumi · ${new Date().toLocaleDateString("pt-BR")}`;

        const subjectId =
          context.subjectId ?? subjects[0]?.id ?? "";

        let href: string | undefined;
        let previewText: string | undefined;
        let attachmentTitle = titleBase;

        try {
          if (kind === "summary") {
            let lectureId = context.lectureId;
            const md =
              (json.content as { markdown?: string } | undefined)?.markdown ??
              "";
            if (!lectureId) {
              if (!subjectId) {
                toast.error(
                  "Crie uma matéria no Dashboard antes de gerar conteúdo do chat.",
                );
                return;
              }
              const lec = await createLectureAsync(user.id, {
                subjectId,
                title: `${titleBase} · resumo`.slice(0, 200),
              });
              lectureId = lec.id;
            }
            const summary = {
              generatedAt: new Date().toISOString(),
              generalSummary: md,
              highlights: [],
              sections: [],
            };
            await updateLectureAsync(user.id, lectureId, { summary });
            href = `/resumo/${lectureId}`;
            attachmentTitle = `Resumo: ${titleBase}`;
            previewText = md
              .replace(/^#.+\n/, "")
              .replace(/[#*_`>\[\]]/g, "")
              .trim()
              .slice(0, 110);
          } else {
            if (!subjectId) {
              toast.error(
                "Crie uma matéria no Dashboard antes de gerar conteúdo do chat.",
              );
              return;
            }
            let lectureId = context.lectureId;
            if (!lectureId) {
              const lec = await createLectureAsync(user.id, {
                subjectId,
                title: `${titleBase} · ${kind}`.slice(0, 200),
              });
              lectureId = lec.id;
            }

            const now = new Date().toISOString();
            let payload: Record<string, unknown> = {};
            if (kind === "flashcards") {
              const cards =
                (json.content as { cards?: unknown[] } | undefined)?.cards ??
                [];
              payload = { generatedAt: now, cards };
              previewText = `${Array.isArray(cards) ? cards.length : 0} cards gerados`;
              attachmentTitle = `Deck: ${titleBase}`;
            } else if (kind === "quiz") {
              const questions =
                (json.content as { questions?: unknown[] } | undefined)
                  ?.questions ?? [];
              payload = { generatedAt: now, questions };
              previewText = `${Array.isArray(questions) ? questions.length : 0} questões geradas`;
              attachmentTitle = `Quiz: ${titleBase}`;
            } else if (kind === "mindmap") {
              const c = (json.content as {
                centralTopic?: string;
                branches?: unknown[];
              } | undefined) ?? {};
              payload = {
                generatedAt: now,
                centralTopic: c.centralTopic ?? titleBase,
                branches: c.branches ?? [],
              };
              previewText = `${Array.isArray(c.branches) ? c.branches.length : 0} ramos`;
              attachmentTitle = `Mapa mental: ${titleBase}`;
            }

            if (!isSupabaseConfigured()) {
              toast.error("Supabase não configurado.");
              return;
            }
            const supabase = createClient();
            const { data: inserted, error } = await supabase
              .from("lecture_assets")
              .insert({
                lecture_id: lectureId,
                user_id: user.id,
                kind,
                payload,
                coins_spent: json.coinsCharged ?? 0,
              })
              .select("id")
              .single();
            if (error || !inserted) {
              throw error ?? new Error("Falha ao salvar asset.");
            }
            const assetId = inserted.id as string;
            href =
              kind === "flashcards"
                ? `/deck/${assetId}`
                : kind === "quiz"
                  ? `/quiz-banco/${assetId}`
                  : `/mapa/${assetId}`;
          }
        } catch (saveErr) {
          console.error("[lumi] save asset failed", saveErr);
          toast.error(
            `Falha ao salvar: ${(saveErr as Error).message ?? "erro desconhecido"}`,
          );
          return;
        }

        const replacement: LumiChatMessage = {
          id: `gen_${Date.now()}`,
          role: "assistant",
          content: `Pronto! Gerei ${
            kind === "summary"
              ? "o resumo"
              : kind === "flashcards"
                ? "o deck de flashcards"
                : kind === "quiz"
                  ? "o quiz"
                  : "o mapa mental"
          } pra você. Clique no card abaixo pra abrir.`,
          createdAt: new Date().toISOString(),
          attachment: {
            kind,
            title: attachmentTitle,
            href,
            preview: previewText,
          },
        };

        const stored = getChat(user.id, currentChat.id);
        if (stored) {
          const filtered: LumiChat = {
            ...stored,
            messages: stored.messages.filter((m) => m.id !== pendingId),
          };
          if (typeof window !== "undefined") {
            try {
              const key = `lumio.lumi.chats.${user.id}.v1`;
              const raw = window.localStorage.getItem(key);
              if (raw) {
                const all = JSON.parse(raw) as LumiChat[];
                const idx = all.findIndex((c) => c.id === currentChat!.id);
                if (idx >= 0) {
                  all[idx] = filtered;
                  window.localStorage.setItem(key, JSON.stringify(all));
                }
              }
            } catch {
              /* ignore */
            }
          }
          const next = appendMessage(user.id, currentChat.id, replacement);
          if (next) setChat(next);
        }
        refreshBalance();
        toast.success("Conteúdo gerado!");
      } catch (err) {
        toast.error(`Erro: ${(err as Error).message}`);
      } finally {
        setGenerating(false);
        setGenDialogKind(null);
      }
    },
    [
      chat,
      context.lectureId,
      context.lectureTitle,
      context.subjectId,
      context.subjectName,
      generating,
      refreshBalance,
      router,
      subjects,
      user.id,
    ],
  );

  const handleQuickAction = useCallback(
    async (action: QuickAction) => {
      if (action.id === "english") {
        englishMode.current = true;
        toast.success("Modo inglês médico ativado", {
          description: "Próximas perguntas terão resposta em English.",
        });
        return;
      }
      if (action.id === "explain") {
        const subjectHint = context.subjectName
          ? ` sobre ${context.subjectName}`
          : "";
        const lectureHint = context.lectureTitle
          ? ` (aula: ${context.lectureTitle})`
          : "";
        await sendMessage(
          `Explique o conceito mais importante${subjectHint}${lectureHint} de forma didática: definição, mecanismo, exemplo clínico/prático e armadilha comum.`,
        );
        return;
      }
      if (
        action.id === "summary" ||
        action.id === "flashcards" ||
        action.id === "quiz"
      ) {
        setGenDialogKind(action.id);
        return;
      }
    },
    [context.lectureTitle, context.subjectName, sendMessage],
  );

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="relative mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Assistente <span className="text-primary">Lumi</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Seu assistente de estudos com IA
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LumiContextPicker
            subjects={subjects}
            lectures={lectures}
            value={context}
            onChange={setContext}
          />
          <button
            type="button"
            onClick={() => setShowRightPanel((v) => !v)}
            className="hidden lg:inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            title={showRightPanel ? "Ocultar painel" : "Mostrar painel"}
          >
            <PanelRightOpen
              className={cn(
                "h-4 w-4 transition-transform",
                !showRightPanel && "rotate-180",
              )}
            />
          </button>
        </div>
      </div>

      {/* Quick actions */}
      {!hasMessages && (
        <LumiQuickActions onPick={handleQuickAction} disabled={sending} />
      )}

      <div
        className={cn(
          "grid gap-6",
          showRightPanel ? "lg:grid-cols-[1fr_280px]" : "lg:grid-cols-1",
        )}
      >
        {/* Chat column */}
        <div className="flex min-h-[680px] flex-col rounded-2xl border border-border/60 bg-card">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-6 md:px-10"
            style={{ maxHeight: "calc(100vh - 240px)" }}
          >
            <div className="mx-auto flex max-w-5xl flex-col gap-6">
              {!hasMessages && (
                <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-6 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-fuchsia-500 shadow-md">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-foreground">
                    Como o Lumi pode te ajudar hoje?
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Escolha uma ação rápida acima ou faça uma pergunta abaixo.
                  </p>
                </div>
              )}

              {messages.map((m, idx) => {
                const isLastAssistant =
                  m.role === "assistant" && idx === messages.length - 1;
                return (
                  <div key={m.id} className="flex flex-col gap-3">
                    <LumiMessageBubble message={m} />
                    {isLastAssistant && !sending && (
                      <div className="ml-12 flex flex-wrap gap-2">
                        {NEXT_STEPS.map((s) => {
                          const action = QUICK_ACTIONS.find((a) => a.id === s.id);
                          if (!action) return null;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => handleQuickAction(action)}
                              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                            >
                              <action.Icon className="h-3 w-3" />
                              {s.label}
                              <span className="text-amber-600">· {s.cost}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {sending && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 shadow-sm">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Lumi está pensando…
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Input */}
          <div className="border-t border-border/60 bg-card/80 p-3 md:p-4">
            <div className="mx-auto flex max-w-5xl flex-col gap-2">
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  title="Anexar contexto"
                  aria-label="Anexar contexto"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Pergunte algo ao Lumi…"
                  rows={1}
                  disabled={sending}
                  className="min-h-[44px] max-h-[160px] resize-none text-sm"
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={() => void sendMessage(input)}
                  disabled={sending || !input.trim()}
                  className="h-10 w-10 shrink-0 rounded-full"
                  aria-label="Enviar"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-center text-[10px] text-muted-foreground">
                Lumi pode cometer erros. Sempre revise as informações.
              </p>
            </div>
          </div>
        </div>

        {/* Right panel */}
        {showRightPanel && (
          <aside className="hidden lg:flex flex-col gap-4">
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recursos do Lumi
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-muted-foreground">
                    Coins disponíveis
                  </div>
                  <div className="text-2xl font-semibold tabular-nums text-foreground">
                    {coinBalance ?? "—"}
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                  <Coins className="h-5 w-5" />
                </div>
              </div>
              <Link
                href="/account/coins"
                className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <Info className="h-3 w-3" />
                Como funcionam os coins?
              </Link>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Atalhos rápidos
              </div>
              <div className="mt-3 flex flex-col gap-1.5 text-sm">
                <Link
                  href="/lumi/chats"
                  className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                >
                  Meus chats
                </Link>
                <Link
                  href="/resumos"
                  className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                >
                  Biblioteca de resumos
                </Link>
                <Link
                  href="/flashcards"
                  className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                >
                  Decks de flashcards
                </Link>
                <Link
                  href="/quiz"
                  className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                >
                  Quizzes
                </Link>
              </div>
            </div>
          </aside>
        )}
      </div>

      <LumiGenerateDialog
        open={!!genDialogKind}
        kind={genDialogKind}
        contextLabel={contextLabel}
        hasLecture={!!context.lectureId}
        hasMessages={messages.length > 0}
        coinBalance={coinBalance}
        loading={generating}
        onConfirm={() => {
          if (genDialogKind) void runGenerate(genDialogKind);
        }}
        onClose={() => setGenDialogKind(null)}
      />
    </div>
  );
}
