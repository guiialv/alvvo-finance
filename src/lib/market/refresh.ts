import { createAdminClient } from "@/lib/supabase/admin";
import { fetchFocus, fetchHistory, fetchNews, fetchQuote, fetchSelicCdi, fetchTesouro } from "./sources";

/**
 * Atualização dos dados de mercado com cache no banco (tabelas market_*).
 * As páginas chamam ensure* ao abrir: só busca de novo se o dado estiver velho.
 */
const minutesSince = (iso?: string | null) => (iso ? (Date.now() - Date.parse(iso)) / 60000 : Infinity);
const safe = async <T,>(p: Promise<T>): Promise<T | null> => { try { return await p; } catch (e) { console.error("[mercado]", (e as Error).message); return null; } };

export async function refreshMacro() {
  const db = createAdminClient(), now = new Date().toISOString();
  const [sc, focus, tesouro] = await Promise.all([safe(fetchSelicCdi()), safe(fetchFocus()), safe(fetchTesouro())]);
  const rows: { key: string; value: unknown; ref_date: string | null; updated_at: string }[] = [];
  if (sc) rows.push({ key: "selic", value: { rate: sc.selic }, ref_date: sc.date, updated_at: now }, { key: "cdi", value: { rate: sc.cdi }, ref_date: sc.date, updated_at: now });
  if (focus?.date) rows.push({ key: "focus", value: { ipca: focus.ipca, selic: focus.selic }, ref_date: focus.date, updated_at: now });
  if (rows.length) await db.from("market_macro").upsert(rows);
  if (tesouro?.length) {
    await db.from("market_rf").delete().neq("id", "");
    await db.from("market_rf").upsert(tesouro.map((t) => ({ ...t, updated_at: now })));
  }
  await db.from("market_macro").upsert({ key: "refresh", value: { ok: !!sc, focus: !!focus, tesouro: tesouro ? tesouro.length : "sem BRAPI_TOKEN" }, ref_date: now.slice(0, 10), updated_at: now });
}

export async function ensureMacroFresh(maxMinutes = 60) {
  const db = createAdminClient();
  const { data } = await db.from("market_macro").select("updated_at").eq("key", "refresh").maybeSingle();
  if (minutesSince(data?.updated_at as string | undefined) > maxMinutes) await refreshMacro();
}

export async function refreshQuotes(symbols: string[]) {
  if (!symbols.length) return;
  const db = createAdminClient();
  const quotes = (await Promise.all(symbols.map((s) => safe(fetchQuote(s))))).filter(Boolean) as Awaited<ReturnType<typeof fetchQuote>>[];
  if (quotes.length) await db.from("market_quotes").upsert(quotes.map((q) => ({ symbol: q.symbol, name: q.name, currency: q.currency, price: q.price, prev_close: q.prevClose, market_time: q.marketTime, updated_at: new Date().toISOString() })));
}

export async function ensureQuotesFresh(symbols: string[], maxMinutes = 15) {
  if (!symbols.length) return;
  const db = createAdminClient();
  const { data } = await db.from("market_quotes").select("symbol, updated_at").in("symbol", symbols);
  const fresh = new Set((data ?? []).filter((r) => minutesSince(r.updated_at as string) <= maxMinutes).map((r) => r.symbol as string));
  await refreshQuotes(symbols.filter((s) => !fresh.has(s)));
}

export async function refreshNews(symbols: string[]) {
  if (!symbols.length) return;
  const db = createAdminClient();
  const { data: uni } = await db.from("market_universe").select("yahoo, name").in("yahoo", symbols);
  const names = new Map((uni ?? []).map((u) => [u.yahoo as string, u.name as string | null]));
  const items = (await Promise.all(symbols.map((s) => safe(fetchNews(s, names.get(s)))))).flat().filter(Boolean) as Awaited<ReturnType<typeof fetchNews>>;
  const now = new Date().toISOString();
  if (items.length) await db.from("market_news").upsert(items.map((i) => ({ ...i, fetched_at: now })), { onConflict: "id" });
}
export async function ensureNewsFresh(symbols: string[], maxMinutes = 180) {
  if (!symbols.length) return;
  const db = createAdminClient();
  const { data } = await db.from("market_news").select("symbol, fetched_at").in("symbol", symbols).order("fetched_at", { ascending: false });
  const latest = new Map<string, string>(); for (const r of data ?? []) if (!latest.has(r.symbol as string)) latest.set(r.symbol as string, r.fetched_at as string);
  await refreshNews(symbols.filter((s) => minutesSince(latest.get(s)) > maxMinutes));
}

/** Histórico completo: baixa uma vez e atualiza no máximo uma vez a cada 12 horas. */
export async function ensureHistory(symbol: string) {
  const db = createAdminClient();
  const { data: meta } = await db.from("market_history_meta").select("updated_at").eq("symbol", symbol).maybeSingle();
  if (minutesSince(meta?.updated_at as string | undefined) < 12 * 60) return;
  const candles = await safe(fetchHistory(symbol));
  if (!candles?.length) return;
  for (let i = 0; i < candles.length; i += 1000) await db.from("market_history").upsert(candles.slice(i, i + 1000).map((c) => ({ symbol, ...c })));
  await db.from("market_history_meta").upsert({ symbol, first_date: candles[0].date, updated_at: new Date().toISOString() });
}
