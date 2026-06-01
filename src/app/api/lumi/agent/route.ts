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
  getUserProfileAsync,
  renderProfileForPrompt,
} from "@/lib/user-profile";
import {
  LUMI_TOOLS,
  executeTool,
  type ToolContext,
} from "@/lib/lumi-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const AGENT_COST = 3; // 3 coins por turn — cobre custo real de Haiku 4.5 com cache
const MAX_ITERATIONS = 4; // limite de loops antes de force-stop — 4 cobre 99% dos casos sem inflar tokens
const MAX_TOKENS_PER_TURN = 800; // suficiente pra resposta + tool calls; corta verbosidade
const HISTORY_TURNS = 6; // últimas 6 mensagens (3 user + 3 assistant) — 12 era exagero
const MODEL = "claude-haiku-4-5"; // pode subir pra sonnet se precisar mais inteligência

type HistoryTurn = { role: "user" | "assistant"; content: string };
type AttachmentPayload = {
  name?: string;
  content?: string;
  mediaType?: string;
};

type Body = {
  message?: string;
  history?: HistoryTurn[];
  attachments?: AttachmentPayload[];
  /** Contexto opcional: matéria atualmente "focada" no chat (ajuda Claude) */
  subjectId?: string;
  subjectName?: string;
};

const SYSTEM_PROMPT = `Você é o Lumi, agente de estudo do app Lumio (lumioapp.net).

APP: user organiza tudo em MATÉRIAS. Cada uma tem aulas gravadas (com transcrição) e/ou PDFs anexados. Você gera resumo/flashcards/quiz/mapa a partir de QUALQUER material (transcrição OU PDF). Rotas: /subject/<id>, /resumos, /flashcards, /quiz, /gravacoes, /documentos, /schedule, /planos, /calendario.

POSTURA — LUMI FAZ, NÃO DELEGA:
- AJA pelas tools. Falta matéria? criar_materia. Falta pasta? criar_pasta. Subir arquivo? solicitar_upload. Navegar? abrir_rota.
- Prefira cards clicáveis (perguntar_opcoes, abrir_rota) a texto "vá em X".
- Faça o MÍNIMO de tool calls necessárias. Não chame tools redundantes.

REGRA DE OURO — perguntar_opcoes:
- Quando sua pergunta tem 2-4 respostas discretas previsíveis, USE perguntar_opcoes (vira card clicável). Texto NÃO vira botão.
- Cada option.value = a frase COMPLETA que o user "diria" ao clicar. NUNCA placeholder, brackets, "<preencher>".
- MÁX 1 perguntar_opcoes por turn.
- Resposta aberta (nome de tópico, etc) = texto. Escolha discreta = perguntar_opcoes.

CALENDÁRIO (agendar_evento, grátis):
- User mencionou data/hora de prova/trabalho? OFEREÇA agendar via perguntar_opcoes. Depois do "sim", chame agendar_evento com starts_at ISO 8601 (fuso America/Sao_Paulo, ex: "2026-06-09T11:20:00-03:00").
- Datas relativas: "amanhã"=hoje+1d, "semana que vem segunda"=próxima segunda, "daqui 3 dias"=hoje+3d.
- Prova default = +2h, bloco = +1h. Omita ends_at e o servidor aplica default.
- NUNCA diga "agendei" sem ter chamado a tool.

MATERIAL:
- Antes de afirmar conteúdo de aula/PDF, CHAME buscar_no_material — nunca invente.
- Quando user disser que subiu arquivo, CHAME listar_aulas_e_docs(subjectId) ANTES de afirmar. O doc já está no banco — você vai ver. NUNCA diga "não vejo" ou "ainda processando" sem ter listado.
- Sem material: chame solicitar_upload(subjectId) — abre o modal direto. NÃO use abrir_rota /subject/<id> só pra forçar upload.
- Tópico que faz sentido como subpasta (ex: "Fisiologia" dentro de "Endócrino"): após upload, ofereça criar_pasta via perguntar_opcoes.

CUSTOS (geração):
- resumo 10, flashcards 8, quiz 8, mapa 6, imagem 30, rotina 12, plano 8 coins.
- NUNCA gere sem pedido EXPLÍCITO ("faz um resumo de X") OU confirmação após oferta.
- Pedido vago ("me ajuda em X", "tenho prova") = explique de graça no chat E OFEREÇA gerar com custo. Só dispare depois do "sim".
- ROTINA (12c) = CRONOGRAMA SEMANAL PDF. PLANO (8c) = TRILHA de tarefas em /planos. Estrutura → plano. Tempo → rotina.
- Pra rotina/plano: sempre pergunte matéria + tópicos + confirme custo antes.

DESTRUTIVO — sempre confirme via perguntar_opcoes:
- excluir_materia (avise impacto: "vai apagar N aulas, M resumos"), renomear_materia, excluir_pasta, mover_aula_para_pasta, excluir_aula, excluir_resumo.
- marcar_item_plano_concluido NÃO precisa confirmar (reversível).

abrir_rota:
- Whitelist: /dashboard, /lumi, /lumi/chats, /planos, /resumos, /flashcards, /quiz, /documentos, /favoritos, /gravacoes, /schedule, /calendario, /onboarding, /help, /guia-revisao, /embaixador, /account/*.
- Dinâmicas exigem UUID: /subject/<id>, /lecture/<id>, /resumo/<id>, /document/<id>, /deck/<id>, /planos/<id>, /quiz-banco/<id>, /mapa/<id>.
- Sem ID? Mande /dashboard. NUNCA /subject sem ID (404).

ESTILO:
- PT-BR coloquial, direto. Marcadores curtos, não parágrafos.
- NÃO narre passos ("vou verificar", "hmm", "ótimo encontrei"). Vá direto.
- Sempre feche com próxima ação concreta.
- Asset gerado aparece como card clicável — NÃO escreva link markdown. Sua resposta = 1-2 frases + próximo passo.
- Se mensagem do user parece escolha de botão ("Quero começar do zero", "Gerar resumo"), NÃO repita pergunta. Interprete e avance.

NÃO FAÇA:
- Gerar asset sem pedido/confirmação. Gerar vários quando pediu um. Inventar conteúdo. Encher linguiça em pedido explícito.`;

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

  // Perfil do user coletado no onboarding (curso, dificuldades, estilo,
  // rotina, próximas provas). Injetado no system prompt pra Lumi adaptar
  // tom e sugestões sem precisar perguntar de novo.
  let profileHint = "";
  try {
    const profile = await getUserProfileAsync(supabase, user.id);
    const rendered = renderProfileForPrompt(profile);
    if (rendered) {
      profileHint = `\n\nSOBRE O USER (perfil persistente): ${rendered}\n\nUse essas infos pra adaptar suas respostas — não pergunte de novo o que já tá aqui. Você pode confirmar/atualizar gentilmente se algo parecer desatualizado.`;
    }
  } catch (err) {
    console.warn("[lumi-agent] profile load failed", err);
  }

  const history: Anthropic.MessageParam[] = (body.history ?? [])
    .slice(-HISTORY_TURNS)
    .filter(
      (h): h is HistoryTurn =>
        !!h &&
        (h.role === "user" || h.role === "assistant") &&
        typeof h.content === "string" &&
        h.content.length > 0 &&
        h.content.length <= LIMITS.MESSAGE_CHARS,
    )
    .map((h) => ({ role: h.role, content: h.content }));

  const attachments = (Array.isArray(body.attachments) ? body.attachments : [])
    .filter(
      (a): a is AttachmentPayload =>
        !!a && typeof a.content === "string" && a.content.trim().length > 0,
    )
    .slice(0, 5);
  if (attachments.length > 0) {
    const content: Anthropic.MessageParam["content"] = [
      { type: "text", text: message },
    ];
    const textAttachments: string[] = [];
    for (const a of attachments) {
      const name = typeof a.name === "string" ? a.name.slice(0, 180) : "Anexo";
      const mediaType = typeof a.mediaType === "string" ? a.mediaType : "";
      const attachmentContent = a.content ?? "";
      if (mediaType === "image/png" || mediaType === "image/jpeg") {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: attachmentContent,
          },
        });
        textAttachments.push(`[Imagem anexada: ${name}]`);
      } else {
        textAttachments.push(
          `=== ANEXO: ${name} ===\n${attachmentContent.slice(0, 30_000)}`,
        );
      }
    }
    if (textAttachments.length > 0) {
      content.push({
        type: "text",
        text: `\n\nMATERIAL TEMPORÁRIO ANEXADO PELO USER NESTA MENSAGEM:\n${textAttachments.join("\n\n")}\n\nUse esses anexos para responder, orientar e sugerir assets. Se o user pedir geração de asset a partir deles, use as tools de geração com esse contexto quando possível.`,
      });
    }
    history.push({ role: "user", content });
  } else {
    history.push({ role: "user", content: message });
  }

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

      // Cache breakpoints (Anthropic prompt caching ephemeral):
      //   - System SYSTEM_PROMPT estável (cached, ~5K tokens)
      //   - Tools array completo (cached via cache_control no último, ~10K tokens)
      //   - contextHint/profileHint variam por user/sessão → NÃO cacheia
      // Resultado: ~15K tokens fixos viram 10% do preço em re-uso (5min TTL),
      // só os ~500 tokens de profile/context + histórico/output rodam full price.
      const cachedTools: Anthropic.Tool[] = LUMI_TOOLS.map((t, i) =>
        i === LUMI_TOOLS.length - 1
          ? ({ ...t, cache_control: { type: "ephemeral" } } as Anthropic.Tool)
          : t,
      );
      const systemBlocks: Anthropic.TextBlockParam[] = [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ];
      const dynamicSystem = (contextHint + profileHint).trim();
      if (dynamicSystem) {
        systemBlocks.push({ type: "text", text: dynamicSystem });
      }

      try {
        // Loop agentic
        while (iterations < MAX_ITERATIONS) {
          iterations++;

          const resp = await createMessage(
            {
              model: MODEL,
              max_tokens: MAX_TOKENS_PER_TURN,
              system: systemBlocks,
              messages: history,
              tools: cachedTools,
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
