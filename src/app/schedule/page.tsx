"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, Loader2, MapPin, Palette, Plus } from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { LumiScene } from "@/components/brand/lumi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listSubjectsAsync, updateSubjectColorAsync } from "@/lib/db";
import {
  DAY_LABELS_LONG,
  DAY_LABELS_SHORT,
  SUBJECT_PALETTE,
  type ScheduleSlot,
  type Subject,
  type User,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function SchedulePage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <ScheduleView user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

type Block = {
  subjectId: string;
  subjectName: string;
  subjectColor: string;
  slot: ScheduleSlot;
};

const START_HOUR = 7; // 7h
const END_HOUR = 23; // 23h
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
const PIXELS_PER_MINUTE = 0.9; // 54px por hora

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function ScheduleView({ user }: { user: User }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [recoloring, setRecoloring] = useState(false);

  useEffect(() => {
    let active = true;
    listSubjectsAsync(user.id)
      .then((rows) => {
        if (active) setSubjects(rows);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user.id]);

  const allSameColor =
    subjects.length > 1 &&
    subjects.every((s) => s.color === subjects[0].color);

  async function diversifyColors() {
    if (recoloring) return;
    setRecoloring(true);
    const t = toast.loading("Diversificando cores…");
    try {
      const updates = subjects.map((s, idx) => ({
        id: s.id,
        color: SUBJECT_PALETTE[idx % SUBJECT_PALETTE.length].color,
      }));
      await Promise.all(
        updates.map((u) => updateSubjectColorAsync(user.id, u.id, u.color)),
      );
      setSubjects((prev) =>
        prev.map((s) => {
          const next = updates.find((u) => u.id === s.id);
          return next ? { ...s, color: next.color } : s;
        }),
      );
      toast.success("Cores atualizadas!", { id: t });
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`, { id: t });
    } finally {
      setRecoloring(false);
    }
  }

  const blocksByDay = useMemo(() => {
    const map: Record<number, Block[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const s of subjects) {
      for (const slot of s.schedule ?? []) {
        const dow = slot.dayOfWeek;
        if (dow < 0 || dow > 6) continue;
        map[dow].push({
          subjectId: s.id,
          subjectName: s.name,
          subjectColor: s.color,
          slot,
        });
      }
    }
    for (const dow of Object.keys(map)) {
      map[Number(dow)].sort(
        (a, b) => timeToMinutes(a.slot.startTime) - timeToMinutes(b.slot.startTime),
      );
    }
    return map;
  }, [subjects]);

  const totalSlots = useMemo(
    () => Object.values(blocksByDay).reduce((acc, arr) => acc + arr.length, 0),
    [blocksByDay],
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-5">
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-3 py-1 text-xs mb-2">
            <Calendar className="h-3 w-3 text-primary" />
            Cronograma semanal
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Sua semana de estudos
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {totalSlots > 0
              ? `${totalSlots} aula${totalSlots === 1 ? "" : "s"} cadastrada${totalSlots === 1 ? "" : "s"} em ${subjects.filter((s) => (s.schedule ?? []).length > 0).length} matéria${subjects.filter((s) => (s.schedule ?? []).length > 0).length === 1 ? "" : "s"}.`
              : "Nenhum horário cadastrado ainda."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {subjects.length > 1 && (
            <Button
              variant={allSameColor ? "default" : "outline"}
              size="sm"
              onClick={diversifyColors}
              disabled={recoloring}
              title="Reatribui uma cor distinta da palette pra cada matéria"
            >
              {recoloring ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Palette className="h-4 w-4" />
              )}
              Diversificar cores
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">Voltar ao dashboard</Link>
          </Button>
        </div>
      </div>

      {totalSlots === 0 ? (
        <EmptyState />
      ) : (
        <WeekGrid blocksByDay={blocksByDay} />
      )}

      {/* Lista resumida abaixo da grade (mobile-friendly) */}
      {totalSlots > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">
            Por matéria
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {subjects
              .filter((s) => (s.schedule ?? []).length > 0)
              .map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-border/60 bg-card p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className={cn(
                        "h-3 w-3 rounded-full bg-gradient-to-br shrink-0",
                        s.color,
                      )}
                    />
                    <span className="font-medium text-sm">{s.name}</span>
                    <Badge variant="secondary" className="text-[10px] ml-auto">
                      {(s.schedule ?? []).length}x/semana
                    </Badge>
                  </div>
                  <div className="space-y-1.5">
                    {(s.schedule ?? [])
                      .slice()
                      .sort(
                        (a, b) =>
                          a.dayOfWeek - b.dayOfWeek ||
                          timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
                      )
                      .map((slot, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 text-xs text-muted-foreground"
                        >
                          <span className="font-medium text-foreground w-12">
                            {DAY_LABELS_SHORT[slot.dayOfWeek]}
                          </span>
                          <span className="font-mono">
                            {slot.startTime}–{slot.endTime}
                          </span>
                          {slot.room && (
                            <span className="flex items-center gap-1 text-[11px]">
                              <MapPin className="h-3 w-3" />
                              {slot.room}
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-12 text-center">
      <div className="flex justify-center mb-2">
        <LumiScene scene="calendar" className="w-[240px]" float />
      </div>
      <h3 className="text-lg font-semibold">Nenhum horário cadastrado</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
        Suba sua grade horária no onboarding — o Lumi extrai os horários automaticamente. Você também pode editar manualmente depois.
      </p>
      <Button asChild variant="gradient" size="lg" className="mt-6">
        <Link href="/onboarding">
          <Plus className="h-4 w-4" /> Subir grade horária
        </Link>
      </Button>
    </div>
  );
}

function WeekGrid({ blocksByDay }: { blocksByDay: Record<number, Block[]> }) {
  // Dias visíveis: seg-sex por padrão. Se houver aulas no fim de semana, mostra também.
  const hasWeekend =
    (blocksByDay[0]?.length ?? 0) > 0 || (blocksByDay[6]?.length ?? 0) > 0;
  const visibleDays = hasWeekend ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];

  const totalMinutes = (END_HOUR - START_HOUR) * 60;
  const gridHeight = totalMinutes * PIXELS_PER_MINUTE;

  return (
    <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `60px repeat(${visibleDays.length}, minmax(0, 1fr))`,
        }}
      >
        {/* Header row */}
        <div className="border-b border-border/60 bg-card/60" />
        {visibleDays.map((dow) => (
          <div
            key={dow}
            className="border-b border-l border-border/60 bg-card/60 px-3 py-2 text-center"
          >
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {DAY_LABELS_SHORT[dow]}
            </div>
            <div className="text-[10px] text-muted-foreground/70 mt-0.5">
              {DAY_LABELS_LONG[dow]}
            </div>
          </div>
        ))}

        {/* Hours col + day cols */}
        <div className="relative" style={{ height: gridHeight }}>
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute left-0 right-0 text-[10px] font-mono text-muted-foreground/70 pr-1.5 text-right"
              style={{ top: (h - START_HOUR) * 60 * PIXELS_PER_MINUTE }}
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {visibleDays.map((dow) => (
          <div
            key={dow}
            className="relative border-l border-border/60"
            style={{ height: gridHeight }}
          >
            {/* Hour lines */}
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 border-t border-border/30"
                style={{ top: (h - START_HOUR) * 60 * PIXELS_PER_MINUTE }}
              />
            ))}

            {/* Blocks */}
            {blocksByDay[dow].map((block, idx) => {
              const startMin = timeToMinutes(block.slot.startTime);
              const endMin = timeToMinutes(block.slot.endTime);
              const top = (startMin - START_HOUR * 60) * PIXELS_PER_MINUTE;
              const height = Math.max(
                24,
                (endMin - startMin) * PIXELS_PER_MINUTE,
              );
              return (
                <div
                  key={idx}
                  className={cn(
                    "absolute left-1 right-1 rounded-md bg-gradient-to-br text-white shadow-sm p-1.5 overflow-hidden ring-1 ring-white/10",
                    block.subjectColor,
                  )}
                  style={{ top, height }}
                  title={`${block.subjectName} · ${block.slot.startTime}–${block.slot.endTime}${block.slot.room ? " · " + block.slot.room : ""}`}
                >
                  <div className="text-[11px] font-semibold leading-tight truncate">
                    {block.subjectName}
                  </div>
                  <div className="text-[10px] opacity-90 font-mono mt-0.5">
                    {block.slot.startTime}–{block.slot.endTime}
                  </div>
                  {block.slot.room && height > 50 && (
                    <div className="text-[10px] opacity-80 mt-0.5 truncate flex items-center gap-1">
                      <MapPin className="h-2.5 w-2.5" />
                      {block.slot.room}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
