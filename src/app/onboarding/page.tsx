"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, GraduationCap, Loader2, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LumioWordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  bulkCreateSubjects,
  getCurrentUser,
  updateCurrentUser,
} from "@/lib/storage";
import { DEFAULT_EMOJIS, SUBJECT_PALETTE } from "@/lib/types";
import { cn } from "@/lib/utils";

type DraftSubject = { name: string; emoji: string; color: string };

const SUGGESTED: DraftSubject[] = [
  { name: "Anatomia", emoji: "🧬", color: "from-rose-500 to-pink-500" },
  { name: "Fisiologia", emoji: "🫀", color: "from-indigo-500 to-violet-500" },
  { name: "Bioquímica", emoji: "⚗️", color: "from-emerald-500 to-teal-500" },
  { name: "Histologia", emoji: "🔬", color: "from-sky-500 to-cyan-500" },
  { name: "Farmacologia", emoji: "💊", color: "from-amber-500 to-orange-500" },
  { name: "Patologia", emoji: "🩺", color: "from-fuchsia-500 to-purple-500" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [subjects, setSubjects] = useState<DraftSubject[]>([]);
  const [newName, setNewName] = useState("");
  const [emoji, setEmoji] = useState(DEFAULT_EMOJIS[0]);
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    setUserName(user.name.split(" ")[0]);
  }, [router]);

  function toggleSuggestion(s: DraftSubject) {
    const existing = subjects.findIndex((x) => x.name.toLowerCase() === s.name.toLowerCase());
    if (existing >= 0) {
      setSubjects((prev) => prev.filter((_, i) => i !== existing));
    } else {
      setSubjects((prev) => [...prev, s]);
    }
  }

  function addCustom() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (subjects.find((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Você já adicionou essa matéria.");
      return;
    }
    setSubjects((prev) => [
      ...prev,
      { name: trimmed, emoji, color: SUBJECT_PALETTE[paletteIdx].color },
    ]);
    setNewName("");
  }

  function removeSubject(name: string) {
    setSubjects((prev) => prev.filter((s) => s.name !== name));
  }

  async function finish() {
    if (saving) return;
    if (subjects.length === 0) {
      toast.error("Adicione ao menos uma matéria.");
      return;
    }
    setSaving(true);
    const user = getCurrentUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    bulkCreateSubjects(user.id, subjects);
    updateCurrentUser({ onboardedAt: new Date().toISOString() });
    toast.success("Pronto! Bem-vindo ao Lumio.");
    setTimeout(() => router.push("/dashboard"), 400);
  }

  const selectedNames = useMemo(() => new Set(subjects.map((s) => s.name.toLowerCase())), [subjects]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg" />
      <div
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-[500px] w-[900px] opacity-40 blur-3xl"
        style={{
          background: "radial-gradient(closest-side, oklch(0.6 0.25 290 / 0.45), transparent 70%)",
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
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-3 py-1 text-xs">
            <Sparkles className="h-3 w-3 text-primary" /> Passo {step} de 2
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
            {step === 1 ? (
              <>
                Olá{userName ? `, ${userName}` : ""}. <span className="gradient-text">Vamos começar</span>.
              </>
            ) : (
              <>
                Suas <span className="gradient-text">matérias</span>.
              </>
            )}
          </h1>
          <p className="mt-3 text-muted-foreground">
            {step === 1
              ? "Em 30 segundos a gente organiza tudo. É só escolher o que você está estudando esse semestre."
              : "Edite, remova ou adicione mais. Você pode mudar isso depois no dashboard."}
          </p>
        </div>

        <Card className="border-border/80 bg-card/80 backdrop-blur-xl shadow-xl">
          {step === 1 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-primary" /> Escolha algumas pra começar
                </CardTitle>
                <CardDescription>
                  Toque nas sugestões abaixo ou crie a sua no passo seguinte.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {SUGGESTED.map((s) => {
                    const active = selectedNames.has(s.name.toLowerCase());
                    return (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => toggleSuggestion(s)}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-lg border bg-background/60 px-4 py-3 text-left transition-all hover:border-primary/50 hover:bg-background hover:shadow-sm",
                          active
                            ? "border-primary/60 ring-2 ring-primary/20"
                            : "border-border/70",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-md bg-gradient-to-br text-xl",
                            s.color,
                          )}
                        >
                          {s.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{s.name}</div>
                          <div className="text-xs text-muted-foreground">Sugerida</div>
                        </div>
                        {active && (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-3 w-3" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-8 flex flex-col sm:flex-row gap-3 items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {subjects.length === 0
                      ? "Selecione pelo menos uma matéria, ou pule pra criar a sua."
                      : `${subjects.length} matéria${subjects.length === 1 ? "" : "s"} selecionada${subjects.length === 1 ? "" : "s"}`}
                  </p>
                  <Button onClick={() => setStep(2)} variant="gradient">
                    Próximo <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {step === 2 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5 text-primary" /> Adicione mais (opcional)
                </CardTitle>
                <CardDescription>
                  Escolha emoji + cor e clique em adicionar. Você pode fazer isso depois também.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="h-10 w-10 rounded-md border border-border/70 bg-background flex items-center justify-center text-xl hover:bg-secondary"
                        onClick={() => {
                          const idx = DEFAULT_EMOJIS.indexOf(emoji);
                          setEmoji(DEFAULT_EMOJIS[(idx + 1) % DEFAULT_EMOJIS.length]);
                        }}
                        title="Trocar emoji"
                      >
                        {emoji}
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "h-10 w-10 rounded-md border border-border/70 bg-gradient-to-br",
                          SUBJECT_PALETTE[paletteIdx].color,
                        )}
                        onClick={() => setPaletteIdx((paletteIdx + 1) % SUBJECT_PALETTE.length)}
                        title="Trocar cor"
                      />
                    </div>
                    <Input
                      placeholder="Ex: Cálculo, História da Arte..."
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCustom();
                        }
                      }}
                      className="flex-1"
                    />
                    <Button type="button" onClick={addCustom} variant="outline">
                      <Plus className="h-4 w-4" /> Adicionar
                    </Button>
                  </div>

                  <div className="border-t border-border/60 pt-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                      Suas matérias ({subjects.length})
                    </p>
                    {subjects.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
                        Nenhuma matéria ainda. Volte e selecione uma sugestão ou crie acima.
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {subjects.map((s) => (
                          <div
                            key={s.name}
                            className="group flex items-center gap-2 rounded-full border border-border/70 bg-background pl-2 pr-1 py-1"
                          >
                            <div
                              className={cn(
                                "flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br text-sm",
                                s.color,
                              )}
                            >
                              {s.emoji}
                            </div>
                            <span className="text-sm pr-1">{s.name}</span>
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

                <div className="mt-8 flex flex-col sm:flex-row gap-3 items-center justify-between">
                  <Button variant="ghost" onClick={() => setStep(1)} disabled={saving}>
                    Voltar
                  </Button>
                  <Button onClick={finish} variant="gradient" size="lg" disabled={saving}>
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Concluir <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
