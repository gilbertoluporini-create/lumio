"use client";

/**
 * /mapa/[assetId] — Visualização rica de UM mapa mental.
 *
 * Layout:
 *  - Esquerda (opcional 220px): lista de nodes/ramos
 *  - Centro (flex-1): visualização SVG do mapa com zoom/pan
 *  - Direita (300px): descrição + chat + próximos passos
 */

import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Circle,
  Download,
  FileText,
  Layers,
  Loader2,
  Maximize2,
  Minus,
  PanelLeft,
  Plus as PlusIcon,
  RotateCw,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { BackToHub } from "@/components/app/back-to-hub";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { LumiChatPanel } from "@/components/lumi/lumi-chat-panel";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { getLectureAsync, getSubjectAsync } from "@/lib/db";
import { getSummaryByLectureIdAsync } from "@/lib/summaries";
import { getSubjectIcon } from "@/lib/subject-icon";
import type { Lecture, Subject, User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ZoomableImage } from "@/components/ui/zoomable-image";

export default function MapaPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = use(params);
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <MapaView user={user} assetId={assetId} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

type MindmapNode = {
  label: string;
  detail?: string;
  children?: MindmapNode[];
};

type MindmapAsset = {
  generatedAt: string;
  centralTopic: string;
  branches: MindmapNode[];
  /** URL de imagem ilustrativa gerada por gpt-image-1 (opcional, decks antigos não têm) */
  heroImageUrl?: string;
};

type MindmapBank = {
  assetId: string;
  lectureId: string;
  mindmap: MindmapAsset;
};

type MobileTab = "summary" | "chat" | "next";

function MapaView({ user, assetId }: { user: User; assetId: string }) {
  const router = useRouter();
  const [bank, setBank] = useState<MindmapBank | null>(null);
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("summary");
  const [siblings, setSiblings] = useState<{
    summary: boolean;
    flashcardsId: string | null;
    quizId: string | null;
  }>({ summary: false, flashcardsId: null, quizId: null });

  const dragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  }>({ dragging: false, startX: 0, startY: 0, panX: 0, panY: 0 });

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("lecture_assets")
          .select("id, lecture_id, payload, created_at")
          .eq("id", assetId)
          .eq("user_id", user.id)
          .eq("kind", "mindmap")
          .is("deleted_at", null)
          .maybeSingle();
        if (!active) return;
        if (error || !data) {
          toast.error("Mapa mental não encontrado.");
          router.replace("/dashboard");
          return;
        }
        const row = data as {
          id: string;
          lecture_id: string;
          payload: MindmapAsset;
          created_at: string;
        };
        if (!row.payload || !row.payload.centralTopic) {
          toast.error("Mapa mental sem conteúdo.");
          router.replace("/dashboard");
          return;
        }
        setBank({
          assetId: row.id,
          lectureId: row.lecture_id,
          mindmap: row.payload,
        });

        const lec = await getLectureAsync(user.id, row.lecture_id);
        if (!active) return;
        setLecture(lec);
        if (lec) {
          const subj = await getSubjectAsync(user.id, lec.subjectId);
          if (active) setSubject(subj);
        }

        // Sibling assets
        try {
          const { data: sib } = await supabase
            .from("lecture_assets")
            .select("id, kind")
            .eq("user_id", user.id)
            .eq("lecture_id", row.lecture_id);
          if (!active) return;
          const rows = (sib ?? []) as Array<{ id: string; kind: string }>;
          let flashcardsId: string | null = null;
          let quizId: string | null = null;
          for (const r of rows) {
            if (r.kind === "flashcards") flashcardsId = r.id;
            if (r.kind === "quiz") quizId = r.id;
          }
          const summaryRow = lec
            ? await getSummaryByLectureIdAsync(user.id, lec.id)
            : null;
          if (!active) return;
          setSiblings({
            summary: !!summaryRow,
            flashcardsId,
            quizId,
          });
        } catch {
          /* ignore */
        }
      } catch (err) {
        toast.error(`Erro: ${(err as Error).message}`);
        router.replace("/dashboard");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [assetId, user.id, router]);

  const nodesFlat = useMemo(() => {
    if (!bank) return [];
    const out: { id: string; label: string; depth: number; parent: string | null }[] = [];
    function walk(n: MindmapNode, depth: number, parent: string | null, idx: number) {
      const id = `${parent ?? "root"}-${idx}`;
      out.push({ id, label: n.label, depth, parent });
      if (n.children) {
        n.children.forEach((c, i) => walk(c, depth + 1, id, i));
      }
    }
    bank.mindmap.branches.forEach((b, i) => walk(b, 1, "root", i));
    return out;
  }, [bank]);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(2.5, z + 0.2));
  }, []);
  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.4, z - 0.2));
  }, []);
  const handleResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    dragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({
      x: dragRef.current.panX + dx,
      y: dragRef.current.panY + dy,
    });
  };
  const handleMouseUp = () => {
    dragRef.current.dragging = false;
  };

  const openWizard = useCallback((mode: "summary" | "flashcards" | "quiz") => {
    toast.message("Wizard em breve", {
      description: `Vamos abrir o gerador de ${
        mode === "summary"
          ? "resumo"
          : mode === "flashcards"
            ? "flashcards"
            : "quiz"
      }.`,
    });
  }, []);

  const handleExport = useCallback(() => {
    if (typeof window !== "undefined") window.print();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!bank || !lecture) return null;

  const SubjectIcon = subject ? getSubjectIcon(subject.name) : Target;
  const totalBranches = bank.mindmap.branches.length;
  const totalNodes = nodesFlat.length;

  return (
    <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-6 md:py-8">
      {/* Voltar pra aba do menu (Plano de Estudos) */}
      <BackToHub className="mb-3" />

      {/* Breadcrumb */}
      <nav className="mb-3 text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
        <Link href="/dashboard" className="hover:text-foreground transition-colors">
          Dashboard
        </Link>
        <ChevronRight className="h-3 w-3" />
        {subject ? <span>{subject.name}</span> : <span>—</span>}
        <ChevronRight className="h-3 w-3" />
        <span>Mapa mental</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-5">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl md:text-3xl heading-display">
            {lecture.title}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {bank.mindmap.centralTopic}
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            {subject && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 dark:bg-primary/15 px-2.5 py-1 text-primary font-medium">
                <SubjectIcon className="h-3.5 w-3.5" strokeWidth={2.2} />
                {subject.name}
              </span>
            )}
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Target className="h-3 w-3" /> {totalBranches} ramos
            </span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Circle className="h-3 w-3" /> {totalNodes} nós
            </span>
          </div>
        </div>
        {bank.mindmap.heroImageUrl && (
          /* Imagem ilustrativa gerada via gpt-image-1 a partir do centralTopic.
             Decks antigos (gerados antes do feature) não têm — header continua válido. */
          <div className="shrink-0 md:max-w-[280px]">
            <ZoomableImage
              src={bank.mindmap.heroImageUrl}
              alt={bank.mindmap.centralTopic}
              className="my-0"
              imgClassName="aspect-[4/3] object-cover"
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleZoomOut}>
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs font-mono tabular-nums text-muted-foreground w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <Button variant="outline" size="sm" onClick={handleZoomIn}>
          <PlusIcon className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" onClick={handleResetView}>
          <Maximize2 className="h-3.5 w-3.5" /> Resetar
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-3.5 w-3.5" /> Exportar
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const ok = await confirmAction({
              title: "Excluir esse mapa mental?",
              description:
                "O mapa será removido. A aula de origem permanece.",
              destructive: true,
              confirmText: "Excluir mapa",
            });
            if (!ok) return;
            const { deleteLectureAssetAsync } = await import(
              "@/lib/lecture-assets-delete"
            );
            const res = await deleteLectureAssetAsync(user.id, assetId);
            if (!res.ok) {
              toast.error(`Erro: ${res.error}`);
              return;
            }
            toast.success("Mapa excluído.");
            router.push("/dashboard");
          }}
          className="text-destructive hover:text-destructive hover:border-destructive/50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Excluir
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="lg:hidden ml-auto"
          onClick={() => setMobileSidebarOpen(true)}
        >
          <PanelLeft className="h-3.5 w-3.5" /> Nós
        </Button>
      </div>

      {/* Grid 3-col (left smaller / centro / direita) */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_300px] gap-6">
        {/* LEFT: nodes list */}
        <aside className="hidden lg:block">
          <div className="sticky top-[80px]">
            <NodesList
              nodes={nodesFlat}
              selectedId={selectedNodeId}
              onSelect={setSelectedNodeId}
            />
          </div>
        </aside>

        {/* CENTER: SVG mapa */}
        <main className="min-w-0 space-y-6">
          <div
            className="rounded-2xl border border-border/60 bg-card overflow-hidden relative"
            style={{ height: 520 }}
          >
            <div
              className="absolute inset-0 cursor-grab active:cursor-grabbing"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <MindmapSvg
                mindmap={bank.mindmap}
                zoom={zoom}
                pan={pan}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
              />
            </div>
            <div className="absolute bottom-3 right-3 rounded-md bg-background/80 backdrop-blur border border-border/60 px-2.5 py-1 text-[10px] text-muted-foreground inline-flex items-center gap-1.5">
              <RotateCw className="h-3 w-3" /> Arraste pra navegar
            </div>
          </div>

          {/* 4 CTAs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <ActionCard
              icon={<FileText className="h-5 w-5" />}
              title="Abrir resumo"
              description="Volte pro texto da aula."
              onClick={() => {
                if (siblings.summary) {
                  router.push(`/resumo/${lecture.id}`);
                } else {
                  toast.info("Esta aula ainda não tem resumo.");
                }
              }}
            />
            <ActionCard
              icon={<Layers className="h-5 w-5" />}
              title="Criar flashcards"
              description={
                siblings.flashcardsId
                  ? "Abrir deck existente."
                  : "Gerar deck deste mapa."
              }
              coinCost={siblings.flashcardsId ? undefined : 12}
              onClick={() => {
                if (siblings.flashcardsId) {
                  router.push(`/deck/${siblings.flashcardsId}`);
                } else {
                  openWizard("flashcards");
                }
              }}
            />
            <ActionCard
              icon={<Sparkles className="h-5 w-5" />}
              title="Gerar quiz"
              description={
                siblings.quizId ? "Abrir quiz existente." : "Criar quiz."
              }
              coinCost={siblings.quizId ? undefined : 15}
              onClick={() => {
                if (siblings.quizId) {
                  router.push(`/quiz-banco/${siblings.quizId}`);
                } else {
                  openWizard("quiz");
                }
              }}
            />
            <ActionCard
              icon={<Sparkles className="h-5 w-5" />}
              title="Revisar gravação"
              description="Veja a aula completa."
              href={`/lecture/${lecture.id}`}
            />
          </div>
        </main>

        {/* RIGHT */}
        <aside className="hidden lg:block">
          <div className="sticky top-[80px] space-y-4 max-h-[calc(100vh-100px)] overflow-y-auto pr-1">
            <MapDescriptionCard
              mindmap={bank.mindmap}
              selectedNodeId={selectedNodeId}
              nodesFlat={nodesFlat}
            />
            <LumiChatPanel
              lectureId={lecture.id}
              contextLabel={`Mapa · ${lecture.title}`}
              variant="mindmap"
            />
            <MapNextStepsCard
              lectureId={lecture.id}
              hasSummary={siblings.summary}
              flashcardsId={siblings.flashcardsId}
              quizId={siblings.quizId}
            />
          </div>
        </aside>
      </div>

      {/* Mobile drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Fechar"
            onClick={() => setMobileSidebarOpen(false)}
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
          />
          <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-card border-r border-border/60 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Nós do mapa</h3>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-secondary/60"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NodesList
              nodes={nodesFlat}
              selectedId={selectedNodeId}
              onSelect={(id) => {
                setSelectedNodeId(id);
                setMobileSidebarOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Mobile tabs */}
      <div className="lg:hidden mt-8">
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="flex border-b border-border/60 bg-secondary/20">
            {(
              [
                { k: "summary", label: "Descrição" },
                { k: "chat", label: "Lumi" },
                { k: "next", label: "Próximos" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.k}
                type="button"
                onClick={() => setMobileTab(tab.k)}
                className={cn(
                  "flex-1 px-2 py-2.5 text-xs font-medium transition-colors",
                  mobileTab === tab.k
                    ? "bg-card text-foreground border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="p-3">
            {mobileTab === "summary" && (
              <MapDescriptionCard
                mindmap={bank.mindmap}
                selectedNodeId={selectedNodeId}
                nodesFlat={nodesFlat}
              />
            )}
            {mobileTab === "chat" && (
              <LumiChatPanel
                lectureId={lecture.id}
                contextLabel={`Mapa · ${lecture.title}`}
                variant="mindmap"
              />
            )}
            {mobileTab === "next" && (
              <MapNextStepsCard
                lectureId={lecture.id}
                hasSummary={siblings.summary}
                flashcardsId={siblings.flashcardsId}
                quizId={siblings.quizId}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function MindmapSvg({
  mindmap,
  zoom,
  pan,
  selectedNodeId,
  onSelectNode,
}: {
  mindmap: MindmapAsset;
  zoom: number;
  pan: { x: number; y: number };
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}) {
  const W = 1000;
  const H = 520;
  const CX = W / 2;
  const CY = H / 2;
  const ROOT_R = 70;
  const BRANCH_R = 90;
  const branches = mindmap.branches;
  const angleStep = (Math.PI * 2) / Math.max(branches.length, 1);

  type LaidNode = {
    id: string;
    label: string;
    x: number;
    y: number;
    parentX: number;
    parentY: number;
    depth: number;
  };
  const positioned: LaidNode[] = [];
  const branchPos: { x: number; y: number; angle: number }[] = [];

  branches.forEach((b, i) => {
    const angle = -Math.PI / 2 + i * angleStep;
    const x = CX + Math.cos(angle) * (ROOT_R + BRANCH_R);
    const y = CY + Math.sin(angle) * (ROOT_R + BRANCH_R);
    branchPos.push({ x, y, angle });
    positioned.push({
      id: `root-${i}`,
      label: b.label,
      x,
      y,
      parentX: CX,
      parentY: CY,
      depth: 1,
    });
    if (b.children) {
      const childCount = b.children.length;
      // Distribui filhos em um arco em torno da direção do branch
      const arcSpan = Math.PI / 2.2;
      const start = angle - arcSpan / 2;
      b.children.forEach((c, ci) => {
        const subAngle =
          childCount === 1
            ? angle
            : start + (arcSpan * ci) / (childCount - 1);
        const cx = x + Math.cos(subAngle) * 130;
        const cy = y + Math.sin(subAngle) * 130;
        positioned.push({
          id: `root-${i}-${ci}`,
          label: c.label,
          x: cx,
          y: cy,
          parentX: x,
          parentY: y,
          depth: 2,
        });
        if (c.children) {
          const gcCount = c.children.length;
          const gcArc = Math.PI / 3;
          const gcStart = subAngle - gcArc / 2;
          c.children.forEach((gc, gi) => {
            const ga =
              gcCount === 1
                ? subAngle
                : gcStart + (gcArc * gi) / (gcCount - 1);
            const gx = cx + Math.cos(ga) * 90;
            const gy = cy + Math.sin(ga) * 90;
            positioned.push({
              id: `root-${i}-${ci}-${gi}`,
              label: gc.label,
              x: gx,
              y: gy,
              parentX: cx,
              parentY: cy,
              depth: 3,
            });
          });
        }
      });
    }
  });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-full select-none"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="root-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.6 0.25 290)" />
          <stop offset="100%" stopColor="oklch(0.65 0.25 330)" />
        </linearGradient>
        <linearGradient id="branch-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.95 0.05 290)" />
          <stop offset="100%" stopColor="oklch(0.97 0.04 320)" />
        </linearGradient>
      </defs>
      <g
        transform={`translate(${W / 2 + pan.x}, ${H / 2 + pan.y}) scale(${zoom}) translate(${-W / 2}, ${-H / 2})`}
      >
        {/* Lines */}
        {positioned.map((n) => (
          <line
            key={`line-${n.id}`}
            x1={n.parentX}
            y1={n.parentY}
            x2={n.x}
            y2={n.y}
            stroke={
              selectedNodeId === n.id
                ? "oklch(0.55 0.22 290)"
                : "oklch(0.75 0.04 270)"
            }
            strokeWidth={selectedNodeId === n.id ? 2.5 : 1.5}
            strokeOpacity={0.6}
          />
        ))}

        {/* Root */}
        <g
          onClick={() => onSelectNode(null)}
          className="cursor-pointer"
        >
          <circle
            cx={CX}
            cy={CY}
            r={ROOT_R}
            fill="url(#root-grad)"
            stroke="oklch(0.5 0.2 280)"
            strokeWidth={2}
            filter="drop-shadow(0 4px 12px rgba(120, 70, 200, 0.25))"
          />
          <foreignObject
            x={CX - ROOT_R + 8}
            y={CY - ROOT_R + 8}
            width={ROOT_R * 2 - 16}
            height={ROOT_R * 2 - 16}
          >
            <div
              className="w-full h-full flex items-center justify-center text-center text-white font-semibold text-[11px] leading-tight px-1"
              style={{
                fontSize: 11,
                lineHeight: 1.2,
              }}
            >
              {mindmap.centralTopic}
            </div>
          </foreignObject>
        </g>

        {/* Branches + grandchildren */}
        {positioned.map((n) => {
          const isSel = selectedNodeId === n.id;
          const r = n.depth === 1 ? 50 : n.depth === 2 ? 36 : 22;
          return (
            <g
              key={n.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode(n.id);
              }}
              className="cursor-pointer"
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill={
                  n.depth === 1
                    ? "url(#branch-grad)"
                    : "oklch(0.98 0.01 270)"
                }
                stroke={
                  isSel
                    ? "oklch(0.55 0.22 290)"
                    : "oklch(0.75 0.05 280)"
                }
                strokeWidth={isSel ? 2.5 : 1.5}
              />
              <foreignObject
                x={n.x - r + 4}
                y={n.y - r + 4}
                width={r * 2 - 8}
                height={r * 2 - 8}
              >
                <div
                  className="w-full h-full flex items-center justify-center text-center text-foreground font-medium leading-tight px-0.5"
                  style={{
                    fontSize: n.depth === 1 ? 11 : n.depth === 2 ? 10 : 9,
                    lineHeight: 1.15,
                  }}
                >
                  {n.label}
                </div>
              </foreignObject>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function NodesList({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: { id: string; label: string; depth: number }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-3">
        Nós do mapa ({nodes.length})
      </div>
      <ol className="space-y-0.5 max-h-[420px] overflow-y-auto pr-1">
        {nodes.map((n) => {
          const isActive = selectedId === n.id;
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onSelect(n.id)}
                className={cn(
                  "group w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors",
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "hover:bg-secondary/60 text-muted-foreground hover:text-foreground",
                )}
                style={{ paddingLeft: 8 + (n.depth - 1) * 10 }}
              >
                <span
                  className={cn(
                    "shrink-0 h-1.5 w-1.5 rounded-full",
                    isActive
                      ? "bg-primary"
                      : n.depth === 1
                        ? "bg-primary/40"
                        : "bg-muted-foreground/40",
                  )}
                />
                <span className="line-clamp-1 leading-snug">{n.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MapDescriptionCard({
  mindmap,
  selectedNodeId,
  nodesFlat,
}: {
  mindmap: MindmapAsset;
  selectedNodeId: string | null;
  nodesFlat: { id: string; label: string; depth: number }[];
}) {
  const sel = selectedNodeId
    ? nodesFlat.find((n) => n.id === selectedNodeId)
    : null;
  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 via-card to-fuchsia-500/8 p-4">
      <div className="text-[11px] uppercase tracking-wider text-primary/90 font-medium mb-2 inline-flex items-center gap-1.5">
        <Sparkles className="h-3 w-3" /> {sel ? "Nó selecionado" : "Tema central"}
      </div>
      <p className="text-sm font-semibold leading-snug">
        {sel ? sel.label : mindmap.centralTopic}
      </p>
      {!sel && (
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          {mindmap.branches.length} ramos principais.
          {mindmap.branches.length > 0 && (
            <> Comece explorando “{mindmap.branches[0].label}”.</>
          )}
        </p>
      )}
      {sel && (
        <p className="mt-2 text-xs text-muted-foreground">
          Nível {sel.depth} · clique em outro nó pra explorar.
        </p>
      )}
    </div>
  );
}

function ActionCard({
  icon,
  title,
  description,
  coinCost,
  onClick,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  coinCost?: number;
  onClick?: () => void;
  href?: string;
}) {
  const body = (
    <div className="rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 hover:-translate-y-0.5 transition-all p-4 h-full flex flex-col gap-2 group cursor-pointer">
      <div className="h-9 w-9 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
        {icon}
      </div>
      <div className="text-sm font-semibold mt-1">{title}</div>
      <div className="text-xs text-muted-foreground leading-snug flex-1">
        {description}
      </div>
      <div className="text-[10px] text-muted-foreground/80 mt-1">
        {coinCost ? (
          <>
            <span className="font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
              {coinCost}
            </span>{" "}
            coins
          </>
        ) : (
          <>Grátis</>
        )}
      </div>
    </div>
  );
  if (href) return <Link href={href}>{body}</Link>;
  return (
    <button type="button" onClick={onClick} className="text-left w-full">
      {body}
    </button>
  );
}

function MapNextStepsCard({
  lectureId,
  hasSummary,
  flashcardsId,
  quizId,
}: {
  lectureId: string;
  hasSummary: boolean;
  flashcardsId: string | null;
  quizId: string | null;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="text-sm font-semibold mb-3">Próximos passos</div>
      <ul className="space-y-2">
        <StepItem
          done={hasSummary}
          label="Abrir resumo da aula"
          href={hasSummary ? `/resumo/${lectureId}` : undefined}
        />
        <StepItem
          done={!!flashcardsId}
          label={flashcardsId ? "Estudar flashcards" : "Criar flashcards"}
          href={flashcardsId ? `/deck/${flashcardsId}` : undefined}
        />
        <StepItem
          done={!!quizId}
          label={quizId ? "Fazer quiz" : "Gerar quiz"}
          href={quizId ? `/quiz-banco/${quizId}` : undefined}
        />
        <StepItem
          done={false}
          label="Ver gravação completa"
          href={`/lecture/${lectureId}`}
        />
      </ul>
    </div>
  );
}

function StepItem({
  done,
  label,
  href,
}: {
  done: boolean;
  label: string;
  href?: string;
}) {
  const body = (
    <div className="flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-secondary/40 transition-colors group cursor-pointer">
      <span
        className={cn(
          "shrink-0 h-4 w-4 rounded border mt-0.5 flex items-center justify-center",
          done
            ? "bg-primary border-primary text-white"
            : "border-border bg-background group-hover:border-primary",
        )}
      >
        {done && (
          <svg
            viewBox="0 0 12 12"
            className="h-2.5 w-2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 6.5l2.5 2.5L10 3.5" />
          </svg>
        )}
      </span>
      <span
        className={cn(
          "text-xs leading-snug",
          done ? "text-muted-foreground line-through" : "text-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );
  return <li>{href ? <Link href={href}>{body}</Link> : body}</li>;
}

