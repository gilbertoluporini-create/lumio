"use client";

/**
 * ContentWizard — wizard genérico de geração de conteúdo AI.
 *
 * 3 steps:
 *  1) Fontes (aulas, slides, PDFs uploadados, upload novo PDF) + descrição custom
 *  2) Opções específicas do mode (summary/flashcards/quiz/mindmap)
 *  3) Confirmação de custo + botão "Gerar agora" (fecha wizard, geração corre
 *     em background via toast persistente).
 *
 * Pricing real vem de src/lib/coins-pricing.ts.
 * Geração via POST /api/ai/generate (server consome coins).
 * Auto-save: handleGenerate cria lecture + popula direto, sem tela de preview.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Coins,
  FileText,
  FileUp,
  Folder,
  Loader2,
  Mic,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

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
import {
  createSummaryAsync,
  upsertSummaryByLectureAsync,
} from "@/lib/summaries";
import {
  createDocumentAsync,
  listDocumentsAsync,
  updateDocumentAsync,
} from "@/lib/documents";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Document, Lecture, Subject } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LIMITS, PDF_LIMIT_MB } from "@/lib/api-security";

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

type Step = 1 | 2 | 3;

type Depth = "concise" | "standard" | "detailed";
type Level = "beginner" | "intermediate" | "advanced";
type Difficulty = "easy" | "medium" | "hard";
type Complexity = "simple" | "medium" | "deep";

type UploadedPdf = {
  id: string;
  name: string;
  text: string;
  pages: number;
  /** File original — só na sessão; sobe pro Storage no submit do wizard */
  file: File;
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
  /**
   * Quando o wizard é aberto a partir de uma matéria específica
   * (ex: tela /subject/[id]), ancora a geração nessa matéria:
   *  - usa essa matéria como subjectId no save (sem cair em subjects[0])
   *  - pré-seleciona PDFs e aulas que pertencem a essa matéria
   */
  initialSubjectId?: string;
  /** Callback opcional após salvar com sucesso */
  onCreated?: (result: {
    lectureId?: string;
    summaryId?: string;
    documentId?: string;
    mode: AIMode;
  }) => void;
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
  initialSubjectId,
  onCreated,
}: ContentWizardProps) {
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingLectures, setLoadingLectures] = useState(false);
  const [selectedLectureIds, setSelectedLectureIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(
    new Set(),
  );
  const [includeSlides, setIncludeSlides] = useState(true);
  const [uploadedPdfs, setUploadedPdfs] = useState<UploadedPdf[]>([]);
  const [pdfProcessing, setPdfProcessing] = useState(false);
  const [userInstructions, setUserInstructions] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const repairFileRef = useRef<HTMLInputElement>(null);
  const [repairingDocId, setRepairingDocId] = useState<string | null>(null);

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

  // Geração (rodando em background, wizard fecha imediatamente — toast persiste)
  const [generating, setGenerating] = useState(false);

  /* --------------------------------------- carga inicial --------- */

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setLoadingLectures(true);
    Promise.all([
      listLecturesAsync(userId),
      listSubjectsAsync(userId),
      listDocumentsAsync(userId),
    ])
      .then(([l, s, d]) => {
        if (cancel) return;
        setLectures(l);
        setSubjects(s);
        setDocuments(d);
        // Pré-seleciona se vier initialSourceLectureId
        if (
          initialSourceLectureId &&
          l.some((x) => x.id === initialSourceLectureId)
        ) {
          setSelectedLectureIds(new Set([initialSourceLectureId]));
        }
        // Se o wizard foi aberto a partir de uma matéria, ancora pré-selecionando
        // todos os PDFs salvos dessa matéria + aulas com transcrição da mesma.
        if (initialSubjectId) {
          const docsOfSubject = d
            .filter(
              (x) =>
                x.subjectId === initialSubjectId &&
                (x.sourceText ?? "").trim().length > 0,
            )
            .map((x) => x.id);
          if (docsOfSubject.length > 0) {
            setSelectedDocumentIds(new Set(docsOfSubject));
          }
          // Só pré-seleciona aulas se não tiver vindo initialSourceLectureId
          if (!initialSourceLectureId) {
            const lecturesOfSubject = l
              .filter(
                (x) =>
                  x.subjectId === initialSubjectId &&
                  (x.transcript ?? "").trim().length > 0,
              )
              .map((x) => x.id);
            if (lecturesOfSubject.length > 0) {
              setSelectedLectureIds(new Set(lecturesOfSubject));
            }
          }
        }
      })
      .finally(() => {
        if (!cancel) setLoadingLectures(false);
      });
    return () => {
      cancel = true;
    };
  }, [open, userId, initialSourceLectureId, initialSubjectId]);

  // Reset quando fecha
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setStep(1);
      setSelectedLectureIds(new Set());
      setSelectedDocumentIds(new Set());
      setIncludeSlides(true);
      setUploadedPdfs([]);
      setUserInstructions("");
      setWithImages(false);
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

  // Total de fontes que vão pra geração — cada uma acima da 1ª adiciona coins.
  const totalSources =
    selectedLectureIds.size + selectedDocumentIds.size + uploadedPdfs.length;
  const cost = computeCost(mode, withImages, totalSources);
  const imagesAvailable = mode !== "mindmap";
  const insufficient = balance !== null && balance < cost;

  /* --------------------------------------- step nav -------------- */

  const canAdvanceStep1 =
    selectedLectureIds.size > 0 ||
    selectedDocumentIds.size > 0 ||
    uploadedPdfs.length > 0;

  const selectedDocuments = useMemo(
    () => documents.filter((d) => selectedDocumentIds.has(d.id)),
    [documents, selectedDocumentIds],
  );

  /* --------------------------------------- PDF upload ------------ */

  const handlePdfFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPdfProcessing(true);
    try {
      const { extractPdfText, PdfExtractException } = await import(
        "@/lib/pdf-extract"
      );
      const newOnes: UploadedPdf[] = [];
      for (const file of Array.from(files)) {
        if (file.size > LIMITS.PDF_BYTES) {
          toast.error(`"${file.name}" passa de ${PDF_LIMIT_MB} MB — pula.`);
          continue;
        }
        try {
          const { text, pages } = await extractPdfText(file);
          newOnes.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            text,
            pages,
            file,
          });
        } catch (err) {
          console.error("[wizard] pdf extract failed", file.name, err);
          const e = err as Error & { kind?: string };
          // Telemetria — só assim conseguimos debugar falhas que só
          // acontecem em iPad Safari / mobile (não inspecionáveis pra nós).
          void fetch("/api/telemetry/pdf-error", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              fileName: file.name,
              fileSize: file.size,
              errorKind: e.kind ?? "unknown",
              errorMessage: e.message ?? String(err),
              userAgent:
                typeof navigator !== "undefined" ? navigator.userAgent : "",
              context: "wizard.upload",
            }),
            keepalive: true,
          }).catch(() => {});
          if (err instanceof PdfExtractException) {
            toast.error(`"${file.name}": ${err.message}`);
          } else {
            toast.error(
              `Falha ao processar "${file.name}": ${(err as Error).message}`,
            );
          }
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

  /* --------------------------------------- repair doc sem texto -- */

  const handleRepairDocFiles = useCallback(
    async (files: FileList | null) => {
      const docId = repairingDocId;
      if (!docId || !files || files.length === 0) {
        setRepairingDocId(null);
        return;
      }
      const file = files[0];
      if (file.size > LIMITS.PDF_BYTES) {
        toast.error(`Arquivo passa de ${PDF_LIMIT_MB} MB.`);
        setRepairingDocId(null);
        return;
      }
      const t = toast.loading(`Extraindo texto de "${file.name}"...`);
      try {
        const { extractPdfText } = await import("@/lib/pdf-extract");
        const { text, pages } = await extractPdfText(file);
        await updateDocumentAsync(userId, docId, {
          sourceText: text,
          pageCount: pages,
        });
        // Captura subjectId pra passar pra indexação
        const docForIndex = documents.find((d) => d.id === docId);
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === docId ? { ...d, sourceText: text, pageCount: pages } : d,
          ),
        );
        setSelectedDocumentIds((prev) => {
          const next = new Set(prev);
          next.add(docId);
          return next;
        });
        toast.success("Texto extraído. Documento pronto pra usar.", { id: t });

        // Auto-indexa o PDF reparado
        const { indexContentInBackground } = await import(
          "@/lib/embeddings-client"
        );
        void indexContentInBackground({
          sourceKind: "document",
          sourceId: docId,
          subjectId: docForIndex?.subjectId,
          text,
          metadata: {
            page_count: pages,
            title: docForIndex?.title,
          },
        });
      } catch (err) {
        console.error("[wizard] repair pdf extract failed", err);
        toast.error(`Falha ao processar PDF: ${(err as Error).message}`, {
          id: t,
        });
      } finally {
        setRepairingDocId(null);
        if (repairFileRef.current) repairFileRef.current.value = "";
      }
    },
    [repairingDocId, userId],
  );

  const triggerRepair = useCallback((docId: string) => {
    setRepairingDocId(docId);
    // Pequeno defer pra garantir que o input já reflita o estado novo
    setTimeout(() => {
      const input = repairFileRef.current;
      if (!input) return;
      // Detecta cancelamento do file picker pra destravar o botão "Extraindo...".
      // O onChange só dispara se o user escolhe arquivo; cancel não emite change.
      // Evento "cancel" é nativo do DOM (HTML spec) — não tem no type React.
      const onCancel = () => setRepairingDocId(null);
      input.addEventListener("cancel", onCancel, { once: true });
      input.click();
    }, 0);
  }, []);

  /* --------------------------------------- generate -------------- */

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    // Fecha o wizard imediatamente — não precisa mais ficar travando o user
    // numa tela de preview. O resultado vai pro /resumo/[id] direto.
    onOpenChange(false);

    // Wrapper pra etapas async pós-API: Storage uploads do Supabase em
    // navegadores móveis com rede ruim conseguem PENDURAR sem rejeitar
    // (sem timeout do SDK). Sem isso, o toast de progresso trava em 95%
    // e o user não recebe nem sucesso nem erro. Devolve null em vez de
    // lançar pra deixar o caller decidir.
    const withTimeout = async <T,>(
      promise: Promise<T>,
      ms: number,
      label: string,
    ): Promise<T | null> => {
      let to: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          promise,
          new Promise<T>((_, rej) => {
            to = setTimeout(
              () => rej(new Error(`timeout: ${label} >${ms}ms`)),
              ms,
            );
          }),
        ]);
      } catch (err) {
        console.warn(`[wizard] ${label} failed/timeout`, err);
        return null;
      } finally {
        if (to) clearTimeout(to);
      }
    };

    // -----------------------------------------------------------------
    // Toast com barra de progresso 0–100. Sonner aceita JSX como label,
    // então atualizamos o mesmo toast a cada ~400ms enquanto o fetch roda.
    // A barra cresce baseada em uma estimativa de tempo por modo, satura
    // em 95% (não chega a 100% até a resposta voltar) e fecha em 100%
    // quando termina. Substitui o antigo spinner + setGenStage().
    // -----------------------------------------------------------------
    const estMs =
      mode === "summary"
        ? withImages && imagesAvailable
          ? 90_000
          : 45_000
        : // flashcards/quiz/mapa rodam no Haiku agora (~3-4x mais rápido)
          mode === "mindmap"
          ? 12_000
          : 18_000;
    const startTs = Date.now();
    let currentPct = 0;
    let currentStage = "Lendo fontes...";

    // unstyled:true desliga TODO o styling padrão do Sonner pra esse toast e
    // a gente desenha o card inteiro. Sem isso, o toast global tem padding
    // assimétrico (reservado pro closeButton) que faz a barra ficar deslocada
    // mesmo desabilitando closeButton localmente.
    const renderProgress = (pct: number, stage: string) => (
      <div className="flex flex-col gap-2 w-[300px] rounded-xl bg-zinc-900 text-zinc-100 shadow-lg ring-1 ring-white/10 px-4 py-3.5">
        <div className="text-sm font-medium leading-tight">
          Gerando {modeLabel(mode).toLowerCase()}
        </div>
        <div className="flex items-center justify-between text-[11px] text-zinc-400">
          <span>{stage}</span>
          <span className="font-mono tabular-nums">{Math.round(pct)}%</span>
        </div>
        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-[10px] text-amber-400/80 leading-tight pt-0.5">
          Mantenha esta aba aberta até concluir.
        </div>
      </div>
    );

    // closeButton:false + unstyled:true → controle total. A safety timer
    // abaixo garante que o toast nunca trava (sai mesmo se uma etapa async
    // pós-API pendurar silenciosamente).
    toast.custom(() => renderProgress(0, currentStage), {
      id: "wizard-generation",
      duration: Infinity,
    });

    const progressTimer = setInterval(() => {
      const elapsed = Date.now() - startTs;
      // Aproximação assintótica de 99%: sobe rápido no começo e desacelera
      // perto do fim, mas NUNCA congela. Atinge ~90% em estMs e segue
      // rastejando enquanto a API + os saves pós-resposta terminam — assim
      // não fica aquela sensação de "travado em 95%".
      currentPct = Math.min(99, 99 * (1 - Math.exp(-elapsed / (estMs / 2.4))));
      if (currentPct > 90) currentStage = "Finalizando...";
      else if (currentPct > 45)
        currentStage =
          withImages && imagesAvailable
            ? "Gerando imagens..."
            : "Estruturando...";
      else if (currentPct > 15) currentStage = "Pensando...";
      toast.custom(() => renderProgress(currentPct, currentStage), {
        id: "wizard-generation",
        duration: Infinity,
      });
    }, 400);

    // Safety net mais agressivo: 3min absolutos (era 4x estMs = até 6min).
    // Se passar disso sem terminar, fecha o toast e mostra erro — evita que
    // o user fique olhando uma barra travada em 95% por minutos.
    const safetyTimer = setTimeout(() => {
      clearInterval(progressTimer);
      toast.dismiss("wizard-generation");
      toast.error(
        "A geração demorou demais. Se o resultado não apareceu, tenta de novo — os coins são reembolsados em falha.",
      );
    }, 180_000);

    // beforeunload: alerta nativo se o user tentar fechar/recarregar a aba
    // durante a geração. Não cobre navegação interna do Next (Link/router),
    // mas pelo menos pega close/reload/external nav. O Chrome ignora a
    // string e mostra mensagem genérica — só o returnValue não-vazio importa.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Geração em andamento. Sair pode cancelar.";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    const finishProgress = (label: string) => {
      clearInterval(progressTimer);
      clearTimeout(safetyTimer);
      window.removeEventListener("beforeunload", onBeforeUnload);
      toast.custom(() => renderProgress(100, label), {
        id: "wizard-generation",
        duration: 600,
      });
      // Save completou → limpa pending pra o guard não oferecer recovery
      // de algo que já foi salvo.
      void import("@/lib/pending-generation").then((m) =>
        m.clearPendingGeneration(),
      );
    };

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
    const pdfTexts = [
      ...uploadedPdfs.map((p) => p.text),
      ...selectedDocuments
        .map((d) => d.sourceText ?? "")
        .filter((t) => t.length > 0),
    ];

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

    const cancelProgress = () => {
      clearInterval(progressTimer);
      clearTimeout(safetyTimer);
      window.removeEventListener("beforeunload", onBeforeUnload);
      toast.dismiss("wizard-generation");
    };

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
        cancelProgress();
        toast.error(json.error ?? "Falha na geração.");
        return;
      }

      // Auto-save: pula a tela de preview e leva direto pro /resumo[id]
      // Prioridade pra resolver a matéria:
      //  1) initialSubjectId (wizard aberto a partir de /subject/[id])
      //  2) subjectId da primeira aula selecionada
      //  3) subjectId do primeiro doc selecionado
      //  4) primeira matéria do user (fallback frágil)
      const firstLecture = selectedLectures[0];
      const firstDoc = selectedDocuments[0];
      const subjectId =
        initialSubjectId ??
        firstLecture?.subjectId ??
        firstDoc?.subjectId ??
        subjects[0]?.id ??
        "";
      if (!subjectId) {
        cancelProgress();
        toast.error("Crie ao menos uma matéria antes — vá no dashboard.");
        return;
      }
      const title = suggestTitle(mode, json).slice(0, 200);

      // Salva resultado em localStorage ANTES de tentar persistir no banco.
      // Se o save falhar (navegação, Supabase pendurar, crash), o
      // PendingGenerationGuard vai detectar no próximo mount e oferecer
      // "Salvar agora" — evita perder coins gastos sem asset criado.
      try {
        const { markPendingGeneration } = await import(
          "@/lib/pending-generation"
        );
        const firstLec = selectedLectures[0];
        const firstUploadedPdf = uploadedPdfs[0];
        const documentText = pdfTexts.join("\n\n---\n\n");
        const sourceForPending =
          mode === "summary"
            ? firstLec
              ? ({ kind: "lecture", lectureId: firstLec.id } as const)
              : firstUploadedPdf
                ? ({
                    kind: "document",
                    documentText,
                    documentTitle: firstUploadedPdf.name.replace(/\.pdf$/i, ""),
                    pageCount: uploadedPdfs.reduce(
                      (acc, p) => acc + (p.pages ?? 0),
                      0,
                    ),
                  } as const)
                : undefined
            : undefined;
        markPendingGeneration({
          mode,
          subjectId,
          userId,
          title,
          lectureId: firstLec?.id ?? null,
          source: sourceForPending,
          content: json.content,
          imageUrls: Array.isArray(json.imageUrls)
            ? (json.imageUrls.filter(
                (u): u is string => typeof u === "string",
              ) as string[])
            : [],
          coinsCharged: json.coinsCharged,
        });
      } catch {
        /* localStorage cheio/desabilitado — segue sem persistência */
      }

      if (mode === "summary") {
        const md = (json.content as { markdown?: string })?.markdown ?? "";
        const summaryContent = {
          generatedAt: new Date().toISOString(),
          generalSummary: md,
          highlights: extractHighlights(md, 6),
          sections: [],
        };
        // Origem: tem aula gravada selecionada → resumo linkado à aula.
        // Senão (só PDF/instruções): cria Document + Summary direto.
        if (selectedLectures.length > 0) {
          const baseLecture = selectedLectures[0];
          const sm = await upsertSummaryByLectureAsync({
            userId,
            subjectId,
            lectureId: baseLecture.id,
            title,
            content: summaryContent,
          }).catch((err) => {
            console.error("[wizard] summaries write failed", err);
            return null;
          });
          finishProgress("Pronto!");
          toast.success("Resumo pronto!");
          onCreated?.({
            lectureId: baseLecture.id,
            summaryId: sm?.id,
            mode,
          });
          void fetch("/api/ai/summary-images", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ lectureId: baseLecture.id, count: 3 }),
            keepalive: true,
          }).catch(() => {});
        } else {
          // PDF/texto puro — cria Document + Summary, sem Lecture
          const pageCount = uploadedPdfs.reduce(
            (acc, p) => acc + (p.pages ?? 0),
            0,
          );
          const docTitle =
            uploadedPdfs.length === 1
              ? uploadedPdfs[0].name.replace(/\.pdf$/i, "")
              : title;
          const doc = await createDocumentAsync({
            userId,
            subjectId,
            title: docTitle,
            sourceKind: "pdf",
            sourceText: pdfTexts.join("\n\n---\n\n"),
            pageCount: pageCount > 0 ? pageCount : undefined,
          });
          if (!doc) {
            cancelProgress();
            toast.error("Falha ao salvar documento.");
            return;
          }

          // Sobe PDF(s) binários pro Storage e atualiza source_url.
          // Quando >1 PDF foi anexado, salva o primeiro como representativo
          // (compatível com schema atual de 1 source_url por documento).
          if (uploadedPdfs.length > 0) {
            try {
              const supabase = (
                await import("@/lib/supabase/client")
              ).createClient();
              const first = uploadedPdfs[0];
              const storageKey = `${userId}/${doc.id}.pdf`;
              const { error: upErr } = await supabase.storage
                .from("user-documents")
                .upload(storageKey, first.file, {
                  contentType: "application/pdf",
                  upsert: true,
                });
              if (!upErr) {
                const { data: pub } = supabase.storage
                  .from("user-documents")
                  .getPublicUrl(storageKey);
                if (pub?.publicUrl) {
                  await supabase
                    .from("documents")
                    .update({ source_url: pub.publicUrl })
                    .eq("id", doc.id);
                }
              }
            } catch (err) {
              console.warn("[wizard] pdf storage upload failed", err);
            }
          }

          // Auto-indexa o PDF cru pra Lumi conseguir buscar trechos depois (RAG)
          const { indexContentInBackground } = await import(
            "@/lib/embeddings-client"
          );
          void indexContentInBackground({
            sourceKind: "document",
            sourceId: doc.id,
            subjectId,
            text: pdfTexts.join("\n\n---\n\n"),
            metadata: { title: docTitle, page_count: pageCount },
          });

          const sm = await createSummaryAsync({
            userId,
            subjectId,
            source: { kind: "document", documentId: doc.id },
            title,
            content: summaryContent,
          });
          finishProgress("Pronto!");
          toast.success("Resumo pronto!");
          onCreated?.({
            documentId: doc.id,
            summaryId: sm?.id,
            mode,
          });
        }
      } else {
        // Quando o user gera flashcards/quiz/mindmap só com PDFs (sem aula
        // gravada selecionada), os PDFs precisam virar Documents da matéria.
        // Senão somem da pasta — viram apenas ingredientes da geração e o
        // user não vê de onde o asset veio nem consegue reusar o PDF.
        if (selectedLectures.length === 0 && uploadedPdfs.length > 0) {
          try {
            const supabase = (
              await import("@/lib/supabase/client")
            ).createClient();
            const { indexContentInBackground } = await import(
              "@/lib/embeddings-client"
            );
            for (const p of uploadedPdfs) {
              try {
                const docTitle = p.name.replace(/\.pdf$/i, "");
                const docCreated = await withTimeout(
                  createDocumentAsync({
                    userId,
                    subjectId,
                    title: docTitle,
                    sourceKind: "pdf",
                    sourceText: p.text,
                    pageCount: p.pages,
                  }),
                  20_000,
                  `createDocument:${docTitle}`,
                );
                if (!docCreated) continue;
                // Sobe o PDF binário pro Storage pra visualização inline.
                // Timeout 30s — em redes ruins o SDK pendura sem rejeitar.
                const storageKey = `${userId}/${docCreated.id}.pdf`;
                const upRes = await withTimeout<{
                  error: { message: string } | null;
                }>(
                  supabase.storage.from("user-documents").upload(storageKey, p.file, {
                    contentType: "application/pdf",
                    upsert: true,
                  }) as unknown as Promise<{ error: { message: string } | null }>,
                  30_000,
                  `storage.upload:${p.name}`,
                );
                if (upRes && !upRes.error) {
                  const { data: pub } = supabase.storage
                    .from("user-documents")
                    .getPublicUrl(storageKey);
                  if (pub?.publicUrl) {
                    await withTimeout(
                      supabase
                        .from("documents")
                        .update({ source_url: pub.publicUrl })
                        .eq("id", docCreated.id),
                      10_000,
                      `documents.update:${docCreated.id}`,
                    );
                  }
                }
                void indexContentInBackground({
                  sourceKind: "document",
                  sourceId: docCreated.id,
                  subjectId,
                  text: p.text,
                  metadata: { title: docTitle, page_count: p.pages },
                });
              } catch (err) {
                console.warn(
                  "[wizard] failed to save uploaded pdf as document",
                  p.name,
                  err,
                );
              }
            }
          } catch (err) {
            console.warn("[wizard] document persistence batch failed", err);
          }
        }

        const lecture = await withTimeout(
          createLectureAsync(userId, { subjectId, title }),
          15_000,
          "createLecture",
        );
        if (!lecture) {
          cancelProgress();
          toast.error(
            "Não consegui salvar o resultado. Verifica sua conexão e tenta de novo.",
          );
          return;
        }
        if (isSupabaseConfigured()) {
          const supabase = createClient();
          const kind = mode;
          let payload: Record<string, unknown> = {};
          // Imagens geradas pelo backend quando withImages=true. Antes só o
          // mindmap salvava — pra flashcards/quiz as URLs eram descartadas, e o
          // toggle "Incluir imagens educacionais" virava no-op (user pagava
          // pelas imagens mas nunca via). Agora salvamos no payload pra
          // /deck e /quiz-banco poderem renderizar.
          const imageUrls =
            Array.isArray(json.imageUrls) && json.imageUrls.length > 0
              ? json.imageUrls.filter(
                  (u): u is string => typeof u === "string" && u.length > 0,
                )
              : [];

          if (mode === "flashcards") {
            const cards = ((json.content as { cards?: unknown[] }).cards ??
              []) as Flashcard[];
            payload = {
              generatedAt: new Date().toISOString(),
              cards,
              ...(imageUrls.length > 0 ? { imageUrls } : {}),
            };
          } else if (mode === "quiz") {
            const questions = ((json.content as { questions?: unknown[] })
              .questions ?? []) as QuizQuestion[];
            payload = {
              generatedAt: new Date().toISOString(),
              questions,
              ...(imageUrls.length > 0 ? { imageUrls } : {}),
            };
          } else if (mode === "mindmap") {
            const c = json.content as {
              centralTopic?: string;
              branches?: MindmapNode[];
            };
            // Mindmap: backend retorna 1 imagem ilustrativa do tópico central
            // em json.imageUrls. Salvamos no payload pra renderizar no /mapa.
            const heroImage =
              Array.isArray(json.imageUrls) && json.imageUrls.length > 0
                ? json.imageUrls[0]
                : undefined;
            payload = {
              generatedAt: new Date().toISOString(),
              centralTopic: c.centralTopic ?? title,
              branches: c.branches ?? [],
              ...(heroImage ? { heroImageUrl: heroImage } : {}),
            };
          }
          // Insert lecture_asset com timeout — se o Supabase pendurar,
          // o user ainda recebe feedback em vez de travar em 95%.
          await withTimeout(
            supabase.from("lecture_assets").insert({
              lecture_id: lecture.id,
              user_id: userId,
              kind,
              payload,
              coins_spent: json.coinsCharged,
            }),
            15_000,
            "lecture_assets.insert",
          );
        }
        finishProgress("Pronto!");
        toast.success(`${modeLabel(mode)} pronto!`);
        onCreated?.({ lectureId: lecture.id, mode });
      }
    } catch (err) {
      cancelProgress();
      const e = err as Error & { upgrade?: string; usage?: unknown };
      // Limite mensal atingido → paywall + persiste o resultado pra retomar
      // o save após upgrade. Não perde o trabalho gerado.
      if (e.upgrade) {
        try {
          // Acessível apenas no client; guarda o resultado da geração + título
          // sugerido + mode pra retomar do Dashboard depois do upgrade.
          sessionStorage.setItem(
            "lumio.pending_summary",
            JSON.stringify({
              mode,
              title: suggestTitle(mode, {
                content: (await (async () => undefined)()) ?? {},
                coinsCharged: 0,
                mode,
              } as unknown as GenerateResponse),
              savedAt: new Date().toISOString(),
            }),
          );
        } catch {
          /* sessionStorage cheio ou desabilitado — segue */
        }
        toast.error(e.message, {
          duration: 15000,
          action: {
            label: "Atualizar plano",
            onClick: () => {
              window.location.href = e.upgrade ?? "/pricing";
            },
          },
        });
      } else {
        toast.error(`Erro: ${e.message}`);
      }
    } finally {
      // Defensivo: garante que ambos os timers param + listener removido
      // mesmo em caminhos inesperados (early return, throw silencioso etc).
      clearInterval(progressTimer);
      clearTimeout(safetyTimer);
      window.removeEventListener("beforeunload", onBeforeUnload);
      setGenerating(false);
    }
  }, [
    mode,
    selectedLectures,
    selectedDocuments,
    subjects,
    userId,
    initialSubjectId,
    onCreated,
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
              documents={documents}
              selectedDocumentIds={selectedDocumentIds}
              onToggleDocument={(id) => {
                setSelectedDocumentIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              }}
              onRepairDocument={triggerRepair}
              repairingDocId={repairingDocId}
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

        </div>

        {/* Footer com nav */}
        <div className="border-t border-border/50 px-6 py-3 flex items-center justify-between gap-3 shrink-0 bg-card/50">
          <div className="text-[11px] text-muted-foreground">
            <span>
              Etapa <span className="font-semibold">{step}</span> de 3
            </span>
          </div>

          <div className="flex items-center gap-2">
            {step > 1 && (
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
                disabled={insufficient || balance === null || generating}
              >
                <Sparkles className="h-4 w-4" /> Gerar agora
              </Button>
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
        <input
          ref={repairFileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => void handleRepairDocFiles(e.target.files)}
        />
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StepBadge({ step }: { step: Step }) {
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
  documents,
  selectedDocumentIds,
  onToggleDocument,
  onRepairDocument,
  repairingDocId,
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
  documents: Document[];
  selectedDocumentIds: Set<string>;
  onToggleDocument: (id: string) => void;
  onRepairDocument: (docId: string) => void;
  repairingDocId: string | null;
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

      {/* PDF da pasta Documentos — documents salvos + lectures com slides */}
      <SavedPdfsSection
        lectures={lectures}
        subjects={subjects}
        loading={loading}
        selectedLectureIds={selectedIds}
        onToggleLecture={onToggleLecture}
        documents={documents}
        selectedDocumentIds={selectedDocumentIds}
        onToggleDocument={onToggleDocument}
        onRepairDocument={onRepairDocument}
        repairingDocId={repairingDocId}
      />


      {/* Upload PDF */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center shrink-0">
            <FileUp className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium inline-flex items-center gap-2">
              Upload de PDFs
              <Badge
                variant="outline"
                className="text-[9px] py-0 px-1.5 h-4 font-mono"
              >
                vários ok
              </Badge>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Pode selecionar vários de uma vez · cada PDF extra adiciona{" "}
              {COIN_COSTS.perExtraSource} coins.
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

function SavedPdfsSection({
  lectures,
  subjects,
  loading,
  selectedLectureIds,
  onToggleLecture,
  documents,
  selectedDocumentIds,
  onToggleDocument,
  onRepairDocument,
  repairingDocId,
}: {
  lectures: Lecture[];
  subjects: Map<string, Subject>;
  loading: boolean;
  selectedLectureIds: Set<string>;
  onToggleLecture: (id: string) => void;
  documents: Document[];
  selectedDocumentIds: Set<string>;
  onToggleDocument: (id: string) => void;
  onRepairDocument: (docId: string) => void;
  repairingDocId: string | null;
}) {
  const [open, setOpen] = useState(true);
  const withSlides = useMemo(
    () =>
      lectures
        .filter((l) => Array.isArray(l.slides) && l.slides.length > 0)
        .sort(
          (a, b) =>
            new Date(b.slidesAddedAt ?? b.updatedAt ?? b.createdAt).getTime() -
            new Date(a.slidesAddedAt ?? a.updatedAt ?? a.createdAt).getTime(),
        ),
    [lectures],
  );
  const sortedDocuments = useMemo(
    () =>
      documents
        .slice()
        .sort(
          (a, b) =>
            new Date(b.updatedAt ?? b.createdAt).getTime() -
            new Date(a.updatedAt ?? a.createdAt).getTime(),
        ),
    [documents],
  );
  const totalItems = withSlides.length + sortedDocuments.length;
  const selectedCount =
    withSlides.filter((l) => selectedLectureIds.has(l.id)).length +
    sortedDocuments.filter((d) => selectedDocumentIds.has(d.id)).length;

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 text-left"
      >
        <div className="h-9 w-9 rounded-lg bg-secondary/40 flex items-center justify-center shrink-0">
          <Folder className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">PDF da pasta Documentos</div>
          <div className="text-[11px] text-muted-foreground">
            {selectedCount === 0
              ? `${totalItems} PDF${totalItems === 1 ? "" : "s"} salvo${totalItems === 1 ? "" : "s"} na sua biblioteca`
              : `${selectedCount} selecionado${selectedCount === 1 ? "" : "s"}`}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform shrink-0",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="border-t border-border/40 max-h-[260px] overflow-y-auto">
          {loading ? (
            <div className="px-4 py-6 flex items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando...
            </div>
          ) : totalItems === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              Nenhum PDF salvo ainda. Faça upload abaixo e ele aparece aqui pra
              reaproveitar nas próximas gerações.
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {sortedDocuments.map((d) => {
                const subj = d.subjectId ? subjects.get(d.subjectId) : undefined;
                const sel = selectedDocumentIds.has(d.id);
                const hasText = (d.sourceText ?? "").trim().length > 0;
                const isRepairing = repairingDocId === d.id;
                if (!hasText) {
                  return (
                    <li
                      key={`doc:${d.id}`}
                      className="px-4 py-2.5 flex items-center gap-3"
                    >
                      <div className="h-4 w-4 rounded border border-amber-500/40 bg-amber-500/10 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {d.title}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate inline-flex items-center gap-1.5">
                          <span>{subj?.name ?? "Sem matéria"}</span>
                          <Badge
                            variant="outline"
                            className="text-[9px] py-0 px-1 h-3.5 font-mono border-amber-500/40 text-amber-600 dark:text-amber-400"
                          >
                            sem texto
                          </Badge>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 h-7 px-2 text-[11px]"
                        onClick={() => onRepairDocument(d.id)}
                        disabled={isRepairing}
                      >
                        {isRepairing ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Upload className="h-3 w-3" />
                        )}
                        {isRepairing ? "Extraindo..." : "Anexar PDF"}
                      </Button>
                    </li>
                  );
                }
                return (
                  <li key={`doc:${d.id}`}>
                    <button
                      type="button"
                      onClick={() => onToggleDocument(d.id)}
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
                          {d.title}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate inline-flex items-center gap-1.5">
                          <span>{subj?.name ?? "Sem matéria"}</span>
                          <Badge
                            variant="outline"
                            className="text-[9px] py-0 px-1 h-3.5 font-mono"
                          >
                            {d.pageCount
                              ? `${d.pageCount} ${d.pageCount === 1 ? "página" : "páginas"}`
                              : "PDF"}
                          </Badge>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
              {withSlides.map((l) => {
                const subj = subjects.get(l.subjectId);
                const sel = selectedLectureIds.has(l.id);
                const slideCount = l.slides?.length ?? 0;
                const fileLabel = l.slidesFileName || `Slides — ${l.title}`;
                return (
                  <li key={`lec:${l.id}`}>
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
                          {fileLabel}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate inline-flex items-center gap-1.5">
                          <span>{subj?.name ?? "Sem matéria"}</span>
                          <Badge
                            variant="outline"
                            className="text-[9px] py-0 px-1 h-3.5 font-mono"
                          >
                            {slideCount} {slideCount === 1 ? "página" : "páginas"}
                          </Badge>
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
