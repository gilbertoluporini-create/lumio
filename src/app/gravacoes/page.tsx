"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  Loader2,
  Mic,
  MoreVertical,
  Pause,
  Play,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { LumiCharacter } from "@/components/brand/lumi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NewLectureDialog } from "@/components/documents/new-lecture-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteLectureAsync,
  listLecturesAsync,
  listSubjectsAsync,
} from "@/lib/db";
import type { Lecture, Subject, User } from "@/lib/types";
import { cn, formatDuration } from "@/lib/utils";
import { Waveform } from "@/components/audio/waveform";
import { AudioPlayer } from "@/components/audio/audio-player";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * Mapa de ícones por área temática (mesma lógica do dashboard).
 * Importado inline pra evitar refator agora — quando confirmar que o
 * dashboard tá estável extraio pra um util shared.
 */
import {
  Activity,
  Atom,
  BookOpen,
  Brain,
  Briefcase,
  Calculator,
  Code,
  Dna,
  Dumbbell,
  FlaskConical,
  Gavel,
  Globe,
  HeartPulse,
  Landmark,
  Languages,
  Library,
  Leaf,
  Lightbulb,
  Microscope,
  Music,
  Palette,
  Pill,
  Scale,
  Sigma,
  Stethoscope,
  Syringe,
  Users,
  Wind,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

function getSubjectIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (/cardio|cora[cç][aã]o|cardiovasc|circulat|hemato|vascul/.test(n)) return HeartPulse;
  if (/respirat|pulm[aã]o|pulmonar|pneumo/.test(n)) return Wind;
  if (/endo|horm[oô]n|metabol|diabet/.test(n)) return Pill;
  if (/farmaco|medicament|terap[eê]utic|vacin/.test(n)) return Syringe;
  if (/anatomia|sistema\s+nerv|c[eé]rebro|neuro|psiqui|psicolog/.test(n)) return Brain;
  if (/habilidad|cl[ií]nic|semiolog|propedeu/.test(n)) return Stethoscope;
  if (/aten[cç][aã]o\s*prim|aps|sa[uú]de\s+coletiva|sa[uú]de\s+p[uú]blica|epidemio/.test(n)) return Activity;
  if (/pesquisa|inova[cç][aã]o|metodol|tcc|tese|monografia/.test(n)) return Microscope;
  if (/reuni[aã]o|integ|tutor|grupo|tbl|pbl/.test(n)) return Users;
  if (/gen[eé]tic|dna|cromoss/.test(n)) return Dna;
  if (/bioqu[ií]m|qu[ií]mic/.test(n)) return FlaskConical;
  if (/f[ií]sic|mec[aâ]nic\s+(quant|cl[aá]ss)/.test(n)) return Atom;
  if (/biolog|bases\s+biol|histol|embriol|ecolog|botan|zoolog/.test(n)) return Leaf;
  if (/c[aá]lculo|matem[aá]tic|alg[eé]bra|geometria/.test(n)) return Calculator;
  if (/estat[ií]stic|probabilidad/.test(n)) return Sigma;
  if (/direito|civil|penal|constituci|tribut|processual|trabalh.*direito|oab/.test(n)) return Gavel;
  if (/[eé]tica|cidadan|deont/.test(n)) return Scale;
  if (/filosof|sociol|antropol|hist[oó]ri|geogr/.test(n)) return Landmark;
  if (/literat|portugu[eê]s\b|reda[cç][aã]o/.test(n)) return Library;
  if (/ingl[eê]s|espanhol|franc[eê]s|alem[aã]o|l[ií]ngua|idioma/.test(n)) return Languages;
  if (/program|software|c[oó]digo|algoritmo|estrutur.*dados|engenharia\s+de\s+softw/.test(n)) return Code;
  if (/redes|sistema.*operac|computa[cç][aã]o|inform[aá]tic|dados|ia\b|machine\s+learning/.test(n)) return Code;
  if (/engenharia|el[eé]tric|eletr[oô]nic|mec[aâ]nic|civil|materiais|projeto/.test(n)) return Wrench;
  if (/admin|gest[aã]o|empreend|neg[oó]cio|marketing|contab|empres/.test(n)) return Briefcase;
  if (/economi|finan[cç]/.test(n)) return Landmark;
  if (/geografia|ambient|sustent/.test(n)) return Globe;
  if (/m[uú]sic|sonor/.test(n)) return Music;
  if (/arte|design|artes\s+visuais|desenho/.test(n)) return Palette;
  if (/educa[cç][aã]o\s+f[ií]sic|esporte|treinament|fitness/.test(n)) return Dumbbell;
  if (/inova[cç][aã]o|criativ/.test(n)) return Lightbulb;
  return BookOpen;
}

export default function GravacoesPage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <GravacoesView user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function formatHoursMinutes(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function GravacoesView({ user }: { user: User }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSubject, setFilterSubject] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [newLectureOpen, setNewLectureOpen] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([listSubjectsAsync(user.id), listLecturesAsync(user.id)])
      .then(([s, l]) => {
        if (!active) return;
        setSubjects(s);
        setLectures(l);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user.id]);

  const subjectById = useMemo(() => {
    const map: Record<string, Subject> = {};
    for (const s of subjects) map[s.id] = s;
    return map;
  }, [subjects]);

  // ordenadas mais recentes primeiro
  const sortedLectures = useMemo(
    () =>
      lectures
        .slice()
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
    [lectures],
  );

  const filteredLectures = useMemo(() => {
    return sortedLectures.filter((l) => {
      if (filterSubject !== "all" && l.subjectId !== filterSubject) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const subjName = subjectById[l.subjectId]?.name.toLowerCase() ?? "";
        return (
          l.title.toLowerCase().includes(q) ||
          subjName.includes(q) ||
          (l.transcript?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [sortedLectures, filterSubject, search, subjectById]);

  const recentLecture = sortedLectures[0];
  const recentSubject = recentLecture ? subjectById[recentLecture.subjectId] : undefined;

  const stats = useMemo(() => {
    const total = lectures.length;
    const totalMin = Math.floor(
      lectures.reduce((acc, l) => acc + l.durationSec, 0) / 60,
    );
    const withTranscript = lectures.filter((l) => l.transcript && l.transcript.length > 0).length;
    return { total, totalMin, withTranscript };
  }, [lectures]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      {/* Header */}
      <div className="mb-8 flex items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/illustrations/lumi-headset.png"
          alt="Lumi"
          className="hidden h-20 w-auto shrink-0 object-contain drop-shadow-sm sm:block md:h-24"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-muted-foreground mb-1">
            Suas aulas, organizadas e pesquisáveis
          </div>
          <h1 className="text-3xl md:text-4xl heading-display">
            Minhas gravações
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Todas as aulas transcritas pelo Lumio com busca inteligente. Clique em qualquer aula pra abrir o conteúdo completo.
          </p>
        </div>
        <Button
          variant="gradient"
          onClick={() => setNewLectureOpen(true)}
          className="shrink-0"
        >
          <Mic className="h-4 w-4" /> Nova gravação
        </Button>
      </div>

      {lectures.length === 0 ? (
        <EmptyState onNew={() => setNewLectureOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Coluna esquerda (8 cols) */}
          <div className="lg:col-span-8 space-y-5">
            {/* Card destaque: aula mais recente */}
            {recentLecture && (
              <RecentLectureCard lecture={recentLecture} subject={recentSubject} />
            )}

            {/* Filtros + tabela */}
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-sm font-semibold">Todas as gravações</h2>
                <div className="flex items-center gap-2 flex-1 sm:flex-initial sm:min-w-[400px] justify-end">
                  <div className="relative flex-1 sm:flex-initial sm:w-48">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Buscar gravações…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-8 h-9 text-sm"
                    />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 gap-1.5">
                        <Filter className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">
                          {filterSubject === "all"
                            ? "Todas as matérias"
                            : subjectById[filterSubject]?.name ?? "Filtro"}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-[300px] overflow-auto">
                      <DropdownMenuItem onClick={() => setFilterSubject("all")}>
                        Todas as matérias
                      </DropdownMenuItem>
                      {subjects.map((s) => (
                        <DropdownMenuItem
                          key={s.id}
                          onClick={() => setFilterSubject(s.id)}
                        >
                          {s.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Headers da tabela */}
              <div className="hidden md:grid grid-cols-[1fr_180px_90px_120px_120px_60px] gap-3 px-5 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/50 bg-secondary/20">
                <div>Aula / Matéria</div>
                <div>Áudio</div>
                <div>Duração</div>
                <div>Transcrição</div>
                <div>Data</div>
                <div className="text-right">Ações</div>
              </div>

              {/* Linhas */}
              {filteredLectures.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                  Nenhuma gravação encontrada com esse filtro.
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {filteredLectures.map((l) => (
                    <LectureTableRow
                      key={l.id}
                      lecture={l}
                      subject={subjectById[l.subjectId]}
                      userId={user.id}
                      onDeleted={(id) =>
                        setLectures((prev) => prev.filter((x) => x.id !== id))
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Coluna direita (4 cols) — sidebar de stats */}
          <div className="lg:col-span-4 space-y-5">
            <StatsCard total={stats.total} totalMin={stats.totalMin} withTranscript={stats.withTranscript} />
            <TipCard />
          </div>
        </div>
      )}

      <NewLectureDialog
        open={newLectureOpen}
        onOpenChange={setNewLectureOpen}
        userId={user.id}
        subjects={subjects}
      />
    </div>
  );
}

function RecentLectureCard({
  lecture,
  subject,
}: {
  lecture: Lecture;
  subject: Subject | undefined;
}) {
  const Icon = subject ? getSubjectIcon(subject.name) : FileText;
  const hasTranscript = !!lecture.transcript && lecture.transcript.length > 0;
  const date = new Date(lecture.updatedAt);
  const isToday =
    date.toDateString() === new Date().toDateString();
  const dateLabel = isToday
    ? "Hoje"
    : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            Gravação mais recente
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {isToday ? "Hoje" : dateLabel}
          </Badge>
        </div>
        {hasTranscript && (
          <Badge
            variant="secondary"
            className="gap-1 text-[10px] text-primary bg-primary/10"
          >
            <CheckCircle2 className="h-2.5 w-2.5" />
            Transcrição pronta
          </Badge>
        )}
      </div>

      <Link href={`/lecture/${lecture.id}`} className="flex items-start gap-4 group">
        <div className="h-14 w-14 shrink-0 rounded-xl bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
          <Icon className="h-6 w-6 text-primary" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold group-hover:text-primary transition-colors truncate">
            {lecture.title}
          </div>
          {subject && (
            <div className="text-sm text-muted-foreground truncate">
              {subject.name}
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {dateLabel}
            </span>
            {lecture.durationSec > 0 && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(lecture.durationSec)}
              </span>
            )}
          </div>
        </div>
      </Link>

      {/* Player de áudio quando disponível */}
      {lecture.audioUrl && (
        <div className="mt-5 pt-5 border-t border-border/50">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
            <Play className="h-3 w-3" />
            Áudio da aula
          </div>
          <AudioPlayer
            src={lecture.audioUrl}
            initialDurationSec={lecture.durationSec}
          />
        </div>
      )}

      {/* Preview da transcrição */}
      {hasTranscript && (
        <div className="mt-5 pt-5 border-t border-border/50">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
            <FileText className="h-3 w-3" />
            Prévia da transcrição
          </div>
          <p className="text-sm text-foreground/85 leading-relaxed line-clamp-3">
            {lecture.transcript!.slice(0, 320)}
            {lecture.transcript!.length > 320 && "…"}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button asChild variant="gradient" size="sm">
              <Link href={`/lecture/${lecture.id}`}>
                <Play className="h-3.5 w-3.5" /> Abrir aula
              </Link>
            </Button>
            <Button variant="outline" size="sm" disabled title="Em breve">
              <Bookmark className="h-3.5 w-3.5" /> Favoritar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function LectureTableRow({
  lecture,
  subject,
  userId,
  onDeleted,
}: {
  lecture: Lecture;
  subject: Subject | undefined;
  userId: string;
  onDeleted: (id: string) => void;
}) {
  const Icon = subject ? getSubjectIcon(subject.name) : FileText;
  const hasTranscript = !!lecture.transcript && lecture.transcript.length > 0;
  const hasAudio = !!lecture.audioUrl;
  const date = new Date(lecture.updatedAt);
  const dateLabel = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeLabel = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const isLive = lecture.status === "live";
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function toggleExpand(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!hasAudio) return;
    setExpanded((v) => !v);
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `Excluir a aula "${lecture.title}"?\n\nIsso remove transcrição, áudio, slides e o resumo gerado a partir dela.`,
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteLectureAsync(userId, lecture.id);
      toast.success("Aula excluída.");
      onDeleted(lecture.id);
    } catch (err) {
      toast.error(`Erro ao excluir: ${(err as Error).message}`);
      setDeleting(false);
    }
  }

  return (
    <div className="group">
      <div className="grid md:grid-cols-[1fr_180px_90px_120px_120px_60px] grid-cols-[1fr_60px] gap-3 px-5 py-3 hover:bg-secondary/30 transition-colors items-center">
        {/* Coluna 1: ícone + título + matéria (clicável → abre aula) */}
        <Link
          href={`/lecture/${lecture.id}`}
          className="flex items-center gap-3 min-w-0"
        >
          <div className="h-9 w-9 shrink-0 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">
              {lecture.title}
            </div>
            {subject && (
              <div className="text-xs text-muted-foreground truncate">
                {subject.name}
              </div>
            )}
          </div>
        </Link>

        {/* Coluna 2: waveform (clicável pra expandir player) */}
        <div className="hidden md:flex items-center min-w-0">
          {hasAudio ? (
            <button
              type="button"
              onClick={toggleExpand}
              className={cn(
                "flex-1 min-w-0 flex items-center gap-2 px-2 py-1 rounded-md",
                "hover:bg-secondary/60 transition-colors group/wave",
              )}
              title={expanded ? "Recolher player" : "Ouvir áudio da aula"}
            >
              <Waveform
                src={lecture.audioUrl}
                bars={40}
                height={28}
                progress={expanded ? undefined : 0}
                className="flex-1"
              />
              {expanded ? (
                <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 opacity-0 group-hover/wave:opacity-100 transition-opacity" />
              )}
            </button>
          ) : (
            <div className="flex-1 min-w-0 px-2">
              <Waveform
                decorative
                seed={lecture.durationSec || lecture.id.length}
                bars={40}
                height={28}
                label="Sem áudio"
              />
            </div>
          )}
        </div>

        {/* Coluna 3: duração */}
        <Link
          href={`/lecture/${lecture.id}`}
          className="hidden md:flex items-center gap-1 text-xs text-muted-foreground font-mono tabular-nums"
        >
          <Clock className="h-3 w-3 shrink-0" />
          {lecture.durationSec > 0 ? formatDuration(lecture.durationSec) : "—"}
        </Link>

        {/* Coluna 4: status transcrição */}
        <Link href={`/lecture/${lecture.id}`} className="hidden md:block">
          {isLive ? (
            <Badge variant="live" className="gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 pulse-dot" />
              AO VIVO
            </Badge>
          ) : hasTranscript ? (
            <Badge
              variant="secondary"
              className="gap-1 text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/15"
            >
              <CheckCircle2 className="h-2.5 w-2.5" />
              Pronta
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              Não disponível
            </Badge>
          )}
        </Link>

        {/* Coluna 5: data */}
        <Link
          href={`/lecture/${lecture.id}`}
          className="hidden md:flex flex-col"
        >
          <span className="text-xs font-mono tabular-nums">{dateLabel}</span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {timeLabel}
          </span>
        </Link>

        {/* Coluna 6: ações */}
        <div className="flex items-center gap-1 justify-end shrink-0">
          <Link
            href={`/lecture/${lecture.id}`}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-primary/10 group-hover:bg-primary/20 transition-colors"
            aria-label="Abrir aula"
          >
            <Play className="h-3.5 w-3.5 text-primary fill-primary" />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.preventDefault()}
                className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-secondary/60 disabled:opacity-50"
                aria-label="Mais opções"
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  void handleDelete();
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" /> Excluir aula
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Player expandido */}
      {expanded && hasAudio && lecture.audioUrl && (
        <div className="px-5 pb-4 pt-1 bg-secondary/15 border-t border-border/40">
          <AudioPlayer
            src={lecture.audioUrl}
            initialDurationSec={lecture.durationSec}
          />
        </div>
      )}
    </div>
  );
}

function StatsCard({
  total,
  totalMin,
  withTranscript,
}: {
  total: number;
  totalMin: number;
  withTranscript: number;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="text-sm font-semibold mb-4">Resumo das gravações</div>
      <div className="space-y-4">
        <StatRow
          icon={<Sparkles className="h-4 w-4 text-primary" />}
          value={total.toString()}
          label={total === 1 ? "aula gravada" : "aulas gravadas"}
        />
        <StatRow
          icon={<Clock className="h-4 w-4 text-primary" />}
          value={formatHoursMinutes(totalMin)}
          label="tempo total"
        />
        <StatRow
          icon={<FileText className="h-4 w-4 text-primary" />}
          value={withTranscript.toString()}
          label={withTranscript === 1 ? "transcrição pronta" : "transcrições prontas"}
        />
      </div>
    </div>
  );
}

function StatRow({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xl font-semibold tabular-nums leading-tight">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function TipCard() {
  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-fuchsia-500/5 p-5">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 shrink-0 rounded-lg bg-primary/15 flex items-center justify-center">
          <Lightbulb className="h-4 w-4 text-primary" />
        </div>
        <div>
          <div className="text-sm font-semibold">Dica do Lumio</div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Use a busca pra encontrar qualquer trecho da aula. A transcrição
            torna tudo pesquisável — palavras do professor, definições,
            exemplos.
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-12 text-center">
      <div className="flex justify-center mb-3">
        <LumiCharacter mood="sleeping" size="lg" float />
      </div>
      <h3 className="text-lg font-semibold">Nenhuma gravação ainda</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
        Suas aulas transcritas aparecem aqui. Grave a primeira agora — a
        transcrição começa em segundos.
      </p>
      <Button onClick={onNew} variant="gradient" size="lg" className="mt-6">
        <Mic className="h-4 w-4" /> Gravar aula
      </Button>
    </div>
  );
}

// Wrapper de import default não usado — Pause apenas pra deixar Lucide
// resolver corretamente em casos de tree-shaking agressivo.
void Pause;
void ArrowRight;
