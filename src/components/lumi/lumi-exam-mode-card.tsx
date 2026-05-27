"use client";

/**
 * Card visual rico do "Modo Prova".
 * Renderizado quando a tool `iniciar_modo_prova` retorna com sucesso.
 * Mostra: 3 assets gerados (resumo + flashcards + quiz) + cronograma de blocos.
 */

import {
  BookOpen,
  Brain,
  Coffee,
  FileText,
  HelpCircle,
  Layers,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

type Asset = {
  sucesso?: boolean;
  titulo?: string;
  url?: string;
};

type Bloco = {
  ordem: number;
  duracao_min: number;
  atividade: string;
  tipo: "resumo" | "flashcards" | "quiz" | "pausa";
};

type ExamModeOutput = {
  sucesso?: boolean;
  materia?: string;
  data_prova?: string;
  horas_disponiveis?: number;
  topicos_foco?: string[];
  assets?: {
    resumo?: Asset;
    flashcards?: Asset;
    quiz?: Asset;
  };
  cronograma?: Bloco[];
  total_coins_cobrados?: number;
  error?: string;
};

const TIPO_META: Record<
  Bloco["tipo"],
  { Icon: typeof FileText; color: string; bg: string }
> = {
  resumo: {
    Icon: FileText,
    color: "text-violet-500",
    bg: "bg-violet-500/10",
  },
  flashcards: {
    Icon: Layers,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  quiz: {
    Icon: HelpCircle,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  pausa: {
    Icon: Coffee,
    color: "text-muted-foreground",
    bg: "bg-secondary/40",
  },
};

export function LumiExamModeCard({ output }: { output: ExamModeOutput }) {
  if (output.error || !output.sucesso) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
        <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
          Modo Prova falhou
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {output.error ?? "Erro desconhecido."}
        </p>
      </div>
    );
  }

  const assets = output.assets ?? {};
  const cronograma = output.cronograma ?? [];
  const topicos = output.topicos_foco ?? [];

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-fuchsia-500/5 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-fuchsia-500 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-widest text-primary">
              Modo Prova ativo
            </div>
            <div className="text-base font-semibold leading-tight">
              {output.materia ?? "Matéria"} · {output.data_prova ?? "—"}
            </div>
          </div>
          <div className="ml-auto text-right shrink-0">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Plano
            </div>
            <div className="text-sm font-semibold tabular-nums">
              {output.horas_disponiveis ?? 3}h
            </div>
          </div>
        </div>
        {topicos.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {topicos.map((t) => (
              <span
                key={t}
                className="inline-flex items-center text-[10px] font-mono px-2 py-0.5 rounded-full bg-secondary/60 text-foreground/80"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 3 assets gerados — grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3">
        <AssetTile
          asset={assets.resumo}
          fallbackLabel="Resumo"
          Icon={FileText}
          color="text-violet-500"
          bg="bg-violet-500/10"
        />
        <AssetTile
          asset={assets.flashcards}
          fallbackLabel="Flashcards"
          Icon={Layers}
          color="text-emerald-500"
          bg="bg-emerald-500/10"
        />
        <AssetTile
          asset={assets.quiz}
          fallbackLabel="Quiz"
          Icon={HelpCircle}
          color="text-amber-500"
          bg="bg-amber-500/10"
        />
      </div>

      {/* Cronograma */}
      {cronograma.length > 0 && (
        <div className="border-t border-border/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="h-3.5 w-3.5 text-primary" />
            <h4 className="text-xs font-mono uppercase tracking-wider text-foreground">
              Cronograma sugerido
            </h4>
          </div>
          <ol className="space-y-2">
            {cronograma.map((b) => {
              const meta = TIPO_META[b.tipo];
              const Icon = meta.Icon;
              return (
                <li
                  key={b.ordem}
                  className="flex items-center gap-3 text-xs"
                >
                  <div
                    className={`h-7 w-7 shrink-0 rounded-md flex items-center justify-center ${meta.bg}`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground/90 truncate">
                      {b.atividade}
                    </div>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-muted-foreground shrink-0">
                    {b.duracao_min}min
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Footer */}
      {typeof output.total_coins_cobrados === "number" &&
        output.total_coins_cobrados > 0 && (
          <div className="border-t border-border/40 px-4 py-2 bg-card/50 text-[10px] font-mono text-muted-foreground flex items-center justify-between">
            <span>Total cobrado</span>
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              {output.total_coins_cobrados} coins
            </span>
          </div>
        )}
    </div>
  );
}

function AssetTile({
  asset,
  fallbackLabel,
  Icon,
  color,
  bg,
}: {
  asset: Asset | undefined;
  fallbackLabel: string;
  Icon: typeof FileText;
  color: string;
  bg: string;
}) {
  const ok = !!(asset?.sucesso && asset?.url);
  const Comp: typeof Link | "div" = ok ? Link : "div";
  const commonClass =
    "block rounded-lg border p-3 transition-colors " +
    (ok
      ? "border-border/60 bg-card hover:border-primary/40 cursor-pointer"
      : "border-border/40 bg-card/40 opacity-60");

  return (
    <Comp
      // @ts-expect-error — href só existe quando Comp = Link
      href={ok ? asset?.url : undefined}
      className={commonClass}
    >
      <div className="flex items-start gap-2">
        <div
          className={`h-8 w-8 shrink-0 rounded-md flex items-center justify-center ${bg}`}
        >
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {fallbackLabel}
          </div>
          <div className="text-xs font-medium truncate mt-0.5">
            {asset?.titulo ?? (ok ? fallbackLabel : "Falhou")}
          </div>
          {ok && (
            <div className="text-[10px] text-primary font-medium mt-1">
              Abrir →
            </div>
          )}
        </div>
      </div>
    </Comp>
  );
}
