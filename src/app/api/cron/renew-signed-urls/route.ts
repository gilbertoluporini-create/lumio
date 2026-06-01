/**
 * GET|POST /api/cron/renew-signed-urls
 *
 * Vercel Cron (a cada 12h): varre resumos recém-gerados e RENOVA URLs
 * assinadas de Supabase Storage embutidas no markdown. URLs assinadas têm
 * TTL fixo (24h pra `pdf-extracted-images` legacy, ~7d pra `documents`
 * via fluxos antigos) — depois disso o `<img>` no resumo aparece quebrado.
 *
 * O que renova:
 *   - `summaries.content.generalSummary` (markdown principal, fonte da UI /resumo)
 *   - `lectures.summary_educational.markdown` (espelho da rota /lecture)
 *
 * Estratégia:
 *   1) Carrega rows com updated_at > now()-23h (janela cobre 1 ciclo + 1h margem).
 *   2) Pra cada string markdown, regex acha TODAS as URLs no padrão Supabase:
 *        https://<projeto>.supabase.co/storage/v1/object/sign/<bucket>/<path>?token=<jwt>
 *      Extrai `bucket` e `path`.
 *   3) Pra cada (bucket, path) único na row, chama admin.storage.createSignedUrl()
 *      com TTL 24h. Substitui TODAS as ocorrências da URL antiga pela nova.
 *   4) UPDATE da row só se algo mudou (evita touch desnecessário em updated_at).
 *
 * Idempotência: re-rodar não duplica nada — só substitui URLs antigas por
 * frescas (regex casa só URLs assinadas, e cada path é renovado UMA vez
 * por execução, mesmo que apareça N vezes no markdown).
 *
 * URLs do tipo `/api/atlas/img/[id]` (proxy) NÃO são tocadas — não têm
 * token, são endpoints estáveis. URLs `getPublicUrl` (bucket `ai-images`)
 * também não — não contêm `/object/sign/`.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel injeta automático)
 * OU `x-internal-key: <CRON_SECRET>`. Ambos via `timingSafeEqual`.
 *
 * Resposta: `{ ok, renewed, errors, durationMs, scanned }`.
 *
 * Schedule em vercel.json: "0 *\/12 * * *" — meia-noite e meio-dia UTC, ou
 * seja, a cada 12h. Janela de scan de 23h garante overlap mesmo se um
 * ciclo skipar (TTL Supabase legacy era 24h).
 */
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** TTL do signed URL renovado. 24h é o pico que o link fica vivo sem outro
 *  ciclo do cron tocar — alinhado com a cadência 12h. */
const SIGNED_URL_TTL_SEC = 60 * 60 * 24;

/** Janela de "resumos recentes": cobre 1 ciclo (12h) + folga generosa. URLs
 *  geradas antes disso já expiraram e ninguém deveria estar lendo (ou já
 *  foram renovadas em ciclo anterior — idempotente). */
const SCAN_WINDOW_HOURS = 23;

/** Hard cap de rows processadas por execução. Defesa contra spike (ex:
 *  publicação em massa). Próximo tick pega o resto. */
const MAX_ROWS_PER_RUN = 200;

/**
 * Regex pra signed URL do Supabase Storage:
 *   https://<host>.supabase.co/storage/v1/object/sign/<bucket>/<path>?token=<jwt>
 *
 * Captura:
 *   [1] full match (URL inteira)
 *   [2] bucket
 *   [3] path (pode conter `/`)
 *
 * Notas:
 *   - `[^/\s)\]"']+` no bucket pra parar em / (boundary), espaço, `)`, `]`,
 *     `"`, `'` — cobre markdown `![](url)`, JSON, HTML.
 *   - Path captura até `?` (início da querystring) ou whitespace/quote/close.
 *   - Token capturado mas descartado (a gente regenera). Match exige `?token=`
 *     pra não pegar URLs SEM assinatura (público) por engano.
 *   - `g` flag pra iterar com matchAll.
 */
const SIGNED_URL_REGEX =
  /https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/sign\/([^/\s)\]"']+)\/([^?\s)\]"']+)\?token=[A-Za-z0-9._-]+/g;

/** Compara strings em tempo constante (anti timing attack no CRON_SECRET).
 *  Idêntico ao helper de outros crons (proactive-notifications, exam-relevance). */
function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return timingSafeEqual(ab, bb);
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected) {
    return process.env.NODE_ENV !== "production";
  }
  const internal = req.headers.get("x-internal-key") ?? "";
  if (internal && safeEq(internal, expected)) return true;
  const auth = req.headers.get("authorization") ?? "";
  const bearer = `Bearer ${expected}`;
  if (auth.length === bearer.length && safeEq(auth, bearer)) return true;
  return false;
}

type RenewResult = {
  /** Markdown com URLs substituídas (ou o original se nada mudou). */
  markdown: string;
  /** True se pelo menos 1 URL foi trocada — só persiste se true. */
  changed: boolean;
  /** Quantas signed URLs únicas (bucket+path) foram renovadas. */
  renewedCount: number;
  /** Falhas isoladas em createSignedUrl (URL fica intacta). */
  failedCount: number;
};

/**
 * Renova TODAS as signed URLs num bloco de markdown. Idempotente: roda
 * regex.matchAll, agrupa por (bucket, path) único, chama createSignedUrl
 * UMA vez por path, e faz replaceAll da URL antiga pela nova.
 *
 * Falhas em paths individuais (ex: arquivo deletado do bucket) não
 * abortam — só são contadas em `failedCount`. URL antiga fica no
 * markdown (vai aparecer quebrada, mas o resto do resumo funciona).
 */
async function renewSignedUrlsInMarkdown(
  markdown: string,
  admin: ReturnType<typeof createAdminClient>,
): Promise<RenewResult> {
  if (!markdown || typeof markdown !== "string") {
    return { markdown: markdown ?? "", changed: false, renewedCount: 0, failedCount: 0 };
  }

  // Coleta TODAS as ocorrências. Map dedupe por URL completa antiga
  // (pra fazer replaceAll exato 1x por URL distinta).
  type Match = { fullOld: string; bucket: string; path: string };
  const byOldUrl = new Map<string, Match>();
  for (const m of markdown.matchAll(SIGNED_URL_REGEX)) {
    const [fullOld, bucket, path] = m;
    if (!byOldUrl.has(fullOld)) {
      byOldUrl.set(fullOld, { fullOld, bucket, path });
    }
  }

  if (byOldUrl.size === 0) {
    return { markdown, changed: false, renewedCount: 0, failedCount: 0 };
  }

  // Dedupe por (bucket, path) — múltiplas URLs antigas com tokens
  // diferentes pro mesmo path: 1 createSignedUrl serve pra ambas. Não dá
  // pra reusar literal porque cada signedUrl novo nasce com token único,
  // mas dá pra economizar 1 chamada Storage por path duplicado.
  const pathKey = (b: string, p: string) => `${b}${p}`;
  const freshByPath = new Map<string, string>();
  let failedCount = 0;

  for (const { bucket, path } of byOldUrl.values()) {
    const key = pathKey(bucket, path);
    if (freshByPath.has(key)) continue;
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUrl(path, SIGNED_URL_TTL_SEC);
    if (error || !data?.signedUrl) {
      failedCount += 1;
      continue;
    }
    freshByPath.set(key, data.signedUrl);
  }

  // Aplica substituições. Pra cada URL antiga distinta no markdown, se
  // temos signedUrl fresco pro mesmo path, substitui TODAS as ocorrências.
  let out = markdown;
  let renewedCount = 0;
  for (const { fullOld, bucket, path } of byOldUrl.values()) {
    const fresh = freshByPath.get(pathKey(bucket, path));
    if (!fresh) continue;
    // splitJoin é seguro pra strings literais (sem regex escaping).
    out = out.split(fullOld).join(fresh);
    renewedCount += 1;
  }

  return {
    markdown: out,
    changed: renewedCount > 0,
    renewedCount,
    failedCount,
  };
}

type SummaryRow = {
  id: string;
  content: { generalSummary?: string | null } | null;
};

type LectureRow = {
  id: string;
  summary_educational: { markdown?: string | null } | null;
};

/**
 * Processa summaries em batch. Retorna totais agregados.
 * `content.generalSummary` é o markdown canônico exibido em /resumo.
 */
async function processSummaries(
  admin: ReturnType<typeof createAdminClient>,
  sinceIso: string,
): Promise<{ scanned: number; renewed: number; errors: number }> {
  const { data, error } = await admin
    .from("summaries")
    .select("id, content")
    .gte("updated_at", sinceIso)
    .order("updated_at", { ascending: false })
    .limit(MAX_ROWS_PER_RUN);
  if (error) {
    console.warn("[cron/renew-signed-urls] summaries fetch failed", error.message);
    return { scanned: 0, renewed: 0, errors: 1 };
  }
  const rows = (data ?? []) as SummaryRow[];

  let scanned = 0;
  let renewed = 0;
  let errors = 0;

  for (const row of rows) {
    scanned += 1;
    const md = row.content?.generalSummary ?? "";
    if (!md) continue;
    try {
      const result = await renewSignedUrlsInMarkdown(md, admin);
      if (!result.changed) continue;
      const newContent = { ...(row.content ?? {}), generalSummary: result.markdown };
      const { error: upErr } = await admin
        .from("summaries")
        .update({ content: newContent })
        .eq("id", row.id);
      if (upErr) {
        errors += 1;
        continue;
      }
      renewed += result.renewedCount;
    } catch {
      errors += 1;
    }
  }

  return { scanned, renewed, errors };
}

/**
 * Processa lectures.summary_educational.markdown. Estrutura é
 * `{ markdown, generatedAt, images?, atlas? }`. A gente preserva campos
 * extras (atlas, images, generatedAt) — só o `markdown` muda.
 */
async function processLectures(
  admin: ReturnType<typeof createAdminClient>,
  sinceIso: string,
): Promise<{ scanned: number; renewed: number; errors: number }> {
  const { data, error } = await admin
    .from("lectures")
    .select("id, summary_educational")
    .not("summary_educational", "is", null)
    .gte("updated_at", sinceIso)
    .order("updated_at", { ascending: false })
    .limit(MAX_ROWS_PER_RUN);
  if (error) {
    console.warn("[cron/renew-signed-urls] lectures fetch failed", error.message);
    return { scanned: 0, renewed: 0, errors: 1 };
  }
  const rows = (data ?? []) as LectureRow[];

  let scanned = 0;
  let renewed = 0;
  let errors = 0;

  for (const row of rows) {
    scanned += 1;
    const md = row.summary_educational?.markdown ?? "";
    if (!md) continue;
    try {
      const result = await renewSignedUrlsInMarkdown(md, admin);
      if (!result.changed) continue;
      const newPayload = {
        ...(row.summary_educational ?? {}),
        markdown: result.markdown,
      };
      const { error: upErr } = await admin
        .from("lectures")
        .update({ summary_educational: newPayload })
        .eq("id", row.id);
      if (upErr) {
        errors += 1;
        continue;
      }
      renewed += result.renewedCount;
    } catch {
      errors += 1;
    }
  }

  return { scanned, renewed, errors };
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json(
      { error: "Configuração de servidor incompleta." },
      { status: 503 },
    );
  }

  const startedAt = Date.now();
  const sinceIso = new Date(
    Date.now() - SCAN_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const admin = createAdminClient();

  // Roda em paralelo — duas tabelas independentes, sem race (mesmo row não
  // aparece nas duas; summary_educational é só lectures, generalSummary é
  // só summaries — embora o conteúdo seja espelhado, as colunas são distintas).
  const [summaries, lectures] = await Promise.all([
    processSummaries(admin, sinceIso),
    processLectures(admin, sinceIso),
  ]);

  const durationMs = Date.now() - startedAt;
  const totalRenewed = summaries.renewed + lectures.renewed;
  const totalErrors = summaries.errors + lectures.errors;
  const totalScanned = summaries.scanned + lectures.scanned;

  // Log único agregado — sem ruído por iteração (o cron pode varrer 200
  // rows; spam em prod logs é caro).
  console.log("[cron/renew-signed-urls] done", {
    sinceIso,
    durationMs,
    scanned: totalScanned,
    renewed: totalRenewed,
    errors: totalErrors,
    summaries,
    lectures,
  });

  return NextResponse.json({
    ok: true,
    renewed: totalRenewed,
    errors: totalErrors,
    scanned: totalScanned,
    durationMs,
    breakdown: { summaries, lectures },
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}
