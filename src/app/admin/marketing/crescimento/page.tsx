/**
 * /admin/marketing/crescimento — Outbound, Inbox e Embaixadores.
 *
 * 3 abas (state local):
 *   1. Outbound  → drafts de DM, IA gera texto, founder copia/cola no IG manualmente
 *   2. Inbox     → mensagens recebidas via webhook IG (janela 24h)
 *   3. Embaixadores → programa amigos próximos com Pro grátis em troca de divulgação
 *
 * Por que não está em /admin/marketing direto: aquela página é dashboard de vendas
 * (KPIs, MRR, funil, cohorts). Crescimento é workflow operacional — separado por
 * coerência de propósito. Mesmo grupo "Crescimento" no sidebar.
 *
 * Auth via /admin/layout.tsx.
 */

import { CrescimentoClient } from "./client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lumio · Outbound & Embaixadores",
};

export default function CrescimentoPage() {
  return <CrescimentoClient />;
}
