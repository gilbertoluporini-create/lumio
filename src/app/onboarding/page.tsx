"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  FileUp,
  GraduationCap,
  Loader2,
  Mic,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LumioWordmark } from "@/components/brand/logo";
import { LumiCharacter, LumiScene } from "@/components/brand/lumi";
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

function defaultColorForIndex(idx: number): string {
  return SUBJECT_PALETTE[idx % SUBJECT_PALETTE.length].color;
}

export default function OnboardingPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subjects, setSubjects] = useState<DraftSubject[]>([]);
  const [newName, setNewName] = useState("");
  const [colorOverride, setColorOverride] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

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

  function addSubject(
    name: string,
    opts?: { color?: string; schedule?: ScheduleSlot[] },
  ) {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (subjects.find((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      return false;
    }
    const subject: DraftSubject = {
      name: trimmed,
      emoji: "",
      color: opts?.color || defaultColorForIndex(subjects.length),
      schedule: opts?.schedule ?? [],
    };
    setSubjects((prev) => [...prev, subject]);
    return true;
  }

  function handleAddManual() {
    const success = addSubject(newName, {
      color: colorOverride ?? undefined,
    });
    if (!success) {
      if (newName.trim() && subjects.some((s) => s.name.toLowerCase() === newName.trim().toLowerCase())) {
        toast.error("Você já adicionou essa matéria.");
      }
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
    if (!file) return;
    const allowed = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowed.includes(file.type) && !file.type.startsWith("image/")) {
      toast.error("Envie um PDF ou imagem (PNG, JPG, WEBP).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx 10MB).");
      return;
    }

    setExtracting(true);
    const t = toast.loading("Lendo sua grade horária…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract-schedule", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Erro ao processar a grade.", { id: t });
        return;
      }
      const extracted: Array<{ name: string; schedule?: ScheduleSlot[] }> =
        data.subjects || [];
      if (extracted.length === 0) {
        toast.error(data?.error || "Não encontrei matérias na grade.", { id: t });
        return;
      }
      // Batch: monta as novas matérias com cores distintas (cíclico pela palette)
      // antes de chamar setSubjects, senão o subjects.length stale faz tudo ficar
      // com a mesma cor.
      const existing = subjects;
      const newOnes: DraftSubject[] = [];
      let withSchedule = 0;
      for (const s of extracted) {
        const trimmed = s.name.trim();
        if (!trimmed) continue;
        const dupExisting = existing.some(
          (x) => x.name.toLowerCase() === trimmed.toLowerCase(),
        );
        const dupInBatch = newOnes.some(
          (x) => x.name.toLowerCase() === trimmed.toLowerCase(),
        );
        if (dupExisting || dupInBatch) continue;
        const sched = Array.isArray(s.schedule) ? s.schedule : [];
        const colorIdx = existing.length + newOnes.length;
        newOnes.push({
          name: trimmed,
          emoji: "",
          color: defaultColorForIndex(colorIdx),
          schedule: sched,
        });
        if (sched.length > 0) withSchedule++;
      }
      const added = newOnes.length;
      if (added > 0) {
        setSubjects((prev) => [...prev, ...newOnes]);
      }
      const scheduleNote =
        withSchedule > 0 ? ` (${withSchedule} com horários)` : "";
      if (data.demo) {
        toast.warning(
          `Modo demo: adicionei ${added} matéria${added === 1 ? "" : "s"} de exemplo${scheduleNote}. Configure ANTHROPIC_API_KEY pra extração real.`,
          { id: t, duration: 6000 },
        );
      } else {
        toast.success(
          `${added} matéria${added === 1 ? "" : "s"} extraída${added === 1 ? "" : "s"}${scheduleNote}.`,
          { id: t },
        );
      }
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`, { id: t });
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function finish() {
    if (saving || skipping) return;
    if (subjects.length === 0) {
      toast.error("Adicione ao menos uma matéria.");
      return;
    }
    setSaving(true);
    try {
      const user = await getCurrentUserAsync();
      if (!user) {
        router.replace("/login");
        return;
      }
      await bulkCreateSubjectsAsync(user.id, subjects);
      await markOnboardedAsync();
      Analytics.onboardingCompleted(subjects.length);
      toast.success("Pronto! Bem-vindo ao Lumio.");
      setTimeout(() => router.push("/dashboard"), 400);
    } catch (err) {
      toast.error(`Erro ao salvar: ${(err as Error).message}`);
      setSaving(false);
    }
  }

  async function skip() {
    if (saving || skipping) return;
    setSkipping(true);
    try {
      const user = await getCurrentUserAsync();
      if (!user) {
        router.replace("/login");
        return;
      }
      // Matéria default pra dashboard ter onde ancorar a primeira aula.
      // User edita/renomeia depois.
      const defaultSubject: DraftSubject = {
        name: "Geral",
        emoji: "",
        color: defaultColorForIndex(0),
        schedule: [],
      };
      await bulkCreateSubjectsAsync(user.id, [defaultSubject]);
      await markOnboardedAsync();
      Analytics.onboardingCompleted(0, true);
      router.push("/dashboard");
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
      setSkipping(false);
    }
  }

  const currentColor =
    colorOverride ?? defaultColorForIndex(subjects.length);

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
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <LumioWordmark />
          <ThemeToggle />
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-6 pb-16">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-3">
            <LumiScene scene="writing-notes" className="w-[200px]" float />
          </div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-3 py-1 text-xs">
            <Sparkles className="h-3 w-3 text-primary" />
            <span>Setup rápido · leva ~30 segundos</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
            Oi{userName ? `, ${userName}` : ""}.{" "}
            <span className="gradient-text">Eu sou o Lumi</span>.
          </h1>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            Vou te ajudar a organizar suas matérias pra você gravar a primeira aula. Pode editar
            tudo depois no dashboard.
          </p>
        </div>

        {/* Como funciona — 3 passos */}
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              n: "1",
              label: "Adicione matérias",
              hint: "Manual ou via grade",
              icon: GraduationCap,
              active: true,
            },
            {
              n: "2",
              label: "Grave a aula",
              hint: "Chat IA enquanto rola",
              icon: Mic,
            },
            {
              n: "3",
              label: "Receba o resumo",
              hint: "Slides + Q&A juntos",
              icon: Sparkles,
            },
          ].map(({ n, label, hint, icon: Icon, active }) => (
            <div
              key={n}
              className={cn(
                "relative rounded-xl border bg-card/60 backdrop-blur-xl p-3.5 transition-all",
                active
                  ? "border-primary/60 shadow-lg shadow-primary/10"
                  : "border-border/60 opacity-70",
              )}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold",
                    active
                      ? "bg-gradient-to-br from-primary to-fuchsia-500 text-white shadow-md"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {n}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight truncate">{label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{hint}</p>
                </div>
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    active ? "text-primary" : "text-muted-foreground/60",
                  )}
                />
              </div>
            </div>
          ))}
        </div>

        {/* UPLOAD DA GRADE */}
        <Card
          className={cn(
            "border-2 border-dashed transition-all bg-card/60 backdrop-blur-xl mb-5",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border/70 hover:border-primary/40",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
        >
          <CardContent className="p-6 flex flex-col sm:flex-row items-center gap-5">
            <div
              className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-md text-white",
                "from-primary to-fuchsia-500",
              )}
            >
              {extracting ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <FileUp className="h-6 w-6" />
              )}
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h3 className="font-semibold flex items-center justify-center sm:justify-start gap-2">
                Subir grade horária
                <span className="text-[10px] uppercase tracking-wider font-medium bg-primary/10 text-primary rounded-full px-1.5 py-0.5 ring-1 ring-primary/20">
                  IA
                </span>
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                PDF ou foto da grade — a IA extrai todas as matérias automaticamente.
              </p>
            </div>
            <div>
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
                variant="gradient"
                onClick={() => fileInputRef.current?.click()}
                disabled={extracting}
              >
                {extracting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Lendo…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" /> Escolher arquivo
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* CRIAÇÃO MANUAL */}
        <Card className="border-border/80 bg-card/80 backdrop-blur-xl shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" /> Adicione suas matérias
            </CardTitle>
            <CardDescription>
              Digite o nome da matéria. A cor é escolhida automaticamente — clique no quadrado pra trocar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-2">
              <ColorPicker
                value={currentColor}
                onChange={(c) => setColorOverride(c)}
              />
              <Input
                autoFocus
                placeholder="Ex: Anatomia, Cálculo II, Direito Constitucional…"
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
                onClick={handleAddManual}
                variant="outline"
                disabled={!newName.trim()}
              >
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
            </div>

            <div className="mt-6 border-t border-border/60 pt-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Suas matérias ({subjects.length})
                </p>
                {subjects.length > 0 && (
                  <button
                    onClick={() => {
                      if (confirm("Limpar todas?")) setSubjects([]);
                    }}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Limpar tudo
                  </button>
                )}
              </div>
              {subjects.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
                  <p>Nenhuma matéria ainda.</p>
                  <p className="text-xs mt-1 opacity-70">
                    Digite o nome acima ou suba a grade horária.
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {subjects.map((s) => (
                    <div
                      key={s.name}
                      className="group flex items-center gap-2 rounded-full border border-border/70 bg-background pl-2 pr-1 py-1 hover:border-primary/40 transition-colors"
                      title={
                        s.schedule.length > 0
                          ? `${s.schedule.length} horário${s.schedule.length === 1 ? "" : "s"} extraído${s.schedule.length === 1 ? "" : "s"}`
                          : undefined
                      }
                    >
                      <span
                        className={cn(
                          "h-3 w-3 rounded-full bg-gradient-to-br shrink-0",
                          s.color,
                        )}
                      />
                      <span className="text-sm pr-1 max-w-[200px] truncate">{s.name}</span>
                      {s.schedule.length > 0 && (
                        <span className="text-[10px] text-primary bg-primary/10 rounded-full px-1.5 py-0.5 font-medium">
                          {s.schedule.length}h
                        </span>
                      )}
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

            <div className="mt-8 flex flex-col sm:flex-row gap-3 items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {subjects.length === 0
                  ? "Sem pressa — você pode pular e configurar depois."
                  : "Você pode editar, adicionar mais ou excluir depois no dashboard."}
              </p>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  onClick={skip}
                  variant="ghost"
                  size="lg"
                  disabled={saving || skipping}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {skipping ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Pular por enquanto"
                  )}
                </Button>
                <Button
                  onClick={finish}
                  variant="gradient"
                  size="lg"
                  disabled={saving || skipping || subjects.length === 0}
                  className="min-w-[180px]"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Concluir <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
