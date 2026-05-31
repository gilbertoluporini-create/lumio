import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string(),
  attachment: z
    .object({
      kind: z.enum(["summary", "flashcards", "quiz", "mindmap"]),
      title: z.string(),
      href: z.string().optional(),
      preview: z.string().optional(),
    })
    .optional(),
  tools: z
    .array(
      z.object({
        name: z.string(),
        status: z.enum(["running", "done", "error"]),
        output: z.unknown().optional(),
      }),
    )
    .optional(),
  userAttachments: z
    .array(
      z.object({
        name: z.string(),
        contentType: z.string().optional(),
        sizeKb: z.number().optional(),
      }),
    )
    .optional(),
});

const ChatUpsertSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  title: z.string().min(1).max(200),
  subjectId: z.string().nullable().optional(),
  subjectName: z.string().nullable().optional(),
  category: z
    .enum(["summary", "flashcards", "quiz", "translate", "explain", "chat"])
    .nullable()
    .optional(),
  messages: z.array(MessageSchema).max(500),
  pinned: z.boolean().default(false),
  starred: z.boolean().default(false),
  deletedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Validador soft pra payload UUID; se vier id não-UUID (legado localStorage),
// rejeita pra evitar lixo no DB.
function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("lumi_chats")
    .select(
      "id, title, subject_id, subject_name, category, messages, pinned, starred, deleted_at, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[api/lumi/chats][GET]", error);
    return NextResponse.json({ error: "Erro ao listar." }, { status: 500 });
  }

  const chats = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: row.id,
    title: row.title,
    subjectId: row.subject_id ?? undefined,
    subjectName: row.subject_name ?? undefined,
    category: row.category ?? undefined,
    messages: row.messages ?? [],
    pinned: !!row.pinned,
    starred: !!row.starred,
    deletedAt: row.deleted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return NextResponse.json({ chats });
}

export async function POST(req: NextRequest) {
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
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = ChatUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Payload inválido." },
      { status: 400 },
    );
  }
  if (!isUuid(parsed.data.id)) {
    return NextResponse.json(
      { error: "id deve ser UUID v4." },
      { status: 400 },
    );
  }

  const row = {
    id: parsed.data.id,
    user_id: user.id,
    title: parsed.data.title,
    subject_id: parsed.data.subjectId ?? null,
    subject_name: parsed.data.subjectName ?? null,
    category: parsed.data.category ?? null,
    messages: parsed.data.messages,
    pinned: parsed.data.pinned,
    starred: parsed.data.starred,
    deleted_at: parsed.data.deletedAt ?? null,
    created_at: parsed.data.createdAt,
    updated_at: parsed.data.updatedAt,
  };

  const { error } = await supabase
    .from("lumi_chats")
    .upsert(row, { onConflict: "id" });

  if (error) {
    console.error("[api/lumi/chats][POST]", error);
    return NextResponse.json({ error: "Erro ao salvar." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
