# ESTADO — Finalização do Lumio (loop autônomo)

> Cérebro do loop. Resiste a compact. Atualizar a cada passo. Branch: `finalize-app-2026-06` (worktree /private/tmp/lumio-commit, base origin/main 451743d).

## Mandato do founder (2026-06-12)
Finalizar o app: testar + debugar TUDO que der, incluindo a Lumi e como tudo se interconecta. Deixar planos + lumicoins com custos EQUILIBRADOS. "Deixar tudo meio que pronto."

## Regras de segurança
- App é LIVE (Stripe real + usuários reais). NÃO martelar prod gerando assets (custa $ + polui dados).
- Trabalho: auditar código + dev local + rebalancear preços. Build-verify cada lote.
- **Confirmar com founder antes de pushar pro main** (deploy auto).
- createMessage via @/lib/llm-fallback (nunca SDK direto). Stage por nome. Mobile-first `md:`.

## Áreas (status: ⬜ pendente / 🔄 em andamento / ✅ feito)

- ⬜ **A. Lumi agent + 12 tools** — cada tool funciona? error handling? interconexão (tool → asset → aparece no app)?
- ⬜ **B. Pipeline de assets** — upload→transcribe→(resumo/flashcards/quiz/mapa). A "mágica". Recuperação de coin se travar.
- ⬜ **C. Pricing/economia** — coins + planos equilibrados vs custo real de API. ENTREGÁVEL principal.
- ⬜ **D. Auth/billing/Stripe** — signup, login, checkout, webhook, portal.
- ⬜ **E. Interconexão de dados** — subjects↔lectures↔documents↔assets↔folders↔favoritos↔planos.
- ⬜ **F. Bugs conhecidos** — PDF anexado não aparece no upload de áudio; recuperação de coin no crash.
- ⬜ **G. Telemetria T1/T2** — RECRIAR (código perdeu, tabelas no banco existem): feature-usage.ts + instrumentar createMessage + migrations 047/048 .sql no repo.

## Achados (bugs/issues encontrados)

### A. Lumi (agente + tools) — auditado ✅
- **[P0] lumi-tools.ts:2147-2214** — tool cobra coins mas se insert do asset falha (data:null sem throw), retorna sucesso:true sem asset e SEM refund. Ramo flashcards/quiz/mapa nem checa error do insert. → checar error de cada insert + creditCoins refund.
- **[P0] lumi-tools.ts:2110-2128** — gerar_resumo faz upsert onConflict:lecture_id → SOBRESCREVE resumo existente silenciosamente (perda de dado, user pagou). → criar novo ou avisar.
- **[P1] lumi-tools.ts:1642-1873** iniciar_modo_prova — custo real (26c + 3c turn) diverge do anunciado; não é gated no server (confirmação é só prompt). Falha parcial pode cobrar assets que falharam.
- **[P1] agent/route.ts:170-205,334-406** — turn cobra 3c mesmo em loop improdutivo (MAX_ITER sem end_turn / resposta vazia). Refund só em exceção. → refundar se finalText vazio e nenhuma tool rodou.
- **[P1] agent/route.ts:159-168** — trava in-flight + rate-limit são Map em MEMÓRIA → serverless multi-instância: 2 cliques rápidos cobram 2x + assets duplicados. → Redis/idempotency-key.
- **[P1] lumi-tools.ts:1642-1787** modo_prova IGNORA soft-delete (não filtra deleted_at) → gera de material na lixeira. → add .is("deleted_at",null) nas 4 queries.
- **[P2] lumi-tools.ts:283,322 + page.tsx:116-120** — descrições/chips de custo inconsistentes com COIN_COSTS real.
- **[P2] page.tsx:550-577** — evento de calendário persiste só no mount do card; se stream interrompe, evento nunca salva. → persistir server-side no tool_result.
- OK verificado: URLs de asset batem; RAG filtra soft-delete; refund robusto em routine/study-plan; gerar_imagem renderiza; anexos Vision.

### B. Pipeline de assets — auditado ✅
- **[P0] upload-audio-card.tsx:182-189 + transcribe:210** — transcrição fire-and-forget sem retry/job. Vercel maxDuration=800 estoura ou crasha → aula trava em "failed", user re-sobe áudio inteiro (RECLAMAÇÃO DO FOUNDER). → job de transcrição em DB + cron retry pra failed/transcribing >15min.
- **[P0] asset-jobs.ts:10-13,142-175** — fila in-memory por sessão de browser. Fecha aba durante geração → /api/ai/generate já cobrou (charge antes, generate:762), asset nunca salva, SEM refund. → salvar server-side atômico OU cron reconcilia charge sem asset.
- **[P0] educational-summary:508-521** — charge antes do createMessage; Vercel maxDuration=300 mata o processo FORA do try/catch → refund (linha 890) nunca roda. User paga 25-50c sem resumo. → pending_refund job + cron, ou subir maxDuration/cortar atlas+cross.
- **[P1] lecture/[id]/page.tsx:739-757 + attach-slides** — BUG PDF ANEXADO: áudio e PDF são fluxos DESACOPLADOS + race com transcrição. structure-transcript (transcribe:180) dispara ANTES dos slides existirem → capítulos nunca sincronizam com slides, PDF "some". → gatear anexo até transcription_status=completed + update por-coluna.
- **[P1] generation-save.ts:136-199** — recovery de flashcards/quiz/mindmap IGNORA pending.lectureId e cria lecture-stub nova SEMPRE → asset órfão desconectado da aula original + duplica aula. → usar lecture_id existente se houver.
- **[P1] educational-summary (rota toda) + structure-transcript + sync-slides** — SEM idempotência: gerar 2x cobra 2x e sobrescreve. Duplo-clique = double-charge. → short-circuit/desconto se asset do kind já existe.
- **[P2] transcribe-audio.ts:91-119** — split `-c copy` não corta em 600s exato; MP3 320kbps 1h30 → chunks ~24MB podem cruzar limite 25MB do Whisper e falhar. → transcodar ogg/opus mono 24kbps no split.
- **[P2] structure-transcript:286-341** — Promise.all dispara TODOS os chunks sem pool. Aula 2h+ = 5+ Sonnet simultâneos → pico passa 800s, Vercel mata antes do update final → capítulos perdidos. → pool limite 3-4.
- **[P2] coins.ts:118-121,174-177** — retry de race em charge/credit é recursão SEM limite → loop sob contenção; refund pode nunca devolver. → limitar N retries + log reconciliação.

### E. Interconexão de dados — auditado ✅
- **[P0] db.ts:477 + summaries.ts:52 + use-all-documents.ts:118** — soft-delete de AULA deixa assets/resumos ÓRFÃOS visíveis em /documentos com link morto /lecture/{deletado}. → soft-deletar filhos junto OU filtrar por lectures vivas.
- **[P0] study-plans.ts:41 + planos/[id]/page.tsx:822** — item de plano com asset_id de fonte DELETADA = link morto (página fantasma). → no delete, limpar study_plan_items.asset_id=null status=pending.
- **[P1] document-item-delete.ts:42 + lecture-assets-delete.ts:15** — delete de flashcards/quiz/mapa é HARD (ignora soft-delete da migration 017); resumos são soft → inconsistente, quebra "recuperar" do Lumi. → trocar .delete() por update deleted_at.
- **[P1] documentos/page.tsx:90-104** — contador "N aulas" conta TODAS lectures, mas listagem só mostra com transcript → "counter X, tela vazia". Slides viram pdf-upload e inflam "PDFs". → contar com mesmo predicado.
- **[P1] favoritos/page.tsx:303-327** — branch summary NÃO filtra fonte deletada (outros tipos filtram) → favorito fantasma clicável. → add if(!doc&&!lecture) continue.
- **[P2] assets/[id]/move-folder:54** — move não valida pasta-alvo é do mesmo user/matéria → asset some das listagens. → select validando user+subject.
- **[P2] documents.ts:46 + study-plans writes** — sem .eq(user_id) explícito (RLS cobre, mas falta defesa-em-profundidade). → add filtro redundante.
- **[P2] use-all-documents.ts:207,221** — summary emitido com folderId:null hardcoded → resumo em pasta aparece "sem pasta" em /documentos mas na pasta em /subject. → usar sm.folderId.
- OK: folder delete sobe assets pra raiz; document CASCADE; permanentDelete hard com cascade.

### D. Auth/Billing/Stripe/Coins — auditado ✅
- **[P0] coins.ts:113-121** — chargeCoins NÃO atômico: update `.eq(coin_balance, balance)` sem checar linhas afetadas; PostgREST não dá erro em 0 rows → 2 requests simultâneas leem mesmo saldo, 1 grava, a 2ª "sucede" sem debitar → 2 gerações por 1 débito = GRÁTIS. Mesmo em creditCoins. → RPC atômico UPDATE...WHERE coin_balance>=amount RETURNING.
- **[P0] server-auth.ts** — requirePaidUser/isPaidActive DEFINIDOS mas NUNCA usados; features gateiam só por saldo de coins. Free com saldo gera tudo. → decidir modelo (coins=gate único? então remover código morto; ou exigir plano).
- **[P1] educational-summary + quiz/flashcards/mindmap/structure-transcript** — endpoints CAROS sem checkDailyCostCap (só /api/ai/* tem). Cap de USD é a defesa de margem. → add checkDailyCostCap em tudo que dispara Sonnet/imagem.
- **[P1] stripe/webhook:262-306 handleInvoicePaid** — renovação só recarrega coins se invoice tem metadata.user_id; assinatura criada fora do checkout não tem → paga e NÃO recebe coins. → fallback resolve user_id via customer/subscription na tabela subscriptions.
- **[P1] coins.ts:204-233 setBalanceForRenewal** — SET absoluto queima saldo residual + race com chargeCoins. → confirmar política acumula/reseta + isolar de débitos.
- **[P2] reset-password client-only**; **webhook:222 pagamento único marca "pro" sem coins**; **chat-cap:39 trialing tratado como free** (atrito receita) + falta unique em subscriptions.user_id.
- OK: webhook valida assinatura + idempotência (stripe_events); checkout server-fixed (preço não vem do client); portal valida owner; auth rate-limit; admin RLS anti-escalation (046).

## PLANO DE EXECUÇÃO (prioritizado)

### LOTE 1 — Money-critical, contido, SAFE (fazer já, eu mesmo)
1. coins.ts atomicidade (RPC debit/credit) + limitar retry — migration 049 + refactor coins.ts. **O bug #1.**
2. Soft-delete órfãos: filtrar/cascatear lecture→assets/summaries (db.ts/summaries/use-all-documents).
3. Hard→soft delete consistente (document-item-delete, lecture-assets-delete).
4. Counter divergente /documentos. Favorito summary deletado. folderId consistente.
5. Lumi: refund se insert falha (lumi-tools.ts:2147); modo_prova filtra soft-delete.

### LOTE 2 — Contido, médio (agentes paralelos, não-money)
6. Unificar 3 COIN_COSTS numa fonte (coins.ts canônico). move-folder validação. user_id defense.
7. structure-transcript pool de concorrência. idempotência guard (educational/generate).
8. Lumi turn refund improdutivo. gerar_resumo não sobrescrever.

### LOTE 3 — Infra/cron (precisa decisão founder, risco billing) → PROPOR
9. asset-jobs/transcription/educational: pending_refund job + cron reconcile (charge sem asset). Transcription retry job.
10. handleInvoicePaid fallback user_id. setBalanceForRenewal política.
11. in-flight lock Redis (serverless).

### PRICING (área C) — unificar código (safe) + PROPOR plano ao founder
- Unificar COIN_COSTS (lote 2). Rebalancear por-asset pra margem≥1,3x. Plano-level (grants/preço/limite) = DECISÃO FOUNDER.

### T1/T2 telemetria — RECRIAR (perdida): feature-usage.ts + migrations 047/048 .sql + instrumentar.

## Fixes aplicados

### LOTE 1 (build ✓ compilado limpo)
1. ✅ **[P0 money] coins atômico** — migration 049 (RPC debit_coins/credit_coins/set_coins_for_renewal, UPDATE WHERE balance>=amount RETURNING) APLICADA+testada. coins.ts reescrito pra usar RPC. Mata race (geração grátis) + recursão infinita. Saldo nunca debita abaixo de 0.
2. ✅ **[P0 órfãos] cascade soft-delete** — db.ts deleteLectureAsync carimba lecture_assets+summaries filhos com mesmo timestamp; restoreLectureAsync restaura só os do mesmo ts (não ressuscita deletados individualmente). Some o conteúdo fantasma/link morto.
3. ✅ **[P1] favorito fantasma** — favoritos/page.tsx branch summary agora dá continue se fonte deletada.
4. ✅ **[P1] hard→soft delete** — document-item-delete.ts + lecture-assets-delete.ts trocam .delete() por update deleted_at (consistente com summaries/migration 017, preserva recuperar).

### PRICING — modelo HÍBRIDO aplicado (founder aprovou) ✅ build ✓
5. ✅ Unificados os 3 COIN_COSTS (coins.ts FONTE DE VERDADE; coin-costs.ts e coins-pricing.ts espelham). Mesmo asset = mesmo preço em qualquer endpoint (antes mapa custava 20 no wizard vs 6 na rota).
6. ✅ Novos valores: resumo 12, educativo 40, cross 55, atlas 65, flashcards 10, quiz 10, mapa 12, rotina 12, plano 10, slide_sync 3.
7. ✅ Power grant 1500→1000 (stripe.ts PLAN_COINS_PER_MONTH) → coin vale R$0,119 (era 0,079). R$ dos planos INALTERADO (sem mudança no Stripe).
8. ✅ Descrições de custo alinhadas: lumi-tools.ts (gerar_resumo/flashcards/quiz/mapa/modo_prova/plano), chips do /lumi, taglines landing (1500→1000).
- Margem pior caso (Power): educativo 40c=R$4,76 vs custo R$3,69 = +29%. Nenhuma feature vende abaixo do custo.
- NOTA: assinante Power atual recebe 1000 (não 1500) na próxima renovação. R$ igual.

## LOTE 2 — aplicado ✅ (build ✓)
9. ✅ **[P0] Lumi refund-on-insert-fail** — lumi-tools.ts: cada insert (summary/lecture/asset) checa error; se falha persistência, devolve coins via RPC credit_coins e retorna erro (antes mentia sucesso:true sem asset).
10. ✅ **[P1] modo_prova ignora lixeira** — 4 queries (lectures+documents) ganharam .is("deleted_at", null).
11. ✅ **[P2] move-folder** valida pasta-alvo mesmo user+subject (agente A).
12. ✅ **[P1] contador /documentos** derivado da lista filtrada, não de lectures cruas (agente A).
13. ✅ **[P2] folderId** de resumo usa sm.folderId (consistência /documentos vs /subject) (agente A).
14. ✅ **[P2] user_id defense** em documents.ts (study-plans writes pulados: sem userId no escopo, RLS cobre) (agente A).
15. ✅ **[P2] structure-transcript pool** concorrência máx 4 (agente B).
16. ✅ **[P1] idempotência educational-summary** — guard antes do charge se já existe summary_educational válido e sem force/regenerate (agente B).

## LOTE 3 — em andamento
17. ✅ **[P1] handleInvoicePaid fallback user_id** — webhook resolve user via subscriptions (stripe_subscription_id → stripe_customer_id) quando metadata falta. Assinante fora-do-checkout passa a receber coins na renovação.
18. 🔄 **[P1] cost-cap nos endpoints caros** — agente adicionando checkDailyCostCap em educational-summary/flashcards/quiz/mindmap/structure-transcript.

19. ✅ **[P1] cost-cap nos 5 endpoints** — educational-summary/flashcards/quiz/mindmap/structure-transcript (este só pra não-interno). Type-fix: usar user.id (não userId string|null) em flash/quiz/mapa.
20. ✅ **[P1] Lumi turn improdutivo** — agent/route.ts: se loop termina sem texto E sem tool rodada, devolve AGENT_COST (flag anyToolRan).

### LOTE 3 ainda pendente (próxima sessão do loop)
- 🟢 **[P0] wizard close-tab** — FEITO pra flashcards/quiz/mapa: /api/ai/generate persiste server-side (param `persist`) quando há fonte existente (aula/doc) → fechar a aba durante a geração não perde o coin (asset já no banco). Wizard manda persist + short-circuit na route. Summary fica client-side (precisa summary-images c/ referenceImages — sem regressão). PDF recém-subido fica client-side. Bônus: usa lectureId existente (corrige orphan do recovery).
- 🟡 **[P0] crash-refund** — PARCIAL: reconciliador do RESUMO EDUCATIVO feito (migration 051 reconciled_at + cron /api/cron/reconcile-charges a cada 2h, ultra-conservador: só reembolsa se aula viva sem summary_educational). Cobre a dor cara ($1+) do founder. FALTA: path do wizard /api/ai/generate (close-tab) — não grava lecture_id no metadata, fix de RAIZ = salvar asset server-side no generate (refactor do contrato wizard+lumi). flashcards/quiz/mindmap reconciláveis depois (têm lecture_id, checar lecture_assets).
- ✅ **[P0] transcription retry** — FEITO: migration 050 (storage_path+attempts+started_at), transcribe com dispatch interno + persiste path, cron /api/cron/retry-transcription (*/15min, bounded 3 tentativas), vercel.json. Aulas novas travadas re-disparam sozinhas.
- **[P1] in-flight lock Redis** (serverless double-charge) — precisa infra Redis, DEFERIR.
- **T1/T2 telemetria** — recriar feature-usage.ts + migrations 047/048 .sql (tabelas no banco existem) + instrumentar createMessage.

## PENDENTE (NÃO commitado ainda)
- LOTE 2: Lumi refund-se-insert-falha (P0), modo_prova soft-delete, idempotência, structure-transcript pool, move-folder validação, counter /documentos, folderId consistência.
- LOTE 3 (infra/cron, decisão founder): asset-jobs/educational pending_refund cron, transcription retry job, handleInvoicePaid fallback user_id, in-flight lock Redis.
- T1/T2 telemetria: recriar feature-usage.ts + migrations 047/048 .sql + instrumentar.
- checkDailyCostCap nos endpoints caros.

## Decisões de pricing — ANÁLISE (área C)

### Planos atuais (src/lib/stripe.ts)
| Plano | R$/mês | R$/ano | coins/mês | R$/coin | limite aulas |
|---|---|---|---|---|---|
| Free | — | — | 0 (3 aulas) | — | 3 |
| Starter | 39 | 390 | 200 | 0,195 | 20 |
| Pro | 69 | 690 | 500 | 0,138 | 100 |
| Power | 119 | 1190 | 1500 | **0,079** | 999 |

### Custo real de API (R$ = USD×5,5)
- Sonnet text (resumo/quiz/flashcards/mapa ~$0.17): **R$0,94**
- Sonnet structure-transcript /chunk (~$0.48): **R$2,64**
- chatgpt-image-latest high /img (~$0.167): R$0,92 → ×3 = **R$2,75**
- gpt-image-1 (~$0.04): R$0,22 | haiku lumi/sync (~$0.005): R$0,03
- Resumo educativo (Sonnet + 3 img): **~R$3,69**

### PROBLEMAS
1. **[P0] Power vende abaixo do custo**: educativo 25c×0,079=R$1,98 vs custo R$3,69 = prejuízo R$1,71. mindmap/flashcards/quiz também negativos no Power.
2. **[P1] mindmap subprecificado**: 6 coins, mas inclui imagem (~R$1,16 custo).
3. **[P0] 3 COIN_COSTS divergentes**: coins.ts(mindmap6/summary14) vs coins-pricing.ts(mindmap20/summary10) vs coin-costs.ts(=coins.ts). Cobrança inconsistente. UNIFICAR.
4. **[P1] Transcrição grátis = ralo**: R$2,64/aula Sonnet, limite Power 999 aulas → exposição enorme.
5. **[P2] flashcards/quiz (8c) margem fina** no Pro/Power.

### PROPOSTA (a confirmar com founder antes de aplicar — toca economia live)
Princípio: nenhuma feature vende abaixo do custo nem no Power (margem ≥1,3x no Pro R$0,138). Unificar para 1 fonte de verdade (coins.ts canônico).
- Subir Power coin value: reduzir grant 1500→1000 (R$/coin 0,079→0,119) OU subir preço. [DECISÃO FOUNDER]
- Reprecificar por asset (proposta): resumo 12, educativo 30, educativo_cross 40, atlas 55, flashcards 9, quiz 9, mindmap 12, rotina 12, plano 10, slide_sync 3.
- Bound transcrição grátis no Power (limite 999→300?) [DECISÃO FOUNDER]

## Constantes
- Supabase ref: pcatjumfdcxuthefixzf | Vercel team: team_rGy3stUWkqdvNsVgZdLagiPJ projeto lumio
- Conta teste: Isa user_id 9235c6c4
- coin-costs: resumo 14, educativo 18, transcrição 15/chunk, flashcards/quiz 8, mapa 6, rotina 12, plano 8, slide-sync 3; grátis: chat/extract-slides/revisão-transcrição/extract-schedule
- Custo API real (sem cache, ai_usage_log 24h ~02/06): summary-images HD $0.47/img; structure-transcript sonnet $0.48/aula; generate-images $0.67/img; generate(resumo/cards/quiz) $0.17; lumi-agent haiku $0.004/call
