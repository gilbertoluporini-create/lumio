// /admin/calendario — Calendário editorial multi-rede.
// Posts vivem em content/marketing/posts/ (filesystem).
// Cron a cada 5min publica automaticamente quando scheduled_for <= now.
// Auth via /admin/layout.tsx.

import { CalendarioClient } from "./client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lumio · Calendário de posts",
};

export default function CalendarioPage() {
  return <CalendarioClient />;
}
