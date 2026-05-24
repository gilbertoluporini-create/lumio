"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Botão de notificações com dropdown. Por enquanto é placeholder
 * (nenhuma notificação real). O badge vermelho aparece quando
 * `unreadCount > 0` — passamos default `0` até existir backend real.
 */
export function NotificationsButton({
  unreadCount = 0,
}: {
  unreadCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const hasUnread = unreadCount > 0;

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
        <DropdownMenuLabel className="px-4 py-3 text-sm font-semibold">
          Notificações
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="py-10 px-4 text-center">
          <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60">
            <Bell className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Tudo em dia</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nenhuma notificação por enquanto.
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
