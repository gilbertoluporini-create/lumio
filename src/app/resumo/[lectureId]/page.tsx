"use client";

/**
 * /resumo/[lectureId] — redirect pra tela canônica /lecture/[id]?tab=summary.
 *
 * Esqueleto unificado (Fase 1 + 2): toda visualização de resumo agora vive
 * dentro de /lecture/[id]. Esta rota mantém-se viva pra não quebrar links
 * antigos compartilhados, mas faz redirect imediato.
 *
 * Resumos de PDF puro (sem lecture) continuam em /resumo/doc/[summaryId].
 */

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function ResumoLectureRedirect({
  params,
}: {
  params: Promise<{ lectureId: string }>;
}) {
  const { lectureId } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/lecture/${lectureId}?tab=summary`);
  }, [lectureId, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
