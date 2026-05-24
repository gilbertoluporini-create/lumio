"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Loader2,
  Mail,
  Plus,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserPlus,
  X,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

type Lead = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  source: string;
  status: string;
  score: number;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type ListPayload = {
  leads: Lead[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  kpis: {
    total: number;
    this_week: number;
    last_week: number;
    delta_pct: number;
    converted_rate_pct: number;
    avg_score: number;
  };
};

const STATUS_OPTIONS = [
  { value: "all", label: "Todos status" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
];

const SOURCE_OPTIONS = [
  { value: "all", label: "Todas origens" },
  { value: "form-landing", label: "form-landing" },
  { value: "mailto-suporte", label: "mailto-suporte" },
  { value: "waitlist", label: "waitlist" },
  { value: "manual", label: "manual" },
  { value: "unknown", label: "unknown" },
];

export default function AdminLeadsPage() {
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showNewModal, setShowNewModal] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (search.trim()) params.set("q", search.trim());
      params.set("page", String(page));
      params.set("pageSize", "50");

      const res = await fetch(`/api/admin/leads?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as ListPayload;
      setData(json);
      setSelected(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar leads");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sourceFilter, search, page]);

  useEffect(() => {
    const t = setTimeout(fetchLeads, 250);
    return () => clearTimeout(t);
  }, [fetchLeads]);

  const kpis = data?.kpis;
  const leads = useMemo(() => data?.leads ?? [], [data]);
  const totalPages = data?.total_pages ?? 1;

  function exportCsv() {
    const rows = leads;
    const header = ["id", "name", "email", "phone", "source", "status", "score", "created_at"];
    const csv = [
      header.join(","),
      ...rows.map((r) =>
        [
          r.id,
          csvCell(r.name ?? ""),
          csvCell(r.email),
          csvCell(r.phone ?? ""),
          csvCell(r.source),
          csvCell(r.status),
          String(r.score),
          r.created_at,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lumio-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function patchLead(id: string, body: Record<string, unknown>, msg: string) {
    setPending(id);
    try {
      const res = await fetch(`/api/admin/leads/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Falha");
      toast.success(msg);
      fetchLeads();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setPending(null);
    }
  }

  async function deleteLead(id: string) {
    if (!confirm("Excluir esse lead?")) return;
    setPending(id);
    try {
      const res = await fetch(`/api/admin/leads/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Falha");
      toast.success("Lead excluído");
      fetchLeads();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setPending(null);
    }
  }

  const allSelected = useMemo(
    () => leads.length > 0 && leads.every((l) => selected.has(l.id)),
    [leads, selected],
  );

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Central de leads</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Pessoas interessadas no Lumio que ainda não converteram
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={leads.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 px-3 py-1.5 text-xs font-mono text-neutral-200 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1.5 text-xs font-mono"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo lead manual
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Kpi
          label="Total leads"
          value={kpis ? kpis.total.toLocaleString("pt-BR") : "—"}
        />
        <Kpi
          label="Esta semana"
          value={kpis ? kpis.this_week.toLocaleString("pt-BR") : "—"}
          sub={
            kpis
              ? `${kpis.delta_pct >= 0 ? "+" : ""}${kpis.delta_pct.toFixed(1)}% vs semana passada`
              : undefined
          }
          deltaPositive={kpis ? kpis.delta_pct >= 0 : undefined}
        />
        <Kpi
          label="Taxa de conversão"
          value={kpis ? `${kpis.converted_rate_pct.toFixed(1)}%` : "—"}
          sub="leads → user pago"
        />
        <Kpi
          label="Lead score médio"
          value={kpis ? kpis.avg_score.toFixed(0) : "—"}
          sub="escala 0-100"
        />
      </div>

      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por email ou nome…"
            className="w-full h-9 pl-9 pr-3 rounded-md bg-neutral-900 border border-neutral-800 text-sm placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md bg-neutral-900 border border-neutral-800 text-xs font-mono px-2 text-neutral-300"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => {
            setSourceFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md bg-neutral-900 border border-neutral-800 text-xs font-mono px-2 text-neutral-300"
        >
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between">
          <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-300">
            Leads · página {data?.page ?? 1} de {totalPages}
          </h2>
          <span className="text-[10px] font-mono text-neutral-500">
            {data?.total ?? 0} total
            {selected.size > 0 ? ` · ${selected.size} selecionados` : ""}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/80 text-[10px] uppercase tracking-wider text-neutral-500 font-mono">
              <tr>
                <th className="px-3 py-2 text-left w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => {
                      const next = new Set<string>();
                      if (e.target.checked) leads.forEach((l) => next.add(l.id));
                      setSelected(next);
                    }}
                    className="accent-indigo-500"
                  />
                </th>
                <th className="px-3 py-2 text-left font-medium">Nome</th>
                <th className="px-3 py-2 text-left font-medium">Email</th>
                <th className="px-3 py-2 text-left font-medium">Origem</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Score</th>
                <th className="px-3 py-2 text-left font-medium">Criado em</th>
                <th className="px-3 py-2 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {loading && leads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-neutral-500" />
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-xs text-neutral-500">
                    Nenhum lead por aqui.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-neutral-900/60">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(lead.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(lead.id);
                          else next.delete(lead.id);
                          setSelected(next);
                        }}
                        className="accent-indigo-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs">{lead.name ?? "—"}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs font-mono text-neutral-300">
                        {lead.email}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <SourceBadge source={lead.source} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={lead.status} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-xs font-mono tabular-nums">{lead.score}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] font-mono text-neutral-500">
                        {new Date(lead.created_at).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                        })}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() =>
                            patchLead(
                              lead.id,
                              { invite_to_beta: true },
                              "Convite enviado",
                            )
                          }
                          disabled={pending === lead.id}
                          title="Convidar para beta"
                          className="inline-flex h-7 w-7 items-center justify-center rounded text-neutral-400 hover:text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-40"
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() =>
                            patchLead(
                              lead.id,
                              { status: "qualified" },
                              "Marcado como qualificado",
                            )
                          }
                          disabled={pending === lead.id}
                          title="Marcar como qualificado"
                          className="inline-flex h-7 w-7 items-center justify-center rounded text-neutral-400 hover:text-indigo-300 hover:bg-indigo-950/40 disabled:opacity-40"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => deleteLead(lead.id)}
                          disabled={pending === lead.id}
                          title="Excluir"
                          className="inline-flex h-7 w-7 items-center justify-center rounded text-neutral-400 hover:text-red-300 hover:bg-red-950/40 disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-neutral-800 text-xs font-mono text-neutral-400">
            <span>
              Página {data?.page ?? 1} de {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={(data?.page ?? 1) <= 1}
                className="px-2 py-1 rounded border border-neutral-800 hover:bg-neutral-800 disabled:opacity-40"
              >
                ← Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={(data?.page ?? 1) >= totalPages}
                className="px-2 py-1 rounded border border-neutral-800 hover:bg-neutral-800 disabled:opacity-40"
              >
                Próxima →
              </button>
            </div>
          </div>
        )}
      </div>

      {showNewModal && (
        <NewLeadModal
          onClose={() => setShowNewModal(false)}
          onCreated={() => {
            setShowNewModal(false);
            fetchLeads();
          }}
        />
      )}
    </div>
  );
}

function NewLeadModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("manual");
  const [score, setScore] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          email: email.trim(),
          phone: phone.trim() || null,
          source,
          status: "new",
          score,
          notes: notes.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Falha");
      toast.success("Lead criado");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <form
        onSubmit={submit}
        className="relative w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-950 p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Novo lead manual</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 inline-flex items-center justify-center rounded text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <Field label="Email *">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-9 rounded-md bg-neutral-900 border border-neutral-800 px-3 text-sm focus:outline-none focus:border-neutral-600"
            />
          </Field>
          <Field label="Nome">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 rounded-md bg-neutral-900 border border-neutral-800 px-3 text-sm focus:outline-none focus:border-neutral-600"
            />
          </Field>
          <Field label="Telefone">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full h-9 rounded-md bg-neutral-900 border border-neutral-800 px-3 text-sm focus:outline-none focus:border-neutral-600"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Origem">
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full h-9 rounded-md bg-neutral-900 border border-neutral-800 px-2 text-xs font-mono focus:outline-none focus:border-neutral-600"
              >
                {SOURCE_OPTIONS.filter((o) => o.value !== "all").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Score (0-100)">
              <input
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(e) => setScore(Number(e.target.value))}
                className="w-full h-9 rounded-md bg-neutral-900 border border-neutral-800 px-3 text-sm font-mono focus:outline-none focus:border-neutral-600"
              />
            </Field>
          </div>
          <Field label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm focus:outline-none focus:border-neutral-600"
            />
          </Field>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 px-3 py-1.5 text-xs font-mono text-neutral-300"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !email.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1.5 text-xs font-mono disabled:opacity-40"
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <UserPlus className="h-3 w-3" />
            )}
            Criar lead
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-1 block">
        {label}
      </span>
      {children}
    </label>
  );
}

function Kpi({
  label,
  value,
  sub,
  deltaPositive,
}: {
  label: string;
  value: string;
  sub?: string;
  deltaPositive?: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono mb-2">
        {label}
      </p>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && (
        <p
          className={`text-[10px] mt-1 font-mono truncate flex items-center gap-1 ${
            deltaPositive === undefined
              ? "text-neutral-500"
              : deltaPositive
                ? "text-emerald-400"
                : "text-red-400"
          }`}
        >
          {deltaPositive !== undefined &&
            (deltaPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            ))}
          {sub}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: "bg-sky-950/60 text-sky-300",
    contacted: "bg-indigo-950/60 text-indigo-300",
    qualified: "bg-violet-950/60 text-violet-300",
    converted: "bg-emerald-950/60 text-emerald-300",
    lost: "bg-neutral-800 text-neutral-500",
  };
  return (
    <span
      className={`inline-block text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full ${
        map[status] ?? "bg-neutral-800 text-neutral-400"
      }`}
    >
      {status}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, string> = {
    "form-landing": "bg-emerald-950/40 text-emerald-300",
    "mailto-suporte": "bg-amber-950/40 text-amber-300",
    waitlist: "bg-sky-950/40 text-sky-300",
    manual: "bg-indigo-950/40 text-indigo-300",
    unknown: "bg-neutral-800 text-neutral-500",
  };
  return (
    <span
      className={`inline-block text-[9px] font-mono px-2 py-0.5 rounded ${
        map[source] ?? "bg-neutral-800 text-neutral-400"
      }`}
    >
      {source}
    </span>
  );
}

function csvCell(v: string): string {
  if (/[,"\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
