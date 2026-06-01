"use client";

/**
 * /resumo/[lectureId] — redirect resiliente pra /lecture/[id]?tab=summary.
 *
 * Esqueleto unificado (Fase 1 + 2): toda visualização de resumo agora vive
 * dentro de /lecture/[id]. Esta rota mantém-se viva pra não quebrar links
 * antigos compartilhados.
 *
 * RESILIÊNCIA (F2, jun/26): se a lecture foi soft-deletada, o redirect cego
 * pra /lecture/[id] resulta em 404 e o user fica sem ação (resumo "órfão").
 * Aqui fazemos uma checagem rápida (1 query em lectures) ANTES do redirect:
 *  - Lecture existe + não deletada → redirect imediato (caminho feliz).
 *  - Lecture some/deletada → UI dedicada oferecendo apagar o resumo órfão
 *    ou voltar pra biblioteca.
 *
 * Resumos de PDF puro (sem lecture) continuam em /resumo/doc/[summaryId].
 */

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LumiCharacter } from "@/components/brand/lumi";
import { createClient } from "@/lib/supabase/client";

type CheckState =
  | { kind: "checking" }
  | { kind: "exists" }
  | { kind: "orphan" }
  | { kind: "error"; message: string };

export default function ResumoLectureRedirect({
  params,
}: {
  params: Promise<{ lectureId: string }>;
}) {
  const { lectureId } = use(params);
  const router = useRouter();
  const [state, setState] = useState<CheckState>({ kind: "checking" });
  const [deleting, setDeleting] = useState(false);

  // Checagem leve: a lecture ainda existe (e não foi soft-deletada)?
  // RLS garante que só o dono enxerga; usamos `.is("deleted_at", null)` pra
  // tratar lecture deletada como "não encontrada" de uma vez só.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("lectures")
          .select("id, deleted_at")
          .eq("id", lectureId)
          .is("deleted_at", null)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          setState({ kind: "error", message: error.message });
          return;
        }
        if (data) {
          // Caminho feliz: redirect IMEDIATO. Não setamos "exists" antes
          // pra evitar flash desnecessário — o spinner do "checking" já
          // cobre os ~100-200ms da query.
          setState({ kind: "exists" });
          router.replace(`/lecture/${lectureId}?tab=summary`);
        } else {
          // Lecture some (deletada ou nunca existiu) → resumo órfão.
          setState({ kind: "orphan" });
        }
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Erro desconhecido",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lectureId, router]);

  // Apaga o resumo órfão: faz soft-delete direto pelo lecture_id.
  // Schema: summaries tem coluna lecture_id (FK), não JSONB. RLS limita ao
  // próprio user. Idempotente: se já estava deletado, update retorna 0 rows
  // sem erro.
  const handleDeleteOrphan = useCallback(async () => {
    setDeleting(true);
    try {
      const supabase = createClient();
      const { error: delError } = await supabase
        .from("summaries")
        .update({ deleted_at: new Date().toISOString() })
        .eq("lecture_id", lectureId)
        .is("deleted_at", null);
      if (delError) throw delError;
      toast.success("Resumo órfão apagado.");
      router.replace("/resumos");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(`Não foi possível apagar: ${message}`);
      setDeleting(false);
    }
  }, [lectureId, router]);

  if (state.kind === "checking" || state.kind === "exists") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-5 py-10 text-center">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold heading-display">
          Não consegui verificar
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo deu errado ao checar o resumo: {state.message}. Tente de novo
          ou volte pra biblioteca.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => router.refresh()}
            className="gap-2"
          >
            Tentar de novo
          </Button>
          <Button asChild variant="gradient">
            <Link href="/resumos" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar pra biblioteca
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // state.kind === "orphan"
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-5 py-10 text-center">
      <div className="mb-4">
        <LumiCharacter mood="sleeping" size="lg" float />
      </div>
      <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-amber-700 dark:text-amber-300">
        <AlertTriangle className="h-3 w-3" />
        Resumo órfão
      </div>
      <h1 className="text-2xl font-semibold heading-display">Aula apagada</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        A aula que gerou este resumo foi apagada. Você pode apagar o resumo
        também ou voltar pra biblioteca.
      </p>
      <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <Button
          variant="destructive"
          onClick={handleDeleteOrphan}
          disabled={deleting}
          className="gap-2"
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Apagar este resumo
        </Button>
        <Button asChild variant="outline" disabled={deleting}>
          <Link href="/resumos" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar pra biblioteca
          </Link>
        </Button>
      </div>
    </div>
  );
}
