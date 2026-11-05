import type { Ctx } from "@/lib/context";
import { ensureMacroFresh, ensureQuotesFresh } from "./refresh";

export interface Macro { selic: number; cdi: number; focus: { ipca: Record<string, number>; selic: Record<string, number> }; focusDate: string | null; refDate: string | null; updatedAt: string | null }

/** Selic, CDI e Focus do cache (atualiza antes se tiver mais de 1 hora). */
export async function getMacro(ctx: Ctx, refresh = true): Promise<Macro> {
  if (refresh) { try { await ensureMacroFresh(60); } catch (e) { console.error("[macro]", (e as Error).message); } }
  const { data } = await ctx.supabase.from("market_macro").select("key, value, ref_date, updated_at");
  const by = Object.fromEntries((data ?? []).map((r: { key: string }) => [r.key, r])) as unknown as Record<string, { value: Record<string, unknown>; ref_date: string | null; updated_at: string }>;
  const y = String(new Date().getFullYear());
  const focus = (by.focus?.value ?? { ipca: { [y]: 4.5 }, selic: { [y]: 13.5 } }) as Macro["focus"];
  return {
    selic: Number(by.selic?.value?.rate ?? 13.75), cdi: Number(by.cdi?.value?.rate ?? 13.65), focus, focusDate: by.focus?.ref_date ?? null,
    refDate: by.cdi?.ref_date ?? null, updatedAt: by.refresh?.updated_at ?? by.cdi?.updated_at ?? null,
  };
}
/** IPCA de referência: Focus do ano seguinte (ou do ano corrente). */
export const ipcaRef = (m: Macro) => { const y = new Date().getFullYear(); return m.focus.ipca[String(y + 1)] ?? m.focus.ipca[String(y)] ?? 4.5; };

export async function getQuotes(ctx: Ctx, symbols: string[], refresh = true) {
  if (refresh) { try { await ensureQuotesFresh(symbols); } catch (e) { console.error("[cotações]", (e as Error).message); } }
  if (!symbols.length) return {} as Record<string, { price: number | null; prev_close: number | null; name: string | null; updated_at: string }>;
  const { data } = await ctx.supabase.from("market_quotes").select("symbol, price, prev_close, name, updated_at").in("symbol", symbols);
  return Object.fromEntries((data ?? []).map((q: { symbol: string }) => [q.symbol, q])) as unknown as Record<string, { price: number | null; prev_close: number | null; name: string | null; updated_at: string }>;
}
