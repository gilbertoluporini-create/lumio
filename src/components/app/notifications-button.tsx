"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, Check, CheckCheck, Loader2, MessageSquare, Trash2 } from "lucide-react";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isAdminEmail } from "@/lib/admin-emails";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

const POLL_INTERVAL_MS = 60_000;

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function iconFor(type: string) {
  switch (type) {
    case "ticket_new":
    case "ticket_reply":
    case "ticket_status":
      return MessageSquare;
    default:
      return Bell;
  }
}

export function NotificationsButton({ userEmail }: { userEmail?: string } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const [clearing, setClearing] = useState(false);
  const lastFetchRef = useRef<number>(0);
  const isAdmin = !!userEmail && isAdminEmail(userEmail);

  const fetchNotifications = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=20", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications: NotificationItem[];
        unreadCount: number;
      };
      setItems(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
      lastFetchRef.current = Date.now();
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // Fetch inicial + polling
  useEffect(() => {
    void fetchNotifications();
    const t = setInterval(() => {
      void fetchNotifications();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch ao abrir (caso polling tenha passado)
  useEffect(() => {
    if (open) {
      const stale = Date.now() - lastFetchRef.current > 10_000;
      if (stale) void fetchNotifications();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hasUnread = unreadCount > 0;
  const sorted = useMemo(() => items, [items]);

  async function markAllRead() {
    if (marking || unreadCount === 0) return;
    setMarking(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "read_all" }),
      });
      if (res.ok) {
        const now = new Date().toISOString();
        setItems((prev) =>
          prev.map((n) => (n.read_at ? n : { ...n, read_at: now })),
        );
        setUnreadCount(0);
      }
    } finally {
      setMarking(false);
    }
  }

  async function clearAll() {
    if (clearing || items.length === 0) return;
    // Admin precisa confirmar (proteção contra acidente em conta operacional)
    if (isAdmin) {
      const ok = await confirmAction({
        title: "Excluir TODAS as notificações?",
        description: "Essa ação é irreversível.",
        destructive: true,
        confirmText: "Excluir todas",
      });
      if (!ok) return;
    }
    setClearing(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "clear_all" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(`Erro ao limpar: ${data?.error ?? `HTTP ${res.status}`}`);
        return;
      }
      setItems([]);
      setUnreadCount(0);
      toast.success("Notificações limpas.");
    } catch (err) {
      toast.error(`Erro ao limpar: ${(err as Error).message}`);
    } finally {
      setClearing(false);
    }
  }

  async function handleClick(item: NotificationItem) {
    // marca lida otimisticamente
    if (!item.read_at) {
      const now = new Date().toISOString();
      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, read_at: now } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      void fetch(`/api/notifications/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
    }
    if (item.href) {
      setOpen(false);
      router.push(item.href);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors",
            open && "bg-secondary/60 text-foreground",
          )}
          aria-label={
            hasUnread
              ? `Notificações (${unreadCount} não lidas)`
              : "Notificações"
          }
        >
          <Bell className="h-[18px] w-[18px]" />
          {hasUnread && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <DropdownMenuLabel className="p-0 text-sm font-semibold">
            Notificações
            {hasUnread && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {unreadCount} nova{unreadCount === 1 ? "" : "s"}
              </span>
            )}
          </DropdownMenuLabel>
          <div className="flex items-center gap-2.5">
            {hasUnread && (
              <button
                onClick={markAllRead}
                disabled={marking}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                title="Marcar todas como lidas"
              >
                {marking ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCheck className="h-3 w-3" />
                )}
                Marcar lidas
              </button>
            )}
            {items.length > 0 && (
              <button
                onClick={clearAll}
                disabled={clearing}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-red-500 disabled:opacity-50 transition-colors"
                title={
                  isAdmin
                    ? "Excluir todas (com confirmação)"
                    : "Excluir todas as notificações"
                }
              >
                {clearing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                Limpar
              </button>
            )}
          </div>
        </div>
        <DropdownMenuSeparator />

        {loading && items.length === 0 ? (
          <div className="py-10 text-center">
            <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-10 px-4 text-center">
            <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60">
              <Bell className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Tudo em dia</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Nenhuma notificação por enquanto.
            </p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {sorted.map((n) => {
              const Icon = iconFor(n.type);
              const unread = !n.read_at;
              return (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-secondary/50 transition-colors",
                    unread && "bg-primary/[0.04]",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      unread
                        ? "bg-primary/15 text-primary"
                        : "bg-secondary/60 text-muted-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {relativeTime(n.created_at)}
                      </span>
                    </div>
                    {n.body && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {n.body}
                      </p>
                    )}
                  </div>
                  {unread && (
                    <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {sorted.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-4 py-2 text-center">
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Check className="h-3 w-3" />
                Atualizado automaticamente
              </span>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
