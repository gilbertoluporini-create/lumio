# Lumio — ESTADO

## 🟢 SESSÃO 2026-05-26 noite (pós-compact prep) — INFRA META PRONTA

**3 deploys live em produção**:
- `3326d99` — Sprint 1 marketing (177 files): /links, /api/og, UTM tracking, attribution
- `a8882cc` — 9 posts IG + captions (`public/instagram/lumi-posts/`, `docs/marketing/CAPTIONS_LAUNCH.md`)
- `4541sad6z` — Redeploy com vars Meta atualizadas (token novo `lumio-cli`, 242 chars)

**Endpoints validados via curl**:
- ✅ https://lumioapp.net/links → 200 (38KB HTML)
- ✅ https://lumioapp.net/api/og?title=Teste → PNG 1200x630 (117KB)
- ✅ https://lumioapp.net/ig → redirect → instagram.com/lumioapp.br/

## 🔑 Meta infra (Business "Lumio App" id=4173408029656117)

| Ativo | Status | ID |
|-------|--------|----|
| System User `lumio-cli` | ✅ Token gerado | app-scoped `122094825009349877` / business-scoped `61590496316080` |
| Pixel `Lumio` | ✅ Controle total | `867791183024108` |
| Conjuntos de dados | ✅ Controle total | (mesma Lumio) |
| Página FB `Lumio App` | ✅ Controle total + admin Gilberto | `1083170968220797` |
| IG `@lumioapp.br` | ⚠️ Vinculado ao Business mas **NÃO conectado à Página FB** | (precisa connectar) |
| Ad Account | ✅ Manage campaigns, BRL, status active | `act_1448905953408223` |
| App Meta | ✅ `lumio-cli` como dev/admin | `1496795342023931` (nome interno: **CoreMedic**, ver [[reference-lumio-meta-app-naming]]) |

**Token testado e funcionando** pra: `me`, `pages`, `ad_account`, `pixel`. ❌ Falta IG (conexão Page↔IG incompleta).

**ENV VARS atualizadas no Vercel** (production only):
- `META_ACCESS_TOKEN` = 242 chars, novo token lumio-cli
- `META_SYSTEM_USER_ID` = `122094825009349877` (app-scoped, NÃO o 61590496316080 que é business-scoped)

## ⚠️ AÇÃO MANUAL PENDENTE — conectar IG @lumioapp.br à Página FB Lumio App

A Graph API exige conexão *direta* IG↔Page, não só vinculação ao Business. Caminho:

1. Vai na Página FB "Lumio App" via https://www.facebook.com/profile.php?id=1083170968220797
2. **Configurações da Página** → **Vinculadas** → **Instagram** → **Conectar conta**
3. Login no IG `@lumioapp.br`
4. Autoriza permissões
5. Confirma conexão

Depois disso, este endpoint deve retornar `instagram_business_account`:
```bash
TOKEN=$(grep "^META_ACCESS_TOKEN=" .env.local | cut -d'=' -f2-)
curl "https://graph.facebook.com/v21.0/1083170968220797?fields=instagram_business_account&access_token=$TOKEN"
```

## 📄 Página FB — perfil pra completar

Documento mestre: `docs/marketing/FB_PAGE_PROFILE.md`
- Bio curta + descrição completa + história 3 parágrafos
- Contato: hello@lumioapp.net
- CTA: "Saiba mais" → lumioapp.net
- Imagens: reusar avatar Lumi + capa lavender do IG

## Sprint 1 Marketing — STATUS

**FEITO nesta sessão (2026-05-26 sessões 2+3)**:
- 4 contas sociais criadas: @lumioapp.br (IG/TT), @lumioapp_br (X), lumioapp-br (LI)
- Email infra: Resend verified + ImprovMX catch-all hello@lumioapp.net
- /links page (Linktree próprio) + /api/og endpoint + UTM tracking + signup_attribution
- Migration 016 rodada no Supabase
- PostHog dashboard "Acquisition by Channel" (id 1632907)
- Anonimato founder corrigido em 3 lugares públicos
- Typography Bricolage→Outfit em todo doc marketing
- PLANO_VISUAL_COMPLETO.md (prompts pro Replit)
- 10 posts IG gerados via Replit (em ~/Downloads/lumi-posts/)
- 3 posts editados via Pillow (02, 04 handle + 09 pill)
- Post 08 DESCARTADO (risco CDC art.37 + trademark USP)

**Posts IG prontos pra publicar (9 de 10)**:
- Originais: 01, 03, 05, 06, 07, 10 em `~/Downloads/lumi-posts/`
- Editados: 02, 04, 09 em `~/Downloads/lumi-posts/edited/`
- Ordem warmup 9 dias: 01→04→07→06→02→03→05→10→09

**Decisões importantes**:
- Coins onboarding: 50 fixos + 7 dias Pro grátis no lead magnet (NÃO +50 bonus coins)
- Budget ads: R$ 500/mês máximo (~R$ 16/dia)
- Timeline: 60-90 dias até MRR real
- Painel `/admin/marketing` v1: 1 semana de dev (após deploy + token Meta)

**Canais v1 do painel**:
- Email (Resend webhook) — full inbox automática
- IG Messaging API — depende do token Meta admin
- TikTok/LinkedIn — copy/paste manual via painel
- WhatsApp — PULAR (wa.me expõe número, Cloud API R$ 300+/mês não justifica agora)

**Regras outbound** (em [[feedback-lumio-outbound-safety]]):
- Máx 12 DMs/dia IG (acima disso = banimento)
- Auto-discovery só pra ranquear, user aprova cada DM
- Voz adaptativa "time Lumio" (formal vs casual)

## Roadmap 8 semanas

```
S1-S2: Deploy + warmup orgânico + 5 embaixadores + construir painel
S3-S4: Meta Lead Ads R$16/dia → PDF guia + email nurture
S5-S6: Escala paid (R$25/dia) + TikTok Spark se Reels viralizarem
S7-S8: Otimização + retargeting Pixel
Meta cumulativa: 30-60 pagantes (R$ 600-1.500 MRR)
```

## Pendências críticas em ordem

1. **DEPLOY** (comando acima) — desbloqueia tudo
2. **Texto novo CTA PDF** (user mandando via GPT) — aplicar em `scripts/gen_lead_magnet_pdf.py:510-529`, regerar PDF, mencionar "7d Pro grátis" no lugar de "+50 coins bônus"
3. **Token Meta admin** (Employee + 9 scopes) — desbloqueia IG Messaging API
4. **Copiar 9 posts pra /public/instagram/** + commit
5. **Schema marketing** (outbound_drafts, embaixadores, inbox_messages) migration 017
6. **API routes** (Anthropic profile research + DM gen + Resend webhook)
7. **UI /admin/marketing** v1 (3 seções)
8. **Publicar post 01** + iniciar warmup

---

# Lumio — ESTADO pós-sessão 2026-05-25

## Marketing/Analytics APIs (TUDO TESTADO via curl)

### Vars no Vercel production (15 marketing) + .env.local local

| Var | Tipo | Onde gerar |
|-----|------|------------|
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | público | GA4 Admin → Streams |
| `GA4_PROPERTY_ID` | privado | GA4 Admin → Detalhes propriedade |
| `GA4_STREAM_ID` | privado | URL do GA4 Admin streams |
| `GA4_MEASUREMENT_PROTOCOL_SECRET` | secret | Stream → Measurement Protocol → Criar |
| `NEXT_PUBLIC_META_PIXEL_ID` | público | 867791183024108 (Lumio pixel) |
| `META_APP_ID` | público | 1496795342023931 |
| `META_APP_SECRET` | secret | developers.facebook.com/apps/.../settings/basic |
| `META_ACCESS_TOKEN` | secret | **System User token, NUNCA EXPIRA** |
| `META_BUSINESS_ID` | privado | 4173408029656117 |
| `META_AD_ACCOUNT_ID` | privado | act_1448905953408223 |
| `META_SYSTEM_USER_ID` | privado | 122094825009349877 |
| `NEXT_PUBLIC_POSTHOG_KEY` | público | PostHog Settings → Project → API Key |
| `NEXT_PUBLIC_POSTHOG_HOST` | público | https://us.i.posthog.com |
| `POSTHOG_PROJECT_ID` | público | 438840 |
| `POSTHOG_PERSONAL_API_KEY` | secret | PostHog avatar → Personal API keys |

## Tracking fixes (deployado 2026-05-25)

### Bug raiz
`Analytics.signUp("google")` rodava DEPOIS de `supabase.auth.signInWithOAuth()` — nunca executava (redirect imediato). PostHog só capturava `$autocapture/$pageview`, zero custom.

### Solução
- `src/lib/server-analytics.ts` — Meta CAPI + GA4 MP server-side com SHA-256 hashing PII
- `src/app/api/stripe/webhook/route.ts` — `trackPurchaseServer()` no checkout completed (dedup via session.id)
- `src/app/auth/callback/route.ts` — first-login detection via `user.created_at < 60s` → adiciona `?welcome=<provider>&new=1` (signup) ou `?welcome=<provider>` (login)
- `src/components/analytics/auth-tracker.tsx` — client no layout, `identifyUser` sempre que há sessão + lê `?welcome=`

### Validação ao vivo
- `$set` no PostHog confirmou `identifyUser` (email/name ligados ao distinct_id real)
- `log_in` NÃO disparou no login do amigo porque ele tinha cookies ativos (não passou pelo OAuth callback). Esperado.
- Próximo signup OAuth fresco vai disparar `sign_up` real

## Cleanup técnico (deployado 2026-05-25)

- **content-wizard.tsx**: removeu Step4Result morto + 4 previews + handleSave + state (-454 linhas)
- **/api/correlate**: hookou `logAiUsage` (tokens + custo USD)
- **lumi-attachment-picker.tsx**: adicionou tab "Quizzes"
- **supabase/.temp/** + **.playwright-mcp/**: untracked do git + .gitignore atualizado
- **Vision real** pra PNG/JPG no Lumi: client lê base64, server monta content array `[image,text]` pra Claude. Fim do stub.

## Landing fixes (deployado 2026-05-25)

- Hero badge: "Beta privado · vagas abertas" → "Disponível agora · 50 coins grátis" (dot pulsando)
- Removeu LumiCharacter sobreposto no canto direito do hero
- Removeu avatares ABCD placeholder → "Sem cartão · cancele a qualquer hora"
- Removeu testimonial anônimo "M · Aluno 3º ano"
- CTA bottom: "Ver planos pagos" → "Como funciona"

## Landing conversion fix (deployado 2026-05-25 02:50 UTC)

### STATS / BULLETS / footer (anti-claim + consistência)
- STATS: removeu "4h/dia tempo médio salvo" (inventado, risco legal) → "50 coins grátis"
- STATS: "97% Acurácia em PT-BR no beta privado" → "PT-BR · Reconhecimento nativo"
- BULLETS bottom CTA: "Beta aberto" → "50 coins grátis", "Chat IA incluído" → "Chat IA com PDFs"
- Footer: removeu "v0.beta · maio 2026" (anti-credibilidade pra produto pago)

### Neutralização tom medicina → história/genérico
Per feedback do founder: landing não pode parecer "feito por estudante de medicina".

- **LiveDemo**: Anatomia · Suprarrenais → História · Independência do Brasil (transcript + Q&A + sticky note + folder chip)
- **ProductsTabs** (4 previews): Glândulas suprarrenais → Independência do Brasil em todas (Resumo, Flashcards, Quiz, MapaMental)
- **BeforeAfter**: transcript medical + summary → história do Brasil
- **Personas**: Medicina/Bioquímica/ciclo de Krebs → Administração/Micro/Contabilidade/Estatística
- **Testimonials**: removeu "Beta privado · maio 2026", "Beta" chips em cada card → "Verificado" (verde). Aluna Medicina → Psicologia.
- **LogosRow**: "Beta privado · Medicina, Direito e Engenharia" → "Funciona em qualquer curso"
- **SubjectsMarquee**: 7 matérias de medicina (Anatomia, Cardiologia, Bioquímica, Farmacologia, Histologia, Patologia, Embriologia) → mix balanceado de Admin/Marketing/Estatística/Sociologia/Psicopatologia

## Sprint Vendas R$700 — entregáveis prontos (2026-05-25)

### Docs criados
- **`docs/marketing/CRIATIVOS_SPRINT.md`** — 3 scripts de vídeo 30s com timing/cena/VO + copy A/B Meta + Google RSA (15 headlines, 4 descs) + 10 hooks TikTok + UTM naming + AEM order
- **`docs/marketing/DOMAIN_VERIFICATION.md`** — passo-a-passo Meta domain verify + AEM config + Resend domain verify + ativar email sequence

### Código
- **`src/lib/email.ts`**: `sendOnboardingEmail({step: day1|day3|day7|day14})` com copy + UTM em CTA
- **`src/app/api/cron/email-onboarding/route.ts`**: cron handler que busca users criados há N dias, valida idempotência via `email_send_log`, skip pagantes no day14
- **NÃO ativado** no `vercel.json` ainda (espera Resend domain verify + criar tabela `email_send_log` — instruções em DOMAIN_VERIFICATION.md item 4)

## Email sequence — ATIVADO em produção (2026-05-25 01:55 UTC)

- Resend `lumioapp.net` já estava verified (sa-east-1, sending enabled)
- `RESEND_FROM_EMAIL=Lumio <hello@lumioapp.net>` atualizado em .env.local + Vercel production
- `CRON_SECRET` gerado (openssl rand -hex 32) + setado na Vercel
- Migration `010_email_send_log.sql` aplicada via Supabase Management API (PAT)
- Cron `/api/cron/email-onboarding` rodando 0 13 * * * (10h BRT)
- Smoke test: day1 enviado pra 1 user elegível, re-run confirmou skipped: 1 (idempotência OK)

## Próximas ações que precisam do founder (UI obrigatório)

| Quando | O quê | Bloqueia |
|---|---|---|
| Hoje | Verificar `lumioapp.net` no Meta Business Manager (meta tag → me manda) | AEM iOS conversions |
| Hoje | Configurar AEM priority order no Pixel | Otimização Meta ads |
| Esta semana | Renderizar 3 vídeos (Veo3 ~R$150, ElevenLabs Will, CapCut) | Subir ads |
| Esta semana | Revogar 3 keys expostas: PAT Supabase, ELEVENLABS, Hostinger | Segurança |

## Sinais de "está funcionando"

- **GA4**: HTTP 204 ao postar em `/mp/collect`
- **PostHog**: identifyUser confirmado via `$set` events
- **Meta CAPI**: `events_received: 1` no /events endpoint
- **Stripe webhook**: server-side `purchase` no `checkout.session.completed`

## Pendências técnicas residuais

- [ ] Lint warning pre-existente: `setGenerating` em lumi/page.tsx:153 (não-bloqueante)

---
---

## SESSÃO 2026-05-25 (tarde-noite) — Refator semântico + bug-fixing

### Refator GRANDE: aula vs documento vs resumo (3 entidades separadas)

**Antes:** Tudo era `Lecture`. `Lecture.summary` (JSONB) era o resumo. PDF puro virava Lecture vazia + summary.

**Depois:** 3 tabelas separadas no Supabase:
- `lectures` — aula gravada (transcript + áudio + slides + messages)
- `documents` — PDF/texto avulso (uploadado sem gravação) — `source_kind`, `source_text`, `page_count`
- `summaries` — asset derivado, FK exclusiva (`lecture_id` XOR `document_id`), conteúdo JSONB

### Migrations aplicadas em prod (via Supabase Management API)
- `011_documents_summaries.sql` — cria as 2 tabelas novas + RLS + triggers + backfill
- `012_drop_lectures_summary.sql` — **dropou a coluna legacy `lectures.summary`**
- `013_cleanup_empty_lectures.sql` — converteu lectures vazias com summary → documents; deletou lectures totalmente vazias

### Estado atual do banco
- `lectures`: 0 (todas as antigas vazias eram lixo)
- `documents`: 2 (legados do backfill, **sem `source_text`** — vieram de lectures vazias)
- `summaries`: 2 (linked a document_id)
- Coluna `lectures.summary`: **não existe mais**

### Arquivos novos criados
- `src/lib/summaries.ts` — list/get/getByLectureId/create/upsertByLecture/update/delete
- `src/lib/documents.ts` — list/get/create/update/delete
- `src/app/document/[id]/page.tsx` — visualização de Document com botão **"Anexar PDF"** quando sem texto (extração via pdfjs no browser → grava `source_text`)
- `src/app/resumo/doc/[summaryId]/page.tsx` — visualização rica de resumo de Document (2-col layout, sidebar com Documento original)

### Wizard `ContentWizard` (refatorado)
- Quando há aula selecionada → cria/atualiza Summary com `source: lecture`
- Quando só PDF/texto → cria `Document` + `Summary` com `source: document` (não cria mais Lecture vazia)
- Tab "PDF da pasta Documentos" mostra Documents + Lectures-com-slides
- Documents sem texto aparecem com badge amarelo **"sem texto"** + desabilitados (tooltip orienta a re-anexar)
- `onCreated` callback: `{ lectureId?, summaryId?, documentId?, mode }`

### Performance landing (scroll travado → fluido)
- `lerp 0.08 → 0.14` no Lenis, `wheelMultiplier 0.9 → 1.1` (smooth-scroll.tsx)
- Header: `backdrop-blur-xl → backdrop-blur-md`
- Removido `backdrop-blur` de 9 lugares (cards, marquees, chips)
- `BeforeAfter` agora gating `requestAnimationFrame` por IntersectionObserver
- `MarqueeRow` migrou de framer-motion JS → CSS keyframes

### UI/UX fixes
- Dashboard: dropdown "+Nova aula" virou 2 botões separados: **"Gravar aula"** (gradient) + **"Novo resumo"** (outline)
- Dashboard: badge "1 dias de sequência" removido
- Dashboard: filtra lectures totalmente vazias do state
- Dashboard: auto-refresh quando aba volta a focar (back nav, troca de aba)
- `/resumos`: filtro de origem ("De aulas / De documentos"), chip de origem em cada row, dropdown "Abrir aula original"
- `/resumos`: agora itera `summaries` (não lectures) — resumos de doc aparecem na lista
- `/subject/[id]`: ganhou seção **"Documentos · N"** abaixo de "Aulas gravadas · N"
- `stripMarkdownToPlainText` helper em `utils.ts` — limpa `![](url)`, headers, **bold**, etc. dos snippets/previews

### Bug fixes críticos deploys
- **`/api/lectures/create`**: tinha `summary` no SELECT após INSERT → quebrou após drop da coluna. **HOTFIX** removeu `summary` da string.
- `AssignSubjectDialog`: chamava só `updateLectureAsync` → falhava silenciosamente pra Documents. Agora detecta `documentId` vs `lectureId` e chama API certa.
- `chat-summary` API e `summary-images` API: agora leem/escrevem em `summaries` (não mais legacy `lectures.summary`)
- `/lecture/[id]`, `/lumi`: writes de summary agora só na tabela `summaries`

### Pontos de atenção
- **2 documents legados sem `source_text`** — user precisa abrir `/document/[id]` e clicar "Anexar PDF" pra extrair texto antes de gerar resumo
- Página `/resumo/[lectureId]` (rica, 1700 linhas) tem features que NÃO foram replicadas no `/resumo/doc/[summaryId]`: TTS/áudio, chat LumiChatPanel (depende de lectureId), related lectures, action buttons gerar flashcards/quiz
- Chat sobre resumo de Document: NÃO existe ainda (LumiChatPanel hoje exige `lectureId`)

### Stack atual (não mudou)
- Next.js 16.2.6 + Turbopack (proxy.ts, NÃO middleware.ts)
- Supabase auth + RLS + service_role no server
- Stripe LIVE (mensal + anual em 3 planos)
- Anthropic Claude (haiku 4.5, sonnet 4.5)
- PostHog + GA4 + Meta CAPI já validados
- Lenis smooth scroll só em rotas públicas (landing, pricing, success)

### Arquivos chave (mapa mental)
- **Schema**: `supabase/migrations/011_documents_summaries.sql`, `012_drop_lectures_summary.sql`, `013_cleanup_empty_lectures.sql`
- **Types**: `src/lib/types.ts` — `Lecture`, `Document`, `Summary`, `SummarySource` (kind: lecture XOR document)
- **DB helpers**: `src/lib/db.ts` (lectures), `src/lib/documents.ts`, `src/lib/summaries.ts`
- **Wizard**: `src/components/ai/content-wizard.tsx` — fluxo de geração
- **/resumos**: `src/app/resumos/page.tsx` — iter `summaries` + filtros de origem
- **Resumo de aula**: `src/app/resumo/[lectureId]/page.tsx` (rica, completa)
- **Resumo de doc**: `src/app/resumo/doc/[summaryId]/page.tsx` (rica, sem chat/TTS/related)
- **Documento**: `src/app/document/[id]/page.tsx` (visual + anexar PDF)
- **Hook unificado de docs**: `src/hooks/use-all-documents.ts` — lê `lectures + documents + summaries + assets`

---

## PRÓXIMA SESSÃO (pós-compact)

**Modo: bug-fixing continuado, aba por aba.**

Founder navega em produção (`lumioapp.net`, logado como `gilbertoluporini@gmail.com`, role admin) e reporta bugs/inconsistências. Cada report:
- Print + descrição
- Ou só descrição textual

### Protocolo
1. Identificar arquivo(s) afetado(s) (`grep`/`find` direto)
2. Aplicar fix (Edit) — sem pedir confirmação a cada arquivo
3. `npx tsc --noEmit` rápido
4. `npm run build && npx vercel --prod --yes` (founder confia, autonomia total)
5. Smoke test `curl -sS -o /dev/null -w "%{http_code}" https://lumioapp.net/...`
6. Reportar curto e seguir

### NÃO fazer
- Pedir confirmação a cada Edit
- Refatorar coisas não-relacionadas
- Sugerir features novas sem ser pedido
- Mexer em `lectures.summary` (não existe mais — usar tabela `summaries`)

### Áreas que ainda podem ter bugs
- `/lecture/[id]` — gravação ao vivo (TTS, audio recorder, transcript em tempo real)
- `/lumi` — chat IA, voice mode, anexos, geração de resumo via chat
- `/onboarding` — primeira sessão pós-signup
- `/admin/*` — dashboards founder
- `/pricing` + `/checkout` — Stripe flow
- Mobile views (celular)
- Resumo de doc: precisa de chat? TTS? feature parity com resumo de aula?

### Workflow de banco
- Migrations sempre via Supabase Management API com PAT em `.env.local`:
  ```bash
  export $(grep -E '^(SUPABASE_ACCESS_TOKEN|NEXT_PUBLIC_SUPABASE_URL)=' .env.local | xargs) && REF=$(echo "$NEXT_PUBLIC_SUPABASE_URL" | sed -E 's|https://([^.]+)\.supabase\.co.*|\1|') && PAYLOAD=$(SQL_FILE=path/to/migration.sql node -e 'const fs=require("fs");console.log(JSON.stringify({query:fs.readFileSync(process.env.SQL_FILE,"utf8")}))') && curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d "$PAYLOAD"
  ```

### Última feature deployada
- `/document/[id]` com botão "Anexar PDF" — extrai texto via pdfjs no browser e grava em `documents.source_text`
- Wizard mostra docs sem texto como desabilitados com badge "sem texto"

Última atualização: 2026-05-25 — pós-refator de separação aula/documento/resumo

---
---

## SESSÃO 2026-05-26 — Bug-fixes + Lumi virou Agente (3 Sprints)

### Bug-fixes operacionais (deployados)

| Bug | Fix |
|---|---|
| Stripe webhook nunca creditava (redirect lumioapp.net→www) | Mudei endpoint pra `www.lumioapp.net` via Stripe API + reenvio evento pendente. Corrigi user gibalupo2002 manualmente. |
| `upsertSubscription` engolia error silenciosamente | Adicionei check de `error` + throw. Loga e força Stripe a re-tentar. |
| Botão "Exportar PDF" escondido no menu "..." | Pulei pra botão outline visível no header quando `hasSummary` |
| Wizard: docs "sem texto" sem caminho de fix | Botão **"Anexar PDF"** inline no row → extrai client-side → updateDocumentAsync + auto-select |
| Streaming chat letter-by-letter (estilo Claude Code) | API `/api/ai/chat-summary` ganha modo `stream:true` (SSE). UI mostra cursor "▍" piscando. Voice mode segue não-streaming. |
| Heurística de título de chat | `extractChatTitle()` em `lumi-chats.ts:170-241`. Remove 14 padrões de filler PT-BR + corta 6 palavras + 50 chars |
| Coins badge sumido nos botões "Próximas ações" | Stack vertical: label em cima, badge moeda embaixo. Grid responsivo. |
| Insights aprendizado pedia clique | Removi link "Ver relatório completo" |
| Sidebar admin sem itens importantes | Reorganizei em 5 seções (Visão/Operação/Crescimento/Pessoas/Sistema). Removi botões duplicados do /admin |
| `/gravacoes` não tinha exclusão | Implementei dropdown com "Excluir aula" (vermelho) + confirm + toast |
| PDF cap 20MB → 50MB | Centralizei em `LIMITS.PDF_BYTES`. Pra `/api/extract-slides` (Vision) mantive 10MB com fallback automático pra extração só de texto client-side |

### Article covers — gpt-image-1 (deployado)
- Migration 014 (help_article_covers) + bucket Storage `article-covers` (public)
- Endpoint `/api/admin/articles/generate-cover` + `src/lib/openai-image.ts` (photographic style anchors)
- Migrei `/api/ai/summary-images` de Imagen 4 → gpt-image-1 (fallback Imagen se OpenAI faltar)
- Pricing tracker: gpt-image-1 ($0.042 square / $0.063 landscape)
- 15/15 capas geradas via script `scripts/retry-article-covers.mjs` — $0.94 total
- Aparecem renderizadas em `/help/[cat]/[article]`

### 🚀 Lumi virou AGENTE — 3 Sprints completos

**Visão**: Lumi não responde mais — **age**. Tool calling + RAG + agent loop.

#### Sprint 0 — RAG (pgvector)
- Migration 015: pgvector + tabela `content_embeddings` (1536 dims) + função SQL `search_content_embeddings`
- `src/lib/embeddings.ts`: chunkText (2k chars com overlap 200), generateEmbeddingsBatch, searchRelevantChunks
- Endpoint `/api/embed`: auth + rate limit + ownership check + idempotente (delete+insert)
- `src/lib/embeddings-client.ts`: helper fire-and-forget pra hooks
- **Auto-index hooks ativos**:
  - `/document/[id]` após "Anexar PDF" → indexa
  - Wizard após criar doc PDF puro → indexa
  - Wizard após reparar doc legado → indexa
  - `/lecture/[id]` após parar gravação → indexa
- Pricing tracker: `text-embedding-3-small` ($0.02/Mtok)
- `scripts/backfill-embeddings.mjs` — idempotente, indexa o que ainda não foi
- Custo real: ~$0.0005 por PDF de 50 págs

#### Sprint 1 — Tool Calling (8 tools)
- `src/lib/lumi-tools.ts` define + executa:
  - `listar_materias` — query subjects
  - `listar_aulas_e_docs` — query por subjectId
  - `buscar_no_material` — RAG (a peça mais importante, usa pgvector)
  - `gerar_resumo` — chama /api/ai/generate(summary), salva Summary linkado a lecture/doc
  - `criar_flashcards` — idem, lecture wrapper + lecture_assets
  - `criar_quiz` — idem
  - `criar_mapa_mental` — idem
  - `abrir_rota` — retorna instrução de nav pro client
- `src/app/api/lumi/agent/route.ts`: agent loop com Anthropic SDK
  - Modelo: `claude-haiku-4-5`
  - Max 8 iterações
  - Streaming SSE: `{delta}` (texto) + `{tool_start}` + `{tool_result}` + `{done}`
  - Custo: 1 coin/turn do user (gerações internas cobram seus próprios coins)
  - Refund garantido em qualquer falha
- `src/components/lumi/lumi-tool-card.tsx`: cards inline mostrando tool em execução (loader → check/X → asset clicável quando gera algo)
- `/lumi/page.tsx` substituiu `/api/ai/chat-summary` por `/api/lumi/agent`
- Voice mode (lumi-voice-mode.tsx) e LumiChatPanel (resumo de aula) **inalterados** — seguem usando chat-summary

#### Sprint 2 — Modo Prova
- Tool **`iniciar_modo_prova`** (orquestrador composto, 1 call faz tudo):
  1. Lista material da matéria
  2. Faz 2 buscas RAG pra descobrir tópicos críticos
  3. Roda 3 gerações em **paralelo** via Promise.all (resumo + 15 flashcards + 10 quiz)
  4. Monta cronograma Pomodoro-like (resumo 30%/pausa/cards 35%/pausa/quiz)
- `src/components/lumi/lumi-exam-mode-card.tsx`: card rico com header + chips de tópicos + 3 tiles clicáveis + cronograma
- Botão **"Modo Prova"** no header do `/lumi` (gradient fuchsia, ao lado do calendário) — preenche prompt automaticamente
- Custo: 26 coins por sessão (10+8+8)

#### Bug-fix crítico: stream sobrevive navegação
- **Sintoma**: user manda msg, sai do chat, volta → resposta sumiu / Lumi "parou"
- **Causa**: fetch tava amarrado ao ciclo de vida da componente. Unmount → reader morto.
- **Fix**: `src/lib/lumi-stream-store.ts` — singleton global keyed por chatId
  - Stream roda no escopo do módulo, não da componente
  - Estado acessível via `getStreamState(chatId)` + `subscribeStream`
  - Quando termina, chama `appendMessage` direto (persiste mesmo se user navegou)
  - `/lumi/page.tsx` agora usa `useSyncExternalStore` pra subscribir
  - useEffect detecta `status === "done"` e recarrega chat do storage

### Pendências/Limitações conhecidas

1. **Anexos inline no /lumi** — PDF/imagem droppados no chat NÃO são considerados pelo agente (ele só busca no que tá no RAG). User deve subir via /documentos.
2. **Voice mode** ainda usa `/api/ai/chat-summary` — não passou pelo refator do agente.
3. **LumiChatPanel** (dentro de /resumo/[lectureId]) idem.
4. **Memória de erros entre sessões** — ZERO. Sprint 4 (SRS) pendente.
5. **Proatividade via calendário** — Sprint 5 pendente.
6. **Chat grátis (0 coins/msg)** — buraco de margem identificado mas não corrigido. Atacante pode mandar 10k msgs/dia = $40 prejuízo direto.
7. **2 documents legados sem source_text** — user resolve via "Anexar PDF" na UI.

### Arquivos NOVOS desta sessão (todos em prod)

```
supabase/migrations/
  014_help_article_covers.sql
  015_content_embeddings.sql

src/lib/
  openai-image.ts
  embeddings.ts
  embeddings-client.ts
  lumi-tools.ts
  lumi-stream-store.ts

src/app/api/
  embed/route.ts
  lumi/agent/route.ts
  admin/articles/generate-cover/route.ts

src/components/lumi/
  lumi-tool-card.tsx
  lumi-exam-mode-card.tsx

scripts/
  generate-article-covers.mjs
  retry-article-covers.mjs
  backfill-embeddings.mjs
```

### Próximos passos sugeridos (em ordem de impacto)

**Pra fechar o produto:**
- **Sprint 3** — Pomodoro guiado integrado ao chat (Lumi conduz sessão de estudo)
- **Sprint 4** — Memória de erros + SRS (cards errados voltam, weak_points table)
- **Sprint 5** — Proatividade calendário (notifica "prova em 3 dias")
- Migrar voice mode + LumiChatPanel pra `/api/lumi/agent`
- Cobrar 1 coin/msg no chat Lumi (fechar buraco de margem) OU cap diário no /api/chat

**Bug-fixing residual:**
- Anexos inline no /lumi entrarem no agente (subir via mesmo fluxo de auto-index)
- 2 docs legados — apenas instruir user
- /resumo/doc/[summaryId] sem chat/TTS (feature parity com /resumo/[lectureId])

### Env vars adicionadas nesta sessão

- `OPENAI_API_KEY` (Vercel production + .env.local) — usada por gpt-image-1 + text-embedding-3-small

### Modelo de pricing agora

| Endpoint | Cobra do user | Custa API (USD) |
|---|---|---|
| `/api/lumi/agent` | 1 coin/turn | ~$0.005/turn Haiku |
| `/api/embed` | grátis (auto) | $0.0005 / PDF 50 págs |
| `iniciar_modo_prova` | 26 coins (3 gerações) | ~$0.07 |
| `gerar_resumo` (via tool) | 10 coins | ~$0.025 |
| `criar_flashcards` (via tool) | 8 coins | ~$0.02 |
| Article cover (admin) | grátis (founder) | $0.063 |
| `/api/ai/summary-images` | conforme wizard | gpt-image-1 $0.042/img |

Última atualização: 2026-05-26 — pós-implementação Lumi Agent (Sprints 0+1+2) + bug-fix stream global

---

## SESSÃO 2026-05-26 (continuação) — UX hardening + reorg + tipografia

Sessão focada em corrigir frições reportadas pelo founder navegando em prod. Tudo deployado.

### Bug-fixes operacionais (deployados em prod)

| Bug | Diagnóstico | Fix |
|---|---|---|
| Sidebar não-colapsável nas páginas de resumo | `/resumo/[lectureId]` e `/resumo/doc/[summaryId]` sem botão pra dar mais espaço pro conteúdo | Botão "Recolher" no topo da sidebar + botão flutuante "Painel" à direita quando colapsada. Preferência em `localStorage` (`lumio:summary-sidebar-collapsed`). |
| Lumi alucinou resumo "AVISO IMPORTANTE: fontes não continham material processado" | Doc PDF `9b146356-...` criado com `source_text` vazio. Botão "Gerar resumo" no chat chamou `/api/ai/generate` com transcripts=[convo do chat] + sem anexos. Claude alucinou. | **Guarda anti-alucinação** nos 4 system prompts (summary/flashcards/quiz/mindmap): Claude tem que responder literalmente `INSUFFICIENT_SOURCE` se as fontes não tiverem ≥600 chars técnicos sobre o tema. Server detecta marker → HTTP 422 com `code: "INSUFFICIENT_SOURCE"` + refund automático. Toast amigável no client. |
| Stream do Lumi parava ao navegar fora do chat | `runStream` rodava no escopo do componente, morria com unmount | Singleton `lumi-stream-store.ts` — stream vive no módulo, componente subscreve via `useSyncExternalStore`. Persiste assistant msg no fim mesmo se componente desmontou. |
| Article covers Imagen 4 dando "AI look" | Pipeline antiga, prompts genéricos | Migrado pra OpenAI gpt-image-1 + `wrapPromptForRealism` editorial Hasselblad style. 15/15 capas geradas por $0.94. |
| Imagens dos resumos médicos meio-foto-meio-diagrama | `wrapPromptForRealism` (Hasselblad H6D, photorealistic) injetava em prompts que pediam "diagrama anatômico" → estilos antagônicos | Criado `wrapPromptForMedicalDiagram` em `lib/openai-image.ts` ancorado em **Netter / NEJM** (vetor flat, paleta médica, labels PT-BR, sem 3D/foto). `/api/ai/summary-images` agora usa ele. System prompt do Haiku limpo pra não pedir "photorealistic". |
| Imagens duplicadas no resumo (PCR + Reação em Cadeia = 2 imagens iguais) | `extractImageConcepts` pegava 4 sem dedup semântico | Dedup case-insensitive com overlap >60% de tokens. Max 2 imagens (qualidade > quantidade). |
| Doc Diagnóstico Molecular travado em "Extraindo..." | `triggerRepair` setava `repairingDocId` antes do file picker; cancel não disparava `change`, state ficava travado | `addEventListener("cancel", ...)` nativo no input file pra resetar state ao cancelar. |
| `/documents` não mostrava PDFs uploadados | Rota era listing flat de aulas/resumos, e `/documentos` (PT) era a tela real do sidebar | **Removida `/documents`** (virou redirect 308 pra `/documentos`). Reescrita `/documentos` (889 → 327 linhas): grid de cards de matéria com counters por tipo (aulas/PDFs/resumos/decks/quizzes/mapas). Click → `/subject/[id]` (tela rica). Seção "PDFs sem matéria" no rodapé com dialog de assign. |
| Aula sem transcrição abria tela de transcrição ao vivo | Click numa "lecture shell" (criada só pra abrigar summary de PDF) caía em `/lecture/[id]` (live transcript) — vazio | `/lecture/[id]` redireciona pra `/resumo/[id]` se a lecture não tem transcript/slides mas tem summary. |
| Tela "Produtos gerados" `/lecture/[id]/products` confusa | Hub legacy onde gerava asset → tinha que clicar de novo pra abrir | **Removida**. Rota agora é redirect 308 pra `/lecture/[id]`. Tab "Produtos" removida do header da lecture. FeatureTab "Produtos" removida do `/subject/[id]`. Botões dos card de aula agora abrem direto `/flashcards?new=1`, `/quiz?new=1`, `/documentos?new=mapa`. |
| Quiz gerado caía na tela de "Produtos" | `/api/quiz` não retornava `assetId` | API retorna `assetId` + `/lecture/[id]/products` (antes da remoção) e demais geradores agora navegam direto pra `/quiz-banco/[assetId]`. Pós-removal: wizard de quiz faz `router.refresh()`. |
| Chat lateral do quiz não puxava PDFs da matéria | `/api/ai/chat-summary` só carregava `lectures.transcript` + `summaries.content`, ignorava `documents` | **RAG integrado**: `searchRelevantChunks` (top 5, threshold 0.45, filtrado por `subjectId`) chamado antes de montar prompt. Chunks vão pro system prompt em `<untrusted_material_relacionado>`. Pré-requisito: PDF indexado em `content_embeddings`. |
| Card "Próxima aula" no dashboard cortava nome longo da matéria | `line-clamp-1` + `leading-none` no value | Trocado pra `line-clamp-2` + `break-words` + `text-xl sm:text-2xl` + `leading-tight`. Subtítulo idem. |
| Card mini de matéria cortava "Bases Biológicas da Ciência Médica" | Mesma raiz | `line-clamp-2` + `min-h-[2.5em]` + grid com `auto-rows-fr` pra altura uniforme + flex-col + `mt-auto` na progress bar. Mesmo fix no card "Continuar de onde parou". |
| Favicon era globo do browser | `/favicon.ico` retornava 404; metadata apontava pra arquivo inexistente | Copiado `public/illustrations/lumi-default.png` (1254x1254) pra `src/app/icon.png` (512x512) e `src/app/apple-icon.png` (180x180) via `sips`. Atualizado `metadata.icons` no layout. HTML em prod agora tem `<link rel="icon" href="/icon.png">`. |
| PDFs originais não eram visualizáveis no app | Wizard só extraía texto via pdfjs e descartava binário. `source_url` ficava `null`. | Criado bucket Supabase Storage **`user-documents`** público (50 MB cap, só `application/pdf`). `handleAttachPdf` em `/document/[id]` agora também sobe binário + popula `source_url`. ContentWizard idem. Tela `/document/[id]` renderiza PDF inline via `<iframe>` quando `source_url` existe, fallback pro texto extraído + banner "reanexe o PDF". |

### Tipografia: Bricolage → Outfit

- `next/font/google` carrega **Outfit** weights 300-900 (era Bricolage Grotesque 300-700)
- `--font-sans` aponta pra Outfit, herda em todo o app
- Criadas utilities `.heading-display` (peso 900, tracking -0.035em, line-height 1) e `.heading-display-sm` (peso 800, tracking -0.025em)
- Aplicado `heading-display` em todos os h1 principais do app interno via sed batch nos arquivos `src/app/**/page.tsx` — substituindo `text-3xl ... font-semibold tracking-tight` por `text-3xl ... heading-display`
- Resultado: títulos chunky igual à landing ("Sua semana, organizada pelo Lumi")

### Reorganização de `/documentos` + `/subject/[id]`

**`/documentos`** virou biblioteca limpa:
- Header com contagem (X matérias · Y itens)
- Grid responsivo de cards de matéria (1/2/3 colunas, `auto-rows-fr`)
- Cada card: ícone temático + nome 2 linhas + counters por tipo (só os > 0)
- Busca por matéria quando >4
- Seção "PDFs sem matéria" no rodapé (clique → dialog de assign)
- Click no card → `/subject/[id]`

**`/subject/[id]`** ganhou quick action toolbar:
- Toolbar com 4 botões coloridos abaixo do header: Resumo + PDF (violeta), Flashcards (esmeralda), Quiz (âmbar), Mapa mental (rosa)
- Cada botão abre `ContentWizard` com `mode` pré-setado
- Component `QuickActionTile` interno pra renderizar
- Auto-refresh pós-geração

### Arquivos modificados (resumo)

```
src/app/layout.tsx                        — Outfit font + metadata.icons → /icon.png
src/app/globals.css                       — .heading-display, .heading-display-sm
src/app/icon.png                          — NEW (favicon Lumi 512x512)
src/app/apple-icon.png                    — NEW (180x180)
src/app/documents/page.tsx                — virou redirect 308 → /documentos
src/app/documentos/page.tsx               — reescrito 889→327 linhas, grid de matérias
src/app/subject/[id]/page.tsx             — quick action toolbar, QuickActionTile, ContentWizard inline
src/app/dashboard/page.tsx                — KPICard line-clamp-2, SubjectMiniCard flex-col + auto-rows-fr
src/app/lecture/[id]/page.tsx             — redirect pra /resumo/[id] se shell sem transcript
src/app/lecture/[id]/products/page.tsx    — virou redirect pra /lecture/[id]
src/app/document/[id]/page.tsx            — upload binário pro Storage + iframe viewer
src/app/resumo/[lectureId]/page.tsx       — sidebar collapsable
src/app/resumo/doc/[summaryId]/page.tsx   — sidebar collapsable + progress bar
src/app/resumos/page.tsx                  — onCreated lida com {lectureId} OU {summaryId}
src/app/flashcards/page.tsx               — pós-geração faz router.refresh() (era /products)
src/app/quiz/page.tsx                     — idem + dropdown "Abrir aula" em vez de "Abrir na aula"
src/components/lecture/lecture-header.tsx — removido prop+link "Produtos"
src/components/ai/content-wizard.tsx      — UploadedPdf.file + upload binário no submit
src/app/api/ai/generate/route.ts          — INSUFFICIENT_GUARD nos system prompts + detector + dedup 2 imgs
src/app/api/ai/chat-summary/route.ts      — RAG via searchRelevantChunks dos chunks da matéria
src/app/api/ai/summary-images/route.ts    — wrapPromptForMedicalDiagram + system prompt limpo
src/app/api/quiz/route.ts                 — retorna assetId pra navegação direta
src/lib/openai-image.ts                   — wrapPromptForMedicalDiagram (Netter/NEJM style)
```

### Buckets Storage

- `user-documents` (NEW): público, 50MB, só `application/pdf`. Path: `{userId}/{docId}.pdf`. Usado pra renderizar PDF inline em `/document/[id]`.

### Pendências conhecidas

- Doc legado `9b146356-...` (Diagnóstico Molecular) tem `source_text` cheio mas `source_url` null — user precisa abrir `/document/[id]` e clicar "Anexar PDF" pra reupar (banner amarelo na tela já avisa).
- Lecture shell `27a60ca7-...` (do bug do resumo alucinado) já foi deletada do DB.
- ContentWizard ainda não recebe `initialSubjectId` — quando aberto via QuickActionTile no `/subject/[id]`, o user ainda precisa selecionar a matéria manualmente na step 1. Melhoria pendente.
- `/api/ai/chat-summary` precisa que o PDF esteja indexado em `content_embeddings` pra RAG funcionar. PDFs uploaded antes do auto-index não foram backfilled (script `backfill-embeddings.mjs` existe mas não foi rodado nesta sessão).
- Voice mode + LumiChatPanel ainda não migrados pra `/api/lumi/agent` (continuam no chat-summary, que agora já tem RAG — então o gap diminuiu).

### Próximos passos pra próxima sessão

1. ContentWizard com `initialSubjectId` (pré-seleciona matéria no step 1)
2. Backfill embeddings pra PDFs antigos
3. Sprint 3 (Pomodoro guiado pelo chat)
4. Cobrar 1 coin/msg no chat OU cap diário (fechar buraco margem)

Última atualização: 2026-05-26 (sessão 2) — UX hardening + reorg /documentos + tipografia Outfit + PDF viewer + RAG chat-summary
