/**
 * Sugere um título curto e legível a partir do nome de um arquivo PDF.
 *
 * Heurísticas:
 *  - Remove extensão .pdf
 *  - Normaliza separadores ("_", "-") em espaço
 *  - Remove sufixos parentéticos comuns ("(1)", "(2)") e " - cópia"
 *  - Colapsa espaços múltiplos
 *  - Limita a `maxChars` (default 60), cortando na última palavra inteira
 *    quando possível e adicionando "…" se houve corte
 *
 * O usuário sempre pode editar o título depois — esta função só dá um
 * ponto de partida visualmente saudável (cabe no card sem virar uma
 * mancha de texto enorme).
 */
export function suggestTitleFromFileName(
  fileName: string,
  maxChars = 60,
): string {
  let s = fileName
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s*\(\d+\)\s*$/i, "")
    .replace(/\s*-\s*c[óo]pia\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > maxChars) {
    const cut = s.slice(0, maxChars);
    const lastSpace = cut.lastIndexOf(" ");
    s = (lastSpace > 30 ? cut.slice(0, lastSpace) : cut).trim() + "…";
  }
  return s;
}
