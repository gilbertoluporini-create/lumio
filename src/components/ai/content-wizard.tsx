"use client";

/**
 * ContentWizard — wizard genérico de geração de conteúdo AI.
 *
 * 4 steps:
 *  1) Fontes (aulas, slides, PDFs uploadados, upload novo PDF) + descrição custom
 *  2) Opções específicas do mode (summary/flashcards/quiz/mindmap)
 *  3) Confirmação de custo (com check de saldo)
 *  4) Loading + preview do output (com botão Salvar / Descartar)
 *
 * Pricing real vem de src/lib/coins-pricing.ts.
 * Geração via POST /api/ai/generate (server consome coins).
 *
 * Salva no fim:
 *  - summary  → cria nova lecture, popula summary.generalSummary + sections
 *  - others   → cria lecture sintética + insere asset em lecture_assets
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Coins,
  FileText,
  FileUp,
  Folder,
  Loader2,
  Mic,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  COIN_COSTS,
  computeCost,
  modeLabel,
  type AIMode,
} from "@/lib/coins-pricing";
import {
  createLectureAsync,
  listLecturesAsync,
  listSubjectsAsync,
  updateLectureAsync,
} from "@/lib/db";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Lecture, Subject } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

type Step = 1 | 2 | 3 | 4;

type Depth = "concise" | "standard" | "detailed";
type Level = "beginner" | "intermediate" | "advanced";
type Difficulty = "easy" | "medium" | "hard";
type Complexity = "simple" | "medium" | "deep";

type UploadedPdf = {
  id: string;
  name: string;
  text: string;
  pages: number;
};

type GenerateResponse = {
  mode: AIMode;
  content: unknown;
  imageUrls?: string[];
  coinsCharged: number;
  balanceAfter: number;
};

type Flashcard = {
  question: string;
  answer: string;
  hint?: string;
  difficulty?: "easy" | "medium" | "hard";
};

type QuizQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

type MindmapNode = {
  label: string;
  detail?: string;
  children?: MindmapNode[];
};

export type ContentWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: AIMode;
  userId: string;
  /** Pré-seleciona uma aula como fonte (ex: usuário entrou pelo botão da própria aula) */
  initialSourceLectureId?: string;
  /** Callback opcional após salvar com sucesso */
  onCreated?: (result: { lectureId: string; mode: AIMode }) => void;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ContentWizard({
  open,
  onOpenChange,
  mode,
  userId,
  initialSourceLectureId,
  onCreated,
}: ContentWizardProps) {
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingLectures, setLoadingLectures] = useState(false);
  const [selectedLectureIds, setSelectedLectureIds] = useState<Set<string>>(
    new Set(),
  );
  const [includeSlides, setIncludeSlides] = useState(true);
  const [uploadedPdfs, setUploadedPdfs] = useState<UploadedPdf[]>([]);
  const [pdfProcessing, setPdfProcessing] = useState(false);
  const [userInstructions, setUserInstructions] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 2 state — específicas
  const [withImages, setWithImages] = useState(false);
  const [depth, setDepth] = useState<Depth>("standard");
  const [count, setCount] = useState<number>(
    mode === "flashcards" ? 15 : mode === "quiz" ? 10 : 10,
  );
  const [level, setLevel] = useState<Level>("intermediate");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [complexity, setComplexity] = useState<Complexity>("medium");

  // Step 3 state — saldo
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Step 4 state — generation
  const [generating, setGenerating] = useState(false);
  const [genStage, setGenStage] = useState<string>("Preparando...");
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);

  /* --------------------------------------- carga inicial --------- */

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setLoadingLectures(true);
    Promise.all([listLecturesAsync(userId), listSubjectsAsync(userId)])
      .then(([l, s]) => {
        if (cancel) return;
        setLectures(l);
        setSubjects(s);
        // Pré-seleciona se vier initialSourceLectureId
        if (
          initialSourceLectureId &&
          l.some((x) => x.id === initialSourceLectureId)
        ) {
          setSelectedLectureIds(new Set([initialSourceLectureId]));
        }
      })
      .finally(() => {
        if (!cancel) setLoadingLectures(false);
      });
    return () => {
      cancel = true;
    };
  }, [open, userId, initialSourceLectureId]);

  // Reset quando fecha
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setStep(1);
      setSelectedLectureIds(new Set());
      setIncludeSlides(true);
      setUploadedPdfs([]);
      setUserInstructions("");
      setWithImages(false);
      setResult(null);
      setSaveTitle("");
      setGenerating(false);
    }, 250);
    return () => clearTimeout(t);
  }, [open]);

  /* --------------------------------------- balance --------------- */

  const fetchBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const resp = await fetch("/api/coins");
      if (!resp.ok) throw new Error("Falha ao buscar saldo");
      const json = (await resp.json()) as { balance?: number };
      setBalance(typeof json.balance === "number" ? json.balance : 0);
    } catch {
      setBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (step === 3) {
      void fetchBalance();
    }
  }, [step, fetchBalance]);

  /* --------------------------------------- aulas filtradas ------- */

  const lecturesWithTranscript = useMemo(
    () =>
      lectures.filter(
        (l) => typeof l.transcript === "string" && l.transcript.trim().length > 0,
      ),
    [lectures],
  );

  const subjectById = useMemo(() => {
    const m = new Map<string, Subject>();
    for (const s of subjects) m.set(s.id, s);
    return m;
  }, [subjects]);

  const selectedLectures = useMemo(
    () => lectures.filter((l) => selectedLectureIds.has(l.id)),
    [lectures, selectedLectureIds],
  );

  const transcriptCount = selectedLectures.length;
  const slidesCount = useMemo(
    () =>
      includeSlides
        ? selectedLectures.filter((l) => (l.slides?.length ?? 0) > 0).length
        : 0,
    [includeSlides, selectedLectures],
  );

  /* --------------------------------------- pricing --------------- */

  const cost = computeCost(mode, withImages);
  const imagesAvailable = mode !== "mindmap";
  const insufficient = balance !== null && balance < cost;

  /* --------------------------------------- step nav -------------- */

  const canAdvanceStep1 =
    selectedLectureIds.size > 0 || uploadedPdfs.length > 0;

  /* --------------------------------------- PDF upload ------------ */

  const handlePdfFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPdfProcessing(true);
    try {
      const pdfjs = await import("pdfjs-dist");
      if (typeof window !== "undefined") {
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      }

      const newOnes: UploadedPdf[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`"${file.name}" passa de 20 MB — pula.`);
          continue;
        }
        try {
          const buf = await file.arrayBuffer();
          const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
          const doc = await task.promise;
          const parts: string[] = [];
          for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items
              .map((it) => ("str" in it ? it.str : ""))
              .filter((s) => s.length > 0)
              .join(" ");
            if (pageText.trim().length > 0) {
              parts.push(`--- Página ${i} ---\n${pageText}`);
            }
            page.cleanup();
          }
          await doc.destroy();
          const text = parts.join("\n\n");
          if (!text.trim()) {
            toast.error(`"${file.name}" não tem texto extraível.`);
            continue;
          }
          newOnes.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            text,
            pages: doc.numPages,
          });
        } catch (err) {
          console.error(err);
          toast.error(`Falha ao processar "${file.name}".`);
        }
      }
      if (newOnes.length > 0) {
        setUploadedPdfs((prev) => [...prev, ...newOnes]);
        toast.success(
          `${newOnes.length} PDF${newOnes.length > 1 ? "s" : ""} pronto${newOnes.length > 1 ? "s" : ""}.`,
        );
      }
    } finally {
      setPdfProcessing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, []);

  /* --------------------------------------- generate -------------- */

  const handleGenerate = useCallback(async () => {
    setStep(4);
    setGenerating(true);
    setResult(null);
    setGenStage("Lendo fontes...");

    // Monta sources
    const transcripts: string[] = [];
    for (const l of selectedLectures) {
      const t = (l.transcript ?? "").trim();
      if (t) {
        let combined = t;
        if (includeSlides && l.slides && l.slides.length > 0) {
          const slidesText = l.slides
            .map(
              (s) =>
                `[Slide ${s.pageNumber}${s.title ? ` — ${s.title}` : ""}]\n${s.text ?? ""}`,
            )
            .join("\n\n");
          combined = `${combined}\n\n${slidesText}`;
        }
        transcripts.push(combined);
      }
    }
    const pdfTexts = uploadedPdfs.map((p) => p.text);

    const options: Record<string, unknown> = {
      withImages: withImages && imagesAvailable,
      userInstructions: userInstructions.trim() || undefined,
    };
    if (mode === "summary") options.depth = depth;
    if (mode === "flashcards") {
      options.count = count;
      options.level = level;
    }
    if (mode === "quiz") {
      options.count = count;
      options.difficulty = difficulty;
    }
    if (mode === "mindmap") options.complexity = complexity;

    // Stage progressivo (cosmético)
    const stageTimer = setTimeout(() => setGenStage("Pensando..."), 1500);
    const stageTimer2 = setTimeout(
      () =>
        setGenStage(
          withImages && imagesAvailable ? "Gerando imagens..." : "Estruturando...",
        ),
      6000,
    );
    const stageTimer3 = setTimeout(() => setGenStage("Finalizando..."), 14000);

    try {
      const resp = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          sources: { transcripts, pdfTexts },
          options,
        }),
      });
      const json = (await resp.json()) as GenerateResponse & {
        error?: string;
        balance?: number;
        required?: number;
      };
      if (!resp.ok) {
        toast.error(json.error ?? "Falha na geração.");
        setGenerating(false);
        setStep(3);
        return;
      }
      setResult(json);
      // Sugere título default
      const suggested = suggestTitle(mode, json);
      setSaveTitle(suggested);
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
      setGenerating(false);
      setStep(3);
    } finally {
      clearTimeout(stageTimer);
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);
      setGenerating(false);
    }
  }, [
    mode,
    selectedLectures,
    uploadedPdfs,
    includeSlides,
    userInstructions,
    withImages,
    imagesAvailable,
    depth,
    count,
    level,
    difficulty,
    complexity,
  ]);

  /* --------------------------------------- save ------------------ */

  const handleSave = useCallback(async () => {
    if (!result) return;
    setSaving(true);
    try {
      // Determina subject — usa a primeira aula selecionada, ou primeiro subject do user
      const firstLecture = selectedLectures[0];
      const subjectId =
        firstLecture?.subjectId ?? subjects[0]?.id ?? "";
      if (!subjectId) {
        toast.error(
          "Crie ao menos uma matéria antes de salvar — vá no dashboard.",
        );
        setSaving(false);
        return;
      }

      const title = (saveTitle || "Material gerado").slice(0, 200);

      if (mode === "summary") {
        const lecture = await createLectureAsync(userId, {
          subjectId,
          title,
        });
        const md =
          (result.content as { markdown?: string })?.markdown ?? "";
        const summary = {
          generatedAt: new Date().toISOString(),
          generalSummary: md,
          highlights: extractHighlights(md, 6),
          sections: [],
        };
        await updateLectureAsync(userId, lecture.id, {
          summary,
        });
        toast.success("Resumo salvo!");
        onCreated?.({ lectureId: lecture.id, mode });
      } else {
        // flashcards/quiz/mindmap → cria lecture sintética + lecture_assets
        const lecture = await createLectureAsync(userId, {
          subjectId,
          title,
        });

        // Insere asset via supabase client (mesmo padrão usado em outras pages)
        if (isSupabaseConfigured()) {
          const supabase = createClient();
          const kind = mode; // "flashcards" | "quiz" | "mindmap"
          let payload: Record<string, unknown> = {};
          if (mode === "flashcards") {
            const cards = ((result.content as { cards?: unknown[] }).cards ??
              []) as Flashcard[];
            payload = { generatedAt: new Date().toISOString(), cards };
          } else if (mode === "quiz") {
            const questions = ((result.content as { questions?: unknown[] })
              .questions ?? []) as QuizQuestion[];
            payload = {
              generatedAt: new Date().toISOString(),
              questions,
            };
          } else if (mode === "mindmap") {
            const c = result.content as {
              centralTopic?: string;
              branches?: MindmapNode[];
            };
            payload = {
              generatedAt: new Date().toISOString(),
              centralTopic: c.centralTopic ?? title,
              branches: c.branches ?? [],
            };
          }

          const { error } = await supabase.from("lecture_assets").insert({
            lecture_id: lecture.id,
            user_id: userId,
            kind,
            payload,
            coins_spent: result.coinsCharged,
          });
          if (error) throw error;
        }

        toast.success(`${modeLabel(mode)} salvo!`);
        onCreated?.({ lectureId: lecture.id, mode });
      }

      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(`Erro ao salvar: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [
    result,
    mode,
    userId,
    selectedLectures,
    subjects,
    saveTitle,
    onCreated,
    onOpenChange,
  ]);

  /* --------------------------------------- render ---------------- */

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "p-0 gap-0 overflow-hidden",
          "max-w-3xl w-full",
          "max-h-[90vh] flex flex-col",
          "sm:rounded-xl",
        )}
      >
        <DialogHeader className="p-6 pb-4 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/20 to-fuchsia-500/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg">
                Gerar {modeLabel(mode).toLowerCase()} com IA
              </DialogTitle>
              <DialogDescription className="mt-0.5">
                {step === 1 && "Escolha de onde vem o conteúdo."}
                {step === 2 && "Ajuste as opções de geração."}
                {step === 3 && "Confirme o custo e gere."}
                {step === 4 && (generating ? "Gerando..." : "Pronto pra revisar.")}
              </DialogDescription>
            </div>
            <StepBadge step={step} />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {step === 1 && (
            <Step1Sources
              lectures={lecturesWithTranscript}
              subjects={subjectById}
              loading={loadingLectures}
              selectedIds={selectedLectureIds}
              onToggleLecture={(id) => {
                setSelectedLectureIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              }}
              includeSlides={includeSlides}
              onToggleSlides={setIncludeSlides}
              uploadedPdfs={uploadedPdfs}
              onRemovePdf={(id) =>
                setUploadedPdfs((prev) => prev.filter((p) => p.id !== id))
              }
              onPickFiles={() => fileRef.current?.click()}
              pdfProcessing={pdfProcessing}
              userInstructions={userInstructions}
              onChangeInstructions={setUserInstructions}
            />
          )}

          {step === 2 && (
            <Step2Options
              mode={mode}
              imagesAvailable={imagesAvailable}
              withImages={withImages}
              onToggleImages={setWithImages}
              depth={depth}
              onChangeDepth={setDepth}
              count={count}
              onChangeCount={setCount}
              level={level}
              onChangeLevel={setLevel}
              difficulty={difficulty}
              onChangeDifficulty={setDifficulty}
              complexity={complexity}
              onChangeComplexity={setComplexity}
            />
          )}

          {step === 3 && (
            <Step3Confirm
              mode={mode}
              cost={cost}
              withImages={withImages}
              balance={balance}
              balanceLoading={balanceLoading}
              insufficient={insufficient}
              transcriptCount={transcriptCount}
              slidesCount={slidesCount}
              pdfCount={uploadedPdfs.length}
            />
          )}

          {step === 4 && (
            <Step4Result
              mode={mode}
              generating={generating}
              stage={genStage}
              result={result}
              saveTitle={saveTitle}
              onChangeTitle={setSaveTitle}
            />
          )}
        </div>

        {/* Footer com nav */}
        <div className="border-t border-border/50 px-6 py-3 flex items-center justify-between gap-3 shrink-0 bg-card/50">
          <div className="text-[11px] text-muted-foreground">
            {step < 4 && (
              <span>
                Etapa <span className="font-semibold">{step}</span> de 3
              </span>
            )}
            {step === 4 &&
              (generating ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {genStage}
                </span>
              ) : result ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Gerado · {result.coinsCharged} coins consumidos
                </span>
              ) : null)}
          </div>

          <div className="flex items-center gap-2">
            {step > 1 && step < 4 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep((s) => (s - 1) as Step)}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Voltar
              </Button>
            )}
            {step === 1 && (
              <Button
                variant="gradient"
                size="sm"
                onClick={() => setStep(2)}
                disabled={!canAdvanceStep1}
              >
                Continuar <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
            {step === 2 && (
              <Button
                variant="gradient"
                size="sm"
                onClick={() => setStep(3)}
              >
                Revisar custo <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
            {step === 3 && (
              <Button
                variant="gradient"
                size="lg"
                onClick={() => void handleGenerate()}
                disabled={insufficient || balance === null}
              >
                <Sparkles className="h-4 w-4" /> Gerar agora
              </Button>
            )}
            {step === 4 && result && !generating && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Descartar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setResult(null);
                    setStep(2);
                  }}
                  disabled={saving}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Re-gerar
                </Button>
                <Button
                  variant="gradient"
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Salvar
                </Button>
              </>
            )}
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => void handlePdfFiles(e.target.files)}
        />
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StepBadge({ step }: { step: Step }) {
  if (step === 4) {
    return (
      <Badge variant="secondary" className="gap-1 shrink-0">
        <Sparkles className="h-3 w-3" /> Geração
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-mono tabular-nums shrink-0">
      {step}/3
    </Badge>
  );
}

/* ----- Step 1: Fontes -------------------------------------------- */

function Step1Sources({
  lectures,
  subjects,
  loading,
  selectedIds,
  onToggleLecture,
  includeSlides,
  onToggleSlides,
  uploadedPdfs,
  onRemovePdf,
  onPickFiles,
  pdfProcessing,
  userInstructions,
  onChangeInstructions,
}: {
  lectures: Lecture[];
  subjects: Map<string, Subject>;
  loading: boolean;
  selectedIds: Set<string>;
  onToggleLecture: (id: string) => void;
  includeSlides: boolean;
  onToggleSlides: (v: boolean) => void;
  uploadedPdfs: UploadedPdf[];
  onRemovePdf: (id: string) => void;
  onPickFiles: () => void;
  pdfProcessing: boolean;
  userInstructions: string;
  onChangeInstructions: (s: string) => void;
}) {
  const [lectureListOpen, setLectureListOpen] = useState(true);
  const selectedCount = selectedIds.size;
  const slidesOfSelected = lectures
    .filter((l) => selectedIds.has(l.id))
    .reduce((n, l) => n + (l.slides?.length ?? 0), 0);

  return (
    <div className="p-6 space-y-5">
      {/* Aulas gravadas */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setLectureListOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 text-left"
        >
          <div className="h-9 w-9 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center shrink-0">
            <Mic className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Aula gravada</div>
            <div className="text-[11px] text-muted-foreground">
              {selectedCount === 0
                ? `${lectures.length} aula${lectures.length === 1 ? "" : "s"} com transcrição disponível`
                : `${selectedCount} selecionada${selectedCount === 1 ? "" : "s"}`}
            </div>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform shrink-0",
              lectureListOpen && "rotate-180",
            )}
          />
        </button>

        {lectureListOpen && (
          <div className="border-t border-border/40 max-h-[260px] overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando...
              </div>
            ) : lectures.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                Nenhuma aula com transcrição. Grave uma aula no dashboard primeiro.
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {lectures.map((l) => {
                  const subj = subjects.get(l.subjectId);
                  const sel = selectedIds.has(l.id);
                  const hasSlides = (l.slides?.length ?? 0) > 0;
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => onToggleLecture(l.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                          sel
                            ? "bg-primary/5 hover:bg-primary/10"
                            : "hover:bg-secondary/30",
                        )}
                      >
                        <div
                          className={cn(
                            "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                            sel
                              ? "bg-primary border-primary text-white"
                              : "border-border",
                          )}
                        >
                          {sel && <Check className="h-3 w-3" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">
                            {l.title}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate inline-flex items-center gap-1.5">
                            <span>{subj?.name ?? "Sem matéria"}</span>
                            {hasSlides && (
                              <Badge
                                variant="outline"
                                className="text-[9px] py-0 px-1 h-3.5 font-mono"
                              >
                                {l.slides!.length} slides
                              </Badge>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {selectedCount > 0 && slidesOfSelected > 0 && (
          <div className="border-t border-border/40 px-4 py-2.5 flex items-center gap-3 bg-secondary/10">
            <button
              type="button"
              onClick={() => onToggleSlides(!includeSlides)}
              className={cn(
                "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                includeSlides
                  ? "bg-primary border-primary text-white"
                  : "border-border",
              )}
              aria-pressed={includeSlides}
            >
              {includeSlides && <Check className="h-3 w-3" />}
            </button>
            <div className="text-xs text-muted-foreground flex-1">
              Incluir texto dos slides ({slidesOfSelected} no total)
            </div>
          </div>
        )}
      </div>

      {/* PDF da pasta Documentos — coming soon */}
      <button
        type="button"
        onClick={() =>
          toast("Em breve", {
            description:
              "Vamos liberar a seleção de PDFs salvos na pasta Documentos.",
          })
        }
        className="w-full text-left rounded-xl border border-dashed border-border/60 bg-card/40 px-4 py-3 hover:border-primary/40 hover:bg-card transition-colors flex items-center gap-3"
      >
        <div className="h-9 w-9 rounded-lg bg-secondary/40 flex items-center justify-center shrink-0">
          <Folder className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium inline-flex items-center gap-2">
            PDF da pasta Documentos
            <Badge variant="outline" className="text-[9px] py-0">
              Em breve
            </Badge>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Escolha PDFs já salvos na sua biblioteca.
          </div>
        </div>
      </button>

      {/* Upload PDF */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center shrink-0">
            <FileUp className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Upload novo PDF</div>
            <div className="text-[11px] text-muted-foreground">
              Processado no seu navegador — não fica salvo.
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onPickFiles}
            disabled={pdfProcessing}
          >
            {pdfProcessing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {pdfProcessing ? "Processando" : "Escolher PDFs"}
          </Button>
        </div>

        {uploadedPdfs.length > 0 && (
          <ul className="border-t border-border/40 divide-y divide-border/40">
            {uploadedPdfs.map((p) => (
              <li
                key={p.id}
                className="px-4 py-2.5 flex items-center gap-3"
              >
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {p.pages} página{p.pages === 1 ? "" : "s"} ·{" "}
                    {p.text.length.toLocaleString("pt-BR")} caracteres
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemovePdf(p.id)}
                  className="h-6 w-6 rounded-md inline-flex items-center justify-center text-muted-foreground hover:bg-secondary"
                  aria-label="Remover"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Instruções customizadas */}
      <div>
        <Label
          htmlFor="user-instr"
          className="text-xs font-medium text-muted-foreground"
        >
          Descreva pra IA o que você quer (opcional)
        </Label>
        <Textarea
          id="user-instr"
          value={userInstructions}
          onChange={(e) => onChangeInstructions(e.target.value)}
          placeholder="Ex: foque em conceitos cobrados em prova; use exemplos práticos; tom mais informal..."
          rows={3}
          className="mt-1.5 resize-y min-h-[72px] max-h-[160px]"
          maxLength={2000}
        />
        <div className="mt-1 text-[10px] text-muted-foreground text-right font-mono">
          {userInstructions.length}/2000
        </div>
      </div>
    </div>
  );
}

/* ----- Step 2: Options ------------------------------------------- */

function Step2Options({
  mode,
  imagesAvailable,
  withImages,
  onToggleImages,
  depth,
  onChangeDepth,
  count,
  onChangeCount,
  level,
  onChangeLevel,
  difficulty,
  onChangeDifficulty,
  complexity,
  onChangeComplexity,
}: {
  mode: AIMode;
  imagesAvailable: boolean;
  withImages: boolean;
  onToggleImages: (v: boolean) => void;
  depth: Depth;
  onChangeDepth: (v: Depth) => void;
  count: number;
  onChangeCount: (v: number) => void;
  level: Level;
  onChangeLevel: (v: Level) => void;
  difficulty: Difficulty;
  onChangeDifficulty: (v: Difficulty) => void;
  complexity: Complexity;
  onChangeComplexity: (v: Complexity) => void;
}) {
  const imageDelta =
    mode === "summary"
      ? COIN_COSTS.summaryWithImages - COIN_COSTS.summary
      : mode === "flashcards"
        ? COIN_COSTS.flashcardsWithImages - COIN_COSTS.flashcards
        : mode === "quiz"
          ? COIN_COSTS.quizWithImages - COIN_COSTS.quiz
          : 0;

  const countMin = mode === "flashcards" ? 5 : 5;
  const countMax = mode === "flashcards" ? 30 : 20;

  return (
    <div className="p-6 space-y-5">
      {mode === "summary" && (
        <SelectField
          label="Profundidade"
          value={depth}
          onChange={(v) => onChangeDepth(v as Depth)}
          options={[
            { value: "concise", label: "Conciso — 1-2 páginas" },
            { value: "standard", label: "Padrão — 2-4 páginas" },
            { value: "detailed", label: "Detalhado — 5+ páginas" },
          ]}
        />
      )}

      {(mode === "flashcards" || mode === "quiz") && (
        <div>
          <Label className="text-xs font-medium text-muted-foreground">
            {mode === "flashcards" ? "Quantos cards" : "Quantas questões"}
          </Label>
          <div className="mt-1.5 flex items-center gap-3">
            <Input
              type="number"
              min={countMin}
              max={countMax}
              value={count}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) {
                  onChangeCount(Math.min(Math.max(n, countMin), countMax));
                }
              }}
              className="w-24"
            />
            <input
              type="range"
              min={countMin}
              max={countMax}
              value={count}
              onChange={(e) => onChangeCount(parseInt(e.target.value, 10))}
              className="flex-1 accent-primary"
            />
            <span className="text-xs text-muted-foreground font-mono tabular-nums w-16 text-right">
              {countMin}–{countMax}
            </span>
          </div>
        </div>
      )}

      {mode === "flashcards" && (
        <SelectField
          label="Nível"
          value={level}
          onChange={(v) => onChangeLevel(v as Level)}
          options={[
            { value: "beginner", label: "Iniciante" },
            { value: "intermediate", label: "Intermediário" },
            { value: "advanced", label: "Avançado" },
          ]}
        />
      )}

      {mode === "quiz" && (
        <SelectField
          label="Dificuldade"
          value={difficulty}
          onChange={(v) => onChangeDifficulty(v as Difficulty)}
          options={[
            { value: "easy", label: "Fácil" },
            { value: "medium", label: "Médio" },
            { value: "hard", label: "Difícil" },
          ]}
        />
      )}

      {mode === "mindmap" && (
        <SelectField
          label="Complexidade"
          value={complexity}
          onChange={(v) => onChangeComplexity(v as Complexity)}
          options={[
            { value: "simple", label: "Simples — até 2 níveis" },
            { value: "medium", label: "Médio — 2-3 níveis" },
            { value: "deep", label: "Profundo — muitos sub-ramos" },
          ]}
        />
      )}

      {imagesAvailable && (
        <div
          className={cn(
            "rounded-xl border p-4 transition-colors",
            withImages
              ? "border-primary/40 bg-primary/5"
              : "border-border/60 bg-card",
          )}
        >
          <button
            type="button"
            onClick={() => onToggleImages(!withImages)}
            className="w-full flex items-center gap-3 text-left"
          >
            <div
              className={cn(
                "h-5 w-9 rounded-full transition-colors flex items-center px-0.5 shrink-0",
                withImages ? "bg-primary justify-end" : "bg-secondary justify-start",
              )}
            >
              <div className="h-4 w-4 rounded-full bg-white shadow-sm" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium inline-flex items-center gap-2">
                Incluir imagens educacionais
                <Badge
                  variant="secondary"
                  className="text-[10px] gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20"
                >
                  <Coins className="h-2.5 w-2.5" />+{imageDelta}
                </Badge>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {mode === "summary"
                  ? "3-4 ilustrações geradas por IA (Imagen 3)"
                  : "Imagens em alguns cards/questões-chave"}
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ----- Step 3: Confirm ------------------------------------------- */

function Step3Confirm({
  mode,
  cost,
  withImages,
  balance,
  balanceLoading,
  insufficient,
  transcriptCount,
  slidesCount,
  pdfCount,
}: {
  mode: AIMode;
  cost: number;
  withImages: boolean;
  balance: number | null;
  balanceLoading: boolean;
  insufficient: boolean;
  transcriptCount: number;
  slidesCount: number;
  pdfCount: number;
}) {
  const totalSources = transcriptCount + pdfCount;
  const eta =
    mode === "summary" ? "30s–2min" : mode === "mindmap" ? "20–40s" : "30–60s";

  return (
    <div className="p-6 space-y-5">
      <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-card to-fuchsia-500/5 p-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Você vai gerar
        </div>
        <div className="text-xl font-semibold leading-tight">
          1 {modeLabel(mode).toLowerCase()}{withImages ? " com imagens" : ""}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          usando {totalSources} fonte{totalSources === 1 ? "" : "s"} (
          {transcriptCount} transcrição{transcriptCount === 1 ? "" : "ões"}
          {slidesCount > 0 ? ` + ${slidesCount} aulas com slides` : ""}
          {pdfCount > 0 ? `, ${pdfCount} PDF${pdfCount === 1 ? "" : "s"}` : ""}
          )
        </div>

        <div className="mt-5 flex items-end gap-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Custo
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-semibold tabular-nums bg-gradient-to-br from-primary to-fuchsia-500 bg-clip-text text-transparent">
                {cost}
              </span>
              <span className="text-sm text-muted-foreground inline-flex items-center gap-1">
                <Coins className="h-3.5 w-3.5 text-amber-500" />
                coins
              </span>
            </div>
          </div>

          <div className="ml-auto text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Seu saldo
            </div>
            <div className="text-lg font-semibold tabular-nums font-mono">
              {balanceLoading || balance === null ? (
                <Loader2 className="h-4 w-4 animate-spin inline" />
              ) : (
                <span
                  className={cn(
                    insufficient ? "text-rose-500" : "text-foreground",
                  )}
                >
                  {balance}
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground">coins</div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border/40 text-[11px] text-muted-foreground flex items-center justify-between">
          <span>Tempo estimado:</span>
          <span className="font-mono">{eta}</span>
        </div>
      </div>

      {insufficient && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
          <div className="text-sm font-medium text-rose-700 dark:text-rose-300">
            Saldo insuficiente
          </div>
          <div className="text-xs text-rose-600/80 dark:text-rose-300/70 mt-1">
            Você precisa de mais {cost - (balance ?? 0)} coin
            {cost - (balance ?? 0) === 1 ? "" : "s"} pra completar essa geração.
          </div>
          <Button
            asChild
            variant="default"
            size="sm"
            className="mt-3 bg-rose-600 hover:bg-rose-700 text-white"
          >
            <a href="/account/coins">
              <Coins className="h-3.5 w-3.5" /> Comprar coins
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}

/* ----- Step 4: Result -------------------------------------------- */

function Step4Result({
  mode,
  generating,
  stage,
  result,
  saveTitle,
  onChangeTitle,
}: {
  mode: AIMode;
  generating: boolean;
  stage: string;
  result: GenerateResponse | null;
  saveTitle: string;
  onChangeTitle: (s: string) => void;
}) {
  if (generating) {
    return (
      <div className="p-10 flex flex-col items-center justify-center text-center">
        <div className="relative mb-5">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-fuchsia-500/20 flex items-center justify-center">
            <Sparkles className="h-7 w-7 text-primary animate-pulse" />
          </div>
          <div className="absolute inset-0 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
        <div className="text-base font-semibold mb-1">{stage}</div>
        <div className="text-xs text-muted-foreground max-w-xs">
          A IA está lendo suas fontes e organizando o conteúdo. Pode demorar até
          2 minutos.
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        Nenhum resultado ainda.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Título editável */}
      <div>
        <Label
          htmlFor="save-title"
          className="text-xs font-medium text-muted-foreground"
        >
          Título
        </Label>
        <Input
          id="save-title"
          value={saveTitle}
          onChange={(e) => onChangeTitle(e.target.value)}
          placeholder="Como salvar este material?"
          className="mt-1.5"
          maxLength={200}
        />
      </div>

      {/* Preview por tipo */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/40 bg-secondary/20 flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            Prévia
          </div>
          {result.imageUrls && result.imageUrls.length > 0 && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Sparkles className="h-2.5 w-2.5" />
              {result.imageUrls.length} imagem
              {result.imageUrls.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>

        <div className="max-h-[400px] overflow-y-auto p-4">
          {mode === "summary" && (
            <SummaryPreview
              markdown={
                (result.content as { markdown?: string })?.markdown ?? ""
              }
            />
          )}
          {mode === "flashcards" && (
            <FlashcardsPreview
              cards={
                (result.content as { cards?: Flashcard[] })?.cards ?? []
              }
            />
          )}
          {mode === "quiz" && (
            <QuizPreview
              questions={
                (result.content as { questions?: QuizQuestion[] })
                  ?.questions ?? []
              }
            />
          )}
          {mode === "mindmap" && (
            <MindmapPreview
              centralTopic={
                (result.content as { centralTopic?: string })?.centralTopic ??
                ""
              }
              branches={
                (result.content as { branches?: MindmapNode[] })?.branches ??
                []
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryPreview({ markdown }: { markdown: string }) {
  if (!markdown.trim()) {
    return (
      <p className="text-xs text-muted-foreground">Sem conteúdo gerado.</p>
    );
  }
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
}

function FlashcardsPreview({ cards }: { cards: Flashcard[] }) {
  if (cards.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem cards gerados.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        {cards.length} card{cards.length === 1 ? "" : "s"} gerado
        {cards.length === 1 ? "" : "s"}
      </div>
      {cards.slice(0, 5).map((c, i) => (
        <div
          key={i}
          className="rounded-lg border border-border/60 p-3 bg-secondary/10"
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 inline-flex items-center gap-1.5">
            Card {i + 1}
            {c.difficulty && (
              <Badge variant="outline" className="text-[9px] py-0">
                {c.difficulty === "easy"
                  ? "Fácil"
                  : c.difficulty === "hard"
                    ? "Difícil"
                    : "Médio"}
              </Badge>
            )}
          </div>
          <div className="text-sm font-medium">{c.question}</div>
          <div className="text-xs text-muted-foreground mt-1">{c.answer}</div>
        </div>
      ))}
      {cards.length > 5 && (
        <div className="text-[11px] text-center text-muted-foreground">
          + {cards.length - 5} cards adicionais
        </div>
      )}
    </div>
  );
}

function QuizPreview({ questions }: { questions: QuizQuestion[] }) {
  if (questions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Sem questões geradas.</p>
    );
  }
  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        {questions.length} questão{questions.length === 1 ? "" : "es"} gerada
        {questions.length === 1 ? "" : "s"}
      </div>
      {questions.slice(0, 3).map((q, i) => (
        <div
          key={i}
          className="rounded-lg border border-border/60 p-3 bg-secondary/10"
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Questão {i + 1}
          </div>
          <div className="text-sm font-medium mb-2">{q.question}</div>
          <ul className="space-y-1">
            {q.options.map((o, j) => (
              <li
                key={j}
                className={cn(
                  "text-xs px-2 py-1 rounded",
                  j === q.correctIndex
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium"
                    : "text-muted-foreground",
                )}
              >
                {String.fromCharCode(65 + j)}. {o}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {questions.length > 3 && (
        <div className="text-[11px] text-center text-muted-foreground">
          + {questions.length - 3} questões adicionais
        </div>
      )}
    </div>
  );
}

function MindmapPreview({
  centralTopic,
  branches,
}: {
  centralTopic: string;
  branches: MindmapNode[];
}) {
  if (!centralTopic && branches.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Sem mapa gerado.</p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-primary/10 px-3 py-2 inline-block">
        <div className="text-[10px] uppercase tracking-wider text-primary mb-0.5">
          Tema central
        </div>
        <div className="text-sm font-semibold">{centralTopic}</div>
      </div>
      <ul className="space-y-2 mt-2">
        {branches.map((b, i) => (
          <MindmapNodeView key={i} node={b} depth={0} />
        ))}
      </ul>
    </div>
  );
}

function MindmapNodeView({ node, depth }: { node: MindmapNode; depth: number }) {
  return (
    <li>
      <div
        className="text-sm flex items-start gap-2"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        <span className="text-primary mt-1.5">•</span>
        <div>
          <span className="font-medium">{node.label}</span>
          {node.detail && (
            <span className="text-muted-foreground text-xs ml-1.5">
              — {node.detail}
            </span>
          )}
        </div>
      </div>
      {node.children && node.children.length > 0 && (
        <ul className="mt-1">
          {node.children.map((c, i) => (
            <MindmapNodeView key={i} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers de pós-geração                                              */
/* ------------------------------------------------------------------ */

function suggestTitle(mode: AIMode, result: GenerateResponse): string {
  if (mode === "summary") {
    const md = (result.content as { markdown?: string })?.markdown ?? "";
    const m = md.match(/^#\s+(.+)$/m);
    if (m) return m[1].trim().slice(0, 200);
  } else {
    const t = (result.content as { title?: string })?.title;
    if (typeof t === "string" && t.trim()) return t.trim().slice(0, 200);
    if (mode === "mindmap") {
      const c = (result.content as { centralTopic?: string })?.centralTopic;
      if (c) return c.slice(0, 200);
    }
  }
  return `${modeLabel(mode)} ${new Date().toLocaleDateString("pt-BR")}`;
}

function extractHighlights(markdown: string, max: number): string[] {
  const out: string[] = [];
  // Pega bullets da última seção "Pontos-chave de revisão" ou similar
  const lines = markdown.split("\n");
  let inHighlights = false;
  for (const line of lines) {
    if (/^##\s+pontos[- ]chave/i.test(line.trim())) {
      inHighlights = true;
      continue;
    }
    if (inHighlights) {
      if (/^##\s/.test(line)) break;
      const m = line.match(/^\s*-\s+(.+)/);
      if (m) {
        out.push(m[1].replace(/\[\[([^\]]+)\]\]/g, "$1").slice(0, 120));
        if (out.length >= max) break;
      }
    }
  }
  // Fallback: pega [[termos]] do começo
  if (out.length === 0) {
    const re = /\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(markdown)) !== null) {
      out.push(m[1].trim().slice(0, 80));
      if (out.length >= max) break;
    }
  }
  return out;
}
