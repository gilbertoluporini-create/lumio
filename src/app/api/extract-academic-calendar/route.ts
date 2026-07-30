/**
 * POST /api/extract-academic-calendar
 *
 * Recebe o PDF/print do CALENDÁRIO ACADÊMICO institucional (aquele que a
 * faculdade publica com feriados, provas, entrega de notas, recessos) e
 * devolve os eventos com datas absolutas.
 *
 * Difere de /api/extract-schedule: lá são matérias com horário SEMANAL
 * recorrente; aqui são datas ABSOLUTAS do ano letivo.
 *
 * Grátis (não cobra coins) — é setup de ambiente, mesma política da grade.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createMessage } from "@/lib/llm-fallback";
import { LIMITS, logAndSanitize, sniffMagic } from "@/lib/api-security";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import {
  normalizeAcademicEvents,
  type AcademicEvent,
} from "@/lib/academic-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Calendário costuma ter 2 páginas densas (12 meses) — Vision + JSON longo.
export const maxDuration = 120;

/**
 * Cap REAL de upload desta rota. Não usar LIMITS.IMAGE_BYTES (10MB) aqui: a
 * Serverless Function da Vercel corta o body em ~4.5MB e devolve 413 com corpo
 * NÃO-JSON *antes* do handler rodar — nem o guard de Content-Length nem o
 * `file.size` abaixo chegam a executar. Na prática o aluno fotografava com o
 * celular o calendário impresso no mural da faculdade (JPEG de 5-8MB, o
 * dropzone aceita `image/*` e promete "máx 10MB") ou baixava o PDF escaneado de
 * 6MB do portal: o `res.json().catch(() => ({}))` do cliente virava objeto
 * vazio, `data.error` vinha undefined e o toast saía genérico ("Falha ao
 * processar o calendário."), sem uma palavra sobre tamanho — reenviar o mesmo
 * arquivo falhava idêntico e ainda esbarrava no rate-limit de 2 req/60s. Sem o
 * calendário no perfil o aluno fica sem período letivo, sem feriado/recesso
 * suprimindo aula e sem contexto de datas pra Lumi. Alinhamos o limite ao que a
 * plataforma realmente aceita (mesmo racional do /api/extract-schedule, a rota
 * gêmea, e do LIMITS.PDF_VISION_BYTES do /api/extract-slides), pra que arquivo
 * grande receba um erro JSON acionável em vez de morrer mudo na borda.
 */
const UPLOAD_MAX_BYTES = LIMITS.PDF_VISION_BYTES;
const UPLOAD_MAX_MB = Math.round(UPLOAD_MAX_BYTES / 1024 / 1024);
const TOO_LARGE_MSG = `Arquivo muito grande (máx ${UPLOAD_MAX_MB}MB). Foto de celular costuma passar disso: reduza a resolução/qualidade da imagem, recorte só o calendário ou envie o PDF do portal.`;

const SYSTEM_PROMPT = `Você é um extrator de CALENDÁRIO ACADÊMICO de instituições de ensino brasileiras. Recebe o PDF/imagem do calendário oficial (com os meses do ano e a lista de eventos ao lado de cada mês) e extrai TODOS os eventos com suas datas absolutas.

REGRAS DE DATA:
- Toda data vira ISO "yyyy-mm-dd". O ano vem do título do documento (ex: "Calendário Acadêmico 2026"). Se um mês pertence claramente ao segundo semestre do mesmo ano, use o mesmo ano.
- Eventos de INTERVALO ("22 A 26/06", "03 E 04/04", "13 A 23/04", "01 A 30/07"): preencha "date" com o primeiro dia e "endDate" com o último. Para "03 E 04/04" (dois dias soltos consecutivos), trate como intervalo de 03 a 04.
- Evento de um dia só: "endDate": null.
- Intervalo que cruza mês ("29/05 A 10/06", "18/11 A 02/12"): date e endDate refletem os meses corretos.
- IGNORE a numeração dos dias das grades de calendário (as tabelas Dom/Seg/Ter...) e as linhas de contagem tipo "21 dias letivos". Extraia SOMENTE os eventos listados/descritos.
- Se o mesmo evento aparecer duplicado no documento, liste UMA vez.

CATEGORIAS (campo "category", escolha a mais específica):
- "prova": avaliações, exames finais, provas de faltosos, testes de progresso, avaliações PRA
- "nota": entrega ou divulgação de notas (N1, N2, PRA, exames)
- "prazo": prazos de inscrição (PRA, prova de faltosos), períodos de matrícula
- "feriado": feriados nacionais, estaduais ou municipais (Natal, Tiradentes, aniversário da cidade...)
- "recesso": recesso acadêmico, férias docentes, emendas de feriado
- "marco": início/término de semestre letivo, aula inaugural, recepção de ingressantes, término do período letivo
- "evento": reuniões e eventos institucionais (CONSU, COMAA, SEMICA, reunião de planejamento docente)

SEMESTRE: campo "semester" = 1 ou 2 conforme a seção do documento ("Primeiro Semestre" / "Segundo Semestre"). Se não der pra saber, use null.

PERÍODO LETIVO (campo "termBoundary") — é o que define até quando as aulas da grade horária se repetem, então classifique com cuidado:
- "start": o dia em que as AULAS COMEÇAM/RETOMAM no semestre ("Início do semestre letivo", "Início das aulas", "Retorno das atividades letivas", "Aula inaugural" quando é o primeiro dia de aula).
- "end": o dia em que as AULAS ACABAM ("Término do período letivo", "Último dia de aulas", "Encerramento do semestre letivo").
- null (ou omita) em TODO o resto. Em especial: início/fim de RECESSO ou FÉRIAS não é termBoundary, feriado não é, prazo de matrícula não é, semana de provas não é.
- Na dúvida, use null: um marco classificado errado apaga um semestre inteiro de aulas da agenda do aluno.

TÍTULO: mantenha o texto do evento, mas em capitalização normal em pt-BR (não CAIXA ALTA). Ex: "ENTREGA DE NOTAS - N1" vira "Entrega de notas - N1".

Extraia também, se aparecer: "institution" (nome da instituição/campus) e "year" (ano letivo).

FORMATO DE SAÍDA (JSON puro, sem markdown, sem texto fora do JSON):
{
  "institution": "São Leopoldo Mandic Araras",
  "year": 2026,
  "events": [
    {"date": "2026-02-02", "endDate": null, "title": "Início do semestre letivo", "category": "marco", "semester": 1, "termBoundary": "start"},
    {"date": "2026-02-16", "endDate": "2026-02-18", "title": "Recesso acadêmico - Carnaval", "category": "recesso", "semester": 1, "termBoundary": null},
    {"date": "2026-06-22", "endDate": "2026-06-26", "title": "Exames finais", "category": "prova", "semester": 1, "termBoundary": null},
    {"date": "2026-06-30", "endDate": null, "title": "Término do período letivo", "category": "marco", "semester": 1, "termBoundary": "end"}
  ]
}

Se não conseguir identificar eventos, retorne {"events":[]}.`;

type ExtractPayload = {
  institution?: string | null;
  year?: number | null;
  events: AcademicEvent[];
};

function tryParseJson(text: string): ExtractPayload | null {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const attempt = (s: string): ExtractPayload | null => {
    try {
      const parsed = JSON.parse(s) as Record<string, unknown>;
      const events = normalizeAcademicEvents(parsed?.events);
      const yearRaw =
        typeof parsed?.year === "number" ? parsed.year : Number(parsed?.year);
      return {
        institution:
          typeof parsed?.institution === "string"
            ? parsed.institution.trim().slice(0, 160)
            : null,
        year:
          Number.isInteger(yearRaw) && yearRaw > 2000 && yearRaw < 2100
            ? yearRaw
            : null,
        events,
      };
    } catch {
      return null;
    }
  };

  const direct = attempt(cleaned);
  if (direct) return direct;
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  const greedy = attempt(match[0]);
  if (greedy) return greedy;

  // 3ª tentativa: resposta CORTADA no meio por max_tokens. Calendário anual
  // denso (dois semestres, todos os feriados, notas, CONSU/COMAA) passa de 150
  // eventos e estoura o orçamento de tokens no meio de um objeto. Aí os dois
  // parses acima falham: o `match` ganancioso vai do primeiro `{` até o ÚLTIMO
  // `}`, que é o fim do último evento COMPLETO — falta o `]` do array e o `}`
  // da raiz. Fechar esses dois recupera todos os eventos íntegros em vez de
  // devolver null e mandar o aluno "verificar se o arquivo está nítido" pra
  // sempre (o arquivo está nítido; o que estourou foi o token budget) — e o
  // calendário mais completo, justo o que mais valia importar, era o único que
  // nunca entrava. Se ainda assim não parsear, cai no null de antes.
  return attempt(`${match[0]}]}`);
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent")?.slice(0, 120) ?? "unknown";

  // Mesma política do extract-schedule: Vision Sonnet com o PDF/imagem inteiro
  // (até UPLOAD_MAX_BYTES) é caro, então limita por IP e globalmente.
  const ipLimit = limitOrThrow(`extract-academic:ip:${ip}`, 2, 60_000);
  if (ipLimit) {
    console.warn(`[extract-academic-calendar] rate-limit ip=${ip} ua=${userAgent}`);
    return ipLimit;
  }
  const globalLimit = limitOrThrow(`extract-academic:global`, 30, 60_000);
  if (globalLimit) {
    console.warn(`[extract-academic-calendar] rate-limit global ip=${ip}`);
    return globalLimit;
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(contentLength) &&
    contentLength > 0 &&
    contentLength > UPLOAD_MAX_BYTES
  ) {
    console.warn(
      `[extract-academic-calendar] content-length too large ip=${ip} bytes=${contentLength}`,
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
  if (!apiKey) {
    const year = new Date().getFullYear();
    return Response.json({
      institution: "Faculdade Exemplo",
      year,
      events: [
        {
          date: `${year}-08-03`,
          endDate: null,
          title: "Início do semestre letivo",
          category: "marco",
          semester: 2,
        },
        {
          date: `${year}-10-09`,
          endDate: null,
          title: "Entrega de notas - N1",
          category: "nota",
          semester: 2,
        },
        {
          date: `${year}-12-14`,
          endDate: `${year}-12-18`,
          title: "Exames finais",
          category: "prova",
          semester: 2,
        },
      ],
      demo: true,
      message:
        "Modo demo: a IA não está configurada (sem ANTHROPIC_API_KEY). Eventos fictícios pra teste.",
    });
  }

  const isPdf = mime === "application/pdf";

  try {
    const content: Anthropic.MessageParam["content"] = [
      isPdf
        ? {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
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
        text: "Extraia TODOS os eventos deste calendário acadêmico (os dois semestres, se houver). Responda apenas com o JSON no formato especificado.",
      },
    ];

    // timeoutMs abaixo do maxDuration=120s (default do SDK é 240s, o dobro do
    // orçamento da rota): calendário de 2 páginas com os dois semestres gera
    // ~5k tokens em cima de Vision e passa fácil dos 120s. Sem o corte antes,
    // a plataforma mata a função e o cliente recebe 504 com corpo HTML — o
    // `res.json().catch(() => ({}))` do front vira objeto vazio e o aluno só vê
    // "Falha ao processar o calendário." depois de 2min, e ainda esbarra no
    // rate-limit de 2 req/60s ao tentar de novo. Cortando aqui, o erro vira 500
    // JSON sanitizado que o cliente consegue ler. Mesmo limite do
    // /api/extract-schedule.
    const resp = await createMessage(
      {
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 8000,
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

    // Truncamento NÃO é arquivo ilegível: com max_tokens=8000 um calendário de
    // ~150+ eventos é cortado no meio do JSON, e sem consultar o stop_reason
    // tanto o log quanto a mensagem culpavam a nitidez do arquivo — o aluno
    // reenviava o mesmo PDF, falhava idêntico e ainda batia no rate-limit de
    // 2 req/60s. Aqui a rota passa a distinguir os dois casos.
    const truncated = resp.stop_reason === "max_tokens";

    if (!parsed || parsed.events.length === 0) {
      if (truncated) {
        console.warn(
          `[extract-academic-calendar] resposta truncada em max_tokens ip=${ip} chars=${raw.length}`,
        );
        return Response.json({
          events: [],
          error:
            "Esse calendário tem eventos demais pra uma leitura só — a resposta foi cortada no meio. Envie um semestre (ou uma página) por vez que eu consigo importar.",
        });
      }
      return Response.json({
        events: [],
        error:
          "Não consegui ler o calendário. Verifique se o arquivo está nítido e tente de novo, ou adicione as datas manualmente.",
      });
    }

    if (truncated) {
      // Salvamos o que veio íntegro, mas o fim do calendário ficou de fora:
      // sinaliza pro cliente em vez de entregar como se fosse a lista completa
      // (pode faltar o "Término do período letivo" do último semestre).
      console.warn(
        `[extract-academic-calendar] resposta truncada em max_tokens (parcial) ip=${ip} eventos=${parsed.events.length}`,
      );
      return Response.json({
        ...parsed,
        truncated: true,
        message:
          "O calendário é longo e a leitura foi cortada no fim: confira se as últimas datas do ano estão aqui. Se faltar, envie o outro semestre em um upload separado.",
      });
    }

    return Response.json(parsed);
  } catch (err) {
    return Response.json(
      logAndSanitize("api/extract-academic-calendar", err),
      { status: 500 },
    );
  }
}
