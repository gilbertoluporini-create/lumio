/**
 * /admin/marketing — Painel de vendas e funil.
 *
 * Foco: founder acompanhar performance de aquisição/conversão/retenção.
 * Métricas em tempo real (auto-refresh 30s, server fetch via
 * /api/admin/marketing-stats):
 *  - KPIs: MRR, signups 30d, conversion rate, churn rate
 *  - Funil visual (signups → ativados → assinantes)
 *  - Mix de planos (barras)
 *  - Cohort table (semanas × signups × % convertidos)
 *
 * Auth via /admin/layout.tsx (redirect se não admin).
 */

import { MarketingDashboard } from "./client";
import { AnalyticsTabs } from "../_components/analytics-tabs";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lumio · Vendas & Funil",
};

export default function MarketingPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <AnalyticsTabs />
      <MarketingDashboard />
    </div>
  );
}
