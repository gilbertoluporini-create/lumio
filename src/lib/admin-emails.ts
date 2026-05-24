/**
 * Lista de emails admin — arquivo client-safe (sem imports de server).
 *
 * `src/lib/admin.ts` re-exporta esses símbolos e adiciona as funções
 * server-only (requireAdmin, logAdminAction).
 */

const ADMIN_EMAILS = ["gilbertoluporini@gmail.com"];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

export { ADMIN_EMAILS };
