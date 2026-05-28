/**
 * POST /api/ai/illustrate
 *
 * Gera UMA imagem educacional médico-acadêmica via gpt-image-1.
 *
 * Pipeline (mimetiza o que o ChatGPT/DALL-E web fazem internamente):
 *   1. Usuário manda prompt curto em pt-BR (ex: "ciclo da ureia")
 *   2. Haiku ENRIQUECE em inglês com âncoras visuais específicas
 *      (anatomia, posições, cores, composição)
 *   3. wrapPromptForMedicalDiagram adiciona style anchors + ban de texto
 *   4. gpt-image-1 quality HIGH 1536x1024
 *   5. Upload pro Storage, devolve URL pública
 *
 * Por que o pipeline é mais elaborado que a versão anterior: tentamos
 * gerar com prompt curto + quality medium e os resultados ficavam fracos
 * (texto pt-BR corrompido, cenas genéricas, URLs falsos inventados).
 * O ChatGPT web faz EXATAMENTE isso — reescreve o prompt antes de mandar
 * pro modelo de imagem. Replicamos esse passo aqui.
 *
 * Custo: 30 coins (gpt-image-1 high ~ $0.17). Refund automático em falha.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { limitOrThrow } from "@/lib/rate-limit";
import { checkDailyCostCap, dailyCapResponse } from "@/lib/cost-cap";
import { chargeCoins, creditCoins } from "@/lib/coins";
import { logAiUsage } from "@/lib/ai-usage";
import {
  generateImageOpenAI,
  isOpenAIImageConfigured,
  wrapPromptForMedicalDiagram,
} from "@/lib/openai-image";
import { escapeForPrompt } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const STORAGE_BUCKET = "ai-images";
const COIN_COST = 30;

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

/**
 * Expande o prompt curto do user numa descrição visual rica em inglês.
 * Devolve apenas a descrição (texto puro), pronta pra concatenar com o
 * wrapper. Se Haiku falhar por qualquer motivo, devolve o prompt original
 * — pipeline degrade gracefully em vez de quebrar.
 */
async function enhancePromptViaClaude(
  rawPrompt: string,
  contextText: string,
  apiKey: string,
): Promise<string> {
  try {
    const client = new Anthropic({ apiKey });
    const userMessage = contextText
      ? `Pedido do usuário (em pt-BR):\n"${escapeForPrompt(rawPrompt).slice(0, 600)}"\n\nCONTEXTO (conteúdo de aula/resumo/documento que o user quer ilustrar):\n${escapeForPrompt(contextText).slice(0, 4000)}\n\nUse o CONTEXTO como base científica/temática e reescreva como descrição visual rica em inglês pro gpt-image-1.`
      : `Conceito biomédico (em pt-BR):\n"${escapeForPrompt(rawPrompt).slice(0, 1200)}"\n\nReescreva como descrição visual rica em inglês pro gpt-image-1.`;

    const resp = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 700,
      system: `Você é um diretor de arte especializado em ilustração biomédica/acadêmica de alto nível. Recebe um pedido curto em pt-BR (eventualmente com CONTEXTO de aula/resumo) e o reescreve como descrição visual rica em INGLÊS pra alimentar um modelo de geração de imagem (gpt-image-1).

REGRAS:
- Output é apenas a descrição em inglês. Sem preâmbulo, sem markdown, sem aspas.
- Se receber CONTEXTO, EXTRAIA dele as estruturas/conceitos centrais a ilustrar (a primeira via metabólica, o órgão principal, a comparação-chave). Não tente desenhar TUDO — escolha 1 cena focal forte.
- Foque em ELEMENTOS VISUAIS: estruturas anatômicas/celulares envolvidas, organelas-chave, posições espaciais, fluxos (setas), proporções, paleta sugerida (navy blue, soft teal, lilac on off-white).
- Especifique a composição: o que vai no centro, o que orbita, qual a perspectiva.
- Cientificamente preciso: nomes corretos de organelas, compartimentos, vias.
- NUNCA peça pra desenhar texto/labels/legendas — a imagem é puramente visual; legendas virão depois em overlay HTML.
- Limite: 6 frases curtas, no máximo.
- Estilo de referência: ilustração biomédica 3D limpa estilo livro-texto premium, infografia editorial.`,
      messages: [{ role: "user", content: userMessage }],
    });
    const block = resp.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return rawPrompt;
    const enhanced = block.text.trim();
    if (enhanced.length < 30) return rawPrompt;
    return enhanced;
  } catch (err) {
    console.warn("[illustrate] prompt enhancement failed, using raw", err);
    return rawPrompt;
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Faça login." }, { status: 401 });
    }

    // Rate limit + cost cap — geração de imagem é cara, não pode ficar livre.
    // 20 chamadas / hora por user. limitOrThrow devolve Response em vez de throw.
    const rl = limitOrThrow(`illustrate:${user.id}`, 20, 3_600_000);
    if (rl) return rl;
    const capCheck = await checkDailyCostCap(user.id);
    if (!capCheck.ok) return dailyCapResponse(capCheck);

    if (!isOpenAIImageConfigured()) {
      return Response.json(
        { error: "Geração de imagem desabilitada (sem OPENAI_API_KEY)." },
        { status: 503 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      prompt?: string;
      lectureId?: string;
      summaryId?: string;
      documentId?: string;
    };
    const rawPrompt = (body.prompt ?? "").trim();
    if (!rawPrompt || rawPrompt.length < 4) {
      return Response.json(
        { error: "Prompt obrigatório (mín 4 chars)." },
        { status: 400 },
      );
    }
    if (rawPrompt.length > 1500) {
      return Response.json(
        { error: "Prompt muito longo (máx 1500 chars)." },
        { status: 400 },
      );
    }

    // Carrega contexto se foi passado (lecture/summary/document do user).
    // Permite Lumi gerar com "faça uma imagem sobre esse resumo" sem o user
    // precisar descrever — o servidor pega o conteúdo real e enriquece.
    let contextText = "";
    if (body.lectureId || body.summaryId || body.documentId) {
      const admin = createAdminClient();
      if (body.lectureId) {
        const { data } = await admin
          .from("lectures")
          .select("title, transcript, slides")
          .eq("id", body.lectureId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (data) {
          const transcript = (data.transcript ?? "").slice(0, 8000);
          contextText = `Título da aula: ${data.title ?? ""}\n\nTranscrição (trecho):\n${transcript}`;
        }
      } else if (body.summaryId) {
        const { data } = await admin
          .from("summaries")
          .select("title, content")
          .eq("id", body.summaryId)
          .eq("user_id", user.id)
          .is("deleted_at", null)
          .maybeSingle();
        if (data) {
          const md =
            (data.content as { generalSummary?: string })?.generalSummary ??
            "";
          contextText = `Título: ${data.title ?? ""}\n\nResumo (markdown):\n${md.slice(0, 8000)}`;
        }
      } else if (body.documentId) {
        const { data } = await admin
          .from("documents")
          .select("title, source_text")
          .eq("id", body.documentId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (data) {
          contextText = `Documento: ${data.title ?? ""}\n\nTexto (trecho):\n${(data.source_text ?? "").slice(0, 8000)}`;
        }
      }
    }

    // Charge ANTES (reembolsa se falhar)
    const charge = await chargeCoins(user.id, COIN_COST, "image_generation", {
      endpoint: "illustrate",
      prompt_preview: rawPrompt.slice(0, 80),
    });
    if (!charge.ok) {
      return Response.json(
        {
          error: `Saldo insuficiente. Precisa de ${charge.required} coins, você tem ${charge.balance}.`,
          required: charge.required,
          balance: charge.balance,
          upgrade: "/account/coins",
        },
        { status: 402 },
      );
    }

    let url: string;
    try {
      // 1. Enhance via Haiku — se houver contextText (transcript/summary/doc),
      //    o Haiku usa como base científica pra escolher a cena focal.
      //    Sem contexto, opera só com rawPrompt.
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      const enhancedPrompt = anthropicKey
        ? await enhancePromptViaClaude(rawPrompt, contextText, anthropicKey)
        : rawPrompt;

      // 2. Aplica wrapper (style anchors + ban total de texto na imagem)
      const finalPrompt = wrapPromptForMedicalDiagram(enhancedPrompt);

      // 3. Gera via gpt-image-1 quality HIGH (mais caro mas qualidade
      //    visual sobe bastante — justifica a subida de coin cost 20→30)
      const { b64 } = await generateImageOpenAI({
        prompt: finalPrompt,
        size: "1536x1024",
        quality: "high",
        apiKey: process.env.OPENAI_API_KEY!,
      });

      const admin = createAdminClient();
      const buffer = Buffer.from(b64, "base64");
      const key = `${user.id}/illustrate-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.png`;
      const { error: upErr } = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(key, buffer, {
          contentType: "image/png",
          upsert: false,
        });
      if (upErr) {
        throw new Error(`upload falhou: ${upErr.message}`);
      }
      const { data: pub } = admin.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(key);
      if (!pub?.publicUrl) {
        throw new Error("getPublicUrl vazio");
      }
      url = pub.publicUrl;

      void logAiUsage({
        userId: user.id,
        endpoint: "illustrate",
        model: "gpt-image-1",
        imagesCount: 1,
      }).catch(() => {});
    } catch (err) {
      // Reembolsa se falhou a geração/upload
      await creditCoins(user.id, COIN_COST, "refund", {
        original_reason: "image_generation",
        endpoint: "illustrate",
        failure: (err as Error).message?.slice(0, 200),
      }).catch(() => {});
      console.error("[illustrate] generation failed", err);
      return Response.json(
        { error: "Falha ao gerar imagem. Coins reembolsados." },
        { status: 500 },
      );
    }

    return Response.json({
      url,
      coinsCharged: COIN_COST,
      balanceAfter: charge.balanceAfter,
    });
  } catch (err) {
    console.error("[illustrate] crash", err);
    return Response.json({ error: "Erro interno." }, { status: 500 });
  }
}
