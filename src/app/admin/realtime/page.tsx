"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users as UsersIcon,
  Zap,
} from "lucide-react";

type Kpis = {
  calls_5m: number;
  calls_5m_prev: number;
  cost_usd_1h: number;
  tokens_per_second: number;
  active_users_10m: number;
};

type ChartPoint = { minute: string; cost_usd: number };

type Call = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  endpoint: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
};

type Payload = {
  server_time: string;
  kpis: Kpis;
  chart: ChartPoint[];
  recent_calls: Call[];
};

const POLL_INTERVAL_MS = 10_000;

export default function AdminRealtimePage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [pollingPaused, setPollingPaused] = useState<boolean>(
    typeof document !== "undefined" && document.visibilityState !== "visible",
  );
  const feedRef = useRef<HTMLDivElement | null>(null);
  const prevCallIdsRef = useRef<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/realtime", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Payload;
      setData(json);
      setLastUpdate(new Date(json.server_time));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (pollingPaused) return;
    const id = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchData, pollingPaused]);

  useEffect(() => {
    function onVisibility() {
      const paused = document.visibilityState !== "visible";
      setPollingPaused(paused);
      if (!paused) fetchData();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [fetchData]);

  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.recent_calls.map((c) => c.id));
    const hadNew =
      prevCallIdsRef.current.size > 0 &&
      data.recent_calls.length > 0 &&
      !prevCallIdsRef.current.has(data.recent_calls[0].id);
    prevCallIdsRef.current = ids;
    if (hadNew && feedRef.current) {
      feedRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [data]);

  const calls5mDelta = useMemo(() => {
    if (!data) return 0;
    return data.kpis.calls_5m - data.kpis.calls_5m_prev;
  }, [data]);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tempo real</h1>
          <p className="text-sm text-neutral-400 mt-1 flex items-center gap-2">
            <span className="relative inline-flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  pollingPaused ? "bg-neutral-500" : "bg-emerald-400 animate-ping"
                }`}
              />
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  pollingPaused ? "bg-neutral-500" : "bg-emerald-500"
                }`}
              />
            </span>
            {pollingPaused ? (
              <span className="font-mono text-xs text-neutral-500">
                Pausado · aba inativa
              </span>
            ) : (
              <span className="font-mono text-xs text-emerald-400">
                Atualizando ao vivo · last update:{" "}
                {lastUpdate
                  ? lastUpdate.toLocaleTimeString("pt-BR", { hour12: false })
                  : "—"}
              </span>
            )}
          </p>
        </div>
        {error && (
          <span className="text-xs font-mono text-red-400">erro: {error}</span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Kpi
          label="Chamadas (últ. 5min)"
          value={data ? data.kpis.calls_5m.toLocaleString("pt-BR") : "—"}
          sub={
            data
              ? `${calls5mDelta >= 0 ? "+" : ""}${calls5mDelta} vs 5min anterior`
              : undefined
          }
          deltaPositive={calls5mDelta >= 0}
          icon={Activity}
          accent="violet"
        />
        <Kpi
          label="Custo USD (últ. 1h)"
          value={data ? `$${data.kpis.cost_usd_1h.toFixed(4)}` : "—"}
          icon={DollarSign}
          accent="amber"
          sparkline={data ? data.chart.map((p) => p.cost_usd) : undefined}
        />
        <Kpi
          label="Tokens / segundo"
          value={data ? data.kpis.tokens_per_second.toFixed(1) : "—"}
          sub="média rolling 60s"
          icon={Zap}
          accent="emerald"
        />
        <Kpi
          label="Usuários ativos agora"
          value={data ? data.kpis.active_users_10m.toLocaleString("pt-BR") : "—"}
          sub="distinct nos últ. 10min"
          icon={UsersIcon}
          accent="indigo"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-300">
              Custo $USD por minuto · últimas 60min
            </h2>
            <span className="text-[10px] font-mono text-neutral-500">
              {data
                ? `total: $${data.kpis.cost_usd_1h.toFixed(4)}`
                : "carregando…"}
            </span>
          </div>
          <CostChart points={data?.chart ?? []} />
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 overflow-hidden flex flex-col max-h-[640px]">
          <div className="px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-300">
              Feed live
            </h2>
            <span className="text-[10px] font-mono text-neutral-500">
              {data?.recent_calls.length ?? 0} chamadas
            </span>
          </div>
          <div
            ref={feedRef}
            className="flex-1 overflow-y-auto divide-y divide-neutral-800/60"
          >
            {!data ? (
              <div className="p-6 text-center text-xs text-neutral-500">
                Carregando…
              </div>
            ) : data.recent_calls.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-500">
                Nenhuma chamada recente. Assim que `ai_usage_log` receber inserts, o feed acende.
              </div>
            ) : (
              data.recent_calls.map((call) => (
                <FeedItem key={call.id} call={call} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  sparkline,
  deltaPositive,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "violet" | "amber" | "emerald" | "indigo";
  sparkline?: number[];
  deltaPositive?: boolean;
}) {
  const accentClass = {
    violet: "text-violet-400",
    amber: "text-amber-400",
    emerald: "text-emerald-400",
    indigo: "text-indigo-400",
  }[accent ?? "violet"];

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 relative overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono">
          {label}
        </p>
        <Icon className={`h-3.5 w-3.5 ${accentClass}`} />
      </div>
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
      {sparkline && sparkline.length > 0 && (
        <Sparkline values={sparkline} className={accentClass} />
      )}
    </div>
  );
}

function Sparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  const W = 200;
  const H = 28;
  const max = Math.max(...values, 0.000001);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = W / Math.max(values.length - 1, 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = H - ((v - min) / range) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={`mt-2 w-full h-7 ${className}`}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.8"
      />
    </svg>
  );
}

function CostChart({ points }: { points: { minute: string; cost_usd: number }[] }) {
  const W = 800;
  const H = 220;
  const PAD_L = 40;
  const PAD_R = 8;
  const PAD_T = 12;
  const PAD_B = 24;

  if (points.length === 0) {
    return (
      <div className="h-[220px] flex items-center justify-center text-xs text-neutral-600 font-mono">
        sem dados ainda
      </div>
    );
  }

  const max = Math.max(...points.map((p) => p.cost_usd), 0.000001);
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const step = innerW / Math.max(points.length - 1, 1);

  const linePoints = points
    .map((p, i) => {
      const x = PAD_L + i * step;
      const y = PAD_T + (1 - p.cost_usd / max) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const areaPath =
    `M ${PAD_L},${PAD_T + innerH} ` +
    points
      .map((p, i) => {
        const x = PAD_L + i * step;
        const y = PAD_T + (1 - p.cost_usd / max) * innerH;
        return `L ${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") +
    ` L ${PAD_L + (points.length - 1) * step},${PAD_T + innerH} Z`;

  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = (max * (yTicks - i)) / yTicks;
    const y = PAD_T + (i / yTicks) * innerH;
    return { v, y };
  });

  const xTickEvery = Math.max(1, Math.floor(points.length / 6));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-[220px]"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="rt-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(167 139 250)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="rgb(167 139 250)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {yLabels.map((t, i) => (
        <g key={i}>
          <line
            x1={PAD_L}
            y1={t.y}
            x2={W - PAD_R}
            y2={t.y}
            stroke="rgb(38 38 38)"
            strokeDasharray="2 3"
          />
          <text
            x={PAD_L - 6}
            y={t.y + 3}
            textAnchor="end"
            fill="rgb(115 115 115)"
            fontSize="9"
            fontFamily="ui-monospace, monospace"
          >
            ${t.v.toFixed(4)}
          </text>
        </g>
      ))}

      <path d={areaPath} fill="url(#rt-area)" />
      <polyline
        points={linePoints}
        fill="none"
        stroke="rgb(167 139 250)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {points.map((p, i) => {
        if (i % xTickEvery !== 0) return null;
        const x = PAD_L + i * step;
        const d = new Date(p.minute);
        const label = d.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        return (
          <text
            key={i}
            x={x}
            y={H - 6}
            textAnchor="middle"
            fill="rgb(115 115 115)"
            fontSize="9"
            fontFamily="ui-monospace, monospace"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

function FeedItem({ call }: { call: Call }) {
  const initials = (call.user_name ?? call.user_email ?? "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const endpointColor =
    call.endpoint === "generate" ||
    call.endpoint.startsWith("flashcards") ||
    call.endpoint.startsWith("quiz") ||
    call.endpoint.startsWith("mindmap")
      ? "bg-violet-950/60 text-violet-300"
      : call.endpoint.startsWith("chat") || call.endpoint.includes("chat")
        ? "bg-emerald-950/60 text-emerald-300"
        : call.endpoint.includes("imagen") || call.endpoint.includes("image")
          ? "bg-amber-950/60 text-amber-300"
          : "bg-neutral-800 text-neutral-400";

  return (
    <div className="px-3 py-2.5 flex items-start gap-2.5 hover:bg-neutral-900/60">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-[10px] font-mono font-semibold text-white">
        {initials || "?"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-medium truncate">
            {call.user_name ?? call.user_email ?? "anônimo"}
          </span>
          <span className="text-[9px] font-mono text-neutral-500 shrink-0">
            {relativeTime(call.created_at)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${endpointColor}`}
          >
            {call.endpoint}
          </span>
          <span className="text-[10px] font-mono text-neutral-500 truncate">
            {call.model}
          </span>
          <span className="text-[10px] font-mono text-amber-400 ml-auto tabular-nums">
            ${call.cost_usd.toFixed(4)}
          </span>
        </div>
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 5) return "agora";
  if (diff < 60) return `${Math.floor(diff)}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return new Date(iso).toLocaleDateString("pt-BR");
}
