"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Bot, Loader2, MessageSquare, Send, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LumiCharacter } from "@/components/brand/lumi";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";

export function ChatColumn({
  messages,
  streamingReply,
  suggestions,
  input,
  onInputChange,
  onSend,
  sending,
}: {
  messages: ChatMessage[];
  streamingReply: string;
  suggestions: string[];
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(0);
  const stickyToBottomRef = useRef(true);

  // Tracka se user scrollou pra cima manualmente — se sim, paramos de
  // auto-scrollar enquanto a IA streama (evita "pular pra baixo" no meio
  // da leitura). Volta a auto-scrollar quando user envia mensagem nova.
  useEffect(() => {
    const box = scrollRef.current;
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

  // Quando uma mensagem NOVA do user é adicionada, força sticky=true
  // pra garantir que o auto-scroll volte a seguir a resposta.
  useEffect(() => {
    if (messages.length > lastMessageCountRef.current) {
      stickyToBottomRef.current = true;
    }
    lastMessageCountRef.current = messages.length;
  }, [messages.length]);

  // useLayoutEffect + rAF pra rodar após o paint (scrollHeight atualizado
  // com o conteúdo novo já renderizado). Caso contrário, durante streaming
  // o scrollHeight ainda é o anterior e o auto-scroll fica "atrasado".
  useLayoutEffect(() => {
    if (!stickyToBottomRef.current) return;
    const box = scrollRef.current;
    if (!box) return;
    const raf = requestAnimationFrame(() => {
      box.scrollTop = box.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, streamingReply]);

  return (
    <div className="flex flex-col rounded-2xl border border-border/60 bg-card overflow-hidden h-[560px] lg:h-[720px]">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Chat com a aula</span>
        </div>
        <Badge variant="outline" className="gap-1 text-[10px]">
          <Bot className="h-2.5 w-2.5 text-primary" /> Claude
        </Badge>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
        {messages.length === 0 && !streamingReply ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-6">
            <div className="mb-2">
              <LumiCharacter mood="thinking" size="md" float />
            </div>
            <p className="text-sm font-semibold">Olá! Sou o Lumi</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-[260px]">
              Pergunte sobre esta aula e receba respostas com base na transcrição e nos slides.
            </p>
            <div className="mt-5 flex flex-col gap-1.5 w-full max-w-xs">
              {suggestions.map((p) => (
                <button
                  key={p}
                  onClick={() => onInputChange(p)}
                  className="text-left text-xs rounded-lg border border-border/60 bg-background hover:bg-secondary/60 px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>

      <div className="border-t border-border/60 p-3 bg-card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSend();
          }}
          className="flex items-end gap-2"
        >
          <Textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Pergunte sobre a aula..."
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
        <p className="mt-2 text-[10px] text-muted-foreground/70 text-center">
          As respostas podem conter erros. Verifique informações críticas.
        </p>
      </div>
    </div>
  );
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

function ChatBubble({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
  const isUser = message.role === "user";
  const content = isUser ? message.content : cleanAssistantText(message.content);
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
        {content}
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
