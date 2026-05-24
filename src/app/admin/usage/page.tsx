import { Suspense } from "react";
import Link from "next/link";
import {
  Activity,
  DollarSign,
  Loader2,
  TrendingUp,
  Users as UsersIcon,
} from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lumio · Uso & Margem",
};

const USD_TO_BRL = 5.5;

const PLAN_PRICE_BRL: Record<string, number> = {
  free: 0,
  starter: 20,
  pro: 100,
  power: 999,
  annual: 100,
};

type SearchParams = Promise<{
  q?: string;
  page?: string;
}>;

type UsageRow = {
  user_id: string | null;
  cost_usd: string | number;
};

type ProfileRow = {
  id: string;
  email: string;
  name: string | null;
  coin_balance: number;
};

type SubRow = {
  user_id: string;
  plan: string;
  status: string;
  current_period_end: string | null;
};

function startOfMonthISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export default async function AdminUsagePage(props: { searchParams: SearchParams }) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return (
      <div className="mx-auto max-w-7xl">
        <p className="text-sm text-red-400">Acesso negado.</p>
      </div>
    );
  }

  const sp = await props.searchParams;
  const query = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Uso & Margem</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Custo AI por usuário cruzado com receita assinada. Mês corrente.
        </p>
      </div>

      <Suspense fallback={<KpiSkeleton />}>
        <KpiRow />
      </Suspense>

      <div className="mt-6 mb-3">
        <form className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Buscar por email ou nome…"
            className="h-9 w-full max-w-sm rounded-md bg-neutral-900 border border-neutral-800 text-sm px-3 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600"
          />
          <button
            type="submit"
            className="h-9 rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 px-3 text-xs font-mono text-neutral-300"
          >
            Buscar
          </button>
        </form>
      </div>

      <Suspense fallback={<TableSkeleton />}>
        <UsersTable query={query} page={page} />
      </Suspense>
    </div>
  );
}

async function KpiRow() {
  const admin = createAdminClient();
  const since = startOfMonthISO();

  const [activeSubsRes, usageRes, activeUsersRes] = await Promise.all([
    admin.from("subscriptions").select("plan, status").in("status", ["active", "trialing"]),
    admin
      .from("ai_usage_log")
      .select("user_id, cost_usd")
      .gte("created_at", since),
    admin
      .from("ai_usage_log")
      .select("user_id")
      .gte("created_at", since)
      .not("user_id", "is", null),
  ]);

  const subs = (activeSubsRes.data as Array<{ plan: string; status: string }> | null) ?? [];
  let mrrBRL = 0;
  for (const s of subs) {
    mrrBRL += PLAN_PRICE_BRL[s.plan] ?? 0;
  }

  const usage = (usageRes.data as UsageRow[] | null) ?? [];
  const totalCostUsd = usage.reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0);
  const totalCostBRL = totalCostUsd * USD_TO_BRL;

  const marginBRL = mrrBRL - totalCostBRL;
  const marginPct = mrrBRL > 0 ? (marginBRL / mrrBRL) * 100 : 0;

  const distinctUsers = new Set<string>();
  for (const row of (activeUsersRes.data as Array<{ user_id: string }> | null) ?? []) {
    if (row.user_id) distinctUsers.add(row.user_id);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi
        label="Receita MRR estimada"
        value={mrrBRL.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        icon={DollarSign}
        accent="emerald"
      />
      <Kpi
        label={`Custo AI mês (USD ${USD_TO_BRL.toFixed(2)})`}
        value={totalCostBRL.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        sub={`US$ ${totalCostUsd.toFixed(2)}`}
        icon={Activity}
        accent="amber"
      />
      <Kpi
        label="Margem bruta"
        value={marginBRL.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        sub={`${marginPct.toFixed(1)}% de margem`}
        icon={TrendingUp}
        accent={marginBRL >= 0 ? "emerald" : "red"}
      />
      <Kpi
        label="Usuários AI ativos"
        value={distinctUsers.size.toLocaleString("pt-BR")}
        sub="distintos este mês"
        icon={UsersIcon}
      />
    </div>
  );
}

async function UsersTable({ query, page }: { query: string; page: number }) {
  const admin = createAdminClient();
  const since = startOfMonthISO();
  const PAGE_SIZE = 50;

  const usageRes = await admin
    .from("ai_usage_log")
    .select("user_id, cost_usd")
    .gte("created_at", since);

  const usageRows = (usageRes.data as UsageRow[] | null) ?? [];
  const usageMap = new Map<string, { cost: number; calls: number }>();
  for (const r of usageRows) {
    if (!r.user_id) continue;
    const cur = usageMap.get(r.user_id) ?? { cost: 0, calls: 0 };
    cur.cost += Number(r.cost_usd ?? 0);
    cur.calls += 1;
    usageMap.set(r.user_id, cur);
  }

  const userIds = Array.from(usageMap.keys());
  if (userIds.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-8 text-center text-xs text-neutral-500">
        Nenhum uso AI registrado este mês ainda. Assim que `ai_usage_log` receber inserts, esta tabela popula.
      </div>
    );
  }

  let profilesQuery = admin
    .from("profiles")
    .select("id, email, name, coin_balance")
    .in("id", userIds);

  if (query.length > 0) {
    profilesQuery = profilesQuery.or(`email.ilike.%${query}%,name.ilike.%${query}%`);
  }

  const [profilesRes, subsRes] = await Promise.all([
    profilesQuery,
    admin
      .from("subscriptions")
      .select("user_id, plan, status, current_period_end")
      .in("user_id", userIds),
  ]);

  const profiles = (profilesRes.data as ProfileRow[] | null) ?? [];
  const subs = (subsRes.data as SubRow[] | null) ?? [];

  const subMap = new Map<string, SubRow>();
  for (const s of subs) subMap.set(s.user_id, s);

  type EnrichedRow = {
    id: string;
    email: string;
    name: string | null;
    coin_balance: number;
    plan: string;
    status: string;
    current_period_end: string | null;
    calls: number;
    costUsd: number;
    revenueBRL: number;
    costBRL: number;
    marginBRL: number;
  };

  const enriched: EnrichedRow[] = profiles.map((p) => {
    const usage = usageMap.get(p.id) ?? { cost: 0, calls: 0 };
    const sub = subMap.get(p.id);
    const plan = sub?.plan ?? "free";
    const status = sub?.status ?? "inactive";
    const revenueBRL =
      sub && (status === "active" || status === "trialing")
        ? (PLAN_PRICE_BRL[plan] ?? 0)
        : 0;
    const costBRL = usage.cost * USD_TO_BRL;
    return {
      id: p.id,
      email: p.email,
      name: p.name,
      coin_balance: p.coin_balance ?? 0,
      plan,
      status,
      current_period_end: sub?.current_period_end ?? null,
      calls: usage.calls,
      costUsd: usage.cost,
      revenueBRL,
      costBRL,
      marginBRL: revenueBRL - costBRL,
    };
  });

  enriched.sort((a, b) => b.costUsd - a.costUsd);

  const total = enriched.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = enriched.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between">
        <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-300">
          Detalhamento por usuário
        </h2>
        <span className="text-[10px] font-mono text-neutral-500">
          {total} usuário{total === 1 ? "" : "s"} · ordenado por maior custo
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/80 text-[10px] uppercase tracking-wider text-neutral-500 font-mono">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Usuário</th>
              <th className="px-4 py-2 text-left font-medium">Plano</th>
              <th className="px-4 py-2 text-left font-medium">Vence em</th>
              <th className="px-4 py-2 text-right font-medium">Coins</th>
              <th className="px-4 py-2 text-right font-medium">Chamadas</th>
              <th className="px-4 py-2 text-right font-medium">Custo USD</th>
              <th className="px-4 py-2 text-right font-medium">Receita BRL</th>
              <th className="px-4 py-2 text-right font-medium">Margem BRL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {paged.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-neutral-500 text-xs">
                  Nenhum usuário corresponde à busca.
                </td>
              </tr>
            ) : (
              paged.map((u) => (
                <tr key={u.id} className="hover:bg-neutral-900/60">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={u.name ?? u.email} />
                      <div className="min-w-0">
                        <p className="text-xs truncate max-w-[200px]">
                          {u.name ?? "—"}
                        </p>
                        <p className="text-[10px] font-mono text-neutral-500 truncate max-w-[200px]">
                          {u.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <PlanBadge plan={u.plan} status={u.status} />
                  </td>
                  <td className="px-4 py-2 text-xs text-neutral-400 font-mono">
                    {u.current_period_end
                      ? new Date(u.current_period_end).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs font-mono tabular-nums text-right">
                    {u.coin_balance.toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-2 text-xs font-mono tabular-nums text-right">
                    {u.calls.toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-2 text-xs font-mono tabular-nums text-right text-amber-400">
                    ${u.costUsd.toFixed(4)}
                  </td>
                  <td className="px-4 py-2 text-xs font-mono tabular-nums text-right text-emerald-400">
                    {u.revenueBRL.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </td>
                  <td
                    className={`px-4 py-2 text-xs font-mono tabular-nums text-right ${
                      u.marginBRL >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {u.marginBRL.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-neutral-800 text-xs font-mono text-neutral-400">
          <span>
            Página {safePage} de {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <PageLink
              query={query}
              page={Math.max(1, safePage - 1)}
              disabled={safePage <= 1}
              label="← Anterior"
            />
            <PageLink
              query={query}
              page={Math.min(totalPages, safePage + 1)}
              disabled={safePage >= totalPages}
              label="Próxima →"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PageLink({
  query,
  page,
  disabled,
  label,
}: {
  query: string;
  page: number;
  disabled: boolean;
  label: string;
}) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("page", String(page));
  const href = `/admin/usage?${params.toString()}`;
  if (disabled) {
    return (
      <span className="px-2 py-1 rounded border border-neutral-800 opacity-40">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="px-2 py-1 rounded border border-neutral-800 hover:bg-neutral-800"
    >
      {label}
    </Link>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-[10px] font-mono font-semibold text-white">
      {initials || "?"}
    </div>
  );
}

function PlanBadge({ plan, status }: { plan: string; status: string }) {
  const isActive = status === "active" || status === "trialing";
  const colorMap: Record<string, string> = {
    free: "bg-neutral-800 text-neutral-400",
    starter: "bg-sky-950/60 text-sky-400",
    pro: "bg-indigo-950/60 text-indigo-300",
    power: "bg-fuchsia-950/60 text-fuchsia-300",
    annual: "bg-emerald-950/60 text-emerald-300",
  };
  return (
    <span
      className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-mono ${
        colorMap[plan] ?? "bg-neutral-800 text-neutral-400"
      } ${!isActive && plan !== "free" ? "opacity-50" : ""}`}
    >
      {plan}
    </span>
  );
}

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "emerald" | "amber" | "red";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-400"
      : accent === "amber"
        ? "text-amber-400"
        : accent === "red"
          ? "text-red-400"
          : "text-neutral-400";
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono">
          {label}
        </p>
        <Icon className={`h-3.5 w-3.5 ${accentClass}`} />
      </div>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      {sub && (
        <p className="text-[10px] text-neutral-500 mt-1 font-mono truncate">{sub}</p>
      )}
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 h-[88px] animate-pulse"
        />
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-8 text-center">
      <Loader2 className="h-5 w-5 animate-spin mx-auto text-neutral-500" />
    </div>
  );
}
