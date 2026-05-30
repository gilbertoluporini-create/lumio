export type User = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  onboardedAt: string | null;
  /** Marcado pelo admin. Libera a aba/página de Embaixadores. */
  isAmbassador?: boolean;
};

export type ScheduleSlot = {
  dayOfWeek: number; // 0=domingo, 1=segunda, ..., 6=sábado
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  room?: string;
};

export type Subject = {
  id: string;
  userId: string;
  name: string;
  emoji: string;
  color: string;
  icon?: string;
  schedule?: ScheduleSlot[];
  createdAt: string;
};

export const DAY_LABELS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const DAY_LABELS_LONG = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

export type Slide = {
  pageNumber: number;
  title?: string;
  text: string;
  imageDataUrl?: string;
};

export type LectureSummarySection = {
  slideNumber?: number;
  slideTitle?: string;
  spokenContent: string;
  relatedQA: Array<{ question: string; answer: string }>;
};

export type LectureSummaryImage = {
  url: string;
  alt: string;
  caption?: string;
  // Índice da seção do resumo a que a imagem pertence (intercalação inline).
  // null/undefined = imagem sem seção → cai na galeria de fallback.
  sectionIndex?: number | null;
};

export type LectureSummary = {
  generatedAt: string;
  generalSummary: string;
  highlights: string[];
  sections: LectureSummarySection[];
  images?: LectureSummaryImage[];
};

export type DocumentSourceKind = "pdf" | "text" | "audio_external";

export type Document = {
  id: string;
  userId: string;
  subjectId: string;
  /** Pasta dentro da matéria. null/undefined = raiz da matéria. */
  folderId?: string;
  title: string;
  sourceKind: DocumentSourceKind;
  sourceUrl?: string;
  sourceText?: string;
  pageCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type Folder = {
  id: string;
  userId: string;
  subjectId: string;
  /** null = raiz da matéria. */
  parentFolderId?: string;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type SummarySource =
  | { kind: "lecture"; lectureId: string }
  | { kind: "document"; documentId: string };

export type Summary = {
  id: string;
  userId: string;
  subjectId: string;
  /** Pasta dentro da matéria. null/undefined = raiz. */
  folderId?: string;
  title: string;
  source: SummarySource;
  content: LectureSummary;
  images?: LectureSummaryImage[];
  createdAt: string;
  updatedAt: string;
};

export type TranscriptMarker = "concept" | "doubt" | "example";
export type TranscriptSpeaker = "professor" | "student" | "other";

export type TranscriptEntry = {
  id: string;
  startSec: number;
  endSec: number;
  speaker: TranscriptSpeaker;
  text: string;
  slideIndex?: number;
  marker?: TranscriptMarker;
  audioOffsetSec?: number;
};

export type TranscriptTopic = {
  id: string;
  title: string;
  startSec: number;
  color: "violet" | "emerald" | "amber" | "rose";
};

export type TranscriptInsights = {
  keyTerms: string[];
  topics: TranscriptTopic[];
  updatedAt: string;
};

/**
 * Resultado da revisão estrutural da transcrição com IA.
 * Cada chapter tem título descritivo (não "Parte 1") e parágrafos com
 * texto refinado (typos corrigidos, pontuação ajustada) preservando o
 * timestamp original do trecho onde começa.
 */
export type TranscriptChapterParagraph = {
  startSec: number;
  text: string;
};

export type TranscriptRevisedChapter = {
  id: string;
  title: string;
  startSec: number;
  endSec: number;
  /** 1-2 frases descrevendo o que essa parte aborda. */
  summary?: string;
  paragraphs: TranscriptChapterParagraph[];
};

export type TranscriptChapters = {
  chapters: TranscriptRevisedChapter[];
  generatedAt: string;
};

export type Lecture = {
  id: string;
  userId: string;
  subjectId: string;
  /** Pasta dentro da matéria. null/undefined = raiz. */
  folderId?: string;
  title: string;
  transcript: string;
  transcriptEntries?: TranscriptEntry[];
  transcriptInsights?: TranscriptInsights;
  transcriptChapters?: TranscriptChapters;
  /**
   * Resumo educativo em formato artigo (markdown puro) — gerado pelo
   * mesmo pipeline da aba Resumos do sidebar. Convive com `summary`
   * estruturado em /summaries (o resumo "por tópicos").
   */
  summaryEducational?: {
    markdown: string;
    generatedAt: string;
    images?: import("@/lib/types").LectureSummaryImage[];
  };
  durationSec: number;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "live" | "completed";
  messages: ChatMessage[];
  slides?: Slide[];
  slidesFileName?: string;
  slidesAddedAt?: string;
  correlation?: string;
  correlationUpdatedAt?: string;
  /** URL pública (ou signed) do áudio gravado em paralelo à transcrição. */
  audioUrl?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export const SUBJECT_PALETTE: { name: string; color: string }[] = [
  { name: "indigo", color: "from-indigo-500 to-violet-500" },
  { name: "rose", color: "from-rose-500 to-pink-500" },
  { name: "emerald", color: "from-emerald-500 to-teal-500" },
  { name: "amber", color: "from-amber-500 to-orange-500" },
  { name: "sky", color: "from-sky-500 to-cyan-500" },
  { name: "fuchsia", color: "from-fuchsia-500 to-purple-500" },
  { name: "lime", color: "from-lime-500 to-emerald-500" },
  { name: "slate", color: "from-slate-500 to-zinc-500" },
];

export const DEFAULT_EMOJIS = [
  "📚", "📖", "📝", "📒", "📓", "📔", "📕", "📗",
  "🧠", "🧬", "🫀", "🩺", "💊", "🧪", "⚗️", "🔬",
  "🧫", "🦠", "🩻", "🦴", "👁️", "🧮", "📐", "📏",
  "🔢", "🪐", "🌍", "🌌", "⚛️", "🧲", "🔭", "🧰",
  "💻", "⌨️", "🖥️", "📱", "🌐", "🤖", "📊", "📈",
  "⚖️", "📜", "🏛️", "🗣️", "🎨", "🎭", "🎵", "🎬",
  "🏥", "💼", "💰", "🌱", "🐍", "🦋", "🏃", "🔥",
];
