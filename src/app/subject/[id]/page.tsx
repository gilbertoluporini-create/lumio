"use client";

import { createElement, use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  ChevronRight,
  Clock,
  FileText,
  HelpCircle,
  Layers,
  MapPin,
  Mic,
  Network,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { LumiCharacter } from "@/components/brand/lumi";
import { LumiIcon, type LumiIconName } from "@/components/brand/lumi-icon";
import { getSubjectIcon } from "@/lib/subject-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContentWizard } from "@/components/ai/content-wizard";
import {
  createLectureAsync,
  deleteLectureAsync,
  deleteSubjectAsync,
  getSubjectAsync,
  listLecturesAsync,
} from "@/lib/db";
import { listSummariesAsync } from "@/lib/summaries";
import { listDocumentsAsync } from "@/lib/documents";
import {
  DAY_LABELS_LONG,
  type Document as LumioDocument,
  type Lecture,
  type Subject,
  type Summary,
  type User,
} from "@/lib/types";
import { cn, formatDuration, formatRelativeTime } from "@/lib/utils";

type SubjectAsset = {
  id: string;
  lecture_id: string;
  kind: "flashcards" | "quiz" | "mindmap";
  payload: {
    cards?: unknown[];
    questions?: unknown[];
    centralTopic?: string;
    branches?: unknown[];
  };
  created_at: string;
  updated_at: string;
};

export default function SubjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <SubjectView user={user} subjectId={id} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function SubjectView({
  user,
  subjectId,
}: {
  user: User;
  subjectId: string;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [documents, setDocuments] = useState<LumioDocument[]>([]);
  const [assets, setAssets] = useState<SubjectAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [lectureTitle, setLectureTitle] = useState("");
  const [wizardMode, setWizardMode] = useState<
    "summary" | "flashcards" | "quiz" | "mindmap" | null
  >(null);

  async function refresh() {
    const [s, l, sm, d] = await Promise.all([
      getSubjectAsync(user.id, subjectId),
      listLecturesAsync(user.id, subjectId),
      listSummariesAsync(user.id, subjectId),
      listDocumentsAsync(user.id, subjectId),
    ]);
    setSubject(s);
    setLectures(l);
    setSummaries(sm);
    setDocuments(d);

    // Busca todos os assets (flashcards/quiz/mindmap) das aulas dessa matéria
    // pra que apareçam na pasta — antes o user gerava um quiz e ele "sumia"
    // (estava no DB mas a pasta da matéria não listava).
    try {
      const lectureIds = l.map((x) => x.id);
      if (lectureIds.length > 0) {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data: rows, error } = await supabase
          .from("lecture_assets")
          .select("id, lecture_id, kind, payload, created_at, updated_at")
          .eq("user_id", user.id)
          .in("lecture_id", lectureIds)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false });
        if (!error && rows) {
          setAssets(rows as SubjectAsset[]);
        }
      } else {
        setAssets([]);
      }
    } catch (err) {
      console.warn("[subject] assets fetch failed", err);
    }
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  async function handleCreate() {
    const title =
      lectureTitle.trim() || `Aula ${new Date().toLocaleDateString("pt-BR")}`;
    try {
      const lecture = await createLectureAsync(user.id, {
        subjectId,
        title,
      });
      setNewOpen(false);
      router.push(`/lecture/${lecture.id}`);
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    }
  }

  async function handleDeleteLecture(l: Lecture) {
    if (!confirm(`Excluir a aula "${l.title}"? Não dá pra desfazer.`)) return;
    try {
      await deleteLectureAsync(user.id, l.id);
      await refresh();
      toast.success("Aula excluída.");
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    }
  }

  async function handleDeleteSubject() {
    if (!subject) return;
    if (
      !confirm(
        `Excluir a matéria "${subject.name}" e todas suas aulas? Não dá pra desfazer.`,
      )
    )
      return;
    try {
      await deleteSubjectAsync(user.id, subjectId);
      toast.success("Matéria excluída.");
      router.push("/dashboard");
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    }
  }

  const stats = useMemo(() => {
    const totalMin = Math.floor(
      lectures.reduce((acc, l) => acc + l.durationSec, 0) / 60,
    );
    const withSlides = lectures.filter(
      (l) => (l.slides?.length ?? 0) > 0,
    ).length;
    const withSummary = summaries.length;
    const totalMsgs = lectures.reduce((acc, l) => acc + l.messages.length, 0);
    return { totalMin, withSlides, withSummary, totalMsgs };
  }, [lectures, summaries]);

  const lectureIdsWithSummary = useMemo(() => {
    const set = new Set<string>();
    for (const sm of summaries) {
      if (sm.source.kind === "lecture") set.add(sm.source.lectureId);
    }
    return set;
  }, [summaries]);

  // Quando o user gera flashcards/quiz/mindmap só com PDFs (sem gravar aula),
  // o wizard cria uma lecture "fake" como container do asset. Essa lecture
  // não tem transcript/slides/messages — não faz sentido mostrar na lista
  // de "Aulas gravadas". Os assets aparecem na seção "Materiais gerados".
  const realLectures = useMemo(
    () =>
      lectures.filter((l) => {
        const hasTranscript = (l.transcript ?? "").trim().length > 0;
        const hasSlides = (l.slides?.length ?? 0) > 0;
        const hasMessages = (l.messages?.length ?? 0) > 0;
        return hasTranscript || hasSlides || hasMessages;
      }),
    [lectures],
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="h-6 w-32 rounded-md bg-secondary/40 animate-pulse mb-4" />
        <div className="h-10 w-72 rounded-md bg-secondary/50 animate-pulse mb-2" />
        <div className="h-4 w-48 rounded-md bg-secondary/40 animate-pulse mb-8" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-40 rounded-xl bg-secondary/30 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-16 text-center">
        <LumiCharacter mood="confused" size="lg" />
        <h1 className="mt-4 text-xl font-semibold">Matéria não encontrada</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pode ter sido excluída ou o link está errado.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" /> Voltar ao dashboard
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-5">
        <Link href="/dashboard" className="hover:text-foreground transition-colors">
          Dashboard
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{subject.name}</span>
      </div>

      {/* Header da matéria */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div className="flex items-start gap-4 min-w-0">
          <div className="h-16 w-16 shrink-0 rounded-2xl bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
            {createElement(getSubjectIcon(subject.name), {
              className: "h-8 w-8 text-primary",
              strokeWidth: 2.2,
            })}
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl heading-display truncate">
              {subject.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {lectures.length} aula{lectures.length === 1 ? "" : "s"}
              {stats.totalMin > 0 && ` · ${stats.totalMin} min gravados`}
              {stats.withSummary > 0 &&
                ` · ${stats.withSummary} resumo${stats.withSummary === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleDeleteSubject}>
            <Trash2 className="h-4 w-4" />
            Excluir matéria
          </Button>
          <Button variant="gradient" onClick={() => setNewOpen(true)}>
            <Mic className="h-4 w-4" /> Nova aula
          </Button>
        </div>
      </div>

      {/* Quick actions: gerar assets diretamente dessa matéria. O wizard usa
          os PDFs/aulas dessa matéria como contexto principal. */}
      <div className="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <QuickActionTile
          Icon={Sparkles}
          label="Resumo + PDF"
          hint="Subir PDF e gerar"
          color="violet"
          onClick={() => setWizardMode("summary")}
        />
        <QuickActionTile
          Icon={Layers}
          label="Flashcards"
          hint="Criar deck"
          color="emerald"
          onClick={() => setWizardMode("flashcards")}
        />
        <QuickActionTile
          Icon={HelpCircle}
          label="Quiz"
          hint="Gerar questões"
          color="amber"
          onClick={() => setWizardMode("quiz")}
        />
        <QuickActionTile
          Icon={Network}
          label="Mapa mental"
          hint="Visualizar tópicos"
          color="rose"
          onClick={() => setWizardMode("mindmap")}
        />
      </div>

      {/* Schedule da matéria (se tiver) */}
      {(subject.schedule?.length ?? 0) > 0 && (
        <div className="mb-8 rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
            <Calendar className="h-3 w-3" /> Horários
          </div>
          <div className="flex flex-wrap gap-2">
            {(subject.schedule ?? []).map((slot, idx) => (
              <div
                key={idx}
                className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1 text-xs"
              >
                <span className="font-medium">
                  {DAY_LABELS_LONG[slot.dayOfWeek]}
                </span>
                <span className="font-mono text-muted-foreground">
                  {slot.startTime}–{slot.endTime}
                </span>
                {slot.room && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {slot.room}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de aulas como subpastas */}
      {realLectures.length === 0 &&
      documents.length === 0 &&
      assets.length === 0 ? (
        <EmptyState onCreate={() => setNewOpen(true)} />
      ) : (
        <>
          {realLectures.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
                Aulas gravadas · {realLectures.length}
              </h2>
              <div className="space-y-3">
                {realLectures.map((l) => (
                  <LectureFolder
                    key={l.id}
                    lecture={l}
                    subjectColor={subject.color}
                    hasSummary={lectureIdsWithSummary.has(l.id)}
                    onDelete={() => handleDeleteLecture(l)}
                  />
                ))}
              </div>
            </div>
          )}

          {assets.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
                Materiais gerados · {assets.length}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {assets.map((a) => (
                  <AssetCard key={a.id} asset={a} />
                ))}
              </div>
            </div>
          )}

          {documents.length > 0 && (
            <div>
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
                Documentos · {documents.length}
              </h2>
              <div className="space-y-2">
                {documents.map((d) => {
                  const sm = summaries.find(
                    (s) =>
                      s.source.kind === "document" &&
                      s.source.documentId === d.id,
                  );
                  return (
                    <DocumentRow key={d.id} document={d} summary={sm} />
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Dialog Nova Aula */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova aula em {subject.name}</DialogTitle>
            <DialogDescription>
              Em segundos a transcrição começa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              autoFocus
              value={lectureTitle}
              onChange={(e) => setLectureTitle(e.target.value)}
              placeholder={`Aula ${new Date().toLocaleDateString("pt-BR")}`}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              Cancelar
            </Button>
            <Button variant="gradient" onClick={handleCreate}>
              <Mic className="h-4 w-4" /> Começar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wizard de geração de assets — abre via QuickActionTile da toolbar.
          initialSubjectId ancora o save nessa matéria + pré-seleciona PDFs/aulas
          daqui (em vez de cair em subjects[0]). */}
      <ContentWizard
        open={!!wizardMode}
        onOpenChange={(open) => {
          if (!open) setWizardMode(null);
        }}
        mode={wizardMode ?? "summary"}
        userId={user.id}
        initialSubjectId={subjectId}
        onCreated={({ lectureId, summaryId, mode }) => {
          setWizardMode(null);
          if (mode === "summary") {
            if (lectureId) router.push(`/resumo/${lectureId}`);
            else if (summaryId) router.push(`/resumo/doc/${summaryId}`);
            else refresh();
          } else {
            // flashcards/quiz/mindmap: recarrega a tela pra mostrar o asset novo
            refresh();
          }
        }}
      />
    </div>
  );
}

function QuickActionTile({
  Icon,
  label,
  hint,
  color,
  onClick,
}: {
  Icon: typeof Sparkles;
  label: string;
  hint: string;
  color: "violet" | "emerald" | "amber" | "rose";
  onClick: () => void;
}) {
  const palette: Record<
    "violet" | "emerald" | "amber" | "rose",
    { bg: string; text: string }
  > = {
    violet: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400" },
    emerald: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-600 dark:text-emerald-400",
    },
    amber: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
    rose: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400" },
  };
  const p = palette[color];
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-sm transition-all px-3 py-2.5 text-left"
    >
      <div
        className={cn(
          "h-9 w-9 shrink-0 rounded-lg flex items-center justify-center",
          p.bg,
        )}
      >
        <Icon className={cn("h-4 w-4", p.text)} strokeWidth={2.2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-tight truncate group-hover:text-primary transition-colors">
          {label}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">{hint}</div>
      </div>
    </button>
  );
}

function LectureFolder({
  lecture,
  subjectColor,
  hasSummary,
  onDelete,
}: {
  lecture: Lecture;
  subjectColor: string;
  hasSummary: boolean;
  onDelete: () => void;
}) {
  const hasTranscript = lecture.transcript.trim().length > 0;
  const hasSlides = (lecture.slides?.length ?? 0) > 0;
  const msgCount = lecture.messages.length;

  return (
    <Card className="overflow-hidden hover:border-primary/40 transition-colors">
      <CardContent className="p-0">
        {/* Header da aula */}
        <Link
          href={`/lecture/${lecture.id}`}
          className="block px-5 pt-5 pb-3 hover:bg-secondary/20 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div
                className={cn(
                  "h-10 w-10 shrink-0 rounded-lg bg-gradient-to-br shadow-sm flex items-center justify-center",
                  subjectColor,
                )}
              >
                <Mic className="h-4 w-4 text-white/90" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-base truncate">
                    {lecture.title}
                  </h3>
                  {lecture.status === "live" && (
                    <Badge variant="live" className="gap-1 shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 pulse-dot" />
                      AO VIVO
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatRelativeTime(lecture.createdAt)}
                  </span>
                  {lecture.durationSec > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Mic className="h-3 w-3" />
                      {formatDuration(lecture.durationSec)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
              }}
              className="opacity-50 hover:opacity-100 hover:text-destructive transition-all p-1"
              aria-label="Excluir aula"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </Link>

        {/* Subpastas (features) */}
        <div className="border-t border-border/40 bg-card/40">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border/40">
            <FeatureTab
              href={`/lecture/${lecture.id}?tab=transcript`}
              icon="document"
              label="Transcrição"
              detail={
                hasTranscript
                  ? `${lecture.transcript.split(/\s+/).length} palavras`
                  : "Vazio"
              }
              active={hasTranscript}
            />
            <FeatureTab
              href={`/lecture/${lecture.id}?tab=slides`}
              icon="layers"
              label="Slides"
              detail={
                hasSlides
                  ? `${lecture.slides!.length} slide${lecture.slides!.length === 1 ? "" : "s"}`
                  : "Sem PDF"
              }
              active={hasSlides}
            />
            <FeatureTab
              href={`/lecture/${lecture.id}?tab=qa`}
              icon="chat"
              label="Dúvidas"
              detail={
                msgCount > 0
                  ? `${msgCount} mensagem${msgCount === 1 ? "" : "s"}`
                  : "Nenhuma"
              }
              active={msgCount > 0}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FeatureTab({
  href,
  icon,
  label,
  detail,
  active,
}: {
  href: string;
  icon: LumiIconName;
  label: string;
  detail: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors",
        !active && "opacity-60 hover:opacity-100",
      )}
    >
      <LumiIcon name={icon} size={28} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {detail}
        </div>
      </div>
      <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  );
}

function DocumentRow({
  document,
  summary,
}: {
  document: LumioDocument;
  summary?: Summary;
}) {
  // Click sempre vai pra tela do documento. De lá, o user pode abrir
  // o resumo gerado (se houver) ou gerar um novo.
  const href = `/document/${document.id}`;
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-sm transition-all p-4"
    >
      <div className="h-10 w-10 rounded-lg bg-sky-500/10 dark:bg-sky-500/15 flex items-center justify-center shrink-0">
        <FileText className="h-4 w-4 text-sky-600 dark:text-sky-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold tracking-tight truncate group-hover:text-primary transition-colors">
          {document.title}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-2">
          <span>
            PDF
            {document.pageCount
              ? ` · ${document.pageCount} ${document.pageCount === 1 ? "página" : "páginas"}`
              : ""}
          </span>
          {summary && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-1.5 py-px text-[9px] font-mono uppercase tracking-wider">
              <Sparkles className="h-2.5 w-2.5" /> Com resumo
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
    </Link>
  );
}

function AssetCard({ asset }: { asset: SubjectAsset }) {
  // Mapeia kind → rota + ícone + descrição visível
  const meta = (() => {
    if (asset.kind === "flashcards") {
      const count = Array.isArray(asset.payload.cards)
        ? asset.payload.cards.length
        : 0;
      return {
        href: `/deck/${asset.id}`,
        Icon: Layers,
        label: "Flashcards",
        detail: `${count} card${count === 1 ? "" : "s"}`,
        tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      };
    }
    if (asset.kind === "quiz") {
      const count = Array.isArray(asset.payload.questions)
        ? asset.payload.questions.length
        : 0;
      return {
        href: `/quiz-banco/${asset.id}`,
        Icon: HelpCircle,
        label: "Quiz",
        detail: `${count} ${count === 1 ? "questão" : "questões"}`,
        tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      };
    }
    return {
      href: `/mapa/${asset.id}`,
      Icon: Network,
      label: "Mapa mental",
      detail: asset.payload.centralTopic
        ? String(asset.payload.centralTopic).slice(0, 60)
        : "Mapa",
      tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    };
  })();

  return (
    <Link
      href={meta.href}
      className="group rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-sm transition-all p-4 flex items-start gap-3"
    >
      <div
        className={cn(
          "h-10 w-10 shrink-0 rounded-lg flex items-center justify-center",
          meta.tone,
        )}
      >
        <meta.Icon className="h-5 w-5" strokeWidth={2.2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground mb-0.5">
          {meta.label}
        </div>
        <div className="text-sm font-semibold leading-tight line-clamp-2 group-hover:text-primary transition-colors">
          {meta.detail}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
    </Link>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 px-8 py-12 text-center">
      <div className="flex justify-center mb-2">
        <LumiCharacter mood="waving" size="lg" float />
      </div>
      <h3 className="text-lg font-semibold">Nenhuma aula nessa matéria</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        Comece a primeira aula — transcrição em tempo real, chat IA, anexo de
        slides e resumo automático no fim.
      </p>
      <Button onClick={onCreate} variant="gradient" size="lg" className="mt-6">
        <Plus className="h-4 w-4" /> Nova aula
      </Button>
    </div>
  );
}
