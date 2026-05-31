import { NextResponse, type NextRequest } from "next/server";
import { createMessage } from "@/lib/llm-fallback";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { logAndSanitize, escapeForPrompt } from "@/lib/api-security";
import { COIN_COSTS, chargeCoins, creditCoins } from "@/lib/coins";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { assertLectureOwnership } from "@/lib/lecture-auth";
import { logAiUsage } from "@/lib/ai-usage";
import type { TranscriptEntry, TranscriptChapters } from "@/lib/types";

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

  // Body: { crossPdfs?: boolean } — quando true, carrega PDFs da MESMA
  // matéria como contexto complementar e cobra +15 coins (40 total).
  let crossPdfs = false;
  try {
    const body = (await req.json()) as { crossPdfs?: boolean };
    crossPdfs = body?.crossPdfs === true;
  } catch {
    /* body vazio é OK — vira modo padrão (sem cruzar) */
  }

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

  // Cobrança: 25 (padrão) ou 40 (com PDFs cruzados, +15). Só cobra extra
  // se realmente carregou PDFs — se subject_id ou docs vazios, cobra base.
  const willCross = crossPdfs && pdfsForPrompt.length > 0;
  const cost = willCross
    ? COIN_COSTS.summary_educational_cross
    : COIN_COSTS.summary_educational;
  const chargeKind = willCross
    ? "summary_educational_cross"
    : "summary_educational";
  const charged = await chargeCoins(userId, cost, chargeKind, {
    lectureId,
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
    const markdown =
      textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

    if (!markdown || markdown.length < 100) {
      await creditCoins(userId, cost, "refund", {
        lectureId,
        kind: "educational_summary_short_output",
      });
      return NextResponse.json(
        { error: "Não foi possível gerar o resumo. Tente de novo." },
        { status: 502 },
      );
    }

    const payload = {
      markdown,
      generatedAt: new Date().toISOString(),
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
    // Procura row existente pra mesma lecture
    const { data: existingSummary } = await admin
      .from("summaries")
      .select("id")
      .eq("lecture_id", lectureId)
      .eq("user_id", userId)
      .is("deleted_at", null)
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
    let imagesGenerated = false;
    let imagesError: string | null = null;
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
            count: 3,
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
        imagesGenerated =
          Array.isArray(imgJson.images) && imgJson.images.length > 0;
      } else {
        imagesError = `HTTP ${imgResp.status}`;
      }
    } catch (e) {
      imagesError = (e as Error).message || "unknown";
      console.warn("[educational-summary] images await failed", imagesError);
    }

    void logAiUsage({
      userId,
      endpoint: "/api/lectures/[id]/educational-summary",
      model: "claude-sonnet-4-5-20250929",
      inputTokens: resp.usage?.input_tokens ?? 0,
      outputTokens: resp.usage?.output_tokens ?? 0,
      coinsCharged: cost,
    }).catch(() => {});

    return NextResponse.json({
      summaryEducational: payload,
      imagesGenerated,
      ...(imagesError ? { imagesError } : {}),
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
