# Plano Visual Completo · Lumio Marketing

> Master doc com **todos os assets visuais** necessários nas próximas 12 semanas,
> **prompts prontos pra Replit**, plano de storage e cronograma de execução
> integrado com o plano de marketing.
>
> Versão 1 · 2026-05-26

---

## 0. Brand kit (referência pra TODOS os prompts)

**Cole no início de qualquer prompt do Replit:**

```
Brand: Lumio (SaaS de transcrição de aulas com IA, pt-BR, universitários BR)
Mascote: Lumi (luminária 3D bege/dourada com olho violet e sorriso, sentada em
pilha de livros — usar PNGs em /public/illustrations/ como referência)

Paleta:
- Lavender base: #F6F0FF, #EDE3FF (claro), #DCC8F8 (médio)
- Violet acento: #6D3FE3, #7C42E8 (forte), #4C1FA8 (escuro)
- Texto: #1E1338 (deep navy violet), #3D2D5C (suave)
- Dourado accent: #FFD05C (highlight, palavras-chave)
- Card escuro: #231C42 / #1E1338 (deep purple)
- Branco: #FCFAFF (paper)

Tipografia:
- Display + body: Outfit (Google Fonts, weights 300-900, geometric sans variable)
- Acento itálico: Instrument Serif italic
- Mono (código/labels): Geist Mono
- Hierarquia: weight 700-900 em headlines + leading apertado + letter-spacing -0.04em
- Google Fonts import: @import url("https://fonts.googleapis.com/css2?family=Outfit:wght@300..900&family=Instrument+Serif:ital@0;1&display=swap");

Padrão visual:
- Background lavender com dot grid sutil (radial dot 1.2px, gap 32px, opacity 0.5)
- Mascote 3D Lumi sempre presente em posts
- Última palavra da frase em violet com ponto final (ex: "chegou.", "aula.")
- Sparkles ✦ decorativos espalhados (violet ou dourado)
- Cards: branco com sombra OR deep purple com glow violet
- Footer LUMIOAPP.NET pequeno, uppercase, letter-spacing 0.08em

Vibe: amigável, kawaii-leaning, profissional mas não corporativo
Anti-patterns: hard violet flat, iPhone mockups frios, stock photos, glassmorphism
```

---

## 1. Inventário de assets — 9 categorias

| # | Categoria | Quantidade | Dimensão | Urgência |
|---|---|---|---|---|
| A | Brand kit base | 4 | varia | 🔴 Sprint 1 |
| B | Instagram lançamento | 9 | 1080×1080 | 🔴 Sprint 1 |
| C | Stories de aquecimento | 21 (7d) | 1080×1920 | 🔴 Sprint 1 |
| D | Highlights covers | 3 | 1080×1920 | 🟡 Sprint 1 |
| E | Embaixador kit | 6 | varia | 🟡 Sprint 1 |
| F | Conteúdo ongoing (4 sem) | 16 | 1080×1080 | 🟡 Sprint 1 |
| G | Ads pagos | 18 | varia | 🟢 Sprint 2 |
| H | Blog/landing visuals | 15 | varia | 🟢 contínuo |
| I | Vídeo (Reels/TikTok) | 6 | 1080×1920 mp4 | 🟢 Sprint 2 |

**Total visuais (PNG/JPG)**: ~92 peças
**Total vídeos**: 6
**Storage estimado**: ~250 MB

---

## A. Brand kit base (4 peças)

### A1. Foto de perfil — Lumi avatar

**Dimensão**: 1080×1080 (mas exporta também 320×320)
**Formato**: PNG transparente OU PNG com fundo violet sólido

**Prompt Replit**:
```
Square avatar 1080x1080 for Instagram/Twitter/LinkedIn profile picture of brand "Lumio".

Center: the Lumi mascot (cute 3D rendered desk lamp with violet glow face,
two big purple eyes, smiling), shoulders-up framing, looking directly at camera.

Background: solid violet (#6D3FE3) OR transparent (provide both versions).

No text. No wordmark. Just the mascot, perfectly centered with 80px padding
on all sides. High render quality, soft drop shadow underneath. Pixar/Disney
3D style, glossy/matte mix on the lamp body.
```

### A2. Wordmark logo horizontal

**Dimensão**: 600×200, exportar SVG e PNG transparente
**Uso**: emails, headers, footer de docs

**Prompt Replit**:
```
Horizontal wordmark logo for "Lumio" brand.

Layout: small Lumi mascot (3D lamp character) on the left, the word "Lumio"
on the right in Outfit bold weight, font-size 72px, color #1E1338.

Lumi mascot size: 140px tall.
Total canvas: 600x200px with 30px padding on all sides.
Background: transparent.

Variations needed:
- Dark text on light background
- Light text (#FCFAFF) on transparent (for use on dark backgrounds)
```

### A3. Twitter/X header (1500×500)

**Prompt Replit**:
```
Twitter header banner 1500x500px for "Lumio".

Background: lavender gradient (#F6F0FF top-left, #DCC8F8 bottom-right) with
subtle dot grid pattern (1.2px violet dots, 32px gap, 0.5 opacity).

Layout:
- Left half: bold Outfit headline "Estude menos. Entenda mais."
  font-size 72px, color #1E1338, with "mais." in violet (#6D3FE3).
- Below: small subtitle "Transcrição em pt-BR + resumo + flashcards" 24px
  #3D2D5C.
- Right half: Lumi mascot sitting on stack of books (use lumi-studying.png
  style), rotated -3deg, drop shadow.

Sparkles ✦ scattered in the background. Lumio wordmark bottom-right corner.
```

### A4. LinkedIn cover (1584×396)

**Prompt Replit**:
```
LinkedIn personal/page cover 1584x396px for "Lumio".

Same brand identity (lavender, violet accent, Outfit). Layout:

Left: headline "A IA que entende sua aula em português." 56px, #1E1338,
"português." in violet.
Center-right: Lumi mascot lumi-reading-pdf style, 280px tall, rotated 2deg.
Right: small chip "lumioapp.net" + "✦ Feito no Brasil".

Background lavender gradient with dot grid. Sparkles around mascot.
```

---

## B. Instagram lançamento — 9 posts (1080×1080)

Já temos copy + concept definidos. Cada prompt abaixo segue o **mesmo padrão**: cole o brand kit (seção 0) no topo + o briefing específico.

### B1. Hero — "Seu novo parceiro chegou"
```
Square Instagram post 1080x1080. Apply Lumio brand kit.

Top-left: chip "✦ Lumio · disponível agora"
Headline (Outfit 120px, line-height 0.96, letter-spacing -0.04em):
  "Seu novo
   parceiro de
   estudos
   chegou."
With "chegou." in violet #6D3FE3.

Subtitle 28px below: "Transforma aulas, áudios e PDFs em resumos, flashcards
e um calendário perfeito."

Bottom-right (occupying ~40% of canvas): Lumi mascot in studying pose
(use lumi-studying.png), rotated -3deg, with soft violet drop shadow.

Sparkles ✦ scattered: large near top-right of mascot, smaller mid-canvas
and bottom-left. Lavender bg + dot grid. Footer "LUMIOAPP.NET" bottom-left.
```

### B2. Resumo — "Resposta direta da sua aula"
```
1080x1080 IG post. Brand kit applied.

Chip: "✦ Pergunte. Aprenda."
Headline (110px): "Resposta direta\nda sua aula." with "aula." in violet.
Subtitle: "A IA escuta a gravação, lê o PDF e responde com base no SEU material."

Bottom-left: two feature cards stacked, deep purple (#231C42) gradient with
violet glow, each ~460px wide:
  Card 1: 🎙 icon | "Transcrição em pt-BR" / "Português brasileiro nativo"
  Card 2: ⚡ icon | "Resposta em ~3s" / "Pergunte sobre qualquer trecho"

Bottom-right: Lumi mascot lumi-reading-pdf style, 420px tall, rotated 3deg.

Sparkles around. Footer wordmark.
```

### B3. Flashcards — "Active recall de verdade"
```
1080x1080 IG post. Brand kit applied.

Chip: "✦ Flashcards"
Headline (116px): "Active recall\n[de verdade.]"
  → "de verdade." in Instrument Serif italic violet.

Subtitle: "Decks gerados a partir da SUA aula gravada. Estuda na lacuna
entre transporte e sala."

Tag pills row (5 pills): solid violet "Anatomia", outlined "Farmacologia",
"Patologia", "Bioquímica", "+ suas matérias".

Bottom-right: Lumi mascot lumi-studying.png, 440px tall, rotated -2deg.
Sparkles + dot grid + footer.
```

### B4. Quiz — "Quiz da sua aula. Sem decorar."
```
1080x1080 IG post. Brand kit applied.

Chip: "✦ Modo Prova"
Headline (100px): "Quiz da\nsua aula.\nSem decorar." with "Sem decorar." in violet.

Right side, behind text: Lumi mascot lumi-thinking.png with question mark,
380px tall, rotated 4deg.

Bottom: large white card (with violet shadow, rounded 28px) showing a
sample multiple-choice question:
  Label "PERGUNTA · ANATOMIA" (violet, uppercase, letter-spacing 0.15em)
  Question: "Qual nervo inerva o músculo deltoide?"
  Options in 2x2 grid:
    A. Nervo radial
    B. Nervo axilar ✓  (highlighted green correct)
    C. Nervo mediano
    D. Nervo ulnar

Sparkles + footer.
```

### B5. Comparação — "Feito no Brasil. Em pt-BR."
```
1080x1080 IG post. Brand kit applied.

Chip: "✦ Comparação direta"
Headline (92px): "Feito no Brasil.\nEm pt-BR." with "pt-BR." in violet.

Two cards side-by-side, ~460px each, 480px tall:
  Left card (white, subtle border):
    🇺🇸 Otter AI
    $20 / mês
    ✓ Transcreve áudio
    ✗ Sem resumo IA
    ✗ Sem flashcards
    ✗ Sem quiz
    ✗ Inglês primeiro

  Right card (deep purple #231C42, violet glow shadow, "FEITO NO BR" badge
  top-right in violet):
    🇧🇷 Lumio
    R$39 / mês  (price in gold #FFD05C)
    ✓ Transcreve em pt-BR
    ✓ Resumo estruturado
    ✓ Flashcards prontos
    ✓ Quiz das aulas
    ✓ Chat IA contextual

Bottom-right small: Lumi mascot lumi-celebrating.png, 200px, rotated 8deg.
Footer wordmark.
```

### B6. Antes/depois — "Copiar do quadro VS Olhar pro professor"
```
1080x1080 IG post. NO single brand bg — instead, split-screen:

LEFT HALF (540px wide):
  Background: warm cream gradient (#FDF7E4 → #F2E6BB)
  Label "ANTES" in pill top-left
  Heading 64px: "Copiar do quadro durante a aula." with "durante a aula." in
  Instrument Serif italic, opacity 0.7, color #5C4416
  Center: Lumi mascot lumi-confused.png with question marks, 280px
  Bottom quote 22px: "Você sai sem o conteúdo organizado e sem ter prestado
  atenção."

RIGHT HALF (540px wide):
  Background: deep violet gradient (#1E1338 → #4C1FA8) with violet radial glow
  Label "DEPOIS" in pill top-left
  Heading 64px: "Olhar pro professor.\nA IA cuida do resto." with "A IA cuida
  do resto." in gold #FFD05C
  Center: Lumi mascot lumi-celebrating.png arms-up, 280px
  Bottom quote 22px: "Transcrição, resumo, flashcards e quiz. Em pt-BR. Sem
  perder a aula."

LUMIOAPP.NET wordmark on the right side, bottom-right.
```

### B7. Demo voz — "Grave a aula. A IA cuida do resto."
```
1080x1080 IG post. Brand kit applied — but DARK variant (deep purple bg).

Chip: "✦ Modo de voz · novo" (dark version)
Headline (110px, white): "Grave a aula.\nA IA cuida do\nresto." with
"resto." in light violet #B49AFA.

Subtitle (white opacity 75%): "Gravação local, transcrição em pt-BR, resumo
+ flashcards + quiz automáticos."

Bottom-left: two feature cards (deep purple):
  Card 1: 🎙 | "Áudio nativo do navegador" / "Zero upload, zero plugin"
  Card 2: ⚡ | "Resumo em segundos" / "A aula vira material organizado"

Bottom-right: Lumi mascot lumi-recording.png (with microphone), 460px tall,
rotated 2deg. Behind it: large violet radial glow #7C42E8 blurred 40px.

Sparkles ✦ (gold + violet). Footer wordmark (light version).
```

### B8. CTA Coins — "50 coins de boas-vindas"
```
1080x1080 IG post. Brand kit applied.

Chip: "✦ Sem cartão · sem amarra"
Big headline (156px, line-height 0.9):
  "[50]
   coins de
   boas-vindas."
With "50" in gold #FFD05C, "boas-vindas." in violet #6D3FE3.

Below: check list 3 items, each with violet circle icon ✓:
  ✓ Cancele quando quiser
  ✓ Pagamento por uso, mais justo
  ✓ Português brasileiro nativo

Bottom-left: violet CTA button "Começar grátis →" (28px font, padding 22×36,
border-radius 999px, shadow violet glow).

Bottom-right: Lumi mascot lumi-coins.png (with treasure chest of violet coins),
460px tall, rotated -4deg.

Sparkles (gold + violet). Footer wordmark.
```

### B9. Slogan — "Estude menos. Entenda mais."
```
1080x1080 IG post. Brand kit. Centered composition.

Top center (320×320): Lumi mascot lumi-default.png sitting on books stack.

Below, huge headline centered (156px, line-height 0.92):
  "Estude menos.
   Entenda mais."
With "mais." in violet.

Below subtitle 30px centered, max-width 720px:
"Transcreva, pergunte, aprenda — em pt-BR, a partir das suas próprias aulas."

Sparkles scattered (4-5, gold + violet, varied sizes).
Footer wordmark centered bottom.
```

---

## C. Stories de aquecimento — 7 dias × 3/dia (1080×1920)

**Estratégia**: 1 story "feature reveal" + 1 story "social proof/UGC" + 1 story "CTA" por dia.

### Template base story (use pra TODOS os 21)
```
Vertical 1080x1920 Instagram Story. Apply Lumio brand kit.

Safe zone: top 250px and bottom 250px are RESERVED (IG UI). Content in middle 1420px.

Layout default (vary per story):
- Background: lavender gradient + dot grid
- Center-top: chip with category label
- Center: headline (large, 90-130px)
- Center-bottom: Lumi mascot (300-400px, varies per pose)
- Bottom safe: subtle CTA "→ deslize" or "lumioapp.net"

Animations: NONE — these are static PNGs (use as story stickers or just post).
```

### Conteúdo por dia (21 stories)

**Dia 1** (Lançamento)
- C1: "Bom dia, eu sou o Lumi 👋" (lumi-waving)
- C2: "O que eu faço com a sua aula?" (lumi-thinking)
- C3: "Spoiler: te devolvo tempo." (lumi-default + ⏱)

**Dia 2** (Feature transcrição)
- C4: "Aula de 2h vira texto em ~5 min" (lumi-recording)
- C5: "Em pt-BR. Sem inglês." (bandeira BR + texto)
- C6: "Testa agora? Link na bio." (CTA)

**Dia 3** (Feature resumo + flashcards)
- C7: "Resumo estruturado. Por seção." (lumi-reading-pdf)
- C8: "Active recall: flashcards prontos." (lumi-studying)
- C9: "Você só revisa. Eu organizo." (lumi-default)

**Dia 4** (Feature quiz)
- C10: "Pra prova: quiz da SUA aula." (lumi-thinking)
- C11: "Sem decoreba. Com lacuna mental." (texto + ✦)
- C12: "Funciona. Vem ver." (CTA + lumi-waving)

**Dia 5** (Social/preço)
- C13: "$20 (Otter) vs R$39 (Lumio). Conta." (texto)
- C14: "Estudante BR cabe nesse preço." (lumi-celebrating)
- C15: "50 coins grátis. Sem cartão." (lumi-coins)

**Dia 6** (Behind the scenes)
- C16: "Quem é o time do Lumio? A gente." (texto sem rosto)
- C17: "Feito no Brasil pra estudante BR." (bandeira + lumi)
- C18: "Pergunta no DM, a gente responde." (CTA)

**Dia 7** (Convite embaixador)
- C19: "Tá testando o Lumio? Vira embaixador." (lumi-celebrating)
- C20: "Pro grátis 6 meses + R$50 por amigo." (texto)
- C21: "DM 'EMBAIXADOR' que eu te conto." (CTA)

**Prompt template pra cada story** (substitua [bracketed]):
```
Vertical Instagram Story 1080x1920. Apply Lumio brand kit (lavender bg, dot
grid, violet accent, Outfit, Lumi mascot).

Safe zone: middle 1420px (top 250px and bottom 250px reserved).

Chip top-center: "[CATEGORY LABEL]"
Headline (90-110px, center-aligned, line-height 0.95):
"[STORY TEXT WITH LAST WORD/PHRASE IN VIOLET]"

Mascot below headline (~350px): [MASCOT POSE - e.g., lumi-recording]

Optional bottom CTA: "→ lumioapp.net" or "DM pra saber mais"

Sparkles ✦ scattered. Footer "LUMIOAPP.NET" tiny at bottom.
```

---

## D. Highlights covers — 3 peças (1080×1920)

Capa pra cada highlight permanente do perfil IG.

### D1. "Como funciona"
```
Vertical 1080x1920 (only visible area: center 1080x1080 squared).
Brand kit applied.

Center: Lumi mascot lumi-reading-pdf, 500px tall.
Below: bold word "Como\nfunciona" 100px, violet accent on "funciona."
Top: small chip "01 · INTRO"
Sparkles. Tiny LUMIOAPP.NET footer.
```

### D2. "Preço"
```
Same template. Center mascot: lumi-coins.
Bold word "Preço" 130px with violet ".". Top chip "02 · PLANOS".
Tiny "a partir de R$39/mês" beneath.
```

### D3. "Quem usa"
```
Same template. Center mascot: lumi-celebrating.
Bold word "Quem usa" 110px, violet "usa.". Top chip "03 · COMUNIDADE".
Will fill with embaixadores/depoimentos over time.
```

---

## E. Embaixador kit — 6 peças

Material pra cada embaixador postar.

### E1-E3: 3 templates de story pra embaixador (1080×1920)

```
Vertical Instagram story template 1080x1920 for an ambassador to post.

Brand kit applied (lavender, violet, Lumi mascot). MUST include space for:
- Top: ambassador's @handle / name overlay (leave blank ~200px high)
- Bottom: ambassador's referral link "lumioapp.net/?ref=LUMI-XXXX"

Story 1 — "Eu uso pra estudar":
  Headline center: "Eu uso pra\nestudar [matéria]." with last word in violet
  Mascot: lumi-studying, 400px
  CTA: "Testa com meu link ↓"

Story 2 — "Olha o que faz com aula":
  Headline: "Olha o que ele faz\ncom a minha aula." with "aula." in violet
  Mascot: lumi-recording, 400px
  CTA: "Link nos stickers ↓"

Story 3 — "Flashcards em 12s":
  Headline: "Flashcards prontos\nem 12 segundos." with "12 segundos." in violet
  Mascot: lumi-studying with cards floating, 400px
  CTA: "Testa grátis ↓"
```

### E4. Carrossel "Como funciona Lumio" — 6 slides (1080×1080 cada)

```
6-slide carousel for Instagram. Brand kit applied. Each slide 1080x1080.

Slide 1 — Capa:
  Big headline: "Como funciona o Lumio?" with "?" in violet
  Subtitle: "→ deslize"
  Mascot lumi-waving, 380px
  Sparkles

Slide 2:
  "Você grava a aula." 110px, "a aula." in violet
  Mascot lumi-recording (mic visible), 480px

Slide 3:
  "A IA transcreve em pt-BR." with "pt-BR." in violet
  Mascot lumi-default + texto fluindo

Slide 4:
  "Resumo, flashcards e quiz\nprontos em minutos."
  with "em minutos." in violet
  Mascot lumi-reading-pdf

Slide 5:
  "Você só revisa.\nE entende mais."
  with "entende mais." in violet
  Mascot lumi-studying

Slide 6 — CTA:
  "Grátis pra começar.\n50 coins de boas-vindas."
  with "boas-vindas." in violet
  Mascot lumi-coins
  Big CTA button "Começar grátis → lumioapp.net"
```

### E5. Vídeo template TikTok 30s (1080×1920 mp4) — fora do Replit

Esse precisa editor de vídeo (CapCut/Premiere). Roteiro:

```
0-2s: Lumi mascot waving (lumi-waving animado) + texto "Esse é o Lumi 👋"
2-5s: Lumi recording + voz: "Você grava sua aula..."
5-12s: Tela do app /lumi mostrando transcrição rolando em tempo real
12-20s: Lumi reading-pdf + tela mostrando resumo gerado + "...e ele organiza tudo"
20-26s: Cards flashcards + quiz aparecendo + voz: "Resumo, flashcards, quiz."
26-30s: CTA full-screen "lumioapp.net · 50 coins grátis"
```

Pegar voz: ElevenLabs voz "Will" (já configurado).

### E6. Card "Sou embaixador Lumio" (1080×1080)

```
Square IG post template for ambassador to post once they accept.

Brand kit. Center large badge/medallion design:
  "✦ EMBAIXADOR" small uppercase
  "LUMIO" wordmark huge
  Below: "Meu código: LUMI-XXXX" (placeholder)
  Lumi mascot lumi-celebrating around the badge

Subtitle below: "Estuda usando meu link → lumioapp.net/?ref=LUMI-XXXX"

Background: deep violet gradient with gold sparkles.
```

---

## F. Conteúdo ongoing — 16 posts (1080×1080)

4 semanas × 4 posts/semana (mix de educacional, dica, social, behind-the-scenes).

### Tipos de post (template por tipo)

**F-Tipo 1: Dica de estudo** (educacional, "Save")
```
Format: hand-drawn-feel infographic style.
Headline: "3 técnicas que vão mudar como você estuda."
3 cards/list:
  ✓ Revisão Espaçada
  ✓ Active Recall
  ✓ Pomodoro
Mascot: lumi-studying
CTA bottom: "Salva esse post pra revisar."
```

**F-Tipo 2: Feature spotlight** (produto)
```
Headline: "Você sabia que o Lumio faz [X]?"
Where X varies: "mapa mental", "highlight em PDF", "calendário automático", etc.
Mascot varies per feature.
Mid: screenshot or icon of the feature.
CTA: "Testa em lumioapp.net"
```

**F-Tipo 3: Quote/Mantra** (motivacional)
```
Big serif italic centered text:
"Você não precisa estudar mais.
Você precisa estudar melhor."
"melhor." in violet.
Small mascot lumi-default bottom corner.
Sparkles ✦ around.
```

**F-Tipo 4: Behind/Roadmap** (transparência)
```
Headline: "O que tá vindo no Lumio?"
List of 3-4 features cooking. Card layout. Light "in dev" badge per item.
Mascot: lumi-generating ("trabalhando").
CTA: "Pede feature no DM."
```

### Calendário 4 semanas (rotação)

| Semana | Seg | Qua | Sex | Dom |
|---|---|---|---|---|
| 1 | Tipo 1 | Tipo 2 | Tipo 3 | Tipo 4 |
| 2 | Tipo 1 | Tipo 2 | Tipo 3 | Tipo 4 |
| 3 | Tipo 1 | Tipo 2 | Tipo 3 | Tipo 4 |
| 4 | Tipo 1 | Tipo 2 | Tipo 3 | Tipo 4 |

Total: 16 posts. Cada um precisa 1 prompt customizado mas baseado no tipo.

---

## G. Ads pagos — 18 peças (Sprint 2)

### G1-G6: Meta Feed (1080×1080)

Variantes A/B com mesmo conceito. Cada criativo precisa:
- Heading 1 (até 27 chars): "Estude menos. Entenda mais."
- Heading 2: "Aula → resumo + flashcards"
- CTA: "Saiba mais"

```
6 square ad creatives 1080x1080 for Meta Feed. Brand kit applied.

Variant A — "Hook problema":
  "Você grava aula. E depois?"
  Mascot lumi-confused.
  CTA "Lumio resolve →"

Variant B — "Hook benefício":
  "Sua aula → resumo + flashcards."
  Mascot lumi-reading-pdf with arrow flow.

Variant C — "Hook social proof":
  "+500 estudantes BR já usam." (atualizar quando tiver)
  Mascot lumi-celebrating

Variant D — "Hook preço":
  "R$39/mês. Cancela qualquer hora."
  Mascot lumi-coins

Variant E — "Hook produto":
  Side-by-side mockup: gravação | resumo | flashcards
  Mascot lumi-default mid

Variant F — "Hook FOMO":
  "50 coins grátis pros primeiros 1000."
  Mascot lumi-recording with countdown
```

### G7-G12: Meta Stories/Reels (1080×1920)

Mesmas variantes A-F mas adaptadas pra vertical. Safe zone topo/bottom.

### G13-G15: Google Display banners

```
G13. Leaderboard 728x90:
  Lumi mascot left (60px) | "Estude menos. Entenda mais." | Violet CTA "Testar grátis"

G14. Medium rectangle 300x250:
  Top: mascot 100px | "A IA que entende sua aula em pt-BR." | CTA button

G15. Mobile banner 320x50:
  Mascot 40px | "Lumio · 50 coins grátis →"
```

### G16-G18: 3 vídeos curtos 15s

Não Replit — precisa editor (CapCut). Mas Replit pode gerar **frames-chave** que servem de storyboard.

---

## H. Blog e landing — 15 visuais

### H1-H10: Featured image por blog post (1200×630)

Pra cada um dos 10 blog posts existentes em `src/content/blog/`. Cada um precisa Open Graph image:

```
1200x630 Open Graph image for blog post titled "[POST TITLE]".

Brand kit applied. Layout:
- Left 60%: bold headline 64px "[TITLE]" with relevant keyword in violet
- Right 40%: Lumi mascot in relevant pose (varies per topic)
- Bottom-left chip: "Blog · Lumio"
- Bottom-right: "lumioapp.net/blog"
Lavender bg + dot grid + sparkles.
```

Mapeamento mascot por post:
| Post | Mascot |
|---|---|
| como-transcrever-aula-da-faculdade | lumi-recording |
| otter-ai-portugues-alternativas | lumi-celebrating (BR vs US) |
| como-estudar-medicina-com-ia | lumi-studying |
| flashcards-srs-medicina | lumi-studying |
| como-fazer-resumo-aula-rapido | lumi-reading-pdf |
| ia-para-estudar-direito | lumi-thinking |
| transcricao-portugues-brasileiro-ia | lumi-recording |
| como-usar-anki-com-ia | lumi-default |
| active-recall-para-faculdade | lumi-studying |
| como-organizar-aulas-online | scene-calendar |

### H11-H15: Landings persona — hero image (1080×1080 ou 1440×900)

5 landings já existem (`/para-medicina`, `/para-direito`, `/para-administracao`, `/para-engenharia`, `/para-psicologia`).

Cada uma precisa hero illustration:
```
Hero illustration for landing /para-[PERSONA].
1440x900 wide.

Brand kit applied. Layout:
- Center-right: Lumi mascot 500px in relevant pose for the persona:
  - medicina: lumi-studying com livro de anatomia
  - direito: lumi-reading-pdf (PDF tipo "Código Civil")
  - administracao: scene-calendar (planejando)
  - engenharia: lumi-thinking com ferramentas/régua
  - psicologia: lumi-default em poltrona

- Floating cards around mascot showing persona-specific UI snippets:
  - medicina: card "Suprarrenais T11" + "12 flashcards gerados"
  - direito: card "Direito Civil" + "Lei 13.105 art. 5º"
  - administracao: card "Microeconomia" + "Gráfico oferta/demanda"
  - engenharia: card "Cálculo III" + equação latex
  - psicologia: card "Psicopatologia" + "DSM-5"

Subtle violet glow around mascot. Sparkles scattered. Bg lavender gradient.
```

---

## I. Vídeos — 6 peças (1080×1920 mp4)

Não geráveis via Replit puro — precisa editor. Mas Replit pode gerar **mockups/storyboards** estáticos.

### I1. Hero video 15s — "Lumio em 15 segundos"
### I2. Demo gravação 30s — "Como gravar uma aula"
### I3. Demo flashcards 20s — "Flashcards em 12 segundos"
### I4. Testemunho mockup 20s — "Como Lumio mudou meus estudos"
### I5. FOMO 10s — "50 coins grátis"
### I6. Educacional 60s — "3 técnicas + Lumio"

Pra cada vídeo, peça ao Replit:
```
Generate a 6-frame storyboard (each frame 1080x1920, sequence) for a 15-30s
TikTok/Reel video titled "[VIDEO TITLE]". Brand kit applied.

Frame 1: hook (mascote + headline gancho)
Frame 2: problema (lumi-confused)
Frame 3: solução intro (lumi-recording ou similar)
Frame 4: como funciona (UI screenshot mockup)
Frame 5: resultado (lumi-celebrating)
Frame 6: CTA (lumioapp.net + 50 coins)

Each frame has consistent brand identity. Provide them as a numbered sequence.
```

---

## 2. Storage plan

### 2.1 Estrutura de pastas

Criar dentro do projeto Lumio:

```
public/marketing-assets/
├── brand/                    # A1-A4 brand kit
│   ├── avatar-square.png
│   ├── wordmark-horiz.svg
│   ├── twitter-header.png
│   └── linkedin-cover.png
├── ig-launch/                # B1-B9 9 posts iniciais
│   ├── 01_hero.png
│   ├── ...
│   └── 09_slogan.png
├── ig-stories/               # C1-C21 stories
│   ├── day-1/
│   ├── day-2/
│   └── ...
├── ig-highlights/            # D1-D3
│   ├── como-funciona.png
│   ├── preco.png
│   └── quem-usa.png
├── ambassador-kit/           # E1-E6
│   ├── story-template-1.png
│   ├── carousel/
│   ├── tiktok-storyboard/
│   └── badge-embaixador.png
├── ig-ongoing/               # F (atualizado semanal)
│   └── 2026-W22/
├── ads/                      # G (sprint 2)
│   ├── meta-feed/
│   ├── meta-stories/
│   ├── google-display/
│   └── videos/
├── blog-og/                  # H1-H10
│   └── [slug].png
├── landings-hero/            # H11-H15
│   └── para-[persona]-hero.png
└── videos/                   # I1-I6 + frames
    └── storyboards/
```

### 2.2 Tamanho estimado

| Categoria | Qtd | Avg/peça | Total |
|---|---|---|---|
| A. Brand kit | 4 | 1 MB | 4 MB |
| B. IG launch posts | 9 | 1.5 MB | 14 MB |
| C. Stories | 21 | 1 MB | 21 MB |
| D. Highlights | 3 | 0.8 MB | 2 MB |
| E. Ambassador kit | 6+ | 1 MB | 10 MB |
| F. Ongoing (4 sem) | 16 | 1.5 MB | 24 MB |
| G. Ads | 18 | 1.5 MB | 27 MB |
| H. Blog/landing | 15 | 0.6 MB | 9 MB |
| I. Vídeos (mp4 15-30s) | 6 | 10 MB | 60 MB |
| Storyboards (PNG) | 36 | 1 MB | 36 MB |
| **TOTAL** | | | **~207 MB** |

### 2.3 Onde hospedar?

**Recomendação**:
- **Local** (`/public/marketing-assets/`): tudo que sirva pro app/landing/blog (brand, OG images, hero landings). Vercel CDN serve grátis.
- **Supabase Storage** (bucket público `marketing-assets`): assets só pra distribuição externa (IG posts, ambassador kit, ads). Não polui repo.
- **Cloudinary/ImageKit** (opcional): se quiser variações on-the-fly (resize, optimize).

**Setup Supabase bucket** (executar via Supabase CLI):
```bash
supabase storage create-bucket marketing-assets --public
# Upload via API ou dashboard
```

Limite Supabase Free: 1 GB storage + 5 GB bandwidth/mês — sobra muito.

---

## 3. Plano de marketing integrado (12 semanas)

### Semana 1-2: Setup orgânico + ativação

| Sprint | Ações | Assets necessários |
|---|---|---|
| **W1** | Criar IG @lumioapp + bio + foto perfil. Postar B1-B4 (2/dia). Stories C1-C9. Engagement orgânico 30 min/dia. | A1, A2, B1-B4, C1-C9 |
| **W2** | Postar B5-B9. Stories C10-C21. Highlights D1-D3. Atingir 50 seguidores. | B5-B9, C10-C21, D1-D3 |

### Semana 3-4: Embaixadores (Sprint 1 continua)

| Sprint | Ações | Assets necessários |
|---|---|---|
| **W3** | Pesquisar 20 candidatos via hashtags. Mandar 5 DMs/dia. Ative E1-E6. | E1-E6, F-W1 posts |
| **W4** | Onboard 8-15 embaixadores. Mandar kits. Track métricas. | F-W2 posts, vídeo I1 |

### Semana 5-8: Conteúdo + paid ads

| Sprint | Ações | Assets necessários |
|---|---|---|
| **W5** | Lançar primeira campanha Meta (verba R$30/dia). | G1-G6 Meta Feed + G7-G12 Stories |
| **W6** | Otimizar criativos vencedores. Subir verba pra R$60/dia. | Variações dos G1-G12 |
| **W7** | Lançar Google Display + Search. | G13-G15 + ads search |
| **W8** | Avaliar funil completo: ad → landing → signup → paid. | H11-H15 hero landings refinados |

### Semana 9-12: Escala + SEO

| Sprint | Ações | Assets necessários |
|---|---|---|
| **W9-12** | Conteúdo ongoing F (semanal). Blog OG H1-H10. Vídeos I1-I6 lançados. Verba ads escala. | F semanal, H, I completos |

---

## 4. KPIs por sprint

### Sprint 1 (W1-W4)
- Seguidores IG: 0 → 200
- Embaixadores ativos: 0 → 12
- Signups via ref: 0 → 40
- Pagantes via ref: 0 → 5

### Sprint 2 (W5-W8)
- CAC paid: < R$40
- ROAS: > 1.5x
- Signups paid: 100/semana
- Conversão landing: > 8%

### Sprint 3 (W9-W12)
- MRR: R$2-5k
- LTV/CAC: > 2x
- Tráfego SEO: 1000+/mês
- Vídeos: 50k+ views totais

---

## 5. Como usar este doc com o Replit

### Workflow recomendado

1. **Antes de cada sessão Replit**: cole o bloco "Brand kit" da seção 0
2. **Por asset**: cole o prompt específico (seção A-I) + brand kit
3. **Iteração**: se sair errado, refine com:
   - "Mais sparkles dourados"
   - "Mascote menor, headline maior"
   - "Background mais escuro" / "mais claro"
4. **Quando aprovar**: salva PNG no `/public/marketing-assets/[cat]/`
5. **Commit**: git add + commit por categoria (não 1-a-1)

### Não esquecer

- Variáveis: mascote tem 11 poses, **rotacionar** pra não cansar feed
- Última palavra/frase em violet com ponto final — **regra de ouro**
- Sparkles ✦ — sempre 2-4 espalhados, mix gold + violet
- Footer LUMIOAPP.NET — sempre presente, sutil
- Anonimato founder — nada deve mencionar pessoa, sempre "time Lumio"

---

## 6. Próximos passos imediatos

1. ✅ Conta IG @lumioapp criada (manual)
2. ⏳ Gerar A1-A4 brand kit no Replit
3. ⏳ Gerar B1-B9 9 posts IG no Replit
4. ⏳ Subir tudo pro storage organizado
5. ⏳ Postar conforme cronograma INSTAGRAM_LAUNCH.md
6. ⏳ Em paralelo, criar token Meta lumio-admin (System User Employee)
7. ⏳ Após 5 dias aquecimento: começar outbound DM embaixadores

---

*Versão 1 · 2026-05-26*
