import type { Subject } from "@/lib/types";

/**
 * Tema de cor para um evento renderizável (aula, bloco, prova, etc).
 *
 * - `gradient`: classes Tailwind para o ícone (`bg-gradient-to-br <gradient>`).
 * - `dot`: bg sólido para a bolinha de status.
 * - `soft`: bg translúcido para chips/pills/eventos no calendário.
 * - `text`: cor de texto para labels e títulos sobre fundo soft.
 * - `border`: cor da borda lateral (used in week view event card).
 *
 * Todas as variantes derivam do MESMO matiz, garantindo que calendário,
 * sidebar e cards mostrem a mesma cor para a mesma matéria/tipo.
 */
export type SubjectTheme = {
  gradient: string;
  dot: string;
  soft: string;
  text: string;
  border: string;
};

const HUE_THEMES: Record<string, SubjectTheme> = {
  indigo: {
    gradient: "from-indigo-500 to-violet-500",
    dot: "bg-indigo-500",
    soft: "bg-indigo-500/10",
    text: "text-indigo-600 dark:text-indigo-400",
    border: "border-indigo-500",
  },
  violet: {
    gradient: "from-violet-500 to-purple-500",
    dot: "bg-violet-500",
    soft: "bg-violet-500/10",
    text: "text-violet-600 dark:text-violet-400",
    border: "border-violet-500",
  },
  rose: {
    gradient: "from-rose-500 to-pink-500",
    dot: "bg-rose-500",
    soft: "bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
    border: "border-rose-500",
  },
  pink: {
    gradient: "from-pink-500 to-fuchsia-500",
    dot: "bg-pink-500",
    soft: "bg-pink-500/10",
    text: "text-pink-600 dark:text-pink-400",
    border: "border-pink-500",
  },
  emerald: {
    gradient: "from-emerald-500 to-teal-500",
    dot: "bg-emerald-500",
    soft: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500",
  },
  teal: {
    gradient: "from-teal-500 to-cyan-500",
    dot: "bg-teal-500",
    soft: "bg-teal-500/10",
    text: "text-teal-600 dark:text-teal-400",
    border: "border-teal-500",
  },
  amber: {
    gradient: "from-amber-500 to-orange-500",
    dot: "bg-amber-500",
    soft: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500",
  },
  orange: {
    gradient: "from-orange-500 to-amber-500",
    dot: "bg-orange-500",
    soft: "bg-orange-500/10",
    text: "text-orange-600 dark:text-orange-400",
    border: "border-orange-500",
  },
  sky: {
    gradient: "from-sky-500 to-cyan-500",
    dot: "bg-sky-500",
    soft: "bg-sky-500/10",
    text: "text-sky-600 dark:text-sky-400",
    border: "border-sky-500",
  },
  cyan: {
    gradient: "from-cyan-500 to-sky-500",
    dot: "bg-cyan-500",
    soft: "bg-cyan-500/10",
    text: "text-cyan-600 dark:text-cyan-400",
    border: "border-cyan-500",
  },
  fuchsia: {
    gradient: "from-fuchsia-500 to-purple-500",
    dot: "bg-fuchsia-500",
    soft: "bg-fuchsia-500/10",
    text: "text-fuchsia-600 dark:text-fuchsia-400",
    border: "border-fuchsia-500",
  },
  purple: {
    gradient: "from-purple-500 to-fuchsia-500",
    dot: "bg-purple-500",
    soft: "bg-purple-500/10",
    text: "text-purple-600 dark:text-purple-400",
    border: "border-purple-500",
  },
  lime: {
    gradient: "from-lime-500 to-emerald-500",
    dot: "bg-lime-500",
    soft: "bg-lime-500/10",
    text: "text-lime-600 dark:text-lime-400",
    border: "border-lime-500",
  },
  red: {
    gradient: "from-red-500 to-rose-500",
    dot: "bg-red-500",
    soft: "bg-red-500/10",
    text: "text-red-600 dark:text-red-400",
    border: "border-red-500",
  },
  blue: {
    gradient: "from-blue-500 to-indigo-500",
    dot: "bg-blue-500",
    soft: "bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-blue-500",
  },
  slate: {
    gradient: "from-slate-500 to-zinc-500",
    dot: "bg-slate-500",
    soft: "bg-slate-500/10",
    text: "text-slate-600 dark:text-slate-400",
    border: "border-slate-500",
  },
};

const FALLBACK_THEME: SubjectTheme = HUE_THEMES.indigo;

const HUE_KEYS = Object.keys(HUE_THEMES);

/**
 * Extrai o matiz dominante de uma string Tailwind como
 * "from-indigo-500 to-violet-500" → "indigo".
 *
 * Procura o PRIMEIRO `from-<hue>-` que bata com algum tema conhecido.
 * Caso nada bata, retorna `null`.
 */
function hueFromGradient(gradient: string | null | undefined): string | null {
  if (!gradient) return null;
  const fromMatch = gradient.match(/from-([a-z]+)-\d+/);
  if (fromMatch && HUE_THEMES[fromMatch[1]]) return fromMatch[1];
  // Fallback: tenta qualquer hue conhecido aparecendo na string
  for (const hue of HUE_KEYS) {
    if (gradient.includes(`-${hue}-`)) return hue;
  }
  return null;
}

/**
 * Retorna o tema de cor coerente para uma matéria. Usado em:
 * - Calendário (grid mês e semana): eventos de aula
 * - Sidebar "Agenda próxima": dots, ícones e chips
 * - Cards "Próximas aulas / Provas / Trabalhos": ícone do evento
 *
 * Garante que TODAS as superfícies usem o MESMO matiz para a mesma matéria.
 */
export function getSubjectTheme(
  subject: Pick<Subject, "color"> | null | undefined,
): SubjectTheme {
  const hue = hueFromGradient(subject?.color);
  if (hue && HUE_THEMES[hue]) return HUE_THEMES[hue];
  return FALLBACK_THEME;
}

/**
 * Atalho para resolver o tema a partir de uma string gradient direta
 * (como `subjectColor` no `UEvent`).
 */
export function getThemeFromGradient(
  gradient: string | null | undefined,
): SubjectTheme | null {
  const hue = hueFromGradient(gradient);
  return hue ? HUE_THEMES[hue] : null;
}

const PALETTE_HUES: string[] = [
  "violet",
  "rose",
  "amber",
  "emerald",
  "sky",
  "indigo",
  "pink",
  "teal",
];

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/**
 * Deriva um tema de cor a partir do NOME da matéria via hash determinístico.
 * Usado quando a matéria ainda não tem `color` persistido (default no modal
 * "Nova matéria") ou pra preview ao vivo enquanto o user digita.
 */
export function getSubjectPalette(name: string): SubjectTheme {
  if (!name) return FALLBACK_THEME;
  const hue = PALETTE_HUES[hashString(name.toLowerCase()) % PALETTE_HUES.length];
  return HUE_THEMES[hue] ?? FALLBACK_THEME;
}

/**
 * Versão "string gradient" pra persistir em `subject.color`.
 */
export function getSubjectGradientFromName(name: string): string {
  return getSubjectPalette(name).gradient;
}
