# Lumio/Lumi — Modelo fiel de imagens para gerar posts via API

Arquivo-base para copiar e colar em chamadas de API de geração de imagem.
Objetivo: gerar posts consistentes com a identidade visual do Lumio/Lumi, sem erros de texto, sem personagem deformado e com composição pronta para redes sociais.

**Source of truth.** Brand anchor do código em `src/app/api/admin/marketing/content/generate-images/route.ts` deve refletir esse documento.

---

## 1. Identidade visual fixa

**Marca:** Lumio
**Mascote:** Lumi, uma luminária de mesa fofa, inteligente e acolhedora.
**Uso:** edtech / estudo / IA / transcrição de aulas / resumos / flashcards / quiz.

### Aparência do Lumi

Lumi deve parecer sempre o mesmo personagem:

- luminária de mesa pequena, estilo mascote 3D premium;
- cabeça em formato de cúpula de luminária, cor creme quente;
- interior da lâmpada com brilho suave roxo/lilás;
- rosto simples dentro da área iluminada;
- dois olhos grandes, arredondados, simétricos, roxo-escuros, com brilho branco pequeno;
- sorriso pequeno, calmo e amigável;
- pescoço/articulação metálica em bronze/cinza escuro, com segmentos arredondados;
- base circular creme com botão roxo;
- sem braços extras, sem mãos humanas e sem membros desnecessários;
- pode inclinar a cabeça ou pescoço para expressar curiosidade, atenção, foco ou alegria;
- nunca colocar texto, logo ou assinatura no corpo/base do Lumi, exceto se solicitado explicitamente.

### Estilo visual

- 3D render premium, macio, editorial, Apple/Disney/Pixar-like, mas mais limpo e educacional;
- textura levemente fosca/plástica premium, não muito "massinha";
- iluminação suave de estúdio;
- sombras realistas e suaves;
- fundo limpo, com bastante espaço negativo para texto;
- atmosfera moderna, acolhedora e confiável;
- objetos de estudo minimalistas: notebook, caderno, lápis, livros, post-its, fone, café, calendário, microfone, ondas de áudio, cards, PDF, flashcards.

### Paleta oficial

| Uso | Hex |
|---|---|
| Roxo principal | `#7C3AED` |
| Fúcsia/acento | `#C026D3` |
| Creme quente (fundo) | `#FAF8F5` |
| Lilás claro | `#C4B5FD` |
| Grafite/texto escuro | `#24123D` |
| Dourado/bege apoio | `#E9C46A` |

Evitar cores muito saturadas fora dessa paleta. Vermelho só para "gravando/ao vivo".

---

## 2. Prompt-mestre (já incorporado no código)

```text
Premium 3D editorial render for an education tech brand called Lumio. A cute friendly desk lamp mascot named Lumi, consistent character design: small cream-colored desk lamp, rounded lamp shade head, softly glowing warm bulb face with purple inner glow, two clean symmetrical dark-purple eyes with small white highlights, tiny calm smile, articulated bronze-metal neck, circular cream base with a small purple button. No extra arms, no human hands, no text or logo on the lamp body. Apple/Disney/Pixar-like polish, soft plastic-metal material, subtle paper-like warmth, clean studio lighting, realistic soft shadows, modern minimalist composition, purple-to-fuchsia accents (#7C3AED to #C026D3), warm cream background (#FAF8F5), elegant educational mood, high-resolution, polished social media asset.
```

---

## 3. Negative prompt (já incorporado no código)

```text
wrong eyes, crossed eyes, asymmetric eyes, distorted face, scary expression, extra limbs, extra arms, human hands, deformed lamp, broken neck, melted plastic, low quality, blurry, noisy, messy background, too childish, too feminine, excessive sparkles, excessive confetti, text on character, text on lamp base, logo on lamp base, unreadable text, misspelled words, watermark, signature, duplicated character, cropped face, cropped eyes, harsh shadow, overexposed, cluttered layout, generic cartoon, flat 2D, clay-like massinha texture
```

---

## 4. Regras pra posts com texto

Para posts com frases, **NÃO pedir pra IA gerar texto dentro da imagem** — causa erros de ortografia. A imagem deve ser gerada SEM TEXTO com espaço vazio pra inserir texto depois no Figma/Canva.

---

## 5. Tamanhos recomendados

| Formato | Size |
|---|---|
| Instagram feed | 1024×1024 |
| Stories/Reels | 1080×1920 |
| X header | 1500×500 |
| LinkedIn banner | 1584×396 |
| Avatar | 1024×1024 |

No código atual, geramos 3 ratios automáticos: 1024×1024 (1:1) + 1536×1024 (3:2) + 1024×1536 (2:3).

---

## 6. Modelos de prompt por tipo de post

### A) Institucional — Lumi com espaço pra texto
```
Lumi on right side, leaning toward viewer, friendly confident. Desk: open notebook, purple pencil, small stack of books, subtle glowing particles. Large empty space on left for text overlay. Warm cream blending into purple. No text, no labels, no logo.
```

### B) Transcrição de aula
```
Lumi watching laptop screen showing lecture recording interface, audio waveform, transcript panels and note cards represented only with abstract lines and blocks. AI question card floats with blank placeholder lines. Lumi focused curious expression. Warm study desk, notebook nearby. Purple accent lighting.
```

### C) Resumo automático
```
Magical clean study workflow: floating audio waves, lecture slides as abstract cards, scattered notes flowing into neat summary doc with purple ribbon. Lumi observes from side. Premium 3D, warm cream and purple.
```

### D) Flashcards
```
Lumi next to stack of rounded flashcards with abstract question-and-answer lines. Cards have purple borders, cream paper surface. Study desk with books and subtle sparkles.
```

### E) Quiz pré-prova
```
Lumi beside floating quiz cards with multiple-choice layout shown only as abstract lines and circles. One card glows purple to indicate active recall. Background minimal modern, warm cream paper texture.
```

### F) Cronograma/calendário
```
Minimal 3D desk calendar with blank grid cells, purple binding, books and pencil nearby. Lumi small in corner, calm organized expression. No readable dates.
```

### G) Coins/pricing
```
Small treasure chest with glossy purple coins and one faceted purple gem. Lumi optional, small in background. Coins have simple lamp silhouette or star symbol only, no numbers. Premium 3D.
```

### H) Erro/empty state
```
Lumi looking gently confused at empty open notebook and floating question mark. Minimal background, soft purple abstract shapes, calm helpful mood, not childish.
```

### I) Foco/estudo profundo (sem Lumi)
```
Quiet study desk scene without Lumi: open notebook, stack of books, pencil, headphones, coffee mug, subtle purple accents, warm cream background. Premium minimalist 3D editorial.
```

### J) Gravação ao vivo
```
Lumi beside modern microphone with tiny red recording dot, audio waveforms as abstract purple lines, laptop or notebook in background. Lumi focused attentive. Clean composition with negative space.
```

---

## 7. Checklist de fidelidade

A imagem só está aprovada se cumprir:

- [ ] Lumi tem olhos simétricos, limpos e fofos, sem deformação.
- [ ] Não existe texto gerado dentro da imagem (exceto se adicionado manualmente depois).
- [ ] Não existe logo ou nome escrito na base/corpo da luminária.
- [ ] Não há braços extras nem mãos humanas.
- [ ] A paleta está em creme, roxo, lilás, fúcsia e grafite.
- [ ] A composição deixa espaço para legenda/headline.
- [ ] O visual parece premium, limpo, moderno e educacional.
- [ ] O Lumi está consistente com o mascote oficial: luminária creme, brilho roxo, pescoço metálico segmentado.
- [ ] O cenário conversa com estudo, aulas, transcrição, IA, resumo, flashcards ou quiz.
- [ ] Não parece infantil demais nem exageradamente "fofo/frufru".

---

## 8. Fórmula rápida pra novos posts

Copie e substitua os campos entre colchetes na aba **Estúdio** do painel:

```
Create a [FORMAT: square / story / banner] for Lumio about [TOPIC]. Lumi should be [POSE/EXPRESSION], placed [LEFT/RIGHT/CENTER], with [OBJECTS: laptop/transcript/notebook/cards/calendar/microphone/books]. The scene should communicate [MESSAGE/FEELING]. Leave [LEFT/RIGHT/TOP] area empty for text overlay.
```

---

## Onde isso vive no código

- **Brand anchor**: `src/app/api/admin/marketing/content/generate-images/route.ts` (constante `BRAND_ANCHOR`)
- **Imagens referência**: `src/lib/.../REFERENCE_FILENAMES` aponta pra 5 imagens em `public/instagram/lumi-posts/`
- **Painel**: `/admin/marketing/crescimento` → aba Estúdio → campo "Cena do Lumi"

Sempre que esse documento mudar, atualizar o `BRAND_ANCHOR` no código pra refletir.
