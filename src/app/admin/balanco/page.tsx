// /admin/balanco — Balanço financeiro consolidado: MRR, custo API, margem por user/plano.
// Auth via /admin/layout.tsx.

import { BalancoClient } from "./client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lumio · Balanço",
};

export default function BalancoPage() {
  return <BalancoClient />;
}
