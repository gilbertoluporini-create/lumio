"use client";

/**
 * /resumo/[lectureId] — Visualização rica de UM resumo.
 *
 * Layout 3 colunas dentro do AppShell:
 *  - Esquerda (220px sticky): índice de seções
 *  - Centro (flex-1): conteúdo do resumo (markdown render)
 *  - Direita (300px sticky): resumo rápido + chat Lumi + relacionados + próximos passos
 *
 * Em <lg vira drawer (esq) + tabs no rodapé (dir).
 */

import {
  Fragment,
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
  ArrowLeft,
  ArrowRight,
  Brain,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Headphones,
  Layers,
  Loader2,
  MapIcon,
  Mic,
  MoreVertical,
  PanelLeft,
  Pause,
  Play,
  Share2,
  Sparkles,
  Square,
  Star,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { LumiChatPanel } from "@/components/lumi/lumi-chat-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import {
  getLectureAsync,
  getSubjectAsync,
  listLecturesAsync,
  updateLectureAsync,
} from "@/lib/db";
import {
  subscribeFavorites,
  toggleFavorite as toggleFavoriteLib,
} from "@/lib/favorites";
import { summaryToMarkdown } from "@/components/app/lecture-summary-view";
import { getSubjectIcon } from "@/lib/subject-icon";
import type {
  Lecture,
  LectureSummary,
  LectureSummarySection,
  Subject,
  User,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ResumoPage({
  params,
}: {
  params: Promise<{ lectureId: string }>;
}) {
  const { lectureId } = use(params);
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <ResumoView user={user} lectureId={lectureId} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tipos auxiliares                                                          */
/* -------------------------------------------------------------------------- */

type SectionRef = {
  id: string;
  title: string;
  index: number;
};

type AssetCounts = {
  flashcards: { count: number; assetId: string | null };
  quiz: { count: number; assetId: string | null };
  mindmap: { count: number; assetId: string | null };
};

/* -------------------------------------------------------------------------- */
/*  Utilities                                                                 */
/* -------------------------------------------------------------------------- */

function formatDateBR(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDurationMin(seconds: number): string {
  if (seconds <= 0) return "—";
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function slugify(s: string, idx: number): string {
  const base = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `sec-${idx}-${base || "topico"}`;
}

function sectionTitle(sec: LectureSummarySection, idx: number): string {
  if (sec.slideTitle && sec.slideTitle.trim()) return sec.slideTitle.trim();
  if (sec.slideNumber) return `Slide ${sec.slideNumber}`;
  return `Tópico ${idx + 1}`;
}

function buildSectionRefs(summary: LectureSummary): SectionRef[] {
  return summary.sections.map((sec, idx) => ({
    id: slugify(sectionTitle(sec, idx), idx),
    title: sectionTitle(sec, idx),
    index: idx,
  }));
}

/* -------------------------------------------------------------------------- */
/*  View                                                                      */
/* -------------------------------------------------------------------------- */

type MobileTab = "summary" | "chat" | "related" | "next";

function ResumoView({ user, lectureId }: { user: User; lectureId: string }) {
  const router = useRouter();
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [related, setRelated] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [readingPct, setReadingPct] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("summary");
  const [ttsState, setTtsState] = useState<"idle" | "playing" | "paused">("idle");
  const [assetCounts, setAssetCounts] = useState<AssetCounts>({
    flashcards: { count: 0, assetId: null },
    quiz: { count: 0, assetId: null },
    mindmap: { count: 0, assetId: null },
  });

  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  // ===== Load lecture + subject + related + assets =====
  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const lec = await getLectureAsync(user.id, lectureId);
        if (!active) return;
        if (!lec) {
          toast.error("Resumo não encontrado.");
          router.replace("/resumos");
          return;
        }
        setLecture(lec);
        const subj = await getSubjectAsync(user.id, lec.subjectId);
        if (active) setSubject(subj);

        // Related: outras lectures da mesma matéria (top 3 por updatedAt)
        const allLectures = await listLecturesAsync(user.id);
        if (!active) return;
        const rel = allLectures
          .filter(
            (l) =>
              l.id !== lec.id && l.subjectId === lec.subjectId && !!l.summary,
          )
          .sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() -
              new Date(a.updatedAt).getTime(),
          )
          .slice(0, 3);
        setRelated(rel);

        // Asset counts (flashcards/quiz/mindmap)
        try {
          const supabase = createClient();
          const { data: assets } = await supabase
            .from("lecture_assets")
            .select("id, kind, payload")
            .eq("user_id", user.id)
            .eq("lecture_id", lec.id);
          if (!active) return;
          const counts: AssetCounts = {
            flashcards: { count: 0, assetId: null },
            quiz: { count: 0, assetId: null },
            mindmap: { count: 0, assetId: null },
          };
          const rows = (assets ?? []) as Array<{
            id: string;
            kind: string;
            payload: unknown;
          }>;
          for (const row of rows) {
            if (row.kind === "flashcards") {
              const cards = Array.isArray(
                (row.payload as { cards?: unknown[] })?.cards,
              )
                ? (row.payload as { cards: unknown[] }).cards.length
                : 0;
              counts.flashcards = { count: cards, assetId: row.id };
            } else if (row.kind === "quiz") {
              const q = Array.isArray(
                (row.payload as { questions?: unknown[] })?.questions,
              )
                ? (row.payload as { questions: unknown[] }).questions.length
                : 0;
              counts.quiz = { count: q, assetId: row.id };
            } else if (row.kind === "mindmap") {
              const branches = Array.isArray(
                (row.payload as { branches?: unknown[] })?.branches,
              )
                ? (row.payload as { branches: unknown[] }).branches.length
                : 0;
              counts.mindmap = { count: branches, assetId: row.id };
            }
          }
          setAssetCounts(counts);
        } catch (e) {
          // Sem Supabase ou erro — segue com zeros
          console.warn("[resumo] assets load failed", e);
        }
      } catch (err) {
        toast.error(`Erro carregando resumo: ${(err as Error).message}`);
        router.replace("/resumos");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user.id, lectureId, router]);

  // Favorites subscription
  useEffect(() => {
    return subscribeFavorites(user.id, (entries) => {
      setFavorites(
        entries.filter((f) => f.kind === "summary").map((f) => f.id),
      );
    });
  }, [user.id]);

  // ===== Section refs / scroll observer =====
  const summary = lecture?.summary;
  const sectionList = useMemo<SectionRef[]>(
    () => (summary ? buildSectionRefs(summary) : []),
    [summary],
  );

  useEffect(() => {
    if (!summary) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) {
          const id = (visible[0].target as HTMLElement).dataset.sectionId;
          if (id) setActiveSectionId(id);
        }
      },
      {
        rootMargin: "-80px 0px -60% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );
    const els = Array.from(sectionRefs.current.values());
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [summary, sectionList]);

  // Reading progress (% scroll inside main content area)
  useEffect(() => {
    function onScroll() {
      const el = contentRef.current;
      if (!el) return;
      const winH = window.innerHeight;
      const rect = el.getBoundingClientRect();
      const totalScrollable = rect.height - winH + 200;
      if (totalScrollable <= 0) {
        setReadingPct(100);
        return;
      }
      const scrolled = Math.max(0, -rect.top + 200);
      const pct = Math.min(100, Math.max(0, (scrolled / totalScrollable) * 100));
      setReadingPct(Math.round(pct));
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [summary]);

  const isFavorite = lecture ? favorites.includes(lecture.id) : false;
  const handleToggleFavorite = useCallback(() => {
    if (!lecture) return;
    const nowFav = toggleFavoriteLib(user.id, "summary", lecture.id);
    toast.success(nowFav ? "Adicionado aos favoritos" : "Removido dos favoritos");
  }, [lecture, user.id]);

  const handleScrollToSection = useCallback((id: string) => {
    const el = sectionRefs.current.get(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top: y, behavior: "smooth" });
    setMobileSidebarOpen(false);
  }, []);

  const handleDeleteSummary = useCallback(async () => {
    if (!lecture) return;
    const ok = window.confirm(
      `Excluir o resumo de "${lecture.title}"?\n\nA aula e a transcrição serão mantidas.`,
    );
    if (!ok) return;
    try {
      await updateLectureAsync(user.id, lecture.id, {
        summary: null as unknown as Lecture["summary"],
      });
      toast.success("Resumo excluído.");
      router.push("/resumos");
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    }
  }, [lecture, user.id, router]);

  // ===== TTS (Web Speech API) =====
  const ttsUtterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const handleTtsToggle = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error("Seu navegador não suporta leitura por voz.");
      return;
    }
    if (!summary || !lecture) return;
    const synth = window.speechSynthesis;
    if (ttsState === "playing") {
      synth.pause();
      setTtsState("paused");
      return;
    }
    if (ttsState === "paused") {
      synth.resume();
      setTtsState("playing");
      return;
    }
    // Build text from markdown (strip basic markdown markers)
    const md = summaryToMarkdown(lecture, subject, summary);
    const plain = md
      .replace(/^#+\s+/gm, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^[-*]\s+/gm, "• ")
      .replace(/^>+\s*/gm, "")
      .replace(/\n{2,}/g, ". ")
      .slice(0, 30_000);
    const utter = new SpeechSynthesisUtterance(plain);
    utter.lang = "pt-BR";
    utter.rate = 1.05;
    utter.onend = () => setTtsState("idle");
    utter.onerror = () => setTtsState("idle");
    ttsUtterRef.current = utter;
    synth.cancel();
    synth.speak(utter);
    setTtsState("playing");
  }, [ttsState, summary, lecture, subject]);

  const handleTtsStop = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setTtsState("idle");
  }, []);

  // Cleanup TTS quando sai da página
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleExportPdf = useCallback(() => {
    // Fallback simples — abre print dialog. PDF de verdade fica em outra task.
    if (typeof window === "undefined") return;
    window.print();
  }, []);

  const handleShare = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    if (navigator.share) {
      navigator
        .share({ title: lecture?.title ?? "Resumo Lumio", url })
        .catch(() => {
          /* user canceled */
        });
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Link copiado!"))
      .catch(() => toast.error("Não consegui copiar o link."));
  }, [lecture]);

  // Wizard stubs (componente fica pronto em paralelo por outro agent)
  const openWizard = useCallback((mode: "flashcards" | "quiz" | "mindmap") => {
    toast.message("Wizard em breve", {
      description: `Vamos abrir o gerador de ${
        mode === "flashcards" ? "flashcards" : mode === "quiz" ? "quiz" : "mapa mental"
      } com esta aula como fonte.`,
    });
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!lecture) return null;

  if (!summary) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 text-center">
        <FileText className="mx-auto h-10 w-10 text-muted-foreground/60" />
        <h1 className="mt-4 text-xl font-semibold">
          Esta aula ainda não tem resumo
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Abra a aula original pra gerar um resumo a partir da transcrição.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild variant="gradient">
            <Link href={`/lecture/${lecture.id}`}>
              Abrir aula <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/resumos">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const SubjectIcon = subject ? getSubjectIcon(subject.name) : FileText;
  const dateLabel = formatDateBR(new Date(lecture.updatedAt));
  const tags = summary.highlights?.slice(0, 4) ?? [];

  return (
    <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-6 md:py-8">
      {/* Breadcrumb */}
      <nav className="mb-3 text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
        <Link href="/resumos" className="hover:text-foreground transition-colors">
          Biblioteca de resumos
        </Link>
        <ChevronRight className="h-3 w-3" />
        {subject ? (
          <Link
            href={`/resumos?subject=${subject.id}`}
            className="hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            {subject.name}
          </Link>
        ) : (
          <span>—</span>
        )}
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5 mb-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight leading-tight">
              {lecture.title}
            </h1>
            <button
              type="button"
              onClick={handleToggleFavorite}
              className={cn(
                "shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-md transition-colors mt-1",
                isFavorite
                  ? "text-amber-500 hover:bg-amber-500/10"
                  : "text-muted-foreground/60 hover:text-amber-500 hover:bg-amber-500/10",
              )}
              title={isFavorite ? "Remover dos favoritos" : "Favoritar resumo"}
              aria-label={isFavorite ? "Remover dos favoritos" : "Favoritar resumo"}
              aria-pressed={isFavorite}
            >
              <Star className={cn("h-5 w-5", isFavorite && "fill-amber-500")} />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            {subject && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 dark:bg-primary/15 px-2.5 py-1 text-primary font-medium">
                <SubjectIcon className="h-3.5 w-3.5" strokeWidth={2.2} />
                {subject.name}
              </span>
            )}
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Clock className="h-3 w-3" /> {dateLabel}
            </span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Timer className="h-3 w-3" /> {formatDurationMin(lecture.durationSec)}
            </span>
            {tags.slice(0, 2).map((t, i) => (
              <Badge
                key={i}
                variant="outline"
                className="text-[10px] border-border/60 bg-background/60 max-w-[160px]"
              >
                <span className="truncate">{t}</span>
              </Badge>
            ))}
            {tags.length > 2 && (
              <span className="text-[10px] text-muted-foreground">
                +{tags.length - 2}
              </span>
            )}
          </div>
        </div>

        {/* Reading progress card */}
        <div className="rounded-xl border border-border/60 bg-card p-3 w-full md:w-[200px] shrink-0">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
            <span>Progresso de leitura</span>
            <span className="font-mono tabular-nums">{readingPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-fuchsia-500 transition-all"
              style={{ width: `${readingPct}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <Badge
              variant="secondary"
              className="gap-1 text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            >
              <Sparkles className="h-2.5 w-2.5" /> Concluído
            </Badge>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {sectionList.length} seç.
            </span>
          </div>
        </div>
      </div>

      {/* Actions row */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button variant="gradient" size="sm" onClick={handleTtsToggle}>
          {ttsState === "playing" ? (
            <>
              <Pause className="h-3.5 w-3.5" /> Pausar
            </>
          ) : ttsState === "paused" ? (
            <>
              <Play className="h-3.5 w-3.5" /> Continuar
            </>
          ) : (
            <>
              <Headphones className="h-3.5 w-3.5" /> Ouvir aula
            </>
          )}
        </Button>
        {ttsState !== "idle" && (
          <Button variant="ghost" size="sm" onClick={handleTtsStop}>
            <Square className="h-3.5 w-3.5" /> Parar
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleExportPdf}>
          <Download className="h-3.5 w-3.5" /> Exportar PDF
        </Button>
        <Button variant="outline" size="sm" onClick={handleToggleFavorite}>
          <Star
            className={cn("h-3.5 w-3.5", isFavorite && "fill-amber-500 text-amber-500")}
          />
          {isFavorite ? "Favoritado" : "Favoritar"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => openWizard("flashcards")}
        >
          <Layers className="h-3.5 w-3.5" /> Gerar flashcards
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => openWizard("quiz")}
        >
          <Sparkles className="h-3.5 w-3.5" /> Gerar quiz
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Mais ações">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleShare}>
              <Share2 className="h-3.5 w-3.5" /> Compartilhar
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/lecture/${lecture.id}`}>
                <Mic className="h-3.5 w-3.5" /> Abrir aula original
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDeleteSummary}
              className="text-red-600 focus:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir resumo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Mobile toggle pra abrir sidebar de navegação */}
        <Button
          variant="outline"
          size="sm"
          className="lg:hidden ml-auto"
          onClick={() => setMobileSidebarOpen(true)}
        >
          <PanelLeft className="h-3.5 w-3.5" /> Índice
        </Button>
      </div>

      {/* Grid 3-col */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_300px] gap-6">
        {/* LEFT: Navegação */}
        <aside className="hidden lg:block">
          <div className="sticky top-[80px]">
            <SectionNav
              sections={sectionList}
              activeId={activeSectionId}
              onSelect={handleScrollToSection}
            />
          </div>
        </aside>

        {/* CENTER: Content */}
        <main ref={contentRef} className="min-w-0">
          <SummaryContent
            summary={summary}
            sectionList={sectionList}
            sectionRefs={sectionRefs}
          />

          {/* CTAs grid */}
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <CtaCard
              icon={<Layers className="h-5 w-5" />}
              title="Criar flashcards"
              description="Gere cards de revisão deste resumo."
              coinCost={12}
              onClick={() => openWizard("flashcards")}
            />
            <CtaCard
              icon={<Sparkles className="h-5 w-5" />}
              title="Abrir quiz"
              description="Teste seu conhecimento com questões."
              coinCost={15}
              onClick={() => openWizard("quiz")}
            />
            <CtaCard
              icon={<MapIcon className="h-5 w-5" />}
              title="Mapa mental"
              description="Visualize as conexões da aula."
              coinCost={20}
              onClick={() => openWizard("mindmap")}
            />
            <CtaCard
              icon={<Mic className="h-5 w-5" />}
              title="Revisar gravação"
              description="Volte pra transcrição completa."
              href={`/lecture/${lecture.id}`}
            />
          </div>
        </main>

        {/* RIGHT: Sidebar (desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-[80px] space-y-4 max-h-[calc(100vh-100px)] overflow-y-auto pr-1">
            <QuickSummaryCard
              summary={summary}
              onJumpToHighlights={() =>
                handleScrollToSection(sectionList[0]?.id ?? "")
              }
            />
            <LumiChatPanel
              lectureId={lecture.id}
              contextLabel={lecture.title}
              variant="summary"
              suggestedQuestions={buildSuggestions(summary)}
            />
            <RelatedCard related={related} />
            <NextStepsCard
              lectureId={lecture.id}
              durationMin={Math.round(lecture.durationSec / 60)}
              counts={assetCounts}
              onAction={(action) => {
                if (action === "flashcards") {
                  if (assetCounts.flashcards.assetId) {
                    router.push(`/deck/${assetCounts.flashcards.assetId}`);
                  } else {
                    openWizard("flashcards");
                  }
                } else if (action === "quiz") {
                  if (assetCounts.quiz.assetId) {
                    router.push(`/quiz-banco/${assetCounts.quiz.assetId}`);
                  } else {
                    openWizard("quiz");
                  }
                } else if (action === "mindmap") {
                  if (assetCounts.mindmap.assetId) {
                    router.push(`/mapa/${assetCounts.mindmap.assetId}`);
                  } else {
                    openWizard("mindmap");
                  }
                }
              }}
            />
          </div>
        </aside>
      </div>

      {/* Mobile: drawer índice */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Fechar índice"
            onClick={() => setMobileSidebarOpen(false)}
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
          />
          <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-card border-r border-border/60 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Navegação</h3>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                aria-label="Fechar"
                className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-secondary/60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SectionNav
              sections={sectionList}
              activeId={activeSectionId}
              onSelect={handleScrollToSection}
            />
          </div>
        </div>
      )}

      {/* Mobile: tabs no rodapé pra sidebar direita */}
      <div className="lg:hidden mt-8">
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="flex border-b border-border/60 bg-secondary/20">
            {(
              [
                { k: "summary", label: "Resumo" },
                { k: "chat", label: "Lumi" },
                { k: "related", label: "Relacionados" },
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
              <QuickSummaryCard
                summary={summary}
                onJumpToHighlights={() =>
                  handleScrollToSection(sectionList[0]?.id ?? "")
                }
              />
            )}
            {mobileTab === "chat" && (
              <LumiChatPanel
                lectureId={lecture.id}
                contextLabel={lecture.title}
                variant="summary"
                suggestedQuestions={buildSuggestions(summary)}
              />
            )}
            {mobileTab === "related" && <RelatedCard related={related} />}
            {mobileTab === "next" && (
              <NextStepsCard
                lectureId={lecture.id}
                durationMin={Math.round(lecture.durationSec / 60)}
                counts={assetCounts}
                onAction={(action) => {
                  if (action === "flashcards") {
                    if (assetCounts.flashcards.assetId) {
                      router.push(`/deck/${assetCounts.flashcards.assetId}`);
                    } else {
                      openWizard("flashcards");
                    }
                  } else if (action === "quiz") {
                    if (assetCounts.quiz.assetId) {
                      router.push(`/quiz-banco/${assetCounts.quiz.assetId}`);
                    } else {
                      openWizard("quiz");
                    }
                  } else if (action === "mindmap") {
                    if (assetCounts.mindmap.assetId) {
                      router.push(`/mapa/${assetCounts.mindmap.assetId}`);
                    } else {
                      openWizard("mindmap");
                    }
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-componentes                                                           */
/* -------------------------------------------------------------------------- */

function SectionNav({
  sections,
  activeId,
  onSelect,
}: {
  sections: SectionRef[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const activeIdx = sections.findIndex((s) => s.id === activeId);
  const progress =
    sections.length === 0 ? 0 : ((activeIdx + 1) / sections.length) * 100;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-3">
        Navegação do resumo
      </div>
      {sections.length === 0 ? (
        <p className="text-xs text-muted-foreground">Resumo sem seções.</p>
      ) : (
        <ol className="space-y-1">
          {sections.map((s, idx) => {
            const isActive = s.id === activeId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className={cn(
                    "group w-full text-left flex items-start gap-2.5 px-2 py-1.5 rounded-lg text-xs transition-colors",
                    isActive
                      ? "bg-primary/10 text-foreground"
                      : "hover:bg-secondary/60 text-muted-foreground hover:text-foreground",
                  )}
                  aria-current={isActive ? "true" : undefined}
                >
                  <span
                    className={cn(
                      "shrink-0 h-5 w-5 rounded-md flex items-center justify-center text-[10px] font-mono font-semibold",
                      isActive
                        ? "bg-primary text-white"
                        : "bg-secondary text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary",
                    )}
                  >
                    {idx + 1}
                  </span>
                  <span className="line-clamp-2 leading-snug pt-0.5">
                    {s.title}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <div className="mt-4 pt-3 border-t border-border/40">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
          <span>
            {Math.max(activeIdx + 1, 0)} de {sections.length} seções
          </span>
          <span className="font-mono tabular-nums">
            {Math.round(progress)}%
          </span>
        </div>
        <div className="h-1 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-fuchsia-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function SummaryContent({
  summary,
  sectionList,
  sectionRefs,
}: {
  summary: LectureSummary;
  sectionList: SectionRef[];
  sectionRefs: React.MutableRefObject<Map<string, HTMLElement>>;
}) {
  return (
    <article className="rounded-2xl border border-border/60 bg-card p-6 md:p-8 space-y-8">
      {/* Resumo geral em destaque */}
      {summary.generalSummary && (
        <div className="rounded-xl bg-gradient-to-br from-primary/8 via-card to-fuchsia-500/8 border border-primary/15 p-5">
          <div className="text-[11px] uppercase tracking-wider text-primary/90 font-medium mb-2 inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> Resumo geral
          </div>
          <p className="text-sm md:text-base leading-relaxed text-foreground/90 whitespace-pre-line">
            {summary.generalSummary}
          </p>
        </div>
      )}

      {/* Pontos centrais — destaque */}
      {summary.highlights && summary.highlights.length > 0 && (
        <div className="rounded-xl bg-primary/5 border border-primary/15 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-7 w-7 rounded-md bg-primary/15 flex items-center justify-center">
              <Brain className="h-4 w-4 text-primary" />
            </span>
            <h2 className="text-sm font-semibold">Pontos-chave</h2>
          </div>
          <ul className="space-y-2.5">
            {summary.highlights.map((h, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span className="text-foreground/90">
                  <InlineMarkdown content={h} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Seções */}
      {summary.sections.map((sec, idx) => {
        const ref = sectionList[idx];
        return (
          <section
            key={`${ref.id}`}
            data-section-id={ref.id}
            id={ref.id}
            ref={(el) => {
              if (el) sectionRefs.current.set(ref.id, el);
              else sectionRefs.current.delete(ref.id);
            }}
            className="scroll-mt-20"
          >
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-[10px] font-mono text-muted-foreground tabular-nums px-1.5 py-0.5 rounded bg-secondary/60">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <h2 className="text-lg md:text-xl font-semibold tracking-tight">
                {ref.title}
              </h2>
              <a
                href={`#${ref.id}`}
                aria-label={`Link permanente pra ${ref.title}`}
                className="text-muted-foreground/40 hover:text-primary text-xs ml-1 transition-colors"
              >
                #
              </a>
            </div>

            {sec.spokenContent && (
              <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-strong:text-foreground prose-img:rounded-lg prose-img:border prose-img:border-border/60 prose-headings:scroll-mt-20">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {sec.spokenContent}
                </ReactMarkdown>
              </div>
            )}

            {sec.relatedQA && sec.relatedQA.length > 0 && (
              <div className="mt-4 rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-3">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  Perguntas durante a aula
                </div>
                {sec.relatedQA.map((qa, qi) => (
                  <div key={qi} className="space-y-1.5">
                    <p className="text-sm font-medium leading-snug">
                      <span className="text-primary mr-1.5">P.</span>
                      {qa.question}
                    </p>
                    <div className="text-sm text-foreground/80 leading-relaxed pl-5">
                      <span className="text-primary mr-1.5 font-medium">R.</span>
                      <span className="prose prose-sm dark:prose-invert inline max-w-none prose-p:inline prose-p:my-0">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {qa.answer}
                        </ReactMarkdown>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </article>
  );
}

function InlineMarkdown({ content }: { content: string }) {
  // Versão inline simples: bold/italic/code só.
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > last) {
      parts.push(<Fragment key={`t-${i++}`}>{content.slice(last, match.index)}</Fragment>);
    }
    const tok = match[0];
    if (tok.startsWith("**")) {
      parts.push(<strong key={`b-${i++}`}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      parts.push(
        <code
          key={`c-${i++}`}
          className="px-1 py-0.5 rounded bg-secondary text-[12px] font-mono"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else {
      parts.push(<em key={`i-${i++}`}>{tok.slice(1, -1)}</em>);
    }
    last = match.index + tok.length;
  }
  if (last < content.length) {
    parts.push(<Fragment key={`t-${i++}`}>{content.slice(last)}</Fragment>);
  }
  return <>{parts}</>;
}

function CtaCard({
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
  const inner = (
    <div className="rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 hover:-translate-y-0.5 transition-all p-4 h-full flex flex-col gap-2 group cursor-pointer">
      <div className="h-9 w-9 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
        {icon}
      </div>
      <div className="text-sm font-semibold mt-1">{title}</div>
      <div className="text-xs text-muted-foreground leading-snug flex-1">
        {description}
      </div>
      <div className="text-[10px] text-muted-foreground/80 inline-flex items-center gap-1 mt-1">
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
  if (href) {
    return <Link href={href}>{inner}</Link>;
  }
  return (
    <button type="button" onClick={onClick} className="text-left w-full">
      {inner}
    </button>
  );
}

function QuickSummaryCard({
  summary,
  onJumpToHighlights,
}: {
  summary: LectureSummary;
  onJumpToHighlights: () => void;
}) {
  const snippet = summary.generalSummary
    ? summary.generalSummary.length > 220
      ? summary.generalSummary.slice(0, 200).trim() + "…"
      : summary.generalSummary
    : (summary.highlights ?? []).slice(0, 2).join(" · ");
  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 via-card to-fuchsia-500/8 p-4">
      <div className="text-[11px] uppercase tracking-wider text-primary/90 font-medium mb-2 inline-flex items-center gap-1.5">
        <Sparkles className="h-3 w-3" /> Resumo rápido
      </div>
      <p className="text-xs leading-relaxed text-foreground/85 line-clamp-5">
        {snippet || "Sem prévia disponível."}
      </p>
      <button
        type="button"
        onClick={onJumpToHighlights}
        className="mt-3 text-[11px] font-medium text-primary inline-flex items-center gap-1 hover:gap-1.5 transition-all"
      >
        Ver todos os pontos-chave <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}

function RelatedCard({ related }: { related: Lecture[] }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="text-sm font-semibold mb-3">Materiais relacionados</div>
      {related.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sem outros resumos nesta matéria por enquanto.
        </p>
      ) : (
        <ul className="space-y-2">
          {related.map((l) => (
            <li key={l.id}>
              <Link
                href={`/resumo/${l.id}`}
                className="group flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-secondary/40 transition-colors"
              >
                <span className="h-8 w-8 shrink-0 rounded-md bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-primary" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate group-hover:text-primary transition-colors">
                    {l.title}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Resumo · {formatDateBR(new Date(l.updatedAt))}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type NextStepsAction = "flashcards" | "quiz" | "mindmap";

function NextStepsCard({
  lectureId,
  durationMin,
  counts,
  onAction,
}: {
  lectureId: string;
  durationMin: number;
  counts: AssetCounts;
  onAction: (action: NextStepsAction) => void;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="text-sm font-semibold mb-3">Próximos passos</div>
      <ul className="space-y-2">
        <NextStepItem
          done={counts.flashcards.count > 0}
          label={
            counts.flashcards.count > 0
              ? `Revisar flashcards (${counts.flashcards.count} cards)`
              : "Criar flashcards deste resumo"
          }
          onClick={() => onAction("flashcards")}
        />
        <NextStepItem
          done={counts.quiz.count > 0}
          label={
            counts.quiz.count > 0
              ? `Fazer quiz (${counts.quiz.count} questões)`
              : "Gerar quiz desta aula"
          }
          onClick={() => onAction("quiz")}
        />
        <NextStepItem
          done={counts.mindmap.count > 0}
          label={
            counts.mindmap.count > 0
              ? "Abrir mapa mental"
              : "Criar mapa mental"
          }
          onClick={() => onAction("mindmap")}
        />
        <NextStepItem
          done={false}
          label={`Ver gravação da aula (${durationMin} min)`}
          href={`/lecture/${lectureId}`}
        />
      </ul>
    </div>
  );
}

function NextStepItem({
  done,
  label,
  onClick,
  href,
}: {
  done: boolean;
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  const content = (
    <div
      className={cn(
        "flex items-start gap-2.5 px-2 py-2 rounded-lg transition-colors group cursor-pointer",
        "hover:bg-secondary/40",
      )}
    >
      <span
        className={cn(
          "shrink-0 h-4 w-4 rounded border mt-0.5 flex items-center justify-center transition-colors",
          done
            ? "bg-primary border-primary text-white"
            : "border-border bg-background group-hover:border-primary",
        )}
        aria-hidden
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

  return (
    <li>
      {href ? (
        <Link href={href}>{content}</Link>
      ) : (
        <button type="button" onClick={onClick} className="w-full text-left">
          {content}
        </button>
      )}
    </li>
  );
}

function buildSuggestions(summary: LectureSummary): string[] {
  const out: string[] = [];
  const first = summary.highlights?.[0];
  if (first && first.length < 60) {
    out.push(`Explique melhor: "${first.slice(0, 50)}".`);
  }
  out.push("Qual o principal conceito desta aula?");
  out.push("Como aplicar isso na prática clínica?");
  return out.slice(0, 3);
}

