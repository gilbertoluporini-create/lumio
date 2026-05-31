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
import {
  createDocumentAsync,
  findExistingDocumentByTitleAsync,
  listDocumentsAsync,
} from "@/lib/documents";
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

  // Step 3 — sources agrupadas em tópicos
  //
  // Cada source selecionada pertence a EXATAMENTE 1 tópico. Por padrão, ao
  // selecionar uma source, criamos um tópico auto com o título dela. O user
  // pode renomear ou mover sources entre tópicos pra agrupar (ex: 1 aula +
  // 1 PDF de slides do prof sobre o mesmo tema → 1 card só na trilha).
  //
  // Estrutura: `topics` é o registro de tópicos existentes; `sourceTopicMap`
  // mapeia sourceKey (`doc:<id>` ou `lec:<id>`) → topicId. Source não
  // mapeada = não selecionada.
  const [documents, setDocuments] = useState<Document[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [topics, setTopics] = useState<
    Record<string, { id: string; title: string; isAuto: boolean }>
  >({});
  const [sourceTopicMap, setSourceTopicMap] = useState<Record<string, string>>(
    {},
  );
  const [loadingSources, setLoadingSources] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<
    "extracting" | "uploading" | "saving" | null
  >(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Helpers
  const sourceKey = (kind: "doc" | "lec", id: string) => `${kind}:${id}`;
  const isPicked = (kind: "doc" | "lec", id: string) =>
    !!sourceTopicMap[sourceKey(kind, id)];
  const topicIdOf = (kind: "doc" | "lec", id: string) =>
    sourceTopicMap[sourceKey(kind, id)] ?? null;

  /** Cria novo tópico vazio com título sugerido. Retorna o ID. */
  function createTopic(title: string, isAuto: boolean): string {
    const id = `t_${Math.random().toString(36).slice(2, 10)}`;
    setTopics((prev) => ({
      ...prev,
      [id]: { id, title, isAuto },
    }));
    return id;
  }

  /** Remove tópicos sem sources atribuídas. Roda após cada mutação. */
  function gcEmptyTopics(map: Record<string, string>) {
    setTopics((prev) => {
      const usedIds = new Set(Object.values(map));
      const next: typeof prev = {};
      for (const [id, t] of Object.entries(prev)) {
        if (usedIds.has(id)) next[id] = t;
      }
      return next;
    });
  }

  /** Toggle source: cria tópico auto se selecionando, remove se desmarcando. */
  function togglePick(kind: "doc" | "lec", id: string, title: string) {
    const key = sourceKey(kind, id);
    setSourceTopicMap((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
        // gc deferred (precisa do mapa novo)
        setTimeout(() => gcEmptyTopics(next), 0);
      } else {
        const topicId = createTopic(title, true);
        next[key] = topicId;
      }
      return next;
    });
  }

  /** Move source pra outro tópico (existente ou novo). */
  function assignToTopic(
    kind: "doc" | "lec",
    id: string,
    targetTopicId: string,
  ) {
    const key = sourceKey(kind, id);
    setSourceTopicMap((prev) => {
      const next = { ...prev, [key]: targetTopicId };
      setTimeout(() => gcEmptyTopics(next), 0);
      return next;
    });
  }

  function renameTopic(topicId: string, newTitle: string) {
    setTopics((prev) =>
      prev[topicId]
        ? {
            ...prev,
            [topicId]: { ...prev[topicId], title: newTitle, isAuto: false },
          }
        : prev,
    );
  }

  /** Chama /api/study-plans/suggest-topics e substitui topics + map atuais
   *  pela sugestão da Lumi. Só roda em sources já selecionadas. */
  const [suggesting, setSuggesting] = useState(false);
  async function handleAutoSuggest() {
    const pickedSources: Array<{
      kind: "doc" | "lec";
      id: string;
      title: string;
    }> = [];
    for (const key of Object.keys(sourceTopicMap)) {
      const [kind, id] = key.split(":") as ["doc" | "lec", string];
      const title =
        kind === "doc"
          ? documents.find((d) => d.id === id)?.title ?? ""
          : lectures.find((l) => l.id === id)?.title ?? "";
      if (title) pickedSources.push({ kind, id, title });
    }
    if (pickedSources.length < 2) {
      toast.warning("Selecione ao menos 2 fontes pra eu poder agrupar.");
      return;
    }
    setSuggesting(true);
    try {
      const res = await fetch("/api/study-plans/suggest-topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sources: pickedSources }),
      });
      const json = (await res.json()) as {
        topics?: Array<{
          title: string;
          sourceIds: Array<{ kind: "doc" | "lec"; id: string }>;
        }>;
        error?: string;
        fallback?: { topics: typeof json.topics };
      };
      const suggested = json.topics ?? json.fallback?.topics ?? null;
      if (!res.ok && !suggested) {
        toast.error(json.error ?? "Falha ao sugerir tópicos.");
        return;
      }
      if (!suggested) return;

      // Substitui state atual pela sugestão
      const newTopics: typeof topics = {};
      const newMap: Record<string, string> = {};
      for (const sug of suggested) {
        const tid = `t_${Math.random().toString(36).slice(2, 10)}`;
        newTopics[tid] = { id: tid, title: sug.title, isAuto: false };
        for (const s of sug.sourceIds) {
          newMap[`${s.kind}:${s.id}`] = tid;
        }
      }
      setTopics(newTopics);
      setSourceTopicMap(newMap);
      toast.success(
        `Lumi organizou em ${suggested.length} tópico${suggested.length === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    } finally {
      setSuggesting(false);
    }
  }

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
    setTopics({});
    setSourceTopicMap({});
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

  // toggleDoc/toggleLecture substituídas por togglePick(kind, id, title)

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
    setUploadPhase("uploading");
    setUploadProgress(0);
    try {
      const docTitleNew = suggestTitleFromFileName(file.name);
      // Dedup: se já existe doc com mesmo título normalizado na matéria,
      // reaproveita em vez de duplicar.
      const existingDoc = await findExistingDocumentByTitleAsync({
        userId,
        subjectId,
        title: docTitleNew,
      });
      if (existingDoc) {
        toast.info(`Já existia "${existingDoc.title}" — usando o mesmo.`);
        // Mesmo fluxo do upload novo: adiciona à lista + seleciona automaticamente.
        setDocuments((prev) =>
          prev.some((d) => d.id === existingDoc.id) ? prev : [existingDoc, ...prev],
        );
        togglePick("doc", existingDoc.id, existingDoc.title);
        setUploadingPdf(false);
        setUploadPhase(null);
        setUploadProgress(0);
        return;
      }
      // 1) Cria document row stub (text/pages preenchidos depois da extração).
      const doc = await createDocumentAsync({
        userId,
        subjectId,
        folderId: null,
        title: docTitleNew,
        sourceKind: "pdf",
      });
      if (!doc) {
        toast.error("Falha ao criar documento.");
        return;
      }

      // 2) Storage upload via XHR com progresso real.
      let sourceUrl: string | null = null;
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

        setUploadPhase("saving");
        const { data: pub } = supabase.storage
          .from("user-documents")
          .getPublicUrl(storageKey);
        sourceUrl = pub?.publicUrl ?? null;
        if (sourceUrl) {
          await supabase
            .from("documents")
            .update({ source_url: sourceUrl })
            .eq("id", doc.id)
            .eq("user_id", userId);
        }
      } catch (err) {
        console.warn("[plan-wizard] storage upload failed", err);
        toast.warning(
          `Documento criado, mas o arquivo não subiu pro storage (${(err as Error).message}).`,
        );
      }

      // 3) Extrai texto AGORA (depois do storage). Pra PDFs > ~4MB, via
      //    source_url evita o limite de 4.5MB no body do Vercel Serverless.
      setUploadPhase("extracting");
      try {
        const { extractPdfText, extractPdfTextFromUrl } = await import(
          "@/lib/pdf-extract"
        );
        const { text, pages } = sourceUrl
          ? await extractPdfTextFromUrl(sourceUrl)
          : await extractPdfText(file);
        if (text) {
          const { createClient } = await import("@/lib/supabase/client");
          const supabase = createClient();
          await supabase
            .from("documents")
            .update({ source_text: text, page_count: pages ?? null })
            .eq("id", doc.id)
            .eq("user_id", userId);
          doc.sourceText = text;
          doc.pageCount = pages ?? undefined;
        }
      } catch (err) {
        console.warn("[plan-wizard] pdf text extract failed", err);
        toast.warning(
          "Texto do PDF não pôde ser extraído — você ainda pode anexar o arquivo, mas o resumo no plano não vai funcionar.",
        );
      }

      // 4) Adiciona na lista local + marca como selecionado num tópico auto
      //    com o título do PDF (user pode renomear/agrupar depois).
      setDocuments((prev) => [doc, ...prev]);
      togglePick("doc", doc.id, doc.title);
      toast.success(`"${doc.title}" adicionado e selecionado.`);
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    } finally {
      setUploadingPdf(false);
      setUploadPhase(null);
      setUploadProgress(0);
    }
  }

  // Sources selecionadas (= keys do sourceTopicMap)
  const pickedSourceKeys = Object.keys(sourceTopicMap);
  const totalSources = pickedSourceKeys.length;
  const totalTopics = Object.keys(topics).length;

  /**
   * Resolve a estrutura `topics: [{ title, documentIds, lectureIds }]` que o
   * endpoint create/estimate consome a partir do estado dos Maps.
   */
  function buildTopicsPayload() {
    const result: Array<{
      title: string;
      documentIds: string[];
      lectureIds: string[];
    }> = [];
    for (const topic of Object.values(topics)) {
      const documentIds: string[] = [];
      const lectureIds: string[] = [];
      for (const [key, tid] of Object.entries(sourceTopicMap)) {
        if (tid !== topic.id) continue;
        const [kind, id] = key.split(":");
        if (kind === "doc") documentIds.push(id);
        else if (kind === "lec") lectureIds.push(id);
      }
      if (documentIds.length === 0 && lectureIds.length === 0) continue;
      result.push({ title: topic.title, documentIds, lectureIds });
    }
    return result;
  }

  /* --------- Estimate quando entra no passo 4 --------- */
  const fetchEstimate = useCallback(async () => {
    if (totalSources === 0 || assetKinds.length === 0) return;
    setEstimating(true);
    try {
      const payload = buildTopicsPayload();
      // Estimate endpoint ainda usa flat documentIds/lectureIds — coleta todos
      // os IDs únicos dos tópicos pra computar custo de coins (independe do
      // agrupamento).
      const allDocIds = Array.from(
        new Set(payload.flatMap((t) => t.documentIds)),
      );
      const allLecIds = Array.from(
        new Set(payload.flatMap((t) => t.lectureIds)),
      );
      const res = await fetch("/api/study-plans/estimate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentIds: allDocIds,
          lectureIds: allLecIds,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalSources, assetKinds, sourceTopicMap, topics]);

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
          topics: buildTopicsPayload(),
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
              topics={topics}
              sourceTopicMap={sourceTopicMap}
              onTogglePick={togglePick}
              onAssignToTopic={assignToTopic}
              onRenameTopic={renameTopic}
              isPicked={isPicked}
              topicIdOf={topicIdOf}
              onAutoSuggest={handleAutoSuggest}
              suggesting={suggesting}
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

type Topic = { id: string; title: string; isAuto: boolean };

function SourcesStep({
  documents,
  lectures,
  topics,
  sourceTopicMap,
  onTogglePick,
  onAssignToTopic,
  onRenameTopic,
  isPicked,
  topicIdOf,
  onAutoSuggest,
  suggesting,
  loading,
  uploadingPdf,
  uploadPhase,
  uploadProgress,
  onUploadPdf,
}: {
  documents: Document[];
  lectures: Lecture[];
  topics: Record<string, Topic>;
  sourceTopicMap: Record<string, string>;
  onTogglePick: (kind: "doc" | "lec", id: string, title: string) => void;
  onAssignToTopic: (
    kind: "doc" | "lec",
    id: string,
    targetTopicId: string,
  ) => void;
  onRenameTopic: (topicId: string, newTitle: string) => void;
  isPicked: (kind: "doc" | "lec", id: string) => boolean;
  topicIdOf: (kind: "doc" | "lec", id: string) => string | null;
  onAutoSuggest: () => Promise<void>;
  suggesting: boolean;
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

  const totalPicked = Object.keys(sourceTopicMap).length;
  const topicList = Object.values(topics);
  const topicCount = topicList.length;

  // Index pra render: lista plana de docs e lectures usáveis com estado de seleção
  type SourceRow = {
    kind: "doc" | "lec";
    id: string;
    title: string;
    sub: string;
    disabled: boolean;
  };
  const docRows: SourceRow[] = documents.map((d) => {
    const textLen = d.sourceText?.length ?? 0;
    const usable = textLen >= 200;
    return {
      kind: "doc",
      id: d.id,
      title: d.title,
      sub: usable
        ? d.pageCount
          ? `${d.pageCount} páginas`
          : "PDF"
        : "Sem texto extraível — re-suba pela tab 'Subir novo'",
      disabled: !usable,
    };
  });
  const lecRows: SourceRow[] = lectures.map((l) => ({
    kind: "lec",
    id: l.id,
    title: l.title,
    sub: l.transcript
      ? formatLectureDuration(l.durationSec)
      : "Aula sem transcrição (não pode ser usada)",
    disabled: !l.transcript || l.transcript.trim().length < 200,
  }));

  return (
    <div className="grid gap-4">
      {/* Aviso pedagógico sobre a UX de tópicos */}
      <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Como funciona:</span>{" "}
        selecione fontes (PDFs e/ou aulas). Cada uma vira um <strong>tópico</strong> próprio
        (= 1 card na trilha). Pra agrupar fontes que tratam do MESMO tema
        (ex: 1 aula + 1 PDF do prof), use o dropdown ao lado e mande pro
        mesmo tópico. Bônus: a Lumi também puxa até 3 outros materiais da
        matéria como contexto cruzado, sem cobrar coins extras.
      </div>

      {/* Subir novo PDF */}
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

      {/* PDFs */}
      <SectionHeader
        icon={<FileText className="h-3.5 w-3.5" />}
        label={`PDFs da matéria (${documents.length})`}
        hint="Documentos que você já tinha aqui"
      />
      <div className="max-h-56 overflow-y-auto -mx-1 px-1 space-y-1.5">
        {docRows.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            Nenhum PDF nesta matéria. Use &apos;Subir novo&apos; acima.
          </p>
        ) : (
          docRows.map((r) => (
            <SourceRowWithTopic
              key={`doc:${r.id}`}
              row={r}
              picked={isPicked("doc", r.id)}
              topicId={topicIdOf("doc", r.id)}
              topics={topicList}
              onTogglePick={() => onTogglePick("doc", r.id, r.title)}
              onAssignTo={(tid) => onAssignToTopic("doc", r.id, tid)}
              onRenameTopic={onRenameTopic}
            />
          ))
        )}
      </div>

      {/* Aulas gravadas */}
      <SectionHeader
        icon={<AudioLines className="h-3.5 w-3.5" />}
        label={`Aulas gravadas (${lectures.length})`}
        hint="Transcrições das suas gravações"
      />
      <div className="max-h-56 overflow-y-auto -mx-1 px-1 space-y-1.5">
        {lecRows.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            Nenhuma aula nesta matéria.
          </p>
        ) : (
          lecRows.map((r) => (
            <SourceRowWithTopic
              key={`lec:${r.id}`}
              row={r}
              picked={isPicked("lec", r.id)}
              topicId={topicIdOf("lec", r.id)}
              topics={topicList}
              onTogglePick={() => onTogglePick("lec", r.id, r.title)}
              onAssignTo={(tid) => onAssignToTopic("lec", r.id, tid)}
              onRenameTopic={onRenameTopic}
            />
          ))
        )}
      </div>

      {/* Resumo + auto-sugerir */}
      <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-2">
        <div className="text-xs text-muted-foreground flex-1 min-w-0">
          {totalPicked === 0
            ? "Selecione ao menos 1 fonte."
            : `${totalPicked} fonte${totalPicked === 1 ? "" : "s"} em ${topicCount} tópico${topicCount === 1 ? "" : "s"} = ${topicCount} card${topicCount === 1 ? "" : "s"} na trilha.`}
        </div>
        {totalPicked >= 2 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void onAutoSuggest()}
            disabled={suggesting}
            className="gap-1.5 shrink-0"
          >
            {suggesting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {suggesting ? "Lumi pensando…" : "Lumi organiza pra mim"}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Linha de source com:
 *  - checkbox/toggle pra incluir/excluir
 *  - quando selecionada, dropdown "Tópico" pra mover entre tópicos
 *  - quando selecionada e em tópico próprio, input pra renomear o tópico
 */
function SourceRowWithTopic({
  row,
  picked,
  topicId,
  topics,
  onTogglePick,
  onAssignTo,
  onRenameTopic,
}: {
  row: {
    kind: "doc" | "lec";
    id: string;
    title: string;
    sub: string;
    disabled: boolean;
  };
  picked: boolean;
  topicId: string | null;
  topics: Topic[];
  onTogglePick: () => void;
  onAssignTo: (targetTopicId: string) => void;
  onRenameTopic: (topicId: string, newTitle: string) => void;
}) {
  const currentTopic = topicId ? topics.find((t) => t.id === topicId) : null;
  const otherTopics = topics.filter((t) => t.id !== topicId);

  return (
    <div
      className={cn(
        "rounded-md border px-2 py-2",
        picked ? "border-primary/40 bg-primary/5" : "border-border/60",
        row.disabled && "opacity-60",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onTogglePick}
          disabled={row.disabled}
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center",
            picked
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background",
            row.disabled && "cursor-not-allowed",
          )}
        >
          {picked && <Check className="h-3 w-3" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{row.title}</p>
          <p className="text-[11px] text-muted-foreground truncate">{row.sub}</p>
        </div>
      </div>

      {picked && currentTopic && (
        <div className="mt-2 flex items-center gap-2 pl-6">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Tópico:
          </span>
          {currentTopic.isAuto ? (
            <Input
              value={currentTopic.title}
              onChange={(e) => onRenameTopic(currentTopic.id, e.target.value)}
              className="h-7 text-xs flex-1"
              placeholder="Nome do tópico"
            />
          ) : (
            <span className="text-xs font-medium text-foreground flex-1 truncate">
              {currentTopic.title}
            </span>
          )}
          {otherTopics.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) onAssignTo(e.target.value);
              }}
              className="h-7 rounded border border-border bg-background px-1.5 text-[11px]"
              title="Mover pra outro tópico"
            >
              <option value="">Mover pra…</option>
              {otherTopics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title.slice(0, 30)}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
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
