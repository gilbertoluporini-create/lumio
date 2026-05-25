"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Filter,
  Gift,
  Loader2,
  MailOpen,
  RefreshCw,
  Share2,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

type MarketingStats = {
  funnel30d: {
    signups: number;
    activated: number;
    checkoutStarted: number | null;
    paid: number;
  };
  mrrNow: number;
  mrr30dAgo: number;
  mrrTrendPct: number;
  planMix: Array<{ plan: string; count: number; mrr: number }>;
  churn30d: { canceled: number; baseStart: number; rate: number };
  conversionRate30d: number;
  cohorts: Array<{
    weekStart: string;
    signups: number;
    converted: number;
    rate: number;
  }>;
  fetchedAt: string;
};

type MarketingExtras = {
  referrals: {
    totalCodes: number;
    totalClicks: number;
    totalSignups: number;
    totalPaid: number;
    totalRewardBrl: number;
    topAmbassadors: Array<{
      code: string;
      email: string | null;
      clicks: number;
      signups: number;
      paid: number;
      rewardBrl: number;
    }>;
    recentRedemptions: Array<{
      id: string;
      referrerEmail: string | null;
      referredEmail: string | null;
      status: string;
      plan: string | null;
      signedUpAt: string;
      paidAt: string | null;
      rewardBrl: number;
    }>;
  };
  leadMagnet: {
    totalLeads: number;
    bonusCredited: number;
    bonusPending: number;
    last7d: number;
    recentLeads: Array<{
      email: string;
      createdAt: string;
      bonusCredited: boolean;
      bonusPending: boolean;
    }>;
  };
  recentPurchases: Array<{
    eventId: string;
    type: string;
    plan: string | null;
    amountBrl: number | null;
    userEmail: string | null;
    receivedAt: string;
    processedAt: string | null;
    sessionId: string | null;
    fromReferral: boolean;
  }>;
  fetchedAt: string;
};

const PLAN_COLOR: Record<string, string> = {
  starter: "bg-sky-500",
  pro: "bg-fuchsia-500",
  power: "bg-amber-500",
  annual: "bg-emerald-500",
  free: "bg-neutral-600",
};

const PLAN_LABEL: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  power: "Power",
  annual: "Anual (legado)",
  free: "Free",
};

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

function formatWeek(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

export function MarketingDashboard() {
  const [stats, setStats] = useState<MarketingStats | null>(null);
  const [extras, setExtras] = useState<MarketingExtras | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const [statsResp, extrasResp] = await Promise.all([
        fetch("/api/admin/marketing-stats", { cache: "no-store" }),
        fetch("/api/admin/marketing-extras", { cache: "no-store" }),
      ]);
      if (!statsResp.ok) {
        if (statsResp.status === 401 || statsResp.status === 403) {
          toast.error("Apenas admin.");
        } else {
          toast.error("Erro ao carregar métricas.");
        }
        return;
      }
      const data = (await statsResp.json()) as MarketingStats;
      setStats(data);
      if (extrasResp.ok) {
        const extrasData = (await extrasResp.json()) as MarketingExtras;
        setExtras(extrasData);
      }
    } catch (err) {
      toast.error(`Falha: ${(err as Error).message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats(false);
    // Auto-refresh mais agressivo (15s) pra acompanhar compra ao vivo.
    const id = setInterval(() => fetchStats(true), 15_000);
    return () => clearInterval(id);
  }, [fetchStats]);

  const maxFunnel = useMemo(() => {
    if (!stats) return 1;
    return Math.max(
      stats.funnel30d.signups,
      stats.funnel30d.activated,
      stats.funnel30d.paid,
      1,
    );
  }, [stats]);

  const maxPlanCount = useMemo(() => {
    if (!stats || stats.planMix.length === 0) return 1;
    return Math.max(...stats.planMix.map((p) => p.count), 1);
  }, [stats]);

  if (loading && !stats) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!stats) return null;

  const activationRate =
    stats.funnel30d.signups > 0
      ? (stats.funnel30d.activated / stats.funnel30d.signups) * 100
      : 0;
  const paidRate =
    stats.funnel30d.signups > 0
      ? (stats.funnel30d.paid / stats.funnel30d.signups) * 100
      : 0;

  const trendPositive = stats.mrrTrendPct >= 0;

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8 py-6 md:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
          >
            <ArrowLeft className="h-3 w-3" /> Admin
          </Link>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Vendas & Funil
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Aquisição, conversão e retenção. Atualiza a cada 30s.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {refreshing && <Loader2 className="h-3 w-3 animate-spin" />}
          <span>
            Atualizado{" "}
            {new Date(stats.fetchedAt).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
          <button
            type="button"
            onClick={() => fetchStats(true)}
            className="ml-2 inline-flex h-7 items-center gap-1 rounded-md border border-border/60 px-2 text-xs hover:bg-secondary/60"
          >
            <RefreshCw className="h-3 w-3" /> Atualizar
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          icon={<DollarSign className="h-4 w-4 text-emerald-500" />}
          label="MRR atual"
          value={formatBRL(stats.mrrNow)}
          sub={
            stats.mrr30dAgo > 0
              ? `${trendPositive ? "+" : ""}${stats.mrrTrendPct.toFixed(1)}% vs 30d atrás`
              : "Sem base 30d atrás"
          }
          trend={trendPositive ? "up" : "down"}
        />
        <KPICard
          icon={<UserPlus className="h-4 w-4 text-primary" />}
          label="Signups 30d"
          value={stats.funnel30d.signups.toLocaleString("pt-BR")}
          sub={`${stats.funnel30d.activated} ativados (${formatPct(activationRate)})`}
        />
        <KPICard
          icon={<UserCheck className="h-4 w-4 text-fuchsia-500" />}
          label="Conversão 30d"
          value={formatPct(stats.conversionRate30d)}
          sub={`${stats.funnel30d.paid} viraram pagantes`}
        />
        <KPICard
          icon={<TrendingDown className="h-4 w-4 text-rose-500" />}
          label="Churn 30d"
          value={formatPct(stats.churn30d.rate)}
          sub={`${stats.churn30d.canceled} cancelaram · base ${stats.churn30d.baseStart}`}
          alert={stats.churn30d.rate >= 5}
        />
      </div>

      {/* Funil */}
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <Filter className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Funil de aquisição (30d)</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Cada barra é proporcional ao topo do funil (signups).
        </p>
        <div className="space-y-3">
          <FunnelBar
            label="Signups"
            value={stats.funnel30d.signups}
            pctOfMax={(stats.funnel30d.signups / maxFunnel) * 100}
            pctOfTop={100}
            color="bg-gradient-to-r from-primary to-fuchsia-500"
          />
          <FunnelBar
            label="Ativados (1+ lecture)"
            value={stats.funnel30d.activated}
            pctOfMax={(stats.funnel30d.activated / maxFunnel) * 100}
            pctOfTop={activationRate}
            color="bg-gradient-to-r from-sky-500 to-primary"
          />
          <FunnelBar
            label="Checkout iniciado"
            value={stats.funnel30d.checkoutStarted}
            pctOfMax={
              stats.funnel30d.checkoutStarted !== null
                ? (stats.funnel30d.checkoutStarted / maxFunnel) * 100
                : 0
            }
            pctOfTop={null}
            color="bg-gradient-to-r from-amber-500 to-fuchsia-500"
            placeholder="GA4 client-side (server não tem)"
          />
          <FunnelBar
            label="Pagantes"
            value={stats.funnel30d.paid}
            pctOfMax={(stats.funnel30d.paid / maxFunnel) * 100}
            pctOfTop={paidRate}
            color="bg-gradient-to-r from-emerald-500 to-sky-500"
          />
        </div>
      </div>

      {/* Mix de planos + MRR breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-fuchsia-500" />
            <h2 className="text-sm font-semibold">Mix de planos (ativos)</h2>
          </div>
          {stats.planMix.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma assinatura ativa ainda.
            </p>
          ) : (
            <div className="space-y-2">
              {stats.planMix.map((p) => {
                const pct = (p.count / maxPlanCount) * 100;
                return (
                  <div
                    key={p.plan}
                    className="rounded-lg border border-border/40 px-3 py-2"
                  >
                    <div className="flex items-center justify-between mb-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${PLAN_COLOR[p.plan] ?? "bg-neutral-500"}`}
                        />
                        <span className="font-medium">
                          {PLAN_LABEL[p.plan] ?? p.plan}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold tabular-nums">
                          {p.count}
                        </span>
                        <span className="text-muted-foreground ml-1">
                          · {formatBRL(p.mrr)}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={`h-full ${PLAN_COLOR[p.plan] ?? "bg-neutral-500"}`}
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            {trendPositive ? (
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-rose-500" />
            )}
            <h2 className="text-sm font-semibold">Evolução MRR</h2>
          </div>
          <div className="space-y-3">
            <div className="rounded-lg border border-border/40 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                Hoje
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatBRL(stats.mrrNow)}
              </div>
            </div>
            <div className="rounded-lg border border-border/40 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                30 dias atrás
              </div>
              <div className="text-lg font-semibold tabular-nums text-muted-foreground">
                {formatBRL(stats.mrr30dAgo)}
              </div>
            </div>
            <div
              className={`rounded-lg px-3 py-2 ${
                trendPositive
                  ? "border border-emerald-500/30 bg-emerald-500/5"
                  : "border border-rose-500/30 bg-rose-500/5"
              }`}
            >
              <div className="text-[10px] uppercase tracking-wider font-mono">
                Tendência
              </div>
              <div
                className={`text-lg font-semibold tabular-nums ${
                  trendPositive
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-rose-700 dark:text-rose-300"
                }`}
              >
                {trendPositive ? "+" : ""}
                {stats.mrrTrendPct.toFixed(1)}%
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                ARR projetado: {formatBRL(stats.mrrNow * 12)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Compras nas últimas 24h — live tail pra validação */}
      {extras && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="h-4 w-4 text-emerald-500" />
            <h2 className="text-sm font-semibold">
              Compras últimas 24h ({extras.recentPurchases.length})
            </h2>
            <span className="ml-auto text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300 font-mono">
              Live · refresh 15s
            </span>
          </div>
          {extras.recentPurchases.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              Nenhum evento Stripe nas últimas 24h. Quando você comprar, aparece
              aqui em &lt;15s.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Quando</th>
                    <th className="px-3 py-2 text-left font-medium">Evento</th>
                    <th className="px-3 py-2 text-left font-medium">Email</th>
                    <th className="px-3 py-2 text-left font-medium">Plano</th>
                    <th className="px-3 py-2 text-right font-medium">Valor</th>
                    <th className="px-3 py-2 text-center font-medium">
                      Processado
                    </th>
                    <th className="px-3 py-2 text-center font-medium">Ref</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {extras.recentPurchases.map((p) => (
                    <tr key={p.eventId} className="hover:bg-secondary/40">
                      <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                        {new Date(p.receivedAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px]">
                        {p.type.replace("checkout.session.", "ckt.").replace(
                          "customer.subscription.",
                          "sub.",
                        )}
                      </td>
                      <td className="px-3 py-2 truncate max-w-[180px]">
                        {p.userEmail ?? (
                          <span className="text-muted-foreground italic">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {p.plan ? (
                          <span
                            className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-mono ${
                              PLAN_COLOR[p.plan] ?? "bg-neutral-500"
                            } text-white`}
                          >
                            {p.plan}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {p.amountBrl !== null
                          ? formatBRL(p.amountBrl)
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {p.processedAt ? (
                          <CheckCircle2 className="inline h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Clock className="inline h-3.5 w-3.5 text-amber-500" />
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {p.fromReferral ? (
                          <Share2 className="inline h-3.5 w-3.5 text-fuchsia-500" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Programa Embaixadores */}
      {extras && (
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Share2 className="h-4 w-4 text-fuchsia-500" />
            <h2 className="text-sm font-semibold">Programa Embaixadores</h2>
            <Link
              href="/admin/users"
              className="ml-auto text-[10px] font-mono text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              Ver users <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <MiniStatCard
              label="Códigos"
              value={extras.referrals.totalCodes.toLocaleString("pt-BR")}
            />
            <MiniStatCard
              label="Clicks"
              value={extras.referrals.totalClicks.toLocaleString("pt-BR")}
            />
            <MiniStatCard
              label="Signups"
              value={extras.referrals.totalSignups.toLocaleString("pt-BR")}
            />
            <MiniStatCard
              label="Pagantes"
              value={extras.referrals.totalPaid.toLocaleString("pt-BR")}
              highlight={extras.referrals.totalPaid > 0}
            />
            <MiniStatCard
              label="Reward (BRL)"
              value={formatBRL(extras.referrals.totalRewardBrl)}
              highlight={extras.referrals.totalRewardBrl > 0}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-2">
                Top embaixadores
              </h3>
              {extras.referrals.topAmbassadors.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  Ainda sem clicks. Compartilha o link em
                  /account/embaixador.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Code</th>
                        <th className="px-2 py-1.5 text-left">Email</th>
                        <th className="px-2 py-1.5 text-right">Clk</th>
                        <th className="px-2 py-1.5 text-right">Sgn</th>
                        <th className="px-2 py-1.5 text-right">Pay</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {extras.referrals.topAmbassadors.map((a) => (
                        <tr key={a.code} className="hover:bg-secondary/40">
                          <td className="px-2 py-1.5 font-mono text-[11px]">
                            {a.code}
                          </td>
                          <td className="px-2 py-1.5 truncate max-w-[140px]">
                            {a.email ?? "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {a.clicks}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {a.signups}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                            {a.paid}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-2">
                Últimas redemptions
              </h3>
              {extras.referrals.recentRedemptions.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  Nenhum signup via referral ainda.
                </p>
              ) : (
                <div className="divide-y divide-border/40 max-h-[220px] overflow-y-auto">
                  {extras.referrals.recentRedemptions.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-2 py-1.5 text-xs"
                    >
                      <span
                        className={`inline-block h-2 w-2 rounded-full shrink-0 ${
                          r.status === "paid"
                            ? "bg-emerald-500"
                            : r.status === "activated"
                              ? "bg-sky-500"
                              : "bg-neutral-500"
                        }`}
                      />
                      <span className="font-mono text-[10px] truncate max-w-[140px]">
                        {r.referredEmail ?? "—"}
                      </span>
                      <span className="text-muted-foreground text-[10px] truncate">
                        ← {r.referrerEmail ?? "—"}
                      </span>
                      <span className="ml-auto text-[10px] font-mono">
                        {r.status === "paid"
                          ? formatBRL(r.rewardBrl)
                          : r.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lead Magnet */}
      {extras && (
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Gift className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold">
              Lead Magnet · Guia de Revisão
            </h2>
            <Link
              href="/guia-revisao"
              target="_blank"
              className="ml-auto text-[10px] font-mono text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              Ver landing <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MiniStatCard
              label="Total leads"
              value={extras.leadMagnet.totalLeads.toLocaleString("pt-BR")}
            />
            <MiniStatCard
              label="Últimos 7d"
              value={extras.leadMagnet.last7d.toLocaleString("pt-BR")}
              highlight={extras.leadMagnet.last7d > 0}
            />
            <MiniStatCard
              label="+50 coins creditados"
              value={extras.leadMagnet.bonusCredited.toLocaleString("pt-BR")}
            />
            <MiniStatCard
              label="Bonus pendente"
              value={extras.leadMagnet.bonusPending.toLocaleString("pt-BR")}
            />
          </div>
          {extras.leadMagnet.recentLeads.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              Nenhum lead via /guia-revisao ainda. Divulga em IG/TikTok pra ver
              encher.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Email</th>
                    <th className="px-2 py-1.5 text-left">Capturado</th>
                    <th className="px-2 py-1.5 text-center">Bonus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {extras.leadMagnet.recentLeads.map((l) => (
                    <tr key={l.email} className="hover:bg-secondary/40">
                      <td className="px-2 py-1.5 font-mono text-[11px] truncate max-w-[280px]">
                        {l.email}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground text-[10px]">
                        {new Date(l.createdAt).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {l.bonusCredited ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> 50
                          </span>
                        ) : l.bonusPending ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <MailOpen className="h-3 w-3" /> pend.
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Cohort table */}
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <ArrowRight className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold">Cohort semanal (últimas 8 semanas)</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Quantos signups de cada semana viraram pagantes (status ativa/trialing
          no snapshot atual).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Semana</th>
                <th className="px-3 py-2 text-right font-medium">Signups</th>
                <th className="px-3 py-2 text-right font-medium">Pagantes</th>
                <th className="px-3 py-2 text-right font-medium">Conversão</th>
                <th className="px-3 py-2 text-left font-medium w-1/3">
                  Visual
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {stats.cohorts.map((c) => (
                <tr key={c.weekStart} className="hover:bg-secondary/40">
                  <td className="px-3 py-2 font-mono text-[11px]">
                    {formatWeek(c.weekStart)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {c.signups}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {c.converted}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-semibold ${
                      c.rate >= 10
                        ? "text-emerald-600 dark:text-emerald-400"
                        : c.rate >= 3
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-muted-foreground"
                    }`}
                  >
                    {c.signups > 0 ? formatPct(c.rate) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={`h-full ${
                          c.rate >= 10
                            ? "bg-emerald-500"
                            : c.rate >= 3
                              ? "bg-amber-500"
                              : "bg-neutral-600"
                        }`}
                        style={{
                          width: `${Math.max(2, Math.min(100, c.rate * 5))}%`,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KPICard({
  icon,
  label,
  value,
  sub,
  alert,
  trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  alert?: boolean;
  trend?: "up" | "down";
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        alert
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-border/60 bg-card"
      }`}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        {icon} {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div
        className={`text-[10px] mt-1 ${
          trend === "up"
            ? "text-emerald-600 dark:text-emerald-400"
            : trend === "down"
              ? "text-rose-600 dark:text-rose-400"
              : "text-muted-foreground"
        }`}
      >
        {sub}
      </div>
    </div>
  );
}

function MiniStatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        highlight
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-border/60 bg-secondary/30"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">
        {label}
      </p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function FunnelBar({
  label,
  value,
  pctOfMax,
  pctOfTop,
  color,
  placeholder,
}: {
  label: string;
  value: number | null;
  pctOfMax: number;
  pctOfTop: number | null;
  color: string;
  placeholder?: string;
}) {
  const isPlaceholder = value === null;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-right tabular-nums">
          {isPlaceholder ? (
            <span className="text-muted-foreground italic">
              {placeholder ?? "—"}
            </span>
          ) : (
            <>
              <span className="font-semibold">{value}</span>
              {pctOfTop !== null && (
                <span className="text-muted-foreground ml-2">
                  {formatPct(pctOfTop)}
                </span>
              )}
            </>
          )}
        </span>
      </div>
      <div className="h-3 rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full transition-all ${
            isPlaceholder ? "bg-neutral-700" : color
          }`}
          style={{
            width: `${Math.max(isPlaceholder ? 0 : 2, pctOfMax)}%`,
          }}
        />
      </div>
    </div>
  );
}
