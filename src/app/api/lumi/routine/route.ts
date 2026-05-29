/**
 * POST /api/lumi/routine
 *
 * Gera um PDF "padrão Lumio" de rotina de estudo semanal:
 *  1. Lê todas as matérias do user → calcula blocos livres por dia da semana
 *     (07:00–23:00 menos as aulas agendadas).
 *  2. Pede pra LLM montar um plano semanal JSON respeitando esses blocos,
 *     focado na matéria/tópico que o user enviou.
 *  3. Renderiza o PDF (pdf-lib) com branding Lumio.
 *  4. Sobe pro Storage `user-documents/{userId}/{docId}.pdf`.
 *  5. Cria Document na pasta da matéria (subject_id) com source_url + texto.
 *  6. Devolve { documentId, url, title, coinsCharged } pra Lumi entregar
 *     como card clicável no chat.
 *
 * Custo: COIN_COSTS.routine (12). Refunda em qualquer falha posterior ao
 * charge. Auth + rate limit + ownership de subject.
 */

import { createMessage } from "@/lib/llm-fallback";
import { LIMITS, escapeForPrompt, logAndSanitize } from "@/lib/api-security";
import { COIN_COSTS, chargeCoins, creditCoins } from "@/lib/coins";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import {
  computeFreeWeek,
  freeWeekToPromptLines,
  type FreeDay,
} from "@/lib/routine-schedule";
import {
  renderRoutinePdf,
  type RoutineBlock,
  type RoutineDay,
  type RoutineDoc,
} from "@/lib/routine-pdf";
import type { ScheduleSlot, Subject } from "@/lib/types";
import { DAY_LABELS_LONG } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = {
  subjectId?: string;
  /** Texto livre com conteúdo da prova / tópicos / aulas a estudar. */
  conteudo?: string;
  /** Nomes das aulas que vão cair (alternativa/complemento ao conteúdo). */
  nomesAulas?: string[];
  /** Data da prova, formato livre — só pro contexto no prompt. */
  dataProva?: string;
  /** Quantas horas/semana o user quer dedicar. Default: deixar Lumi escolher. */
  horasSemanais?: number;
  /** Título do PDF (default: "Rotina — {matéria}"). */
  titulo?: string;
};

type SubjectRow = {
  id: string;
  user_id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  icon: string | null;
  schedule: ScheduleSlot[] | null;
  created_at: string;
};

function subjectRowToSubject(r: SubjectRow): Subject {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    emoji: r.emoji ?? "",
    color: r.color ?? "",
    icon: r.icon ?? undefined,
    schedule: Array.isArray(r.schedule) ? r.schedule : [],
    createdAt: r.created_at,
  };
}

const SYSTEM_PROMPT = `Você gera ROTINAS DE ESTUDO SEMANAIS em JSON para estudantes universitários brasileiros.

Recebe:
- Matéria-alvo + conteúdo da prova / lista de tópicos / nomes de aulas
- Carga semanal alvo (horas)
- Mapa dos horários LIVRES por dia (já tirando as aulas agendadas)
- Opcional: data da prova

Sua tarefa: distribuir blocos de estudo APENAS DENTRO dos horários livres, focando nos tópicos.

REGRAS DURAS:
- APENAS JSON válido. Sem markdown wrappers. Sem comentários.
- Cada bloco tem startTime/endTime no formato "HH:MM" e DEVE estar contido em algum horário livre fornecido.
- Não invente horários que conflitem com aulas (você só recebe os livres).
- Blocos de 45–90 min. Inclua descanso curto entre blocos longos.
- Distribua a carga semanal de forma realista nos 7 dias (segunda costuma ser mais leve, fim de semana pode ter blocos maiores).
- Tópico (topic) curto e específico (3–8 palavras). Note (note) é opcional, 1 frase com técnica/foco.
- Se a carga semanal não couber nos blocos livres, encolhe (não invente blocos fora).
- Em português brasileiro, claro e direto. NÃO invente conteúdo que não veio no input.
- Inclua sempre um "summary": 1–2 frases dizendo qual é a estratégia da semana.

FORMATO:
{
  "summary": "<estratégia da semana em 1-2 frases>",
  "totalMinutesPerWeek": <int>,
  "weeklyPlan": [
    {
      "dayOfWeek": 0,
      "blocks": [
        { "startTime": "HH:MM", "endTime": "HH:MM", "topic": "<tópico>", "note": "<opcional>" }
      ]
    },
    ...  // 7 entradas, dom..sáb (0..6). Dias sem bloco podem ter blocks: [].
  ]
}`;

type ParsedPlan = {
  summary?: string;
  totalMinutesPerWeek?: number;
  weeklyPlan?: Array<{
    dayOfWeek?: number;
    blocks?: Array<{
      startTime?: string;
      endTime?: string;
      topic?: string;
      note?: string;
    }>;
  }>;
};

function tryParsePlan(text: string): ParsedPlan | null {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as ParsedPlan;
  } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]) as ParsedPlan;
    } catch {}
  }
  return null;
}

function isHHMM(s: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(s);
}

/** Filtra blocos que NÃO encostam num horário livre (defensa contra alucinação). */
function blocksWithinFree(
  blocks: NonNullable<ParsedPlan["weeklyPlan"]>[number]["blocks"],
  freeDay: FreeDay,
): RoutineBlock[] {
  if (!Array.isArray(blocks)) return [];
  const free = freeDay.freeBlocks.map((b) => {
    const [sh, sm] = b.startTime.split(":").map(Number);
    const [eh, em] = b.endTime.split(":").map(Number);
    return [sh * 60 + sm, eh * 60 + em] as [number, number];
  });
  const isInside = (start: number, end: number) =>
    free.some(([fs, fe]) => start >= fs && end <= fe);

  const out: RoutineBlock[] = [];
  for (const b of blocks) {
    if (!b || !b.startTime || !b.endTime) continue;
    if (!isHHMM(b.startTime) || !isHHMM(b.endTime)) continue;
    const [sh, sm] = b.startTime.split(":").map(Number);
    const [eh, em] = b.endTime.split(":").map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    if (end <= start) continue;
    if (!isInside(start, end)) continue;
    out.push({
      startTime: b.startTime,
      endTime: b.endTime,
      topic: String(b.topic ?? "Estudo").slice(0, 200),
      note: b.note ? String(b.note).slice(0, 240) : undefined,
    });
  }
  return out;
}

function planToDays(plan: ParsedPlan, week: FreeDay[]): RoutineDay[] {
  const byDay = new Map<number, NonNullable<ParsedPlan["weeklyPlan"]>[number]["blocks"]>();
  for (const entry of plan.weeklyPlan ?? []) {
    if (!entry) continue;
    const d = entry.dayOfWeek;
    if (typeof d === "number" && d >= 0 && d <= 6) {
      byDay.set(d, entry.blocks ?? []);
    }
  }
  const out: RoutineDay[] = [];
  for (let d = 0; d < 7; d++) {
    const raw = byDay.get(d) ?? [];
    const valid = blocksWithinFree(raw, week[d]);
    out.push({
      dayOfWeek: d,
      dayLabel: DAY_LABELS_LONG[d],
      blocks: valid,
    });
  }
  return out;
}

function planToSearchableText(doc: RoutineDoc): string {
  const lines: string[] = [];
  lines.push(`Rotina de estudo — ${doc.subjectName}`);
  if (doc.summary) lines.push(doc.summary);
  if (doc.totalMinutesPerWeek) {
    lines.push(`Carga semanal: ${Math.round(doc.totalMinutesPerWeek / 60)}h`);
  }
  for (const day of doc.weeklyPlan) {
    if (day.blocks.length === 0) continue;
    lines.push(`\n${day.dayLabel}:`);
    for (const b of day.blocks) {
      lines.push(`  ${b.startTime}–${b.endTime}  ${b.topic}`);
      if (b.note) lines.push(`    · ${b.note}`);
    }
  }
  return lines.join("\n");
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`routine:ip:${ip}`, 5, 60_000);
  if (ipLimit) return ipLimit;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const subjectId = (body.subjectId ?? "").trim();
  if (!subjectId) {
    return Response.json(
      { error: "subjectId obrigatório." },
      { status: 400 },
    );
  }

  const conteudo = (body.conteudo ?? "").trim().slice(0, LIMITS.MESSAGE_CHARS);
  const nomesAulas = Array.isArray(body.nomesAulas)
    ? body.nomesAulas.filter((x) => typeof x === "string").slice(0, 30)
    : [];
  if (!conteudo && nomesAulas.length === 0) {
    return Response.json(
      { error: "Preciso de conteúdo ou nomes das aulas pra montar o plano." },
      { status: 400 },
    );
  }
  const horasSemanais =
    typeof body.horasSemanais === "number" && body.horasSemanais > 0
      ? Math.min(Math.round(body.horasSemanais), 60)
      : null;
  const dataProva = (body.dataProva ?? "").trim().slice(0, 120);
  const tituloOverride = (body.titulo ?? "").trim().slice(0, 180);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Faça login." }, { status: 401 });
  }

  const userLimit = limitOrThrow(`routine:user:${user.id}`, 8, 60_000);
  if (userLimit) return userLimit;

  // Ownership do subject + carregamento de TODAS as matérias do user
  // (precisamos das schedules pra computar horários livres globais).
  const admin = createAdminClient();
  const { data: subjectsRaw, error: subjErr } = await admin
    .from("subjects")
    .select("id, user_id, name, emoji, color, icon, schedule, created_at")
    .eq("user_id", user.id);
  if (subjErr) {
    return Response.json(
      { error: "Falha ao carregar matérias." },
      { status: 500 },
    );
  }
  const subjects: Subject[] = ((subjectsRaw ?? []) as SubjectRow[]).map(
    (r) => subjectRowToSubject(r),
  );
  const target = subjects.find((s: Subject) => s.id === subjectId);
  if (!target) {
    return Response.json(
      { error: "Matéria não encontrada." },
      { status: 404 },
    );
  }

  const charge = await chargeCoins(user.id, COIN_COSTS.routine, "routine", {
    scope: "lumi-routine",
    subject_id: subjectId,
  });
  if (!charge.ok) {
    return Response.json(
      {
        error: `Saldo insuficiente. Rotina custa ${charge.required} coins, você tem ${charge.balance}.`,
        required: charge.required,
        balance: charge.balance,
        upgrade: "/account/coins",
      },
      { status: 402 },
    );
  }

  const freeWeek = computeFreeWeek(subjects);
  const freeLines = freeWeekToPromptLines(freeWeek);

  const aulasBlock =
    nomesAulas.length > 0
      ? `=== AULAS A PREPARAR ===\n${nomesAulas
          .map((n) => `- ${escapeForPrompt(n)}`)
          .join("\n")}`
      : "";
  const conteudoBlock = conteudo
    ? `=== CONTEÚDO/TÓPICOS DA PROVA ===\n${escapeForPrompt(conteudo)}`
    : "";
  const cargaLine =
    horasSemanais !== null
      ? `Carga semanal alvo: ${horasSemanais} horas.`
      : "Carga semanal alvo: você decide (entre 6 e 18h).";
  const provaLine = dataProva
    ? `Data da prova (referência): ${escapeForPrompt(dataProva)}`
    : "";

  const userMessage = [
    `MATÉRIA: ${escapeForPrompt(target.name)}`,
    cargaLine,
    provaLine,
    "",
    "=== HORÁRIOS LIVRES POR DIA DA SEMANA (07:00-23:00, já tiradas as aulas) ===",
    freeLines,
    "",
    conteudoBlock,
    aulasBlock,
    "",
    "Monte a rotina semanal no formato JSON especificado. APENAS JSON.",
  ]
    .filter(Boolean)
    .join("\n");

  let raw = "";
  try {
    const resp = await createMessage({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4000,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userMessage }],
    });
    const block = resp.content.find((b) => b.type === "text");
    raw = block && block.type === "text" ? block.text : "";
  } catch (err) {
    try {
      await creditCoins(user.id, COIN_COSTS.routine, "refund", {
        reason: "routine_llm_failed",
      });
    } catch {
      /* ignore */
    }
    const { error, reqId } = logAndSanitize("api/lumi/routine", err);
    return Response.json({ error, reqId }, { status: 500 });
  }

  const parsed = tryParsePlan(raw);
  if (!parsed || !Array.isArray(parsed.weeklyPlan)) {
    try {
      await creditCoins(user.id, COIN_COSTS.routine, "refund", {
        reason: "routine_no_content",
      });
    } catch {
      /* ignore */
    }
    return Response.json(
      { error: "Não consegui montar a rotina. Coins devolvidos." },
      { status: 500 },
    );
  }

  const weeklyPlan = planToDays(parsed, freeWeek);
  const hasAnyBlock = weeklyPlan.some((d) => d.blocks.length > 0);
  if (!hasAnyBlock) {
    try {
      await creditCoins(user.id, COIN_COSTS.routine, "refund", {
        reason: "routine_no_valid_blocks",
      });
    } catch {
      /* ignore */
    }
    return Response.json(
      {
        error:
          "Não consegui encaixar blocos dentro dos seus horários livres. Coins devolvidos. Confira o calendário em /schedule.",
      },
      { status: 500 },
    );
  }

  const title =
    tituloOverride || `Rotina — ${target.name}`.slice(0, 180);

  const totalMinutesPerWeek =
    typeof parsed.totalMinutesPerWeek === "number"
      ? Math.max(0, Math.round(parsed.totalMinutesPerWeek))
      : weeklyPlan.reduce(
          (acc, d) =>
            acc +
            d.blocks.reduce((s, b) => {
              const [sh, sm] = b.startTime.split(":").map(Number);
              const [eh, em] = b.endTime.split(":").map(Number);
              return s + Math.max(0, eh * 60 + em - (sh * 60 + sm));
            }, 0),
          0,
        );

  const routineDoc: RoutineDoc = {
    subjectName: target.name,
    title,
    generatedAt: new Date(),
    summary:
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim().slice(0, 600)
        : undefined,
    weeklyPlan,
    totalMinutesPerWeek,
  };

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await renderRoutinePdf(routineDoc);
  } catch (err) {
    try {
      await creditCoins(user.id, COIN_COSTS.routine, "refund", {
        reason: "routine_pdf_failed",
      });
    } catch {
      /* ignore */
    }
    const { error, reqId } = logAndSanitize("api/lumi/routine/pdf", err);
    return Response.json({ error, reqId }, { status: 500 });
  }

  // Cria o Document primeiro (precisa do id) e depois sobe o PDF com esse id no path.
  const searchableText = planToSearchableText(routineDoc);
  const { data: docRow, error: docInsErr } = await admin
    .from("documents")
    .insert({
      user_id: user.id,
      subject_id: subjectId,
      title,
      source_kind: "pdf",
      source_text: searchableText,
      page_count: null,
    })
    .select("id")
    .single();
  if (docInsErr || !docRow?.id) {
    try {
      await creditCoins(user.id, COIN_COSTS.routine, "refund", {
        reason: "routine_doc_insert_failed",
      });
    } catch {
      /* ignore */
    }
    return Response.json(
      { error: "Falha ao salvar documento da rotina." },
      { status: 500 },
    );
  }
  const documentId = docRow.id as string;

  const storageKey = `${user.id}/${documentId}.pdf`;
  const pdfBuffer = Buffer.from(pdfBytes);
  const { error: upErr } = await admin.storage
    .from("user-documents")
    .upload(storageKey, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  let publicUrl: string | null = null;
  if (upErr) {
    // Sem PDF físico — apaga o Document pra não sujar a pasta com fantasma.
    await admin.from("documents").delete().eq("id", documentId);
    try {
      await creditCoins(user.id, COIN_COSTS.routine, "refund", {
        reason: "routine_storage_failed",
      });
    } catch {
      /* ignore */
    }
    return Response.json(
      { error: `Falha ao subir PDF: ${upErr.message}` },
      { status: 500 },
    );
  }
  const { data: pub } = admin.storage
    .from("user-documents")
    .getPublicUrl(storageKey);
  publicUrl = pub?.publicUrl ?? null;
  if (publicUrl) {
    await admin
      .from("documents")
      .update({ source_url: publicUrl })
      .eq("id", documentId);
  }

  return Response.json({
    documentId,
    url: `/document/${documentId}`,
    publicUrl,
    title,
    subjectId,
    coinsCharged: COIN_COSTS.routine,
    balanceAfter: charge.balanceAfter,
  });
}
