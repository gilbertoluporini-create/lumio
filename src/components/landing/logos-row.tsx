"use client";

import { motion } from "framer-motion";

const FACULTIES = [
  "Mandic",
  "USP",
  "UFPR",
  "FGV",
  "Insper",
  "PUC-SP",
  "UNICAMP",
  "UFMG",
];

export function LogosRow() {
  return (
    <div className="text-center">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-7">
        Em uso por estudantes de
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-x-8 gap-y-5 max-w-4xl mx-auto items-center">
        {FACULTIES.map((name, i) => (
          <motion.div
            key={name}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.04, duration: 0.4 }}
            className="text-base font-serif text-muted-foreground/60 hover:text-foreground/80 transition-colors"
          >
            {name}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
