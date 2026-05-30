"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  RefreshCcw,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { confirmAction } from "@/components/ui/confirm-dialog";

type TicketRow = {
  id: string;
  user_id: string | null;
  user_email: string;
  user_name: string | null;
  subject: string;
  category: string;
  message: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "normal" | "high";
  admin_reply: string | null;
  replied_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_TABS: Array<{ value: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: "open", label: "Abertos", icon: Circle },
  { value: "in_progress", label: "Em andamento", icon: Clock },
  { value: "resolved", label: "Resolvidos", icon: CheckCircle2 },
  { value: "all", label: "Todos", icon: AlertCircle },
];

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<string>("open");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<TicketRow | null>(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusTab !== "all") params.set("status", statusTab);
      if (search.trim()) params.set("q", search.trim());
      params.set("limit", "200");
      const res = await fetch(`/api/support/tickets?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as
        | { tickets: TicketRow[] }
        | { error: string };
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Falha.");
      }
      setTickets(data.tickets);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, [statusTab, search]);

  useEffect(() => {
    const t = setTimeout(fetchTickets, 250);
    return () => clearTimeout(t);
  }, [fetchTickets]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { open: 0, in_progress: 0, resolved: 0 };
    for (const t of tickets) {
      if (c[t.status] !== undefined) c[t.status] += 1;
    }
    return c;
  }, [tickets]);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Inbox de suporte · {tickets.length} resultado
            {tickets.length === 1 ? "" : "s"}
          </p>
        </div>
        <button
          onClick={fetchTickets}
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 px-3 py-1.5 text-xs font-mono text-neutral-300"
        >
          <RefreshCcw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Tabs + search */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex gap-1 rounded-md border border-neutral-800 bg-neutral-900/40 p-1">
          {STATUS_TABS.map((tab) => {
            const active = statusTab === tab.value;
            const count = tab.value !== "all" ? counts[tab.value] : undefined;
            return (
              <button
                key={tab.value}
                onClick={() => setStatusTab(tab.value)}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-mono transition-colors ${
                  active
                    ? "bg-neutral-800 text-neutral-100"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
                }`}
              >
                <tab.icon className="h-3 w-3" />
                {tab.label}
                {count !== undefined && (
                  <span className="ml-1 text-[9px] text-neutral-500">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="relative flex-1 max-w-md md:ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tickets…"
            className="w-full h-9 pl-9 pr-3 rounded-md bg-neutral-900 border border-neutral-800 text-sm placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600"
          />
        </div>
      </div>

      {/* List */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 overflow-hidden">
        {loading && tickets.length === 0 ? (
          <div className="py-12 text-center">
            <Loader2 className="h-5 w-5 animate-spin mx-auto text-neutral-500" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="py-12 text-center text-xs text-neutral-500">
            Nenhum ticket por aqui.
          </div>
        ) : (
          <div className="divide-y divide-neutral-800">
            {tickets.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-900/60 text-left transition-colors"
              >
                <StatusDot status={t.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{t.subject}</p>
                    <CategoryTag category={t.category} />
                    {t.priority === "high" && <PriorityTag />}
                  </div>
                  <p className="text-[11px] font-mono text-neutral-500 truncate">
                    {t.user_name ? `${t.user_name} · ` : ""}
                    {t.user_email}
                  </p>
                </div>
                <span className="text-[10px] font-mono text-neutral-500 shrink-0">
                  {new Date(t.created_at).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <TicketDetailDrawer
          ticket={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            fetchTickets();
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    open: "bg-amber-500",
    in_progress: "bg-sky-500",
    resolved: "bg-emerald-500",
    closed: "bg-neutral-600",
  };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full shrink-0 ${
        colorMap[status] ?? "bg-neutral-600"
      }`}
    />
  );
}

function CategoryTag({ category }: { category: string }) {
  const map: Record<string, string> = {
    bug: "bg-red-950/60 text-red-400",
    duvida: "bg-sky-950/60 text-sky-400",
    sugestao: "bg-indigo-950/60 text-indigo-300",
    cobranca: "bg-amber-950/60 text-amber-300",
    outro: "bg-neutral-800 text-neutral-400",
  };
  return (
    <span
      className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${
        map[category] ?? "bg-neutral-800 text-neutral-400"
      }`}
    >
      {category}
    </span>
  );
}

function PriorityTag() {
  return (
    <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-900/60 text-red-300">
      Alta
    </span>
  );
}

function TicketDetailDrawer({
  ticket,
  onClose,
  onChanged,
}: {
  ticket: TicketRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [reply, setReply] = useState<string>(ticket.admin_reply ?? "");
  const [pending, setPending] = useState<string | null>(null);

  async function update(body: Record<string, unknown>) {
    const action = body.reply ? "reply" : "update";
    setPending(action);
    try {
      const res = await fetch(`/api/support/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Falha.");
      toast.success(action === "reply" ? "Resposta enviada." : "Atualizado.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setPending(null);
    }
  }

  async function doDelete() {
    const ok = await confirmAction({
      title: "Excluir esse ticket?",
      destructive: true,
      confirmText: "Excluir",
    });
    if (!ok) return;
    setPending("delete");
    try {
      const res = await fetch(`/api/support/tickets/${ticket.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Falha.");
      toast.success("Ticket excluído.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        aria-label="Fechar"
        onClick={onClose}
        className="flex-1 bg-black/70 backdrop-blur-sm"
      />
      <div className="w-full max-w-xl bg-neutral-950 border-l border-neutral-800 overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold truncate">
                {ticket.subject}
              </h2>
              <CategoryTag category={ticket.category} />
            </div>
            <p className="text-[10px] font-mono text-neutral-500 truncate">
              #{ticket.id.slice(0, 8)} · {ticket.user_email}
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Quick controls */}
          <div className="flex flex-wrap gap-2">
            <select
              value={ticket.status}
              onChange={(e) => update({ status: e.target.value })}
              disabled={pending !== null}
              className="h-8 rounded-md bg-neutral-900 border border-neutral-800 text-xs font-mono px-2 text-neutral-300"
            >
              <option value="open">Aberto</option>
              <option value="in_progress">Em andamento</option>
              <option value="resolved">Resolvido</option>
              <option value="closed">Fechado</option>
            </select>
            <select
              value={ticket.priority}
              onChange={(e) => update({ priority: e.target.value })}
              disabled={pending !== null}
              className="h-8 rounded-md bg-neutral-900 border border-neutral-800 text-xs font-mono px-2 text-neutral-300"
            >
              <option value="low">Prioridade: baixa</option>
              <option value="normal">Prioridade: normal</option>
              <option value="high">Prioridade: alta</option>
            </select>
            <button
              onClick={doDelete}
              disabled={pending !== null}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-red-900/60 bg-red-950/40 hover:bg-red-950 text-red-300 text-xs font-mono px-2.5 py-1.5"
            >
              <Trash2 className="h-3 w-3" />
              Excluir
            </button>
          </div>

          {/* Meta */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 text-xs">
            <p className="text-neutral-500 font-mono mb-1">
              {ticket.user_name ?? "—"} · {ticket.user_email}
            </p>
            <p className="text-neutral-500 font-mono">
              Criado em{" "}
              {new Date(ticket.created_at).toLocaleString("pt-BR")}
            </p>
            {ticket.replied_at && (
              <p className="text-emerald-400/80 font-mono mt-1">
                Respondido em{" "}
                {new Date(ticket.replied_at).toLocaleString("pt-BR")}
              </p>
            )}
          </div>

          {/* Message */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
            <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono mb-2">
              Mensagem do usuário
            </p>
            <p className="text-sm whitespace-pre-wrap text-neutral-200 leading-relaxed">
              {ticket.message}
            </p>
          </div>

          {/* Reply */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
            <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono mb-2">
              Resposta
            </p>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={6}
              placeholder="Escreva uma resposta… (será enviada por email pro usuário)"
              className="w-full min-h-[120px] rounded-md bg-neutral-950 border border-neutral-800 px-3 py-2 text-sm resize-y focus:outline-none focus:border-neutral-600"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-neutral-500 font-mono">
                {reply.length} caracteres
              </span>
              <button
                onClick={() => update({ reply: reply.trim() })}
                disabled={pending !== null || reply.trim().length < 1}
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-mono px-3 py-1.5 disabled:opacity-40"
              >
                {pending === "reply" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
                Enviar resposta
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
