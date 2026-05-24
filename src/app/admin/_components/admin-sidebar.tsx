"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Coins,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Settings,
  ShieldAlert,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/admin/realtime", label: "Tempo real", Icon: Activity },
  { href: "/admin/users", label: "Usuários", Icon: Users },
  { href: "/admin/leads", label: "Leads", Icon: UserPlus },
  { href: "/admin/tickets", label: "Tickets", Icon: Mail },
  { href: "/admin/metrics", label: "Métricas", Icon: BarChart3 },
  { href: "/admin/usage", label: "Uso & Margem", Icon: Coins },
  { href: "/admin/settings", label: "Configurações", Icon: Settings },
] as const;

export function AdminSidebar({ adminEmail }: { adminEmail: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-2 left-2 z-50 lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-md bg-neutral-900 border border-neutral-800 text-neutral-200"
        aria-label="Abrir menu admin"
      >
        <Menu className="h-4 w-4" />
      </button>

      {mobileOpen && (
        <button
          aria-label="Fechar menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col border-r border-neutral-800 bg-neutral-950 transition-transform",
          "lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Logo + badge */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500">
              <ShieldAlert className="h-4 w-4 text-white" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-mono text-sm font-semibold tracking-wider text-neutral-100">
                LUMIO
              </span>
              <span className="text-[9px] font-mono uppercase tracking-widest text-red-400">
                Admin
              </span>
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden h-7 w-7 inline-flex items-center justify-center rounded-md text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800"
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 flex flex-col gap-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors font-mono",
                  active
                    ? "bg-neutral-800 text-neutral-50"
                    : "text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900",
                )}
              >
                <item.Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-neutral-800 p-3">
          <div className="mb-2 px-1">
            <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
              Logado como
            </p>
            <p className="text-xs font-mono text-neutral-300 truncate">
              {adminEmail}
            </p>
          </div>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-mono text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair do admin
          </Link>
        </div>
      </aside>
    </>
  );
}
