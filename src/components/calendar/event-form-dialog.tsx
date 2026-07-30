"use client";

import { useMemo, useState } from "react";
import { BookOpen, FileText, GraduationCap, Loader2, Sparkles, Tag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addEventAsync,
  EVENT_TYPE_META,
  updateEventAsync,
  type CalendarEvent,
  type CalendarEventType,
} from "@/lib/calendar-events";
import type { Subject } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_OPTIONS: Array<{
  value: CalendarEventType;
  label: string;
  Icon: typeof BookOpen;
}> = [
  { value: "bloco", label: "Bloco de estudo", Icon: BookOpen },
  { value: "prova", label: "Prova", Icon: FileText },
  { value: "trabalho", label: "Trabalho", Icon: Sparkles },
  { value: "aula", label: "Aula avulsa", Icon: GraduationCap },
  { value: "outro", label: "Outro", Icon: Tag },
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function defaultStartTime(): string {
  const d = new Date();
  // Próximo "round hour" — se já passou de 30, sobe pra hora seguinte
  const hour = d.getMinutes() >= 30 ? d.getHours() + 1 : d.getHours();
  const h = Math.min(23, Math.max(0, hour));
  return `${pad2(h)}:00`;
}

function addOneHour(time: string): string {
  // Satura no fim do dia em vez de dar a volta: às 23:00, um "+1h" que virasse
  // 00:00 nasceria ANTES do início (a validação compara "HH:MM" como texto) e
  // travaria o formulário.
  // ATENÇÃO: às 23:59 a saturação devolve o PRÓPRIO 23:59 — fim === início
  // trava a validação exatamente igual. Quem chama TEM que conferir se o
  // resultado é MAIOR que o início (ver o auto-preenchimento do Início e o
  // botão "+N dia · mesmo dia").
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(h * 60 + (m || 0) + 60, 23 * 60 + 59);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(total: number): string {
  const m = ((total % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

function isSaneISODate(date: string): boolean {
  // <input type="date"> aceita ano de 1 a 6 dígitos: digitando a data no jeito
  // brasileiro "10/06/26" o browser entrega value = "0026-06-10", string VÁLIDA
  // pelo spec. Sem esse check o ano de 2 dígitos passava direto, o construtor
  // do Date aplicava a regra MakeFullYear (0-99 → 1900+y) e o compromisso era
  // gravado em 1926 com toast de sucesso: não aparece na agenda (que corta o
  // passado) nem no mês, e o aluno não tem como descobrir onde foi parar.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const year = Number(m[1]);
  return year >= 1900 && year <= 2999;
}

// Desfaz a regra MakeFullYear do construtor do Date (ano 0-99 → 1900+y). Só
// deveria pegar entrada já barrada por isSaneISODate; existe pra que um ano
// bizarro que escape apareça como ano bizarro em vez de virar 19xx calado.
function undoMakeFullYear(dt: Date, year: number): void {
  if (year >= 0 && year <= 99) dt.setFullYear(dt.getFullYear() - 1900);
}

function addDaysISODate(date: string, days: number): string {
  if (!days) return date;
  const [y, mo, d] = date.split("-").map(Number);
  const dt = new Date(y, mo - 1, d + days);
  undoMakeFullYear(dt, y);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function combineDateTimeISO(date: string, time: string): string {
  // date = "YYYY-MM-DD", time = "HH:MM" — interpreta como local time
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
  undoMakeFullYear(dt, y);
  return dt.toISOString();
}

export type EventFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  subjects: Subject[];
  defaultDate?: Date; // pré-popula a data
  defaultType?: CalendarEventType;
  /**
   * Quando passado, o dialog entra em modo edição: pré-popula com os valores
   * do evento e chama updateEventAsync no submit (em vez de addEventAsync).
   */
  editEvent?: CalendarEvent | null;
  onCreated?: (event: CalendarEvent) => void;
  onUpdated?: (event: CalendarEvent) => void;
};

export function EventFormDialog({
  open,
  onOpenChange,
  userId,
  subjects,
  defaultDate,
  defaultType = "bloco",
  editEvent = null,
  onCreated,
  onUpdated,
}: EventFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {/*
          Re-mount o form sempre que reabrir → useState initializers rodam de novo
          com defaults frescos, sem precisar de useEffect+setState.
        */}
        {open && (
          <EventFormBody
            key={
              editEvent
                ? `edit-${editEvent.id}`
                : `${defaultDate?.toISOString() ?? "today"}-${defaultType}`
            }
            userId={userId}
            subjects={subjects}
            defaultDate={defaultDate}
            defaultType={defaultType}
            editEvent={editEvent}
            onCancel={() => onOpenChange(false)}
            onCreated={(ev) => {
              onCreated?.(ev);
              onOpenChange(false);
            }}
            onUpdated={(ev) => {
              onUpdated?.(ev);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EventFormBody({
  userId,
  subjects,
  defaultDate,
  defaultType,
  editEvent,
  onCancel,
  onCreated,
  onUpdated,
}: {
  userId: string;
  subjects: Subject[];
  defaultDate?: Date;
  defaultType: CalendarEventType;
  editEvent: CalendarEvent | null;
  onCancel: () => void;
  onCreated: (ev: CalendarEvent) => void;
  onUpdated: (ev: CalendarEvent) => void;
}) {
  const isEdit = !!editEvent;

  const initialDate = useMemo(() => {
    if (editEvent) {
      const dt = new Date(editEvent.starts_at);
      return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
    }
    if (defaultDate) {
      return `${defaultDate.getFullYear()}-${pad2(defaultDate.getMonth() + 1)}-${pad2(defaultDate.getDate())}`;
    }
    return todayISO();
  }, [defaultDate, editEvent]);

  const initialStart = useMemo(() => {
    if (editEvent) {
      const dt = new Date(editEvent.starts_at);
      return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
    }
    return defaultStartTime();
  }, [editEvent]);

  const initialEnd = useMemo(() => {
    if (editEvent?.ends_at) {
      const dt = new Date(editEvent.ends_at);
      return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
    }
    return addOneHour(initialStart);
  }, [editEvent, initialStart]);

  // Eventos de intervalo (recesso, semana de provas) atravessam dias: o form só
  // edita a HORA do fim, então guardamos quantos dias o fim está à frente do
  // início pra não colapsar o evento no primeiro dia ao salvar.
  const initialEndDayOffset = useMemo(() => {
    if (!editEvent?.ends_at) return 0;
    const s = new Date(editEvent.starts_at);
    s.setHours(0, 0, 0, 0);
    const e = new Date(editEvent.ends_at);
    e.setHours(0, 0, 0, 0);
    const diff = Math.round((e.getTime() - s.getTime()) / 86400000);
    return diff > 0 ? diff : 0;
  }, [editEvent]);

  const [type, setType] = useState<CalendarEventType>(
    editEvent?.type ?? defaultType,
  );
  const [title, setTitle] = useState(editEvent?.title ?? "");
  const [subjectId, setSubjectId] = useState<string>(
    editEvent?.subject_id ?? "",
  );
  const [date, setDate] = useState<string>(initialDate);
  const [startTime, setStartTime] = useState<string>(initialStart);
  const [endTime, setEndTime] = useState<string>(initialEnd);
  // O offset precisa ser ESTADO (e não só derivado do editEvent): congelado no
  // evento original, ele sobrevivia a qualquer mexida no horário e o fim ficava
  // preso no dia seguinte — ver o comentário no onChange do Início.
  const [endDayOffset, setEndDayOffset] = useState<number>(initialEndDayOffset);
  const [description, setDescription] = useState(editEvent?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Dá um título pro compromisso.");
      return;
    }
    if (!date) {
      setError("Escolhe uma data.");
      return;
    }
    // "10/06/26" no input de data chega aqui como "0026-06-10" e passaria pelo
    // `!date` acima; sem esse check o evento era salvo em 1926 (regra
    // MakeFullYear do Date) com toast de sucesso e sumia da agenda pra sempre.
    if (!isSaneISODate(date)) {
      setError("Confere o ano da data: escreve com 4 dígitos (ex: 10/06/2026).");
      return;
    }
    if (!startTime) {
      setError("Escolhe um horário de início.");
      return;
    }
    // Só compara HH:MM quando início e fim caem no MESMO dia (mesma regra do
    // `min` do input de Fim). Num evento que atravessa a meia-noite — bloco das
    // 23:00 que termina 00:00 do dia seguinte, endDayOffset = 1 — o fim é
    // legitimamente "menor" como texto ("00:00" <= "23:00") e essa checagem
    // travava QUALQUER edição (até só o título), apesar do submit logo abaixo
    // reconstruir o fim certinho com addDaysISODate(date, endDayOffset).
    if (endTime && endDayOffset === 0 && endTime <= startTime) {
      setError("O horário de término precisa ser depois do início.");
      return;
    }

    setSaving(true);
    try {
      const startsAt = combineDateTimeISO(date, startTime);
      const endsAt = endTime
        ? combineDateTimeISO(addDaysISODate(date, endDayOffset), endTime)
        : undefined;
      const payload = {
        type,
        title: cleanTitle,
        subject_id: subjectId || undefined,
        starts_at: startsAt,
        ends_at: endsAt,
        description: description.trim() || undefined,
      };

      if (isEdit && editEvent) {
        const updated = await updateEventAsync(userId, editEvent.id, payload);
        if (!updated) {
          setError("Evento não encontrado.");
          return;
        }
        onUpdated(updated);
      } else {
        const created = await addEventAsync(userId, payload);
        onCreated(created);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEdit ? "Editar compromisso" : "Novo compromisso"}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Atualize os dados do compromisso."
            : "Adicione blocos de estudo, provas ou trabalhos ao seu calendário."}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo (pill selector) */}
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_OPTIONS.map((opt) => {
                const meta = EVENT_TYPE_META[opt.value];
                const active = type === opt.value;
                const Icon = opt.Icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    /* A categoria ativa se distinguia SÓ pela cor (`meta.soft` +
                       `meta.text` + `border-current`): no leitor de tela as cinco
                       pills se anunciavam idênticas ("Prova, botão"…) e nem a que
                       já nasce marcada (defaultType = "bloco") dizia que estava
                       selecionada. O aluno gravava a prova achando que tinha
                       trocado a categoria, e o compromisso nascia como bloco de
                       estudo — cor e ícone errados no mês, na semana e na agenda,
                       e no balde errado dos filtros. */
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      active
                        ? cn(meta.soft, "border-current", meta.text)
                        : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent",
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                    <Icon className="h-3 w-3" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <Label htmlFor="event-title">Título</Label>
            <Input
              id="event-title"
              placeholder="Ex: Revisão de Cardiologia"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              maxLength={120}
            />
          </div>

          {/* Matéria (opcional) */}
          {subjects.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="event-subject">Matéria (opcional)</Label>
              <select
                id="event-subject"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className={cn(
                  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:border-ring",
                )}
              >
                <option value="">— Sem matéria —</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Data + Horários */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="event-date">Data</Label>
              <Input
                id="event-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="event-start">Início</Label>
              <Input
                id="event-start"
                type="time"
                value={startTime}
                onChange={(e) => {
                  const nextStart = e.target.value;
                  setStartTime(nextStart);
                  // Só auto-preenche o Fim quando início e fim caem no MESMO dia
                  // (mesma regra do `min` do input de Fim e da validação do
                  // submit). Num evento que atravessa a meia-noite — 10/06 23:00
                  // → 11/06 00:30, endDayOffset = 1 — o fim é legitimamente
                  // "menor" como texto ("00:30" <= "22:00"), a comparação dava
                  // true e o addOneHour reescrevia o fim pra "23:00" MANTENDO o
                  // offset de +1 dia: o compromisso de 1h30 virava 22:00 do dia
                  // 10 até 23:00 do dia 11 (25h) sem nenhum aviso, já que a
                  // validação do submit é pulada quando endDayOffset > 0.
                  if (
                    endDayOffset === 0 &&
                    nextStart &&
                    (!endTime || endTime <= nextStart)
                  ) {
                    const autoEnd = addOneHour(nextStart);
                    if (autoEnd > nextStart) {
                      setEndTime(autoEnd);
                    } else {
                      // Início às 23:59: o addOneHour satura no fim do dia e
                      // devolve o PRÓPRIO 23:59, então o Fim nascia IGUAL ao
                      // Início e o submit era recusado com "o horário de término
                      // precisa ser depois do início" — mensagem impossível de
                      // satisfazer, porque não existe hora do mesmo dia depois
                      // de 23:59 (a única saída, apagar o Fim, não é dita em
                      // lugar nenhum). Manda o fim pras 00:59 do dia seguinte:
                      // é 1h de verdade, o submit já sabe somar o offset e o
                      // badge "+1 dia · mesmo dia" deixa isso visível e
                      // reversível num clique.
                      setEndTime(minutesToTime(timeToMinutes(nextStart) + 60));
                      setEndDayOffset(1);
                    }
                  } else if (endDayOffset > 0 && nextStart && endTime) {
                    // Com o fim em OUTRO dia, mexer só no início deixava o fim
                    // ancorado no dia seguinte: um prazo das 23:59 com fim
                    // sintético 11/06 00:00 (exam-pdf-upload, pra não virar
                    // evento de dois dias) antecipado pras 14:00 virava um bloco
                    // de 10h — o auto-preenchimento e a validação "fim > início"
                    // são pulados quando o offset é > 0, então nada reescrevia o
                    // Fim nem o offset. Mover o início agora move o fim junto,
                    // preservando a DURAÇÃO e recalculando o offset; quando o fim
                    // passa a caber no mesmo dia o offset zera sozinho e a
                    // validação volta a valer.
                    // O input de time entrega "" enquanto os segmentos não estão
                    // completos: se o aluno LIMPA o Início antes de digitar o
                    // novo horário, o startTime aqui já é "" e timeToMinutes("")
                    // devolve 0 (meia-noite), não NaN. Medir a duração contra
                    // meia-noite ressuscitava o mesmo bloco de ~25h que essa
                    // correção fecha: 10/06 23:00 → 11/06 00:30 (1h30) virava
                    // 1470min e, com o offset preservado, o evento reaparecia
                    // como 22:00 do dia 10 → 22:30 do dia 11. Sem um início
                    // antigo válido não dá pra preservar duração nenhuma, então
                    // o fim fica onde está (o badge "+N dia" segue visível pro
                    // aluno trazer pro mesmo dia num clique).
                    if (!/^\d{1,2}:\d{2}$/.test(startTime)) return;
                    // Intervalo de DIA INTEIRO (fim às 23:59 num dia à frente)
                    // tem semântica de "N dias inteiros", não de N minutos:
                    // preservar a duração empurrava a DATA de fim. "Exames
                    // finais 22 a 26/06" (00:00 → 23:59, offset 4) virava 22 a
                    // 27/06 só por o aluno marcar que a prova começa às 8h
                    // (7199min a partir das 08:00 = 07:59 com offset 5), e o dia
                    // 27 ganhava um "Exames finais 00:00–07:59" fantasma no mês,
                    // na semana, na agenda e na sidebar — sem campo de data de
                    // fim no form pra ele desfazer. Aqui o fim fica ANCORADO no
                    // último minuto do último dia; só o início se move.
                    if (endTime === "23:59") return;
                    const duration = Math.max(
                      endDayOffset * 1440 +
                        timeToMinutes(endTime) -
                        timeToMinutes(startTime),
                      1,
                    );
                    const nextEnd = timeToMinutes(nextStart) + duration;
                    setEndTime(minutesToTime(nextEnd));
                    setEndDayOffset(Math.floor(nextEnd / 1440));
                  }
                }}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              {/*
                O fim em outro dia era INVISÍVEL: a tela mostrava só "Fim 00:00"
                e não havia como zerar o offset, então um prazo virava bloco de
                horas sem o aluno perceber. Aqui ele vê o "+N dia(s)" e consegue
                trazer o fim pro mesmo dia num clique.
              */}
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="event-end">Fim</Label>
                {endDayOffset > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setEndDayOffset(0);
                      // Zerar o offset com o fim "menor" que o início deixaria o
                      // form travado na validação do submit: puxa o fim pra +1h,
                      // mesmo default do auto-preenchimento.
                      if (!endTime || endTime <= startTime) {
                        const sameDayEnd = addOneHour(startTime);
                        // No prazo padrão das 23:59 (o exam-pdf-upload grava
                        // "entrega" como 10/06 23:59 → 11/06 00:00) o addOneHour
                        // satura e devolve o PRÓPRIO 23:59: o fim ficava igual ao
                        // início e o submit passava a recusar até uma edição só
                        // de título — e este botão, único caminho de volta, some
                        // junto (só renderiza com endDayOffset > 0), sobrando pro
                        // aluno fechar o dialog e perder o que digitou. Sem hora
                        // possível depois de 23:59 no mesmo dia, o fim fica
                        // VAZIO: o submit já aceita (ends_at undefined) e o
                        // compromisso vira o marco das 23:59 que o prazo é.
                        setEndTime(sameDayEnd > startTime ? sameDayEnd : "");
                      }
                    }}
                    className="text-[10px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    title="O fim está em outro dia — clique pra trazer pro mesmo dia"
                  >
                    +{endDayOffset} dia{endDayOffset > 1 ? "s" : ""} · mesmo dia
                  </button>
                )}
              </div>
              <Input
                id="event-end"
                type="time"
                value={endTime}
                // Em evento de intervalo (fim em outro dia) a restrição não vale.
                min={endDayOffset === 0 ? startTime : undefined}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="event-desc">Descrição (opcional)</Label>
            <Textarea
              id="event-desc"
              placeholder="Tópicos, prazos, observações…"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="gradient" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : isEdit ? (
                "Salvar alterações"
              ) : (
                "Salvar compromisso"
              )}
            </Button>
          </DialogFooter>
        </form>
    </>
  );
}
