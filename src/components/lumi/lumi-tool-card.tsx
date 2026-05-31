"use client";

/**
 * Card visual mostrando uma tool execution do Lumi agent.
 * Renderizado inline no chat enquanto a turn está rodando.
 */

import {
  BarChart3,
  BookOpen,
  Brain,
  Calendar,
  Check,
  CheckCircle2,
  FileText,
  HelpCircle,
  Layers,
  Library,
  Loader2,
  Navigation,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { LumiExamModeCard } from "./lumi-exam-mode-card";

type ToolStatus = "running" | "done" | "error";

const TOOL_META: Record<
  string,
  { label: string; Icon: typeof Search; color: string }
> = {
  listar_materias: {
    label: "Listando matérias",
    Icon: Library,
    color: "text-sky-500",
  },
  listar_aulas_e_docs: {
    label: "Procurando seu material",
    Icon: BookOpen,
    color: "text-sky-500",
  },
  buscar_no_material: {
    label: "Buscando no seu conteúdo",
    Icon: Search,
    color: "text-violet-500",
  },
  gerar_resumo: {
    label: "Gerando resumo",
    Icon: FileText,
    color: "text-violet-500",
  },
  criar_flashcards: {
    label: "Criando flashcards",
    Icon: Layers,
    color: "text-emerald-500",
  },
  criar_quiz: {
    label: "Criando quiz",
    Icon: HelpCircle,
    color: "text-amber-500",
  },
  criar_mapa_mental: {
    label: "Desenhando mapa mental",
    Icon: Brain,
    color: "text-rose-500",
  },
  iniciar_modo_prova: {
    label: "Preparando Modo Prova",
    Icon: Sparkles,
    color: "text-fuchsia-500",
  },
  abrir_rota: {
    label: "Abrindo página",
    Icon: Navigation,
    color: "text-fuchsia-500",
  },
  marcar_item_plano: {
    label: "Atualizando trilha",
    Icon: CheckCircle2,
    color: "text-emerald-500",
  },
  meu_progresso: {
    label: "Conferindo seu progresso",
    Icon: BarChart3,
    color: "text-sky-500",
  },
  agendar_no_calendario: {
    label: "Agendando no calendário",
    Icon: Calendar,
    color: "text-fuchsia-500",
  },
};

export function LumiToolCard({
  name,
  status,
  output,
}: {
  name: string;
  status: ToolStatus;
  input?: Record<string, unknown>;
  output?: unknown;
}) {
  const meta = TOOL_META[name] ?? {
    label: name,
    Icon: Search,
    color: "text-muted-foreground",
  };
  const Icon = meta.Icon;

  // Caso especial: Modo Prova rico
  if (name === "iniciar_modo_prova" && status === "done") {
    return (
      <LumiExamModeCard
        output={(output ?? {}) as Parameters<typeof LumiExamModeCard>[0]["output"]}
      />
    );
  }

  // Tenta extrair info útil do output pra mostrar
  const detail = describeOutput(name, output);
  const assetUrl =
    output && typeof output === "object" && "url" in (output as object)
      ? (output as { url?: string }).url
      : undefined;
  const assetTitle =
    output && typeof output === "object" && "titulo" in (output as object)
      ? (output as { titulo?: string }).titulo
      : undefined;
  const navPath =
    output && typeof output === "object" && "navegacao" in (output as object)
      ? ((output as { navegacao?: { path?: string; motivo?: string } })
          .navegacao?.path ?? undefined)
      : undefined;

  // Card "ação executada com asset" — destaque maior
  if (status === "done" && assetUrl) {
    return (
      <Link
        href={assetUrl}
        className="block rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-fuchsia-500/5 p-3 hover:border-primary/60 transition-all"
      >
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-card flex items-center justify-center shadow-sm">
            <Icon className={`h-4 w-4 ${meta.color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              {meta.label}
            </div>
            <div className="text-sm font-semibold truncate mt-0.5">
              {assetTitle ?? "Asset gerado"}
            </div>
            <div className="text-[11px] text-primary mt-1 font-medium">
              Abrir →
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // Card de navegação (abrir_rota)
  if (status === "done" && navPath) {
    return (
      <Link
        href={navPath}
        className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 hover:border-primary/40 transition-colors"
      >
        <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
        <span className="text-xs font-medium">Ir pra {navPath}</span>
      </Link>
    );
  }

  // Card "info/busca" — compacto, sem link
  return (
    <div
      className={`rounded-lg border px-3 py-2 inline-flex items-center gap-2 ${
        status === "error"
          ? "border-rose-500/30 bg-rose-500/5"
          : "border-border/50 bg-card/60"
      }`}
    >
      {status === "running" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : status === "error" ? (
        <X className="h-3.5 w-3.5 text-rose-500" />
      ) : (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      )}
      <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
      <span className="text-xs font-medium">{meta.label}</span>
      {detail && (
        <span className="text-[11px] text-muted-foreground">— {detail}</span>
      )}
    </div>
  );
}

function describeOutput(name: string, output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  if ("error" in o) return String(o.error).slice(0, 80);
  if (name === "listar_materias" && Array.isArray(o.materias)) {
    return `${o.materias.length} matéria${o.materias.length === 1 ? "" : "s"}`;
  }
  if (name === "listar_aulas_e_docs") {
    const a = Array.isArray(o.aulas) ? o.aulas.length : 0;
    const d = Array.isArray(o.documentos) ? o.documentos.length : 0;
    return `${a} aula${a === 1 ? "" : "s"} · ${d} doc${d === 1 ? "" : "s"}`;
  }
  if (name === "buscar_no_material") {
    const n = typeof o.encontrados === "number" ? o.encontrados : 0;
    return `${n} trecho${n === 1 ? "" : "s"}`;
  }
  if ("coins_cobrados" in o) {
    const c = Number(o.coins_cobrados);
    if (Number.isFinite(c) && c > 0) return `${c} coins`;
  }
  return null;
}
