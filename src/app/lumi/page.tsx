"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUp,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
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
  Upload,
  X,
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
  QUICK_ACTIONS,
  type QuickAction,
} from "@/components/lumi/lumi-quick-actions";
import { LumiAttachmentPicker } from "@/components/lumi/lumi-attachment-picker";
import { LumiVoiceMode } from "@/components/lumi/lumi-voice-mode";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import {
  appendMessage,
  createChat,
  getChat,
  type ChatAttachment,
  type LumiChat,
  type LumiChatCategory,
  type LumiChatMessage,
} from "@/lib/lumi-chats";
import { calculateStreak } from "@/lib/streak";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Lecture, Subject, User } from "@/lib/types";

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
  const [sending, setSending] = useState(false);
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [genDialogKind, setGenDialogKind] = useState<LumiGenerateKind | null>(
    null,
  );
  const [generating, setGenerating] = useState(false);
  const [embassadorDismissed, setEmbassadorDismissed] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentPickerOpen, setAttachmentPickerOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const englishMode = useRef(false);
  const interimRef = useRef("");

  const messages = chat?.messages ?? [];
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
    () => attachments.map((a) => ({ name: a.name, content: a.content })),
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
            attachments: attachmentsPayload,
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
      attachmentsPayload,
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

      const transcripts: string[] = [];
      if (hasUsableConvo) transcripts.push(baseTranscript);

      try {
        const resp = await fetch("/api/ai/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: kind,
            sources: { transcripts },
            attachments: attachmentsPayload,
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
      attachments.length,
      attachmentsPayload,
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
          const pdfjs = await import("pdfjs-dist");
          if (typeof window !== "undefined") {
            pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
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
          handleAddAttachment({
            id: newAttachmentId(),
            kind: "file",
            name: file.name,
            sizeKb,
            content: `[Imagem anexada: ${file.name} — análise visual ainda não suportada pela IA. Descreva o conteúdo na mensagem.]`,
            contentType: file.type || "image/png",
          });
          toast.info("Imagem anexada (sem leitura visual ainda).");
          return;
        }

        toast.error("Tipo não suportado. Use PDF, TXT, PNG ou JPG.");
      } catch (err) {
        toast.error(`Falha ao processar "${file.name}": ${(err as Error).message}`);
      }
    },
    [handleAddAttachment],
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

  const dismissEmbassador = useCallback(() => {
    setEmbassadorDismissed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(EMBASSADOR_KEY, "1");
    }
  }, []);

  const hasMessages = messages.length > 0;
  const streakCount = streak.current;
  const isListening = speechState === "listening";

  return (
    <div className="relative mx-auto flex w-full max-w-[1200px] flex-col px-4 py-4 lg:px-8">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.png,.jpg,.jpeg"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Sticky header (toggle + actions) */}
      <div className="sticky top-[60px] z-20 -mx-4 lg:-mx-8 mb-4 border-b border-border/40 bg-background/85 px-4 lg:px-8 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
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

          {/* Center: Chat / Voice toggle */}
          <div className="flex flex-1 justify-center md:flex-none">
            <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-secondary/60 p-1 backdrop-blur">
              <button
                type="button"
                onClick={handleChatModeToggle}
                className={
                  !voiceMode
                    ? "inline-flex items-center gap-1.5 rounded-full bg-card px-4 py-1.5 text-xs font-medium text-foreground shadow-sm"
                    : "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Chat
              </button>
              <button
                type="button"
                onClick={handleVoiceModeToggle}
                className={
                  voiceMode
                    ? "inline-flex items-center gap-1.5 rounded-full bg-card px-4 py-1.5 text-xs font-medium text-foreground shadow-sm"
                    : "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                <Mic className="h-3.5 w-3.5" />
                Modo de Voz
              </button>
            </div>
          </div>

          {/* Right cluster */}
          <div className="flex items-center gap-1.5">
            <Link
              href="/lumi/chats"
              title="Histórico de chats"
              aria-label="Histórico de chats"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              <Clock className="h-4 w-4" />
            </Link>
            <button
              type="button"
              title="Tarefas"
              aria-label="Tarefas"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
            <Link
              href="/schedule"
              title="Planejador"
              aria-label="Planejador"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              <Calendar className="h-4 w-4" />
            </Link>
            <div className="hidden sm:inline-flex items-center gap-1 rounded-full border border-border/60 bg-secondary/40 px-2.5 py-1 text-[11px] font-medium text-foreground">
              <Flame className="h-3 w-3 text-primary" />
              <span className="tabular-nums">{streakCount}</span>
            </div>
            <Link
              href="/account/billing"
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary/60"
            >
              <Gift className="h-3.5 w-3.5 text-primary" />
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
        <div className="flex min-h-[600px] flex-col rounded-2xl border border-border/60 bg-card">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-6 md:px-10"
            style={{ maxHeight: "calc(100vh - 280px)" }}
          >
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              {messages.map((m) => (
                <div key={m.id} className="flex flex-col gap-3">
                  <LumiMessageBubble message={m} />
                </div>
              ))}

              {sending && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-primary/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/illustrations/lumi-thinking.png"
                      alt="Lumi pensando"
                      className="h-10 w-10 animate-pulse object-contain"
                    />
                  </div>
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Lumi está pensando…
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom input */}
          <div className="border-t border-border/60 bg-card/80 p-3 md:p-4">
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
                  placeholder="Pergunte algo ao Lumi…"
                  rows={1}
                  disabled={sending}
                  className="min-h-[44px] max-h-[140px] resize-none border-0 bg-transparent p-1 text-sm shadow-none focus-visible:ring-0"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <AttachMenu
                      onUploadComputer={handleAttachClick}
                      onPickDocument={handleAttachDocuments}
                      disabled={attachments.length >= MAX_ATTACHMENTS}
                    />
                    <GenerateMenu onPick={handleGenerateMenu} />
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
        <div className="flex min-h-[calc(100vh-220px)] flex-col items-center justify-center">
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6">
            {/* Heading row */}
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
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
                placeholder="Pergunte algo ao Lumi…"
                rows={3}
                disabled={sending}
                className="min-h-[80px] max-h-[180px] resize-none border-0 bg-transparent p-1 text-base placeholder:text-muted-foreground/70 shadow-none focus-visible:ring-0"
              />
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <AttachMenu
                    onUploadComputer={handleAttachClick}
                    onPickDocument={handleAttachDocuments}
                    disabled={attachments.length >= MAX_ATTACHMENTS}
                  />
                  <GenerateMenu onPick={handleGenerateMenu} />
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

            {/* Balance row */}
            <div className="flex w-full items-center justify-between px-1 text-[11px] text-muted-foreground">
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

            {/* Suggestion chips */}
            <div className="-mx-1 flex w-full gap-2 overflow-x-auto px-1 pb-2">
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

            {/* Footer row */}
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
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

            {/* Embassador banner */}
            {!embassadorDismissed && (
              <div className="relative flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-secondary/40 px-4 py-3 text-xs">
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
