"use client";

import { useState } from "react";
import {
  Check,
  CheckCheck,
  Copy,
  ExternalLink,
  FileText,
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
import type { LumiChatMessage } from "@/lib/lumi-chats";

type Props = {
  message: LumiChatMessage;
};

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

export function LumiMessageBubble({ message }: Props) {
  const [thumbed, setThumbed] = useState<"up" | "down" | null>(null);
  const [copied, setCopied] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%]">
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
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 shadow-sm">
        <Sparkles className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold text-muted-foreground">
          Lumi
        </div>
        <div className="prose prose-sm dark:prose-invert mt-1 max-w-none leading-relaxed prose-p:my-2 prose-strong:text-foreground prose-ul:my-2 prose-li:my-0.5 prose-headings:mt-3 prose-headings:mb-1">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>

        {message.attachment && AttachmentIcon && (
          <div className="mt-3 inline-flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <AttachmentIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {ATTACHMENT_LABEL[message.attachment.kind]}
              </div>
              <div className="text-sm font-semibold text-foreground">
                {message.attachment.title}
              </div>
              {message.attachment.preview && (
                <div className="text-[11px] text-muted-foreground">
                  {message.attachment.preview}
                </div>
              )}
            </div>
            {message.attachment.href && (
              <Link
                href={message.attachment.href}
                className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/15"
              >
                Abrir
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        )}

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
      </div>
    </div>
  );
}
