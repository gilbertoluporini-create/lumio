"use client";

import { motion } from "framer-motion";

const FACULTIES = [
  "Mandic",
  "USP",
  "Unifesp",
  "FMUSP",
  "Mackenzie",
  "PUC-SP",
  "UNICAMP",
  "Insper",
];

export function LogosRow() {
  return (
    <div className="text-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 backdrop-blur px-3 py-1 mb-6">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
          Beta privado · Medicina, Direito e Engenharia
        </span>
      </div>
      <p className="text-xs text-muted-foreground/80 mb-7">
        Já em uso por estudantes de
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-x-8 gap-y-5 max-w-4xl mx-auto items-center">
        {FACULTIES.map((name, i) => (
          <motion.div
            key={name}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.04, duration: 0.4 }}
            className="text-lg font-serif tracking-tight text-muted-foreground/70 hover:text-foreground transition-colors cursor-default"
          >
            {name}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
