"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Layers,
  Loader2,
  Network,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  type AssetJob,
  type AssetJobKind,
  clearDoneJobs,
  jobKindLabel,
  removeJob,
  subscribeJobs,
} from "@/lib/asset-jobs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<
  AssetJobKind,
  { Icon: typeof FileText; tone: string }
> = {
  summary: {
    Icon: FileText,
    tone: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
  flashcards: {
    Icon: Layers,
    tone: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
  },
  quiz: {
    Icon: Sparkles,
    tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  mindmap: {
    Icon: Network,
    tone: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  },
};

function elapsed(startedAt: string): string {
  const diff = Date.now() - new Date(startedAt).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  return `${h}h`;
}

export function JobsTray() {
  const [jobs, setJobs] = useState<AssetJob[]>([]);
  const [open, setOpen] = useState(false);
  const [, forceTick] = useState(0);

  useEffect(() => subscribeJobs(setJobs), []);

  // Re-render leve a cada segundo enquanto há jobs rodando, pra atualizar "12s..."
  useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === "running");
    if (!hasRunning) return;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [jobs]);

  const runningCount = jobs.filter((j) => j.status === "running").length;
  const doneCount = jobs.filter((j) => j.status === "done").length;
  const errorCount = jobs.filter((j) => j.status === "error").length;

  if (jobs.length === 0) return null;

  const badgeTone =
    runningCount > 0
      ? "bg-primary text-primary-foreground"
      : errorCount > 0
        ? "bg-rose-500 text-white"
        : "bg-emerald-500 text-white";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Tarefas em andamento"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-card hover:bg-secondary/40 transition-colors"
        >
          {runningCount > 0 ? (
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
          ) : errorCount > 0 ? (
            <AlertCircle className="h-4 w-4 text-rose-500" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          )}
          <span
            className={cn(
              "absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full text-[10px] font-semibold inline-flex items-center justify-center tabular-nums",
              badgeTone,
            )}
          >
            {runningCount > 0 ? runningCount : doneCount + errorCount}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0"
      >
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/60">
          <div className="text-sm font-semibold">Tarefas</div>
          {(doneCount > 0 || errorCount > 0) && (
            <button
              type="button"
              onClick={() => clearDoneJobs()}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" /> Limpar finalizadas
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {jobs.map((j) => {
            const { Icon, tone } = KIND_ICON[j.kind];
            return (
              <div
                key={j.id}
                className="group flex items-start gap-3 px-3 py-2.5 hover:bg-secondary/40 transition-colors"
              >
                <div
                  className={cn(
                    "h-9 w-9 shrink-0 rounded-lg flex items-center justify-center",
                    tone,
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={2.2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium truncate">
                      {jobKindLabel(j.kind)}: {j.title}
                    </div>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                    {j.status === "running" && (
                      <>
                        <Loader2 className="h-3 w-3 text-primary animate-spin" />
                        <span className="text-primary font-medium">
                          Gerando…
                        </span>
                        <span className="text-muted-foreground">
                          {elapsed(j.startedAt)}
                        </span>
                      </>
                    )}
                    {j.status === "done" && (
                      <>
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          Pronto
                        </span>
                        {j.preview && (
                          <span className="text-muted-foreground truncate">
                            · {j.preview}
                          </span>
                        )}
                      </>
                    )}
                    {j.status === "error" && (
                      <>
                        <AlertCircle className="h-3 w-3 text-rose-500" />
                        <span className="text-rose-600 dark:text-rose-400 font-medium truncate">
                          Erro: {j.errorMsg}
                        </span>
                      </>
                    )}
                  </div>
                  {j.status === "done" && j.resultHref && (
                    <Link
                      href={j.resultHref}
                      onClick={() => setOpen(false)}
                      className="mt-1.5 inline-flex items-center text-[11px] text-primary font-medium hover:underline"
                    >
                      Abrir →
                    </Link>
                  )}
                </div>
                {j.status !== "running" && (
                  <button
                    type="button"
                    onClick={() => removeJob(j.id)}
                    title="Remover da lista"
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-secondary"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
