/**
 * Wrapper de geração de imagem via OpenAI gpt-image-1.
 *
 * Endpoint: POST https://api.openai.com/v1/images/generations
 * Doc: https://platform.openai.com/docs/api-reference/images/create
 *
 * Custos (gpt-image-1 jan/2026):
 *  - low:    ~$0.011/img  (1024x1024, low quality)
 *  - medium: ~$0.042/img  (1024x1024, medium)
 *  - high:   ~$0.167/img  (1024x1024, high)
 *
 * A função retorna base64 PNG. Caller decide se faz upload pro Storage
 * ou serve inline.
 */

const OPENAI_IMAGE_URL = "https://api.openai.com/v1/images/generations";

export type ImageQuality = "low" | "medium" | "high";
export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";

type OpenAIImageResponse = {
  created: number;
  data: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
  error?: { message: string; type?: string };
};

export type OpenAIImageResult = {
  b64: string;
  revisedPrompt?: string;
};

/**
 * Wrapper de estilo: faz a imagem parecer fotografia documental ao invés
 * de "ilustração de IA". Adiciona âncoras técnicas (lente, luz, DOF) que
 * empurram o modelo pra realismo.
 *
 * Use pra capas de artigos / fotos de contexto educacional real.
 * NÃO use pra diagramas médicos/científicos — use `wrapPromptForMedicalDiagram`.
 */
export function wrapPromptForRealism(rawPrompt: string): string {
  return [
    rawPrompt.trim(),
    "",
    "Style anchors: editorial documentary photography, shot on Hasselblad H6D, natural soft daylight, shallow depth of field, photorealistic, no text overlays, no captions, no watermarks, no AI-style oversaturation, muted natural tones, single clean focal subject, uncluttered composition.",
  ].join("\n");
}

/**
 * Wrapper específico pra diagramas/infográficos médico-científicos.
 * Empurra o modelo pra estética de figura de livro-texto (Netter / NEJM / Lancet)
 * em vez de fotografia. Mantém labels legíveis, paleta limitada, traço técnico.
 *
 * Usar em qualquer contexto educacional onde o prompt descreve estrutura
 * anatômica, fluxo, ciclo, comparação ou tabela visual.
 */
export function wrapPromptForMedicalDiagram(rawPrompt: string): string {
  return [
    rawPrompt.trim(),
    "",
    "Style anchors: clean medical textbook illustration in the visual style of Netter's Atlas of Human Anatomy and NEJM scientific figures. Flat vector-style rendering, precise linework, limited muted color palette (anatomical reds, blues, beiges, off-white background), clear hierarchy of shapes, plenty of negative space. Crisp legible Portuguese labels with thin leader lines pointing to specific structures. No photorealistic rendering, no 3D effects, no glossy or neon colors, no fantasy stylization, no decorative ornaments, no characters or people unless explicitly part of the prompt. Single uncluttered focal subject centered in frame. Watermark-free, signature-free.",
  ].join("\n");
}

export async function generateImageOpenAI({
  prompt,
  quality = "medium",
  size = "1024x1024",
  apiKey,
}: {
  prompt: string;
  quality?: ImageQuality;
  size?: ImageSize;
  apiKey: string;
}): Promise<OpenAIImageResult> {
  const resp = await fetch(OPENAI_IMAGE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size,
      quality,
      // gpt-image-1 retorna b64_json por padrão; explicito por segurança
      output_format: "png",
    }),
  });

  let json: OpenAIImageResponse;
  try {
    json = (await resp.json()) as OpenAIImageResponse;
  } catch {
    throw new Error(`OpenAI image: resposta inválida (HTTP ${resp.status})`);
  }

  if (!resp.ok) {
    const msg = json.error?.message ?? `HTTP ${resp.status}`;
    throw new Error(`OpenAI image: ${msg}`);
  }

  const first = json.data?.[0];
  if (!first?.b64_json) {
    throw new Error("OpenAI image: resposta sem b64_json.");
  }

  return {
    b64: first.b64_json,
    revisedPrompt: first.revised_prompt,
  };
}

export function isOpenAIImageConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
