"use client";

/**
 * Wizard de criação de Plano de Estudos.
 *
 * 4 passos:
 *  1. Identidade — matéria + título + data da prova (opcional)
 *  2. Assets — checkboxes (Resumo, Flashcards, Quiz, Mapa)
 *  3. Fontes — escolhe PDFs (documents) + aulas gravadas (lectures) existentes
 *          ou sobe PDFs novos (vão pra /documentos da matéria automaticamente)
 *  4. Confirmar — mostra estimativa de coins + total de itens
 *
 * Submit chama POST /api/study-plans/create — items ficam pending, cron
 * worker gera em background. Redireciona pra /planos/[id].
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  FileText,
  Layers,
  Loader2,
  ListChecks,
  Map,
  Sparkles,
  Target,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
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
import { cn } from "@/lib/utils";
import { listSubjectsAsync, listLecturesAsync } from "@/lib/db";
import { createDocumentAsync, listDocumentsAsync } from "@/lib/documents";
import { LIMITS, PDF_LIMIT_MB } from "@/lib/api-security";
import { suggestTitleFromFileName } from "@/lib/document-title";
import type {
  Document,
  Lecture,
  Subject,
} from "@/lib/types";
import type { StudyPlanItemKind } from "@/lib/study-plans";

type Props = {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (planId: string) => void;
  /** Pré-seleciona matéria se vier de uma tela contextual (/subject/[id]). */
  defaultSubjectId?: string;
};

type StepId = "identity" | "assets" | "sources" | "confirm";
const STEPS: StepId[] = ["identity", "assets", "sources", "confirm"];

type AssetOption = {
  kind: StudyPlanItemKind;
  label: string;
  cost: number;
  Icon: typeof FileText;
};

const ASSET_OPTIONS: AssetOption[] = [
  { kind: "summary", label: "Resumo educativo", cost: 10, Icon: FileText },
  { kind: "flashcards", label: "Flashcards", cost: 8, Icon: Layers },
  { kind: "quiz", label: "Quiz", cost: 8, Icon: ListChecks },
  { kind: "mindmap", label: "Mapa mental", cost: 6, Icon: Map },
];

type EstimateResponse = {
  total: number;
  itemsTotal: number;
  breakdown: Array<{
    kind: StudyPlanItemKind;
    count: number;
    subtotal: number;
    avgPerItem: number;
  }>;
  perSource: Array<{
    id: string;
    title: string;
    kind: "document" | "lecture";
    chars: number;
    summaryCoins: number;
  }>;
};

/**
 * Upload binário via XMLHttpRequest pro endpoint /storage/v1/object/* do
 * Supabase — único caminho atual pra ter `progress` event real (o método
 * .upload() do supabase-js não expõe isso).
 *
 * Usa header `x-upsert: true` pra equivaler ao `upsert: true` do client.
 * Auth: Bearer com access_token do user (não anon).
 */
function uploadWithProgress(opts: {
  url: string;
  file: File;
  accessToken: string;
  onProgress: (pct: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", opts.url);
    xhr.setRequestHeader("Authorization", `Bearer ${opts.accessToken}`);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.setRequestHeader(
      "Content-Type",
      opts.file.type || "application/pdf",
    );
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        opts.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress(100);
        resolve();
      } else {
        reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText.slice(0, 200)}`));
      }
    });
    xhr.addEventListener("error", () =>
      reject(new Error("Erro de rede no upload.")),
    );
    xhr.addEventListener("abort", () =>
      reject(new Error("Upload cancelado.")),
    );
    xhr.send(opts.file);
  });
}

export function CreatePlanDialog({
  userId,
  open,
  onOpenChange,
  onCreated,
  defaultSubjectId,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<StepId>("identity");

  // Step 1 — identity
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<string>(defaultSubjectId ?? "");
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState("");

  // Step 2 — assets
  const [assetKinds, setAssetKinds] = useState<StudyPlanItemKind[]>([
    "summary",
    "flashcards",
    "quiz",
  ]);

  // Step 3 — sources
  const [documents, setDocuments] = useState<Document[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [pickedDocs, setPickedDocs] = useState<Set<string>>(new Set());
  const [pickedLectures, setPickedLectures] = useState<Set<string>>(new Set());
  const [loadingSources, setLoadingSources] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<
    "extracting" | "uploading" | "saving" | null
  >(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Step 4 — estimate / submit
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /* --------- Fetch listas quando abre --------- */
  useEffect(() => {
    if (!open) return;
    void (async () => {
      const list = await listSubjectsAsync(userId);
      setSubjects(list);
      if (list[0] && !subjectId) {
        setSubjectId(list[0].id);
        if (!title) setTitle(`Prova de ${list[0].name}`);
      }
    })();
  }, [open, userId, subjectId, title]);

  // Refresh sources quando muda matéria (filtra pela matéria escolhida)
  useEffect(() => {
    if (!open || !subjectId) return;
    setLoadingSources(true);
    void (async () => {
      try {
        const [docs, lecs] = await Promise.all([
          listDocumentsAsync(userId, subjectId),
          listLecturesAsync(userId, subjectId),
        ]);
        setDocuments(docs);
        setLectures(lecs);
      } finally {
        setLoadingSources(false);
      }
    })();
  }, [open, userId, subjectId]);

  // Reset ao fechar
  useEffect(() => {
    if (open) return;
    setStep("identity");
    setTitle("");
    setExamDate("");
    setAssetKinds(["summary", "flashcards", "quiz"]);
    setPickedDocs(new Set());
    setPickedLectures(new Set());
    setEstimate(null);
  }, [open]);

  function handleSubjectChange(id: string) {
    setSubjectId(id);
    const subj = subjects.find((s) => s.id === id);
    if (subj && (!title || title.startsWith("Prova de "))) {
      setTitle(`Prova de ${subj.name}`);
    }
  }

  function toggleAsset(kind: StudyPlanItemKind) {
    setAssetKinds((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind],
    );
  }

  function toggleDoc(id: string) {
    setPickedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleLecture(id: string) {
    setPickedLectures((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * Sobe um PDF novo direto pela tab "Subir novo": cria row em `documents`
   * com subject_id da matéria escolhida (aparece em /documentos na pasta certa),
   * faz upload binário no Storage, marca como selecionado pro plano e volta
   * pra tab "Meus PDFs" pro usuário ver o estado.
   */
  async function handleUploadNewPdf(file: File) {
    if (!subjectId) {
      toast.error("Escolhe a matéria primeiro (passo 1).");
      return;
    }
    if (file.size > LIMITS.PDF_BYTES) {
      toast.error(`"${file.name}" passa de ${PDF_LIMIT_MB} MB.`);
      return;
    }
    const isPdf =
      file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      toast.error("Só PDFs aqui. Áudio externo: use 'Nova aula'.");
      return;
    }

    setUploadingPdf(true);
    setUploadPhase("extracting");
    setUploadProgress(0);
    try {
      // 1) Extrai texto pra IA usar como contexto (fase 1).
      const { extractPdfText } = await import("@/lib/pdf-extract");
      let sourceText = "";
      let pageCount: number | undefined;
      try {
        const { text, pages } = await extractPdfText(file);
        sourceText = text ?? "";
        pageCount = pages;
      } catch (err) {
        console.warn("[plan-wizard] pdf text extract failed", err);
      }

      // 2) Cria document row com subject_id da matéria do plano.
      const doc = await createDocumentAsync({
        userId,
        subjectId,
        folderId: null,
        title: suggestTitleFromFileName(file.name),
        sourceKind: "pdf",
        sourceText: sourceText || undefined,
        pageCount,
      });
      if (!doc) {
        toast.error("Falha ao criar documento.");
        return;
      }

      // 3) Storage upload via XHR com progresso real (fase 2 — visível).
      setUploadPhase("uploading");
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const storageKey = `${userId}/${doc.id}.pdf`;

        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        if (!accessToken) throw new Error("Sem sessão ativa.");

        const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!base) throw new Error("SUPABASE URL ausente.");

        await uploadWithProgress({
          url: `${base}/storage/v1/object/user-documents/${storageKey}`,
          file,
          accessToken,
          onProgress: setUploadProgress,
        });

        // Salva source_url depois do upload OK.
        setUploadPhase("saving");
        const { data: pub } = supabase.storage
          .from("user-documents")
          .getPublicUrl(storageKey);
        if (pub?.publicUrl) {
          await supabase
            .from("documents")
            .update({ source_url: pub.publicUrl })
            .eq("id", doc.id)
            .eq("user_id", userId);
        }
      } catch (err) {
        console.warn("[plan-wizard] storage upload failed", err);
        toast.warning(
          `Documento criado, mas o arquivo não subiu pro storage (${(err as Error).message}).`,
        );
      }

      // 4) Adiciona na lista local + marca como selecionado.
      setDocuments((prev) => [doc, ...prev]);
      setPickedDocs((prev) => {
        const next = new Set(prev);
        next.add(doc.id);
        return next;
      });
      toast.success(`"${doc.title}" adicionado e selecionado.`);
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    } finally {
      setUploadingPdf(false);
      setUploadPhase(null);
      setUploadProgress(0);
    }
  }

  const totalSources = pickedDocs.size + pickedLectures.size;

  /* --------- Estimate quando entra no passo 4 --------- */
  const fetchEstimate = useCallback(async () => {
    if (totalSources === 0 || assetKinds.length === 0) return;
    setEstimating(true);
    try {
      const res = await fetch("/api/study-plans/estimate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentIds: Array.from(pickedDocs),
          lectureIds: Array.from(pickedLectures),
          assetKinds,
        }),
      });
      const json = (await res.json()) as EstimateResponse;
      setEstimate(json);
    } catch (err) {
      toast.error(`Falha ao estimar: ${(err as Error).message}`);
    } finally {
      setEstimating(false);
    }
  }, [totalSources, assetKinds, pickedDocs, pickedLectures]);

  useEffect(() => {
    if (step === "confirm") void fetchEstimate();
  }, [step, fetchEstimate]);

  /* --------- Navegação entre steps --------- */
  const canAdvance = useMemo(() => {
    if (step === "identity") return !!title.trim() && !!subjectId;
    if (step === "assets") return assetKinds.length > 0;
    if (step === "sources") return totalSources > 0;
    return true;
  }, [step, title, subjectId, assetKinds, totalSources]);

  function next() {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  }
  function prev() {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  }

  /* --------- Submit final --------- */
  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/study-plans/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          subjectId,
          examDate: examDate || undefined,
          assetKinds,
          documentIds: Array.from(pickedDocs),
          lectureIds: Array.from(pickedLectures),
        }),
      });
      const json = (await res.json()) as { planId?: string; error?: string };
      if (!res.ok || !json.planId) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      toast.success(
        `Plano criado. Geração em background — vai aparecendo aos poucos.`,
      );
      onOpenChange(false);
      onCreated?.(json.planId);
      router.push(`/planos/${json.planId}`);
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  /* --------- Render --------- */

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Criar plano de estudos
          </DialogTitle>
          <DialogDescription>
            <StepIndicator step={step} />
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2">
          {step === "identity" && (
            <IdentityStep
              subjects={subjects}
              subjectId={subjectId}
              onSubjectChange={handleSubjectChange}
              title={title}
              onTitleChange={setTitle}
              examDate={examDate}
              onExamDateChange={setExamDate}
            />
          )}
          {step === "assets" && (
            <AssetsStep
              selected={assetKinds}
              onToggle={toggleAsset}
            />
          )}
          {step === "sources" && (
            <SourcesStep
              documents={documents}
              lectures={lectures}
              pickedDocs={pickedDocs}
              pickedLectures={pickedLectures}
              onToggleDoc={toggleDoc}
              onToggleLecture={toggleLecture}
              loading={loadingSources}
              uploadingPdf={uploadingPdf}
              uploadPhase={uploadPhase}
              uploadProgress={uploadProgress}
              onUploadPdf={handleUploadNewPdf}
            />
          )}
          {step === "confirm" && (
            <ConfirmStep
              title={title}
              subjectName={subjects.find((s) => s.id === subjectId)?.name ?? "—"}
              examDate={examDate}
              assetKinds={assetKinds}
              totalSources={totalSources}
              estimate={estimate}
              estimating={estimating}
            />
          )}
        </div>

        <div className="border-t border-border/50 pt-3 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            onClick={step === "identity" ? () => onOpenChange(false) : prev}
            disabled={submitting}
          >
            {step === "identity" ? (
              "Cancelar"
            ) : (
              <>
                <ArrowLeft className="h-4 w-4" /> Voltar
              </>
            )}
          </Button>

          {step !== "confirm" ? (
            <Button
              onClick={next}
              disabled={!canAdvance}
              className="gap-1.5"
            >
              Próximo <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting || estimating || !estimate}
              className="gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Criando…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Criar plano · {estimate?.total ?? "…"} coins
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ====================================================================
   SUB-COMPONENTES
   ==================================================================== */

function StepIndicator({ step }: { step: StepId }) {
  const idx = STEPS.indexOf(step);
  const labels: Record<StepId, string> = {
    identity: "Identidade",
    assets: "Tipos de asset",
    sources: "Fontes",
    confirm: "Confirmar",
  };
  return (
    <span className="text-xs">
      Passo {idx + 1} de {STEPS.length}: {labels[step]}
    </span>
  );
}

function IdentityStep({
  subjects,
  subjectId,
  onSubjectChange,
  title,
  onTitleChange,
  examDate,
  onExamDateChange,
}: {
  subjects: Subject[];
  subjectId: string;
  onSubjectChange: (id: string) => void;
  title: string;
  onTitleChange: (v: string) => void;
  examDate: string;
  onExamDateChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="plan-subject">Matéria</Label>
        <select
          id="plan-subject"
          value={subjectId}
          onChange={(e) => onSubjectChange(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Escolha uma matéria…</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.emoji ? `${s.emoji} ` : ""}
              {s.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          As fontes são filtradas pela matéria escolhida.
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="plan-title">Título do plano</Label>
        <Input
          id="plan-title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Ex: Prova de Endócrino — semana 1"
          maxLength={180}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="plan-exam-date">Data da prova (opcional)</Label>
        <Input
          id="plan-exam-date"
          type="date"
          value={examDate}
          onChange={(e) => onExamDateChange(e.target.value)}
        />
      </div>
    </div>
  );
}

function AssetsStep({
  selected,
  onToggle,
}: {
  selected: StudyPlanItemKind[];
  onToggle: (k: StudyPlanItemKind) => void;
}) {
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Pra cada fonte (PDF ou aula), serão gerados os tipos que você marcar.
      </p>
      <div className="grid sm:grid-cols-2 gap-2">
        {ASSET_OPTIONS.map(({ kind, label, cost, Icon }) => {
          const active = selected.includes(kind);
          return (
            <button
              key={kind}
              onClick={() => onToggle(kind)}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                active
                  ? "border-primary bg-primary/5"
                  : "border-border/60 bg-card hover:border-primary/40",
              )}
            >
              <div
                className={cn(
                  "h-9 w-9 rounded-md flex items-center justify-center shrink-0",
                  active ? "bg-primary/15 text-primary" : "bg-muted",
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{label}</span>
                  {active && <Check className="h-4 w-4 text-primary" />}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {cost} coins por fonte
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "1h 23min", "47 min" ou "—" se durationSec não tiver. */
function formatLectureDuration(durationSec: number | undefined): string {
  if (!durationSec || durationSec < 1) return "Aula sem duração registrada";
  const totalMin = Math.round(durationSec / 60);
  if (totalMin < 60) return `${totalMin} min de aula`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h de aula` : `${h}h ${m}min de aula`;
}

function SourcesStep({
  documents,
  lectures,
  pickedDocs,
  pickedLectures,
  onToggleDoc,
  onToggleLecture,
  loading,
  uploadingPdf,
  uploadPhase,
  uploadProgress,
  onUploadPdf,
}: {
  documents: Document[];
  lectures: Lecture[];
  pickedDocs: Set<string>;
  pickedLectures: Set<string>;
  onToggleDoc: (id: string) => void;
  onToggleLecture: (id: string) => void;
  loading: boolean;
  uploadingPdf: boolean;
  uploadPhase: "extracting" | "uploading" | "saving" | null;
  uploadProgress: number;
  onUploadPdf: (file: File) => Promise<void>;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalPicked = pickedDocs.size + pickedLectures.size;

  return (
    <div className="grid gap-4">
      {/* Aviso sobre material complementar (sub-tarefa 5c) */}
      <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Bônus automático:</span>{" "}
        ao gerar cada item, a IA usa até 3 outros materiais da mesma matéria
        como contexto cruzado — mais consistência sem custo extra de coins.
      </div>

      {/* Seção 1: Subir novo PDF */}
      <SectionHeader
        icon={<Upload className="h-3.5 w-3.5" />}
        label="Subir novo PDF"
        hint="Vai pra /documentos da matéria automaticamente"
      />
      <UploadPdfDropzone
        uploading={uploadingPdf}
        phase={uploadPhase}
        progress={uploadProgress}
        onUpload={onUploadPdf}
      />

      {/* Seção 2: PDFs já na matéria */}
      <SectionHeader
        icon={<FileText className="h-3.5 w-3.5" />}
        label={`PDFs da matéria (${documents.length})`}
        hint="Documentos que você já tinha aqui"
      />
      <div className="max-h-44 overflow-y-auto -mx-1 px-1">
        <SourceList
          items={documents.map((d) => {
            // PDF sem texto extraído: upload antigo (pré-migration de storage)
            // ou PDF imagem-only sem OCR. Não dá pra gerar resumo/quiz/etc.
            // Bloqueamos a seleção e instruímos a re-subir pela tab 'Subir novo'.
            const textLen = d.sourceText?.length ?? 0;
            const usable = textLen >= 200;
            return {
              id: d.id,
              title: d.title,
              sub: usable
                ? d.pageCount
                  ? `${d.pageCount} páginas`
                  : "PDF"
                : "Sem texto extraível — re-suba pela tab 'Subir novo'",
              disabled: !usable,
            };
          })}
          picked={pickedDocs}
          onToggle={onToggleDoc}
          emptyMsg="Nenhum PDF nesta matéria. Use 'Subir novo' acima."
        />
      </div>

      {/* Seção 3: Aulas gravadas */}
      <SectionHeader
        icon={<AudioLines className="h-3.5 w-3.5" />}
        label={`Aulas gravadas (${lectures.length})`}
        hint="Transcrições das suas gravações"
      />
      <div className="max-h-44 overflow-y-auto -mx-1 px-1">
        <SourceList
          items={lectures.map((l) => ({
            id: l.id,
            title: l.title,
            sub: l.transcript
              ? formatLectureDuration(l.durationSec)
              : "Aula sem transcrição (não pode ser usada)",
            disabled: !l.transcript || l.transcript.trim().length < 200,
          }))}
          picked={pickedLectures}
          onToggle={onToggleLecture}
          emptyMsg="Nenhuma aula nesta matéria."
        />
      </div>

      <div className="text-xs text-muted-foreground border-t border-border/40 pt-2">
        Total selecionado: {totalPicked} fonte
        {totalPicked === 1 ? "" : "s"}
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  label,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 -mb-1">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      {hint && (
        <span className="text-[10px] text-muted-foreground/70 truncate">
          {hint}
        </span>
      )}
    </div>
  );
}

function UploadPdfDropzone({
  uploading,
  phase,
  progress,
  onUpload,
}: {
  uploading: boolean;
  phase: "extracting" | "uploading" | "saving" | null;
  progress: number;
  onUpload: (file: File) => Promise<void>;
}) {
  const phaseLabel: Record<NonNullable<typeof phase>, string> = {
    extracting: "Lendo PDF…",
    uploading: `Enviando · ${progress}%`,
    saving: "Salvando…",
  };
  return (
    <label
      htmlFor="plan-wizard-upload"
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-4 transition-colors",
        uploading
          ? "border-primary/40 bg-primary/5 cursor-wait"
          : "border-border/60 bg-card/40 cursor-pointer hover:border-primary/40 hover:bg-secondary/40",
      )}
    >
      {uploading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="text-xs font-medium">
            {phase ? phaseLabel[phase] : "Subindo…"}
          </p>
          {phase === "uploading" && (
            <div className="w-full max-w-xs h-1.5 rounded-full bg-primary/10 overflow-hidden">
              <div
                className="h-full bg-primary transition-[width] duration-150 ease-out"
                style={{ width: `${Math.max(2, progress)}%` }}
              />
            </div>
          )}
        </>
      ) : (
        <>
          <Upload className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs font-medium">Clica ou arraste o PDF aqui</p>
          <p className="text-[10px] text-muted-foreground">
            Até {PDF_LIMIT_MB} MB · sobe quantos quiser
          </p>
        </>
      )}
      <input
        id="plan-wizard-upload"
        type="file"
        accept="application/pdf,.pdf"
        disabled={uploading}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onUpload(f);
        }}
      />
    </label>
  );
}

function SourceList({
  items,
  picked,
  onToggle,
  emptyMsg,
}: {
  items: Array<{ id: string; title: string; sub: string; disabled?: boolean }>;
  picked: Set<string>;
  onToggle: (id: string) => void;
  emptyMsg: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-card/40 p-6 text-center">
        <p className="text-sm text-muted-foreground">{emptyMsg}</p>
      </div>
    );
  }
  return (
    <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
      {items.map((it) => {
        const active = picked.has(it.id);
        const disabled = !!it.disabled;
        return (
          <li key={it.id}>
            <button
              onClick={() => !disabled && onToggle(it.id)}
              disabled={disabled}
              className={cn(
                "w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                disabled
                  ? "opacity-50 cursor-not-allowed border-border/40 bg-muted/30"
                  : active
                    ? "border-primary bg-primary/5"
                    : "border-border/60 bg-card hover:border-primary/40",
              )}
            >
              <span
                className={cn(
                  "h-4 w-4 rounded shrink-0 flex items-center justify-center border",
                  active ? "bg-primary border-primary" : "border-border/60",
                )}
              >
                {active && <Check className="h-3 w-3 text-primary-foreground" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{it.title}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {it.sub}
                </p>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ConfirmStep({
  title,
  subjectName,
  examDate,
  assetKinds,
  totalSources,
  estimate,
  estimating,
}: {
  title: string;
  subjectName: string;
  examDate: string;
  assetKinds: StudyPlanItemKind[];
  totalSources: number;
  estimate: EstimateResponse | null;
  estimating: boolean;
}) {
  const kindLabel = (k: StudyPlanItemKind) =>
    ASSET_OPTIONS.find((o) => o.kind === k)?.label ?? k;
  return (
    <div className="grid gap-4">
      <div className="grid gap-1 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
        <div>
          <span className="text-muted-foreground">Plano:</span>{" "}
          <span className="font-medium">{title}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Matéria:</span>{" "}
          <span className="font-medium">{subjectName}</span>
        </div>
        {examDate && (
          <div>
            <span className="text-muted-foreground">Prova:</span>{" "}
            <span className="font-medium">{examDate}</span>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Fontes selecionadas:</span>{" "}
          <span className="font-medium">{totalSources}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Assets a gerar:</span>{" "}
          <span className="font-medium">
            {assetKinds.map(kindLabel).join(", ")}
          </span>
        </div>
      </div>

      {estimating ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Calculando custo…
        </div>
      ) : estimate ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs text-muted-foreground mb-2">Estimativa:</p>
          <ul className="space-y-1 text-xs">
            {estimate.breakdown.map((b) => (
              <li key={b.kind} className="flex justify-between">
                <span>
                  {kindLabel(b.kind)}
                  {b.kind === "summary"
                    ? ` · proporcional ao tamanho (~${b.avgPerItem} coins/fonte)`
                    : ` · ${b.avgPerItem} × ${b.count}`}
                </span>
                <span className="font-mono">{b.subtotal} coins</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 pt-3 border-t border-primary/20 flex justify-between text-sm font-semibold">
            <span>
              Total · {estimate.itemsTotal} itens
            </span>
            <span className="text-primary">{estimate.total} coins</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
            Resumo agora cobra proporcional ao tamanho do material (~1 coin/10k
            chars, mín 5 / máx 30). Coins são cobrados conforme cada item é
            gerado pelo cron. Se faltar
            saldo no meio, items individuais ficam como &quot;falhou&quot; sem
            consumir crédito.
          </p>
        </div>
      ) : null}
    </div>
  );
}
