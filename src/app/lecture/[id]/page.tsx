"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Check,
  ChevronLeft,
  Loader2,
  Mic,
  MicOff,
  Save,
  Send,
  Sparkles,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  appendMessage,
  deleteLecture,
  getLecture,
  getSubject,
  updateLecture,
} from "@/lib/storage";
import type { ChatMessage, Lecture, Subject, User } from "@/lib/types";
import { cn, formatDuration, generateId } from "@/lib/utils";
import {
  isSpeechRecognitionSupported,
  useSpeechRecognition,
} from "@/hooks/use-speech-recognition";

export default function LecturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <LectureView user={user} lectureId={id} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function LectureView({ user, lectureId }: { user: User; lectureId: string }) {
  const router = useRouter();
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [interim, setInterim] = useState("");
  const [transcript, setTranscript] = useState("");
  const [durationSec, setDurationSec] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingReply, setStreamingReply] = useState("");
  const timerRef = useRef<number | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  const transcriptBoxRef = useRef<HTMLDivElement>(null);
  const chatBoxRef = useRef<HTMLDivElement>(null);

  const [browserSupported, setBrowserSupported] = useState(true);
  useEffect(() => {
    setBrowserSupported(isSpeechRecognitionSupported());
  }, []);

  const speech = useSpeechRecognition({
    lang: "pt-BR",
    onFinal: (text) => {
      setTranscript((prev) => {
        const next = (prev ? prev + " " : "") + text.trim();
        return next.replace(/\s+/g, " ");
      });
      setInterim("");
    },
    onInterim: (text) => setInterim(text),
  });

  useEffect(() => {
    const l = getLecture(user.id, lectureId);
    if (!l) {
      toast.error("Aula não encontrada.");
      router.replace("/dashboard");
      return;
    }
    setLecture(l);
    setTitleDraft(l.title);
    setTranscript(l.transcript || "");
    setDurationSec(l.durationSec || 0);
    setMessages(l.messages || []);
    const s = getSubject(user.id, l.subjectId);
    setSubject(s);
  }, [user.id, lectureId, router]);

  useEffect(() => {
    if (speech.state === "listening") {
      sessionStartRef.current = Date.now();
      timerRef.current = window.setInterval(() => {
        if (sessionStartRef.current) {
          const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000);
          setDurationSec((base) => base + (elapsed > 0 ? 1 : 0));
        }
      }, 1000);
    } else if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
      sessionStartRef.current = null;
    }
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [speech.state]);

  useEffect(() => {
    if (transcriptBoxRef.current) {
      transcriptBoxRef.current.scrollTop = transcriptBoxRef.current.scrollHeight;
    }
  }, [transcript, interim]);

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages, streamingReply]);

  const persist = (patch: Partial<Lecture>) => {
    if (!lecture) return;
    const updated = updateLecture(user.id, lecture.id, patch);
    if (updated) setLecture(updated);
  };

  function toggleRecording() {
    if (speech.state === "listening") {
      speech.stop();
      persist({
        transcript,
        durationSec,
        status: "completed",
      });
      toast.success("Aula salva.");
    } else {
      if (!browserSupported) {
        toast.error("Seu navegador não suporta reconhecimento de voz. Use Chrome, Edge ou Safari.");
        return;
      }
      speech.start();
      persist({ status: "live" });
    }
  }

  function saveTranscript() {
    persist({ transcript, durationSec });
    toast.success("Transcrição salva.");
  }

  function saveTitle() {
    const t = titleDraft.trim();
    if (!t) {
      setTitleDraft(lecture?.title || "");
      setEditingTitle(false);
      return;
    }
    persist({ title: t });
    setEditingTitle(false);
  }

  function handleDelete() {
    if (!lecture) return;
    if (!confirm("Excluir esta aula? Esta ação não pode ser desfeita.")) return;
    deleteLecture(user.id, lecture.id);
    toast.success("Aula excluída.");
    router.replace("/dashboard");
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    if (!lecture) return;
    const userMsg: ChatMessage = {
      id: generateId(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    appendMessage(user.id, lecture.id, userMsg);
    setInput("");
    setSending(true);
    setStreamingReply("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          context: {
            lectureTitle: lecture.title,
            subject: subject?.name ?? "Geral",
            transcript: (transcript + (interim ? " " + interim : "")).trim(),
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error("Resposta vazia.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        acc += chunk;
        setStreamingReply(acc);
      }

      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: acc.trim(),
        createdAt: new Date().toISOString(),
      };
      const finalMessages = [...nextMessages, assistantMsg];
      setMessages(finalMessages);
      appendMessage(user.id, lecture.id, assistantMsg);
      setStreamingReply("");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao consultar a IA. Verifique a configuração da ANTHROPIC_API_KEY.");
    } finally {
      setSending(false);
    }
  }

  if (!lecture) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isLive = speech.state === "listening";

  return (
    <div className="mx-auto max-w-7xl px-4 py-5">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Button>
        {subject && (
          <Badge variant="outline" className="gap-1.5">
            <span
              className={cn(
                "h-2 w-2 rounded-full bg-gradient-to-br shrink-0",
                subject.color,
              )}
            />
            {subject.name}
          </Badge>
        )}
        {isLive && (
          <Badge variant="live" className="gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 pulse-dot" /> AO VIVO
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={saveTranscript}>
            <Save className="h-4 w-4" /> Salvar
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleDelete}
            className="text-muted-foreground hover:text-destructive"
            title="Excluir aula"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="mb-4">
        {editingTitle ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") {
                  setTitleDraft(lecture.title);
                  setEditingTitle(false);
                }
              }}
              className="text-xl font-semibold h-11"
            />
            <Button variant="ghost" size="icon" onClick={saveTitle}>
              <Check className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <h1
            className="text-2xl md:text-3xl font-semibold tracking-tight cursor-text hover:bg-secondary/40 rounded-md px-2 -mx-2 py-1 transition-colors"
            onClick={() => setEditingTitle(true)}
            title="Clique pra renomear"
          >
            {lecture.title}
          </h1>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5 min-h-[70vh]">
        {/* TRANSCRIPT PANEL */}
        <div className="flex flex-col rounded-xl border border-border/70 bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3 bg-card">
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Transcrição</span>
              {durationSec > 0 && (
                <span className="text-xs text-muted-foreground font-mono ml-2">
                  {formatDuration(durationSec)}
                </span>
              )}
            </div>
            <Button
              variant={isLive ? "destructive" : "gradient"}
              size="sm"
              onClick={toggleRecording}
              disabled={!browserSupported && !isLive}
            >
              {isLive ? (
                <>
                  <MicOff className="h-4 w-4" /> Pausar
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4" /> {durationSec > 0 ? "Continuar" : "Iniciar"}
                </>
              )}
            </Button>
          </div>

          {!browserSupported && (
            <div className="border-b border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Reconhecimento de voz não disponível neste navegador. Use Chrome, Edge ou Safari pra gravar — ou cole o texto manualmente abaixo.
              </span>
            </div>
          )}

          {speech.error && (
            <div className="border-b border-destructive/30 bg-destructive/10 px-5 py-3 text-sm text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{speech.error}</span>
            </div>
          )}

          <div
            ref={transcriptBoxRef}
            className="flex-1 overflow-y-auto p-5 scrollbar-thin"
          >
            {transcript || interim ? (
              <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                {transcript}
                {interim && (
                  <span className="text-muted-foreground italic ml-1">
                    {" "}
                    {interim}
                  </span>
                )}
                {isLive && (
                  <span className="inline-block ml-1 h-4 w-0.5 bg-primary align-middle animate-pulse" />
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-12">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
                  <Mic className="h-6 w-6 text-primary" />
                </div>
                <p className="text-sm font-medium">Pronto pra começar?</p>
                <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                  Clique em &quot;Iniciar&quot; e o Lumio começa a transcrever em tempo real. Você também pode colar o texto na caixa abaixo.
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-border/60 p-3 bg-card">
            <Textarea
              placeholder="Edite ou cole a transcrição manualmente aqui…"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              onBlur={() => persist({ transcript })}
              className="min-h-[80px] text-sm scrollbar-thin"
            />
          </div>
        </div>

        {/* CHAT PANEL */}
        <div className="flex flex-col rounded-xl border border-border/70 bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Chat com a aula</span>
            </div>
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Sparkles className="h-2.5 w-2.5 text-primary" /> Claude
            </Badge>
          </div>

          <div
            ref={chatBoxRef}
            className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin"
          >
            {messages.length === 0 && !streamingReply && (
              <div className="h-full flex flex-col items-center justify-center text-center py-12">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <p className="text-sm font-medium">Pergunte sobre a aula</p>
                <p className="mt-1 text-xs text-muted-foreground max-w-[260px]">
                  A IA enxerga toda a transcrição. Tire dúvidas, peça resumos ou explicações.
                </p>
                <div className="mt-5 flex flex-wrap gap-2 justify-center max-w-sm">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setInput(p)}
                      className="text-xs rounded-full border border-border/60 bg-background hover:bg-secondary/60 px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <ChatBubble key={m.id} message={m} />
            ))}
            {streamingReply && (
              <ChatBubble
                message={{
                  id: "streaming",
                  role: "assistant",
                  content: streamingReply,
                  createdAt: new Date().toISOString(),
                }}
                streaming
              />
            )}
          </div>

          <div className="border-t border-border/60 p-3 bg-card">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="flex items-end gap-2"
            >
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={
                  transcript
                    ? "Pergunte sobre a aula…"
                    : "Pergunte algo (transcreva primeiro pra IA ter contexto)…"
                }
                className="min-h-[44px] max-h-[160px] text-sm resize-none"
                rows={1}
              />
              <Button
                type="submit"
                variant="gradient"
                size="icon"
                disabled={sending || !input.trim()}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet-500 mt-0.5">
          <Bot className="h-3.5 w-3.5 text-white" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-secondary/70 text-foreground rounded-bl-sm",
        )}
      >
        {message.content}
        {streaming && (
          <span className="inline-block ml-1 h-3 w-0.5 bg-current animate-pulse align-middle" />
        )}
      </div>
      {isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary border border-border/60 mt-0.5">
          <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

const SUGGESTED_PROMPTS = [
  "Faz um resumo da aula",
  "Quais os pontos principais?",
  "Crie 5 questões pra revisão",
  "Explica de novo a parte mais difícil",
];
