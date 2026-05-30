"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Images, Loader2, Minus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type {
  CoveragePost,
  CoverageResponse,
} from "@/app/api/admin/marketing/coverage/route";
import { cn } from "@/lib/utils";

type FilterMode = "all" | "incomplete" | "complete";

const NETWORK_BADGE: Record<string, string> = {
  instagram: "bg-pink-500/20 text-pink-200 border-pink-500/30",
  facebook: "bg-blue-500/20 text-blue-200 border-blue-500/30",
  x: "bg-neutral-700/40 text-neutral-200 border-neutral-500/40",
  linkedin: "bg-sky-500/20 text-sky-200 border-sky-500/30",
};

function formatScheduledFor(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function CoverageCell({ has }: { has: boolean }) {
  return (
    <div className="flex items-center justify-center">
      {has ? (
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
          title="presente"
        >
          <Check className="h-3.5 w-3.5" />
        </div>
      ) : (
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-800 text-neutral-500 ring-1 ring-neutral-700"
          title="faltando"
        >
          <Minus className="h-3.5 w-3.5" />
        </div>
      )}
    </div>
  );
}

export function CoverageClient() {
  const [data, setData] = useState<CoverageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");

  const fetchCoverage = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/marketing/coverage", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as CoverageResponse;
      setData(json);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "erro desconhecido";
      toast.error(`Falha ao carregar cobertura: ${msg}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCoverage();
  }, [fetchCoverage]);

  const filtered = useMemo<CoveragePost[]>(() => {
    if (!data) return [];
    if (filter === "all") return data.posts;
    if (filter === "incomplete")
      return data.posts.filter(
        (p) => !p.has_landscape || !p.has_portrait || !p.has_story,
      );
    return data.posts.filter(
      (p) => p.has_landscape && p.has_portrait && p.has_story,
    );
  }, [data, filter]);

  if (loading && !data) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-neutral-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando cobertura…
      </div>
    );
  }

  if (!data) return null;

  const { total, totals } = data;
  const pct = (n: number) => Math.round((n / total) * 100);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-neutral-100">
            <Images className="h-6 w-6 text-fuchsia-300" />
            Cobertura de mídias
          </h1>
          <p className="text-sm text-neutral-400">
            Quais formatos de imagem cada post tem no filesystem. Atualiza ao
            vivo (não depende do último sync).
          </p>
        </div>
        <button
          onClick={() => fetchCoverage(true)}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 transition hover:bg-neutral-800 disabled:opacity-50"
        >
          <RefreshCw
            className={cn("h-4 w-4", refreshing && "animate-spin")}
          />
          Atualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <KpiCard label="Posts totais" value={String(total)} />
        <KpiCard
          label="Landscape (16:9)"
          value={`${totals.has_landscape}/${total}`}
          hint={`${pct(totals.has_landscape)}%`}
        />
        <KpiCard
          label="Portrait (4:5)"
          value={`${totals.has_portrait}/${total}`}
          hint={`${pct(totals.has_portrait)}%`}
        />
        <KpiCard
          label="Story (9:16)"
          value={`${totals.has_story}/${total}`}
          hint={`${pct(totals.has_story)}%`}
        />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-neutral-400">Mostrar:</span>
        {(["all", "incomplete", "complete"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setFilter(mode)}
            className={cn(
              "rounded-md border px-3 py-1.5 transition",
              filter === mode
                ? "border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-100"
                : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800",
            )}
          >
            {mode === "all"
              ? "Todos"
              : mode === "incomplete"
                ? "Incompletos"
                : "Completos"}
          </button>
        ))}
        <span className="ml-auto text-xs text-neutral-500">
          {filtered.length} {filtered.length === 1 ? "post" : "posts"}
        </span>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60 text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Post</th>
              <th className="px-3 py-2 text-left font-medium">Redes</th>
              <th className="px-3 py-2 text-center font-medium">1×1</th>
              <th className="px-3 py-2 text-center font-medium">Landscape</th>
              <th className="px-3 py-2 text-center font-medium">Portrait</th>
              <th className="px-3 py-2 text-center font-medium">Story</th>
              <th className="px-3 py-2 text-center font-medium">Slides+</th>
              <th className="px-3 py-2 text-left font-medium">Agendado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {filtered.map((p) => (
              <tr
                key={p.slug}
                className="hover:bg-neutral-900/40 transition"
              >
                <td className="px-3 py-2">
                  <div className="font-mono text-xs text-neutral-500">
                    {p.slug}
                  </div>
                  <div className="text-neutral-200">{p.title}</div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {p.networks.map((n) => (
                      <span
                        key={n}
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[10px] uppercase",
                          NETWORK_BADGE[n] ||
                            "bg-neutral-800 text-neutral-300 border-neutral-700",
                        )}
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <CoverageCell has={p.has_1x1} />
                </td>
                <td className="px-3 py-2">
                  <CoverageCell has={p.has_landscape} />
                </td>
                <td className="px-3 py-2">
                  <CoverageCell has={p.has_portrait} />
                </td>
                <td className="px-3 py-2">
                  <CoverageCell has={p.has_story} />
                </td>
                <td className="px-3 py-2 text-center text-neutral-400">
                  {p.slides_extra > 0 ? `+${p.slides_extra}` : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-neutral-400">
                  {formatScheduledFor(p.scheduled_for)}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-neutral-500"
                >
                  Nenhum post nesta categoria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-400">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-2xl font-semibold text-neutral-100">{value}</div>
        {hint && <div className="text-xs text-neutral-500">{hint}</div>}
      </div>
    </div>
  );
}
