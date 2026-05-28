"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Gift,
  Loader2,
  MousePointerClick,
  Share2,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { LumiCharacter } from "@/components/brand/lumi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { User } from "@/lib/types";
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

type ReferralData = {
  code: string;
  url: string;
  stats: {
    total_clicks: number;
    total_signups: number;
    total_paid: number;
    total_reward_brl: number;
  };
  redemptions: Redemption[];
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

// Acesso direto pela URL por quem não é embaixador → manda pro dashboard.
function NotAmbassadorRedirect() {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace("/dashboard"), 1800);
    return () => clearTimeout(t);
  }, [router]);
  return (
    <div className="mx-auto max-w-md px-5 py-20 text-center">
      <h1 className="text-lg font-semibold">Área exclusiva de embaixadores</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        O programa de embaixadores é por convite. Redirecionando você pro
        dashboard…
      </p>
    </div>
  );
}

function EmbaixadorView() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<"code" | "url" | null>(null);

  useEffect(() => {
    fetch("/api/referral/mine")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          toast.error(d.error);
        } else {
          setData(d);
        }
      })
      .catch(() => toast.error("Falha ao carregar embaixador."))
      .finally(() => setLoading(false));
  }, []);

  function copy(value: string, kind: "code" | "url") {
    navigator.clipboard.writeText(value);
    setCopied(kind);
    toast.success(kind === "code" ? "Código copiado." : "Link copiado.");
    setTimeout(() => setCopied(null), 2000);
  }

  async function share() {
    if (!data) return;
    const text = `Tô usando o Lumio pra transcrever minhas aulas e gerar resumo, flashcard e quiz automaticamente. Cria conta com meu código e ganha 30 dias Pro grátis: ${data.url}`;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: "Vem pro Lumio",
          text,
          url: data.url,
        });
        return;
      } catch {
        // user cancelou ou navegador não suporta
      }
    }
    copy(text, "url");
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

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3 w-3" />
              Programa Embaixador
            </Badge>
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-display">
            Indique amigos. <span className="gradient-text">Ganhe Pro grátis.</span>
          </h1>
          <p className="mt-2 text-muted-foreground max-w-xl">
            A cada amigo que assina, você ganha 1 mês Pro grátis. Sem limite.
          </p>
        </div>
        <div className="hidden md:block">
          <LumiCharacter mood="celebrating" size="md" float />
        </div>
      </div>

      {/* Código + Link */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr] gap-4">
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
            Seu código
          </p>
          <div className="flex items-center gap-3">
            <code className="text-2xl md:text-3xl font-bold tracking-wider text-primary tabular-nums">
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
            Seu link
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
        <StatCard icon={Users} label="Signups" value={data.stats.total_signups} />
        <StatCard
          icon={UserCheck}
          label="Pagantes"
          value={data.stats.total_paid}
          accent
        />
        <StatCard
          icon={Gift}
          label="Recompensa"
          value={`R$ ${data.stats.total_reward_brl.toFixed(0)}`}
          accent
        />
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
            <p className="font-semibold text-foreground mb-2">Dicas pra escalar</p>
            <ul className="text-sm text-muted-foreground space-y-1.5">
              <li>· Posta o link no story do Insta uma vez por semana</li>
              <li>· Compartilha no grupo da sua faculdade/turma no WhatsApp</li>
              <li>· Manda no DM pra quem reclama que tá enterrado em PDF</li>
              <li>· Top embaixador do mês ganha plano Power vitalício</li>
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
          "display-num text-3xl font-bold tabular-nums",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function RedemptionRow({ redemption: r }: { redemption: Redemption }) {
  const statusMeta: Record<Redemption["status"], { label: string; className: string }> = {
    signed_up: { label: "Criou conta", className: "text-muted-foreground" },
    activated: { label: "Ativado", className: "text-blue-600 dark:text-blue-400" },
    paid: { label: "Pagante", className: "text-emerald-600 dark:text-emerald-400" },
    churned: { label: "Cancelou", className: "text-amber-600 dark:text-amber-400" },
    fraud: { label: "Bloqueado", className: "text-rose-600 dark:text-rose-400" },
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
            <p className="text-xs text-muted-foreground">
              Plano: {r.plan}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {r.reward_brl > 0 && (
          <span className="text-sm font-medium text-primary tabular-nums">
            +R$ {r.reward_brl.toFixed(0)}
          </span>
        )}
        <span className={cn("text-xs font-medium", meta.className)}>
          {meta.label}
        </span>
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: "Compartilha seu código ou link",
    desc: "Manda pra amigos da faculdade, no story do Insta, no grupo da turma.",
  },
  {
    title: "Amigo cria conta usando seu link",
    desc: "Ele ganha 30 dias Pro grátis logo no signup.",
  },
  {
    title: "Quando ele vira pagante, você ganha",
    desc: "1 mês Pro grátis na sua próxima renovação. Sem limite — convida quantos quiser.",
  },
  {
    title: "Top embaixador do mês",
    desc: "Quem trouxer mais pagantes no mês ganha plano Power vitalício + selo Embaixador no perfil.",
  },
];
