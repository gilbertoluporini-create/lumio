"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Calendar,
  FileText,
  Home,
  Mic,
  Plus,
  Search,
  Settings,
  Sparkles,
  UserIcon,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { LumiIcon, type LumiIconName } from "@/components/brand/lumi-icon";
import { LumioCoin } from "@/components/brand/lumio-coin";
import { listLecturesAsync, listSubjectsAsync } from "@/lib/db";
import type { Lecture, Subject, User } from "@/lib/types";
import { cn } from "@/lib/utils";

type CommandItem = {
  id: string;
  group: "Ações" | "Matérias" | "Aulas";
  label: string;
  detail?: string;
  href?: string;
  action?: () => void;
  lumi?: LumiIconName;
  lucide?: LucideIcon;
  coin?: boolean;
  keywords?: string[];
};

export function CommandPalette({ user }: { user: User }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);

  // Cmd+K / Ctrl+K toggle global
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Carrega quando abre (lazy)
  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.all([
      listSubjectsAsync(user.id),
      listLecturesAsync(user.id),
    ]).then(([s, l]) => {
      if (active) {
        setSubjects(s);
        setLectures(l);
      }
    });
    setQuery("");
    setSelected(0);
    return () => {
      active = false;
    };
  }, [open, user.id]);

  const actions: CommandItem[] = useMemo(
    () => [
      {
        id: "action:dashboard",
        group: "Ações",
        label: "Ir pro dashboard",
        href: "/dashboard",
        lucide: Home,
        keywords: ["home", "início"],
      },
      {
        id: "action:schedule",
        group: "Ações",
        label: "Ver cronograma",
        href: "/schedule",
        lumi: "calendar",
        keywords: ["semana", "horários", "aulas"],
      },
      {
        id: "action:documents",
        group: "Ações",
        label: "Meus documentos",
        href: "/documents",
        lumi: "document",
      },
      {
        id: "action:coins",
        group: "Ações",
        label: "Saldo de Lumio Coins",
        href: "/account/coins",
        coin: true,
        keywords: ["carteira", "saldo", "comprar"],
      },
      {
        id: "action:profile",
        group: "Ações",
        label: "Perfil",
        href: "/account/profile",
        lucide: UserIcon,
      },
      {
        id: "action:settings",
        group: "Ações",
        label: "Configurações",
        href: "/account/settings",
        lucide: Settings,
        keywords: ["tema", "notificações"],
      },
      {
        id: "action:pricing",
        group: "Ações",
        label: "Planos e assinatura",
        href: "/account/billing",
        lucide: Sparkles,
      },
    ],
    [],
  );

  const subjectItems: CommandItem[] = useMemo(
    () =>
      subjects.map((s) => ({
        id: `subject:${s.id}`,
        group: "Matérias" as const,
        label: s.name,
        detail: `${lectures.filter((l) => l.subjectId === s.id).length} aulas`,
        href: `/subject/${s.id}`,
        lumi: "book",
        keywords: [s.name],
      })),
    [subjects, lectures],
  );

  const lectureItems: CommandItem[] = useMemo(
    () =>
      lectures.slice(0, 30).map((l) => {
        const s = subjects.find((x) => x.id === l.subjectId);
        return {
          id: `lecture:${l.id}`,
          group: "Aulas" as const,
          label: l.title,
          detail: s ? s.name : undefined,
          href: `/lecture/${l.id}`,
          lucide: Mic,
          keywords: [l.title, s?.name ?? ""],
        };
      }),
    [lectures, subjects],
  );

  const all = useMemo(
    () => [...actions, ...subjectItems, ...lectureItems],
    [actions, subjectItems, lectureItems],
  );

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return all;
    return all.filter((item) => {
      const blob =
        `${item.label} ${item.detail ?? ""} ${item.keywords?.join(" ") ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [all, q]);

  // Group items pra render
  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const item of filtered) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  // Reset selected quando query muda
  useEffect(() => {
    setSelected(0);
  }, [q]);

  function runItem(item: CommandItem) {
    setOpen(false);
    if (item.href) router.push(item.href);
    if (item.action) item.action();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[selected];
      if (item) runItem(item);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 overflow-hidden gap-0 max-w-xl">
        <VisuallyHidden>
          <DialogTitle>Comando rápido</DialogTitle>
        </VisuallyHidden>
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            autoFocus
            type="search"
            placeholder="Buscar aulas, matérias, ações…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex items-center rounded border border-border/60 bg-secondary/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div className="max-h-[400px] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nenhum resultado pra &quot;{query}&quot;.
            </div>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group} className="mb-1">
                <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {group}
                </div>
                {items.map((item) => {
                  const idx = filtered.indexOf(item);
                  const isSelected = idx === selected;
                  return (
                    <button
                      key={item.id}
                      onClick={() => runItem(item)}
                      onMouseEnter={() => setSelected(idx)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors",
                        isSelected
                          ? "bg-primary/10 text-foreground"
                          : "hover:bg-secondary/50",
                      )}
                    >
                      {item.lumi ? (
                        <LumiIcon
                          name={item.lumi}
                          size={26}
                          className="shrink-0"
                        />
                      ) : item.coin ? (
                        <LumioCoin size={22} className="shrink-0" />
                      ) : item.lucide ? (
                        <item.lucide className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {item.label}
                        </div>
                        {item.detail && (
                          <div className="text-[11px] text-muted-foreground truncate">
                            {item.detail}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border/60 px-4 py-2 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
          <span className="flex items-center gap-3">
            <span>
              <kbd className="rounded bg-secondary/60 px-1 py-0.5">↑↓</kbd>{" "}
              navegar
            </span>
            <span>
              <kbd className="rounded bg-secondary/60 px-1 py-0.5">↵</kbd>{" "}
              selecionar
            </span>
          </span>
          <span>
            <kbd className="rounded bg-secondary/60 px-1 py-0.5">⌘K</kbd>{" "}
            abre/fecha
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
