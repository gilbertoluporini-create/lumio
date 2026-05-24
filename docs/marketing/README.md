# Lumio — Estratégia de Aquisição

Pacote estratégico criado em 2026-05-24 pra começar a vender o Lumio na internet, partindo de produto LIVE + checkout LIVE em lumioapp.net.

## Documentos

| Doc | O que tem |
|---|---|
| [PLANO_90_DIAS.md](./PLANO_90_DIAS.md) | Roadmap completo dia 1 ao 90 com sprints, metas, budgets, riscos. Norte: 80 pagantes em 90d. |
| [AUDITORIA_LANDING.md](./AUDITORIA_LANDING.md) | 17 furos identificados na landing lumioapp.net + roadmap de fixes priorizado em 3 sprints. |
| [PLAYBOOK_VIDEOS_AI_ADS_SEO.md](./PLAYBOOK_VIDEOS_AI_ADS_SEO.md) | 20 conceitos de vídeo AI com Lumi mascote · estrutura Meta + Google Ads · estratégia SEO compounding. |
| [INSTRUCOES_EMBAIXADORES.md](./INSTRUCOES_EMBAIXADORES.md) | Instruções pra finalizar integração do programa de embaixadores (3 edits + aplicar migration). |

## Programa de Embaixadores — código pronto

Arquivos novos criados (sem mexer em código existente):

- `supabase/migrations/007_referrals.sql` — schema completo (referral_codes, redemptions, clicks)
- `src/app/api/referral/mine/route.ts` — GET endpoint
- `src/app/api/referral/track/route.ts` — POST/GET tracking
- `src/app/account/embaixador/page.tsx` — UI logada
- `src/app/embaixador/page.tsx` — landing pública

**Pra ativar:** seguir [INSTRUCOES_EMBAIXADORES.md](./INSTRUCOES_EMBAIXADORES.md).

## Resumo executivo

**O que funciona agora (essa semana):**
1. Instalar tracking (GA4 + Meta Pixel + PostHog)
2. Fixes auditoria sprint 1 (avatars fake, testimonials fake, screencast real, meta SEO)
3. Aplicar migration embaixadores + 3 edits → programa live
4. Produzir primeiros 5 vídeos AI com Lumi (Sora/Veo)
5. Criar contas social (@lumioapp Instagram + TikTok + YouTube)

**O que escala (próximas 12 semanas):**
- Vídeos AI 1/dia rodando orgânico + reaproveitados como ads
- Meta Ads ABO escalando 30%/semana se métricas seguram
- Google Search Ads em keywords longtail
- Blog 1-3 artigos/semana com revisão humana
- Embaixadores propagando boca-a-boca via WhatsApp/grupos de medicina
- SEO compounding silenciosamente

**O que NÃO fazer:**
- Rodar ads sem tracking validado
- Gravar você mesmo (decisão: tudo IA)
- Sair do nicho medicina antes de 80 pagantes
- Escalar Meta antes de 30 conversões
- Esperar SEO destravar antes de mês 3-6

## Nicho âncora

**Medicina BR.** DNA Mandic, ICP de alto LTV, comunidades concentradas, indicação forte. Tudo que não for medicina nos primeiros 60 dias = ruído.

## Restrições assumidas

- Fundador solo, sem equipe de marketing
- Sem aparecer em vídeo — todo criativo gerado com IA usando Lumi como protagonista
- Orçamento conservador: R$12k em 90 dias
- Stripe LIVE com KYC ainda pendente (resolver essa semana)
- Quer escalar receita rápido sem queimar caixa em hacks que não compostam
