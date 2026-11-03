import { createAdminClient } from "@/lib/supabase/admin";
import { yahooSymbol } from "./sources";

/** Todos os símbolos que alguma conta tem, teve ou acompanha (para o cron). */
export async function allSymbols(): Promise<string[]> {
  const db = createAdminClient();
  const [{ data: ops }, { data: wl }] = await Promise.all([db.from("inv_ops").select("ticker, cls"), db.from("watchlist").select("ticker")]);
  return [...new Set([...(ops ?? []).map((o) => yahooSymbol(o.ticker as string, o.cls as string)), ...(wl ?? []).map((w) => yahooSymbol(w.ticker as string))])];
}
