"use client";

import { useEffect, useRef } from "react";
import type { Candle } from "@/lib/technical";
import { mountChart } from "./chart-engine";
import { saveDrawings } from "@/app/(app)/analise/actions";

/** Gráfico interativo: períodos até o primeiro pregão, ferramentas de desenho e tendências automáticas. */
export function AnalysisChart({ ticker, candles, drawings, buy, sell, readOnly }: { ticker: string; candles: Candle[]; drawings: unknown[]; buy: number | null; sell: number | null; readOnly: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return mountChart(ref.current, { ticker, candles, drawings, buy, sell, readOnly, onSave: (d: unknown[]) => { void saveDrawings(ticker, d); } });
  }, [ticker, candles, drawings, buy, sell, readOnly]);
  return <div ref={ref} className="min-h-[600px]" />;
}
