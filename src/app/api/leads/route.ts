import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { limitOrThrow, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PublicLeadSchema = z.object({
  name: z.string().trim().max(200).optional().nullable(),
  email: z.string().email().max(320),
  phone: z.string().trim().max(40).optional().nullable(),
  source: z
    .enum(["form-landing", "mailto-suporte", "waitlist", "unknown"])
    .default("form-landing"),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limited = limitOrThrow(`leads-public:${ip}`, 5, 60_000);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const parsed = PublicLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const ua = req.headers.get("user-agent") ?? null;
  const referer = req.headers.get("referer") ?? null;
  const metadata: Record<string, unknown> = {
    ...(parsed.data.metadata ?? {}),
    ip,
    user_agent: ua,
    referer,
    captured_at: new Date().toISOString(),
  };

  const payload = {
    name: parsed.data.name ?? null,
    email: parsed.data.email.toLowerCase().trim(),
    phone: parsed.data.phone ?? null,
    source: parsed.data.source,
    status: "new",
    score: 0,
    metadata,
  };

  const { data, error } = await admin
    .from("leads")
    .upsert(payload, { onConflict: "email", ignoreDuplicates: true })
    .select("id, email, created_at")
    .maybeSingle();

  if (error) {
    console.error("[api/leads] insert failed", error);
    return NextResponse.json(
      { ok: true, deduped: true },
      { status: 200 },
    );
  }

  return NextResponse.json({
    ok: true,
    deduped: !data,
    lead_id: (data as { id?: string } | null)?.id ?? null,
  });
}
