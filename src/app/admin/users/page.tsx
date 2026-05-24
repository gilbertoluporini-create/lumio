"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Loader2,
  RefreshCcw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { UserDetailDrawer } from "./_components/user-detail-drawer";

type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "admin";
  onboarded_at: string | null;
  created_at: string;
  coin_balance: number;
  banned_until: string | null;
  last_sign_in_at: string | null;
  plan: string;
  subscription_status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  lectures_count: number;
};

type SortKey = "created_at" | "email" | "plan" | "coin_balance" | "lectures_count";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (planFilter !== "all") params.set("plan", planFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", "500");
      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as
        | { users: AdminUserRow[] }
        | { error: string };
      if (!res.ok || "error" in json) {
        throw new Error("error" in json ? json.error : "Falha ao carregar.");
      }
      setUsers(json.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [search, planFilter, statusFilter]);

  useEffect(() => {
    const t = setTimeout(fetchUsers, 250);
    return () => clearTimeout(t);
  }, [fetchUsers]);

  const sorted = useMemo(() => {
    const copy = [...users];
    copy.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [users, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-sm text-neutral-400 mt-1">
            {users.length.toLocaleString("pt-BR")} resultado
            {users.length === 1 ? "" : "s"}
          </p>
        </div>
        <button
          onClick={fetchUsers}
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 px-3 py-1.5 text-xs font-mono text-neutral-300"
        >
          <RefreshCcw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por email ou nome…"
            className="w-full h-9 pl-9 pr-3 rounded-md bg-neutral-900 border border-neutral-800 text-sm placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600"
          />
        </div>
        <select
          value={planFilter}
          onChange={(e) => {
            setPlanFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md bg-neutral-900 border border-neutral-800 text-sm px-3 text-neutral-300"
        >
          <option value="all">Todos os planos</option>
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="pro">Pro</option>
          <option value="power">Power</option>
          <option value="annual">Anual</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md bg-neutral-900 border border-neutral-800 text-sm px-3 text-neutral-300"
        >
          <option value="all">Status: todos</option>
          <option value="active">Ativo</option>
          <option value="banned">Suspenso</option>
        </select>
        <select
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
          }}
          className="h-9 rounded-md bg-neutral-900 border border-neutral-800 text-sm px-3 text-neutral-300"
        >
          <option value="25">25 / pg</option>
          <option value="50">50 / pg</option>
          <option value="100">100 / pg</option>
        </select>
      </div>

      {/* Error / Loading */}
      {error && (
        <div className="mb-4 rounded-md border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/80 text-[10px] uppercase tracking-wider text-neutral-500 font-mono">
              <tr>
                <Th label="Email" sortKey="email" current={sortKey} dir={sortDir} onSort={toggleSort} />
                <th className="px-4 py-2 text-left font-medium">Nome</th>
                <Th label="Plano" sortKey="plan" current={sortKey} dir={sortDir} onSort={toggleSort} />
                <Th label="Coins" sortKey="coin_balance" current={sortKey} dir={sortDir} onSort={toggleSort} />
                <Th label="Aulas" sortKey="lectures_count" current={sortKey} dir={sortDir} onSort={toggleSort} />
                <Th label="Criado" sortKey="created_at" current={sortKey} dir={sortDir} onSort={toggleSort} />
                <th className="px-4 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-neutral-500" />
                  </td>
                </tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-neutral-500 text-xs"
                  >
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              ) : (
                paged.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    className="hover:bg-neutral-900/60 cursor-pointer"
                  >
                    <td className="px-4 py-2 font-mono text-xs truncate max-w-[240px]">
                      {u.email}
                    </td>
                    <td className="px-4 py-2 text-xs truncate max-w-[160px]">
                      {u.name ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <PlanBadge plan={u.plan} status={u.subscription_status} />
                    </td>
                    <td className="px-4 py-2 text-xs font-mono tabular-nums">
                      {u.coin_balance.toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-2 text-xs font-mono tabular-nums">
                      {u.lectures_count}
                    </td>
                    <td className="px-4 py-2 text-xs text-neutral-500 font-mono">
                      {new Date(u.created_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        year: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2">
                      {u.banned_until ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-950/60 text-red-400 border border-red-900/40">
                          <ShieldAlert className="h-3 w-3" /> Suspenso
                        </span>
                      ) : (
                        <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400">
                          Ativo
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {sorted.length > pageSize && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-neutral-800 text-xs font-mono text-neutral-400">
            <span>
              Página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2 py-1 rounded border border-neutral-800 disabled:opacity-40 hover:bg-neutral-800"
              >
                ← Anterior
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2 py-1 rounded border border-neutral-800 disabled:opacity-40 hover:bg-neutral-800"
              >
                Próxima →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selectedUser && (
        <UserDetailDrawer
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onChanged={() => {
            fetchUsers();
            toast.success("Usuário atualizado.");
          }}
        />
      )}
    </div>
  );
}

function Th({
  label,
  sortKey,
  current,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === current;
  return (
    <th className="px-4 py-2 text-left font-medium">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-neutral-200 ${
          active ? "text-neutral-200" : ""
        }`}
      >
        {label}
        {active && (
          <ChevronDown
            className={`h-3 w-3 transition-transform ${dir === "asc" ? "rotate-180" : ""}`}
          />
        )}
      </button>
    </th>
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
