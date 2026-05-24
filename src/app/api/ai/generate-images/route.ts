/**
 * POST /api/ai/generate-images
 *
 * Gera 1-4 imagens educacionais via Imagen 3 (Google Generative AI REST).
 * Salva no bucket `ai-images` do Supabase Storage e retorna URLs públicas.
 *
 * Body: { prompts: string[] }  // max 4
 * Response: { urls: string[] }
 *
 * Se GOOGLE_AI_API_KEY não estiver setada: 503 com mensagem clara.
 *
 * NÃO debita coins aqui — o /api/ai/generate é quem orquestra o pricing
 * e chama essa rota internamente quando withImages=true.
 */

import { logAndSanitize } from "@/lib/api-security";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { logAiUsage } from "@/lib/ai-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BUCKET = "ai-images";
const MAX_PROMPTS = 4;
const IMAGEN_MODEL = "imagen-3.0-generate-002";

type Body = {
  prompts: string[];
};

type ImagenPredictResponse = {
  predictions?: Array<{
    bytesBase64Encoded?: string;
    mimeType?: string;
  }>;
  error?: { message?: string };
};

function wrapPrompt(raw: string): string {
  const trimmed = raw.trim().slice(0, 400);
  return `Educational illustration for university students, clean labeled diagram style, soft pastel colors, white background, no text labels in foreign languages, professional textbook aesthetic: ${trimmed}`;
}

async function ensureBucket(
  admin: ReturnType<typeof createAdminClient>,
): Promise<void> {
  try {
    const { data } = await admin.storage.getBucket(BUCKET);
    if (data) return;
  } catch {
    // segue pro create
  }
  try {
    await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: "10MB",
    });
  } catch (err) {
    // Outra request criou em paralelo — ignora se já existe
    console.warn("[generate-images] createBucket warn", err);
  }
}

async function generateOneImage(
  prompt: string,
  apiKey: string,
): Promise<{ b64: string; mime: string } | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=${apiKey}`;
  const body = {
    instances: [{ prompt: wrapPrompt(prompt) }],
    parameters: {
      sampleCount: 1,
      aspectRatio: "16:9",
      personGeneration: "allow_adult",
    },
  };

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[generate-images] fetch failed", err);
    return null;
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error("[generate-images] non-ok", resp.status, text.slice(0, 500));
    return null;
  }

  const json = (await resp.json()) as ImagenPredictResponse;
  const pred = json.predictions?.[0];
  if (!pred?.bytesBase64Encoded) {
    console.warn("[generate-images] no bytes returned");
    return null;
  }
  return {
    b64: pred.bytesBase64Encoded,
    mime: pred.mimeType ?? "image/png",
  };
}

function b64ToBuffer(b64: string): Buffer {
  return Buffer.from(b64, "base64");
}

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  return "png";
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`ai-images:ip:${ip}`, 5, 60_000);
  if (ipLimit) return ipLimit;

  // Auth
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Faça login." }, { status: 401 });
  }

  const userId: string = user.id;
  const userLimit = limitOrThrow(`ai-images:user:${userId}`, 10, 60_000);
  if (userLimit) return userLimit;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const prompts = Array.isArray(body.prompts) ? body.prompts : [];
  const valid = prompts
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .slice(0, MAX_PROMPTS);

  if (valid.length === 0) {
    return Response.json(
      { error: "Forneça pelo menos um prompt." },
      { status: 400 },
    );
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error:
          "Imagens AI temporariamente indisponíveis — admin precisa configurar Imagen API.",
        urls: [],
      },
      { status: 503 },
    );
  }

  try {
    const admin = createAdminClient();
    await ensureBucket(admin);

    // Roda em paralelo — Imagen é lento (~6-10s cada)
    const results = await Promise.all(
      valid.map((p) => generateOneImage(p, apiKey)),
    );

    const urls: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r) continue;
      const buffer = b64ToBuffer(r.b64);
      const ext = extFromMime(r.mime);
      const key = `${userId}/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(key, buffer, {
          contentType: r.mime,
          upsert: false,
        });
      if (upErr) {
        console.error("[generate-images] upload failed", upErr);
        continue;
      }

      const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(key);
      if (pub?.publicUrl) urls.push(pub.publicUrl);
    }

    if (urls.length > 0) {
      await logAiUsage({
        userId,
        endpoint: "generate-images",
        model: IMAGEN_MODEL,
        imagesCount: urls.length,
      });
    }

    return Response.json({ urls });
  } catch (err) {
    return Response.json(logAndSanitize("api/ai/generate-images", err), {
      status: 500,
    });
  }
}
