"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { SupportDialog } from "@/components/support/support-dialog";
import type { User } from "@/lib/types";

export type SupportFabProps = {
  user: User;
};

export function SupportFab({ user }: SupportFabProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  if (pathname?.startsWith("/admin")) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Falar com o suporte"
        title="Suporte"
        className="fixed bottom-4 right-4 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-fuchsia-600 text-white shadow-lg shadow-primary/30 ring-1 ring-white/10 transition-transform hover:scale-105 active:scale-95 md:bottom-6 md:right-6 md:h-14 md:w-14"
      >
        <MessageCircle className="h-5 w-5 md:h-6 md:w-6" />
        <span className="sr-only">Suporte</span>
      </button>

      <SupportDialog open={open} onOpenChange={setOpen} user={user} />
    </>
  );
}
