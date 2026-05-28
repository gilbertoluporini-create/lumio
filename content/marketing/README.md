# Marketing Posts — Source of Truth

Esta pasta é a **fonte única** dos posts editoriais do Lumio. O painel `/admin/marketing/crescimento` lê daqui via endpoint de sync.

## Estrutura

```
content/marketing/posts/
  <slug-do-post>/
    metadata.json    ← obrigatório
    1x1.jpg          ← obrigatório (IG, FB, LinkedIn quadrado)
    landscape.jpg    ← opcional (X timeline, blog header)
    portrait.jpg     ← opcional (Stories, Reels, TikTok)
```

- `slug-do-post` = kebab-case curto, único, prefixado por número de 3 dígitos (`001-`, `002-`...) pra controle de ordem editorial
- Slug entra como `id` no Supabase — **NÃO RENOMEIE** depois de sincronizado (vai criar draft duplicado)

## metadata.json (schema)

```jsonc
{
  "id": "001-curiosidade-gpt-custo",         // == nome da pasta, usado como chave única
  "scheduled_for": "2026-06-01T12:00:00-03:00", // ISO 8601 com timezone, quando publica
  "networks": ["instagram", "facebook", "x", "linkedin"],
  "category": "curiosidade",                  // curiosidade | pesquisa | educacional | opiniao | dados | bts
  "title": "GPT-4 custou US$ 100M só em compute",  // título interno (não vai no post)
  "content": {
    "instagram": {
      "caption": "Texto que vai na caption do IG.\n\nPode ter quebras de linha.\n\n→ link na bio",
      "hashtags": ["estudante", "ia", "tecnologia"]
    },
    "facebook": {
      "caption": "Mesmo texto ou variação pro FB."
    },
    "x": {
      "thread": [
        "Tweet 1 (até 280 chars).",
        "Tweet 2 — segunda parte da thread.",
        "Tweet 3 com CTA → lumioapp.net"
      ]
    },
    "linkedin": {
      "headline": "Linha de abertura forte",
      "body": "Post longo do LinkedIn (3-5 parágrafos)."
    }
  }
}
```

## Fluxo

1. **Criar pasta** com slug numerado (`002-...`)
2. **Adicionar** `metadata.json` + `1x1.jpg` (mínimo) + outros ratios se publicar nas redes que pedem
3. **Sync**: no painel `/admin/marketing/crescimento`, aba **Calendário** → botão **Sincronizar pasta**
   - Endpoint `POST /api/admin/marketing/content/sync` lê o filesystem, sobe imagens pro Supabase Storage, upserta `content_drafts`
4. **Cron** (`*/5 * * * *`) publica automaticamente quando `scheduled_for <= now()` nas `networks` definidas
5. Painel mostra status: `scheduled` | `published` | `error`

## Convenções editoriais

- **Tom**: Quanta Magazine + Nerdologia + The Verge + Wired (curiosidade científica + tech + IA, não "app de estudos")
- **Identidade visual**: ver [docs/marketing/BRAND_VISUAL_LUMI.md](../../docs/marketing/BRAND_VISUAL_LUMI.md)
- **Anonimato**: nunca revelar Gilberto como criador. Voz em primeira pessoa do plural ("nós", "time Lumio") ou impessoal.
- **Imagens**: geradas via ChatGPT Plus/Gemini usando o brand master. Salvar como `.jpg` ≤500KB (comprimir com `sips -s format jpeg -s formatOptions 85`).

## Cancelar/repostar

- **Não publicar**: deletar pasta antes do `scheduled_for` (próxima sync remove o draft)
- **Reagendar**: editar `scheduled_for` e rodar sync (atualiza no banco)
- **Repostar publicado**: criar novo slug (nunca reusar)
