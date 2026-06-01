/**
 * GET  /api/user-profile  → devolve o perfil do user logado (ou null se ainda
 *                            não foi criado).
 * PATCH /api/user-profile → faz upsert parcial do perfil. Campos omitidos
 *                            ficam inalterados; campos com null limpam.
 *
 * Auth: cookie session via createClient(); RLS na tabela garante isolation.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  getUserProfileAsync,
  upsertUserProfileAsync,
} from "@/lib/user-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ExamDateSchema = z.object({
  subject: z.string().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida (use yyyy-mm-dd)"),
  note: z.string().max(500).optional(),
});

const PatchSchema = z.object({
  course: z.string().max(120).nullable().optional(),
  semester: z.string().max(60).nullable().optional(),
  graduationYear: z
    .number()
    .int()
    .min(2000)
    .max(2099)
    .nullable()
    .optional(),
  goal: z.string().max(60).nullable().optional(),
  difficultySubjects: z.array(z.string().max(120)).max(20).nullable().optional(),
  studyStyle: z
    .enum(["visual", "textual", "practical", "mixed"])
    .nullable()
    .optional(),
  studyHoursPerDay: z.number().min(0).max(24).nullable().optional(),
  bestStudyTime: z
    .enum(["morning", "afternoon", "evening", "late_night", "flexible"])
    .nullable()
    .optional(),
  examDates: z.array(ExamDateSchema).max(50).nullable().optional(),
  freeNotes: z.string().max(2000).nullable().optional(),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const profile = await getUserProfileAsync(supabase, user.id);
  return NextResponse.json({ profile });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const profile = await upsertUserProfileAsync(supabase, user.id, parsed.data);
  if (!profile) {
    return NextResponse.json(
      { error: "Falha ao salvar perfil" },
      { status: 500 },
    );
  }
  return NextResponse.json({ profile });
}
