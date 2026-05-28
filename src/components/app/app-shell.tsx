"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  Coins,
  CreditCard,
  FileText,
  FolderOpen,
  HelpCircle,
  Layers,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Mic,
  PanelLeft,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isAdminEmail } from "@/lib/admin-emails";
import { LumioMark } from "@/components/brand/logo";
import { LumiIcon } from "@/components/brand/lumi-icon";
import { CommandPalette } from "@/components/app/command-palette";
import { NotificationsButton } from "@/components/app/notifications-button";
import { JobsTray } from "@/components/jobs/jobs-tray";
import { PlanPremiumCard } from "@/components/app/plan-premium-card";
import { PendingGenerationGuard } from "@/components/app/pending-generation-guard";
import { CreatePasswordPrompt } from "@/components/app/create-password-prompt";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAsync } from "@/lib/auth";
import { listSubjectsAsync } from "@/lib/db";
import { listChats, subscribeChats } from "@/lib/lumi-chats";
import type { Subject, User } from "@/lib/types";

const SIDEBAR_STORAGE_KEY = "lumio.sidebar.collapsed";

type SidebarNavItem = {
  href: string;
  label: string;
  lumi?: "book" | "calendar" | "document";
  Icon?: typeof Calendar;
  isCoin?: boolean;
  badgeCount?: number | null;
  badgeTone?: "violet";
};

function SidebarLink({
  item,
  pathname,
  collapsed,
  coinBalance,
}: {
  item: SidebarNavItem;
  pathname: string | null;
  collapsed: boolean;
  coinBalance: number | null;
}) {
  const { href, label, lumi, Icon, isCoin, badgeCount, badgeTone } = item;
  // Exact match para rotas que podem colidir (ex: /lumi vs /lumi/chats).
  // Para o restante, prefixo + "/" continua válido pra sub-rotas.
  const exactOnly = href === "/lumi";
  const active = exactOnly
    ? pathname === href
    : pathname === href || pathname?.startsWith(href + "/");
  const lowBalance = isCoin && coinBalance !== null && coinBalance < 50;
  const showBadge =
    typeof badgeCount === "number" && badgeCount > 0 && !isCoin;

  return (
    <Link
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
        <Coins className="h-5 w-5 shrink-0 text-amber-500" strokeWidth={2.2} />
      ) : lumi ? (
        <LumiIcon name={lumi} size={22} className="shrink-0" />
      ) : Icon ? (
        <Icon className="h-5 w-5 shrink-0" />
      ) : null}
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
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
      {showBadge && (
        <span
          className={cn(
            "rounded-full text-[10px] font-mono tabular-nums px-1.5 py-0.5",
            collapsed
              ? "absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center"
              : "",
            badgeTone === "violet"
              ? "bg-primary/15 text-primary"
              : "bg-secondary text-foreground",
          )}
        >
          {badgeCount}
        </span>
      )}
      {active && !collapsed && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 bg-primary rounded-r-full" />
      )}
    </Link>
  );
}

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
  const [primarySubject, setPrimarySubject] = useState<string | null>(null);
  const [lumiChatCount, setLumiChatCount] = useState<number>(0);

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

  // Track Lumi chats count (localStorage-only por enquanto)
  useEffect(() => {
    const refresh = () => setLumiChatCount(listChats(user.id).length);
    refresh();
    const unsub = subscribeChats(user.id, refresh);
    return unsub;
  }, [user.id]);

  // Fetch primary subject (primeira matéria do user) pra mostrar no avatar
  useEffect(() => {
    let active = true;
    listSubjectsAsync(user.id)
      .then((subjects: Subject[]) => {
        if (!active) return;
        if (subjects.length > 0) setPrimarySubject(subjects[0].name);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user.id]);

  async function handleLogout() {
    await signOutAsync();
    router.replace("/login");
  }

  function openCommandPalette() {
    // Dispara Cmd+K — listener global no CommandPalette captura
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true }),
    );
  }

  const navItems: SidebarNavItem[] = [
    { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
    { href: "/lumi", label: "Assistente Lumi", Icon: Sparkles },
    {
      href: "/lumi/chats",
      label: "Meus chats",
      Icon: MessageSquare,
      badgeCount: lumiChatCount,
      badgeTone: "violet",
    },
    { href: "/schedule", label: "Calendário", Icon: Calendar },
    { href: "/resumos", label: "Resumos", Icon: FileText },
    { href: "/flashcards", label: "Flashcards", Icon: Layers },
    { href: "/quiz", label: "Quiz", Icon: Sparkles },
    { href: "/gravacoes", label: "Gravações", Icon: Mic },
    { href: "/favoritos", label: "Favoritos", Icon: Star },
    { href: "/documentos", label: "Meus documentos", Icon: FolderOpen },
    { href: "/account/coins", label: "Lumi Coins", isCoin: true },
  ];

  const secondaryNavItems: SidebarNavItem[] = [
    { href: "/account/embaixador", label: "Embaixadores", Icon: Users },
    { href: "/account/settings", label: "Configurações", Icon: Settings },
    { href: "/help", label: "Ajuda", Icon: HelpCircle },
  ];

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const firstName = user.name.split(" ")[0];
  // "Giba L." — primeiro nome + inicial do sobrenome
  const lastInitial = user.name.split(" ").slice(1, 2)[0]?.[0]?.toUpperCase();
  const compactName = lastInitial ? `${firstName} ${lastInitial}.` : firstName;

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
        <nav className="flex-1 px-2 py-4 flex flex-col gap-1 overflow-y-auto">
          {navItems.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
              coinBalance={coinBalance}
            />
          ))}

          <div className="my-3 border-t border-border/40" />

          {secondaryNavItems.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
              coinBalance={coinBalance}
            />
          ))}
        </nav>

        {/* Plan Premium upsell — footer */}
        <div className="border-t border-border/60 p-2">
          <PlanPremiumCard collapsed={collapsed} />
        </div>
      </aside>

      {/* Main column (shifts based on sidebar width on desktop) */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-all duration-200",
          collapsed ? "lg:ml-[68px]" : "lg:ml-[220px]",
        )}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/60 bg-background/80 backdrop-blur-xl px-4 h-[60px]">
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

          {/* Search bar — grande, centralizado em desktop */}
          <div className="flex-1 max-w-xl mx-auto hidden md:flex">
            <button
              onClick={openCommandPalette}
              className="w-full inline-flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/30 hover:bg-secondary/50 hover:border-border px-3 py-2 text-sm text-muted-foreground transition-colors"
              title="Buscar (⌘K)"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left truncate">
                Buscar matérias, aulas, resumos...
              </span>
              <kbd className="font-mono text-[10px] bg-background/80 rounded px-1.5 py-0.5 border border-border/40 shrink-0">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Mobile search icon (only) */}
          <button
            onClick={openCommandPalette}
            className="md:hidden ml-auto flex h-9 w-9 items-center justify-center rounded-md hover:bg-secondary/60 transition-colors"
            aria-label="Buscar"
          >
            <Search className="h-5 w-5" />
          </button>

          {/* Right cluster — jobs tray, notifications, theme, avatar */}
          <div className="flex items-center gap-1 md:gap-2 ml-auto md:ml-0">
            <JobsTray />
            <NotificationsButton />
            <ThemeToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-secondary/60 transition-colors"
                  aria-label="Menu do usuário"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:flex flex-col items-start min-w-0 leading-tight">
                    <span className="text-xs font-semibold truncate max-w-[120px]">
                      {compactName}
                    </span>
                    {primarySubject && (
                      <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                        {primarySubject}
                      </span>
                    )}
                  </div>
                  <ChevronDown className="hidden md:block h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
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
                {isAdminEmail(user.email) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link
                        href={pathname.startsWith("/admin") ? "/dashboard" : "/admin"}
                        className="text-primary focus:text-primary"
                      >
                        <ShieldCheck />
                        {pathname.startsWith("/admin")
                          ? "Conta de estudos"
                          : "Painel admin"}
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
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
        </header>

        <main className="flex-1">{children}</main>
      </div>
      {/* Detecta geração que ficou pela metade (coins cobrados mas asset
          não salvo) e oferece "Salvar agora" via toast. Roda 1x por sessão. */}
      <PendingGenerationGuard userId={user.id} />
      {/* Usuários que entram com Google não têm senha — oferece criar uma
          de fallback após o login (pulável, reaparece até criar). */}
      <CreatePasswordPrompt />
    </div>
  );
}
