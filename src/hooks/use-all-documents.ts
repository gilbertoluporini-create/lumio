"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listLecturesAsync,
  listSubjectsAsync,
} from "@/lib/db";
import { listDocumentsAsync } from "@/lib/documents";
import { listSummariesAsync } from "@/lib/summaries";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  Document as LumioDocument,
  Lecture,
  Subject,
  Summary,
} from "@/lib/types";

export type DocumentKind =
  | "transcription"
  | "summary"
  | "flashcards"
  | "quiz"
  | "mindmap"
  | "pdf-upload";

export type DocumentOrigin = "upload" | "lumio";

export type DocumentItem = {
  id: string;
  kind: DocumentKind;
  title: string;
  subjectId: string | null;
  subjectName: string | null;
  origin: DocumentOrigin;
  date: string;
  href: string;
  /** ID da aula original quando aplicável (transcrição, slide, summary de aula) */
  lectureId: string;
  /** ID do documento original (PDF) quando aplicável */
  documentId?: string;
  meta?: string;
};

type AssetRow = {
  id: string;
  lecture_id: string;
  user_id: string;
  kind: "summary" | "flashcards" | "quiz" | "mindmap";
  payload: Record<string, unknown> | null;
  coins_spent: number;
  created_at: string;
  updated_at: string;
};

export type UseAllDocumentsState = {
  documents: DocumentItem[];
  subjects: Subject[];
  lectures: Lecture[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const DOC_KIND_LABEL: Record<DocumentKind, string> = {
  transcription: "Transcrição",
  summary: "Resumo",
  flashcards: "Flashcards",
  quiz: "Quiz",
  mindmap: "Mapa mental",
  "pdf-upload": "PDF",
};

export function getDocumentKindLabel(kind: DocumentKind): string {
  return DOC_KIND_LABEL[kind];
}

export function useAllDocuments(userId: string): UseAllDocumentsState {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [docsTable, setDocsTable] = useState<LumioDocument[]>([]);
  const [summariesTable, setSummariesTable] = useState<Summary[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const [s, l, d, sm] = await Promise.all([
          listSubjectsAsync(userId),
          listLecturesAsync(userId),
          listDocumentsAsync(userId),
          listSummariesAsync(userId),
        ]);
        if (!active) return;

        let rows: AssetRow[] = [];
        if (isSupabaseConfigured()) {
          try {
            const supabase = createClient();
            const { data, error: assetErr } = await supabase
              .from("lecture_assets")
              .select(
                "id, lecture_id, user_id, kind, payload, coins_spent, created_at, updated_at",
              )
              .eq("user_id", userId)
              .order("created_at", { ascending: false });
            if (assetErr) {
              console.warn("[useAllDocuments] assets fetch error", assetErr);
            } else {
              rows = (data ?? []) as AssetRow[];
            }
          } catch (err) {
            console.warn("[useAllDocuments] assets fetch threw", err);
          }
        }

        if (!active) return;
        setSubjects(s);
        setLectures(l);
        setDocsTable(d);
        setSummariesTable(sm);
        setAssets(rows);
      } catch (err) {
        if (!active) return;
        setError((err as Error).message ?? "Erro carregando documentos");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [userId, tick]);

  const documents = useMemo<DocumentItem[]>(() => {
    if (
      lectures.length === 0 &&
      assets.length === 0 &&
      docsTable.length === 0 &&
      summariesTable.length === 0
    )
      return [];

    const subjectById = new Map<string, Subject>(subjects.map((s) => [s.id, s]));
    const lectureById = new Map<string, Lecture>(lectures.map((l) => [l.id, l]));
    const docById = new Map<string, LumioDocument>(
      docsTable.map((d) => [d.id, d]),
    );

    const docs: DocumentItem[] = [];

    // PDFs uploadados standalone (tabela documents)
    for (const d of docsTable) {
      const subject = d.subjectId ? subjectById.get(d.subjectId) : null;
      docs.push({
        id: `document:${d.id}`,
        kind: "pdf-upload",
        title: d.title,
        subjectId: subject?.id ?? null,
        subjectName: subject?.name ?? null,
        origin: "upload",
        date: d.updatedAt ?? d.createdAt,
        href: `/document/${d.id}`,
        lectureId: "",
        documentId: d.id,
        meta: d.pageCount
          ? `${d.pageCount} ${d.pageCount === 1 ? "página" : "páginas"}`
          : "PDF",
      });
    }

    // Resumos da nova tabela summaries (lectures E documents)
    for (const sm of summariesTable) {
      const subject = sm.subjectId ? subjectById.get(sm.subjectId) : null;
      if (sm.source.kind === "lecture") {
        const sourceLec = lectureById.get(sm.source.lectureId);
        const baseTitle = sm.title ?? sourceLec?.title ?? "Resumo";
        docs.push({
          id: `summary:${sm.id}`,
          kind: "summary",
          title: `Resumo — ${baseTitle}`,
          subjectId: subject?.id ?? null,
          subjectName: subject?.name ?? null,
          origin: "lumio",
          date: sm.updatedAt ?? sm.createdAt,
          href: `/resumo/${sm.source.lectureId}`,
          lectureId: sm.source.lectureId,
        });
      } else {
        const sourceDoc = docById.get(sm.source.documentId);
        const baseTitle = sm.title ?? sourceDoc?.title ?? "Resumo";
        docs.push({
          id: `summary:${sm.id}`,
          kind: "summary",
          title: `Resumo — ${baseTitle}`,
          subjectId: subject?.id ?? null,
          subjectName: subject?.name ?? null,
          origin: "lumio",
          date: sm.updatedAt ?? sm.createdAt,
          href: `/resumo/doc/${sm.id}`,
          lectureId: "",
          documentId: sm.source.documentId,
        });
      }
    }

    for (const l of lectures) {
      const subject = l.subjectId ? subjectById.get(l.subjectId) : null;
      const subjectId = subject?.id ?? null;
      const subjectName = subject?.name ?? null;
      const hasTranscript = (l.transcript ?? "").trim().length > 0;

      if (hasTranscript) {
        docs.push({
          id: `lecture-transcript:${l.id}`,
          kind: "transcription",
          title: l.title || "Aula sem título",
          subjectId,
          subjectName,
          origin: "lumio",
          date: l.updatedAt ?? l.createdAt,
          href: `/lecture/${l.id}?tab=transcript`,
          lectureId: l.id,
          meta: l.durationSec
            ? `${Math.max(1, Math.round(l.durationSec / 60))} min`
            : undefined,
        });
      }

      if (Array.isArray(l.slides) && l.slides.length > 0) {
        docs.push({
          id: `lecture-slides:${l.id}`,
          kind: "pdf-upload",
          title: l.slidesFileName || `Slides — ${l.title}`,
          subjectId,
          subjectName,
          origin: "upload",
          date: l.slidesAddedAt ?? l.updatedAt ?? l.createdAt,
          href: `/lecture/${l.id}?tab=slides`,
          lectureId: l.id,
          meta: `${l.slides.length} slide${l.slides.length === 1 ? "" : "s"}`,
        });
      }
    }

    for (const a of assets) {
      const parent = lectureById.get(a.lecture_id);
      const subject = parent?.subjectId ? subjectById.get(parent.subjectId) : null;
      const subjectId = subject?.id ?? null;
      const subjectName = subject?.name ?? null;
      const baseTitle = parent?.title ?? "Documento";
      const payload = (a.payload ?? {}) as Record<string, unknown>;

      let title = baseTitle;
      let href = `/lecture/${a.lecture_id}`;
      let kind: DocumentKind = "summary";
      let meta: string | undefined;

      // Summaries da nova tabela já cobrem resumos — skip o asset legacy "summary"
      if (a.kind === "summary") {
        continue;
      } else if (a.kind === "flashcards") {
        kind = "flashcards";
        const cards = Array.isArray(
          (payload as { cards?: unknown[] }).cards,
        )
          ? ((payload as { cards: unknown[] }).cards as unknown[])
          : [];
        title = `Deck — ${baseTitle}`;
        href = `/deck/${a.id}`;
        meta = `${cards.length} card${cards.length === 1 ? "" : "s"}`;
      } else if (a.kind === "quiz") {
        kind = "quiz";
        const questions = Array.isArray(
          (payload as { questions?: unknown[] }).questions,
        )
          ? ((payload as { questions: unknown[] }).questions as unknown[])
          : [];
        title = `Quiz — ${baseTitle}`;
        href = `/quiz-banco/${a.id}`;
        meta = `${questions.length} questão${questions.length === 1 ? "" : "ões"}`;
      } else if (a.kind === "mindmap") {
        kind = "mindmap";
        title = `Mapa — ${baseTitle}`;
        href = `/mapa/${a.id}`;
      }

      docs.push({
        id: `asset:${a.id}`,
        kind,
        title,
        subjectId,
        subjectName,
        origin: "lumio",
        date: a.updated_at ?? a.created_at,
        href,
        lectureId: a.lecture_id,
        meta,
      });
    }

    docs.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
    return docs;
  }, [lectures, assets, docsTable, summariesTable, subjects]);

  return {
    documents,
    subjects,
    lectures,
    loading,
    error,
    refresh,
  };
}
