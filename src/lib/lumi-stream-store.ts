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
  /** Texto JÁ VISÍVEL pro user — animado char-a-char pelo typewriter. */
  partial: string;
  /** Texto total recebido do servidor até agora (alvo do typewriter). Pode estar à frente de `partial`. */
  target: string;
  tools: ToolEvent[];
  status: "running" | "done" | "error";
  errorMsg?: string;
  startedAt: number;
  /** Contador monotônico — incrementado a cada `notify`. Usado pra forçar
   *  re-render via React.useSyncExternalStore (que faz bailout em referências
   *  iguais — mutar state diretamente não dispara update sem trocar identity). */
  version: number;
  /** Timer do typewriter (interval id). Não exposto fora do módulo. */
  typewriterTimer?: ReturnType<typeof setInterval>;
  /** True quando o HTTP stream do servidor já terminou (não vai vir mais delta). */
  streamFinished?: boolean;
  /** Callback interno chamado quando partial alcança target após streamFinished. */
  onTypewriterEnd?: () => void;
};

/** Snapshot imutável retornado pra useSyncExternalStore. Re-criado quando version muda. */
export type StreamSnapshot = {
  chatId: string;
  partial: string;
  tools: ToolEvent[];
  status: "running" | "done" | "error";
  errorMsg?: string;
};
const snapshotCache = new Map<string, { version: number; snap: StreamSnapshot }>();

/**
 * Velocidade do typewriter:
 * - TICK_MS: frequência de update (~60fps).
 * - Adaptativo: gap grande = mais chars/tick pra não acumular delay.
 * - Quando stream terminou (status≠running), acelera pra fechar em <2s mesmo com texto longo.
 */
const TICK_MS = 25;
const CHARS_PER_TICK_MIN = 1;
const CHARS_PER_TICK_MAX = 2;
const CATCHUP_DIVISOR = 100;
const FINISH_DIVISOR = 70;
const FINISH_CHARS_PER_TICK_MIN = 2;

function startTypewriter(state: StreamState) {
  if (state.typewriterTimer) return;
  state.typewriterTimer = setInterval(() => {
    const gap = state.target.length - state.partial.length;
    if (gap <= 0) {
      // Alcançou o alvo atual. Só para de vez quando o HTTP stream terminou
      // (senão pode chegar mais delta no próximo tick).
      if (state.streamFinished) {
        clearInterval(state.typewriterTimer!);
        state.typewriterTimer = undefined;
        const cb = state.onTypewriterEnd;
        state.onTypewriterEnd = undefined;
        cb?.();
      }
      return;
    }
    let chunk: number;
    if (state.streamFinished) {
      chunk = Math.max(FINISH_CHARS_PER_TICK_MIN, Math.ceil(gap / FINISH_DIVISOR));
    } else {
      chunk = Math.max(
        CHARS_PER_TICK_MIN,
        Math.min(CHARS_PER_TICK_MAX, Math.ceil(gap / CATCHUP_DIVISOR)),
      );
    }
    state.partial = state.target.slice(0, state.partial.length + chunk);
    notify(state.chatId);
  }, TICK_MS);
}

function waitTypewriterDone(state: StreamState): Promise<void> {
  return new Promise((resolve) => {
    if (
      !state.typewriterTimer &&
      state.partial.length === state.target.length
    ) {
      resolve();
      return;
    }
    state.onTypewriterEnd = resolve;
  });
}

const streams = new Map<string, StreamState>();
const subscribers = new Map<string, Set<() => void>>();

function notify(chatId: string) {
  const s = streams.get(chatId);
  if (s) s.version += 1;
  snapshotCache.delete(chatId);
  const subs = subscribers.get(chatId);
  if (subs) for (const sub of subs) sub();
}

/** Retorna estado atual do stream pra um chat (ou undefined se não tem) */
export function getStreamState(chatId: string): StreamState | undefined {
  return streams.get(chatId);
}

/**
 * Retorna snapshot ESTÁVEL pra useSyncExternalStore. A mesma referência é
 * devolvida enquanto a versão do state não muda — quando muda (via `notify`),
 * cache invalida e nova snap é criada. Isso é o que faz o React re-renderizar
 * a cada delta do typewriter (mutar state direto não dispara update porque
 * useSyncExternalStore compara via Object.is).
 */
export function getStreamSnapshot(chatId: string): StreamSnapshot | undefined {
  const s = streams.get(chatId);
  if (!s) return undefined;
  const cached = snapshotCache.get(chatId);
  if (cached && cached.version === s.version) return cached.snap;
  const snap: StreamSnapshot = {
    chatId: s.chatId,
    partial: s.partial,
    tools: s.tools.slice(),
    status: s.status,
    errorMsg: s.errorMsg,
  };
  snapshotCache.set(chatId, { version: s.version, snap });
  return snap;
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
    target: "",
    tools: [],
    status: "running",
    startedAt: Date.now(),
    version: 0,
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
            state.target = finalReply;
            startTypewriter(state);
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
            state.target = finalReply;
            startTypewriter(state);
          }
          notify(state.chatId);
        } catch {
          /* ignora chunk malformado */
        }
      }
    }

    // Stream HTTP do servidor terminou — sinaliza pro typewriter terminar de
    // alcançar o target (em fast-finish) e SÓ DEPOIS marcamos done. Isso evita
    // flicker entre "streaming somiu" e "mensagem aparece no chat list".
    state.streamFinished = true;

    if (state.errorMsg) {
      // Erro mata o typewriter na hora — não tem porque animar texto sem fim útil.
      if (state.typewriterTimer) {
        clearInterval(state.typewriterTimer);
        state.typewriterTimer = undefined;
      }
      state.partial = state.target;
      state.status = "error";
      notify(state.chatId);
      opts.onError?.(state.errorMsg);
      cleanupStream(state.chatId);
      return;
    }

    await waitTypewriterDone(state);

    // Persiste os cards de tools ACIONÁVEIS na própria mensagem — assim eles
    // sobrevivem a reload/saída da tela. Casos:
    //  - iniciar_modo_prova: preserva output INTEIRO (LumiExamModeCard renderiza
    //    assets + cronograma + topicos_foco), senão o card some quando o stream
    //    termina e vira só texto;
    //  - resto: guarda só o enxuto (url/titulo/navegacao) pra não inchar
    //    o localStorage com chunks de busca.
    const persistedTools = state.tools
      .filter((t) => {
        const o = t.output as Record<string, unknown> | undefined;
        if (!o || typeof o !== "object") return false;
        if (t.name === "iniciar_modo_prova") {
          return "sucesso" in o || "assets" in o || "cronograma" in o;
        }
        if (t.name === "perguntar_opcoes") {
          return "pergunta" in o && "opcoes" in o;
        }
        return "url" in o || "navegacao" in o;
      })
      .map((t) => {
        if (t.name === "iniciar_modo_prova" || t.name === "perguntar_opcoes") {
          return {
            name: t.name,
            status: t.status,
            output: t.output,
          };
        }
        const o = t.output as Record<string, unknown>;
        return {
          name: t.name,
          status: t.status,
          output: {
            url: o.url,
            titulo: o.titulo,
            navegacao: o.navegacao,
          },
        };
      });

    // Persiste a mensagem final no chat (mesmo se user navegou pra fora)
    const assistantMsg: LumiChatMessage = {
      id: `a_${Date.now()}`,
      role: "assistant",
      content: stripChatFormatting(finalReply) || "(Sem resposta)",
      createdAt: new Date().toISOString(),
      ...(persistedTools.length > 0 ? { tools: persistedTools } : {}),
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
