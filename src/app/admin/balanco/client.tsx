"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Coins,
  DollarSign,
  Loader2,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import type { BalancoUserRow } from "@/app/api/admin/balanco/users/route";

type Snapshot = {
  mrr_brl: number;
  cost_usd_30d: number;
  cost_brl_30d: number;
  margin_brl_30d: number;
  margin_pct_30d: number;
  active_subscriptions: number;
  total_subscriptions: number;
  usd_brl_rate: number;
  users_at_risk_count: number;
};

type PlanAgg = {
  plan: string;
  users: number;
  mrr_brl: number;
  avg_cost_brl_per_user: number;
  avg_margin_brl_per_user: number;
  avg_margin_pct: number;
};

type AggregateResponse = {
  snapshot: Snapshot;
  plan_breakdown: PlanAgg[];
  users_at_risk: Array<{
    user_id: string;
    cost_brl: number;
    revenue_brl: number;
    margin_brl: number;
  }>;
};

const PLAN_FILTERS = [
  { value: "all", label: "Todos planos" },
  { value: "free", label: "Free" },
  { value: "starter", label: "Starter" },
  { value: "pro", label: "Pro" },
  { value: "power", label: "Power" },
];

const STATUS_FILTERS = [
  { value: "all", label: "Todos status" },
  { value: "active", label: "Active" },
  { value: "trialing", label: "Trial" },
  { value: "free", label: "Free" },
  { value: "canceled", label: "Canceled" },
];

const SORT_OPTIONS = [
  { value: "cost", label: "Maior custo API" },
  { value: "margin", label: "Pior margem" },
  { value: "coins", label: "Mais coins gastos" },
];

export function BalancoClient() {
  const [aggregate, setAggregate] = useState<AggregateResponse | null>(null);
  const [users, setUsers] = useState<BalancoUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filtros
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("cost");
  const [atRiskOnly, setAtRiskOnly] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (planFilter !== "all") params.set("plan", planFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (sort) params.set("sort", sort);
      if (atRiskOnly) params.set("at_risk", "1");
      if (q.trim()) params.set("q", q.trim());

      const [aggR, usersR] = await Promise.all([
        fetch("/api/admin/balanco/aggregate"),
        fetch(`/api/admin/balanco/users?${params}`),
      ]);
      const aggJ = await aggR.json();
      const usersJ = await usersR.json();
      if (!aggR.ok) throw new Error(aggJ.error || "erro aggregate");
      if (!usersR.ok) throw new Error(usersJ.error || "erro users");
      setAggregate(aggJ as AggregateResponse);
      setUsers((usersJ.users || []) as BalancoUserRow[]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [planFilter, statusFilter, sort, atRiskOnly, q]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const snap = aggregate?.snapshot;
  const marginPositive = (snap?.margin_brl_30d ?? 0) >= 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-fuchsia-300" />
            Balanço financeiro
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Snapshot 30d: MRR vs custo real de API. USD→BRL @ {snap?.usd_brl_rate}.
          </p>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-border/60 hover:bg-muted/40 text-xs"
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Atualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="MRR"
          value={`R$ ${fmt(snap?.mrr_brl ?? 0)}`}
          sub={`${snap?.active_subscriptions ?? 0} subs ativas`}
          tone="emerald"
          icon={DollarSign}
        />
        <Kpi
          label="Custo API 30d"
          value={`R$ ${fmt(snap?.cost_brl_30d ?? 0)}`}
          sub={`$${fmt(snap?.cost_usd_30d ?? 0, 2)} USD`}
          tone="amber"
          icon={Coins}
        />
        <Kpi
          label="Margem 30d"
          value={`R$ ${fmt(snap?.margin_brl_30d ?? 0)}`}
          sub={`${fmt(snap?.margin_pct_30d ?? 0, 1)}% margem`}
          tone={marginPositive ? "emerald" : "rose"}
          icon={marginPositive ? TrendingUp : TrendingDown}
        />
        <Kpi
          label="Users em risco"
          value={String(snap?.users_at_risk_count ?? 0)}
          sub="custo > receita"
          tone={(snap?.users_at_risk_count ?? 0) > 0 ? "rose" : "neutral"}
          icon={AlertTriangle}
        />
      </div>

      {/* Breakdown por plano */}
      <div className="rounded-lg border border-border/60 bg-card/40 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/60">
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Breakdown por plano
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Plano</th>
                <th className="text-right px-4 py-2 font-medium">Users</th>
                <th className="text-right px-4 py-2 font-medium">MRR</th>
                <th className="text-right px-4 py-2 font-medium">
                  Custo médio/user
                </th>
                <th className="text-right px-4 py-2 font-medium">
                  Margem média/user
                </th>
                <th className="text-right px-4 py-2 font-medium">Margem %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {aggregate?.plan_breakdown.map((p) => (
                <tr key={p.plan} className="hover:bg-muted/20">
                  <td className="px-4 py-2 font-medium">{p.plan}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {p.users}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    R$ {fmt(p.mrr_brl)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-amber-300">
                    R$ {fmt(p.avg_cost_brl_per_user)}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums ${p.avg_margin_brl_per_user >= 0 ? "text-emerald-300" : "text-rose-400"}`}
                  >
                    R$ {fmt(p.avg_margin_brl_per_user)}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums ${p.avg_margin_pct >= 0 ? "text-emerald-300" : "text-rose-400"}`}
                  >
                    {fmt(p.avg_margin_pct, 1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="buscar email..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-md bg-card border border-border/60 text-sm"
          />
        </div>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          className="h-9 rounded-md bg-card border border-border/60 text-xs font-mono px-2"
        >
          {PLAN_FILTERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md bg-card border border-border/60 text-xs font-mono px-2"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="h-9 rounded-md bg-card border border-border/60 text-xs font-mono px-2"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-2">
          <input
            type="checkbox"
            checked={atRiskOnly}
            onChange={(e) => setAtRiskOnly(e.target.checked)}
            className="accent-rose-500"
          />
          só em risco
        </label>
      </div>

      {/* Tabela users */}
      <UsersTable users={users} />
    </div>
  );
}

function UsersTable({ users }: { users: BalancoUserRow[] }) {
  const sorted = useMemo(() => users, [users]);

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/60 flex items-center justify-between">
        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Users
        </h2>
        <span className="text-[10px] font-mono text-muted-foreground">
          {sorted.length} {sorted.length === 1 ? "linha" : "linhas"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-medium">User</th>
              <th className="text-left px-4 py-2 font-medium">Plano</th>
              <th className="text-right px-4 py-2 font-medium">
                Coins saldo
              </th>
              <th className="text-right px-4 py-2 font-medium">
                Coins gastos 30d
              </th>
              <th className="text-right px-4 py-2 font-medium">
                Custo API 30d
              </th>
              <th className="text-right px-4 py-2 font-medium">
                Receita/mês
              </th>
              <th className="text-right px-4 py-2 font-medium">Margem 30d</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="text-center py-8 text-xs text-muted-foreground"
                >
                  Nenhum user com esse filtro.
                </td>
              </tr>
            ) : (
              sorted.map((u) => (
                <tr
                  key={u.user_id}
                  className={`hover:bg-muted/20 ${u.at_risk ? "bg-rose-500/5" : ""}`}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">
                        {u.name || u.email.split("@")[0]}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {u.email}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col">
                      <span className="text-xs">{u.plan}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {u.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                    {u.coin_balance}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs text-amber-300">
                    {u.coins_spent_30d}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                    <div className="flex flex-col">
                      <span>R$ {fmt(u.cost_brl_30d)}</span>
                      <span className="text-[10px] text-muted-foreground">
                        ${fmt(u.cost_usd_30d, 3)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                    {u.revenue_brl_month > 0
                      ? `R$ ${fmt(u.revenue_brl_month)}`
                      : "—"}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right tabular-nums text-xs font-medium ${
                      u.margin_brl_30d > 0
                        ? "text-emerald-300"
                        : u.margin_brl_30d < 0
                          ? "text-rose-400"
                          : "text-muted-foreground"
                    }`}
                  >
                    R$ {fmt(u.margin_brl_30d)}
                    {u.at_risk && (
                      <AlertTriangle className="inline h-3 w-3 ml-1" />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "emerald" | "amber" | "rose" | "neutral";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const toneCls = {
    emerald: "border-emerald-500/30 bg-emerald-500/5",
    amber: "border-amber-500/30 bg-amber-500/5",
    rose: "border-rose-500/30 bg-rose-500/5",
    neutral: "border-border/60 bg-card/40",
  }[tone];

  const iconCls = {
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    rose: "text-rose-400",
    neutral: "text-muted-foreground",
  }[tone];

  return (
    <div className={`rounded-lg border p-4 ${toneCls}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Icon className={`h-4 w-4 ${iconCls}`} />
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub && (
        <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
      )}
    </div>
  );
}

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
