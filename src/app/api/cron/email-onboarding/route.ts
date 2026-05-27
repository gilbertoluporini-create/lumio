/**
 * GET /api/cron/email-onboarding
 *
 * Cron diário (Vercel Cron) que dispara a sequência de onboarding:
 *  - day 1  → primeira dica de uso
 *  - day 3  → feature destaque (anexo PDF)
 *  - day 7  → flashcards SRS começando a aparecer
 *  - day 14 → conversão (trial → paid)
 *
 * Idempotência: registra send em `email_send_log` (criar tabela antes de ativar)
 * pra não enviar 2× o mesmo step pro mesmo user se o cron rodar duplicado.
 *
 * **Não ativar em vercel.json até que:**
 *  1. RESEND_FROM_EMAIL aponte pra domínio verificado (não onboarding@resend.dev)
 *  2. Tabela `email_send_log` exista (migration abaixo)
 *  3. Skip-list pra usuários que já são pagantes (não mandar day14 pra quem já paga)
 *
 * Migration sugerida (rodar via supabase CLI ou SQL editor):
 * ```sql
 * create table if not exists email_send_log (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid not null references auth.users(id) on delete cascade,
 *   email_kind text not null,         -- 'onboarding_day1' | 'onboarding_day3' | ...
 *   sent_at timestamptz not null default now(),
 *   unique (user_id, email_kind)
 * );
 * create index on email_send_log (user_id, email_kind);
 * ```
 */

import { createAdminClient } from "@/lib/supabase/server";
import { sendOnboardingEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type OnboardingStep = "day1" | "day3" | "day7" | "day14";

const STEPS: Array<{ step: OnboardingStep; daysAgo: number }> = [
  { step: "day1", daysAgo: 1 },
  { step: "day3", daysAgo: 3 },
  { step: "day7", daysAgo: 7 },
  { step: "day14", daysAgo: 14 },
];

function rangeForDay(daysAgo: number): { from: string; to: string } {
  const to = new Date();
  to.setUTCDate(to.getUTCDate() - daysAgo);
  to.setUTCHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setUTCHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function GET(req: Request) {
  // Vercel adiciona Authorization: Bearer ${CRON_SECRET} automaticamente
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const admin = createAdminClient();
  const stats: Record<OnboardingStep, { eligible: number; sent: number; skipped: number; errors: number }> = {
    day1: { eligible: 0, sent: 0, skipped: 0, errors: 0 },
    day3: { eligible: 0, sent: 0, skipped: 0, errors: 0 },
    day7: { eligible: 0, sent: 0, skipped: 0, errors: 0 },
    day14: { eligible: 0, sent: 0, skipped: 0, errors: 0 },
  };

  for (const { step, daysAgo } of STEPS) {
    const { from, to } = rangeForDay(daysAgo);
    const emailKind = `onboarding_${step}`;

    // Users criados nesse dia
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, email, name, role")
      .gte("created_at", from)
      .lte("created_at", to)
      .not("email", "is", null);

    if (error) {
      console.error(`[cron/email-onboarding] ${step} fetch failed`, error);
      continue;
    }

    const eligible = profiles ?? [];
    stats[step].eligible = eligible.length;

    for (const p of eligible) {
      if (!p.email) {
        stats[step].skipped++;
        continue;
      }
      // Skip admin
      if (p.role === "admin") {
        stats[step].skipped++;
        continue;
      }

      // Skip se já enviou esse step (idempotência)
      const { data: already } = await admin
        .from("email_send_log")
        .select("id")
        .eq("user_id", p.id)
        .eq("email_kind", emailKind)
        .maybeSingle();

      if (already) {
        stats[step].skipped++;
        continue;
      }

      // day14 só pra quem AINDA não converteu
      if (step === "day14") {
        const { data: sub } = await admin
          .from("subscriptions")
          .select("status")
          .eq("user_id", p.id)
          .maybeSingle();
        if (sub?.status === "active" || sub?.status === "trialing") {
          stats[step].skipped++;
          continue;
        }
      }

      try {
        const res = await sendOnboardingEmail({
          to: p.email,
          name: p.name ?? undefined,
          step,
        });
        if ("skipped" in res && res.skipped) {
          stats[step].skipped++;
          continue;
        }
        await admin.from("email_send_log").insert({
          user_id: p.id,
          email_kind: emailKind,
        });
        stats[step].sent++;
      } catch (err) {
        console.error(`[cron/email-onboarding] ${step} send failed for ${p.id}`, err);
        stats[step].errors++;
      }
    }
  }

  return Response.json({ ok: true, stats, ranAt: new Date().toISOString() });
}
