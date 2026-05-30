/**
 * Helpers de segurança server-side compartilhados entre rotas API.
 * Inclui: magic-byte sniff, sanitização de erro, escape pra prompts LLM.
 */

export type MagicType = "pdf" | "png" | "jpeg" | "webp" | "gif" | null;

export function sniffMagic(buf: Buffer | Uint8Array): MagicType {
  if (buf.length < 12) return null;
  const b = buf;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf"; // %PDF
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return "webp";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "gif";
  return null;
}

export function logAndSanitize(
  context: string,
  err: unknown,
): { error: string; reqId: string } {
  const reqId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  console.error(`[${context}]`, reqId, err);
  return {
    error: "Falha temporária. Tente novamente em alguns instantes.",
    reqId,
  };
}

/**
 * Escapa marcadores XMLish pra evitar quebra do delimitador no prompt
 * (prompt injection via fechamento prematuro da tag <untrusted_*>).
 */
export function escapeForPrompt(s: string): string {
  return s.replace(/</g, "‹").replace(/>/g, "›");
}

export const LIMITS = {
  // Sonnet 4.5 tem 200K tokens de context. 200K chars ≈ 50K tokens, cabe.
  // Necessário pra aceitar transcrições longas (aulas de 1h30+).
  TRANSCRIPT_CHARS: 200_000,
  SLIDES_TOTAL_CHARS: 80_000,
  MESSAGE_CHARS: 4_000,
  MAX_MESSAGES: 30,
  /**
   * Cap geral de PDF (extração client-side via pdfjs). Custo servidor = 0,
   * só roda em browser. 50 MB cobre 95% de aulas/livros didáticos.
   */
  PDF_BYTES: 50 * 1024 * 1024,
  /**
   * Cap específico pra `/api/extract-slides` que sobe PDF inteiro pro server
   * (Vision Sonnet analisa imagens dos slides). Vercel Serverless Function
   * tem body limit default de ~4.5MB — acima disso retorna 413 "Request
   * Entity Too Large" antes do handler rodar. Mantemos 4MB pra ter margem
   * confortável. PDFs maiores caem no fallback client-side (extração só de
   * texto via pdfjs sem Vision).
   */
  PDF_VISION_BYTES: 4 * 1024 * 1024,
  IMAGE_BYTES: 10 * 1024 * 1024,
  PDF_MAX_PAGES_HINT: 300,
};

export const PDF_LIMIT_MB = LIMITS.PDF_BYTES / 1024 / 1024;
export const PDF_VISION_LIMIT_MB = LIMITS.PDF_VISION_BYTES / 1024 / 1024;

/**
 * Detecção heurística de "PDF bomb" (#11 security review).
 * Lê o /Count do dicionário /Pages — não é 100% confiável, mas barra os óbvios.
 */
export function looksLikePdfBomb(buf: Buffer): boolean {
  const head = buf.toString("latin1", 0, Math.min(buf.length, 200_000));
  const m = head.match(/\/Count\s+(\d+)/);
  if (!m) return false;
  const count = parseInt(m[1], 10);
  return Number.isFinite(count) && count > LIMITS.PDF_MAX_PAGES_HINT;
}
