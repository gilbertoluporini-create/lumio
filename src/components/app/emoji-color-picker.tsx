"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { SUBJECT_PALETTE } from "@/lib/types";

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
