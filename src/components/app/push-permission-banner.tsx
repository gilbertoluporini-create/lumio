"use client";

/**
 * PushPermissionBanner
 *
 * Banner sutil no dashboard que pede permissão pra Web Push Notifications.
 *
 * Comportamento:
 *  - Só aparece se Notification API for suportada E `permission === 'default'`
 *    (user nunca decidiu).
 *  - Aparece depois de `delayMs` (default 6s) — evita ser intrusivo no
 *    primeiro paint do dashboard.
 *  - User pode dispensar pra sempre (localStorage `lumio.push.dismissed`).
 *  - Se já tiver permissão denied, mostra dica curta linkando pro /perfil
 *    pra reativar via settings do browser.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { useNotificationPermission } from "@/hooks/use-push-permission";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "lumio.push.dismissed";

export function PushPermissionBanner({
  delayMs = 6000,
  className,
}: {
  delayMs?: number;
  className?: string;
}) {
  const { permission, subscribed, loading, supported, request } =
    useNotificationPermission();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISMISS_KEY);
      if (stored === "1") setDismissed(true);
    } catch {}
    const t = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);

  if (!supported || !visible || dismissed) return null;
  if (subscribed) return null;

  // Permissão já negada — sugere ir em settings (e não mostra o pedido).
  if (permission === "denied") {
    return (
      <div
        className={cn(
          "rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-xs text-muted-foreground flex items-center gap-3",
          className,
        )}
      >
        <Bell className="h-4 w-4 shrink-0" />
        <div className="flex-1">
          Notificações desativadas — pode reativar em{" "}
          <Link href="/account/settings" className="text-primary underline">
            configurações
          </Link>
          .
        </div>
        <button
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {}
          }}
          aria-label="Dispensar"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (permission !== "default") return null;

  async function handleEnable() {
    const res = await request();
    if (res.permission === "granted" && res.subscribed) {
      toast.success("Lumi vai te avisar antes das provas.");
    } else if (res.permission === "denied") {
      toast.info("Sem problema — você pode reativar em configurações.");
    }
  }

  function handleDismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3",
        className,
      )}
    >
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
          <Bell className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">
            Quer lembretes de provas?
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lumi te avisa 3 dias antes da prova com sugestão de revisão.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="gradient"
          onClick={handleEnable}
          disabled={loading}
        >
          {loading ? "Ativando..." : "Ativar"}
        </Button>
        <button
          onClick={handleDismiss}
          aria-label="Dispensar"
          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
