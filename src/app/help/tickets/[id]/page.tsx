"use client";

/**
 * /help/tickets/[id] — visão do user do ticket dele, com:
 *  - mensagem original (a pergunta do user)
 *  - resposta do admin (quando houver)
 *  - 2 ações grandes: "Resolveu meu problema" / "Não resolveu"
 *  - Se "Não resolveu": textarea pra explicar antes de reabrir
 *
 * Quando o user já reagiu (user_resolved !== null) mostra status final.
 * Sem thread infinita — single round-trip user→admin→user→admin.
 */

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MessageCircle,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { LumiCharacter } from "@/components/brand/lumi";
import { formatRelativeTime } from "@/lib/utils";
import type { User } from "@/lib/types";

type Ticket = {
  id: string;
  subject: string;
  category: string | null;
  message: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "normal" | "high";
  admin_reply: string | null;
  replied_at: string | null;
  resolved_at: string | null;
  user_followup_message: string | null;
  user_followup_at: string | null;
  user_resolved: boolean | null;
  created_at: string;
  updated_at: string;
};

export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <TicketDetailView user={user} ticketId={id} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function TicketDetailView({
  user: _user,
  ticketId,
}: {
  user: User;
  ticketId: string;
}) {
  const router = useRouter();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFollowup, setShowFollowup] = useState(false);
  const [followupText, setFollowupText] = useState("");
  const [sending, setSending] = useState<"resolved" | "unresolved" | null>(null);

  const fetchTicket = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        if (res.status === 404) {
          toast.error("Ticket não encontrado.");
          router.push("/help");
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as { ticket: Ticket };
      setTicket(json.ticket);
    } catch (err) {
      console.error("[ticket-view] fetch failed", err);
      toast.error("Não foi possível carregar o ticket.");
    } finally {
      setLoading(false);
    }
  }, [ticketId, router]);

  useEffect(() => {
    void fetchTicket();
  }, [fetchTicket]);

  const handleAction = async (resolved: boolean, message?: string) => {
    setSending(resolved ? "resolved" : "unresolved");
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/user-reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolved, message }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      toast.success(
        resolved
          ? "Marcado como resolvido. Valeu pelo retorno!"
          : "Ticket reaberto. O suporte vai olhar de novo.",
      );
      await fetchTicket();
      setShowFollowup(false);
      setFollowupText("");
    } catch (err) {
      toast.error(`Falha: ${(err as Error).message}`);
    } finally {
      setSending(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ticket) return null;

  const userResponded = ticket.user_resolved !== null;
  const isResolved = ticket.status === "resolved";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
      {/* Header */}
      <div className="mb-6 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/help")}
          className="gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>

      <div className="mb-6">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold leading-tight">
            {ticket.subject}
          </h1>
          <StatusBadge status={ticket.status} />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Aberto {formatRelativeTime(ticket.created_at)}
          {ticket.category && ` · categoria: ${ticket.category}`}
        </p>
      </div>

      {/* Thread */}
      <div className="space-y-4">
        {/* Mensagem original do user */}
        <MessageCard
          author="Você"
          authorRole="user"
          message={ticket.message}
          time={ticket.created_at}
        />

        {/* Resposta admin */}
        {ticket.admin_reply ? (
          <MessageCard
            author="Suporte Lumio"
            authorRole="admin"
            message={ticket.admin_reply}
            time={ticket.replied_at ?? ticket.updated_at}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-border/60 p-5 text-sm text-muted-foreground flex items-center gap-3">
            <LumiCharacter mood="thinking" size="md" />
            <div>
              O suporte ainda não respondeu. Você vai receber uma notificação
              quando a resposta chegar.
            </div>
          </div>
        )}

        {/* Follow-up do user (se já reagiu) */}
        {userResponded && (
          <MessageCard
            author="Você"
            authorRole="user"
            message={
              ticket.user_followup_message ??
              (ticket.user_resolved
                ? "Marquei como resolvido."
                : "Marquei como não resolvido.")
            }
            time={ticket.user_followup_at ?? ticket.updated_at}
            status={
              ticket.user_resolved ? "Resolvido pelo user" : "Reaberto pelo user"
            }
          />
        )}
      </div>

      {/* CTA: 2 botões grandes "Resolveu / Não resolveu" — só se admin respondeu
          E user ainda não reagiu */}
      {ticket.admin_reply && !userResponded && (
        <div className="mt-8 rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">
              A resposta do suporte resolveu seu problema?
            </div>
          </div>

          {!showFollowup ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={() => handleAction(true)}
                disabled={sending !== null}
                className="flex-1 gap-2"
              >
                {sending === "resolved" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ThumbsUp className="h-4 w-4" />
                )}
                Sim, resolveu
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowFollowup(true)}
                disabled={sending !== null}
                className="flex-1 gap-2"
              >
                <ThumbsDown className="h-4 w-4" />
                Não resolveu
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Conta o que ainda não funcionou — o suporte vai olhar de novo.
              </p>
              <textarea
                value={followupText}
                onChange={(e) => setFollowupText(e.target.value)}
                placeholder="O que ainda não funcionou? Quais passos você tentou?"
                rows={4}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                maxLength={2000}
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowFollowup(false);
                    setFollowupText("");
                  }}
                  disabled={sending !== null}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleAction(false, followupText.trim() || undefined)}
                  disabled={sending !== null}
                  className="gap-1.5"
                >
                  {sending === "unresolved" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ThumbsDown className="h-4 w-4" />
                  )}
                  Reabrir ticket
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {userResponded && (
        <div className="mt-8 rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground flex items-center gap-2">
          {isResolved ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Ticket resolvido. Obrigado pelo retorno!
            </>
          ) : (
            <>
              <MessageCircle className="h-4 w-4 text-amber-600" />
              Ticket reaberto. O suporte foi avisado e vai responder em breve.
            </>
          )}
          <Link
            href="/help"
            className="ml-auto text-primary text-xs font-medium hover:underline"
          >
            Voltar pra Central de Ajuda
          </Link>
        </div>
      )}
    </div>
  );
}

function MessageCard({
  author,
  authorRole,
  message,
  time,
  status,
}: {
  author: string;
  authorRole: "user" | "admin";
  message: string;
  time: string;
  status?: string;
}) {
  return (
    <div
      className={
        authorRole === "admin"
          ? "rounded-2xl border border-primary/20 bg-primary/5 p-5"
          : "rounded-2xl border border-border/60 bg-card p-5"
      }
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="text-xs font-semibold">{author}</div>
        <div className="text-[10px] text-muted-foreground">
          {formatRelativeTime(time)}
          {status && ` · ${status}`}
        </div>
      </div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed">
        {message}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Ticket["status"] }) {
  const labels: Record<Ticket["status"], string> = {
    open: "Aberto",
    in_progress: "Em andamento",
    resolved: "Resolvido",
    closed: "Fechado",
  };
  const colors: Record<Ticket["status"], string> = {
    open: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
    in_progress:
      "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
    resolved:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    closed:
      "bg-muted text-muted-foreground border-border/60",
  };
  return (
    <span
      className={`text-[11px] px-2 py-0.5 rounded-full border ${colors[status]}`}
    >
      {labels[status]}
    </span>
  );
}
