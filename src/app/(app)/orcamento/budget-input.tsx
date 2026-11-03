"use client";

import { useState, useTransition } from "react";
import { saveBudget } from "./actions";

export function BudgetInput({ categoryId, cycle, initial }: { categoryId: string; cycle: string; initial: number }) {
  const [value, setValue] = useState(initial ? initial.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "");
  const [saved, setSaved] = useState(initial ? value : "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState(false);

  const commit = () => {
    if (value === saved) return;
    start(async () => {
      const r = await saveBudget(categoryId, cycle, value);
      setErr(!!r?.error);
      if (!r?.error) setSaved(value);
    });
  };

  return (
    <input
      className={`w-28 rounded-md border px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-brand ${err ? "border-loss" : "border-transparent bg-black/[0.03] hover:border-black/10"} ${pending ? "opacity-50" : ""}`}
      value={value}
      placeholder="—"
      inputMode="decimal"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      aria-label="Valor orçado"
    />
  );
}
