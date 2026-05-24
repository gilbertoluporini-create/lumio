/**
 * Domínio compartilhado de cookies em produção.
 *
 * Em prod (lumioapp.net): retorna ".lumioapp.net" pra que a sessão Supabase
 * funcione tanto em www.lumioapp.net quanto em admin.lumioapp.net.
 * Em dev/preview: retorna undefined (cookie host-only, comportamento default).
 */
export function getSharedCookieDomain(host?: string): string | undefined {
  const h = (host ?? "").toLowerCase();
  if (h.endsWith("lumioapp.net")) return ".lumioapp.net";
  return undefined;
}
