/**
 * Asset Jobs — fila in-memory de gerações de assets (resumo/flashcards/quiz/mapa)
 * rodando em background.
 *
 * Quando o user clica "Gerar resumo" no /lumi, em vez de bloquear o app com
 * loader modal até a API responder, criamos um job aqui, fechamos o dialog e
 * o usuário pode navegar pelo app. O JobsTray no header mostra o progresso e
 * notifica quando termina.
 *
 * Escopo: sessão única do browser (in-memory + EventTarget). Não persiste entre
 * reloads. Pra recover de reload mid-job, precisaria backing em DB com worker —
 * não vale o custo pra MVP. Se user fecha aba durante geração, perde-se.
 */

export type AssetJobKind = "summary" | "flashcards" | "quiz" | "mindmap";

export type AssetJobStatus = "running" | "done" | "error";

export type AssetJob = {
  id: string;
  kind: AssetJobKind;
  title: string;
  status: AssetJobStatus;
  startedAt: string;
  doneAt?: string;
  /** URL pra abrir o asset criado, quando status === "done". */
  resultHref?: string;
  /** Descrição curta do resultado (ex: "12 cards gerados"). */
  preview?: string;
  /** Mensagem de erro quando status === "error". */
  errorMsg?: string;
  /** Contexto opcional pra retomar UX. */
  chatId?: string;
  lectureId?: string;
  subjectName?: string;
};

const KIND_LABEL: Record<AssetJobKind, string> = {
  summary: "Resumo",
  flashcards: "Flashcards",
  quiz: "Quiz",
  mindmap: "Mapa mental",
};

export function jobKindLabel(kind: AssetJobKind): string {
  return KIND_LABEL[kind];
}

type Listener = (jobs: AssetJob[]) => void;

const jobs: Map<string, AssetJob> = new Map();
const listeners: Set<Listener> = new Set();
/** Quantos jobs "done" mantemos pendurados pro user clicar antes de auto-limpar. */
const DONE_TTL_MS = 5 * 60 * 1000;

function notify(): void {
  const arr = Array.from(jobs.values()).sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
  for (const cb of listeners) cb(arr);
}

function newJobId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function listJobs(): AssetJob[] {
  return Array.from(jobs.values()).sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
}

export function getJob(id: string): AssetJob | undefined {
  return jobs.get(id);
}

export function subscribeJobs(cb: Listener): () => void {
  listeners.add(cb);
  // Empurra estado atual imediatamente pra hidratar o consumidor
  cb(listJobs());
  return () => {
    listeners.delete(cb);
  };
}

export function removeJob(id: string): void {
  if (jobs.delete(id)) notify();
}

export function clearDoneJobs(): void {
  let changed = false;
  for (const [id, j] of jobs) {
    if (j.status !== "running") {
      jobs.delete(id);
      changed = true;
    }
  }
  if (changed) notify();
}

type StartOptions = {
  kind: AssetJobKind;
  title: string;
  chatId?: string;
  lectureId?: string;
  subjectName?: string;
};

type RunResult = {
  resultHref?: string;
  preview?: string;
};

/**
 * Dispatcha um job rodando em background. O runner é uma fn async que executa
 * fetch+save e retorna { resultHref, preview }. O store cuida de updates de
 * status, listeners, e auto-cleanup de jobs concluídos após TTL.
 *
 * Retorna o jobId — útil pro caller correlacionar com mensagens de chat.
 */
export function startJob(
  opts: StartOptions,
  runner: () => Promise<RunResult>,
): string {
  const id = newJobId();
  const job: AssetJob = {
    id,
    kind: opts.kind,
    title: opts.title,
    status: "running",
    startedAt: new Date().toISOString(),
    chatId: opts.chatId,
    lectureId: opts.lectureId,
    subjectName: opts.subjectName,
  };
  jobs.set(id, job);
  notify();

  void (async () => {
    try {
      const res = await runner();
      const current = jobs.get(id);
      if (!current) return;
      jobs.set(id, {
        ...current,
        status: "done",
        doneAt: new Date().toISOString(),
        resultHref: res.resultHref,
        preview: res.preview,
      });
      notify();
      // Auto-cleanup após TTL pra não deixar tray entupido
      setTimeout(() => {
        const j = jobs.get(id);
        if (j && j.status === "done") {
          jobs.delete(id);
          notify();
        }
      }, DONE_TTL_MS);
    } catch (err) {
      const current = jobs.get(id);
      if (!current) return;
      jobs.set(id, {
        ...current,
        status: "error",
        doneAt: new Date().toISOString(),
        errorMsg:
          err instanceof Error ? err.message : "Falha desconhecida na geração.",
      });
      notify();
    }
  })();

  return id;
}
