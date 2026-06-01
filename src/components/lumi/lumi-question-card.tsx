"use client";

/**
 * Card visual de pergunta com opções clicáveis.
 * Renderizado quando a tool `perguntar_opcoes` retorna.
 * Click em opção dispara CustomEvent `lumi-pick-option` (escutado em /lumi page)
 * que envia o `value` como próxima mensagem do user.
 */

import { ChevronRight, HelpCircle } from "lucide-react";

type Opcao = {
  label: string;
  value: string;
  descricao?: string;
};

export type QuestionCardOutput = {
  sucesso?: boolean;
  tipo?: string;
  pergunta?: string;
  opcoes?: Opcao[];
  error?: string;
};

export function LumiQuestionCard({
  output,
  embedded = false,
}: {
  output: QuestionCardOutput;
  /** Quando true, renderiza SEM o wrapper externo (border/bg/shadow/rounded).
   *  Usado quando o card é fundido visualmente com o input bar — o container
   *  externo é provido pelo pai pra formar um bloco visual único. */
  embedded?: boolean;
}) {
  if (output.error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        Não consegui montar as opções: {output.error}
      </div>
    );
  }
  const pergunta = output.pergunta?.trim();
  const opcoes = Array.isArray(output.opcoes) ? output.opcoes : [];
  if (!pergunta || opcoes.length < 2) return null;

  const handlePick = (value: string) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("lumi-pick-option", { detail: { value } }),
    );
  };

  const containerClass = embedded
    ? "p-4"
    : "rounded-2xl border border-border/60 bg-card p-4 shadow-sm";

  return (
    <div className={containerClass}>
      <div className="mb-3 flex items-start gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <HelpCircle className="h-4 w-4 text-primary" />
        </div>
        <p className="pt-0.5 text-sm font-medium text-foreground">{pergunta}</p>
      </div>
      <div className="flex flex-col gap-2">
        {opcoes.map((o, i) => (
          <button
            key={`${i}-${o.label}`}
            type="button"
            onClick={() => handlePick(o.value)}
            className="group flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">{o.label}</span>
              {o.descricao && (
                <span className="text-xs text-muted-foreground">{o.descricao}</span>
              )}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </button>
        ))}
      </div>
    </div>
  );
}
