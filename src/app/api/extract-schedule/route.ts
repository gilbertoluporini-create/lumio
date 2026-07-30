import Anthropic from "@anthropic-ai/sdk";
import { createMessage } from "@/lib/llm-fallback";
import { LIMITS, logAndSanitize, sniffMagic } from "@/lib/api-security";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Grade em PDF/imagem passa por Vision + JSON — mesmo orçamento do
// /api/extract-academic-calendar. Sem isso a rota herda o default da
// plataforma (10-15s) e o cliente recebe 504 com corpo não-JSON.
export const maxDuration = 120;

/**
 * Cap REAL de upload desta rota. Não usar LIMITS.IMAGE_BYTES (10MB) aqui: a
 * Serverless Function da Vercel corta o body em ~4.5MB e devolve 413 com corpo
 * NÃO-JSON *antes* do handler rodar — nem o guard de Content-Length nem o
 * `file.size` abaixo chegam a executar. Na prática o aluno fotografava a grade
 * impressa com o celular (JPEG de 5-8MB, o dropzone aceita `image/*` e promete
 * "máx 10MB"), o `res.json()` do cliente falhava, `data.error` vinha undefined
 * e o toast saía genérico ("Falha ao processar a grade."), sem nenhuma pista de
 * que o problema era tamanho — e o reenvio ainda esbarrava no rate-limit de
 * 2 req/60s. Alinhamos o limite da rota ao que a plataforma realmente aceita
 * (mesmo racional do LIMITS.PDF_VISION_BYTES do /api/extract-slides), pra que
 * arquivo grande receba um erro JSON explicando o que fazer em vez de morrer
 * mudo na borda.
 */
const UPLOAD_MAX_BYTES = LIMITS.PDF_VISION_BYTES;
const UPLOAD_MAX_MB = Math.round(UPLOAD_MAX_BYTES / 1024 / 1024);
const TOO_LARGE_MSG = `Arquivo muito grande (máx ${UPLOAD_MAX_MB}MB). Foto de celular costuma passar disso: reduza a resolução/qualidade da imagem, recorte só a grade ou envie o PDF do portal.`;

const SYSTEM_PROMPT = `Você é um extrator de grade horária acadêmica. Você recebe uma imagem ou PDF de uma grade horária de faculdade/universidade/escola e precisa identificar todas as MATÉRIAS/DISCIPLINAS distintas presentes E seus horários.

REGRAS PARA MATÉRIAS:
- Extraia o nome único de cada matéria (sem horário, sem sala, sem professor).
- Normalize nomes (ex: "ANATOMIA HUMANA I" → "Anatomia Humana I"; "BIOQ" → "Bioquímica" se contexto deixar claro).
- Cada matéria aparece UMA VEZ na lista, mesmo que tenha múltiplos horários (os horários ficam dentro do array "schedule").

REGRAS PARA SCHEDULE (HORÁRIOS):
- dayOfWeek: 0=domingo, 1=segunda, 2=terça, 3=quarta, 4=quinta, 5=sexta, 6=sábado
- startTime/endTime: formato "HH:MM" em 24h, SEMPRE com dois dígitos na hora (ex: "08:00", nunca "8:00"; "13:30", "19:45")
- endTime tem que ser MAIOR que startTime. Se a célula só tem um horário (ou está vazia), NÃO invente o outro: omita esse bloco do "schedule".
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

type ExtractedPayload = { subjects: ExtractedSubject[]; droppedSlots: number };

function isValidTime(s: unknown): s is string {
  return typeof s === "string" && /^([01]?\d|2[0-3]):[0-5]\d$/.test(s);
}

/**
 * Canoniza "H:MM" → "HH:MM". O regex acima aceita hora sem zero à esquerda
 * (a IA devolve "8:00" numa passada e "08:00" na outra pro MESMO bloco), mas
 * TODO consumidor trata o horário como CHAVE de identidade, não como número:
 * o dedup da união de grades (`dia|início|fim|sala` no unionScheduleSlots) e o
 * id do UEvent (`aula-...-08:00-09:40-`) são strings cruas. Sem padronizar,
 * "8:00" ≠ "08:00" e a mesma aula é gravada duas vezes — duplicata permanente
 * (o aluno não consegue apagar pela agenda: aula da grade é read-only no modal
 * de detalhes) e, no preview/calendário, "8:00" desalinhado ao lado de "08:00"
 * numa coluna tabular-nums. Sai daqui sempre no formato canônico.
 */
function padTime(s: string): string {
  const [h, m] = s.split(":");
  return `${h.padStart(2, "0")}:${m}`;
}

function timeToMinutes(s: string): number {
  const [h, m] = s.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * Devolve os blocos válidos JUNTO com quantos entraram no JSON da Vision e não
 * viraram aula. O descarte silencioso era pior que o bloco ruim: grade com
 * célula mesclada/ambígua (plano de ensino, print do portal) faz a Vision
 * devolver algo como [seg 07:30-09:10] + [qua 13:00-13:00] (célula sem hora de
 * término). O bloco de quarta cai aqui, a resposta não carregava NENHUM
 * contador, o preview do "Subir agenda" era montado só com o que sobrou e o
 * aluno confirmava "Salvar 6 matérias" achando que a grade estava inteira. A
 * aula de quarta nunca existia: nem no mês, nem na semana, nem na sidebar, e o
 * único jeito de descobrir era reconferir o PDF slot a slot. Quando TODOS os
 * blocos da matéria caem é pior ainda: a linha nasce "Sem horário detectado"
 * com selected:false e a matéria também não é criada. O fluxo irmão de provas
 * já trata isso como defeito e avisa ("N linhas ignoradas"), mas lá o cliente
 * consegue contar sozinho porque a rota devolve as linhas cruas; aqui a
 * normalização é toda server-side, então quem tem o número somos nós. Contamos
 * qualquer entrada do array "schedule" que não virou slot (formato inválido,
 * dia fora de 0-6, duração não positiva) pra que o cliente possa avisar.
 */
type NormalizedSchedule = { slots: ScheduleSlot[]; dropped: number };

function normalizeSchedule(raw: unknown): NormalizedSchedule {
  if (!Array.isArray(raw)) return { slots: [], dropped: 0 };
  const out: ScheduleSlot[] = [];
  let dropped = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      dropped++;
      continue;
    }
    const o = item as Record<string, unknown>;
    const dow = typeof o.dayOfWeek === "number" ? o.dayOfWeek : Number(o.dayOfWeek);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
      dropped++;
      continue;
    }
    if (!isValidTime(o.startTime) || !isValidTime(o.endTime)) {
      dropped++;
      continue;
    }
    const startTime = padTime(o.startTime);
    const endTime = padTime(o.endTime);
    // Validar só o FORMATO deixava passar bloco sem duração: célula da grade
    // com um horário só (ou vazia lida como "00:00") vira 00:00–00:00, é salva
    // pelo Salvar do upload (mergeSlots não descarta duração zero) e na agenda
    // nasce um UEvent com startMinutes === endMinutes === 0 e allDay:false —
    // a faixa de horas da view Semana passa a ser derivada dele (min = 0), a
    // grade abre às 00:00 com sete faixas vazias de madrugada empurrando as
    // aulas reais pra fora da primeira tela, e a matéria vira um bloco
    // fantasma de 30 min (layoutEndMinutes) que o aluno não consegue apagar
    // (aula da grade é read-only no modal de detalhes). Fim invertido cai no
    // mesmo balde: aula de faculdade não cruza a meia-noite, então só um
    // intervalo de duração POSITIVA é aula.
    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      dropped++;
      continue;
    }
    const slot: ScheduleSlot = {
      dayOfWeek: dow,
      startTime,
      endTime,
    };
    if (typeof o.room === "string" && o.room.trim().length > 0) {
      slot.room = o.room.trim().slice(0, 40);
    }
    out.push(slot);
  }
  return { slots: out, dropped };
}

function normalize(arr: unknown): ExtractedPayload {
  if (!Array.isArray(arr)) return { subjects: [], droppedSlots: 0 };
  const out: ExtractedSubject[] = [];
  // Soma dos blocos perdidos de TODAS as matérias: é esse número que sobe na
  // resposta pro preview conseguir dizer quantas aulas do PDF ficaram de fora.
  let droppedSlots = 0;
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.name !== "string") continue;
    const name = o.name.trim();
    if (name.length === 0) continue;
    const { slots, dropped } = normalizeSchedule(o.schedule);
    droppedSlots += dropped;
    out.push({
      name,
      schedule: slots,
    });
  }
  return { subjects: out, droppedSlots };
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
    return normalize(parsed?.subjects);
  } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { subjects?: unknown };
      return normalize(parsed?.subjects);
    } catch {}
  }
  return null;
}

export async function POST(req: Request) {
  // Defense-in-depth: além do auth gate em proxy.ts, aplicamos rate-limit
  // direto na rota porque o endpoint também é acessível via /calendario-onboarding
  // (público pra leads) e roda Vision Sonnet com o PDF/imagem inteiro — caríssimo.
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
    contentLength > UPLOAD_MAX_BYTES
  ) {
    console.warn(
      `[extract-schedule] content-length too large ip=${ip} bytes=${contentLength}`,
    );
    return Response.json({ error: TOO_LARGE_MSG }, { status: 413 });
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
  if (file.size === 0) {
    return Response.json({ error: "Arquivo vazio." }, { status: 413 });
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    return Response.json({ error: TOO_LARGE_MSG }, { status: 413 });
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
        // Mesmo formato do caminho real pro cliente poder ler `droppedSlots`
        // sem checar se está em demo.
        droppedSlots: 0,
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

    // timeoutMs abaixo do maxDuration=120s: o SDK corta antes da plataforma
    // matar a função, então o erro vira 500 JSON sanitizado (que o cliente
    // consegue ler) em vez de 504 com corpo HTML. O default do SDK é 240s.
    const resp = await createMessage(
      {
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4000,
        system: [
          { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content }],
      },
      { timeoutMs: 100_000 },
    );

    const textBlock = resp.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const parsed = tryParseJson(raw);

    if (!parsed) {
      return Response.json(
        {
          subjects: [],
          droppedSlots: 0,
          error:
            "Não consegui ler a grade. Verifique se o arquivo está nítido e tente novamente, ou adicione as matérias manualmente.",
        },
        { status: 200 },
      );
    }

    const { droppedSlots } = parsed;
    if (droppedSlots > 0) {
      // Log pra medir qualidade da leitura da Vision: grade que perde bloco em
      // silêncio é o caso que fazia o aluno aprovar uma agenda incompleta.
      console.warn(
        `[extract-schedule] dropped ${droppedSlots} slot(s) inválido(s) ip=${ip}`,
      );
    }

    // O contador sobe SEMPRE (0 inclusive) junto com uma mensagem pronta em
    // pt-BR: sem isso o cliente não tem como saber que existiu uma linha no PDF
    // que não virou aula, e o preview mostra a grade furada como se estivesse
    // completa. Quem renderiza o aviso é o schedule-pdf-upload.
    return Response.json({
      subjects: parsed.subjects,
      droppedSlots,
      ...(droppedSlots > 0
        ? {
            droppedSlotsMessage: `${droppedSlots} horário${droppedSlots === 1 ? "" : "s"} da grade ${droppedSlots === 1 ? "veio incompleto" : "vieram incompletos"} (ex: célula sem hora de término ou mesclada) e ${droppedSlots === 1 ? "ficou" : "ficaram"} de fora. Confira ${droppedSlots === 1 ? "essa aula" : "essas aulas"} no arquivo e adicione ${droppedSlots === 1 ? "ela" : "elas"} manualmente.`,
          }
        : {}),
    });
  } catch (err) {
    return Response.json(logAndSanitize("api/extract-schedule", err), { status: 500 });
  }
}
