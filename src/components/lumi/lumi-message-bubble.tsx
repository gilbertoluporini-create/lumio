"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  Copy,
  FileText,
  Image as ImageIcon,
  Layers,
  Network,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Volume2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LumiToolCard } from "@/components/lumi/lumi-tool-card";
import {
  LumiQuestionCard,
  type QuestionCardOutput,
} from "@/components/lumi/lumi-question-card";
import { ZoomableImage } from "@/components/ui/zoomable-image";
import type { LumiChatMessage } from "@/lib/lumi-chats";

type Props = {
  message: LumiChatMessage;
  /** Quando true, mostra cursor piscando no fim e oculta toolbar (resposta ao vivo) */
  isStreaming?: boolean;
  /** Quando true, anima o conteúdo caractere por caractere ao montar.
   * Usado pra última mensagem assistant recém-criada pelo agente — sem o
   * typewriter durante o stream, a mensagem cairia toda de uma vez e
   * perderia o efeito conversacional. */
  playTypewriter?: boolean;
};

const TYPEWRITER_TICK_MS = 18;
const TYPEWRITER_CHARS_PER_TICK = 3;

function useTypewriter(text: string, enabled: boolean): string {
  const [displayed, setDisplayed] = useState<string>(enabled ? "" : text);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    if (!enabledRef.current) {
      setDisplayed(text);
      return;
    }
    let pos = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      pos = Math.min(pos + TYPEWRITER_CHARS_PER_TICK, text.length);
      setDisplayed(text.slice(0, pos));
      if (pos < text.length) {
        timer = setTimeout(tick, TYPEWRITER_TICK_MS);
      }
    };
    tick();
    return () => {
      if (timer) clearTimeout(timer);
    };
    // Só re-anima quando o ID/texto realmente muda, não em re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return displayed;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

const ATTACHMENT_ICON = {
  summary: FileText,
  flashcards: Layers,
  quiz: Sparkles,
  mindmap: Network,
} as const;

const ATTACHMENT_LABEL = {
  summary: "Resumo gerado",
  flashcards: "Deck de flashcards",
  quiz: "Quiz gerado",
  mindmap: "Mapa mental",
} as const;

const ATTACHMENT_TONE = {
  summary: "from-violet-500/15 to-violet-500/5 text-violet-600 border-violet-500/20",
  flashcards:
    "from-fuchsia-500/15 to-fuchsia-500/5 text-fuchsia-600 border-fuchsia-500/20",
  quiz:
    "from-emerald-500/15 to-emerald-500/5 text-emerald-600 border-emerald-500/20",
  mindmap: "from-sky-500/15 to-sky-500/5 text-sky-600 border-sky-500/20",
} as const;

const ATTACHMENT_CTA = {
  summary: "Abrir resumo",
  flashcards: "Abrir deck",
  quiz: "Abrir quiz",
  mindmap: "Abrir mapa",
} as const;

export function LumiMessageBubble({ message, isStreaming, playTypewriter }: Props) {
  const displayedContent = useTypewriter(
    message.content,
    !!playTypewriter && !isStreaming && message.role === "assistant",
  );
  const [thumbed, setThumbed] = useState<"up" | "down" | null>(null);
  const [copied, setCopied] = useState(false);

  if (message.role === "user") {
    const userAttachments = message.userAttachments ?? [];
    return (
      <div className="flex flex-col items-end">
        <div className="max-w-[80%]">
          {userAttachments.length > 0 && (
            <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
              {userAttachments.map((a, idx) => {
                const isImage = (a.contentType ?? "").startsWith("image/");
                const sizeLabel =
                  typeof a.sizeKb === "number" && a.sizeKb > 0
                    ? a.sizeKb >= 1024
                      ? `${(a.sizeKb / 1024).toFixed(1)} MB`
                      : `${a.sizeKb} KB`
                    : null;
                const Icon = isImage ? ImageIcon : FileText;
                return (
                  <div
                    key={`${a.name}-${idx}`}
                    className="flex max-w-[220px] items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] text-primary"
                    title={a.name}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{a.name}</span>
                    {sizeLabel ? (
                      <span className="shrink-0 opacity-70">· {sizeLabel}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
          <div className="rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
            <p className="whitespace-pre-wrap leading-relaxed">
              {message.content}
            </p>
          </div>
          <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
            <span>{formatTime(message.createdAt)}</span>
            <CheckCheck className="h-3 w-3 text-primary" />
          </div>
        </div>
      </div>
    );
  }

  const AttachmentIcon = message.attachment
    ? ATTACHMENT_ICON[message.attachment.kind]
    : null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  function handleSpeak() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error("Seu navegador não suporta leitura em voz alta");
      return;
    }
    const utter = new SpeechSynthesisUtterance(message.content.slice(0, 1500));
    utter.lang = "pt-BR";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/illustrations/lumi-default.png"
          alt="Lumi"
          className="h-10 w-10 object-contain"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold text-muted-foreground">
          Lumi
        </div>
        <div className="prose prose-sm dark:prose-invert mt-1 max-w-none leading-relaxed prose-p:my-2 prose-strong:text-foreground prose-ul:my-2 prose-li:my-0.5 prose-headings:mt-3 prose-headings:mb-1">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              img: ({ src, alt }) => (
                <ZoomableImage
                  src={typeof src === "string" ? src : ""}
                  alt={alt ?? undefined}
                />
              ),
            }}
          >
            {isStreaming ? `${message.content}▍` : displayedContent}
          </ReactMarkdown>
        </div>

        {(() => {
          const tools = message.tools ?? [];
          if (tools.length === 0) return null;
          return (
            <div className="mt-3 space-y-2">
              {tools.map((t, i) => {
                if (t.name === "perguntar_opcoes" && t.status === "done") {
                  return (
                    <LumiQuestionCard
                      key={i}
                      output={t.output as QuestionCardOutput}
                    />
                  );
                }
                return (
                  <LumiToolCard
                    key={i}
                    name={t.name}
                    status={t.status}
                    output={t.output}
                  />
                );
              })}
            </div>
          );
        })()}

        {message.attachment && AttachmentIcon && (() => {
          const att = message.attachment;
          const tone = ATTACHMENT_TONE[att.kind];
          const cta = ATTACHMENT_CTA[att.kind];
          const cardClass = cn(
            "mt-3 group flex w-full items-center gap-4 rounded-2xl border bg-gradient-to-br p-4 transition-all",
            tone,
            att.href && "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10 cursor-pointer",
          );
          const inner = (
            <>
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-card shadow-sm",
                )}
              >
                <AttachmentIcon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                  {ATTACHMENT_LABEL[att.kind]}
                </div>
                <div className="mt-0.5 truncate text-base font-semibold text-foreground">
                  {att.title}
                </div>
                {att.preview && (
                  <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {att.preview}
                  </div>
                )}
              </div>
              {att.href && (
                <div className="hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-card/80 px-3 py-1.5 text-xs font-semibold shadow-sm transition-transform group-hover:translate-x-0.5">
                  {cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              )}
            </>
          );
          return att.href ? (
            <Link href={att.href} className={cardClass}>
              {inner}
            </Link>
          ) : (
            <div className={cardClass}>{inner}</div>
          );
        })()}

        {!isStreaming && (
        <div className="mt-2 flex items-center gap-1 text-muted-foreground">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] hover:bg-secondary/60 hover:text-foreground"
            title="Copiar resposta"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-600" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {copied ? "Copiado" : "Copiar"}
          </button>
          <button
            type="button"
            onClick={() => setThumbed("up")}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-secondary/60 hover:text-foreground",
              thumbed === "up" && "text-emerald-600",
            )}
            title="Resposta útil"
          >
            <ThumbsUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => setThumbed("down")}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-secondary/60 hover:text-foreground",
              thumbed === "down" && "text-rose-600",
            )}
            title="Resposta ruim"
          >
            <ThumbsDown className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={handleSpeak}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-secondary/60 hover:text-foreground"
            title="Ouvir em voz alta"
          >
            <Volume2 className="h-3 w-3" />
          </button>
          <span className="ml-1 text-[10px]">
            {formatTime(message.createdAt)}
          </span>
        </div>
        )}
      </div>
    </div>
  );
}
