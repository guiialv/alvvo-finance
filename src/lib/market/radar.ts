/**
 * Radar ALVVO: leitura da própria plataforma sobre ações para acompanhar.
 * Nota de 0 a 100 combinando qualidade, preço (comparado ao setor), momento e dividendos, só com ações líquidas.
 * Critérios objetivos e públicos — não é recomendação de investimento.
 */
import type { UniverseRow } from "./universe";

export interface RadarItem { row: UniverseRow; score: number; parts: { q: number; v: number; m: number; d: number }; reasons: string[] }

const median = (xs: number[]) => { const s = xs.filter((x) => isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
/** Percentil de x numa lista (0 a 1). */
const pctRank = (xs: number[], x: number) => (xs.length ? xs.filter((v) => v < x).length / xs.length : 0.5);
const f1 = (v: number) => v.toFixed(1).replace(".", ",");

export function radar(rows: UniverseRow[], minLiquidity: number) {
  const pool = rows.filter((r) => r.kind === "acao" && (r.liquidity ?? (r.price ?? 0) * (r.avg_volume ?? r.volume ?? 0)) >= minLiquidity && r.price);
  const bySector = new Map<string, UniverseRow[]>();
  for (const r of pool) bySector.set(r.sector ?? "-", [...(bySector.get(r.sector ?? "-") ?? []), r]);
  const secMed = new Map([...bySector].map(([k, xs]) => [k, { pe: median(xs.map((x) => (x.pe != null && x.pe > 0 ? Number(x.pe) : NaN))), pb: median(xs.map((x) => (x.pb != null && x.pb > 0 ? Number(x.pb) : NaN))) }]));
  const p6 = pool.map((r) => Number(r.perf_6m ?? r.perf_ytd ?? 0)), p12 = pool.map((r) => Number(r.perf_1y ?? 0)), dys = pool.map((r) => Number(r.dy ?? 0));

  const items: RadarItem[] = pool.map((r) => {
    const reasons: string[] = [];
    const roe = Number(r.roe ?? NaN), nm = Number(r.net_margin ?? NaN), de = Number(r.debt_equity ?? NaN), pe = Number(r.pe ?? NaN), pb = Number(r.pb ?? NaN), dy = Number(r.dy ?? 0);
    // Qualidade: rentabilidade, margem e endividamento
    const q = (isFinite(roe) ? clamp(roe / 25) * 0.5 : 0.2) + (isFinite(nm) ? clamp(nm / 20) * 0.25 : 0.1) + (isFinite(de) ? clamp(1 - de / 3) * 0.25 : 0.12);
    if (roe >= 18) reasons.push(`ROE ${f1(roe)}%`);
    // Preço: P/L e P/VP abaixo da mediana do setor
    const m = secMed.get(r.sector ?? "-")!;
    let v = 0.3;
    if (pe > 0 && isFinite(m.pe)) v = clamp(0.5 + (m.pe - pe) / (2 * m.pe)) * 0.6 + (pb > 0 && isFinite(m.pb) ? clamp(0.5 + (m.pb - pb) / (2 * m.pb)) * 0.4 : 0.2);
    if (pe > 0 && isFinite(m.pe) && pe < m.pe * 0.75) reasons.push(`P/L ${f1(pe)} (setor ${f1(m.pe)})`);
    if (!(pe > 0)) v *= 0.4; // prejuízo pesa contra
    // Momento: desempenho relativo e tendência (preço acima da média de 200 dias)
    const trend = r.sma200 && r.price ? (Number(r.price) > Number(r.sma200) ? 1 : 0) : 0.5;
    const mo = pctRank(p6, Number(r.perf_6m ?? r.perf_ytd ?? 0)) * 0.45 + pctRank(p12, Number(r.perf_1y ?? 0)) * 0.3 + trend * 0.25;
    if (trend === 1 && (r.perf_6m ?? 0) > 10) reasons.push(`+${f1(Number(r.perf_6m))}% em 6 meses`);
    // Dividendos: DY relativo, payout sustentável
    const payout = Number(r.payout ?? NaN);
    const d = dy > 0 ? pctRank(dys, dy) * (isFinite(payout) && payout > 100 ? 0.5 : 1) * (dy > 18 ? 0.6 : 1) : 0;
    if (dy >= 6 && dy <= 16) reasons.push(`DY ${f1(dy)}%`);
    const score = Math.round((q * 0.35 + v * 0.3 + mo * 0.2 + d * 0.15) * 100);
    return { row: r, score, parts: { q, v, m: mo, d }, reasons };
  });

  const top = [...items].sort((a, b) => b.score - a.score).slice(0, 8);
  const momentum = items.filter((x) => x.row.sma200 && x.row.price && Number(x.row.price) > Number(x.row.sma200) && (x.row.rsi ?? 50) < 70 && (x.row.perf_6m ?? 0) > 0)
    .sort((a, b) => Number(b.row.perf_6m ?? 0) - Number(a.row.perf_6m ?? 0)).slice(0, 5);
  const value = items.filter((x) => { const m = secMed.get(x.row.sector ?? "-")!; return (x.row.pe ?? 0) > 0 && isFinite(m.pe) && Number(x.row.pe) < m.pe * 0.75 && (x.row.roe ?? 0) >= 12 && (x.row.debt_equity ?? 0) < 2; })
    .sort((a, b) => b.parts.v + b.parts.q - (a.parts.v + a.parts.q)).slice(0, 5);
  const dividends = items.filter((x) => (x.row.dy ?? 0) >= 6 && (x.row.dy ?? 0) <= 16 && (x.row.roe ?? 0) >= 10 && !((x.row.payout ?? 0) > 100))
    .sort((a, b) => Number(b.row.dy ?? 0) - Number(a.row.dy ?? 0)).slice(0, 5);
  return { top, momentum, value, dividends, pool: pool.length };
}
