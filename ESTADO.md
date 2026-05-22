# ESTADO — Lumio (SaaS de aulas + chat IA)

> Snapshot pra resistir a compact. Atualizar a cada milestone.

## O que é

SaaS pessoal de transcrição de aulas em tempo real + chat IA contextual. Cada aula vira um arquivo em uma "pasta" (matéria) definida no onboarding.

## Estado atual (2026-05-22)

### Concluído
- Scaffold Next.js 16 + TS + Tailwind 4 + Turbopack
- Stack: Next 16.2.6 / React 19.2.4 / Tailwind 4.3 / Anthropic SDK / lucide-react / radix-ui
- Design system: OKLCH colors, light/dark/system, gradiente violet→fuchsia, glass + grid backgrounds
- UI primitives: Button (5 variants), Input, Textarea, Label, Card, Dialog, Avatar, DropdownMenu, ScrollArea, Separator, Badge
- Landing page profissional (hero + features + how-it-works + pricing + footer)
- Auth flow (signup/login) com localStorage + SHA-256 password hash
- Onboarding 2 passos: matérias sugeridas + customização (emoji + cor)
- Dashboard com filtros por matéria, criação de nova matéria, criação de nova aula
- Lecture page com 2 colunas:
  - Esquerda: transcrição ao vivo (Web Speech API pt-BR, contínuo) + editor manual
  - Direita: chat com IA streaming, vê transcrição como contexto
- API `/api/chat` streaming via Anthropic Claude Sonnet 4.6
- Fallback demo quando `ANTHROPIC_API_KEY` ausente — chat responde com texto explicativo via stream
- README + .env.example
- **Build passa limpo** (`npm run build` OK, sem TS errors)

### Pendente
- [ ] Inicializar git + criar repo no GitHub `lumio` + push
- [ ] Testar fluxo E2E no navegador (dev server)
- [ ] Adicionar `ANTHROPIC_API_KEY` real do usuário em `.env.local`
- [ ] Deploy Vercel
- [ ] Migrar localStorage → Supabase

## Arquitetura de dados (localStorage)

Chaves:
- `lumio:user` → User atual (sem hash)
- `lumio:users` → lista de StoredUser (com passwordHash)
- `lumio:subjects:{userId}` → Subject[]
- `lumio:lectures:{userId}` → Lecture[] (cada Lecture tem `messages: ChatMessage[]`)
- `lumio-theme` → "light" | "dark" | "system"

## Rotas

| Rota | Descrição |
|---|---|
| `/` | Landing |
| `/signup`, `/login` | Auth |
| `/onboarding` | Wizard matérias (gated: requer user logado) |
| `/dashboard` | Lista aulas + matérias (gated: requer onboarding) |
| `/lecture/[id]` | Transcrição + chat (gated) |
| `/api/chat` | POST streaming text/plain |

## Comandos

```bash
cd /Users/gilbertoluporini/lumio
npm run dev      # localhost:3000
npm run build    # validação TS + bundle
npm run lint
```

## Decisões

- **Web Speech API** > Whisper API: zero custo, sem upload, latência ~ms. Trade-off: só Chrome/Edge/Safari, sem Firefox.
- **localStorage** > Supabase como persistência inicial: zero fricção pro user testar. Supabase opcional via env vars (já no .env.example).
- **Claude Sonnet 4.6** no chat: melhor relação custo/qualidade; streaming via SSE simples (text/plain delta).
- **Auth client-side localStorage**: aceitável pra beta single-device; troca por Supabase Auth quando for multi-device.

## Próximos passos sugeridos (pro usuário escolher)

1. **Deploy Vercel** (`vercel --prod` + setar env vars) → URL pública
2. **Sync Supabase** → multi-device + backup
3. **Capacitor mobile** → app iOS/Android (já tem experiência via Core Medic)
4. **Upload de áudio** → Whisper API pra aulas gravadas (não-live)
5. **Markdown rendering no chat** → respostas com formatação rica (react-markdown)

## Repositório

- Local: `/Users/gilbertoluporini/lumio`
- GitHub: a criar
