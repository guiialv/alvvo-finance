import { NextResponse } from "next/server";
import { getContext } from "@/lib/context";
import { refreshMacro, refreshNews, refreshQuotes } from "@/lib/market/refresh";
import { yahooSymbol } from "@/lib/market/sources";

/** Botão "Atualizar": busca agora taxas, Focus e as cotações da conta. */
export async function POST() {
  const ctx = await getContext();
  const [{ data: ops }, { data: wl }] = await Promise.all([
    ctx.supabase.from("inv_ops").select("ticker, cls").eq("household_id", ctx.household.id),
    ctx.supabase.from("watchlist").select("ticker").eq("household_id", ctx.household.id),
  ]);
  const symbols = [...new Set([...(ops ?? []).map((o: { ticker: string; cls: string }) => yahooSymbol(o.ticker, o.cls)), ...(wl ?? []).map((w: { ticker: string }) => yahooSymbol(w.ticker))])];
  await Promise.all([refreshMacro(), refreshQuotes(symbols), refreshNews(symbols)]);
  return NextResponse.json({ ok: true, symbols: symbols.length, at: new Date().toISOString() });
}
