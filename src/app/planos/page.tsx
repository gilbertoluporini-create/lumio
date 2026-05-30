"use client";

/**
 * /planos — Plano de Estudos (trilha guiada).
 *
 * Fase 1 (atual): aba no menu, página com empty state e CTA "Criar com Lumi".
 * Migration 026 já criou as tabelas `study_plans` e `study_plan_items`.
 * Wizard de criação + render da trilha entram na Fase 2.
 */

import { toast } from "sonner";
import { ArrowRight, Sparkles, Target } from "lucide-react";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { LumiCharacter } from "@/components/brand/lumi";
import type { User } from "@/lib/types";

function PlanosView({ user }: { user: User }) {
  void user;

  const handleCriarPlano = () => {
    toast.info(
      "Criação guiada com Lumi chega na próxima atualização. Por enquanto, peça no chat: 'Lumi, crie um plano de estudos pra Sistema Endócrino'.",
      { duration: 6000 },
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 lg:px-8 lg:py-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
            <Sparkles className="h-3 w-3" />
            Beta
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Plano de Estudos
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            O Lumi monta uma trilha passo-a-passo até sua prova — documentos,
            resumos, mapas mentais, quiz e cronograma na ordem certa.
          </p>
        </div>
        <Button
          onClick={handleCriarPlano}
          className="gap-1.5"
          size="lg"
        >
          <Target className="h-4 w-4" />
          Criar plano
        </Button>
      </div>

      {/* Empty state */}
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-8 md:p-12">
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <LumiCharacter size="md" mood="waving" float />
          <h2 className="mt-4 text-lg font-semibold">
            Nenhum plano de estudos ainda
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Diga ao Lumi o tema da prova e quanto tempo você tem — ele monta a
            trilha completa, reúne seus documentos e gera os assets na ordem
            que faz sentido pra você aprender.
          </p>

          <div className="mt-6 grid w-full gap-2 text-left">
            <Step
              n={1}
              title="Escolha matéria e data da prova"
              hint="O Lumi puxa seus horários livres do calendário"
            />
            <Step
              n={2}
              title="Anexe seus documentos (ou Lumi pede)"
              hint="PDFs, slides, áudios já na sua biblioteca"
            />
            <Step
              n={3}
              title="Lumi monta a trilha"
              hint="Resumo → mapa → quiz → flashcards → cronograma"
            />
            <Step
              n={4}
              title="Você avança item a item"
              hint="Marca como concluído, vê % de progresso até a prova"
            />
          </div>

          <Button onClick={handleCriarPlano} className="mt-6 gap-1.5">
            Criar meu primeiro plano
            <ArrowRight className="h-4 w-4" />
          </Button>

          <p className="mt-3 text-[11px] text-muted-foreground">
            Custo previsto: 25 coins pelo plano completo (rotina, resumos e
            mapas já contam aqui — não cobra de novo).
          </p>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/40 bg-background/60 p-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

export default function PlanosPage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <PlanosView user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}
