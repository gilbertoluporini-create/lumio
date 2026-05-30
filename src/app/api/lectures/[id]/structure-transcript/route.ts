import { NextResponse, type NextRequest } from "next/server";
import { createMessage } from "@/lib/llm-fallback";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { logAndSanitize, escapeForPrompt } from "@/lib/api-security";
import { COIN_COSTS, chargeCoins, creditCoins } from "@/lib/coins";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { assertLectureOwnership } from "@/lib/lecture-auth";
import { logAiUsage } from "@/lib/ai-usage";
import { splitIntoChunks, type TranscriptChunk } from "@/lib/transcript-chunking";
import type {
  TranscriptEntry,
  TranscriptChapters,
  TranscriptRevisedChapter,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 300s pra aulas longas (1h+): Sonnet 4.5 pode levar 4-6 min revisando
// transcrições de 20K+ tokens. 120s estava abortando em prod silenciosamente.
export const maxDuration = 300;

const SYSTEM_PROMPT = `Você é um editor de transcrições de aulas universitárias em português brasileiro.

Você recebe uma transcrição CRUA de uma aula (gerada por speech-to-text, com erros), separada em frases curtas com timestamps em segundos. Sua tarefa é produzir uma versão REVISADA e ESTRUTURADA, sem alterar o significado original.

DUAS COISAS QUE VOCÊ DEVE FAZER:

1. CORRIGIR TEXTO
   - Conserte palavras que claramente foram mal reconhecidas pelo speech-to-text (especialmente termos técnicos/médicos da matéria).
   - Adicione pontuação ausente (vírgulas, pontos, dois-pontos).
   - Capitalize início de frases e nomes próprios.
   - NÃO invente conteúdo. Frases incompletas ficam incompletas.
   - NÃO traduza. Mantém português do Brasil.
   - NÃO resuma. Mantém integridade do texto.

2. ESTRUTURAR EM CAPÍTULOS
   - Identifique mudanças REAIS de tópico (não corte por janela de tempo).
   - Cada capítulo deve ter título descritivo do CONTEÚDO (ex: "Introdução à fisiologia hormonal", "Eixo hipotálamo-hipófise-gonadal"), nunca "Parte 1".
   - Quando o professor está só fazendo avisos/organização/conversa antes da aula começar, crie um capítulo separado chamado "Organização e avisos" ou similar.
   - Dentro de cada capítulo, agrupe em PARÁGRAFOS coerentes (cada parágrafo trata de um sub-tópico). Cada parágrafo tem entre 3 e 10 frases.
   - Use os timestamps da transcrição crua pra preservar o startSec real onde cada capítulo e parágrafo começam.

FORMATO DE SAÍDA — APENAS JSON VÁLIDO (sem markdown wrappers, sem comentários extras):

{
  "chapters": [
    {
      "id": "<slug-curto-do-titulo>",
      "title": "<título descritivo do que se aborda>",
      "startSec": <segundos onde esse capítulo começa>,
      "summary": "<1 frase curta resumindo o que esse capítulo cobre>",
      "paragraphs": [
        {
          "startSec": <segundos onde esse parágrafo começa>,
          "text": "<texto refinado e bem pontuado>"
        }
      ]
    }
  ]
}

CONTEXTO DA AULA:
- Matéria: ${"{{SUBJECT}}"}
- Título: "${"{{TITLE}}"}"`;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Compacta entries em "linhas" pro prompt: cada linha começa com [sec]
 * seguido do texto. Reduz overhead vs JSON puro e dá pro modelo enxergar
 * timestamps claramente.
 */
function entriesToPromptLines(entries: TranscriptEntry[]): string {
  return entries
    .map((e) => `[${Math.floor(e.startSec)}] ${e.text.trim()}`)
    .join("\n");
}

function tryParseChapters(raw: string): TranscriptRevisedChapter[] | null {
  // Tira ```json wrappers se vierem
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as { chapters?: unknown };
    if (!parsed || !Array.isArray(parsed.chapters)) return null;
    const out: TranscriptRevisedChapter[] = [];
    for (const ch of parsed.chapters) {
      if (!ch || typeof ch !== "object") continue;
      const c = ch as Record<string, unknown>;
      const title = typeof c.title === "string" ? c.title.trim() : "";
      const startSec = typeof c.startSec === "number" ? c.startSec : 0;
      const paragraphsRaw = Array.isArray(c.paragraphs) ? c.paragraphs : [];
      const paragraphs = paragraphsRaw
        .map((p) => {
          if (!p || typeof p !== "object") return null;
          const pr = p as Record<string, unknown>;
          const text = typeof pr.text === "string" ? pr.text.trim() : "";
          const sec = typeof pr.startSec === "number" ? pr.startSec : 0;
          if (!text) return null;
          return { startSec: sec, text };
        })
        .filter((x): x is { startSec: number; text: string } => x !== null);
      if (!title || paragraphs.length === 0) continue;
      out.push({
        id: typeof c.id === "string" && c.id ? c.id : slugify(title) || `ch-${out.length}`,
        title,
        startSec,
        endSec: paragraphs[paragraphs.length - 1]?.startSec ?? startSec,
        summary: typeof c.summary === "string" ? c.summary.trim() : undefined,
        paragraphs,
      });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: lectureId } = await ctx.params;
  if (!lectureId) {
    return NextResponse.json({ error: "Lecture id ausente." }, { status: 400 });
  }

  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`structure-tr:ip:${ip}`, 5, 60_000);
  if (ipLimit) return ipLimit;

  // ignore body — id vem da URL
  await req.json().catch(() => ({}));

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json(
      { error: "Configuração de servidor incompleta." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  }
  const userId = user.id;

  const userLimit = limitOrThrow(`structure-tr:user:${userId}`, 8, 60_000);
  if (userLimit) return userLimit;

  const owns = await assertLectureOwnership(userId, lectureId);
  if (!owns) {
    return NextResponse.json({ error: "Aula não encontrada." }, { status: 404 });
  }

  // Carrega lecture pra ler entries + título + subject
  const admin = createAdminClient();
  const { data: lectureRow, error: lecErr } = await admin
    .from("lectures")
    .select("title, subject_id, transcript_entries, transcript_chapters")
    .eq("id", lectureId)
    .maybeSingle();
  if (lecErr || !lectureRow) {
    return NextResponse.json({ error: "Aula não encontrada." }, { status: 404 });
  }
  const entries = (lectureRow.transcript_entries ?? []) as TranscriptEntry[];
  if (entries.length === 0) {
    return NextResponse.json(
      { error: "Transcrição vazia — grave ou suba o áudio antes." },
      { status: 400 },
    );
  }

  // Busca subject name (best-effort)
  let subjectName = "Geral";
  if (lectureRow.subject_id) {
    const { data: subj } = await admin
      .from("subjects")
      .select("name")
      .eq("id", lectureRow.subject_id)
      .maybeSingle();
    if (subj?.name) subjectName = String(subj.name);
  }

  // ----- Chunking: divide a transcrição em pedaços de ~25min -----
  // Aulas curtas (<25min) viram 1 chunk só (custo = 15 coins).
  // Aulas longas viram 2-4 chunks processados em paralelo. Cada chunk custa
  // 15 coins (cobre Sonnet ~$0.15 + margem). Cobramos upfront e reembolsamos
  // chunks que falharem.
  const chunks = splitIntoChunks(entries);
  if (chunks.length === 0) {
    return NextResponse.json(
      { error: "Transcrição vazia." },
      { status: 400 },
    );
  }

  const perChunkCost = COIN_COSTS.transcript_structure; // 15
  const totalCost = perChunkCost * chunks.length;
  const charged = await chargeCoins(userId, totalCost, "transcript_structure", {
    lectureId,
    chunks: chunks.length,
  });
  if (!charged.ok) {
    return NextResponse.json(
      {
        error: "Coins insuficientes.",
        balance: charged.balance,
        required: totalCost,
        chunks: chunks.length,
      },
      { status: 402 },
    );
  }

  const baseSystem = SYSTEM_PROMPT.replace(
    "{{SUBJECT}}",
    escapeForPrompt(subjectName),
  ).replace("{{TITLE}}", escapeForPrompt(lectureRow.title || "Aula"));

  // Roda chunks em paralelo. Cada Promise resolve em chapters[] ou null se
  // falhar (modelo travou, JSON inválido, etc).
  type ChunkResult = {
    chunk: TranscriptChunk;
    chapters: TranscriptRevisedChapter[] | null;
    inputTokens: number;
    outputTokens: number;
    error?: string;
  };

  async function processChunk(chunk: TranscriptChunk): Promise<ChunkResult> {
    const chunkContext =
      chunks.length === 1
        ? ""
        : `\n\nNOTA IMPORTANTE: você está revisando a PARTE ${chunk.index + 1} de ${chunks.length} desta aula (do segundo ${Math.floor(
            chunk.startSec,
          )} ao ${Math.floor(chunk.endSec)}). Não invente conteúdo de outras partes. Os startSec devem ser ABSOLUTOS (a partir do início da aula, não do início desta parte).`;
    const promptLines = entriesToPromptLines(chunk.entries);
    try {
      const resp = await createMessage(
        {
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 16000,
          system: [
            {
              type: "text",
              text: baseSystem + chunkContext,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [
            {
              role: "user",
              content: `Transcrição crua com timestamps:\n\n${escapeForPrompt(promptLines)}`,
            },
          ],
        },
        // Timeout por chunk: 3min (chunk de ~25min deve responder em 60-120s
        // confortavelmente). Se travar, falha rápido e libera o slot.
        { timeoutMs: 180_000 },
      );
      const textBlock = resp.content.find((b) => b.type === "text");
      const rawText =
        textBlock && textBlock.type === "text" ? textBlock.text : "";
      const parsed = tryParseChapters(rawText);
      return {
        chunk,
        chapters: parsed,
        inputTokens: resp.usage?.input_tokens ?? 0,
        outputTokens: resp.usage?.output_tokens ?? 0,
      };
    } catch (err) {
      console.error(
        `[structure-transcript] chunk ${chunk.index + 1}/${chunks.length} failed`,
        err,
      );
      return {
        chunk,
        chapters: null,
        inputTokens: 0,
        outputTokens: 0,
        error: (err as Error)?.message ?? "unknown",
      };
    }
  }

  try {
    const results = await Promise.all(chunks.map((c) => processChunk(c)));

    const failedCount = results.filter((r) => !r.chapters).length;
    const successCount = results.length - failedCount;

    // Reembolsa coins dos chunks que falharam.
    if (failedCount > 0) {
      await creditCoins(userId, perChunkCost * failedCount, "refund", {
        lectureId,
        kind: "transcript_structure_chunk_failed",
        failedCount,
      });
    }

    if (successCount === 0) {
      return NextResponse.json(
        {
          error:
            "Não conseguimos processar nenhuma parte da aula. Tente de novo.",
        },
        { status: 502 },
      );
    }

    // Merge: capítulos vêm em ordem dos chunks; dentro de cada chunk já vêm
    // ordenados por startSec. Só concatena. Re-genera IDs únicos se houver
    // colisão (pouco provável mas barato fazer).
    const merged: TranscriptRevisedChapter[] = [];
    const seenIds = new Set<string>();
    for (const r of results) {
      if (!r.chapters) continue;
      for (const ch of r.chapters) {
        let id = ch.id;
        let suffix = 2;
        while (seenIds.has(id)) {
          id = `${ch.id}-${suffix++}`;
        }
        seenIds.add(id);
        merged.push({ ...ch, id });
      }
    }

    const payload: TranscriptChapters = {
      chapters: merged,
      generatedAt: new Date().toISOString(),
    };

    const { error: upErr } = await admin
      .from("lectures")
      .update({ transcript_chapters: payload })
      .eq("id", lectureId);
    if (upErr) {
      console.error("[structure-transcript] db update failed", upErr);
    }

    // Log de uso agregado dos chunks bem-sucedidos.
    const totalIn = results.reduce((s, r) => s + r.inputTokens, 0);
    const totalOut = results.reduce((s, r) => s + r.outputTokens, 0);
    void logAiUsage({
      userId,
      endpoint: "/api/lectures/[id]/structure-transcript",
      model: "claude-sonnet-4-5-20250929",
      inputTokens: totalIn,
      outputTokens: totalOut,
      coinsCharged: perChunkCost * successCount,
    }).catch(() => {});

    return NextResponse.json({
      chapters: payload,
      chunksProcessed: successCount,
      chunksFailed: failedCount,
      coinsRefunded: perChunkCost * failedCount,
    });
  } catch (err) {
    // Erro inesperado fora do per-chunk handler — reembolso total.
    await creditCoins(userId, totalCost, "refund", {
      lectureId,
      kind: "transcript_structure_error",
    });
    return NextResponse.json(
      logAndSanitize("api/lectures/structure-transcript", err),
      { status: 500 },
    );
  }
}
