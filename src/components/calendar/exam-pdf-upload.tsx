"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckSquare,
  FileText,
  Square,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ProgressPanel } from "@/components/ui/progress-bar";
import {
  EVENT_TYPE_META,
  CalendarStorageError,
  addEventsBulkAsync,
  listEventsAsync,
  type CalendarEventType,
} from "@/lib/calendar-events";
import { isIsoDate, toLocalIso } from "@/lib/academic-calendar";
import type { Subject } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LIMITS, PDF_LIMIT_MB } from "@/lib/api-security";

/* ---------------- types ---------------- */

type ExtractedEventType = "prova" | "trabalho" | "aula" | "bloco" | "outro";

type ExtractedEvent = {
  date: string; // "YYYY-MM-DD"
  title: string;
  type: ExtractedEventType;
  startTime?: string;
  endTime?: string;
  subjectGuess?: string;
  description?: string;
};

type ExtractResponse = {
  events?: ExtractedEvent[];
  error?: string;
  demo?: boolean;
  // Se a rota passar a anunciar o corte (como a irmã academic-calendar já faz),
  // vale mais que a heurística abaixo — que é o que sobra enquanto ela devolve
  // só `{events}`, sem contador e sem flag.
  truncated?: boolean;
};

/**
 * Espelho do corte que a rota /api/calendar/extract-pdf ainda aplica CALADA:
 * ela normaliza os eventos NA ORDEM DO DOCUMENTO e para no 80º (`MAX_EVENTS`).
 * Como o corte é pela cauda, o que some é sempre o fim do ano letivo: exames
 * finais, entregas de novembro/dezembro, provas de faltosos. Ver o aviso
 * montado no handleFile.
 *
 * O OUTRO corte que este arquivo espelhava (`TEXT_SLICE_LIMIT`, 30k chars)
 * MORREU: a rota parou de mandar `text.slice(0, 30_000)` e passou a fatiar o
 * texto INTEIRO em blocos com sobreposição, mandando todos pro modelo
 * (`splitIntoChunks`). Enquanto a heurística `text.length > 30_000` ficou de
 * pé aqui, ela mentia em todo cronograma de ano inteiro (15-40 páginas =
 * 45-120KB): a tarja âmbar fixa + o `toast.warning` avisavam que "as últimas
 * datas podem não estar na lista" com a lista COMPLETA na tela, e a instrução
 * "envie o calendário em partes" empurrava o aluno pro re-upload — extração
 * paga de novo, 2 dos 10 req/60s por IP queimados — ou pra digitar à mão prova
 * que já estava lá. Só o teto de 80 eventos sobrou como corte real.
 */
const ROUTE_MAX_EVENTS = 80;

type PreviewRow = {
  id: string; // index estável
  selected: boolean;
  event: ExtractedEvent;
  matchedSubjectId?: string;
};

export type ExamPdfUploadProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  subjects: Subject[];
  onCreated?: () => void;
};

/* ---------------- pdfjs lazy loader ---------------- */

let pdfjsWorkerConfigured = false;
async function getPdfJs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjsWorkerConfigured && typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.legacy.mjs";
    pdfjsWorkerConfigured = true;
  }
  return pdfjs;
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await getPdfJs();
  const buf = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf) });
  const doc = await loadingTask.promise;
  try {
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((it) => ("str" in it ? it.str : ""))
        .filter((s) => s.length > 0)
        .join(" ");
      if (pageText.trim().length > 0) {
        parts.push(`--- Página ${i} ---\n${pageText}`);
      }
      page.cleanup();
    }
    return parts.join("\n\n");
  } finally {
    // Libera o documento e o buffer no worker do pdf.js mesmo se o parse falhar
    // (PDF corrompido/criptografado, worker que morre).
    await doc.destroy().catch(() => {});
  }
}

/* ---------------- subject matching ---------------- */

/**
 * Normaliza string pra matching fuzzy: lowercase + remove acentos + colapsa espaços.
 */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Nível no fim do nome: "Anatomia Humana II" → 2, "Cálculo 3" → 3, sem → 0. */
const LEVEL_SUFFIX_RE = /\s+([ivx]{1,4}|\d{1,2})\.?$/;
const ROMAN_LEVELS: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
};

function subjectLevel(normalized: string): number {
  const m = LEVEL_SUFFIX_RE.exec(normalized);
  if (!m) return 0;
  const token = m[1];
  if (/^\d+$/.test(token)) return Number(token);
  return ROMAN_LEVELS[token] ?? 0;
}

/**
 * "Contém" respeitando fronteira de PALAVRA. O `includes` cru casa no meio de
 * palavra, e é por aí que "Prova de Bioquímica" grudava numa matéria "Química"
 * ('prova de bioquimica'.includes('quimica') é true, porque "quimica" está
 * dentro de "bioquimica"). Como `normalize` já tirou acento e caixa, sobra
 * [a-z0-9] pra letra/dígito — vizinho alfanumérico dos dois lados = está no
 * meio de outra palavra, não vale como match.
 */
function includesWord(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false;
  const isAlnum = (ch: string | undefined) => !!ch && /[a-z0-9]/.test(ch);
  for (let from = 0; from <= haystack.length; ) {
    const i = haystack.indexOf(needle, from);
    if (i < 0) return false;
    const before = i > 0 ? haystack[i - 1] : undefined;
    const after = haystack[i + needle.length];
    if (!isAlnum(before) && !isAlnum(after)) return true;
    from = i + 1;
  }
  return false;
}

function findSubjectMatch(
  guess: string | undefined,
  subjects: Subject[],
): string | undefined {
  if (!guess) return undefined;
  const g = normalize(guess);
  if (g.length === 0) return undefined;

  // 1. Match exato (normalized)
  const exact = subjects.find((s) => normalize(s.name) === g);
  if (exact) return exact.id;

  /**
   * Daqui pra baixo é PALPITE (inclusão / palavra em comum), e todas as linhas
   * do preview nascem com `selected: true` — o palpite errado é o DEFAULT que o
   * aluno confirma no "Adicionar". O caso que quebrava era a numeração romana,
   * que em medicina/engenharia é a regra e não a exceção: com "Anatomia Humana
   * I" salva (semestre anterior ainda ativo, ou a II ainda não cadastrada) e
   * subjectGuess "Anatomia Humana II", 'anatomia humana ii'.includes('anatomia
   * humana i') é true → a P1 de Anatomia II nascia com o subject_id da
   * Anatomia I. Na agenda o evento herda cor e ícone da matéria errada e o
   * AgendaEventRow/SidebarEventItem viram <Link href="/subject/<id-errado>">:
   * o clique leva pra outra matéria e o modal de detalhes — única via de
   * excluir o evento — fica inalcançável.
   * Regra (a mesma já aplicada no schedule-pdf-upload): fora do nome idêntico,
   * só palpita entre matérias do MESMO nível (romano ou arábico — "Cálculo 2"
   * e "Cálculo II" contam igual). Nível diferente = matéria diferente; na
   * dúvida a linha nasce "— sem matéria —", que o aluno vê e corrige no select
   * do preview, e o evento sem matéria continua abrindo o modal normalmente.
   */
  const level = subjectLevel(g);
  const sameLevel = subjects.filter(
    (s) => subjectLevel(normalize(s.name)) === level,
  );

  // 2. Match por inclusão (subject name contém guess ou vice-versa)
  const contains = sameLevel.find((s) => {
    const n = normalize(s.name);
    return includesWord(n, g) || includesWord(g, n);
  });
  if (contains) return contains.id;

  /**
   * 3. Último palpite, e o mais perigoso: enquanto bastava UMA palavra em comum
   * (`guessWords.some`), o adjetivo genérico do nome — que em medicina e
   * engenharia é a regra, não a exceção — casava matérias diferentes. Com
   * "Química Geral" salva e subjectGuess "Patologia Geral" (matéria que o aluno
   * nem cadastrou), nível 0 dos dois lados não filtra nada e
   * includesWord("quimica geral", "geral") é true: a P1 de Patologia nascia com
   * o subject_id de Química Geral, já marcada (toda linha nasce
   * `selected: true`, e o único sinal é um <select> de 40px numa tabela de 20
   * linhas). Gravado o subject_id errado, o chip no mês e na semana sai com a
   * COR e o ÍCONE de Química Geral, a view Agenda e a sidebar imprimem
   * "· Química Geral" embaixo do título e o modal de detalhes — única via de
   * editar/excluir — aponta "→ Química Geral" pra /subject/<id-errado>: a prova
   * de Patologia fica pendurada numa matéria que não tem prova nenhuma.
   * Mesma família: Cálculo Diferencial × Cálculo Integral, Anatomia Humana ×
   * Bioquímica Humana. Regra (a mesma já aplicada no schedule-pdf-upload):
   * TODAS as palavras significativas de um dos nomes têm que estar no outro —
   * ainda casa o que justifica este passo ("Anatomia Humana I" × "Anatomia I")
   * e recusa quem só compartilha o adjetivo. Na dúvida a linha nasce
   * "— sem matéria —", que o aluno vê e corrige no select do preview.
   */
  const guessWords = g.split(/\s+/).filter((w) => w.length >= 4);
  if (guessWords.length > 0) {
    const wordMatch = sameLevel.find((s) => {
      const n = normalize(s.name);
      const nWords = n.split(/\s+/).filter((w) => w.length >= 4);
      return (
        guessWords.every((w) => includesWord(n, w)) ||
        (nWords.length > 0 && nWords.every((w) => includesWord(g, w)))
      );
    });
    if (wordMatch) return wordMatch.id;
  }

  return undefined;
}

/* ---------------- date/time formatting ---------------- */

const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function formatDate(dateISO: string): string {
  // Cinto de segurança do filtro do handleFile: numa data que não existe
  // ("2026-11-31") o `new Date` abaixo ROLA pro dia seguinte, então o dia da
  // semana viria de OUTRO dia e a linha sairia "ter 31/11" — cara de data
  // legítima pra uma data que o app grava em 01/12. Sem dia da semana o aluno
  // enxerga que tem algo errado ali em vez de aprovar no automático.
  if (!isIsoDate(dateISO)) return dateISO;
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = WEEKDAYS_SHORT[dt.getDay()];
  return `${wd} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

function combineDateTimeISO(date: string, time: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
  return dt.toISOString();
}

function defaultIsoFor(date: string, hour: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  const dt = new Date(y, mo - 1, d, hour, 0, 0, 0);
  return dt.toISOString();
}

/* ---------------- main component ---------------- */

export function ExamPdfUpload({
  open,
  onOpenChange,
  userId,
  subjects,
  onCreated,
}: ExamPdfUploadProps) {
  // Enquanto está extraindo/salvando, o dialog não pode ser fechado: o corpo é
  // desmontado pelo `{open && …}` e o trabalho em andamento sumiria da tela
  // (mas os toasts, que são globais, continuariam aparecendo).
  const [busy, setBusy] = useState(false);

  // Rede de segurança: se algo fechar o dialog por fora, nunca deixar `busy`
  // preso em true (senão o próximo open já nasce sem X e sem ESC).
  useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl"
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (busy) e.preventDefault();
        }}
        hideClose={busy}
      >
        {open && (
          <ExamPdfUploadBody
            userId={userId}
            subjects={subjects}
            onBusyChange={setBusy}
            onClose={() => onOpenChange(false)}
            onCreated={() => {
              onCreated?.();
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExamPdfUploadBody({
  userId,
  subjects,
  onBusyChange,
  onClose,
  onCreated,
}: {
  userId: string;
  subjects: Subject[];
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onCreated: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<
    "idle" | "extracting" | "preview" | "saving"
  >("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [demoNote, setDemoNote] = useState<boolean>(false);
  /**
   * Aviso de leitura CORTADA. Fica no estado, e não só num toast, porque o
   * toast some muito antes de o aluno terminar de conferir 80 linhas — e é
   * exatamente no clique final ("Adicionar 80 eventos selecionados") que ele
   * decide levar meio calendário achando que é o ano inteiro.
   */
  const [truncatedNote, setTruncatedNote] = useState<string | null>(null);

  // Trabalho em voo: o wrapper usa isso pra bloquear ESC/overlay/X.
  useEffect(() => {
    onBusyChange(phase === "extracting" || phase === "saving");
  }, [phase, onBusyChange]);

  // Defesa em profundidade pro que escapa do bloqueio acima (troca de rota,
  // logout, hot-reload): marca o trabalho como cancelado, aborta a requisição
  // e mata o toast de loading que ficaria girando pra sempre.
  const cancelledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const toastIdRef = useRef<string | number | null>(null);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
      if (toastIdRef.current !== null) toast.dismiss(toastIdRef.current);
    },
    [],
  );

  const selectedCount = useMemo(
    () => rows.filter((r) => r.selected).length,
    [rows],
  );
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setDemoNote(false);
      setTruncatedNote(null);

      if (file.type !== "application/pdf") {
        const msg = "Envie um arquivo PDF.";
        setError(msg);
        toast.error(msg);
        return;
      }
      if (file.size > LIMITS.PDF_BYTES) {
        const msg = `PDF muito grande (máx ${PDF_LIMIT_MB}MB).`;
        setError(msg);
        toast.error(msg);
        return;
      }

      setFileName(file.name);
      setPhase("extracting");
      const toastId = toast.loading("Lendo PDF localmente…");
      toastIdRef.current = toastId;

      try {
        const text = await extractPdfText(file);
        if (cancelledRef.current) return;
        if (text.trim().length < 50) {
          toastIdRef.current = null;
          toast.error("PDF sem texto extraível (talvez seja só imagem).", {
            id: toastId,
          });
          setError(
            "Não consegui ler texto deste PDF. Se for um scan/imagem, tente outro arquivo.",
          );
          setPhase("idle");
          return;
        }

        toast.loading("Identificando eventos com IA…", { id: toastId });

        const ac = new AbortController();
        abortRef.current = ac;
        const res = await fetch("/api/calendar/extract-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            subjectNames: subjects.map((s) => s.name),
          }),
          signal: ac.signal,
        });
        abortRef.current = null;
        if (cancelledRef.current) return;

        const data: ExtractResponse = await res
          .json()
          .catch(() => ({}) as ExtractResponse);
        if (cancelledRef.current) return;

        if (!res.ok) {
          const msg = data?.error || "Falha ao extrair eventos.";
          toastIdRef.current = null;
          toast.error(msg, { id: toastId });
          setError(msg);
          setPhase("idle");
          return;
        }

        const rawEvents = Array.isArray(data.events) ? data.events : [];

        // A rota valida a data só pelo FORMATO (regex yyyy-mm-dd) e o construtor
        // Date NÃO reprova dia fora do mês: ele faz ROLLOVER calado. Com o
        // "31/11", "31/06" ou "29/02" de ano não bissexto que OCR/tabela
        // ambígua do PDF produz, o preview imprimia os componentes CRUS
        // ("ter 31/11") tirando o dia da semana de um Date já rolado, e no
        // salvar combineDateTimeISO/defaultIsoFor montavam o MESMO Date rolado:
        // o aluno conferia 31/11, clicava em Adicionar e a prova nascia em
        // 01/12 no mês, na semana, na agenda e no que a Lumi lê, sem nenhum
        // aviso. `isIsoDate` confere os componentes de volta (mesma barreira já
        // aplicada no academic-calendar) — melhor derrubar a linha e avisar do
        // que gravar um dia que ninguém aprovou na tela.
        const events = rawEvents.filter((ev) => isIsoDate(ev?.date));
        const droppedDates = rawEvents.length - events.length;

        // Corte silencioso da rota (ver ROUTE_MAX_EVENTS). O PDF do ano com
        // mais de 80 linhas datadas volta com exatamente 80, todas válidas —
        // então `droppedDates` é 0, o toast anuncia "80 eventos identificados",
        // as 80 linhas nascem marcadas e NADA na tela diz que faltou algo: o
        // aluno confirma achando que levou o calendário inteiro e só descobre
        // no dia da prova que dezembro nunca entrou no localStorage.
        // PDF longo NÃO é mais sinal de corte: a rota lê o documento inteiro
        // (ver o docblock de ROUTE_MAX_EVENTS) — avisar por tamanho de texto
        // era avisar de um corte que não existe.
        const truncatedMsg =
          data.truncated || rawEvents.length >= ROUTE_MAX_EVENTS
            ? `Este calendário tem muitos eventos e a lista parou no ${ROUTE_MAX_EVENTS}º: as últimas datas do documento (exames finais, entregas de novembro/dezembro) podem não estar na lista abaixo. Confira e, se faltar, envie o calendário em partes — um semestre por upload.`
            : null;

        if (events.length === 0) {
          toastIdRef.current = null;
          toast.message("Nenhum evento identificado no PDF.", { id: toastId });
          setError(
            droppedDates > 0
              ? `Encontrei ${droppedDates} data${droppedDates === 1 ? "" : "s"} que não existe${droppedDates === 1 ? "" : "m"} no calendário (ex: 31/11, 29/02 fora de ano bissexto). Confira as datas no PDF e tente de novo.`
              : data.error ||
                "Nenhum evento detectado. Tente um PDF com datas mais claras.",
          );
          setPhase("idle");
          return;
        }

        const previewRows: PreviewRow[] = events.map((ev, idx) => ({
          id: `${idx}`,
          selected: true,
          event: ev,
          matchedSubjectId: findSubjectMatch(ev.subjectGuess, subjects),
        }));

        setRows(previewRows);
        setDemoNote(!!data.demo);
        setTruncatedNote(truncatedMsg);
        setPhase("preview");
        toastIdRef.current = null;
        toast.success(
          `${events.length} evento${events.length === 1 ? "" : "s"} identificado${events.length === 1 ? "" : "s"}.`,
          { id: toastId },
        );
        // O toast de sucesso acima conta só o que sobreviveu ao corte — sem
        // este aviso o número vira uma afirmação falsa de completude.
        if (truncatedMsg) toast.warning(truncatedMsg);
        // O que caiu na checagem de data acima não pode sumir calado: o aluno
        // precisa saber que aquela linha do PDF não entrou (pra digitar à mão),
        // em vez de descobrir depois que faltou uma prova na agenda.
        if (droppedDates > 0) {
          toast.warning(
            `${droppedDates} linha${droppedDates === 1 ? "" : "s"} ignorada${droppedDates === 1 ? "" : "s"}: data inexistente no calendário (ex: 31/11). Adicione essas manualmente.`,
          );
        }
      } catch (err) {
        // O abort do próprio unmount cai aqui: sem esse guard o aluno veria
        // um toast.error("The user aborted a request.") depois de fechar.
        if (cancelledRef.current) return;
        console.error("[exam-pdf-upload] extract failed", err);
        const msg =
          err instanceof Error
            ? err.message
            : "Erro inesperado ao processar PDF.";
        toastIdRef.current = null;
        toast.error(msg, { id: toastId });
        setError(msg);
        setPhase("idle");
      }
    },
    [subjects],
  );

  function toggleRow(id: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)),
    );
  }

  function toggleAll() {
    const newVal = !allSelected;
    setRows((prev) => prev.map((r) => ({ ...r, selected: newVal })));
  }

  function setRowSubject(id: string, subjectId: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, matchedSubjectId: subjectId || undefined } : r,
      ),
    );
  }

  async function handleSave() {
    const toCreate = rows.filter((r) => r.selected);
    if (toCreate.length === 0) {
      toast.error("Selecione pelo menos um evento.");
      return;
    }

    setPhase("saving");
    try {
      /**
       * Idempotência: só entra o que AINDA não está no calendário.
       *
       * `addEventsBulkAsync` é append puro (`[...all, ...created]`, com
       * `generateId()` novo por linha), então subir de novo o MESMO PDF — a
       * faculdade republicou o cronograma com uma prova a mais, ou o aluno
       * reabriu porque achou que não tinha salvado — gravava as 12 provas
       * OUTRA VEZ. "P1 Farmacologia" passava a aparecer duas vezes no mesmo
       * dia na célula do mês, em duas colunas idênticas lado a lado na semana
       * (layoutOverlaps), na view Agenda e na sidebar, sem NADA distinguindo
       * uma da outra — e a única limpeza era abrir o modal de detalhes de cada
       * cópia e excluir uma a uma. Mesma defesa do irmão
       * academic-calendar-upload.
       *
       * A checagem é contra a agenda SALVA, e não contra um "o que eu gravei
       * nesta sessão": o corpo do dialog é remontado a cada abertura
       * (`{open && <ExamPdfUploadBody/>}`), então qualquer ref nasceria vazio
       * e o segundo upload duplicaria tudo de novo.
       */
      const existingKeys = new Set(
        (await listEventsAsync(userId)).map((e) =>
          agendaKey(e.title, e.starts_at),
        ),
      );

      const payload = toCreate.map((r) => {
        const ev = r.event;
        // Prova SEM horário nenhum no PDF (o formato mais comum: "15/06 — P1 de
        // Anatomia") entra como DIA TODO (00:00 → 23:59), e não mais no chute
        // das 08:00–09:00. O preview não imprime hora nessa linha (a coluna
        // Data só mostra `startTime` se ele existir), então o aluno confirma
        // sem ver horário nenhum — e a agenda passava a AFIRMAR um horário que
        // ninguém escreveu: "08:00–09:00" com ícone de relógio na view Agenda e
        // na sidebar, "08:00" no chip do mês, e na semana a prova desenhada em
        // cima da aula das 08:00 (o layoutOverlaps registra isso). Quem tinha
        // prova às 14:00 planejava a manhã em cima de uma hora inventada.
        // 00:00 → 23:59 é exatamente o que a página lê como allDay
        // (`startMinutes === 0 && endMinutes >= 23*60+59`) e renderiza como
        // "Dia todo" — mesma solução do irmão academic-calendar-upload.
        // Horário PARCIAL (só fim, "entrega até 23:59") continua ancorado nas
        // 08:00: aí existe hora no documento, o preview a mostra e a linha não
        // é de dia inteiro.
        const starts_at = ev.startTime
          ? combineDateTimeISO(ev.date, ev.startTime)
          : ev.endTime
            ? defaultIsoFor(ev.date, 8)
            : combineDateTimeISO(ev.date, "00:00");
        // O fim SEMPRE tem que cair depois do início. Com horário tardio, colar
        // a hora do fim na MESMA data grava ends_at ANTES de starts_at: entrega
        // "23:59" vira 23:59 → 00:59 do mesmo dia (23h pra trás), e uma aula
        // "22:00–01:00" vira 22:00 → 01:00 do mesmo dia (21h pra trás). O
        // estrago é silencioso: na semana o bloco encolhe pra um risco de 1
        // minuto e, ao abrir Editar, a validação "fim > início" trava o submit —
        // o aluno não consegue nem corrigir o título. Aqui o fim EXPLÍCITO do
        // PDF que caiu pra trás é empurrado pro dia seguinte (evento que cruza
        // a meia-noite de verdade). Já o fim que NÓS inventamos, quando o PDF só
        // trouxe a hora de início, nunca invade o dia seguinte — ver
        // syntheticEndIso.
        const rawEnd = ev.endTime
          ? combineDateTimeISO(ev.date, ev.endTime)
          : ev.startTime
            ? syntheticEndIso(ev.date, ev.startTime)
            : combineDateTimeISO(ev.date, "23:59");
        const ends_at = ensureEndAfterStart(starts_at, rawEnd);

        // Mapeia tipo extraído pro CalendarEventType local (idênticos).
        const type: CalendarEventType = ev.type;
        return {
          type,
          title: ev.title,
          subject_id: r.matchedSubjectId,
          starts_at,
          ends_at,
          description: ev.description,
        };
      });

      const pending = payload.filter(
        (ev) => !existingKeys.has(agendaKey(ev.title, ev.starts_at)),
      );
      const skipped = payload.length - pending.length;

      if (pending.length === 0) {
        // Fechar em silêncio pareceria "não salvou" (e o aluno subiria o PDF
        // de novo); anunciar "12 eventos adicionados" é justamente o que faz
        // ele acreditar que duplicou. Diz o que aconteceu: nada mudou.
        toast.message(
          skipped === 1
            ? "Esse evento já estava no seu calendário — não dupliquei nada."
            : "Esses eventos já estavam no seu calendário — não dupliquei nada.",
        );
        onCreated();
        return;
      }

      await addEventsBulkAsync(userId, pending);
      toast.success(
        // Conta o que REALMENTE entrou: dizer "12 eventos adicionados" quando
        // 11 foram pulados é o que faz o aluno procurar as cópias na agenda.
        `${pending.length} evento${pending.length === 1 ? "" : "s"} adicionado${pending.length === 1 ? "" : "s"} ao calendário${skipped > 0 ? ` · ${skipped} já estava${skipped === 1 ? "" : "m"} lá` : ""}.`,
      );
      onCreated();
    } catch (err) {
      console.error("[exam-pdf-upload] save failed", err);
      // "Tente novamente" é instrução FALSA justamente no erro que mais cai
      // aqui: o write() do calendar-events estoura a quota do localStorage
      // (histórico da Lumi em `lumio.lumi.chats.<uid>` enchendo os ~5MB) ou
      // falha em navegação privada no Safari, que estoura já na 1ª gravação —
      // nos dois casos o retry estoura IDÊNTICO toda vez, e o aluno fica
      // clicando em Adicionar sem nada na tela citando armazenamento cheio. O
      // CalendarStorageError já vem com a mensagem pronta e acionável ("apague
      // conversas antigas da Lumi", "tente numa janela normal"), que é o motivo
      // de a lib ter parado de engolir o erro — descartar `err` desperdiçava
      // ela. Mesmo tratamento do event-form-dialog, que joga o err.message
      // direto na tela. Erro desconhecido (aí sim possivelmente transitório)
      // continua com o texto genérico.
      const msg =
        err instanceof CalendarStorageError
          ? err.message
          : "Falha ao salvar eventos. Tente novamente.";
      toast.error(msg);
      // Também no banner do preview: o toast some em segundos e a instrução
      // (liberar espaço / sair da navegação privada) é exatamente o que ele
      // precisa ter na frente antes de mexer no botão de novo.
      setError(msg);
      setPhase("preview");
    }
  }

  function reset() {
    setRows([]);
    setFileName(null);
    setError(null);
    setDemoNote(false);
    setTruncatedNote(null);
    setPhase("idle");
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Upload calendário de provas</DialogTitle>
        <DialogDescription>
          Envie o PDF do calendário acadêmico — a IA identifica as datas de
          provas, trabalhos e entregas pra adicionar de uma vez.
        </DialogDescription>
      </DialogHeader>

      {phase === "idle" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-background/50 px-4 py-10 transition-colors",
              "hover:border-primary/50 hover:bg-accent/40",
            )}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm font-medium">
              Clique pra selecionar um PDF
            </div>
            <div className="text-xs text-muted-foreground">
              Calendário acadêmico, plano de ensino, cronograma de provas… (máx
              50MB)
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              // Reset pra permitir reupload do mesmo arquivo
              e.target.value = "";
            }}
          />
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
      )}

      {phase === "extracting" && (
        <ProgressPanel
          label="Processando PDF…"
          estimatedMs={16000}
          steps={[
            "Lendo o arquivo…",
            "Procurando as datas…",
            "Identificando as provas…",
            "Organizando…",
          ]}
          hint={fileName ?? undefined}
        />
      )}

      {phase === "preview" && (
        <div className="space-y-3">
          {demoNote && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Modo demo (sem ANTHROPIC_API_KEY). Eventos fictícios pra teste.
            </div>
          )}
          {/* Lista cortada no teto de eventos: o aluno precisa ver isso NA HORA
              de clicar em "Adicionar", não num toast que já sumiu. */}
          {truncatedNote && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {truncatedNote}
            </div>
          )}
          {/* Falha do "Adicionar": o preview continua na tela e o erro precisa
              continuar junto. Sem isso, a única pista era um toast que já
              sumiu — e no estouro de quota o aluno ficava sem saber que o
              caminho é liberar espaço, não clicar de novo. */}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              {fileName && (
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  <span className="truncate max-w-[200px]">{fileName}</span>
                </span>
              )}
              <button
                type="button"
                onClick={reset}
                className="text-primary hover:underline"
              >
                trocar PDF
              </button>
            </div>
            <button
              type="button"
              onClick={toggleAll}
              className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-accent transition-colors"
            >
              {allSelected ? (
                <CheckSquare className="h-3.5 w-3.5" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              {allSelected ? "Desmarcar todos" : "Marcar todos"}
            </button>
          </div>

          <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border/70">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card border-b border-border/60">
                <tr className="text-left text-muted-foreground">
                  <th className="px-2 py-2 w-8"></th>
                  <th className="px-2 py-2 w-24">Data</th>
                  <th className="px-2 py-2">Título</th>
                  <th className="px-2 py-2 w-24">Tipo</th>
                  <th className="px-2 py-2 w-40">Matéria</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {rows.map((r) => {
                  const meta = EVENT_TYPE_META[r.event.type];
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        "hover:bg-accent/30 transition-colors",
                        !r.selected && "opacity-50",
                      )}
                    >
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => toggleRow(r.id)}
                          className="flex h-5 w-5 items-center justify-center"
                          aria-label={
                            r.selected ? "Desmarcar evento" : "Selecionar evento"
                          }
                        >
                          {r.selected ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </td>
                      <td className="px-2 py-2 tabular-nums text-foreground">
                        <div>{formatDate(r.event.date)}</div>
                        {r.event.startTime && (
                          <div className="text-[10px] text-muted-foreground">
                            {r.event.startTime}
                            {r.event.endTime && `–${r.event.endTime}`}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {/* `title` obrigatório aqui: título e descrição são
                            cortados (`truncate` / `line-clamp-1` em 260px) e o
                            `overflow:hidden` impede arrastar pra ler a cauda,
                            então sem tooltip não há NENHUM caminho pra ver o
                            resto. Duas provas do mesmo dia que só diferem no
                            fim ("Prova N1 - Bioquímica - Turma A (sala 302)" ×
                            "…Turma B (sala 305)") renderizavam o MESMO texto
                            visível; como toda linha nasce `selected: true`, a
                            decisão do aluno aqui é qual DESMARCAR e ele
                            desmarcava no escuro, mandando pra agenda a prova da
                            turma errada (horário/sala errados). Mesmo
                            tratamento do irmão academic-calendar-upload. */}
                        <div
                          className="font-medium text-foreground truncate max-w-[260px]"
                          title={r.event.title}
                        >
                          {r.event.title}
                        </div>
                        {r.event.description && (
                          <div
                            className="text-[10px] text-muted-foreground line-clamp-1 max-w-[260px]"
                            title={r.event.description}
                          >
                            {r.event.description}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                            meta.soft,
                            meta.text,
                          )}
                        >
                          <span
                            className={cn("h-1.5 w-1.5 rounded-full", meta.dot)}
                          />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        {subjects.length > 0 ? (
                          <select
                            value={r.matchedSubjectId ?? ""}
                            onChange={(e) =>
                              setRowSubject(r.id, e.target.value)
                            }
                            className={cn(
                              "h-7 w-full rounded border border-input bg-background px-1.5 text-[11px]",
                              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            )}
                          >
                            <option value="">— sem matéria —</option>
                            {subjects.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {phase === "saving" && (
        <ProgressPanel label="Salvando eventos…" estimatedMs={4000} />
      )}

      <DialogFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={phase === "extracting" || phase === "saving"}
        >
          Cancelar
        </Button>
        {phase === "preview" && (
          <Button
            type="button"
            variant="gradient"
            onClick={handleSave}
            disabled={selectedCount === 0}
          >
            Adicionar {selectedCount} evento{selectedCount === 1 ? "" : "s"}{" "}
            selecionado{selectedCount === 1 ? "" : "s"}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

/* ---------------- small helpers ---------------- */

/**
 * Chave de duplicata na agenda: título + dia de início — exatamente o que o
 * aluno enxerga repetido no mês, na semana, na view Agenda e na sidebar quando
 * o mesmo cronograma entra duas vezes. Mesma chave do irmão
 * academic-calendar-upload.
 *
 * Sem a HORA de propósito: horário e tipo não são dados estáveis do PDF (a
 * extração roda sem temperature fixa, e a linha sem hora entra como dia todo),
 * então a MESMA prova volta sem hora numa subida e às 14:00 na seguinte —
 * com a hora na chave ela seria inserida de novo, que é o bug. O preço é duas
 * provas homônimas no mesmo dia em horários diferentes ("Prova Prática" manhã
 * e tarde): as duas entram no primeiro upload — dentro do MESMO lote nada é
 * filtrado, justamente pra não derrubar em silêncio uma linha que o aluno
 * acabou de conferir e marcar na tela —, mas num upload seguinte a segunda é
 * tratada como já existente.
 *
 * O título passa pelo `titleKey` (e não por um trim+toLowerCase próprio): a IA
 * não copia o texto do PDF, ela reescreve — ver lá o modo de falha.
 */
function agendaKey(title: string, startsAt: string): string {
  const d = new Date(startsAt);
  const day = Number.isNaN(d.getTime()) ? startsAt : toLocalIso(d);
  return `${titleKey(title)}|${day}`;
}

/**
 * Título normalizado pra casar a MESMA prova entre dois uploads.
 *
 * Tira ACENTO e uniformiza a família de travessões/hífens (‐ ‑ ‒ – — ―) além do
 * trim+caixa+espaço, porque o título NÃO é copiado do PDF: o prompt da rota
 * manda escrever um "nome curto e claro" (extract-pdf/route.ts) e a extração
 * roda sem temperature fixa. A linha institucional "AVALIAÇÃO N1 – BIOQUÍMICA"
 * volta "Avaliação N1 – Bioquímica" numa subida e "Avaliacao N1 - Bioquimica"
 * na seguinte. Comparando só a caixa, as duas viravam chaves DIFERENTES: no
 * segundo upload (a faculdade republicou o cronograma com uma prova a mais, ou
 * o aluno reabriu achando que não tinha salvado) `existingKeys.has(...)` dava
 * false e as 12 provas entravam OUTRA VEZ — dois chips idênticos no mesmo dia
 * na célula do mês, duas colunas iguais lado a lado na semana (layoutOverlaps),
 * duas linhas na view Agenda e na sidebar, permanentes, porque a única limpeza
 * é abrir o modal de detalhes de cada cópia e excluir uma a uma — e o toast
 * ainda anunciava "12 eventos adicionados", confirmando que era pra ser assim.
 * Mesma normalização do irmão academic-calendar-upload.
 */
function titleKey(title: string): string {
  // `normalize` já faz NFD + tira acento + caixa + colapsa espaço; falta só
  // uniformizar os travessões, que a IA troca livremente entre uma subida e
  // outra.
  return normalize(title.replace(/[‐-―]/g, "-"));
}

function addOneHour(time: string): string {
  // A volta do relógio ("23:59" → "00:59") continua aqui, mas hoje ninguém mais
  // depende dela: syntheticEndIso barra a faixa das 23h ANTES de chamar, porque
  // fim inventado por nós não pode cair no dia seguinte.
  const [h, m] = time.split(":").map(Number);
  const next = (h + 1) % 24;
  return `${String(next).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
}

/**
 * Virada do dia: 00:00 do dia SEGUINTE — o "fim do dia" que a agenda ainda
 * contabiliza no dia anterior (ela corta eventos que terminam exatamente na
 * meia-noite pra não pintar um bloco fantasma na madrugada).
 */
function startOfNextDayIso(year: number, month0: number, day: number): string {
  // Dia + 1 no construtor já normaliza virada de mês/ano sozinho.
  return new Date(year, month0, day + 1, 0, 0, 0, 0).toISOString();
}

/**
 * Fim INVENTADO por nós, quando o PDF trouxe só a hora de início: 1h depois,
 * mas colado na virada do dia se essa hora passaria da meia-noite.
 *
 * "Entrega do trabalho até 23:59" é o formato padrão de calendário de entregas
 * e chega sem endTime. Deixando addOneHour dar a volta ("23:59" → "00:59") e o
 * ensureEndAfterStart empurrar o fim pro dia seguinte, gravávamos
 * 10/06 23:59 → 11/06 00:59: a agenda expande evento de intervalo em UMA
 * ocorrência POR DIA, então o prazo nascia TAMBÉM no dia 11 (sidebar, view
 * Agenda, célula do mês) e o modal anunciava "Período: 10/06 a 11/06" pra um
 * prazo de um dia só. Terminando em 00:00 do dia seguinte, o fim continua
 * depois do início (nada de duração zero, nem trava do "fim > início" ao
 * editar) e a agenda trata como evento de UM dia.
 */
function syntheticEndIso(date: string, startTime: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const h = Number(startTime.split(":")[0]);
  // Só a faixa das 23h faz o +1h atravessar a meia-noite.
  if (h >= 23) return startOfNextDayIso(y, mo - 1, d);
  return combineDateTimeISO(date, addOneHour(startTime));
}

/**
 * Garante ends_at > starts_at. O PDF pode render um fim que, na mesma data, cai
 * antes do início (cruzou a meia-noite) ou igual ao início ("14:00–14:00"):
 * gravar assim vira evento de duração negativa/zero no calendário.
 */
function ensureEndAfterStart(startIso: string, endIso: string): string {
  if (endIso > startIso) return endIso; // ISO UTC compara como texto
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (end.getTime() < start.getTime()) {
    // Fim no dia seguinte — soma o dia pelos componentes locais (e não 24h em
    // ms) pra não deslocar a hora se houver mudança de fuso.
    const next = new Date(
      end.getFullYear(),
      end.getMonth(),
      end.getDate() + 1,
      end.getHours(),
      end.getMinutes(),
      0,
      0,
    );
    return next.toISOString();
  }
  // Fim idêntico ao início: assume 1h de duração — mas essa hora inventada não
  // pode vazar pro dia seguinte pelo mesmo motivo do syntheticEndIso ("Entrega
  // 23:59–23:59" viraria evento de DOIS dias na agenda, que expande intervalo
  // dia a dia). Colada na virada, continua sendo um dia só.
  const plusHour = new Date(start.getTime() + 60 * 60 * 1000);
  if (plusHour.getDate() !== start.getDate()) {
    return startOfNextDayIso(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
    );
  }
  return plusHour.toISOString();
}
