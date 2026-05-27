/**
 * UTM tracker — captura atribuição de aquisição e persiste em localStorage.
 *
 * Modelo: first-touch + last-touch. Quando um user chega via
 * `?utm_source=instagram&utm_medium=bio&utm_campaign=launch`, salvamos:
 *   - `firstTouchedAt`  → só na PRIMEIRA visita (nunca sobrescreve).
 *   - `lastTouchedAt`   → sempre atualiza.
 *   - source/medium/etc → políticas independentes (last-touch é mais útil
 *     no signup; first-touch ajuda em LTV / cohort de aquisição).
 *
 * Também captura click IDs de ads (gclid/fbclid/ttclid) pra attribution direta
 * no Google Ads / Meta / TikTok Ads (enhanced conversions, CAPI matching).
 *
 * Janela: 90 dias (TTL). Depois disso considera-se "frio" e zera firstTouch
 * pra próxima atribuição que chegar.
 *
 * Registramos como PostHog super properties (`posthog.register({...})`) pra
 * que TODO evento subsequente carregue a attribution junto sem precisar
 * decorar cada chamada.
 */

import { ALLOWED_CHANNELS } from "@/components/links/utm";

export type Attribution = {
  /** Last-touch source/medium/campaign/content/term (sobrescreve em cada nova visita c/ UTM). */
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;

  /** First-touch (set 1x, jamais sobrescrito até TTL expirar). */
  firstSource: string | null;
  firstMedium: string | null;
  firstCampaign: string | null;

  /** Click IDs de ads — primeiro a ser visto vence (não sobrescreve se já tem). */
  gclid: string | null;
  fbclid: string | null;
  ttclid: string | null;

  /** Channel shortcut do /links (`?c=instagram`). */
  channel: string | null;

  /** Timestamps ISO. */
  firstTouchedAt: string | null;
  lastTouchedAt: string | null;
};

const STORAGE_KEY = "lumio.attribution";
const TTL_DAYS = 90;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;
const OUTBOUND_COOKIE = "lumio_outbound";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function emptyAttribution(): Attribution {
  return {
    source: null,
    medium: null,
    campaign: null,
    content: null,
    term: null,
    firstSource: null,
    firstMedium: null,
    firstCampaign: null,
    gclid: null,
    fbclid: null,
    ttclid: null,
    channel: null,
    firstTouchedAt: null,
    lastTouchedAt: null,
  };
}

function readStored(): Attribution {
  if (!isBrowser()) return emptyAttribution();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyAttribution();
    const parsed = JSON.parse(raw) as Attribution & { _setAt?: number };
    // Expira firstTouch se passou da janela — last-touch sempre é "agora".
    if (parsed.firstTouchedAt) {
      const age = Date.now() - new Date(parsed.firstTouchedAt).getTime();
      if (age > TTL_MS) {
        return emptyAttribution();
      }
    }
    return { ...emptyAttribution(), ...parsed };
  } catch {
    return emptyAttribution();
  }
}

function writeStored(attr: Attribution): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attr));
  } catch {
    /* localStorage cheio / private mode — ignora. */
  }
}

/** Lê outbound cookie (setado pelo proxy /ig, /tt, etc) e retorna o channel se válido. */
function readOutboundCookie(): { channel: string; utm_source: string | null } | null {
  if (!isBrowser()) return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${OUTBOUND_COOKIE}=([^;]+)`),
  );
  if (!match) return null;
  try {
    const decoded = decodeURIComponent(match[1]);
    const parsed = JSON.parse(decoded) as {
      dest?: string;
      utm_source?: string;
    };
    if (!parsed.dest) return null;
    return {
      channel: parsed.dest,
      utm_source: parsed.utm_source ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Captura UTMs da URL atual (e click IDs) e atualiza o storage.
 *
 * Idempotente: pode ser chamada várias vezes — só atualiza se houver algo
 * relevante na URL ou se o storage estiver vazio.
 *
 * Retorna a attribution final (após merge), pra quem quiser usar direto.
 */
export function captureUtmFromUrl(): Attribution {
  if (!isBrowser()) return emptyAttribution();

  const url = new URL(window.location.href);
  const sp = url.searchParams;

  const urlUtm = {
    source: sp.get("utm_source"),
    medium: sp.get("utm_medium"),
    campaign: sp.get("utm_campaign"),
    content: sp.get("utm_content"),
    term: sp.get("utm_term"),
  };

  const channelParam = sp.get("c");
  const channel =
    channelParam && (ALLOWED_CHANNELS as readonly string[]).includes(channelParam.toLowerCase())
      ? channelParam.toLowerCase()
      : null;

  const clickIds = {
    gclid: sp.get("gclid"),
    fbclid: sp.get("fbclid"),
    ttclid: sp.get("ttclid"),
  };

  const stored = readStored();
  const hasAnyUrlSignal =
    !!(urlUtm.source || urlUtm.medium || urlUtm.campaign || channel ||
       clickIds.gclid || clickIds.fbclid || clickIds.ttclid);

  // Se a URL não traz nada novo E já temos firstTouchedAt → só atualiza
  // last-touch timestamp pra "manter quente" e termina.
  if (!hasAnyUrlSignal && stored.firstTouchedAt) {
    const updated: Attribution = {
      ...stored,
      lastTouchedAt: new Date().toISOString(),
    };
    writeStored(updated);
    return updated;
  }

  // Fallback: se a URL não trouxe utm_source mas tem outbound cookie do /ig,
  // /tt etc → usa o channel do cookie como hint.
  let inferredSource = urlUtm.source;
  let inferredMedium = urlUtm.medium;
  if (!inferredSource && !stored.firstTouchedAt) {
    const ob = readOutboundCookie();
    if (ob) {
      inferredSource = ob.utm_source ?? ob.channel;
      if (!inferredMedium) inferredMedium = "social_shortlink";
    }
  }

  const now = new Date().toISOString();
  const isFirstTouch = !stored.firstTouchedAt;

  const next: Attribution = {
    // Last-touch: sobrescreve sempre que há algo novo
    source: inferredSource ?? stored.source,
    medium: inferredMedium ?? stored.medium,
    campaign: urlUtm.campaign ?? stored.campaign,
    content: urlUtm.content ?? stored.content,
    term: urlUtm.term ?? stored.term,

    // First-touch: só seta na primeira vez
    firstSource: stored.firstSource ?? inferredSource,
    firstMedium: stored.firstMedium ?? inferredMedium,
    firstCampaign: stored.firstCampaign ?? urlUtm.campaign,

    // Click IDs: NUNCA sobrescreve se já temos (gclid é precioso pra Google Ads)
    gclid: stored.gclid ?? clickIds.gclid,
    fbclid: stored.fbclid ?? clickIds.fbclid,
    ttclid: stored.ttclid ?? clickIds.ttclid,

    channel: channel ?? stored.channel,

    firstTouchedAt: isFirstTouch ? now : stored.firstTouchedAt,
    lastTouchedAt: now,
  };

  writeStored(next);

  // Auto-register no PostHog: dispara super properties que vão acompanhar
  // todos os events dali pra frente (inclusive $pageview automático).
  try {
    const ph = (window as Window & {
      posthog?: {
        register?: (props: Record<string, unknown>) => void;
        register_once?: (props: Record<string, unknown>) => void;
      };
    }).posthog;
    if (ph?.register) {
      ph.register({
        utm_source: next.source ?? undefined,
        utm_medium: next.medium ?? undefined,
        utm_campaign: next.campaign ?? undefined,
        utm_content: next.content ?? undefined,
        utm_term: next.term ?? undefined,
        gclid: next.gclid ?? undefined,
        fbclid: next.fbclid ?? undefined,
        ttclid: next.ttclid ?? undefined,
        channel: next.channel ?? undefined,
        last_touched_at: next.lastTouchedAt ?? undefined,
      });
    }
    if (ph?.register_once) {
      // register_once: só seta se a prop nunca foi definida antes (no person profile)
      ph.register_once({
        first_utm_source: next.firstSource ?? undefined,
        first_utm_medium: next.firstMedium ?? undefined,
        first_utm_campaign: next.firstCampaign ?? undefined,
        first_touched_at: next.firstTouchedAt ?? undefined,
      });
    }
  } catch {
    /* PostHog não carregado ainda — captureUtmFromUrl pode ser re-chamado depois. */
  }

  return next;
}

/** Lê a attribution corrente (sem mutar). Útil pra anexar a request bodies (signup). */
export function getAttribution(): Attribution {
  return readStored();
}

/** Limpa o storage — usar com cuidado (ex: logout dev, troca de conta em testes). */
export function clearAttribution(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
