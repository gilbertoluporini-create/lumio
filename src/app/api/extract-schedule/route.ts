import Anthropic from "@anthropic-ai/sdk";
import { createMessage } from "@/lib/llm-fallback";
import { LIMITS, logAndSanitize, sniffMagic } from "@/lib/api-security";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `Você é um extrator de grade horária acadêmica. Você recebe uma imagem ou PDF de uma grade horária de faculdade/universidade/escola e precisa identificar todas as MATÉRIAS/DISCIPLINAS distintas presentes E seus horários.

REGRAS PARA MATÉRIAS:
- Extraia o nome único de cada matéria (sem horário, sem sala, sem professor).
- Normalize nomes (ex: "ANATOMIA HUMANA I" → "Anatomia Humana I"; "BIOQ" → "Bioquímica" se contexto deixar claro).
- Cada matéria aparece UMA VEZ na lista, mesmo que tenha múltiplos horários (os horários ficam dentro do array "schedule").

REGRAS PARA SCHEDULE (HORÁRIOS):
- dayOfWeek: 0=domingo, 1=segunda, 2=terça, 3=quarta, 4=quinta, 5=sexta, 6=sábado
- startTime/endTime: formato "HH:MM" em 24h (ex: "08:00", "13:30", "19:45")
- room: opcional, string com nome/número da sala se aparecer (ex: "B-201", "Lab 3"). Omita se não tiver.
- Se uma matéria tem múltiplos horários (ex: aparece seg e qua), liste todos eles dentro do "schedule".
- Se não conseguir extrair NENHUM horário pra uma matéria, retorne "schedule": [].
- IGNORE: intervalos, almoço, blocos vazios, créditos.

FORMATO DE SAÍDA (JSON puro, sem markdown, sem texto extra):
{
  "subjects": [
    {
      "name": "Anatomia Humana I",
      "schedule": [
        {"dayOfWeek": 1, "startTime": "08:00", "endTime": "09:40", "room": "B-201"},
        {"dayOfWeek": 3, "startTime": "10:00", "endTime": "11:40"}
      ]
    },
    {
      "name": "Bioquímica",
      "schedule": [
        {"dayOfWeek": 2, "startTime": "14:00", "endTime": "15:40", "room": "Lab 3"}
      ]
    }
  ]
}

Se não conseguir identificar matérias claramente, retorne {"subjects":[]}.`;

type ScheduleSlot = {
  dayOfWeek: number; // 0-6
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  room?: string;
};

type ExtractedSubject = {
  name: string;
  schedule: ScheduleSlot[];
};

type ExtractedPayload = { subjects: ExtractedSubject[] };

function isValidTime(s: unknown): s is string {
  return typeof s === "string" && /^([01]?\d|2[0-3]):[0-5]\d$/.test(s);
}

function normalizeSchedule(raw: unknown): ScheduleSlot[] {
  if (!Array.isArray(raw)) return [];
  const out: ScheduleSlot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const dow = typeof o.dayOfWeek === "number" ? o.dayOfWeek : Number(o.dayOfWeek);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) continue;
    if (!isValidTime(o.startTime) || !isValidTime(o.endTime)) continue;
    const slot: ScheduleSlot = {
      dayOfWeek: dow,
      startTime: o.startTime,
      endTime: o.endTime,
    };
    if (typeof o.room === "string" && o.room.trim().length > 0) {
      slot.room = o.room.trim().slice(0, 40);
    }
    out.push(slot);
  }
  return out;
}

function normalize(arr: unknown): ExtractedSubject[] {
  if (!Array.isArray(arr)) return [];
  const out: ExtractedSubject[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.name !== "string") continue;
    const name = o.name.trim();
    if (name.length === 0) continue;
    out.push({
      name,
      schedule: normalizeSchedule(o.schedule),
    });
  }
  return out;
}

function tryParseJson(text: string): ExtractedPayload | null {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as { subjects?: unknown };
    return { subjects: normalize(parsed?.subjects) };
  } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { subjects?: unknown };
      return { subjects: normalize(parsed?.subjects) };
    } catch {}
  }
  return null;
}

export async function POST(req: Request) {
  // Defense-in-depth: além do auth gate em proxy.ts, aplicamos rate-limit
  // direto na rota porque o endpoint também é acessível via /calendario-onboarding
  // (público pra leads) e roda Vision Sonnet com PDF até 10MB — caríssimo.
  // Limites agressivos pq custo por chamada é alto.
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent")?.slice(0, 120) ?? "unknown";

  // 1) Rate-limit por IP: 2 req / 60s
  const ipLimit = limitOrThrow(`extract-schedule:ip:${ip}`, 2, 60_000);
  if (ipLimit) {
    console.warn(
      `[extract-schedule] rate-limit ip exceeded ip=${ip} ua=${userAgent}`,
    );
    return ipLimit;
  }

  // 2) Rate-limit GLOBAL (defesa contra distribuição): 30 req / 60s
  const globalLimit = limitOrThrow(`extract-schedule:global`, 30, 60_000);
  if (globalLimit) {
    console.warn(
      `[extract-schedule] rate-limit global exceeded ip=${ip} ua=${userAgent}`,
    );
    return globalLimit;
  }

  // 3) Content-Length guard — barra payload antes mesmo de formData() consumir
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(contentLength) &&
    contentLength > 0 &&
    contentLength > LIMITS.IMAGE_BYTES
  ) {
    console.warn(
      `[extract-schedule] content-length too large ip=${ip} bytes=${contentLength}`,
    );
    return Response.json(
      { error: "Tamanho inválido (máx 10MB)." },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Form inválido." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Arquivo ausente." }, { status: 400 });
  }
  if (file.size === 0 || file.size > LIMITS.IMAGE_BYTES) {
    return Response.json({ error: "Tamanho inválido (máx 10MB)." }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffMagic(buf);
  if (!sniffed) {
    return Response.json(
      { error: "Tipo de arquivo não reconhecido. Envie PDF, PNG, JPG ou WEBP." },
      { status: 415 },
    );
  }
  const mime =
    sniffed === "pdf"
      ? "application/pdf"
      : sniffed === "png"
        ? "image/png"
        : sniffed === "jpeg"
          ? "image/jpeg"
          : sniffed === "webp"
            ? "image/webp"
            : "image/gif";
  const base64 = buf.toString("base64");

  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Demo fallback
  if (!apiKey) {
    return Response.json(
      {
        subjects: [
          {
            name: "Anatomia",
            schedule: [
              { dayOfWeek: 1, startTime: "08:00", endTime: "09:40", room: "B-201" },
              { dayOfWeek: 3, startTime: "10:00", endTime: "11:40", room: "B-201" },
            ],
          },
          {
            name: "Fisiologia",
            schedule: [
              { dayOfWeek: 2, startTime: "14:00", endTime: "15:40" },
            ],
          },
          {
            name: "Bioquímica",
            schedule: [
              { dayOfWeek: 4, startTime: "10:00", endTime: "11:40", room: "Lab 3" },
            ],
          },
          { name: "Histologia", schedule: [] },
        ],
        demo: true,
        message:
          "Modo demo: a IA não está configurada (sem ANTHROPIC_API_KEY). Retornamos matérias fictícias pra você testar. Configure a chave em .env.local pra extração real da grade.",
      },
      { status: 200 },
    );
  }

  const isPdf = mime === "application/pdf";

  try {
    const content: Anthropic.MessageParam["content"] = [
      isPdf
        ? {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          }
        : {
            type: "image",
            source: {
              type: "base64",
              media_type: mime as
                | "image/jpeg"
                | "image/png"
                | "image/webp"
                | "image/gif",
              data: base64,
            },
          },
      {
        type: "text",
        text: "Extraia todas as matérias distintas dessa grade horária junto com seus dias/horários. Responda apenas com o JSON no formato especificado.",
      },
    ];

    const resp = await createMessage({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4000,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content }],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const parsed = tryParseJson(raw);

    if (!parsed) {
      return Response.json(
        {
          subjects: [],
          error:
            "Não consegui ler a grade. Verifique se o arquivo está nítido e tente novamente, ou adicione as matérias manualmente.",
        },
        { status: 200 },
      );
    }

    return Response.json({ subjects: parsed.subjects });
  } catch (err) {
    return Response.json(logAndSanitize("api/extract-schedule", err), { status: 500 });
  }
}
