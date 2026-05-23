import Link from "next/link";
import { ArrowLeft, BookOpen, DollarSign, Mic, Users } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";
import { LumioWordmark } from "@/components/brand/logo";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lumio · Admin",
};

type Metric = {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
};

type SignupRow = {
  email: string;
  name: string | null;
  created_at: string;
  subscriptions: Array<{ plan: string | null; status: string | null }>;
};

export default async function AdminPage() {
  const supabase = createAdminClient();

  const [profilesRes, activeSubsRes, lecturesRes, recentSignupsRes, monthlyRevenueRes] =
    await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("status", "active"),
      supabase.from("lectures").select("*", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("email, name, created_at, subscriptions(plan, status)")
        .order("created_at", { ascending: false })
        .limit(10) as unknown as Promise<{ data: SignupRow[] | null }>,
      supabase
        .from("subscriptions")
        .select("plan", { count: "exact", head: false })
        .eq("status", "active"),
    ]);

  const totalUsers = profilesRes.count ?? 0;
  const activeSubs = activeSubsRes.count ?? 0;
  const totalLectures = lecturesRes.count ?? 0;

  // MRR estimate (R$): pro = 19, annual = 149/12 ≈ 12.42
  const planCounts: Record<string, number> = {};
  for (const row of (monthlyRevenueRes.data as Array<{ plan: string }> | null) ?? []) {
    planCounts[row.plan] = (planCounts[row.plan] ?? 0) + 1;
  }
  const mrr =
    (planCounts.pro ?? 0) * 19 + (planCounts.annual ?? 0) * (149 / 12);

  const metrics: Metric[] = [
    {
      label: "Usuários totais",
      value: totalUsers.toLocaleString("pt-BR"),
      icon: Users,
    },
    {
      label: "Assinaturas ativas",
      value: activeSubs.toLocaleString("pt-BR"),
      sub: `${planCounts.pro ?? 0} Pro · ${planCounts.annual ?? 0} Anual`,
      icon: BookOpen,
    },
    {
      label: "MRR estimado",
      value: mrr.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      }),
      icon: DollarSign,
    },
    {
      label: "Aulas no total",
      value: totalLectures.toLocaleString("pt-BR"),
      icon: Mic,
    },
  ];

  const signups = recentSignupsRes.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Link>
            <span className="text-muted-foreground">·</span>
            <LumioWordmark className="opacity-90" />
            <span className="text-xs uppercase tracking-wider text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">
              Admin
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Painel</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Métricas em tempo real do Lumio.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-10">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="rounded-xl border border-border/70 bg-card p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  {m.label}
                </p>
                <m.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-3xl font-semibold tracking-tight">{m.value}</p>
              {m.sub && (
                <p className="text-xs text-muted-foreground mt-1">{m.sub}</p>
              )}
            </div>
          ))}
        </div>

        <section className="rounded-xl border border-border/70 bg-card overflow-hidden">
          <div className="border-b border-border/60 px-5 py-3">
            <h2 className="text-sm font-semibold">Últimos cadastros</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 text-left font-medium">Email</th>
                  <th className="px-5 py-2 text-left font-medium">Nome</th>
                  <th className="px-5 py-2 text-left font-medium">Plano</th>
                  <th className="px-5 py-2 text-left font-medium">Status</th>
                  <th className="px-5 py-2 text-left font-medium">Criado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {signups.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-8 text-center text-muted-foreground"
                    >
                      Sem cadastros ainda.
                    </td>
                  </tr>
                ) : (
                  signups.map((s) => {
                    const sub = s.subscriptions?.[0];
                    return (
                      <tr key={s.email} className="hover:bg-secondary/30">
                        <td className="px-5 py-3 font-mono text-xs">{s.email}</td>
                        <td className="px-5 py-3">{s.name ?? "—"}</td>
                        <td className="px-5 py-3">
                          {sub?.plan ?? "—"}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-block text-[10px] px-2 py-0.5 rounded-full ${
                              sub?.status === "active"
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                : "bg-secondary text-muted-foreground"
                            }`}
                          >
                            {sub?.status ?? "—"}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">
                          {new Date(s.created_at).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
