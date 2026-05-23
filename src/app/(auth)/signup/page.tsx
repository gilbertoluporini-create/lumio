"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Loader2, Lock, Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LumiCharacter } from "@/components/brand/lumi";
import { signUp } from "@/lib/storage";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

type Mode = "password" | "magic";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.09-1.92 3.28-4.74 3.28-8.07z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.12c-.22-.66-.35-1.36-.35-2.12s.13-1.46.35-2.12V7.04H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.96l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  );
}

function SignUpInner() {
  const router = useRouter();
  const params = useSearchParams();
  const supaOn = isSupabaseConfigured();
  const [mode, setMode] = useState<Mode>("password");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sent, setSent] = useState<"magic" | "confirm" | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const nextPath = params.get("next") ?? "/onboarding";

  async function onGoogle() {
    if (googleLoading || !supaOn) return;
    setGoogleLoading(true);
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível entrar com Google.");
      setGoogleLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      if (!supaOn) {
        await signUp(email, password || crypto.randomUUID(), name);
        toast.success("Conta criada (modo offline). Configurando matérias…");
        router.push("/onboarding");
        return;
      }

      if (mode === "magic") {
        const res = await fetch("/api/auth/magic-link", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, name, next: nextPath }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "Não foi possível enviar o link.");
        }
        setSent("magic");
        toast.success("Link de acesso enviado pro seu email.");
        return;
      }

      // password
      const res = await fetch("/api/auth/signup-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, name, next: nextPath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Não foi possível criar a conta.");

      if (data.needsConfirmation) {
        setSent("confirm");
        toast.success("Cheque seu email pra confirmar a conta.");
      } else {
        toast.success("Conta criada!");
        router.push(nextPath);
        router.refresh();
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <Card className="w-full max-w-md border-border/80 bg-card/80 backdrop-blur-xl shadow-2xl">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <LumiCharacter mood="celebrating" size="md" float />
          </div>
          <CardTitle className="text-2xl">Cheque seu email</CardTitle>
          <CardDescription>
            {sent === "magic"
              ? <>Enviamos um link mágico pra <strong>{email}</strong>. Clique nele pra entrar.</>
              : <>Enviamos um link de confirmação pra <strong>{email}</strong>. Confirme pra ativar sua conta.</>}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          <p>{sent === "magic" ? "O link expira em 10 minutos." : "Depois de confirmar, volta aqui e entra com sua senha."} Pode fechar essa aba.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md border-border/80 bg-card/80 backdrop-blur-xl shadow-2xl">
      <CardHeader className="text-center space-y-2 pb-4">
        <div className="flex justify-center mb-2">
          <LumiCharacter mood="waving" size="md" float />
        </div>
        <CardTitle className="text-2xl">Oi, eu sou o Lumi 👋</CardTitle>
        <CardDescription>
          {supaOn
            ? "Cria sua conta e ganha 50 coins de boas-vindas."
            : "Modo offline: dados ficam no navegador (pra desenvolvimento)."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {supaOn && (
          <>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              onClick={onGoogle}
              disabled={googleLoading || loading}
            >
              {googleLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <GoogleIcon className="h-4 w-4" /> Continuar com Google
                </>
              )}
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/60" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card/80 px-2 text-muted-foreground">ou</span>
              </div>
            </div>
          </>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                className="pl-9"
                required
                minLength={2}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                className="pl-9"
                required
              />
            </div>
          </div>
          {supaOn && mode === "password" && (
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="pl-9"
                  required
                  minLength={8}
                />
              </div>
            </div>
          )}
          <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={loading || googleLoading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {mode === "magic" ? "Enviar link mágico" : "Criar conta"} <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>

          {supaOn && (
            <button
              type="button"
              onClick={() => setMode(mode === "password" ? "magic" : "password")}
              className="block w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {mode === "password"
                ? "Preferir receber link mágico no email"
                : "Usar email e senha"}
            </button>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link href="/login" className="text-primary font-medium hover:underline">
              Entrar
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpInner />
    </Suspense>
  );
}
