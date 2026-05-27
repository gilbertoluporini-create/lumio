# Lumio — Documento oficial para gerar posts fidedignos via API (v2)

**Source of truth.** Brand anchor do código em `src/app/api/admin/marketing/content/generate-images/route.ts` deve refletir esse documento.

Este documento incorpora o `lumio_doc_oficial_api_posts.md` v2 do founder.

---

## 1. Identidade visual base

**Marca:** Lumio
**Mascote:** Lumi — luminária/personagem 3D amigável, com cabeça de lâmpada, olhos grandes roxos, sorriso sutil, corpo creme, botão roxo, braço metálico articulado e brilho roxo suave vindo da lâmpada.

**Estilo geral:**
- Post quadrado 1:1, social media premium
- Visual limpo, tecnológico, educacional e acolhedor
- Mistura de landing page + app edtech + 3D mascot branding + editorial minimalista
- Sofisticado, com bastante respiro, sem excesso de elementos
- Tipografia grande, pesada, moderna, arredondada (Sora ExtraBold / Plus Jakarta Sans ExtraBold)
- Texto em pt-BR (correto, sem invenções)
- Fundo claro lilás/creme OU fundo roxo escuro, dependendo do post
- Layout com hierarquia forte: título enorme + subtítulo curto + elemento 3D + cards/ícones + URL rodapé

---

## 2. Paleta oficial (hexes exatos)

| Uso | Hex |
|---|---|
| Roxo escuro principal | `#21113f` / `#25114a` |
| Roxo Lumio | `#7c3aed` |
| Fúcsia/magenta | `#c026d3` |
| Lilás claro fundo | `#f3ecff` / `#efe7ff` |
| Creme Lumio | `#fff8e7` / `#f7edd8` |
| Amarelo detalhe/estrela | `#f5c542` |
| Verde sucesso discreto | `#22c55e` |
| Branco card | `#ffffff` |

**Gradientes permitidos:**
- Roxo → fúcsia: `#7c3aed → #c026d3`
- Fundo claro: `#fffaf0 → #f3ecff`
- Fundo escuro: `#170b33 → #33126b`

---

## 3. Mascote Lumi — aparência obrigatória

- Pequena luminária de mesa em 3D
- Cúpula/cabeça creme, arredondada, textura suave plástico/papel premium
- Interior da lâmpada com brilho roxo/lilás suave
- Dois olhos roxos grandes, simétricos, amigáveis e bem alinhados
- Sorriso pequeno e discreto
- Braço metálico articulado, marrom/cobre/cinza, juntas circulares
- Base creme arredondada com botão roxo
- **Sem logo escrito na base**, exceto se solicitado
- Sem excesso de expressão infantil
- **Sem cílios exagerados**
- **Sem aparência feminina demais**
- **Sem braços humanos** — apenas o braço articulado da luminária
- Proporções chibi, mas **premium e limpas**

---

## 4. Composição padrão

- Tamanho: 1080×1080 ou 2048×2048 (no código geramos 3 ratios: 1024², 1536×1024, 1024×1536)
- Safe margin: mínimo 64px em todos os lados
- Título ocupa 35-55% da arte (quando aplicável)
- Lumi: lado direito, inferior direito ou central inferior
- Rodapé com `lumioapp.net` (pequeno, discreto, OPCIONAL — só se user pedir)
- Bastante área vazia pra cara premium

---

## 5. Layouts oficiais por tipo de post

### A) Lançamento / Hero
Fundo claro lilás/creme. Título central/topo grande. Lumi sobre livros no centro inferior. URL canto inferior direito. Poucos decorativos.
Exemplo: *"Seu novo parceiro de estudos chegou."*

### B) Dica de estudo
Fundo roxo escuro. Título grande à esquerda. Lumi lendo/estudando à direita. Cards pequenos no canto inferior esquerdo.
Exemplo: *"3 técnicas que vão mudar como você estuda."*

### C) Recurso do app
Fundo claro. Título grande centralizado/superior. Fluxo visual: ícone entrada → Lumi → saída.
Exemplo: *"Transforme qualquer áudio em resumo."*

### D) Motivacional
Fundo claro com muito respiro. Frase enorme à esquerda. Lumi pequeno no canto inferior direito.
Exemplo: *"Você não precisa estudar mais. Você precisa estudar melhor."*

### E) Cronograma / Planner
Fundo claro. Título à esquerda. Lista/tabela semanal em cards. Lumi apontando pra calendário.
Exemplo: *"Sua semana organizada pelo Lumi."*

### F) Aula ao vivo / Transcrição
Fundo claro. Título grande topo. Interface limpa de transcrição abaixo. Lumi perto de microfone.
Exemplo: *"Aula ao vivo. Resposta na hora."*

### G) Tudo em um lugar
Fundo roxo escuro. Título grande. Cena 3D central com funil/organização. Cards inferiores com features.
Exemplo: *"De uma aula, quatro formas de aprender."*

### H) Prova social / Universidades
Fundo claro com grid sutil. Lumi à esquerda. Título à direita. Cards brancos com universidades.
Exemplo: *"Feito pra quem estuda de verdade."*

### I) Coins / oferta
Fundo claro. Título grande à esquerda. Baú/coins à direita. Botão CTA roxo.
Exemplo: *"Comece com 50 coins de graça."*

### J) PDF / Apostila
Fundo claro. Título grande à esquerda. Lumi em livros + apostila. Card flutuante "PDF + AULA".
Exemplo: *"Anexe a apostila. O Lumi conecta com a aula."*

---

## 6. Negative prompt obrigatório

```
bad typography, misspelled text, gibberish text, fake words, distorted letters,
unreadable text, incorrect Portuguese, extra logos, watermark, random brand names,
duplicated mascot, extra eyes, crossed eyes, weird eyes, asymmetrical eyes,
feminine eyelashes, overly girly style, childish baby toy style, claymation,
rough plasticine, messy composition, crowded layout, low resolution, pixelated,
blurry, dark muddy colors, harsh shadows, uncanny face, human body, human arms,
extra limbs, scary expression, generic robot, unrelated character, random UI,
wrong website, fake app screenshots, text on mascot base unless requested
```

---

## 7. Regra de texto na imagem

**Default: imagem SEM TEXTO** com espaço reservado pra overlay depois (Figma/Canva). Evita misspell em pt-BR.

**Se quiser texto na imagem**: descreve EXATAMENTE no prompt da cena, em pt-BR, sem invenção. URL padrão: `lumioapp.net`. Handle opcional: `@lumioapp`.

---

## 8. Tipografia (quando aplicável)

- Sans-serif pesada, arredondada, moderna
- Tipo: Sora ExtraBold, Plus Jakarta Sans ExtraBold, Manrope ExtraBold, Inter Tight Black
- Títulos enormes com quebras de linha fortes
- Uma palavra importante pode receber gradiente roxo
- Tracking normal ou levemente negativo
- Rótulos pequenos em uppercase com espaçamento maior

---

## 9. Onde isso vive no código

- **Brand anchor** (master): `src/app/api/admin/marketing/content/generate-images/route.ts` constante `BRAND_ANCHOR`
- **Imagens referência**: `REFERENCE_FILENAMES` → 5 imagens em `public/instagram/lumi-posts/` (4 refs oficiais ChatGPT + 1 warmup)
- **Painel**: `/admin/marketing/crescimento` → aba Estúdio → campo "Cena do Lumi"

Sempre que esse documento mudar, atualizar o `BRAND_ANCHOR` no código pra refletir.

---

## 10. Modelos prontos de posts (referência editorial)

Esses headlines são pra inspirar prompts no campo "Cena do Lumi":

| # | Tema | Headline exato | Layout |
|---|---|---|---|
| 01 | Lançamento | "Seu novo parceiro de estudos chegou." | A |
| 02 | Dica estudo | "3 técnicas que vão mudar como você estuda." | B |
| 03 | Áudio→resumo | "Transforme qualquer áudio em resumo." | C |
| 04 | Motivacional | "Você não precisa estudar mais. Você precisa estudar melhor." | D |
| 05 | Cronograma | "Sua semana organizada pelo Lumi." | E |
| 06 | Aula ao vivo | "Aula ao vivo. Resposta na hora." | F |
| 07 | Tudo num lugar | "De uma aula, quatro formas de aprender." | G |
| 08 | Universidades | "Feito pra quem estuda de verdade." | H |
| 09 | Coins | "Comece com 50 coins de graça." | I |
| 10 | PDF+aula | "Anexe a apostila. O Lumi conecta com a aula." | J |

---

## 11. Checklist de fidelidade

A imagem está aprovada se:

- [ ] Lumi simétrico, sem deformação, sem cílios exagerados, sem aparência feminina
- [ ] Sem texto inventado (só pt-BR exato se solicitado)
- [ ] Sem logo escrito na base/corpo do Lumi (exceto se pedido)
- [ ] Sem braços humanos ou membros extras
- [ ] Paleta dentro dos hexes oficiais
- [ ] Composição com espaço respirável (não crowded)
- [ ] Visual premium, limpo, moderno, educacional
- [ ] Lumi consistente com refs oficiais
- [ ] Cenário conversa com estudo/aulas/IA/transcrição/flashcards/quiz
- [ ] Não parece infantil demais nem "fofo/frufru" demais
