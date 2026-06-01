"use client";

/**
 * /materia/[id]/mapa — Mapa Mental Incremental por Matéria.
 *
 * Renderiza o mapa persistente da matéria (subject_mind_maps), atualizado em
 * background a cada aula nova. SVG manual com layout radial (sem libs extras
 * — reactflow/xyflow/dagre não estão no package.json e não vamos instalar).
 *
 * Layout: central node = matéria; demais nodes distribuídos em órbitas
 * concêntricas por "ordem de chegada" no array. Edges renderizadas como
 * linhas finas entre os centros dos nodes.
 *
 * Click em node → painel lateral com label/tipo/importância.
 */

import { use, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Sparkles, X } from "lucide-react";
import Link from "next/link";

import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSubjectAsync } from "@/lib/db";
import type { Subject, User } from "@/lib/types";

type MindMapNode = {
  id: string;
  label: string;
  type?: string;
  importance?: number;
};
type MindMapEdge = { from: string; to: string; label?: string };
type MindMapStructure = { nodes: MindMapNode[]; edges: MindMapEdge[] };

type MindMapResponse = {
  structure: MindMapStructure;
  version: number;
  last_updated_lecture_id?: string | null;
  updated_at?: string;
  empty?: boolean;
};

type PositionedNode = MindMapNode & { x: number; y: number; r: number };

export default function MapaMateriaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <MapaView user={user} subjectId={id} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function MapaView({ user, subjectId }: { user: User; subjectId: string }) {
  const [subject, setSubject] = useState<Subject | null>(null);
  const [data, setData] = useState<MindMapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MindMapNode | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [subj, mapResp] = await Promise.all([
          getSubjectAsync(user.id, subjectId),
          fetch(`/api/subjects/${subjectId}/mind-map`, {
            credentials: "include",
          }).then((r) => (r.ok ? (r.json() as Promise<MindMapResponse>) : null)),
        ]);
        if (!alive) return;
        setSubject(subj);
        setData(mapResp);
      } catch (err) {
        console.error("[mapa] load failed", err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user.id, subjectId]);

  const positioned = useMemo<PositionedNode[]>(() => {
    if (!data) return [];
    return layoutRadial(data.structure.nodes);
  }, [data]);

  const positionsById = useMemo(() => {
    const m = new Map<string, PositionedNode>();
    for (const n of positioned) m.set(n.id, n);
    return m;
  }, [positioned]);

  const formattedDate = useMemo(() => {
    if (!data?.updated_at) return null;
    try {
      const d = new Date(data.updated_at);
      return d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return null;
    }
  }, [data?.updated_at]);

  const isEmpty = !loading && (!data || data.empty || positioned.length === 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/subject/${subjectId}`}>
            <ArrowLeft className="size-4" />
            Voltar
          </Link>
        </Button>
      </div>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Mapa Mental {subject ? `— ${subject.name}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            Atualizado automaticamente a cada aula nova da matéria.
          </p>
        </div>
        {data && !isEmpty ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">v{data.version}</Badge>
            {formattedDate ? (
              <span>atualizado em {formattedDate}</span>
            ) : null}
          </div>
        ) : null}
      </header>

      {loading ? (
        <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : isEmpty ? (
        <EmptyState />
      ) : (
        <div className="relative">
          <MindMapSvg
            nodes={positioned}
            edges={data!.structure.edges}
            positionsById={positionsById}
            onSelect={setSelected}
            selectedId={selected?.id ?? null}
          />
          {selected ? (
            <NodeSidebar
              node={selected}
              onClose={() => setSelected(null)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/30 p-12 text-center">
      <Sparkles className="mb-3 size-8 text-muted-foreground" />
      <p className="max-w-md text-sm text-muted-foreground">
        Seu mapa mental vai aparecer aqui depois da primeira aula. Volte mais tarde 🪄
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Layout radial: central node + órbitas concêntricas                 */
/* ------------------------------------------------------------------ */

const CANVAS_W = 1200;
const CANVAS_H = 800;
const CENTER_X = CANVAS_W / 2;
const CENTER_Y = CANVAS_H / 2;

function layoutRadial(nodes: MindMapNode[]): PositionedNode[] {
  if (nodes.length === 0) return [];
  // 1º node = centro. Os demais distribuídos em órbitas (20 por anel).
  const perRing = 14;
  const ringGap = 140;
  const out: PositionedNode[] = [];

  nodes.forEach((node, idx) => {
    const importance = typeof node.importance === "number" ? node.importance : 0.5;
    const r = 22 + importance * 16; // raio do círculo do node
    if (idx === 0) {
      out.push({ ...node, x: CENTER_X, y: CENTER_Y, r: Math.max(r, 32) });
      return;
    }
    const ringIndex = Math.floor((idx - 1) / perRing) + 1;
    const positionInRing = (idx - 1) % perRing;
    const ringCount = Math.min(perRing, nodes.length - 1 - (ringIndex - 1) * perRing);
    const angle = (positionInRing / Math.max(ringCount, 1)) * Math.PI * 2;
    const radius = ringIndex * ringGap;
    out.push({
      ...node,
      x: CENTER_X + Math.cos(angle) * radius,
      y: CENTER_Y + Math.sin(angle) * radius,
      r,
    });
  });

  return out;
}

/* ------------------------------------------------------------------ */
/*  SVG Renderer                                                       */
/* ------------------------------------------------------------------ */

function MindMapSvg({
  nodes,
  edges,
  positionsById,
  onSelect,
  selectedId,
}: {
  nodes: PositionedNode[];
  edges: MindMapEdge[];
  positionsById: Map<string, PositionedNode>;
  onSelect: (n: MindMapNode) => void;
  selectedId: string | null;
}) {
  // Bounding box pra ajustar viewBox.
  const bbox = useMemo(() => {
    if (nodes.length === 0) {
      return { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x - n.r);
      minY = Math.min(minY, n.y - n.r);
      maxX = Math.max(maxX, n.x + n.r);
      maxY = Math.max(maxY, n.y + n.r);
    }
    const pad = 100;
    return {
      x: minX - pad,
      y: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
    };
  }, [nodes]);

  return (
    <div className="overflow-auto rounded-2xl border bg-card">
      <svg
        viewBox={`${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}`}
        className="h-[70vh] w-full"
        role="img"
        aria-label="Mapa mental da matéria"
      >
        {/* Edges */}
        <g>
          {edges.map((e, idx) => {
            const a = positionsById.get(e.from);
            const b = positionsById.get(e.to);
            if (!a || !b) return null;
            return (
              <line
                key={`e-${idx}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="currentColor"
                strokeOpacity={0.18}
                strokeWidth={1.5}
              />
            );
          })}
        </g>
        {/* Nodes */}
        <g>
          {nodes.map((n, idx) => {
            const isSelected = n.id === selectedId;
            const isCenter = idx === 0;
            const fill = isCenter
              ? "var(--primary)"
              : isSelected
                ? "var(--accent)"
                : "var(--card)";
            const textFill = isCenter ? "var(--primary-foreground)" : "var(--foreground)";
            return (
              <g
                key={n.id}
                className="cursor-pointer"
                onClick={() => onSelect(n)}
              >
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.r}
                  fill={fill}
                  stroke="currentColor"
                  strokeOpacity={isSelected ? 0.7 : 0.3}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                />
                <text
                  x={n.x}
                  y={n.y + n.r + 16}
                  textAnchor="middle"
                  fontSize={isCenter ? 16 : 13}
                  fontWeight={isCenter ? 600 : 500}
                  fill={textFill}
                  style={{ pointerEvents: "none" }}
                >
                  {truncateLabel(n.label, isCenter ? 32 : 24)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function truncateLabel(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/* ------------------------------------------------------------------ */
/*  Sidebar de detalhes do node                                        */
/* ------------------------------------------------------------------ */

function NodeSidebar({
  node,
  onClose,
}: {
  node: MindMapNode;
  onClose: () => void;
}) {
  return (
    <aside
      className="absolute right-4 top-4 w-72 max-w-[90vw] rounded-2xl border bg-card p-4 shadow-lg"
      role="dialog"
      aria-label="Detalhes do conceito"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold leading-tight">{node.label}</h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X className="size-4" />
        </Button>
      </div>
      <dl className="space-y-2 text-sm">
        {node.type ? (
          <div className="flex items-center gap-2">
            <dt className="text-muted-foreground">Tipo:</dt>
            <dd>
              <Badge variant="secondary">{node.type}</Badge>
            </dd>
          </div>
        ) : null}
        {typeof node.importance === "number" ? (
          <div className="flex items-center gap-2">
            <dt className="text-muted-foreground">Importância:</dt>
            <dd>{Math.round(node.importance * 100)}%</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-muted-foreground">ID</dt>
          <dd className="font-mono text-xs">{node.id}</dd>
        </div>
      </dl>
    </aside>
  );
}
