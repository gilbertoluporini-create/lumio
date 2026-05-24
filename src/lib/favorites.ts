"use client";

/**
 * Favoritos — persistência client-side em localStorage.
 *
 * Suporta dois "tipos" de favoritos: aulas (lectures) e resumos
 * (lecture.summary). Cada favorito é uma chave composta `${kind}:${id}`,
 * onde id é o id da Lecture (resumos sempre pertencem a uma lecture).
 *
 * API toda síncrona — chamadores devem invocar dentro de `useEffect` ou
 * handler de evento. Se o dia tivermos uma tabela `favorites` no Supabase
 * podemos plugar aqui sem mexer nos componentes.
 */

export type FavoriteKind = "lecture" | "summary" | "subject";

export type FavoriteEntry = {
  kind: FavoriteKind;
  id: string;
  addedAt: string;
};

const STORAGE_PREFIX = "lumio:favorites:";

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function read(userId: string): FavoriteEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is FavoriteEntry =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as FavoriteEntry).id === "string" &&
        typeof (x as FavoriteEntry).kind === "string" &&
        ((x as FavoriteEntry).kind === "lecture" ||
          (x as FavoriteEntry).kind === "summary" ||
          (x as FavoriteEntry).kind === "subject") &&
        typeof (x as FavoriteEntry).addedAt === "string",
    );
  } catch {
    return [];
  }
}

function write(userId: string, entries: FavoriteEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(entries));
    // Notifica listeners (outras abas + mesmo doc)
    window.dispatchEvent(
      new CustomEvent("lumio:favorites-changed", { detail: { userId } }),
    );
  } catch {
    /* ignore quota errors */
  }
}

export function listFavorites(userId: string): FavoriteEntry[] {
  return read(userId);
}

export function isFavorite(
  userId: string,
  kind: FavoriteKind,
  id: string,
): boolean {
  return read(userId).some((f) => f.kind === kind && f.id === id);
}

export function addFavorite(
  userId: string,
  kind: FavoriteKind,
  id: string,
): void {
  const current = read(userId);
  if (current.some((f) => f.kind === kind && f.id === id)) return;
  current.push({ kind, id, addedAt: new Date().toISOString() });
  write(userId, current);
}

export function removeFavorite(
  userId: string,
  kind: FavoriteKind,
  id: string,
): void {
  const current = read(userId);
  const filtered = current.filter((f) => !(f.kind === kind && f.id === id));
  if (filtered.length === current.length) return;
  write(userId, filtered);
}

export function toggleFavorite(
  userId: string,
  kind: FavoriteKind,
  id: string,
): boolean {
  if (isFavorite(userId, kind, id)) {
    removeFavorite(userId, kind, id);
    return false;
  }
  addFavorite(userId, kind, id);
  return true;
}

/**
 * Hook helper — assina o evento `lumio:favorites-changed` e devolve o set
 * atual de favoritos do usuário. Como é client-only, sempre é seguro chamar.
 */
export function subscribeFavorites(
  userId: string,
  callback: (entries: FavoriteEntry[]) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = () => callback(read(userId));
  window.addEventListener("lumio:favorites-changed", handler);
  window.addEventListener("storage", handler);
  // Push initial snapshot
  callback(read(userId));
  return () => {
    window.removeEventListener("lumio:favorites-changed", handler);
    window.removeEventListener("storage", handler);
  };
}
