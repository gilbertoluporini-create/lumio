import {
  Activity,
  Atom,
  Beaker,
  BarChart3,
  Bone,
  BookOpen,
  Brain,
  Briefcase,
  Calculator,
  Camera,
  Code,
  Compass,
  Dna,
  Dumbbell,
  Eye,
  Film,
  FlaskConical,
  Gavel,
  Globe,
  HeartPulse,
  Landmark,
  Languages,
  Leaf,
  Library,
  Lightbulb,
  MapPin,
  Microscope,
  Music,
  Palette,
  Pencil,
  PieChart,
  Pill,
  Scale,
  ScrollText,
  Sigma,
  Stethoscope,
  Syringe,
  Telescope,
  Users,
  Wind,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Ícone temático por matéria — busca um Lucide icon que combine com o nome
 * (medicina, direito, engenharia, exatas, humanas, etc). Fallback: BookOpen.
 *
 * Antes era duplicado em dashboard/, gravacoes/, resumos/, flashcards/,
 * quiz/, schedule/ — agora centralizado aqui.
 */
export function getSubjectIcon(name: string): LucideIcon {
  const n = name.toLowerCase();

  // Medicina — sistemas e clínica
  if (/cardio|cora[cç][aã]o|cardiovasc|circulat|hemato|vascul/.test(n)) return HeartPulse;
  if (/respirat|pulm[aã]o|pulmonar|pneumo/.test(n)) return Wind;
  if (/endo|horm[oô]n|metabol|diabet/.test(n)) return Pill;
  if (/farmaco|medicament|terap[eê]utic|vacin/.test(n)) return Syringe;
  if (/anatomia|sistema\s+nerv|c[eé]rebro|neuro|psiqui|psicolog/.test(n)) return Brain;
  if (/habilidad|cl[ií]nic|semiolog|propedeu/.test(n)) return Stethoscope;
  if (/aten[cç][aã]o\s*prim|aps|sa[uú]de\s+coletiva|sa[uú]de\s+p[uú]blica|epidemio/.test(n)) return Activity;
  if (/pesquisa|inova[cç][aã]o|metodol|tcc|tese|monografia/.test(n)) return Microscope;
  if (/reuni[aã]o|integ|tutor|grupo|tbl|pbl/.test(n)) return Users;

  // Biologia / ciências naturais
  if (/gen[eé]tic|dna|cromoss/.test(n)) return Dna;
  if (/bioqu[ií]m|qu[ií]mic/.test(n)) return FlaskConical;
  if (/f[ií]sic|mec[aâ]nic\s+(quant|cl[aá]ss)/.test(n)) return Atom;
  if (/biolog|bases\s+biol|histol|embriol|ecolog|botan|zoolog/.test(n)) return Leaf;

  // Matemática / estatística
  if (/c[aá]lculo|c[áa]lculo|matem[aá]tic|alg[eé]bra|geometria/.test(n)) return Calculator;
  if (/estat[ií]stic|probabilidad/.test(n)) return Sigma;

  // Direito
  if (/direito|civil|penal|constituci|tribut|processual|trabalh.*direito|oab/.test(n)) return Gavel;
  if (/[eé]tica|cidadan|deont/.test(n)) return Scale;

  // Humanas
  if (/filosof|sociol|antropol|hist[oó]ri|geogr/.test(n)) return Landmark;
  if (/literat|portugu[eê]s\b|reda[cç][aã]o/.test(n)) return Library;

  // Línguas
  if (/ingl[eê]s|espanhol|franc[eê]s|alem[aã]o|l[ií]ngua|idioma/.test(n)) return Languages;

  // Computação / tecnologia
  if (/program|software|c[oó]digo|algoritmo|estrutur.*dados|engenharia\s+de\s+softw/.test(n)) return Code;
  if (/redes|sistema.*operac|computa[cç][aã]o|inform[aá]tic|dados|ia\b|machine\s+learning/.test(n)) return Code;

  // Engenharia (geral, depois das específicas)
  if (/engenharia|el[eé]tric|eletr[oô]nic|mec[aâ]nic|civil|materiais|projeto/.test(n)) return Wrench;

  // Administração / negócios / economia
  if (/admin|gest[aã]o|empreend|neg[oó]cio|marketing|contab|empres/.test(n)) return Briefcase;
  if (/economi|finan[cç]/.test(n)) return Landmark;

  // Geografia / ambiente
  if (/geografia|ambient|sustent/.test(n)) return Globe;

  // Artes
  if (/m[uú]sic|sonor/.test(n)) return Music;
  if (/arte|design|artes\s+visuais|desenho/.test(n)) return Palette;

  // Educação física
  if (/educa[cç][aã]o\s+f[ií]sic|esporte|treinament|fitness/.test(n)) return Dumbbell;

  // Inovação / ideias soltas
  if (/inova[cç][aã]o|criativ/.test(n)) return Lightbulb;

  return BookOpen;
}

export const SUBJECT_ICON_REGISTRY: Record<string, LucideIcon> = {
  BookOpen,
  Brain,
  Beaker,
  FlaskConical,
  Microscope,
  Calculator,
  Atom,
  Dna,
  HeartPulse,
  Stethoscope,
  Activity,
  Bone,
  Eye,
  Pill,
  Syringe,
  ScrollText,
  Languages,
  Globe,
  Code,
  BarChart3,
  PieChart,
  Compass,
  MapPin,
  Telescope,
  Pencil,
  Music,
  Palette,
  Camera,
  Film,
  Gavel,
  Scale,
  Landmark,
  Library,
  Leaf,
  Briefcase,
  Wind,
  Wrench,
  Sigma,
  Lightbulb,
  Dumbbell,
  Users,
};

export type SubjectIconEntry = {
  name: string;
  icon: LucideIcon;
  keywords: string;
};

export const SUBJECT_ICON_LIST: SubjectIconEntry[] = [
  { name: "BookOpen", icon: BookOpen, keywords: "livro estudo geral default" },
  { name: "Brain", icon: Brain, keywords: "cerebro neuro psicologia anatomia" },
  { name: "Beaker", icon: Beaker, keywords: "laboratorio quimica experimento" },
  { name: "FlaskConical", icon: FlaskConical, keywords: "quimica bioquimica laboratorio" },
  { name: "Microscope", icon: Microscope, keywords: "pesquisa biologia histologia" },
  { name: "Calculator", icon: Calculator, keywords: "matematica calculo algebra" },
  { name: "Atom", icon: Atom, keywords: "fisica atomo molecula" },
  { name: "Dna", icon: Dna, keywords: "genetica biologia molecular dna" },
  { name: "HeartPulse", icon: HeartPulse, keywords: "cardiologia coracao cardio" },
  { name: "Stethoscope", icon: Stethoscope, keywords: "clinica semiologia medicina" },
  { name: "Activity", icon: Activity, keywords: "saude epidemio coletiva" },
  { name: "Bone", icon: Bone, keywords: "ortopedia osso musculoesqueletico" },
  { name: "Eye", icon: Eye, keywords: "oftalmologia visao olho" },
  { name: "Pill", icon: Pill, keywords: "farmacologia medicamento endo" },
  { name: "Syringe", icon: Syringe, keywords: "vacina injecao farmaco" },
  { name: "ScrollText", icon: ScrollText, keywords: "literatura redacao texto" },
  { name: "Languages", icon: Languages, keywords: "idioma ingles portugues lingua" },
  { name: "Globe", icon: Globe, keywords: "geografia mundo ambiente" },
  { name: "Code", icon: Code, keywords: "programacao software algoritmo" },
  { name: "BarChart3", icon: BarChart3, keywords: "estatistica grafico dados" },
  { name: "PieChart", icon: PieChart, keywords: "estatistica dados analise" },
  { name: "Compass", icon: Compass, keywords: "geografia exploracao orientacao" },
  { name: "MapPin", icon: MapPin, keywords: "geografia local mapa" },
  { name: "Telescope", icon: Telescope, keywords: "astronomia espaco pesquisa" },
  { name: "Pencil", icon: Pencil, keywords: "redacao escrita desenho" },
  { name: "Music", icon: Music, keywords: "musica sonoro artes" },
  { name: "Palette", icon: Palette, keywords: "arte design desenho" },
  { name: "Camera", icon: Camera, keywords: "fotografia visual midia" },
  { name: "Film", icon: Film, keywords: "cinema audiovisual midia" },
  { name: "Gavel", icon: Gavel, keywords: "direito juridico oab" },
  { name: "Scale", icon: Scale, keywords: "etica direito balanca" },
  { name: "Landmark", icon: Landmark, keywords: "historia filosofia economia" },
  { name: "Library", icon: Library, keywords: "literatura biblioteca livros" },
  { name: "Leaf", icon: Leaf, keywords: "biologia botanica ecologia" },
  { name: "Briefcase", icon: Briefcase, keywords: "administracao negocios gestao" },
  { name: "Wind", icon: Wind, keywords: "respiratorio pulmao pneumo" },
  { name: "Wrench", icon: Wrench, keywords: "engenharia mecanica projeto" },
  { name: "Sigma", icon: Sigma, keywords: "estatistica probabilidade somatorio" },
  { name: "Lightbulb", icon: Lightbulb, keywords: "ideia inovacao criatividade" },
  { name: "Dumbbell", icon: Dumbbell, keywords: "educacao fisica esporte treino" },
  { name: "Users", icon: Users, keywords: "grupo tbl pbl tutoria" },
];

/**
 * Resolve um Lucide icon a partir do nome persistido (`subject.icon`).
 * Fallback: infere via `getSubjectIcon(name)` (heurística por keywords no nome).
 */
export function resolveSubjectIcon(
  iconName: string | null | undefined,
  subjectName: string,
): LucideIcon {
  if (iconName && SUBJECT_ICON_REGISTRY[iconName]) {
    return SUBJECT_ICON_REGISTRY[iconName];
  }
  return getSubjectIcon(subjectName);
}

/**
 * Inverso de `resolveSubjectIcon`: dado um componente Lucide, retorna o nome
 * canônico pra persistir. Retorna `null` se não estiver no registry.
 */
export function getSubjectIconName(name: string): string {
  const Icon = getSubjectIcon(name);
  const entry = Object.entries(SUBJECT_ICON_REGISTRY).find(
    ([, comp]) => comp === Icon,
  );
  return entry?.[0] ?? "BookOpen";
}
