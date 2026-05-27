import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  DollarSign,
  Mail,
  Mic,
  Users,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lumio · Admin",
};

type SignupRow = {
  email: string;
  name: string | null;
  created_at: string;
  subscriptions: Array<{ plan: string | null; status: string | null }>;
};

type TicketRow = {
  id: string;
  subject: string;
  user_email: string;
  status: string;
  created_at: string;
};

export default async function AdminPage() {
  const supabase = createAdminClient();

  const [
    profilesRes,
    activeSubsRes,
    lecturesRes,
    recentSignupsRes,
    monthlyRevenueRes,
    openTicketsRes,
    recentTicketsRes,
  ] = await Promise.all([
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
      .limit(8) as unknown as Promise<{ data: SignupRow[] | null }>,
    supabase
      .from("subscriptions")
      .select("plan")
      .in("status", ["active", "trialing"]),
    supabase
      .from("support_tickets")
      .select("*", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("support_tickets")
      .select("id, subject, user_email, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const totalUsers = profilesRes.count ?? 0;
  const activeSubs = activeSubsRes.count ?? 0;
  const totalLectures = lecturesRes.count ?? 0;
  const openTickets = openTicketsRes.count ?? 0;

  // MRR estimate
  const planCounts: Record<string, number> = {};
  for (const row of (monthlyRevenueRes.data as Array<{ plan: string }> | null) ??
    []) {
    planCounts[row.plan] = (planCounts[row.plan] ?? 0) + 1;
  }
  const mrr =
    (planCounts.starter ?? 0) * 9 +
    (planCounts.pro ?? 0) * 19 +
    (planCounts.power ?? 0) * 49 +
    (planCounts.annual ?? 0) * (149 / 12);

  const signups = recentSignupsRes.data ?? [];
  const tickets = (recentTicketsRes.data ?? []) as TicketRow[];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Snapshot do Lumio em tempo real.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <KpiCard
          label="Usuários"
          value={totalUsers.toLocaleString("pt-BR")}
          icon={Users}
          href="/admin/users"
        />
        <KpiCard
          label="Assinaturas ativas"
          value={activeSubs.toLocaleString("pt-BR")}
          sub={`${planCounts.pro ?? 0} Pro · ${planCounts.starter ?? 0} Starter · ${planCounts.power ?? 0} Power`}
          icon={BookOpen}
        />
        <KpiCard
          label="MRR estimado"
          value={mrr.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}
          icon={DollarSign}
          href="/admin/metrics"
        />
        <KpiCard
          label="Tickets abertos"
          value={openTickets.toLocaleString("pt-BR")}
          icon={Mail}
          href="/admin/tickets"
          accent={openTickets > 0}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Últimos cadastros */}
        <Section title="Últimos cadastros" href="/admin/users">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/50 text-[10px] uppercase tracking-wider text-neutral-500 font-mono">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Email</th>
                  <th className="px-4 py-2 text-left font-medium">Plano</th>
                  <th className="px-4 py-2 text-left font-medium">Criado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {signups.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-6 text-center text-neutral-500 text-xs"
                    >
                      Sem cadastros ainda.
                    </td>
                  </tr>
                ) : (
                  signups.map((s) => {
                    const sub = s.subscriptions?.[0];
                    return (
                      <tr key={s.email} className="hover:bg-neutral-900/40">
                        <td className="px-4 py-2 font-mono text-[11px] truncate max-w-[200px]">
                          {s.email}
                        </td>
                        <td className="px-4 py-2 text-xs">
                          <span
                            className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-mono ${
                              sub?.status === "active"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-neutral-800 text-neutral-400"
                            }`}
                          >
                            {sub?.plan ?? "free"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-neutral-500">
                          {new Date(s.created_at).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Tickets recentes */}
        <Section title="Tickets recentes" href="/admin/tickets">
          <div className="divide-y divide-neutral-800">
            {tickets.length === 0 ? (
              <p className="px-4 py-6 text-center text-neutral-500 text-xs">
                Nenhum ticket por aqui.
              </p>
            ) : (
              tickets.map((t) => (
                <Link
                  key={t.id}
                  href="/admin/tickets"
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-900/40 transition-colors"
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full shrink-0 ${
                      t.status === "open"
                        ? "bg-amber-500"
                        : t.status === "in_progress"
                          ? "bg-sky-500"
                          : "bg-neutral-600"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{t.subject}</p>
                    <p className="text-[10px] font-mono text-neutral-500 truncate">
                      {t.user_email}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-neutral-500 shrink-0">
                    {new Date(t.created_at).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                </Link>
              ))
            )}
          </div>
        </Section>
      </div>

      {/* Stats footer */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <MiniStat icon={Mic} label="Aulas no total" value={totalLectures.toLocaleString("pt-BR")} />
        <MiniStat icon={BarChart3} label="Conversões" value={`${activeSubs > 0 && totalUsers > 0 ? ((activeSubs / totalUsers) * 100).toFixed(1) : "0"}%`} />
        <MiniStat icon={DollarSign} label="ARR projetado" value={(mrr * 12).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  href,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  accent?: boolean;
}) {
  const inner = (
    <div
      className={`rounded-lg border bg-neutral-900/40 p-4 transition-colors ${
        accent
          ? "border-amber-700/40 hover:border-amber-600/60"
          : "border-neutral-800 hover:border-neutral-700"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono">
          {label}
        </p>
        <Icon
          className={`h-3.5 w-3.5 ${accent ? "text-amber-400" : "text-neutral-500"}`}
        />
      </div>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      {sub && (
        <p className="text-[10px] text-neutral-500 mt-1 font-mono truncate">
          {sub}
        </p>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block group">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 flex items-center gap-3">
      <div className="h-8 w-8 rounded-md bg-neutral-800/60 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-neutral-400" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono truncate">
          {label}
        </p>
        <p className="text-sm font-semibold truncate">{value}</p>
      </div>
    </div>
  );
}

function Section({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5">
        <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-300">
          {title}
        </h2>
        {href && (
          <Link
            href={href}
            className="text-[10px] font-mono text-neutral-500 hover:text-neutral-200 inline-flex items-center gap-1"
          >
            Ver todos
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
