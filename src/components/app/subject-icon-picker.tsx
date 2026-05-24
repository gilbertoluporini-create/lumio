"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  SUBJECT_ICON_LIST,
  resolveSubjectIcon,
} from "@/lib/subject-icon";

type Props = {
  value: string | null | undefined;
  subjectName: string;
  onChange: (next: string) => void;
  palette: { bg: string; text: string };
  className?: string;
};

export function SubjectIconPicker({
  value,
  subjectName,
  onChange,
  palette,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const Active = resolveSubjectIcon(value, subjectName);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SUBJECT_ICON_LIST;
    return SUBJECT_ICON_LIST.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.keywords.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Trocar ícone da matéria"
          className={cn(
            "group inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-border/70 transition-all hover:scale-[1.03] hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            palette.bg,
            open && "ring-2 ring-ring ring-offset-1 ring-offset-background",
            className,
          )}
        >
          <Active className={cn("h-8 w-8", palette.text)} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        className="w-80 p-3"
      >
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar ícone…"
            className="pl-8 h-9"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-6 gap-1.5 max-h-72 overflow-y-auto pr-1">
          {filtered.map((entry) => {
            const Ic = entry.icon;
            const selected =
              value === entry.name ||
              (!value && Active === entry.icon);
            return (
              <button
                key={entry.name}
                type="button"
                onClick={() => {
                  onChange(entry.name);
                  setOpen(false);
                  setQuery("");
                }}
                title={entry.name}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-all hover:bg-secondary hover:text-foreground",
                  selected &&
                    cn(
                      palette.bg,
                      palette.text,
                      "border-foreground/20 ring-1 ring-foreground/10",
                    ),
                )}
              >
                <Ic className="h-5 w-5" />
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-6 py-6 text-center text-xs text-muted-foreground">
              Nenhum ícone encontrado.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
