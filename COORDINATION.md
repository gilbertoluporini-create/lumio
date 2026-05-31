# COORDINATION.md

> **LEIA ISTO ANTES DE QUALQUER OUTRA COISA.** Arquivo enviado pelo Gilberto no início de toda sessão. Você não está sozinho no repo: existem outros chats Claude Code rodando em paralelo (todos sou eu, mas com **funções distintas**). Sua primeira responsabilidade é entender qual é a sua função antes de aceitar codar qualquer coisa.

## Regra zero — checar escopo ANTES de codar

Quando o Gilberto pedir uma tarefa:

1. Olhe na tabela [Fronteiras por feature](#fronteiras-por-feature-vertical-slice) qual feature a tarefa toca.
2. Se você **é o owner** daquela feature → siga normalmente.
3. Se **outro coder** é owner → **PARE e avise**:
   > "Isso cai em <feature>, que é do Coder N. Quer que eu mande mesmo assim (vou abrir lock cross-cutting) ou prefere passar pro Coder N?"
4. Se a feature está **livre** → ofereça pegar, mas confirme que nenhum outro coder já reservou em [Locks ativos](#locks-ativos).
5. Se a tarefa toca **>1 feature** → é cross-cutting; só um coder pode fazer por vez ([ver seção](#trabalho-cross-cutting)).

**Nunca aceite codar fora do seu escopo sem confirmar com o Gilberto primeiro.** O custo de perguntar é baixo; o custo de dois coders mexendo no mesmo arquivo é merge conflict + retrabalho.

## Quem é quem

| Coder | Surface | Worktree padrão |
|---|---|---|
| **Coder 1** | Plano de Estudos + multi-feature (default) | `/private/tmp/lumio-c1-<feat>` |
| **Coder 2** | Assistente Lumi | `/private/tmp/lumio-c2-<feat>` |
| **Coder mobile** | `mobile/ios-capacitor` branch + iOS native | `~/lumio` (já checked out) |

## Fronteiras por feature (vertical slice)

Cada coder é **dono** da sua fatia — pode mexer livremente em rotas + components + endpoints + migrations da feature, sem perguntar nem reservar.

| Feature | Owner | Rotas | Components | API | Migrations |
|---|---|---|---|---|---|
| Assistente Lumi | **Coder 2** | `/lumi/*` | `components/lumi/*` | `api/lumi/*` | `lumi_*` |
| Plano de Estudos | **Coder 1** | `/planos/*` | `components/planos/*` | `api/study-plans/*`, `api/cron/study-plan-*` | `study_plan_*` |
| Aulas & Gravações | livre | `/gravacoes`, `/lecture/*` | `components/lecture/*` | `api/lectures/*` | `lectures_*` |
| Resumos & Biblioteca | livre | `/resumos`, `/resumo/*` | `components/resumo/*`, `components/summaries/*` | `api/summaries/*`, `api/*/educational-summary` | `summaries_*` |
| Documentos | livre | `/documentos`, `/document/*` | `components/documents/*` | `api/documents/*`, `api/pdf-extract` | `documents_*` |
| Quiz & Flashcards | livre | `/quiz`, `/quiz-banco`, `/flashcards`, `/deck` | `components/quiz/*`, `components/flashcards/*` | `api/quiz/*`, `api/flashcards/*` | `quiz_*`, `flashcards_*` |
| Mapa Mental | livre | `/mapa` | `components/mindmap/*` | `api/mindmaps/*` | `mindmaps_*` |
| Calendário | livre | `/schedule` | `components/schedule/*` | `api/schedule/*` | `schedule_*` |
| Favoritos / Guia | livre | `/favoritos`, `/guia-revisao` | `components/favoritos/*` | — | — |
| Subjects | livre | `/subject/*` | `components/subjects/*` | `api/subjects/*` | `subjects_*` |
| Onboarding & Auth | livre | `/(auth)`, `/onboarding`, `/clear-session` | `components/onboarding/*` | `api/auth/*` | `auth_*` |
| Account & Admin | livre | `/account/*`, `/admin/*` | `components/account/*`, `components/admin/*` | `api/admin/*` | — |
| Embaixador | livre | `/embaixador`, `/account/embaixador` | `components/embaixador/*` | `api/embaixador/*` | `embaixador_*` |
| Marketing público | livre | `/(public)`, `/blog`, `/para-*`, `/pricing`, `/privacy`, `/terms`, `/help`, `/links` | `components/landing/*`, `components/marketing/*` | `api/marketing/*`, `api/blog/*` | — |

"Livre" = sem dono fixo; primeiro a reservar no [Locks ativos](#locks-ativos) ganha.

## Zona compartilhada (single-coder-at-a-time)

Mexer SÓ depois de anunciar no chat **E** reservar em [Locks ativos](#locks-ativos):

- `src/components/app/app-shell.tsx` — sidebar + layout global
- `src/components/lecture/lecture-header.tsx` — usado por lecture + plano
- `src/components/lecture/live-transcript-column.tsx` — usado por lecture + plano + resumo
- `src/lib/llm-fallback.ts` — todos endpoints IA (regra: `createMessage`, nunca SDK direto)
- `src/lib/study-plans.ts` — backend do plano + tool da Lumi
- `src/lib/supabase/*` — clientes DB
- `src/lib/auth/*` — guards
- `src/types/*` — types globais
- `src/middleware.ts`
- `supabase/migrations/*` — **NUNCA renumerar**; sempre próxima sequencial; um coder cria por vez
- `next.config.*`, `package.json`, `tsconfig.json`, `src/app/globals.css`, `src/app/layout.tsx`

## Branches & Deploy

- **`main`** = produção. Vercel deploya automático → `lumioapp.net`. Conferir build em `vercel ls` após push.
- **`mobile/ios-capacitor`** = só coder mobile. UI compartilhada chega via **cherry-pick** do main (regra `feedback_lumio_dual_branch_commits`).
- **`feat/<owner>-<feature>`** = branches efêmeras a partir de `origin/main`. Max 2 dias. PR pequeno (<300 linhas). Merge no mesmo dia se possível.

## Workflow obrigatório

1. **Antes de começar** — sempre worktree novo do `origin/main`:
   ```bash
   cd ~/lumio && git fetch origin main --quiet
   git worktree add /private/tmp/lumio-<cN>-<feat> origin/main --detach
   cd /private/tmp/lumio-<cN>-<feat>
   ```
2. **Tocar zona compartilhada?** Editar este arquivo, adicionar lock em [Locks ativos](#locks-ativos), commitar e pushar o lock antes de qualquer outra mudança.
3. **Pre-commit** — `git diff --cached` review obrigatório (regra `feedback_lumio_diff_before_commit`). Não usar `git add -A` quando há WIP de outro coder no mesmo worktree.
4. **Push** — só quando o user pedir explicitamente (regra `feedback_git_push`).
5. **Pós-merge** — remover lock, fechar worktree:
   ```bash
   cd ~/lumio && git worktree remove /private/tmp/lumio-<cN>-<feat>
   ```

## Locks ativos

Formato: `- 🔒 Coder N | <arquivo/dir/escopo> | <validade> | <branch ou PR>`

<!-- locks-start -->
(nenhum)
<!-- locks-end -->

## Trabalho cross-cutting

Quando uma tarefa toca **mais de uma feature** (ex: "unificar esqueleto de resumo" mexe em lecture + resumo + planos + biblioteca):

1. Quem pega anuncia no chat
2. Abre **lock global**: `🔒 Coder N | CROSS: <descrição> | até <data> | <branch>`
3. Outros coders pausam zonas compartilhadas até o PR mergear
4. PR único, mesmo grande — não dividir o que precisa ser atômico

## Sync rhythm

- Início do dia: rebase em `origin/main`
- Antes de abrir PR: rebase em `origin/main`
- Branch viva há > 2 dias: rebase ou squash imediato
- Migrations rodadas no DB: avisar no chat com o número (ex: "033 rodada")

## Regras de produto sempre válidas

(do `MEMORY.md` do Coder 1 — Coder 2 deve ter as próprias mas estas são do projeto)

- Mobile-first sem alterar desktop: gatear toda mudança mobile com `md:` (`feedback_lumio_mobile_no_desktop`)
- IA usa `createMessage` de `@/lib/llm-fallback`, nunca SDK direto (`feedback_lumio_fallback_openai`)
- Endpoint de IA que gera asset deve ancorar prompt em assets do user (`feedback_lumio_prompts_consider_assets`)
- Founder anônimo: nada externo revela o Gilberto (`feedback_founder_anonymity`)
- CLIs preferidas (vercel/supabase/stripe/gh) sobre dashboards (`feedback_lumio_clis`)
