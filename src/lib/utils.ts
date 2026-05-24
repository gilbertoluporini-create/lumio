import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(date: Date | string | number): string {
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "agora mesmo";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days} d`;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function generateId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Limpa marcação visual indesejada das respostas do Lumi no chat.
 *
 * O system prompt já proíbe `#`, `---`, ``` ``` etc — isso aqui é defesa em
 * profundidade pro caso do modelo escapar: tira headings markdown, separadores
 * horizontais e cercas de bloco de código, mantendo **bold** e listas.
 */
export function stripChatFormatting(text: string): string {
  if (!text) return "";
  let out = text;
  // Headings: linhas começando com # ## ### ...
  out = out.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  // Separadores horizontais
  out = out.replace(/^\s*(?:---|===|___)\s*$/gm, "");
  // Cercas de código (mas mantém o conteúdo entre elas)
  out = out.replace(/^\s*```[\w-]*\s*$/gm, "");
  // Wikilinks [[X]] → bold
  out = out.replace(/\[\[([^\]]+)\]\]/g, "**$1**");
  // Múltiplas blank lines viram 1 só
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}
