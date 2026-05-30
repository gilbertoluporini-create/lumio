"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Loader2,
  MousePointerClick,
  Share2,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  CircleAlert,
  Banknote,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { LumiCharacter } from "@/components/brand/lumi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Redemption = {
  id: string;
  status: "signed_up" | "activated" | "paid" | "churned" | "fraud";
  plan: string | null;
  signed_up_at: string;
  paid_at: string | null;
  reward_brl: number;
  reward_applied: boolean;
};

type Payout = {
  id: string;
  period_start: string;
  period_end: string;
  commission_brl: number;
  status: "pending" | "paid" | "failed" | "cancelled";
  pix_paid_at: string | null;
  pix_transaction_id: string | null;
};

type ReferralData = {
  code: string;
  url: string;
  coupon_code: string | null;
  pix_key: string | null;
  commission_rate: number;
  stats: {
    total_clicks: number;
    total_signups: number;
    total_paid: number;
    total_reward_brl: number;
    estimated_commission_brl: number;
  };
  redemptions: Redemption[];
  payouts: Payout[];
};

export default function EmbaixadorPage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          {user.isAmbassador ? <EmbaixadorView /> : <NotAmbassadorRedirect />}
        </AppShell>
      )}
    </AuthGuard>
  );
}

function NotAmbassadorRedirect() {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace("/embaixador"), 1800);
    return () => clearTimeout(t);
  }, [router]);
  return (
    <div className="mx-auto max-w-md px-5 py-20 text-center">
      <h1 className="text-lg font-semibold">Área exclusiva de embaixadores</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        O programa de embaixadores é por convite. Te levo pra página de
        aplicação…
      </p>
    </div>
  );
}

function EmbaixadorView() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<"code" | "url" | "coupon" | null>(null);
  const [pixInput, setPixInput] = useState("");
  const [savingPix, setSavingPix] = useState(false);

  useEffect(() => {
    fetch("/api/referral/mine")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          toast.error(d.error);
        } else {
          setData(d);
          setPixInput(d.pix_key ?? "");
        }
      })
      .catch(() => toast.error("Falha ao carregar embaixador."))
      .finally(() => setLoading(false));
  }, []);

  function copy(value: string, kind: "code" | "url" | "coupon") {
    navigator.clipboard.writeText(value);
    setCopied(kind);
    const labels = { code: "Código", url: "Link", coupon: "Cupom" };
    toast.success(`${labels[kind]} copiado.`);
    setTimeout(() => setCopied(null), 2000);
  }

  async function share() {
    if (!data) return;
    const couponPart = data.coupon_code
      ? ` Usa o cupom ${data.coupon_code} no checkout pra ganhar 10% off.`
      : "";
    const text = `Tô usando o Lumio pra transcrever minhas aulas e gerar resumo, flashcard e quiz automaticamente.${couponPart} Link: ${data.url}`;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (
          navigator as Navigator & { share: (data: ShareData) => Promise<void> }
        ).share({
          title: "Vem pro Lumio",
          text,
          url: data.url,
        });
        return;
      } catch {
        /* ignore */
      }
    }
    copy(text, "url");
  }

  async function savePix() {
    if (savingPix) return;
    const trimmed = pixInput.trim();
    if (!trimmed) {
      toast.error("Digite uma chave PIX.");
      return;
    }
    setSavingPix(true);
    try {
      const res = await fetch("/api/referral/mine", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pix_key: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Falha ao salvar PIX.");
        return;
      }
      toast.success("Chave PIX salva. Comissões serão enviadas aqui.");
      setData((prev) => (prev ? { ...prev, pix_key: trimmed } : prev));
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    } finally {
      setSavingPix(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-muted-foreground">Não foi possível carregar.</p>
      </div>
    );
  }

  const commissionPct = Math.round(data.commission_rate * 100);
  const hasCoupon = !!data.coupon_code;
  const hasPix = !!data.pix_key;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3 w-3" />
              Programa Embaixador · {commissionPct}% recorrente
            </Badge>
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-display">
            Indique amigos.{" "}
            <span className="gradient-text">Receba PIX todo mês.</span>
          </h1>
          <p className="mt-2 text-muted-foreground max-w-xl">
            Você ganha {commissionPct}% de comissão recorrente sobre cada
            assinante que entrar pelo seu cupom. Sem limite, sem prazo.
          </p>
        </div>
        <div className="hidden md:block">
          <LumiCharacter mood="celebrating" size="md" float />
        </div>
      </div>

      {/* Setup alerts */}
      {(!hasCoupon || !hasPix) && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5">
          <div className="flex items-start gap-3">
            <CircleAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-foreground mb-2">
                Setup incompleto
              </p>
              <ul className="text-sm text-muted-foreground space-y-1">
                {!hasCoupon && (
                  <li>
                    · Seu cupom personalizado ainda não foi gerado. Manda DM pra{" "}
                    <strong className="text-foreground">@lumioapp</strong> pra
                    receber.
                  </li>
                )}
                {!hasPix && (
                  <li>
                    · Cadastra sua chave PIX abaixo pra receber comissão mensal.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Cupom personalizado (se existe) */}
      {hasCoupon && (
        <div className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card p-6">
          <p className="text-[11px] uppercase tracking-wider text-primary font-medium mb-2">
            Seu cupom Stripe — divulga ele
          </p>
          <div className="flex items-center gap-3">
            <code className="text-3xl md:text-4xl font-bold tracking-wider text-primary tabular-nums">
              {data.coupon_code}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copy(data.coupon_code!, "coupon")}
              className="ml-auto"
            >
              {copied === "coupon" ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Quem digitar esse cupom no checkout ganha{" "}
            <strong className="text-foreground">10% off</strong>. Você ganha{" "}
            <strong className="text-foreground">
              {commissionPct}% recorrente
            </strong>{" "}
            sobre o valor pago, todo mês que ele renovar.
          </p>
        </div>
      )}

      {/* Código + Link (tracking) */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr] gap-4">
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
            Código de tracking
          </p>
          <div className="flex items-center gap-3">
            <code className="text-xl md:text-2xl font-bold tracking-wider text-foreground/80 tabular-nums">
              {data.code}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copy(data.code, "code")}
              className="ml-auto"
            >
              {copied === "code" ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
            Seu link de divulgação
          </p>
          <div className="flex items-center gap-2">
            <code className="text-sm text-foreground/80 truncate flex-1 font-mono">
              {data.url}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copy(data.url, "url")}
            >
              {copied === "url" ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button size="sm" variant="gradient" onClick={share}>
              <Share2 className="h-4 w-4" />
              Compartilhar
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={MousePointerClick}
          label="Cliques"
          value={data.stats.total_clicks}
        />
        <StatCard
          icon={Users}
          label="Signups"
          value={data.stats.total_signups}
        />
        <StatCard
          icon={UserCheck}
          label="Pagantes"
          value={data.stats.total_paid}
          accent
        />
        <StatCard
          icon={Wallet}
          label="Comissão do mês"
          value={`R$ ${data.stats.estimated_commission_brl.toFixed(2)}`}
          accent
        />
      </div>

      {/* PIX setup */}
      <div className="rounded-2xl border border-border/60 bg-card p-6 md:p-8">
        <div className="flex items-center gap-2 mb-4">
          <Banknote className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold text-display">
            Chave PIX para recebimento
          </h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Comissão é paga em PIX até o dia 5 de cada mês. Aceitamos CPF, e-mail,
          celular ou chave aleatória.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Ex: 12345678900 ou seu@email.com"
            value={pixInput}
            onChange={(e) => setPixInput(e.target.value)}
            className="flex-1"
          />
          <Button
            onClick={savePix}
            disabled={savingPix || pixInput.trim() === (data.pix_key ?? "")}
            variant="gradient"
          >
            {savingPix ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Salvar PIX"
            )}
          </Button>
        </div>
        {hasPix && (
          <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">
            ✓ Chave salva: <code className="font-mono">{data.pix_key}</code>
          </p>
        )}
      </div>

      {/* Como funciona */}
      <div className="rounded-2xl border border-border/60 bg-card p-6 md:p-8">
        <h2 className="text-xl font-semibold text-display mb-5">
          Como funciona
        </h2>
        <ol className="space-y-4">
          {STEPS.map((s, i) => (
            <li key={i} className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold tabular-nums">
                {i + 1}
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Histórico de pagamentos */}
      {data.payouts.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card p-6 md:p-8">
          <h2 className="text-xl font-semibold text-display mb-5">
            Pagamentos recebidos
          </h2>
          <div className="space-y-2">
            {data.payouts.map((p) => (
              <PayoutRow key={p.id} payout={p} />
            ))}
          </div>
        </div>
      )}

      {/* Redemptions */}
      {data.redemptions.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card p-6 md:p-8">
          <h2 className="text-xl font-semibold text-display mb-5">
            Histórico de indicações
          </h2>
          <div className="space-y-2">
            {data.redemptions.map((r) => (
              <RedemptionRow key={r.id} redemption={r} />
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
        <div className="flex items-start gap-3">
          <TrendingUp className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <p className="font-semibold text-foreground mb-2">
              Dicas pra escalar
            </p>
            <ul className="text-sm text-muted-foreground space-y-1.5">
              <li>
                · Sempre usa o cupom{" "}
                <strong>{data.coupon_code ?? "[seu cupom]"}</strong> no caption +
                comentário fixo + bio
              </li>
              <li>· Posta 2-3x por semana — volume vence qualidade média</li>
              <li>· Cross-post Instagram → TikTok aumenta alcance 3x</li>
              <li>· Vídeo de macete didático é o que mais converte</li>
              <li>
                · Cada assinante Pro (R$ 69) = R${" "}
                {(69 * data.commission_rate).toFixed(2)}/mês na sua conta
                (recorrente)
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        accent ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card",
      )}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            accent ? "text-primary" : "text-muted-foreground",
          )}
        />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </p>
      </div>
      <p
        className={cn(
          "display-num text-2xl md:text-3xl font-bold tabular-nums",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function RedemptionRow({ redemption: r }: { redemption: Redemption }) {
  const statusMeta: Record<
    Redemption["status"],
    { label: string; className: string }
  > = {
    signed_up: { label: "Criou conta", className: "text-muted-foreground" },
    activated: {
      label: "Ativado",
      className: "text-blue-600 dark:text-blue-400",
    },
    paid: {
      label: "Pagante",
      className: "text-emerald-600 dark:text-emerald-400",
    },
    churned: {
      label: "Cancelou",
      className: "text-amber-600 dark:text-amber-400",
    },
    fraud: {
      label: "Bloqueado",
      className: "text-rose-600 dark:text-rose-400",
    },
  };
  const meta = statusMeta[r.status];
  const date = new Date(r.signed_up_at).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });

  return (
    <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg hover:bg-muted/40 transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
          {date.split(" ")[0]}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">Indicação · {date}</p>
          {r.plan && (
            <p className="text-xs text-muted-foreground">Plano: {r.plan}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {r.reward_brl > 0 && (
          <span className="text-sm font-medium text-primary tabular-nums">
            +R$ {r.reward_brl.toFixed(2)}
          </span>
        )}
        <span className={cn("text-xs font-medium", meta.className)}>
          {meta.label}
        </span>
      </div>
    </div>
  );
}

function PayoutRow({ payout: p }: { payout: Payout }) {
  const periodLabel = `${new Date(p.period_start).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  })} → ${new Date(p.period_end).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  })}`;
  const statusMeta: Record<
    Payout["status"],
    { label: string; className: string }
  > = {
    pending: {
      label: "Pendente",
      className: "text-amber-600 dark:text-amber-400",
    },
    paid: {
      label: "Pago",
      className: "text-emerald-600 dark:text-emerald-400",
    },
    failed: {
      label: "Falhou",
      className: "text-rose-600 dark:text-rose-400",
    },
    cancelled: {
      label: "Cancelado",
      className: "text-muted-foreground",
    },
  };
  const meta = statusMeta[p.status];

  return (
    <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg hover:bg-muted/40 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{periodLabel}</p>
        {p.pix_transaction_id && (
          <p className="text-[11px] text-muted-foreground font-mono truncate">
            TX: {p.pix_transaction_id}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-primary tabular-nums">
          R$ {p.commission_brl.toFixed(2)}
        </span>
        <span className={cn("text-xs font-medium", meta.className)}>
          {meta.label}
        </span>
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: "Compartilha seu cupom e link",
    desc: "Posta no Insta, TikTok, grupos. Sempre menciona o cupom — quem usar ganha 10% off e você ganha comissão.",
  },
  {
    title: "Buyer usa o cupom no checkout",
    desc: "Stripe aplica 10% de desconto automaticamente. Tu não precisa fazer nada.",
  },
  {
    title: "Comissão acumula a cada renovação",
    desc: "Toda vez que o assinante renovar, você ganha 25% do valor pago. Recorrente, todo mês.",
  },
  {
    title: "PIX no fim do mês",
    desc: "Até o dia 5 do mês seguinte, a comissão cai na sua chave PIX. Sem mínimo.",
  },
];
