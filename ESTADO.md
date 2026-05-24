# ESTADO — Lumio (snapshot pra resistir a compact)

> Última atualização: **2026-05-24** (madrugada). App LIVE em produção, 9 rotas no sidebar, landing repaginada. Aguardando KYC Stripe aprovar pra começar checkout real.

## ⚡ AUTONOMIA (regras do user)

- Faz commits a cada milestone mas NÃO push automático (só quando explicitamente pedido)
- Edita código sem pedir confirmação a cada passo
- Cuidado com ações destrutivas (rm -rf, drop table, force push)
- "implementa X" = implementa direto sem refazer perguntas óbvias
- Pode usar agentes em paralelo agressivamente (max plan, gastar tokens é trade-off favorável)
- Nunca pede secrets/API keys pelo chat — instrui a colocar no `.env.local` direto
- Honest empty states > fake data
- Voz BR informal mas inteligente (sem "olá!", "incrível", "vamos juntos")

## Pitch

SaaS de transcrição de aulas (Web Speech API) + chat IA contextual (Claude Sonnet 4.5) + slides do professor (Vision) + **4 produtos gerados** (resumos, flashcards, quiz, mapa mental). Mascote **Lumi** (lâmpada) + moeda **Lumio Coin** 3D roxa com "+". Mercado: estudantes universitários BR, foco medicina.

## Infra (LIVE)

- Local: `/Users/gilbertoluporini/lumio`
- GitHub: https://github.com/gilbertoluporini-create/lumio
- Produção: **https://lumioapp.net** ✅ NO AR (Hostinger DNS → Vercel)
- Dev: http://localhost:3001
- Domínio: lumioapp.net (Hostinger, expira 2027-05-23)
- Supabase: `pcatjumfdcxuthefixzf.supabase.co` — migrations completas
- Anthropic: ativa com créditos
- **Stripe LIVE**: KYC submetido 23/05, aguardando aprovação (1-3 dias úteis)
- **Resend**: domínio lumioapp.net verificado (DKIM+SPF+DMARC no Hostinger), SMTP custom configurado no Supabase como `no-reply@lumioapp.net`
- Email forwarding: ImprovMX catchall `*@lumioapp.net` → gilbertoluporini@gmail.com

## User principal

- Email: gilbertoluporini@gmail.com
- ID Supabase: `1000206d-38bd-431f-b862-ff4a588b00e7`
- Role: admin
- Saldo: 50 coins (welcome bonus)
- MEI ATIVA: CNPJ 53.393.782/0001-32 (CNAE "Promoção de Vendas" — não casa com SaaS, contador precisa ajustar OU migrar pra ME)

## Stack

- **Next.js 16.2.6** App Router + Turbopack
  - ⚠️ **AGENTS.md warning**: APIs têm breaking changes. Sempre ler `node_modules/next/dist/docs/01-app/` antes de codar
- React 19.2.4, TypeScript strict, Tailwind 4.3
- Fonts: Bricolage Grotesque (sans) + Geist Mono + Instrument Serif
- shadcn-style UI em `src/components/ui/`
- Lucide-react (ícones)
- Framer Motion 12 + Lenis (smooth scroll)
- Anthropic SDK + Supabase SSR + Stripe + Resend + pdfjs-dist
- Vercel hosting (deploy automático no push pra main)

## Auth (3 fluxos)

1. **Google OAuth** — Google Cloud OAuth client publicado (web app), Supabase Provider habilitado
2. **Email + senha** — signup/login/reset proper com página dedicada
3. **Magic link** — toggle alternativo

Páginas: `/(auth)/{signup,login,reset-password}` + `/auth/callback` (PKCE).

Endpoints: `/api/auth/{magic-link,signup-password,signin-password,reset-password}`.

Perfil: `/account/profile` tem trocar senha + zona de perigo "EXCLUIR" pra deletar conta (endpoint `/api/account/delete` cancela subscription Stripe + apaga customer + admin.deleteUser).

Site URL no Supabase: `https://www.lumioapp.net` (com www, pq Vercel redireciona naked→www). Redirect URLs incluem `https://www.lumioapp.net/**`, `https://lumioapp.net/**`, `http://localhost:3001/**`.

## Rotas do app

**Sidebar principal (6):**
- `/dashboard` — KPIs (3 cards: próxima aula com ícone temático, aulas gravadas com sparkline, tempo de estudo com bar chart semana S T Q Q S S D) + matérias horizontais com progress bar (% concluído = aulas com summary / total) + lista linear de aulas recentes
- `/schedule` — Calendário mês/semana/agenda + grid 6x7 + agenda lateral próximos 5 dias + 4 cards categorias (Próximas aulas com dados reais; Blocos/Provas/Trabalhos com "Em breve" honesto)
- `/resumos` — Biblioteca: filtros (matéria/status/tipo/busca/ordenação) + featured card do resumo mais recente + tabela + sidebar com pastas por matéria + stats
- `/flashcards` — 4 stat cards + study session card com flip + sidebar config + tabela decks. SRS toast "Em breve". Manual flip funciona
- `/quiz` — 4 stat cards + pills de matéria + bancos à esquerda + practice panel à direita com feedback local de correto/errado
- `/gravacoes` — Card destaque com preview transcrição + tabela todas as gravações + sidebar com stats + dica do Lumio
- `/account/coins` — Carteira com moeda 3D animada + custos por feature + pacotes avulsos placeholder

**Sidebar secundária (após divisor):**
- `/account/settings` — Configurações
- `/help` — FAQ search + 5 categorias + 3 guias + 3 cards suporte

**Outras:** `/onboarding`, `/lecture/[id]`, `/lecture/[id]/products`, `/subject/[id]`, `/account/profile`, `/account/billing`, `/admin/*`, `/pricing`, `/terms`, `/privacy`, `/success`.

## Landing repaginada (commit 923a9c8)

Componentes em `src/components/landing/`:
- `hero` (Lumi maior, "Beta privado · vagas abertas")
- `logos-row` (8 faculdades como texto: Mandic, USP, Unifesp, FMUSP, Mackenzie, PUC-SP, UNICAMP, Insper)
- `testimonials` (3 estudantes fictícios beta com badges)
- `how-it-works` (4 steps com Lumi illustrations)
- `personas` (Medicina/Direito/Engenharia com pain→solution específico)
- `pricing-section` (50 coins welcome bonus + cards Starter/Pro/Power)
- `faq-section` (8 perguntas honestas, reconhece trade-offs)
- Footer 4-col com mailto contato@lumioapp.net

## Moeda 3D

- Componente: `src/components/brand/lumio-coin-spinning.tsx`
- 2 formatos alpha: `/illustrations/lumio-coin.webm` (VP9, 736KB) + `/illustrations/lumio-coin.mov` (HEVC, 1.4MB)
- Poster fallback: `/illustrations/lumio-coin.png` (transparente)
- **Loop seamless via requestAnimationFrame** (timeupdate event tinha delay e deixava o último frame congelar)
- Size default 260px (era 180 antes)
- Source: Canva "fundo removido" + ffmpeg colorkey branco pra alpha real
- Usar APENAS em destaques (card de saldo /account/coins). Resto usa `LumioCoin` PNG estática

## Ícones temáticos

Helper `getSubjectIcon(name)` duplicado em 5 arquivos. Cobre 30+ keywords: medicina (cardio/respirat/endócr/neuro/clinic/aps/genetic/etc), direito (Gavel/Scale), engenharia (Wrench), exatas (Calculator/Sigma/Atom), humanas (Landmark/Library), línguas (Languages), computação (Code), administração (Briefcase), artes (Palette/Music), ed. física (Dumbbell), inovação (Lightbulb). Fallback: BookOpen.

**TODO refator**: extrair pra `src/lib/subject-icon.ts`.

## Stripe (LIVE)

- KYC submetido em **23/05/2026** — aguardando aprovação 1-3 dias úteis
- Webhook LIVE: https://lumioapp.net/api/stripe/webhook (secret `whsec_8nb7kO6SpkWGU56ZPjBhwsCFTbHzQ0PZ`)
- Customer Portal LIVE configurado
- Price IDs LIVE em `.env.local`:
  - `STRIPE_PRICE_ID_STARTER=price_1TaOO39ui6kMmrgUFYatvtX`
  - `STRIPE_PRICE_ID_PRO=price_1TaOO39ui6kMmrgG2CUxRpOl`
  - `STRIPE_PRICE_ID_POWER=price_1TaOO39ui6kMmrgIq76612s`
  - `STRIPE_PRICE_ID_ANNUAL` vazio — **PRECISA CRIAR pros planos anuais**

## Templates de email (aplicados no Supabase)

4 HTMLs em `supabase/email-templates/`:
- `confirm-signup.html` — "Confirma seu email pra começar no Lumio"
- `magic-link.html` — "Seu link mágico do Lumio chegou ✨"
- `reset-password.html` — "Define uma nova senha do Lumio"
- `change-email.html` — "Confirma a troca do seu email no Lumio"

Design: 560px, gradient roxo→fuchsia CTA, Lumi waving/thinking header, dark mode automático.

## Plano de marketing (entregue, user não escolheu approach)

3 fases 90 dias:
- **Mês 1** (R$0): 10-20 betas via WhatsApp + 5 testimonials vídeo
- **Mês 2** (R$200-500): Instagram + TikTok + 5-10 micro-influencers (acesso vitalício do Power em troca)
- **Mês 3** (R$1000-2000): Meta Ads + 2-3 influencers maiores + 5-10 artigos SEO

**Aguardando user escolher**: A) Action humana validar com 5 amigos / B) Build indication program / C) Roteiro de vídeos

## Próximos passos pendentes (priorizado)

1. ⏳ **KYC Stripe aprovação** (1-3 dias úteis a partir de 23/05) → testar checkout real com small charge
2. 📦 **Criar planos anuais** (Starter/Pro/Power anuais com desconto ~20%) + toggle Mensal/Anual na pricing-section da landing + atualizar `.env.local`
3. 💼 **Contador**: ajustar CNAE do MEI pra TI (tipo 6201-5/01 Desenvolvimento de programas) OU migrar pra ME
4. 🚀 **Executar marketing**: user escolher A/B/C e começar
5. 🎨 (opcional) Polish sidebar: logo ícone gradient + search bar global Cmd+K mais proeminente + card "Plano Premium" no rodapé (estilo mockup)
6. 🔧 (opcional) Implementar SRS real pros flashcards (hoje "Em breve")
7. 🔧 (opcional) Persistir respostas do /quiz (hoje só estado local)
8. 🔧 (opcional) Refatorar `getSubjectIcon` pra `src/lib/subject-icon.ts`

## Últimos commits

```
923a9c8 (2026-05-24) feat(app): repagina /schedule + cria /resumos /flashcards /quiz /help + landing rework + sidebar
09998da feat(gravacoes): nova página /gravacoes
47d0530 feat(app): renomeia 'Aulas'→'Dashboard', adiciona 'Gravações' + lista linear de aulas
c850c46 fix(coin): loop seamless + tamanho maior + vídeo trimado
2d05112 feat(dashboard): fase 2 do redesign — KPI com gráficos + cards horizontais
96c4e69 feat(dashboard): moeda 3D real (vídeo com alpha) + ícones expandidos + cards neutros
cddd947 feat(dashboard): fase 1 do redesign — ícones temáticos + greeting natural
88b1482 feat(auth): fluxo proper de reset password
b2219f3 chore(emails): templates HTML do Supabase Auth com brand Lumio
9d6ff6d feat(account): trocar senha + excluir conta com confirmação "EXCLUIR"
3c758dc feat(auth): signup/login híbrido — Google OAuth + senha + magic link
```

## Comandos úteis

```bash
# Dev
cd /Users/gilbertoluporini/lumio && npm run dev

# Typecheck
npx tsc --noEmit

# Lint
npm run lint

# Build local
npm run build

# Git log curto
git log --oneline -15
```

## Variáveis de ambiente importantes (`.env.local`)

- `NEXT_PUBLIC_APP_URL=https://lumioapp.net`
- `ANTHROPIC_API_KEY=sk-ant-...`
- `NEXT_PUBLIC_SUPABASE_URL=https://pcatjumfdcxuthefixzf.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `STRIPE_SECRET_KEY=sk_live_...`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...`
- `STRIPE_WEBHOOK_SECRET=whsec_8nb7kO6SpkWGU56ZPjBhwsCFTbHzQ0PZ`
- `STRIPE_PRICE_ID_{STARTER,PRO,POWER}=price_...`
- `RESEND_API_KEY=re_...`
- `RESEND_FROM_EMAIL=Lumio <onboarding@resend.dev>` (TODO: trocar pra `no-reply@lumioapp.net` agora que domínio verificou)
- `ADMIN_EMAILS=gilbertoluporini@gmail.com`
