// /admin/marketing/coverage — quais posts têm cada formato de imagem
// (1x1, landscape, portrait, story). Auth via /admin/layout.tsx.

import { CoverageClient } from "./client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lumio · Cobertura de mídias",
};

export default function CoveragePage() {
  return <CoverageClient />;
}
