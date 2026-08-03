/**
 * speech-glossary — o "dataset" de voz do aluno.
 *
 * Portado do mecanismo do Capi (`capi-desktop/src/main/main.js`,
 * `buildSpeechHint`): cada aula transcrita vira corpus, e do corpus sai um
 * glossário pessoal que é injetado no motor de transcrição. Ancorar o jargão é
 * a diferença entre "sistema genito-urinário" e "sistema genital urinário" numa
 * aula de 2h.
 *
 * ⚠️ O que NÃO foi portado: o vocabulário-semente do Capi é de programação
 * ("commit", "branch", "Claude Code", "overlay"). Prompt de transcrição
 * ENVIESA a saída — despejar termo de código numa aula de medicina pioraria o
 * resultado em vez de melhorar. Aqui a semente é acadêmica e o resto vem do
 * aluno: as matérias que ele cadastrou e o que ele de fato ouve em aula.
 *
 * Dois consumidores, mesmo glossário:
 *  - Deepgram (streaming ao vivo): vira `keyterm` na querystring do WebSocket.
 *  - Whisper (fallback e áudio completo): vira o `prompt`, que age como se
 *    fosse a transcrição anterior.
 */

/** Termos que valem pra qualquer curso — só estrutura de aula, não conteúdo. */
const SEED_ACADEMICO = [
  "prova",
  "seminário",
  "trabalho",
  "artigo",
  "caso clínico",
  "diagnóstico",
  "anamnese",
  "fisiopatologia",
  "etiologia",
  "prognóstico",
  "protocolo",
];

/** Limites do Whisper (`prompt` ~224 tokens) e do bom senso no Deepgram. */
const MAX_PROMPT_CHARS = 780;
const MAX_KEYTERMS = 40;
/** Palavra curta demais vira ruído no prompt e não ancora nada. */
const MIN_TERMO_LEN = 4;
/** Aparecer 1x pode ser erro de transcrição; 2x já sugere que é termo real. */
const MIN_OCORRENCIAS = 2;
const MAX_APRENDIDOS = 25;

export type GlossarySources = {
  /** Nomes das matérias do semestre (a fonte mais confiável que temos). */
  subjectNames?: string[];
  /** Curso do aluno ("Medicina"), do perfil. */
  course?: string | null;
  /** Matérias que ele marcou como difíceis — costuma ser o que ele mais ouve. */
  difficultySubjects?: string[] | null;
  /**
   * Transcrições anteriores DELE. É o corpus: o equivalente ao
   * `speech-corpus.jsonl` do Capi, só que o "final" aqui é o texto que sobrou
   * depois da revisão, não o que ele editou à mão.
   */
  previousTranscripts?: string[];
};

/**
 * Palavras que aparecem em qualquer texto em português e não ancoram nada.
 * Sem isso o glossário aprendido enche de "então", "porque", "aquilo".
 */
const STOPWORDS = new Set([
  "para", "como", "mais", "mas", "porque", "então", "quando", "onde", "esse",
  "essa", "isso", "aquele", "aquela", "aquilo", "muito", "pouco", "todo",
  "toda", "todos", "todas", "cada", "outro", "outra", "também", "ainda",
  "depois", "antes", "sobre", "entre", "durante", "pelo", "pela", "isto",
  "aqui", "ali", "agora", "hoje", "gente", "coisa", "vamos", "vocês", "certo",
  "beleza", "tipo", "assim", "bastante", "primeiro", "segundo", "geralmente",
  "basicamente", "exatamente", "realmente", "importante", "seguinte",
]);

function normalizar(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/**
 * Extrai os termos recorrentes do corpus. Mesma ideia do Capi: contar palavra
 * nos textos finais e ficar com as mais frequentes que ainda não estão na
 * semente. Aqui roda sobre transcrições de aula, então o que sobe são os termos
 * da disciplina — que é exatamente o que o motor erra.
 */
function aprenderDoCorpus(textos: string[], jaTemos: Set<string>): string[] {
  const contagem = new Map<string, number>();
  for (const texto of textos) {
    // Só as últimas aulas importam: vocabulário de semestre passado polui.
    for (const bruta of texto.split(/[^\p{L}\p{N}-]+/u)) {
      const w = bruta.toLowerCase();
      if (w.length < MIN_TERMO_LEN) continue;
      if (/^\d+$/.test(w)) continue;
      if (STOPWORDS.has(w)) continue;
      if (jaTemos.has(w)) continue;
      contagem.set(w, (contagem.get(w) ?? 0) + 1);
    }
  }
  return [...contagem.entries()]
    .filter(([, n]) => n >= MIN_OCORRENCIAS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_APRENDIDOS)
    .map(([w]) => w);
}

/** Lista de termos, do mais confiável pro menos. Sem duplicata. */
export function buildGlossaryTerms(src: GlossarySources): string[] {
  const termos: string[] = [];
  const vistos = new Set<string>();
  const push = (t: string | null | undefined) => {
    const v = normalizar(String(t ?? ""));
    if (!v) return;
    const k = v.toLowerCase();
    if (vistos.has(k)) return;
    vistos.add(k);
    termos.push(v);
  };

  // 1) As matérias vêm primeiro: são o que o aluno digitou/importou, então é o
  //    único vocabulário que temos com certeza de estar escrito certo.
  (src.subjectNames ?? []).forEach(push);
  (src.difficultySubjects ?? []).forEach(push);
  push(src.course);
  SEED_ACADEMICO.forEach(push);

  // 2) O que o corpus ensinou.
  aprenderDoCorpus(src.previousTranscripts ?? [], vistos).forEach(push);

  return termos.slice(0, MAX_KEYTERMS);
}

/**
 * `prompt` do Whisper. Ele age como "transcrição anterior", então além dos
 * termos vale abrir com uma frase no formato esperado: isso prima o modelo a
 * pontuar como aula falada em vez de devolver um bloco sem pontuação.
 */
export function buildWhisperPrompt(src: GlossarySources): string {
  const termos = buildGlossaryTerms(src);
  if (termos.length === 0) return "";
  const curso = normalizar(src.course ?? "");
  const intro = curso
    ? `Aula de ${curso} em português do Brasil. O professor explica o conteúdo. Termos usados: `
    : "Aula de faculdade em português do Brasil. O professor explica o conteúdo. Termos usados: ";
  return (intro + termos.join(", ") + ".").slice(0, MAX_PROMPT_CHARS);
}

/**
 * Termos pro Deepgram. No streaming eles vão como `keyterm` repetido na
 * querystring; o modelo passa a favorecer essas grafias.
 */
export function buildDeepgramKeyterms(src: GlossarySources): string[] {
  return buildGlossaryTerms(src)
    // Deepgram trata cada keyterm como uma expressão; frase longa demais não
    // ajuda e ainda estoura o tamanho da URL do WebSocket.
    .filter((t) => t.length <= 40)
    .slice(0, MAX_KEYTERMS);
}
