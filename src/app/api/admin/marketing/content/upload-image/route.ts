/**
 * POST /api/admin/marketing/content/upload-image
 *
 * Recebe imagem (multipart/form-data) gerada externamente (ChatGPT, Gemini,
 * Midjourney etc) e sobe pro Supabase Storage, salvando URL no draft.
 *
 * Body multipart:
 *   - draft_id (string)
 *   - ratio: "1x1" | "landscape" | "portrait"
 *   - file (File/Blob)
 *
 * Resp: { url, ratio }
 *
 * Apenas admin.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "marketing-images";
const ALLOWED_RATIOS = ["1x1", "landscape", "portrait"] as const;
type Ratio = (typeof ALLOWED_RATIOS)[number];

async function ensureBucket(supabase: ReturnType<typeof createAdminClient>) {
  try {
    const { data } = await supabase.storage.getBucket(BUCKET);
    if (data) return;
    await supabase.storage.createBucket(BUCKET, {
      public: true,
      allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
      fileSizeLimit: 10 * 1024 * 1024,
    });
  } catch {
    // ignore — bucket pode já existir
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { error: "multipart/form-data esperado" },
      { status: 400 },
    );
  }

  const draftId = String(form.get("draft_id") || "");
  const ratio = String(form.get("ratio") || "") as Ratio;
  const file = form.get("file");

  if (!draftId || !ratio || !file || !(file instanceof Blob)) {
    return NextResponse.json(
      { error: "draft_id, ratio e file obrigatórios" },
      { status: 400 },
    );
  }
  if (!ALLOWED_RATIOS.includes(ratio)) {
    return NextResponse.json(
      { error: `ratio inválido. use: ${ALLOWED_RATIOS.join(", ")}` },
      { status: 400 },
    );
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "arquivo >10MB — comprima antes" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  await ensureBucket(supabase);

  const ext = file.type.includes("png")
    ? "png"
    : file.type.includes("webp")
      ? "webp"
      : "jpg";
  const path = `content-drafts/${draftId}/${ratio}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "image/png",
      upsert: true,
    });

  if (uploadErr) {
    return NextResponse.json(
      { error: `upload falhou: ${uploadErr.message}` },
      { status: 500 },
    );
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = pub.publicUrl;

  // Atualiza o draft — merge na chave ratio_<ratio>
  const { data: draftRaw } = await supabase
    .from("content_drafts")
    .select("images")
    .eq("id", draftId)
    .single();

  const currentImages =
    (draftRaw?.images as Record<string, unknown> | null) || {};
  const newImages = {
    ...currentImages,
    [`ratio_${ratio}`]: {
      url,
      size: ratio === "1x1" ? "1024x1024" : ratio === "landscape" ? "1536x1024" : "1024x1536",
      source: "manual_upload",
      uploaded_at: new Date().toISOString(),
    },
  };

  await supabase
    .from("content_drafts")
    .update({ images: newImages })
    .eq("id", draftId);

  return NextResponse.json({ url, ratio });
}
