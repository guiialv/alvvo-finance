/**
 * Fontes de dados de mercado (só servidor).
 * - Cotações e histórico: Yahoo Finance (endpoint público de gráfico; uso pessoal/beta).
 * - Notícias: RSS do Yahoo Finance por ativo.
 * - Selic, CDI: Banco Central (SGS). Focus: Banco Central (Olinda).
 * - Tesouro Direto: brapi.dev (/api/v2/treasury, precisa de BRAPI_TOKEN de plano pago). Sem token, mantém os últimos dados salvos.
 */
const UA = { "user-agent": "Mozilla/5.0 (compatible; ALVVO-Finance/1.0)" };

/** Ticker da plataforma → símbolo do Yahoo. */
export function yahooSymbol(ticker: string, cls?: string): string {
  const t = ticker.trim().toUpperCase();
  if (cls === "cripto" || /^(BTC|ETH|SOL|USDT|ADA|XRP|BNB|DOGE)$/.test(t)) return `${t}-BRL`;
  if (/^[A-Z]{4}\d{1,2}[A-Z]?$/.test(t)) return `${t}.SA`;
  return t;
}

export interface Candle { date: string; open: number; high: number; low: number; close: number; volume: number }
export interface Quote { symbol: string; name: string | null; currency: string | null; price: number | null; prevClose: number | null; marketTime: string | null }

async function yahooChart(symbol: string, range: string, interval: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includeAdjustedClose=true&events=div,split`;
  const res = await fetch(url, { headers: UA, cache: "no-store" });
  if (!res.ok) throw new Error(`Yahoo ${symbol}: ${res.status}`);
  const j = (await res.json()) as { chart: { result?: YahooResult[]; error?: { description: string } } };
  const r = j.chart.result?.[0];
  if (!r) throw new Error(j.chart.error?.description ?? `Yahoo ${symbol}: sem dados`);
  return r;
}
interface YahooResult {
  meta: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number; currency?: string; longName?: string; shortName?: string; regularMarketTime?: number };
  timestamp?: number[];
  indicators: { quote: { open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }[]; adjclose?: { adjclose: (number | null)[] }[] };
}

export async function fetchQuote(symbol: string): Promise<Quote> {
  const r = await yahooChart(symbol, "5d", "1d");
  const m = r.meta;
  return { symbol, name: m.longName ?? m.shortName ?? null, currency: m.currency ?? null, price: m.regularMarketPrice ?? null, prevClose: m.chartPreviousClose ?? m.previousClose ?? null, marketTime: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null };
}

/** Histórico diário completo (desde o primeiro pregão), ajustado por proventos e desdobramentos. */
export async function fetchHistory(symbol: string): Promise<Candle[]> {
  const r = await yahooChart(symbol, "max", "1d");
  const q = r.indicators.quote[0], adj = r.indicators.adjclose?.[0]?.adjclose;
  const out: Candle[] = [];
  (r.timestamp ?? []).forEach((ts, i) => {
    const c = q.close[i], o = q.open[i], h = q.high[i], l = q.low[i];
    if (c == null || o == null || h == null || l == null) return;
    const f = adj?.[i] != null && c ? (adj[i] as number) / c : 1;
    out.push({ date: new Date(ts * 1000).toISOString().slice(0, 10), open: o * f, high: h * f, low: l * f, close: c * f, volume: q.volume[i] ?? 0 });
  });
  return out;
}

export interface NewsItem { id: string; symbol: string; title: string; url: string; source: string | null; published_at: string | null }
export async function fetchNews(symbol: string): Promise<NewsItem[]> {
  const res = await fetch(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=BR&lang=pt-BR`, { headers: UA, cache: "no-store" });
  if (!res.ok) return [];
  const xml = await res.text();
  const tag = (s: string, t: string) => s.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`))?.[1]?.trim() ?? null;
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 15).map(([, it]) => {
    const url = tag(it, "link") ?? "", title = tag(it, "title") ?? "";
    const pub = tag(it, "pubDate");
    return { id: `${symbol}|${url}`.slice(0, 500), symbol, title, url, source: tag(it, "source") ?? "Yahoo Finance", published_at: pub ? new Date(pub).toISOString() : null };
  }).filter((n) => n.title && n.url.startsWith("http"));
}

/** Selic meta (SGS 432) e CDI anualizado (SGS 4389), em % a.a. */
export async function fetchSelicCdi(): Promise<{ selic: number; cdi: number; date: string }> {
  const get = async (code: number) => {
    const res = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/1?formato=json`, { cache: "no-store" });
    if (!res.ok) throw new Error(`BCB SGS ${code}: ${res.status}`);
    const [row] = (await res.json()) as { data: string; valor: string }[];
    return { v: Number(row.valor), d: row.data.split("/").reverse().join("-") };
  };
  const [s, c] = await Promise.all([get(432), get(4389)]);
  return { selic: s.v, cdi: c.v, date: c.d };
}

/** Focus: mediana anual de IPCA e Selic para o ano corrente e o seguinte. */
export async function fetchFocus(): Promise<{ date: string; ipca: Record<string, number>; selic: Record<string, number> }> {
  const y = new Date().getFullYear();
  const get = async (ind: string) => {
    const filter = encodeURIComponent(`Indicador eq '${ind}' and baseCalculo eq 0 and (DataReferencia eq '${y}' or DataReferencia eq '${y + 1}' or DataReferencia eq '${y + 2}')`);
    const url = `https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$top=12&$filter=${filter}&$orderby=Data%20desc&$format=json&$select=Indicador,Data,DataReferencia,Mediana`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Focus ${ind}: ${res.status}`);
    const rows = ((await res.json()) as { value: { Data: string; DataReferencia: string; Mediana: number }[] }).value;
    const last = rows[0]?.Data;
    return { date: last, v: Object.fromEntries(rows.filter((r) => r.Data === last).map((r) => [r.DataReferencia, r.Mediana])) as Record<string, number> };
  };
  const [ipca, selic] = await Promise.all([get("IPCA"), get("Selic")]);
  return { date: ipca.date ?? selic.date, ipca: ipca.v, selic: selic.v };
}

export interface RfTitle { id: string; name: string; index: "selic" | "pre" | "ipca"; rate: number; maturity: string; min_investment: number | null; unit_price: number | null; grp: string; coupon: boolean; ref_date: string }
/** Títulos do Tesouro Direto à venda (brapi.dev). Retorna null sem BRAPI_TOKEN. */
export async function fetchTesouro(): Promise<RfTitle[] | null> {
  const token = process.env.BRAPI_TOKEN;
  if (!token) return null;
  const all: RfTitle[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`https://brapi.dev/api/v2/treasury/list?limit=100&page=${page}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) throw new Error(`brapi treasury: ${res.status}`);
    const j = (await res.json()) as { results: { symbol: string; bondType: string; indexer?: string; couponType?: string; maturityDate: string; baseDate: string; buyRate: number | null; buyPrice: number | null }[]; pagination?: { hasNextPage?: boolean } };
    for (const r of j.results) {
      if (r.buyRate == null || !r.buyPrice) continue; // só o que está à venda
      const name = `${r.bondType} ${r.maturityDate.slice(0, 4)}`, low = r.bondType.toLowerCase();
      const index = low.includes("selic") || low.includes("reserva") ? "selic" : low.includes("prefixado") ? "pre" : "ipca";
      const grp = low.includes("renda") ? "renda" : low.includes("educa") ? "educa" : index === "selic" ? "pos" : index;
      all.push({ id: r.symbol, name, index, rate: r.buyRate, maturity: r.maturityDate.slice(0, 10), min_investment: Math.round(r.buyPrice) / 100, unit_price: r.buyPrice, grp, coupon: /semestra/i.test(r.bondType) || r.couponType === "semiannual", ref_date: r.baseDate.slice(0, 10) });
    }
    if (!j.pagination?.hasNextPage) break;
  }
  return all;
}
