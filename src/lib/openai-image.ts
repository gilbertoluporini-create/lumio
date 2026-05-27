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
 * Wrapper específico pra infográficos médico-acadêmicos PREMIUM.
 *
 * Estética de coleção: editorial sofisticado, fundo claro com gradientes
 * sutis, paleta azul-marinho/verde-água/lilás, ilustração biomédica 3D
 * limpa + infografia vetorial elegante, formato 16:9 horizontal.
 *
 * HISTÓRICO DE PROBLEMAS:
 * - v1 (Netter flat): faltava sofisticação editorial
 * - v2 (briefing com seções em CAPS): o gpt-image-1 RENDERIZAVA as labels
 *   das seções dentro da imagem ("aspect_ratio 3:4", "Type 5", "max_words",
 *   "sunsif" etc apareciam como texto da figura). Causa: o modelo lê
 *   labels em maiúsculas como instruções a desenhar.
 * - v3 (atual): prosa contínua em inglês, sem labels enumeradas, com
 *   restrições FORTES sobre texto na imagem (max 6 labels, max 2 palavras
 *   cada, sem instruções/metadados vazando).
 *
 * LIMITAÇÃO CONHECIDA: gpt-image-1 erra ortografia pt-BR (acentos,
 * "transaminação" vira "trransaminação"). Mitigação: labels curtíssimas,
 * apenas termos técnicos universais (ATP, NH3, CO2, alanina). Texto longo
 * em pt-BR deve vir em overlay externo, NÃO na imagem gerada.
 */
export function wrapPromptForMedicalDiagram(rawPrompt: string): string {
  return [
    rawPrompt.trim(),
    "",
    "Render this as a premium medical-academic infographic in the visual style of high-end biochemistry textbooks. Light off-white background with very subtle gradients. Color palette restricted to navy blue, light blue, soft teal, muted lilac, with rare warm accents. Smooth modern 3D-rendered anatomical structures (organs, molecules, cells, mitochondria, enzymes, neurons when relevant) blended with elegant flat vector infographic elements. Clean rounded-corner cards with light drop shadow. Generous negative space. Thin elegant arrows. Single clean focal scene, 16:9 landscape composition.",
    "",
    "Strict text constraints: the image must contain AT MOST 6 labels total. Each label is 1 to 3 words maximum. Allowed words: short technical terms only (organ names, molecule abbreviations like ATP, NH3, urea, CO2, glutamate, alanine, ALT, AST, mitochondria). No sentences. No paragraphs. No captions. No titles describing the scene. No style metadata, no parameter names, no debug strings, no aspect ratio tags, no color codes, no markdown, no code-like text inside the image. If unsure whether to add a label, do not add it.",
    "",
    "Avoid: childish cartoon look, dark heavy backgrounds, neon saturation, photographic realism, fantasy stylization, watermarks, logos, brand marks, signatures, busy cluttered composition, decorative ornaments unrelated to the subject, multiple competing focal points.",
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

/**
 * Wrapper de gpt-image-1 `/v1/images/edits` com IMAGENS DE REFERÊNCIA.
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
 * Model: gpt-image-1 (gpt-image-1-mini não suporta múltiplas imagens)
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
  apiKey,
}: {
  prompt: string;
  references: Array<{ buffer: Buffer; filename: string }>;
  quality?: ImageQuality;
  size?: ImageSize;
  apiKey: string;
}): Promise<OpenAIImageResult> {
  if (references.length === 0) {
    throw new Error("editImageWithReferences: ao menos 1 referência exigida");
  }
  if (references.length > 16) {
    throw new Error("editImageWithReferences: máximo 16 referências");
  }

  const form = new FormData();
  form.append("model", "gpt-image-1");
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("size", size);
  form.append("quality", quality);

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
    throw new Error(`OpenAI image edits: ${msg}`);
  }

  const first = json.data?.[0];
  if (!first?.b64_json) {
    throw new Error("OpenAI image edits: resposta sem b64_json.");
  }

  return {
    b64: first.b64_json,
    revisedPrompt: first.revised_prompt,
  };
}
