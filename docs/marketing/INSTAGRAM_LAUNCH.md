# Lumio · Lançamento Instagram

> Plano de setup + 9 primeiros posts + cronograma de aquecimento até começar
> outbound. Assets gerados em `/public/instagram/*.png` via Imagen 4.

---

## 1. Handle

Ordem de preferência (você testa criando — IG retorna 200 mesmo pra perfis que não existem, não dá pra checar via API):

1. **@lumioapp** ⭐ primeira escolha
2. **@lumio.app** (com ponto — IG aceita)
3. **@uselumio**
4. **@lumio.br**
5. **@olumio**

⚠️ Cria como **Conta Comercial** (não pessoal) — desbloqueia Insights, link na bio, stickers de produto.

---

## 2. Bio (cola direto)

**Versão A (recomendada)**
```
Estude menos. Entenda mais.
Aula → resumo + flashcards + quiz em minutos.
↓ 50 coins de boas-vindas, sem cartão.
```
Link: `https://lumioapp.net`

**Versão B (mais direta)**
```
A IA que transcreve sua aula e entrega 4 materiais prontos.
Em pt-BR. Grátis pra começar.
```
Link: `https://lumioapp.net`

**Foto de perfil**: usar logo `LumioMark` do projeto (em `/public/illustrations/` ou `/public/`). Se não tiver versão quadrada com fundo violet sólido, gerar via Imagen 4 com prompt "Lumio brand mark logo, geometric L shape in violet 6D3FE3, white background, app icon style, 1024x1024".

**Highlights iniciais (capas)**: criar 3 highlights básicos:
- "Como funciona" (3-5 stories)
- "Preço" (1-2 stories)
- "Quem usa" (vazio inicialmente, encher quando tiver depoimentos)

---

## 3. Grid de 9 primeiros posts

Ordem de publicação (de cima pra baixo, esquerda pra direita no grid IG):

| Pos | Arquivo | Tipo | Quando postar |
|---|---|---|---|
| 1 | `01_hero.png` | Single — Hero | Dia 1, manhã |
| 2 | `09_slogan.png` | Single — Slogan | Dia 1, noite |
| 3 | `07_demo_telefone.png` | Single — Demo produto | Dia 2, manhã |
| 4 | `02_features_resumo.png` | Single — Feature | Dia 2, noite |
| 5 | `03_features_flashcards.png` | Single — Feature | Dia 3, manhã |
| 6 | `04_features_quiz.png` | Single — Feature | Dia 3, noite |
| 7 | `06_antes_depois.png` | Single — Antes/depois | Dia 4, manhã |
| 8 | `05_comparacao.png` | Single — Competitor | Dia 4, noite |
| 9 | `08_cta_coins.png` | Single — CTA | Dia 5, manhã |

**Cadência**: 2 posts/dia nos primeiros 5 dias. Depois desacelera pra 1/dia.

---

## 4. Legendas prontas (cola na hora de postar)

### 1. Hero
```
Anotar a aula te tira do contexto da aula.

Você grava, o Lumio escuta, transcreve em pt-BR, e te entrega resumo, flashcards e quiz prontos.

Começa grátis com 50 coins de boas-vindas. Sem cartão.

→ lumioapp.net

#estudosbr #universitario #estudante #faculdadebr #ia #produtividade
```

### 2. Slogan
```
O método novo de revisar pra prova.

→ lumioapp.net

#estudo #faculdade #vestibular #medicina #direito #engenharia
```

### 3. Demo telefone
```
Grave uma aula de 2h. Em alguns minutos, você tem o conteúdo organizado:
— Resumo estruturado por seção
— Flashcards com pergunta e resposta
— Quiz pra testar antes da prova
— Mapa mental do conteúdo

Tudo em pt-BR. lumioapp.net

#estudosbr #ia #produtividade #estudante #faculdade
```

### 4. Resumo
```
Resumo de aula sem sair do contexto. Você presta atenção, a IA organiza.

→ lumioapp.net

#estudo #faculdade #resumo #estudosproductive #metododeestudo
```

### 5. Flashcards
```
Flashcards prontos a partir da SUA aula gravada. Active recall na pratica.

→ lumioapp.net

#flashcards #anki #estudo #faculdade #medicina #vestibular
```

### 6. Quiz
```
Quiz gerado automaticamente das suas aulas. Pra testar o que voce realmente aprendeu antes da prova.

→ lumioapp.net

#quiz #estudo #pra #provafinal #vestibular #medicina
```

### 7. Antes/depois
```
Caderno vs Lumio. Quantas horas voce ja gastou copiando o que o professor escreveu?

→ lumioapp.net

#estudo #faculdade #produtividade #organizacao #estudosbr
```

### 8. Comparação
```
Otter AI custa US 20 por mes e nao entende portugues.
Lumio custa R 39 por mes, foi feito no Brasil, em pt-BR.

→ lumioapp.net

#feitonobrasil #saasbr #estudo #ia #produtividade #portugues
```

### 9. CTA Coins
```
50 coins de boas-vindas, sem cartao, sem amarra.

Cria conta, testa de verdade.

→ lumioapp.net

#estudosbr #gratis #ia #faculdade #universitario
```

---

## 5. Stories diarios (primeira semana)

Usar os 6 templates em `docs/marketing/outbound/stories-ig-copy.md`:

- **Dia 1**: Antes/depois + Demo cru
- **Dia 2**: POV estudante + Lista bullets
- **Dia 3**: Comparação preço + Demo cru
- **Dia 4**: Antes/depois + POV estudante
- **Dia 5**: Lista bullets + Story de embaixador (preparando convite)
- **Dia 6**: Comparação preço + POV estudante
- **Dia 7**: Mix sortido

---

## 6. Engagement orgânico (sem postar nada)

Em paralelo aos posts:

- **30 min/dia**: comentar (genuinamente) em posts de estudantes BR nos perfis-alvo do `busca-de-candidatos.md`
- **Curtir 50 posts/dia** de hashtags de estudo BR
- **Salvar 20 perfis/dia** que parecem candidatos a embaixador (lista interna)

⚠️ **NÃO seguir mais que 50 contas/dia** — IG marca como spam.

---

## 7. Decisão: quando começar outbound (DM)

Critérios mínimos pra primeira DM não cair em "Solicitações":

- [ ] Conta com **mínimo 6 posts publicados**
- [ ] Mínimo **50 seguidores** (orgânicos)
- [ ] **3-5 stories destacados** organizados
- [ ] Bio + foto de perfil ok
- [ ] Conta tem **pelo menos 5 dias de vida**

Quando todos os 5 itens estiverem ✅ → começa Sprint 1 outbound seguindo `EMBAIXADORES_PLAYBOOK.md` (DMs em voz "time Lumio").

---

## 8. Métricas pra trackear

Acompanhar via /admin/marketing widget Sprint 1:

- Seguidores IG/dia
- Cliques no link da bio (Linktree ou ShortIO se quiser detalhar)
- Engajamento médio por post (likes + comentários ÷ alcance)
- DMs recebidas (orgânicas)
- Signups via UTM `?utm_source=instagram`

---

*Versão 1 · 2026-05-26*
