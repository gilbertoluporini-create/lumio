<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Multi-coder coordination

**Antes de tocar qualquer arquivo, ler [`COORDINATION.md`](./COORDINATION.md).** Define:
- Quem é dono de qual feature (vertical slice)
- Quais arquivos são zona compartilhada (precisam de lock antes de mexer)
- Workflow de branches + worktrees
- Locks ativos no momento

Se for tocar zona compartilhada sem lock próprio: **pare e anuncie no chat primeiro**.
