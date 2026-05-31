"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUp,
  ChevronDown,
  Coins,
  File as FileIcon,
  FileText,
  Flame,
  FolderOpen,
  Gift,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  Lightbulb,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Network,
  Plus,
  Sparkles,
  SquarePen,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Analytics } from "@/lib/analytics";
import { AppShell } from "@/components/app/app-shell";
import { AuthGuard } from "@/components/app/auth-guard";
import {
  LumiContextPicker,
  type LumiContext,
} from "@/components/lumi/lumi-context-picker";
import { LumiMessageBubble } from "@/components/lumi/lumi-message-bubble";
import { LumiToolCard } from "@/components/lumi/lumi-tool-card";
import {
  getStreamState,
  startLumiStream,
  subscribeStream,
} from "@/lib/lumi-stream-store";
import {
  QUICK_ACTIONS,
  type QuickAction,
} from "@/components/lumi/lumi-quick-actions";
import { LumiThinking } from "@/components/lumi/lumi-thinking";
import { LumiAttachmentPicker } from "@/components/lumi/lumi-attachment-picker";
import { LumiVoiceMode } from "@/components/lumi/lumi-voice-mode";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LumiGenerateDialog,
  type LumiGenerateChoice,
  type LumiGenerateKind,
} from "@/components/lumi/lumi-generate-dialog";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import {
  createLectureAsync,
  getLectureAsync,
  listLecturesAsync,
  listSubjectsAsync,
  updateLectureAsync,
} from "@/lib/db";
import { upsertSummaryByLectureAsync } from "@/lib/summaries";
import {
  appendMessage,
  createChat,
  getChat,
  hydrateFromServer,
  listChats,
  type ChatAttachment,
  type LumiChat,
  type LumiChatCategory,
  type LumiChatMessage,
} from "@/lib/lumi-chats";
import { jobKindLabel, startJob } from "@/lib/asset-jobs";
import { calculateStreak } from "@/lib/streak";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Lecture, Subject, User } from "@/lib/types";
import { cn, stripChatFormatting } from "@/lib/utils";

type SuggestionChip = {
  id: QuickAction["id"];
  label: string;
  hint: string;
  cost: number;
  Icon: typeof FileText;
};

const SUGGESTION_CHIPS: SuggestionChip[] = [
  { id: "summary", label: "Resumo", hint: "Resumir aula", cost: 8, Icon: FileText },
  { id: "flashcards", label: "Flashcards", hint: "Criar deck", cost: 12, Icon: Layers },
  { id: "quiz", label: "Quiz", hint: "Gerar questões", cost: 10, Icon: HelpCircle },
  { id: "mindmap" as QuickAction["id"], label: "Mapa mental", hint: "Visualizar tópicos", cost: 6, Icon: Network },
  { id: "explain", label: "Explicar", hint: "Tire dúvida", cost: 4, Icon: Lightbulb },
];

const EMBASSADOR_KEY = "lumio.lumi.embassador-dismissed";
const MAX_ATTACHMENTS = 5;
const MAX_IMAGES = 3; // Limite por mensagem pra imagens (paste/upload)
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const KIND_ROUTE: Record<LumiGenerateKind, string> = {
  summary: "/resumos?new=1",
  flashcards: "/flashcards?new=1",
  quiz: "/quiz?new=1",
  mindmap: "/documentos?new=mapa",
};

function newAttachmentId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

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
  // sending agora deriva do store global (sobrevive a navegações)
  // streamingReply e streamingTools idem.
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [genDialogKind, setGenDialogKind] = useState<LumiGenerateKind | null>(
    null,
  );
  const [generating, setGenerating] = useState(false);
  const [embassadorDismissed, setEmbassadorDismissed] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentPickerOpen, setAttachmentPickerOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const englishMode = useRef(false);
  const interimRef = useRef("");
  const restoreAttempted = useRef(false);

  const messages = chat?.messages ?? [];

  // Subscribe ao stream global desse chat (sobrevive a navegações).
  // Retorna { partial, tools, status } se houver stream rolando, undefined senão.
  const activeChatId = chat?.id ?? "";
  const streamState = useSyncExternalStore(
    useCallback(
      (cb: () => void) => {
        if (!activeChatId) return () => {};
        return subscribeStream(activeChatId, cb);
      },
      [activeChatId],
    ),
    useCallback(
      () => (activeChatId ? getStreamState(activeChatId) : undefined),
      [activeChatId],
    ),
    () => undefined, // server snapshot
  );
  const sending = streamState?.status === "running";
  const streamingReply = streamState?.partial ?? "";
  const streamingTools = streamState?.tools ?? [];

  // Quando stream termina (done), garante re-load do chat do storage pra
  // pegar o assistant message recém-commitado pelo store.
  useEffect(() => {
    if (streamState?.status === "done" && chat) {
      const updated = getChat(user.id, chat.id);
      if (updated && updated.messages.length !== chat.messages.length) {
        setChat(updated);
      }
    }
    if (streamState?.status === "error" && streamState.errorMsg) {
      toast.error(streamState.errorMsg);
    }
  }, [streamState?.status, streamState?.errorMsg, chat, user.id]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomTextareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    supported: speechSupported,
    state: speechState,
    start: startSpeech,
    stop: stopSpeech,
    error: speechError,
  } = useSpeechRecognition({
    lang: "pt-BR",
    onInterim: (t) => {
      interimRef.current = t;
    },
    onFinal: (t) => {
      const final = t.trim();
      if (!final) return;
      setInput((prev) => {
        const joined = prev ? `${prev.trim()} ${final}` : final;
        return joined;
      });
      interimRef.current = "";
    },
  });

  useEffect(() => {
    if (speechError) toast.error(speechError);
  }, [speechError]);

  useEffect(() => {
    let active = true;
    Promise.all([listSubjectsAsync(user.id), listLecturesAsync(user.id)]).then(
      ([s, l]) => {
        if (!active) return;
        setSubjects(s);
        setLectures(l);
      },
    );
    void hydrateFromServer(user.id).finally(() => {
      if (active) setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [user.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setEmbassadorDismissed(
      window.localStorage.getItem(EMBASSADOR_KEY) === "1",
    );
  }, []);

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
      // getChat NÃO filtra deletedAt — ignora chat na lixeira pra não ressuscitar.
      if (existing && !existing.deletedAt) {
        restoreAttempted.current = true;
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
      restoreAttempted.current = true;
      setChat(null);
      return;
    }
    // Sem ?chatId e sem ?new (ex.: entrou pelo menu lateral): retoma a ÚLTIMA
    // conversa aberta — ou a mais recente — pra não perder a conversa ao sair
    // e voltar (web E nativo). Roda uma vez; re-tenta quando a hidratação do
    // servidor concluir. Ignora chat na lixeira (getChat não filtra deletedAt).
    if (restoreAttempted.current) return;
    const lastId =
      typeof window !== "undefined"
        ? window.localStorage.getItem(`lumio.lumi.lastChat.${user.id}`)
        : null;
    const byLast = lastId ? getChat(user.id, lastId) : null;
    const restored =
      (byLast && !byLast.deletedAt ? byLast : null) ??
      listChats(user.id)[0] ??
      null;
    if (restored) {
      restoreAttempted.current = true;
      setChat(restored);
      if (restored.subjectId || restored.subjectName) {
        setContext({
          subjectId: restored.subjectId,
          subjectName: restored.subjectName,
        });
      }
      router.replace(`/lumi?id=${restored.id}`);
    }
  }, [chatIdParam, isNew, user.id, hydrated, router]);

  // Lembra o último chat aberto pra restaurar quando o user voltar pra /lumi.
  useEffect(() => {
    if (chat?.id && typeof window !== "undefined") {
      window.localStorage.setItem(`lumio.lumi.lastChat.${user.id}`, chat.id);
    }
  }, [chat?.id, user.id]);

  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    box.scrollTop = box.scrollHeight;
  }, [messages.length, sending]);

  const streak = useMemo(() => calculateStreak(lectures), [lectures]);

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

  const attachmentsPayload = useMemo(
    () =>
      attachments.map((a) => {
        const isImage = a.contentType?.startsWith("image/");
        return {
          name: a.name,
          content: a.content,
          ...(isImage ? { mediaType: a.contentType } : {}),
        };
      }),
    [attachments],
  );

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
        ...(attachments.length > 0
          ? {
              userAttachments: attachments.map((a) => ({
                name: a.name,
                contentType: a.contentType,
                sizeKb: a.sizeKb,
              })),
            }
          : {}),
      };
      const optimisticChat = appendMessage(user.id, currentChat.id, userMsg);
      if (optimisticChat) setChat(optimisticChat);
      setInput("");
      // Captura anexos pro envio e limpa do composer pra próxima msg não reenviar.
      const capturedAttachmentsPayload = attachmentsPayload;
      if (attachments.length > 0) setAttachments([]);

      // Silencia params não-usados no novo endpoint
      void opts;
      void contextLabel;

      // Inicia stream via store global — sobrevive a navegações
      startLumiStream({
        chatId: currentChat.id,
        userId: user.id,
        url: "/api/lumi/agent",
        body: {
          message: trimmed,
          history: (optimisticChat?.messages ?? []).slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          subjectId: context.subjectId,
          subjectName: context.subjectName,
          ...(capturedAttachmentsPayload.length > 0
            ? { attachments: capturedAttachmentsPayload }
            : {}),
        },
        onDone: () => {
          // Refresh do chat pra renderizar a assistant message recém-commitada
          const updated = getChat(user.id, currentChat!.id);
          if (updated) setChat(updated);
          refreshBalance();
        },
        onError: (msg) => {
          // toast já é exibido pelo useEffect que observa streamState.errorMsg
          void msg;
        },
      });
    },
    [
      attachments,
      attachmentsPayload,
      chat,
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
      const baseTranscript = await (async () => {
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

      const hasUsableConvo = baseTranscript.length >= 30;
      const hasAttachments = attachments.length > 0;

      if (!hasUsableConvo && !hasAttachments) {
        toast.error(
          "Sem contexto suficiente. Anexe um arquivo, selecione uma aula ou converse antes de gerar.",
        );
        return;
      }

      // Garante chat ativo (cria se não existir) ANTES de fechar o dialog,
      // pra mensagem "Lumi está gerando…" aparecer no chat enquanto roda em
      // background.
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
      const targetChatId = currentChat.id;

      const pendingId = `pending_${Date.now()}`;
      const pendingMsg: LumiChatMessage = {
        id: pendingId,
        role: "assistant",
        content: `Gerando ${jobKindLabel(kind).toLowerCase()} em background. Você pode continuar usando o app — vou avisar quando terminar.`,
        createdAt: new Date().toISOString(),
      };
      const optimisticChat = appendMessage(
        user.id,
        currentChat.id,
        pendingMsg,
      );
      if (optimisticChat) setChat(optimisticChat);

      // Fecha o dialog imediatamente — o usuário pode navegar enquanto isso.
      setGenDialogKind(null);

      const titleBaseEarly = context.lectureTitle
        ? `${context.lectureTitle}`
        : context.subjectName
          ? `${context.subjectName}`
          : `Conversa · ${new Date().toLocaleDateString("pt-BR")}`;

      toast.success(`${jobKindLabel(kind)} sendo gerado em background.`, {
        description: "Acompanhe pelo ícone de tarefas no topo da tela.",
      });

      const transcripts: string[] = [];
      if (hasUsableConvo) transcripts.push(baseTranscript);

      const capturedAttachments = attachmentsPayload;
      const capturedSubjects = subjects;
      const userId = user.id;

      startJob(
        {
          kind,
          title: titleBaseEarly,
          chatId: targetChatId,
          lectureId: context.lectureId,
          subjectName: context.subjectName,
        },
        async () => {
          const resp = await fetch("/api/ai/generate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              mode: kind,
              sources: { transcripts },
              attachments: capturedAttachments,
              options: {},
            }),
          });
          const json = (await resp.json()) as {
            mode?: LumiGenerateKind;
            content?: unknown;
            coinsCharged?: number;
            error?: string;
            upgrade?: string;
            code?: string;
          };
          if (!resp.ok) {
            const errMsg = json.error ?? "Falha na geração.";
            if (resp.status === 402 && json.upgrade) {
              const upgrade = json.upgrade;
              Analytics.paywallView("no_coins", "asset_generation");
              toast.error(errMsg, {
                action: {
                  label: "Comprar coins",
                  onClick: () => {
                    Analytics.upgradeClicked("paywall");
                    router.push(upgrade);
                  },
                },
              });
            } else if (resp.status === 422 && json.code === "INSUFFICIENT_SOURCE") {
              toast.error("Material insuficiente", {
                description:
                  "Anexe um PDF com texto, grave uma aula ou cole a transcrição antes de gerar. Coins devolvidos.",
              });
            }
            throw new Error(errMsg);
          }

          Analytics.assetGenerated(kind);

          const titleBase = context.lectureTitle
            ? `${context.lectureTitle}`
            : context.subjectName
              ? `${context.subjectName}`
              : `Conversa com Lumi · ${new Date().toLocaleDateString("pt-BR")}`;

          const subjectId = context.subjectId ?? capturedSubjects[0]?.id ?? "";

          let href: string | undefined;
          let previewText: string | undefined;
          let attachmentTitle = titleBase;

          if (kind === "summary") {
            let lectureId = context.lectureId;
            const md =
              (json.content as { markdown?: string } | undefined)?.markdown ??
              "";
            if (!lectureId) {
              if (!subjectId) {
                throw new Error(
                  "Crie uma matéria no Dashboard antes de gerar conteúdo do chat.",
                );
              }
              const lec = await createLectureAsync(userId, {
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
            await upsertSummaryByLectureAsync({
              userId,
              subjectId,
              lectureId,
              title: titleBase,
              content: summary,
            });
            href = `/resumo/${lectureId}`;
            attachmentTitle = `Resumo: ${titleBase}`;
            previewText = md
              .replace(/^#.+\n/, "")
              .replace(/[#*_`>\[\]]/g, "")
              .trim()
              .slice(0, 110);
            // Dispara geração de imagens em fire-and-forget (não bloqueia
            // o término do job; quando termina, /resumo/[id] mostra as imagens
            // após próximo refresh).
            void fetch("/api/ai/summary-images", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ lectureId, count: 3 }),
              keepalive: true,
            }).catch((e) => console.warn("[lumi] summary-images failed", e));
          } else {
            if (!subjectId) {
              throw new Error(
                "Crie uma matéria no Dashboard antes de gerar conteúdo do chat.",
              );
            }
            let lectureId = context.lectureId;
            if (!lectureId) {
              const lec = await createLectureAsync(userId, {
                subjectId,
                title: `${titleBase} · ${kind}`.slice(0, 200),
              });
              lectureId = lec.id;
            }
            const now = new Date().toISOString();
            let payload: Record<string, unknown> = {};
            if (kind === "flashcards") {
              const cards =
                (json.content as { cards?: unknown[] } | undefined)?.cards ?? [];
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
              const c =
                (json.content as {
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
              throw new Error("Supabase não configurado.");
            }
            const supabase = createClient();
            const { data: inserted, error } = await supabase
              .from("lecture_assets")
              .insert({
                lecture_id: lectureId,
                user_id: userId,
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

          // Substitui a pendingMsg pelo resultado final dentro do chat.
          const stored = getChat(userId, targetChatId);
          if (stored) {
            const filtered: LumiChat = {
              ...stored,
              messages: stored.messages.filter((m) => m.id !== pendingId),
            };
            if (typeof window !== "undefined") {
              try {
                const key = `lumio.lumi.chats.${userId}.v1`;
                const raw = window.localStorage.getItem(key);
                if (raw) {
                  const all = JSON.parse(raw) as LumiChat[];
                  const idx = all.findIndex((c) => c.id === targetChatId);
                  if (idx >= 0) {
                    all[idx] = filtered;
                    window.localStorage.setItem(key, JSON.stringify(all));
                  }
                }
              } catch {
                /* ignore */
              }
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
            const next = appendMessage(userId, targetChatId, replacement);
            if (next && chat?.id === targetChatId) setChat(next);
          }

          refreshBalance();
          toast.success(`${jobKindLabel(kind)} pronto!`, {
            description: attachmentTitle,
            action: href
              ? { label: "Abrir", onClick: () => router.push(href!) }
              : undefined,
          });

          return { resultHref: href, preview: previewText };
        },
      );
    },
    [
      attachments.length,
      attachmentsPayload,
      chat,
      context,
      generating,
      refreshBalance,
      router,
      subjects,
      user.id,
    ],
  );

  const handleGenerateConfirm = useCallback(
    (choice: LumiGenerateChoice) => {
      if (!genDialogKind) return;
      if (choice === "wizard") {
        const route = KIND_ROUTE[genDialogKind];
        setGenDialogKind(null);
        router.push(route);
        return;
      }
      void runGenerate(genDialogKind);
    },
    [genDialogKind, router, runGenerate],
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

  const handleSuggestionChip = useCallback(
    (chip: SuggestionChip) => {
      if (chip.id === ("mindmap" as QuickAction["id"])) {
        setGenDialogKind("mindmap");
        return;
      }
      const action = QUICK_ACTIONS.find((a) => a.id === chip.id);
      if (action) {
        void handleQuickAction(action);
      }
    },
    [handleQuickAction],
  );

  const handleGenerateMenu = useCallback(
    (kind: LumiGenerateKind) => {
      setGenDialogKind(kind);
    },
    [],
  );

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  const handleAttachClick = useCallback(() => {
    if (attachments.length >= MAX_ATTACHMENTS) {
      toast.error(`Máximo ${MAX_ATTACHMENTS} anexos.`);
      return;
    }
    fileInputRef.current?.click();
  }, [attachments.length]);

  const handleAttachDocuments = useCallback(() => {
    if (attachments.length >= MAX_ATTACHMENTS) {
      toast.error(`Máximo ${MAX_ATTACHMENTS} anexos.`);
      return;
    }
    setAttachmentPickerOpen(true);
  }, [attachments.length]);

  const handleAddAttachment = useCallback(
    (att: ChatAttachment) => {
      setAttachments((prev) => {
        if (prev.length >= MAX_ATTACHMENTS) return prev;
        return [...prev, att];
      });
    },
    [],
  );

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";

      if (file.size > MAX_FILE_BYTES) {
        toast.error(`"${file.name}" passa de 10 MB.`);
        return;
      }

      const lower = file.name.toLowerCase();
      const sizeKb = Math.max(1, Math.round(file.size / 1024));

      try {
        if (lower.endsWith(".pdf")) {
          toast.info("Lendo PDF...", { duration: 1500 });
          const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
          if (typeof window !== "undefined") {
            pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.legacy.mjs";
          }
          const buf = await file.arrayBuffer();
          const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
          const doc = await task.promise;
          const parts: string[] = [];
          for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items
              .map((it) => ("str" in it ? it.str : ""))
              .filter((s) => s.length > 0)
              .join(" ");
            if (pageText.trim()) parts.push(`--- Página ${i} ---\n${pageText}`);
            page.cleanup();
          }
          await doc.destroy();
          const text = parts.join("\n\n").trim();
          if (!text) {
            toast.error("PDF sem texto extraível.");
            return;
          }
          handleAddAttachment({
            id: newAttachmentId(),
            kind: "file",
            name: file.name,
            sizeKb,
            content: text,
            contentType: "application/pdf",
          });
          toast.success(`"${file.name}" anexado.`);
          return;
        }

        if (lower.endsWith(".txt")) {
          const text = await file.text();
          if (!text.trim()) {
            toast.error("Arquivo TXT vazio.");
            return;
          }
          handleAddAttachment({
            id: newAttachmentId(),
            kind: "file",
            name: file.name,
            sizeKb,
            content: text,
            contentType: "text/plain",
          });
          toast.success(`"${file.name}" anexado.`);
          return;
        }

        if (/\.(png|jpe?g)$/.test(lower)) {
          // Lê como base64 puro (sem data: prefix) pra Anthropic Vision.
          // Limite ~5MB de imagem (≈ 6.5M chars base64).
          if (file.size > 5 * 1024 * 1024) {
            toast.error("Imagem maior que 5MB. Comprima e tente de novo.");
            return;
          }
          const currentImages = attachments.filter((a) =>
            (a.contentType ?? "").startsWith("image/"),
          ).length;
          if (currentImages >= MAX_IMAGES) {
            toast.error(`Máximo ${MAX_IMAGES} imagens por mensagem.`);
            return;
          }
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = String(reader.result ?? "");
              const idx = result.indexOf(",");
              resolve(idx >= 0 ? result.slice(idx + 1) : "");
            };
            reader.onerror = () => reject(new Error("Falha ao ler imagem"));
            reader.readAsDataURL(file);
          });
          if (!base64) {
            toast.error("Não consegui ler a imagem.");
            return;
          }
          const mediaType = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
          handleAddAttachment({
            id: newAttachmentId(),
            kind: "file",
            name: file.name,
            sizeKb,
            content: base64,
            contentType: mediaType,
          });
          toast.success(`"${file.name}" anexado (Lumi vai ler a imagem).`);
          return;
        }

        toast.error("Tipo não suportado. Use PDF, TXT, PNG ou JPG.");
      } catch (err) {
        toast.error(`Falha ao processar "${file.name}": ${(err as Error).message}`);
      }
    },
    [handleAddAttachment, attachments],
  );

  /**
   * Paste de imagem direto no textarea (Ctrl/Cmd+V). Aceita PNG/JPEG,
   * limita a MAX_IMAGES por mensagem e respeita MAX_ATTACHMENTS no total.
   * Mantém qualquer texto colado junto: só preventDefault se houve imagem.
   */
  const handlePaste = useCallback(
    async (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f && (f.type === "image/png" || f.type === "image/jpeg")) {
            imageFiles.push(f);
          }
        }
      }
      if (imageFiles.length === 0) return;
      e.preventDefault();
      const currentImages = attachments.filter((a) =>
        (a.contentType ?? "").startsWith("image/"),
      ).length;
      const slotsImg = Math.max(0, MAX_IMAGES - currentImages);
      const slotsTotal = Math.max(0, MAX_ATTACHMENTS - attachments.length);
      const slots = Math.min(slotsImg, slotsTotal);
      if (slots <= 0) {
        toast.error(`Máximo ${MAX_IMAGES} imagens por mensagem.`);
        return;
      }
      if (imageFiles.length > slots) {
        toast.info(
          `Colei só ${slots} imagem${slots === 1 ? "" : "ns"} (limite ${MAX_IMAGES}).`,
        );
      }
      const toAdd = imageFiles.slice(0, slots);
      for (const f of toAdd) {
        if (f.size > 5 * 1024 * 1024) {
          toast.error(`"${f.name || "imagem"}" passa de 5MB.`);
          continue;
        }
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = String(reader.result ?? "");
              const idx = result.indexOf(",");
              resolve(idx >= 0 ? result.slice(idx + 1) : "");
            };
            reader.onerror = () => reject(new Error("Falha ao ler imagem"));
            reader.readAsDataURL(f);
          });
          if (!base64) continue;
          const mediaType = f.type === "image/jpeg" ? "image/jpeg" : "image/png";
          const sizeKb = Math.max(1, Math.round(f.size / 1024));
          const name =
            f.name && f.name.trim()
              ? f.name
              : `colada-${new Date().toISOString().slice(11, 19)}.${mediaType === "image/jpeg" ? "jpg" : "png"}`;
          handleAddAttachment({
            id: newAttachmentId(),
            kind: "file",
            name,
            sizeKb,
            content: base64,
            contentType: mediaType,
          });
        } catch (err) {
          toast.error(`Falha ao ler imagem colada: ${(err as Error).message}`);
        }
      }
    },
    [attachments, handleAddAttachment],
  );

  const handleSpeechToggle = useCallback(() => {
    if (!speechSupported) {
      toast.error("Seu navegador não suporta speech-to-text.");
      return;
    }
    if (speechState === "listening") {
      stopSpeech();
      const interim = interimRef.current.trim();
      if (interim) {
        setInput((prev) => (prev ? `${prev.trim()} ${interim}` : interim));
        interimRef.current = "";
      }
      return;
    }
    startSpeech();
  }, [speechState, speechSupported, startSpeech, stopSpeech]);

  const handleVoiceModeToggle = useCallback(() => {
    if (speechState === "listening") stopSpeech();
    setVoiceMode(true);
  }, [speechState, stopSpeech]);

  const handleChatModeToggle = useCallback(() => {
    setVoiceMode(false);
  }, []);

  const handleExamMode = useCallback(() => {
    const subj = context.subjectName ?? "essa matéria";
    setInput(
      `Modo Prova: tenho prova de ${subj} amanhã. Prepara o kit (resumo + flashcards + quiz) focado nos tópicos críticos, com cronograma pra 3h de estudo. Pode cobrar ~26 coins.`,
    );
  }, [context.subjectName]);

  const dismissEmbassador = useCallback(() => {
    setEmbassadorDismissed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(EMBASSADOR_KEY, "1");
    }
  }, []);

  const hasMessages = messages.length > 0;
  const streakCount = streak.current;
  const isListening = speechState === "listening";

  // Trava a página em 100dvh APENAS quando há chat ativo. No empty state e
  // no voice mode, libera (page scroll natural) — senão o título do empty
  // state fica cortado no desktop por causa de min-h conflitante.
  const lockViewport = hasMessages && !voiceMode;
  return (
    <div
      className={cn(
        "relative mx-auto flex w-full max-w-[1200px] flex-col px-4 lg:px-8",
        lockViewport
          ? "h-[calc(100dvh_-_60px_-_env(safe-area-inset-top))] overflow-hidden md:py-4"
          : "py-4 md:py-4",
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.png,.jpg,.jpeg"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header de ações — desktop only. No mobile o único cabeçalho é o do
          app-shell (topo global); o chat ocupa a tela toda, só as mensagens rolam.
          Fundo OPACO + sombra leve — bolhas do chat não vazam atrás.
          Versão compacta: py-1.5 + botões h-7 (antes py-3 + py-1.5/px-4 grandões
          dobravam a altura do header sem necessidade). */}
      <div className="hidden md:block sticky top-[60px] z-30 -mx-4 lg:-mx-8 mb-5 border-b border-border/60 bg-background px-4 lg:px-8 py-1.5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          {/* Left: context picker (kept) */}
          <div className="hidden md:flex">
            <LumiContextPicker
              subjects={subjects}
              lectures={lectures}
              value={context}
              onChange={setContext}
            />
          </div>

          {/* Center: Chat / Voice toggle — compacto */}
          <div className="flex flex-1 justify-center md:flex-none">
            <div className="inline-flex items-center gap-0.5 rounded-full border border-border/60 bg-secondary/60 p-0.5">
              <button
                type="button"
                onClick={handleChatModeToggle}
                className={
                  !voiceMode
                    ? "inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-medium text-foreground shadow-sm"
                    : "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                <MessageSquare className="h-3 w-3" />
                Chat
              </button>
              <button
                type="button"
                onClick={handleVoiceModeToggle}
                className={
                  voiceMode
                    ? "inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-medium text-foreground shadow-sm"
                    : "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                <Mic className="h-3 w-3" />
                Voz
              </button>
            </div>
          </div>

          {/* Right cluster — compacto */}
          <div className="flex items-center gap-1.5">
            <div className="hidden sm:inline-flex items-center gap-1 rounded-full border border-border/60 bg-secondary/40 px-2 py-0.5 text-[11px] font-medium text-foreground">
              <Flame className="h-3 w-3 text-primary" />
              <span className="tabular-nums">{streakCount}</span>
            </div>
            <Link
              href="/account/billing"
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary/60"
            >
              <Gift className="h-3 w-3 text-primary" />
              Lumi Pro
            </Link>
          </div>
        </div>
      </div>

      {voiceMode ? (
        <LumiVoiceMode
          userId={user.id}
          chat={chat}
          setChat={(next) => setChat(next)}
          contextLabel={contextLabel}
          contextSubjectId={context.subjectId}
          contextSubjectName={context.subjectName}
          contextLectureId={context.lectureId}
          attachments={attachments}
          onExit={handleChatModeToggle}
        />
      ) : hasMessages ? (
        /* Chat view */
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-card md:rounded-2xl md:border md:border-border/60">
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 pt-8 md:px-10 md:pt-10"
          >
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              {messages.map((m) => (
                <div key={m.id} className="flex flex-col gap-3">
                  <LumiMessageBubble message={m} />
                </div>
              ))}

              {/* Tool execution cards (inline durante a turn ativa) */}
              {sending && streamingTools.length > 0 && (
                <div className="flex flex-col gap-2">
                  {streamingTools.map((t) => (
                    <LumiToolCard
                      key={t.id}
                      name={t.name}
                      status={t.status}
                      input={t.input}
                      output={t.output}
                    />
                  ))}
                </div>
              )}

              {sending && streamingReply.length > 0 && (
                <div className="flex flex-col gap-3">
                  <LumiMessageBubble
                    message={{
                      id: "streaming",
                      role: "assistant",
                      content: streamingReply,
                      createdAt: new Date().toISOString(),
                    }}
                    isStreaming
                  />
                </div>
              )}

              {sending &&
                streamingReply.length === 0 &&
                streamingTools.length === 0 && (
                <LumiThinking variant="card" />
              )}
            </div>
          </div>

          {/* Bottom input */}
          <div className="border-t border-border/60 bg-card/80 p-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] md:p-4">
            <div className="mx-auto flex max-w-3xl flex-col gap-2">
              {attachments.length > 0 && (
                <AttachmentChips
                  attachments={attachments}
                  onRemove={handleRemoveAttachment}
                />
              )}
              <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
                <Textarea
                  ref={bottomTextareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  onPaste={handlePaste}
                  placeholder="Pergunte algo ao Lumi…"
                  rows={1}
                  disabled={sending}
                  className="min-h-[44px] max-h-[140px] resize-none border-0 bg-transparent p-1 text-sm shadow-none focus-visible:ring-0"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    {/* Mobile: anexar + gerar num "+" só */}
                    <div className="flex items-center gap-1 md:hidden">
                      <MobileComposerMenu
                        onUploadComputer={handleAttachClick}
                        onPickDocument={handleAttachDocuments}
                        onGenerate={handleGenerateMenu}
                        onExamMode={handleExamMode}
                        onVoiceMode={handleVoiceModeToggle}
                        attachDisabled={attachments.length >= MAX_ATTACHMENTS}
                      />
                      <Link
                        href="/lumi?new=1"
                        title="Nova conversa"
                        aria-label="Nova conversa"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                      >
                        <SquarePen className="h-4 w-4" />
                      </Link>
                    </div>
                    {/* Desktop (md+): menus separados + Modo Prova */}
                    <div className="hidden items-center gap-1 md:flex">
                      <AttachMenu
                        onUploadComputer={handleAttachClick}
                        onPickDocument={handleAttachDocuments}
                        disabled={attachments.length >= MAX_ATTACHMENTS}
                      />
                      <GenerateMenu onPick={handleGenerateMenu} />
                      <button
                        type="button"
                        onClick={handleExamMode}
                        disabled={sending}
                        title="Modo Prova"
                        className="inline-flex items-center gap-1.5 rounded-md border border-fuchsia-500/40 bg-gradient-to-r from-primary/10 to-fuchsia-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:from-primary/20 hover:to-fuchsia-500/20 disabled:opacity-50"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-fuchsia-500" />
                        Modo Prova
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ModelPill />
                    <MicButton
                      listening={isListening}
                      supported={speechSupported}
                      onClick={handleSpeechToggle}
                    />
                    <Button
                      type="button"
                      size="icon"
                      onClick={() => void sendMessage(input)}
                      disabled={sending || !input.trim()}
                      className="h-9 w-9 shrink-0 rounded-full"
                      aria-label="Enviar"
                    >
                      {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowUp className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-center text-[10px] text-muted-foreground">
                Lumi pode cometer erros. Sempre revise as informações.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Empty state — ArchiMeds-style */
        <div className="flex flex-1 min-h-0 flex-col items-center justify-end overflow-y-auto pb-[env(safe-area-inset-bottom)] md:flex-none md:min-h-[calc(100vh_-_220px)] md:justify-center md:pb-0">
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6">
            {/* Heading row */}
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/illustrations/lumi-desk.png"
                alt="Lumi"
                className="h-24 w-24 shrink-0 object-contain drop-shadow-sm md:h-28 md:w-28"
              />
              <div>
                <h1 className="text-3xl heading-display text-foreground md:text-4xl">
                  Como o Lumi pode te ajudar?
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pergunte sobre qualquer aula, peça um resumo, gere flashcards
                  ou treine com quizzes.
                </p>
              </div>
            </div>

            {/* Input card */}
            <div className="w-full rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
              {attachments.length > 0 && (
                <div className="mb-3">
                  <AttachmentChips
                    attachments={attachments}
                    onRemove={handleRemoveAttachment}
                  />
                </div>
              )}
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                onPaste={handlePaste}
                placeholder="Pergunte algo ao Lumi…"
                rows={3}
                disabled={sending}
                className="min-h-[80px] max-h-[180px] resize-none border-0 bg-transparent p-1 text-base placeholder:text-muted-foreground/70 shadow-none focus-visible:ring-0"
              />
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {/* Mobile: anexar + gerar num "+" só */}
                  <div className="flex items-center gap-1 md:hidden">
                    <MobileComposerMenu
                      onUploadComputer={handleAttachClick}
                      onPickDocument={handleAttachDocuments}
                      onGenerate={handleGenerateMenu}
                      onExamMode={handleExamMode}
                      onVoiceMode={handleVoiceModeToggle}
                      attachDisabled={attachments.length >= MAX_ATTACHMENTS}
                    />
                    <Link
                      href="/lumi?new=1"
                      title="Nova conversa"
                      aria-label="Nova conversa"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                    >
                      <SquarePen className="h-4 w-4" />
                    </Link>
                  </div>
                  {/* Desktop (md+): menus separados + Modo Prova */}
                  <div className="hidden items-center gap-1 md:flex">
                    <AttachMenu
                      onUploadComputer={handleAttachClick}
                      onPickDocument={handleAttachDocuments}
                      disabled={attachments.length >= MAX_ATTACHMENTS}
                    />
                    <GenerateMenu onPick={handleGenerateMenu} />
                    <button
                      type="button"
                      onClick={handleExamMode}
                      disabled={sending}
                      title="Modo Prova"
                      className="inline-flex items-center gap-1.5 rounded-md border border-fuchsia-500/40 bg-gradient-to-r from-primary/10 to-fuchsia-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:from-primary/20 hover:to-fuchsia-500/20 disabled:opacity-50"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-fuchsia-500" />
                      Modo Prova
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ModelPill />
                  <MicButton
                    listening={isListening}
                    supported={speechSupported}
                    onClick={handleSpeechToggle}
                  />
                  <Button
                    type="button"
                    size="icon"
                    onClick={() => void sendMessage(input)}
                    disabled={sending || !input.trim()}
                    className="h-9 w-9 shrink-0 rounded-full"
                    aria-label="Enviar"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowUp className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Balance row — escondido no mobile (chat mais clean) */}
            <div className="hidden w-full items-center justify-between px-1 text-[11px] text-muted-foreground md:flex">
              <span className="inline-flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5 text-amber-500" />
                <span>
                  Você tem{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {coinBalance ?? "—"}
                  </span>{" "}
                  {coinBalance === 1 ? "coin" : "coins"}
                </span>
              </span>
              <Link
                href="/account/coins"
                className="font-medium text-primary hover:underline"
              >
                Ver carteira →
              </Link>
            </div>

            {/* Suggestion chips — escondidos no mobile (chat mais clean) */}
            <div className="-mx-1 hidden w-full gap-2 overflow-x-auto px-1 pb-2 md:flex">
              {SUGGESTION_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => handleSuggestionChip(chip)}
                  title={chip.hint}
                  aria-label={`${chip.label} — ${chip.hint} · ${chip.cost} coins`}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-3 text-left transition-colors hover:bg-secondary/40 hover:border-primary/30"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <chip.Icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {chip.label}
                  </span>
                  <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 tabular-nums">
                    <Coins className="h-3 w-3" />
                    {chip.cost}
                  </span>
                </button>
              ))}
            </div>

            {/* Footer row — escondido no mobile pra deixar o chat mais clean */}
            <div className="hidden flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground md:flex">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <Flame className="h-3.5 w-3.5 text-primary" />
                <span className="tabular-nums">{streakCount}</span> dias
              </span>
              <span aria-hidden>·</span>
              <Link
                href="/flashcards"
                className="rounded-md px-1 py-0.5 hover:text-foreground hover:underline"
              >
                Crie seus flashcards
              </Link>
              <Link
                href="/schedule"
                className="rounded-md px-1 py-0.5 hover:text-foreground hover:underline"
              >
                Configure seu planejador
              </Link>
            </div>

            {/* Embassador banner — escondido no mobile (chat mais clean) */}
            {!embassadorDismissed && (
              <div className="relative hidden w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-secondary/40 px-4 py-3 text-xs md:flex">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Gift className="h-3.5 w-3.5 text-primary" />
                  Quer acesso ao plano Pro? Vire embaixador
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href="/account/billing"
                    className="font-medium text-primary hover:underline"
                  >
                    Saiba mais →
                  </Link>
                  <button
                    type="button"
                    onClick={dismissEmbassador}
                    aria-label="Fechar"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <LumiGenerateDialog
        open={!!genDialogKind}
        kind={genDialogKind}
        contextLabel={contextLabel}
        hasLecture={!!context.lectureId}
        hasMessages={messages.length > 0}
        attachmentCount={attachments.length}
        coinBalance={coinBalance}
        loading={generating}
        onConfirm={handleGenerateConfirm}
        onClose={() => setGenDialogKind(null)}
      />

      <LumiAttachmentPicker
        open={attachmentPickerOpen}
        userId={user.id}
        onClose={() => setAttachmentPickerOpen(false)}
        onPick={handleAddAttachment}
      />
    </div>
  );
}

function AttachmentChips({
  attachments,
  onRemove,
}: {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((a) => {
        const Icon =
          a.contentType === "application/pdf"
            ? FileText
            : a.contentType?.startsWith("image/")
              ? ImageIcon
              : a.kind === "document"
                ? FolderOpen
                : FileIcon;
        return (
          <div
            key={a.id}
            className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/60 bg-secondary/40 py-1 pl-2 pr-1 text-xs"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="max-w-[180px] truncate font-medium text-foreground">
              {a.name}
            </span>
            {a.sizeKb !== undefined && (
              <span className="text-[10px] text-muted-foreground">
                · {a.sizeKb} KB
              </span>
            )}
            <button
              type="button"
              onClick={() => onRemove(a.id)}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              aria-label={`Remover ${a.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function AttachMenu({
  onUploadComputer,
  onPickDocument,
  disabled,
}: {
  onUploadComputer: () => void;
  onPickDocument: () => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title="Anexar"
          aria-label="Anexar arquivo ou documento"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onClick={onUploadComputer}>
          <Upload className="mr-2 h-4 w-4 text-primary" />
          Carregar do computador
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPickDocument}>
          <FolderOpen className="mr-2 h-4 w-4 text-primary" />
          Dos meus documentos
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Mobile: um "+" só agrupa anexar + gerar (composer mais clean no celular).
// No desktop (md+) os menus separados continuam aparecendo (ver composer).
function MobileComposerMenu({
  onUploadComputer,
  onPickDocument,
  onGenerate,
  onExamMode,
  onVoiceMode,
  attachDisabled,
}: {
  onUploadComputer: () => void;
  onPickDocument: () => void;
  onGenerate: (kind: LumiGenerateKind) => void;
  onExamMode: () => void;
  onVoiceMode: () => void;
  attachDisabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Anexar e gerar"
          aria-label="Anexar arquivo, documento ou gerar conteúdo"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onClick={onVoiceMode}>
          <Mic className="mr-2 h-4 w-4 text-primary" />
          Modo de Voz
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExamMode}>
          <Sparkles className="mr-2 h-4 w-4 text-fuchsia-500" />
          Modo Prova
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Anexar</DropdownMenuLabel>
        <DropdownMenuItem onClick={onUploadComputer} disabled={attachDisabled}>
          <Upload className="mr-2 h-4 w-4 text-primary" />
          Carregar do computador
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPickDocument} disabled={attachDisabled}>
          <FolderOpen className="mr-2 h-4 w-4 text-primary" />
          Dos meus documentos
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Gerar</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onGenerate("summary")}>
          <FileText className="mr-2 h-4 w-4 text-primary" />
          Gerar resumo
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onGenerate("flashcards")}>
          <Layers className="mr-2 h-4 w-4 text-primary" />
          Criar flashcards
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onGenerate("quiz")}>
          <HelpCircle className="mr-2 h-4 w-4 text-primary" />
          Gerar quiz
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onGenerate("mindmap")}>
          <Network className="mr-2 h-4 w-4 text-primary" />
          Mapa mental
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MicButton({
  listening,
  supported,
  onClick,
}: {
  listening: boolean;
  supported: boolean;
  onClick: () => void;
}) {
  const Icon = listening ? MicOff : Mic;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!supported}
      title={
        !supported
          ? "Speech-to-text indisponível"
          : listening
            ? "Parar gravação"
            : "Falar pra digitar"
      }
      aria-label={listening ? "Parar gravação" : "Falar pra digitar"}
      className={
        listening
          ? "inline-flex h-8 w-8 items-center justify-center rounded-md bg-rose-500/15 text-rose-500 transition-colors animate-pulse"
          : "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground disabled:opacity-40"
      }
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function GenerateMenu({
  onPick,
}: {
  onPick: (kind: LumiGenerateKind) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/40 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary/70"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Gerar
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem onClick={() => onPick("summary")}>
          <FileText className="mr-2 h-4 w-4 text-primary" />
          Gerar resumo
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPick("flashcards")}>
          <Layers className="mr-2 h-4 w-4 text-primary" />
          Criar flashcards
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPick("quiz")}>
          <HelpCircle className="mr-2 h-4 w-4 text-primary" />
          Gerar quiz
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPick("mindmap")}>
          <Network className="mr-2 h-4 w-4 text-primary" />
          Mapa mental
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModelPill() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hidden md:inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          Claude Sonnet 4.5 · Flash
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem disabled>Claude Sonnet 4.5 · Flash</DropdownMenuItem>
        <DropdownMenuItem disabled>Claude Opus 4.7 · Pro</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
