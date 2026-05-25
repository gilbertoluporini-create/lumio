# Kickoff — chat de marketing/go-to-market do Lumio

> Cola o bloco abaixo como **primeira mensagem** num chat novo de Claude Code (VSCode/terminal) aberto na pasta `/Users/gilbertoluporini/lumio`. Ele já vai entrar com contexto e plano de ação.

---

## PROMPT PRA COLAR

```
Você é meu estrategista/operador de marketing do Lumio (lumioapp.net) — SaaS BR de
transcrição de aulas + IA pra universitários. Stripe LIVE, app estável, falta vender.

ANTES de qualquer resposta, lê na ordem:
1. /Users/gilbertoluporini/.claude/projects/-Users-gilbertoluporini/memory/project_lumio.md
2. /Users/gilbertoluporini/.claude/projects/-Users-gilbertoluporini/memory/project_lumio_marketing_brief.md
3. docs/marketing/CRIATIVOS_SPRINT.md
4. docs/marketing/DOMAIN_VERIFICATION.md

Contexto rápido:
- Pricing: Starter R$39 / Pro R$69 / Power R$119 (mensal). Anual 17% off.
- Free trial: 50 coins, sem cartão.
- Email sequence onboarding ATIVO (day1/3/7/14 via Resend).
- Tracking validado: GA4 + Meta CAPI + PostHog + Stripe webhook.
- Landing já reformulada e neutralizada (qualquer curso, sem claims inventados).
- 3 scripts de vídeo 30s + copy de ad + UTMs JÁ redigidos.

BLOQUEADORES atuais (precisa de mim, o founder):
1. Verificar domínio lumioapp.net no Meta Business Manager (meta tag)
2. Configurar AEM priority order no Pixel
3. Renderizar 3 vídeos (Veo3 + ElevenLabs Will + CapCut)

REGRAS:
- Sou founder, estudante de medicina, mas NÃO usar isso em copy nem mencionar
  professores/faculdade. Copy genérica pra qualquer curso.
- Não inventar números (acurácia, tempo salvo, etc.) — só claims verificáveis.
- Preferir CLIs (vercel, supabase, stripe, gh) em vez de me mandar fazer manual.
- Não pedir API keys/tokens pelo chat — eu coloco no .env.local e digo "feito".
- Em modo execução: 1 passo mastigado por vez, status de contexto curto.

Tarefa #1: monta um plano de go-to-market em 3 sprints de 2 semanas cada
(orgânico+embaixadores → paid ads → SEO/landings de persona) com KPIs claros,
budgets sugeridos, e checkpoint de validação no fim de cada sprint. No fim,
me pergunta o que destravar primeiro.
```

---

## Por que esse formato

- **Leitura obrigatória** nas memories no início faz o chat novo entrar já alinhado com técnico (produto) + comercial (briefing). Não precisa re-explicar.
- **Bloqueadores explícitos** evitam o chat sugerir Meta Ads sem saber que falta domain verify.
- **Regras** replicam meus comportamentos críticos (autonomia, sem inventar números, CLIs first, sem secrets em chat).
- **Tarefa #1** força output acionável (plano com KPI/budget) em vez de "blá-blá ICP".

## O que esperar do chat de marketing

Sprint 1 — orgânico/embaixadores (semana 1-2):
- Criar rota `/ambassador` com código de indicação
- Lista de 10-20 embaixadores candidatos
- 5 conteúdos/semana IG+TikTok

Sprint 2 — paid ads (semana 3-4):
- Pré-req: founder destravou domain verify + AEM + 3 vídeos
- 3 campanhas Meta A/B + 3 hooks TikTok + Google Search
- KPI: CAC ≤ R$30 signup / R$120 paying

Sprint 3 — SEO/landings de persona (semana 5-6):
- Landings por curso
- 10 blogposts cauda longa
- Lead magnet

## Enquanto isso, neste chat aqui

Continuo o bug-fixing tab-by-tab que você reportar (Lumio em produção, navegando como `gilbertoluporini@gmail.com` admin). Próximo report seu, próximo fix.

---

## Lead Magnet — Guia de Revisão (rodando)

E-book gratuito de 4 páginas que captura email + dá +50 coins bônus pra quem criar conta com o mesmo email.

**URLs**
- Página de captura: `/guia-revisao` → `https://lumioapp.net/guia-revisao`
- PDF público: `/guia-revisao-prova.pdf` → `https://lumioapp.net/guia-revisao-prova.pdf`
- Endpoint: `POST /api/leads/magnet` (body: `{ email, lgpd?: boolean }`)

**O que acontece quando alguém baixa**
1. Lead salvo em `leads` (source=`guia-revisao`, kind=`magnet_revisao`, metadata com bonus_coins=50)
2. Meta CAPI "Lead" + GA4 generate_lead disparados server-side (hashed email)
3. Email Resend com link do PDF + CTA pra signup com bônus
4. Se o email já tem conta: +50 coins na hora
5. Se ainda não tem: intenção fica pendente; ao criar conta, basta chamar `redeemLeadMagnetBonusIfPending({ userId, email })` em `src/lib/lead-magnet-bonus.ts` que credita

**Próxima integração pendente (founder faz no momento da próxima feature de auth)**
- `src/app/auth/callback/route.ts` → adicionar chamada a `redeemLeadMagnetBonusIfPending` logo após confirmar criação do user
- `src/app/api/auth/signup-password/route.ts` → idem após o signUp success
- Arquivos estavam modificados pelo trabalho do founder, então fica pra ele fazer o merge

**Como divulgar (esse mês)**

Orgânico:
- Bio Instagram: trocar link pra `lumioapp.net/guia-revisao` (vs. link direto do app)
- Bio TikTok: idem
- Story sticker IG: "Link" + frase "Guia de Revisão grátis" 2×/semana
- Post LinkedIn (founder): carrossel "3 passos pra revisar antes da prova" com CTA pro guia no último slide
- Comentários de posts grandes do nicho universitário (Reddit r/estudos, fóruns de medicina/direito): mencionar o guia quando rolar pergunta sobre técnica de estudo

Paid (depois do domain verify):
- Conjunto Meta Lead: criativo "guia gratuito" mirando 18-26 universitários BR, otimização Lead, $5-10/dia
- Custom Audience: emails dos leads → Lookalike 1-3% pra escalar
- Retargeting: visitantes de `/guia-revisao` que NÃO submeteram → criativo "ainda dá tempo de pegar o guia"

Email:
- Newsletter pré-existente (se tiver): blast com o link uma vez
- Footer dos emails de onboarding: rodapé discreto "Conhece nosso guia gratuito?"

**KPIs pra acompanhar**
- Conversion rate da página `/guia-revisao` (target inicial: >25% — landing focada com 1 campo)
- % de leads que abrem o email Resend (target: >60%)
- % de leads que criam conta nos 7 dias seguintes (target inicial: 8-12%)
- CAC por lead vs. CAC por signup (compara com canais diretos)

