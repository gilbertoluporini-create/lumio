"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowLeft, DollarSign, Loader2, Mic, Square, Volume2, Zap } from "lucide-react";
import { toast } from "sonner";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import {
  appendMessage,
  createChat,
  type ChatAttachment,
  type LumiChat,
  type LumiChatMessage,
} from "@/lib/lumi-chats";
import { cn, stripChatFormatting } from "@/lib/utils";

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

  /**
   * Modo dinâmico estilo ChatGPT advanced voice: depois que a IA termina de
   * falar, o microfone reabre automaticamente. VAD (voice activity detection)
   * por silêncio finaliza o turno do usuário sem precisar apertar botão.
   */
  const [continuousMode, setContinuousMode] = useState(true);
  const continuousRef = useRef(continuousMode);
  useEffect(() => {
    continuousRef.current = continuousMode;
  }, [continuousMode]);

  /** Detecção de silêncio: 2.4s sem nova palavra final → finaliza turno.
   *  Antes era 1.6s + armado em onInterim — fechava turno cedo demais durante pausas. */
  const SILENCE_TIMEOUT_MS = 2400;
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Tracking de gasto da sessão (visível só no chat, sem cobrar coins). */
  const [sessionStats, setSessionStats] = useState({
    turns: 0,
    charsIn: 0, // chars que o user falou (STT é grátis - browser)
    charsOut: 0, // chars que o TTS sintetizou (ElevenLabs)
    tokensIn: 0, // tokens enviados ao Claude (estimado)
    tokensOut: 0, // tokens de resposta do Claude (estimado)
    costUsd: 0, // custo total em USD
  });

  /** Custos estimados (USD).
   * - ElevenLabs Multilingual v2: $0.30 / 1k chars (no plano pay-as-you-go)
   * - Claude Haiku 4.5: input $1/MTok, output $5/MTok
   *   (Sonnet seria $3/MTok input + $15/MTok output) */
  const COST = {
    elevenlabsPerChar: 0.0003, // $0.30 / 1k chars
    claudeInputPerTok: 0.000001, // $1 / MTok
    claudeOutputPerTok: 0.000005, // $5 / MTok
  };

  const addUsage = useCallback(
    (chunk: {
      charsIn?: number;
      charsOut?: number;
      tokensIn?: number;
      tokensOut?: number;
    }) => {
      setSessionStats((s) => {
        const charsOut = s.charsOut + (chunk.charsOut ?? 0);
        const tokensIn = s.tokensIn + (chunk.tokensIn ?? 0);
        const tokensOut = s.tokensOut + (chunk.tokensOut ?? 0);
        const cost =
          charsOut * COST.elevenlabsPerChar +
          tokensIn * COST.claudeInputPerTok +
          tokensOut * COST.claudeOutputPerTok;
        return {
          turns: s.turns + (chunk.charsIn || chunk.charsOut ? 1 : 0),
          charsIn: s.charsIn + (chunk.charsIn ?? 0),
          charsOut,
          tokensIn,
          tokensOut,
          costUsd: cost,
        };
      });
    },
    [COST.claudeInputPerTok, COST.claudeOutputPerTok, COST.elevenlabsPerChar],
  );

  /** Auto-finaliza turno após silêncio (chamado quando há atividade de voz). */
  const armSilenceTimer = useCallback(() => {
    if (!continuousRef.current) return;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      // Vamos disparar a finalização do turno através do mic stop manual
      // (definido logo abaixo via ref pra evitar dependência circular)
      autoEndTurnRef.current?.();
    }, SILENCE_TIMEOUT_MS);
  }, []);

  const autoEndTurnRef = useRef<(() => void) | null>(null);

  const { supported, start, stop, error } = useSpeechRecognition({
    lang: "pt-BR",
    onInterim: (t) => {
      setInterim(t);
      // Antes armava o timer em interim, mas isso fechava o turno cedo demais
      // durante pausas curtas. Agora só onFinal arma o VAD.
    },
    onFinal: (t) => {
      finalBufferRef.current = `${finalBufferRef.current} ${t}`.trim();
      setFinalText(finalBufferRef.current);
      setInterim("");
      armSilenceTimer();
    },
  });

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  /** Fallback browser TTS quando ElevenLabs não tá disponível.
   *  Em modo dinâmico, também reabre o mic ao terminar de falar. */
  const speakBrowser = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setVoiceState("idle");
        return;
      }
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text.slice(0, 2000));
      utter.lang = "pt-BR";
      utter.rate = 1;
      utter.pitch = 1;
      utter.onstart = () => setVoiceState("speaking");
      const finishAndMaybeReopen = () => {
        if (continuousRef.current && supported) {
          finalBufferRef.current = "";
          setFinalText("");
          setInterim("");
          setVoiceState("listening");
          setTimeout(() => {
            try {
              start();
            } catch (err) {
              console.warn("[voice-mode] browser-tts reopen failed", err);
              setVoiceState("idle");
            }
          }, 250);
        } else {
          setVoiceState("idle");
        }
      };
      utter.onend = finishAndMaybeReopen;
      utter.onerror = finishAndMaybeReopen;
      window.speechSynthesis.speak(utter);
    },
    [start, supported],
  );

  /**
   * Fala via ElevenLabs (voz com entoação) com fallback automático pro browser.
   * Cobra 3 coins via /api/tts. Se 503 (sem API key) ou 502 → browser TTS grátis.
   */
  const speak = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setVoiceState("idle");
        return;
      }
      setVoiceState("speaking");

      // Cancela qualquer playback ativo
      audioRef.current?.pause();
      audioRef.current = null;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }

      try {
        const resp = await fetch("/api/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: trimmed.slice(0, 1500) }),
        });
        if (!resp.ok) {
          if (resp.status === 402) {
            try {
              const j = (await resp.json()) as { upgrade?: string };
              toast.error("Sem coins pra voz premium — usando voz padrão.", {
                action: j.upgrade
                  ? {
                      label: "Comprar",
                      onClick: () => {
                        window.location.href = j.upgrade!;
                      },
                    }
                  : undefined,
              });
            } catch {
              /* ignore */
            }
          } else if (resp.status === 503) {
            toast.info(
              "ElevenLabs offline — usando voz padrão do navegador.",
              { duration: 3000 },
            );
          } else if (resp.status === 502) {
            toast.warning(
              "Voz premium falhou (sem créditos ou rede). Usando voz padrão.",
              { duration: 3000 },
            );
          }
          speakBrowser(trimmed);
          return;
        }
        const json = (await resp.json()) as {
          audioUrl?: string;
          cached?: boolean;
        };
        if (!json.audioUrl) {
          speakBrowser(trimmed);
          return;
        }
        // Tracking: chars enviados pro TTS = custo ElevenLabs
        addUsage({ charsOut: trimmed.length });
        const audio = new Audio(json.audioUrl);
        audioRef.current = audio;
        audio.onended = () => {
          audioRef.current = null;
          // Modo contínuo: reabre mic automaticamente após IA terminar.
          // Delay de 250ms pra evitar race entre abort() do recognizer antigo
          // e start() do novo (Chrome reclama "recognition already started").
          if (continuousRef.current && supported) {
            finalBufferRef.current = "";
            setFinalText("");
            setInterim("");
            setVoiceState("listening");
            setTimeout(() => {
              try {
                start();
              } catch (err) {
                console.warn("[voice-mode] auto-restart failed", err);
                setVoiceState("idle");
              }
            }, 250);
          } else {
            setVoiceState("idle");
          }
        };
        audio.onerror = () => {
          console.warn("[voice-mode] audio element error", audio.error);
          audioRef.current = null;
          speakBrowser(trimmed);
        };
        try {
          await audio.play();
        } catch (playErr) {
          // Chrome autoplay policy / interação bloqueada → cai pro browser TTS
          console.warn("[voice-mode] audio.play blocked, fallback", playErr);
          audioRef.current = null;
          speakBrowser(trimmed);
        }
      } catch (err) {
        console.warn("[voice-mode] tts failed, fallback browser", err);
        speakBrowser(trimmed);
      }
    },
    [speakBrowser, addUsage, start, supported],
  );

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
        const data = (await res.json()) as {
          reply: string;
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        const reply = stripChatFormatting(data.reply) || "(Sem resposta)";
        // Tracking Claude: tokens reais se vier no response, ou estima por chars
        const inTok =
          data.usage?.input_tokens ?? Math.ceil(trimmed.length / 4);
        const outTok =
          data.usage?.output_tokens ?? Math.ceil(reply.length / 4);
        addUsage({ charsIn: trimmed.length, tokensIn: inTok, tokensOut: outTok });
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

  /** Finaliza o turno atual: para o mic, envia o texto acumulado pra IA.
   *  - `isManual=true` (clique no botão "Parar"): sempre cai em idle se sem texto.
   *  - `isManual=false` (VAD silêncio): em modo dinâmico, reabre mic pra
   *    próximo turno em vez de pedir clique. */
  const endTurn = useCallback(
    (isManual = false) => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      stop();
      const buffered = finalBufferRef.current.trim();
      const pending = interim.trim();
      const combined = `${buffered} ${pending}`.trim();
      finalBufferRef.current = "";
      setFinalText("");
      setInterim("");
      if (combined.length >= 3) {
        void sendToAi(combined);
        return;
      }
      // Sem texto significativo
      if (!isManual && continuousRef.current && supported) {
        // VAD detectou silêncio → reabre mic pra esperar fala
        setVoiceState("listening");
        setTimeout(() => {
          try {
            start();
          } catch (err) {
            console.warn("[voice-mode] reopen-after-silence failed", err);
            setVoiceState("idle");
          }
        }, 200);
      } else {
        // Clique manual ou modo manual → encerra de vez
        setVoiceState("idle");
      }
    },
    [interim, sendToAi, stop, start, supported],
  );

  // Expose pra o silence timer
  useEffect(() => {
    autoEndTurnRef.current = endTurn;
  }, [endTurn]);

  const handleMicClick = useCallback(() => {
    if (voiceState === "thinking") return;

    // Tocando: interrupção do usuário → para áudio, reabre mic imediatamente
    if (voiceState === "speaking") {
      audioRef.current?.pause();
      audioRef.current = null;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (continuousRef.current && supported) {
        finalBufferRef.current = "";
        setFinalText("");
        setInterim("");
        setVoiceState("listening");
        start();
      } else {
        setVoiceState("idle");
      }
      return;
    }

    // Ouvindo: clique = finaliza turno manualmente.
    // isManual=true → se não tem texto, sai pra idle (não reabre o mic).
    if (voiceState === "listening") {
      endTurn(true);
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
  }, [endTurn, start, supported, voiceState]);

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setVoiceState("idle");
  }, []);

  const statusLabel = useMemo(() => {
    if (voiceState === "listening") return "Pode falar...";
    if (voiceState === "thinking") return "Pensando...";
    if (voiceState === "speaking") return "Falando";
    return continuousMode ? "Toque pra começar" : "Toque pra falar";
  }, [voiceState, continuousMode]);

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

      {/* Painel de stats da sessão — canto superior direito */}
      <div className="absolute right-2 top-2 z-10 flex flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={() => setContinuousMode((v) => !v)}
          title={
            continuousMode
              ? "Modo dinâmico ativo — mic reabre automaticamente"
              : "Modo manual — pressione mic a cada turno"
          }
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors backdrop-blur",
            continuousMode
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border/60 bg-card/80 text-muted-foreground hover:text-foreground",
          )}
        >
          <Zap className="h-3 w-3" />
          {continuousMode ? "Dinâmico" : "Manual"}
        </button>
        <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur px-3 py-2 text-[10px] font-mono tabular-nums text-muted-foreground shadow-sm">
          <div className="flex items-center gap-1.5 mb-0.5 text-foreground">
            <DollarSign className="h-3 w-3 text-emerald-500" />
            <span className="font-semibold">
              ${sessionStats.costUsd.toFixed(4)}
            </span>
            <span className="text-muted-foreground/70">
              ≈ R${(sessionStats.costUsd * 5).toFixed(2)}
            </span>
          </div>
          <div>turnos: {sessionStats.turns}</div>
          <div>chars in/out: {sessionStats.charsIn}/{sessionStats.charsOut}</div>
          <div>
            tokens: {sessionStats.tokensIn}↑ {sessionStats.tokensOut}↓
          </div>
        </div>
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

        {/* Chat removido da UI do voice mode — só áudio + transcrição do turno atual.
            Pra ver histórico, voltar pro chat. */}
        {voiceState === "speaking" && (
          <button
            type="button"
            onClick={stopSpeaking}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <Volume2 className="h-3 w-3" />
            Parar Lumi
          </button>
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
