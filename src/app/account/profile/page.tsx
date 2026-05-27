"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CreditCard, KeyRound, Loader2, Save, Trash2, UserIcon } from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { LumiCharacter } from "@/components/brand/lumi";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isSupabaseConfigured, createClient } from "@/lib/supabase/client";
import { getMySubscriptionAsync, isActiveSubscription } from "@/lib/db";
import type { User } from "@/lib/types";

const PLAN_LABELS: Record<string, string> = {
  pro: "Pro",
  annual: "Anual",
  free: "Free",
};

export default function ProfilePage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <ProfileView user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function ProfileView({ user }: { user: User }) {
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  useEffect(() => {
    if (user.createdAt) {
      setCreatedAt(user.createdAt);
    }
  }, [user]);

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function handleSave() {
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) {
      toast.error("Nome muito curto.");
      return;
    }
    setSaving(true);
    try {
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        const { error } = await supabase
          .from("profiles")
          .update({ name: trimmed })
          .eq("id", user.id);
        if (error) throw error;
      }
      toast.success("Perfil atualizado.");
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-3 py-1 text-xs mb-2">
          <UserIcon className="h-3 w-3 text-primary" />
          Seu perfil
        </div>
        <h1 className="text-2xl md:text-3xl heading-display">
          Quem é você
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Edita teu nome e veja informações da conta.
        </p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-6">
        {/* Avatar + identidade */}
        <div className="flex items-center gap-4 pb-5 border-b border-border/50">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-lg bg-gradient-to-br from-primary to-fuchsia-500 text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold truncate">{name || user.email}</div>
            <div className="text-xs text-muted-foreground truncate">
              {user.email}
            </div>
            {createdAt && (
              <div className="text-[11px] text-muted-foreground/70 mt-0.5">
                Membro desde{" "}
                {new Date(createdAt).toLocaleDateString("pt-BR", {
                  month: "long",
                  year: "numeric",
                })}
              </div>
            )}
          </div>
          <div className="hidden md:block">
            <LumiCharacter mood="waving" size="md" float />
          </div>
        </div>

        {/* Formulário */}
        <div className="space-y-4 pt-5">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Como o Lumi pode te chamar"
              maxLength={80}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              value={user.email}
              disabled
              className="opacity-60 cursor-not-allowed"
            />
            <p className="text-[11px] text-muted-foreground">
              O email é usado pra login via magic link e não pode ser alterado por aqui.
            </p>
          </div>

          <div className="pt-3 flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saving || name.trim() === user.name}
              variant="gradient"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar alterações
            </Button>
          </div>
        </div>
      </div>

      {isSupabaseConfigured() && (
        <>
          <PasswordSection />
          <DangerZone />
        </>
      )}
    </div>
  );
}

function DangerZone() {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activePlan, setActivePlan] = useState<string | null>(null);

  const canDelete = confirm.trim().toLowerCase() === "excluir";

  async function handleStartDelete() {
    if (checking || deleting) return;
    setChecking(true);
    try {
      const sub = await getMySubscriptionAsync();
      if (isActiveSubscription(sub) && sub) {
        setActivePlan(PLAN_LABELS[sub.plan] ?? sub.plan);
        return;
      }
      setConfirm("");
      setConfirmOpen(true);
    } catch {
      toast.error("Não consegui verificar tua assinatura. Tenta de novo.");
    } finally {
      setChecking(false);
    }
  }

  async function handleDelete() {
    if (deleting || !canDelete) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Erro ao excluir conta.");

      toast.success("Conta excluída.");
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch {}
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
      setDeleting(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-6">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <h2 className="text-base font-semibold text-destructive">Zona de perigo</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Excluir a conta apaga teu perfil, matérias, aulas, transcrições, produtos
        gerados e cancela qualquer assinatura ativa. <strong>Essa ação é permanente.</strong>
      </p>

      <div className="flex justify-end">
        <Button
          onClick={handleStartDelete}
          disabled={checking || deleting}
          variant="destructive"
        >
          {checking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Excluir conta
        </Button>
      </div>

      <Dialog
        open={activePlan !== null}
        onOpenChange={(open) => {
          if (!open) setActivePlan(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancele teu plano antes</DialogTitle>
            <DialogDescription>
              Você tem o plano <strong>{activePlan}</strong> ativo. Pra excluir a
              conta, cancele a assinatura primeiro em Conta → Cobrança.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivePlan(null)}>
              Cancelar
            </Button>
            <Button asChild variant="gradient">
              <Link href="/account/billing" onClick={() => setActivePlan(null)}>
                <CreditCard className="h-4 w-4" />
                Ir para Cobrança
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (deleting) return;
          setConfirmOpen(open);
          if (!open) setConfirm("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir conta permanentemente</DialogTitle>
            <DialogDescription>
              Essa ação não pode ser desfeita. Digite <strong>EXCLUIR</strong> abaixo
              pra confirmar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-delete">Confirmação</Label>
            <Input
              id="confirm-delete"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="EXCLUIR"
              autoComplete="off"
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDelete}
              disabled={!canDelete || deleting}
              variant="destructive"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Excluir conta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PasswordSection() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (saving) return;
    if (password.length < 8) {
      toast.error("Senha precisa ter 8+ caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não batem.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Senha atualizada.");
      setPassword("");
      setConfirm("");
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-border/60 bg-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Senha</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Define ou troca tua senha. Se entrou via Google ou link mágico, criar
        uma senha aqui te dá uma forma extra de entrar.
      </p>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">Nova senha</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            minLength={8}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirmar senha</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repete a senha"
            minLength={8}
          />
        </div>

        <div className="pt-1 flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving || password.length < 8 || password !== confirm}
            variant="gradient"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            Atualizar senha
          </Button>
        </div>
      </div>
    </div>
  );
}
