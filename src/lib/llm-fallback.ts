/**
 * Fallback Anthropic → OpenAI pra TODAS as rotas de IA.
 *
 * MOTIVO: quando o crédito da Anthropic acaba (ou a API fica fora), toda
 * feature de IA do app cai. Este helper tenta a Anthropic primeiro e, em
 * erro recuperável (sem crédito / billing / 401 / 429 / 5xx / overloaded),
 * refaz a MESMA chamada na OpenAI (Chat Completions) e converte a resposta
 * de volta pro formato Anthropic — então os call sites quase não mudam.
 *
 * Quando a Anthropic for recarregada, volta a usá-la sozinho (auto-recovery),
 * sem precisar mexer em env/deploy.
 *
 * Cobre: texto simples, tools (function calling), visão (imagem/PDF) e
 * streaming de texto. Modelo OpenAI configurável via OPENAI_TEXT_MODEL.
 */

import Anthropic from "@anthropic-ai/sdk";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL ?? "gpt-4.1";

/* ------------------------------------------------------------------ */
/*  Detecção de erro recuperável (cai pro fallback)                    */
/* ------------------------------------------------------------------ */

export function isAnthropicRecoverableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const maybe = err as {
    status?: number;
    error?: { error?: { message?: string }; message?: string };
    message?: string;
  };
  const msg = [maybe.message, maybe.error?.message, maybe.error?.error?.message]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const status = maybe.status;

  // Sem crédito / problema de billing — o caso principal ("cabou o dinheiro").
  if (
    msg.includes("credit balance is too low") ||
    msg.includes("billing") ||
    msg.includes("purchase credits") ||
    msg.includes("insufficient") ||
    msg.includes("quota")
  ) {
    return true;
  }

  // Auth (key revogada), rate limit, overloaded (529) e erros de servidor:
  // melhor servir via OpenAI do que derrubar a feature.
  if (
    status === 401 ||
    status === 429 ||
    status === 529 ||
    (typeof status === "number" && status >= 500)
  ) {
    return true;
  }

  return false;
}

/* ------------------------------------------------------------------ */
/*  Conversão Anthropic → OpenAI                                       */
/* ------------------------------------------------------------------ */

type OAITextPart = { type: "text"; text: string };
type OAIImagePart = { type: "image_url"; image_url: { url: string } };
type OAIFilePart = { type: "file"; file: { filename: string; file_data: string } };
type OAIContentPart = OAITextPart | OAIImagePart | OAIFilePart;
type OAIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
type OAIMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | OAIContentPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: OAIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

function systemToText(
  system: Anthropic.MessageCreateParams["system"],
): string {
  if (!system) return "";
  if (typeof system === "string") return system;
  return system
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n");
}

function imageUrlFromSource(
  source: Anthropic.ImageBlockParam["source"],
): string | null {
  if (source.type === "base64") {
    return `data:${source.media_type};base64,${source.data}`;
  }
  if (source.type === "url") return source.url;
  return null;
}

function convertMessages(
  messages: Anthropic.MessageParam[],
): OAIMessage[] {
  const out: OAIMessage[] = [];

  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content } as OAIMessage);
      continue;
    }

    const blocks = m.content;

    if (m.role === "assistant") {
      const textParts: string[] = [];
      const toolCalls: OAIToolCall[] = [];
      for (const block of blocks) {
        if (block.type === "text") {
          textParts.push(block.text);
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            type: "function",
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input ?? {}),
            },
          });
        }
      }
      const msg: OAIMessage = {
        role: "assistant",
        content: textParts.join("") || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      };
      out.push(msg);
      continue;
    }

    // role === "user": pode ter tool_result, text, image, document.
    // tool_result vira mensagem "tool" separada (uma por id).
    const parts: OAIContentPart[] = [];
    for (const block of blocks) {
      if (block.type === "tool_result") {
        const content =
          typeof block.content === "string"
            ? block.content
            : Array.isArray(block.content)
              ? block.content
                  .map((c) => (c.type === "text" ? c.text : ""))
                  .join("")
              : JSON.stringify(block.content ?? "");
        out.push({
          role: "tool",
          tool_call_id: block.tool_use_id,
          content,
        });
      } else if (block.type === "text") {
        parts.push({ type: "text", text: block.text });
      } else if (block.type === "image") {
        const url = imageUrlFromSource(block.source);
        if (url) parts.push({ type: "image_url", image_url: { url } });
      } else if (block.type === "document") {
        const src = block.source;
        if (src.type === "base64") {
          parts.push({
            type: "file",
            file: {
              filename: "document.pdf",
              file_data: `data:${src.media_type};base64,${src.data}`,
            },
          });
        } else if (src.type === "text") {
          parts.push({ type: "text", text: src.data });
        }
      }
    }
    if (parts.length > 0) {
      // Se for só um bloco de texto, manda string simples.
      if (parts.length === 1 && parts[0].type === "text") {
        out.push({ role: "user", content: parts[0].text });
      } else {
        out.push({ role: "user", content: parts });
      }
    }
  }

  return out;
}

function convertTools(
  tools: Anthropic.MessageCreateParams["tools"],
): unknown[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  const out: unknown[] = [];
  for (const t of tools) {
    // Só ferramentas custom (com input_schema) têm equivalente direto.
    if ("input_schema" in t) {
      out.push({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      });
    }
  }
  return out.length > 0 ? out : undefined;
}

/* ------------------------------------------------------------------ */
/*  Conversão OpenAI → Anthropic (resposta)                            */
/* ------------------------------------------------------------------ */

type OpenAIChatResponse = {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

function openaiToAnthropicMessage(
  json: OpenAIChatResponse,
  model: string,
): Anthropic.Message {
  const choice = json.choices?.[0];
  const message = choice?.message;
  const content: Anthropic.ContentBlock[] = [];

  if (message?.content) {
    content.push({
      type: "text",
      text: message.content,
      citations: null,
    } as Anthropic.TextBlock);
  }
  if (Array.isArray(message?.tool_calls)) {
    for (const tc of message.tool_calls) {
      let input: unknown = {};
      try {
        input = JSON.parse(tc.function?.arguments || "{}");
      } catch {
        input = {};
      }
      content.push({
        type: "tool_use",
        id: tc.id ?? `call_${Math.random().toString(36).slice(2)}`,
        name: tc.function?.name ?? "",
        input,
      } as Anthropic.ToolUseBlock);
    }
  }
  if (content.length === 0) {
    content.push({ type: "text", text: "", citations: null } as Anthropic.TextBlock);
  }

  const finish = choice?.finish_reason;
  const stop_reason: Anthropic.Message["stop_reason"] =
    finish === "tool_calls"
      ? "tool_use"
      : finish === "length"
        ? "max_tokens"
        : "end_turn";

  return {
    id: "msg_openai_fallback",
    type: "message",
    role: "assistant",
    model,
    content,
    stop_reason,
    stop_sequence: null,
    usage: {
      input_tokens: json.usage?.prompt_tokens ?? 0,
      output_tokens: json.usage?.completion_tokens ?? 0,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
    },
  } as unknown as Anthropic.Message;
}

/* ------------------------------------------------------------------ */
/*  Chamada OpenAI                                                     */
/* ------------------------------------------------------------------ */

function buildOpenAIBody(
  params: Anthropic.MessageCreateParamsNonStreaming,
  stream: boolean,
): Record<string, unknown> {
  const messages: OAIMessage[] = [];
  const sys = systemToText(params.system);
  if (sys) messages.push({ role: "system", content: sys });
  messages.push(...convertMessages(params.messages));

  const tools = convertTools(params.tools);
  return {
    model: OPENAI_TEXT_MODEL,
    messages,
    max_tokens: params.max_tokens,
    ...(typeof params.temperature === "number"
      ? { temperature: params.temperature }
      : {}),
    ...(tools ? { tools } : {}),
    ...(stream ? { stream: true } : {}),
  };
}

async function callOpenAIAsAnthropic(
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada para fallback.");
  }
  const resp = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildOpenAIBody(params, false)),
  });
  const json = (await resp.json().catch(() => ({}))) as OpenAIChatResponse;
  if (!resp.ok) {
    throw new Error(
      `OpenAI fallback ${resp.status}: ${json.error?.message ?? "erro desconhecido"}`,
    );
  }
  return openaiToAnthropicMessage(json, OPENAI_TEXT_MODEL);
}

/* ------------------------------------------------------------------ */
/*  API pública                                                        */
/* ------------------------------------------------------------------ */

/**
 * Drop-in pra `client.messages.create(params)` (não-streaming).
 * Tenta Anthropic; em erro recuperável, refaz na OpenAI e devolve no
 * formato Anthropic.
 *
 * `timeoutMs` (default 240s = 4min) evita request pendurar 10-15min em
 * cenários onde Sonnet trava ou Anthropic está degradado. Caller deve
 * cobrir o caso de erro (reembolso de coins, etc).
 */
export async function createMessage(
  params: Anthropic.MessageCreateParamsNonStreaming,
  opts: { anthropicKey?: string; timeoutMs?: number } = {},
): Promise<Anthropic.Message> {
  const anthropicKey = opts.anthropicKey ?? process.env.ANTHROPIC_API_KEY;
  const timeout = opts.timeoutMs ?? 240_000;
  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey, timeout });
      return await client.messages.create(params);
    } catch (err) {
      if (!isAnthropicRecoverableError(err)) throw err;
      console.warn(
        "[llm-fallback] Anthropic indisponível; usando OpenAI:",
        (err as Error)?.message ?? err,
      );
    }
  }
  return callOpenAIAsAnthropic(params);
}

/**
 * Streaming de texto puro. Tenta Anthropic (stream); se a abertura falhar
 * por erro recuperável, cai pro stream da OpenAI. Só faz fallback ANTES de
 * emitir qualquer token (evita texto duplicado).
 */
export async function* streamText(
  params: Anthropic.MessageCreateParamsNonStreaming,
  opts: { anthropicKey?: string } = {},
): AsyncGenerator<string> {
  const anthropicKey = opts.anthropicKey ?? process.env.ANTHROPIC_API_KEY;

  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey });
      const stream = await client.messages.create({
        ...params,
        stream: true,
      });
      // Sucesso na abertura → consome o stream Anthropic inteiro.
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield event.delta.text;
        }
      }
      return;
    } catch (err) {
      if (!isAnthropicRecoverableError(err)) throw err;
      console.warn(
        "[llm-fallback] Anthropic stream indisponível; usando OpenAI:",
        (err as Error)?.message ?? err,
      );
    }
  }

  yield* streamTextOpenAI(params);
}

async function* streamTextOpenAI(
  params: Anthropic.MessageCreateParamsNonStreaming,
): AsyncGenerator<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada para fallback.");
  }
  const resp = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildOpenAIBody(params, true)),
  });
  if (!resp.ok || !resp.body) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`OpenAI stream ${resp.status}: ${txt.slice(0, 200)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const piece = json.choices?.[0]?.delta?.content;
        if (piece) yield piece;
      } catch {
        /* linha parcial / keep-alive — ignora */
      }
    }
  }
}
