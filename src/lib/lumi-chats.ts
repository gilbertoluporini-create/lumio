export type LumiChatCategory =
  | "summary"
  | "flashcards"
  | "quiz"
  | "translate"
  | "explain"
  | "chat";

export type LumiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  attachment?: {
    kind: "summary" | "flashcards" | "quiz" | "mindmap";
    title: string;
    href?: string;
    preview?: string;
  };
  /**
   * Cards de tools acionáveis do agente Lumi (asset gerado / navegação),
   * persistidos pra sobreviver a reload/navegação — sem isso os botões
   * "Abrir →" que o agente solta na conversa sumiam ao sair e voltar.
   */
  tools?: {
    name: string;
    status: "running" | "done" | "error";
    output?: unknown;
  }[];
  /**
   * Anexos enviados pelo user nesta mensagem (imagens/PDFs/textos).
   * Guardamos só metadata — o conteúdo cru (base64) é grande demais pra
   * persistir em localStorage e já foi entregue ao server no fetch.
   */
  userAttachments?: {
    name: string;
    contentType?: string;
    sizeKb?: number;
  }[];
};

export type ChatAttachmentKind = "file" | "document";

export type ChatAttachment = {
  id: string;
  kind: ChatAttachmentKind;
  name: string;
  sizeKb?: number;
  content: string;
  contentType?: string;
};

export type LumiChat = {
  id: string;
  title: string;
  subjectId?: string;
  subjectName?: string;
  messages: LumiChatMessage[];
  category?: LumiChatCategory;
  pinned: boolean;
  starred: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
};

const STORE_VERSION = 1;

function storageKey(userId: string): string {
  return `lumio.lumi.chats.${userId}.v${STORE_VERSION}`;
}

function safeRead(userId: string): LumiChat[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as LumiChat[];
  } catch {
    return [];
  }
}

function safeWrite(userId: string, chats: LumiChat[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(chats));
    window.dispatchEvent(
      new CustomEvent("lumio.lumi.chats.changed", { detail: { userId } }),
    );
  } catch {
    /* ignore quota */
  }
}

function newId(): string {
  const c: Crypto | undefined =
    typeof globalThis !== "undefined"
      ? (globalThis as { crypto?: Crypto }).crypto
      : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // Fallback UUID v4 — necessário pro DB aceitar
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h
    .slice(6, 8)
    .join("")}-${h.slice(8, 10).join("")}-${h.slice(10, 16).join("")}`;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Push fire-and-forget pro servidor. Erros ficam silenciosos: localStorage
 * já tem o estado, eventual consistency vai resolver no próximo hydrate.
 * IDs legados (não-UUID) são ignorados — pelo próximo hydrate o user
 * recebe os dados do server e os locais sumem.
 */
function pushToServer(chat: LumiChat): void {
  if (typeof window === "undefined") return;
  if (!isUuid(chat.id)) return;
  void fetch("/api/lumi/chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(chat),
    keepalive: true,
  }).catch(() => {});
}

function purgeOnServer(chatId: string): void {
  if (typeof window === "undefined") return;
  if (!isUuid(chatId)) return;
  void fetch(`/api/lumi/chats/${chatId}`, {
    method: "DELETE",
    keepalive: true,
  }).catch(() => {});
}

/**
 * Carrega chats do servidor e sobrescreve o cache local. Chamado no mount do
 * /lumi e /lumi/chats pra garantir consistência entre dispositivos.
 */
export async function hydrateFromServer(userId: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch("/api/lumi/chats", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { chats?: LumiChat[] };
    if (!Array.isArray(data.chats)) return;

    // Merge: local items com ID não-UUID (legados) são mantidos pra não perder
    // conversas pré-migração. UUIDs locais são sobrescritos pelos do servidor.
    const local = safeRead(userId);
    const legacy = local.filter((c) => !isUuid(c.id));
    const merged = [...data.chats, ...legacy];
    safeWrite(userId, merged);

    // Sobe legados que ainda têm ID válido como UUID; os outros ficam só local
    for (const c of legacy) {
      // não-UUID: nunca vai pro server
    }
  } catch {
    // offline ou network — mantém cache atual
  }
}

/**
 * Heurística pra extrair título curto a partir da primeira mensagem do user.
 * Remove fillers ("preciso de", "me ajuda com", "tô estudando pra"...) e
 * fica com os 4-6 termos mais informativos. Pensado pra português BR coloquial.
 *
 * Exemplos:
 *  "preciso estudar pra prova de anatomia respiratório amanhã, o que vc me indica"
 *    → "Anatomia respiratório"
 *  "explica o ciclo de krebs"
 *    → "Ciclo de Krebs"
 *  "como funciona a fotossíntese?"
 *    → "Fotossíntese"
 */
export function extractChatTitle(rawMessage: string): string {
  let s = rawMessage.trim().replace(/\s+/g, " ");
  if (!s) return "Nova conversa";

  // Remove pontuação no fim
  s = s.replace(/[?!.,;:\-—]+$/g, "").trim();

  // Patterns de "filler" no começo — case insensitive
  const FILLER_PREFIXES: RegExp[] = [
    /^(oi|olá|oie|eai|ei|alô|bom dia|boa tarde|boa noite)[,!.\s]+/i,
    /^(por favor|pfv|please)[,\s]+/i,
    /^(eu )?(preciso|queria|quero|gostaria|gostava)( de| que)?( saber| entender)?( sobre)?\s+/i,
    /^(me )?(ajuda|ajude|ensina|ensine|explica|explique|explanar|fala|diz)( com| sobre| de| acerca de)?\s+/i,
    /^(estou|tô|to|tava|estava)\s+(estudando|tentando entender|com dúvida em|com dificuldade em|aprendendo)\s+(sobre|de|com|em|pra|para|na|no|a)?\s*/i,
    /^(tenho|tem)\s+(prova|teste|exame|trabalho|seminário|seminario)\s+(de|sobre|em)\s+/i,
    /^(amanhã|hoje|semana que vem|próxima semana|na próxima)\s+/i,
    /^(o que (é|sao|são|significa|quer dizer))\s+/i,
    /^(qual (é|seria|foi|a))\s+/i,
    /^(como (é|funciona|que funciona|se faz|fazer))\s+/i,
    /^(quais (são|sao|seriam))\s+/i,
    /^(por que|porque|pq)\s+/i,
    /^(quando|onde|quem)\s+/i,
    /^(pode (me )?(explicar|falar|dizer|ajudar|fazer))\s+/i,
  ];

  // Aplica até 3 vezes (cada filler pode revelar outro embaixo)
  for (let i = 0; i < 3; i++) {
    let changed = false;
    for (const re of FILLER_PREFIXES) {
      if (re.test(s)) {
        s = s.replace(re, "").trim();
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }

  // Remove conectivos "de/do/da" no começo se sobraram soltos
  s = s.replace(/^(de|do|da|dos|das|sobre|acerca de|com|em|na|no|a|o)\s+/i, "");

  // Corta no primeiro pontuador forte (vírgula, ponto-final, dois-pontos)
  const cutAt = s.search(/[,;.:]/);
  if (cutAt > 0) s = s.slice(0, cutAt);

  // Remove sufixos temporais comuns
  s = s.replace(
    /\s+(amanhã|hoje|agora|de manhã|à tarde|à noite|essa semana|esta semana|próxima semana)\s*$/i,
    "",
  );

  // Fica com no máximo 6 palavras
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 6) s = words.slice(0, 6).join(" ");

  s = s.trim();
  if (!s) return rawMessage.trim().slice(0, 40) || "Nova conversa";

  // Capitaliza primeira letra
  s = s.charAt(0).toUpperCase() + s.slice(1);

  // Limite final de 50 chars
  if (s.length > 50) s = s.slice(0, 47).trim() + "...";

  return s;
}

function nowISO(): string {
  return new Date().toISOString();
}

export function listChats(
  userId: string,
  opts?: { includeDeleted?: boolean },
): LumiChat[] {
  const all = safeRead(userId);
  const filtered = opts?.includeDeleted ? all : all.filter((c) => !c.deletedAt);
  return [...filtered].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function listTrash(userId: string): LumiChat[] {
  return safeRead(userId)
    .filter((c) => !!c.deletedAt)
    .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
}

export function getChat(userId: string, id: string): LumiChat | null {
  const all = safeRead(userId);
  return all.find((c) => c.id === id) ?? null;
}

export function createChat(
  userId: string,
  init: {
    title?: string;
    subjectId?: string;
    subjectName?: string;
    category?: LumiChatCategory;
    firstMessage?: { role: "user" | "assistant"; content: string };
  } = {},
): LumiChat {
  const all = safeRead(userId);
  const ts = nowISO();
  const chat: LumiChat = {
    id: newId(),
    title: init.title?.trim() || "Nova conversa",
    subjectId: init.subjectId,
    subjectName: init.subjectName,
    category: init.category ?? "chat",
    messages: init.firstMessage
      ? [
          {
            id: newId(),
            role: init.firstMessage.role,
            content: init.firstMessage.content,
            createdAt: ts,
          },
        ]
      : [],
    pinned: false,
    starred: false,
    createdAt: ts,
    updatedAt: ts,
  };
  safeWrite(userId, [chat, ...all]);
  pushToServer(chat);
  return chat;
}

export function appendMessage(
  userId: string,
  chatId: string,
  message: Omit<LumiChatMessage, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  },
): LumiChat | null {
  const all = safeRead(userId);
  const idx = all.findIndex((c) => c.id === chatId);
  if (idx < 0) return null;
  const ts = nowISO();
  const msg: LumiChatMessage = {
    id: message.id ?? newId(),
    role: message.role,
    content: message.content,
    createdAt: message.createdAt ?? ts,
    attachment: message.attachment,
  };
  const updated: LumiChat = {
    ...all[idx],
    messages: [...all[idx].messages, msg],
    updatedAt: ts,
  };
  if (
    updated.title === "Nova conversa" &&
    msg.role === "user" &&
    msg.content.trim().length > 0
  ) {
    updated.title = extractChatTitle(msg.content);
  }
  all[idx] = updated;
  safeWrite(userId, all);
  pushToServer(updated);
  return updated;
}

export function togglePin(userId: string, chatId: string): LumiChat | null {
  const all = safeRead(userId);
  const idx = all.findIndex((c) => c.id === chatId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], pinned: !all[idx].pinned, updatedAt: nowISO() };
  safeWrite(userId, all);
  pushToServer(all[idx]);
  return all[idx];
}

export function toggleStar(userId: string, chatId: string): LumiChat | null {
  const all = safeRead(userId);
  const idx = all.findIndex((c) => c.id === chatId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], starred: !all[idx].starred, updatedAt: nowISO() };
  safeWrite(userId, all);
  pushToServer(all[idx]);
  return all[idx];
}

export function renameChat(
  userId: string,
  chatId: string,
  title: string,
): LumiChat | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  const all = safeRead(userId);
  const idx = all.findIndex((c) => c.id === chatId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], title: trimmed, updatedAt: nowISO() };
  safeWrite(userId, all);
  pushToServer(all[idx]);
  return all[idx];
}

export function moveToSubject(
  userId: string,
  chatId: string,
  subject: { id?: string; name?: string },
): LumiChat | null {
  const all = safeRead(userId);
  const idx = all.findIndex((c) => c.id === chatId);
  if (idx < 0) return null;
  all[idx] = {
    ...all[idx],
    subjectId: subject.id,
    subjectName: subject.name,
    updatedAt: nowISO(),
  };
  safeWrite(userId, all);
  pushToServer(all[idx]);
  return all[idx];
}

export function deleteChat(userId: string, chatId: string): LumiChat | null {
  const all = safeRead(userId);
  const idx = all.findIndex((c) => c.id === chatId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], deletedAt: nowISO(), pinned: false };
  safeWrite(userId, all);
  pushToServer(all[idx]);
  return all[idx];
}

export function restoreChat(userId: string, chatId: string): LumiChat | null {
  const all = safeRead(userId);
  const idx = all.findIndex((c) => c.id === chatId);
  if (idx < 0) return null;
  const next = { ...all[idx] };
  delete next.deletedAt;
  next.updatedAt = nowISO();
  all[idx] = next;
  safeWrite(userId, all);
  pushToServer(all[idx]);
  return all[idx];
}

export function purgeChat(userId: string, chatId: string): boolean {
  const all = safeRead(userId);
  const next = all.filter((c) => c.id !== chatId);
  if (next.length === all.length) return false;
  safeWrite(userId, next);
  purgeOnServer(chatId);
  return true;
}

export function subscribeChats(
  userId: string,
  cb: () => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ userId?: string }>).detail;
    if (!detail || !detail.userId || detail.userId === userId) cb();
  };
  const storageHandler = (e: StorageEvent) => {
    if (e.key === storageKey(userId)) cb();
  };
  window.addEventListener("lumio.lumi.chats.changed", handler as EventListener);
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(
      "lumio.lumi.chats.changed",
      handler as EventListener,
    );
    window.removeEventListener("storage", storageHandler);
  };
}

export function countBySubject(chats: LumiChat[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of chats) {
    const key = c.subjectName ?? "Outras";
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

export function startOfWeek(d: Date): Date {
  const out = new Date(d);
  const day = out.getDay();
  const diff = (day + 6) % 7;
  out.setDate(out.getDate() - diff);
  out.setHours(0, 0, 0, 0);
  return out;
}
