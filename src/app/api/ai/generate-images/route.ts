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
import { checkDailyCostCap, dailyCapResponse } from "@/lib/cost-cap";
import { isFeatureEnabled, featureDisabledResponse } from "@/lib/feature-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BUCKET = "ai-images";
const MAX_PROMPTS = 4;
// Imagen 4 padrão (~$0.04/img) — texto legível e composição rica.
// Pra letras ainda mais nítidas trocar pra "imagen-4.0-ultra-generate-001" (~$0.08).
// Pra economia agressiva (mas texto pior): "imagen-4.0-fast-generate-001" (~$0.02).
const IMAGEN_MODEL =
  process.env.IMAGEN_MODEL ?? "imagen-4.0-generate-001";

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

/**
 * Empacota o prompt do Haiku num "estilo Lumio": infográfico médico/acadêmico
 * em português, com layout estruturado, tipografia limpa e poucas palavras
 * (modelos de IA borram texto longo).
 *
 * Inspiração visual: infográficos médicos profissionais — fundo claro, seções
 * numeradas, ícones simples, diagrama anatômico central quando aplicável,
 * tipografia sans-serif sólida, paleta com 2-3 cores principais.
 */
function wrapPrompt(raw: string): string {
  const trimmed = raw.trim().slice(0, 500);
  return [
    "Premium educational infographic in Brazilian Portuguese (pt-BR), professional medical textbook style.",
    "LAYOUT: clean grid with 3-5 numbered sections, central main illustration (anatomical or schematic), labeled callouts on sides with arrows.",
    "TYPOGRAPHY: bold sans-serif headings (uppercase), short labels with very few words, NO long sentences, NO paragraphs of text — only key terms.",
    "STYLE: flat vector illustration, soft pastel palette (teal #4A9B9B, coral #E89B7D, navy #2C3E50, beige #F5EFE6), white or very light background, subtle shadows.",
    "Use real anatomical illustrations when the topic is biological/medical. Keep proportions realistic.",
    "DO NOT generate garbled or fake text. All labels must be REAL Portuguese words spelled correctly.",
    "Aspect ratio 3:4 vertical, high resolution, suitable for medical study material.",
    `CONTENT TO ILLUSTRATE: ${trimmed}`,
  ].join(" ");
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

  // Kill-switch global de imagens (admin pode desligar em emergência).
  if (!(await isFeatureEnabled("features.imagen.enabled"))) {
    return featureDisabledResponse("features.imagen.enabled");
  }

  // Cap diário USD (anti-abuse). Imagen é o endpoint mais caro ($0.04/img).
  const cap = await checkDailyCostCap(userId);
  if (!cap.ok) return dailyCapResponse(cap);

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
