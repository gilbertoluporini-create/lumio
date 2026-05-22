# Lumio

> Transcreva sua aula em tempo real. Pergunte qualquer coisa. Tudo organizado por matéria.

Lumio é um SaaS de estudos que combina **transcrição ao vivo** (Web Speech API, nativa do navegador) com **chat IA contextual** (Claude). Você grava uma aula, ele transcreve em pt-BR, e você pode tirar dúvidas com a IA, que enxerga toda a transcrição em tempo real. Tudo fica salvo em pastas por matéria.

---

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19**
- **TypeScript** estrito
- **Tailwind CSS 4** + design system custom (light/dark/system, OKLCH colors)
- **Radix UI** (primitives) + **Lucide** icons + componentes próprios estilo shadcn/ui
- **Anthropic Claude** (`@anthropic-ai/sdk`) com streaming
- **Web Speech API** pra transcrição (zero custo, roda no navegador)
- **localStorage** como persistência inicial (sync com Supabase: roadmap)
- **Sonner** pra toasts

## Fluxo E2E

1. **Landing** → `/`
2. **Signup** → `/signup` (email + senha; salvo em localStorage com SHA-256)
3. **Onboarding** → `/onboarding` (escolhe matérias)
4. **Dashboard** → `/dashboard` (vê pastas + cria/abre aulas)
5. **Aula** → `/lecture/[id]`
   - Botão **Iniciar** começa transcrição em tempo real
   - Painel direito é o chat com IA — ele recebe toda a transcrição como contexto
   - Tudo é salvo automaticamente

## Como rodar

```bash
npm install
cp .env.example .env.local   # adiciona ANTHROPIC_API_KEY (opcional pra modo demo)
npm run dev
```

Abra <http://localhost:3000>.

### Modo demo (sem chaves)

Sem `ANTHROPIC_API_KEY` o app funciona — o chat responde com texto explicativo simulando o stream. Toda a parte de transcrição, salvamento e UI roda 100%.

### Modo produção

Adicione em `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Reinicie o dev server. O chat passa a usar Claude Sonnet 4.6 com streaming real.

## Estrutura

```
src/
  app/
    page.tsx                  # Landing page
    (auth)/login,signup       # Auth
    onboarding/               # Wizard de matérias
    dashboard/                # Lista de aulas + matérias
    lecture/[id]/             # Transcrição ao vivo + chat
    api/chat/route.ts         # Streaming endpoint (Claude)
  components/
    ui/                       # Botões, inputs, dialogs, etc.
    app/                      # AuthGuard, AppShell
    brand/                    # Logo + wordmark
  hooks/
    use-speech-recognition.ts # Wrapper do Web Speech API
  lib/
    storage.ts                # CRUD localStorage
    types.ts                  # Modelos
    utils.ts                  # cn, formatters
```

## Roadmap

- [ ] Sync Supabase (auth + Postgres + RLS)
- [ ] Upload de áudio (Whisper API) pra aulas gravadas offline
- [ ] Export pra PDF/Markdown
- [ ] Compartilhamento de aulas
- [ ] App mobile (Capacitor)

## Compatibilidade

- Transcrição: **Chrome, Edge, Safari** (Web Speech API)
- Firefox não tem suporte nativo — neste caso o usuário pode colar a transcrição manualmente

---

Feito com ☕ por [@gilbertoluporini](https://github.com/gilbertoluporini-create).
