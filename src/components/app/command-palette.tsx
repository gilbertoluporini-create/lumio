"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Calendar,
  FileText,
  FolderOpen,
  HelpCircle,
  Home,
  Layers,
  Mic,
  Search,
  Settings,
  Sparkles,
  Star,
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
import { listSummariesAsync } from "@/lib/summaries";
import type { Summary } from "@/lib/types";
import { listFavorites } from "@/lib/favorites";
import { helpCategories } from "@/lib/help-articles";
import type { Lecture, Subject, User } from "@/lib/types";
import { cn } from "@/lib/utils";

type CommandGroup =
  | "Ações"
  | "Matérias"
  | "Aulas"
  | "Resumos"
  | "Favoritos"
  | "Ajuda";

type CommandItem = {
  id: string;
  group: CommandGroup;
  label: string;
  detail?: string;
  href?: string;
  action?: () => void;
  lumi?: LumiIconName;
  lucide?: LucideIcon;
  coin?: boolean;
  keywords?: string[];
};

const GROUP_ORDER: CommandGroup[] = [
  "Ações",
  "Favoritos",
  "Matérias",
  "Aulas",
  "Resumos",
  "Ajuda",
];

export function CommandPalette({ user }: { user: User }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

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
      listSummariesAsync(user.id),
    ]).then(([s, l, sm]) => {
      if (active) {
        setSubjects(s);
        setLectures(l);
        setSummaries(sm);
        const favs = listFavorites(user.id);
        setFavoriteIds(new Set(favs.map((f) => `${f.kind}:${f.id}`)));
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
        keywords: ["home", "início", "painel"],
      },
      {
        id: "action:schedule",
        group: "Ações",
        label: "Calendário de estudos",
        href: "/schedule",
        lucide: Calendar,
        keywords: ["agenda", "semana", "horários", "provas", "blocos"],
      },
      {
        id: "action:resumos",
        group: "Ações",
        label: "Biblioteca de resumos",
        href: "/resumos",
        lucide: FileText,
        keywords: ["resumos", "notas", "highlights"],
      },
      {
        id: "action:flashcards",
        group: "Ações",
        label: "Flashcards",
        href: "/flashcards",
        lucide: Layers,
        keywords: ["cards", "srs", "repetição espaçada", "estudo"],
      },
      {
        id: "action:quiz",
        group: "Ações",
        label: "Quiz",
        href: "/quiz",
        lucide: HelpCircle,
        keywords: ["questões", "prática", "simulado"],
      },
      {
        id: "action:gravacoes",
        group: "Ações",
        label: "Gravações",
        href: "/gravacoes",
        lucide: Mic,
        keywords: ["aulas", "transcrição", "vídeos"],
      },
      {
        id: "action:favoritos",
        group: "Ações",
        label: "Favoritos",
        href: "/favoritos",
        lucide: Star,
        keywords: ["estrela", "salvos", "marcados"],
      },
      {
        id: "action:documentos",
        group: "Ações",
        label: "Ir pra Minhas matérias",
        href: "/documentos",
        lucide: FolderOpen,
        keywords: [
          "documentos",
          "materiais",
          "biblioteca",
          "pastas",
          "uploads",
          "tudo",
        ],
      },
      {
        id: "action:lumi",
        group: "Ações",
        label: "Ir para Assistente Lumi",
        href: "/lumi",
        lucide: Sparkles,
        keywords: [
          "lumi",
          "assistente",
          "chat",
          "ia",
          "ai",
          "perguntar",
          "tirar dúvida",
        ],
      },
      {
        id: "action:lumi-chats",
        group: "Ações",
        label: "Meus chats com a Lumi",
        href: "/lumi/chats",
        lucide: Sparkles,
        keywords: ["histórico", "conversas", "lumi", "chats"],
      },
      {
        id: "action:help",
        group: "Ações",
        label: "Ajuda e suporte",
        href: "/help",
        lucide: HelpCircle,
        keywords: ["faq", "tutorial", "suporte"],
      },
      {
        id: "action:coins",
        group: "Ações",
        label: "Saldo de Lumi Coins",
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
        id: "action:billing",
        group: "Ações",
        label: "Planos e assinatura",
        href: "/account/billing",
        lucide: Sparkles,
        keywords: ["upgrade", "premium", "stripe"],
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

  const summaryItems: CommandItem[] = useMemo(
    () =>
      summaries.slice(0, 30).map((sm) => {
        const s = subjects.find((x) => x.id === sm.subjectId);
        const href =
          sm.source.kind === "lecture"
            ? `/resumo/${sm.source.lectureId}`
            : `/resumo/doc/${sm.id}`;
        return {
          id: `summary:${sm.id}`,
          group: "Resumos" as const,
          label: sm.title,
          detail: s ? `Resumo · ${s.name}` : "Resumo",
          href,
          lucide: FileText,
          keywords: [
            sm.title,
            s?.name ?? "",
            sm.content.generalSummary?.slice(0, 60) ?? "",
          ],
        };
      }),
    [summaries, subjects],
  );

  const favoriteItems: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [];
    favoriteIds.forEach((key) => {
      const [kind, id] = key.split(":");
      if (kind === "lecture") {
        const l = lectures.find((x) => x.id === id);
        if (l) {
          const s = subjects.find((x) => x.id === l.subjectId);
          items.push({
            id: `fav:lecture:${id}`,
            group: "Favoritos",
            label: l.title,
            detail: s ? `Aula · ${s.name}` : "Aula",
            href: `/lecture/${id}`,
            lucide: Mic,
            keywords: [l.title, "favorito"],
          });
        }
      } else if (kind === "summary") {
        const l = lectures.find((x) => x.id === id);
        if (l) {
          const s = subjects.find((x) => x.id === l.subjectId);
          items.push({
            id: `fav:summary:${id}`,
            group: "Favoritos",
            label: l.title,
            detail: s ? `Resumo · ${s.name}` : "Resumo",
            href: `/lecture/${id}`,
            lucide: FileText,
            keywords: [l.title, "favorito", "resumo"],
          });
        }
      } else if (kind === "subject") {
        const s = subjects.find((x) => x.id === id);
        if (s) {
          items.push({
            id: `fav:subject:${id}`,
            group: "Favoritos",
            label: s.name,
            detail: "Matéria",
            href: `/subject/${id}`,
            lumi: "book",
            keywords: [s.name, "favorito"],
          });
        }
      }
    });
    return items;
  }, [favoriteIds, lectures, subjects]);

  const helpItems: CommandItem[] = useMemo(
    () =>
      helpCategories.flatMap((cat) =>
        cat.articles.slice(0, 5).map((article) => ({
          id: `help:${cat.slug}:${article.slug}`,
          group: "Ajuda" as const,
          label: article.title,
          detail: `${cat.title} · ${article.readTimeMin} min`,
          href: `/help/${cat.slug}/${article.slug}`,
          lucide: HelpCircle,
          keywords: [article.title, article.excerpt, cat.title],
        })),
      ),
    [],
  );

  const all = useMemo(
    () => [
      ...actions,
      ...favoriteItems,
      ...subjectItems,
      ...lectureItems,
      ...summaryItems,
      ...helpItems,
    ],
    [actions, favoriteItems, subjectItems, lectureItems, summaryItems, helpItems],
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

  // Group items pra render (ordem fixa)
  const grouped = useMemo(() => {
    const map = new Map<CommandGroup, CommandItem[]>();
    for (const item of filtered) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return GROUP_ORDER.map(
      (g) => [g, map.get(g) ?? []] as [CommandGroup, CommandItem[]],
    ).filter(([, items]) => items.length > 0);
  }, [filtered]);

  // Reset selected quando query muda
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      <DialogContent className="p-0 overflow-hidden gap-0 max-w-xl" hideClose>
        <VisuallyHidden>
          <DialogTitle>Comando rápido</DialogTitle>
        </VisuallyHidden>
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            autoFocus
            type="search"
            placeholder="Buscar matérias, aulas, resumos…"
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
