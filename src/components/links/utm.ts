/**
 * Helpers de UTM pra página /links (linktree próprio).
 *
 * O canal entra via query string (`?c=instagram`) e a gente fan-out o utm_*
 * pra TODOS os links internos. Defaults: utm_source=direct, utm_medium=bio,
 * utm_campaign=links_page.
 *
 * Mantemos compartilhado entre o page.tsx (server) e o card list (client) pra
 * garantir mesmo comportamento.
 */

export const ALLOWED_CHANNELS = [
  "instagram",
  "tiktok",
  "linkedin",
  "twitter",
  "youtube",
  "email",
] as const;

export type LinksChannel = (typeof ALLOWED_CHANNELS)[number] | "direct";

/** Normaliza o param `?c=` pra um canal conhecido. Default: "direct". */
export function resolveChannel(raw: string | string[] | undefined): LinksChannel {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return "direct";
  const lower = v.toLowerCase().trim();
  return (ALLOWED_CHANNELS as readonly string[]).includes(lower)
    ? (lower as LinksChannel)
    : "direct";
}

/**
 * Anexa utm_source/medium/campaign a URLs internas (path relativo OU absoluto
 * mesmo origin). Para mailto: ou hash puros, retorna sem alterar.
 *
 * Preserva query existente (ex: `/signup?ref=bio` => `/signup?ref=bio&utm_*`).
 */
export function appendUtm(url: string, channel: LinksChannel): string {
  if (!url) return url;
  if (url.startsWith("mailto:") || url.startsWith("tel:") || url.startsWith("#")) {
    return url;
  }
  const utm = `utm_source=${encodeURIComponent(channel)}&utm_medium=bio&utm_campaign=links_page`;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${utm}`;
}
