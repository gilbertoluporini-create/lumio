"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Calendar,
  FileText,
  Layers,
  Loader2,
  Plus,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { LumiCharacter } from "@/components/brand/lumi";
import { LumioCoin } from "@/components/brand/lumio-coin";
import { LumioCoinSpinning } from "@/components/brand/lumio-coin-spinning";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tx = {
  id: string;
  amount: number;
  reason: string;
  balance_after: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export default function CoinsPage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <CoinsView user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

const COSTS = [
  { icon: Bot, label: "Pergunta no chat IA", cost: 2 },
  { icon: FileText, label: "Resumo automático da aula", cost: 14 },
  { icon: Layers, label: "Anexar PDF de slides", cost: 16 },
  { icon: Sparkles, label: "Correção de transcrição (1h aula)", cost: 5 },
  { icon: Calendar, label: "Extrair grade horária", cost: 0, free: true },
];

const TOPUPS = [
  { coins: 100, price: 12, perCoin: 0.12 },
  { coins: 500, price: 50, perCoin: 0.1, discount: "−17%", popular: true },
  { coins: 1500, price: 120, perCoin: 0.08, discount: "−33%" },
];

type ReasonIcon = React.ComponentType<{ className?: string }>;

function CoinFallbackIcon({ className }: { className?: string }) {
  return <LumioCoin size={16} className={className} />;
}

const REASON_META: Record<string, { label: string; icon: ReasonIcon }> = {
  welcome_bonus: { label: "Bônus de boas-vindas", icon: Sparkles },
  subscription_renew: { label: "Renovação de assinatura", icon: TrendingUp },
  topup: { label: "Compra avulsa de coins", icon: Plus },
  chat: { label: "Pergunta no chat", icon: Bot },
  slides: { label: "Anexo de slides", icon: Layers },
  summary: { label: "Resumo gerado", icon: FileText },
  transcript_refine: { label: "Transcrição refinada", icon: Sparkles },
  refund: { label: "Reembolso (erro)", icon: ArrowRight },
  admin_grant: { label: "Crédito do suporte", icon: Sparkles },
};

function CoinsView({ user }: { user: User }) {
  void user;
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/coins?history=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        if (typeof data.balance === "number") setBalance(data.balance);
        if (Array.isArray(data.transactions)) setTransactions(data.transactions);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const totalSpent = useMemo(
    () =>
      transactions
        .filter((t) => t.amount < 0)
        .reduce((acc, t) => acc + Math.abs(t.amount), 0),
    [transactions],
  );

  const totalEarned = useMemo(
    () =>
      transactions
        .filter((t) => t.amount > 0)
        .reduce((acc, t) => acc + t.amount, 0),
    [transactions],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-3 py-1 text-xs mb-2">
          <LumioCoin size={14} />
          Lumio Coins
        </div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Sua carteira
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl">
          Lumio Coins são usados pra rodar as features de IA. Pagamento por uso —
          mais justo que cobrar plano caro quando você usa pouco.
        </p>
      </div>

      {/* Saldo + ações */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="lg:col-span-2 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-fuchsia-500/5 p-6 shadow-lg shadow-primary/10">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Saldo atual
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                {loading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                ) : (
                  <>
                    <span className="text-5xl md:text-6xl font-bold font-mono tabular-nums">
                      {balance ?? 0}
                    </span>
                    <span className="text-xl text-muted-foreground font-medium">
                      coins
                    </span>
                  </>
                )}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                ≈ {balance ? `R$ ${(balance * 0.1).toFixed(2).replace(".", ",")}` : "R$ 0,00"} em valor de uso
              </div>
            </div>
            <div className="hidden md:flex flex-col items-center gap-3">
              <LumioCoinSpinning size={180} />
            </div>
          </div>

          {!loading && balance !== null && balance < 50 && (
            <div className="mt-4 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <strong>Saldo baixo.</strong> Compre coins ou assine um plano pra continuar usando o Lumio.
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild variant="gradient">
              <Link href="/pricing">
                <TrendingUp className="h-4 w-4" /> Ver planos
              </Link>
            </Button>
            <Button variant="outline" disabled title="Em breve">
              <Plus className="h-4 w-4" /> Comprar coins avulsas
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Estatísticas
          </div>
          <div className="mt-3 space-y-3">
            <div>
              <div className="text-2xl font-semibold font-mono tabular-nums">
                {totalEarned}
              </div>
              <div className="text-xs text-muted-foreground">coins recebidos no total</div>
            </div>
            <div>
              <div className="text-2xl font-semibold font-mono tabular-nums">
                {totalSpent}
              </div>
              <div className="text-xs text-muted-foreground">coins gastos no total</div>
            </div>
            <div>
              <div className="text-2xl font-semibold font-mono tabular-nums">
                {transactions.length}
              </div>
              <div className="text-xs text-muted-foreground">movimentações</div>
            </div>
          </div>
        </div>
      </div>

      {/* Custos por feature */}
      <div className="mb-8">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-3">
          Custo por feature
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {COSTS.map(({ icon: Icon, label, cost, free }) => (
            <div
              key={label}
              className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm font-medium truncate">{label}</span>
              </div>
              <div className="text-right shrink-0 ml-3">
                {free ? (
                  <Badge variant="secondary" className="text-[10px]">
                    Grátis
                  </Badge>
                ) : (
                  <span className="inline-flex items-center gap-1 text-sm font-mono font-semibold">
                    {cost} <LumioCoin size={14} />
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top-ups disponíveis (placeholder até Stripe) */}
      <div className="mb-8">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-3">
          Pacotes avulsos (em breve)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TOPUPS.map((pack) => (
            <div
              key={pack.coins}
              className={cn(
                "rounded-xl border bg-card p-5 transition-all relative",
                pack.popular
                  ? "border-primary/60 shadow-lg shadow-primary/10"
                  : "border-border/60",
              )}
            >
              {pack.popular && (
                <Badge variant="default" className="absolute -top-2 right-4 text-[10px]">
                  Mais vendido
                </Badge>
              )}
              <div className="flex items-center gap-2">
                <LumioCoin size={22} />
                <span className="text-2xl font-bold font-mono tabular-nums">
                  {pack.coins}
                </span>
                <span className="text-sm text-muted-foreground">coins</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-xl font-semibold">
                  R$ {pack.price.toFixed(2).replace(".", ",")}
                </span>
                {pack.discount && (
                  <Badge variant="secondary" className="text-[10px] text-emerald-600">
                    {pack.discount}
                  </Badge>
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                R$ {pack.perCoin.toFixed(2).replace(".", ",")} por coin
              </div>
              <Button variant="outline" className="w-full mt-4" disabled>
                Em breve
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Histórico */}
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-3">
          Histórico ({transactions.length})
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 px-4 py-12 text-center">
            <div className="flex justify-center mb-2">
              <LumiCharacter mood="sleeping" size="md" />
            </div>
            <p className="text-sm text-muted-foreground">Nenhuma movimentação ainda.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            <div className="divide-y divide-border/50">
              {transactions.map((tx) => {
                const meta = REASON_META[tx.reason] ?? {
                  label: tx.reason,
                  icon: CoinFallbackIcon,
                };
                const Icon = meta.icon;
                const positive = tx.amount > 0;
                const date = new Date(tx.created_at);
                return (
                  <div
                    key={tx.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors"
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        positive
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{meta.label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {date.toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={cn(
                          "text-sm font-mono font-semibold tabular-nums",
                          positive
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400",
                        )}
                      >
                        {positive ? "+" : ""}
                        {tx.amount}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        saldo: {tx.balance_after}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
