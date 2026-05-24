# Sprint de Vendas — 30 dias para começar a vender o Lumio

> Plano de execução acionável. Founder solo, sem aparecer em vídeo. Stack pronta, Stripe LIVE, tracking instrumentado. Objetivo: 50 pagantes / MRR R$2.500 em 30 dias.

---

## 1. Pré-requisitos (HOJE, 30 minutos)

| Conta | Link direto | O que pegar | Onde colar |
|-------|-------------|-------------|------------|
| GA4 | https://analytics.google.com/ → Admin → Criar propriedade "Lumio" → Stream Web `lumioapp.net` | `Measurement ID` (G-XXXXXXX) | Vercel env `NEXT_PUBLIC_GA_MEASUREMENT_ID` |
| Meta Pixel | https://business.facebook.com/ → Events Manager → Conectar fontes de dados → Web → Pixel "Lumio" | `Pixel ID` (15 dígitos) | Vercel env `NEXT_PUBLIC_META_PIXEL_ID` |
| PostHog | https://us.posthog.com/signup → Projeto "Lumio" | `Project API Key` (phc_...) | Vercel env `NEXT_PUBLIC_POSTHOG_KEY` |
| TikTok Ads | https://ads.tiktok.com/ → criar conta BR → instalar Pixel | Pixel ID (deixar pronto p/ semana 2) | Adicionar depois |

**Próximo passo:** rodar `vercel env add` para cada uma, redeploy, validar disparo em `/admin/marketing`.

---

## 2. Semanas 1–2: Piloto pago (R$700)

### 2.1 Três conceitos de criativo (vídeo 30s gerado com Veo3/Sora/Runway)

Cada vídeo segue estrutura: **hook (3s) → demo (20s) → CTA (5s)**. Sem rosto humano — usar B-roll de estudante (mãos no notebook, caderno, café), tela do Lumio em zoom, mascote Lumi animado, voz Will (ElevenLabs) narrando.

**Conceito A — "O caderno que se escreve sozinho" (emocional)**

- Hook (0–3s): Close em caderno em branco. Voz Will: *"E se sua aula virasse resumo enquanto você só presta atenção?"*
- Demo (3–23s): Tela do celular gravando aula → texto aparecendo em tempo real → cards "Resumo", "Flashcards", "Mapa Mental" se abrindo → estudante (de costas) fechando o notebook satisfeito.
- CTA (23–30s): Logo Lumio + voz: *"Lumio. Sua aula, organizada. Grátis nos primeiros 3 dias."* + texto: **lumioapp.net**

**Conceito B — "POV: passei em medicina sem decorar" (storytelling/POV)**

- Hook (0–3s): Texto na tela "POV: 2º ano de medicina, prova amanhã, 4h de aula gravada". Música tensa.
- Demo (3–23s): Estudante (mão e perfil) joga áudio no Lumio → chat IA respondendo *"explica adrenal em 3 bullets"* → flashcards aparecendo → quiz acertando → relógio mostrando 22h em vez de 3h da manhã.
- CTA (23–30s): *"Lumio. IA que estuda com você."* + **lumioapp.net** + selo "feito no Brasil".

**Conceito C — "Lumio vs anotação manual" (comparação/racional)**

- Hook (0–3s): Split screen — esquerda "Anotação manual: 2h depois da aula", direita "Lumio: pronto antes da aula acabar".
- Demo (3–23s): Esquerda mostra caderno bagunçado, mão cansada. Direita mostra Lumi (mascote) gerando resumo, flashcards, mapa, quiz — quatro outputs simultâneos. Cronômetro: 0:00 → resumo, 0:15 → flashcards, 0:30 → quiz.
- CTA (23–30s): *"Pare de transcrever. Comece a entender. R$39/mês."* + **lumioapp.net**

**Produção:** gerar 3 takes de cada com Veo3 (~R$80 total), montar no CapCut, voz Will via ElevenLabs API com texto acima.

### 2.2 Distribuição (R$700 dividido)

| Canal | Budget | Targeting | Objetivo |
|-------|--------|-----------|----------|
| **Meta Ads** (IG/FB Reels) | R$420 (R$30/dia × 14d) | BR, 18–25, interesses: medicina, vestibular, ENEM, faculdade, USP/UFMG/Unifesp/UNESP, "Anki", "Quizlet" | Conversões → signup |
| **TikTok Ads** | R$175 (R$12,50/dia × 14d) | BR, 18–24, interesses: #medstudent, #direitobr, #engenhariacivil, #estudos | Tráfego → landing |
| **Google Search** | R$140 (R$10/dia × 14d) | Keywords: "transcrever aula", "resumo de aula IA", "app pra estudar com IA", "alternativa otter ai português", "transcrição aula faculdade" | Conversões |

### 2.3 Ad copy A/B

**Variação Emocional** — *"Você não precisa anotar tudo. O Lumio escuta a aula, transcreve e te explica depois. Como ter um amigo nerd 24h. Teste grátis 3 dias."*

**Variação Racional** — *"Transcrição ao vivo + resumo + flashcards + quiz + mapa mental. Tudo em 1 app. R$39/mês. Cancela quando quiser. lumioapp.net"*

**Próximo passo:** subir as 3 campanhas dia 1 com criativo A, dobrar variação vencedora no dia 4.

---

## 3. Semanas 1–2: Orgânico (paralelo, custo zero)

### 3.1 TikTok @lumioapp — 3 posts/semana

Hooks pra rodar (cada um vira 1 vídeo de 20–40s, voz Will + tela do app):

1. **POV:** *"POV: você descobriu que dá pra gravar a aula e a IA te explica depois"*
2. **Comparação:** *"Otter AI custa US$20. Lumio custa R$39 e fala português."*
3. **Storytelling:** *"Como passei em farmacologia sem ler um slide (não recomendo, mas funcionou)"*
4. **POV:** *"POV: seu professor fala em 1.5x e você ainda assim entende tudo depois"*
5. **Demo cru:** *"Joguei 3h de aula de anatomia no Lumio. Olha o que ele cuspiu."*
6. **Comparação:** *"Flashcard feito à mão: 2h. Flashcard feito pelo Lumio: 12 segundos."*

### 3.2 Instagram @lumioapp

- **Reels:** cross-post de tudo do TikTok (legendas adaptadas).
- **Stories diários:** bastidor do produto, prints de chat com Lumi, enquetes ("qual matéria você odeia?"), countdown pra novidade.
- **Carousel semanal:** "5 prompts pro Lumi que viram resumo perfeito", "Como usar Lumio na véspera da prova", etc.

### 3.3 Twitter/X — 1–2 threads/semana

Temas: "como IA muda o jeito de estudar em 2026", "stack que uso pra rodar Lumio sozinho" (build in public — gera autoridade), "comparativo IA pra estudante BR".

**Próximo passo:** bater 3 posts até sexta. Bio dos 3 canais com link `lumioapp.net?utm_source={canal}`.

---

## 4. Sobre "bot que comenta em posts" — NÃO recomendo

**Por quê:**
- Violação de TOS Instagram e TikTok (item 4.2 das community guidelines).
- ML de detecção pega ~80% dos bots em < 7 dias (padrões de timing, device fingerprint).
- Ban do @lumioapp = perde audiência orgânica que custou tempo a construir.
- Risk/reward não fecha: ROI negativo se contar ban + reconstrução.

**Alternativas legítimas com mais ROI:**

1. **Engajamento manual concentrado** — 1h/dia comentando manualmente em 30 posts de #medstudentbr, #direitobr, #engenhariabr. Você ou VA (R$1.500/mês via Workana/Trampos.co). Comentários *valor real* (não "lindo!", e sim "tenta o app X que faz isso") convertem 5–10x bot.
2. **Programa de embaixadores** — código já existe em `src/app/embaixador/` e `src/app/account/embaixador/`. Ativar quando bater 50 pagantes (semana 4–5). Recrutar 10 estudantes reais com 5k+ seguidores cada > 1000 bots.
3. **Reddit BR** — postar com valor real em `r/medicinabrasil`, `r/EstudanteDeMedicina`, `r/brasil`, `r/UFRJ`, `r/usp`. Regra: 90% valor, 10% menção. Funciona pra technical buyers.

**Próximo passo:** bloquear 1h/dia (10h–11h) pra engajamento manual semana 1.

---

## 5. Semanas 3–4: Iteração

### 5.1 Dashboards a abrir DIARIAMENTE (15min)

- `/admin/health` — uptime, erros, latência IA.
- `/admin/marketing` — signups, conversões, funil.
- Meta Ads Manager — CPM, CTR, CPA por criativo.
- GA4 → Acquisition → User acquisition por `source/medium`.
- PostHog → Funnels → "visitou landing → signup → upgrade pago".

### 5.2 Decision tree (decidir até dia 14)

| CAC observado | Ação |
|---------------|------|
| **< R$50** | DOBRAR budget no canal vencedor. Replicar criativo top em 2 variações. |
| **R$50–100** | MANTER budget, trocar criativo (testar conceito B/C se A ganhou). Otimizar landing (hero, preço). |
| **> R$100** | PARAR canal. Rever ICP (talvez 21–28 funciona melhor que 18–25). Voltar pra orgânico. |

### 5.3 LTV/CAC — fórmula simples

- **LTV** = (ticket médio mensal) × (meses médios de retenção) × margem. Lumio: R$59 × 8 × 0.85 ≈ **R$401**.
- **CAC alvo** = LTV / 3 = **R$133 teto**. Saudável < R$75.
- Se LTV/CAC < 3 → não escalar. Se > 5 → subinvestido, acelerar.

**Próximo passo:** planilha simples no dia 7 e dia 14 com esses 6 números.

---

## 6. Meses 2–3: Escala

- **Ativar embaixadores** — após 50 pagantes OU CAC validado < R$75. Recrutar 10 com comissão 20% recorrente (já no MVP em `/embaixador`).
- **Contratar editor de vídeo freelance** — R$1.500–2.500/mês, 8 vídeos/mês prontos pra TikTok/Reels. Liberar founder pra produto.
- **Contratar VA pra engajamento + DM** — R$1.500/mês, 4h/dia. Resposta < 5min nas DMs converte 3x mais.
- **Diversificar canais** — testar YouTube Shorts (mesma criativo TikTok), parcerias com cursinhos (Stoodi/Descomplica afiliado), Kwai (BR interior).
- **SEO long-tail** — publicar 2 posts/semana no `/blog` ("como estudar farmacologia com IA", "melhor app pra transcrever aula faculdade 2026").

---

## 7. Métricas de sucesso — 30 dias

| Métrica | Alvo |
|---------|------|
| **North star: pagantes ativos** | **50** |
| **MRR** | **R$2.500** |
| CTR ads (média ponderada) | > 1.5% |
| Conversão signup → paid | > 8% |
| CAC blended | < R$75 |
| LTV/CAC ratio | > 3 |
| Followers @lumioapp (IG+TikTok somados) | > 2.000 |
| Trial → paid (3 dias grátis) | > 25% |

**Revisão obrigatória:** dia 7, dia 14, dia 21, dia 30. Ajustar uma variável por vez — não tudo de uma vez.

---

**Última coisa:** comece hoje pelo bloco 1 (30min). Sem o tracking ativo, qualquer real gasto em ads é cego. Resto do plano só faz sentido com sinal medindo.
