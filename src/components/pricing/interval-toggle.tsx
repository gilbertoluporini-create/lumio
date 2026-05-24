"use client";

import type { BillingInterval } from "@/lib/stripe";

type Props = {
  value: BillingInterval;
  onChange: (next: BillingInterval) => void;
  savingsLabel?: string;
};

export function IntervalToggle({ value, onChange, savingsLabel }: Props) {
  return (
    <div className="flex items-center justify-center gap-3 flex-wrap">
      <div
        role="radiogroup"
        aria-label="Intervalo de cobrança"
        className="inline-flex items-center rounded-full border border-border/60 bg-muted/60 p-1"
      >
        <ToggleButton
          active={value === "monthly"}
          onClick={() => onChange("monthly")}
          label="Mensal"
        />
        <ToggleButton
          active={value === "annual"}
          onClick={() => onChange("annual")}
          label="Anual"
        />
      </div>
      {savingsLabel ? (
        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          {savingsLabel}
        </span>
      ) : null}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={[
        "relative rounded-full px-4 py-1.5 text-sm font-medium transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
