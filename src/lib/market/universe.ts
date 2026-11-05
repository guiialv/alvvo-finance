/**
 * Universo de ativos para o explorador de mercado.
 * - Ações, FIIs, ETFs e BDRs da B3 e ações/ETFs dos EUA: scanner público do TradingView (uma chamada por mercado,
 *   já com indicadores fundamentalistas). Uso pessoal/beta.
 * - Moedas, commodities e índices: Yahoo Finance (endpoint "spark", em lote).
 * Tudo fica em cache na tabela market_universe e é atualizado ao abrir a página (se velho) e pelo cron diário.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type Market = "BR" | "US" | "FX" | "CMD" | "IDX";
export interface UniverseRow {
  market: Market; symbol: string; yahoo: string; name: string | null; kind: string | null; sector: string | null; industry: string | null; currency: string | null;
  price: number | null; change_pct: number | null; volume: number | null; market_cap: number | null;
  pe: number | null; pb: number | null; dy: number | null; roe: number | null; net_margin: number | null; debt_equity: number | null; ev_ebitda: number | null; eps: number | null;
  perf_1m: number | null; perf_ytd: number | null; perf_1y: number | null; rsi: number | null; rating: number | null; logoid: string | null; sort: number | null; updated_at?: string;
}

const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };
const COLS = ["name", "description", "close", "change", "volume", "market_cap_basic", "sector", "industry", "price_earnings_ttm", "price_book_fq",
  "dividends_yield_current", "return_on_equity", "net_margin", "debt_to_equity", "enterprise_value_ebitda_ttm", "earnings_per_share_basic_ttm",
  "Perf.1M", "Perf.YTD", "Perf.Y", "RSI", "Recommend.All", "type", "subtype", "currency", "logoid"] as const;

const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);

const SECTOR_PT: Record<string, string> = {
  Finance: "Financeiro", "Energy Minerals": "Petróleo e gás", "Non-Energy Minerals": "Mineração e siderurgia", Utilities: "Utilidade pública",
  "Consumer Non-Durables": "Consumo não durável", "Consumer Durables": "Consumo durável", "Retail Trade": "Varejo", "Health Services": "Serviços de saúde",
  "Health Technology": "Saúde e farmacêutico", "Technology Services": "Tecnologia — serviços", "Electronic Technology": "Tecnologia — hardware",
  "Producer Manufacturing": "Bens industriais", "Process Industries": "Química, papel e agro", Transportation: "Transporte e logística",
  Communications: "Telecomunicações", "Consumer Services": "Serviços ao consumidor", "Commercial Services": "Serviços empresariais",
  "Industrial Services": "Serviços industriais", Distribution: "Distribuição", Miscellaneous: "Diversos", "Government": "Governo",
};

function kindOf(market: "BR" | "US", type: string, subtype: string, symbol: string) {
  if (type === "stock") return "acao";
  if (type === "dr") return market === "BR" ? "bdr" : "adr";
  if (type === "fund" && subtype === "etf") return "etf";
  if (type === "fund" && market === "BR" && subtype === "closedend" && /11$/.test(symbol)) return "fii";
  return "fundo";
}

async function scan(market: "brazil" | "america", filter: unknown[], range = 6000, sortBy = "market_cap_basic") {
  const res = await fetch(`https://scanner.tradingview.com/${market}/scan`, {
    method: "POST", headers: { ...UA, "content-type": "application/json" }, cache: "no-store",
    body: JSON.stringify({ columns: COLS, filter, range: [0, range], sort: { sortBy, sortOrder: "desc" } }),
  });
  if (!res.ok) throw new Error(`TradingView ${market}: ${res.status}`);
  const j = (await res.json()) as { data?: { s: string; d: unknown[] }[] };
  return j.data ?? [];
}

function toRow(market: "BR" | "US", d: unknown[], i: number): UniverseRow | null {
  const [name, description, close, change, volume, cap, sector, industry, pe, pb, dy, roe, nm, de, eve, eps, p1m, pytd, p1y, rsi, rec, type, subtype, currency, logoid] = d;
  const symbol = String(name ?? "").toUpperCase();
  if (!symbol || num(close) == null) return null;
  // B3: ignora o mercado fracionário (PETR4F) e códigos estranhos
  if (market === "BR" && (!/^[A-Z0-9]{4}\d{1,2}[A-Z]?$/.test(symbol) || /F$/.test(symbol))) return null;
  const kind = kindOf(market, String(type ?? ""), String(subtype ?? ""), symbol);
  return {
    market, symbol, yahoo: market === "BR" ? `${symbol}.SA` : symbol.replace(".", "-"), name: (description as string) ?? null, kind,
    sector: sector ? SECTOR_PT[String(sector)] ?? String(sector) : null, industry: (industry as string) ?? null, currency: (currency as string) ?? (market === "BR" ? "BRL" : "USD"),
    price: num(close), change_pct: num(change), volume: num(volume), market_cap: num(cap), pe: num(pe), pb: num(pb), dy: num(dy), roe: num(roe),
    net_margin: num(nm), debt_equity: num(de), ev_ebitda: num(eve), eps: num(eps), perf_1m: num(p1m), perf_ytd: num(pytd), perf_1y: num(p1y),
    rsi: num(rsi), rating: num(rec), logoid: (logoid as string) ?? null, sort: i,
  };
}

/** Moedas, commodities e índices acompanhados (símbolo Yahoo → nome em português). */
export const MACRO_LIST: { market: Market; yahoo: string; symbol: string; name: string; kind: string; currency: string }[] = [
  ...([
    ["USDBRL=X", "USD/BRL", "Dólar americano", "BRL"], ["EURBRL=X", "EUR/BRL", "Euro", "BRL"], ["GBPBRL=X", "GBP/BRL", "Libra esterlina", "BRL"],
    ["CHFBRL=X", "CHF/BRL", "Franco suíço", "BRL"], ["JPYBRL=X", "JPY/BRL", "Iene japonês", "BRL"], ["CADBRL=X", "CAD/BRL", "Dólar canadense", "BRL"],
    ["AUDBRL=X", "AUD/BRL", "Dólar australiano", "BRL"], ["CNYBRL=X", "CNY/BRL", "Yuan chinês", "BRL"], ["ARSBRL=X", "ARS/BRL", "Peso argentino", "BRL"],
    ["MXNBRL=X", "MXN/BRL", "Peso mexicano", "BRL"], ["EURUSD=X", "EUR/USD", "Euro × dólar", "USD"], ["GBPUSD=X", "GBP/USD", "Libra × dólar", "USD"],
    ["USDJPY=X", "USD/JPY", "Dólar × iene", "JPY"], ["DX-Y.NYB", "DXY", "Índice dólar (DXY)", "USD"],
    ["BTC-BRL", "BTC/BRL", "Bitcoin", "BRL"], ["ETH-BRL", "ETH/BRL", "Ethereum", "BRL"], ["SOL-USD", "SOL/USD", "Solana", "USD"], ["BTC-USD", "BTC/USD", "Bitcoin em dólar", "USD"],
  ] as const).map(([yahoo, symbol, name, currency]) => ({ market: "FX" as Market, yahoo, symbol, name, kind: /BTC|ETH|SOL/.test(symbol) ? "cripto" : "moeda", currency })),
  ...([
    ["GC=F", "Ouro", "Metais"], ["SI=F", "Prata", "Metais"], ["PL=F", "Platina", "Metais"], ["HG=F", "Cobre", "Metais"], ["TIO=F", "Minério de ferro", "Metais"],
    ["CL=F", "Petróleo WTI", "Energia"], ["BZ=F", "Petróleo Brent", "Energia"], ["NG=F", "Gás natural", "Energia"], ["RB=F", "Gasolina (RBOB)", "Energia"],
    ["ZS=F", "Soja", "Agrícolas"], ["ZC=F", "Milho", "Agrícolas"], ["ZW=F", "Trigo", "Agrícolas"], ["KC=F", "Café arábica", "Agrícolas"],
    ["SB=F", "Açúcar", "Agrícolas"], ["CC=F", "Cacau", "Agrícolas"], ["CT=F", "Algodão", "Agrícolas"], ["OJ=F", "Suco de laranja", "Agrícolas"],
    ["LE=F", "Boi gordo (CME)", "Pecuária"], ["HE=F", "Suíno (CME)", "Pecuária"],
  ] as const).map(([yahoo, name, sector]) => ({ market: "CMD" as Market, yahoo, symbol: yahoo, name, kind: sector, currency: "USD" })),
  ...([
    ["^BVSP", "IBOV", "Ibovespa", "BRL"], ["^GSPC", "S&P 500", "S&P 500", "USD"], ["^IXIC", "NASDAQ", "Nasdaq Composite", "USD"], ["^DJI", "DOW", "Dow Jones", "USD"],
    ["^RUT", "RUSSELL", "Russell 2000", "USD"], ["^VIX", "VIX", "Volatilidade (VIX)", "USD"], ["^STOXX50E", "STOXX50", "Euro Stoxx 50", "EUR"],
    ["^GDAXI", "DAX", "DAX (Alemanha)", "EUR"], ["^FTSE", "FTSE", "FTSE 100 (Reino Unido)", "GBP"], ["^N225", "NIKKEI", "Nikkei 225 (Japão)", "JPY"],
    ["000001.SS", "SHANGHAI", "Xangai Composto", "CNY"], ["^HSI", "HANG SENG", "Hang Seng (Hong Kong)", "HKD"],
  ] as const).map(([yahoo, symbol, name, currency]) => ({ market: "IDX" as Market, yahoo, symbol, name, kind: "indice", currency })),
];

async function spark(symbols: string[]) {
  const out = new Map<string, { price: number | null; prev: number | null }>();
  for (let i = 0; i < symbols.length; i += 15) {
    const part = symbols.slice(i, i + 15);
    try {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${part.map(encodeURIComponent).join(",")}&range=1d&interval=1d`, { headers: UA, cache: "no-store" });
      if (!res.ok) continue;
      const j = (await res.json()) as Record<string, { close?: (number | null)[]; chartPreviousClose?: number | null }>;
      for (const [k, v] of Object.entries(j)) out.set(k, { price: v.close?.filter((x) => x != null).pop() ?? null, prev: v.chartPreviousClose ?? null });
    } catch { /* segue com o restante */ }
  }
  return out;
}

export async function refreshUniverse(): Promise<{ br: number; us: number; macro: number }> {
  const db = createAdminClient(), now = new Date().toISOString();
  const [br, us, usEtf, sp] = await Promise.all([
    scan("brazil", [{ left: "type", operation: "in_range", right: ["stock", "dr", "fund"] }], 4000, "volume").catch(() => []),
    scan("america", [{ left: "type", operation: "in_range", right: ["stock", "dr", "fund"] }, { left: "exchange", operation: "in_range", right: ["NASDAQ", "NYSE", "AMEX"] },
      { left: "is_primary", operation: "equal", right: true }, { left: "market_cap_basic", operation: "greater", right: 150_000_000 }], 6000).catch(() => []),
    scan("america", [{ left: "type", operation: "equal", right: "fund" }, { left: "subtype", operation: "equal", right: "etf" }], 600, "volume").catch(() => []),
    spark(MACRO_LIST.map((m) => m.yahoo)),
  ]);
  const rows: UniverseRow[] = [];
  const seen = new Set<string>();
  const push = (r: UniverseRow | null) => { if (r && !seen.has(`${r.market}|${r.symbol}`)) { seen.add(`${r.market}|${r.symbol}`); rows.push(r); } };
  br.forEach((x, i) => push(toRow("BR", x.d, i)));
  const nBr = rows.length;
  [...us, ...usEtf].forEach((x, i) => push(toRow("US", x.d, i)));
  const nUs = rows.length - nBr;
  MACRO_LIST.forEach((m, i) => {
    const q = sp.get(m.yahoo);
    if (!q?.price && !q?.prev) return;
    const price = q.price ?? q.prev;
    push({
      market: m.market, symbol: m.symbol, yahoo: m.yahoo, name: m.name, kind: m.kind, sector: m.market === "CMD" ? m.kind : null, industry: null, currency: m.currency,
      price, change_pct: q.prev && price ? (price / q.prev - 1) * 100 : null, volume: null, market_cap: null, pe: null, pb: null, dy: null, roe: null, net_margin: null,
      debt_equity: null, ev_ebitda: null, eps: null, perf_1m: null, perf_ytd: null, perf_1y: null, rsi: null, rating: null, logoid: null, sort: i,
    });
  });
  for (let i = 0; i < rows.length; i += 800) {
    const { error } = await db.from("market_universe").upsert(rows.slice(i, i + 800).map((r) => ({ ...r, updated_at: now })), { onConflict: "market,symbol" });
    if (error) throw new Error(error.message);
  }
  // Remove o que saiu de listagem há mais de 10 dias
  await db.from("market_universe").delete().in("market", ["BR", "US"]).lt("updated_at", new Date(Date.now() - 10 * 86400000).toISOString());
  await db.from("market_macro").upsert({ key: "universe", value: { br: nBr, us: nUs, macro: rows.length - nBr - nUs }, ref_date: now.slice(0, 10), updated_at: now });
  return { br: nBr, us: nUs, macro: rows.length - nBr - nUs };
}

/** Atualiza se o último refresh tiver mais de `maxMinutes` (as cotações do scanner têm atraso de ~15 min). */
export async function ensureUniverseFresh(maxMinutes = 20) {
  const db = createAdminClient();
  const { data } = await db.from("market_macro").select("updated_at").eq("key", "universe").maybeSingle();
  const age = data?.updated_at ? (Date.now() - Date.parse(data.updated_at as string)) / 60000 : Infinity;
  if (age > maxMinutes) { try { await refreshUniverse(); } catch (e) { console.error("[universo]", (e as Error).message); } }
  return age;
}

export const KIND_LABEL: Record<string, string> = { acao: "Ação", fii: "FII", etf: "ETF", bdr: "BDR", adr: "ADR", fundo: "Fundo", moeda: "Moeda", cripto: "Cripto", indice: "Índice" };
