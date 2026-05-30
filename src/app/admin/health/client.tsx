"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Brain,
  CheckCircle2,
  CircleDollarSign,
  DollarSign,
  Image as ImageIcon,
  Loader2,
  Mic,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

type FeatureKey =
  | "features.tts.enabled"
  | "features.imagen.enabled"
  | "features.ai_generate.enabled";

type ProviderKey = "anthropic" | "openai" | "google_ai" | "elevenlabs" | "other";

type ProviderRow = {
  provider: ProviderKey;
  usd24h: number;
  calls24h: number;
  usdMtd: number;
  /** Saldo restante em USD via Admin API (null se não configurado). */
  remainingUsd: number | null;
  /** Gasto MTD reportado pela Admin API do provider (null se não configurado). */
  usageMtdReportedUsd: number | null;
  fetchedAt: string | null;
};

type HealthStats = {
  capUsd: number;
  totalUsd24h: number;
  totalUsd7d: number;
  totalUsdMtd: number;
  voiceReplies24h: number;
  imagesGenerated24h: number;
  capHits24h: number;
  topSpenders: Array<{
    userId: string;
    email: string | null;
    usd: number;
    pctOfCap: number;
  }>;
  byEndpoint: Array<{ endpoint: string; usd: number; calls: number }>;
  providers: ProviderRow[];
  flags: Record<FeatureKey, boolean>;
  elevenlabs: {
    remaining_chars?: number;
    remaining_usd?: number;
    used_chars?: number;
    total_chars?: number;
    tier?: string;
  } | null;
  snapshotFetchedAt: string | null;
  alertThresholdUsd: number;
  lastAlert: {
    iso?: string;
    usd?: number;
    threshold?: number;
  } | null;
  fetchedAt: string;
};

const PROVIDER_META: Record<ProviderKey, { label: string; sub: string }> = {
  anthropic: { label: "Anthropic", sub: "Claude (Opus/Sonnet/Haiku)" },
  openai: { label: "OpenAI", sub: "GPT + GPT Image" },
  google_ai: { label: "Google AI", sub: "Gemini" },
  elevenlabs: { label: "ElevenLabs", sub: "Voice (TTS)" },
  other: { label: "Outros", sub: "Não classificado" },
};

type PricingSuggestion = {
  endpoint: string;
  coinKey?: string;
  calls: number;
  avgCostUsd: number;
  avgCostBrl: number;
  currentCoins: number | "dynamic";
  currentRevenueBrl: number;
  marginPct: number;
  status: "ok" | "warning" | "critical";
  suggestedCoins?: number;
  note: string;
};

type PricingResponse = {
  windowDays: number;
  coinBrlValue: number;
  targetMargin: number;
  suggestions: PricingSuggestion[];
};

const FEATURES: Array<{ key: FeatureKey; label: string; icon: typeof Mic; description: string }> = [
  {
    key: "features.tts.enabled",
    label: "Respostas por voz",
    icon: Mic,
    description: "ElevenLabs TTS. Desligue se o custo de voz disparar.",
  },
  {
    key: "features.imagen.enabled",
    label: "Geração de imagens",
    icon: ImageIcon,
    description: "OpenAI GPT Image em alta qualidade — endpoint mais caro.",
  },
  {
    key: "features.ai_generate.enabled",
    label: "Geração IA (wizard)",
    icon: Brain,
    description: "Claude Sonnet/Haiku via /api/ai/generate. Pra emergência total.",
  },
];

export function HealthDashboard() {
  const [stats, setStats] = useState<HealthStats | null>(null);
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState<FeatureKey | null>(null);
  const [runningCron, setRunningCron] = useState(false);

  const fetchStats = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const [statsResp, pricingResp] = await Promise.all([
        fetch("/api/admin/health-stats", { cache: "no-store" }),
        fetch("/api/admin/pricing-suggestions", { cache: "no-store" }),
      ]);
      if (!statsResp.ok) {
        if (statsResp.status === 401 || statsResp.status === 403) {
          toast.error("Apenas admin.");
        } else {
          toast.error("Erro ao carregar estatísticas.");
        }
        return;
      }
      const data = (await statsResp.json()) as HealthStats;
      setStats(data);
      if (pricingResp.ok) {
        const pData = (await pricingResp.json()) as PricingResponse;
        setPricing(pData);
      }
    } catch (err) {
      toast.error(`Falha: ${(err as Error).message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const runCronNow = useCallback(async () => {
    setRunningCron(true);
    try {
      const resp = await fetch("/api/cron/health-check", { cache: "no-store" });
      if (!resp.ok) {
        toast.error("Falha ao rodar health check.");
        return;
      }
      toast.success("Health check rodado. Snapshot atualizado.");
      await fetchStats(true);
    } catch (err) {
      toast.error(`Falha: ${(err as Error).message}`);
    } finally {
      setRunningCron(false);
    }
  }, [fetchStats]);

  useEffect(() => {
    fetchStats(false);
    const id = setInterval(() => fetchStats(true), 30_000);
    return () => clearInterval(id);
  }, [fetchStats]);

  const toggleFeature = useCallback(
    async (key: FeatureKey, next: boolean) => {
      setToggling(key);
      try {
        const resp = await fetch("/api/admin/feature-flags", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key, enabled: next }),
        });
        if (!resp.ok) {
          toast.error("Falha ao atualizar flag.");
          return;
        }
        toast.success(
          next
            ? `${FEATURES.find((f) => f.key === key)?.label} ativada.`
            : `${FEATURES.find((f) => f.key === key)?.label} desativada.`,
        );
        await fetchStats(true);
      } catch (err) {
        toast.error(`Falha: ${(err as Error).message}`);
      } finally {
        setToggling(null);
      }
    },
    [fetchStats],
  );

  if (loading && !stats) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!stats) return null;

  const dailyPct = Math.min(100, Math.round((stats.totalUsd24h / (stats.capUsd * 50)) * 100));
  // 50× cap = teto agregado conservador (assumindo até 50 users ativos no cap)

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
            Saúde & Segurança
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Custos de IA, caps atingidos e kill-switches. Atualiza a cada 30s.
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
          label="Custo IA 24h"
          value={`$${stats.totalUsd24h.toFixed(2)}`}
          sub={`R$ ${(stats.totalUsd24h * 5.5).toFixed(2)} · 7d $${stats.totalUsd7d.toFixed(2)}`}
        />
        <KPICard
          icon={<Mic className="h-4 w-4 text-primary" />}
          label="Voice replies 24h"
          value={stats.voiceReplies24h.toString()}
          sub={`Cap por user: 30/dia`}
        />
        <KPICard
          icon={<ImageIcon className="h-4 w-4 text-fuchsia-500" />}
          label="Imagens IA 24h"
          value={stats.imagesGenerated24h.toString()}
          sub={`~$0.04/img = $${(stats.imagesGenerated24h * 0.04).toFixed(2)}`}
        />
        <KPICard
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          label="Users no cap 24h"
          value={stats.capHits24h.toString()}
          sub={`Cap individual: $${stats.capUsd.toFixed(2)}/dia`}
          alert={stats.capHits24h > 0}
        />
      </div>

      {/* Saldos das APIs + Alerta config */}
      <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-3">
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CircleDollarSign className="h-4 w-4 text-emerald-500" />
              <h2 className="text-sm font-semibold">Saldos das APIs</h2>
            </div>
            <button
              type="button"
              onClick={runCronNow}
              disabled={runningCron}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 px-2 text-[11px] hover:bg-secondary/60 disabled:opacity-50"
            >
              {runningCron ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Atualizar saldos
            </button>
          </div>
          {stats.elevenlabs ? (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs">
                    <span className="font-semibold">ElevenLabs</span>
                    {stats.elevenlabs.tier && (
                      <span className="text-muted-foreground ml-1.5 font-mono">
                        {stats.elevenlabs.tier}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-semibold tabular-nums">
                    ${(stats.elevenlabs.remaining_usd ?? 0).toFixed(2)}
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{
                      width: `${Math.max(2, Math.round((((stats.elevenlabs.total_chars ?? 0) - (stats.elevenlabs.used_chars ?? 0)) / Math.max(1, stats.elevenlabs.total_chars ?? 1)) * 100))}%`,
                    }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
                  <span>{(stats.elevenlabs.used_chars ?? 0).toLocaleString("pt-BR")} usados</span>
                  <span>{(stats.elevenlabs.total_chars ?? 0).toLocaleString("pt-BR")} total</span>
                </div>
              </div>
              {stats.snapshotFetchedAt && (
                <div className="text-[10px] text-muted-foreground">
                  Última atualização:{" "}
                  {new Date(stats.snapshotFetchedAt).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              Saldos ainda não foram carregados. Clica em &quot;Atualizar saldos&quot;.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold">Alerta diário</h2>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Threshold</span>
              <span className="font-mono tabular-nums">${stats.alertThresholdUsd.toFixed(2)}/dia</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email destino</span>
              <span className="font-mono text-[10px] truncate max-w-[150px]">
                gilbertoluporini@gmail.com
              </span>
            </div>
            {stats.lastAlert?.iso ? (
              <div className="mt-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2 text-[11px]">
                <div className="flex items-center gap-1 mb-0.5 font-semibold text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3 w-3" /> Último alerta
                </div>
                <div className="text-muted-foreground">
                  ${stats.lastAlert.usd?.toFixed(2)} em{" "}
                  {new Date(stats.lastAlert.iso).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-2 text-[11px] text-muted-foreground">
                Nenhum alerta enviado ainda.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Gasto agregado bar */}
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm font-semibold">Gasto agregado 24h</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Comparado a um teto conservador de ${(stats.capUsd * 50).toFixed(2)} (cap individual × 50 users)
            </div>
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            ${stats.totalUsd24h.toFixed(2)}
          </div>
        </div>
        <div className="h-3 rounded-full bg-secondary overflow-hidden">
          <div
            className={`h-full transition-all ${
              dailyPct >= 80
                ? "bg-rose-500"
                : dailyPct >= 50
                  ? "bg-amber-500"
                  : "bg-gradient-to-r from-primary to-fuchsia-500"
            }`}
            style={{ width: `${Math.max(2, dailyPct)}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground tabular-nums">
          <span>0%</span>
          <span>{dailyPct}% do teto agregado</span>
          <span>100%</span>
        </div>
      </div>

      {/* Kill-switches */}
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <h2 className="text-sm font-semibold">Kill-switches</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Desligue uma feature em emergência sem precisar fazer deploy. Cache de 30s no servidor.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {FEATURES.map(({ key, label, icon: Icon, description }) => {
            const enabled = stats.flags[key];
            const isToggling = toggling === key;
            return (
              <div
                key={key}
                className={`rounded-xl border p-4 transition-colors ${
                  enabled
                    ? "border-border/60 bg-card"
                    : "border-rose-500/30 bg-rose-500/5"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {label}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFeature(key, !enabled)}
                    disabled={isToggling}
                    className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors ${
                      enabled
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15"
                        : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/15"
                    } disabled:opacity-50`}
                  >
                    {isToggling ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : enabled ? (
                      <PauseCircle className="h-3 w-3" />
                    ) : (
                      <PlayCircle className="h-3 w-3" />
                    )}
                    {enabled ? "Desligar" : "Ligar"}
                  </button>
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  {description}
                </div>
                <div className="mt-2 text-[10px] uppercase tracking-wider font-mono">
                  {enabled ? (
                    <span className="text-emerald-600 dark:text-emerald-400">● Ativa</span>
                  ) : (
                    <span className="text-rose-600 dark:text-rose-400">● Desativada</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custo por provider — tempo real (24h + mês corrente) */}
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <CircleDollarSign className="h-4 w-4 text-emerald-500" />
          <h2 className="text-sm font-semibold">Custo por provider</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Gasto agregado por provedor de IA (calculado a partir do{" "}
          <code className="font-mono">ai_usage_log</code>). Saldo restante
          aparece quando <code className="font-mono">ANTHROPIC_ADMIN_KEY</code>{" "}
          / <code className="font-mono">OPENAI_ADMIN_KEY</code> estão
          configuradas — atualizado pelo cron diário.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(stats.providers ?? [])
            .filter((p) => p.provider !== "other" || p.usd24h > 0 || p.usdMtd > 0)
            .map((p) => {
              const meta = PROVIDER_META[p.provider];
              const hasBalance = typeof p.remainingUsd === "number";
              return (
                <div
                  key={p.provider}
                  className="rounded-xl border border-border/40 bg-background/40 p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {meta.label}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {meta.sub}
                    </div>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <div className="text-xl font-semibold tabular-nums">
                      ${p.usd24h.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">24h</div>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    ${p.usdMtd.toFixed(2)} · mês · {p.calls24h} calls/24h
                  </div>
                  {hasBalance && (
                    <div className="mt-2 pt-2 border-t border-border/30 text-[11px]">
                      <span className="text-muted-foreground">Saldo: </span>
                      <span className="font-semibold tabular-nums">
                        ${(p.remainingUsd ?? 0).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {!hasBalance && p.provider !== "elevenlabs" && p.provider !== "other" && (
                    <div className="mt-2 pt-2 border-t border-border/30 text-[10px] text-muted-foreground">
                      Configure {p.provider === "anthropic" ? "ANTHROPIC_ADMIN_KEY" : p.provider === "openai" ? "OPENAI_ADMIN_KEY" : "GOOGLE_AI_ADMIN_KEY"} pra ver saldo
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* Top spenders + Endpoints */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Top spenders (24h)</h2>
          </div>
          {stats.topSpenders.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem uso AI nas últimas 24h.</p>
          ) : (
            <div className="space-y-2">
              {stats.topSpenders.map((s) => (
                <div
                  key={s.userId}
                  className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">
                      {s.email ?? s.userId}
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={`h-full ${
                          s.pctOfCap >= 100
                            ? "bg-rose-500"
                            : s.pctOfCap >= 70
                              ? "bg-amber-500"
                              : "bg-primary"
                        }`}
                        style={{ width: `${Math.max(2, s.pctOfCap)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold tabular-nums">
                      ${s.usd.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      {s.pctOfCap}% do cap
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-fuchsia-500" />
            <h2 className="text-sm font-semibold">Custo por endpoint (24h)</h2>
          </div>
          {/* placeholder anchor */}
          {stats.byEndpoint.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem chamadas AI nas últimas 24h.</p>
          ) : (
            <div className="space-y-2">
              {stats.byEndpoint.map((e) => (
                <div
                  key={e.endpoint}
                  className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-foreground truncate">
                      {e.endpoint}
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      {e.calls} chamadas
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums">
                    ${e.usd.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sugestões de pricing baseadas em uso real 30d */}
      {pricing && pricing.suggestions.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold">Sugestões de preço (30d)</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Custo médio real por chamada, comparado ao preço em coins. Margem alvo: {Math.round(pricing.targetMargin * 100)}% · 1 coin = R$
            {pricing.coinBrlValue.toFixed(3)} (referência Power).
          </p>
          <div className="space-y-2">
            {pricing.suggestions.map((s) => {
              const statusColor =
                s.status === "ok"
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                  : s.status === "warning"
                    ? "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
                    : "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300";
              const Icon =
                s.status === "ok"
                  ? CheckCircle2
                  : s.status === "warning"
                    ? AlertTriangle
                    : AlertTriangle;
              return (
                <div
                  key={s.endpoint}
                  className={`rounded-xl border p-3 ${statusColor}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-mono text-xs truncate">
                          {s.endpoint}
                        </span>
                        <span className="text-[10px] opacity-70">
                          {s.calls} calls
                        </span>
                      </div>
                      <div className="text-[11px] opacity-90">{s.note}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs">
                        custo:{" "}
                        <span className="font-mono tabular-nums">
                          R${s.avgCostBrl.toFixed(3)}
                        </span>
                      </div>
                      <div className="text-xs">
                        receita:{" "}
                        <span className="font-mono tabular-nums">
                          R${s.currentRevenueBrl.toFixed(3)}
                        </span>
                      </div>
                      <div className="text-sm font-semibold mt-0.5 tabular-nums">
                        {s.marginPct.toFixed(0)}%
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function KPICard({
  icon,
  label,
  value,
  sub,
  alert,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        alert ? "border-amber-500/40 bg-amber-500/5" : "border-border/60 bg-card"
      }`}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        {icon} {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}
