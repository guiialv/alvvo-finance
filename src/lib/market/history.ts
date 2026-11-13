import type { Ctx } from "@/lib/context";
import type { Candle } from "@/lib/technical";
import { ensureHistory } from "./refresh";
import { later } from "./read";

/** Histórico diário do cache (baixa do Yahoo na primeira vez). Pagina de 1000 em 1000 (limite do Supabase). */
export async function loadHistory(ctx: Ctx, symbol: string, refresh = true, fromDate?: string): Promise<Candle[]> {
  // Já tem histórico guardado: atualiza em segundo plano; sem nada ainda: baixa agora
  if (refresh) {
    const { count } = await ctx.supabase.from("market_history").select("date", { count: "exact", head: true }).eq("symbol", symbol);
    if (!count) { try { await ensureHistory(symbol); } catch (e) { console.error("[histórico]", (e as Error).message); } }
    else later(() => ensureHistory(symbol));
  }
  const out: Candle[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await ctx.supabase.from("market_history").select("date, open, high, low, close, volume").eq("symbol", symbol).gte("date", fromDate ?? "1900-01-01").order("date").range(from, from + 999);
    if (error) break;
    out.push(...((data ?? []) as Candle[]).map((c) => ({ date: c.date, open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close), volume: Number(c.volume ?? 0) })));
    if (!data || data.length < 1000) break;
  }
  return out;
}
