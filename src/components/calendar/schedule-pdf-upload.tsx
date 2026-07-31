"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckSquare,
  Clock,
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
  createSubjectWithOutcomeAsync,
  updateSubjectScheduleAsync,
} from "@/lib/db";
import {
  DAY_LABELS_SHORT,
  SUBJECT_PALETTE,
  type ScheduleSlot,
  type Subject,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { LIMITS, PDF_VISION_LIMIT_MB } from "@/lib/api-security";

/* ---------------- types ---------------- */

type ExtractedSubject = {
  name: string;
  schedule: ScheduleSlot[];
};

type ExtractResponse = {
  subjects?: ExtractedSubject[];
  error?: string;
  demo?: boolean;
  /**
   * Blocos que entraram no JSON da Vision e NÃO viraram aula na rota (célula
   * mesclada, célula sem hora de término, fim <= início). A normalização da
   * grade é toda server-side, então quem tem esse número é a rota — e ela o
   * manda justamente porque "quem renderiza o aviso é o schedule-pdf-upload".
   * Enquanto estes dois campos não existiam aqui, o TypeScript não reclamava
   * (o tipo é só uma anotação sobre `res.json()`) e a aula descartada sumia
   * sem uma palavra na tela: o aluno via "6 matérias identificadas.", salvava,
   * e a aula não existia no mês, na semana, na agenda nem na sidebar — e como
   * aula da grade é read-only no modal de detalhes, nem dava pra notar depois.
   */
  droppedSlots?: number;
  droppedSlotsMessage?: string;
};

const NEW_SUBJECT = "__new__";

type PreviewRow = {
  id: string;
  selected: boolean;
  subject: ExtractedSubject;
  /** id da matéria existente a atualizar, ou NEW_SUBJECT pra criar nova. */
  target: string;
  /**
   * O que já foi gravado no banco pra esta linha (espelho do ledger em ref).
   * Existe pra travar a linha no preview: depois de gravada, mudar o destino
   * não teria efeito nenhum num novo "Salvar".
   */
  appliedKind?: AppliedKind;
};

/** O que aconteceu com uma linha do preview no banco. "noop" = nada a gravar. */
type AppliedKind = "created" | "updated" | "noop";

/**
 * Linha JÁ gravada no banco nesta sessão: ganha o selo "já salva", tem checkbox
 * e destino desabilitados e é pulada por um novo Salvar. "noop" NÃO conta (nada
 * foi escrito, a linha segue editável). É a ÚNICA fonte dessa regra: enquanto o
 * render tinha a sua cópia e o toggleAll não tinha nenhuma, "Desmarcar todas"
 * desmarcava linhas gravadas e a tela afirmava as duas coisas ao mesmo tempo.
 */
function isDoneRow(r: PreviewRow): boolean {
  return !!r.appliedKind && r.appliedKind !== "noop";
}

/** Um destino do banco (matéria existente ou matéria nova) + as linhas dele. */
type SaveGroup = {
  target: string;
  /** Nome usado se o destino for uma matéria nova. */
  name: string;
  rows: PreviewRow[];
  /** Horários de TODAS as linhas do grupo, ainda sem fundir. */
  schedule: ScheduleSlot[];
};

/**
 * Junta as linhas do preview que apontam pro MESMO destino. A extração devolve
 * uma linha por bloco ("Anatomia I - Teoria" seg, "Anatomia I - Prática" qua) e
 * o findSubjectMatch casa as duas com a MESMA matéria pela regra de inclusão.
 * Gravando linha a linha, o segundo updateSubjectScheduleAsync — que faz
 * `.update({ schedule })` cru, trocando o array inteiro — apagava a grade que o
 * primeiro tinha acabado de escrever: metade da semana do aluno sumia e o toast
 * ainda dizia "2 atualizadas". Mesma família no "+ Criar nova matéria": duas
 * linhas de nome igual caem no dedup por nome lá do banco — a 1ª criava a
 * matéria e a 2ª chegava em cima da grade recém-criada (hoje somando o horário
 * dela, antes perdendo), sempre contada como criada. Um destino = uma gravação
 * só, com os horários de todas as linhas dele juntos.
 */
function groupRowsByTarget(rows: PreviewRow[]): SaveGroup[] {
  const byKey = new Map<string, SaveGroup>();
  const out: SaveGroup[] = [];
  for (const r of rows) {
    // Matéria nova: a chave é o nome na MESMA regra do dedup do banco
    // (trim + lowercase), senão o agrupamento aqui e o dedup de lá discordam.
    const key =
      r.target === NEW_SUBJECT
        ? `new:${r.subject.name.trim().toLowerCase()}`
        : `id:${r.target}`;
    const found = byKey.get(key);
    if (found) {
      found.rows.push(r);
      found.schedule.push(...r.subject.schedule);
      continue;
    }
    const group: SaveGroup = {
      target: r.target,
      name: r.subject.name,
      rows: [r],
      schedule: [...r.subject.schedule],
    };
    byKey.set(key, group);
    out.push(group);
  }
  return out;
}

export type SchedulePdfUploadProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  subjects: Subject[];
  onSaved?: () => void;
};

/* ---------------- subject matching ---------------- */

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
 * "Contém" respeitando fronteira de PALAVRA. O `includes` cru casa no MEIO da
 * palavra, e o guard de nível não segura esse caso: "Anatomia" e
 * "Neuroanatomia" não têm sufixo de nível, então as duas dão nível 0 e passam
 * pelo `sameLevel` — mas 'neuroanatomia'.includes('anatomia') é true, então a
 * linha nascia apontando pra Anatomia com o selo "substitui horário atual",
 * marcada por padrão. No Salvar, updateSubjectScheduleAsync faz
 * `.update({ schedule })` cru: a grade real da Anatomia era APAGADA e trocada
 * pela da Neuroanatomia (que nunca era criada); com as duas no mesmo PDF, o
 * groupRowsByTarget ainda fundia as aulas das duas sob o nome/cor/ícone da
 * Anatomia, e o toast dizia "Agenda salva (1 atualizada)". Não há histórico de
 * grade pra desfazer e aula da grade é read-only no modal de detalhes. Mesma
 * família em Patologia × Fisiopatologia, Química × Bioquímica, Farmacologia ×
 * Psicofarmacologia. Como `normalize` já tirou acento e caixa, sobra [a-z0-9]
 * pra letra/dígito — vizinho alfanumérico dos dois lados = está dentro de outra
 * palavra, não vale como match. É a MESMA função do irmão exam-pdf-upload
 * (exam-pdf-upload.tsx:154), pra que os dois fluxos gêmeos não discordem.
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
  name: string,
  subjects: Subject[],
): string | undefined {
  const g = normalize(name);
  if (!g) return undefined;
  const exact = subjects.find((s) => normalize(s.name) === g);
  if (exact) return exact.id;
  /**
   * A partir daqui é PALPITE (inclusão / palavra em comum), e palpite errado
   * aqui é irreversível: o Salvar chama updateSubjectScheduleAsync, que faz
   * `.update({ schedule })` cru na matéria apontada — não existe histórico de
   * grade pra desfazer. O caso que quebrava era a numeração romana, que em
   * medicina/engenharia é a regra e não a exceção: 'anatomia humana ii'
   * .includes('anatomia humana i') é true, então a grade nova de Anatomia II
   * SUBSTITUÍA a de Anatomia I (e Anatomia II nunca era criada). Mesma coisa
   * no passo por palavra: 'Cálculo III' casava com 'Cálculo I'.
   * Regra: fora do nome idêntico, só palpita entre matérias do MESMO nível
   * (romano ou arábico — "Cálculo 2" e "Cálculo II" contam igual). Nível
   * diferente = matéria diferente; na dúvida o destino nasce "+ Criar nova
   * matéria", que o aluno vê no preview e é reversível — sobrescrever a grade
   * da matéria errada não é.
   * O nível sozinho NÃO basta: nomes compostos do mesmo nível (Anatomia ×
   * Neuroanatomia, Química × Bioquímica) dão nível 0 nos dois e passam pelo
   * filtro — por isso a inclusão daqui pra baixo é por PALAVRA INTEIRA
   * (includesWord), nunca substring nua.
   */
  const level = subjectLevel(g);
  const sameLevel = subjects.filter(
    (s) => subjectLevel(normalize(s.name)) === level,
  );
  const contains = sameLevel.find((s) => {
    const n = normalize(s.name);
    return includesWord(n, g) || includesWord(g, n);
  });
  if (contains) return contains.id;
  /**
   * Último palpite, e o mais perigoso: enquanto bastava UMA palavra em comum
   * (`words.some`), o adjetivo genérico do nome casava matérias diferentes.
   * "Anatomia Humana" (grade nova) achava "Bioquímica Humana" (já salva) por
   * causa de "humana": a linha nascia "Atualizar: Bioquímica Humana", já
   * MARCADA e com o aviso "substitui horário atual" em cinza de 10px, e o
   * Salvar mandava `.update({ schedule })` cru — a grade real da Bioquímica
   * era APAGADA e trocada pela da Anatomia, que nunca era criada. Não há
   * histórico de grade pra desfazer, nenhuma tela do app edita horário de
   * matéria e aula da grade é read-only no modal. Mesma família: Cálculo
   * Diferencial × Cálculo Integral, Química Geral × Física Geral.
   * Regra: TODAS as palavras significativas de um dos nomes têm que estar no
   * outro. É o que ainda casa o caso que justifica este passo — numeração que
   * o passo de inclusão não pega, "Anatomia Humana I" × "Anatomia Humana 1" e
   * "Anatomia Humana I" × "Anatomia I" — e recusa quem só compartilha o
   * adjetivo. Na dúvida a linha nasce "+ Criar nova matéria": duplicar uma
   * matéria o aluno vê no preview e desfaz; sobrescrever a grade da matéria
   * errada, não.
   */
  const words = g.split(/\s+/).filter((w) => w.length >= 4);
  if (words.length > 0) {
    const wordMatch = sameLevel.find((s) => {
      const n = normalize(s.name);
      const nWords = n.split(/\s+/).filter((w) => w.length >= 4);
      return (
        words.every((w) => includesWord(n, w)) ||
        (nWords.length > 0 && nWords.every((w) => includesWord(g, w)))
      );
    });
    if (wordMatch) return wordMatch.id;
  }
  return undefined;
}

function defaultColorForIndex(idx: number): string {
  return SUBJECT_PALETTE[idx % SUBJECT_PALETTE.length].color;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Funde aulas geminadas num bloco só. A grade da faculdade vem em "tempos"
 * de ~50min (07:30-08:20, 08:20-09:10), então uma aula dupla virava a tripa
 * "Ter 07:30–08:20 · Ter 08:20–09:10". Aqui vira "Ter 07:30–09:10".
 * Tolerância de 15min cobre o intervalinho entre tempos.
 */
const GAP_TOLERANCE_MIN = 15;

type DayBlocks = { day: number; blocks: Array<{ start: string; end: string }> };

/**
 * Fusão sobre ScheduleSlot (preserva `room`). É ESTA que vai pro banco —
 * o preview deriva daqui pra que o que o aluno confere seja exatamente o
 * que a agenda vai mostrar.
 */
function mergeSlots(schedule: ScheduleSlot[]): ScheduleSlot[] {
  const byDay = new Map<number, ScheduleSlot[]>();
  for (const s of schedule) {
    const list = byDay.get(s.dayOfWeek);
    if (list) list.push(s);
    else byDay.set(s.dayOfWeek, [s]);
  }
  const out: ScheduleSlot[] = [];
  for (const [day, slots] of byDay) {
    const sorted = [...slots].sort(
      (a, b) => toMinutes(a.startTime) - toMinutes(b.startTime),
    );
    for (const s of sorted) {
      const last = out.length > 0 ? out[out.length - 1] : undefined;
      if (
        last &&
        last.dayOfWeek === day &&
        toMinutes(s.startTime) - toMinutes(last.endTime) <= GAP_TOLERANCE_MIN &&
        // Só funde se a sala for a mesma: salas diferentes = aulas diferentes.
        (last.room ?? "") === (s.room ?? "")
      ) {
        // Encosta no bloco anterior: estende (nunca encurta).
        if (toMinutes(s.endTime) > toMinutes(last.endTime)) last.endTime = s.endTime;
      } else {
        out.push({ ...s });
      }
    }
  }
  return out;
}

/**
 * Junta o que sobrou da grade ANTIGA com a grade nova SEM colar um bloco velho
 * num novo. O mergeSlots existe pra emendar "tempos" geminados do MESMO arquivo
 * (07:30-08:20 + 08:20-09:10 = 07:30-09:10); rodando por cima de antigo+novo ele
 * INVENTAVA horário. O aluno tem Anatomia seg 07:30-09:10 salva, a faculdade
 * retifica a grade pra seg 09:20-11:00 e ele sobe o PDF novo: basta a importação
 * ser parcial (a rota descartou um bloco de QUALQUER matéria, ou existe linha
 * desmarcada apontando pra esta mesma matéria) pra `kept` ser a grade velha
 * INTEIRA — aí 09:20 − 09:10 = 10 min <= GAP_TOLERANCE_MIN e, sem sala nos dois
 * ("" === "" sempre casa), os dois viravam UM slot seg 07:30-11:00: horário que
 * não existe nem na grade velha nem na nova, e o aluno vai pra faculdade 1h50
 * antes (mês, semana, agenda e sidebar mostram o bloco fantasma). Pior, o aviso
 * "somei ao antigo" não disparava, porque a guarda compara TAMANHO de array e a
 * fusão devolvia 1 slot contra 1 slot — e não há como consertar depois: nenhuma
 * tela do app edita horário de matéria e aula da grade é read-only no modal.
 * Aqui o bloco antigo é preservado como bloco SEPARADO (o aluno vê os dois, o
 * aviso dispara e ele conserta); só não entra o que a grade nova já traz
 * idêntico, pra reimportar o mesmo PDF não duplicar tudo.
 */
function unionSlots(
  keptOld: ScheduleSlot[],
  fresh: ScheduleSlot[],
): ScheduleSlot[] {
  const key = (s: ScheduleSlot) =>
    `${s.dayOfWeek}|${s.startTime}|${s.endTime}|${s.room ?? ""}`;
  const seen = new Set(fresh.map(key));
  const out = fresh.map((s) => ({ ...s }));
  for (const s of keptOld) {
    if (seen.has(key(s))) continue;
    seen.add(key(s));
    out.push({ ...s });
  }
  // Seg→Dom e por horário: o array vai cru pra tela da matéria (chips de
  // "Horários"), então misturar velho e novo fora de ordem confunde à toa.
  return out.sort(
    (a, b) =>
      ((a.dayOfWeek + 6) % 7) - ((b.dayOfWeek + 6) % 7) ||
      toMinutes(a.startTime) - toMinutes(b.startTime),
  );
}

function mergeSlotsByDay(schedule: ScheduleSlot[]): DayBlocks[] {
  const byDay = new Map<number, Array<{ start: string; end: string }>>();
  for (const s of mergeSlots(schedule)) {
    const block = { start: s.startTime, end: s.endTime };
    const blocks = byDay.get(s.dayOfWeek);
    if (blocks) blocks.push(block);
    else byDay.set(s.dayOfWeek, [block]);
  }
  const out: DayBlocks[] = [];
  for (const [day, blocks] of byDay) out.push({ day, blocks });
  // Ordena Seg→Dom (domingo por último, não primeiro).
  return out.sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7));
}

/**
 * Teto de tempo da extração. Sem ele, o fetch de um celular que troca o wifi da
 * faculdade pelo 4G no meio do upload (ou cai num captive portal) não resolve
 * NEM rejeita — o socket fica parado até o timeout de TCP do SO, minutos — e o
 * dialog fica trancado: com `phase` em "extracting" o Cancelar está disabled, o
 * X some (hideClose={busy}), ESC e clique fora levam preventDefault e o
 * ProgressPanel segue animando como se estivesse vivo. Não sobrava UMA saída na
 * tela: só F5, perdendo o arquivo já escolhido. Generoso de propósito — a
 * extração de verdade chega a ~100s e abortar uma leitura boa joga fora a
 * chamada paga do Vision e um dos 2 pedidos/60s do rate-limit da rota.
 */
const EXTRACT_TIMEOUT_MS = 150_000;

/* ---------------- main component ---------------- */

export function SchedulePdfUpload({
  open,
  onOpenChange,
  userId,
  subjects,
  onSaved,
}: SchedulePdfUploadProps) {
  // Enquanto está extraindo/salvando, o dialog não pode ser fechado: o corpo é
  // desmontado pelo `{open && …}` e o trabalho em voo sumiria da tela — a
  // extração já paga do Vision chegaria num componente morto (e o aluno nem
  // podia tentar de novo na hora, a rota tem rate-limit), e no "saving" o loop
  // continuaria gravando matérias com o ledger appliedRef e o preview mortos,
  // deixando o retry sem como continuar de onde parou. O botão Cancelar já
  // ficava desabilitado; ESC/overlay/X é o mesmo caso.
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
          <SchedulePdfUploadBody
            userId={userId}
            subjects={subjects}
            onBusyChange={setBusy}
            onClose={() => onOpenChange(false)}
            onSaved={() => {
              onSaved?.();
              onOpenChange(false);
            }}
            // Recarrega as matérias SEM fechar o diálogo: numa falha no meio do
            // loop, a tela precisa refletir o que já foi gravado e ainda deixar
            // o aluno clicar "Salvar" pra continuar de onde parou.
            onProgress={() => onSaved?.()}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SchedulePdfUploadBody({
  userId,
  subjects,
  onBusyChange,
  onClose,
  onSaved,
  onProgress,
}: {
  userId: string;
  subjects: Subject[];
  /** Avisa o wrapper que há trabalho em voo (bloqueia ESC/overlay/X). */
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
  /** Recarrega as matérias da tela sem fechar o diálogo (gravação parcial). */
  onProgress?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<
    "idle" | "extracting" | "preview" | "saving"
  >("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [demoNote, setDemoNote] = useState(false);
  /**
   * Aviso de bloco de horário que a rota descartou. Fica em state (banner no
   * preview), não só em toast: o toast some em segundos e a decisão de clicar
   * "Salvar" vem DEPOIS dele — o aviso precisa estar na tela na hora em que o
   * aluno confere a grade que vai gravar.
   */
  const [droppedNote, setDroppedNote] = useState<string | null>(null);
  /**
   * O que JÁ foi gravado no banco, por linha do preview. Fica em ref (imune a
   * re-render) pra que um retry depois de falha no meio do loop não regrave as
   * matérias já gravadas — e, principalmente, não some de novo o mesmo horário
   * em cima da grade de quem já foi salva.
   */
  const appliedRef = useRef<Map<string, AppliedKind>>(new Map());

  // Trabalho em voo: o wrapper usa isso pra bloquear ESC/overlay/X.
  useEffect(() => {
    onBusyChange(phase === "extracting" || phase === "saving");
  }, [phase, onBusyChange]);

  // Defesa em profundidade pro que escapa do bloqueio acima, que só cobre
  // teclado e clique no dialog (voltar do browser / gesto de back no celular,
  // logout, hot-reload): marca o trabalho como cancelado, aborta a requisição
  // e mata o toast de loading. Sem isso, sair da /schedule no meio da extração
  // deixava o "Lendo sua grade horária…" girando até 100s na tela de destino,
  // o setRows/setPhase caía num componente morto (preview extraído — e pago —
  // perdido em silêncio) e o toast.success("N matérias identificadas.")
  // estourava no /dashboard falando de um dialog que não existe mais.
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
  // "Marcar/Desmarcar todas" só fala das linhas que ele PODE mexer: contando as
  // já gravadas, o rótulo prometia uma ação que o clique não executa (com todas
  // gravadas o botão dizia "Desmarcar todas" e não fazia nada).
  const toggleable = useMemo(() => rows.filter((r) => !isDoneRow(r)), [rows]);
  const allSelected =
    toggleable.length > 0 && toggleable.every((r) => r.selected);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setDemoNote(false);
      setDroppedNote(null);

      const okType =
        file.type === "application/pdf" || file.type.startsWith("image/");
      if (!okType) {
        const msg = "Envie um PDF ou imagem (PNG, JPG, WEBP).";
        setError(msg);
        toast.error(msg);
        return;
      }
      /**
       * O teto aqui é o MESMO da rota (LIMITS.PDF_VISION_BYTES), lido da mesma
       * constante — hardcodar 10MB aqui deixava as duas metades desalinhadas
       * depois que a rota passou a cortar em 4MB. O modo de falha: o aluno
       * fotografa a grade impressa (JPEG de 6MB, o caso clássico), o guard
       * local deixava passar e o upload inteiro subia só pra voltar 413 —
       * e voltava CARO, porque na rota o rate-limit por IP (2 req/60s) é
       * cobrado ANTES do guard de tamanho. Reduzir a imagem e tentar de novo
       * queimava o 2º token e a terceira tentativa já batia em rate-limit.
       * Barrando aqui, nenhum byte sai e nenhum token é gasto. A mensagem
       * repete a dica da rota pra ele saber o que fazer sem tentar às cegas.
       */
      if (file.size > LIMITS.PDF_VISION_BYTES) {
        const msg = `Arquivo muito grande (máx ${PDF_VISION_LIMIT_MB}MB). Foto de celular costuma passar disso: reduza a resolução/qualidade da imagem, recorte só a grade ou envie o PDF do portal.`;
        setError(msg);
        toast.error(msg);
        return;
      }

      setFileName(file.name);
      setPhase("extracting");
      const toastId = toast.loading("Lendo sua grade horária…");
      toastIdRef.current = toastId;

      // Rede pendurada (ver EXTRACT_TIMEOUT_MS): o abort é a única coisa que
      // devolve o dialog pro "idle", onde ele consegue fechar ou tentar de novo.
      let timedOut = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const fd = new FormData();
        fd.append("file", file);
        const ac = new AbortController();
        abortRef.current = ac;
        timer = setTimeout(() => {
          timedOut = true;
          ac.abort();
        }, EXTRACT_TIMEOUT_MS);
        const res = await fetch("/api/extract-schedule", {
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
          const msg = data?.error || "Falha ao processar a grade.";
          toastIdRef.current = null;
          toast.error(msg, { id: toastId });
          setError(msg);
          setPhase("idle");
          return;
        }

        const extracted = Array.isArray(data.subjects) ? data.subjects : [];
        /**
         * Blocos de horário que a rota jogou fora ao normalizar (célula
         * mesclada, sem hora de término, fim <= início). Sem ler o contador, a
         * aula descartada sumia calada: o preview mostrava a matéria só com o
         * bloco que sobrou, o toast dizia "N matérias identificadas." e o aluno
         * confirmava o Salvar achando que a grade estava inteira. A mensagem
         * pronta vem da rota; o fallback existe só pra resposta antiga/sem o
         * texto, pra nunca cair no silêncio de novo.
         */
        const droppedSlots =
          typeof data.droppedSlots === "number" && data.droppedSlots > 0
            ? Math.trunc(data.droppedSlots)
            : 0;
        const droppedMsg =
          droppedSlots > 0
            ? data.droppedSlotsMessage ||
              `${droppedSlots} horário${droppedSlots === 1 ? "" : "s"} da grade ${droppedSlots === 1 ? "veio incompleto" : "vieram incompletos"} (ex: célula sem hora de término ou mesclada) e ${droppedSlots === 1 ? "ficou" : "ficaram"} de fora. Confira ${droppedSlots === 1 ? "essa aula" : "essas aulas"} no arquivo e adicione ${droppedSlots === 1 ? "ela" : "elas"} manualmente.`
            : null;

        if (extracted.length === 0) {
          // Quando TODOS os blocos caem, "Não encontrei matérias na grade"
          // culpa a nitidez do arquivo e manda o aluno refotografar a grade —
          // queimando o rate-limit de 2 req/60s por um problema que está no
          // horário lido, não na leitura. Se a rota contou descarte, o aviso
          // dela é que explica o que aconteceu.
          const msg =
            droppedMsg || data?.error || "Não encontrei matérias na grade.";
          toastIdRef.current = null;
          toast.message(msg, { id: toastId });
          setError(msg);
          setPhase("idle");
          return;
        }

        const previewRows: PreviewRow[] = extracted.map((s, idx) => {
          const match = findSubjectMatch(s.name, subjects);
          return {
            id: `${idx}`,
            // Por padrão só marca quem tem horário detectado (evita criar
            // matéria vazia ou sobrescrever horário existente com nada).
            selected: s.schedule.length > 0,
            subject: s,
            target: match ?? NEW_SUBJECT,
          };
        });

        setRows(previewRows);
        setDemoNote(!!data.demo);
        setDroppedNote(droppedMsg);
        setPhase("preview");
        toastIdRef.current = null;
        toast.success(
          `${extracted.length} matéria${extracted.length === 1 ? "" : "s"} identificada${extracted.length === 1 ? "" : "s"}.`,
          { id: toastId },
        );
        // Mesma régua dos irmãos exam-pdf-upload e academic-calendar-upload: o
        // toast de sucesso conta só o que SOBREVIVEU, então sem este aviso o
        // aluno não tem nenhum sinal de que uma aula do PDF ficou de fora — nem
        // no preview, nem depois (aula da grade é read-only no modal de
        // detalhes), e só descobre reconferindo o arquivo slot a slot.
        if (droppedMsg) toast.warning(droppedMsg);
      } catch (err) {
        // O abort do próprio unmount cai aqui: sem esse guard o aluno veria um
        // toast.error("The user aborted a request.") depois de fechar.
        if (cancelledRef.current) return;
        // Abort do teto de tempo: a mensagem crua do DOM ("The user aborted a
        // request.") culparia o aluno por algo que ele não fez e não diria o
        // que fazer. Nada foi salvo — a rota só lê o arquivo.
        if (timedOut) {
          const msg =
            "A leitura demorou demais e foi cancelada (conexão instável?). Nada foi salvo — confira a internet e envie o arquivo de novo.";
          toastIdRef.current = null;
          toast.error(msg, { id: toastId });
          setError(msg);
          setPhase("idle");
          return;
        }
        console.error("[schedule-pdf-upload] extract failed", err);
        const msg =
          err instanceof Error ? err.message : "Erro inesperado ao processar.";
        toastIdRef.current = null;
        toast.error(msg, { id: toastId });
        setError(msg);
        setPhase("idle");
      } finally {
        // Sempre: o timer sobrevivendo ao sucesso abortaria a PRÓXIMA leitura.
        clearTimeout(timer);
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
    const next = !allSelected;
    setRows((prev) =>
      // Linha já gravada NÃO entra no toggle. Desmarcando todas depois de uma
      // gravação parcial, ela virava `selected: false` mantendo o selo verde
      // "já salva" e o texto "gravada nesta sessão": a linha renderizava o
      // quadrado vazio com opacity-50 afirmando as duas coisas ao mesmo tempo,
      // e não havia volta individual (o checkbox está `disabled`, só "Marcar
      // todas" reselecionava — desfazendo a seleção que ele acabou de montar).
      prev.map((r) => (isDoneRow(r) ? r : { ...r, selected: next })),
    );
  }

  function setRowTarget(id: string, target: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, target } : r)),
    );
  }

  /**
   * Espelha no state o que o ledger (ref) já gravou, pra travar as linhas.
   * Recebe a lista porque uma gravação atende TODAS as linhas do grupo de uma
   * vez — travar só uma deixaria as irmãs editáveis mentindo pro aluno.
   */
  function markRowsApplied(ids: string[], kind: AppliedKind) {
    const set = new Set(ids);
    setRows((prev) =>
      prev.map((r) => (set.has(r.id) ? { ...r, appliedKind: kind } : r)),
    );
  }

  async function handleSave() {
    const toApply = rows.filter((r) => r.selected);
    if (toApply.length === 0) {
      toast.error("Selecione pelo menos uma matéria.");
      return;
    }

    setPhase("saving");
    const applied = appliedRef.current;
    /**
     * A linha virou MESMO uma gravação no banco? "noop" (destino existente sem
     * horário nenhum pra gravar) entra no ledger só como "já avaliei", e a UI
     * de propósito deixa essa linha destravada (`done` exige kind !== "noop":
     * checkbox e destino continuam habilitados, sem o selo "já salva"). As duas
     * condições discordavam: numa gravação parcial, o aluno trocava o destino
     * da linha "noop" pra "+ Criar nova matéria", clicava Salvar, e a guarda de
     * retry — que só olhava `applied.has(id)` — pulava o grupo. Nada era
     * gravado, nenhum aviso aparecia e o toast ainda dizia "Agenda salva": a
     * correção explícita dele era descartada em silêncio. Só quem de fato virou
     * linha no banco pode ser pulado; regravar uma "noop" é inofensivo (ela não
     * escreveu nada).
     */
    const isWritten = (id: string) => {
      const kind = applied.get(id);
      return kind === "created" || kind === "updated";
    };
    // Uma gravação por DESTINO, não por linha: duas linhas na mesma matéria
    // viravam dois updates e o segundo apagava o horário do primeiro.
    const groups = groupRowsByTarget(toApply);
    /** Grupos gravados NESTA tentativa — o toast de sucesso só conta estes. */
    let created = 0;
    let updated = 0;
    /**
     * Destinos "+ Criar nova matéria" que o banco NÃO criou: a matéria já
     * existia (dedup por nome no semestre ativo) e não havia nada novo pra
     * gravar. Zero inserts, então não podem entrar no balde de "criadas" —
     * era exatamente essa a mentira do toast.
     */
    let unchanged = 0;
    /**
     * Matérias cuja grade nova foi SOMADA à antiga (em vez de substituída):
     * pelo banco, no "+ Criar nova matéria" que caiu no dedup por nome, ou aqui
     * mesmo, quando a importação não cobria a grade toda e a parte antiga foi
     * preservada. Guarda os nomes porque isso deixa horário fantasma na agenda
     * e o aluno precisa saber quais conferir.
     */
    const mergedNames: string[] = [];
    try {
      // Cor pra matérias novas: continua a paleta a partir das já existentes.
      let newIdx = subjects.length;
      for (const g of groups) {
        /**
         * O bloqueio de ESC/overlay/X não cobre o botão VOLTAR do browser (nem
         * o gesto de back no celular) — a mesma rota de fuga que a extração já
         * trata. Ao desmontar, o preview, o botão Salvar e o ledger appliedRef
         * morrem junto com o corpo: seguir gravando aqui só produz matéria que
         * ninguém conferiu e, na primeira falha, um `onProgress?.()`
         * recarregando uma página desmontada mais um toast órfão no /dashboard
         * mandando "clicar em Salvar pra continuar de onde parou" — botão que
         * não existe mais, e um "de onde parou" impossível (reabrir nasce em
         * `idle` e obriga a refazer a extração paga, sujeita ao rate-limit de
         * 2 req/60s). Para no bloco atual, igual o academic-calendar-upload.
         */
        if (cancelledRef.current) return;
        // Retry idempotente: o que já entrou no banco não é gravado de novo.
        // O grupo inteiro é gravado e marcado de uma vez, então ou todas as
        // linhas dele estão no ledger ou nenhuma está. "noop" NÃO conta como
        // gravada (ver isWritten): a UI deixa essa linha editável, então um
        // novo destino tem que ser respeitado.
        if (g.rows.every((r) => isWritten(r.id))) continue;
        const ids = g.rows.map((r) => r.id);
        // Funde os horários de TODAS as linhas do destino num array só — é ele
        // que substitui a coluna `schedule` inteira lá no banco.
        const schedule = mergeSlots(g.schedule);
        if (g.target === NEW_SUBJECT) {
          /**
           * Quem manda no que aconteceu é o BANCO, não este loop. A criação é
           * idempotente por nome dentro do semestre ativo: quando a matéria já
           * existe, nenhum insert acontece — ou o horário novo é somado ao que
           * já estava lá ("schedule-merged"), ou não há nada pra gravar
           * ("existing"). O `created += 1` incondicional (com o outcome
           * descartado) mentia justo no pior cenário: com o banner "Não
           * consegui carregar suas matérias" na tela, `subjects` chega vazio, o
           * findSubjectMatch não casa nada e TODA linha nasce "+ Criar nova
           * matéria" — o toast dizia "Agenda salva (5 criadas)" com ZERO
           * criações e cada linha ganhava o selo "já salva" travando o select,
           * tirando do aluno a única chance de reapontar a linha pra matéria
           * certa depois de recarregar a lista.
           */
          const { subject: savedSubject, outcome } =
            await createSubjectWithOutcomeAsync(userId, {
              name: g.name,
              color: defaultColorForIndex(newIdx),
              schedule,
            });
          newIdx += 1;
          if (outcome === "created") {
            created += 1;
            for (const id of ids) applied.set(id, "created");
            markRowsApplied(ids, "created");
          } else if (outcome === "schedule-merged") {
            // Gravação de verdade (conta como atualizada), MAS o banco somou o
            // horário novo ao antigo em vez de trocar: se a aula mudou de
            // horário no semestre, ela passa a aparecer nos DOIS (mês, semana,
            // agenda e sidebar) enquanto o preview mostrou só o novo. Não
            // existe tela na agenda pra apagar o slot velho, então o mínimo é
            // dizer o nome de quem ficou assim (aviso lá embaixo).
            updated += 1;
            mergedNames.push(savedSubject.name);
            for (const id of ids) applied.set(id, "updated");
            markRowsApplied(ids, "updated");
          } else {
            // "existing": a matéria já estava lá e nada foi escrito. Entra no
            // ledger como "noop" — que a UI de propósito deixa DESTRAVADO — pra
            // não anunciar criação inexistente nem travar o select: assim o
            // aluno ainda consegue apontar a linha pra matéria certa e salvar
            // de novo. Reavaliar essa linha num retry é inofensivo (o banco não
            // grava nada de novo).
            unchanged += 1;
            for (const id of ids) applied.set(id, "noop");
            markRowsApplied(ids, "noop");
          }
        } else if (schedule.length > 0) {
          // Só atualiza horário de matéria existente quando há horários —
          // nunca sobrescreve uma grade existente com vazio.
          /**
           * …e nunca sobrescreve a grade INTEIRA com o pedaço que veio deste
           * upload: updateSubjectScheduleAsync faz `.update({ schedule })` cru,
           * então o que sai daqui substitui a coluna toda. Aula já salva sumia
           * sem o aluno pedir (mês, semana, agenda e sidebar), sem histórico de
           * grade pra desfazer e sem tela pra recriar — aula da grade é
           * read-only no modal de detalhes — e o toast ainda dizia só "1
           * atualizada". Dois caminhos batiam nisso: (a) o aluno DESMARCA a
           * linha de segunda ("essa já está certa") e sobe o PDF retificado só
           * pela quarta — a linha desmarcada não entra no `toApply` e a aula de
           * segunda ia junto; (b) a rota descarta um bloco (célula mesclada /
           * sem hora de término) e a grade incompleta substituía a completa,
           * enquanto o banner âmbar só dizia "adicione ela manualmente" (se lê
           * como "faltou nesta importação", não como "vou apagar a que já
           * estava lá"). Regra: a grade antiga só é preservada quando a
           * importação é SABIDAMENTE parcial — bloco descartado pela rota ou
           * linha desmarcada apontando pra esta mesma matéria; aí nada do
           * antigo é jogado fora, e o que sobrar entra no mesmo aviso do
           * caminho gêmeo "+ Criar nova matéria" (que já SOMA em vez de
           * substituir): horário duplicado o aluno vê e conserta, aula apagada
           * não.
           * Preservar por DIA (guardar todo dia que a grade nova não trouxe)
           * parecia o meio-termo seguro e criava aula IMORTAL: quando a
           * faculdade TIRA a aula de segunda, o PDF novo traz só a quarta,
           * segunda nunca entra nos dias cobertos e o slot velho voltava somado
           * — Anatomia toda segunda 07:30 o semestre inteiro, no mês, na
           * semana, na agenda e na sidebar, e o aluno indo pra faculdade numa
           * segunda vazia. E sem saída: este upload é o ÚNICO call site de
           * updateSubjectScheduleAsync e aula da grade é read-only no modal de
           * detalhes, então nenhuma tela apaga o slot — subir o MESMO PDF
           * corrigido de novo dava exatamente o mesmo resultado (o antigo já
           * tinha os dois dias e segunda seguia descoberta). O único sinal era
           * um toast que some em segundos, contra um preview que mostrou só
           * "Qua 13:00–14:40" e o rótulo "substitui horário atual". Importação
           * completa = o que o aluno conferiu no preview é o que fica.
           */
          const existing = subjects.find((s) => s.id === g.target);
          const old = existing?.schedule ?? [];
          const partial =
            !!droppedNote ||
            rows.some((r) => !r.selected && r.target === g.target);
          const kept = partial ? old : [];
          // União, NUNCA mergeSlots aqui: fundir o bloco antigo com o novo
          // inventa um horário que não existe em nenhuma das duas grades
          // (ver unionSlots) — o antigo tem que sobreviver como bloco à parte.
          const finalSchedule =
            kept.length > 0 ? unionSlots(kept, schedule) : schedule;
          await updateSubjectScheduleAsync(userId, g.target, finalSchedule);
          // Só avisa quando aula antiga de fato SOBREVIVEU além do que veio no
          // upload (o unionSlots descarta as idênticas): senão o aviso viraria
          // ruído em toda regravação da mesma grade.
          if (finalSchedule.length > schedule.length)
            mergedNames.push(existing?.name ?? g.name);
          updated += 1;
          for (const id of ids) applied.set(id, "updated");
          markRowsApplied(ids, "updated");
        } else {
          for (const id of ids) applied.set(id, "noop");
          markRowsApplied(ids, "noop");
        }
      }
      // Fecha a janela entre a ÚLTIMA gravação e o fim: sem isso, sair da
      // página no último await ainda soltava "Agenda salva (…)" e o onSaved()
      // (que fecha um dialog inexistente) na tela de destino.
      if (cancelledRef.current) return;
      const parts: string[] = [];
      if (updated > 0)
        parts.push(`${updated} atualizada${updated === 1 ? "" : "s"}`);
      if (created > 0)
        parts.push(`${created} criada${created === 1 ? "" : "s"}`);
      // Matéria que já existia igual não vira "criada": aparece como o que de
      // fato é, senão o toast anuncia gravação que nunca chegou no banco.
      if (unchanged > 0)
        parts.push(
          `${unchanged} já estava${unchanged === 1 ? "" : "m"} salva${unchanged === 1 ? "" : "s"}`,
        );
      toast.success(
        parts.length > 0 ? `Agenda salva (${parts.join(", ")}).` : "Agenda salva.",
      );
      /**
       * Horário fantasma: o banco não substitui a grade de uma matéria que já
       * existe, ele SOMA. Quem subiu a grade nova do semestre com a aula em
       * outro horário fica com os dois na agenda, e o preview não mostrou isso.
       * Sem aviso o aluno só descobre estudando pelo horário cancelado — e não
       * há tela na agenda pra remover o slot velho.
       */
      if (mergedNames.length > 0) {
        const um = mergedNames.length === 1;
        toast.warning(
          `${mergedNames.join(", ")} já existia${um ? "" : "m"} na sua conta: o horário novo foi somado ao antigo, não substituído. Se a aula mudou de horário, confira a agenda — ela vai aparecer nos dois.`,
        );
      }
      onSaved();
    } catch (err) {
      console.error("[schedule-pdf-upload] save failed", err);
      // Componente já morto (voltar do browser no meio da gravação): não há
      // preview pra onde voltar, nem botão Salvar pra clicar, nem ledger vivo
      // pra continuar de onde parou. Recarregar a tela desmontada e pedir retry
      // num dialog que não existe mais só confunde — sai sem toast fantasma.
      if (cancelledRef.current) return;
      // Gravação PARCIAL: recarrega a tela pra ela não mentir sobre o banco.
      onProgress?.();
      // Conta DESTINOS, não linhas: várias linhas do preview podem virar uma
      // matéria só, e "3 de 5 salvas" com 2 matérias no banco confundiria.
      // Mesma régua da guarda de retry: "noop" não é matéria salva (nada foi
      // gravado), senão o "2 de 3 salvas" contaria uma linha que nunca chegou
      // no banco e ainda vai ser reavaliada no próximo Salvar.
      const handled = groups.filter((g) =>
        g.rows.every((r) => isWritten(r.id)),
      ).length;
      toast.error(
        `${handled} de ${groups.length} matéria${groups.length === 1 ? "" : "s"} salva${handled === 1 ? "" : "s"}. Falha ao salvar o resto — clique em Salvar pra continuar de onde parou.`,
      );
      setPhase("preview");
    }
  }

  function reset() {
    appliedRef.current = new Map();
    setRows([]);
    setFileName(null);
    setError(null);
    setDemoNote(false);
    // Aviso do arquivo anterior não pode sobrar pro próximo: ele fala de blocos
    // que não existem mais no preview novo.
    setDroppedNote(null);
    setPhase("idle");
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Subir agenda da faculdade</DialogTitle>
        <DialogDescription>
          Envie o PDF ou print da sua grade horária — a IA identifica as
          matérias e horários pra montar seu calendário de aulas.
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
              Clique pra selecionar um PDF ou imagem
            </div>
            {/* Limite vindo da mesma constante da rota: a tela prometendo
                10MB enquanto o servidor cortava em 4MB era o que fazia o
                aluno subir o arquivo inteiro pra levar 413 e ainda queimar
                um dos 2 pedidos/60s do rate-limit. */}
            <div className="text-xs text-muted-foreground">
              Grade horária, plano de ensino, print do portal… (máx{" "}
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
          label="Lendo sua grade…"
          estimatedMs={14000}
          steps={[
            "Lendo o arquivo…",
            "Identificando as matérias…",
            "Extraindo dias e horários…",
            "Organizando a grade…",
          ]}
          hint={fileName ?? undefined}
        />
      )}

      {phase === "preview" && (
        <div className="space-y-3">
          {demoNote && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Modo demo (sem ANTHROPIC_API_KEY). Matérias fictícias pra teste.
            </div>
          )}
          {/* Aula do arquivo que a rota descartou. Fica FIXO no preview, não só
              no toast: é aqui, na hora de conferir a grade e clicar Salvar, que
              o aluno precisa saber que faltou um bloco — depois de salvo a aula
              simplesmente não existe (mês, semana, agenda, sidebar) e ele não
              tem como perceber pela UI. */}
          {droppedNote && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {droppedNote}
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
                trocar arquivo
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
              {allSelected ? "Desmarcar todas" : "Marcar todas"}
            </button>
          </div>

          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {rows.map((r) => {
              const matchedExisting =
                r.target !== NEW_SUBJECT
                  ? subjects.find((s) => s.id === r.target)
                  : undefined;
              // Já gravada no banco: um novo "Salvar" pula esta linha, então o
              // destino não pode continuar editável (mentiria pro aluno).
              // MESMA função do toggleAll de propósito: as duas regras
              // discordarem é o que deixava a linha com selo "já salva" e
              // checkbox desmarcado ao mesmo tempo.
              const done = isDoneRow(r);
              return (
                <div
                  key={r.id}
                  className={cn(
                    "rounded-lg border border-border/70 bg-card/50 px-3 py-2.5 transition-opacity",
                    !r.selected && "opacity-50",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleRow(r.id)}
                      disabled={done}
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center disabled:cursor-not-allowed"
                      aria-label={r.selected ? "Desmarcar" : "Selecionar"}
                    >
                      {r.selected ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium leading-snug text-foreground">
                        <span className="min-w-0">{r.subject.name}</span>
                        {done && (
                          <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                            já salva
                          </span>
                        )}
                      </div>
                      {r.subject.schedule.length === 0 ? (
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3 shrink-0" />
                          Sem horário detectado
                        </div>
                      ) : (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {mergeSlotsByDay(r.subject.schedule).map((d) => (
                            <span
                              key={d.day}
                              className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground"
                            >
                              <span className="font-semibold text-foreground">
                                {DAY_LABELS_SHORT[d.day] ?? "?"}
                              </span>
                              {d.blocks
                                .map((b) => `${b.start}–${b.end}`)
                                .join(", ")}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-2 pl-8">
                    {done ? (
                      <span className="text-[10px] text-muted-foreground">
                        gravada nesta sessão
                      </span>
                    ) : (
                      matchedExisting && (
                        <span className="text-[10px] text-muted-foreground">
                          substitui horário atual
                        </span>
                      )
                    )}
                    <select
                      value={r.target}
                      onChange={(e) => setRowTarget(r.id, e.target.value)}
                      disabled={done}
                      className={cn(
                        "h-8 min-w-0 max-w-[220px] flex-1 rounded border border-input bg-background px-1.5 text-[11px] sm:flex-none sm:w-44",
                        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                      )}
                    >
                      <option value={NEW_SUBJECT}>+ Criar nova matéria</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          Atualizar: {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {phase === "saving" && (
        <ProgressPanel label="Salvando agenda…" estimatedMs={4000} />
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
            Salvar {selectedCount} matéria{selectedCount === 1 ? "" : "s"}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
