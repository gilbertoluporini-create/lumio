"use client";

import { Mic, Wand2 } from "lucide-react";

export function VoiceModeComingSoon() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card p-8 text-center shadow-sm">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-fuchsia-500/15">
        <Mic className="h-6 w-6 text-primary" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-foreground">
          Modo de voz · Em construção
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Em breve você vai poder falar com o Lumi por áudio, em tempo real.
        </p>
      </div>
      <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/60 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Wand2 className="h-3 w-3" />
        Próxima fase
      </div>
    </div>
  );
}
