"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, KeyRound, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LumiCharacter } from "@/components/brand/lumi";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setChecking(false);
      return;
    }
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }: { data: { session: unknown } }) => {
      setHasSession(!!data.session);
      setChecking(false);
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      toast.success("Senha atualizada. Bem-vindo de volta.");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (checking) {
    return (
      <Card className="w-full max-w-md border-border/80 bg-card/80 backdrop-blur-xl shadow-2xl">
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!hasSession) {
    return (
      <Card className="w-full max-w-md border-border/80 bg-card/80 backdrop-blur-xl shadow-2xl">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <LumiCharacter mood="confused" size="md" float />
          </div>
          <CardTitle className="text-2xl">Link expirado</CardTitle>
          <CardDescription>
            Esse link de redefinição já foi usado ou expirou. Peça um novo na tela
            de login.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Link href="/login" className="text-primary font-medium hover:underline">
            Voltar pro login
          </Link>
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
        <CardTitle className="text-2xl">Define uma nova senha</CardTitle>
        <CardDescription>
          Escolhe uma senha de 8+ caracteres pra entrar nas próximas vezes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">Nova senha</Label>
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
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirmar nova senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repete a senha"
                className="pl-9"
                required
                minLength={8}
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="gradient"
            size="lg"
            className="w-full"
            disabled={saving || password.length < 8 || password !== confirm}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <KeyRound className="h-4 w-4" /> Salvar nova senha
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
