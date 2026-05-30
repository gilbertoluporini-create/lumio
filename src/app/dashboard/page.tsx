"use client";

import { createElement, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Atom,
  BookOpen,
  Brain,
  Briefcase,
  CalendarDays,
  Calculator,
  Clock,
  Code,
  Dna,
  Dumbbell,
  FileText,
  FlaskConical,
  Gavel,
  Globe,
  HeartPulse,
  Languages,
  Landmark,
  Layers,
  Leaf,
  Library,
  Lightbulb,
  MessageSquare,
  Microscope,
  Mic,
  MoreVertical,
  Music,
  Palette,
  PieChart,
  Pill,
  Play,
  Plus,
  Scale,
  Sigma,
  Sparkles,
  Star,
  Stethoscope,
  Syringe,
  Trash2,
  TrendingUp,
  Upload,
  Users,
  Wind,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { ContentWizard } from "@/components/ai/content-wizard";
import { LumiCharacter } from "@/components/brand/lumi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CountUp } from "@/components/ui/count-up";
import {
  subscribeFavorites,
  toggleFavorite,
  type FavoriteEntry,
} from "@/lib/favorites";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SubjectIconPicker } from "@/components/app/subject-icon-picker";
import { UploadAudioCard } from "@/components/lecture/upload-audio-card";
import {
  createLectureAsync,
  createSubjectAsync,
  deleteSubjectAsync,
  listLecturesAsync,
  listSubjectsAsync,
} from "@/lib/db";
import { listSummariesAsync } from "@/lib/summaries";
import {
  getSubjectGradientFromName,
  getSubjectPalette,
} from "@/lib/subject-color";
import { getSubjectIconName } from "@/lib/subject-icon";
import {
  DAY_LABELS_SHORT,
  type Lecture,
  type ScheduleSlot,
  type Subject,
  type Summary,
  type User,
} from "@/lib/types";
import { cn, formatDuration, formatRelativeTime } from "@/lib/utils";

export default function DashboardPage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <Dashboard user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

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
  if (/c[aá]lculo|c[áa]lculo|matem[aá]tic|alg[eé]bra|geometria/.test(n)) return Calculator;
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

/** Tom de cor por matéria pra dar variação no grid de pastas. */
function getSubjectTone(name: string): { bg: string; text: string } {
  const palette = getSubjectPalette(name);
  return { bg: palette.soft, text: palette.text };
}

/** Bar chart de 7 dias da semana com labels S T Q Q S S D. */
function WeekBarChart({
  data,
  unit = "min",
  showLabels = false,
}: {
  data: number[];
  unit?: string;
  showLabels?: boolean;
}) {
  const labels = ["S", "T", "Q", "Q", "S", "S", "D"];
  const max = Math.max(1, ...data);
  const todayIdx = (new Date().getDay() + 6) % 7;

  return (
    <div className="w-full">
      <div className={cn("flex items-end gap-1", showLabels ? "h-20" : "h-10")}>
        {data.map((v, i) => {
          const pct = Math.max(8, (v / max) * 100);
          const isToday = i === todayIdx;
          return (
            <div key={i} className="flex-1 flex items-end min-w-0 h-full">
              <div
                className={cn(
                  "w-full rounded-t-sm transition-colors",
                  v === 0
                    ? "bg-muted-foreground/15"
                    : isToday
                      ? "bg-primary"
                      : "bg-primary/40",
                )}
                style={{ height: `${pct}%` }}
                title={`${labels[i]}: ${v} ${unit}`}
              />
            </div>
          );
        })}
      </div>
      {showLabels && (
        <div className="mt-1 flex gap-1">
          {labels.map((l, i) => (
            <div
              key={i}
              className={cn(
                "flex-1 text-center text-[9px] font-mono tabular-nums",
                i === todayIdx
                  ? "text-primary font-semibold"
                  : "text-muted-foreground",
              )}
            >
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type NextSlot = {
  subject: Subject;
  slot: ScheduleSlot;
  dayLabel: string;
  isToday: boolean;
  isTomorrow: boolean;
  startsInMinutes: number;
};

function findNextSlot(subjects: Subject[]): NextSlot | null {
  const now = new Date();
  const currentDow = now.getDay();
  const currentMin = now.getHours() * 60 + now.getMinutes();

  type Candidate = NextSlot & { distance: number };
  const candidates: Candidate[] = [];

  for (const s of subjects) {
    for (const slot of s.schedule ?? []) {
      const dayDiff = (slot.dayOfWeek - currentDow + 7) % 7;
      const slotMin = timeToMinutes(slot.startTime);
      let distance = dayDiff * 24 * 60 + (slotMin - currentMin);
      if (dayDiff === 0 && slotMin <= currentMin) {
        distance += 7 * 24 * 60;
      }
      const isToday = dayDiff === 0 && slotMin > currentMin;
      const isTomorrow = dayDiff === 1;
      candidates.push({
        subject: s,
        slot,
        dayLabel: DAY_LABELS_SHORT[slot.dayOfWeek],
        isToday,
        isTomorrow,
        distance,
        startsInMinutes: distance,
      });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0];
}

/** Lista todos os slots que caem hoje, ordenados por horário. */
function findTodaySlots(subjects: Subject[]): { subject: Subject; slot: ScheduleSlot }[] {
  const dow = new Date().getDay();
  const items: { subject: Subject; slot: ScheduleSlot }[] = [];
  for (const s of subjects) {
    for (const slot of s.schedule ?? []) {
      if (slot.dayOfWeek === dow) items.push({ subject: s, slot });
    }
  }
  items.sort(
    (a, b) =>
      timeToMinutes(a.slot.startTime) - timeToMinutes(b.slot.startTime),
  );
  return items;
}

/** Calcula trend % entre últimos 7 dias e os 7 anteriores. */
function computeWeekTrends(lectures: Lecture[], summaries: Summary[]) {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const currentStart = now - 7 * day;
  const prevStart = now - 14 * day;

  let curMinutes = 0;
  let prevMinutes = 0;
  let curSummaries = 0;
  let prevSummaries = 0;

  for (const l of lectures) {
    const t = new Date(l.createdAt).getTime();
    const min = Math.round(l.durationSec / 60);
    if (t >= currentStart) curMinutes += min;
    else if (t >= prevStart) prevMinutes += min;
  }

  for (const s of summaries) {
    const t = new Date(s.createdAt).getTime();
    if (t >= currentStart) curSummaries += 1;
    else if (t >= prevStart) prevSummaries += 1;
  }

  return {
    minutesTrend:
      prevMinutes > 0
        ? Math.round(((curMinutes - prevMinutes) / prevMinutes) * 100)
        : curMinutes > 0
          ? 100
          : 0,
    summariesTrend:
      prevSummaries > 0
        ? Math.round(((curSummaries - prevSummaries) / prevSummaries) * 100)
        : curSummaries > 0
          ? 100
          : 0,
  };
}

/**
 * Atividade no app por dia da semana. Cada gasto de coin (amount < 0) é uma
 * interação (chat, resumo, quiz, flashcards, etc.) — proxy de "tempo no app"
 * sem precisar de tracking de sessão. byDay segue a semana-calendário (seg→dom);
 * o trend compara janelas móveis de 7d (igual aos outros KPIs).
 */
function getWeekActivity(
  transactions: { amount: number; created_at: string }[],
): { byDay: number[]; total: number; trend: number } {
  const byDay = Array(7).fill(0);
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  const dayOffset = (now.getDay() + 6) % 7;
  startOfWeek.setDate(now.getDate() - dayOffset);
  const weekStartMs = startOfWeek.getTime();

  const dayMs = 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const cur7Start = nowMs - 7 * dayMs;
  const prev7Start = nowMs - 14 * dayMs;

  let cur7 = 0;
  let prev7 = 0;
  for (const tx of transactions) {
    if (tx.amount >= 0) continue; // só gastos = interações do usuário
    const t = new Date(tx.created_at).getTime();
    if (t >= weekStartMs) {
      const idx = (new Date(tx.created_at).getDay() + 6) % 7;
      byDay[idx] += 1;
    }
    if (t >= cur7Start) cur7 += 1;
    else if (t >= prev7Start) prev7 += 1;
  }
  const total = byDay.reduce((a, b) => a + b, 0);
  const trend =
    prev7 > 0
      ? Math.round(((cur7 - prev7) / prev7) * 100)
      : cur7 > 0
        ? 100
        : 0;
  return { byDay, total, trend };
}

// Features que o usuário usa (cada gasto de coin é categorizado pelo reason).
const FEATURE_META: Record<string, { label: string; color: string }> = {
  chat: { label: "Chat com a Lumi", color: "#6366f1" },
  summary: { label: "Resumos", color: "#10b981" },
  flashcards: { label: "Flashcards", color: "#0ea5e9" },
  quiz: { label: "Quiz", color: "#f59e0b" },
  mindmap: { label: "Mapas mentais", color: "#f43f5e" },
  voice_reply: { label: "Resposta por voz", color: "#a855f7" },
  slides: { label: "Slides", color: "#14b8a6" },
  image_generation: { label: "Ilustrações", color: "#ec4899" },
  transcript_refine: { label: "Transcrição", color: "#64748b" },
};
// reason (coin_transactions) → feature. summary_with_images cai em "summary".
const REASON_TO_FEATURE: Record<string, string> = {
  chat: "chat",
  summary: "summary",
  summary_with_images: "summary",
  flashcards: "flashcards",
  quiz: "quiz",
  mindmap: "mindmap",
  voice_reply: "voice_reply",
  slides: "slides",
  image_generation: "image_generation",
  transcript_refine: "transcript_refine",
};

function getFeatureUsage(
  transactions: { amount: number; reason: string }[],
): { label: string; value: number; color: string }[] {
  const counts: Record<string, number> = {};
  for (const tx of transactions) {
    if (tx.amount >= 0) continue; // só gastos = uso de feature
    const feat = REASON_TO_FEATURE[tx.reason];
    if (!feat) continue;
    counts[feat] = (counts[feat] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([key, value]) => ({
      label: FEATURE_META[key].label,
      value,
      color: FEATURE_META[key].color,
    }))
    .sort((a, b) => b.value - a.value);
}

/** Donut (conic-gradient) + legenda das features mais usadas. */
function FeatureDonut({
  data,
}: {
  data: { label: string; value: number; color: string }[];
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  if (total === 0) {
    return (
      <div className="py-6 text-center">
        <div className="text-sm text-muted-foreground">
          Sem uso registrado ainda.
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Use o chat, gere resumos, quizzes… e veja aqui o que mais usa.
        </div>
      </div>
    );
  }
  const stops = data.map((d, i) => {
    const prior = data
      .slice(0, i)
      .reduce((sum, x) => sum + x.value, 0);
    const start = (prior / total) * 100;
    const end = ((prior + d.value) / total) * 100;
    return `${d.color} ${start}% ${end}%`;
  });
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-28 w-28 shrink-0">
        <div
          className="h-full w-full rounded-full"
          style={{ background: `conic-gradient(${stops.join(", ")})` }}
        />
        <div className="absolute inset-[24%] rounded-full bg-card flex flex-col items-center justify-center">
          <span className="text-lg font-semibold leading-none tabular-nums">
            {total}
          </span>
          <span className="text-[9px] text-muted-foreground">ações</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((d) => {
          const pct = Math.round((d.value / total) * 100);
          return (
            <li key={d.label} className="flex items-center gap-2 text-xs">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              <span className="flex-1 truncate">{d.label}</span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Dashboard({ user }: { user: User }) {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [transactions, setTransactions] = useState<
    { amount: number; created_at: string; reason: string }[]
  >([]);
  const [newOpen, setNewOpen] = useState(false);
  const [lectureOpen, setLectureOpen] = useState(false);
  const [lectureTitle, setLectureTitle] = useState("");
  const [lectureSubject, setLectureSubject] = useState<string>("");
  const [lectureMode, setLectureMode] = useState<"live" | "upload">("live");
  const [newName, setNewName] = useState("");
  const [iconName, setIconName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    return subscribeFavorites(user.id, setFavorites);
  }, [user.id]);

  async function refresh() {
    const [s, l, sm] = await Promise.all([
      listSubjectsAsync(user.id),
      listLecturesAsync(user.id),
      listSummariesAsync(user.id),
    ]);
    // Filtra lectures totalmente vazias (sem áudio, sem transcript,
    // sem mensagens, sem slides). São criações acidentais via "Nova aula"
    // que o user não chegou a gravar.
    const nonEmpty = l.filter(
      (x) =>
        x.durationSec > 0 ||
        (x.transcript ?? "").trim().length > 0 ||
        (x.messages?.length ?? 0) > 0 ||
        (x.slides?.length ?? 0) > 0 ||
        x.status === "live",
    );
    setSubjects(s);
    setLectures(nonEmpty);
    setSummaries(sm);

    // Atividade no app: transações de coin (cada gasto = uma interação).
    try {
      const res = await fetch("/api/coins?history=1", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.transactions)) {
          setTransactions(
            data.transactions.map(
              (t: { amount: number; created_at: string; reason: string }) => ({
                amount: t.amount,
                created_at: t.created_at,
                reason: t.reason,
              }),
            ),
          );
        }
      }
    } catch {
      /* atividade é best-effort; ignora falha */
    }
  }

  useEffect(() => {
    let cancelled = false;
    void refresh().finally(() => {
      if (!cancelled) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh quando a aba volta a focar (back nav, troca de aba do browser).
  // Cobre o caso: usuário exclui aula em /lecture/[id], volta com back —
  // dashboard precisa re-buscar pra sumir o card.
  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const totalLectures = lectures.length;
    const summariesCount = summaries.length;
    const progressPct =
      totalLectures > 0
        ? Math.round((summariesCount / totalLectures) * 100)
        : 0;
    return {
      totalLectures,
      withSummary: summariesCount,
      progressPct,
    };
  }, [lectures, summaries]);

  const activity = useMemo(
    () => getWeekActivity(transactions),
    [transactions],
  );

  const featureUsage = useMemo(
    () => getFeatureUsage(transactions),
    [transactions],
  );

  const trends = useMemo(
    () => computeWeekTrends(lectures, summaries),
    [lectures, summaries],
  );
  const nextSlot = useMemo(() => findNextSlot(subjects), [subjects]);
  const todayAgenda = useMemo(() => findTodaySlots(subjects), [subjects]);

  const lecturesBySubject = useMemo(() => {
    const map: Record<string, Lecture[]> = {};
    for (const l of lectures) {
      if (!map[l.subjectId]) map[l.subjectId] = [];
      map[l.subjectId].push(l);
    }
    return map;
  }, [lectures]);

  const recentLectures = useMemo(
    () =>
      lectures
        .slice()
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, 6),
    [lectures],
  );

  const lectureIdsWithSummary = useMemo(() => {
    const set = new Set<string>();
    for (const s of summaries) {
      if (s.source.kind === "lecture") set.add(s.source.lectureId);
    }
    return set;
  }, [summaries]);

  /** Aula mais recente que ainda não foi concluída (sem resumo, não live). */
  const continueLecture = useMemo(() => {
    return lectures
      .filter(
        (l) => l.status !== "live" && !lectureIdsWithSummary.has(l.id),
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )[0];
  }, [lectures, lectureIdsWithSummary]);

  async function handleCreateSubject() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const finalColor = getSubjectGradientFromName(trimmed);
      const finalIcon = iconName ?? getSubjectIconName(trimmed);
      const subject = await createSubjectAsync(user.id, {
        name: trimmed,
        color: finalColor,
        icon: finalIcon,
      });
      setNewName("");
      setIconName(null);
      setNewOpen(false);
      await refresh();
      toast.success(`Matéria "${subject.name}" criada.`);
    } catch (err) {
      toast.error(`Erro ao criar matéria: ${(err as Error).message}`);
    }
  }

  async function handleDeleteSubject(s: Subject) {
    if (
      !confirm(
        `Excluir a matéria "${s.name}" e todas suas aulas? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }
    try {
      await deleteSubjectAsync(user.id, s.id);
      await refresh();
      toast.success("Matéria excluída.");
    } catch (err) {
      toast.error(`Erro ao excluir: ${(err as Error).message}`);
    }
  }

  function startNewLecture(subjectId?: string) {
    if (subjects.length === 0) {
      toast.error("Crie uma matéria primeiro.");
      setNewOpen(true);
      return;
    }
    setLectureTitle("");
    setLectureSubject(subjectId ?? subjects[0].id);
    setLectureMode("live");
    setLectureOpen(true);
  }

  function startUploadAudio(subjectId?: string) {
    if (subjects.length === 0) {
      toast.error("Crie uma matéria primeiro.");
      setNewOpen(true);
      return;
    }
    setLectureTitle("");
    setLectureSubject(subjectId ?? subjects[0].id);
    setLectureMode("upload");
    setLectureOpen(true);
  }

  async function handleCreateLecture() {
    const title =
      lectureTitle.trim() || `Aula ${new Date().toLocaleDateString("pt-BR")}`;
    if (!lectureSubject) {
      toast.error("Escolha uma matéria.");
      return;
    }
    try {
      const lecture = await createLectureAsync(user.id, {
        subjectId: lectureSubject,
        title,
      });
      setLectureOpen(false);
      router.push(`/lecture/${lecture.id}`);
    } catch (err) {
      toast.error(`Erro ao criar aula: ${(err as Error).message}`);
    }
  }

  const firstName = user.name.split(" ")[0];

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="h-8 w-48 rounded-md bg-secondary/50 animate-pulse mb-3" />
        <div className="h-4 w-72 rounded-md bg-secondary/40 animate-pulse mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-24 rounded-2xl bg-secondary/30 animate-pulse"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div className="h-64 rounded-2xl bg-secondary/30 animate-pulse" />
          <div className="h-64 rounded-2xl bg-secondary/30 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/illustrations/lumi-dashboard.png"
            alt="Lumi com gráficos"
            className="hidden h-20 w-auto shrink-0 object-contain drop-shadow-sm sm:block md:h-24"
          />
          <div className="min-w-0">
            <h1 className="text-display text-3xl sm:text-4xl font-semibold leading-[1.05]">
              Bom te ver, {firstName}.
            </h1>
            <p className="text-display mt-1 text-2xl sm:text-3xl font-semibold leading-[1.05] text-primary">
              Bora estudar com clareza.
            </p>
          </div>
        </div>

        <div className="flex gap-2 shrink-0 flex-wrap">
          <Button variant="gradient" onClick={() => startNewLecture()}>
            <Mic className="h-4 w-4" /> Gravar aula
          </Button>
          <Button variant="outline" onClick={() => startUploadAudio()}>
            <Upload className="h-4 w-4" /> Subir áudio
          </Button>
          <Button variant="outline" onClick={() => setWizardOpen(true)}>
            <Sparkles className="h-4 w-4" /> Novo resumo
          </Button>
        </div>
      </div>

      {/* 4 KPI cards */}
      <div className="stagger-in mb-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          Icon={CalendarDays}
          label="Próxima aula"
          value={nextSlot ? nextSlot.subject.name : "Sem agenda"}
          sub={
            nextSlot
              ? `${nextSlot.isToday ? "Hoje" : nextSlot.isTomorrow ? "Amanhã" : nextSlot.dayLabel}, ${nextSlot.slot.startTime} · ${
                  timeToMinutes(nextSlot.slot.endTime) -
                  timeToMinutes(nextSlot.slot.startTime)
                } min`
              : "Configure sua grade"
          }
          href={nextSlot ? `/subject/${nextSlot.subject.id}` : "/onboarding"}
        />

        <KPICard
          Icon={Activity}
          label="Atividade no app"
          chartHero
          value={`${activity.total} ${activity.total === 1 ? "ação" : "ações"}`}
          sub={
            activity.total === 0
              ? "Sem atividade essa semana"
              : activity.trend > 0
                ? `↑ ${activity.trend}% vs. semana passada`
                : activity.trend < 0
                  ? `↓ ${Math.abs(activity.trend)}% vs. semana passada`
                  : "esta semana"
          }
          subTone={activity.trend >= 0 ? "positive" : "negative"}
          chart={<WeekBarChart data={activity.byDay} unit="ações" showLabels />}
        />

        <KPICard
          Icon={FileText}
          label="Resumos gerados"
          value={<CountUp value={stats.withSummary} />}
          sub={
            trends.summariesTrend > 0
              ? `↑ ${trends.summariesTrend}% vs. semana passada`
              : trends.summariesTrend < 0
                ? `↓ ${Math.abs(trends.summariesTrend)}% vs. semana passada`
                : "Sem variação"
          }
          subTone={trends.summariesTrend >= 0 ? "positive" : "negative"}
          href="/resumos"
        />

        <KPICard
          Icon={Star}
          label="Progresso geral"
          value={<CountUp value={stats.progressPct} suffix="%" />}
          sub={
            stats.progressPct >= 70
              ? "Continue assim!"
              : stats.progressPct >= 40
                ? "Tá no caminho."
                : "Bora acelerar."
          }
          subTone="positive"
          progress={stats.progressPct}
        />
      </div>

      {/* Main + aside */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          {/* Continuar aula */}
          {continueLecture ? (
            <ContinueLectureCard
              lecture={continueLecture}
              subject={subjects.find((s) => s.id === continueLecture.subjectId)}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-6 flex flex-col sm:flex-row items-center gap-5">
              <div className="flex justify-center sm:block">
                <LumiCharacter mood="waving" size="md" float />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <h3 className="text-base font-semibold">
                  Tudo em dia por aqui.
                </h3>
                <p className="mt-1 text-sm text-muted-foreground max-w-md">
                  Nenhuma aula em andamento. Bora gravar a próxima ou subir um
                  PDF pra gerar resumo.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="gradient"
                  onClick={() => startNewLecture()}
                  size="sm"
                >
                  <Mic className="h-4 w-4" /> Gravar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setWizardOpen(true)}
                  size="sm"
                >
                  <Upload className="h-4 w-4" /> Upload
                </Button>
              </div>
            </div>
          )}

          {/* Matérias */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Minhas matérias
              </h2>
              <div className="flex items-center gap-2">
                {subjects.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewOpen(true)}
                    className="text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" /> Nova
                  </Button>
                )}
                {subjects.length > 0 && (
                  <Link
                    href="/documentos"
                    className="text-xs text-primary font-medium inline-flex items-center gap-1 hover:gap-1.5 transition-all"
                  >
                    Ver todas <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>
            {subjects.length === 0 ? (
              <SubjectsEmpty onCreate={() => setNewOpen(true)} />
            ) : (
              <div className="stagger-in grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 auto-rows-fr">
                {subjects.slice(0, 10).map((s) => {
                  const subjectLectures = lecturesBySubject[s.id] ?? [];
                  const subjectSummaries = summaries.filter(
                    (sm) => sm.subjectId === s.id,
                  );
                  const fav = favorites.some(
                    (f) => f.kind === "subject" && f.id === s.id,
                  );
                  return (
                    <SubjectMiniCard
                      key={s.id}
                      subject={s}
                      lectures={subjectLectures}
                      summariesCount={subjectSummaries.length}
                      onDelete={() => handleDeleteSubject(s)}
                      onNewLecture={() => startNewLecture(s.id)}
                      favorited={fav}
                      onToggleFavorite={() =>
                        toggleFavorite(user.id, "subject", s.id)
                      }
                    />
                  );
                })}
              </div>
            )}
          </section>

          {/* Atividade recente */}
          {recentLectures.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Atividade recente
                </h2>
                {lectures.length > 6 && (
                  <Link
                    href="/gravacoes"
                    className="text-xs text-primary font-medium inline-flex items-center gap-1 hover:gap-1.5 transition-all"
                  >
                    Ver toda atividade <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
              <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/50">
                {recentLectures.map((l) => {
                  const subject = subjects.find((s) => s.id === l.subjectId);
                  const fav = favorites.some(
                    (f) => f.kind === "lecture" && f.id === l.id,
                  );
                  return (
                    <ActivityRow
                      key={l.id}
                      lecture={l}
                      subject={subject}
                      hasSummary={lectureIdsWithSummary.has(l.id)}
                      favorited={fav}
                      onToggleFavorite={() =>
                        toggleFavorite(user.id, "lecture", l.id)
                      }
                    />
                  );
                })}
              </div>
            </section>
          )}

          {recentLectures.length === 0 && subjects.length > 0 && (
            <EmptyLectures onNew={() => startNewLecture()} />
          )}
        </div>

        {/* Aside */}
        <aside className="space-y-4">
          <AgendaCard items={todayAgenda} />
          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Features mais usadas</h3>
              <PieChart className="h-4 w-4 text-muted-foreground" />
            </div>
            <FeatureDonut data={featureUsage} />
          </section>
          <LumiSuggestionsCard
            continueLecture={continueLecture}
            hasLectures={lectures.length > 0}
          />
          <LearningInsightsCard
            progressPct={stats.progressPct}
            summariesTrend={trends.summariesTrend}
          />
        </aside>
      </div>

      {/* Dialog Nova matéria */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogTrigger asChild>
          <span className="hidden" />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova matéria</DialogTitle>
            <DialogDescription>
              Cria uma pasta pra organizar aulas, slides e resumos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-subject-name" className="mb-1.5 block">
                Nome da matéria
              </Label>
              <Input
                id="new-subject-name"
                autoFocus
                placeholder="Ex: Cálculo, Anatomia, Direito Civil…"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setIconName(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleCreateSubject()}
              />
            </div>
            <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-secondary/30 p-3">
              <SubjectIconPicker
                value={iconName}
                subjectName={newName}
                onChange={setIconName}
                palette={{
                  bg: getSubjectPalette(newName).soft,
                  text: getSubjectPalette(newName).text,
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {iconName ? "Ícone escolhido" : "Ícone sugerido"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Clique no quadrado pra trocar.
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              Cancelar
            </Button>
            <Button variant="gradient" onClick={handleCreateSubject}>
              Criar matéria
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Nova aula */}
      <Dialog open={lectureOpen} onOpenChange={setLectureOpen}>
        <DialogContent className="max-w-lg overflow-hidden [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>Nova aula</DialogTitle>
            <DialogDescription>
              {lectureMode === "live"
                ? "Em segundos a transcrição começa."
                : "Suba um áudio que você já gravou — até ~3h."}
            </DialogDescription>
          </DialogHeader>

          {/* Tabs Gravar / Subir */}
          <div className="flex gap-1 rounded-lg bg-secondary/60 p-1">
            <button
              type="button"
              onClick={() => setLectureMode("live")}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                lectureMode === "live"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Mic className="h-3.5 w-3.5" />
              Gravar ao vivo
            </button>
            <button
              type="button"
              onClick={() => setLectureMode("upload")}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                lectureMode === "upload"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Upload className="h-3.5 w-3.5" />
              Subir áudio
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                autoFocus
                value={lectureTitle}
                onChange={(e) => setLectureTitle(e.target.value)}
                placeholder={`Aula ${new Date().toLocaleDateString("pt-BR")}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Matéria</Label>
              <div className="flex flex-wrap gap-2">
                {subjects.map((s) => {
                  const sel = s.id === lectureSubject;
                  const Icon = getSubjectIcon(s.name);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setLectureSubject(s.id)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-sm transition-all",
                        sel
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border/60 bg-background hover:bg-secondary/40",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br shadow-sm",
                          s.color,
                        )}
                      >
                        {createElement(Icon, {
                          className: "h-3.5 w-3.5 text-white",
                          strokeWidth: 2.4,
                        })}
                      </span>
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {lectureMode === "upload" && (
              <UploadAudioCard
                userId={user.id}
                subjectId={lectureSubject || null}
                fallbackTitle={lectureTitle}
                onSuccess={() => setLectureOpen(false)}
              />
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setLectureOpen(false)}>
              Cancelar
            </Button>
            {lectureMode === "live" && (
              <Button variant="gradient" onClick={handleCreateLecture}>
                <Mic className="h-4 w-4" /> Começar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContentWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        mode="summary"
        userId={user.id}
        onCreated={({ lectureId }) => {
          router.push(`/lecture/${lectureId}`);
        }}
      />
    </div>
  );
}

/* ---------- Sub-componentes ---------- */

function KPICard({
  Icon,
  label,
  value,
  sub,
  subTone,
  href,
  chart,
  chartHero,
  progress,
}: {
  Icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: string;
  subTone?: "positive" | "negative" | "neutral";
  href?: string;
  chart?: React.ReactNode;
  chartHero?: boolean;
  progress?: number;
}) {
  const subColor =
    subTone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : subTone === "negative"
        ? "text-rose-600 dark:text-rose-400"
        : "text-muted-foreground";

  const content = (
    <div className="lift-card relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4 hover:border-primary/40 h-full">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground line-clamp-1">
          {label}
        </div>
        <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" strokeWidth={2.2} />
        </div>
      </div>
      {chartHero && chart ? (
        <div className="mt-1 w-full">{chart}</div>
      ) : (
        <div className="display-num text-xl sm:text-2xl font-semibold leading-tight line-clamp-2 break-words">
          {value}
        </div>
      )}
      {sub && (
        <div className={cn("mt-1.5 text-[11px] line-clamp-2 break-words", subColor)}>
          {chartHero && (
            <span className="font-semibold text-foreground">{value} · </span>
          )}
          {sub}
        </div>
      )}
      {!chartHero && chart && <div className="mt-3 h-10 w-full">{chart}</div>}
      {typeof progress === "number" && (
        <div className="mt-3 h-1.5 bg-secondary/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

function ContinueLectureCard({
  lecture,
  subject,
}: {
  lecture: Lecture;
  subject?: Subject;
}) {
  const subjectName = subject?.name ?? "Aula sem matéria";
  const Icon = subject ? getSubjectIcon(subject.name) : Play;
  const tone = subject ? getSubjectTone(subject.name) : { bg: "", text: "" };
  const durationMin = Math.round(lecture.durationSec / 60);
  const hasTranscript = !!lecture.transcript;
  const progress = hasTranscript ? 58 : 12; // placeholder visual

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="flex flex-col sm:flex-row">
        {/* Slot visual (sem imagem feia) — gradient + icon */}
        <div
          className="relative h-32 sm:h-auto sm:w-48 shrink-0 flex items-center justify-center bg-gradient-to-br from-primary/20 via-primary/10 to-fuchsia-500/10"
          style={{
            backgroundColor: tone.bg || undefined,
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.4),transparent_60%)] dark:bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.08),transparent_60%)]" />
          <div className="relative h-16 w-16 rounded-2xl bg-background/80 backdrop-blur flex items-center justify-center shadow-sm">
            {createElement(Icon, {
              className: "h-8 w-8 text-primary",
              strokeWidth: 2,
            })}
          </div>
        </div>

        <div className="flex-1 min-w-0 p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            {subject && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                {subjectName}
              </Badge>
            )}
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {durationMin > 0
                ? `${durationMin} min gravados`
                : formatRelativeTime(lecture.updatedAt)}
            </div>
          </div>

          <h3 className="text-lg sm:text-xl font-semibold leading-tight line-clamp-2 break-words">
            {lecture.title}
          </h3>

          {hasTranscript && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
              Última atividade: {formatRelativeTime(lecture.updatedAt)}
            </p>
          )}

          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-secondary/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">
              {progress}% concluído
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {hasTranscript
                ? "Sem resumo ainda — bora gerar"
                : "Bora retomar a transcrição"}
            </div>
            <Button asChild variant="gradient" size="sm">
              <Link href={`/lecture/${lecture.id}`}>
                <Play className="h-4 w-4" /> Continuar aula
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SubjectMiniCard({
  subject,
  lectures,
  summariesCount,
  onDelete,
  onNewLecture,
  favorited,
  onToggleFavorite,
}: {
  subject: Subject;
  lectures: Lecture[];
  summariesCount: number;
  onDelete: () => void;
  onNewLecture: () => void;
  favorited: boolean;
  onToggleFavorite: () => void;
}) {
  const lectureCount = lectures.length;
  const withSummary = summariesCount;
  const progress =
    lectureCount > 0 ? Math.round((withSummary / lectureCount) * 100) : 0;
  const subjectIcon = getSubjectIcon(subject.name);
  const tone = getSubjectTone(subject.name);

  return (
    <div className="group lift-card relative rounded-xl border border-border/60 bg-card hover:border-primary/40 h-full flex flex-col">
      <Link href={`/subject/${subject.id}`} className="block p-3 flex-1 flex flex-col">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div
            className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: tone.bg, color: tone.text }}
          >
            {createElement(subjectIcon, {
              className: "icon-pop h-4 w-4",
              strokeWidth: 2.2,
            })}
          </div>
          <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
            {progress}%
          </span>
        </div>
        <div className="text-sm font-semibold leading-tight line-clamp-2 group-hover:text-primary transition-colors break-words min-h-[2.5em]">
          {subject.name}
        </div>
        <div className="mt-auto pt-2 h-1.5 bg-secondary/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {lectureCount} {lectureCount === 1 ? "aula" : "aulas"}
          </span>
          <span>
            {withSummary} {withSummary === 1 ? "resumo" : "resumos"}
          </span>
        </div>
      </Link>

      <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite();
          }}
          title={favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          aria-label={
            favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"
          }
          className={cn(
            "h-6 w-6 inline-flex items-center justify-center rounded-md transition-all",
            favorited
              ? "text-amber-500 hover:bg-amber-500/10"
              : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-secondary hover:text-foreground",
          )}
        >
          <Star className={cn("h-3 w-3", favorited && "fill-current")} />
        </button>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.preventDefault()}
                className="h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-secondary"
              >
                <MoreVertical className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onNewLecture}>
                <Mic className="h-4 w-4" /> Nova aula aqui
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleFavorite}>
                <Star className="h-4 w-4" />
                {favorited ? "Remover dos favoritos" : "Favoritar matéria"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" /> Excluir matéria
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function ActivityRow({
  lecture,
  subject,
  hasSummary,
  favorited,
  onToggleFavorite,
}: {
  lecture: Lecture;
  subject: Subject | undefined;
  hasSummary: boolean;
  favorited: boolean;
  onToggleFavorite: () => void;
}) {
  const isLive = lecture.status === "live";

  const { label, Icon, iconBg, iconColor } = hasSummary
    ? {
        label: "Resumo gerado",
        Icon: FileText,
        iconBg: "bg-violet-500/15",
        iconColor: "text-violet-600 dark:text-violet-400",
      }
    : isLive
      ? {
          label: "Ao vivo",
          Icon: Mic,
          iconBg: "bg-rose-500/15",
          iconColor: "text-rose-500",
        }
      : lecture.transcript
        ? {
            label: "Gravação enviada",
            Icon: Mic,
            iconBg: "bg-emerald-500/15",
            iconColor: "text-emerald-600 dark:text-emerald-400",
          }
        : {
            label: "Em andamento",
            Icon: Play,
            iconBg: "bg-primary/10",
            iconColor: "text-primary",
          };

  return (
    <div className="group relative">
      <Link
        href={`/lecture/${lecture.id}`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors"
      >
        <div
          className={cn(
            "h-8 w-8 shrink-0 rounded-lg flex items-center justify-center",
            iconBg,
          )}
        >
          <Icon className={cn("h-4 w-4", iconColor)} strokeWidth={2.2} />
        </div>

        <div className="hidden sm:block w-32 shrink-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">
            {lecture.title}
          </div>
        </div>

        {subject && (
          <Badge variant="outline" className="hidden md:inline-flex shrink-0 text-[10px]">
            {subject.name}
          </Badge>
        )}

        <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground shrink-0 min-w-[100px] justify-end">
          {formatRelativeTime(lecture.createdAt)}
        </div>

        <div className="hidden md:flex text-xs text-muted-foreground font-mono shrink-0 min-w-[50px] justify-end">
          {lecture.durationSec > 0 ? formatDuration(lecture.durationSec) : "—"}
        </div>

        <div className="shrink-0 pr-8">
          {isLive ? (
            <Badge variant="live" className="gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 pulse-dot" />
              AO VIVO
            </Badge>
          ) : hasSummary ? (
            <Badge
              variant="secondary"
              className="gap-1 text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/15"
            >
              <Sparkles className="h-2.5 w-2.5" /> Assistida
            </Badge>
          ) : null}
        </div>
      </Link>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite();
        }}
        title={favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        aria-label={favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        className={cn(
          "absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-md transition-all",
          favorited
            ? "text-amber-500 hover:bg-amber-500/10"
            : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-secondary hover:text-foreground",
        )}
      >
        <Star className={cn("h-4 w-4", favorited && "fill-current")} />
      </button>
    </div>
  );
}

function AgendaCard({
  items,
}: {
  items: { subject: Subject; slot: ScheduleSlot }[];
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Agenda de hoje</h3>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">
          {items.length} {items.length === 1 ? "item" : "itens"}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl bg-secondary/30 px-3 py-6 text-center">
          <p className="text-xs text-muted-foreground">
            Nenhuma aula agendada pra hoje.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.slice(0, 4).map(({ subject, slot }, i) => {
            const tone = getSubjectTone(subject.name);
            return (
              <Link
                key={`${subject.id}-${i}`}
                href={`/subject/${subject.id}`}
                className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-secondary/40 transition-colors"
              >
                <div className="text-xs font-mono tabular-nums text-muted-foreground w-10 shrink-0">
                  {slot.startTime}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {subject.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {slot.room ? `${slot.room} · ` : ""}até {slot.endTime}
                  </div>
                </div>
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: tone.text }}
                />
              </Link>
            );
          })}
        </div>
      )}
      <Link
        href="/schedule"
        className="mt-3 inline-flex items-center gap-1 text-xs text-primary font-medium hover:gap-1.5 transition-all"
      >
        Ver calendário completo <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function LumiSuggestionsCard({
  continueLecture,
  hasLectures,
}: {
  continueLecture: Lecture | undefined;
  hasLectures: boolean;
}) {
  type Suggestion = {
    href: string;
    title: string;
    sub: string;
    Icon: LucideIcon;
    tone: string;
  };

  const suggestions: Suggestion[] = [];

  if (continueLecture) {
    suggestions.push({
      href: `/lecture/${continueLecture.id}`,
      title: "Gerar resumo",
      sub: `Resuma '${continueLecture.title.slice(0, 28)}${continueLecture.title.length > 28 ? "…" : ""}'`,
      Icon: FileText,
      tone: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    });
  }

  if (hasLectures) {
    suggestions.push({
      href: "/flashcards",
      title: "Revisar flashcards",
      sub: "Cards aguardando revisão",
      Icon: Layers,
      tone: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    });
  }

  suggestions.push({
    href: "/lumi",
    title: "Continuar chat",
    sub: "Tire dúvidas com o Lumi",
    Icon: MessageSquare,
    tone: "bg-primary/15 text-primary",
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Sugestões do Lumi</h3>
      </div>
      <div className="space-y-1.5">
        {suggestions.map((s) => (
          <Link
            key={s.href + s.title}
            href={s.href}
            className="group flex items-center gap-3 rounded-lg p-2 hover:bg-secondary/40 transition-colors"
          >
            <div
              className={cn(
                "h-9 w-9 shrink-0 rounded-lg flex items-center justify-center",
                s.tone,
              )}
            >
              <s.Icon className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{s.title}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {s.sub}
              </div>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
          </Link>
        ))}
      </div>
      <Link
        href="/lumi"
        className="mt-3 inline-flex items-center gap-1 text-xs text-primary font-medium hover:gap-1.5 transition-all"
      >
        Ver todas as sugestões <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function LearningInsightsCard({
  progressPct,
  summariesTrend,
}: {
  progressPct: number;
  summariesTrend: number;
}) {
  const trendLabel =
    summariesTrend > 0
      ? `↑ ${summariesTrend}% vs. mês passado`
      : summariesTrend < 0
        ? `↓ ${Math.abs(summariesTrend)}% vs. mês passado`
        : "Sem variação";

  const insight =
    progressPct >= 70
      ? "Você tem alta taxa de resumos finalizados. Continue assim!"
      : progressPct >= 40
        ? "Você tá no caminho — bora fechar os resumos pendentes."
        : "Gere mais resumos pra fortalecer a retenção.";

  // Dial circular SVG
  const size = 64;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (progressPct / 100) * circ;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Insights de aprendizado</h3>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="oklch(0.92 0.01 280)"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="oklch(0.52 0.22 280)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              className="transition-all"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums">
            {progressPct}%
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">Taxa de resumos</div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
            {trendLabel}
          </div>
        </div>
      </div>
      <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-2.5 flex items-start gap-2">
        <Lightbulb className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-[11px] text-foreground/80 leading-snug">{insight}</p>
      </div>
    </div>
  );
}

function SubjectsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 px-8 py-12 text-center">
      <div className="flex justify-center mb-2">
        <LumiCharacter mood="waving" size="lg" float />
      </div>
      <h3 className="text-lg font-semibold">Comece criando uma matéria</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        Cada matéria vira uma pasta. Aulas, slides, resumos e dúvidas ficam
        organizados dentro dela.
      </p>
      <Button onClick={onCreate} variant="gradient" size="lg" className="mt-6">
        <Plus className="h-4 w-4" /> Nova matéria
      </Button>
    </div>
  );
}

function EmptyLectures({ onNew }: { onNew: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 px-8 py-10 text-center">
      <div className="flex justify-center mb-2">
        <LumiCharacter mood="default" size="md" float />
      </div>
      <h3 className="text-base font-semibold">Nenhuma aula gravada ainda</h3>
      <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto">
        Grave sua primeira aula — o Lumi transcreve, anota dúvidas e gera resumo
        no fim.
      </p>
      <Button onClick={onNew} variant="gradient" className="mt-5">
        <Mic className="h-4 w-4" /> Iniciar primeira aula
      </Button>
    </div>
  );
}
