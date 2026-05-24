"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  FileText,
  Layers,
  Loader2,
  Network,
  Search,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLectureAsync, listLecturesAsync } from "@/lib/db";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { ChatAttachment } from "@/lib/lumi-chats";
import type { Lecture } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "lectures" | "summaries" | "flashcards" | "mindmaps";

type AssetRow = {
  id: string;
  lecture_id: string;
  kind: "summary" | "flashcards" | "quiz" | "mindmap";
  payload: Record<string, unknown> | null;
  created_at: string;
};

type Props = {
  open: boolean;
  userId: string;
  onClose: () => void;
  onPick: (attachment: ChatAttachment) => void;
};

const TABS: { id: Tab; label: string; Icon: typeof FileText }[] = [
  { id: "lectures", label: "Aulas", Icon: FileText },
  { id: "summaries", label: "Resumos", Icon: Sparkles },
  { id: "flashcards", label: "Flashcards", Icon: Layers },
  { id: "mindmaps", label: "Mapas mentais", Icon: Network },
];

function flashcardsToText(payload: Record<string, unknown> | null): string {
  if (!payload) return "";
  const cards = (payload as { cards?: Array<{ question?: string; answer?: string }> })
    .cards;
  if (!Array.isArray(cards)) return "";
  return cards
    .map((c, i) => `Q${i + 1}: ${c.question ?? ""}\nA: ${c.answer ?? ""}`)
    .join("\n\n");
}

function mindmapToText(payload: Record<string, unknown> | null): string {
  if (!payload) return "";
  const central = (payload as { centralTopic?: string }).centralTopic ?? "";
  const branches = (payload as {
    branches?: Array<{
      label?: string;
      detail?: string;
      children?: Array<{ label?: string; children?: Array<{ label?: string }> }>;
    }>;
  }).branches;
  const lines: string[] = [];
  if (central) lines.push(`Tema central: ${central}`);
  if (Array.isArray(branches)) {
    for (const b of branches) {
      lines.push(`- ${b.label ?? ""}${b.detail ? ` (${b.detail})` : ""}`);
      if (Array.isArray(b.children)) {
        for (const c of b.children) {
          lines.push(`  · ${c.label ?? ""}`);
          if (Array.isArray(c.children)) {
            for (const d of c.children) {
              lines.push(`    - ${d.label ?? ""}`);
            }
          }
        }
      }
    }
  }
  return lines.join("\n");
}

function summaryPayloadToText(payload: Record<string, unknown> | null): string {
  if (!payload) return "";
  const md = (payload as { markdown?: string }).markdown;
  if (typeof md === "string" && md.trim().length > 0) return md;
  const general = (payload as { generalSummary?: string }).generalSummary;
  if (typeof general === "string" && general.trim().length > 0) return general;
  return "";
}

export function LumiAttachmentPicker({ open, userId, onClose, onPick }: Props) {
  const [tab, setTab] = useState<Tab>("lectures");
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    async function load() {
      try {
        const ls = await listLecturesAsync(userId);
        if (!active) return;
        setLectures(ls);
        if (isSupabaseConfigured()) {
          const supabase = createClient();
          const { data } = await supabase
            .from("lecture_assets")
            .select("id, lecture_id, kind, payload, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
          if (!active) return;
          setAssets((data ?? []) as AssetRow[]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [open, userId]);

  const lectureById = useMemo(() => {
    const m = new Map<string, Lecture>();
    for (const l of lectures) m.set(l.id, l);
    return m;
  }, [lectures]);

  const filteredLectures = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lectures.filter((l) => {
      const hasTranscript = (l.transcript ?? "").trim().length > 0;
      if (!hasTranscript) return false;
      if (!q) return true;
      return l.title.toLowerCase().includes(q);
    });
  }, [lectures, query]);

  const filteredAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    const kindFilter: AssetRow["kind"] | null =
      tab === "summaries"
        ? "summary"
        : tab === "flashcards"
          ? "flashcards"
          : tab === "mindmaps"
            ? "mindmap"
            : null;
    if (!kindFilter) return [];
    return assets
      .filter((a) => a.kind === kindFilter)
      .filter((a) => {
        if (!q) return true;
        const parent = lectureById.get(a.lecture_id);
        return (parent?.title ?? "").toLowerCase().includes(q);
      });
  }, [assets, tab, query, lectureById]);

  const handlePickLecture = useCallback(
    async (lecture: Lecture) => {
      setPicking(lecture.id);
      try {
        const full = await getLectureAsync(userId, lecture.id);
        const transcript = (full?.transcript ?? lecture.transcript ?? "").trim();
        if (!transcript) return;
        const sizeKb = Math.max(1, Math.round(transcript.length / 1024));
        onPick({
          id: `doc-lecture-${lecture.id}`,
          kind: "document",
          name: `Aula: ${lecture.title}`,
          sizeKb,
          content: transcript,
          contentType: "text/transcript",
        });
        onClose();
      } finally {
        setPicking(null);
      }
    },
    [onClose, onPick, userId],
  );

  const handlePickAsset = useCallback(
    (asset: AssetRow) => {
      setPicking(asset.id);
      try {
        const parent = lectureById.get(asset.lecture_id);
        const baseTitle = parent?.title ?? "Documento";
        let content = "";
        let prefix = "";
        if (asset.kind === "summary") {
          content = summaryPayloadToText(asset.payload);
          prefix = "Resumo";
        } else if (asset.kind === "flashcards") {
          content = flashcardsToText(asset.payload);
          prefix = "Deck";
        } else if (asset.kind === "mindmap") {
          content = mindmapToText(asset.payload);
          prefix = "Mapa";
        }
        if (!content.trim()) return;
        const sizeKb = Math.max(1, Math.round(content.length / 1024));
        onPick({
          id: `doc-asset-${asset.id}`,
          kind: "document",
          name: `${prefix}: ${baseTitle}`,
          sizeKb,
          content,
          contentType: `application/${asset.kind}`,
        });
        onClose();
      } finally {
        setPicking(null);
      }
    },
    [lectureById, onClose, onPick],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Anexar dos meus documentos</DialogTitle>
          <DialogDescription>
            Escolha uma aula, resumo, deck ou mapa mental pra usar como contexto.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  tab === t.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/60 bg-secondary/30 text-muted-foreground hover:text-foreground",
                )}
              >
                <t.Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar pelo título..."
              className="pl-9"
            />
          </div>

          <div className="max-h-[360px] overflow-y-auto rounded-xl border border-border/60 bg-background/40">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Carregando...
              </div>
            ) : tab === "lectures" ? (
              filteredLectures.length === 0 ? (
                <EmptyRow label="Nenhuma aula com transcrição encontrada." />
              ) : (
                <ul className="divide-y divide-border/40">
                  {filteredLectures.map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => void handlePickLecture(l)}
                        disabled={picking === l.id}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/40 disabled:opacity-60"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">
                            {l.title}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {Math.max(1, Math.round((l.transcript?.length ?? 0) / 1024))} KB
                            · transcrição
                          </div>
                        </div>
                        {picking === l.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Check className="h-4 w-4 text-muted-foreground/40" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : filteredAssets.length === 0 ? (
              <EmptyRow
                label={
                  tab === "summaries"
                    ? "Nenhum resumo gerado ainda."
                    : tab === "flashcards"
                      ? "Nenhum deck de flashcards encontrado."
                      : "Nenhum mapa mental encontrado."
                }
              />
            ) : (
              <ul className="divide-y divide-border/40">
                {filteredAssets.map((a) => {
                  const parent = lectureById.get(a.lecture_id);
                  const Icon =
                    a.kind === "summary"
                      ? Sparkles
                      : a.kind === "flashcards"
                        ? Layers
                        : Network;
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => handlePickAsset(a)}
                        disabled={picking === a.id}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/40 disabled:opacity-60"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">
                            {parent?.title ?? "Documento"}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {a.kind === "summary"
                              ? "Resumo"
                              : a.kind === "flashcards"
                                ? "Deck"
                                : "Mapa mental"}
                          </div>
                        </div>
                        {picking === a.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Check className="h-4 w-4 text-muted-foreground/40" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="py-10 text-center text-xs text-muted-foreground">
      {label}
    </div>
  );
}
