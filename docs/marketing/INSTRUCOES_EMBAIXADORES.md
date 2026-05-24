# Instruções de Integração — Programa de Embaixadores

**Status MVP:** ✅ implementado em arquivos novos. Faltam **3 edições em arquivos existentes** + **aplicar migration**.

---

## Arquivos novos criados (já prontos)

```
supabase/migrations/007_referrals.sql          ← migration completa
src/app/api/referral/mine/route.ts             ← GET endpoint (código + stats)
src/app/api/referral/track/route.ts            ← POST/GET tracking + cookie
src/app/account/embaixador/page.tsx            ← UI logada (código, link, share, histórico)
src/app/embaixador/page.tsx                    ← Landing pública vendendo o programa
```

---

## Passo 1: aplicar migration no Supabase

```bash
cd /Users/gilbertoluporini/lumio
npx supabase db push
```

Confere se rodou OK:
```bash
npx supabase db remote list-migrations
```
Deve listar `007_referrals` aplicada.

---

## Passo 2: edição em arquivos existentes (3 mudanças)

### Edit 1 — Sidebar nav (linkar `/account/embaixador`)

Arquivo: `src/components/app/app-shell.tsx`

Procurar onde está o item "Lumi Coins" do nav (sidebar). Adicionar **antes ou depois** um item:

```tsx
// import no topo:
import { Sparkles } from "lucide-react"; // se ainda não importado

// no array de itens da sidebar, adicionar:
{
  href: "/account/embaixador",
  label: "Embaixador",
  icon: Sparkles, // ou Gift, ou Trophy — escolher
  // se houver badge counter de stats, pode chamar /api/referral/mine ao carregar shell
}
```

### Edit 2 — Signup: ler cookie `lumio_ref` e criar redemption

Arquivo: `src/app/api/auth/signup-password/route.ts`

Após o `supabase.auth.signUp` retornar `data` com sucesso, **antes** do `return NextResponse.json({...})`, adicionar:

```typescript
// === Programa Embaixador: cria redemption se vier de link ?ref= ===
try {
  const cookieStore = await import("next/headers").then(m => m.cookies());
  const refCode = (await cookieStore).get("lumio_ref")?.value;
  if (refCode && data.user) {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const admin = createAdminClient();
    const { data: codeRow } = await admin
      .from("referral_codes")
      .select("id, user_id")
      .eq("code", refCode)
      .maybeSingle();
    if (codeRow && codeRow.user_id !== data.user.id) {
      const headersList = await import("next/headers").then(m => m.headers());
      const hdrs = await headersList;
      const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      await admin.from("referral_redemptions").insert({
        referral_code_id: codeRow.id,
        referrer_user_id: codeRow.user_id,
        referred_user_id: data.user.id,
        status: "signed_up",
        ip_address: ip,
        user_agent: hdrs.get("user-agent")?.slice(0, 500),
      });
    }
  }
} catch (err) {
  console.error("[signup-password] referral redemption failed", err);
  // Não bloqueia o signup
}
```

### Edit 3 — Webhook Stripe: marcar redemption como paid + atribuir reward

Arquivo: `src/app/api/stripe/webhook/route.ts`

Dentro do handler `handleCheckoutCompleted` (ou após `subscription.created` confirmar plan pago), adicionar:

```typescript
// === Programa Embaixador: marca redemption como paid ===
try {
  if (userId && planName !== "free") {
    const { data: redemption } = await admin
      .from("referral_redemptions")
      .select("id, status")
      .eq("referred_user_id", userId)
      .maybeSingle();
    if (redemption && redemption.status !== "paid") {
      // Recompensa: 1 mês Pro = R$69 valor de mercado
      const REWARD_BRL = 69;
      await admin
        .from("referral_redemptions")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          plan: planName,
          reward_brl: REWARD_BRL,
        })
        .eq("id", redemption.id);
      // TODO: aplicar crédito real (adicionar 30 dias ao current_period_end do referrer)
      // Por enquanto fica como reward_brl pendente até implementar logica de credit
    }
  }
} catch (err) {
  console.error("[stripe/webhook] referral mark-paid failed", err);
}
```

### Edit 4 (opcional, mês 2) — Landing: tracking `?ref=` na URL

Arquivo: `src/app/page.tsx` (ou criar componente wrapper)

Adicionar no início do `useEffect` da landing:

```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  if (ref && /^LUMI-[A-Z0-9]{4}$/.test(ref)) {
    fetch("/api/referral/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: ref,
        referrer_url: document.referrer,
        utm_source: params.get("utm_source") ?? undefined,
        utm_medium: params.get("utm_medium") ?? undefined,
        utm_campaign: params.get("utm_campaign") ?? undefined,
      }),
    }).catch(() => {});
  }
}, []);
```

**Alternativa mais robusta:** criar um middleware Next.js que captura `?ref=` em **todas** as rotas, evitando precisar duplicar.

Arquivo: `src/middleware.ts` (criar se não existe):

```typescript
import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref");
  const res = NextResponse.next();
  if (ref && /^LUMI-[A-Z0-9]{4}$/.test(ref)) {
    res.cookies.set("lumio_ref", ref, {
      maxAge: 60 * 60 * 24 * 60,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    // Fire-and-forget pra logar click
    fetch(`${req.nextUrl.origin}/api/referral/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: ref,
        referrer_url: req.headers.get("referer") ?? "",
        utm_source: req.nextUrl.searchParams.get("utm_source") ?? undefined,
        utm_medium: req.nextUrl.searchParams.get("utm_medium") ?? undefined,
        utm_campaign: req.nextUrl.searchParams.get("utm_campaign") ?? undefined,
      }),
    }).catch(() => {});
  }
  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

⚠️ **Cuidado:** o CLAUDE.md do projeto avisa "This is NOT the Next.js you know" — antes de criar middleware confere a API atual em `node_modules/next/dist/docs/01-app/` pra garantir que matchers/cookies funcionam igual.

---

## Passo 3: testar end-to-end

1. Aplicar migration
2. Restart dev: `npm run dev`
3. Logar como user no app → ir em `/account/embaixador` → deve mostrar código novo gerado
4. Copiar link, abrir em **janela anônima**
5. Criar conta nova
6. Voltar pra conta original → painel deve mostrar 1 click + 1 signup
7. Fazer checkout teste no Stripe (modo test) → status deve virar `paid` e mostrar R$69 de reward

---

## Aplicar a recompensa: implementação futura (fase 2)

O MVP **registra** a recompensa (R$69 por amigo pagante), mas **não aplica** automaticamente ainda.

Opções de implementação (escolher 1):

### Opção A — Crédito Stripe via Coupon (mais limpo)
```typescript
// Quando redemption.paid:
// 1. Cria Coupon Stripe de 100% por 1 mês
// 2. Aplica no customer do referrer via subscription.update({ discounts: [{ coupon }] })
// 3. Marca reward_applied = true
```

### Opção B — Extender `current_period_end` manualmente
```typescript
// 1. Pega subscription do referrer no Stripe
// 2. subscription.update({ trial_end: <novo timestamp +30d> }) ou
// 3. Cria invoice item de -R$69 pra próxima fatura
```

### Opção C — Lumi Coins (mais simples, MVP)
```typescript
// 1. Concede X Lumi Coins equivalentes a R$69 de valor
// 2. User pode usar coins em vez de pagar próxima renovação
// 3. UI já existente em /account/coins
```

**Recomendação:** começar com **Opção C** (já tem infra de coins), migrar pra **Opção A** quando >50 paid redemptions/mês.

---

## Anti-fraude (fase 2)

MVP já captura `ip_address` e `user_agent`. Adicionar:

1. **Cron diário** que olha redemptions onde 3+ signups vêm do mesmo IP/UA e marca status `fraud`
2. **Threshold de cool-down**: 1 ref code não pode trazer mais de 10 signups em 24h
3. **Email check**: bloqueia se email do referred for em domínio igual ao referrer (mailinator, tempmail)
4. **Pre-pago check**: referrer só ganha quando referred completar 30 dias ativo (impede churned-no-1-dia abuse)

---

## Compartilhamento social (next steps)

Adicionar à página `/account/embaixador`:

1. **Botões de share direto** pra WhatsApp/Instagram/Twitter (já tem Share API genérica)
2. **Imagem OG dinâmica** por código: `/api/og/embaixador?code=LUMI-AB3X` gerando PNG com nome do user + código
3. **Mensagens prontas** copiáveis pra cada canal:
   - WhatsApp: "Tô usando o Lumio pra gravar e resumir aulas com IA. Usa meu link e ganha 30 dias grátis: {url}"
   - Instagram Story: "[CTA arrasta] App que transformou meus estudos. Link: {url}"
   - Twitter: "Encontrei o app que cuida das anotações enquanto eu presto atenção na aula. {url}"

---

## Métricas pra monitorar

| KPI | Meta inicial |
|---|---|
| % de users que abriram `/account/embaixador` | > 30% |
| % de users com 1+ click no link | > 15% |
| Conversão click → signup | > 8% |
| Conversão signup → paid (via referral) | > 12% (vs ~6% baseline esperado) |
| CAC blended pós-embaixador | Idealmente reduz vs ads puros |
| Top 10% embaixadores trazem % do total | > 60% (lei de Pareto) |

Adicionar dashboard em `/admin` chamando view SQL agregada de `referral_codes` + `referral_redemptions`.
