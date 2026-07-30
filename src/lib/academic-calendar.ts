/**
 * Calendário acadêmico institucional — tipos e helpers compartilhados.
 *
 * Client-safe (sem next/headers, sem SDK) pra ser importável tanto no dialog
 * de upload quanto no endpoint de extração e no render do prompt da Lumi.
 *
 * Vive em `user_profiles.academic_calendar` (migration 056).
 */

import type { CalendarEventType } from "./calendar-events";

export type AcademicEventCategory =
  | "prova" // avaliações, exames finais, testes de progresso
  | "nota" // entrega/divulgação de notas
  | "prazo" // prazos de inscrição (PRA, prova de faltosos)
  | "feriado" // feriados nacionais/municipais
  | "recesso" // recesso acadêmico, férias
  | "marco" // início/término de semestre, aula inaugural
  | "evento"; // CONSU, COMAA, SEMICA, reuniões

export type AcademicEvent = {
  /** Data de início, ISO yyyy-mm-dd. */
  date: string;
  /** Data final quando o evento é um intervalo (ex: "22 a 26/06"). */
  endDate?: string | null;
  title: string;
  category: AcademicEventCategory;
  /** 1 = primeiro semestre, 2 = segundo. */
  semester?: number | null;
  /**
   * Marco de abertura ("start") ou de encerramento ("end") do período letivo,
   * quando o extrator consegue classificar. É a fonte confiável do
   * `getTermWindows`; o texto do título só entra como fallback (calendários
   * salvos antes deste campo existir não têm nada aqui).
   */
  termBoundary?: TermBoundary | null;
};

/** Papel do evento na delimitação do período letivo. */
export type TermBoundary = "start" | "end";

export type AcademicCalendar = {
  institution?: string | null;
  year?: number | null;
  sourceFile?: string | null;
  importedAt?: string | null;
  events: AcademicEvent[];
};

/**
 * `tone` é a cor do SELO de categoria no preview do upload, renderizado sobre
 * `bg-muted` em `text-[10px]` — é a única coisa na linha que diz se aquilo é
 * "Notas", "Prazo", "Feriado" ou "Recesso", e feriado/recesso nascem
 * DESMARCADOS, então é lendo o selo que o aluno decide o que marcar entre ~87
 * linhas.
 *
 * Por isso a escala é `-700 dark:-400` e não o `-500` cru que estava aqui:
 * `--muted` do tema claro é oklch(0.96) (luminância 0,885), e sobre ele o -500
 * dá 1,9:1 (amber), 2,2:1 (emerald) e 3,4:1 (red) — abaixo do mínimo 4,5:1 da
 * WCAG AA, num corpo de 10px. O selo virava borrão colorido e o aluno marcava
 * no escuro. No tema escuro (`--muted` oklch(0.22)) o -500 ia bem, daí o bug
 * só aparecer no claro — e o app roda `theme="system"`, então metade dos
 * alunos cai justamente no claro.
 *
 * O `-600 dark:-400` usado em `subject-color.ts` e no EVENT_TYPE_META NÃO
 * resolve aqui: sobre `bg-muted` claro o -600 ainda fica em 2,8:1 (amber),
 * 3,3:1 (emerald) e 4,2:1 (red). Com -700 a leitura no claro fica em 4,5:1
 * (amber), 4,8:1 (emerald) e 5,7:1 (red); no escuro o -400 mantém 6:1+.
 * `text-primary` e `text-muted-foreground` já passam nos dois temas (5,4:1),
 * então ficam como estão.
 */
export const ACADEMIC_CATEGORY_META: Record<
  AcademicEventCategory,
  { label: string; eventType: CalendarEventType; tone: string }
> = {
  prova: { label: "Prova", eventType: "prova", tone: "text-red-700 dark:text-red-400" },
  nota: {
    label: "Notas",
    eventType: "trabalho",
    tone: "text-amber-700 dark:text-amber-400",
  },
  prazo: {
    label: "Prazo",
    eventType: "trabalho",
    tone: "text-amber-700 dark:text-amber-400",
  },
  feriado: {
    label: "Feriado",
    eventType: "outro",
    tone: "text-emerald-700 dark:text-emerald-400",
  },
  recesso: {
    label: "Recesso",
    eventType: "outro",
    tone: "text-emerald-700 dark:text-emerald-400",
  },
  marco: { label: "Marco do semestre", eventType: "outro", tone: "text-primary" },
  evento: { label: "Evento", eventType: "outro", tone: "text-muted-foreground" },
};

const CATEGORIES = Object.keys(ACADEMIC_CATEGORY_META) as AcademicEventCategory[];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !ISO_DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  // O V8 NÃO reprova dia fora do mês: ele faz ROLLOVER. "2026-06-31T00:00:00"
  // (junho tem 30) vira 01/07/2026 e "2026-02-29" (2026 não é bissexto) vira
  // 01/03/2026 — só mês 00/13 dá Invalid Date. Sem conferir os componentes de
  // volta, a data inexistente passava e o evento era mostrado num dia e gravado
  // em outro: o preview e o `academic_calendar` do perfil ficam com a string
  // crua "2026-06-31" (usada nas comparações de getTermWindows/isWithinTerm),
  // enquanto o evento que vai pra agenda nasce do Date já rolado, 01/07 — o
  // calendário aponta um dia e a Lumi fala de outro. No recesso é pior:
  // "2026-02-29" faz getNonTeachingDays somar 01/03 ao Set e APAGAR as aulas de
  // um dia que tem aula. Melhor descartar o evento (normalizeAcademicEvents já
  // ignora o que não casa com o shape) do que propagar a data errada.
  const [y, m, day] = v.split("-").map(Number);
  return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day;
}

/**
 * "yyyy-mm-dd" a partir da data LOCAL do Date.
 *
 * Nunca use `toISOString()` pra isso: ele converte pra UTC, então uma
 * meia-noite local em fuso positivo (UTC+1..+14) volta como o dia ANTERIOR.
 * Fonte única da conversão Date → yyyy-mm-dd no app.
 */
export function toLocalIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * O dia do instante `d` em America/Sao_Paulo, como "yyyy-mm-dd".
 *
 * Necessário no que roda no servidor (runtime Node sem TZ = UTC): entre 21h e
 * meia-noite em Brasília o UTC já virou amanhã, e `toISOString()` — que ignora
 * a env TZ — descartaria a prova de HOJE do contexto da Lumi.
 */
export function isoDateInSaoPaulo(d: Date = new Date()): string {
  // "en-CA" já formata como yyyy-mm-dd.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Teto de duração de um intervalo do calendário, em dias.
 *
 * A extração roda sem temperature fixa e a MESMA linha volta ora como "marco",
 * ora como "recesso": basta "02/02 A 20/12 – PERÍODO LETIVO 2026" cair com
 * category="recesso" pro `getNonTeachingDays` expandir o ano inteiro e
 * `expandSlotsToEvents` pular TODOS esses dias — mês, semana, agenda e sidebar
 * sem UMA aula do ano letivo. E é irreversível pela UI: o upload só faz merge
 * (`normalizeAcademicEvents([...incoming, ...kept])`) e não existe tela pra
 * apagar um evento do `academic_calendar`, então subir o PDF corrigido não
 * derruba a linha podre.
 *
 * Nenhum recesso/férias institucional passa de ~2 meses, e as férias longas
 * ENTRE semestres já são bloqueadas pelo buraco entre as janelas letivas
 * (`isWithinTerm`) — então ignorar um intervalo maior que isso não abre aula em
 * férias de verdade. Invariante do arquivo: na dúvida, RESTRINGIR MENOS.
 */
const MAX_INTERVAL_DAYS = 62;

/** Dias inteiros entre duas datas ISO (fim − início). */
function spanInDays(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T00:00:00`).getTime();
  const b = new Date(`${endIso}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * A linha crua traz um `endDate` que a normalização NÃO vai conseguir usar?
 *
 * Exportado pro preview do upload poder CONTAR o intervalo perdido do mesmo
 * jeito que já conta a data inexistente (`!isIsoDate(ev?.date)`): o descarte do
 * `endDate` colapsa o "Recesso 01 a 31/07" num dia só — 30 dias de aula voltam
 * a ser desenhados, o aviso de mês sem aula não dispara e o `academic_calendar`
 * salvo (fonte do prompt da Lumi) fica truncado — e nada na tela dizia isso.
 * Ordem invertida NÃO conta aqui: essa a normalização recupera desinvertendo.
 *
 * ATENÇÃO A QUEM FOR LIGAR ISSO NA TELA: hoje ninguém importa esta função, e
 * ligá-la SÓ no `handleFile` do dialog (ao lado do contador `droppedDates`, que
 * hoje olha apenas `!isIsoDate(ev?.date)`) dá ZERO POR CONSTRUÇÃO — o
 * `tryParseJson` da rota de extração já chama `normalizeAcademicEvents` antes de
 * responder, então o `endDate` podre morre no servidor e o cliente recebe o
 * evento já colapsado num dia só, com `endDate: null`. Mesma armadilha do
 * `droppedLocally` documentada lá. Pra o aluno enxergar o intervalo perdido, a
 * contagem tem que rodar na ROTA, sobre o payload CRU da Vision (antes de
 * normalizar), e voltar no JSON junto de `droppedDates`; o contador do cliente
 * fica como defesa em profundidade (modo demo / rota devolvendo evento cru).
 */
export function hasUnusableEndDate(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  if (o.endDate === undefined || o.endDate === null || o.endDate === "") return false;
  if (!isIsoDate(o.endDate)) return true;
  if (!isIsoDate(o.date)) return false;
  // Invertido só é recuperável dentro do teto; fora dele vira descarte.
  return o.endDate < o.date && spanInDays(o.endDate, o.date) > MAX_INTERVAL_DAYS;
}

/**
 * Normaliza o payload cru (vindo da IA ou do banco) descartando o que não
 * casa com o shape. Nunca lança — entrada suja vira lista vazia.
 */
export function normalizeAcademicEvents(raw: unknown): AcademicEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: AcademicEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (!isIsoDate(o.date)) continue;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title) continue;
    const category = CATEGORIES.includes(o.category as AcademicEventCategory)
      ? (o.category as AcademicEventCategory)
      : "evento";
    // `endDate` ruim NÃO some mais calado. A extração por Vision erra o fim do
    // intervalo de duas formas comuns em tabela/OCR: TROCA A ORDEM ("Recesso
    // 01 a 31/07" volta como date=31/07, endDate=01/07) ou devolve um dia que
    // não existe no mês ("2026-06-31"). Nos dois casos o campo virava null sem
    // nenhum sinal e o intervalo colapsava num dia só: `getNonTeachingDays`
    // bloqueava 1 dia em vez de 31, as aulas voltavam a ser desenhadas em
    // 02–31/07, o aviso de "mês sem aula" não disparava, `formatEventDate`
    // mostrava um evento de um dia na preview e o `academic_calendar` gravado
    // no perfil — fonte única do prompt da Lumi — ficava com o recesso
    // truncado, então ela planejava estudo dentro do recesso.
    let date = o.date;
    let endDate = isIsoDate(o.endDate) ? o.endDate : null;
    if (endDate && endDate < date) {
      if (spanInDays(endDate, date) <= MAX_INTERVAL_DAYS) {
        // Ordem trocada é RECUPERÁVEL: as duas pontas do intervalo estão
        // certas, só vieram invertidas. Desinverte em vez de jogar fora — mas
        // só dentro do teto, pra um erro grosseiro (ano trocado) não virar um
        // intervalo de meses bloqueando aula.
        const swapped = date;
        date = endDate;
        endDate = swapped;
      } else {
        endDate = null;
      }
    }
    if (
      endDate &&
      (category === "feriado" || category === "recesso") &&
      spanInDays(date, endDate) > MAX_INTERVAL_DAYS
    ) {
      // Intervalo maior que o teto NAS DUAS CATEGORIAS QUE APAGAM AULA = linha
      // mal categorizada (o clássico "02/02 a 20/12 – PERÍODO LETIVO" voltando
      // como recesso). Mantém o dia de início (a data em si é confiável) e
      // larga o fim, senão um único palpite da IA apaga o ano letivo inteiro da
      // grade — sem UI pra desfazer. O teto NÃO vale pras outras categorias: um
      // "marco" de término legitimamente carrega o intervalo do período letivo
      // inteiro ("02/02 a 20/12") e o `getTermWindows` lê `endDate ?? date` —
      // cortar ali colapsaria a própria janela letiva.
      console.warn(
        `[academic-calendar] intervalo de ${spanInDays(date, endDate)} dias em "${title}" (${date} → ${endDate}) excede o teto de ${MAX_INTERVAL_DAYS} dias; tratando como evento de um dia.`,
      );
      endDate = null;
    } else if (o.endDate != null && o.endDate !== "" && !endDate) {
      console.warn(
        `[academic-calendar] endDate inválido descartado em "${title}" (date=${date}, endDate=${String(o.endDate)}): o evento vira um dia só.`,
      );
    }
    const semRaw = typeof o.semester === "number" ? o.semester : Number(o.semester);
    const semester = semRaw === 1 || semRaw === 2 ? semRaw : null;
    const termBoundary =
      o.termBoundary === "start" || o.termBoundary === "end"
        ? (o.termBoundary as TermBoundary)
        : null;
    out.push({
      date,
      endDate: endDate && endDate >= date ? endDate : null,
      title: title.slice(0, 160),
      category,
      semester,
      // Só grava quando existe, pra não poluir o JSON salvo com nulls.
      ...(termBoundary ? { termBoundary } : {}),
    });
  }
  // Ordena cronologicamente e remove duplicatas exatas (data + título).
  const seen = new Set<string>();
  return out
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((e) => {
      const k = `${e.date}|${e.title.toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

export function normalizeAcademicCalendar(raw: unknown): AcademicCalendar | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const events = normalizeAcademicEvents(o.events);
  if (events.length === 0) return null;
  const yearRaw = typeof o.year === "number" ? o.year : Number(o.year);
  return {
    institution:
      typeof o.institution === "string" ? o.institution.trim().slice(0, 160) : null,
    year: Number.isInteger(yearRaw) && yearRaw > 2000 && yearRaw < 2100 ? yearRaw : null,
    sourceFile:
      typeof o.sourceFile === "string" ? o.sourceFile.trim().slice(0, 200) : null,
    importedAt: typeof o.importedAt === "string" ? o.importedAt : null,
    events,
  };
}

function formatBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * "10/06/2026", "22/06 a 26/06/2026" pra intervalos no mesmo ano e
 * "01/12/2026 a 31/01/2027" quando o intervalo cruza a virada do ano.
 */
export function formatEventDate(e: AcademicEvent): string {
  if (!e.endDate || e.endDate === e.date) return formatBr(e.date);
  // Intervalo que ATRAVESSA a virada do ano precisa do ano nas DUAS pontas.
  // Linha comuníssima de calendário brasileiro ("REMATRÍCULA — 01/12 A 31/01",
  // "RECESSO DE FIM DE ANO — 20/12 A 31/01") virava `01/12 a 31/01/2027`, que
  // se lê como um intervalo INVERTIDO dentro de 2027 (começa depois de
  // terminar). Na preview ainda dava pra salvar pelo cabeçalho do mês em volta,
  // mas `renderAcademicCalendarForPrompt` emite essa mesma string CRUA no system
  // prompt da Lumi, sem nenhum agrupamento por mês: `- 01/12 a 31/01/2027:
  // Período de rematrícula [Prazo]`. Ela passava a falar do prazo com o ano
  // errado ou a ignorá-lo por parecer incoerente — justo no evento cujo valor
  // inteiro é a data. Só omite o ano do início quando as duas pontas caem no
  // mesmo ano, que é o caso em que ele é redundante mesmo.
  if (e.date.slice(0, 4) !== e.endDate.slice(0, 4)) {
    return `${formatBr(e.date)} a ${formatBr(e.endDate)}`;
  }
  const [, em, ed] = e.date.split("-");
  return `${ed}/${em} a ${formatBr(e.endDate)}`;
}

/* ---------------- janela letiva (para expansão das aulas) ---------------- */

export type TermWindow = {
  start: string;
  end: string;
  /**
   * Menor data que o DOCUMENTO importado descreve (menor `date` do calendário).
   * Não delimita período letivo: delimita o que o PDF tem autoridade pra dizer.
   * Antes dela o calendário não afirma "não tem aula", ele simplesmente não
   * fala do período — e `isWithinTerm`/`describeTermGap` tratam isso como SEM
   * restrição. Carregado aqui porque `isWithinTerm(iso, windows)` só recebe as
   * janelas (a assinatura é usada em `expandSlotsToEvents`), então a cobertura
   * precisa viajar junto delas.
   */
  coverageStart?: string;
};

/** Menor `coverageStart` conhecido entre as janelas (null se nenhuma tiver). */
function coverageStartOf(windows: TermWindow[]): string | null {
  let min: string | null = null;
  for (const w of windows) {
    if (w.coverageStart && (min === null || w.coverageStart < min)) {
      min = w.coverageStart;
    }
  }
  return min;
}

/**
 * Tira acento, caixa e marca de ordinal do título antes de casar. O título vem
 * verbatim do PDF (o prompt manda preservar o texto do evento), então a
 * redação varia: "Início do 1º semestre letivo", "INÍCIO DAS AULAS",
 * "Retorno das atividades letivas"...
 */
function normTitle(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(\d+)\s*[º°ª]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// Tolerantes de propósito: aceitam qualquer coisa entre o verbo e o
// substantivo ("do 1 semestre", "das aulas", "do ano letivo"...).
const START_RE =
  /\b(inicio|comeco|retorno|reinicio|abertura)\b[^.]*\b(semestre|periodo|ano|aulas?|letiv[oa]s?)\b/;
const END_RE =
  /\b(termino|encerramento|fim|ultimo dia)\b[^.]*\b(semestre|periodo|ano|aulas?|letiv[oa]s?)\b/;
// "Fim do recesso do meio de ano" é retomada, não término de semestre — por
// isso o veto existe. Mas ele precisa ser POSICIONAL, não "a palavra recesso
// aparece no título": o marco de retomada quase sempre CITA o recesso como
// referência temporal ("Retorno das aulas após o recesso de julho", "Fim do
// recesso e início do 2º semestre letivo") e o veto cru derrubava justamente
// esse INÍCIO. Sem início em `startMarks`, nem o passo 1 nem o passo 2 do
// `getTermWindows` geram janela pro semestre — `isWithinTerm` devolve false de
// agosto a dezembro, `expandSlotsToEvents` pula todos esses dias e a grade
// inteira do semestre em curso some do mês, da semana, da agenda e da sidebar,
// com o banner dizendo "o período letivo terminou em 30/06" logo depois de o
// aluno ter subido o calendário do ano corrente. E nada é logado: o passo 3 só
// avisa quando NENHUMA janela nasce, e a do 1º semestre existe.
//
// Aqui o veto só dispara quando o recesso/férias é o OBJETO do verbo — vem
// DEPOIS dele e sem nenhum termo letivo no meio. "Início do recesso do meio de
// ano" e "Fim do recesso" seguem fora (como antes); "Término do semestre
// letivo e início do recesso" volta a valer como término.
const BREAK_RE = "(?:recesso|ferias|feriado)";
const NOT_BREAK_OBJ = "(?:(?!\\b(?:semestre|aulas?|letiv[oa]s?|atividades)\\b).)*?";
const START_OF_BREAK_RE = new RegExp(
  `\\b(?:inicio|comeco|retorno|reinicio|abertura)\\b${NOT_BREAK_OBJ}\\b${BREAK_RE}\\b`,
);
const END_OF_BREAK_RE = new RegExp(
  `\\b(?:termino|encerramento|fim|ultimo dia)\\b${NOT_BREAK_OBJ}\\b${BREAK_RE}\\b`,
);

function isTermStart(title: string): boolean {
  const t = normTitle(title);
  return START_RE.test(t) && !START_OF_BREAK_RE.test(t);
}

function isTermEnd(title: string): boolean {
  const t = normTitle(title);
  return END_RE.test(t) && !END_OF_BREAK_RE.test(t);
}

/**
 * Deriva as janelas letivas (início → término) a partir dos marcos do
 * calendário. Um calendário anual costuma render 2 janelas (1º e 2º semestre).
 *
 * Serve pra limitar a repetição das aulas da grade horária: sem isso, uma
 * aula de segunda 08:00 se repetiria infinitamente — inclusive em janeiro,
 * em julho e em 2030.
 *
 * INVARIANTE: na dúvida, RESTRINGIR MENOS. Uma aula a mais em janeiro é um
 * incômodo; um semestre inteiro sumido com o banner "Fora do período letivo"
 * é o usuário achando que o app perdeu a grade dele. Por isso nenhum início
 * é descartado: sem término conhecido, a janela fecha no fim do ano. E pelo
 * mesmo motivo cada janela carrega o `coverageStart` do documento: o que está
 * ANTES do que o PDF descreve não é restringido (ver `isWithinTerm`).
 */
export function getTermWindows(cal: AcademicCalendar | null): TermWindow[] {
  if (!cal || cal.events.length === 0) return [];
  // `termBoundary`, quando o extrator classifica, vale por si. Sem ele cai no
  // fallback textual ancorado em category === "marco" — que é obrigatório, não
  // opcional: os calendários já salvos (migration 056) não têm o campo.
  const marcos = cal.events.filter((e) => e.category === "marco" || e.termBoundary);
  if (marcos.length === 0) return [];

  const startMarks = marcos.filter((e) =>
    e.termBoundary ? e.termBoundary === "start" : isTermStart(e.title),
  );
  const endMarks = marcos.filter((e) =>
    e.termBoundary ? e.termBoundary === "end" : isTermEnd(e.title),
  );
  const windows: TermWindow[] = [];

  // Teto lexicográfico "mesma data no ano seguinte". Não precisa ser data
  // válida (29/02 + 1 ano): só serve de limite em comparação de string.
  const oneYearAfter = (iso: string) =>
    `${Number(iso.slice(0, 4)) + 1}${iso.slice(4)}`;

  // Véspera de uma data ISO (aqui precisa ser data de verdade: virada de mês e
  // de ano). Entrada inválida devolve "NaN-NaN-NaN", que perde a comparação de
  // string contra o fim do ano e cai no limite mais folgado — nunca inverte a
  // janela.
  const dayBefore = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() - 1);
    return toLocalIso(d);
  };

  // 1) Sinal primário: o semestre declarado na extração. Agrupa os marcos por
  //    ANO + semestre e deriva min(início) → max(término) de cada grupo, sem
  //    depender de como o título foi redigido.
  //
  //    O ano PRECISA entrar na chave: o perfil pode ter dois calendários
  //    fundidos (o aluno sobe o de 2027 em dezembro e o dialog funde com o de
  //    2026). Agrupando só por `semester`, o grupo sem=2 casava o início de
  //    03/08/2026 com o término de 15/12/2027 — janela de 17 meses em que as
  //    aulas voltavam a aparecer nas férias de janeiro e no recesso de julho,
  //    e o banner "Fora do período letivo" nunca mais aparecia (feature virava
  //    no-op silencioso).
  const groupKeys = Array.from(
    new Set(
      startMarks
        .filter((e) => e.semester === 1 || e.semester === 2)
        .map((e) => `${e.date.slice(0, 4)}|${e.semester}`),
    ),
  ).sort();
  for (const key of groupKeys) {
    const sem = key.split("|")[1];
    const starts = startMarks
      .filter((e) => `${e.date.slice(0, 4)}|${e.semester}` === key)
      .map((e) => e.date)
      .sort();
    if (starts.length === 0) continue;
    const start = starts[0];
    // Teto de 12 meses em vez de "fim do ano do início" porque um 2º semestre
    // pode legitimamente fechar no ano seguinte (término em fevereiro), mas o
    // término do MESMO semestre do ano seguinte nunca pode virar o fim desta
    // janela.
    const limit = oneYearAfter(start);
    const end = endMarks
      .filter((e) => String(e.semester) === sem)
      .map((e) => e.endDate ?? e.date)
      .filter((d) => d >= start && d <= limit)
      .sort()
      .pop();
    if (end) windows.push({ start, end });
  }

  // 2) Início ainda não coberto (semestre nulo, ou grupo sem término): casa com
  //    o primeiro término posterior; se não houver, FECHA no fim do ano em vez
  //    de descartar a janela.
  const allEnds = endMarks.map((e) => e.endDate ?? e.date).sort();
  for (const e of startMarks) {
    const start = e.date;
    if (windows.some((w) => start >= w.start && start <= w.end)) continue;
    // O `find` casava o início com QUALQUER término posterior — o teto do passo
    // 1 só era aplicado LÁ. Num perfil com dois calendários fundidos (o aluno
    // sobe o do 2º semestre de 2026, que não traz linha de término, e depois o
    // anual de 2027), o início de 03/08/2026 casava com o término de 30/06/2027
    // e nascia janela de 11 meses: `isWithinTerm` devolvia true em janeiro,
    // fevereiro e março de 2027, a grade era desenhada durante as férias e por
    // cima do 1º semestre de 2027, e o banner "Fora do período letivo" nunca
    // aparecia.
    //
    // Dois limites, porque só o de 12 meses não pega esse caso (11 < 12):
    //  - `startLimit`: o mesmo teto de 12 meses do passo 1;
    //  - `nextStart`: uma janela NUNCA pode engolir o início do período
    //    seguinte. É esse o sinal que separa o caso ruim (03/08/2026 → 30/06/
    //    2027, com o início de 01/02/2027 no meio) do calendário ANUAL legítimo
    //    de ~10,5 meses (02/02 → 20/12, sem nenhum outro início no meio), que
    //    um teto de duração menor derrubaria junto.
    // Sem término aceitável cai no FALHA ABERTO abaixo (fim do ano, limitado
    // pelo MESMO `nextStart`), que restringe menos e agora fica logado.
    const startLimit = oneYearAfter(start);
    const nextStart = startMarks
      .map((m) => m.date)
      .filter((d) => d > start)
      .sort()[0];
    const end = allEnds.find(
      (d) => d > start && d <= startLimit && (!nextStart || d <= nextStart),
    );
    if (end) {
      windows.push({ start, end });
      continue;
    }
    // FALHA ABERTO: fecha no fim do ano — mas nunca ANTES do próprio início.
    // Usar `cal.year` cru nascia janela INVERTIDA (end < start) quando o
    // marco é de ano posterior ao salvo: o upload persiste `year: year ??
    // prevYear`, então um PDF de 2027 cujo campo "year" não veio na extração
    // fica gravado como 2026 e o fallback fechava em 2026-12-31. Como
    // `isWithinTerm` exige `iso >= start && iso <= end`, essa janela não é
    // satisfeita por data NENHUMA: o semestre inteiro sumia com o banner
    // "Fora do período letivo" — o oposto exato do invariante acima.
    //
    // Fecha no fim do ano do PRÓPRIO início, sem consultar `cal.year`: além de
    // nunca inverter (`${ano do start}-12-31` é sempre >= start), evita o
    // estouro simétrico do teto de 12 meses aplicado logo acima — num perfil
    // com calendários fundidos o `cal.year` pode ser POSTERIOR ao marco e o
    // fallback abria janela de 16 meses, com aula desenhada nas férias e no
    // semestre seguinte.
    //
    // E NUNCA depois do próximo início: o guard `nextStart` acima recusa o
    // término que ultrapassa o início seguinte, então o falha-aberto não pode
    // ignorar o mesmo limite — senão a recusa produz uma janela MAIOR do que a
    // que foi recusada. Era o que acontecia no calendário com DOIS marcos de
    // início no mesmo semestre ("Abertura do ano letivo" 02/02 + "Início das
    // aulas" 05/02, comuns quando o extrator não consegue preencher `semester`,
    // ou quando os términos vêm sem semestre e o passo 1 não gera nada): o
    // início de 02/02 via nextStart=05/02, rejeitava os términos reais de 30/06
    // e 15/12 e abria [02/02, 31/12]. Os inícios de 05/02 e 03/08 passavam a
    // cair DENTRO dessa janela e eram pulados, sobrava UMA janela cobrindo o ano
    // inteiro: `isWithinTerm` voltava true de 01/07 a 02/08, a grade da semana
    // era desenhada nas férias entre semestres e o banner "Fora do período
    // letivo" não aparecia mais.
    //
    // Fechando na VÉSPERA do próximo início, o 05/02 volta a ser processado e
    // casa com 30/06 (e o 03/08 com 15/12), sem abrir buraco: [02/02, 04/02] e
    // [05/02, 30/06] são contíguas. E o caso que motivou o guard segue igual —
    // lá o próximo início é do ano seguinte, então quem manda é o fim do ano.
    const yearEnd = `${start.slice(0, 4)}-12-31`;
    const beforeNextStart = nextStart ? dayBefore(nextStart) : null;
    const fallbackEnd =
      beforeNextStart && beforeNextStart < yearEnd ? beforeNextStart : yearEnd;
    windows.push({ start, end: fallbackEnd });
    console.warn(
      `[academic-calendar] início em ${start} sem término correspondente; janela fechada em ${fallbackEnd}. Títulos dos marcos:`,
      marcos.map((m) => m.title),
    );
  }

  // 3) Tem marco mas nada virou janela: antes isso era silêncio total e a
  //    feature de período letivo virava no-op sem ninguém perceber.
  if (windows.length === 0) {
    console.warn(
      "[academic-calendar] calendário tem marcos mas nenhuma janela letiva foi derivada — aulas ficarão sem limite de período. Títulos:",
      marcos.map((m) => m.title),
    );
  }

  // Cobertura do documento = a menor data de evento que ele traz. Vai colada em
  // TODA janela (mesmo valor) pra não depender de ordem/índice na hora de ler.
  const coverageStart = cal.events.reduce(
    (min, e) => (e.date < min ? e.date : min),
    cal.events[0].date,
  );

  return windows
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((w) => ({ ...w, coverageStart }));
}

/**
 * Dias em que NÃO há aula: feriados e recessos (intervalos expandidos dia a
 * dia). Set de "yyyy-mm-dd" pra lookup O(1) na expansão.
 */
export function getNonTeachingDays(cal: AcademicCalendar | null): Set<string> {
  const out = new Set<string>();
  if (!cal) return out;
  for (const e of cal.events) {
    if (e.category !== "feriado" && e.category !== "recesso") continue;
    const cursor = new Date(`${e.date}T00:00:00`);
    const last = new Date(`${e.endDate ?? e.date}T00:00:00`);
    // Guarda contra intervalo absurdo vindo de extração ruim. O teto é o mesmo
    // `MAX_INTERVAL_DAYS` da normalização (segunda linha de defesa pra quem
    // montar um AcademicCalendar sem passar por `normalizeAcademicEvents`):
    // com o antigo 400 uma única linha mal categorizada como "recesso" apagava
    // até 400 dias de aula da grade — e não há UI pra desfazer isso.
    let guard = 0;
    while (cursor.getTime() <= last.getTime() && guard <= MAX_INTERVAL_DAYS) {
      // Data LOCAL: o cursor é meia-noite local e toISOString() a jogaria pro
      // dia anterior em qualquer fuso positivo, deslocando o Set inteiro.
      out.add(toLocalIso(cursor));
      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
  }
  return out;
}

/** A data cai dentro de alguma janela letiva? Sem janelas → sem restrição. */
export function isWithinTerm(iso: string, windows: TermWindow[]): boolean {
  if (windows.length === 0) return true;
  // Antes do que o documento COBRE não é "fora do período letivo", é "não
  // coberto pelo documento" — e aí vale o mesmo que não ter calendário nenhum.
  //
  // Sem isso, o caso comuníssimo do PDF de UM semestre (a faculdade publica um
  // por semestre) apagava o semestre em curso: aluno em 12/05 sobe o calendário
  // do 2º semestre, `getTermWindows` devolve só [03/08 → 15/12] e todo dia de
  // maio/junho/julho era pulado em `expandSlotsToEvents` — mês, semana, agenda
  // e sidebar SEM UMA AULA do semestre que ele está cursando agora, com o
  // banner ainda dizendo "o semestre começa em 03/08". Mesmo desfecho ao subir
  // o calendário de 2027 em dezembro: sumia 2026 inteiro. Como não existe UI
  // pra limpar o `academic_calendar` (o upload só faz PATCH com merge), o aluno
  // não tinha como desfazer. É exatamente o "um semestre inteiro sumido" que o
  // invariante do getTermWindows manda evitar: na dúvida, RESTRINGIR MENOS.
  //
  // Repare que só o que vem ANTES da cobertura fica livre: janeiro de um
  // calendário anual (que descreve janeiro) segue restrito, o buraco entre os
  // dois semestres segue restrito, e depois do fim do documento segue restrito
  // — senão a aula de segunda 08:00 voltaria a se repetir até 2030.
  const coverageStart = coverageStartOf(windows);
  if (coverageStart && iso < coverageStart) return true;
  return windows.some((w) => iso >= w.start && iso <= w.end);
}

/**
 * Explica por que um mês aparece sem aulas. Mês vazio e mudo parece bug —
 * esta mensagem transforma "o app quebrou" em "ah, é férias".
 * Retorna null quando o mês tem pelo menos um dia letivo.
 */
export function describeTermGap(
  year: number,
  month0: number,
  windows: TermWindow[],
): { title: string; detail: string } | null {
  if (windows.length === 0) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const first = `${year}-${pad(month0 + 1)}-01`;
  const lastDay = new Date(year, month0 + 1, 0).getDate();
  const last = `${year}-${pad(month0 + 1)}-${pad(lastDay)}`;

  // Mês que pega qualquer dia ANTERIOR à cobertura do documento tem aula (o
  // `isWithinTerm` não bloqueia lá), então o banner seria mentira — e era a
  // mentira mais cara do fluxo: pra quem subiu só o PDF do 2º semestre, maio
  // aparecia vazio afirmando "o semestre começa em 03/08" enquanto ele estava
  // cursando o semestre naquele mês.
  const coverageStart = coverageStartOf(windows);
  if (coverageStart && first < coverageStart) return null;

  // Algum dia do mês cai em janela letiva? Então não é um "buraco".
  const overlaps = windows.some((w) => w.start <= last && w.end >= first);
  if (overlaps) return null;

  const next = windows
    .map((w) => w.start)
    .filter((s) => s > last)
    .sort()[0];
  const prevEnd = windows
    .map((w) => w.end)
    .filter((e) => e < first)
    .sort()
    .pop();

  const fmt = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
  };

  if (next) {
    return {
      title: "Fora do período letivo",
      detail: prevEnd
        ? `O semestre terminou em ${fmt(prevEnd)} e o próximo começa em ${fmt(next)}. Suas aulas voltam a aparecer a partir dessa data.`
        : `O semestre começa em ${fmt(next)}. Suas aulas aparecem a partir dessa data.`,
    };
  }
  return {
    title: "Fora do período letivo",
    detail: prevEnd
      ? `O período letivo terminou em ${fmt(prevEnd)}. Suba o calendário do próximo ano pra ver as aulas seguintes.`
      : "Este mês está fora do período letivo do calendário que você importou.",
  };
}

/**
 * Renderiza o calendário pro system prompt do agente Lumi — só o que é
 * acionável: o que está por vir na janela informada. Retorna null se não
 * houver nada relevante (evita queimar tokens com calendário vencido).
 */
export function renderAcademicCalendarForPrompt(
  cal: AcademicCalendar | null,
  opts: { today?: Date; horizonDays?: number; max?: number } = {},
): string | null {
  if (!cal || cal.events.length === 0) return null;
  const today = opts.today ?? new Date();
  // Roda no servidor (UTC): sem isso, das 21h à meia-noite em Brasília o
  // "hoje" já seria amanhã e o evento de hoje sumiria do prompt.
  const todayIso = isoDateInSaoPaulo(today);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + (opts.horizonDays ?? 120));
  const horizonIso = isoDateInSaoPaulo(horizon);

  const upcoming = cal.events
    // Um intervalo em curso (recesso que começou ontem) ainda importa.
    .filter((e) => (e.endDate ?? e.date) >= todayIso && e.date <= horizonIso)
    .slice(0, opts.max ?? 25);
  if (upcoming.length === 0) return null;

  const lines = upcoming.map(
    (e) =>
      `- ${formatEventDate(e)}: ${e.title} [${ACADEMIC_CATEGORY_META[e.category].label}]`,
  );
  const header = cal.institution
    ? `CALENDÁRIO ACADÊMICO OFICIAL (${cal.institution}${cal.year ? `, ${cal.year}` : ""}) — próximas datas:`
    : "CALENDÁRIO ACADÊMICO OFICIAL — próximas datas:";
  return `${header}\n${lines.join("\n")}\nUse essas datas pra planejar estudo, avisar de prazos e evitar sugerir estudo em recesso/feriado.`;
}
