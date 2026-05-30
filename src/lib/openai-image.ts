/**
 * Wrapper de geração de imagem via OpenAI GPT Image.
 *
 * Endpoint: POST https://api.openai.com/v1/images/generations
 * Doc: https://platform.openai.com/docs/api-reference/images/create
 *
 * A função retorna base64. Caller decide se faz upload pro Storage
 * ou serve inline.
 */

const OPENAI_IMAGE_URL = "https://api.openai.com/v1/images/generations";

export type ImageQuality = "low" | "medium" | "high";
export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";
export type ImageModel =
  | "gpt-image-2"
  | "chatgpt-image-latest"
  | "gpt-image-1.5"
  | "gpt-image-1"
  | "gpt-image-1-mini";
export type ImageOutputFormat = "png" | "jpeg" | "webp";

export const DEFAULT_OPENAI_IMAGE_MODEL: ImageModel =
  (process.env.OPENAI_IMAGE_MODEL as ImageModel | undefined) ??
  // gpt-image-1 = qualidade boa, 5-10x mais barato que gpt-image-2.
  // gpt-image-2 cobrava ~$0.50/imagem (high+refs); gpt-image-1 medium ~$0.04.
  // Override via env OPENAI_IMAGE_MODEL=gpt-image-2 quando o ROI compensar.
  "gpt-image-1";

type OpenAIImageResponse = {
  created: number;
  data: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
  error?: { message: string; type?: string };
};

export type OpenAIImageResult = {
  b64: string;
  revisedPrompt?: string;
  model: ImageModel;
};

/**
 * Wrapper de estilo: faz a imagem parecer fotografia documental ao invés
 * de "ilustração de IA". Adiciona âncoras técnicas (lente, luz, DOF) que
 * empurram o modelo pra realismo.
 *
 * Use pra capas de artigos / fotos de contexto educacional real.
 * NÃO use pra diagramas educacionais/científicos — pra esses, o prompt do
 * Haiku (illustrate / summary-images) já vai pronto e direto pro modelo.
 */
export function wrapPromptForRealism(rawPrompt: string): string {
  return [
    rawPrompt.trim(),
    "",
    "Style anchors: editorial documentary photography, shot on Hasselblad H6D, natural soft daylight, shallow depth of field, photorealistic, no text overlays, no captions, no watermarks, no AI-style oversaturation, muted natural tones, single clean focal subject, uncluttered composition.",
  ].join("\n");
}

/**
 * Wrapper específico pra /api/ai/illustrate (diagramas médicos, zero texto).
 * Mantido por compatibilidade com o endpoint illustrate; summary-images
 * usa wrapPromptForPremiumEducationalImage (estilo livre + cor).
 */
export function wrapPromptForMedicalDiagram(rawPrompt: string): string {
  return [
    rawPrompt.trim(),
    "",
    "Render this as a premium medical-academic infographic in the visual style of high-end biochemistry textbooks. Light off-white background with very subtle gradients. Color palette restricted to navy blue, light blue, soft teal, muted lilac, with rare warm accents. Smooth modern 3D-rendered anatomical structures (organs, molecules, cells, mitochondria, enzymes, neurons when relevant) blended with elegant flat vector infographic elements. Clean rounded-corner cards with light drop shadow. Generous negative space. Thin elegant arrows. Single clean focal scene, 16:9 landscape composition.",
    "",
    "CRITICAL TEXT RULE — read this carefully: the image must contain ZERO text. NO words. NO letters. NO characters. NO numbers as labels. NO captions, NO titles, NO subtitles, NO annotations, NO legends, NO axis labels, NO arrow labels, NO molecule names, NO process names, NO chemical formulas spelled out, NO Portuguese text, NO English text, NO Latin text, NO ANY text whatsoever. The illustration must communicate the concept PURELY through visual elements: shapes, colors, positions, arrows, anatomical accuracy, spatial relationships. Captions and labels will be added by the host application later as a separate HTML overlay — they do not belong inside the image. If the model is tempted to add even a single word, do not. This is the most important rule of the entire prompt.",
    "",
    "Avoid: any text or numbers as labels inside the image, childish cartoon look, dark heavy backgrounds, neon saturation, photographic realism, fantasy stylization, watermarks, logos, brand marks, signatures, busy cluttered composition, decorative ornaments unrelated to the subject, multiple competing focal points, fake URL strings, fake citation marks, fake legend boxes.",
  ].join("\n");
}

export function wrapPromptForPremiumEducationalImage(rawPrompt: string): string {
  return [
    rawPrompt.trim(),
    "",
    "Style: high-quality, polished educational illustration — like the top results you'd see from ChatGPT-generated images for textbook chapters. The artist chooses the visual idiom that best fits the content (clean flat editorial, semi-3D, isometric, schematic). Aim for visually striking composition with strong color and good contrast.",
    "",
    "Background: clean and vibrant. Choose a color that fits the subject — pure white, soft blue, soft mint, lavender, light gray, soft pink etc. AVOID defaulting to beige/cream/sepia — those look dated. The background should make the subject pop, not muddy it.",
    "",
    "CONTENT FIDELITY — strict:",
    "- Every visual element must correspond to something explicitly described in the prompt above. Do NOT invent extra steps, intermediate components, decorative blobs or filler shapes that don't represent something concrete.",
    "- Follow the structure/flow/count described — if 5 steps are mentioned, show 5 (not 6, not 4).",
    "- One clear focal point and one unambiguous reading order.",
    "",
    "TEXT POLICY — important:",
    "- IF the scene needs ≤3 short labels: include them (1-2 words each, pt-BR or universal abbreviations).",
    "- IF the scene would need >3 labels OR long phrases: DO NOT write text at all — communicate visually via shapes, color, arrows, position. Text gets misspelled when there's too much.",
    "- Universal abbreviations always allowed: DNA, RNA, ATP, NH3, H2O, CO2, pH, ECG, ALT, AST, Latin anatomical names.",
    "- Never write full sentences, paragraphs, captions or instructions inside the image. No Spanish.",
    "- If unsure of pt-BR spelling/accents → omit the label entirely.",
    "",
    "Avoid: misspelled words, watermarks, logos, signatures, generic stock-photo look, AI texture artifacts (warped hands, melting features), photorealistic medical imagery with gore/blood, fluids pouring into beakers/erlenmeyers when not in the source content, default beige/cream backgrounds, muddy desaturated palette.",
  ].join("\n");
}

export async function generateImageOpenAI({
  prompt,
  quality = "medium",
  size = "1024x1024",
  model = DEFAULT_OPENAI_IMAGE_MODEL,
  outputFormat = "webp",
  apiKey,
}: {
  prompt: string;
  quality?: ImageQuality;
  size?: ImageSize;
  model?: ImageModel;
  outputFormat?: ImageOutputFormat;
  apiKey: string;
}): Promise<OpenAIImageResult> {
  async function callImageModel(targetModel: ImageModel) {
    const resp = await fetch(OPENAI_IMAGE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: targetModel,
        prompt,
        n: 1,
        size,
        quality,
        // GPT Image models retornam b64_json por padrão; formato explícito ajuda
        // o caller a salvar no mime/ext corretos.
        output_format: outputFormat,
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
      model: targetModel,
    };
  }

  try {
    return await callImageModel(model);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const canFallback =
      model !== "gpt-image-1" &&
      (message.includes("must be verified") ||
        message.includes("organization must be verified") ||
        message.includes("does not have access"));
    if (!canFallback) throw err;
    console.warn(
      `[openai-image] ${model} indisponível; tentando fallback gpt-image-1`,
    );
    return callImageModel("gpt-image-1");
  }
}

export async function generateImageOpenAIWithoutFallback({
  prompt,
  quality = "medium",
  size = "1024x1024",
  model = DEFAULT_OPENAI_IMAGE_MODEL,
  outputFormat = "webp",
  apiKey,
}: {
  prompt: string;
  quality?: ImageQuality;
  size?: ImageSize;
  model?: ImageModel;
  outputFormat?: ImageOutputFormat;
  apiKey: string;
}): Promise<OpenAIImageResult> {
  const resp = await fetch(OPENAI_IMAGE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size,
      quality,
      // GPT Image models retornam b64_json por padrão; formato explícito ajuda
      // o caller a salvar no mime/ext corretos.
      output_format: outputFormat,
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
    model,
  };
}

export function isOpenAIImageConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Wrapper de GPT Image `/v1/images/edits` com IMAGENS DE REFERÊNCIA.
 *
 * Diferença pro `generateImageOpenAI`:
 *  - `generateImageOpenAI` = texto puro → imagem do zero
 *  - `editImageWithReferences` = texto + N imagens de referência → imagem nova
 *    mantendo identidade visual (mascote, paleta, estilo) das referências
 *
 * Use isso quando precisar de consistência de marca/personagem entre gerações
 * (ex: mascote Lumi em poses diferentes mantendo MESMA aparência).
 *
 * Endpoint: POST https://api.openai.com/v1/images/edits
 * Model default: gpt-image-2 (pode sobrescrever com OPENAI_IMAGE_MODEL)
 * Custos: similares ao generations (~$0.04-0.08/img medium quality)
 *
 * Limitações:
 *  - Máx 16 imagens de referência
 *  - Cada PNG/JPEG ≤ 50MB
 *  - Sem mask = modelo decide o que mudar; com mask = só áreas transparentes
 */
export async function editImageWithReferences({
  prompt,
  references,
  quality = "medium",
  size = "1024x1024",
  model = DEFAULT_OPENAI_IMAGE_MODEL,
  outputFormat = "webp",
  apiKey,
}: {
  prompt: string;
  references: Array<{ buffer: Buffer; filename: string }>;
  quality?: ImageQuality;
  size?: ImageSize;
  model?: ImageModel;
  outputFormat?: ImageOutputFormat;
  apiKey: string;
}): Promise<OpenAIImageResult> {
  if (references.length === 0) {
    throw new Error("editImageWithReferences: ao menos 1 referência exigida");
  }
  if (references.length > 16) {
    throw new Error("editImageWithReferences: máximo 16 referências");
  }

  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("size", size);
  form.append("quality", quality);
  form.append("output_format", outputFormat);

  for (const ref of references) {
    // Web FormData aceita Blob. Buffer → Blob.
    const blob = new Blob([new Uint8Array(ref.buffer)], { type: "image/jpeg" });
    form.append("image[]", blob, ref.filename);
  }

  const resp = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      // NÃO setar content-type — fetch infere boundary do FormData
    },
    body: form,
  });

  let json: OpenAIImageResponse;
  try {
    json = (await resp.json()) as OpenAIImageResponse;
  } catch {
    throw new Error(
      `OpenAI image edits: resposta inválida (HTTP ${resp.status})`,
    );
  }

  if (!resp.ok) {
    const msg = json.error?.message ?? `HTTP ${resp.status}`;
    const canFallback =
      model !== "gpt-image-1" &&
      (msg.includes("must be verified") ||
        msg.includes("organization must be verified") ||
        msg.includes("does not have access") ||
        msg.includes("unsupported"));
    if (canFallback) {
      console.warn(
        `[openai-image] edits ${model} indisponível; tentando fallback gpt-image-1`,
      );
      return editImageWithReferences({
        prompt,
        references,
        quality,
        size,
        model: "gpt-image-1",
        outputFormat,
        apiKey,
      });
    }
    throw new Error(`OpenAI image edits: ${msg}`);
  }

  const first = json.data?.[0];
  if (!first?.b64_json) {
    throw new Error("OpenAI image edits: resposta sem b64_json.");
  }

  return {
    b64: first.b64_json,
    revisedPrompt: first.revised_prompt,
    model,
  };
}
