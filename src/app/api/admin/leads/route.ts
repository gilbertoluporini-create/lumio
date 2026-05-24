import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin, logAdminAction } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEAD_STATUSES = ["new", "contacted", "qualified", "converted", "lost"] as const;

const CreateSchema = z.object({
  name: z.string().trim().max(200).optional().nullable(),
  email: z.string().email().max(320),
  phone: z.string().trim().max(40).optional().nullable(),
  source: z.string().trim().max(50).default("manual"),
  status: z.enum(LEAD_STATUSES).default("new"),
  score: z.number().int().min(0).max(100).default(0),
  notes: z.string().trim().max(2000).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type LeadRow = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  source: string;
  status: string;
  score: number;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type LeadsListPayload = {
  leads: LeadRow[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  kpis: {
    total: number;
    this_week: number;
    last_week: number;
    delta_pct: number;
    converted_rate_pct: number;
    avg_score: number;
  };
};

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const search = (url.searchParams.get("q") ?? "").trim();
  const status = url.searchParams.get("status");
  const source = url.searchParams.get("source");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    Math.max(parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50, 1),
    200,
  );

  const admin = createAdminClient();

  let query = admin
    .from("leads")
    .select("id, name, email, phone, source, status, score, notes, metadata, created_at, updated_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false });

  if (status && status !== "all" && (LEAD_STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status);
  }
  if (source && source !== "all") {
    query = query.eq("source", source);
  }
  if (search) {
    const term = `%${search}%`;
    query = query.or(`email.ilike.${term},name.ilike.${term}`);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const leads = (data as LeadRow[] | null) ?? [];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const now = new Date();
  const week1Start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const week2Start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [totalCountRes, thisWeekRes, lastWeekRes, convertedRes, avgScoreRes] = await Promise.all([
    admin.from("leads").select("*", { count: "exact", head: true }),
    admin
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("created_at", week1Start.toISOString()),
    admin
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("created_at", week2Start.toISOString())
      .lt("created_at", week1Start.toISOString()),
    admin
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("status", "converted"),
    admin.from("leads").select("score"),
  ]);

  const totalAll = totalCountRes.count ?? 0;
  const thisWeek = thisWeekRes.count ?? 0;
  const lastWeek = lastWeekRes.count ?? 0;
  const deltaPct = lastWeek === 0 ? (thisWeek > 0 ? 100 : 0) : ((thisWeek - lastWeek) / lastWeek) * 100;
  const converted = convertedRes.count ?? 0;
  const convertedRatePct = totalAll === 0 ? 0 : (converted / totalAll) * 100;
  const scoreRows = (avgScoreRes.data as Array<{ score: number | null }> | null) ?? [];
  const scores = scoreRows.map((r) => Number(r.score ?? 0));
  const avgScore = scores.length === 0 ? 65 : scores.reduce((a, b) => a + b, 0) / scores.length;

  const payload: LeadsListPayload = {
    leads,
    total,
    page,
    page_size: pageSize,
    total_pages: totalPages,
    kpis: {
      total: totalAll,
      this_week: thisWeek,
      last_week: lastWeek,
      delta_pct: Math.round(deltaPct * 10) / 10,
      converted_rate_pct: Math.round(convertedRatePct * 10) / 10,
      avg_score: Math.round(avgScore * 10) / 10,
    },
  };

  return NextResponse.json(payload);
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const insertPayload = {
    name: parsed.data.name ?? null,
    email: parsed.data.email.toLowerCase().trim(),
    phone: parsed.data.phone ?? null,
    source: parsed.data.source,
    status: parsed.data.status,
    score: parsed.data.score,
    notes: parsed.data.notes ?? null,
    metadata: parsed.data.metadata ?? null,
  };

  const { data, error } = await admin
    .from("leads")
    .upsert(insertPayload, { onConflict: "email", ignoreDuplicates: false })
    .select("id, name, email, phone, source, status, score, notes, metadata, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction({
    adminEmail: guard.admin.email,
    action: "lead_create_manual",
    metadata: { email: insertPayload.email, source: insertPayload.source },
  });

  return NextResponse.json({ ok: true, lead: data as LeadRow | null });
}
