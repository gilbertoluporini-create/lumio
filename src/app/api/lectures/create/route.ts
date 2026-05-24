import { createAdminClient, createClient } from "@/lib/supabase/server";
import { PLAN_LECTURE_LIMIT, type PlanId } from "@/lib/stripe";
import { logAndSanitize } from "@/lib/api-security";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  subjectId: string;
  title: string;
};

const RESET_INTERVAL_DAYS = 30;

function shouldReset(resetAt: string | null): boolean {
  if (!resetAt) return true;
  const ms = Date.now() - new Date(resetAt).getTime();
  return ms >= RESET_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
}

export async function POST(req: Request) {
  // Rate limit IP (anti-spam de criação)
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`lectures:create:ip:${ip}`, 10, 60_000);
  if (ipLimit) return ipLimit;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.subjectId || !body.title) {
    return Response.json(
      { error: "subjectId e title são obrigatórios." },
      { status: 400 },
    );
  }
  if (body.title.length > 200) {
    return Response.json({ error: "Título muito longo." }, { status: 413 });
  }

  const supabaseEnabled = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (!supabaseEnabled || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json(
      { error: "Configuração de servidor incompleta." },
      { status: 503 },
    );
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Faça login." }, { status: 401 });
    }

    const admin = createAdminClient();

    // 1) Verifica plano + uso mensal
    const { data: profile } = await admin
      .from("profiles")
      .select("monthly_lectures_used, monthly_lectures_reset_at")
      .eq("id", user.id)
      .maybeSingle();

    const { data: sub } = await admin
      .from("subscriptions")
      .select("plan, status")
      .eq("user_id", user.id)
      .maybeSingle();

    const subRow = sub as { plan: PlanId | "free"; status: string } | null;
    const isActive =
      subRow?.status === "active" || subRow?.status === "trialing";
    const plan: keyof typeof PLAN_LECTURE_LIMIT =
      isActive && subRow ? (subRow.plan as keyof typeof PLAN_LECTURE_LIMIT) : "free";
    const limit = PLAN_LECTURE_LIMIT[plan] ?? PLAN_LECTURE_LIMIT.free;

    let used =
      (profile as { monthly_lectures_used: number } | null)
        ?.monthly_lectures_used ?? 0;
    const resetAt =
      (profile as { monthly_lectures_reset_at: string | null } | null)
        ?.monthly_lectures_reset_at ?? null;

    // 2) Reset mensal automático
    if (shouldReset(resetAt)) {
      used = 0;
      await admin
        .from("profiles")
        .update({
          monthly_lectures_used: 0,
          monthly_lectures_reset_at: new Date().toISOString(),
        })
        .eq("id", user.id);
    }

    if (used >= limit) {
      return Response.json(
        {
          error: `Você atingiu o limite de ${limit} aulas/mês do seu plano (${plan}). Faça upgrade ou espere a próxima renovação mensal.`,
          plan,
          limit,
          used,
          upgrade: "/pricing",
        },
        { status: 402 },
      );
    }

    // 3) Cria a aula
    const { data: lecture, error: insErr } = await admin
      .from("lectures")
      .insert({
        user_id: user.id,
        subject_id: body.subjectId,
        title: body.title.trim(),
        transcript: "",
        duration_sec: 0,
        status: "draft",
        messages: [],
      })
      .select(
        "id, user_id, subject_id, title, transcript, duration_sec, status, slides_file_name, slides, summary, messages, audio_url, created_at, updated_at",
      )
      .single();

    if (insErr || !lecture) {
      return Response.json(
        { error: insErr?.message ?? "Falha ao criar aula." },
        { status: 500 },
      );
    }

    // 4) Incrementa contador
    await admin
      .from("profiles")
      .update({ monthly_lectures_used: used + 1 })
      .eq("id", user.id);

    return Response.json({
      lecture,
      usage: { used: used + 1, limit, plan },
    });
  } catch (err) {
    return Response.json(logAndSanitize("api/lectures/create", err), {
      status: 500,
    });
  }
}
