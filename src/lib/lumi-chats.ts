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
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `lc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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
    updated.title = msg.content.trim().slice(0, 64);
  }
  all[idx] = updated;
  safeWrite(userId, all);
  return updated;
}

export function togglePin(userId: string, chatId: string): LumiChat | null {
  const all = safeRead(userId);
  const idx = all.findIndex((c) => c.id === chatId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], pinned: !all[idx].pinned, updatedAt: nowISO() };
  safeWrite(userId, all);
  return all[idx];
}

export function toggleStar(userId: string, chatId: string): LumiChat | null {
  const all = safeRead(userId);
  const idx = all.findIndex((c) => c.id === chatId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], starred: !all[idx].starred, updatedAt: nowISO() };
  safeWrite(userId, all);
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
  return all[idx];
}

export function deleteChat(userId: string, chatId: string): LumiChat | null {
  const all = safeRead(userId);
  const idx = all.findIndex((c) => c.id === chatId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], deletedAt: nowISO(), pinned: false };
  safeWrite(userId, all);
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
  return all[idx];
}

export function purgeChat(userId: string, chatId: string): boolean {
  const all = safeRead(userId);
  const next = all.filter((c) => c.id !== chatId);
  if (next.length === all.length) return false;
  safeWrite(userId, next);
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
