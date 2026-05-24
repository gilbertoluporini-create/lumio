"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { generateId } from "@/lib/utils";
import type {
  TranscriptEntry,
  TranscriptInsights,
  TranscriptMarker,
  TranscriptSpeaker,
  TranscriptTopic,
} from "@/lib/types";

const CLASSIFY_BATCH_INTERVAL_MS = 30_000;
const INSIGHTS_INTERVAL_MS = 60_000;
const MIN_TRANSCRIPT_FOR_INSIGHTS = 300;

export type UseTranscriptSyncOptions = {
  initialEntries?: TranscriptEntry[];
  initialInsights?: TranscriptInsights;
  currentSlideIndexRef: React.MutableRefObject<number | undefined>;
  durationRef: React.MutableRefObject<number>;
  onPersist: (
    entries: TranscriptEntry[],
    insights?: TranscriptInsights,
  ) => void;
};

export function useTranscriptSync(opts: UseTranscriptSyncOptions) {
  const { initialEntries, initialInsights } = opts;
  const [entries, setEntries] = useState<TranscriptEntry[]>(
    initialEntries ?? [],
  );
  const [insights, setInsights] = useState<TranscriptInsights | undefined>(
    initialInsights,
  );

  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const { onPersist } = opts;
  const onPersistRef = useRef(onPersist);
  useEffect(() => {
    onPersistRef.current = onPersist;
  }, [onPersist]);

  const currentSlideIndexRef = opts.currentSlideIndexRef;
  const durationRef = opts.durationRef;

  const lastClassifyAtRef = useRef(0);
  const lastInsightsAtRef = useRef(0);
  const pendingPersistRef = useRef(false);

  const addFinal = useCallback(
    (text: string) => {
      const cleaned = text.trim().replace(/\s+/g, " ");
      if (!cleaned) return;
      const endSec = durationRef.current;
      const prevLast = entriesRef.current[entriesRef.current.length - 1];
      const startSec = prevLast ? prevLast.endSec : Math.max(0, endSec - 3);
      const entry: TranscriptEntry = {
        id: generateId(),
        startSec,
        endSec,
        speaker: "professor",
        text: cleaned,
        slideIndex: currentSlideIndexRef.current,
        audioOffsetSec: startSec,
      };
      setEntries((prev) => [...prev, entry]);
      pendingPersistRef.current = true;
    },
    [currentSlideIndexRef, durationRef],
  );

  const updateEntry = useCallback(
    (id: string, patch: Partial<TranscriptEntry>) => {
      setEntries((prev) => {
        const next = prev.map((e) => (e.id === id ? { ...e, ...patch } : e));
        pendingPersistRef.current = true;
        return next;
      });
    },
    [],
  );

  const setSpeaker = useCallback(
    (id: string, speaker: TranscriptSpeaker) => {
      updateEntry(id, { speaker });
    },
    [updateEntry],
  );

  const setMarker = useCallback(
    (id: string, marker: TranscriptMarker | undefined) => {
      updateEntry(id, { marker });
    },
    [updateEntry],
  );

  const replaceAll = useCallback((next: TranscriptEntry[]) => {
    setEntries(next);
    pendingPersistRef.current = true;
  }, []);

  // Persist debounce
  useEffect(() => {
    if (!pendingPersistRef.current) return;
    const t = setTimeout(() => {
      pendingPersistRef.current = false;
      onPersistRef.current(entriesRef.current, insights);
    }, 1500);
    return () => clearTimeout(t);
  }, [entries, insights]);

  // Background classify
  const classifyRecent = useCallback(async () => {
    const now = Date.now();
    if (now - lastClassifyAtRef.current < 5_000) return;
    const pending = entriesRef.current
      .filter((e) => !e.marker)
      .slice(-12);
    if (pending.length < 2) return;
    lastClassifyAtRef.current = now;
    try {
      const res = await fetch("/api/ai/transcript-classify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entries: pending.map((e) => ({ id: e.id, text: e.text })),
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        classifications?: { id: string; marker: TranscriptMarker | null }[];
      };
      if (!Array.isArray(data.classifications)) return;
      setEntries((prev) => {
        const byId = new Map(
          data.classifications!.map((c) => [c.id, c.marker]),
        );
        return prev.map((e) => {
          if (e.marker) return e;
          const m = byId.get(e.id);
          if (m) return { ...e, marker: m };
          return e;
        });
      });
      pendingPersistRef.current = true;
    } catch {
      /* swallow */
    }
  }, []);

  const refreshInsights = useCallback(
    async (lectureTitle?: string) => {
      const now = Date.now();
      if (now - lastInsightsAtRef.current < 10_000) return;
      const transcript = entriesRef.current.map((e) => e.text).join(" ");
      if (transcript.length < MIN_TRANSCRIPT_FOR_INSIGHTS) return;
      lastInsightsAtRef.current = now;
      try {
        const res = await fetch("/api/ai/transcript-insights", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            transcript,
            durationSec: durationRef.current,
            lectureTitle,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          keyTerms?: string[];
          topics?: TranscriptTopic[];
        };
        const next: TranscriptInsights = {
          keyTerms: Array.isArray(data.keyTerms) ? data.keyTerms : [],
          topics: Array.isArray(data.topics) ? data.topics : [],
          updatedAt: new Date().toISOString(),
        };
        setInsights(next);
        pendingPersistRef.current = true;
      } catch {
        /* swallow */
      }
    },
    [durationRef],
  );

  // Cadence timers
  useEffect(() => {
    const classifyTimer = window.setInterval(() => {
      void classifyRecent();
    }, CLASSIFY_BATCH_INTERVAL_MS);
    const insightsTimer = window.setInterval(() => {
      void refreshInsights();
    }, INSIGHTS_INTERVAL_MS);
    return () => {
      window.clearInterval(classifyTimer);
      window.clearInterval(insightsTimer);
    };
  }, [classifyRecent, refreshInsights]);

  return {
    entries,
    insights,
    addFinal,
    updateEntry,
    setSpeaker,
    setMarker,
    replaceAll,
    classifyNow: classifyRecent,
    refreshInsightsNow: refreshInsights,
  };
}
