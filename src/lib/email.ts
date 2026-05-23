import { Resend } from "resend";

let client: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (client) return client;
  client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

const FROM = process.env.RESEND_FROM_EMAIL || "Lumio <onboarding@resend.dev>";

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
