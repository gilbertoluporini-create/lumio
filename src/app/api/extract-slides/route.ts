import { createMessage } from "@/lib/llm-fallback";
import {
  LIMITS,
  PDF_VISION_LIMIT_MB,
  logAndSanitize,
  looksLikePdfBomb,
  sniffMagic,
} from "@/lib/api-security";
import { COIN_COSTS, chargeCoins, creditCoins } from "@/lib/coins";
import { createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// PDF grande + Vision pode demorar bastante — Vercel Pro permite até 300s,
// dev/Hobby fica em 60s mas a tentativa de timeout aqui ajuda no dev local.
export const maxDuration = 300;

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
  // Rate limit por IP — Vision Sonnet em PDF é caríssimo
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`extract-slides:ip:${ip}`, 3, 60_000);
  if (ipLimit) return ipLimit;

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
  if (file.size === 0 || file.size > LIMITS.PDF_VISION_BYTES) {
    return Response.json(
      {
        error: `PDF muito grande pra Vision (máx ${PDF_VISION_LIMIT_MB}MB). Pra arquivos maiores o client extrai texto direto sem Vision.`,
        code: "pdf_too_large_for_vision",
      },
      { status: 413 },
    );
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

  // Gate de coins (somente quando Supabase configurado)
  const supabaseEnabled = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  let userId: string | null = null;
  if (supabaseEnabled) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
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
      return Response.json(
        { error: "Faça login pra anexar slides." },
        { status: 401 },
      );
    }
    userId = user.id;

    // Rate limit por user (mais restritivo)
    const userLimit = limitOrThrow(`extract-slides:user:${userId}`, 5, 60_000);
    if (userLimit) return userLimit;

    const charge = await chargeCoins(
      user.id,
      COIN_COSTS.extract_slides,
      "slides",
      { file_name: file.name, size_bytes: file.size },
    );
    if (!charge.ok) {
      return Response.json(
        {
          error: `Saldo insuficiente. Anexar slides custa ${charge.required} coins, você tem ${charge.balance}.`,
          required: charge.required,
          balance: charge.balance,
          upgrade: "/account/coins",
        },
        { status: 402 },
      );
    }
  }

  try {
    const resp = await createMessage({
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
      // Parsing falhou — devolve os coins porque nada usável foi entregue
      if (userId) {
        try {
          await creditCoins(userId, COIN_COSTS.extract_slides, "refund", {
            reason: "extract_slides_no_content",
            file_name: file.name,
          });
        } catch (refundErr) {
          console.error("[extract-slides] refund (no content) failed", refundErr);
        }
      }
      return Response.json(
        {
          fileName: file.name,
          slides: [],
          error:
            "Não consegui extrair slides do PDF. Coins devolvidos. Tenta de novo ou envia um PDF mais legível.",
        },
        { status: 200 },
      );
    }

    return Response.json({ fileName: file.name, slides });
  } catch (err) {
    if (userId) {
      try {
        await creditCoins(userId, COIN_COSTS.extract_slides, "refund", {
          reason: "extract_slides_api_failure",
          file_name: file.name,
          error_message: (err as Error)?.message?.slice(0, 200),
        });
      } catch (refundErr) {
        console.error("[extract-slides] refund failed", refundErr);
      }
    }
    console.error("[extract-slides] error:", err);
    return Response.json(
      {
        ...logAndSanitize("api/extract-slides", err),
        refunded: !!userId,
      },
      { status: 500 },
    );
  }
}
