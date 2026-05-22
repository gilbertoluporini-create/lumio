"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DEFAULT_EMOJIS, SUBJECT_PALETTE } from "@/lib/types";

export function EmojiPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return DEFAULT_EMOJIS;
    const q = query.toLowerCase();
    return DEFAULT_EMOJIS.filter((e) => EMOJI_HINTS[e]?.some((h) => h.includes(q)));
  }, [query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-10 w-10 rounded-md border border-border/70 bg-background flex items-center justify-center text-xl hover:bg-secondary transition-colors",
            open && "ring-2 ring-ring ring-offset-1 ring-offset-background",
            className,
          )}
          title="Escolher emoji"
        >
          {value}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-2">
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar (ex: livro, ciência)"
            className="h-8 pl-8 text-xs"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-8 gap-1 max-h-[260px] overflow-y-auto scrollbar-thin">
          {filtered.length === 0 ? (
            <p className="col-span-8 text-center text-xs text-muted-foreground py-6">
              Nenhum emoji encontrado.
            </p>
          ) : (
            filtered.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onChange(emoji);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "aspect-square flex items-center justify-center rounded-md text-xl transition-all hover:bg-secondary hover:scale-110",
                  value === emoji && "bg-primary/10 ring-1 ring-primary/30",
                )}
              >
                {emoji}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ColorPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-10 w-10 rounded-md border border-border/70 bg-gradient-to-br transition-all hover:scale-105",
            value,
            open && "ring-2 ring-ring ring-offset-1 ring-offset-background",
            className,
          )}
          title="Escolher cor"
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="grid grid-cols-4 gap-2">
          {SUBJECT_PALETTE.map((p) => {
            const selected = value === p.color;
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  onChange(p.color);
                  setOpen(false);
                }}
                className={cn(
                  "h-10 w-10 rounded-md bg-gradient-to-br relative transition-all hover:scale-110",
                  p.color,
                  selected && "ring-2 ring-foreground ring-offset-2 ring-offset-popover",
                )}
                title={p.name}
              >
                {selected && (
                  <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow-md" />
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const EMOJI_HINTS: Record<string, string[]> = {
  "📚": ["livro", "livros", "estudo", "biblioteca"],
  "📖": ["livro", "leitura", "aberto"],
  "📝": ["nota", "anotação", "escrever"],
  "📒": ["caderno", "nota"],
  "📓": ["caderno", "diário"],
  "📔": ["caderno", "decoração"],
  "📕": ["livro", "vermelho"],
  "📗": ["livro", "verde"],
  "🧠": ["cérebro", "mente", "neuro", "psicologia"],
  "🧬": ["dna", "genética", "biologia", "anatomia"],
  "🫀": ["coração", "fisiologia", "cardio"],
  "🩺": ["medicina", "estetoscópio", "saúde", "patologia"],
  "💊": ["pílula", "farmacologia", "remédio"],
  "🧪": ["tubo", "química", "laboratório", "experimento"],
  "⚗️": ["destilação", "bioquímica", "química"],
  "🔬": ["microscópio", "histologia", "ciência", "biologia"],
  "🧫": ["placa", "microbiologia", "cultura"],
  "🦠": ["micróbio", "vírus", "bactéria", "imunologia"],
  "🩻": ["raio-x", "radiografia", "semiologia"],
  "🦴": ["osso", "osteologia", "anatomia"],
  "👁️": ["olho", "oftalmologia", "visão"],
  "🧮": ["ábaco", "matemática", "cálculo"],
  "📐": ["régua", "geometria", "matemática"],
  "📏": ["régua", "medida"],
  "🔢": ["números", "matemática"],
  "🪐": ["planeta", "saturno", "astronomia", "física"],
  "🌍": ["terra", "geografia", "globo"],
  "🌌": ["galáxia", "espaço", "astronomia"],
  "⚛️": ["átomo", "física", "química"],
  "🧲": ["ímã", "magnetismo", "física"],
  "🔭": ["telescópio", "astronomia"],
  "🧰": ["caixa", "ferramentas", "engenharia"],
  "💻": ["computador", "programação", "código", "tech"],
  "⌨️": ["teclado", "tech"],
  "🖥️": ["desktop", "computador"],
  "📱": ["celular", "mobile"],
  "🌐": ["internet", "web", "rede"],
  "🤖": ["robô", "ia", "ai", "machine learning"],
  "📊": ["gráfico", "barras", "estatística", "dados"],
  "📈": ["gráfico", "alta", "economia"],
  "⚖️": ["balança", "direito", "jurídico", "ética"],
  "📜": ["pergaminho", "história", "documento"],
  "🏛️": ["clássico", "história", "filosofia"],
  "🗣️": ["fala", "idioma", "linguística"],
  "🎨": ["arte", "paleta", "design"],
  "🎭": ["teatro", "máscara", "drama"],
  "🎵": ["música", "nota"],
  "🎬": ["cinema", "filme", "claquete"],
  "🏥": ["hospital", "saúde pública"],
  "💼": ["pasta", "negócios", "administração"],
  "💰": ["dinheiro", "saco", "economia", "finanças"],
  "🌱": ["broto", "biologia", "botânica"],
  "🐍": ["cobra", "biologia"],
  "🦋": ["borboleta", "biologia"],
  "🏃": ["corrida", "esporte", "educação física"],
  "🔥": ["fogo", "energia"],
};
