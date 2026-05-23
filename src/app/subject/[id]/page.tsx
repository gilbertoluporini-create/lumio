"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  ChevronRight,
  Clock,
  MapPin,
  Mic,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { LumiCharacter } from "@/components/brand/lumi";
import { LumiIcon, type LumiIconName } from "@/components/brand/lumi-icon";
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
import {
  createLectureAsync,
  deleteLectureAsync,
  deleteSubjectAsync,
  getSubjectAsync,
  listLecturesAsync,
} from "@/lib/db";
import {
  DAY_LABELS_LONG,
  type Lecture,
  type Subject,
  type User,
} from "@/lib/types";
import { cn, formatDuration, formatRelativeTime } from "@/lib/utils";

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
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [lectureTitle, setLectureTitle] = useState("");

  async function refresh() {
    const [s, l] = await Promise.all([
      getSubjectAsync(user.id, subjectId),
      listLecturesAsync(user.id, subjectId),
    ]);
    setSubject(s);
    setLectures(l);
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
    const withSummary = lectures.filter((l) => l.summary).length;
    const totalMsgs = lectures.reduce((acc, l) => acc + l.messages.length, 0);
    return { totalMin, withSlides, withSummary, totalMsgs };
  }, [lectures]);

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
          <div
            className={cn(
              "h-16 w-16 shrink-0 rounded-2xl bg-gradient-to-br shadow-lg",
              subject.color,
            )}
          />
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight truncate">
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
      {lectures.length === 0 ? (
        <EmptyState onCreate={() => setNewOpen(true)} />
      ) : (
        <div className="space-y-3">
          {lectures.map((l) => (
            <LectureFolder
              key={l.id}
              lecture={l}
              subjectColor={subject.color}
              onDelete={() => handleDeleteLecture(l)}
            />
          ))}
        </div>
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
    </div>
  );
}

function LectureFolder({
  lecture,
  subjectColor,
  onDelete,
}: {
  lecture: Lecture;
  subjectColor: string;
  onDelete: () => void;
}) {
  const hasTranscript = lecture.transcript.trim().length > 0;
  const hasSlides = (lecture.slides?.length ?? 0) > 0;
  const hasSummary = !!lecture.summary;
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
            <FeatureTab
              href={`/lecture/${lecture.id}/products`}
              icon="sparkle"
              label="Produtos"
              detail={hasSummary ? "Resumo gerado" : "Resumo, flash cards…"}
              active={hasSummary}
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
