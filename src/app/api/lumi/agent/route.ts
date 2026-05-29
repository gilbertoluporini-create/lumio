/**
 * POST /api/lumi/agent
 *
 * Agente Lumi com tool calling (Anthropic native). Loop:
 *   1. Claude recebe mensagem do user + histórico + tools disponíveis
 *   2. Claude decide: responde texto OU chama tool
 *   3. Se chama tool, server executa, devolve resultado, Claude continua
 *   4. Loop até stop_reason = "end_turn" ou hit max_iterations
 *
 * Streaming: usa SSE pra mandar 3 tipos de evento:
 *   - { delta: "..." }            → texto incremental
 *   - { tool_start: { name, input } } → começou a executar uma tool
 *   - { tool_result: { name, output } } → tool retornou
 *   - { done: true, reply, coinsCharged } → fim
 *   - { error: "..." }             → falha
 *
 * Cobrança: 1 coin por turn do usuário (igual chat-summary). Tools internas
 * que chamam /api/ai/generate cobram seus próprios coins separadamente.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createMessage } from "@/lib/llm-fallback";
import { tryAcquireLock, releaseLock } from "@/lib/inflight-locks";
import { LIMITS, logAndSanitize } from "@/lib/api-security";
import { chargeCoins, creditCoins } from "@/lib/coins";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { checkChatDailyCap, chatCapResponse } from "@/lib/chat-cap";
import { logAiUsage } from "@/lib/ai-usage";
import {
  LUMI_TOOLS,
  executeTool,
  type ToolContext,
} from "@/lib/lumi-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const AGENT_COST = 1; // 1 coin por turn do user (igual chat-summary)
const MAX_ITERATIONS = 8; // limite de loops antes de force-stop
const MODEL = "claude-haiku-4-5"; // pode subir pra sonnet se precisar mais inteligência

type HistoryTurn = { role: "user" | "assistant"; content: string };

type Body = {
  message?: string;
  history?: HistoryTurn[];
  /** Contexto opcional: matéria atualmente "focada" no chat (ajuda Claude) */
  subjectId?: string;
  subjectName?: string;
};

const SYSTEM_PROMPT = `Você é o Lumi, agente de estudo dentro do app Lumio (lumioapp.net).

COMO O APP FUNCIONA (use isso pra não inventar fluxo errado):
- O user organiza tudo em MATÉRIAS. Cada matéria tem aulas gravadas (que viram transcrição) E/OU PDFs/documentos anexados.
- Você gera resumo/flashcards/quiz/mapa a partir de QUALQUER material existente — uma transcrição OU um PDF anexado servem. Não precisa de "aula gravada" pra gerar a partir de um PDF.
- NÃO existe conceito de "material ativo" nem "aula processada" pro user. NUNCA mande o user "gravar a aula de novo" — isso não faz sentido no app.
- Se buscar_no_material achou trechos sobre o tema, o material EXISTE — use a matéria/PDF certos. Antes de gerar/Modo Prova com contexto "Livre", descubra a matéria certa via listar_materias + listar_aulas_e_docs + buscar_no_material; passe o subjectId daquela matéria.
- Só diga que não há material se listar_aulas_e_docs E buscar_no_material vierem realmente vazios pra todas as matérias. Aí, de forma simples: "não achei nada sobre X nas suas matérias — anexa um PDF ou grava uma aula que eu monto pra você."

PRINCÍPIOS:
- Tools de LEITURA são de graça (listar_materias, listar_aulas_e_docs, buscar_no_material) — use livremente pra entender o material e responder bem.
- Tools de GERAÇÃO custam coins do user: gerar_resumo (10), criar_flashcards (8), criar_quiz (8), criar_mapa_mental (6), gerar_imagem (30). NUNCA gere um asset sem o user ter pedido AQUELE asset explicitamente OU confirmado. Gerar sem ele pedir = gastar coin dele à toa.
- Pedido VAGO ("me ajuda a estudar X", "tenho prova de X amanhã", "explica o ciclo da ureia") NÃO é autorização pra gerar nada. Explique/oriente direto no chat (de graça) e OFEREÇA: "quero que eu gere um resumo, flashcards ou um quiz disso? (custa N coins cada)". Só gere depois do "sim" e só o que ele escolheu.
- Pedido EXPLÍCITO ("faz um resumo de X", "cria 20 flashcards disso", "gera um quiz") → aí sim execute aquele asset específico, avisando o custo na resposta.
- Antes de qualquer pergunta factual sobre o conteúdo de aulas/PDFs do user, CHAME buscar_no_material — NUNCA invente fatos sobre o material dele.
- Quando precisar de subjectId/lectureId/documentId, use listar_materias + listar_aulas_e_docs primeiro pra descobrir.
- Faça o mínimo de tool calls necessárias.

ESTILO:
- Português BR coloquial, direto, sem encher linguiça.
- Marcadores e listas curtas, não parágrafos longos.
- NÃO narre cada passo ("vou verificar", "hmm", "ótimo, encontrei", "vou executar agora") — isso polui a conversa. Vá direto.
- Quando entregar asset gerado: NÃO escreva links markdown pros assets — eles aparecem sozinhos como cards clicáveis na UI. Sua resposta final = 1-2 frases comentando o resultado + sugestão de próximo passo. Só isso.

FLUXO PRA "me ajuda a estudar X" / "tenho prova de X" / "explica X":
1. listar_materias + listar_aulas_e_docs (de graça, pra ver o que existe)
2. Se precisar, buscar_no_material pra explicar o tópico ali no chat
3. Explique/oriente no chat E ofereça gerar os materiais (resumo / flashcards / quiz / mapa), citando o custo de cada
4. SÓ gere depois que o user escolher/confirmar — e só o que ele pediu

NÃO FAÇA:
- Gerar resumo/flashcards/quiz/mapa/imagem sem o user pedir aquilo ou confirmar — mesmo que pareça útil. Os coins são dele.
- Gerar VÁRIOS assets de uma vez quando ele não pediu vários.
- Inventar conteúdo de aula/PDF que você não buscou.
- Encher linguiça quando o pedido é claramente de execução explícita.`;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`lumi-agent:ip:${ip}`, 20, 60_000);
  if (ipLimit) return ipLimit;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (!message || message.length > LIMITS.MESSAGE_CHARS) {
    return Response.json(
      { error: "message inválida (vazia ou > 4000 chars)." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Faça login." }, { status: 401 });
  }

  const userLimit = limitOrThrow(`lumi-agent:user:${user.id}`, 20, 60_000);
  if (userLimit) return userLimit;

  // Cap diário de chat por plano (mesma conta do /api/chat — reason="chat").
  const cap = await checkChatDailyCap(user.id);
  if (!cap.ok) {
    return chatCapResponse(cap);
  }

  // Trava in-flight: enquanto uma mensagem do user está rodando, rejeita
  // segundo POST. Evita cobrar coin + gerar assets em duplicata se o user
  // clicar 2x ou abrir 2 tabs (na mesma instância serverless).
  const lockKey = `lumi-agent:${user.id}`;
  if (!tryAcquireLock(lockKey)) {
    return Response.json(
      {
        error:
          "Já tem uma mensagem sua rodando. Aguarda a resposta antes de mandar outra.",
      },
      { status: 429 },
    );
  }

  const charge = await chargeCoins(user.id, AGENT_COST, "chat", {
    scope: "lumi-agent",
  });
  if (!charge.ok) {
    releaseLock(lockKey);
    return Response.json(
      {
        error: `Saldo insuficiente. Mensagem custa ${charge.required} coin, você tem ${charge.balance}.`,
        required: charge.required,
        balance: charge.balance,
        upgrade: "/account/coins",
      },
      { status: 402 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !openaiKey) {
    try {
      await creditCoins(user.id, AGENT_COST, "refund", { reason: "no_api_key" });
    } catch {
      /* ignore */
    }
    releaseLock(lockKey);
    return Response.json(
      { error: "Configuração de servidor incompleta (faltam chaves IA)." },
      { status: 503 },
    );
  }

  const supabaseAdmin = createAdminClient();
  const origin = (() => {
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    const host = req.headers.get("host") ?? "localhost:3000";
    return `${proto}://${host}`;
  })();
  const sessionCookie = req.headers.get("cookie") ?? "";

  const toolCtx: ToolContext = {
    userId: user.id,
    supabaseAdmin,
    openaiKey,
    sessionCookie,
    origin,
  };

  // Contexto extra: matéria atualmente focada (Lumi sabe sem precisar perguntar)
  const contextHint = body.subjectName
    ? `\n\nCONTEXTO ATUAL: o user está focado na matéria "${body.subjectName}"${body.subjectId ? ` (subjectId: ${body.subjectId})` : ""}.`
    : "";

  const history: Anthropic.MessageParam[] = (body.history ?? [])
    .slice(-12)
    .filter(
      (h): h is HistoryTurn =>
        !!h &&
        (h.role === "user" || h.role === "assistant") &&
        typeof h.content === "string" &&
        h.content.length > 0 &&
        h.content.length <= LIMITS.MESSAGE_CHARS,
    )
    .map((h) => ({ role: h.role, content: h.content }));
  history.push({ role: "user", content: message });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(obj)}\n\n`),
          );
        } catch {
          /* controller closed */
        }
      };

      let finalText = "";
      let totalInputTok = 0;
      let totalOutputTok = 0;
      let iterations = 0;

      try {
        // Loop agentic
        while (iterations < MAX_ITERATIONS) {
          iterations++;

          const resp = await createMessage(
            {
              model: MODEL,
              max_tokens: 1500,
              system: [
                {
                  type: "text",
                  text: SYSTEM_PROMPT + contextHint,
                  cache_control: { type: "ephemeral" },
                },
              ],
              messages: history,
              tools: LUMI_TOOLS,
            },
            { anthropicKey: apiKey },
          );

          totalInputTok += resp.usage?.input_tokens ?? 0;
          totalOutputTok += resp.usage?.output_tokens ?? 0;

          // Coleta texto + tool_use blocks
          const textBlocks: string[] = [];
          const toolUseBlocks: Array<{
            id: string;
            name: string;
            input: Record<string, unknown>;
          }> = [];

          for (const block of resp.content) {
            if (block.type === "text") {
              textBlocks.push(block.text);
              send({ delta: block.text });
            } else if (block.type === "tool_use") {
              toolUseBlocks.push({
                id: block.id,
                name: block.name,
                input: (block.input as Record<string, unknown>) ?? {},
              });
            }
          }

          // A mensagem PERSISTIDA deve ser só o fechamento (texto da última
          // iteração), não a narração de cada passo entre tool calls — senão
          // vira um blocão "Vou verificar... Hmm... Ótimo!... Pronto!". A
          // narração ao vivo continua aparecendo via stream (send delta).
          const iterationText = textBlocks.join("");
          if (iterationText.trim()) finalText = iterationText;

          // Adiciona assistant message ao histórico (com texto + tool_use)
          history.push({ role: "assistant", content: resp.content });

          if (toolUseBlocks.length === 0 || resp.stop_reason === "end_turn") {
            break;
          }

          // Executa as tools em paralelo
          const toolResults = await Promise.all(
            toolUseBlocks.map(async (tu) => {
              send({ tool_start: { id: tu.id, name: tu.name, input: tu.input } });
              const output = await executeTool(tu.name, tu.input, toolCtx);
              send({ tool_result: { id: tu.id, name: tu.name, output } });
              return {
                type: "tool_result" as const,
                tool_use_id: tu.id,
                content: JSON.stringify(output).slice(0, 60_000),
              };
            }),
          );

          history.push({ role: "user", content: toolResults });

          if (resp.stop_reason !== "tool_use") {
            // Não esperado mas sai
            break;
          }
        }

        // Log usage
        try {
          await logAiUsage({
            userId: user.id,
            endpoint: "lumi-agent",
            model: MODEL,
            inputTokens: totalInputTok,
            outputTokens: totalOutputTok,
            coinsCharged: AGENT_COST,
          });
        } catch {
          /* ignore */
        }

        send({
          done: true,
          reply: finalText,
          coinsCharged: AGENT_COST,
          iterations,
        });
        controller.close();
      } catch (err) {
        try {
          await creditCoins(user.id, AGENT_COST, "refund", {
            reason: "agent_loop_failed",
          });
        } catch {
          /* ignore */
        }
        const sanitized = logAndSanitize("api/lumi/agent", err);
        send({ error: sanitized.error ?? "Falha no agente." });
        controller.close();
      } finally {
        releaseLock(lockKey);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
