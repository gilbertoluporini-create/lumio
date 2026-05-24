"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowLeft, Loader2, Mic, Square, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import {
  appendMessage,
  createChat,
  type ChatAttachment,
  type LumiChat,
  type LumiChatMessage,
} from "@/lib/lumi-chats";
import { cn } from "@/lib/utils";

type Props = {
  userId: string;
  chat: LumiChat | null;
  setChat: (next: LumiChat | null) => void;
  contextLabel: string | null;
  contextSubjectId?: string;
  contextSubjectName?: string;
  contextLectureId?: string;
  attachments: ChatAttachment[];
  onExit: () => void;
};

type VoiceState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking";

export function LumiVoiceMode({
  userId,
  chat,
  setChat,
  contextLabel,
  contextSubjectId,
  contextSubjectName,
  contextLectureId,
  attachments,
  onExit,
}: Props) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [interim, setInterim] = useState("");
  const [finalText, setFinalText] = useState("");
  const [lastReply, setLastReply] = useState<string | null>(null);
  const finalBufferRef = useRef("");

  const { supported, start, stop, error } = useSpeechRecognition({
    lang: "pt-BR",
    onInterim: (t) => setInterim(t),
    onFinal: (t) => {
      finalBufferRef.current = `${finalBufferRef.current} ${t}`.trim();
      setFinalText(finalBufferRef.current);
      setInterim("");
    },
  });

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text.slice(0, 2000));
    utter.lang = "pt-BR";
    utter.rate = 1;
    utter.pitch = 1;
    utter.onstart = () => setVoiceState("speaking");
    utter.onend = () => setVoiceState("idle");
    utter.onerror = () => setVoiceState("idle");
    window.speechSynthesis.speak(utter);
  }, []);

  const sendToAi = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setVoiceState("idle");
        return;
      }

      let currentChat = chat;
      if (!currentChat) {
        currentChat = createChat(userId, {
          subjectId: contextSubjectId,
          subjectName: contextSubjectName,
          category: "chat",
        });
        setChat(currentChat);
      }

      const userMsg: LumiChatMessage = {
        id: `u_${Date.now()}`,
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      const optimistic = appendMessage(userId, currentChat.id, userMsg);
      if (optimistic) setChat(optimistic);

      setVoiceState("thinking");
      try {
        const res = await fetch("/api/ai/chat-summary", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lectureId: contextLectureId,
            message: trimmed,
            mode: "default",
            contextLabel,
            history: (optimistic?.messages ?? [])
              .slice(-10)
              .map((m) => ({ role: m.role, content: m.content })),
            attachments: attachments.map((a) => ({
              name: a.name,
              content: a.content,
            })),
          }),
        });
        if (!res.ok) {
          let msg = "Erro ao falar com o Lumi.";
          try {
            const j = (await res.json()) as { error?: string };
            if (j.error) msg = j.error;
          } catch {
            /* ignore */
          }
          toast.error(msg);
          setVoiceState("idle");
          return;
        }
        const data = (await res.json()) as { reply: string };
        const reply = data.reply || "(Sem resposta)";
        const assistantMsg: LumiChatMessage = {
          id: `a_${Date.now()}`,
          role: "assistant",
          content: reply,
          createdAt: new Date().toISOString(),
        };
        const next = appendMessage(userId, currentChat.id, assistantMsg);
        if (next) setChat(next);
        setLastReply(reply);
        const plain = reply
          .replace(/[*_`#>\[\]]/g, "")
          .replace(/\n+/g, ". ")
          .trim();
        speak(plain);
      } catch (err) {
        toast.error(`Falha de rede: ${(err as Error).message}`);
        setVoiceState("idle");
      }
    },
    [
      attachments,
      chat,
      contextLabel,
      contextLectureId,
      contextSubjectId,
      contextSubjectName,
      setChat,
      speak,
      userId,
    ],
  );

  const handleMicClick = useCallback(() => {
    if (voiceState === "thinking") return;

    if (voiceState === "speaking") {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setVoiceState("idle");
      return;
    }

    if (voiceState === "listening") {
      stop();
      const buffered = finalBufferRef.current.trim();
      const pending = interim.trim();
      const combined = `${buffered} ${pending}`.trim();
      finalBufferRef.current = "";
      setFinalText("");
      setInterim("");
      setVoiceState("idle");
      if (combined) void sendToAi(combined);
      return;
    }

    if (!supported) {
      toast.error("Seu navegador não suporta speech-to-text. Use Chrome/Edge.");
      return;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    finalBufferRef.current = "";
    setFinalText("");
    setInterim("");
    setLastReply(null);
    setVoiceState("listening");
    start();
  }, [interim, sendToAi, start, stop, supported, voiceState]);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setVoiceState("idle");
  }, []);

  const statusLabel = useMemo(() => {
    if (voiceState === "listening") return "Ouvindo...";
    if (voiceState === "thinking") return "Lumi está pensando...";
    if (voiceState === "speaking") return "Falando...";
    return "Toque pra falar";
  }, [voiceState]);

  const handleExit = useCallback(() => {
    stop();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setVoiceState("idle");
    onExit();
  }, [onExit, stop]);

  const chatMessages = chat?.messages;
  const lastAssistantFromChat = useMemo(() => {
    if (!chatMessages) return null;
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      const m = chatMessages[i];
      if (m.role === "assistant") return m.content;
    }
    return null;
  }, [chatMessages]);

  const displayedReply = lastReply ?? lastAssistantFromChat;

  return (
    <div className="relative flex min-h-[calc(100vh-160px)] w-full flex-col items-center">
      <div className="absolute left-2 top-2 z-10">
        <button
          type="button"
          onClick={handleExit}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/80 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground backdrop-blur"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar pro chat
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12 text-center">
        <div className="relative">
          <div
            className={cn(
              "absolute inset-0 -m-6 rounded-full blur-3xl transition-opacity duration-500",
              voiceState === "speaking"
                ? "bg-violet-500/30 opacity-100 animate-pulse"
                : voiceState === "thinking"
                  ? "bg-primary/20 opacity-70 animate-pulse"
                  : voiceState === "listening"
                    ? "bg-rose-500/20 opacity-80"
                    : "bg-primary/10 opacity-50",
            )}
            aria-hidden
          />
          <div
            className={cn(
              "relative flex h-48 w-48 items-center justify-center overflow-hidden rounded-full bg-card/80 ring-4 ring-primary/10 transition-transform",
              voiceState === "listening" && "animate-pulse",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/illustrations/lumi-thinking.png"
              alt="Lumi"
              className="h-44 w-44 object-contain"
            />
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {statusLabel}
          </div>
          {voiceState === "listening" && <Waveform />}
          {voiceState === "thinking" && (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )}

          {(finalText || interim) && voiceState !== "thinking" && (
            <div className="max-w-xl text-base leading-relaxed">
              <span className="text-foreground">{finalText} </span>
              <span className="text-muted-foreground">{interim}</span>
            </div>
          )}
        </div>

        {displayedReply && (
          <div className="w-full max-w-xl rounded-2xl border border-border/60 bg-card p-5 text-left shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Volume2 className="h-3 w-3" />
                Resposta do Lumi
              </div>
              {voiceState === "speaking" && (
                <button
                  type="button"
                  onClick={stopSpeaking}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  Parar Lumi
                </button>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {displayedReply}
            </p>
          </div>
        )}
      </div>

      <div className="sticky bottom-6 flex flex-col items-center gap-2 pb-6">
        <button
          type="button"
          onClick={handleMicClick}
          disabled={voiceState === "thinking"}
          aria-label={voiceState === "listening" ? "Parar e enviar" : "Falar"}
          className={cn(
            "flex h-20 w-20 items-center justify-center rounded-full shadow-xl transition-all",
            voiceState === "listening"
              ? "bg-rose-500 text-white animate-pulse hover:bg-rose-600"
              : voiceState === "thinking"
                ? "bg-muted text-muted-foreground"
                : voiceState === "speaking"
                  ? "bg-violet-500 text-white hover:bg-violet-600"
                  : "bg-primary text-primary-foreground hover:scale-105",
          )}
        >
          {voiceState === "thinking" ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : voiceState === "listening" ? (
            <Square className="h-7 w-7" />
          ) : voiceState === "speaking" ? (
            <Square className="h-7 w-7" />
          ) : (
            <Mic className="h-8 w-8" />
          )}
        </button>
        <div className="text-[11px] text-muted-foreground">
          {voiceState === "listening"
            ? "Toque pra parar e enviar"
            : voiceState === "speaking"
              ? "Toque pra interromper"
              : voiceState === "thinking"
                ? "Aguarde..."
                : "Toque no microfone pra começar"}
        </div>
      </div>
    </div>
  );
}

function Waveform() {
  return (
    <div className="flex h-8 items-end gap-1">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <span
          key={i}
          className="w-1.5 rounded-full bg-rose-500"
          style={{
            height: `${20 + ((i * 13) % 70)}%`,
            animation: `lumiWave 0.9s ease-in-out ${i * 0.08}s infinite alternate`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes lumiWave {
          from {
            transform: scaleY(0.4);
          }
          to {
            transform: scaleY(1.4);
          }
        }
      `}</style>
    </div>
  );
}
