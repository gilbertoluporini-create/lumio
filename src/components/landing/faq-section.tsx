"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus } from "lucide-react";
import { Reveal } from "./motion";

const FAQS = [
  {
    q: "Meu áudio sai do navegador?",
    a: "Não. A transcrição roda local, no Web Speech API do seu Chrome ou Edge. Só o texto vai pro servidor — o áudio nunca é enviado, nunca é salvo. Se você fechar a aba durante a aula, perde a gravação. Esse é o trade-off.",
  },
  {
    q: "E se o professor falar muito rápido?",
    a: "A gente aguenta uns 250 palavras por minuto sem perder pedaço. Acima disso, ou com sotaque forte, a transcrição pode embaralhar uma ou outra palavra técnica. O chat compensa: você pergunta o que faltou e o Lumi reconstrói pelo contexto.",
  },
  {
    q: "Funciona se a aula for online?",
    a: "Sim. Coloca o áudio do Zoom/Meet/Teams pra sair pelo alto-falante e o Lumio captura. Pra qualidade máxima, plug um fone com microfone que pegue o som do PC — funciona melhor que mic interno.",
  },
  {
    q: "O que são os Lumio Coins?",
    a: "São a moeda do app pra gerar produtos: resumo (10), flash cards (12), quiz (15) ou mapa mental (20). Chat IA, transcrição e slides já vêm inclusos no plano — coin é só pra produzir material novo.",
  },
  {
    q: "Posso anexar o PDF da aula?",
    a: "Pode. O Lumio cruza o que o professor falou com os slides anexados. Quando você pergunta no chat, ele responde citando o slide específico — útil pra estudar pra prova.",
  },
  {
    q: "Tem app de celular?",
    a: "Por enquanto roda no navegador do celular (Chrome Android funciona bem). App nativo iOS/Android tá na roadmap pro segundo semestre de 2026.",
  },
  {
    q: "E se eu não gostar?",
    a: "Cancela no app, em dois cliques. Sem fidelidade, sem ligação pra retenção, sem letra miúda. Acesso continua até o fim do período pago.",
  },
  {
    q: "Quem tá por trás do Lumio?",
    a: "Time pequeno baseado em São Paulo. O fundador é estudante de medicina na Mandic — começou construindo pra resolver o próprio problema. Suporte é por contato@lumioapp.net, gente real responde.",
  },
];

export function FaqSection() {
  return (
    <section
      id="faq"
      className="relative z-10 mx-auto max-w-4xl px-6 py-20"
    >
      <Reveal className="text-center mb-12 max-w-2xl mx-auto">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-4">
          — Perguntas honestas —
        </p>
        <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
          Sem enrolação,{" "}
          <span className="font-serif italic font-normal">sem asterisco</span>.
        </h2>
      </Reveal>

      <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur divide-y divide-border/40 overflow-hidden">
        {FAQS.map((faq, i) => (
          <FaqItem key={faq.q} q={faq.q} a={faq.a} index={i} />
        ))}
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Outra dúvida?{" "}
        <a
          href="mailto:contato@lumioapp.net"
          className="text-foreground font-medium underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground transition-colors"
        >
          contato@lumioapp.net
        </a>
      </p>
    </section>
  );
}

function FaqItem({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(index === 0);
  return (
    <div>
      <button
        onClick={() => setOpen((s) => !s)}
        className="w-full flex items-center justify-between gap-6 px-6 md:px-8 py-5 text-left hover:bg-secondary/30 transition-colors group"
        aria-expanded={open}
      >
        <span className="font-medium text-base md:text-[15px] text-foreground/90 group-hover:text-foreground transition-colors">
          {q}
        </span>
        <span
          className={`shrink-0 flex h-7 w-7 items-center justify-center rounded-full border border-border/60 transition-colors ${
            open ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground"
          }`}
          aria-hidden="true"
        >
          {open ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="overflow-hidden"
          >
            <p className="px-6 md:px-8 pb-6 -mt-1 text-sm text-muted-foreground leading-relaxed max-w-2xl">
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
