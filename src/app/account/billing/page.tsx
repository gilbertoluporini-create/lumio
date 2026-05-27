"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  getMySubscriptionAsync,
  isActiveSubscription,
  type ClientSubscription,
} from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { User } from "@/lib/types";

export default function BillingPage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <BillingView user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function BillingView({ user }: { user: User }) {
  void user;
  const router = useRouter();
  const [sub, setSub] = useState<ClientSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let active = true;
    getMySubscriptionAsync().then((s) => {
      if (active) {
        setSub(s);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  async function openPortal() {
    if (opening) return;
    setOpening(true);
    try {
      const res = await fetch("/api/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Não foi possível abrir o portal.");
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    } finally {
      setOpening(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const active = isActiveSubscription(sub);
  const planLabel = sub?.plan === "annual" ? "Anual" : sub?.plan === "pro" ? "Pro" : "Free";
  const periodEnd =
    sub?.current_period_end &&
    new Date(sub.current_period_end).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/dashboard")}
        className="mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <h1 className="text-3xl heading-display mb-1">
        Sua assinatura
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        Gerencie seu plano, atualize forma de pagamento ou cancele.
      </p>

      <Card className="border-border/80 overflow-hidden mb-6">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">
                Plano atual
              </p>
              <h2 className="text-2xl font-semibold tracking-tight">
                Lumio {planLabel}
              </h2>
            </div>
            {active ? (
              <Badge variant="success" className="gap-1.5">
                <CheckCircle2 className="h-3 w-3" /> Ativo
              </Badge>
            ) : sub?.status === "canceled" ? (
              <Badge variant="outline" className="gap-1.5">
                <XCircle className="h-3 w-3" /> Cancelado
              </Badge>
            ) : (
              <Badge variant="outline">Sem assinatura</Badge>
            )}
          </div>

          {periodEnd && active && (
            <div className="text-sm text-muted-foreground mb-5">
              {sub?.cancel_at_period_end ? (
                <>
                  Sua assinatura termina em <strong className="text-foreground">{periodEnd}</strong>.
                </>
              ) : (
                <>
                  Próxima cobrança em <strong className="text-foreground">{periodEnd}</strong>.
                </>
              )}
            </div>
          )}

          {active ? (
            <Button
              onClick={openPortal}
              variant="outline"
              size="lg"
              disabled={opening || !isSupabaseConfigured()}
            >
              {opening ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              Gerenciar no portal Stripe <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button asChild variant="gradient" size="lg">
              <Link href="/pricing">
                Assinar agora <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="rounded-lg border border-border/60 bg-card/60 backdrop-blur p-5 text-sm text-muted-foreground leading-relaxed">
        <p>
          <strong className="text-foreground">No portal Stripe</strong> você pode
          cancelar, mudar de plano, trocar forma de pagamento e baixar recibos.
          Sem fidelidade, sem letra miúda.
        </p>
      </div>
    </div>
  );
}
