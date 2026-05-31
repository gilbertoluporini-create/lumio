/**
 * POST /api/pdf-extract
 *
 * Fallback server-side pra extração de texto de PDFs quando o pdfjs do
 * navegador falha (iPad Safari antigo, engines com features ES2022+
 * ausentes, etc).
 *
 * Dois caminhos de entrada:
 *  1. multipart/form-data com campo 'file' — arquivos pequenos (Vercel
 *     Serverless tem limite ~4.5MB no request body, então PDFs maiores
 *     que isso são rejeitados com 413 antes da função executar).
 *  2. application/json com { source_url } — arquivo já no Supabase Storage,
 *     servidor baixa direto. SSRF-safe: só aceita URL do storage do projeto.
 *
 * O server roda pdf-parse (Node-friendly, sem worker, sem Web APIs) e
 * devolve { text, pages }. Não persiste o arquivo — uso single-shot.
 *
 * Auth: requer sessão (evita uso anônimo abusivo).
 * Limite: arquivos > LIMITS.PDF_BYTES rejeitados. Texto > 4 * LIMITS.TRANSCRIPT_CHARS truncado.
 */

import { createClient } from "@/lib/supabase/server";
import { LIMITS, PDF_LIMIT_MB } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    // Auth — single-line: se não logado, 401
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Faça login." }, { status: 401 });
    }

    const contentType = req.headers.get("content-type") ?? "";
    let buf: Buffer;
    let fileName = "pdf";
    let fileSize = 0;

    if (contentType.includes("application/json")) {
      const body = (await req.json().catch(() => null)) as {
        source_url?: string;
      } | null;
      const sourceUrl = body?.source_url;
      if (!sourceUrl || typeof sourceUrl !== "string") {
        return Response.json(
          { error: "Body JSON deve ter 'source_url' (string)." },
          { status: 400 },
        );
      }
      // Aceita só URL do storage do próprio projeto. Evita virar proxy de
      // download arbitrário (SSRF).
      const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
      if (!supaUrl || !sourceUrl.startsWith(supaUrl)) {
        return Response.json(
          { error: "source_url precisa apontar pro storage do projeto." },
          { status: 400 },
        );
      }
      let resp: Response;
      try {
        resp = await fetch(sourceUrl);
      } catch (err) {
        return Response.json(
          { error: `Falha ao baixar PDF: ${(err as Error).message}` },
          { status: 502 },
        );
      }
      if (!resp.ok) {
        return Response.json(
          { error: `Storage respondeu ${resp.status} ao baixar PDF.` },
          { status: 502 },
        );
      }
      const ab = await resp.arrayBuffer();
      if (ab.byteLength > LIMITS.PDF_BYTES) {
        return Response.json(
          { error: `Arquivo passa de ${PDF_LIMIT_MB} MB.` },
          { status: 413 },
        );
      }
      if (ab.byteLength === 0) {
        return Response.json({ error: "Arquivo vazio." }, { status: 400 });
      }
      buf = Buffer.from(ab);
      fileSize = ab.byteLength;
      fileName = sourceUrl.split("/").pop() ?? "pdf";
    } else {
      const formData = await req.formData().catch(() => null);
      if (!formData) {
        return Response.json(
          {
            error:
              "Body deve ser multipart/form-data com 'file' OU application/json com 'source_url'.",
          },
          { status: 400 },
        );
      }
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return Response.json(
          { error: "Campo 'file' não é um arquivo válido." },
          { status: 400 },
        );
      }
      if (file.size > LIMITS.PDF_BYTES) {
        return Response.json(
          { error: `Arquivo passa de ${PDF_LIMIT_MB} MB.` },
          { status: 413 },
        );
      }
      if (file.size === 0) {
        return Response.json({ error: "Arquivo vazio." }, { status: 400 });
      }
      const ab = await file.arrayBuffer();
      buf = Buffer.from(ab);
      fileSize = file.size;
      fileName = file.name;
    }

    // BUG conhecido do pdf-parse@1.1.1: o index.js executa código de debug
    // quando importado sem module.parent (ESM/serverless). Tenta ler um
    // arquivo de teste ./test/data/05-versions-space.pdf que NÃO existe
    // no bundle do Vercel → ENOENT. Workaround universal: importar direto
    // o lib/pdf-parse.js que é a função pura, sem o wrapper de debug.
    type PdfParseFn = (
      b: Buffer,
    ) => Promise<{ text?: string; numpages?: number }>;
    // @ts-expect-error — lib interno sem types, mas a função tem assinatura idêntica ao módulo top-level
    const mod = await import("pdf-parse/lib/pdf-parse.js");
    const pdfParse: PdfParseFn =
      typeof mod === "function"
        ? (mod as unknown as PdfParseFn)
        : ((mod as { default?: PdfParseFn }).default ??
          (mod as unknown as PdfParseFn));

    let result: { text?: string; numpages?: number };
    try {
      result = await pdfParse(buf);
    } catch (err) {
      const msg = (err as Error).message ?? "";
      console.error("[pdf-extract] pdf-parse failed", {
        fileName,
        fileSize,
        error: msg.slice(0, 300),
      });
      // Padrões conhecidos de pdf-parse
      if (/password|encrypted/i.test(msg)) {
        return Response.json(
          {
            error:
              "Esse PDF está protegido por senha — remova a proteção antes de subir.",
            kind: "password",
          },
          { status: 422 },
        );
      }
      if (/invalid pdf/i.test(msg)) {
        return Response.json(
          {
            error: "Arquivo não é um PDF válido (pode estar corrompido).",
            kind: "invalid",
          },
          { status: 422 },
        );
      }
      return Response.json(
        {
          error: `Falha ao processar PDF: ${msg.slice(0, 200)}`,
          kind: "unknown",
        },
        { status: 500 },
      );
    }

    const rawText = (result?.text ?? "").trim();
    if (!rawText) {
      return Response.json(
        {
          error:
            "Esse PDF não tem texto extraível (provavelmente é só imagem escaneada).",
          kind: "empty",
        },
        { status: 422 },
      );
    }

    const MAX = LIMITS.TRANSCRIPT_CHARS * 4;
    const text = rawText.length > MAX ? rawText.slice(0, MAX) : rawText;
    const pages =
      typeof result?.numpages === "number" && result.numpages > 0
        ? result.numpages
        : 1;

    return Response.json({ text, pages });
  } catch (err) {
    console.error("[pdf-extract] crash", err);
    return Response.json(
      { error: "Erro interno ao processar PDF." },
      { status: 500 },
    );
  }
}
