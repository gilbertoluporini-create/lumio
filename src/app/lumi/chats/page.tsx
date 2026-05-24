"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Calendar,
  Edit3,
  FileText,
  Folder,
  Languages,
  Layers,
  MessageSquare,
  MoreVertical,
  Pin,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { AuthGuard } from "@/components/app/auth-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listSubjectsAsync } from "@/lib/db";
import {
  deleteChat,
  listChats,
  listTrash,
  moveToSubject,
  purgeChat,
  renameChat,
  restoreChat,
  startOfWeek,
  subscribeChats,
  togglePin,
  toggleStar,
  type LumiChat,
} from "@/lib/lumi-chats";
import type { Subject, User } from "@/lib/types";
import { cn } from "@/lib/utils";

type FilterKind =
  | "all"
  | "pinned"
  | "recent"
  | "trash"
  | "subject"
  | "english"
  | "summary"
  | "flashcards"
  | "quiz";

const CATEGORY_ICON: Record<string, typeof FileText> = {
  summary: FileText,
  flashcards: Layers,
  quiz: Sparkles,
  translate: Languages,
  explain: Search,
  chat: MessageSquare,
};

const CATEGORY_TONE: Record<string, string> = {
  summary: "bg-violet-500/10 text-violet-600",
  flashcards: "bg-fuchsia-500/10 text-fuchsia-600",
  quiz: "bg-emerald-500/10 text-emerald-600",
  translate: "bg-sky-500/10 text-sky-600",
  explain: "bg-amber-500/10 text-amber-600",
  chat: "bg-primary/10 text-primary",
};

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  const time = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (sameDay) return `Hoje, ${time}`;
  if (isYesterday) return `Ontem, ${time}`;
  return d.toLocaleDateString("pt-BR");
}

export default function LumiChatsPage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <LumiChatsHub user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function LumiChatsHub({ user }: { user: User }) {
  const router = useRouter();
  const [chats, setChats] = useState<LumiChat[]>([]);
  const [trash, setTrash] = useState<LumiChat[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [filter, setFilter] = useState<FilterKind>("all");
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<LumiChat | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveTarget, setMoveTarget] = useState<LumiChat | null>(null);

  useEffect(() => {
    const refresh = () => {
      setChats(listChats(user.id));
      setTrash(listTrash(user.id));
    };
    refresh();
    const unsub = subscribeChats(user.id, refresh);
    return unsub;
  }, [user.id]);

  useEffect(() => {
    let active = true;
    listSubjectsAsync(user.id).then((s) => {
      if (active) setSubjects(s);
    });
    return () => {
      active = false;
    };
  }, [user.id]);

  const subjectCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of chats) {
      const key = c.subjectName ?? "Outras";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [chats]);

  const stats = useMemo(() => {
    const total = chats.length;
    const pinned = chats.filter((c) => c.pinned).length;
    const weekStart = startOfWeek(new Date());
    const thisWeek = chats.filter(
      (c) => new Date(c.createdAt) >= weekStart,
    ).length;
    const subjectsCount = new Set(
      chats.map((c) => c.subjectId ?? c.subjectName ?? "__"),
    ).size;
    return { total, pinned, thisWeek, subjectsCount };
  }, [chats]);

  const visible = useMemo(() => {
    let list: LumiChat[] = filter === "trash" ? trash : chats;
    if (filter === "pinned") list = chats.filter((c) => c.pinned);
    if (filter === "recent") {
      const week = startOfWeek(new Date());
      list = chats.filter((c) => new Date(c.updatedAt) >= week);
    }
    if (filter === "english") list = chats.filter((c) => c.category === "translate");
    if (filter === "summary") list = chats.filter((c) => c.category === "summary");
    if (filter === "flashcards") list = chats.filter((c) => c.category === "flashcards");
    if (filter === "quiz") list = chats.filter((c) => c.category === "quiz");
    if (subjectFilter) {
      list = list.filter(
        (c) => (c.subjectName ?? "Outras") === subjectFilter,
      );
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => {
        const blob = `${c.title} ${c.messages.map((m) => m.content).join(" ")} ${c.subjectName ?? ""}`.toLowerCase();
        return blob.includes(q);
      });
    }
    return list;
  }, [filter, subjectFilter, chats, trash, query]);

  useEffect(() => {
    if (!selectedId && visible.length > 0) {
      setSelectedId(visible[0].id);
    }
    if (selectedId && !visible.find((c) => c.id === selectedId)) {
      setSelectedId(visible[0]?.id ?? null);
    }
  }, [visible, selectedId]);

  const selected = useMemo(
    () =>
      visible.find((c) => c.id === selectedId) ??
      chats.find((c) => c.id === selectedId) ??
      trash.find((c) => c.id === selectedId) ??
      null,
    [selectedId, visible, chats, trash],
  );

  function handleTogglePin(id: string) {
    togglePin(user.id, id);
  }
  function handleToggleStar(id: string) {
    toggleStar(user.id, id);
  }
  function openRename(c: LumiChat) {
    setRenameTarget(c);
    setRenameValue(c.title);
  }
  function commitRename() {
    if (!renameTarget) return;
    const t = renameValue.trim();
    if (!t) {
      toast.error("Título não pode ficar vazio");
      return;
    }
    renameChat(user.id, renameTarget.id, t);
    toast.success("Conversa renomeada");
    setRenameTarget(null);
  }
  function handleDelete(id: string) {
    deleteChat(user.id, id);
    toast.success("Conversa movida pra lixeira");
  }
  function handleRestore(id: string) {
    restoreChat(user.id, id);
    toast.success("Conversa restaurada");
  }
  function handlePurge(id: string) {
    if (purgeChat(user.id, id)) {
      toast.success("Conversa excluída permanentemente");
    }
  }
  function handleMove(subject: { id?: string; name?: string }) {
    if (!moveTarget) return;
    moveToSubject(user.id, moveTarget.id, subject);
    toast.success("Conversa movida");
    setMoveTarget(null);
  }

  const subjectNamesInChats = useMemo(() => {
    const set = new Map<string, number>();
    for (const c of chats) {
      const k = c.subjectName ?? "Outras";
      set.set(k, (set.get(k) ?? 0) + 1);
    }
    return Array.from(set.entries()).sort((a, b) => b[1] - a[1]);
  }, [chats]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Meus chats
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Histórico de conversas com o Assistente Lumi
          </p>
        </div>
        <Button
          asChild
          variant="gradient"
          className="self-start md:self-auto"
        >
          <Link href="/lumi?new=1">
            <Plus className="h-4 w-4" />
            Novo chat
          </Link>
        </Button>
      </div>

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          Icon={MessageSquare}
          value={stats.total}
          label="Chats"
          sub="Total de conversas"
          tone="bg-primary/10 text-primary"
        />
        <KpiCard
          Icon={Pin}
          value={stats.pinned}
          label="Fixados"
          sub="Conversas fixadas"
          tone="bg-fuchsia-500/10 text-fuchsia-600"
        />
        <KpiCard
          Icon={Calendar}
          value={stats.thisWeek}
          label="Esta semana"
          sub="Conversas iniciadas"
          tone="bg-sky-500/10 text-sky-600"
        />
        <KpiCard
          Icon={BookOpen}
          value={stats.subjectsCount}
          label="Por matéria"
          sub="Matérias diferentes"
          tone="bg-emerald-500/10 text-emerald-600"
        />
      </div>

      {/* Main grid */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr_360px]">
        {/* Left tree */}
        <aside className="hidden lg:flex flex-col gap-1 rounded-2xl border border-border/60 bg-card p-3">
          <TreeButton
            label={`Todos os chats (${stats.total})`}
            active={filter === "all" && !subjectFilter}
            onClick={() => {
              setFilter("all");
              setSubjectFilter(null);
            }}
          />
          <TreeButton
            label={`Fixados (${stats.pinned})`}
            active={filter === "pinned"}
            onClick={() => {
              setFilter("pinned");
              setSubjectFilter(null);
            }}
          />
          <TreeButton
            label={`Recentes (${stats.thisWeek})`}
            active={filter === "recent"}
            onClick={() => {
              setFilter("recent");
              setSubjectFilter(null);
            }}
          />
          <div className="mt-3 mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Por matéria
          </div>
          {subjectNamesInChats.length === 0 && (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              Nenhuma conversa ainda.
            </div>
          )}
          {subjectNamesInChats.map(([name, count]) => (
            <TreeButton
              key={name}
              label={`${name} (${count})`}
              active={subjectFilter === name}
              onClick={() => {
                setFilter("all");
                setSubjectFilter(name);
              }}
            />
          ))}
          <div className="mt-3 border-t border-border/60 pt-2">
            <TreeButton
              label={`Lixeira (${trash.length})`}
              active={filter === "trash"}
              onClick={() => {
                setFilter("trash");
                setSubjectFilter(null);
              }}
              Icon={Trash2}
            />
          </div>
        </aside>

        {/* Center list */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar conversas..."
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <FilterPill
                label="Todos"
                active={filter === "all" && !subjectFilter}
                onClick={() => {
                  setFilter("all");
                  setSubjectFilter(null);
                }}
              />
              <FilterPill
                label="Fixados"
                active={filter === "pinned"}
                onClick={() => setFilter("pinned")}
              />
              <FilterPill
                label="Recentes"
                active={filter === "recent"}
                onClick={() => setFilter("recent")}
              />
              <FilterPill
                label="Inglês médico"
                active={filter === "english"}
                onClick={() => setFilter("english")}
              />
              <FilterPill
                label="Resumos"
                active={filter === "summary"}
                onClick={() => setFilter("summary")}
              />
              <FilterPill
                label="Flashcards"
                active={filter === "flashcards"}
                onClick={() => setFilter("flashcards")}
              />
              <FilterPill
                label="Quiz"
                active={filter === "quiz"}
                onClick={() => setFilter("quiz")}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {visible.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border/60 bg-card p-10 text-center">
                <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <h3 className="mt-3 text-sm font-semibold text-foreground">
                  Nenhuma conversa encontrada
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Comece um novo chat com o Lumi pra ver o histórico aqui.
                </p>
                <Button asChild className="mt-4" variant="gradient" size="sm">
                  <Link href="/lumi?new=1">
                    <Plus className="h-4 w-4" />
                    Novo chat
                  </Link>
                </Button>
              </div>
            )}
            {visible.map((c) => (
              <ChatRow
                key={c.id}
                chat={c}
                active={selectedId === c.id}
                onSelect={() => setSelectedId(c.id)}
                onTogglePin={() => handleTogglePin(c.id)}
                onToggleStar={() => handleToggleStar(c.id)}
                onRename={() => openRename(c)}
                onMove={() => setMoveTarget(c)}
                onDelete={() => handleDelete(c.id)}
                onRestore={() => handleRestore(c.id)}
                onPurge={() => handlePurge(c.id)}
                isTrashed={!!c.deletedAt}
              />
            ))}
          </div>
        </section>

        {/* Right preview */}
        <aside className="hidden lg:block">
          {selected ? (
            <PreviewPanel
              chat={selected}
              onContinue={() => router.push(`/lumi?id=${selected.id}`)}
              onRename={() => openRename(selected)}
              onMove={() => setMoveTarget(selected)}
              onDelete={() =>
                selected.deletedAt
                  ? handlePurge(selected.id)
                  : handleDelete(selected.id)
              }
              onClose={() => setSelectedId(null)}
              onTogglePin={() => handleTogglePin(selected.id)}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-border/60 bg-card p-10 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-xs text-muted-foreground">
                Selecione uma conversa pra ver o preview.
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* Rename dialog */}
      <Dialog
        open={!!renameTarget}
        onOpenChange={(o) => !o && setRenameTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Renomear conversa</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Novo título..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={commitRename}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move dialog */}
      <Dialog
        open={!!moveTarget}
        onOpenChange={(o) => !o && setMoveTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mover para outra matéria</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[320px] flex-col gap-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => handleMove({})}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-secondary/60"
            >
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              Sem matéria
            </button>
            {subjects.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleMove({ id: s.id, name: s.name })}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-secondary/60"
              >
                <span className="text-base leading-none">{s.emoji || "📚"}</span>
                <span className="flex-1 truncate">{s.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {subjectCounts.get(s.name) ?? 0}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({
  Icon,
  value,
  label,
  sub,
  tone,
}: {
  Icon: typeof MessageSquare;
  value: number;
  label: string;
  sub: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-semibold tabular-nums text-foreground">
            {value}
          </div>
          <div className="text-xs font-medium text-foreground">{label}</div>
          <div className="text-[10px] text-muted-foreground">{sub}</div>
        </div>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            tone,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function TreeButton({
  label,
  active,
  onClick,
  Icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  Icon?: typeof MessageSquare;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
        active
          ? "bg-primary/10 font-semibold text-primary"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      <span className="truncate">{label}</span>
    </button>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border/60 bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function ChatRow({
  chat,
  active,
  onSelect,
  onTogglePin,
  onToggleStar,
  onRename,
  onMove,
  onDelete,
  onRestore,
  onPurge,
  isTrashed,
}: {
  chat: LumiChat;
  active: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
  onToggleStar: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onPurge: () => void;
  isTrashed: boolean;
}) {
  const Icon = CATEGORY_ICON[chat.category ?? "chat"] ?? MessageSquare;
  const tone = CATEGORY_TONE[chat.category ?? "chat"] ?? CATEGORY_TONE.chat;
  const lastUser = [...chat.messages].reverse().find((m) => m.role === "user");
  const lastAssistant = [...chat.messages]
    .reverse()
    .find((m) => m.role === "assistant");
  const preview =
    lastAssistant?.content || lastUser?.content || "Nenhuma mensagem ainda.";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex items-start gap-3 rounded-2xl border bg-card p-3 text-left transition-all",
        active
          ? "border-primary/40 bg-primary/5 border-l-4 border-l-primary"
          : "border-border/60 hover:border-primary/20 hover:bg-secondary/30",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          tone,
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {chat.title}
          </h3>
          {chat.pinned && !isTrashed && (
            <Pin className="h-3 w-3 shrink-0 fill-primary text-primary" />
          )}
          {chat.starred && (
            <Star className="h-3 w-3 shrink-0 fill-amber-500 text-amber-500" />
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {preview}
        </p>
        {chat.subjectName && (
          <div className="mt-1 text-[10px] font-medium text-primary">
            {chat.subjectName}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span className="text-[10px] text-muted-foreground">
          {formatRelativeDate(chat.updatedAt)}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {!isTrashed && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onTogglePin();
                }
              }}
              className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              aria-label={chat.pinned ? "Desfixar" : "Fixar"}
            >
              <Pin
                className={cn(
                  "h-3 w-3",
                  chat.pinned && "fill-primary text-primary",
                )}
              />
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                aria-label="Mais opções"
              >
                <MoreVertical className="h-3 w-3" />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {isTrashed ? (
                <>
                  <DropdownMenuItem onClick={onRestore}>
                    Restaurar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onPurge}
                    className="text-rose-600 focus:text-rose-600"
                  >
                    <Trash2 /> Excluir permanentemente
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={onRename}>
                    <Edit3 /> Renomear
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onMove}>
                    <Folder /> Mover matéria
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onToggleStar}>
                    <Star /> {chat.starred ? "Remover estrela" : "Marcar com estrela"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-rose-600 focus:text-rose-600"
                  >
                    <Trash2 /> Excluir
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </button>
  );
}

function PreviewPanel({
  chat,
  onContinue,
  onRename,
  onMove,
  onDelete,
  onClose,
  onTogglePin,
}: {
  chat: LumiChat;
  onContinue: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
  onClose: () => void;
  onTogglePin: () => void;
}) {
  const Icon = CATEGORY_ICON[chat.category ?? "chat"] ?? MessageSquare;
  const tone = CATEGORY_TONE[chat.category ?? "chat"] ?? CATEGORY_TONE.chat;
  const snippet =
    chat.messages.find((m) => m.role === "assistant")?.content ??
    chat.messages.find((m) => m.role === "user")?.content ??
    "Nenhuma mensagem ainda.";

  return (
    <div className="sticky top-[80px] flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            tone,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onTogglePin}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            aria-label="Fixar"
            title={chat.pinned ? "Desfixar" : "Fixar"}
          >
            <Pin
              className={cn("h-4 w-4", chat.pinned && "fill-primary text-primary")}
            />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-foreground">{chat.title}</h2>
        <p className="mt-2 line-clamp-4 text-xs text-muted-foreground">
          {snippet}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-xl border border-border/40 bg-background/40 p-3 text-[11px]">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Matéria</span>
          {chat.subjectId ? (
            <Link
              href={`/subject/${chat.subjectId}`}
              className="font-medium text-primary hover:underline"
            >
              {chat.subjectName ?? "Geral"}
            </Link>
          ) : (
            <span className="font-medium text-foreground">
              {chat.subjectName ?? "—"}
            </span>
          )}
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Mensagens</span>
          <span className="font-medium tabular-nums text-foreground">
            {chat.messages.length}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Última atualização</span>
          <span className="font-medium text-foreground">
            {formatRelativeDate(chat.updatedAt)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button variant="gradient" onClick={onContinue}>
          Continuar conversa
        </Button>
        <Button variant="outline" onClick={onRename}>
          <Edit3 /> Renomear conversa
        </Button>
        <Button variant="outline" onClick={onMove}>
          <Folder /> Mover para outra matéria
        </Button>
        <Button
          variant="outline"
          onClick={onDelete}
          className="text-rose-600 hover:text-rose-600"
        >
          <Trash2 />{" "}
          {chat.deletedAt ? "Excluir permanentemente" : "Excluir conversa"}
        </Button>
      </div>
    </div>
  );
}
