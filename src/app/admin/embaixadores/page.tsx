"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Award,
  Check,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { AdminAmbassadorRow } from "@/app/api/admin/ambassadors/route";

type ApproveResponse = {
  ok: true;
  ambassador: {
    user_id: string;
    email: string;
    name: string | null;
    tracking_code: string;
    coupon_code: string;
    commission_rate: number;
    stripe_coupon_id: string | null;
    stripe_promo_code_id: string | null;
    warning: string | null;
  };
};

export default function AmbassadorsAdminPage() {
  const [rows, setRows] = useState<AdminAmbassadorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const fetchAmbassadors = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/ambassadors");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Falha ao carregar.");
      setRows(j.ambassadors ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAmbassadors();
  }, [fetchAmbassadors]);

  const totalMRR = rows.reduce((acc, r) => acc + (r.total_reward_brl || 0), 0);
  const totalPaid = rows.reduce((acc, r) => acc + r.total_paid, 0);
  const totalSignups = rows.reduce((acc, r) => acc + r.total_signups, 0);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Award className="h-5 w-5 text-fuchsia-400" />
            Embaixadores
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Aprove embaixadores em 1 clique. Cria cupom Stripe + tracking code + flag em uma operação só.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAmbassadors}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 px-3 py-1.5 text-xs font-mono text-neutral-200 disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-fuchsia-700 hover:bg-fuchsia-600 text-white px-3 py-1.5 text-xs font-mono"
          >
            <Plus className="h-3.5 w-3.5" />
            Aprovar novo
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <KpiCard label="Embaixadores ativos" value={rows.length} icon={Award} />
        <KpiCard label="Signups totais" value={totalSignups} />
        <KpiCard label="Pagantes totais" value={totalPaid} accent />
        <KpiCard
          label="Recompensa paga (acum.)"
          value={`R$ ${totalMRR.toFixed(0)}`}
          accent
        />
      </div>

      {/* Lista */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between">
          <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-300">
            Embaixadores
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
            Nenhum embaixador ainda. Clica em &quot;Aprovar novo&quot; pra começar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/60 text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Embaixador</th>
                  <th className="text-left px-4 py-2 font-medium">Cupom</th>
                  <th className="text-left px-4 py-2 font-medium">Tracking</th>
                  <th className="text-right px-4 py-2 font-medium">Comissão</th>
                  <th className="text-right px-4 py-2 font-medium">Signups</th>
                  <th className="text-right px-4 py-2 font-medium">Pagantes</th>
                  <th className="text-left px-4 py-2 font-medium">PIX</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {rows.map((r) => (
                  <AmbassadorRow key={r.user_id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <ApproveModal
          onClose={() => setShowForm(false)}
          onSuccess={(res) => {
            toast.success(`✅ ${res.ambassador.email} aprovado como embaixador.`);
            setShowForm(false);
            fetchAmbassadors();
          }}
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: number | string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${accent ? "border-fuchsia-900/60 bg-fuchsia-950/20" : "border-neutral-800 bg-neutral-900/40"}`}
    >
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className={`h-3 w-3 ${accent ? "text-fuchsia-400" : "text-neutral-500"}`} />}
        <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
          {label}
        </p>
      </div>
      <p className={`text-2xl font-semibold tabular-nums ${accent ? "text-fuchsia-300" : "text-neutral-100"}`}>
        {value}
      </p>
    </div>
  );
}

function AmbassadorRow({ row }: { row: AdminAmbassadorRow }) {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(value: string, kind: string) {
    navigator.clipboard.writeText(value);
    setCopied(kind);
    toast.success("Copiado.");
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <tr className="hover:bg-neutral-900/60">
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="text-neutral-100 text-sm font-medium">
            {row.name || row.email.split("@")[0]}
          </span>
          <span className="text-[11px] text-neutral-500 font-mono">{row.email}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        {row.coupon_code ? (
          <button
            onClick={() => copy(row.coupon_code!, `coup-${row.user_id}`)}
            className="inline-flex items-center gap-1.5 rounded bg-fuchsia-950/40 border border-fuchsia-900/60 px-2 py-1 text-xs font-mono text-fuchsia-300 hover:bg-fuchsia-950/60"
          >
            {row.coupon_code}
            {copied === `coup-${row.user_id}` ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3 opacity-50" />
            )}
          </button>
        ) : (
          <span className="text-xs text-amber-500 font-mono">— sem cupom —</span>
        )}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => copy(row.code, `track-${row.user_id}`)}
          className="inline-flex items-center gap-1.5 text-xs font-mono text-neutral-400 hover:text-neutral-100"
        >
          {row.code}
          {copied === `track-${row.user_id}` ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3 opacity-30" />
          )}
        </button>
      </td>
      <td className="px-4 py-3 text-right text-xs font-mono text-neutral-300 tabular-nums">
        {(row.commission_rate * 100).toFixed(0)}%
      </td>
      <td className="px-4 py-3 text-right text-xs font-mono text-neutral-300 tabular-nums">
        {row.total_signups}
      </td>
      <td className="px-4 py-3 text-right text-xs font-mono text-fuchsia-300 tabular-nums">
        {row.total_paid}
      </td>
      <td className="px-4 py-3 text-[11px] font-mono text-neutral-500 max-w-[200px] truncate">
        {row.pix_key || <span className="text-neutral-700">— sem PIX —</span>}
      </td>
    </tr>
  );
}

function ApproveModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (res: ApproveResponse) => void;
}) {
  const [email, setEmail] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [commissionPct, setCommissionPct] = useState(25);
  const [createStripe, setCreateStripe] = useState(true);
  const [percentOff, setPercentOff] = useState(10);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!email || !couponCode) {
      toast.error("Email e cupom são obrigatórios.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/admin/ambassadors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          coupon_code: couponCode.trim().toUpperCase(),
          commission_rate: commissionPct / 100,
          create_stripe_coupon: createStripe,
          percent_off: createStripe ? percentOff : undefined,
          admin_notes: notes.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Falha ao aprovar.");
      if (j.ambassador?.warning) {
        toast.warning(j.ambassador.warning);
      }
      onSuccess(j as ApproveResponse);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao aprovar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-lg border border-neutral-800 bg-neutral-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-fuchsia-400" />
            <h2 className="text-sm font-semibold text-neutral-100">
              Aprovar novo embaixador
            </h2>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-neutral-500 hover:text-neutral-100 hover:bg-neutral-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <Field label="Email do user no Lumio">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="lari@email.com"
              className="w-full h-9 px-3 rounded-md bg-neutral-900 border border-neutral-800 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-fuchsia-700"
            />
            <p className="text-[11px] text-neutral-500 mt-1">
              Precisa já ter conta criada (signup feito).
            </p>
          </Field>

          <Field label="Cupom personalizado">
            <input
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="LARI10"
              maxLength={30}
              className="w-full h-9 px-3 rounded-md bg-neutral-900 border border-neutral-800 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-fuchsia-700 font-mono uppercase"
            />
            <p className="text-[11px] text-neutral-500 mt-1">
              A-Z, 0-9, _ ou -. Convenção: NOME + desconto (ex: LARI10, MEDLARI10).
            </p>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Comissão do embaixador">
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={commissionPct}
                  onChange={(e) => setCommissionPct(Number(e.target.value))}
                  className="w-full h-9 pl-3 pr-8 rounded-md bg-neutral-900 border border-neutral-800 text-sm text-neutral-100 focus:outline-none focus:border-fuchsia-700"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
                  %
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">
                Default Lumio: 25%.
              </p>
            </Field>

            <Field label="Desconto pro comprador">
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={percentOff}
                  disabled={!createStripe}
                  onChange={(e) => setPercentOff(Number(e.target.value))}
                  className="w-full h-9 pl-3 pr-8 rounded-md bg-neutral-900 border border-neutral-800 text-sm text-neutral-100 focus:outline-none focus:border-fuchsia-700 disabled:opacity-40"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
                  %
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">
                Default: 10% off.
              </p>
            </Field>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={createStripe}
              onChange={(e) => setCreateStripe(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-fuchsia-600 focus:ring-fuchsia-700"
            />
            <div className="flex-1">
              <p className="text-sm text-neutral-200">
                Criar cupom Stripe automaticamente
              </p>
              <p className="text-[11px] text-neutral-500">
                Recomendado. Cria coupon (forever) + promotion code com o mesmo nome do cupom acima.
                Desmarca só se já criou no dashboard.
              </p>
            </div>
          </label>

          <Field label="Notas internas (opcional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Med 4º ano, 30K seguidores TikTok, indicada pela Carol..."
              rows={2}
              className="w-full px-3 py-2 rounded-md bg-neutral-900 border border-neutral-800 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-fuchsia-700 resize-none"
            />
          </Field>

          {/* Preview */}
          {couponCode && (
            <div className="rounded-md border border-fuchsia-900/40 bg-fuchsia-950/20 p-3 text-[11px] font-mono text-fuchsia-300/80 space-y-1">
              <div className="flex items-center gap-1.5 text-fuchsia-300 mb-1">
                <TrendingUp className="h-3 w-3" />
                <span className="uppercase tracking-wider">Preview</span>
              </div>
              <p>Cliente usa {couponCode} → ganha {percentOff}% off no Stripe.</p>
              <p>
                Embaixador recebe {commissionPct}% sobre cada renovação via PIX.
              </p>
              <p className="text-fuchsia-400/60">
                Ex: 10 assinantes Pro = R${" "}
                {((10 * 69 * (commissionPct / 100)) * (1 - percentOff / 100)).toFixed(0)}/mês
                pro embaixador.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
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
            disabled={submitting || !email || !couponCode}
            className="inline-flex items-center gap-1.5 rounded-md bg-fuchsia-700 hover:bg-fuchsia-600 text-white px-3 py-1.5 text-xs font-mono disabled:opacity-40"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Aprovando...
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                Aprovar embaixador
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-mono uppercase tracking-wider text-neutral-400 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
