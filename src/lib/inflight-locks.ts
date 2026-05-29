/**
 * Mutex in-memory por chave, com TTL de segurança.
 *
 * Uso: impedir dupla execução concorrente de um handler — ex.: dois cliques
 * no botão "enviar" do Lumi disparando 2 agent loops em paralelo, cobrando
 * coins duas vezes e/ou gerando assets duplicados.
 *
 * Limitação conhecida: o Map vive por processo. Em serverless (Vercel) o app
 * pode rodar em múltiplas instâncias — dois tabs que caem em instâncias
 * diferentes contornam essa trava. Cobre o caso comum (double-click,
 * StrictMode dev, duas mensagens em rajada na mesma instância). Para garantia
 * cross-instance precisaria Redis/Upstash.
 */

const inFlight = new Map<string, number>();

/** Libera locks abandonados (handler crashou sem release). */
const STALE_MS = 5 * 60_000;

/**
 * Tenta marcar `key` como em execução. Retorna true se conseguiu (lock
 * adquirido) ou false se já tem alguém rodando (rejeitar).
 */
export function tryAcquireLock(key: string): boolean {
  const now = Date.now();
  const since = inFlight.get(key);
  if (since !== undefined && now - since < STALE_MS) {
    return false;
  }
  inFlight.set(key, now);
  return true;
}

/** Marca `key` como concluída. Idempotente. */
export function releaseLock(key: string): void {
  inFlight.delete(key);
}
