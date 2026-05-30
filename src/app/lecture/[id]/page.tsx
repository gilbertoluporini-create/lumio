"use client";

import { startTransition, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Headphones, Lightbulb, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { LumiCharacter, LumiScene } from "@/components/brand/lumi";
import { Button } from "@/components/ui/button";
import {
  LectureSummaryView,
  summaryToMarkdown,
} from "@/components/app/lecture-summary-view";
import {
  appendMessageAsync,
  deleteLectureAsync,
  getLectureAsync,
  getSubjectAsync,
  listSubjectsAsync,
  updateLectureAsync,
} from "@/lib/db";
import {
  MoveToFolderDialog,
  type MoveTarget,
} from "@/components/documents/move-to-folder-dialog";
import {
  getSummaryByLectureIdAsync,
  upsertSummaryByLectureAsync,
} from "@/lib/summaries";
import type {
  ChatMessage,
  Lecture,
  LectureSummary,
  Slide,
  Subject,
  TranscriptInsights,
  User,
} from "@/lib/types";
import { renderPdfToImages } from "@/lib/pdf-render";
import { LIMITS, PDF_LIMIT_MB, PDF_VISION_LIMIT_MB } from "@/lib/api-security";
import { formatDuration, generateId, stripChatFormatting } from "@/lib/utils";
import {
  isSpeechRecognitionSupported,
  useSpeechRecognition,
} from "@/hooks/use-speech-recognition";
import {
  AudioRecorder,
  isAudioRecorderSupported,
} from "@/lib/audio-recorder";
import { uploadLectureAudio } from "@/lib/audio-storage";
import { AudioPlayer } from "@/components/audio/audio-player";

import {
  LectureHeader,
  type LectureHeaderView,
} from "@/components/lecture/lecture-header";
import { LiveTranscriptColumn } from "@/components/lecture/live-transcript-column";
import { SlidesColumn } from "@/components/lecture/slides-column";
import { ChatColumn } from "@/components/lecture/chat-column";
import { KeyPointsCard } from "@/components/lecture/bottom-cards/key-points";
import { TopicsListCard } from "@/components/lecture/bottom-cards/topics-list";
import {
  NextActionsCard,
  type NextActionId,
} from "@/components/lecture/bottom-cards/next-actions";
import { StatsCard } from "@/components/lecture/bottom-cards/stats-card";
import { useTranscriptSync } from "@/components/lecture/use-transcript-sync";
import { TranscribingOverlay } from "@/components/lecture/transcribing-overlay";
import { CollapsibleSection } from "@/components/lecture/collapsible-section";

const SUGGESTED_PROMPTS = [
  "Faz um resumo da aula",
  "Quais os pontos principais?",
  "Crie 5 questões pra revisão",
  "Explica de novo a parte mais difícil",
];

export default function LecturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <LectureView user={user} lectureId={id} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

type MarkerFilter = "all" | "concept" | "doubt" | "example";

function LectureView({ user, lectureId }: { user: User; lectureId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");

  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);

  const [interim, setInterim] = useState("");
  const [durationSec, setDurationSec] = useState(0);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingReply, setStreamingReply] = useState("");

  const [slides, setSlides] = useState<Slide[] | undefined>(undefined);
  const [, setSlidesFileName] = useState<string | undefined>(undefined);
  const [attaching, setAttaching] = useState(false);
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
  const [showPdfBesides, setShowPdfBesides] = useState(true);

  const [summary, setSummary] = useState<LectureSummary | undefined>(undefined);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [structuringTranscript, setStructuringTranscript] = useState(false);
  const [syncingSlides, setSyncingSlides] = useState(false);
  const [generatingEducational, setGeneratingEducational] = useState(false);

  // `?tab=summary` mantém a view "live" do header MAS pede pro LiveTranscriptColumn
  // abrir já na aba Resumo embutida (em vez da SummaryPane antiga de cards).
  const [view, setView] = useState<LectureHeaderView>("live");
  const initialTranscriptView = initialTab === "summary" ? "summary" : undefined;

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<MarkerFilter>("all");
  const [actionLoading, setActionLoading] = useState<NextActionId | null>(null);

  const slidesInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  // Refs always-fresh
  const slidesRef = useRef(slides);
  const messagesRef = useRef(messages);
  const durationRef = useRef(0);
  const currentSlideRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    slidesRef.current = slides;
    if (slides && slides.length > 0) {
      currentSlideRef.current = currentSlideIdx;
    } else {
      currentSlideRef.current = undefined;
    }
  }, [slides, currentSlideIdx]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    durationRef.current = durationSec;
  }, [durationSec]);

  const [browserSupported, setBrowserSupported] = useState(true);
  useEffect(() => {
    setBrowserSupported(isSpeechRecognitionSupported());
  }, []);

  // ===== Audio recording =====
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const [audioSupported, setAudioSupported] = useState(true);
  const [audioRecording, setAudioRecording] = useState(false);
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | undefined>(undefined);
  const audioPlayerRef = useRef<{ seek: (s: number) => void } | null>(null);
  useEffect(() => {
    setAudioSupported(isAudioRecorderSupported());
  }, []);
  useEffect(() => {
    return () => {
      audioRecorderRef.current?.abort();
      audioRecorderRef.current = null;
    };
  }, []);

  // ===== Transcript sync state =====
  const persistFnRef = useRef<
    (
      entries: import("@/lib/types").TranscriptEntry[],
      insights?: TranscriptInsights,
    ) => void
  >(() => {});

  const sync = useTranscriptSync({
    currentSlideIndexRef: currentSlideRef,
    durationRef,
    onPersist: (entries, insights) => persistFnRef.current(entries, insights),
  });

  // ===== Speech recognition =====
  const speech = useSpeechRecognition({
    lang: "pt-BR",
    onFinal: (text) => {
      sync.addFinal(text);
      setInterim("");
    },
    onInterim: (text) => setInterim(text),
  });

  // ===== Load lecture =====
  useEffect(() => {
    let active = true;
    (async () => {
      const l = await getLectureAsync(user.id, lectureId);
      if (!active) return;
      if (!l) {
        toast.error("Aula não encontrada.");
        router.replace("/dashboard");
        return;
      }
      setLecture(l);
      setDurationSec(l.durationSec || 0);
      setMessages(l.messages || []);
      // FIX BUG PDF: trata array vazio como ausência de slides
      const validSlides =
        Array.isArray(l.slides) && l.slides.length > 0 ? l.slides : undefined;
      setSlides(validSlides);
      setSlidesFileName(validSlides ? l.slidesFileName : undefined);
      // Carrega summary da tabela summaries (source of truth).
      // Importante: `images` é coluna top-level no row, não vem dentro de
      // `content`. Funde os dois antes de salvar no state.
      const sm = await getSummaryByLectureIdAsync(user.id, l.id);
      if (sm?.content) {
        setSummary({ ...sm.content, images: sm.images ?? sm.content.images });
      } else {
        setSummary(undefined);
      }

      // Se a lecture é "shell" (sem transcript + sem slides) MAS tem summary,
      // ela foi criada só pra abrigar resumo gerado de PDF/chat. Não faz
      // sentido mostrar tela de transcrição ao vivo — manda direto pro resumo.
      const hasTranscript = (l.transcript ?? "").trim().length > 0;
      const hasEntries =
        Array.isArray(l.transcriptEntries) && l.transcriptEntries.length > 0;
      if (!hasTranscript && !hasEntries && !validSlides && sm?.content) {
        router.replace(`/resumo/${l.id}`);
        return;
      }
      setAudioUrl(l.audioUrl);
      // Hydrate transcript entries em transition de baixa prioridade —
      // pra aulas longas (1k+ entries) o React processa o primeiro paint
      // da UI ANTES de cuspir todo o conteúdo pesado. Sem isso o renderer
      // do Chrome estourava no first mount (Código de erro: 5).
      if (l.transcriptEntries && l.transcriptEntries.length > 0) {
        const allEntries = l.transcriptEntries;
        startTransition(() => sync.replaceAll(allEntries));
      } else if (l.transcript) {
        const t = l.transcript;
        const dur = l.durationSec || 0;
        startTransition(() =>
          sync.replaceAll([
            {
              id: generateId(),
              startSec: 0,
              endSec: dur,
              speaker: "professor",
              text: t,
            },
          ]),
        );
      }
      const [s, subs] = await Promise.all([
        getSubjectAsync(user.id, l.subjectId),
        listSubjectsAsync(user.id),
      ]);
      if (active) {
        setSubject(s);
        setSubjects(subs);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, lectureId, router]);

  // ===== Persist factory (gets lecture from closure when called) =====
  persistFnRef.current = (entries, insights) => {
    if (!lecture) return;
    const transcript = entries.map((e) => e.text).join(" ").trim();
    updateLectureAsync(user.id, lecture.id, {
      transcriptEntries: entries,
      transcript,
      ...(insights ? { transcriptInsights: insights } : {}),
    })
      .then((updated) => {
        if (updated) setLecture(updated);
      })
      .catch((err) => console.error("[lecture] persist entries failed", err));
  };

  // ===== Duration timer =====
  useEffect(() => {
    if (speech.state === "listening") {
      lastTickRef.current = Date.now();
      timerRef.current = window.setInterval(() => {
        const now = Date.now();
        const last = lastTickRef.current ?? now;
        const deltaSec = (now - last) / 1000;
        lastTickRef.current = now;
        setDurationSec((base) => base + deltaSec);
      }, 1000);
    } else if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
      lastTickRef.current = null;
    }
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [speech.state]);

  const persist = useCallback(
    (patch: Partial<Lecture>) => {
      if (!lecture) return;
      updateLectureAsync(user.id, lecture.id, patch)
        .then((updated) => {
          if (updated) setLecture(updated);
        })
        .catch((err) => console.error("[lecture] persist failed", err));
    },
    [lecture, user.id],
  );

  // ===== Recording control =====
  const wasListeningRef = useRef(false);
  useEffect(() => {
    if (speech.state === "listening") {
      wasListeningRef.current = true;
      return;
    }
    if (speech.state === "idle" && wasListeningRef.current) {
      wasListeningRef.current = false;
      // Persiste tudo no stop
      const entries = sync.entries;
      const transcript = entries.map((e) => e.text).join(" ").trim();
      persist({
        transcript,
        transcriptEntries: entries,
        durationSec: Math.round(durationRef.current),
        status: "completed",
      });
      if (lecture?.id) {
        void finalizeAudioUpload(lecture.id);
      }

      // Auto-indexa transcript pra RAG (Lumi consegue buscar trechos da aula)
      if (lecture?.id && transcript.length > 80) {
        void import("@/lib/embeddings-client").then(({ indexContentInBackground }) =>
          indexContentInBackground({
            sourceKind: "lecture",
            sourceId: lecture.id,
            subjectId: lecture.subjectId,
            text: transcript,
            metadata: {
              title: lecture.title,
              duration_sec: Math.round(durationRef.current),
            },
          }),
        );
      }

      // Classifica e gera insights uma vez ao parar
      void sync.classifyNow();
      void sync.refreshInsightsNow(lecture?.title);

      const hasContent = transcript.length > 50;
      const hasSlides = !!slidesRef.current && slidesRef.current.length > 0;
      if (hasContent && (hasSlides || messagesRef.current.length > 0)) {
        toast.success("Aula salva. Gerando resumo automaticamente...");
        setTimeout(() => generateSummary({ silent: true }), 250);
      } else {
        toast.success("Aula salva.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.state]);

  async function toggleRecording() {
    if (speech.state === "listening") {
      speech.stop();
      return;
    }
    if (!browserSupported) {
      toast.error(
        "Seu navegador não suporta reconhecimento de voz. Use Chrome, Edge ou Safari.",
      );
      return;
    }
    if (audioSupported && !audioRecorderRef.current) {
      const rec = new AudioRecorder();
      try {
        await rec.start();
        audioRecorderRef.current = rec;
        setAudioRecording(true);
      } catch (err) {
        console.warn("[lecture] audio recorder failed to start", err);
        audioRecorderRef.current = null;
        setAudioRecording(false);
        toast.warning("Sem permissão pra gravar áudio. Transcrição segue normal.");
      }
    }
    speech.start();
    persist({ status: "live" });
  }

  async function finalizeAudioUpload(lectureIdLocal: string) {
    const rec = audioRecorderRef.current;
    if (!rec) return;
    audioRecorderRef.current = null;
    setAudioRecording(false);
    try {
      setAudioUploading(true);
      const blob = await rec.stop();
      if (!blob || blob.size === 0) return;
      const result = await uploadLectureAudio(user.id, lectureIdLocal, blob);
      if (result?.url) {
        setAudioUrl(result.url);
        persist({ audioUrl: result.url });
        toast.success("Áudio salvo na nuvem.");
      }
    } catch (err) {
      console.error("[lecture] finalizeAudioUpload failed", err);
    } finally {
      setAudioUploading(false);
    }
  }

  // ===== Slides handling =====
  async function handleSlidesFile(file: File) {
    if (attaching) return;
    if (file.type !== "application/pdf") {
      toast.error("Envie um PDF.");
      return;
    }
    if (file.size > LIMITS.PDF_BYTES) {
      toast.error(`PDF muito grande (máx ${PDF_LIMIT_MB}MB).`);
      return;
    }
    setAttaching(true);
    const t = toast.loading("Renderizando slides do PDF...");
    try {
      const rendered = await renderPdfToImages(file);
      const tooBigForVision = file.size > LIMITS.PDF_VISION_BYTES;

      // PDFs > PDF_VISION_BYTES não cabem no body do serverless function da
      // Vercel. Fallback: extração só de texto via pdfjs no client (sem
      // Vision/AI). Cobre tudo, só não pega título por slide nem descreve
      // diagramas — texto cru suficiente pra resumo/chat.
      let extracted: Slide[] = [];
      let fileNameFromServer: string | undefined;

      if (tooBigForVision) {
        toast.loading(
          `PDF > ${PDF_VISION_LIMIT_MB}MB — extraindo texto direto no navegador...`,
          { id: t },
        );
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (typeof window !== "undefined") {
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.legacy.mjs";
        }
        const buf = await file.arrayBuffer();
        const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const content = await page.getTextContent();
          const text = content.items
            .map((it) => ("str" in it ? it.str : ""))
            .filter((s) => s.length > 0)
            .join(" ");
          extracted.push({ pageNumber: i, text });
          page.cleanup();
        }
        await pdfDoc.destroy();
      } else {
        toast.loading("Extraindo conteúdo de cada slide...", { id: t });
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/extract-slides", {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data?.error || "Erro ao processar slides.", { id: t });
          return;
        }
        extracted = data.slides || [];
        fileNameFromServer = data.fileName;
      }

      const merged: Slide[] = rendered.map((r) => {
        const match = extracted.find((s) => s.pageNumber === r.pageNumber);
        return {
          pageNumber: r.pageNumber,
          title: match?.title,
          text: match?.text || "",
          imageDataUrl: r.imageDataUrl,
        };
      });
      for (const s of extracted) {
        if (!merged.find((m) => m.pageNumber === s.pageNumber)) {
          merged.push({ ...s });
        }
      }
      merged.sort((a, b) => a.pageNumber - b.pageNumber);
      const finalFileName = fileNameFromServer || file.name;
      setSlides(merged);
      setSlidesFileName(finalFileName);
      setCurrentSlideIdx(0);
      persist({
        slides: merged,
        slidesFileName: finalFileName,
        slidesAddedAt: new Date().toISOString(),
      });
      toast.success(
        `${merged.length} slide${merged.length === 1 ? "" : "s"} anexado${merged.length === 1 ? "" : "s"}.`,
        { id: t },
      );
    } catch (err) {
      toast.error(`Erro ao processar PDF: ${(err as Error).message}`, { id: t });
    } finally {
      setAttaching(false);
      if (slidesInputRef.current) slidesInputRef.current.value = "";
    }
  }

  // ===== FIX BUG: remove slides — sincroniza e refetch =====
  async function removeSlides() {
    if (!confirm("Remover os slides anexados?")) return;
    setSlides(undefined);
    setSlidesFileName(undefined);
    setCurrentSlideIdx(0);
    if (!lecture) return;
    try {
      // Update síncrono no DB com null explícito
      const updated = await updateLectureAsync(user.id, lecture.id, {
        slides: undefined,
        slidesFileName: undefined,
      });
      // Refetch pra garantir consistência (não confia só no retorno do UPDATE)
      const refetched = await getLectureAsync(user.id, lecture.id);
      const final = refetched ?? updated;
      if (final) {
        setLecture(final);
        const hasSlidesNow =
          Array.isArray(final.slides) && final.slides.length > 0;
        if (hasSlidesNow) {
          // Se voltou com slides ainda (cache stale), force novo update
          console.warn("[lecture] slides still present after delete, retrying");
          await updateLectureAsync(user.id, lecture.id, {
            slides: undefined,
            slidesFileName: undefined,
          });
          setSlides(undefined);
          setSlidesFileName(undefined);
        }
      }
      toast.success("Slides removidos.");
    } catch (err) {
      console.error("[lecture] removeSlides failed", err);
      toast.error(`Erro ao remover slides: ${(err as Error).message}`);
    }
  }

  // ===== Resumo educativo (markdown estilo aba Resumos) =====
  async function generateEducationalSummary() {
    if (generatingEducational) return;
    if (!lecture) return;
    if (sync.entries.length === 0) {
      toast.error("Transcrição vazia.");
      return;
    }
    setGeneratingEducational(true);
    const t = toast.loading("Gerando resumo educativo (pode levar 1-2 min)...");
    try {
      const res = await fetch(
        `/api/lectures/${lecture.id}/educational-summary`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.summaryEducational) {
        const msg =
          res.status === 402
            ? `Coins insuficientes (precisa de ${data.required}, você tem ${data.balance}).`
            : data?.error || `HTTP ${res.status}`;
        toast.error(msg, { id: t });
        return;
      }
      setLecture((prev) =>
        prev ? { ...prev, summaryEducational: data.summaryEducational } : prev,
      );
      toast.success("Resumo educativo gerado. Imagens em andamento...", { id: t });
      // Re-puxa o summary do banco pra capturar as imagens geradas pelo
      // fire-and-forget de /api/ai/summary-images (chega ~20-40s depois).
      if (lecture?.id) {
        setTimeout(async () => {
          const sm = await getSummaryByLectureIdAsync(user.id, lecture.id);
          if (sm?.content) {
            setSummary({
              ...sm.content,
              images: sm.images ?? sm.content.images,
            });
          }
        }, 25_000);
      }
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`, { id: t });
    } finally {
      setGeneratingEducational(false);
    }
  }

  // ===== Estruturação da transcrição com IA =====
  async function structureTranscript() {
    if (structuringTranscript) return;
    if (!lecture) return;
    if (sync.entries.length === 0) {
      toast.error("Transcrição vazia.");
      return;
    }
    setStructuringTranscript(true);
    const t = toast.loading("Revisando e separando em capítulos...");
    try {
      const res = await fetch(
        `/api/lectures/${lecture.id}/structure-transcript`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.chapters) {
        const msg =
          res.status === 402
            ? `Coins insuficientes (precisa de ${data.required}, você tem ${data.balance}).`
            : data?.error || `HTTP ${res.status}`;
        toast.error(msg, { id: t });
        return;
      }
      // Atualiza lecture local pra refletir os chapters revisados sem recarregar
      setLecture((prev) =>
        prev ? { ...prev, transcriptChapters: data.chapters } : prev,
      );
      toast.success("Transcrição revisada gerada.", { id: t });
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`, { id: t });
    } finally {
      setStructuringTranscript(false);
    }
  }

  // ===== Sync slides ↔ chapters (IA, 3 coins) =====
  // Roda quando o user anexou um PDF DEPOIS da gravação. Faz o mapeamento
  // capítulo→slide via Haiku e atualiza transcriptChapters[i].slideIndex.
  async function syncSlides() {
    if (syncingSlides || !lecture) return;
    if (!slides || slides.length === 0) {
      toast.error("Anexe um PDF de slides antes.");
      return;
    }
    if (!lecture.transcriptChapters?.chapters?.length) {
      toast.error("Gere a transcrição revisada antes de sincronizar.");
      return;
    }
    setSyncingSlides(true);
    const t = toast.loading("Sincronizando capítulos com os slides…");
    try {
      const res = await fetch(`/api/lectures/${lecture.id}/sync-slides`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data.chapters) {
        const msg =
          res.status === 402
            ? `Coins insuficientes (precisa de ${data.required}, você tem ${data.balance}).`
            : data?.error || `HTTP ${res.status}`;
        toast.error(msg, { id: t });
        return;
      }
      setLecture((prev) =>
        prev ? { ...prev, transcriptChapters: data.chapters } : prev,
      );
      toast.success("Capítulos sincronizados com os slides.", { id: t });
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`, { id: t });
    } finally {
      setSyncingSlides(false);
    }
  }

  // ===== Summary =====
  async function generateSummary(opts?: { silent?: boolean }) {
    if (generatingSummary) return;
    const transcript = sync.entries.map((e) => e.text).join(" ").trim();
    if (!transcript) {
      if (!opts?.silent) {
        toast.error("Transcrição vazia. Grave a aula ou cole o texto antes.");
      }
      return;
    }
    setGeneratingSummary(true);
    const t = opts?.silent ? null : toast.loading("Gerando resumo da aula...");
    try {
      const res = await fetch("/api/correlate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lectureTitle: lecture?.title,
          subject: subject?.name ?? "Geral",
          transcript,
          slides: slidesRef.current ?? undefined,
          messages: messagesRef.current.map(({ role, content }) => ({
            role,
            content,
            id: "",
            createdAt: "",
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.summary) {
        const msg = data?.error || `HTTP ${res.status}`;
        if (t) toast.error(`Erro: ${msg}`, { id: t });
        else toast.error(`Erro: ${msg}`);
        return;
      }
      const s: LectureSummary = data.summary;
      setSummary(s);
      // Grava na tabela summaries (source of truth)
      void upsertSummaryByLectureAsync({
        userId: user.id,
        subjectId: lecture?.subjectId ?? null,
        lectureId: lecture!.id,
        title: lecture?.title ?? "Resumo",
        content: s,
        images: s.images,
      }).catch((err) =>
        console.error("[lecture] summary upsert failed", err),
      );
      // Dispara geração de imagens em fire-and-forget (não bloqueia o toast).
      // Mesmo padrão usado em /lumi quando gera resumo via chat.
      if (lecture?.id && !s.images?.length) {
        void fetch("/api/ai/summary-images", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lectureId: lecture.id, count: 3 }),
          keepalive: true,
        }).catch((e) => console.warn("[lecture] summary-images failed", e));
      }
      if (t) toast.success("Resumo gerado.", { id: t });
      else toast.success("Resumo atualizado.");
      setView("summary");
    } catch (err) {
      const msg = (err as Error).message;
      if (t) toast.error(`Erro ao gerar resumo: ${msg}`, { id: t });
      else toast.error(`Erro ao gerar resumo: ${msg}`);
    } finally {
      setGeneratingSummary(false);
    }
  }

  // ===== Chat =====
  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    if (!lecture) return;
    const userMsg: ChatMessage = {
      id: generateId(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    appendMessageAsync(user.id, lecture.id, userMsg).catch((err) =>
      console.error("[lecture] appendMessage user failed", err),
    );
    setInput("");
    setSending(true);
    setStreamingReply("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          context: {
            lectureTitle: lecture.title,
            subject: subject?.name ?? "Geral",
            transcript: (
              sync.entries.map((e) => e.text).join(" ") +
              (interim ? " " + interim : "")
            ).trim(),
            slides: slides ?? undefined,
          },
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error("Resposta vazia.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        acc += chunk;
        setStreamingReply(acc);
      }
      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: stripChatFormatting(acc.trim()),
        createdAt: new Date().toISOString(),
      };
      const finalMessages = [...nextMessages, assistantMsg];
      setMessages(finalMessages);
      appendMessageAsync(user.id, lecture.id, assistantMsg).catch((err) =>
        console.error("[lecture] appendMessage assistant failed", err),
      );
      setStreamingReply("");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao consultar a IA. Verifique a configuração da ANTHROPIC_API_KEY.");
    } finally {
      setSending(false);
    }
  }

  // ===== Header handlers =====
  async function handleDelete() {
    if (!lecture) return;
    if (!confirm("Excluir esta aula? Esta ação não pode ser desfeita.")) return;
    try {
      await deleteLectureAsync(user.id, lecture.id);
      toast.success("Aula excluída.");
      router.replace("/gravacoes");
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    }
  }

  function handleShare() {
    if (typeof window === "undefined" || !lecture) return;
    const url = window.location.origin + `/lecture/${lecture.id}`;
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Link copiado!"))
      .catch(() => toast.error("Falha ao copiar link."));
  }

  function handleExportPdf() {
    if (!summary || !lecture) {
      toast.error("Gere o resumo antes de exportar.");
      return;
    }
    const md = summaryToMarkdown(lecture, subject, summary);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(lecture.title || "aula").replace(/[^\w\-]+/g, "_")}__resumo.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleNextAction(id: NextActionId) {
    if (!lecture) return;
    if (sync.entries.length === 0) {
      toast.error("Grave a aula primeiro pra gerar este conteúdo.");
      return;
    }
    setActionLoading(id);
    try {
      if (id === "summary") {
        await generateSummary();
      } else if (id === "flashcards") {
        router.push("/flashcards?new=1");
      } else if (id === "quiz") {
        router.push("/quiz?new=1");
      } else if (id === "mindmap") {
        router.push("/documentos?new=mapa");
      }
    } finally {
      setActionLoading(null);
    }
  }

  function handleJumpToSlide(idx: number) {
    setCurrentSlideIdx(idx);
    if (!showPdfBesides) setShowPdfBesides(true);
  }

  function handleSelectTopic(startSec: number) {
    if (audioPlayerRef.current) audioPlayerRef.current.seek(startSec);
    // Scroll handled by transcript column itself
  }

  function handlePlay(offsetSec: number) {
    if (audioPlayerRef.current) audioPlayerRef.current.seek(offsetSec);
  }

  // ===== Suggestions dinâmicas =====
  const suggestions = useMemo(() => {
    if (sync.insights?.keyTerms && sync.insights.keyTerms.length >= 2) {
      const terms = sync.insights.keyTerms.slice(0, 3);
      return [
        `Explique ${terms[0]}`,
        `Resuma os principais pontos sobre ${terms[1] ?? terms[0]}`,
        terms[2] ? `Como ${terms[2]} se relaciona com ${terms[0]}?` : SUGGESTED_PROMPTS[2],
        SUGGESTED_PROMPTS[3],
      ];
    }
    return SUGGESTED_PROMPTS;
  }, [sync.insights]);

  // ===== Stats =====
  const doubtsCount = useMemo(
    () => sync.entries.filter((e) => e.marker === "doubt").length,
    [sync.entries],
  );
  const transcribedPct = useMemo(() => {
    if (durationSec < 30) return 0;
    const expectedWords = (durationSec / 60) * 130; // ~130 palavras/min
    const actualWords = sync.entries
      .map((e) => e.text.split(/\s+/).length)
      .reduce((a, b) => a + b, 0);
    if (expectedWords <= 0) return 0;
    return Math.min(100, (actualWords / expectedWords) * 100);
  }, [sync.entries, durationSec]);

  // ===== Synced slide (último entry com slideIndex) =====
  const syncedSlideIdx = useMemo(() => {
    for (let i = sync.entries.length - 1; i >= 0; i--) {
      const s = sync.entries[i].slideIndex;
      if (typeof s === "number") return s;
    }
    return undefined;
  }, [sync.entries]);

  if (!lecture) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isLive = speech.state === "listening";
  const hasSlides = !!slides && slides.length > 0;
  const showSlidesColumn = hasSlides && showPdfBesides;

  return (
    <>
      <input
        ref={slidesInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleSlidesFile(f);
        }}
      />

      <LectureHeader
        title={lecture.title}
        subjectName={subject?.name}
        subjectColor={subject?.color}
        professorName={user.name}
        isLive={isLive}
        durationSec={durationSec}
        view={view}
        hasSummary={!!summary}
        generatingSummary={generatingSummary}
        onTitleChange={(t) => persist({ title: t })}
        onToggleRecording={toggleRecording}
        onChangeView={(v) => setView(v)}
        onSave={() => {
          persist({
            transcript: sync.entries.map((e) => e.text).join(" "),
            transcriptEntries: sync.entries,
            durationSec,
          });
          toast.success("Aula salva.");
        }}
        onGenerateSummary={view === "summary" ? () => generateSummary() : undefined}
        onShare={handleShare}
        onExportPdf={handleExportPdf}
        onDelete={handleDelete}
        onMove={() =>
          lecture &&
          setMoveTarget({
            kind: "lecture",
            id: lecture.id,
            title: lecture.title,
            currentSubjectId: lecture.subjectId ?? null,
            note: "Move a AULA INTEIRA (transcrição, resumo, flashcards, quiz, mapa) pra a nova matéria.",
          })
        }
        onBack={() => router.push("/gravacoes")}
      />

      <div className="mx-auto max-w-[1600px] px-4 py-5 space-y-5">
        {!browserSupported && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Reconhecimento de voz não disponível. Use Chrome, Edge ou Safari.
            </span>
          </div>
        )}
        {speech.error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-3 text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{speech.error}</span>
          </div>
        )}

        {view === "summary" ? (
          <SummaryPane
            lecture={lecture}
            subject={subject}
            summary={summary}
            slides={slides}
            generating={generatingSummary}
            onGenerate={() => generateSummary()}
            onDownload={handleExportPdf}
          />
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
              <LiveTranscriptColumn
                entries={sync.entries}
                interim={interim}
                isLive={isLive}
                keyTerms={sync.insights?.keyTerms ?? []}
                topics={sync.insights?.topics ?? []}
                hasAudio={!!audioUrl}
                search={search}
                activeFilter={activeFilter}
                revisedChapters={lecture.transcriptChapters?.chapters}
                onStructureRequest={structureTranscript}
                structuring={structuringTranscript}
                slidesCount={slides?.length ?? 0}
                onSyncSlides={syncSlides}
                syncingSlides={syncingSlides}
                summary={summary}
                generatingSummary={generatingSummary}
                onGenerateSummary={() => generateSummary()}
                onOpenSummaryFull={() => router.push(`/resumo/${lecture.id}`)}
                summaryEducational={lecture.summaryEducational}
                summaryImages={summary?.images}
                generatingEducational={generatingEducational}
                onGenerateEducational={generateEducationalSummary}
                onSearchChange={setSearch}
                onFilterChange={setActiveFilter}
                onPlay={handlePlay}
                onJumpToSlide={handleJumpToSlide}
                initialViewMode={initialTranscriptView}
              />

              <div className="space-y-4 min-w-0 lg:sticky lg:top-4 lg:self-start">
                <ChatColumn
                  messages={messages}
                  streamingReply={streamingReply}
                  suggestions={suggestions}
                  input={input}
                  onInputChange={setInput}
                  onSend={sendMessage}
                  sending={sending}
                />

                {showSlidesColumn && (
                  <SlidesColumn
                    slides={slides}
                    attaching={attaching}
                    showPdfBesides={showPdfBesides}
                    onTogglePdfBesides={setShowPdfBesides}
                    currentIdx={currentSlideIdx}
                    onSelect={setCurrentSlideIdx}
                    onAttachClick={() => slidesInputRef.current?.click()}
                    onRemove={removeSlides}
                    syncedSlideIdx={syncedSlideIdx}
                  />
                )}
              </div>
            </div>

            {!hasSlides && (
              <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-6 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-violet-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      Anexe os slides pra ativar a sincronização
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Cada frase será correlacionada com o slide aberto no momento.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => slidesInputRef.current?.click()}
                  variant="gradient"
                  size="sm"
                  disabled={attaching}
                >
                  {attaching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Anexar PDF"
                  )}
                </Button>
              </div>
            )}

            {audioUrl && !isLive && (
              <CollapsibleSection
                id={`audio-${lectureId}`}
                title="Áudio da aula"
                subtitle={`${formatDuration(durationSec)} · ouvir + navegar`}
                icon={<Headphones className="h-4 w-4" />}
                defaultOpen={false}
              >
                <AudioPlayer src={audioUrl} initialDurationSec={durationSec} />
              </CollapsibleSection>
            )}

            <CollapsibleSection
              id={`insights-${lectureId}`}
              title="Insights da aula"
              subtitle="Pontos-chave, tópicos, próximos passos e estatísticas"
              icon={<Lightbulb className="h-4 w-4" />}
              defaultOpen={false}
              badge={
                sync.insights?.keyTerms.length ? (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {sync.insights.keyTerms.length} termos · {sync.insights.topics?.length ?? 0} tópicos
                  </span>
                ) : null
              }
            >
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
                <KeyPointsCard
                  terms={sync.insights?.keyTerms ?? []}
                  activeTerm={search || undefined}
                  onSelectTerm={(t) => setSearch(t)}
                />
                <TopicsListCard
                  topics={sync.insights?.topics ?? []}
                  onSelect={handleSelectTopic}
                />
                <NextActionsCard
                  loading={actionLoading}
                  onAction={handleNextAction}
                  disabled={sync.entries.length === 0}
                />
                <StatsCard
                  slidesCount={slides?.length ?? 0}
                  durationSec={durationSec}
                  transcribedPct={transcribedPct}
                  doubtsCount={doubtsCount}
                />
              </div>
            </CollapsibleSection>

            {audioUploading && (
              <div className="text-xs text-muted-foreground text-center inline-flex items-center justify-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Salvando áudio na nuvem...
              </div>
            )}
            {audioRecording && (
              <div className="text-xs text-rose-600 dark:text-rose-400 text-center font-medium">
                ● Gravando áudio em paralelo à transcrição
              </div>
            )}
          </>
        )}
      </div>
      <TranscribingOverlay lectureId={lectureId} />

      {/* Mover aula inteira pra outra matéria */}
      <MoveToFolderDialog
        open={!!moveTarget}
        onOpenChange={(open) => {
          if (!open) setMoveTarget(null);
        }}
        userId={user.id}
        subjects={subjects}
        target={moveTarget}
        onMoved={async () => {
          setMoveTarget(null);
          // Reload subject + lecture pra refletir a nova pasta no header.
          const l = await getLectureAsync(user.id, lectureId);
          if (l) {
            setLecture(l);
            const s = await getSubjectAsync(user.id, l.subjectId);
            setSubject(s);
          }
        }}
      />
    </>
  );
}

function SummaryPane({
  lecture,
  subject,
  summary,
  slides,
  generating,
  onGenerate,
  onDownload,
}: {
  lecture: Lecture;
  subject: Subject | null;
  summary: LectureSummary | undefined;
  slides: Slide[] | undefined;
  generating: boolean;
  onGenerate: () => void;
  onDownload: () => void;
}) {
  if (generating && !summary) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card p-12 text-center">
        <div className="flex justify-center mb-3">
          <LumiScene scene="funnel-summary" className="w-[280px]" float />
        </div>
        <h3 className="text-base font-semibold">Gerando resumo da aula...</h3>
        <p className="text-sm text-muted-foreground mt-2">
          O Lumi tá correlacionando a transcrição
          {slides && slides.length > 0 ? `, os ${slides.length} slides` : ""}
          {lecture.messages.length > 0 ? " e as perguntas do chat" : ""}.
        </p>
        <p className="mt-3 font-mono text-xs text-muted-foreground/70">
          {formatDuration(lecture.durationSec)}
        </p>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-12 text-center">
        <div className="flex justify-center mb-3">
          <LumiCharacter mood="thinking" size="lg" float />
        </div>
        <h3 className="text-base font-semibold">Nenhum resumo ainda</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          O resumo é gerado automaticamente quando você para a gravação.
          Você também pode gerar manualmente.
        </p>
        <Button
          onClick={onGenerate}
          variant="gradient"
          size="lg"
          className="mt-6"
          disabled={generating}
        >
          <Sparkles className="h-4 w-4" /> Gerar resumo agora
        </Button>
      </div>
    );
  }
  return (
    <LectureSummaryView
      lecture={lecture}
      subject={subject}
      summary={summary}
      slides={slides}
      onDownloadMarkdown={onDownload}
    />
  );
}
