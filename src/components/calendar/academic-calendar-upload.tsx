"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckSquare,
  FileText,
  Square,
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
  addEventsBulkAsync,
  CalendarStorageError,
  deleteEventAsync,
  listEventsAsync,
  updateEventAsync,
  type CalendarEvent,
} from "@/lib/calendar-events";
import {
  ACADEMIC_CATEGORY_META,
  formatEventDate,
  hasUnusableEndDate,
  isIsoDate,
  normalizeAcademicCalendar,
  normalizeAcademicEvents,
  toLocalIso,
  type AcademicEvent,
  type AcademicEventCategory,
} from "@/lib/academic-calendar";
import { LIMITS, PDF_VISION_LIMIT_MB } from "@/lib/api-security";
import { cn } from "@/lib/utils";

type ExtractResponse = {
  institution?: string | null;
  year?: number | null;
  events?: AcademicEvent[];
  /**
   * Quantas linhas a ROTA já descartou por data inexistente antes de responder.
   *
   * A rota normaliza no servidor (`tryParseJson` chama
   * `normalizeAcademicEvents`), então `events` chega aqui SEM essas linhas e o
   * cliente não tem como reconstruir o total bruto. Campo opcional de
   * propósito: enquanto a rota não mandar, o contador daqui só enxerga o que
   * morre no cliente (ver `droppedDates` no handleFile).
   */
  droppedDates?: number;
  /**
   * A leitura foi CORTADA no fim por `max_tokens` (a rota lê o
   * `stop_reason === "max_tokens"` e recupera só os eventos íntegros).
   *
   * Sem ler este campo o cliente anunciava `toast.success("118 datas
   * encontradas.")` pra meio calendário: o aluno conferia a preview (que de
   * fato bate com o que veio), salvava, e o fim do ano — provas de dezembro,
   * exames finais e principalmente o "Término do período letivo" do 2º
   * semestre — nunca entrava na agenda nem no `academic_calendar` do perfil.
   * Sem esse marco de término o `getTermWindows` cai no FALHA ABERTO e fecha a
   * janela em 31/12, então a grade volta a ser desenhada depois do semestre ter
   * acabado. E como este dialog só faz merge (não existe tela pra apagar linha
   * do calendário), re-subir o MESMO PDF trunca no mesmo ponto: a única saída
   * (mandar um semestre por vez) está justamente na `message` que era
   * descartada.
   */
  truncated?: boolean;
  error?: string;
  demo?: boolean;
  message?: string;
};

type Row = { id: string; selected: boolean; event: AcademicEvent };

const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/**
 * Categorias marcadas por padrão: as que mudam a vida do aluno. Feriado,
 * recesso e evento institucional entram desmarcados pra não poluir a agenda
 * (o aluno marca se quiser).
 */
const DEFAULT_ON: AcademicEventCategory[] = ["prova", "nota", "prazo", "marco"];

/**
 * Teto, em dias, do intervalo que uma linha do PDF pode ocupar NA AGENDA.
 *
 * O `MAX_INTERVAL_DAYS` (62) da normalização só corta `feriado`/`recesso` — as
 * duas categorias que APAGAM aula — e de propósito: um "marco" de término
 * legitimamente carrega o intervalo do período letivo inteiro ("02/02 a
 * 20/12") e o `getTermWindows` lê `endDate ?? date`, então cortar ali
 * colapsaria a própria janela letiva. Só que NADA limitava o que ia pra AGENDA.
 *
 * A linha "02/02 A 20/12 – PERÍODO LETIVO 2026" volta como `marco` e "01/12 a
 * 31/01 – período de matrícula" como `prazo`; as duas categorias nascem
 * MARCADAS no preview (DEFAULT_ON), e o Salvar gravava UM CalendarEvent de
 * 02/02 00:00 até 20/12 23:59. O `customEventToUEvents` da página expande
 * intervalo em UMA ocorrência POR DIA (guarda de 400, então as ~322 passam
 * inteiras) e todas nascem `allDay` — que ordena primeiro no dia: cada célula
 * do mês gastava 1 dos 3 slots do MONTH_CELL_PREVIEW com o mesmo chip
 * (empurrando aula real pro "+N mais"), a faixa "dia todo" da semana ficava
 * ocupada nos 7 dias de toda semana do ano, a view Agenda repetia a MESMA linha
 * todo dia (estourando o AGENDA_MAX_ROWS e escondendo compromisso de verdade) e
 * os 5 grupos da sidebar carregavam o chip cada um. Pra desfazer, evento por
 * evento pelo modal de detalhes — o upload não desfaz nada.
 *
 * Dois tetos, porque a faixa "dia todo" tem valor MUITO diferente conforme a
 * categoria:
 *  - `feriado`/`recesso`: a faixa é a única coisa que EXPLICA o mês vazio (as
 *    aulas somem por `getNonTeachingDays`, que expande até 62 dias). Some com
 *    ela e o mês fica vazio e mudo — exatamente o que o `describeTermGap` do
 *    academic-calendar.ts existe pra evitar. Fica no mesmo 62 da normalização,
 *    que já é o máximo que sobrevive lá.
 *  - resto (`marco`, `prazo`, `prova`, `nota`, `evento`): ninguém vetou esses
 *    intervalos, e é onde moram os dois monstros (322 e 61 dias). Um mês é o
 *    maior intervalo que ainda faz sentido pintar dia a dia; acima disso é
 *    linha administrativa, que só precisa marcar o começo.
 *
 * Acima do teto o evento da agenda vira o DIA DE INÍCIO só (a data em si é
 * confiável). O intervalo completo continua indo inteiro pro
 * `academic_calendar` do perfil, que é quem alimenta `getTermWindows` e o
 * prompt da Lumi — nada muda pro período letivo nem pro contexto dela.
 */
const MAX_AGENDA_SPAN_DAYS = 31;
const MAX_AGENDA_SPAN_DAYS_NAO_LETIVO = 62;

/** Dias inteiros entre duas datas ISO (fim − início). */
function spanInDays(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T00:00:00`).getTime();
  const b = new Date(`${endIso}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Dia de FIM que a linha recebe NA AGENDA (ver `MAX_AGENDA_SPAN_DAYS`).
 *
 * Fonte única: usado tanto no insert quanto na comparação que decide ESTENDER
 * um período já salvo — se os dois lados não usarem o mesmo valor, todo upload
 * marcaria o mesmo evento como "período atualizado" pra sempre.
 */
function agendaEndIso(e: AcademicEvent): string {
  const end = e.endDate ?? e.date;
  if (end <= e.date) return e.date;
  const max =
    e.category === "feriado" || e.category === "recesso"
      ? MAX_AGENDA_SPAN_DAYS_NAO_LETIVO
      : MAX_AGENDA_SPAN_DAYS;
  return spanInDays(e.date, end) > max ? e.date : end;
}

/**
 * Chave de duplicata na agenda: título + dia de início — exatamente o que o
 * aluno enxerga repetido no mês, na semana, na agenda e na sidebar quando o
 * mesmo calendário entra duas vezes.
 *
 * O `type` SAIU da chave de propósito. Ele não é um dado do PDF: é derivado da
 * CATEGORIA que a extração devolve (`ACADEMIC_CATEGORY_META[...].eventType`), e
 * a extração roda sem temperature fixa. A MESMA linha volta em categoria
 * diferente entre dois uploads — "Prova de faltosos" está listada nas DUAS
 * categorias do SYSTEM_PROMPT da rota (`prova` e `prazo`, este último dentro de
 * "prazos de inscrição (PRA, prova de faltosos)"), então ela vira "trabalho"
 * numa subida e "prova" na seguinte. Com o tipo na chave, re-subir o MESMO PDF
 * gerava chave nova, `existingKeys.has(k)` dava false e a linha era INSERIDA de
 * novo: dois chips no mesmo dia, mesmo título, cores/categorias diferentes, no
 * mês, na semana, na view Agenda e na sidebar — permanentes, porque não existe
 * "limpar importação" (só apagando um a um pelo modal de detalhes) e o perfil
 * da Lumi, que deduplica por `date|title`, nem denuncia a cópia. A rede de
 * segurança do `dropRescheduled` não alcança esse caso: título repetido nos
 * dois lados (`incomingCount.get(k) !== 1`) faz ele MANTER a linha antiga em
 * `kept`, e o laço de exclusão então pula por `keptKeys.has(...)`. Ou seja, a
 * idempotência tem que estar aqui. Título + dia é o que o aluno lê como "essa
 * data já está na agenda"; o tipo é só a cor do chip.
 *
 * Efeito colateral desejado: o mesmo desalinhamento derrubava a "trava 1" do
 * laço de remarcação lá embaixo (ver `incomingAgendaKeys`), que agora reconhece
 * a linha mesmo quando a categoria trocou.
 */
function agendaKey(title: string, startsAt: string): string {
  const d = new Date(startsAt);
  const day = Number.isNaN(d.getTime()) ? startsAt : toLocalIso(d);
  return `${title.trim().toLowerCase()}|${day}`;
}

/**
 * Corta o nome do arquivo no teto do zod da rota (`sourceFile: max(200)`).
 *
 * Todo campo do payload já ia cortado na origem (institution/title 160, events
 * 300) MENOS este, que subia como `file.name` cru — e basename vai até 255 no
 * Windows/macOS. Calendário baixado do portal da faculdade com nome gerado
 * longo fazia o PATCH voltar 400 "Payload inválido" PRA SEMPRE, com o toast
 * ainda mandando "pode subir o mesmo arquivo de novo mais tarde" (a nova
 * tentativa falhava idêntica). E não some só a Lumi: o `academic_calendar` do
 * perfil é a ÚNICA fonte do getTermWindows/getNonTeachingDays da página, então
 * o período letivo inteiro (banner "Fora do período letivo", feriado/recesso
 * suprimindo aula) nunca ligava pra esse aluno, sem nada na tela ligando uma
 * coisa à outra.
 */
const MAX_SOURCE_FILE = 200;

function capSourceFile(name: string | null): string | null {
  if (!name) return null;
  return name.length > MAX_SOURCE_FILE ? name.slice(0, MAX_SOURCE_FILE) : name;
}

/** Título normalizado pra casar a MESMA linha entre dois PDFs. */
function titleKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Marcador que este importador grava na `description` de todo evento que cria.
 *
 * Existe pra que reconciliar a agenda (estender um intervalo, apagar a data
 * velha de uma prova remarcada) só mexa no que ESTE upload criou: um
 * compromisso que o aluno digitou à mão pode cair na mesma chave título+dia
 * e nunca pode ser reescrito nem apagado por um PDF.
 */
const IMPORT_MARK = "calendário acadêmico";

function isFromImport(e: CalendarEvent): boolean {
  return (e.description ?? "").includes(IMPORT_MARK);
}

/** Dia local do fim de um evento da agenda (`null` quando não tem fim válido). */
function agendaEndDay(e: CalendarEvent): string | null {
  if (!e.ends_at) return null;
  const d = new Date(e.ends_at);
  return Number.isNaN(d.getTime()) ? null : toLocalIso(d);
}

/**
 * Marcador local de "este aluno JÁ teve um calendário salvo no perfil".
 *
 * Serve pra distinguir os dois casos que o GET /api/user-profile devolve
 * idênticos (200 com `profile: null`): aluno sem perfil ainda × leitura que
 * falhou no banco (getUserProfileAsync loga o erro e retorna null). Sem essa
 * distinção o segundo caso vira `previous = []` e o PATCH apaga o calendário
 * anterior. Vale só neste dispositivo — é o que dá pra fazer do lado do
 * cliente enquanto a rota não diferencia "vazio" de "falhou".
 */
const SAVED_FLAG_KEY = (userId: string) =>
  `lumio.academic-calendar.saved.${userId}`;

function hasSavedCalendarLocally(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!window.localStorage.getItem(SAVED_FLAG_KEY(userId));
  } catch {
    return false;
  }
}

function markCalendarSavedLocally(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SAVED_FLAG_KEY(userId),
      new Date().toISOString(),
    );
  } catch {
    // Quota/modo privado: no pior caso o guard não dispara e voltamos ao
    // comportamento antigo — nunca impede o save.
  }
}

/**
 * Tira do calendário SALVO as linhas que o PDF novo remarcou.
 *
 * A dedup do `normalizeAcademicEvents` é por `date|title`: uma prova adiada de
 * 10/06 pra 17/06 volta com o mesmo título em data diferente, então as DUAS
 * sobreviveriam ao merge, a Lumi continuaria planejando estudo pra data
 * cancelada e — como este dialog é o único escritor do `academicCalendar` — não
 * existiria tela nenhuma pra apagar a linha velha.
 *
 * Conservador de propósito: só descarta quando o título aparece UMA única vez
 * de cada lado (é a mesma data remarcada, sem ambiguidade) e a data antiga cai
 * DENTRO da janela coberta pelo upload. Título repetido ("Feriado", "Prova
 * bimestral") ou data fora da janela (o outro semestre) fica intacto — melhor
 * uma data a mais que apagar o calendário do semestre anterior.
 */
function dropRescheduled(
  previous: AcademicEvent[],
  incoming: AcademicEvent[],
): AcademicEvent[] {
  if (previous.length === 0 || incoming.length === 0) return previous;
  const countByTitle = (list: AcademicEvent[]) => {
    const m = new Map<string, number>();
    for (const e of list) {
      const k = titleKey(e.title);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const incomingCount = countByTitle(incoming);
  const previousCount = countByTitle(previous);
  let from = incoming[0].date;
  let to = incoming[0].endDate ?? incoming[0].date;
  for (const e of incoming) {
    if (e.date < from) from = e.date;
    const end = e.endDate ?? e.date;
    if (end > to) to = end;
  }
  return previous.filter((e) => {
    const k = titleKey(e.title);
    if (incomingCount.get(k) !== 1 || previousCount.get(k) !== 1) return true;
    return e.date < from || e.date > to;
  });
}

export type AcademicCalendarUploadProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onSaved?: () => void;
};

export function AcademicCalendarUpload({
  open,
  onOpenChange,
  userId,
  onSaved,
}: AcademicCalendarUploadProps) {
  // Enquanto está extraindo/salvando, o dialog não pode ser fechado: o corpo é
  // desmontado pelo `{open && …}` e o trabalho em voo some da tela — mas os
  // toasts, que são globais, continuam. Fechar no meio da extração jogava fora
  // os ~26s pagos da rota (que ainda tem rate-limit) e fazia o
  // toast.success("87 datas encontradas.") aparecer sozinho, sem dialog nem
  // preview. Na fase "saving" era pior: o `setPhase("preview")` do catch morria
  // junto, o botão "Salvar" de retry deixava de existir e reabrir voltava pro
  // "idle" com todas as marcações de categoria perdidas. O Cancelar já era
  // desabilitado nessas duas fases; ESC/overlay/X é que escapavam.
  const [busy, setBusy] = useState(false);

  // Rede de segurança: se algo fechar o dialog por fora, nunca deixar `busy`
  // preso em true (senão o próximo open já nasce sem X e sem ESC).
  useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (busy) e.preventDefault();
        }}
        hideClose={busy}
      >
        {open && (
          <AcademicCalendarUploadBody
            userId={userId}
            onBusyChange={setBusy}
            onClose={() => onOpenChange(false)}
            onSaved={() => {
              onSaved?.();
              onOpenChange(false);
            }}
            // Recarrega a agenda SEM fechar o diálogo: numa falha no meio do
            // save, o mês/semana/agenda/sidebar atrás do dialog precisam
            // mostrar o que JÁ foi gravado, e o aluno ainda precisa do botão
            // "Salvar" pra continuar de onde parou.
            onProgress={() => onSaved?.()}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AcademicCalendarUploadBody({
  userId,
  onBusyChange,
  onClose,
  onSaved,
  onProgress,
}: {
  userId: string;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
  /** Recarrega a agenda da tela sem fechar o diálogo (gravação parcial). */
  onProgress?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<
    "idle" | "extracting" | "preview" | "saving"
  >("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [institution, setInstitution] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoNote, setDemoNote] = useState(false);
  /**
   * Aviso da rota de que a leitura foi CORTADA no fim (`truncated`). Fica no
   * estado, e não só num toast, porque o toast some antes de o aluno terminar
   * de conferir ~118 linhas e clicar em Salvar — e é EXATAMENTE nesse clique
   * que ele decide salvar meio calendário achando que é o completo.
   */
  const [truncatedNote, setTruncatedNote] = useState<string | null>(null);

  // Trabalho em voo: o wrapper usa isso pra bloquear ESC/overlay/X.
  useEffect(() => {
    onBusyChange(phase === "extracting" || phase === "saving");
  }, [phase, onBusyChange]);

  // Defesa em profundidade pro que escapa do bloqueio acima (troca de rota,
  // logout, hot-reload): marca o trabalho como cancelado, aborta a requisição
  // e mata o toast de loading que ficaria girando pra sempre. Sem isso o
  // setRows/setPhase caíam num componente morto e o toast de sucesso
  // aparecia sem dialog nenhum na tela.
  const cancelledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const toastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    // RELIGA o flag no setup, não só desliga no cleanup: em dev o App Router
    // roda com reactStrictMode (padrão), e o StrictMode faz setup → cleanup →
    // setup no mount. O ref sobrevive a esse ciclo, então o cleanup do
    // double-invoke deixava `cancelled` em true PRA SEMPRE — sem nada pra
    // desmarcar, já que o setup só devolvia a função de cleanup. Aí todo
    // `if (cancelledRef.current) return` depois do await saía calado: a
    // resposta da rota chegava, `setPhase("preview")` nunca acontecia e o
    // dialog ficava preso em "extracting" — ProgressPanel girando, e como o
    // efeito de busy já mandou `onBusyChange(true)`, ESC e clique fora dão
    // preventDefault, o X some (`hideClose`) e o Cancelar fica disabled. Beco
    // sem saída, só F5 — e cada tentativa queima uma extração paga do Vision,
    // que ainda tem rate-limit de 2 req/60s. (O mesmo vale pro Fast Refresh,
    // que remonta o corpo do dialog.)
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
      if (toastIdRef.current !== null) toast.dismiss(toastIdRef.current);
    };
  }, []);

  const selectedCount = useMemo(
    () => rows.filter((r) => r.selected).length,
    [rows],
  );
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  /** Agrupa por mês pra preview ficar legível (calendário tem ~60-90 eventos). */
  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const [y, m] = r.event.date.split("-");
      const key = `${y}-${m}`;
      const list = map.get(key);
      if (list) list.push(r);
      else map.set(key, [r]);
    }
    return Array.from(map.entries()).map(([key, items]) => {
      const [y, m] = key.split("-");
      return {
        key,
        label: `${MONTH_LABELS[Number(m) - 1] ?? key} ${y}`,
        items,
      };
    });
  }, [rows]);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setDemoNote(false);
    setTruncatedNote(null);

    const okType =
      file.type === "application/pdf" || file.type.startsWith("image/");
    if (!okType) {
      const msg = "Envie um PDF ou imagem (PNG, JPG, WEBP).";
      setError(msg);
      toast.error(msg);
      return;
    }
    /**
     * O teto aqui é o MESMO da rota (`UPLOAD_MAX_BYTES = LIMITS.PDF_VISION_BYTES`),
     * lido da mesma constante — hardcodar 10MB deixava as duas metades
     * desalinhadas depois que a rota passou a cortar em 4MB. O modo de falha: o
     * aluno fotografa com o celular o calendário impresso no mural (JPEG de
     * 6MB) ou baixa o PDF escaneado de 6MB do portal, o guard local deixava
     * passar e o upload inteiro subia só pra voltar 413 — e voltava CARO,
     * porque na rota o rate-limit por IP (2 req/60s) é cobrado ANTES do guard
     * de tamanho. Reduzir a imagem e tentar de novo queimava o 2º pedido e a
     * terceira tentativa já batia em rate-limit sem nem chegar na IA. Barrando
     * aqui, nenhum byte sai e nenhum token é gasto. A mensagem repete a dica da
     * rota (TOO_LARGE_MSG) pra ele saber o que fazer sem tentar às cegas.
     */
    if (file.size > LIMITS.PDF_VISION_BYTES) {
      const msg = `Arquivo muito grande (máx ${PDF_VISION_LIMIT_MB}MB). Foto de celular costuma passar disso: reduza a resolução/qualidade da imagem, recorte só o calendário ou envie o PDF do portal.`;
      setError(msg);
      toast.error(msg);
      return;
    }

    setFileName(file.name);
    setPhase("extracting");
    const toastId = toast.loading("Lendo o calendário acadêmico…");
    toastIdRef.current = toastId;

    try {
      const fd = new FormData();
      fd.append("file", file);
      const ac = new AbortController();
      abortRef.current = ac;
      const res = await fetch("/api/extract-academic-calendar", {
        method: "POST",
        body: fd,
        signal: ac.signal,
      });
      abortRef.current = null;
      if (cancelledRef.current) return;
      const data: ExtractResponse = await res
        .json()
        .catch(() => ({}) as ExtractResponse);
      if (cancelledRef.current) return;

      if (!res.ok) {
        const msg = data?.error || "Falha ao processar o calendário.";
        toastIdRef.current = null;
        toast.error(msg, { id: toastId });
        setError(msg);
        setPhase("idle");
        return;
      }

      const rawEvents = Array.isArray(data.events) ? data.events : [];
      const extracted = normalizeAcademicEvents(rawEvents);

      // Linha do PDF com data que NÃO EXISTE ("Prova de faltosos - 31/11",
      // "29/02" em ano não bissexto — o erro clássico de OCR/tabela).
      // `normalizeAcademicEvents` faz `if (!isIsoDate(o.date)) continue;` e o
      // evento INTEIRO evapora: não aparece na preview, não entra na agenda e
      // não vai pro `academic_calendar` do perfil (logo a Lumi também nunca
      // fica sabendo). Sem contar aqui, o aluno via só o
      // toast.success("86 datas encontradas.") — que conta apenas as
      // sobreviventes —, conferia a lista, salvava, e a prova simplesmente não
      // existia em lugar nenhum. Conta só o que reprova em `isIsoDate`, nunca
      // `rawEvents.length - extracted.length`: a normalização também derruba
      // título vazio e duplicata exata (`date|title`), e chamar isso de "data
      // inexistente" mandaria o aluno caçar uma linha que na verdade está lá.
      // Mesmo aviso do irmão exam-pdf-upload.
      const droppedLocally = rawEvents.filter(
        (ev) => !isIsoDate(ev?.date),
      ).length;
      // A rota já normalizou antes de responder, então o que ela derrubou não
      // chega no `rawEvents`: soma o que ela informar (quando informar) ao que
      // ainda morre aqui.
      //
      // ATENÇÃO: hoje `droppedLocally` é 0 POR CONSTRUÇÃO — `tryParseJson` da
      // rota chama `normalizeAcademicEvents` antes de responder, então a linha
      // "31/11" morre no servidor e nunca chega aqui, e a rota AINDA não manda
      // `droppedDates` em nenhuma das suas respostas. Ou seja: o aviso abaixo
      // nunca dispara e a data inexistente segue sumindo calada. Isso só fecha
      // do lado da ROTA (contar o que a normalização derrubou e devolver
      // `droppedDates`); o contador daqui fica como defesa em profundidade pro
      // dia em que a rota devolver eventos crus (ou pro modo demo).
      const droppedDates =
        (typeof data.droppedDates === "number" && data.droppedDates > 0
          ? Math.trunc(data.droppedDates)
          : 0) + droppedLocally;

      // Linha em que só o FIM do intervalo é impossível ("RECESSO ACADÊMICO —
      // 01 A 31/07" vira {date:"2026-07-01", endDate:"2026-06-31"}, junho tem
      // 30). O contador acima NÃO vê essa: a data de início está boa, então o
      // evento sobrevive e `droppedDates` fica 0. A `normalizeAcademicEvents`
      // reprova o endDate em `isIsoDate`, zera pra null e só emite um
      // console.warn — e nada na tela dizia nada. Consequência: a preview
      // mostra "01/07/2026" como dia único, o aluno confere e salva, o
      // `getNonTeachingDays` bloqueia 1 dia em vez de 31, as aulas de 02 a
      // 31/07 voltam a ser desenhadas no mês/semana/agenda/sidebar, o banner
      // "Mês sem aula" não dispara (ele exige TODO dia letivo bloqueado) e o
      // `academic_calendar` do perfil — fonte única do prompt da Lumi — grava o
      // recesso truncado, então ela planeja estudo dentro do recesso. Sem UI
      // pra apagar a linha podre (o upload só faz merge), o aviso é a única
      // saída: ele manda o aluno corrigir o intervalo à mão.
      // `hasUnusableEndDate` é o helper que a lib exporta exatamente pra isso
      // (e não contava nada, porque não tinha call site nenhum).
      //
      // MESMA ressalva do `droppedLocally` acima: hoje isso é 0 POR CONSTRUÇÃO,
      // porque `tryParseJson` da rota já normalizou antes de responder (o
      // endDate podre morre lá) e a rota não informa quantos zerou. Fecha de
      // vez só do lado da ROTA; aqui fica a defesa em profundidade pro dia em
      // que ela devolver eventos crus (ou pro modo demo).
      const droppedEndDates = rawEvents.filter((ev) =>
        hasUnusableEndDate(ev),
      ).length;

      if (extracted.length === 0) {
        const msg =
          droppedDates > 0
            ? `Encontrei ${droppedDates} data${droppedDates === 1 ? "" : "s"} que não existe${droppedDates === 1 ? "" : "m"} no calendário (ex: 31/11, 29/02 fora de ano bissexto). Confira as datas no arquivo e tente de novo.`
            : data?.error || "Não encontrei datas nesse calendário.";
        toastIdRef.current = null;
        toast.message(msg, { id: toastId });
        setError(msg);
        setPhase("idle");
        return;
      }

      setRows(
        extracted.map((event, idx) => ({
          id: `${idx}`,
          selected: DEFAULT_ON.includes(event.category),
          event,
        })),
      );
      setInstitution(data.institution ?? null);
      setYear(data.year ?? null);
      setDemoNote(!!data.demo);
      // Leitura CORTADA por max_tokens: a rota devolve 200 com os eventos
      // íntegros + `truncated`/`message`, e ignorar isso é anunciar meio
      // calendário como completo (ver o campo `truncated` no ExtractResponse).
      // A `message` da rota já vem em pt-BR e já é a única instrução que
      // resolve ("envie o outro semestre em um upload separado").
      const truncatedMsg = data.truncated
        ? (data.message ??
          "O calendário é longo e a leitura foi cortada no fim: confira se as últimas datas do ano estão aqui. Se faltar, envie o outro semestre em um upload separado.")
        : null;
      setTruncatedNote(truncatedMsg);
      setPhase("preview");
      toastIdRef.current = null;
      toast.success(
        `${extracted.length} data${extracted.length === 1 ? "" : "s"} encontrada${extracted.length === 1 ? "" : "s"}.`,
        { id: toastId },
      );
      // O toast de sucesso acima conta só o que sobreviveu ao corte — sem este
      // aviso o número vira uma afirmação falsa de completude.
      if (truncatedMsg) toast.warning(truncatedMsg);
      // O que caiu na checagem de data não pode sumir calado: o toast acima
      // conta só o que sobreviveu, então sem este aviso o aluno não tem NENHUM
      // sinal de que uma linha do PDF ficou de fora — nem na preview, nem na
      // agenda, nem no contexto da Lumi — e só descobre no dia da prova.
      if (droppedDates > 0) {
        toast.warning(
          `${droppedDates} linha${droppedDates === 1 ? "" : "s"} ignorada${droppedDates === 1 ? "" : "s"}: data inexistente no calendário (ex: 31/11). Adicione essa${droppedDates === 1 ? "" : "s"} data${droppedDates === 1 ? "" : "s"} manualmente na agenda.`,
        );
      }
      // Intervalo ENCOLHIDO pra um dia só (ver `droppedEndDates`): a linha
      // continua na preview e parece certa, então sem este aviso o recesso
      // truncado passa batido e volta a desenhar aula no mês inteiro.
      if (droppedEndDates > 0) {
        toast.warning(
          `${droppedEndDates} linha${droppedEndDates === 1 ? "" : "s"} com data de FIM inválida (ex: "01 a 31/06", que não existe): ${droppedEndDates === 1 ? "ela entrou" : "elas entraram"} como um dia só. Se for recesso ou feriado longo, ajuste o período na agenda pra não continuar aparecendo aula nesses dias.`,
        );
      }
    } catch (err) {
      // O abort do próprio unmount cai aqui: sem esse guard o aluno veria um
      // toast.error("The user aborted a request.") depois de fechar.
      if (cancelledRef.current) return;
      console.error("[academic-calendar-upload] extract failed", err);
      const msg =
        err instanceof Error ? err.message : "Erro inesperado ao processar.";
      toastIdRef.current = null;
      toast.error(msg, { id: toastId });
      setError(msg);
      setPhase("idle");
    }
  }, []);

  function toggleRow(id: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)),
    );
  }

  function toggleAll() {
    const next = !allSelected;
    setRows((prev) => prev.map((r) => ({ ...r, selected: next })));
  }

  async function handleSave() {
    const chosen = rows.filter((r) => r.selected);
    setPhase("saving");
    // O que JÁ está GRAVADO na agenda quando algo estoura depois. Declarado
    // FORA do `try` de propósito: era tudo variável local do bloco, então o
    // catch não tinha como saber que o insert já tinha ido, e qualquer falha
    // posterior (o `fetch` do PATCH REJEITANDO — offline/DNS/wifi da faculdade
    // — não cai no `!profileRes.ok`; quota estourando no update/delete) virava
    // "Falha ao salvar. Tente novamente." sem chamar `onSaved()`. As datas
    // ficavam no storage e INVISÍVEIS no mês, na semana, na agenda e na
    // sidebar até um F5, com o aluno acreditando que nada tinha sido salvo —
    // e o próximo upload ainda o recebia com "essas datas já estavam na
    // agenda". Mesmo caminho do irmão schedule-pdf-upload: reporta o parcial.
    const written = { inserted: 0, extended: 0, removed: 0 };
    try {
      // 1) Eventos escolhidos entram na agenda como eventos do calendário —
      //    só o que ainda NÃO está lá.
      //
      //    A checagem é contra a agenda salva, não contra um useRef de "o que
      //    eu gravei nesta sessão": o corpo do dialog é remontado a cada
      //    abertura (`{open && <AcademicCalendarUploadBody/>}`), então o ref
      //    nascia vazio e qualquer segundo upload — o PDF retificado da
      //    faculdade, o retry que o próprio toast de erro pede, ou reabrir só
      //    pra marcar os feriados — regravava TODAS as linhas com ids novos.
      //    Cada prova/entrega de notas passava a aparecer duas vezes no mês, na
      //    semana, na agenda e na sidebar, sem como distinguir uma da outra e
      //    sem "limpar importação" (só apagando uma a uma pelos detalhes do
      //    evento). O perfil da Lumi já era idempotente (dedup por
      //    `date|title`); a agenda não era.
      const existingEvents = await listEventsAsync(userId);
      const existingKeys = new Set(
        existingEvents.map((e) => agendaKey(e.title, e.starts_at)),
      );
      // Índice pro evento em si, não só pra chave: o `id` é o que permite
      // ESTENDER um intervalo e apagar a data velha de uma prova remarcada.
      // Montado ANTES do insert de propósito — aqui só tem o que já estava na
      // agenda antes deste upload.
      const existingByKey = new Map<string, CalendarEvent[]>();
      for (const e of existingEvents) {
        const k = agendaKey(e.title, e.starts_at);
        const list = existingByKey.get(k);
        if (list) list.push(e);
        else existingByKey.set(k, [e]);
      }

      // Linhas que só mudaram de FIM. A chave da agenda é título + dia
      // de INÍCIO, então "Exames finais 22/06–26/06" e "Exames finais
      // 22/06–03/07" batem na MESMA chave: a linha caía no "já existe" e era
      // pulada (só existe insert, não existe update). O perfil da Lumi ficava
      // com o intervalo novo — o incoming vai na frente do merge — enquanto o
      // mês, a semana, a agenda e a sidebar continuavam pintando a faixa
      // antiga, truncada: o aluno não via 27/06–03/07 como semana de exame e
      // ainda levava um "Essas datas já estavam na agenda".
      const toExtend: Array<{ id: string; ends_at: string }> = [];
      const pending = chosen.filter((r) => {
        const k = agendaKey(r.event.title, `${r.event.date}T00:00:00`);
        if (existingKeys.has(k)) {
          // Mesmo fim capado do insert: um evento gravado antes deste teto
          // (intervalo de ~322 dias) é ENCOLHIDO aqui no próximo upload.
          const endIso = agendaEndIso(r.event);
          for (const e of existingByKey.get(k) ?? []) {
            // Só o que este importador criou: um compromisso digitado pelo
            // aluno pode cair na mesma chave e não pode ser reescrito.
            if (!isFromImport(e)) continue;
            if (agendaEndDay(e) === endIso) continue;
            toExtend.push({
              id: e.id,
              ends_at: new Date(`${endIso}T23:59:00`).toISOString(),
            });
          }
          return false;
        }
        // Segura também duas linhas idênticas dentro do mesmo lote.
        existingKeys.add(k);
        return true;
      });
      if (pending.length > 0) {
        await addEventsBulkAsync(
          userId,
          pending.map((r) => {
            const meta = ACADEMIC_CATEGORY_META[r.event.category];
            // Evento acadêmico é "dia inteiro": 00:00 até 23:59 do último dia.
            // O fim vai CAPADO (ver `MAX_AGENDA_SPAN_DAYS`): intervalo de ano
            // inteiro viraria uma ocorrência "dia todo" por dia em todas as
            // views.
            const starts = new Date(`${r.event.date}T00:00:00`);
            const endIso = agendaEndIso(r.event);
            const ends = new Date(`${endIso}T23:59:00`);
            return {
              type: meta.eventType,
              title: r.event.title,
              starts_at: starts.toISOString(),
              ends_at: ends.toISOString(),
              description: `${meta.label} · calendário acadêmico${institution ? ` (${institution})` : ""}`,
            };
          }),
        );
        // `addEventsBulkAsync` grava tudo de uma vez (tudo ou nada): se chegou
        // aqui, as `pending` estão no storage.
        written.inserted = pending.length;
      }
      for (const u of toExtend) {
        await updateEventAsync(userId, u.id, { ends_at: u.ends_at });
        written.extended++;
      }
      if (cancelledRef.current) return;
      const extended = toExtend.length;
      // O que de fato não mudou nada — o que foi estendido NÃO é "já estava lá".
      const skipped = Math.max(0, chosen.length - pending.length - extended);

      // 2) O calendário INTEIRO (inclusive o não marcado) vai pro perfil —
      //    é o que parametriza a Lumi: ela passa a saber recesso, feriado e
      //    prazo mesmo que o aluno não queira o evento poluindo a agenda.
      //
      //    Antes de gravar, LÊ o que já está salvo e FUNDE: o PATCH substitui a
      //    coluna jsonb inteira (user-profile.ts: `row.academic_calendar =
      //    patch.academicCalendar ?? null`), então sem o merge subir o
      //    calendário do 2º semestre APAGA o do 1º — as aulas de fev-jun somem
      //    atrás do banner "Fora do período letivo" (getTermWindows passa a ver
      //    só a janela nova) e os feriados antigos param de suprimir aula.
      let previous: AcademicEvent[] = [];
      let prevInstitution: string | null = null;
      let prevYear: number | null = null;
      try {
        const curRes = await fetch("/api/user-profile");
        if (!curRes.ok) {
          throw new Error(`GET /api/user-profile ${curRes.status}`);
        }
        const cur = await curRes.json();
        // O GET responde 200 {"profile":null} em DOIS casos: aluno que ainda
        // não tem perfil e SELECT que falhou no banco (getUserProfileAsync faz
        // console.error e retorna null). Só o status HTTP não separa os dois —
        // por isso o `if (!curRes.ok)` acima não pegava a falha de leitura e o
        // PATCH gravava só o calendário novo, apagando o semestre anterior. Se
        // este aluno JÁ salvou um calendário daqui, "perfil vazio" não é perfil
        // novo: é leitura falhada. Aborta em vez de sobrescrever.
        if (!cur?.profile && hasSavedCalendarLocally(userId)) {
          throw new Error("GET /api/user-profile devolveu profile vazio");
        }
        const prevCal = normalizeAcademicCalendar(cur?.profile?.academicCalendar);
        if (prevCal) {
          previous = prevCal.events;
          prevInstitution = prevCal.institution ?? null;
          prevYear = prevCal.year ?? null;
        }
      } catch (readErr) {
        // Falha na leitura NÃO pode virar sobrescrita silenciosa: aborta o
        // PATCH e avisa, em vez de gravar só o calendário novo por cima do que
        // já existia.
        console.error("[academic-calendar-upload] profile read failed", readErr);
        toast.warning(
          "Não consegui ler seu calendário atual. As datas foram pra agenda, mas não sobrescrevi o calendário salvo.",
        );
        onSaved();
        return;
      }

      // `normalizeAcademicEvents` ordena por data e deduplica por `date|title`
      // mantendo a PRIMEIRA ocorrência — o que torna re-subir o MESMO PDF
      // idempotente, mas NÃO resolve a data remarcada: `2026-06-10|Prova N1` e
      // `2026-06-17|Prova N1` são chaves diferentes e o merge virava
      // append-only (a mesma prova em duas datas no prompt da Lumi e no
      // getTermWindows). `dropRescheduled` tira a linha antiga antes do merge;
      // com os novos NA FRENTE, o salvo bate com a preview que o aluno acabou
      // de conferir.
      const incoming = rows.map((r) => r.event);
      const kept = dropRescheduled(previous, incoming);
      const mergedEvents = normalizeAcademicEvents([...incoming, ...kept]);

      // O `dropRescheduled` acima só limpava o PERFIL. A data velha continuava
      // na AGENDA: a Prova N1 remarcada de 10/06 pra 17/06 entrava no dia 17
      // (chave nova, não bateu com a existente) e o evento do dia 10 ficava lá
      // — a MESMA prova em dois dias, sem nada dizendo qual foi cancelada,
      // enquanto a Lumi já falava só de 17/06. Aqui a data cancelada sai também
      // da agenda: o que ficou visível passa a ser exatamente a preview que o
      // aluno acabou de conferir.
      //
      // Três travas, na mesma linha conservadora do `dropRescheduled`:
      // 1) se o PDF novo ainda quer aquela data (mesma chave em qualquer linha,
      //    marcada ou não), não é remarcação e nada é apagado — re-subir o
      //    MESMO PDF não pode apagar nada;
      // 2) só apaga evento criado por este importador (marcador na description),
      //    nunca um compromisso que o aluno digitou com o mesmo título e dia;
      // 3) só apaga a data velha se a data NOVA vai MESMO pra agenda, ou seja,
      //    se a linha que a substitui está MARCADA. `incoming` são TODAS as
      //    linhas do PDF, mas quem entra na agenda é só `chosen`: com a linha
      //    desmarcada — feriado, recesso e evento já nascem assim (DEFAULT_ON),
      //    e o aluno pode desmarcar qualquer uma — o `dropRescheduled` derrubava
      //    a data antiga, ninguém inseria a nova e o evento SUMIA do mês, da
      //    semana, da agenda e da sidebar, com o toast ainda anunciando "1 data
      //    remarcada (tirei a antiga)". A troca de categoria entre uploads (a
      //    extração roda sem temperature fixa, então a MESMA linha volta como
      //    "evento" em vez de "nota" e muda o eventType) não desalinha mais nada
      //    aqui: a chave da agenda passou a ser só título + dia (ver
      //    `agendaKey`), então a trava 1 reconhece a linha mesmo com a categoria
      //    trocada — antes ela não reconhecia e o evento do upload anterior era
      //    apagado sem nada no lugar.
      const academicAgendaKey = (e: AcademicEvent) =>
        agendaKey(e.title, `${e.date}T00:00:00`);
      const keptKeys = new Set(kept.map((e) => `${e.date}|${titleKey(e.title)}`));
      const incomingAgendaKeys = new Set(incoming.map(academicAgendaKey));
      // Títulos que de fato vão pra agenda nesta subida. Título basta pra achar
      // a linha substituta: o `dropRescheduled` só derruba a data antiga quando
      // o título aparece UMA única vez de cada lado, então ele identifica
      // exatamente a linha nova (que, por ser remarcação, está em outra data).
      const chosenTitleKeys = new Set(chosen.map((r) => titleKey(r.event.title)));
      let rescheduled = 0;
      for (const old of previous) {
        if (keptKeys.has(`${old.date}|${titleKey(old.title)}`)) continue;
        const k = academicAgendaKey(old);
        if (incomingAgendaKeys.has(k)) continue;
        if (!chosenTitleKeys.has(titleKey(old.title))) continue;
        for (const e of existingByKey.get(k) ?? []) {
          if (!isFromImport(e)) continue;
          await deleteEventAsync(userId, e.id);
          rescheduled++;
          written.removed++;
        }
      }
      if (cancelledRef.current) return;
      // O zod da rota rejeita o request inteiro (400) acima de 300 eventos.
      // `slice(-300)` mantém as datas mais recentes da lista já ordenada.
      const MAX_EVENTS = 300;
      const cappedEvents = mergedEvents.slice(-MAX_EVENTS);
      const dropped = mergedEvents.length - cappedEvents.length;
      if (dropped > 0) {
        toast.warning(
          `Seu calendário passou de ${MAX_EVENTS} datas: guardei as mais recentes e descartei ${dropped} data${dropped === 1 ? "" : "s"} antiga${dropped === 1 ? "" : "s"}.`,
        );
      }

      const profileRes = await fetch("/api/user-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academicCalendar: {
            // Não zera o que já estava salvo quando a extração nova não
            // identifica instituição/ano.
            institution: institution ?? prevInstitution,
            year: year ?? prevYear,
            sourceFile: capSourceFile(fileName),
            importedAt: new Date().toISOString(),
            events: cappedEvents,
          },
        }),
      });
      if (cancelledRef.current) return;
      if (!profileRes.ok) {
        // Agenda já foi salva; avisa que só o contexto da Lumi falhou.
        console.error(
          "[academic-calendar-upload] profile patch failed",
          profileRes.status,
        );
        toast.warning(
          "Datas adicionadas na agenda, mas não consegui salvar o contexto da Lumi. Pode subir o mesmo arquivo de novo mais tarde: as datas que já estão na agenda não duplicam.",
        );
        onSaved();
        return;
      }

      // Só agora dá pra afirmar que existe calendário salvo no perfil deste
      // aluno — é o que faz o guard de leitura acima abortar num próximo
      // upload, em vez de sobrescrever o que não conseguiu ler.
      markCalendarSavedLocally(userId);

      // Conta o que REALMENTE entrou: dizer "12 datas na agenda" quando 11
      // foram puladas por já existirem é o que faz o aluno achar que duplicou.
      // Pelo mesmo motivo, período estendido e data remarcada não podem sair
      // como "essas datas já estavam na agenda": foi justamente o que mudou.
      const parts: string[] = [];
      if (pending.length > 0) {
        parts.push(
          `${pending.length} data${pending.length === 1 ? "" : "s"} na agenda`,
        );
      }
      if (extended > 0) {
        parts.push(
          `${extended} período${extended === 1 ? "" : "s"} atualizado${extended === 1 ? "" : "s"}`,
        );
      }
      if (rescheduled > 0) {
        parts.push(
          `${rescheduled} data${rescheduled === 1 ? "" : "s"} remarcada${rescheduled === 1 ? "" : "s"} (tirei a antiga)`,
        );
      }
      if (skipped > 0) {
        parts.push(`${skipped} já estava${skipped === 1 ? "" : "m"} lá`);
      }
      toast.success(
        parts.length === 0
          ? chosen.length === 0
            ? "Calendário salvo. A Lumi já conhece suas datas."
            : "Essas datas já estavam na agenda. Calendário atualizado pra Lumi."
          : `${parts.join(" · ")}. A Lumi já conhece seu calendário.`,
      );
      // Intervalo capado não pode sumir calado: o aluno marcou "02/02 a 20/12 –
      // Período letivo" e vai ver o evento SÓ no dia 02/02. Sem esta linha
      // pareceria data perdida — a alternativa (a faixa nos 322 dias) é que era
      // o bug, e o intervalo inteiro continua salvo pro contexto da Lumi.
      const collapsedSpans = chosen.filter(
        (r) => (r.event.endDate ?? r.event.date) !== agendaEndIso(r.event),
      ).length;
      if (collapsedSpans > 0) {
        toast.message(
          `${collapsedSpans} período${collapsedSpans === 1 ? "" : "s"} muito longo${collapsedSpans === 1 ? "" : "s"} (tipo "período letivo do ano" ou janela de matrícula) ${collapsedSpans === 1 ? "entrou" : "entraram"} na agenda só no dia de início, pra não marcar todos os dias. O intervalo completo continua salvo pra Lumi.`,
        );
      }
      onSaved();
    } catch (err) {
      // Se o componente já morreu não dá pra voltar pro preview nem pedir
      // retry: o toast de erro (global) sozinho basta.
      if (cancelledRef.current) return;
      console.error("[academic-calendar-upload] save failed", err);
      // Gravação PARCIAL: recarrega a tela pra ela não mentir sobre o storage.
      // Sem isso as datas já gravadas ficavam invisíveis atrás do dialog (só um
      // F5 revelava) enquanto o toast dizia que nada tinha sido salvo.
      const done: string[] = [];
      if (written.inserted > 0) {
        done.push(
          `${written.inserted} data${written.inserted === 1 ? "" : "s"} na agenda`,
        );
      }
      if (written.extended > 0) {
        done.push(
          `${written.extended} período${written.extended === 1 ? "" : "s"} atualizado${written.extended === 1 ? "" : "s"}`,
        );
      }
      if (written.removed > 0) {
        done.push(
          `${written.removed} data${written.removed === 1 ? "" : "s"} antiga${written.removed === 1 ? "" : "s"} removida${written.removed === 1 ? "" : "s"}`,
        );
      }
      if (done.length > 0) onProgress?.();
      // "Tente novamente" é instrução FALSA no erro que mais cai aqui: o
      // write() do calendar-events estoura a quota do localStorage (histórico
      // da Lumi enchendo os ~5MB) ou falha em navegação privada no Safari, que
      // estoura já na 1ª gravação — e o retry estoura IDÊNTICO pra sempre. Como
      // o throw acontece ANTES do `written.inserted = pending.length`,
      // `done.length` é 0 e sobrava só o texto genérico: o aluno clicava Salvar
      // de novo sem NADA na tela citando armazenamento cheio, e ficava sem
      // calendário no perfil (logo sem período letivo, sem feriado/recesso
      // suprimindo aula e sem contexto de datas pra Lumi). O CalendarStorageError
      // já vem com a mensagem pronta e acionável ("apague conversas antigas da
      // Lumi pra liberar espaço") e o catch jogava o `err` fora. Mesmo conserto
      // do irmão exam-pdf-upload; erro desconhecido (aí sim possivelmente
      // transitório) continua com o texto genérico e o convite ao retry.
      const storageMsg =
        err instanceof CalendarStorageError ? err.message : null;
      // Clicar "Salvar" de novo é seguro: o handleSave relê a agenda salva e
      // pula o que já está lá, então o retry continua de onde parou.
      const failMsg =
        done.length > 0
          ? `Salvei em parte: ${done.join(" · ")}. ${storageMsg ?? "O resto falhou, clique em Salvar pra continuar de onde parou."}`
          : (storageMsg ?? "Falha ao salvar. Tente novamente.");
      toast.error(failMsg);
      // Também no banner do preview: o bloco `phase === "preview"` só
      // renderizava demoNote e truncatedNote, e o catch nem chamava setError —
      // então o toast sumia em segundos e sobrava ZERO pista do que fazer.
      setError(failMsg);
      setPhase("preview");
    }
  }

  function reset() {
    setRows([]);
    setFileName(null);
    setInstitution(null);
    setYear(null);
    setError(null);
    setDemoNote(false);
    setTruncatedNote(null);
    setPhase("idle");
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Subir calendário acadêmico</DialogTitle>
        <DialogDescription>
          Envie o PDF do calendário oficial da sua faculdade. A IA extrai
          provas, entrega de notas, prazos, feriados e recessos — e a Lumi passa
          a considerar essas datas quando montar seu plano de estudos.
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
            <CalendarDays className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm font-medium">
              Clique pra selecionar o PDF ou imagem
            </div>
            {/* O teto anunciado tem que ser o da ROTA: prometer 10MB quando ela
                corta em 4MB fazia o aluno subir a foto do mural inteira só pra
                levar 413 — depois de já ter gasto um dos 2 pedidos/60s. */}
            <div className="text-xs text-muted-foreground">
              Calendário acadêmico do semestre ou do ano (máx{" "}
              {PDF_VISION_LIMIT_MB}MB)
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
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
          label="Lendo o calendário…"
          estimatedMs={26000}
          steps={[
            "Lendo o arquivo…",
            "Identificando os meses…",
            "Extraindo provas e prazos…",
            "Separando feriados e recessos…",
            "Organizando por data…",
          ]}
          hint="Calendário do ano inteiro leva alguns segundos."
        />
      )}

      {phase === "preview" && (
        <div className="space-y-3">
          {demoNote && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Modo demo (sem ANTHROPIC_API_KEY). Datas fictícias pra teste.
            </div>
          )}

          {/* Falha do "Salvar": o preview continua na tela e o erro precisa
              continuar junto. Sem isso, a única pista era um toast que já
              sumiu — e no estouro de quota do localStorage o aluno ficava sem
              saber que o caminho é liberar espaço (ou sair da navegação
              privada), não clicar de novo no mesmo botão. */}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Fica na tela até o clique em Salvar: o toast some antes de o aluno
              conferir a lista, e a decisão de salvar meio calendário como se
              fosse o completo acontece justamente aqui. */}
          {truncatedNote && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                <span className="font-medium">Leitura incompleta. </span>
                {truncatedNote}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex min-w-0 items-center gap-2">
              {fileName && (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate max-w-[180px]">{fileName}</span>
                </span>
              )}
              <button
                type="button"
                onClick={reset}
                className="shrink-0 text-primary hover:underline"
              >
                trocar arquivo
              </button>
            </div>
            <button
              type="button"
              onClick={toggleAll}
              className="inline-flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-accent"
            >
              {allSelected ? (
                <CheckSquare className="h-3.5 w-3.5" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              {allSelected ? "Desmarcar todas" : "Marcar todas"}
            </button>
          </div>

          {(institution || year) && (
            <div className="rounded-md border border-border/70 bg-card/50 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Identificado: </span>
              <span className="font-medium text-foreground">
                {institution ?? "instituição não identificada"}
                {year ? ` · ${year}` : ""}
              </span>
            </div>
          )}

          <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1">
            {grouped.map((g) => (
              <div key={g.key}>
                <div className="sticky top-0 z-10 bg-background/95 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {g.label}
                </div>
                <div className="space-y-1.5">
                  {g.items.map((r) => {
                    const meta = ACADEMIC_CATEGORY_META[r.event.category];
                    // O estado "desmarcada" é dito pelo checkbox e pelo realce
                    // da linha MARCADA — nunca por opacidade no texto. O
                    // `opacity-45` que ficava na linha inteira derrubava o
                    // título pra ~2,7:1, a data pra ~1,8:1 e o selo de categoria
                    // (10px) pra ~2,2:1 sobre o `bg-card` branco do tema claro,
                    // tudo abaixo do mínimo AA de 4,5:1 — justamente nas linhas
                    // que EXIGEM decisão, porque feriado, recesso e evento
                    // nascem desmarcados (DEFAULT_ON) e são tipicamente 20 a 40
                    // das ~87. E o selo é a única coisa na linha que diz se
                    // aquilo é Feriado, Recesso ou Evento: o
                    // ACADEMIC_CATEGORY_META subiu a escala pra `-700 dark:-400`
                    // exatamente pra ele ser legível, e a opacidade anulava essa
                    // correção no único estado em que ela importa. Resultado
                    // prático: o aluno não conseguia ler quais eram as linhas de
                    // recesso, não marcava nenhuma, e julho ficava sem aula, sem
                    // chip e sem explicação na célula.
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleRow(r.id)}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                          r.selected
                            ? "border-primary/40 bg-primary/5"
                            : "border-border/70 bg-card/50",
                        )}
                      >
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                          {r.selected ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          {/* `title` obrigatório aqui: o texto é truncado e a
                              linha INTEIRA é um <button>, então arrastar pra
                              ler o fim não seleciona — vira clique e marca/
                              desmarca a linha errada. Duas provas do mesmo dia
                              que só diferem na cauda ("…(turmas A e B)" ×
                              "…(turmas C e D)") ficavam visualmente idênticas
                              no dialog `max-w-2xl` e o aluno mandava pra agenda
                              a da turma errada. Mesmo tratamento dos irmãos da
                              tela (rótulo de dia não letivo, chip "dia todo"). */}
                          <span
                            className="block truncate text-sm font-medium text-foreground"
                            title={r.event.title}
                          >
                            {r.event.title}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {formatEventDate(r.event)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium",
                            meta.tone,
                          )}
                        >
                          {meta.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground">
            As datas marcadas entram na sua agenda. O calendário completo fica
            salvo pra Lumi consultar, mesmo o que você não marcar.
          </p>
        </div>
      )}

      {phase === "saving" && (
        <ProgressPanel
          label="Salvando calendário…"
          estimatedMs={5000}
          steps={["Adicionando na agenda…", "Ensinando as datas pra Lumi…"]}
        />
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
          <Button type="button" variant="gradient" onClick={handleSave}>
            {selectedCount > 0
              ? `Salvar ${selectedCount} data${selectedCount === 1 ? "" : "s"}`
              : "Salvar só pra Lumi"}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
