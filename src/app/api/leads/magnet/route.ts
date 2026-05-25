import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { limitOrThrow, getClientIp } from "@/lib/rate-limit";
import { trackServerEvent } from "@/lib/server-analytics";
import { creditCoins } from "@/lib/coins";
import { sendLeadMagnetEmail } from "@/lib/email-lead-magnet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PDF_PATH = "/guia-revisao-prova.pdf";
const BONUS_COINS = 50;
const SOURCE = "guia-revisao";
const LEAD_KIND = "magnet_revisao";

const Body = z.object({
  email: z.string().email().max(320),
  lgpd: z.boolean().optional(),
});

/**
 * POST /api/leads/magnet
 * Body: { email: string, lgpd?: boolean }
 *
 * Fluxo:
 *  1. valida email + rate limit por IP (1/min)
 *  2. insert/upsert na tabela `leads` (kind=magnet_revisao, source=guia-revisao)
 *  3. se já existe user com esse email em profiles → credita 50 coins na hora
 *     (welcome_bonus + metadata.kind=lead_magnet_bonus)
 *     senão grava intenção em leads.metadata.bonus_coins=50 pro signup futuro ler
 *  4. dispara Meta CAPI "Lead" event (server-side, hashed email)
 *  5. envia email Resend com link do PDF
 *  6. retorna { ok: true, pdfUrl }
 *
 * Falha silenciosa em side-effects (email, capi, coins) — o user sempre recebe o link.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ua = req.headers.get("user-agent") ?? null;
  const referer = req.headers.get("referer") ?? null;

  const limited = limitOrThrow(`leads-magnet:${ip}`, 1, 60_000);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Email inválido." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase().trim();
  const admin = createAdminClient();

  // 1. checa se já existe usuário (profiles) com esse email
  let existingUserId: string | null = null;
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    existingUserId = (profile as { id?: string } | null)?.id ?? null;
  } catch (err) {
    console.error("[leads/magnet] lookup user failed", err);
  }

  // 2. credita coins agora (se user existe) ou marca intenção (se ainda não)
  let coinsCredited = false;
  let coinsIntent = false;
  if (existingUserId) {
    try {
      await creditCoins(existingUserId, BONUS_COINS, "welcome_bonus", {
        kind: "lead_magnet_bonus",
        source: SOURCE,
        magnet: "guia_revisao",
      });
      coinsCredited = true;
    } catch (err) {
      console.error("[leads/magnet] credit coins failed", err);
    }
  } else {
    coinsIntent = true;
  }

  // 3. upsert lead
  const leadMetadata: Record<string, unknown> = {
    kind: LEAD_KIND,
    magnet: "guia_revisao",
    bonus_coins: BONUS_COINS,
    bonus_credited: coinsCredited,
    bonus_pending: coinsIntent,
    lgpd_consent: parsed.data.lgpd === true,
    ip,
    user_agent: ua,
    referer,
    captured_at: new Date().toISOString(),
  };

  let leadId: string | null = null;
  try {
    const { data, error } = await admin
      .from("leads")
      .upsert(
        {
          email,
          source: SOURCE,
          status: "new",
          score: 0,
          metadata: leadMetadata,
        },
        { onConflict: "email", ignoreDuplicates: false },
      )
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[leads/magnet] upsert lead failed", error);
    } else {
      leadId = (data as { id?: string } | null)?.id ?? null;
    }
  } catch (err) {
    console.error("[leads/magnet] upsert lead threw", err);
  }

  // 4. server-side analytics (Meta CAPI + GA4 MP) — não bloqueia
  try {
    await trackServerEvent({
      name: "generate_lead",
      email,
      externalId: existingUserId ?? leadId ?? undefined,
      clientIp: ip,
      userAgent: ua ?? undefined,
      eventSourceUrl:
        (process.env.NEXT_PUBLIC_APP_URL ?? "https://lumioapp.net") + "/guia-revisao",
      custom: { source: SOURCE, magnet: "guia_revisao" },
    });
  } catch (err) {
    console.error("[leads/magnet] track event failed", err);
  }

  // 5. dispara email com PDF + CTA — não bloqueia retorno
  try {
    await sendLeadMagnetEmail({ to: email, bonusCoins: BONUS_COINS });
  } catch (err) {
    console.error("[leads/magnet] send email failed", err);
  }

  return NextResponse.json({
    ok: true,
    pdfUrl: PDF_PATH,
    bonusCoins: BONUS_COINS,
    bonusCredited: coinsCredited,
    bonusPending: coinsIntent,
  });
}
