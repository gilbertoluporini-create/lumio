import { NextResponse, type NextRequest } from "next/server";
import { createMessage } from "@/lib/llm-fallback";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { logAndSanitize, escapeForPrompt } from "@/lib/api-security";
import { COIN_COSTS, chargeCoins, creditCoins } from "@/lib/coins";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { assertLectureOwnership } from "@/lib/lecture-auth";
import { logAiUsage } from "@/lib/ai-usage";
import { generateEmbedding } from "@/lib/embeddings";
import type { TranscriptEntry, TranscriptChapters } from "@/lib/types";

// === Atlas (modo imagem real) ===
// Distância cosseno máxima aceita pra considerar uma figura do PDF do user
// um "match" semântico da seção. 0.22 ≈ similarity > 0.78. Threshold é
// também o default da RPC `search_pdf_extracted_images` (migration 035).
const ATLAS_MAX_DISTANCE = 0.22;
const ATLAS_MIN_SIMILARITY = 1 - ATLAS_MAX_DISTANCE; // 0.78
/** Máx imagens REAIS por resumo inteiro (defensivo contra atlas dominante) */
const ATLAS_MAX_REAL_IMAGES = 5;
/** Tamanho do corpo da seção H2 usado pra embed semântico (chars). */
const ATLAS_SECTION_BODY_CHARS = 500;
/** Quantas imagens (no máx) o summary-images fallback gera quando NÃO estamos
 *  em modo Atlas. Em modo Atlas, o count é dimensionado dinamicamente pra
 *  cobrir só as seções entre as N primeiras que NÃO receberam imagem real. */
const FALLBACK_IMAGE_SLOT_COUNT = 3;

/**
 * Escapa caracteres especiais do markdown DENTRO do alt text/caption pra
 * prevenir injection (`]` fechando o alt, `(` abrindo URL falsa, etc).
 * Caption no DB vem do PDF do user — não confiamos no conteúdo.
 * Trunca em 200 chars pq alt text grandão polui o markdown sem ganho.
 */
function escapeMarkdownImage(s: string): string {
  return s.replace(/[\\[\]()`*_~]/g, "\\$&").slice(0, 200);
}

type AtlasMatchRow = {
  id: string;
  document_id: string;
  page_number: number;
  image_url: string;
  caption_text: string | null;
  classification: string | null;
  similarity: number;
};

type AtlasSection = {
  index: number; // sectionIndex (0-based no array de H2 do markdown)
  title: string;
  body: string;
  startLine: number;
  endLine: number; // linha exclusiva (próximo H2 ou EOF)
};

/**
 * Extrai TODAS as seções H2 do markdown com o range de linhas que ocupam.
 * `body` é os primeiros ATLAS_SECTION_BODY_CHARS chars do corpo (sem header)
 * — material pra embed semântico contra `pdf_extracted_images.embedding`.
 */
function extractAtlasSections(markdown: string): AtlasSection[] {
  const lines = markdown.split("\n");
  const h2Idx: number[] = [];
  lines.forEach((line, i) => {
    if (line.startsWith("## ")) h2Idx.push(i);
  });
  const out: AtlasSection[] = [];
  for (let i = 0; i < h2Idx.length; i++) {
    const start = h2Idx[i];
    const end = i + 1 < h2Idx.length ? h2Idx[i + 1] : lines.length;
    const title = lines[start].replace(/^##\s+/, "").trim();
    const body = lines
      .slice(start + 1, end)
      .join("\n")
      .trim()
      .slice(0, ATLAS_SECTION_BODY_CHARS);
    out.push({ index: i, title, body, startLine: start, endLine: end });
  }
  return out;
}

/**
 * Insere o bloco markdown da imagem (real ou IA) no FIM da seção indicada,
 * imediatamente ANTES do próximo H2 (ou EOF se for a última seção).
 *
 * Padrão alvo:
 *   ... fim do texto da seção ...
 *                                   <- linha em branco
 *   ![caption](url)
 *   *Atlas: p.X*
 *                                   <- linha em branco
 *   ## Próxima seção
 *
 * Mesma estratégia de `injectImagesIntoMarkdown` em summary-images:
 * inserção descendente (sort por insertAt DESC) pra não invalidar offsets
 * das próximas inserções.
 *
 * Detalhe: se a linha imediatamente antes da posição de inserção já é
 * blank (markdown padrão tem blank antes de heading), NÃO adicionamos
 * outra — evita "double blank" visualmente ruim. Mesma lógica pra blank
 * APÓS o bloco se a próxima linha já é blank.
 */
function injectAtlasBlocksIntoMarkdown(
  markdown: string,
  blocks: Array<{ sectionIndex: number; markdownBlock: string }>,
): string {
  if (blocks.length === 0) return markdown;
  const lines = markdown.split("\n");
  const h2Lines: number[] = [];
  lines.forEach((line, i) => {
    if (line.startsWith("## ")) h2Lines.push(i);
  });
  const plans = blocks
    .filter(
      (b) => b.sectionIndex >= 0 && b.sectionIndex < h2Lines.length,
    )
    .map((b) => {
      const nextH2 = h2Lines[b.sectionIndex + 1];
      const insertAt = nextH2 !== undefined ? nextH2 : lines.length;
      return { insertAt, block: b.markdownBlock };
    })
    .sort((a, b) => b.insertAt - a.insertAt);
  for (const p of plans) {
    const blockLines = p.block.split("\n");
    const prevLine = p.insertAt > 0 ? lines[p.insertAt - 1] : "";
    const nextLine = p.insertAt < lines.length ? lines[p.insertAt] : "";
    const leadingBlank = prevLine.trim() === "" ? [] : [""];
    const trailingBlank = nextLine.trim() === "" ? [] : [""];
    lines.splice(p.insertAt, 0, ...leadingBlank, ...blockLines, ...trailingBlank);
  }
  return lines.join("\n");
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Aulas de 1h30+ geram markdown de 1500-2500 palavras com Sonnet 4.5.
// 3 min era apertado; 5 min cobre o pior caso (input grande + output longo).
export const maxDuration = 300;

const SYSTEM_PROMPT = `Você é um TUTOR universitário brasileiro experiente criando um RESUMO DIDÁTICO COMPLETO de uma aula.

Recebe a transcrição de uma aula universitária (em português brasileiro) e gera um RESUMO em markdown coeso, profundo e altamente educativo. O objetivo é que o estudante leia esse resumo SEM ter assistido a aula original e ainda assim domine o conteúdo pra uma prova.

ANCORAMENTO NA TRANSCRIÇÃO (regra crítica):
- Use TODO o conteúdo relevante da transcrição. Não pule blocos.
- Cite explicitamente quando algo vier da transcrição ("como o professor mencionou", "na fala sobre X").
- Para CADA conceito do resumo, deve existir base na transcrição. Se algo é conhecimento geral complementar, marque com "(complemento — não estava na aula)".
- NUNCA invente dados específicos (números, nomes, casos, citações) que não estejam na transcrição.

ESTRUTURA OBRIGATÓRIA (em markdown):
1. Título principal: # H1 representativo do tema central
2. **Visão geral** (3-5 frases): contexto, importância prática, e o que o estudante vai aprender
3. **4 a 7 seções ## H2 numeradas** cobrindo os blocos principais. Cada seção deve ter:
   - Parágrafo de definição clara do conceito
   - Explicação aprofundada do MECANISMO / funcionamento (não só "é X", mas "POR QUE / COMO")
   - Listas com **bold** nos termos-chave
   - Pelo menos 1 EXEMPLO prático ou clínico citado da fonte (se houver) ou conhecimento padrão da área
   - Callout iniciado com "> " destacando ARMADILHA, ERRO COMUM ou DICA DE PROVA quando aplicável
   - Use tabelas markdown ao COMPARAR/CLASSIFICAR (ex: tipos, fases, etiologias)
4. Seção **## Aplicação clínica/prática** com 1-3 cenários reais conectando os conceitos
5. Seção final **## Pontos-chave de revisão** com 6-10 bullets curtos resumindo o essencial

LINGUAGEM:
- Português brasileiro, tom de professor didático conversando com aluno do 4º semestre
- Sem encheção, sem repetições óbvias
- Use **negrito** em termos técnicos chave (não em frases inteiras)
- Quando termo técnico aparecer pela primeira vez, defina entre parênteses se for complexo

PROFUNDIDADE: 1500-2500 palavras (padrão didático).

REGRAS DE ESTILO:
- NUNCA use emojis.
- NUNCA use cercas de código \`\`\`.
- Use separador horizontal --- raramente, só entre macro-blocos.
- Responda APENAS o markdown final — sem comentários, sem JSON, sem wrappers.

CONTEXTO DA AULA:
- Matéria: ${"{{SUBJECT}}"}
- Título: "${"{{TITLE}}"}"`;

function buildTranscriptForPrompt(
  entries: TranscriptEntry[],
  chapters?: TranscriptChapters,
): string {
  // Prefere a transcrição revisada (chapters) se existe — é mais limpa
  if (chapters && chapters.chapters.length > 0) {
    return chapters.chapters
      .map((ch) => {
        const head = `# ${ch.title}` + (ch.summary ? `\n_${ch.summary}_` : "");
        const body = ch.paragraphs.map((p) => p.text).join("\n\n");
        return `${head}\n\n${body}`;
      })
      .join("\n\n---\n\n");
  }
  // Fallback: junta entries cruas em parágrafos
  return entries.map((e) => e.text).join(" ");
}

/**
 * Atlas matching: pra cada seção H2 do markdown, embeda o texto e busca a
 * figura REAL mais próxima em `pdf_extracted_images` (RPC search_pdf_extracted_images).
 * Retorna lista de matches (1 por seção, ou nenhum se distance >= ATLAS_MAX_DISTANCE).
 *
 * Idempotente: se OPENAI_API_KEY ausente ou nenhuma seção H2, retorna vazio
 * sem cobrar nada (cobrança já aconteceu antes).
 *
 * `documentIds` é o conjunto de PDFs da MATÉRIA da lecture. Se vazio, RPC
 * retorna nada (e fallback IA pega TODAS as seções).
 */
async function runAtlasMatching(opts: {
  userId: string;
  markdown: string;
  documentIds: string[];
  admin: ReturnType<typeof createAdminClient>;
}): Promise<{
  matches: Array<{ section: AtlasSection; row: AtlasMatchRow }>;
  sectionsWithoutMatch: AtlasSection[];
  embeddingTokensUsed: number;
  sectionsProcessed: number;
}> {
  const sections = extractAtlasSections(opts.markdown);
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  if (sections.length === 0 || !apiKey) {
    return {
      matches: [],
      sectionsWithoutMatch: sections,
      embeddingTokensUsed: 0,
      sectionsProcessed: 0,
    };
  }

  let embeddingTokensUsed = 0;
  const matches: Array<{ section: AtlasSection; row: AtlasMatchRow }> = [];
  const sectionsWithoutMatch: AtlasSection[] = [];
  // Reservamos slots — máx ATLAS_MAX_REAL_IMAGES por resumo inteiro.
  let realSlotsLeft = ATLAS_MAX_REAL_IMAGES;
  const usedImageIds = new Set<string>();

  for (const section of sections) {
    if (realSlotsLeft <= 0 || opts.documentIds.length === 0) {
      sectionsWithoutMatch.push(section);
      continue;
    }
    const probe = `${section.title}\n\n${section.body}`.trim();
    if (probe.length < 20) {
      sectionsWithoutMatch.push(section);
      continue;
    }

    let embedding: number[];
    try {
      const e = await generateEmbedding(probe, apiKey);
      embedding = e.embedding;
      embeddingTokensUsed += e.totalTokens;
    } catch (err) {
      console.warn("[summary][atlas] embedding failed for section", {
        title: section.title,
        err: (err as Error).message,
      });
      sectionsWithoutMatch.push(section);
      continue;
    }

    try {
      const { data, error } = await opts.admin.rpc(
        "search_pdf_extracted_images",
        {
          query_embedding: embedding,
          user_id_input: opts.userId,
          document_ids_input: opts.documentIds,
          classification_input: null,
          match_threshold: ATLAS_MIN_SIMILARITY,
          match_count: 3,
        },
      );
      if (error) {
        console.warn("[summary][atlas] rpc error", error);
        sectionsWithoutMatch.push(section);
        continue;
      }
      const rows = (Array.isArray(data) ? data : []) as AtlasMatchRow[];
      // Top match (RPC já ordena por <=> ASC) que ainda não foi usado.
      const pick = rows.find((r) => !usedImageIds.has(r.id));
      if (!pick) {
        sectionsWithoutMatch.push(section);
        continue;
      }
      matches.push({ section, row: pick });
      usedImageIds.add(pick.id);
      realSlotsLeft -= 1;
    } catch (err) {
      console.warn("[summary][atlas] rpc threw", err);
      sectionsWithoutMatch.push(section);
    }
  }

  return {
    matches,
    sectionsWithoutMatch,
    embeddingTokensUsed,
    sectionsProcessed: sections.length,
  };
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
  const ipLimit = limitOrThrow(`edu-sum:ip:${ip}`, 5, 60_000);
  if (ipLimit) return ipLimit;

  // Body:
  // - `crossPdfs?: boolean` — carrega PDFs da MESMA matéria como contexto
  //   complementar (cobra +15 coins, 40 total).
  // - `useAtlas?: boolean` — modo Atlas: depois de gerar o markdown, tenta
  //   injetar IMAGENS REAIS extraídas dos PDFs do user (cruza embedding por
  //   seção). Atlas é "tudo": implica crossPdfs=true e cobra 50 coins fixos
  //   (mesmo se nenhum match real for encontrado — o pipeline rodou).
  let crossPdfs = false;
  let useAtlas = false;
  try {
    const body = (await req.json()) as {
      crossPdfs?: boolean;
      useAtlas?: boolean;
    };
    crossPdfs = body?.crossPdfs === true;
    useAtlas = body?.useAtlas === true;
  } catch {
    /* body vazio é OK — vira modo padrão (sem cruzar) */
  }
  // Atlas estende: sempre inclui o cross de PDFs (Atlas == "modo tudo").
  if (useAtlas) crossPdfs = true;

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

  const userLimit = limitOrThrow(`edu-sum:user:${userId}`, 5, 60_000);
  if (userLimit) return userLimit;

  const owns = await assertLectureOwnership(userId, lectureId);
  if (!owns) {
    return NextResponse.json({ error: "Aula não encontrada." }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: lectureRow, error: lecErr } = await admin
    .from("lectures")
    .select(
      "title, subject_id, transcript_entries, transcript_chapters, slides, messages",
    )
    .eq("id", lectureId)
    .maybeSingle();
  if (lecErr || !lectureRow) {
    return NextResponse.json({ error: "Aula não encontrada." }, { status: 404 });
  }
  const entries = (lectureRow.transcript_entries ?? []) as TranscriptEntry[];
  const chapters = (lectureRow.transcript_chapters ?? null) as TranscriptChapters | null;
  if (entries.length === 0) {
    return NextResponse.json(
      { error: "Transcrição vazia — grave ou suba o áudio antes." },
      { status: 400 },
    );
  }

  // Multi-fontes: além da transcrição, cruzar slides da aula e as perguntas
  // do chat in-lecture (lectures.messages). Slides cobrem o material visual
  // que o professor projetou; chat captura o que o user perguntou/não
  // entendeu — pontos de dúvida que o resumo deve esclarecer.
  type SlideEntry = { pageNumber?: number; title?: string; text?: string };
  const slides = Array.isArray(lectureRow.slides)
    ? (lectureRow.slides as SlideEntry[])
    : [];
  type LectureMsg = { role?: string; content?: string };
  const lectureMessages = Array.isArray(lectureRow.messages)
    ? (lectureRow.messages as LectureMsg[])
    : [];

  // Cada fonte é truncada pra não estourar contexto Sonnet. Limites por
  // ordem de prioridade: transcrição é a fonte principal; slides + chat são
  // contexto adicional.
  const slidesForPrompt =
    slides.length > 0
      ? slides
          .slice(0, 50)
          .map((s) => {
            const head = s.title ? `[Slide ${s.pageNumber ?? "?"} — ${s.title}]` : `[Slide ${s.pageNumber ?? "?"}]`;
            const body = (s.text ?? "").trim().slice(0, 600);
            return body ? `${head}\n${body}` : head;
          })
          .join("\n\n")
          .slice(0, 8000)
      : "";

  const chatForPrompt =
    lectureMessages.length > 0
      ? lectureMessages
          .filter((m) => typeof m.content === "string" && m.content.trim())
          .slice(-30) // últimas 30 trocas (mais recentes têm mais sinal)
          .map(
            (m) =>
              `${m.role === "assistant" ? "Lumi" : "Aluno"}: ${(m.content ?? "").trim().slice(0, 800)}`,
          )
          .join("\n\n")
          .slice(0, 6000)
      : "";

  // Atlas requer subject_id obrigatório — o escopo de matching é "PDFs da
  // mesma matéria da aula". Aula órfã + Atlas = nada pra cruzar e cobrança
  // injusta (pacote inclui pipeline mas não tem o que rodar). Bloqueamos
  // ANTES de chargeCoins pra evitar refund desnecessário e dar mensagem clara.
  if (useAtlas && !lectureRow.subject_id) {
    return NextResponse.json(
      {
        error:
          "Esta aula precisa estar atribuída a uma matéria pra usar o Atlas. Mova ela primeiro.",
      },
      { status: 400 },
    );
  }

  let subjectName = "Geral";
  if (lectureRow.subject_id) {
    const { data: subj } = await admin
      .from("subjects")
      .select("name")
      .eq("id", lectureRow.subject_id)
      .maybeSingle();
    if (subj?.name) subjectName = String(subj.name);
  }

  // Carregar PDFs da matéria como material complementar (quando crossPdfs=true).
  // Mesma estratégia do worker do plano: cap 3 docs × 4k chars, total 12k.
  let pdfsForPrompt = "";
  if (crossPdfs && lectureRow.subject_id) {
    const { data: docsRaw } = await admin
      .from("documents")
      .select("title, source_text")
      .eq("user_id", userId)
      .eq("subject_id", lectureRow.subject_id)
      .not("source_text", "is", null)
      .order("created_at", { ascending: false })
      .limit(3);
    const docs = (docsRaw ?? []) as Array<{
      title: string;
      source_text: string | null;
    }>;
    const parts: string[] = [];
    let total = 0;
    for (const d of docs) {
      const text = (d.source_text ?? "").trim();
      if (text.length < 200) continue;
      const slice = text.slice(0, 4000);
      if (total + slice.length > 12_000) break;
      parts.push(`### PDF: ${d.title}\n${slice}`);
      total += slice.length;
    }
    pdfsForPrompt = parts.join("\n\n");
  }

  // Cobrança:
  //   - Atlas: 50 coins FIXOS (cobra mesmo sem matching real porque o pipeline
  //     de embedding+busca rodou; aviso vai no response.atlas.warning).
  //   - Cross (sem atlas): 40 coins, mas só se realmente carregou PDFs.
  //   - Default: 25 coins.
  const willCross = crossPdfs && pdfsForPrompt.length > 0;
  let cost: number;
  let chargeKind: "summary_atlas" | "summary_educational_cross" | "summary_educational";
  if (useAtlas) {
    cost = COIN_COSTS.summary_atlas;
    chargeKind = "summary_atlas";
  } else if (willCross) {
    cost = COIN_COSTS.summary_educational_cross;
    chargeKind = "summary_educational_cross";
  } else {
    cost = COIN_COSTS.summary_educational;
    chargeKind = "summary_educational";
  }
  const charged = await chargeCoins(userId, cost, chargeKind, {
    lectureId,
    ...(useAtlas ? { useAtlas: true } : {}),
  });
  if (!charged.ok) {
    return NextResponse.json(
      {
        error: "Coins insuficientes.",
        balance: charged.balance,
        required: cost,
      },
      { status: 402 },
    );
  }

  const transcriptForPrompt = buildTranscriptForPrompt(
    entries,
    chapters ?? undefined,
  );
  const system = SYSTEM_PROMPT.replace(
    "{{SUBJECT}}",
    escapeForPrompt(subjectName),
  ).replace("{{TITLE}}", escapeForPrompt(lectureRow.title || "Aula"));

  try {
    const resp = await createMessage({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 12000,
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: [
            `=== TRANSCRIÇÃO DA AULA ===`,
            ``,
            escapeForPrompt(transcriptForPrompt),
            ...(slidesForPrompt
              ? [
                  ``,
                  `=== SLIDES DA AULA ===`,
                  ``,
                  escapeForPrompt(slidesForPrompt),
                ]
              : []),
            ...(chatForPrompt
              ? [
                  ``,
                  `=== CHAT DURANTE A AULA (dúvidas do aluno + respostas do Lumi) ===`,
                  ``,
                  `Use isso pra entender o que o aluno NÃO entendeu — destaque esses pontos no resumo.`,
                  ``,
                  escapeForPrompt(chatForPrompt),
                ]
              : []),
            ...(pdfsForPrompt
              ? [
                  ``,
                  `=== MATERIAL COMPLEMENTAR DA MATÉRIA (PDFs do aluno) ===`,
                  ``,
                  `Use apenas pra reforçar definições, cruzar conceitos e adicionar profundidade. Não invente fatos do complementar como se fossem da aula.`,
                  ``,
                  escapeForPrompt(pdfsForPrompt),
                ]
              : []),
            ``,
            `=== TAREFA ===`,
            `Gere o resumo educativo em markdown agora. Integre as informações dos slides${pdfsForPrompt ? " e dos PDFs complementares" : ""} e responda às dúvidas do chat (se houver) dentro das seções relevantes.`,
          ].join("\n"),
        },
      ],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    const baseMarkdown =
      textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

    if (!baseMarkdown || baseMarkdown.length < 100) {
      await creditCoins(userId, cost, "refund", {
        lectureId,
        kind: "educational_summary_short_output",
      });
      return NextResponse.json(
        { error: "Não foi possível gerar o resumo. Tente de novo." },
        { status: 502 },
      );
    }

    // === MODO ATLAS: injeta imagens REAIS dos PDFs do user antes de persistir ===
    // Quando `useAtlas=true`, rodamos embedding por seção H2 e buscamos a
    // figura mais próxima em `pdf_extracted_images` (RPC 035). Se acha,
    // injeta o `![](url)` no FIM da seção. Pra seções sem match real, o
    // fallback IA roda depois via /api/ai/summary-images (count reduzido).
    let markdown = baseMarkdown;
    let atlasRealImagesUsed = 0;
    let atlasFallbackImagesUsed = 0;
    let atlasSectionsProcessed = 0;
    let atlasEmbeddingTokens = 0;
    let atlasWarning: string | null = null;
    let atlasFallbackCount = FALLBACK_IMAGE_SLOT_COUNT; // default mantém comportamento (3 imagens IA)

    if (useAtlas) {
      // Lista de PDFs da MESMA matéria da lecture (escopo do matching).
      let atlasDocumentIds: string[] = [];
      if (lectureRow.subject_id) {
        const { data: docRows } = await admin
          .from("documents")
          .select("id")
          .eq("user_id", userId)
          .eq("subject_id", lectureRow.subject_id);
        const rows = (docRows ?? []) as Array<{ id: string }>;
        atlasDocumentIds = rows.map((r) => r.id);
      }

      if (atlasDocumentIds.length === 0) {
        // Defesa em profundidade: sem subject_id ou sem PDFs da matéria,
        // matching não tem o que comparar. Atlas vira "só fallback IA" mas
        // cobrança já foi feita (pacote inclui o pipeline).
        atlasWarning =
          "Nenhum PDF da matéria pra cruzar — Atlas usou só IA. Suba PDFs e gere de novo.";
      }

      const atlasRun = await runAtlasMatching({
        userId,
        markdown: baseMarkdown,
        documentIds: atlasDocumentIds,
        admin,
      });
      atlasSectionsProcessed = atlasRun.sectionsProcessed;
      atlasEmbeddingTokens = atlasRun.embeddingTokensUsed;
      atlasRealImagesUsed = atlasRun.matches.length;

      // Injeta as imagens REAIS no markdown ANTES de persistir — assim a
      // /resumo já carrega com as figuras certas mesmo se summary-images
      // falhar/demorar.
      if (atlasRun.matches.length > 0) {
        const blocks = atlasRun.matches.map(({ section, row }) => {
          // Caption vem do PDF do user — escapamos chars que poderiam fechar
          // o alt text e injetar markdown/HTML.
          const alt = escapeMarkdownImage(
            row.caption_text ?? section.title ?? "Imagem do atlas",
          );
          // URL via proxy /api/atlas/img/[id]: regenera signed URL fresca
          // on-demand, evitando link morto quando o TTL persistido expira.
          const lines = [
            `![${alt}](/api/atlas/img/${row.id})`,
            `*Atlas: p.${row.page_number} do PDF*`,
          ];
          return { sectionIndex: section.index, markdownBlock: lines.join("\n") };
        });
        markdown = injectAtlasBlocksIntoMarkdown(baseMarkdown, blocks);
      }

      // Fallback IA: o summary-images endpoint cobre as PRIMEIRAS N seções H2.
      // Pra evitar duplicar figuras nas seções que já têm imagem real, capamos
      // o count em quantas das N primeiras seções estão SEM match.
      const firstNSectionIdxs = new Set(
        Array.from({ length: FALLBACK_IMAGE_SLOT_COUNT }, (_, i) => i),
      );
      const realInFirstN = atlasRun.matches.filter((m) =>
        firstNSectionIdxs.has(m.section.index),
      ).length;
      atlasFallbackCount = Math.max(0, FALLBACK_IMAGE_SLOT_COUNT - realInFirstN);

      if (atlasRealImagesUsed === 0 && !atlasWarning) {
        atlasWarning =
          "Atlas não encontrou imagens correspondentes nos seus PDFs — usando IA.";
      }

      console.log("[summary][atlas]", {
        userId,
        lectureId,
        documentsScoped: atlasDocumentIds.length,
        sectionsProcessed: atlasSectionsProcessed,
        realImagesUsed: atlasRealImagesUsed,
        embeddingTokensUsed: atlasEmbeddingTokens,
        fallbackCountPlanned: atlasFallbackCount,
      });
    }

    const payload: {
      markdown: string;
      generatedAt: string;
      atlas?: {
        enabled: true;
        realImagesUsed: number;
        sectionsProcessed: number;
      };
    } = {
      markdown,
      generatedAt: new Date().toISOString(),
      ...(useAtlas
        ? {
            atlas: {
              enabled: true as const,
              realImagesUsed: atlasRealImagesUsed,
              sectionsProcessed: atlasSectionsProcessed,
            },
          }
        : {}),
    };

    const { error: upErr } = await admin
      .from("lectures")
      .update({ summary_educational: payload })
      .eq("id", lectureId);
    if (upErr) {
      console.error("[educational-summary] db update failed", upErr);
    }

    // Espelha no row de summaries pra que /api/ai/summary-images encontre o
    // markdown via lecture_id e popule summaries.images. A UI também lê
    // summary via getSummaryByLectureIdAsync — então as imagens aparecem
    // automaticamente quando a page recarrega o summary depois.
    const summaryContent = {
      generatedAt: payload.generatedAt,
      generalSummary: markdown,
      highlights: [],
      sections: [],
    };
    // Procura row existente pra mesma lecture. NOTA: usa .order().limit(1) +
    // maybeSingle pra ser ROBUSTO a duplicatas históricas (havia lectures
    // com 2-3 summaries por causa de race condition antiga). Sem isso,
    // maybeSingle dava erro silencioso 'multiple rows' → INSERT criava
    // duplicata, summary-images depois não achava e ficava sem imagens.
    const { data: existingSummary } = await admin
      .from("summaries")
      .select("id")
      .eq("lecture_id", lectureId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingSummary?.id) {
      await admin
        .from("summaries")
        .update({ content: summaryContent, title: lectureRow.title || "Resumo" })
        .eq("id", existingSummary.id);
    } else {
      await admin.from("summaries").insert({
        user_id: userId,
        subject_id: lectureRow.subject_id,
        lecture_id: lectureId,
        title: lectureRow.title || "Resumo",
        content: summaryContent,
      });
    }

    // Aguarda summary-images terminar (não é mais fire-and-forget — Vercel
    // mata a função antes do dispatch completar quando keepalive não cumpre).
    // Se aula tem slides com imageDataUrl, manda como referenceImages pra
    // entrar no caminho /v1/images/edits — gera imagens com mesmo estilo
    // das imagens do wizard (resumo via PDF).
    //
    // IMPORTANTE: a partir daqui o resumo JÁ FOI PERSISTIDO. Qualquer erro
    // a partir deste ponto NÃO deve refundar coins — o user já tem o resumo
    // salvo e visível. Por isso o bloco abaixo é envolvido em try/catch
    // ISOLADO que só loga + popula `imagesError`. O outer catch (que refunda)
    // permanece pra erros ANTES da persistência.
    //
    // Em modo Atlas, `atlasFallbackCount` é dimensionado pra cobrir só as
    // seções (entre as 3 primeiras) que NÃO receberam imagem real. Se já
    // preenchemos todas com Atlas, pulamos a chamada pra economizar tempo+$.
    const fallbackImagesRequested = useAtlas
      ? atlasFallbackCount
      : FALLBACK_IMAGE_SLOT_COUNT;
    let imagesGenerated = false;
    let imagesError: string | null = null;
    try {
      type SlideRow = {
        pageNumber?: number;
        title?: string;
        text?: string;
        imageDataUrl?: string;
      };
      const slidesArr = (lectureRow.slides ?? []) as SlideRow[];
      const referenceImages = slidesArr
        .filter((s) => typeof s.imageDataUrl === "string" && s.imageDataUrl)
        .slice(0, 2)
        .map((s) => ({
          filename: `slide-${s.pageNumber ?? "?"}.jpg`,
          dataUrl: s.imageDataUrl as string,
        }));

      // Timeout 150s pra summary-images — cabe dentro do maxDuration 300s
      // mesmo com Sonnet tendo levado 60-120s no resumo. Se falhar/timeout,
      // resumo retorna sem imagens (user pode clicar "Gerar ilustrações"
      // na /resumo depois).
      if (fallbackImagesRequested > 0) {
        try {
          const ctrl = new AbortController();
          const timeoutId = setTimeout(() => ctrl.abort(), 150_000);
          const imgResp = await fetch(
            new URL("/api/ai/summary-images", req.url).toString(),
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                cookie: req.headers.get("cookie") ?? "",
              },
              body: JSON.stringify({
                lectureId,
                count: fallbackImagesRequested,
                ...(referenceImages.length > 0 ? { referenceImages } : {}),
              }),
              signal: ctrl.signal,
            },
          );
          clearTimeout(timeoutId);
          if (imgResp.ok) {
            const imgJson = (await imgResp.json().catch(() => ({}))) as {
              images?: Array<unknown>;
            };
            const generated = Array.isArray(imgJson.images)
              ? imgJson.images.length
              : 0;
            imagesGenerated = generated > 0;
            if (useAtlas) atlasFallbackImagesUsed = generated;
          } else {
            imagesError = `HTTP ${imgResp.status}`;
          }
        } catch (e) {
          imagesError = (e as Error).message || "unknown";
          console.warn(
            "[educational-summary] images await failed",
            imagesError,
          );
        }
      } else {
        // useAtlas + todas as N primeiras seções já têm imagem real
        imagesGenerated = atlasRealImagesUsed > 0;
      }
    } catch (postPersistErr) {
      // Defesa em profundidade: nada na construção de referenceImages
      // ou ao redor deve trigger refund — resumo já está salvo.
      imagesError = (postPersistErr as Error).message || "post-persist-error";
      console.warn(
        "[educational-summary] post-persist block threw (não refunda)",
        imagesError,
      );
    }

    void logAiUsage({
      userId,
      endpoint: "/api/lectures/[id]/educational-summary",
      model: "claude-sonnet-4-5-20250929",
      inputTokens: resp.usage?.input_tokens ?? 0,
      outputTokens: resp.usage?.output_tokens ?? 0,
      coinsCharged: cost,
    }).catch(() => {});

    // Telemetria separada do embedding usado no atlas matching (varia com
    // nº de seções H2; ~50-300 tokens por seção em pt-BR).
    if (useAtlas && atlasEmbeddingTokens > 0) {
      void logAiUsage({
        userId,
        endpoint: "/api/lectures/[id]/educational-summary#atlas",
        model: "text-embedding-3-small",
        inputTokens: atlasEmbeddingTokens,
        outputTokens: 0,
        coinsCharged: 0, // já incluído nos 50c do summary_atlas
      }).catch(() => {});
    }

    return NextResponse.json({
      summaryEducational: payload,
      imagesGenerated,
      ...(imagesError ? { imagesError } : {}),
      ...(useAtlas
        ? {
            atlas: {
              realImagesUsed: atlasRealImagesUsed,
              fallbackImagesUsed: atlasFallbackImagesUsed,
              sectionsProcessed: atlasSectionsProcessed,
              ...(atlasWarning ? { warning: atlasWarning } : {}),
            },
          }
        : {}),
    });
  } catch (err) {
    await creditCoins(userId, cost, "refund", {
      lectureId,
      kind: "educational_summary_error",
    });
    return NextResponse.json(
      logAndSanitize("api/lectures/educational-summary", err),
      { status: 500 },
    );
  }
}
