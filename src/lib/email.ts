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

/* -------------------------------------------------------------------------- */
/*  Onboarding email sequence — disparada por /api/cron/email-onboarding      */
/* -------------------------------------------------------------------------- */

type OnboardingStep = "day1" | "day3" | "day7" | "day14";

const SEQUENCE_COPY: Record<
  OnboardingStep,
  { subject: string; preheader: string; headline: string; body: string; cta: string; ctaPath: string }
> = {
  day1: {
    subject: "1 aula vira 4 materiais. Joga uma aí pra ver.",
    preheader: "Você ganhou 50 coins. Bora estrear?",
    headline: "Sua primeira aula com o Lumio",
    body:
      "Grava uma aula ou cola uma transcrição que você já tem. O Lumio gera resumo, flashcards, quiz e mapa mental em segundos. Tudo isso usando as 50 coins que vieram com sua conta — sem cartão.",
    cta: "Gravar primeira aula",
    ctaPath: "/dashboard",
  },
  day3: {
    subject: "Estudante de medicina ganha 4h por dia com isso",
    preheader: "É raro funcionar tão bem com pt-BR.",
    headline: "Já testou anexar um PDF?",
    body:
      "Anexa o slide do professor no Lumi. A IA correlaciona slide com transcrição automaticamente — você pergunta \"o que ele falou no slide 7?\" e a resposta vem com contexto certo. É o pulo do gato que ninguém percebe no começo.",
    cta: "Tentar com PDF",
    ctaPath: "/lumi",
  },
  day7: {
    subject: "Sua revisão SRS começa a fazer diferença essa semana",
    preheader: "Flashcards do Lumio usam Anki por baixo.",
    headline: "Flashcards que se ajustam ao SEU tempo",
    body:
      "Os decks que você gerou na semana começam a aparecer pra revisão hoje (algoritmo de repetição espaçada). 5 minutos por dia, mantém o conteúdo na cabeça pra prova. Sem precisar configurar nada — o Lumio cuida.",
    cta: "Revisar flashcards",
    ctaPath: "/flashcards",
  },
  day14: {
    subject: "Seu trial tá acabando — vale R$39 pra você?",
    preheader: "Sem cobrança automática. Você escolhe.",
    headline: "Continuar com o Lumio?",
    body:
      "Você usou o Lumio nessas 2 semanas. Se ajudou, dá pra continuar com o plano Starter (R$39/mês) ou Pro (R$69/mês) — cancela quando quiser, sem letra miúda. Se não rolou, sem stress, conta fica salva.",
    cta: "Ver planos",
    ctaPath: "/pricing",
  },
};

export async function sendOnboardingEmail(opts: {
  to: string;
  name?: string;
  step: OnboardingStep;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY ausente — skip onboarding email");
    return { skipped: true };
  }
  const copy = SEQUENCE_COPY[opts.step];
  const safeName = (opts.name ?? "").split(" ")[0] || "estudante";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://lumioapp.net";
  const utmCta = `${appUrl}${copy.ctaPath}?utm_source=email&utm_medium=lifecycle&utm_campaign=onboarding_${opts.step}`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(copy.subject)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#18181b;background:#fafafa;">
  <span style="display:none;font-size:1px;color:#fafafa;">${escapeHtml(copy.preheader)}</span>
  <h1 style="font-size:24px;margin:0 0 16px;line-height:1.3;">${escapeHtml(copy.headline)}, ${escapeHtml(safeName)}.</h1>
  <p style="line-height:1.6;color:#52525b;font-size:15px;">${escapeHtml(copy.body)}</p>
  <p style="margin:28px 0;">
    <a href="${utmCta}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#a855f7);color:white;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:600;font-size:15px;">${escapeHtml(copy.cta)}</a>
  </p>
  <p style="line-height:1.6;color:#52525b;font-size:14px;">Dúvida? Só responder esse email.</p>
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:32px 0;">
  <p style="font-size:11px;color:#a1a1aa;">Lumio · Transcrição de aulas + IA · <a href="${appUrl}/account/email-preferences" style="color:#a1a1aa;">preferências de email</a></p>
</body></html>`;

  return resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: copy.subject,
    html,
    headers: { "X-Lumio-Onboarding-Step": opts.step },
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
