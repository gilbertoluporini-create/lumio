"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Calendar,
  ChevronLeft,
  CreditCard,
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Settings,
  UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LumioMark } from "@/components/brand/logo";
import { LumioCoin } from "@/components/brand/lumio-coin";
import { LumiIcon } from "@/components/brand/lumi-icon";
import { CommandPalette } from "@/components/app/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAsync } from "@/lib/auth";
import type { User } from "@/lib/types";

const SIDEBAR_STORAGE_KEY = "lumio.sidebar.collapsed";

export function AppShell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate sidebar state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === "1") setCollapsed(true);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0");
    }
  }, [collapsed, hydrated]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Fetch coin balance
  useEffect(() => {
    let active = true;
    fetch("/api/coins", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data && typeof data.balance === "number") {
          setCoinBalance(data.balance);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pathname]);

  async function handleLogout() {
    await signOutAsync();
    router.replace("/login");
  }

  const navItems: Array<{
    href: string;
    label: string;
    lumi?: "book" | "calendar" | "document";
    Icon?: typeof Calendar;
    isCoin?: boolean;
  }> = [
    { href: "/dashboard", label: "Dashboard", lumi: "book" },
    { href: "/gravacoes", label: "Gravações", lumi: "document" },
    { href: "/schedule", label: "Cronograma", lumi: "calendar" },
    { href: "/account/coins", label: "Lumio Coins", isCoin: true },
  ];

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const sidebarWidth = collapsed ? "w-[68px]" : "w-[220px]";

  return (
    <div className="relative min-h-screen flex bg-background">
      <CommandPalette user={user} />
      {/* Mobile overlay */}
      {mobileOpen && (
        <button
          aria-label="Fechar menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-foreground/30 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border/60 bg-card/95 backdrop-blur-xl transition-all duration-200",
          sidebarWidth,
          "lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Logo + collapse button */}
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-3 h-[60px]">
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <LumioMark className="h-8 w-8 shrink-0" />
            {!collapsed && (
              <span className="text-lg font-semibold tracking-tight truncate">
                Lumio
              </span>
            )}
          </Link>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            <ChevronLeft
              className={cn(
                "h-4 w-4 transition-transform",
                collapsed && "rotate-180",
              )}
            />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {navItems.map(({ href, label, lumi, Icon, isCoin }) => {
            const active = pathname === href || pathname?.startsWith(href + "/");
            const lowBalance =
              isCoin && coinBalance !== null && coinBalance < 50;
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                className={cn(
                  "relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group",
                  collapsed && "justify-center px-2",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                )}
              >
                {isCoin ? (
                  <LumioCoin size={22} className="shrink-0" />
                ) : lumi ? (
                  <LumiIcon name={lumi} size={22} className="shrink-0" />
                ) : Icon ? (
                  <Icon className="h-5 w-5 shrink-0" />
                ) : null}
                {!collapsed && (
                  <span className="flex-1 truncate">{label}</span>
                )}
                {isCoin && coinBalance !== null && (
                  <span
                    className={cn(
                      "rounded-full text-[10px] font-mono tabular-nums px-1.5 py-0.5",
                      collapsed
                        ? "absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center"
                        : "",
                      lowBalance
                        ? "bg-amber-500 text-white"
                        : "bg-primary/15 text-primary",
                    )}
                  >
                    {coinBalance}
                  </span>
                )}
                {active && !collapsed && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 bg-primary rounded-r-full" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-border/60 p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-secondary/60 transition-colors",
                  collapsed && "justify-center",
                )}
                title={collapsed ? user.name : undefined}
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-xs font-medium truncate leading-tight">
                      {user.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate leading-tight">
                      {user.email}
                    </div>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-56">
              <DropdownMenuLabel className="text-foreground">
                <div className="font-medium truncate">{user.name}</div>
                <div className="text-xs text-muted-foreground font-normal truncate">
                  {user.email}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/account/profile">
                  <UserIcon /> Perfil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/account/settings">
                  <Settings /> Configurações
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/account/billing">
                  <CreditCard /> Assinatura
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-destructive focus:text-destructive"
              >
                <LogOut /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main column (shifts based on sidebar width on desktop) */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-all duration-200",
          collapsed ? "lg:ml-[68px]" : "lg:ml-[220px]",
        )}
      >
        {/* Top bar — mobile menu + theme toggle */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border/60 bg-background/80 backdrop-blur-xl px-4 py-2.5 h-[60px]">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden flex h-9 w-9 items-center justify-center rounded-md hover:bg-secondary/60 transition-colors"
            aria-label="Abrir menu"
          >
            <PanelLeft className="h-5 w-5" />
          </button>
          <div className="lg:hidden">
            <LumioMark className="h-8 w-8" />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => {
                // Simula Cmd+K
                window.dispatchEvent(
                  new KeyboardEvent("keydown", {
                    key: "k",
                    metaKey: true,
                  }),
                );
              }}
              className="hidden md:inline-flex items-center gap-2 rounded-md border border-border/60 bg-secondary/40 hover:bg-secondary/60 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors"
              title="Buscar (⌘K)"
            >
              <span>Buscar…</span>
              <kbd className="font-mono text-[10px] bg-background/80 rounded px-1.5 py-0.5 border border-border/40">
                ⌘K
              </kbd>
            </button>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
