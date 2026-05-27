"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Globe,
  Moon,
  Palette,
  Settings as SettingsIcon,
  ShieldAlert,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <SettingsView user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function SettingsView({ user }: { user: User }) {
  void user;
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyResumeReady, setNotifyResumeReady] = useState(true);
  const [language] = useState<"pt-BR">("pt-BR");

  useEffect(() => {
    const stored = localStorage.getItem("lumio.theme") as
      | "light"
      | "dark"
      | "system"
      | null;
    if (stored) setTheme(stored);
    const ne = localStorage.getItem("lumio.notify.email");
    if (ne) setNotifyEmail(ne === "1");
    const nr = localStorage.getItem("lumio.notify.resume");
    if (nr) setNotifyResumeReady(nr === "1");
  }, []);

  function applyTheme(t: "light" | "dark" | "system") {
    setTheme(t);
    localStorage.setItem("lumio.theme", t);
    const root = document.documentElement;
    if (t === "system") {
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", dark);
    } else {
      root.classList.toggle("dark", t === "dark");
    }
  }

  function toggleNotify(key: "email" | "resume", value: boolean) {
    if (key === "email") {
      setNotifyEmail(value);
      localStorage.setItem("lumio.notify.email", value ? "1" : "0");
    } else {
      setNotifyResumeReady(value);
      localStorage.setItem("lumio.notify.resume", value ? "1" : "0");
    }
    toast.success("Preferências atualizadas.");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-3 py-1 text-xs mb-2">
          <SettingsIcon className="h-3 w-3 text-primary" />
          Configurações
        </div>
        <h1 className="text-2xl md:text-3xl heading-display">
          Como o Lumio se comporta
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Tema, notificações e privacidade da sua conta.
        </p>
      </div>

      <div className="space-y-5">
        {/* Tema */}
        <SettingsCard
          icon={Palette}
          title="Aparência"
          description="Escolhe entre claro, escuro ou seguir o sistema."
        >
          <div className="grid grid-cols-3 gap-2 mt-3">
            {[
              { id: "light", label: "Claro", Icon: Sun },
              { id: "dark", label: "Escuro", Icon: Moon },
              { id: "system", label: "Sistema", Icon: Globe },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => applyTheme(id as "light" | "dark" | "system")}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border px-4 py-4 transition-all text-sm",
                  theme === id
                    ? "border-primary bg-primary/5 text-foreground shadow-sm"
                    : "border-border/60 bg-card hover:border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="font-medium">{label}</span>
              </button>
            ))}
          </div>
        </SettingsCard>

        {/* Notificações */}
        <SettingsCard
          icon={Bell}
          title="Notificações"
          description="O que o Lumi pode te avisar por email."
        >
          <div className="space-y-2 mt-3">
            <Toggle
              label="Receber resumos e novidades por email"
              checked={notifyEmail}
              onChange={(v) => toggleNotify("email", v)}
            />
            <Toggle
              label="Quando o resumo de uma aula ficar pronto"
              checked={notifyResumeReady}
              onChange={(v) => toggleNotify("resume", v)}
            />
          </div>
        </SettingsCard>

        {/* Idioma */}
        <SettingsCard
          icon={Globe}
          title="Idioma"
          description="Idioma da interface e da transcrição."
        >
          <div className="mt-3 flex items-center justify-between rounded-lg border border-border/60 bg-card/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-semibold text-muted-foreground border border-border/60 rounded px-1.5 py-0.5">
                PT-BR
              </span>
              <span className="text-sm font-medium">Português (Brasil)</span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Mais idiomas em breve
            </span>
          </div>
        </SettingsCard>

        {/* Privacidade / zona perigosa */}
        <SettingsCard
          icon={ShieldAlert}
          title="Conta"
          description="Ações irreversíveis ficam aqui."
          variant="danger"
        >
          <div className="space-y-3 mt-3">
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Excluir minha conta</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Apaga permanentemente todas as aulas, transcrições, slides e seus Lumi Coins. Não dá pra reverter.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  toast.info(
                    "Pra excluir sua conta, fala com a gente: hello@lumioapp.net",
                  )
                }
              >
                Solicitar
              </Button>
            </div>
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}

function SettingsCard({
  icon: Icon,
  title,
  description,
  children,
  variant,
}: {
  icon: typeof Bell;
  title: string;
  description: string;
  children: React.ReactNode;
  variant?: "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-5",
        variant === "danger" ? "border-amber-500/30" : "border-border/60",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            variant === "danger"
              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 hover:bg-secondary/40 px-4 py-2.5 transition-colors text-left"
    >
      <span className="text-sm">{label}</span>
      <span
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-primary" : "bg-border",
        )}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-[2px]",
          )}
        />
      </span>
    </button>
  );
}
