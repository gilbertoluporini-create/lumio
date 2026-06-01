"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  ChevronRight,
  FileUp,
  GraduationCap,
  Loader2,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LumioWordmark } from "@/components/brand/logo";
import { LumiCharacter } from "@/components/brand/lumi";
import { ThemeToggle } from "@/components/theme-toggle";
import { ColorPicker } from "@/components/app/emoji-color-picker";
import { getCurrentUserAsync, markOnboardedAsync } from "@/lib/auth";
import { bulkCreateSubjectsAsync } from "@/lib/db";
import { Analytics } from "@/lib/analytics";
import { SUBJECT_PALETTE, type ScheduleSlot } from "@/lib/types";
import { cn } from "@/lib/utils";

type DraftSubject = {
  name: string;
  emoji: string;
  color: string;
  schedule: ScheduleSlot[];
};

type Step =
  | "intro"
  | "course"
  | "goal"
  | "difficulties"
  | "style"
  | "routine"
  | "subjects"
  | "exams"
  | "done";

const STEP_ORDER: Step[] = [
  "intro",
  "course",
  "goal",
  "difficulties",
  "style",
  "routine",
  "subjects",
  "exams",
  "done",
];

function defaultColorForIndex(idx: number): string {
  return SUBJECT_PALETTE[idx % SUBJECT_PALETTE.length].color;
}

type ProfileDraft = {
  course?: string;
  semester?: string;
  graduationYear?: number;
  goal?: "pass_year" | "residency" | "public_exam" | "learn";
  difficultySubjects: string[];
  studyStyle?: "visual" | "textual" | "practical" | "mixed";
  studyHoursPerDay?: number;
  bestStudyTime?:
    | "morning"
    | "afternoon"
    | "evening"
    | "late_night"
    | "flexible";
  examDates: { subject: string; date: string }[];
};

const GOAL_OPTIONS: {
  value: NonNullable<ProfileDraft["goal"]>;
  label: string;
  description: string;
}[] = [
  {
    value: "pass_year",
    label: "Passar de ano",
    description: "Foco em provas da faculdade/escola, semestre a semestre.",
  },
  {
    value: "residency",
    label: "Residência médica",
    description: "Prova de residência (R+1, USMLE, etc).",
  },
  {
    value: "public_exam",
    label: "Concurso público",
    description: "OAB, Polícia, Banco, Magistério, etc.",
  },
  {
    value: "learn",
    label: "Aprender sem prova",
    description: "Por curiosidade ou pra dominar um assunto.",
  },
];

const STYLE_OPTIONS: {
  value: NonNullable<ProfileDraft["studyStyle"]>;
  label: string;
  description: string;
}[] = [
  {
    value: "visual",
    label: "Visual",
    description: "Mapas mentais, infográficos, imagens.",
  },
  {
    value: "textual",
    label: "Textual",
    description: "Resumos escritos, anotações detalhadas.",
  },
  {
    value: "practical",
    label: "Prática",
    description: "Quiz, flashcards, exercícios.",
  },
  {
    value: "mixed",
    label: "Mista",
    description: "Misturar visual, texto e prática.",
  },
];

const TIME_OPTIONS: {
  value: NonNullable<ProfileDraft["bestStudyTime"]>;
  label: string;
}[] = [
  { value: "morning", label: "Manhã" },
  { value: "afternoon", label: "Tarde" },
  { value: "evening", label: "Noite" },
  { value: "late_night", label: "Madrugada" },
  { value: "flexible", label: "Flexível" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const examFileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("intro");
  const [userName, setUserName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Perfil sendo construído
  const [profile, setProfile] = useState<ProfileDraft>({
    difficultySubjects: [],
    examDates: [],
  });

  // Matérias
  const [subjects, setSubjects] = useState<DraftSubject[]>([]);
  const [newName, setNewName] = useState("");
  const [colorOverride, setColorOverride] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  // Inputs auxiliares
  const [difficultyInput, setDifficultyInput] = useState("");
  const [examSubject, setExamSubject] = useState("");
  const [examDate, setExamDate] = useState("");

  useEffect(() => {
    getCurrentUserAsync().then((user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      setUserName(user.name.split(" ")[0]);
      Analytics.onboardingStarted();
    });
  }, [router]);

  function goNext() {
    const idx = STEP_ORDER.indexOf(step);
    const next = STEP_ORDER[Math.min(idx + 1, STEP_ORDER.length - 1)];
    setStep(next);
  }

  function goBack() {
    const idx = STEP_ORDER.indexOf(step);
    const prev = STEP_ORDER[Math.max(idx - 1, 0)];
    setStep(prev);
  }

  function addSubject(
    name: string,
    opts?: { color?: string; schedule?: ScheduleSlot[] },
  ) {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (subjects.find((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      return false;
    }
    setSubjects((prev) => [
      ...prev,
      {
        name: trimmed,
        emoji: "",
        color: opts?.color || defaultColorForIndex(prev.length),
        schedule: opts?.schedule ?? [],
      },
    ]);
    return true;
  }

  function handleAddManual() {
    const ok = addSubject(newName, { color: colorOverride ?? undefined });
    if (!ok && newName.trim()) {
      toast.error("Já adicionou essa matéria.");
      return;
    }
    setNewName("");
    setColorOverride(null);
  }

  function removeSubject(name: string) {
    setSubjects((prev) => prev.filter((s) => s.name !== name));
  }

  async function handleFile(file: File) {
    if (extracting) return;
    const allowed = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
    ];
    if (!allowed.includes(file.type) && !file.type.startsWith("image/")) {
      toast.error("Envie um PDF ou imagem.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo grande demais (máx 10MB).");
      return;
    }
    setExtracting(true);
    const t = toast.loading("Lendo sua grade…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract-schedule", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Erro ao processar.", { id: t });
        return;
      }
      const extracted: Array<{ name: string; schedule?: ScheduleSlot[] }> =
        data.subjects ?? [];
      let added = 0;
      for (const s of extracted) {
        if (addSubject(s.name, { schedule: s.schedule ?? [] })) added++;
      }
      toast.success(`${added} matéria${added === 1 ? "" : "s"} adicionada${added === 1 ? "" : "s"}.`, { id: t });
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`, { id: t });
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleExamFile(file: File) {
    // Reusa extract-schedule, mas extraindo só matéria + data se possível.
    // Pra MVP: chama mesma API e o user revê as datas no UI.
    if (extracting) return;
    setExtracting(true);
    const t = toast.loading("Lendo calendário de provas…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract-schedule", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Erro ao processar.", { id: t });
        return;
      }
      // O extract-schedule devolve subjects + schedule (slots semanais), não
      // datas absolutas — pra calendário de provas a IA dedicada seria outro
      // endpoint. Por enquanto, sugerimos ao user adicionar manual ou avisa.
      toast.info(
        "Lumi leu o arquivo. Por enquanto, adiciona as datas manualmente abaixo — em breve a extração automática de calendário fica pronta.",
        { id: t, duration: 6000 },
      );
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`, { id: t });
    } finally {
      setExtracting(false);
      if (examFileRef.current) examFileRef.current.value = "";
    }
  }

  function addDifficulty() {
    const t = difficultyInput.trim();
    if (!t) return;
    if (profile.difficultySubjects.includes(t)) {
      setDifficultyInput("");
      return;
    }
    setProfile((p) => ({
      ...p,
      difficultySubjects: [...p.difficultySubjects, t],
    }));
    setDifficultyInput("");
  }

  function removeDifficulty(name: string) {
    setProfile((p) => ({
      ...p,
      difficultySubjects: p.difficultySubjects.filter((d) => d !== name),
    }));
  }

  function addExam() {
    const s = examSubject.trim();
    const d = examDate.trim();
    if (!s || !d) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      toast.error("Data inválida — use o seletor.");
      return;
    }
    setProfile((p) => ({
      ...p,
      examDates: [...p.examDates, { subject: s, date: d }],
    }));
    setExamSubject("");
    setExamDate("");
  }

  function removeExam(idx: number) {
    setProfile((p) => ({
      ...p,
      examDates: p.examDates.filter((_, i) => i !== idx),
    }));
  }

  async function persistProfile() {
    // Salva só o que foi preenchido. Campos vazios viram null.
    const patch: Record<string, unknown> = {};
    if (profile.course) patch.course = profile.course;
    if (profile.semester) patch.semester = profile.semester;
    if (profile.graduationYear) patch.graduationYear = profile.graduationYear;
    if (profile.goal) patch.goal = profile.goal;
    if (profile.difficultySubjects.length > 0)
      patch.difficultySubjects = profile.difficultySubjects;
    if (profile.studyStyle) patch.studyStyle = profile.studyStyle;
    if (typeof profile.studyHoursPerDay === "number")
      patch.studyHoursPerDay = profile.studyHoursPerDay;
    if (profile.bestStudyTime) patch.bestStudyTime = profile.bestStudyTime;
    if (profile.examDates.length > 0) patch.examDates = profile.examDates;
    if (Object.keys(patch).length === 0) return;
    try {
      await fetch("/api/user-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch (err) {
      console.warn("[onboarding] profile save failed", err);
    }
  }

  async function finishOnboarding() {
    if (saving) return;
    setSaving(true);
    try {
      const user = await getCurrentUserAsync();
      if (!user) {
        router.replace("/login");
        return;
      }
      const subjectsToCreate =
        subjects.length > 0
          ? subjects
          : [
              {
                name: "Geral",
                emoji: "",
                color: defaultColorForIndex(0),
                schedule: [],
              },
            ];
      await bulkCreateSubjectsAsync(user.id, subjectsToCreate);
      await persistProfile();
      await markOnboardedAsync();
      Analytics.onboardingCompleted(subjects.length, subjects.length === 0);
      toast.success("Pronto! Bem-vindo ao Lumio.");
      setTimeout(() => router.push("/dashboard"), 400);
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
      setSaving(false);
    }
  }

  const currentColor =
    colorOverride ?? defaultColorForIndex(subjects.length);

  const progress = useMemo(() => {
    const idx = STEP_ORDER.indexOf(step);
    return Math.round((idx / (STEP_ORDER.length - 1)) * 100);
  }, [step]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg" />
      <div
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-[500px] w-[900px] opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, oklch(0.6 0.25 290 / 0.45), transparent 70%)",
        }}
      />

      <header className="relative z-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <LumioWordmark />
          <ThemeToggle />
        </div>
        {/* Progress bar */}
        <div className="mx-auto max-w-3xl px-6">
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted/50">
            <div
              className="h-full bg-gradient-to-r from-primary to-fuchsia-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-2xl px-6 pb-16 pt-8">
        {/* Lumi falando */}
        <LumiBubble>{renderLumiMessage(step, userName)}</LumiBubble>

        {/* Conteúdo do step */}
        <div className="mt-6">
          {step === "intro" && (
            <div className="flex flex-col items-center gap-4">
              <Button
                size="lg"
                variant="gradient"
                onClick={goNext}
                className="min-w-[200px]"
              >
                Bora começar <ArrowRight className="h-4 w-4" />
              </Button>
              <button
                onClick={() => finishOnboarding()}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Pular tudo e ir direto pro app
              </button>
            </div>
          )}

          {step === "course" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Curso
                </label>
                <Input
                  placeholder="Ex: Medicina, Direito, Engenharia…"
                  value={profile.course ?? ""}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, course: e.target.value }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Período/semestre
                  </label>
                  <Input
                    placeholder="Ex: 4º semestre"
                    value={profile.semester ?? ""}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, semester: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Ano de formatura
                  </label>
                  <Input
                    type="number"
                    placeholder="Ex: 2028"
                    value={profile.graduationYear ?? ""}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      setProfile((p) => ({
                        ...p,
                        graduationYear: Number.isFinite(n) ? n : undefined,
                      }));
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {step === "goal" && (
            <div className="grid grid-cols-1 gap-3">
              {GOAL_OPTIONS.map((opt) => (
                <SelectCard
                  key={opt.value}
                  selected={profile.goal === opt.value}
                  label={opt.label}
                  description={opt.description}
                  onClick={() => setProfile((p) => ({ ...p, goal: opt.value }))}
                />
              ))}
            </div>
          )}

          {step === "difficulties" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Ex: Endócrino, Cálculo II, Penal…"
                  value={difficultyInput}
                  onChange={(e) => setDifficultyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addDifficulty();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addDifficulty}
                  disabled={!difficultyInput.trim()}
                >
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </div>
              {profile.difficultySubjects.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {profile.difficultySubjects.map((d) => (
                    <Chip key={d} onRemove={() => removeDifficulty(d)}>
                      {d}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === "style" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {STYLE_OPTIONS.map((opt) => (
                <SelectCard
                  key={opt.value}
                  selected={profile.studyStyle === opt.value}
                  label={opt.label}
                  description={opt.description}
                  onClick={() =>
                    setProfile((p) => ({ ...p, studyStyle: opt.value }))
                  }
                />
              ))}
            </div>
          )}

          {step === "routine" && (
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span>Horas por dia</span>
                  <span className="font-mono text-foreground">
                    {profile.studyHoursPerDay ?? 0}h
                  </span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="12"
                  step="0.5"
                  value={profile.studyHoursPerDay ?? 0}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      studyHoursPerDay: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full accent-primary"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                  Melhor horário pra estudar
                </label>
                <div className="flex flex-wrap gap-2">
                  {TIME_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setProfile((p) => ({ ...p, bestStudyTime: opt.value }))
                      }
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                        profile.bestStudyTime === opt.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/60 bg-background hover:border-primary/40",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === "subjects" && (
            <div className="space-y-5">
              {/* Upload grade */}
              <div className="rounded-2xl border-2 border-dashed border-border/70 bg-card/60 backdrop-blur-xl p-5 hover:border-primary/40 transition-colors">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 text-white shadow-md">
                    {extracting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <FileUp className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <h3 className="text-sm font-semibold flex items-center justify-center sm:justify-start gap-2">
                      Subir grade horária
                      <span className="text-[10px] uppercase tracking-wider font-medium bg-primary/10 text-primary rounded-full px-1.5 py-0.5 ring-1 ring-primary/20">
                        IA
                      </span>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      PDF ou foto. A IA extrai as matérias.
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp,image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={extracting}
                  >
                    <Upload className="h-4 w-4" /> Escolher
                  </Button>
                </div>
              </div>

              {/* Manual */}
              <div className="rounded-2xl border border-border/80 bg-card/80 backdrop-blur-xl p-5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                  Ou adicione manualmente
                </p>
                <div className="flex gap-2">
                  <ColorPicker
                    value={currentColor}
                    onChange={(c) => setColorOverride(c)}
                  />
                  <Input
                    placeholder="Ex: Anatomia, Direito Constitucional…"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddManual();
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddManual}
                    disabled={!newName.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {subjects.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {subjects.map((s) => (
                      <div
                        key={s.name}
                        className="group flex items-center gap-2 rounded-full border border-border/70 bg-background pl-2 pr-1 py-1"
                      >
                        <span
                          className={cn(
                            "h-3 w-3 rounded-full bg-gradient-to-br shrink-0",
                            s.color,
                          )}
                        />
                        <span className="text-sm pr-1 max-w-[200px] truncate">
                          {s.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeSubject(s.name)}
                          className="ml-1 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          aria-label={`Remover ${s.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === "exams" && (
            <div className="space-y-4">
              <div className="rounded-2xl border-2 border-dashed border-border/70 bg-card/60 p-5 flex flex-col sm:flex-row items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md shrink-0">
                  {extracting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Calendar className="h-5 w-5" />
                  )}
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <h3 className="text-sm font-semibold">
                    Calendário de provas (opcional)
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sobe um PDF/imagem com as datas, ou adiciona manual abaixo.
                  </p>
                </div>
                <input
                  ref={examFileRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp,image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleExamFile(f);
                  }}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => examFileRef.current?.click()}
                  disabled={extracting}
                >
                  <Upload className="h-4 w-4" /> Subir
                </Button>
              </div>

              <div className="rounded-2xl border border-border/80 bg-card/80 p-5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                  Adicionar manualmente
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    placeholder="Matéria (ex: Endócrino)"
                    value={examSubject}
                    onChange={(e) => setExamSubject(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="date"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    className="sm:w-48"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addExam}
                    disabled={!examSubject.trim() || !examDate.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {profile.examDates.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {profile.examDates.map((e, i) => (
                      <div
                        key={`${e.subject}-${e.date}-${i}`}
                        className="flex items-center justify-between rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                      >
                        <span>
                          <strong>{e.subject}</strong>{" "}
                          <span className="text-muted-foreground">
                            · {e.date}
                          </span>
                        </span>
                        <button
                          onClick={() => removeExam(i)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Remover"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 w-full text-sm">
                <p className="font-semibold mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Resumo do que vou usar
                </p>
                <ProfileSummary profile={profile} subjects={subjects} />
              </div>
              <Button
                size="lg"
                variant="gradient"
                onClick={finishOnboarding}
                disabled={saving}
                className="min-w-[220px]"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Bora estudar <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Navegação inferior */}
        {step !== "intro" && step !== "done" && (
          <div className="mt-8 flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={goBack}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={goNext}
                className="text-muted-foreground"
              >
                Pular
              </Button>
              <Button
                variant="gradient"
                size="sm"
                onClick={goNext}
                className="min-w-[120px]"
              >
                Continuar <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function LumiBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0">
        <LumiCharacter className="h-12 w-12" />
      </div>
      <div className="flex-1 rounded-2xl rounded-tl-sm border border-border/60 bg-card/80 backdrop-blur-xl px-4 py-3 shadow-sm">
        <p className="text-sm leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

function SelectCard({
  selected,
  label,
  description,
  onClick,
}: {
  selected: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-full rounded-xl border bg-card/60 backdrop-blur-xl p-4 text-left transition-all",
        selected
          ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
          : "border-border/60 hover:border-primary/40 hover:bg-card/80",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        {selected && (
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-white">
            <Check className="h-3 w-3" />
          </div>
        )}
      </div>
    </button>
  );
}

function Chip({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border/70 bg-background pl-3 pr-1 py-1">
      <span className="text-sm">{children}</span>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function ProfileSummary({
  profile,
  subjects,
}: {
  profile: ProfileDraft;
  subjects: DraftSubject[];
}) {
  const items: string[] = [];
  if (profile.course) {
    const periodo = profile.semester ? ` (${profile.semester})` : "";
    items.push(`📚 Curso: ${profile.course}${periodo}`);
  }
  if (profile.goal) {
    const labels: Record<string, string> = {
      pass_year: "Passar de ano",
      residency: "Residência",
      public_exam: "Concurso",
      learn: "Aprender",
    };
    items.push(`🎯 Objetivo: ${labels[profile.goal]}`);
  }
  if (profile.difficultySubjects.length > 0) {
    items.push(`⚠️ Dificuldade em: ${profile.difficultySubjects.join(", ")}`);
  }
  if (profile.studyStyle) {
    const labels: Record<string, string> = {
      visual: "Visual",
      textual: "Textual",
      practical: "Prática",
      mixed: "Mista",
    };
    items.push(`🎨 Estilo: ${labels[profile.studyStyle]}`);
  }
  if (profile.studyHoursPerDay) {
    items.push(`⏱ ${profile.studyHoursPerDay}h/dia`);
  }
  if (subjects.length > 0) {
    items.push(
      `📁 ${subjects.length} matéria${subjects.length === 1 ? "" : "s"}`,
    );
  }
  if (profile.examDates.length > 0) {
    items.push(`📅 ${profile.examDates.length} prova(s) agendada(s)`);
  }
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        Você pulou as perguntas — sem stress. Vou aprender sobre você no chat.
      </p>
    );
  }
  return (
    <ul className="space-y-1 text-xs">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}

function renderLumiMessage(step: Step, name: string | null): string {
  const greet = name ? `, ${name}` : "";
  switch (step) {
    case "intro":
      return `Oi${greet}! 👋 Eu sou a Lumi, sua tutora pessoal aqui no Lumio. Vou te fazer umas perguntas rápidas pra te conhecer e te ajudar melhor. Tudo é opcional — pode pular o que não quiser responder.`;
    case "course":
      return "Tá fazendo qual curso? Em que período ou semestre você tá?";
    case "goal":
      return "Qual seu objetivo principal agora? Isso me ajuda a focar nas coisas certas.";
    case "difficulties":
      return "Tem alguma matéria que tá te dando mais trabalho? Vou priorizar essas nas sugestões.";
    case "style":
      return "Como você gosta de estudar? Vou sugerir os recursos certos pra você.";
    case "routine":
      return "Quantas horas por dia você costuma estudar, e qual seu melhor horário?";
    case "subjects":
      return "Bora cadastrar suas matérias? Sobe a grade horária ou adiciona manualmente.";
    case "exams":
      return "Tem alguma prova marcada? Posso lembrar você dos prazos.";
    case "done":
      return "Pronto! Tô com tudo que preciso. Bora começar?";
  }
}
