"use client";

import { useEffect, useState } from "react";
import {
  Award,
  Coins,
  Copy,
  KeyRound,
  Loader2,
  LogIn,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

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

type UserDetailResp = {
  profile: {
    id: string;
    email: string;
    name: string | null;
    coin_balance: number | null;
    created_at: string;
    is_ambassador: boolean | null;
    subscriptions: Array<{
      plan: string | null;
      status: string | null;
      current_period_end: string | null;
      cancel_at_period_end: boolean | null;
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
    }>;
  };
  auth: {
    banned_until: string | null;
    last_sign_in_at: string | null;
    email_confirmed_at: string | null;
  };
  lecture_count: number;
  recent_transactions: Array<{
    id: string;
    amount: number;
    reason: string;
    balance_after: number;
    created_at: string;
  }>;
};

export function UserDetailDrawer({
  user,
  onClose,
  onChanged,
}: {
  user: AdminUserRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<UserDetailResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [coinAmount, setCoinAmount] = useState<number>(50);
  const [coinReason, setCoinReason] = useState<string>("");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [magicLink, setMagicLink] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/admin/users/${user.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: UserDetailResp | { error: string }) => {
        if (!active) return;
        if ("error" in data) {
          toast.error(data.error);
        } else {
          setDetail(data);
        }
      })
      .catch((err) => {
        if (active) toast.error(err.message ?? "Falha ao carregar.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user.id]);

  async function doAction(action: string, body?: Record<string, unknown>) {
    setActionPending(action);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...(body ?? {}) }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        temp_password?: string;
        recoveryLink?: string;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Falha.");
      }
      if (data.temp_password) {
        setTempPassword(data.temp_password);
      }
      if (data.message) {
        toast.success(data.message);
      } else {
        toast.success("Ação executada.");
      }
      onChanged();
      // Recarrega detail
      const refreshed = await fetch(`/api/admin/users/${user.id}`, {
        cache: "no-store",
      }).then((r) => r.json());
      setDetail(refreshed as UserDetailResp);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setActionPending(null);
    }
  }

  async function doImpersonate() {
    setActionPending("impersonate");
    try {
      const res = await fetch(`/api/admin/users/${user.id}/impersonate`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        magic_link?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.magic_link) {
        throw new Error(data.error ?? "Falha.");
      }
      setMagicLink(data.magic_link);
      try {
        await navigator.clipboard.writeText(data.magic_link);
        toast.success("Magic link copiado pra clipboard.");
      } catch {
        toast.info("Magic link gerado.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setActionPending(null);
    }
  }

  async function doDelete() {
    if (
      !confirm(
        `Excluir DEFINITIVAMENTE ${user.email}? Esta ação cancela a subscription Stripe e remove o usuário. Não pode ser desfeita.`,
      )
    ) {
      return;
    }
    setActionPending("delete");
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Falha.");
      toast.success("Usuário excluído.");
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setActionPending(null);
    }
  }

  const isBanned = !!user.banned_until || !!detail?.auth.banned_until;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        aria-label="Fechar"
        onClick={onClose}
        className="flex-1 bg-black/70 backdrop-blur-sm"
      />
      <div className="w-full max-w-md bg-neutral-950 border-l border-neutral-800 overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate">
              {user.name ?? user.email.split("@")[0]}
            </h2>
            <p className="text-[11px] font-mono text-neutral-500 truncate">
              {user.email}
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Coins" value={user.coin_balance.toLocaleString("pt-BR")} />
            <Stat label="Aulas" value={String(user.lectures_count)} />
            <Stat label="Plano" value={user.plan} />
          </div>

          {/* Auth info */}
          <Box title="Auth">
            <Row label="ID" value={<code className="text-[10px] break-all">{user.id}</code>} />
            <Row
              label="Criado"
              value={new Date(user.created_at).toLocaleString("pt-BR")}
            />
            <Row
              label="Último login"
              value={
                user.last_sign_in_at
                  ? new Date(user.last_sign_in_at).toLocaleString("pt-BR")
                  : "—"
              }
            />
            <Row
              label="Status"
              value={
                isBanned ? (
                  <span className="text-red-400">Suspenso</span>
                ) : (
                  <span className="text-emerald-400">Ativo</span>
                )
              }
            />
            <Row
              label="Email confirmado"
              value={
                detail?.auth.email_confirmed_at
                  ? new Date(detail.auth.email_confirmed_at).toLocaleString("pt-BR")
                  : "—"
              }
            />
          </Box>

          {/* Account actions */}
          <Box title="Senha & acesso">
            <div className="space-y-2">
              <ActionRow
                icon={Mail}
                label="Enviar reset de senha"
                onClick={() => doAction("reset_password")}
                pending={actionPending === "reset_password"}
              />
              <ActionRow
                icon={KeyRound}
                label="Gerar senha temporária"
                onClick={() => doAction("set_temp_password")}
                pending={actionPending === "set_temp_password"}
              />
              <ActionRow
                icon={LogIn}
                label="Impersonate (magic link)"
                onClick={doImpersonate}
                pending={actionPending === "impersonate"}
              />
            </div>
            {tempPassword && (
              <div className="mt-3 rounded-md border border-amber-700/40 bg-amber-950/40 p-3">
                <p className="text-[10px] uppercase tracking-wider text-amber-400 font-mono mb-1">
                  Senha temporária (exibe uma vez)
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono text-amber-200 select-all">
                    {tempPassword}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(tempPassword);
                      toast.success("Copiado.");
                    }}
                    className="h-7 w-7 inline-flex items-center justify-center rounded text-amber-400 hover:bg-amber-900/40"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
            {magicLink && (
              <div className="mt-3 rounded-md border border-indigo-700/40 bg-indigo-950/40 p-3">
                <p className="text-[10px] uppercase tracking-wider text-indigo-300 font-mono mb-1">
                  Magic link
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[10px] font-mono text-indigo-200 truncate">
                    {magicLink}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(magicLink);
                      toast.success("Copiado.");
                    }}
                    className="h-7 w-7 inline-flex items-center justify-center rounded text-indigo-300 hover:bg-indigo-900/40"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </Box>

          {/* Coins management */}
          <Box title="Coins">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={coinAmount}
                  onChange={(e) => setCoinAmount(Number(e.target.value) || 0)}
                  className="w-20 h-8 rounded-md bg-neutral-900 border border-neutral-800 text-sm px-2 font-mono"
                />
                <input
                  type="text"
                  placeholder="Motivo (opcional)"
                  value={coinReason}
                  onChange={(e) => setCoinReason(e.target.value)}
                  className="flex-1 h-8 rounded-md bg-neutral-900 border border-neutral-800 text-sm px-2"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    doAction("grant_coins", {
                      amount: coinAmount,
                      reason: coinReason || undefined,
                    })
                  }
                  disabled={actionPending !== null || coinAmount <= 0}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-900/60 hover:bg-emerald-900 text-emerald-200 text-xs font-mono px-3 py-1.5 disabled:opacity-40"
                >
                  <Coins className="h-3.5 w-3.5" />
                  +{coinAmount} conceder
                </button>
                <button
                  onClick={() =>
                    doAction("deduct_coins", {
                      amount: coinAmount,
                      reason: coinReason || undefined,
                    })
                  }
                  disabled={actionPending !== null || coinAmount <= 0}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-red-950/60 hover:bg-red-950 text-red-300 text-xs font-mono px-3 py-1.5 disabled:opacity-40"
                >
                  -{coinAmount} debitar
                </button>
              </div>
            </div>
          </Box>

          {/* Recent transactions */}
          {detail?.recent_transactions && detail.recent_transactions.length > 0 && (
            <Box title="Transações recentes">
              <div className="space-y-1 text-xs font-mono">
                {detail.recent_transactions.slice(0, 6).map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between text-neutral-400"
                  >
                    <span className="truncate">{t.reason}</span>
                    <span
                      className={
                        t.amount < 0 ? "text-red-400" : "text-emerald-400"
                      }
                    >
                      {t.amount > 0 ? "+" : ""}
                      {t.amount}
                    </span>
                  </div>
                ))}
              </div>
            </Box>
          )}

          {/* Programa embaixador */}
          <Box title="Programa embaixador">
            {detail?.profile.is_ambassador ? (
              <button
                onClick={() => doAction("set_ambassador", { value: false })}
                disabled={actionPending !== null}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-amber-900/60 hover:bg-amber-900 text-amber-200 text-xs font-mono px-3 py-2 disabled:opacity-40"
              >
                {actionPending === "set_ambassador" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Award className="h-3.5 w-3.5" />
                )}
                É embaixador · remover
              </button>
            ) : (
              <button
                onClick={() => doAction("set_ambassador", { value: true })}
                disabled={actionPending !== null}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900 text-xs px-3 py-2 disabled:opacity-40"
              >
                {actionPending === "set_ambassador" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Award className="h-3.5 w-3.5 text-neutral-400" />
                )}
                Tornar embaixador
              </button>
            )}
            <p className="mt-2 text-[10px] text-neutral-500 font-mono leading-relaxed">
              Libera a aba/página de Embaixadores na conta do usuário.
            </p>
          </Box>

          {/* Ban controls */}
          <Box title="Suspensão">
            {isBanned ? (
              <button
                onClick={() => doAction("unban")}
                disabled={actionPending !== null}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-900/60 hover:bg-emerald-900 text-emerald-200 text-xs font-mono px-3 py-2 disabled:opacity-40"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Reativar conta
              </button>
            ) : (
              <button
                onClick={() => doAction("ban")}
                disabled={actionPending !== null}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-amber-900/60 hover:bg-amber-900 text-amber-200 text-xs font-mono px-3 py-2 disabled:opacity-40"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Suspender conta (100 anos)
              </button>
            )}
          </Box>

          {/* Danger zone */}
          <Box title="Zona perigosa" danger>
            <button
              onClick={doDelete}
              disabled={actionPending !== null}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-red-900/60 bg-red-950/40 hover:bg-red-950 text-red-300 text-xs font-mono px-3 py-2 disabled:opacity-40"
            >
              {actionPending === "delete" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Excluir definitivamente
            </button>
          </Box>

          {loading && (
            <div className="text-center text-xs text-neutral-500 font-mono py-2">
              <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
              Carregando detalhes…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Box({
  title,
  children,
  danger,
}: {
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border ${danger ? "border-red-900/40" : "border-neutral-800"} bg-neutral-900/40 p-3`}
    >
      <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono mb-2">
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs py-1">
      <span className="text-neutral-500 font-mono">{label}</span>
      <span className="text-neutral-200 text-right break-all">{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-2 text-center">
      <p className="text-[9px] uppercase tracking-wider text-neutral-500 font-mono">
        {label}
      </p>
      <p className="text-sm font-semibold truncate mt-0.5">{value}</p>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  label,
  onClick,
  pending,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  pending: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="w-full inline-flex items-center gap-2 rounded-md border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900 text-xs px-3 py-2 disabled:opacity-40"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Icon className="h-3.5 w-3.5 text-neutral-400" />
      )}
      <span>{label}</span>
    </button>
  );
}
