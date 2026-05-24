"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, ChevronDown, Sparkles } from "lucide-react";
import { resolveSubjectIcon } from "@/lib/subject-icon";
import { cn } from "@/lib/utils";
import type { Lecture, Subject } from "@/lib/types";

export type LumiContext = {
  subjectId?: string;
  subjectName?: string;
  lectureId?: string;
  lectureTitle?: string;
};

type Props = {
  subjects: Subject[];
  lectures: Lecture[];
  value: LumiContext;
  onChange: (next: LumiContext) => void;
};

export function LumiContextPicker({
  subjects,
  lectures,
  value,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const grouped = useMemo(() => {
    const map = new Map<string, Lecture[]>();
    for (const l of lectures) {
      const key = l.subjectId || "__none";
      const arr = map.get(key) ?? [];
      arr.push(l);
      map.set(key, arr);
    }
    return map;
  }, [lectures]);

  const subjectsSorted = useMemo(
    () => [...subjects].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [subjects],
  );

  const label = value.lectureTitle
    ? `${value.subjectName ?? "Geral"} · ${value.lectureTitle}`
    : value.subjectName
      ? value.subjectName
      : "Livre";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-primary/10"
      >
        <BookOpen className="h-3.5 w-3.5 text-primary" />
        <span className="text-muted-foreground">Contexto ativo:</span>
        <span className="font-semibold text-primary truncate max-w-[220px]">
          {label}
        </span>
        {value.lectureTitle && (
          <span className="text-[10px] text-muted-foreground">
            · Aula + Slides + Resumos
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[320px] overflow-hidden rounded-xl border border-border/60 bg-card shadow-lg">
          <div className="border-b border-border/60 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Escolher contexto
            </div>
          </div>
          <div className="max-h-[360px] overflow-y-auto p-1">
            <button
              type="button"
              onClick={() => {
                onChange({});
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-secondary/60",
                !value.subjectId && !value.lectureId && "bg-primary/10",
              )}
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="flex-1">Conversa livre</span>
              {!value.subjectId && !value.lectureId && (
                <Check className="h-3.5 w-3.5 text-primary" />
              )}
            </button>
            {subjectsSorted.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                Nenhuma matéria ainda. Crie uma no dashboard.
              </div>
            )}
            {subjectsSorted.map((s) => {
              const subjLectures = grouped.get(s.id) ?? [];
              const subjectSelected =
                value.subjectId === s.id && !value.lectureId;
              const SubjectIcon = resolveSubjectIcon(s.icon, s.name);
              return (
                <div key={s.id} className="mb-1">
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ subjectId: s.id, subjectName: s.name });
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-secondary/60",
                      subjectSelected && "bg-primary/10",
                    )}
                  >
                    <SubjectIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate font-medium">
                      {s.name}
                    </span>
                    {subjectSelected && (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    )}
                  </button>
                  {subjLectures.slice(0, 5).map((l) => {
                    const selected = value.lectureId === l.id;
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => {
                          onChange({
                            subjectId: s.id,
                            subjectName: s.name,
                            lectureId: l.id,
                            lectureTitle: l.title,
                          });
                          setOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 pl-8 text-left text-xs text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                          selected && "bg-primary/10 text-foreground",
                        )}
                      >
                        <span className="flex-1 truncate">{l.title}</span>
                        {selected && (
                          <Check className="h-3 w-3 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
