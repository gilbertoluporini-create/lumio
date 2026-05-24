import { Resend } from "resend";

let client: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (client) return client;
  client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

/**
 * Email remetente.
 * Reality Check fix #11: `onboarding@resend.dev` é sandbox do Resend — só
 * funciona pra emails do dono da conta Resend. Em produção, configure um
 * domínio verificado.
 */
const FROM = process.env.RESEND_FROM_EMAIL || "Lumio <onboarding@resend.dev>";

if (
  process.env.NODE_ENV === "production" &&
  FROM.includes("onboarding@resend.dev")
) {
  console.error(
    "[email] AVISO CRÍTICO: RESEND_FROM_EMAIL não configurado com domínio verificado em produção. " +
      "Emails (welcome, recibo) serão entregues apenas pra conta dona do Resend, todos os outros falham silenciosamente. " +
      "Configure RESEND_FROM_EMAIL=Lumio <hello@SEU-DOMINIO.com> e verifique o domínio em https://resend.com/domains",
  );
}

export async function sendWelcomeEmail(opts: {
  to: string;
  name?: string;
  magicLink?: string;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY ausente — skip welcome email");
    return { skipped: true };
  }
  const safeName = (opts.name ?? "").split(" ")[0] || "estudante";
  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#18181b;">
  <h1 style="font-size:24px;margin:0 0 16px;">Olá, ${escapeHtml(safeName)} 👋</h1>
  <p style="line-height:1.6;color:#52525b;">Sua conta no <strong>Lumio</strong> está pronta. A partir de agora você pode transcrever suas aulas, perguntar pra IA enquanto rola e receber resumos automáticos por matéria.</p>
  ${
    opts.magicLink
      ? `<p style="margin:24px 0;"><a href="${opts.magicLink}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#a855f7);color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Entrar no Lumio</a></p>`
      : ""
  }
  <p style="line-height:1.6;color:#52525b;font-size:14px;">Se tiver qualquer dúvida, é só responder esse email.</p>
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:32px 0;">
  <p style="font-size:12px;color:#a1a1aa;">Lumio · Transcrição de aulas + IA</p>
</body></html>`;
  return resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: "Bem-vindo ao Lumio ✨",
    html,
  });
}

export async function sendReceiptEmail(opts: {
  to: string;
  name?: string;
  plan: "pro" | "annual";
  amount: number; // em centavos
  currency: string;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY ausente — skip receipt email");
    return { skipped: true };
  }
  const planName = opts.plan === "pro" ? "Pro mensal" : "Anual";
  const amount = (opts.amount / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: opts.currency.toUpperCase(),
  });
  const safeName = (opts.name ?? "").split(" ")[0] || "estudante";
  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#18181b;">
  <h1 style="font-size:24px;margin:0 0 16px;">Pagamento confirmado, ${escapeHtml(safeName)} ✅</h1>
  <p style="line-height:1.6;color:#52525b;">Seu plano <strong>${planName}</strong> (${amount}) está ativo. Acesse o Lumio quando quiser:</p>
  <p style="margin:24px 0;"><a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://lumio.app"}/dashboard" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#a855f7);color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Abrir dashboard</a></p>
  <p style="line-height:1.6;color:#52525b;font-size:14px;">Recibo oficial vai chegar do Stripe em alguns instantes.</p>
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:32px 0;">
  <p style="font-size:12px;color:#a1a1aa;">Lumio · Transcrição de aulas + IA</p>
</body></html>`;
  return resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: `Lumio ${planName} — pagamento confirmado`,
    html,
  });
}

/**
 * Notificação interna pro admin quando um novo ticket de suporte é aberto.
 */
export async function sendSupportTicketNotification(opts: {
  to: string;
  ticketId: string;
  userName: string;
  userEmail: string;
  subject: string;
  category: string;
  message: string;
  appUrl?: string;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY ausente — skip ticket notification");
    return { skipped: true };
  }
  const appUrl =
    opts.appUrl ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://lumioapp.net";
  const adminLink = `${appUrl.replace(/\/$/, "")}/admin/tickets`;
  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#18181b;">
  <h1 style="font-size:20px;margin:0 0 8px;">Novo ticket de suporte</h1>
  <p style="margin:0 0 16px;color:#71717a;font-size:13px;">Ticket #${escapeHtml(opts.ticketId.slice(0, 8))}</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
    <tr><td style="padding:6px 0;color:#71717a;width:120px;">De</td><td><strong>${escapeHtml(opts.userName || "—")}</strong> &lt;${escapeHtml(opts.userEmail)}&gt;</td></tr>
    <tr><td style="padding:6px 0;color:#71717a;">Categoria</td><td>${escapeHtml(opts.category)}</td></tr>
    <tr><td style="padding:6px 0;color:#71717a;">Assunto</td><td>${escapeHtml(opts.subject)}</td></tr>
  </table>
  <div style="background:#f4f4f5;border-radius:8px;padding:16px;margin:16px 0;white-space:pre-wrap;font-size:14px;line-height:1.6;">${escapeHtml(opts.message)}</div>
  <p style="margin:24px 0;">
    <a href="${adminLink}" style="display:inline-block;background:#18181b;color:white;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;">Abrir painel admin</a>
  </p>
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;">
  <p style="font-size:12px;color:#a1a1aa;">Lumio · Notificação interna · ${new Date().toLocaleString("pt-BR")}</p>
</body></html>`;
  return resend.emails.send({
    from: FROM,
    to: opts.to,
    replyTo: opts.userEmail,
    subject: `[Lumio Suporte] ${opts.category}: ${opts.subject}`,
    html,
  });
}

/**
 * Resposta de um ticket pro usuário.
 */
export async function sendSupportTicketReply(opts: {
  to: string;
  userName?: string | null;
  ticketSubject: string;
  reply: string;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY ausente — skip ticket reply");
    return { skipped: true };
  }
  const safeName = (opts.userName ?? "").split(" ")[0] || "estudante";
  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#18181b;">
  <h1 style="font-size:22px;margin:0 0 16px;">Olá, ${escapeHtml(safeName)}</h1>
  <p style="line-height:1.6;color:#52525b;">Recebemos seu ticket sobre <strong>${escapeHtml(opts.ticketSubject)}</strong>. Segue nossa resposta:</p>
  <div style="background:#f4f4f5;border-left:3px solid #6366f1;border-radius:6px;padding:16px;margin:16px 0;white-space:pre-wrap;font-size:14px;line-height:1.6;">${escapeHtml(opts.reply)}</div>
  <p style="line-height:1.6;color:#52525b;font-size:14px;">Se ainda tiver dúvidas, basta responder esse email.</p>
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:32px 0;">
  <p style="font-size:12px;color:#a1a1aa;">Lumio · Suporte</p>
</body></html>`;
  return resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: `Re: ${opts.ticketSubject}`,
    html,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
