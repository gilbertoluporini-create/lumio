"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  Check,
  Copy,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { PayoutRow } from "@/app/api/admin/ambassadors/payouts/route";

type Totals = {
  count: number;
  pending_count: number;
  paid_count: number;
  pending_brl: number;
  paid_brl: number;
  gross_brl: number;
};

const STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendentes" },
  { value: "paid", label: "Pagos" },
  { value: "cancelled", label: "Cancelados" },
];

export default function PayoutsAdminPage() {
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [totals, setTotals] = useState<Totals>({
    count: 0,
    pending_count: 0,
    paid_count: 0,
    pending_brl: 0,
    paid_brl: 0,
    gross_brl: 0,
  });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [month, setMonth] = useState<string>(currentMonthYM());
  const [confirming, setConfirming] = useState<PayoutRow | null>(null);

  const fetchPayouts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (month) params.set("month", month);
      const r = await fetch(`/api/admin/ambassadors/payouts?${params}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Falha ao carregar.");
      setRows(j.payouts ?? []);
      setTotals(j.totals);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, month]);

  useEffect(() => {
    fetchPayouts();
  }, [fetchPayouts]);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/embaixadores"
            className="inline-flex items-center gap-1 text-xs font-mono text-neutral-500 hover:text-neutral-300 mb-2"
          >
            <ArrowLeft className="h-3 w-3" /> embaixadores
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Banknote className="h-5 w-5 text-emerald-400" />
            Payouts mensais
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Comissões acumuladas por embaixador no mês. Envia PIX manual pelo banco e marca como pago aqui.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchPayouts}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 px-3 py-1.5 text-xs font-mono text-neutral-200 disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <KpiCard
          label="A pagar (PIX pendente)"
          value={`R$ ${totals.pending_brl.toFixed(2)}`}
          subtitle={`${totals.pending_count} ${totals.pending_count === 1 ? "embaixador" : "embaixadores"}`}
          accent="emerald"
        />
        <KpiCard
          label="Já pagos"
          value={`R$ ${totals.paid_brl.toFixed(2)}`}
          subtitle={`${totals.paid_count} concluídos`}
        />
        <KpiCard
          label="Receita gerada (gross)"
          value={`R$ ${totals.gross_brl.toFixed(2)}`}
          subtitle="MRR via embaixadores"
        />
        <KpiCard
          label="Total linhas"
          value={totals.count}
          subtitle="no filtro atual"
        />
      </div>

      {/* Filtros */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md bg-neutral-900 border border-neutral-800 text-xs font-mono px-2 text-neutral-300"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-9 rounded-md bg-neutral-900 border border-neutral-800 text-xs font-mono px-2 text-neutral-300"
        />

        <button
          onClick={() => setMonth("")}
          disabled={!month}
          className="text-[10px] font-mono text-neutral-500 hover:text-neutral-300 disabled:opacity-30"
        >
          limpar mês
        </button>
      </div>

      {/* Lista */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between">
          <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-300">
            Payouts
          </h2>
          <span className="text-[10px] font-mono text-neutral-500">
            {rows.length} {rows.length === 1 ? "linha" : "linhas"}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-neutral-500">
            Nenhum payout nesse filtro. Quando alguém pagar via cupom de embaixador, vai aparecer aqui.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/60 text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Embaixador</th>
                  <th className="text-left px-4 py-2 font-medium">Cupom</th>
                  <th className="text-left px-4 py-2 font-medium">Período</th>
                  <th className="text-right px-4 py-2 font-medium">Gross</th>
                  <th className="text-right px-4 py-2 font-medium">Comissão</th>
                  <th className="text-left px-4 py-2 font-medium">PIX</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-right px-4 py-2 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {rows.map((p) => (
                  <PayoutRowComp
                    key={p.id}
                    row={p}
                    onPay={() => setConfirming(p)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirming && (
        <ConfirmPayoutModal
          row={confirming}
          onClose={() => setConfirming(null)}
          onSuccess={() => {
            toast.success("✅ Payout marcado como pago.");
            setConfirming(null);
            fetchPayouts();
          }}
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: number | string;
  subtitle?: string;
  accent?: "emerald";
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${accent === "emerald" ? "border-emerald-900/60 bg-emerald-950/20" : "border-neutral-800 bg-neutral-900/40"}`}
    >
      <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-1">
        {label}
      </p>
      <p
        className={`text-2xl font-semibold tabular-nums ${accent === "emerald" ? "text-emerald-300" : "text-neutral-100"}`}
      >
        {value}
      </p>
      {subtitle && (
        <p className="text-[10px] text-neutral-500 font-mono mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}

function PayoutRowComp({
  row,
  onPay,
}: {
  row: PayoutRow;
  onPay: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(value: string, kind: string) {
    navigator.clipboard.writeText(value);
    setCopied(kind);
    toast.success("Copiado.");
    setTimeout(() => setCopied(null), 1500);
  }

  const period = formatPeriod(row.period_start);
  const statusBadge = statusBadgeFor(row.status);
  const noPix = !row.pix_key || row.pix_key.trim() === "";

  return (
    <tr className="hover:bg-neutral-900/60">
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="text-neutral-100 text-sm font-medium">
            {row.ambassador_name || row.ambassador_email.split("@")[0]}
          </span>
          <span className="text-[11px] text-neutral-500 font-mono">
            {row.ambassador_email}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        {row.coupon_code ? (
          <span className="inline-flex items-center rounded bg-fuchsia-950/40 border border-fuchsia-900/60 px-2 py-0.5 text-[11px] font-mono text-fuchsia-300">
            {row.coupon_code}
          </span>
        ) : (
          <span className="text-[11px] text-neutral-600">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs font-mono text-neutral-400">{period}</td>
      <td className="px-4 py-3 text-right text-xs font-mono text-neutral-400 tabular-nums">
        R$ {row.gross_revenue_brl.toFixed(2)}
      </td>
      <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-300 tabular-nums">
        R$ {row.commission_brl.toFixed(2)}
        <span className="ml-1 text-[10px] text-neutral-500 font-mono">
          ({(row.commission_rate * 100).toFixed(0)}%)
        </span>
      </td>
      <td className="px-4 py-3">
        {noPix ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-500 font-mono">
            <AlertCircle className="h-3 w-3" /> sem PIX
          </span>
        ) : (
          <button
            onClick={() => copy(row.pix_key, `pix-${row.id}`)}
            className="inline-flex items-center gap-1.5 text-[11px] font-mono text-neutral-300 hover:text-neutral-100 max-w-[180px] truncate"
            title={row.pix_key}
          >
            <span className="truncate">{row.pix_key}</span>
            {copied === `pix-${row.id}` ? (
              <Check className="h-3 w-3 shrink-0 text-emerald-400" />
            ) : (
              <Copy className="h-3 w-3 opacity-50 shrink-0" />
            )}
          </button>
        )}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono ${statusBadge.className}`}
        >
          {statusBadge.label}
        </span>
        {row.pix_paid_at && (
          <p className="text-[10px] text-neutral-600 font-mono mt-0.5">
            {new Date(row.pix_paid_at).toLocaleDateString("pt-BR")}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {row.status === "pending" ? (
          <button
            onClick={onPay}
            disabled={noPix}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 hover:bg-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed text-white px-2.5 py-1 text-xs font-mono"
            title={noPix ? "Embaixador precisa cadastrar PIX em /account/embaixador" : ""}
          >
            <Check className="h-3 w-3" />
            Marcar pago
          </button>
        ) : row.pix_transaction_id ? (
          <span className="text-[10px] font-mono text-neutral-500" title={row.pix_transaction_id}>
            tx: {row.pix_transaction_id.slice(0, 8)}…
          </span>
        ) : null}
      </td>
    </tr>
  );
}

function ConfirmPayoutModal({
  row,
  onClose,
  onSuccess,
}: {
  row: PayoutRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [txId, setTxId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const r = await fetch(`/api/admin/ambassadors/payouts/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_paid",
          pix_transaction_id: txId.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Falha.");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-950 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <h2 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
            <Banknote className="h-4 w-4 text-emerald-400" />
            Confirmar PIX pago
          </h2>
          <button
            onClick={onClose}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-neutral-500 hover:text-neutral-100 hover:bg-neutral-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Snapshot */}
          <div className="rounded-md border border-emerald-900/40 bg-emerald-950/20 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Embaixador:</span>
              <span className="text-sm text-neutral-100">
                {row.ambassador_name || row.ambassador_email.split("@")[0]}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Período:</span>
              <span className="text-sm font-mono text-neutral-100">
                {formatPeriod(row.period_start)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Valor PIX:</span>
              <span className="text-lg font-semibold text-emerald-300 tabular-nums">
                R$ {row.commission_brl.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Chave PIX:</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(row.pix_key);
                  toast.success("PIX copiado.");
                }}
                className="text-xs font-mono text-neutral-100 hover:text-emerald-300 flex items-center gap-1 max-w-[200px] truncate"
                title={row.pix_key}
              >
                <span className="truncate">{row.pix_key}</span>
                <Copy className="h-3 w-3 opacity-50 shrink-0" />
              </button>
            </div>
          </div>

          <p className="text-xs text-neutral-500">
            Envia o PIX pelo banco e cole abaixo o ID da transação (opcional, pra auditoria).
          </p>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-neutral-400 mb-1.5">
              ID da transação PIX (opcional)
            </label>
            <input
              type="text"
              value={txId}
              onChange={(e) => setTxId(e.target.value)}
              placeholder="E2C1234567890..."
              className="w-full h-9 px-3 rounded-md bg-neutral-900 border border-neutral-800 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-700 font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-neutral-400 mb-1.5">
              Observações (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: pago via Itaú PJ"
              rows={2}
              className="w-full px-3 py-2 rounded-md bg-neutral-900 border border-neutral-800 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-700 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-neutral-800">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 rounded-md text-xs font-mono text-neutral-400 hover:text-neutral-100 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1.5 text-xs font-mono disabled:opacity-40"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Confirmando...
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                Confirmar pago
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function statusBadgeFor(status: PayoutRow["status"]) {
  switch (status) {
    case "pending":
      return {
        label: "PENDENTE",
        className: "bg-amber-950/40 border border-amber-900/60 text-amber-300",
      };
    case "paid":
      return {
        label: "PAGO",
        className: "bg-emerald-950/40 border border-emerald-900/60 text-emerald-300",
      };
    case "failed":
      return {
        label: "FALHOU",
        className: "bg-rose-950/40 border border-rose-900/60 text-rose-300",
      };
    case "cancelled":
      return {
        label: "CANCELADO",
        className: "bg-neutral-800 border border-neutral-700 text-neutral-400",
      };
  }
}

function formatPeriod(periodStartIso: string): string {
  // YYYY-MM-DD → "Mai/26"
  const [y, m] = periodStartIso.split("-").map(Number);
  const months = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];
  return `${months[m - 1]}/${String(y).slice(-2)}`;
}

function currentMonthYM(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
