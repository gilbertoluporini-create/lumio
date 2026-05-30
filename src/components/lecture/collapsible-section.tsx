"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type CollapsibleSectionProps = {
  id: string;
  title: string;
  icon?: React.ReactNode;
  subtitle?: string;
  defaultOpen?: boolean;
  /** Persiste o estado aberto/fechado em localStorage com essa chave + id. */
  persist?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

const STORAGE_PREFIX = "lumio.lecture.section.";

export function CollapsibleSection({
  id,
  title,
  icon,
  subtitle,
  defaultOpen = false,
  persist = true,
  badge,
  children,
  className,
}: CollapsibleSectionProps) {
  const storageKey = persist ? STORAGE_PREFIX + id : null;
  const [open, setOpen] = useState(defaultOpen);

  // Hidrata estado do localStorage no client.
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "1") setOpen(true);
    else if (saved === "0") setOpen(false);
  }, [storageKey]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      if (storageKey && typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      }
      return next;
    });
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-card overflow-hidden",
        className,
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-secondary/40"
      >
        {icon && (
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{title}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="border-t border-border/60 p-5 animate-in fade-in-0 slide-in-from-top-1 duration-150">
          {children}
        </div>
      )}
    </div>
  );
}
