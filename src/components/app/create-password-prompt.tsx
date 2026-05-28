"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

// Dismiss por sessão: "Fazer depois" some o card até o próximo login.
const DISMISS_KEY = "lumio.password_prompt_dismissed_v1";

/**
 * Usuários que entram com Google não têm senha — se o login Google falhar,
 * ficam sem acesso. Este card oferece criar uma senha de fallback após o
 * login. É um card fixo (NÃO um modal): prominente e persistente, mas sem
 * overlay — nunca bloqueia cliques na página. Detecta via flag própria
 * `user_metadata.has_password`, já que o Supabase não expõe "tem senha?".
 */
export function CreatePasswordPrompt() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  // Defensivo: o Radix Dialog às vezes deixa `pointer-events: none` preso no
  // <body> se um modal desmonta enquanto está aberto (ex.: hot-reload). Isso
  // trava TODOS os cliques da página sem nenhum overlay visível. Limpa no
  // mount — nesse momento nenhum modal legítimo está aberto.
  useEffect(() => {
    if (document.body.style.pointerEvents === "none") {
      document.body.style.pointerEvents = "";
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || !active) return;
        const providers =
          (user.app_metadata?.providers as string[] | undefined) ?? [];
        const provider = user.app_metadata?.provider as string | undefined;
        const isGoogle =
          provider === "google" || providers.includes("google");
        const hasPassword = user.user_metadata?.has_password === true;
        if (isGoogle && !hasPassword) setOpen(true);
      } catch {
        /* best-effort: não bloqueia o app */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  async function handleSave() {
    if (password.length < 8) {
      toast.error("A senha precisa de pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não conferem.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password,
        data: { has_password: true },
      });
      if (error) throw error;
      toast.success(
        "Senha criada! Agora você também entra com email e senha.",
      );
      try {
        sessionStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
      setOpen(false);
    } catch (err) {
      toast.error(`Não deu pra salvar a senha: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-primary/30 bg-card shadow-2xl shadow-primary/10 p-5 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fechar"
        className="absolute right-3 top-3 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <span className="h-9 w-9 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
          <KeyRound className="h-4 w-4 text-primary" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-tight">
            Crie uma senha de acesso
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Você entrou com o Google. Crie uma senha pra também conseguir
            entrar com email + senha — se o login com Google falhar, você não
            fica sem acesso.
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="space-y-1.5">
          <Label htmlFor="cpw-new" className="text-xs">
            Nova senha
          </Label>
          <Input
            id="cpw-new"
            type="password"
            autoComplete="new-password"
            placeholder="mín. 8 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cpw-confirm" className="text-xs">
            Confirmar senha
          </Label>
          <Input
            id="cpw-confirm"
            type="password"
            autoComplete="new-password"
            placeholder="repita a senha"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={saving}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSave();
            }}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={dismiss} disabled={saving}>
          Fazer depois
        </Button>
        <Button
          variant="gradient"
          size="sm"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Criar senha
        </Button>
      </div>
    </div>
  );
}
