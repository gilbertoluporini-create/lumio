/**
 * User profile — perfil coletado no onboarding e usado como CONTEXTO pro
 * agente Lumi. Tudo é opcional (user pode pular qualquer pergunta).
 *
 * Vive na tabela `user_profiles` (migration 034).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type StudyGoal =
  | "pass_year"
  | "residency"
  | "public_exam"
  | "learn"
  | string; // permite livre

export type StudyStyle = "visual" | "textual" | "practical" | "mixed";

export type BestStudyTime =
  | "morning"
  | "afternoon"
  | "evening"
  | "late_night"
  | "flexible";

export type ExamDate = {
  subject: string;
  date: string; // ISO yyyy-mm-dd
  note?: string;
};

export type UserProfile = {
  userId: string;
  course?: string | null;
  semester?: string | null;
  graduationYear?: number | null;
  goal?: StudyGoal | null;
  difficultySubjects?: string[] | null;
  studyStyle?: StudyStyle | null;
  studyHoursPerDay?: number | null;
  bestStudyTime?: BestStudyTime | null;
  examDates?: ExamDate[] | null;
  freeNotes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

const PROFILE_COLS =
  "user_id, course, semester, graduation_year, goal, difficulty_subjects, study_style, study_hours_per_day, best_study_time, exam_dates, free_notes, created_at, updated_at";

type ProfileRow = {
  user_id: string;
  course: string | null;
  semester: string | null;
  graduation_year: number | null;
  goal: string | null;
  difficulty_subjects: string[] | null;
  study_style: string | null;
  study_hours_per_day: number | null;
  best_study_time: string | null;
  exam_dates: ExamDate[] | null;
  free_notes: string | null;
  created_at?: string;
  updated_at?: string;
};

function rowToProfile(r: ProfileRow): UserProfile {
  return {
    userId: r.user_id,
    course: r.course,
    semester: r.semester,
    graduationYear: r.graduation_year,
    goal: r.goal,
    difficultySubjects: r.difficulty_subjects,
    studyStyle: (r.study_style as StudyStyle | null) ?? null,
    studyHoursPerDay:
      r.study_hours_per_day == null ? null : Number(r.study_hours_per_day),
    bestStudyTime: (r.best_study_time as BestStudyTime | null) ?? null,
    examDates: r.exam_dates,
    freeNotes: r.free_notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getUserProfileAsync(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select(PROFILE_COLS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[user-profile] get failed", error);
    return null;
  }
  return data ? rowToProfile(data as ProfileRow) : null;
}

export async function upsertUserProfileAsync(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<Omit<UserProfile, "userId" | "createdAt" | "updatedAt">>,
): Promise<UserProfile | null> {
  const row: Partial<ProfileRow> = { user_id: userId };
  if ("course" in patch) row.course = patch.course ?? null;
  if ("semester" in patch) row.semester = patch.semester ?? null;
  if ("graduationYear" in patch)
    row.graduation_year = patch.graduationYear ?? null;
  if ("goal" in patch) row.goal = patch.goal ?? null;
  if ("difficultySubjects" in patch)
    row.difficulty_subjects = patch.difficultySubjects ?? null;
  if ("studyStyle" in patch) row.study_style = patch.studyStyle ?? null;
  if ("studyHoursPerDay" in patch)
    row.study_hours_per_day = patch.studyHoursPerDay ?? null;
  if ("bestStudyTime" in patch)
    row.best_study_time = patch.bestStudyTime ?? null;
  if ("examDates" in patch) row.exam_dates = patch.examDates ?? null;
  if ("freeNotes" in patch) row.free_notes = patch.freeNotes ?? null;
  const { data, error } = await supabase
    .from("user_profiles")
    .upsert(row, { onConflict: "user_id" })
    .select(PROFILE_COLS)
    .single();
  if (error || !data) {
    console.error("[user-profile] upsert failed", error);
    return null;
  }
  return rowToProfile(data as ProfileRow);
}

/**
 * Renderiza o perfil como string curta pra injetar no system prompt do Lumi.
 * Retorna null se o perfil está totalmente vazio.
 */
export function renderProfileForPrompt(
  profile: UserProfile | null,
): string | null {
  if (!profile) return null;
  const parts: string[] = [];
  if (profile.course) {
    const periodo = profile.semester ? `, ${profile.semester}` : "";
    const ano = profile.graduationYear
      ? `, formatura em ${profile.graduationYear}`
      : "";
    parts.push(`Cursa ${profile.course}${periodo}${ano}.`);
  }
  if (profile.goal) {
    const goalLabel: Record<string, string> = {
      pass_year: "passar de ano",
      residency: "residência",
      public_exam: "concurso público",
      learn: "aprender sem prova específica",
    };
    parts.push(
      `Objetivo principal: ${goalLabel[profile.goal] ?? profile.goal}.`,
    );
  }
  if (profile.difficultySubjects && profile.difficultySubjects.length > 0) {
    parts.push(
      `Tem mais dificuldade em: ${profile.difficultySubjects.join(", ")}.`,
    );
  }
  if (profile.studyStyle) {
    const styleLabel: Record<string, string> = {
      visual: "visual (mapas, imagens, infográficos)",
      textual: "textual (resumos escritos)",
      practical: "prática (quiz, flashcards, exercícios)",
      mixed: "mista (combinar visual + texto + prática)",
    };
    parts.push(
      `Estilo preferido: ${styleLabel[profile.studyStyle] ?? profile.studyStyle}.`,
    );
  }
  if (profile.studyHoursPerDay) {
    parts.push(`Estuda em média ${profile.studyHoursPerDay}h por dia.`);
  }
  if (profile.bestStudyTime) {
    const timeLabel: Record<string, string> = {
      morning: "manhã",
      afternoon: "tarde",
      evening: "noite",
      late_night: "madrugada",
      flexible: "flexível",
    };
    parts.push(
      `Melhor horário pra estudar: ${timeLabel[profile.bestStudyTime] ?? profile.bestStudyTime}.`,
    );
  }
  if (profile.examDates && profile.examDates.length > 0) {
    const upcoming = profile.examDates
      .filter((e) => e.date >= new Date().toISOString().slice(0, 10))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5)
      .map((e) => `${e.subject} (${e.date})`)
      .join(", ");
    if (upcoming) parts.push(`Próximas provas: ${upcoming}.`);
  }
  if (profile.freeNotes && profile.freeNotes.trim()) {
    parts.push(`Outros: ${profile.freeNotes.trim()}`);
  }
  if (parts.length === 0) return null;
  return parts.join(" ");
}
