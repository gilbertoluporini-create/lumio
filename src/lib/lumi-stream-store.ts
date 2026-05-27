"use client";

/**
 * Singleton store dos streams ativos do Lumi agent.
 *
 * Por que existir: o fetch do agente vivia dentro do componente /lumi/page.tsx.
 * Quando o user navegava pra fora, o componente desmontava, o reader morria,
 * e a resposta nunca chegava de volta. Pior: ao voltar, não tinha nem o
 * estado parcial nem a mensagem final.
 *
 * Fix: o stream agora roda no escopo do módulo (singleton). Componente subscreve
 * via useSyncExternalStore. Quando termina, persiste o assistant message via
 * appendMessage (que vai pra localStorage + Supabase). Continua rodando mesmo
 * com o componente desmontado.
 */

import { appendMessage, type LumiChatMessage } from "./lumi-chats";
import { stripChatFormatting } from "./utils";

export type ToolEvent = {
  id: string;
  name: string;
  status: "running" | "done" | "error";
  input?: Record<string, unknown>;
  output?: unknown;
};

export type StreamState = {
  chatId: string;
  userId: string;
  partial: string;
  tools: ToolEvent[];
  status: "running" | "done" | "error";
  errorMsg?: string;
  startedAt: number;
};

const streams = new Map<string, StreamState>();
const subscribers = new Map<string, Set<() => void>>();

function notify(chatId: string) {
  const subs = subscribers.get(chatId);
  if (subs) for (const s of subs) s();
}

/** Retorna estado atual do stream pra um chat (ou undefined se não tem) */
export function getStreamState(chatId: string): StreamState | undefined {
  return streams.get(chatId);
}

/** Subscribe a mudanças do stream desse chat. Retorna unsubscribe. */
export function subscribeStream(chatId: string, cb: () => void): () => void {
  let set = subscribers.get(chatId);
  if (!set) {
    set = new Set();
    subscribers.set(chatId, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
  };
}

/** Apaga estado terminado — chamado depois que o assistant message foi commitado */
function cleanupStream(chatId: string) {
  // Atrasa cleanup pra dar tempo da UI consumir o estado final
  setTimeout(() => {
    const s = streams.get(chatId);
    if (s && s.status !== "running") {
      streams.delete(chatId);
      notify(chatId);
    }
  }, 5_000);
}

type StartOpts = {
  chatId: string;
  userId: string;
  url: string;
  body: unknown;
  /** Callback opcional ao terminar com sucesso (recebe a final assistant msg). */
  onDone?: (msg: LumiChatMessage) => void;
  /** Callback opcional ao falhar (recebe a mensagem de erro). */
  onError?: (msg: string) => void;
};

/**
 * Inicia um stream pro Lumi agent. Não bloqueia — retorna imediatamente.
 * Estado fica acessível via `getStreamState(chatId)` + `subscribeStream`.
 * Se já existe stream rodando pro mesmo chat, retorna o existente.
 */
export function startLumiStream(opts: StartOpts): StreamState {
  const existing = streams.get(opts.chatId);
  if (existing && existing.status === "running") {
    return existing;
  }

  const state: StreamState = {
    chatId: opts.chatId,
    userId: opts.userId,
    partial: "",
    tools: [],
    status: "running",
    startedAt: Date.now(),
  };
  streams.set(opts.chatId, state);
  notify(opts.chatId);

  // Roda em background — não awaita
  void runStream(state, opts);

  return state;
}

async function runStream(state: StreamState, opts: StartOpts): Promise<void> {
  let finalReply = "";
  try {
    const res = await fetch(opts.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(opts.body),
    });

    if (!res.ok || !res.body) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) msg = j.error;
      } catch {
        /* ignore */
      }
      state.status = "error";
      state.errorMsg = msg;
      notify(state.chatId);
      opts.onError?.(msg);
      cleanupStream(state.chatId);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        const json = line.slice(5).trim();
        if (!json) continue;
        try {
          const ev = JSON.parse(json) as {
            delta?: string;
            done?: boolean;
            reply?: string;
            error?: string;
            tool_start?: {
              id: string;
              name: string;
              input: Record<string, unknown>;
            };
            tool_result?: { id: string; name: string; output: unknown };
          };

          if (ev.error) {
            state.errorMsg = ev.error;
          }
          if (typeof ev.delta === "string") {
            finalReply += ev.delta;
            state.partial = finalReply;
          }
          if (ev.tool_start) {
            state.tools.push({
              id: ev.tool_start.id,
              name: ev.tool_start.name,
              input: ev.tool_start.input,
              status: "running",
            });
          }
          if (ev.tool_result) {
            const t = state.tools.find((x) => x.id === ev.tool_result!.id);
            if (t) {
              t.output = ev.tool_result.output;
              const isErr =
                !!t.output &&
                typeof t.output === "object" &&
                "error" in (t.output as object);
              t.status = isErr ? "error" : "done";
            }
          }
          if (ev.done && typeof ev.reply === "string") {
            finalReply = ev.reply;
            state.partial = finalReply;
          }
          notify(state.chatId);
        } catch {
          /* ignora chunk malformado */
        }
      }
    }

    if (state.errorMsg) {
      state.status = "error";
      notify(state.chatId);
      opts.onError?.(state.errorMsg);
      cleanupStream(state.chatId);
      return;
    }

    // Persiste a mensagem final no chat (mesmo se user navegou pra fora)
    const assistantMsg: LumiChatMessage = {
      id: `a_${Date.now()}`,
      role: "assistant",
      content: stripChatFormatting(finalReply) || "(Sem resposta)",
      createdAt: new Date().toISOString(),
    };
    try {
      appendMessage(opts.userId, opts.chatId, assistantMsg);
    } catch (err) {
      console.warn("[lumi-stream] appendMessage failed", err);
    }

    state.status = "done";
    notify(state.chatId);
    opts.onDone?.(assistantMsg);
    cleanupStream(state.chatId);
  } catch (err) {
    const msg = (err as Error).message ?? "Falha de rede";
    state.status = "error";
    state.errorMsg = msg;
    notify(state.chatId);
    opts.onError?.(msg);
    cleanupStream(state.chatId);
  }
}
