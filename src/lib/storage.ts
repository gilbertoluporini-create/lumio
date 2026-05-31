"use client";

import type { ChatMessage, Lecture, Subject, User } from "./types";
import { generateId } from "./utils";

const STORAGE_KEYS = {
  user: "lumio:user",
  users: "lumio:users",
  subjects: (userId: string) => `lumio:subjects:${userId}`,
  lectures: (userId: string) => `lumio:lectures:${userId}`,
  theme: "lumio-theme",
} as const;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function remove(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

// ===== AUTH (client-side, localStorage) =====

type StoredUser = User & { passwordHash: string };

async function hashPassword(password: string, salt: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) return `${salt}:${password}`;
  const data = new TextEncoder().encode(`${salt}::${password}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function signUp(email: string, password: string, name: string): Promise<User> {
  const users = read<StoredUser[]>(STORAGE_KEYS.users, []);
  const normalized = email.trim().toLowerCase();
  if (users.find((u) => u.email === normalized)) {
    throw new Error("Já existe uma conta com esse email.");
  }
  const id = generateId();
  const passwordHash = await hashPassword(password, id);
  const user: StoredUser = {
    id,
    email: normalized,
    name: name.trim(),
    createdAt: new Date().toISOString(),
    onboardedAt: null,
    passwordHash,
  };
  users.push(user);
  write(STORAGE_KEYS.users, users);
  const { passwordHash: _, ...publicUser } = user;
  write(STORAGE_KEYS.user, publicUser);
  return publicUser;
}

export async function signIn(email: string, password: string): Promise<User> {
  const users = read<StoredUser[]>(STORAGE_KEYS.users, []);
  const normalized = email.trim().toLowerCase();
  const found = users.find((u) => u.email === normalized);
  if (!found) throw new Error("Email ou senha incorretos.");
  const passwordHash = await hashPassword(password, found.id);
  if (passwordHash !== found.passwordHash) {
    throw new Error("Email ou senha incorretos.");
  }
  const { passwordHash: _, ...publicUser } = found;
  write(STORAGE_KEYS.user, publicUser);
  return publicUser;
}

export function signOut() {
  remove(STORAGE_KEYS.user);
}

export function getCurrentUser(): User | null {
  return read<User | null>(STORAGE_KEYS.user, null);
}

export function updateCurrentUser(patch: Partial<User>): User | null {
  const current = getCurrentUser();
  if (!current) return null;
  const updated = { ...current, ...patch };
  write(STORAGE_KEYS.user, updated);
  const users = read<StoredUser[]>(STORAGE_KEYS.users, []);
  const idx = users.findIndex((u) => u.id === current.id);
  if (idx >= 0) {
    users[idx] = { ...users[idx], ...patch };
    write(STORAGE_KEYS.users, users);
  }
  return updated;
}

// ===== SUBJECTS =====

export function listSubjects(userId: string): Subject[] {
  return read<Subject[]>(STORAGE_KEYS.subjects(userId), []);
}

export function createSubject(userId: string, data: Omit<Subject, "id" | "userId" | "createdAt">): Subject {
  const subjects = listSubjects(userId);
  const subject: Subject = {
    id: generateId(),
    userId,
    createdAt: new Date().toISOString(),
    ...data,
  };
  subjects.push(subject);
  write(STORAGE_KEYS.subjects(userId), subjects);
  return subject;
}

export function bulkCreateSubjects(
  userId: string,
  list: Array<Omit<Subject, "id" | "userId" | "createdAt">>,
): Subject[] {
  const existing = listSubjects(userId);
  const created: Subject[] = list.map((data) => ({
    id: generateId(),
    userId,
    createdAt: new Date().toISOString(),
    ...data,
  }));
  write(STORAGE_KEYS.subjects(userId), [...existing, ...created]);
  return created;
}

export function getSubject(userId: string, id: string): Subject | null {
  return listSubjects(userId).find((s) => s.id === id) ?? null;
}

export function deleteSubject(userId: string, id: string) {
  const subjects = listSubjects(userId).filter((s) => s.id !== id);
  write(STORAGE_KEYS.subjects(userId), subjects);
  const lectures = listLectures(userId).filter((l) => l.subjectId !== id);
  write(STORAGE_KEYS.lectures(userId), lectures);
}

// ===== LECTURES =====

export function listLectures(userId: string, subjectId?: string): Lecture[] {
  const all = read<Lecture[]>(STORAGE_KEYS.lectures(userId), []);
  const filtered = subjectId ? all.filter((l) => l.subjectId === subjectId) : all;
  return filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function createLecture(
  userId: string,
  data: Omit<Lecture, "id" | "userId" | "createdAt" | "updatedAt" | "messages" | "transcript" | "durationSec" | "status"> &
    Partial<Pick<Lecture, "transcript" | "durationSec" | "status" | "messages">>,
): Lecture {
  const lectures = read<Lecture[]>(STORAGE_KEYS.lectures(userId), []);
  const now = new Date().toISOString();
  const lecture: Lecture = {
    id: generateId(),
    userId,
    createdAt: now,
    updatedAt: now,
    transcript: "",
    durationSec: 0,
    status: "draft",
    messages: [],
    ...data,
  };
  lectures.push(lecture);
  write(STORAGE_KEYS.lectures(userId), lectures);
  return lecture;
}

export function getLecture(userId: string, id: string): Lecture | null {
  const lectures = read<Lecture[]>(STORAGE_KEYS.lectures(userId), []);
  return lectures.find((l) => l.id === id) ?? null;
}

export function updateLecture(userId: string, id: string, patch: Partial<Lecture>): Lecture | null {
  const lectures = read<Lecture[]>(STORAGE_KEYS.lectures(userId), []);
  const idx = lectures.findIndex((l) => l.id === id);
  if (idx < 0) return null;
  lectures[idx] = { ...lectures[idx], ...patch, updatedAt: new Date().toISOString() };
  write(STORAGE_KEYS.lectures(userId), lectures);
  return lectures[idx];
}

export function appendMessage(userId: string, lectureId: string, message: ChatMessage): Lecture | null {
  const lecture = getLecture(userId, lectureId);
  if (!lecture) return null;
  return updateLecture(userId, lectureId, {
    messages: [...lecture.messages, message],
  });
}

export function deleteLecture(userId: string, id: string) {
  const lectures = read<Lecture[]>(STORAGE_KEYS.lectures(userId), []).filter((l) => l.id !== id);
  write(STORAGE_KEYS.lectures(userId), lectures);
}

// ===== THEME =====

export type Theme = "light" | "dark" | "system";

export function getStoredTheme(): Theme {
  return read<Theme>(STORAGE_KEYS.theme, "light");
}

export function setStoredTheme(theme: Theme) {
  write(STORAGE_KEYS.theme, theme);
}
