# Auditoria da Landing — lumioapp.net

**Data:** 2026-05-24
**Versão analisada:** commit `317d01a` (v0.beta · maio 2026)
**Método:** leitura do código de [src/app/page.tsx](../../src/app/page.tsx) + render live em viewport 1440×900 via Playwright.

---

## TL;DR

A landing está visualmente **acima da média** do mercado BR pra SaaS de estudante: tipografia premium (Outfit), mascote consistente (Lumi), interações sofisticadas (Lenis smooth scroll, Magnetic, BeforeAfter), e um inventário sólido de seções (hero, products, pricing, FAQ, testimonials).

Mas ela **não está calibrada pra converter tráfego pago frio**. Hoje serve melhor pra impressionar quem já chega curioso (ex: indicação) do que pra arrastar um estudante distraído do Instagram até o `/signup`.

**Os 3 maiores furos de conversão:**
1. **Prova social fake/genérica** — avatars "A B C D" e quote anônima de "Aluno do 3º ano · Medicina" gritam que é placeholder. Pior do que não ter.
2. **Sem vídeo do produto em ação** — `LiveDemo` é uma mock animada, não o produto real rodando. Tráfego pago precisa ver "isto é real" em 3s.
3. **CTA único: "Começar grátis"** — não há captura de email pra quem não tá pronto, não há trial sem cartão diferenciado de freemium, não há urgência (vagas, preço promo).

**Impacto estimado:** corrigindo só os 3 acima, conversão visitante→signup pode dobrar (de hipotético 2% pra 4%). Os outros 14 fixes refinam o resto.

---

## 1. Hero (acima da dobra)

### O que tá bom
- Headline forte ("Volte a olhar pro **professor**. A gente cuida do **resto**.") — promessa emocional + benefício, ótimo.
- Outfit + tracking negativo + line-height 1.02 = visual editorial de revista.
- `LumiCharacter mood="recording"` flutuando + `LiveDemo` mock na direita = movimento na primeira vista.
- CTA primário "Começar grátis" com seta + magnetic effect.
- Badge "Beta privado · vagas abertas" cria curiosidade.

### Furos
- **F1.1 — Badge "Beta privado · vagas abertas" mente sobre escassez sem entregar.** Não há contador de vagas, deadline ou prova de exclusividade. Sai como bullshit pro visitante experiente. **Fix:** "Junte-se a +200 estudantes" (mover stat de 200 pra cá) OU criar lista de espera real com captura de email.

- **F1.2 — Avatars "A B C D" são placeholders óbvios.** ([page.tsx:155-162](../../src/app/page.tsx#L155-L162)) Letras genéricas em círculos cinzas. Substituir por:
  - 4 fotos reais (mesmo que stock fotos de estudantes BR diversos), OU
  - 4 iniciais de testimonials reais que aparecem mais abaixo, OU
  - Esconder até ter usuários reais (melhor do que mentir).

- **F1.3 — `LiveDemo` parece mock, não produto.** O usuário precisa de **vídeo de 8-15s** do produto real gravando uma aula, ou um GIF/screencast. Hoje é animação artística sem credibilidade.

- **F1.4 — Falta indicação de plataforma.** Funciona no celular? Precisa baixar? "Sem download" só aparece lá no CTA final. Mover pra abaixo do CTA do hero como microcopy: *"Funciona no Chrome. Sem download. Sem cartão."*

- **F1.5 — Sem segundo CTA pra quem não tá pronto.** Adicionar link secundário tipo "Ver em 30s" abrindo modal com vídeo demo, OU "Receber por email" capturando lead.

### Recomendação prioridade
**ALTO:** F1.2 (avatars), F1.3 (vídeo real), F1.5 (CTA secundário).
**MÉDIO:** F1.1 (badge honesto), F1.4 (microcopy de plataforma).

---

## 2. Marquee + Logos ([page.tsx:194-212](../../src/app/page.tsx#L194-L212))

### Furos
- **F2.1 — `LogosRow` é renderizado mas você não tem logos reais.** Se o componente mostra placeholders ("USP", "Mandic", etc), **remove até ter parcerias reais**. ICP de estudante é cético com logos vazios.

- **F2.2 — Marquee de features é texto genérico.** "Reconhecimento de voz nativo do navegador" — soa técnico. Trocar por **resultados**: "97% acurácia em PT-BR" / "Resumo pronto em 30s" / "4h por dia economizadas".

---

## 3. Stats ([page.tsx:232-256](../../src/app/page.tsx#L232-L256))

### O que tá bom
- CountUp animation + display-num font + tabular-nums = visual de painel de unicórnio.
- 4 stats balanceados (acurácia, histórico, tempo salvo, signup).

### Furos
- **F3.1 — "97% Acurácia em PT-BR · no beta privado"** — se for verdade, deixa. Se for chute, **mata**. Estudante de medicina (ICP de alto valor) verifica.

- **F3.2 — "4h/dia Tempo médio salvo · por estudante"** é forte mas precisa de **fonte/método** no hover ou note de rodapé pra não cheirar a marketing barato.

- **F3.3 — "∞ Histórico"** quebra o ritmo dos números. Considerar trocar por **"+50.000 minutos transcritos"** (se métrica real existir) — mais concreto.

---

## 4. Testimonials ([page.tsx:259](../../src/app/page.tsx#L259))

### Furos
- **F4.1 — Componente `<Testimonials />` referenciado mas não inspecionado aqui.** Confere se tem **nome real + foto + curso + faculdade** em cada testimonial. Se for "M. · Medicina" é fake-detected.

- **F4.2 — Quote featured ([page.tsx:357-382](../../src/app/page.tsx#L357-L382))** assinada por "**Aluno do 3º ano · Medicina** · Beta privado, maio de 2026" com avatar "M" cinza. **100% placeholder vibe.** Trocar por usuário real com permissão escrita, foto, instagram (linkado), aprovação por escrito. Sem isso, **remove a seção**.

---

## 5. How It Works ([page.tsx:262](../../src/app/page.tsx#L262))

Componente `<HowItWorks />` não lido aqui. Boa prática: 3-4 steps com **screenshots reais do app**, não ilustrações genéricas. Se hoje é só ilustração do Lumi, adicionar screenshot na frente.

---

## 6. Meet Lumi ([page.tsx:266-309](../../src/app/page.tsx#L266-L309))

### O que tá bom
- Sessão dedicada ao mascote = ótimo pra brand recall e replicabilidade em mídia paga (ads sempre voltam pro Lumi).
- Tags "Atento · Curioso · Focado · Animado" humanizam.
- `LumiChatMock` no lado mostra produto.

### Furos
- **F6.1 — Lumi não tem nome próprio sticky.** Você chama "Companheiro de estudos" no body. **Personificar mais:** "O Lumi tem 3 anos de idade mental, terminou medicina 4 vezes em universos paralelos e mora dentro do seu navegador." Tom leve + carismático faz brand stick + viraliza ad creative.

- **F6.2 — Sem link "Conheça mais do Lumi" levando a uma página `/lumi-personagem` ou `/sobre`.** Hoje quem se apaixona pelo mascote não tem onde ir. Oportunidade SEO + content marketing.

---

## 7. Products Tabs ([page.tsx:312-332](../../src/app/page.tsx#L312-L332))

Tabs (resumo/flashcards/quiz/mapa) interativas são ótimas, mas:

- **F7.1 — Precisa de "Ver demo ao vivo"** em cada tab linkando pra screencast ou app sandbox.
- **F7.2 — Falta indicador de tempo:** "Resumo pronto em 30s" / "Flashcards prontos em 45s" — converte ansiedade em desejo.

---

## 8. Before/After ([page.tsx:345-353](../../src/app/page.tsx#L345-L353))

Slider antes/depois é golden — mantém alto.

- **F8.1 — Confirma que o conteúdo é realista**, não Lorem Ipsum. Se for transcrição genérica de aula de biologia → ICP médico não se conecta. **Recomendação:** ter 3 variantes de Before/After por nicho (medicina, direito, eng) e mostrar de acordo com `?nicho=med` da URL ou heurística IP (BR + horário).

---

## 9. Pricing ([page.tsx:388](../../src/app/page.tsx#L388))

Componente `<PricingSection />` referenciado.

### Furos (assumindo estrutura comum)
- **F9.1 — Sem trial sem cartão claramente comunicado na landing.** Hoje é "Beta aberto / Sem cartão" no CTA final, mas a seção de pricing já mostra preços. Estudante vê R$39/69/119 e fecha aba. **Fix:** adicionar acima da pricing section um banner "**14 dias grátis em qualquer plano. Sem cartão de crédito.**"

- **F9.2 — Sem plano anual destacado como "+ econômico".** Toggle mensal/anual existe (memory confirma), mas precisa badge "Economize 17%" e selected-by-default no anual.

- **F9.3 — Sem comparação concreta.** "Pro R$69/mês" é abstrato. Adicionar: *"R$2,30/dia — menos que um café da Starbucks"*.

- **F9.4 — Sem plano grátis visível.** Você tem `PLAN_LECTURE_LIMIT.free = 3` no código ([src/lib/stripe.ts:51](../../src/lib/stripe.ts#L51)) mas a pricing da landing pode não mostrar. Estudante BR é price-sensitive: **freemium claro** ("3 aulas grátis pra sempre, depois R$39/mês") puxa muito mais signup.

---

## 10. FAQ ([page.tsx:391](../../src/app/page.tsx#L391))

Componente `<FaqSection />` referenciado.

### Furos genéricos prováveis
- Confere que tem essas 6 perguntas (são as que estudante BR pesquisa antes de pagar):
  1. **"Funciona no celular?"** (sim/não direto)
  2. **"Posso cancelar quando quiser?"** (sim, sem multa)
  3. **"Vocês têm acesso à minha aula?"** (privacy — vende muito pra ICP med/dir)
  4. **"Funciona com qualquer professor/sotaque/disciplina?"**
  5. **"Posso usar pra estudar pro vestibular/concurso?"** (puxa nicho secundário gigante)
  6. **"Como cancelo?"** (transparência aumenta conversão)

---

## 11. CTA final ([page.tsx:394-441](../../src/app/page.tsx#L394-L441))

### O que tá bom
- "Sua próxima aula já podia estar resumida." é forte.
- "30 segundos pra criar conta. Sem cartão. Sem download. Sem letra miúda."
- Bullets de garantia.

### Furos
- **F11.1 — Sem urgência.** "Próximas 100 vagas com 30% off no anual" OU "Promo de início de semestre · termina em 7d". Estudante BR responde forte a desconto temporal.

- **F11.2 — Sem rota pra "ver antes de assinar".** Adicionar link discreto "Ver tour de 2min sem criar conta →" abrindo modal com vídeo Loom/Veo.

---

## 12. Footer ([page.tsx:443-501](../../src/app/page.tsx#L443-L501))

### Furos
- **F12.1 — Falta link "Programa de embaixadores"** (depois que implementarmos).
- **F12.2 — Falta link "Blog" pra SEO.** Mesmo se vazio agora, registra rota `/blog`.
- **F12.3 — Falta CNPJ/razão social.** Estudante de direito repara. Compliance + credibilidade.
- **F12.4 — Falta link pras redes sociais.** Hoje só email. Adicionar Instagram + TikTok (mesmo que vazios — pré-criar pra defender handle).

---

## 13. Performance & SEO (não inspecionado em deep, mas alertas)

- **F13.1 — Landing é `"use client"` inteira** ([page.tsx:1](../../src/app/page.tsx#L1)). Isso prejudica SEO (Google indexa, mas Bing/Yandex/AI crawlers se confundem) e LCP (Largest Contentful Paint). **Recomendação:** dividir em RSC (Server Component) por padrão + ilhas de interatividade só onde precisa (Magnetic, LiveDemo, ProductsTabs).

- **F13.2 — Sem `<meta>` SEO inspecionado aqui.** Confere `app/layout.tsx` ou `app/page.tsx` tem:
  - `<title>` específico ("Lumio — Transcreva aulas com IA em tempo real | App pra universitários BR")
  - `<meta description>` com keywords (transcrever aula, resumo IA, faculdade)
  - OpenGraph completo (imagem 1200×630 com Lumi + headline)
  - Twitter Card
  - `<link rel="canonical">`

- **F13.3 — Sem dados estruturados (JSON-LD).** Adicionar `Schema.org` SoftwareApplication com rating + price + features. Google mostra preview rico = +30% CTR.

- **F13.4 — Sem `robots.txt` ou `sitemap.xml` confirmados.** Confere `/public/robots.txt` e `/public/sitemap.xml`.

---

## 14. Mobile (não inspecionado em deep aqui)

- **F14.1 — Hero usa `grid-cols-1 lg:grid-cols-[1.05fr_1fr]`** ([page.tsx:77](../../src/app/page.tsx#L77)). No mobile, `LumiCharacter` no canto vai pra cima do `LiveDemo`. Conferir que ordem mobile é: H1 → CTA → demo (deixar Lumi flutuando como acessório opcional).

- **F14.2 — `LumiCharacter` no hero tem `hidden md:block`** — bom, esconde no mobile. Mas confere que stats e marquee ficam legíveis em 360px width.

---

## 15. Tracking & Conversion

- **F15.1 — Não há indício de Meta Pixel, Google Analytics 4, ou GTM no `layout.tsx`.** Sem isso, **não dá pra rodar tráfego pago.** Prioritário antes de ligar qualquer ad. Setup mínimo:
  - GA4 com `gtag` em `<head>`
  - Meta Pixel + Conversion API server-side
  - Eventos: `signup_start`, `signup_complete`, `checkout_start`, `checkout_complete`, `lead_captured`
  - Bonus: Hotjar ou PostHog pra session replay

- **F15.2 — Sem evento de `CompleteRegistration` no signup-password route** ([src/app/api/auth/signup-password/route.ts](../../src/app/api/auth/signup-password/route.ts)). Precisa disparar server-side pro Meta CAPI.

---

## 16. Acessibilidade (alertas rápidos)

- **F16.1 — Avatars sem `aria-label`.** Decorativos mas screen reader vai ler "A B C D".
- **F16.2 — `LumiCharacter` provavelmente é imagem sem alt descritivo.**
- **F16.3 — Confere contraste do `text-muted-foreground` no dark mode.** WCAG AA exige 4.5:1.

---

## 17. Privacidade (oportunidade de venda)

Memory diz: "landing NÃO menciona Mandic, T11, professores específicos (scrubbed em 2026-05-24)". Ótimo do ponto de vista privacy/compliance. **Mas há oportunidade:** adicionar uma seção dedicada "**Sua aula é sua.**" com:
- "Áudio nunca sai do seu navegador" (zero upload — diferencial vs Otter, Fireflies)
- "LGPD compliant"
- "Você pode apagar tudo a qualquer momento"
- Link pra `/privacy`

ICP de medicina/direito **paga premium por privacy**.

---

## Roadmap de fixes (priorizado)

### Sprint 1 (essa semana — antes de qualquer ad)
1. **F15.1** — Instalar GA4 + Meta Pixel + GTM
2. **F1.2** — Trocar avatars placeholder (foto real ou esconder)
3. **F4.1 + F4.2** — Auditar testimonials, remover/substituir os fake
4. **F1.3** — Gravar screencast 15s do produto real e substituir LiveDemo
5. **F13.2** — Meta tags SEO completas + OpenGraph
6. **F9.1** — Banner "14 dias grátis sem cartão" antes do pricing

### Sprint 2 (próximas 2 semanas)
7. **F9.4** — Plano gratuito 3 aulas/mês na landing
8. **F11.1** — Urgência ("promo de início de semestre")
9. **F1.5** — CTA secundário "Ver tour 2min"
10. **F12.x** — Footer: blog, social, CNPJ
11. **F13.3** — JSON-LD SoftwareApplication
12. **F2.1** — LogosRow: ou logos reais ou remove
13. **F17** — Seção "Sua aula é sua" (privacy)

### Sprint 3 (mês 2)
14. **F8.1** — Before/After variável por nicho
15. **F13.1** — Refatorar landing pra RSC (perf + SEO)
16. **F6.2** — Página `/lumi-personagem` (SEO + brand)
17. **F16.x** — Acessibilidade

---

## Métricas pra acompanhar pós-fix

| Métrica | Baseline (estimado) | Meta 30d |
|---|---|---|
| Visitor → Signup | 2% | 4% |
| Signup → Plano pago | 3% | 6% |
| Bounce rate hero | 60%+ | <45% |
| Tempo médio na landing | 30-45s | 90s+ |
| Scroll depth média | <40% | >65% |
| LCP (Lighthouse) | desconhecido | <2.5s |
| SEO score (Lighthouse) | desconhecido | >95 |

Instalar **PostHog ou Hotjar** pra ver scroll depth + heatmap antes de gastar com ads.
