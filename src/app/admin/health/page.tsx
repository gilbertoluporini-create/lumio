/**
 * /admin/health — Painel de saúde financeira e kill-switches.
 *
 * Métricas em tempo real (auto-refresh 30s):
 *  - Custo USD 24h vs cap diário; tendência 7d
 *  - Voice replies hoje, imagens geradas hoje
 *  - Quantos users bateram o cap
 *  - Top 10 spenders 24h
 *  - Breakdown por endpoint
 *  - Toggles kill-switch (TTS, Imagen, AI generate)
 *
 * Apenas admin (server check via /api/admin/health-stats).
 */

import { HealthDashboard } from "./client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lumio · Saúde & Segurança",
};

export default function HealthPage() {
  return <HealthDashboard />;
}
