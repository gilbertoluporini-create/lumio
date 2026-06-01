/**
 * Endpoint mínimo de telemetria pra capturar falhas de extração de PDF.
 *
 * Motivação: usuários reportam "falha ao processar PDF" mas o erro real
 * só aparece no console do device deles. Em iPad Safari é impossível
 * inspecionar. Esse endpoint recebe o erro estruturado e logga em Vercel
 * (visível em logs) pra debug.
 *
 * Não persiste em DB nem retorna nada útil — apenas log.
 */

import { getClientIp, limitOrThrow } from "@/lib/rate-limit";

type Payload = {
  fileName?: string;
  fileSize?: number;
  errorKind?: string;
  errorMessage?: string;
  userAgent?: string;
  context?: string;
};

export async function POST(req: Request) {
  // Rate limit por IP: endpoint é público sem auth e só logga texto livre —
  // atacante poderia inundar logs do Vercel e estourar custo. 20 / min cobre
  // usuários reais que tentam upload em sequência após falha.
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`tele-pdf:ip:${ip}`, 20, 60_000);
  if (ipLimit) return ipLimit;

  try {
    const body = (await req.json().catch(() => ({}))) as Payload;
    console.warn("[telemetry/pdf-error]", {
      fileName: typeof body.fileName === "string" ? body.fileName.slice(0, 200) : undefined,
      fileSize: typeof body.fileSize === "number" ? body.fileSize : undefined,
      errorKind: typeof body.errorKind === "string" ? body.errorKind.slice(0, 60) : undefined,
      errorMessage:
        typeof body.errorMessage === "string"
          ? body.errorMessage.slice(0, 500)
          : undefined,
      userAgent:
        typeof body.userAgent === "string" ? body.userAgent.slice(0, 200) : undefined,
      context: typeof body.context === "string" ? body.context.slice(0, 60) : undefined,
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[telemetry/pdf-error] crash", err);
    return Response.json({ ok: false }, { status: 200 });
  }
}
