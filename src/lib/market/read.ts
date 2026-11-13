import type { Ctx } from "@/lib/context";
import { after } from "next/server";
import { ensureMacroFresh, refreshQuotes } from "./refresh";

const minutesSince = (iso?: string | null) => (iso ? (Date.now() - Date.parse(iso)) / 60000 : Infinity);
/** Roda depois da resposta (a página não espera). Fora de uma requisição, roda já. */
function later(fn: () => Promise<unknown>) {
  try { after(() => fn().then(() => undefined).catch((e) => console.error("[mercado]", (e as Error).message))); }
  catch { void fn().catch(() => undefined); }
}

export interface Macro { selic: number; cdi: number; focus: { ipca: Record<string, number>; selic: Record<string, number> }; focusDate: string | null; refDate: string | null; updatedAt: string | null }

/** Selic, CDI e Focus do cache (atualiza antes se tiver mais de 1 hora). */
export { later };
export async function getMacro(ctx: Ctx, refresh = true): Promise<Macro> {
  // Mostra o que já está guardado; se estiver velho, atualiza em segundo plano (só espera na primeira vez)
  let { data } = await ctx.supabase.from("market_macro").select("key, value, ref_date, updated_at");
  if (refresh) {
    const rows = (data ?? []) as { key: string; updated_at: string }[];
    const stamp = rows.find((r) => r.key === "refresh")?.updated_at ?? rows.find((r) => r.key === "cdi")?.updated_at;
    if (!rows.some((r) => r.key === "cdi")) {
      try { await ensureMacroFresh(60); ({ data } = await ctx.supabase.from("market_macro").select("key, value, ref_date, updated_at")); } catch (e) { console.error("[macro]", (e as Error).message); }
    } else if (minutesSince(stamp) > 60) later(() => ensureMacroFresh(60));
  }
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
  if (!symbols.length) return {} as Record<string, { price: number | null; prev_close: number | null; name: string | null; updated_at: string }>;
  const read = () => ctx.supabase.from("market_quotes").select("symbol, price, prev_close, name, updated_at").in("symbol", symbols);
  let { data } = await read();
  if (refresh) {
    const have = new Map(((data ?? []) as { symbol: string; updated_at: string }[]).map((q) => [q.symbol, q.updated_at]));
    const missing = symbols.filter((s) => !have.has(s));
    const stale = symbols.filter((s) => have.has(s) && minutesSince(have.get(s)) > 15);
    // Ativo novo, sem cotação: busca agora. Cotação velha: mostra a guardada e atualiza em segundo plano.
    if (missing.length) { try { await refreshQuotes(missing); ({ data } = await read()); } catch (e) { console.error("[cotações]", (e as Error).message); } }
    if (stale.length) later(() => refreshQuotes(stale));
  }
  return Object.fromEntries((data ?? []).map((q: { symbol: string }) => [q.symbol, q])) as unknown as Record<string, { price: number | null; prev_close: number | null; name: string | null; updated_at: string }>;
}
