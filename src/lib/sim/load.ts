import type { Ctx } from "@/lib/context";
import { loadCategories, loadTransactions, summarize } from "@/lib/data";
import { currentCycle, shiftCycle, todayIso } from "@/lib/cycle";
import { summary, type Dividend, type Fixed, type Op } from "@/lib/invest";
import { getMacro, getQuotes, ipcaRef, later } from "@/lib/market/read";
import { yahooSymbol } from "@/lib/market/sources";
import { getCreditRates, REFERENCE } from "./credit-rates";
import type { SimData } from "@/app/(app)/simulacoes/sims/types";

/** Tudo que os simuladores usam como ponto de partida: mercado de hoje e a situação da família. */
export async function loadSimData(ctx: Ctx): Promise<{ data: SimData; tesouro: { pre: number | null; ipca: number | null } }> {
  const hh = ctx.household.id;
  const cycle = currentCycle(ctx.household.cycle_start_day);
  const cycles = [1, 2, 3].map((k) => shiftCycle(cycle, -k));
  const [macro, credit, cats, txs, { data: opsD }, { data: fixedD }, { data: rfD }] = await Promise.all([
    getMacro(ctx), getCreditRates(later), loadCategories(ctx, "pessoal"), loadTransactions(ctx, { scope: "pessoal", cycles }),
    ctx.supabase.from("inv_ops").select("*").eq("household_id", hh),
    ctx.supabase.from("inv_fixed").select("*").eq("household_id", hh),
    ctx.supabase.from("market_rf").select("index, rate, maturity").order("maturity"),
  ]);
  // renda e aporte: média dos últimos 3 ciclos fechados (só ciclos com movimento)
  const sums = cycles.map((c) => summarize(txs.filter((t) => t.cycle === c), cats)).filter((s) => s.receitas || s.despesas);
  const avg = (f: (s: (typeof sums)[number]) => number) => (sums.length ? sums.reduce((a, s) => a + f(s), 0) / sums.length : 0);

  const ops = (opsD ?? []) as Op[], fixed = (fixedD ?? []) as Fixed[];
  let patrimonio = 0;
  if (ops.length || fixed.length) {
    const tickers = [...new Set(ops.map((o) => o.ticker))], symOf = (t: string) => yahooSymbol(t, ops.find((o) => o.ticker === t)?.cls);
    const q = await getQuotes(ctx, tickers.map(symOf));
    const quotes = Object.fromEntries(tickers.map((t) => [t, q[symOf(t)]?.price ?? null]));
    patrimonio = summary(ops, fixed, [] as Dividend[], quotes, macro.cdi, ipcaRef(macro), todayIso()).total;
  }
  const rf = (rfD ?? []) as { index: string; rate: number; maturity: string }[];
  const pick = (idx: string) => { const l = rf.filter((r) => r.index === idx); return l.length ? Number(l[Math.floor(l.length / 2)].rate) : null; };

  return {
    data: {
      cdi: macro.cdi, selic: macro.selic, focus: macro.focus,
      ipca: ipcaRef(macro) / 100, cdiNet: (macro.cdi / 100) * (1 - 0.15),
      patrimonio, renda: avg((s) => s.receitas), aporte: avg((s) => s.investimentos),
      credit, reference: REFERENCE,
    },
    tesouro: { pre: pick("pre"), ipca: pick("ipca") },
  };
}
