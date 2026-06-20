"use client";
import { LumiPic } from "@/components/brand/lumi";

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
import { resolveSubjectIcon } from "@/lib/subject-icon";
import {
  deleteChat,
  listChats,
  listTrash,
  moveToSubject,
  purgeChat,
  renameChat,
  restoreChat,
  startOfWeek,
  hydrateFromServer,
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

function stripMarkdown(text: string): string {
  if (!text) return text;
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*\*([\s\S]+?)\*\*\*/g, "$1")
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/__([\s\S]+?)__/g, "$1")
    .replace(/(^|[\s(])\*([^\s*][\s\S]*?)\*/g, "$1$2")
    .replace(/(^|[\s(])_([^\s_][\s\S]*?)_/g, "$1$2")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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
    void hydrateFromServer(user.id).then(refresh);
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
    <div className="mx-auto flex h-[calc(100vh-60px)] w-full max-w-7xl flex-col overflow-hidden px-4 py-4 lg:px-8">
      {/* Header compacto */}
      <div className="flex shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <LumiPic
            src="/illustrations/lumi-default.png"
            alt="Lumi"
            className="hidden h-12 w-12 shrink-0 object-contain drop-shadow-sm sm:block"
          />
          <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
            Meus chats
          </h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> {stats.total} conversas
            </span>
            <span className="inline-flex items-center gap-1">
              <Pin className="h-3 w-3" /> {stats.pinned} fixadas
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {stats.thisWeek} esta semana
            </span>
            <span className="inline-flex items-center gap-1">
              <BookOpen className="h-3 w-3" /> {stats.subjectsCount} matérias
            </span>
          </div>
          </div>
        </div>
        <Button
          asChild
          variant="gradient"
          size="sm"
          className="self-start md:self-auto"
        >
          <Link href="/lumi?new=1">
            <Plus className="h-4 w-4" />
            Novo chat
          </Link>
        </Button>
      </div>

      {/* Main grid — ocupa todo o restante e respeita overflow */}
      <div className="mt-4 grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[220px_1fr_320px]">
        {/* Left tree */}
        <aside className="hidden min-h-0 overflow-y-auto lg:flex lg:flex-col gap-1 rounded-2xl border border-border/60 bg-card p-3">
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
        <section className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <div className="flex shrink-0 flex-col gap-3">
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

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {visible.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border/60 bg-card p-10 text-center">
                <LumiPic
                  src="/illustrations/lumi-waving.png"
                  alt="Lumi acenando"
                  className="mx-auto h-28 w-28 object-contain drop-shadow-sm"
                />
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
        <aside className="hidden min-h-0 overflow-y-auto lg:block">
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
              <LumiPic
                src="/illustrations/lumi-thinking.png"
                alt="Lumi pensando"
                className="mx-auto h-24 w-24 object-contain drop-shadow-sm"
              />
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
            {subjects.map((s) => {
              const SubjectIcon = resolveSubjectIcon(s.icon, s.name);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleMove({ id: s.id, name: s.name })}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-secondary/60"
                >
                  <SubjectIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {subjectCounts.get(s.name) ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
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
  const previewRaw =
    lastAssistant?.content || lastUser?.content || "Nenhuma mensagem ainda.";
  const preview = stripMarkdown(previewRaw) || "Nenhuma mensagem ainda.";
  const openHref = isTrashed ? "#" : `/lumi?chatId=${chat.id}`;

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 rounded-2xl border bg-card p-3 transition-all",
        active
          ? "border-primary/40 bg-primary/5 border-l-4 border-l-primary"
          : "border-border/60 hover:border-primary/20 hover:bg-secondary/30",
      )}
      onMouseEnter={onSelect}
    >
      {!isTrashed && (
        <Link
          href={openHref}
          className="absolute inset-0 z-0 rounded-2xl"
          aria-label={`Abrir conversa ${chat.title}`}
          onClick={onSelect}
        />
      )}
      {isTrashed && (
        <button
          type="button"
          onClick={onSelect}
          className="absolute inset-0 z-0 rounded-2xl"
          aria-label={`Selecionar ${chat.title}`}
        />
      )}
      <div
        className={cn(
          "pointer-events-none relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          tone,
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="pointer-events-none relative z-[1] min-w-0 flex-1">
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
      <div className="relative z-[2] flex flex-col items-end gap-1.5">
        <span className="pointer-events-none text-[10px] text-muted-foreground">
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
    </div>
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
  const snippetRaw =
    chat.messages.find((m) => m.role === "assistant")?.content ??
    chat.messages.find((m) => m.role === "user")?.content ??
    "Nenhuma mensagem ainda.";
  const snippet = stripMarkdown(snippetRaw) || "Nenhuma mensagem ainda.";

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-5">
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
