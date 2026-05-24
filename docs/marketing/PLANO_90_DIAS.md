# Lumio — Plano 90 dias pra começar a vender

**Janela:** 2026-05-24 → 2026-08-22
**Premissa:** produto LIVE, checkout LIVE, pricing definido. Falta aquisição + conversão.
**Restrições:** sem aparecer em vídeo (criativos via IA), orçamento limitado, fundador solo.
**Objetivo cabeça:** sair de 0 → **R$5.000 MRR** em 90 dias com fundação sustentável (não growth hack que quebra no dia 91).

---

## North Star Metric

**Estudantes pagantes ativos** (não MRR — porque anual distorce). Meta: **80 pagantes** ao fim do dia 90.

Cálculo otimista: 80 × ticket médio R$65/mês = **R$5.200 MRR** equivalente.

### KPIs secundários (semanais)
- Visitas landing
- Signups (free)
- Aulas gravadas por user (ativação)
- Free → Pago (conversão)
- CAC blended
- LTV (estimado 6 meses pra começar)

---

## Funil-alvo (modelo conservador)

| Etapa | Conversão | Volume mês 3 |
|---|---|---|
| Visita landing | — | 12.000/mês |
| → Signup free | 4% | 480 |
| → Ativação (1ª aula gravada em 7d) | 50% | 240 |
| → Pago (em 30d pós-signup) | 12% | ~30/mês |

3 meses de pagantes acumulados (com churn 8%/mês inicial) ≈ **78 pagantes ativos no fim do mês 3.** ✅ Próximo da meta.

**Lever principal:** conversão visita→signup. Se cair pra 2% (landing ruim), meta vira inalcançável. Por isso **auditoria da landing é blocker** (ver [AUDITORIA_LANDING.md](./AUDITORIA_LANDING.md)).

---

## Foco estratégico: **nicho-first**

**Nicho âncora: estudantes de MEDICINA BR.**

Por quê:
- DNA Mandic — você conhece o ICP de verdade
- LTV alto (mais cara a faculdade, mais paga; pais frequentemente cobrem assinaturas)
- Estudam muito (4-6h/dia) → uso intenso → ativação rápida
- Influenciadores claros (médicos no Insta, ligas acadêmicas, mentores R+, contas tipo @medicinaresumida)
- Comunidades concentradas (ligas, grupos WhatsApp por faculdade, Discord de cursos)
- Indicação forte (turma se conhece, grupo de WhatsApp viraliza ferramenta)

**Nichos secundários (mês 2-3, só se medicina destravar):** direito, engenharia, vestibulando R+ medicina.

**Tudo que não for medicina BR nos primeiros 60 dias = ruído.** Recusar parcerias, pivots, sugestões fora do nicho.

---

## Estrutura: 3 sprints de 30 dias

### Sprint 1 (dias 1-30) — **Fundação + primeiras vendas orgânicas**
**Tema:** *parar de vazar, capturar quem chega, ativar canais sem dinheiro.*

### Sprint 2 (dias 31-60) — **Embaixadores + ads scaffolding**
**Tema:** *acionar mecanismos de aquisição com leverage.*

### Sprint 3 (dias 61-90) — **Escala paga + SEO compounding**
**Tema:** *ligar Meta Ads sério, content engine rodando, otimizar funil.*

---

# SPRINT 1 — Dias 1-30: Fundação

## Semana 1 (dias 1-7): Plumbing + Auditoria

**Objetivo:** parar de perder visita. Sem isso, todo gasto futuro queima.

### Tarefas (blockers de tudo)
- [ ] **Dia 1-2:** instalar tracking — GA4 + Meta Pixel + GTM + PostHog (heatmap + session replay grátis até 1M events)
- [ ] **Dia 1-2:** eventos: `page_view`, `signup_start`, `signup_complete`, `lecture_recorded`, `checkout_start`, `checkout_complete`, `lead_captured`
- [ ] **Dia 2:** Meta Conversion API server-side (no `signup-password/route.ts` + `stripe/webhook/route.ts`)
- [ ] **Dia 3:** fixes blockers da auditoria — F1.2 (avatars), F4.x (testimonials fake), F13.2 (meta SEO), F9.1 (banner trial)
- [ ] **Dia 4:** gravar screencast 15s do produto real (CapCut ou só QuickTime) e substituir LiveDemo no hero
- [ ] **Dia 5:** criar `/embaixador` landing + UI conta (ver implementação separada)
- [ ] **Dia 5-6:** criar blog `/blog` rota + `/lumi-personagem` (SEO scaffolding, vazio ainda OK)
- [ ] **Dia 6-7:** comprar handles Instagram + TikTok + YouTube: `@lumioapp` ou `@usalumio` ou `@lumio.app` (verificar disponíveis, registrar todos)

### Definição de sucesso semana 1
- Dashboards GA4 + Meta + PostHog mostrando dados
- Funil de signup tem 5 eventos rastreados
- Landing auditoria sprint 1 aplicada
- 3 contas de social criadas (mesmo vazias)

---

## Semana 2 (dias 8-14): Conteúdo + Comunidades

**Objetivo:** entrar nos lugares onde estudante de medicina vive sem gastar.

### Conteúdo (vídeos AI-generated)
- [ ] **Dia 8-9:** seguir [PLAYBOOK_VIDEOS_AI_ADS_SEO.md](./PLAYBOOK_VIDEOS_AI_ADS_SEO.md) e produzir 5 vídeos com Lumi (Sora/Veo3/Runway):
  1. *"POV: você é estudante de medicina e gravou a aula"* (15s, Lumi gerando 4 produtos)
  2. *"Sua próxima prova de anatomia em 30s"* (15s, antes/depois)
  3. *"Coisas que estudante de medicina faz que ninguém ensinou"* (20s, lista com Lumi)
  4. *"Por que sua transcrição do Google não presta pra aula de farmacologia"* (20s)
  5. *"O Lumi tem opinião sobre o seu método de estudo"* (15s, comédia)

- [ ] **Dia 10:** postar 1 vídeo por dia na semana (Tiktok + Instagram Reels + YouTube Shorts)

### Comunidades (orgânico ativo)
- [ ] **Dia 11:** identificar **30 ligas acadêmicas de medicina BR** ativas no Insta (Liga de Cardio, Liga de Cirurgia, LAEM-USP, etc) → planilha
- [ ] **Dia 12-13:** DM personalizado pra cada uma oferecendo:
  - Acesso Pro grátis pra 5 membros da liga
  - Conteúdo educativo gratuito (vídeo Lumi ensinando algo da especialidade)
  - Webinar conjunto futuramente
- [ ] **Dia 14:** identificar 20 grupos WhatsApp/Discord de estudantes de medicina → entrar como aluno e observar (não spammar)

### Definição de sucesso semana 2
- 5 vídeos publicados (mesmo com 0 views, importa o flywheel)
- 30 ligas contatadas, 5 com resposta positiva
- 50+ signups novos via canais orgânicos

---

## Semana 3 (dias 15-21): Embaixadores MVP + Lead magnet

**Objetivo:** ativar mecânica de viralidade própria.

### Embaixadores
- [ ] **Dia 15-17:** lançar **programa de embaixadores** (implementação técnica já preparada):
  - Cada user logado tem código `LUMI-XXXX`
  - Página `/embaixador` pública vendendo o programa
  - Página `/account/embaixador` com código + link + stats
  - Quem traz amigo paga: amigo ganha 30 dias Pro grátis + indicador ganha 1 mês grátis (ou R$30 cash via Pix se preferir)
  - Top embaixador do mês ganha plano Power vitalício
- [ ] **Dia 17:** email pra todos signups ativos atuais avisando do programa
- [ ] **Dia 18:** banner no `/dashboard` empurrando o programa

### Lead magnet (captura email sem pagar)
- [ ] **Dia 19-21:** criar **"Resumo grátis: 50 flashcards de anatomia humana feitos pelo Lumi"** PDF + página `/material-gratis/anatomia` com captura de email + entrega por Resend.
  - Vira post Insta/TikTok: "Comente ANATOMIA que eu mando" → DM automatizada (Manychat $15/mês)
  - Email captado entra em sequência de 7 dias até converter pro app

### Definição de sucesso semana 3
- Programa embaixador no ar com primeiros 10 códigos ativos
- Lead magnet com 50+ emails captados
- 10 visitas/dia orgânica no `/embaixador`

---

## Semana 4 (dias 22-30): SEO foundation + primeiros ads de teste

**Objetivo:** plantar SEO de longo prazo + testar Meta Ads com orçamento mínimo.

### SEO
- [ ] **Dia 22-24:** publicar 5 primeiros artigos no `/blog` (gerados com Claude + revisão manual):
  1. "Como transcrever aula de medicina automaticamente em 2026"
  2. "Os 10 melhores apps pra estudar medicina (com comparativo)"
  3. "Como fazer resumo de aula de anatomia em 30 segundos"
  4. "Flashcards vs resumo: o que funciona melhor pra retenção"
  5. "ChatGPT pra faculdade de medicina: vale a pena?"
- [ ] **Dia 25:** registrar Google Search Console + Bing Webmaster + submeter sitemap
- [ ] **Dia 26:** **estratégia de backlink:** ligar 5 ligas acadêmicas a publicarem review do Lumio com link

### Meta Ads (teste)
- [ ] **Dia 27-28:** criar conta Business Manager + configurar Pixel + CAPI
- [ ] **Dia 28:** **campanha de teste R$30/dia** (R$90 total no primeiro fim de semana):
  - Objetivo: conversão signup
  - Público: lookalike de quem comentou ANATOMIA no Insta (ou interesse: medicina + universitário + 18-25 BR)
  - Criativo: 3 melhores vídeos da semana 2
  - 3 variações de copy
- [ ] **Dia 30:** ler dados, decidir se escala (CPL < R$8) ou ajusta

### Definição de sucesso semana 4
- 5 artigos publicados
- 100+ signups acumulados no mês
- 10-15 pagantes (1ª conversão real)
- CPL Meta < R$10 ou pivot do criativo

---

# SPRINT 2 — Dias 31-60: Embaixadores + Ads scaffolding

## Tema do sprint
Mês 1 prova canais. Mês 2 **escala o que funcionou** e mata o resto.

## KPIs alvo fim do dia 60
- 25 pagantes ativos
- R$1.500 MRR
- 1.000 signups acumulados
- 5 embaixadores trazendo 5+ leads cada
- 15 artigos publicados
- CAC blended < R$50

## Semana 5-6 (dias 31-44)

### Embaixadores: top 10 vira programa premium
- [ ] Identificar top 10 embaixadores (mais signups trazidos)
- [ ] Convidar pra **Programa Lumi Founders**: Power grátis vitalício + dashboard custom + selo "Embaixador Oficial" no perfil
- [ ] Pedir 1 testimonial real com foto pra landing (resolve F1.2 + F4.x da auditoria)
- [ ] Pedir 1 reels gravado por eles mostrando o app (UGC genuíno, complementa AI-generated)

### Conteúdo: dobrar produção
- [ ] 3 vídeos AI/semana (24 no sprint)
- [ ] 5 artigos blog/semana (20 no sprint)
- [ ] Iniciar Newsletter semanal Resend pros leads ("**Lumi Letter**" — 5min de leitura, dicas de estudo + 1 atualização produto)

### Parcerias acadêmicas
- [ ] Fechar 3 ligas como **parceiras oficiais**: cada uma indica Lumi pra calouros em troca de Pro grátis pra membros ativos
- [ ] Acordo: liga posta 1x/mês conteúdo Lumi → ganha verba pra evento (R$200/mês)

## Semana 7-8 (dias 45-60)

### Meta Ads: escala
- [ ] Aumentar pra R$100/dia se CPL < R$10 na semana 4
- [ ] Estrutura: 3 campanhas
  1. **Prospecting** (lookalike + interesse): 60% budget
  2. **Retargeting visitantes não-signup**: 25% budget
  3. **Conversion signup→pago** (audiência de signups free há 3-14 dias): 15% budget

### Google Ads: ligar busca
- [ ] **Search ads** em keywords longtail:
  - "transcrever aula medicina"
  - "app pra resumir aula"
  - "ChatGPT pra faculdade"
  - "como fazer flashcards anatomia"
- [ ] Budget R$30/dia inicial, escalar se CPC < R$2 e CVR > 5%

### Otimização funil
- [ ] A/B testes:
  - Headline hero (3 variantes)
  - CTA primário ("Começar grátis" vs "Ver Lumi em ação" vs "Grátis por 14 dias")
  - Pricing: anual selected-by-default vs mensal
- [ ] Ferramenta: PostHog feature flags ou Vercel Edge Config

---

# SPRINT 3 — Dias 61-90: Escala + compounding

## Tema do sprint
Mês 3 é onde **SEO começa a aparecer no Google** (lag de 60-90 dias) e Meta Ads cruza eficiência. **Hora de escalar gasto e plantar pra mês 4-12.**

## KPIs alvo fim do dia 90
- **80 pagantes ativos** (meta principal)
- **R$5.000 MRR**
- 2.500 signups acumulados
- 3.000 emails na newsletter
- 15 embaixadores ativos
- 40+ artigos blog rankeando
- CAC blended < R$70
- LTV/CAC > 3x (ainda projeção)

## Tracks paralelos

### Track 1: Meta + Google Ads escala
- Orçamento: R$200-300/dia se métricas seguram
- Lookalike de pagantes (não só signups) — mais conversão
- Criativos novos: 3/semana mínimo (refresh creative fatigue)
- Google Performance Max test (R$50/dia paralelo às search ads)

### Track 2: SEO content engine
- 10 artigos/mês (Claude + revisor humano ou contratado)
- Foco: keywords longtail BR baixo concorrência ("como estudar para [matéria específica]")
- Backlink campaign: pitch pra blogs de medicina + jornais universitários
- YouTube channel: republicar vídeos AI com voiceover educativo + carrossel Instagram (canal-multi format)

### Track 3: Comunidades expansão
- Calouros faculdades de medicina top 20 BR: parceria com centros acadêmicos
- Evento online "Como estudar medicina em 2026" (webinar grátis, captura leads)
- Programa afiliado para **influencers de medicina** (médicos com 10k+ no Insta): 30% recorrente por user pago indicado

### Track 4: Produto que vende
- Adicionar **share embed do resumo** ("Resumo feito com Lumio · lumioapp.net/r/abc123")
- Cada user que compartilha resumo público vira canal de aquisição
- Lumi Coins: gamificar indicação (mais coins se amigo virar pago)

---

# Riscos & contingências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Meta Ads não destrava (CPL > R$15) | Média | Pivot pra Google Ads Search + comunidades + SEO. Não queimar +R$3k testando. |
| Churn alto (>15%/mês) | Alta | Investigar: produto, onboarding, ativação. Fix prioritário antes de escalar ads. |
| SEO não aparece em 60d | Baixa em longtail | Continuar. Compounding paga em 90-180d. |
| Embaixadores não trazem | Média | Aumentar incentivo (de mês grátis pra R$50 Pix por pago) |
| Stripe KYC bloqueia | Concreto | Resolver KYC essa semana. Sem isso, todo MRR fica retido. |
| Estudante BR não paga R$39+ | Baixa | Já tem freemium 3 aulas. Considerar plano "Vestibulando" R$19/mês com features menores. |

---

# Cronograma de gastos (estimativa)

| Item | Mês 1 | Mês 2 | Mês 3 | Total |
|---|---|---|---|---|
| Meta Ads | R$300 | R$2.000 | R$5.000 | R$7.300 |
| Google Ads | R$0 | R$600 | R$1.500 | R$2.100 |
| Stock fotos + ferramentas IA (Sora, ElevenLabs, Veo) | R$200 | R$200 | R$200 | R$600 |
| Resend (email) | R$0 (free tier) | R$80 | R$80 | R$160 |
| PostHog | R$0 | R$0 | R$0-150 | R$0-150 |
| Manychat / Tally | R$80 | R$80 | R$80 | R$240 |
| Domínios extras (lumi.app, etc) | R$200 | — | — | R$200 |
| Contratado: revisor de conteúdo SEO (freela) | R$0 | R$800 | R$1.200 | R$2.000 |
| **Total** | **R$780** | **R$3.760** | **R$8.060** | **~R$12.600** |

**Receita esperada acumulada (~80 pagantes × ~6 meses LTV):** R$30k+ no horizonte. **LTV/CAC saudável.**

---

# Cadência operacional

## Diário (15min)
- Checar dashboard PostHog: signups, CPL Meta, principais eventos
- Responder DMs Instagram + TikTok + WhatsApp da landing
- 1 comentário relevante em 1 conta de medicina top

## Semanal (sex à tarde, 2h)
- Revisar KPIs vs target
- Decidir creative refresh ads (matar pior, escalar melhor)
- Publicar newsletter
- Planejar próxima semana

## Quinzenal (sáb, 3h)
- Postmortem de campanhas
- Brief criativo dos próximos vídeos AI
- Outreach a 5 novas ligas/influencers

## Mensal (1º dia útil, 4h)
- Fechar mês: MRR, churn, NPS, LTV
- Reorçar próximo mês
- Decisão go/no-go nos canais (matar canais com CAC ruim 2 meses seguidos)
- Atualizar este plano

---

# Próxima ação (hoje)

1. **Confirmar tracking instalado** (GA4 + Pixel + PostHog) — sem isso, todo o resto fica cego
2. **Marcar 2h essa semana** pra fazer o pacote de auditoria sprint 1 (avatars, testimonials, screencast, meta tags)
3. **Decidir orçamento Meta** pro mês 1 (sugestão: R$500, conservador)
4. **Implementar embaixadores** (eu já vou fazer essa parte agora)

Ver: [PLAYBOOK_VIDEOS_AI_ADS_SEO.md](./PLAYBOOK_VIDEOS_AI_ADS_SEO.md) · [AUDITORIA_LANDING.md](./AUDITORIA_LANDING.md)
