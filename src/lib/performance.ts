/**
 * Desempenho de um ativo contra referências (Ibovespa, CDI, S&P 500, dólar ou outro ativo), risco e pontos de atenção.
 */
import type { Candle } from "@/lib/technical";
import type { UniverseRow } from "@/lib/market/universe";

export const PERIODS = [["1M", "1M"], ["6M", "6M"], ["YTD", "No ano"], ["1A", "1A"], ["5A", "5A"], ["10A", "10A"]] as const;
export type Period = (typeof PERIODS)[number][0];

export const BENCHMARKS: { id: string; label: string; yahoo?: string }[] = [
  { id: "IBOV", label: "Ibovespa", yahoo: "^BVSP" }, { id: "CDI", label: "CDI" }, { id: "SPX", label: "S&P 500", yahoo: "^GSPC" },
  { id: "USD", label: "Dólar", yahoo: "USDBRL=X" }, { id: "OURO", label: "Ouro", yahoo: "GC=F" }, { id: "IVVB11", label: "IVVB11", yahoo: "IVVB11.SA" },
];

export function periodStart(period: Period, last: string): string {
  const d = new Date(`${last}T12:00:00Z`);
  if (period === "YTD") return `${last.slice(0, 4)}-01-01`;
  const months = { "1M": 1, "6M": 6, "1A": 12, "5A": 60, "10A": 120 }[period];
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

export interface Point { date: string; v: number }
/** Série em % acumulado desde o início do período. */
export function normalize(candles: { date: string; close: number }[], start: string): Point[] {
  const xs = candles.filter((c) => c.date >= start && isFinite(c.close) && c.close > 0);
  if (xs.length < 2) return [];
  const b = xs[0].close;
  return xs.map((c) => ({ date: c.date, v: c.close / b - 1 }));
}

/** CDI diário (SGS 12, Banco Central) acumulado como índice. Cache de 12 horas. */
export async function cdiIndex(start: string, end: string): Promise<{ date: string; close: number }[]> {
  const br = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  // A API limita séries diárias a 10 anos por consulta
  const s = start < new Date(Date.parse(end) - 3650 * 86400000).toISOString().slice(0, 10) ? new Date(Date.parse(end) - 3650 * 86400000).toISOString().slice(0, 10) : start;
  try {
    const res = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${br(s)}&dataFinal=${br(end)}`, { next: { revalidate: 43200 } } as RequestInit);
    if (!res.ok) return [];
    const rows = (await res.json()) as { data: string; valor: string }[];
    let idx = 1;
    return rows.map((r) => { idx *= 1 + Number(r.valor) / 100; const [d, m, y] = r.data.split("/"); return { date: `${y}-${m}-${d}`, close: idx }; });
  } catch { return []; }
}

/** Volatilidade anualizada dos últimos 252 pregões, queda desde a máxima de 12 meses. */
export function riskStats(candles: Candle[]) {
  const xs = candles.slice(-253);
  if (xs.length < 30) return { vol: null as number | null, fromHigh: null as number | null, high: null as number | null, ret12: null as number | null };
  const rets = xs.slice(1).map((c, i) => Math.log(c.close / xs[i].close)).filter((x) => isFinite(x));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const vol = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1)) * Math.sqrt(252);
  const high = Math.max(...xs.map((c) => c.high || c.close));
  const last = xs[xs.length - 1].close;
  return { vol, fromHigh: last / high - 1, high, ret12: last / xs[0].close - 1 };
}

export function riskLabel(vol: number | null) {
  if (vol == null) return null;
  return vol < 0.15 ? "Baixo" : vol < 0.25 ? "Moderado" : vol < 0.4 ? "Volátil" : "Muito volátil";
}

export interface Flag { level: "alto" | "medio" | "info"; title: string; text: string }

/** Pontos de atenção automáticos (critérios objetivos; não são recomendação). */
export function attentionPoints(u: UniverseRow | null, risk: ReturnType<typeof riskStats>, benchRet12: number | null, benchLabel: string): Flag[] {
  const f: Flag[] = [];
  const pc = (v: number) => `${(v * 100).toFixed(0)}%`;
  if (risk.ret12 != null && benchRet12 != null && risk.ret12 - benchRet12 < -0.15)
    f.push({ level: "alto", title: `Abaixo do ${benchLabel} em 12 meses`, text: `Rendeu ${pc(risk.ret12)} contra ${pc(benchRet12)} do ${benchLabel} — ${((benchRet12 - risk.ret12) * 100).toFixed(0)} p.p. atrás.` });
  if (risk.fromHigh != null && risk.fromHigh < -0.3) f.push({ level: "alto", title: "Muito abaixo da máxima de 12 meses", text: `Está ${pc(-risk.fromHigh)} abaixo do maior preço do último ano.` });
  if (risk.vol != null && risk.vol > 0.45) f.push({ level: "medio", title: "Volatilidade elevada", text: `Oscila cerca de ${pc(risk.vol)} ao ano — espere movimentos fortes.` });
  if (u && (u.market === "BR" || u.market === "US")) {
    const isFund = u.kind === "fii" || u.kind === "etf" || u.kind === "fundo";
    if (!isFund && u.eps != null && u.eps < 0) f.push({ level: "alto", title: "Prejuízo nos últimos 12 meses", text: "O lucro por ação está negativo; P/L não se aplica." });
    if (!isFund && u.debt_equity != null && u.debt_equity > 2) f.push({ level: "medio", title: "Endividamento elevado", text: `Dívida equivale a ${Number(u.debt_equity).toFixed(1).replace(".", ",")}× o patrimônio.` });
    if (u.pb != null && u.pb < 0) f.push({ level: "alto", title: "Patrimônio líquido negativo", text: "A empresa deve mais do que tem de patrimônio." });
    if (u.dy != null && u.dy > (u.kind === "fii" ? 16 : 14)) f.push({ level: "medio", title: "Dividend yield muito alto", text: `DY de ${Number(u.dy).toFixed(1).replace(".", ",")}%: confira se foi um pagamento extraordinário e se é recorrente.` });
    if (u.kind === "fii" && u.pb != null && u.pb > 1.15) f.push({ level: "medio", title: "Acima do valor patrimonial", text: `Negociado a ${Number(u.pb).toFixed(2).replace(".", ",")}× o valor patrimonial das cotas.` });
    if (u.price != null && u.volume != null && u.price * u.volume < (u.market === "BR" ? 1_000_000 : 5_000_000))
      f.push({ level: "medio", title: "Baixa liquidez", text: "Pouco volume negociado por dia: comprar ou vender pode mover o preço." });
    if (u.rsi != null && u.rsi > 72) f.push({ level: "info", title: "Sobrecomprado no curto prazo", text: `IFR (14) em ${Number(u.rsi).toFixed(0)}.` });
    if (u.rsi != null && u.rsi < 28) f.push({ level: "info", title: "Sobrevendido no curto prazo", text: `IFR (14) em ${Number(u.rsi).toFixed(0)}.` });
  }
  return f;
}
