/**
 * Email do lead magnet "Guia de Revisão da Semana de Prova".
 *
 * Arquivo NOVO (separado de src/lib/email.ts pra não conflitar com edits
 * pendentes do user nesse arquivo).
 *
 * Dispara via Resend. Falha silenciosa se RESEND_API_KEY faltar.
 */

import { Resend } from "resend";

let client: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (client) return client;
  client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

const FROM = process.env.RESEND_FROM_EMAIL || "Lumio <onboarding@resend.dev>";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendLeadMagnetEmail(opts: {
  to: string;
  appUrl?: string;
  pdfPath?: string;
  bonusCoins?: number;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email-lead-magnet] RESEND_API_KEY ausente — skip");
    return { skipped: true };
  }

  const appUrl = (opts.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://www.lumioapp.net").replace(
    /\/$/,
    "",
  );
  const pdfUrl = `${appUrl}${opts.pdfPath ?? "/guia-revisao-prova.pdf"}`;
  const signupUrl = `${appUrl}/signup?utm_source=lead_magnet&utm_medium=email&utm_campaign=guia_revisao`;
  const bonus = opts.bonusCoins ?? 50;
  const toEsc = escapeHtml(opts.to);

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Seu guia chegou</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#0f0f17;background:#fafafa;">
  <span style="display:none;font-size:1px;color:#fafafa;">Seu guia tá pronto. PDF + ${bonus} coins extras se criar conta.</span>

  <div style="background:linear-gradient(135deg,#6d28d9,#a855f7);border-radius:12px;padding:28px 24px;color:white;margin-bottom:24px;">
    <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#e9d5ff;">Lumio · Guia gratuito</p>
    <h1 style="margin:0;font-size:22px;line-height:1.3;">Seu guia chegou.</h1>
  </div>

  <p style="line-height:1.6;color:#27272a;font-size:15px;">Oi! Aqui tá o link pro PDF que você pediu:</p>

  <p style="margin:20px 0;">
    <a href="${pdfUrl}" style="display:inline-block;background:#0f0f17;color:white;text-decoration:none;padding:13px 22px;border-radius:8px;font-weight:600;font-size:14px;">Baixar o guia (PDF)</a>
  </p>

  <p style="line-height:1.6;color:#52525b;font-size:14px;">São 4 páginas, direto ao ponto. Lê hoje, aplica essa semana, vê resultado na próxima prova.</p>

  <hr style="border:none;border-top:1px solid #e4e4e7;margin:28px 0;">

  <div style="background:white;border:1px solid #e4e4e7;border-radius:10px;padding:20px;">
    <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#6d28d9;font-weight:700;">Bônus exclusivo de quem baixou</p>
    <h2 style="margin:0 0 8px;font-size:18px;color:#0f0f17;">+${bonus} coins na sua conta Lumio</h2>
    <p style="line-height:1.6;color:#52525b;font-size:14px;margin:0 0 16px;">Crie a conta com esse mesmo email e a gente joga ${bonus} coins extras (além das 50 de boas-vindas). Total: 100 coins pra testar transcrição, resumo, flashcards e quiz.</p>
    <a href="${signupUrl}" style="display:inline-block;background:linear-gradient(135deg,#6d28d9,#a855f7);color:white;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;font-size:13px;">Criar conta com 100 coins</a>
  </div>

  <p style="line-height:1.6;color:#52525b;font-size:13px;margin-top:24px;">Sem cartão. Cancele quando quiser. Se tiver dúvida, é só responder esse email.</p>

  <hr style="border:none;border-top:1px solid #e4e4e7;margin:32px 0;">
  <p style="font-size:11px;color:#a1a1aa;">Lumio · Transcrição de aulas + IA · enviado pra ${toEsc}</p>
</body></html>`;

  return resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: "Seu guia chegou + 50 coins de bônus no Lumio",
    html,
    headers: { "X-Lumio-Lead-Magnet": "guia_revisao" },
  });
}
