"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LumioWordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { EmojiPicker, ColorPicker } from "@/components/app/emoji-color-picker";
import {
  bulkCreateSubjects,
  getCurrentUser,
  updateCurrentUser,
} from "@/lib/storage";
import { DEFAULT_EMOJIS, SUBJECT_PALETTE } from "@/lib/types";
import { cn } from "@/lib/utils";

type DraftSubject = { name: string; emoji: string; color: string };

function pickEmojiForName(name: string): string {
  const lower = name.toLowerCase();
  const map: Array<[RegExp, string]> = [
    [/anatom/i, "🧬"],
    [/fisiolog/i, "🫀"],
    [/bioqu[ií]m/i, "⚗️"],
    [/histolog/i, "🔬"],
    [/farmacolog/i, "💊"],
    [/patolog/i, "🩺"],
    [/imuno/i, "🦠"],
    [/microbiolog/i, "🧫"],
    [/parasitolog/i, "🪱"],
    [/embriolog/i, "👶"],
    [/c[áa]lculo|matem[áa]tica|[áa]lgebra/i, "🧮"],
    [/f[ií]sica/i, "🪐"],
    [/qu[ií]mica/i, "🧪"],
    [/biolog/i, "🌱"],
    [/programa|c[óo]digo|computa/i, "💻"],
    [/direito|jur[ií]d/i, "⚖️"],
    [/hist[óo]ria/i, "📜"],
    [/geograf/i, "🌍"],
    [/arte|design/i, "🎨"],
    [/m[úu]sica/i, "🎵"],
    [/economia|finan/i, "💰"],
    [/literatura|portugu[êe]s|reda[çc]/i, "📖"],
    [/ingl[êe]s|espanhol|franc[êe]s|idioma/i, "🗣️"],
    [/psicolog/i, "🧠"],
    [/sociolog|antrop/i, "👥"],
    [/[ée]tica|filosof/i, "💭"],
    [/saude coletiva|sa[úu]de p[úu]blica/i, "🏥"],
    [/genetic|gen[ée]tic/i, "🧬"],
    [/sema|sem[ií]olog/i, "🩻"],
  ];
  for (const [re, emoji] of map) {
    if (re.test(lower)) return emoji;
  }
  return DEFAULT_EMOJIS[Math.abs(hashCode(name)) % DEFAULT_EMOJIS.length];
}

function pickColorForName(name: string): string {
  const idx = Math.abs(hashCode(name)) % SUBJECT_PALETTE.length;
  return SUBJECT_PALETTE[idx].color;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

export default function OnboardingPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subjects, setSubjects] = useState<DraftSubject[]>([]);
  const [newName, setNewName] = useState("");
  const [emojiOverride, setEmojiOverride] = useState<string | null>(null);
  const [colorOverride, setColorOverride] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    setUserName(user.name.split(" ")[0]);
  }, [router]);

  function addSubject(name: string, opts?: { emoji?: string; color?: string }) {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (subjects.find((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      return false;
    }
    const subject: DraftSubject = {
      name: trimmed,
      emoji: opts?.emoji || pickEmojiForName(trimmed),
      color: opts?.color || pickColorForName(trimmed),
    };
    setSubjects((prev) => [...prev, subject]);
    return true;
  }

  function handleAddManual() {
    const success = addSubject(newName, {
      emoji: emojiOverride ?? undefined,
      color: colorOverride ?? undefined,
    });
    if (!success) {
      if (newName.trim() && subjects.some((s) => s.name.toLowerCase() === newName.trim().toLowerCase())) {
        toast.error("Você já adicionou essa matéria.");
      }
      return;
    }
    setNewName("");
    setEmojiOverride(null);
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
      const extracted: Array<{ name: string }> = data.subjects || [];
      if (extracted.length === 0) {
        toast.error(data?.error || "Não encontrei matérias na grade.", { id: t });
        return;
      }
      let added = 0;
      for (const s of extracted) {
        if (addSubject(s.name)) added++;
      }
      if (data.demo) {
        toast.warning(
          `Modo demo: adicionei ${added} matéria${added === 1 ? "" : "s"} de exemplo. Configure ANTHROPIC_API_KEY pra extração real.`,
          { id: t, duration: 6000 },
        );
      } else {
        toast.success(
          `${added} matéria${added === 1 ? "" : "s"} extraída${added === 1 ? "" : "s"} da grade.`,
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

  const currentEmoji =
    emojiOverride ?? (newName ? pickEmojiForName(newName) : DEFAULT_EMOJIS[0]);
  const currentColor =
    colorOverride ?? (newName ? pickColorForName(newName) : SUBJECT_PALETTE[0].color);

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
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-3 py-1 text-xs">
            <Sparkles className="h-3 w-3 text-primary" /> Configurando suas matérias
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
            Olá{userName ? `, ${userName}` : ""}.{" "}
            <span className="gradient-text">Suas matérias</span>.
          </h1>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            Adicione manualmente ou suba sua grade horária e a IA extrai pra você. Pode editar
            depois.
          </p>
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
              Digite o nome da sua matéria. O emoji e a cor são escolhidos automaticamente
              (você pode trocar).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex items-center gap-2">
                <EmojiPicker
                  value={currentEmoji}
                  onChange={(e) => setEmojiOverride(e)}
                />
                <ColorPicker
                  value={currentColor}
                  onChange={(c) => setColorOverride(c)}
                />
              </div>
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
                    >
                      <div
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br text-sm",
                          s.color,
                        )}
                      >
                        {s.emoji}
                      </div>
                      <span className="text-sm pr-1 max-w-[200px] truncate">{s.name}</span>
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
                  ? "Adicione ao menos uma pra continuar."
                  : "Você pode editar, adicionar mais ou excluir depois no dashboard."}
              </p>
              <Button
                onClick={finish}
                variant="gradient"
                size="lg"
                disabled={saving || subjects.length === 0}
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
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
