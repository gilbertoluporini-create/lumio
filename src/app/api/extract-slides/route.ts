import Anthropic from "@anthropic-ai/sdk";
import { LIMITS, logAndSanitize, looksLikePdfBomb, sniffMagic } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `Você é um extrator de conteúdo de apresentações de slides acadêmicas (PDF disponibilizado pelo professor).

Para cada página/slide do documento, extraia:
- pageNumber: número da página (1, 2, 3, …)
- title: o título do slide se claro (string curta), ou null se não houver
- text: TODO o conteúdo textual do slide (bullets, parágrafos, legendas, captions). Mantenha a estrutura: use quebras de linha e marcadores "-" pra listas.

REGRAS:
- Páginas em branco ou só capa/contracapa: retorne text vazio mas inclua a página.
- Diagramas/imagens sem texto: descreva em 1 frase entre colchetes, ex: "[Diagrama de fluxograma mostrando processo X]".
- Tabelas: serialize em formato textual legível, linha por linha.
- NÃO invente conteúdo que não esteja no slide.
- Retorne APENAS um JSON válido no formato exato abaixo, sem markdown wrappers, sem texto extra.

FORMATO DE SAÍDA:
{"slides":[{"pageNumber":1,"title":"Título do slide ou null","text":"Conteúdo completo do slide"},...]}`;

type Slide = { pageNumber: number; title?: string; text: string };

function normalize(arr: unknown): Slide[] {
  if (!Array.isArray(arr)) return [];
  const out: Slide[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const pn = typeof o.pageNumber === "number" ? o.pageNumber : Number(o.pageNumber);
    if (!Number.isFinite(pn)) continue;
    const text = typeof o.text === "string" ? o.text : "";
    const titleRaw = o.title;
    const title =
      typeof titleRaw === "string" && titleRaw.trim().length > 0
        ? titleRaw.trim()
        : undefined;
    out.push({ pageNumber: pn, title, text });
  }
  return out.sort((a, b) => a.pageNumber - b.pageNumber);
}

function tryParseJson(text: string): Slide[] | null {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as { slides?: unknown };
    return normalize(parsed?.slides);
  } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]) as { slides?: unknown };
      return normalize(parsed?.slides);
    } catch {}
  }
  return null;
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Form inválido." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Arquivo ausente." }, { status: 400 });
  }
  if (file.size === 0 || file.size > LIMITS.PDF_BYTES) {
    return Response.json({ error: "Tamanho de PDF inválido (máx 20MB)." }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  // Sniff magic bytes (não confia em file.type que é spoofável)
  if (sniffMagic(buf) !== "pdf") {
    return Response.json({ error: "Arquivo não é um PDF válido." }, { status: 415 });
  }
  if (looksLikePdfBomb(buf)) {
    return Response.json(
      { error: `PDF com mais de ${LIMITS.PDF_MAX_PAGES_HINT} páginas. Reduza ou envie em partes.` },
      { status: 413 },
    );
  }
  const base64 = buf.toString("base64");

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return Response.json({
      fileName: file.name,
      demo: true,
      slides: [
        {
          pageNumber: 1,
          title: "Slide de exemplo (modo demo)",
          text: "Sem ANTHROPIC_API_KEY configurada. Configure em .env.local pra extrair de verdade.",
        },
        {
          pageNumber: 2,
          title: "Próximos passos",
          text: "1. Abrir .env.local na raiz\n2. Adicionar ANTHROPIC_API_KEY=sk-ant-...\n3. Reiniciar npm run dev",
        },
      ],
    });
  }

  const client = new Anthropic({ apiKey });

  try {
    const resp = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8000,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64,
              },
            },
            {
              type: "text",
              text: "Extraia o conteúdo de cada slide deste PDF no formato JSON especificado. Responda apenas com o JSON.",
            },
          ],
        },
      ],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const slides = tryParseJson(raw);

    if (!slides || slides.length === 0) {
      return Response.json(
        {
          fileName: file.name,
          slides: [],
          error:
            "Não consegui extrair slides do PDF. Verifique se o arquivo está legível e tente de novo.",
        },
        { status: 200 },
      );
    }

    return Response.json({ fileName: file.name, slides });
  } catch (err) {
    return Response.json(logAndSanitize("api/extract-slides", err), { status: 500 });
  }
}
