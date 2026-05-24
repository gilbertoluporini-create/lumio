"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  DollarSign,
  Loader2,
  Mic,
  RefreshCcw,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

type MetricsPayload = {
  total_users: number;
  active_subscriptions: number;
  plan_breakdown: Record<string, number>;
  mrr_brl: number;
  signups_7d: number;
  signups_30d: number;
  churn_30d: number;
  active_users_7d: number;
  total_lectures: number;
  total_coins_spent_30d: number;
  signups_daily_30d: Array<{ date: string; count: number }>;
  revenue_monthly_6m: Array<{ month: string; revenue: number }>;
};

export default function AdminMetricsPage() {
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/metrics", { cache: "no-store" });
      const json = (await res.json()) as MetricsPayload | { error: string };
      if (!res.ok || "error" in json) {
        throw new Error("error" in json ? json.error : "Falha.");
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Métricas</h1>
          <p className="text-sm text-neutral-400 mt-1">
            KPIs em tempo real do Lumio.
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 px-3 py-1.5 text-xs font-mono text-neutral-300"
        >
          <RefreshCcw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!data && loading ? (
        <div className="py-20 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-neutral-500" />
        </div>
      ) : data ? (
        <>
          {/* KPI grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <Kpi
              label="MRR"
              value={data.mrr_brl.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
              icon={DollarSign}
              accent="emerald"
            />
            <Kpi
              label="Total usuários"
              value={data.total_users.toLocaleString("pt-BR")}
              icon={Users}
            />
            <Kpi
              label="Assinaturas ativas"
              value={data.active_subscriptions.toLocaleString("pt-BR")}
              icon={Zap}
              accent="indigo"
            />
            <Kpi
              label="Active 7d"
              value={data.active_users_7d.toLocaleString("pt-BR")}
              icon={Activity}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <Kpi
              label="Signups 7d"
              value={data.signups_7d.toLocaleString("pt-BR")}
              icon={TrendingUp}
              accent="emerald"
            />
            <Kpi
              label="Signups 30d"
              value={data.signups_30d.toLocaleString("pt-BR")}
              icon={TrendingUp}
            />
            <Kpi
              label="Churn 30d"
              value={data.churn_30d.toLocaleString("pt-BR")}
              icon={TrendingDown}
              accent={data.churn_30d > 0 ? "red" : "default"}
            />
            <Kpi
              label="Aulas totais"
              value={data.total_lectures.toLocaleString("pt-BR")}
              icon={Mic}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Signups daily */}
            <Card title="Signups (últimos 30 dias)">
              <BarChart
                data={data.signups_daily_30d.map((d) => ({
                  label: d.date.slice(5),
                  value: d.count,
                }))}
                height={180}
                color="indigo"
              />
            </Card>

            {/* Revenue monthly */}
            <Card title="Receita estimada (R$, últimos 6 meses)">
              <BarChart
                data={data.revenue_monthly_6m.map((d) => ({
                  label: d.month.slice(5),
                  value: d.revenue,
                }))}
                height={180}
                color="emerald"
                format="brl"
              />
            </Card>

            {/* Plan distribution */}
            <Card title="Distribuição de planos">
              <PlanDistribution breakdown={data.plan_breakdown} />
            </Card>

            {/* Coins spent */}
            <Card title="Coins gastas (últimos 30 dias)">
              <div className="text-center py-10">
                <p className="text-4xl font-semibold tabular-nums">
                  {data.total_coins_spent_30d.toLocaleString("pt-BR")}
                </p>
                <p className="text-xs text-neutral-500 font-mono mt-2">
                  ≈ {(data.total_coins_spent_30d / Math.max(1, data.active_users_7d)).toFixed(1)} coins/active user
                </p>
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "default" | "emerald" | "indigo" | "red";
}) {
  const accentMap = {
    default: "text-neutral-500",
    emerald: "text-emerald-400",
    indigo: "text-indigo-400",
    red: "text-red-400",
  };
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono">
          {label}
        </p>
        <Icon className={`h-3.5 w-3.5 ${accentMap[accent ?? "default"]}`} />
      </div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <p className="text-xs font-mono uppercase tracking-wider text-neutral-400 mb-3">
        {title}
      </p>
      {children}
    </div>
  );
}

function BarChart({
  data,
  height = 160,
  color = "indigo",
  format,
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
  color?: "indigo" | "emerald";
  format?: "brl";
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const barWidth = 100 / Math.max(data.length, 1);
  const fillColor = color === "emerald" ? "#10b981" : "#6366f1";

  return (
    <div>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: `${height}px` }}
      >
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 20);
          return (
            <g key={i}>
              <rect
                x={i * barWidth + barWidth * 0.1}
                y={height - 20 - h}
                width={barWidth * 0.8}
                height={h}
                fill={fillColor}
                opacity={0.7}
              />
              <title>{`${d.label}: ${format === "brl" ? d.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : d.value}`}</title>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[9px] text-neutral-500 font-mono">
        <span>{data[0]?.label}</span>
        <span>max: {format === "brl" ? max.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : max}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function PlanDistribution({
  breakdown,
}: {
  breakdown: Record<string, number>;
}) {
  const entries = Object.entries(breakdown);
  const total = entries.reduce((acc, [, v]) => acc + v, 0);
  if (total === 0) {
    return (
      <p className="text-center py-10 text-xs text-neutral-500 font-mono">
        Sem assinaturas ativas.
      </p>
    );
  }
  const colorMap: Record<string, string> = {
    starter: "bg-sky-500",
    pro: "bg-indigo-500",
    power: "bg-fuchsia-500",
    annual: "bg-emerald-500",
    free: "bg-neutral-700",
  };
  return (
    <div className="space-y-2">
      {entries.map(([plan, count]) => {
        const pct = (count / total) * 100;
        return (
          <div key={plan}>
            <div className="flex justify-between text-xs font-mono mb-1">
              <span className="text-neutral-300">{plan}</span>
              <span className="text-neutral-500">
                {count} ({pct.toFixed(1)}%)
              </span>
            </div>
            <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${colorMap[plan] ?? "bg-neutral-600"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
