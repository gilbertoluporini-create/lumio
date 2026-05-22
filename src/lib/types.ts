export type User = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  onboardedAt: string | null;
};

export type Subject = {
  id: string;
  userId: string;
  name: string;
  emoji: string;
  color: string;
  createdAt: string;
};

export type Lecture = {
  id: string;
  userId: string;
  subjectId: string;
  title: string;
  transcript: string;
  durationSec: number;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "live" | "completed";
  messages: ChatMessage[];
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
  "📚", "🧠", "🧬", "⚗️", "🧮", "📐", "🔬", "💻",
  "🌍", "📖", "🎨", "⚖️", "🩺", "📊", "🪐", "🧪",
];
