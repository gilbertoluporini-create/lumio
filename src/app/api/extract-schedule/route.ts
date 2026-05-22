import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `Você é um extrator de grade horária acadêmica. Você recebe uma imagem ou PDF de uma grade horária de faculdade/universidade/escola e precisa identificar todas as MATÉRIAS/DISCIPLINAS distintas presentes.

REGRAS:
- Extraia o nome ÚNICO de cada matéria/disciplina (sem horário, sem sala, sem professor).
- Normalize nomes (ex: "ANATOMIA HUMANA I" → "Anatomia Humana I"; "BIOQ" → tente expandir pra "Bioquímica" se contexto deixar claro).
- Ignore: horários, dias da semana, salas, blocos, intervalos, almoço, créditos.
- Cada matéria aparece UMA VEZ na lista de saída, mesmo que esteja em vários horários.
- Retorne APENAS um JSON válido no formato exato abaixo, sem texto adicional, sem markdown, sem \`\`\`json.

FORMATO DE SAÍDA (JSON puro):
{"subjects":[{"name":"<nome da matéria>"},{"name":"<outra matéria>"}]}

Se não conseguir identificar matérias claramente, retorne {"subjects":[]}.`;

type ExtractedSubject = { name: string };
type ExtractedPayload = { subjects: ExtractedSubject[] };

function normalize(arr: unknown): ExtractedSubject[] {
  if (!Array.isArray(arr)) return [];
  const out: ExtractedSubject[] = [];
  for (const item of arr) {
    if (
      item &&
      typeof item === "object" &&
      "name" in item &&
      typeof (item as { name: unknown }).name === "string"
    ) {
      const name = (item as { name: string }).name.trim();
      if (name.length > 0) out.push({ name });
    }
  }
  return out;
}

function tryParseJson(text: string): ExtractedPayload | null {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as { subjects?: unknown };
    return { subjects: normalize(parsed?.subjects) };
  } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { subjects?: unknown };
      return { subjects: normalize(parsed?.subjects) };
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
  if (file.size > 10 * 1024 * 1024) {
    return Response.json({ error: "Arquivo muito grande (máx 10MB)." }, { status: 400 });
  }

  const mime = file.type || "application/octet-stream";
  const buf = Buffer.from(await file.arrayBuffer());
  const base64 = buf.toString("base64");

  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Demo fallback
  if (!apiKey) {
    return Response.json(
      {
        subjects: [
          { name: "Anatomia" },
          { name: "Fisiologia" },
          { name: "Bioquímica" },
          { name: "Histologia" },
        ],
        demo: true,
        message:
          "Modo demo: a IA não está configurada (sem ANTHROPIC_API_KEY). Retornamos matérias fictícias pra você testar. Configure a chave em .env.local pra extração real da grade.",
      },
      { status: 200 },
    );
  }

  const client = new Anthropic({ apiKey });

  const isPdf = mime === "application/pdf";
  const isImage = mime.startsWith("image/");

  if (!isPdf && !isImage) {
    return Response.json(
      { error: "Tipo de arquivo não suportado. Envie PDF ou imagem (PNG, JPG, WEBP)." },
      { status: 400 },
    );
  }

  try {
    const content: Anthropic.MessageParam["content"] = [
      isPdf
        ? {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          }
        : {
            type: "image",
            source: {
              type: "base64",
              media_type: mime as
                | "image/jpeg"
                | "image/png"
                | "image/webp"
                | "image/gif",
              data: base64,
            },
          },
      {
        type: "text",
        text: "Extraia todas as matérias distintas dessa grade horária. Responda apenas com o JSON no formato especificado.",
      },
    ];

    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const parsed = tryParseJson(raw);

    if (!parsed) {
      return Response.json(
        {
          subjects: [],
          error:
            "Não consegui ler a grade. Verifique se o arquivo está nítido e tente novamente, ou adicione as matérias manualmente.",
        },
        { status: 200 },
      );
    }

    return Response.json({ subjects: parsed.subjects });
  } catch (err) {
    console.error("extract error", err);
    return Response.json(
      { error: `Erro ao processar: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
