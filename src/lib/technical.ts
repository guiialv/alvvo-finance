/**
 * Indicadores técnicos e resumo de sinais no estilo do Investing.com
 * ("Venda forte" … "Compra forte"), além de preço justo fundamentalista.
 * Funções puras: recebem séries de preços e devolvem números.
 */

export interface Candle { date: string; open: number; high: number; low: number; close: number; volume: number }
export type Signal = "compra" | "venda" | "neutro";

export const sma = (v: number[], n: number) => v.map((_, i) => (i + 1 < n ? NaN : v.slice(i + 1 - n, i + 1).reduce((a, b) => a + b, 0) / n));
export function ema(v: number[], n: number): number[] {
  const k = 2 / (n + 1); const out: number[] = []; let prev = NaN;
  v.forEach((x, i) => {
    if (i + 1 < n) { out.push(NaN); return; }
    prev = i + 1 === n ? v.slice(0, n).reduce((a, b) => a + b, 0) / n : x * k + prev * (1 - k);
    out.push(prev);
  });
  return out;
}
export function rsi(v: number[], n = 14): number[] {
  const out: number[] = [NaN]; let g = 0, l = 0;
  for (let i = 1; i < v.length; i++) {
    const d = v[i] - v[i - 1], up = Math.max(0, d), dn = Math.max(0, -d);
    if (i <= n) { g += up; l += dn; out.push(i === n ? 100 - 100 / (1 + (g / n) / ((l / n) || 1e-9)) : NaN); if (i === n) { g /= n; l /= n; } continue; }
    g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n;
    out.push(100 - 100 / (1 + g / (l || 1e-9)));
  }
  return out;
}
export function macd(v: number[], f = 12, s = 26, sig = 9) {
  const ef = ema(v, f), es = ema(v, s);
  const line = v.map((_, i) => ef[i] - es[i]);
  const valid = line.map((x) => (isNaN(x) ? 0 : x));
  const firstValid = line.findIndex((x) => !isNaN(x));
  const sl = ema(valid.slice(firstValid), sig);
  const signal = line.map((_, i) => (i < firstValid ? NaN : sl[i - firstValid]));
  return { line, signal, hist: line.map((x, i) => x - signal[i]) };
}
export function bollinger(v: number[], n = 20, k = 2) {
  const m = sma(v, n);
  const sd = v.map((_, i) => (i + 1 < n ? NaN : Math.sqrt(v.slice(i + 1 - n, i + 1).reduce((a, x) => a + (x - m[i]) ** 2, 0) / n)));
  return { mid: m, upper: m.map((x, i) => x + k * sd[i]), lower: m.map((x, i) => x - k * sd[i]) };
}
export function stochastic(c: Candle[], n = 14) {
  return c.map((_, i) => {
    if (i + 1 < n) return NaN;
    const w = c.slice(i + 1 - n, i + 1), hi = Math.max(...w.map((x) => x.high)), lo = Math.min(...w.map((x) => x.low));
    return hi === lo ? 50 : ((c[i].close - lo) / (hi - lo)) * 100;
  });
}

export interface TechSummary {
  ma: { label: string; value: number; signal: Signal }[];
  ind: { label: string; value: number; signal: Signal }[];
  maVerdict: string; indVerdict: string; verdict: string; score: number; // -1..1
  support: number; resistance: number;
}
const verdictOf = (buy: number, sell: number, total: number) => {
  const s = (buy - sell) / (total || 1);
  return s >= 0.6 ? "Compra forte" : s >= 0.2 ? "Compra" : s <= -0.6 ? "Venda forte" : s <= -0.2 ? "Venda" : "Neutro";
};

/** Resumo técnico: médias móveis (preço acima = compra) + osciladores. */
export function techSummary(c: Candle[]): TechSummary {
  const close = c.map((x) => x.close), last = close[close.length - 1];
  const ma = [5, 10, 20, 50, 100, 200].filter((n) => close.length >= n).map((n) => {
    const v = sma(close, n).at(-1)!;
    return { label: `MMS ${n}`, value: v, signal: (last > v * 1.002 ? "compra" : last < v * 0.998 ? "venda" : "neutro") as Signal };
  });
  const r = rsi(close).at(-1)!, m = macd(close), st = stochastic(c).at(-1)!;
  const roc = (last / close[Math.max(0, close.length - 13)] - 1) * 100;
  const ind = [
    { label: "RSI (14)", value: r, signal: (r < 30 ? "compra" : r > 70 ? "venda" : r > 55 ? "compra" : r < 45 ? "venda" : "neutro") as Signal },
    { label: "MACD (12,26)", value: m.line.at(-1)!, signal: (m.hist.at(-1)! > 0 ? "compra" : "venda") as Signal },
    { label: "Estocástico (14)", value: st, signal: (st < 20 ? "compra" : st > 80 ? "venda" : "neutro") as Signal },
    { label: "ROC (12)", value: roc, signal: (roc > 1 ? "compra" : roc < -1 ? "venda" : "neutro") as Signal },
  ];
  const cnt = (a: { signal: Signal }[], s: Signal) => a.filter((x) => x.signal === s).length;
  const mb = cnt(ma, "compra"), msl = cnt(ma, "venda"), ib = cnt(ind, "compra"), isl = cnt(ind, "venda");
  const w = c.slice(-60);
  return {
    ma, ind,
    maVerdict: verdictOf(mb, msl, ma.length), indVerdict: verdictOf(ib, isl, ind.length),
    verdict: verdictOf(mb + ib, msl + isl, ma.length + ind.length),
    score: (mb + ib - msl - isl) / (ma.length + ind.length || 1),
    support: Math.min(...w.map((x) => x.low)), resistance: Math.max(...w.map((x) => x.high)),
  };
}

/** Preço justo de Graham: √(22,5 × LPA × VPA). Bazin: dividendo anual ÷ 6%. */
export function fairValues(f: { price: number; pl?: number | null; pvp?: number | null; dy?: number | null; lpa?: number | null; vpa?: number | null }) {
  const lpa = f.lpa ?? (f.pl ? f.price / f.pl : null);
  const vpa = f.vpa ?? (f.pvp ? f.price / f.pvp : null);
  const graham = lpa && vpa && lpa > 0 && vpa > 0 ? Math.sqrt(22.5 * lpa * vpa) : null;
  const bazin = f.dy ? ((f.dy / 100) * f.price) / 0.06 : null;
  return { lpa, vpa, graham, bazin };
}

export interface Suggestion { action: "Compra" | "Neutro" | "Venda"; score: number; reasons: string[]; buyTarget: number | null; sellTarget: number | null }

/**
 * Sugestão combinada (explicável): técnico + preço justo + consenso de analistas + seus alvos.
 * Não é recomendação de investimento; serve para priorizar o que olhar.
 */
export function suggest(price: number, t: TechSummary | null, fair: { graham: number | null; bazin: number | null }, analystTargets: number[], my: { buy?: number | null; sell?: number | null }): Suggestion {
  const reasons: string[] = []; let score = 0;
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;
  if (t) {
    score += t.score * 1.5;
    reasons.push(`Técnico: ${t.verdict.toLowerCase()} (${t.ma.filter((m) => m.signal === "compra").length}/${t.ma.length} médias com preço acima; RSI ${t.ind[0].value.toFixed(0)}).`);
  }
  const fv = [fair.graham, fair.bazin].filter((x): x is number => !!x);
  if (fv.length) {
    const avg = fv.reduce((a, b) => a + b, 0) / fv.length, up = avg / price - 1;
    score += up > 0.25 ? 1 : up > 0.1 ? 0.5 : up < -0.15 ? -1 : up < 0 ? -0.5 : 0;
    reasons.push(`Preço justo médio (${fair.graham ? "Graham" : ""}${fair.graham && fair.bazin ? " + " : ""}${fair.bazin ? "Bazin" : ""}) de ${brl(avg)}: ${pct(up)} vs. cotação.`);
  }
  if (analystTargets.length) {
    const avg = analystTargets.reduce((a, b) => a + b, 0) / analystTargets.length, up = avg / price - 1;
    score += up > 0.25 ? 1 : up > 0.1 ? 0.5 : up < 0 ? -0.5 : 0;
    reasons.push(`Preço-alvo médio de analistas de ${brl(avg)} (${pct(up)}).`);
  }
  if (my.buy && price <= my.buy) { score += 0.75; reasons.push(`Cotação abaixo do seu alvo de compra (${brl(my.buy)}).`); }
  if (my.sell && price >= my.sell) { score -= 0.75; reasons.push(`Cotação acima do seu alvo de venda (${brl(my.sell)}).`); }
  const action = score >= 1 ? "Compra" : score <= -1 ? "Venda" : "Neutro";
  // Alvos sugeridos: compra perto do suporte/preço justo com margem; venda no consenso/resistência
  const buyCands = [t?.support, fv.length ? Math.min(...fv) * 0.85 : null].filter((x): x is number => !!x && x < price * 1.05);
  const sellCands = [t?.resistance, ...analystTargets, ...fv].filter((x): x is number => !!x && x > price);
  return {
    action, score, reasons,
    buyTarget: buyCands.length ? Math.max(...buyCands) : null,
    // venda: o alvo mais próximo que ainda dê pelo menos 8% de alta (ou o maior disponível)
    sellTarget: (() => { const far = sellCands.filter((x) => x >= price * 1.08); return far.length ? Math.min(...far) : sellCands.length ? Math.max(...sellCands) : null; })(),
  };
}

// ---------------------------------------------------------------------------
// Períodos longos, desempenho e linhas de tendência automáticas
// ---------------------------------------------------------------------------

/** Agrega candles diários em semanais ("W") ou mensais ("M"). */
export function aggregate(c: Candle[], unit: "W" | "M"): Candle[] {
  const key = (d: string) => {
    if (unit === "M") return d.slice(0, 7);
    const dt = new Date(d + "T12:00:00Z"); const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day); return dt.toISOString().slice(0, 10);
  };
  const out: Candle[] = [];
  for (const x of c) {
    const k = key(x.date), last = out[out.length - 1];
    if (last && (last as Candle & { k?: string }).k === k) { last.high = Math.max(last.high, x.high); last.low = Math.min(last.low, x.low); last.close = x.close; last.volume += x.volume; last.date = x.date; }
    else out.push(Object.assign({ ...x }, { k }));
  }
  return out.map(({ date, open, high, low, close, volume }) => ({ date, open, high, low, close, volume }));
}

export const PERIODS = [
  { key: "1D", label: "Diário", days: 1 }, { key: "1S", label: "1 Semana", days: 7 }, { key: "1M", label: "1 Mês", days: 30 },
  { key: "3M", label: "3 Meses", days: 91 }, { key: "YTD", label: "No ano", days: 0 }, { key: "1A", label: "1 ano", days: 365 },
  { key: "3A", label: "3 anos", days: 1095 }, { key: "5A", label: "5 anos", days: 1826 }, { key: "10A", label: "10 anos", days: 3652 }, { key: "MAX", label: "Desde o início", days: -1 },
] as const;

/** Variação % do fechamento em cada período (null quando a série é mais curta). */
export function performance(c: Candle[]): Record<string, number | null> {
  const last = c[c.length - 1], out: Record<string, number | null> = {};
  const at = (iso: string) => { let r: Candle | null = null; for (const x of c) { if (x.date <= iso) r = x; else break; } return r; };
  for (const p of PERIODS) {
    let base: Candle | null;
    if (p.key === "1D") base = c[c.length - 2] ?? null;
    else if (p.key === "MAX") base = c[0];
    else if (p.key === "YTD") base = at(`${Number(last.date.slice(0, 4)) - 1}-12-31`);
    else { const d = new Date(last.date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - p.days); const iso = d.toISOString().slice(0, 10); base = iso < c[0].date ? null : at(iso); }
    out[p.key] = base ? last.close / base.close - 1 : null;
  }
  return out;
}

export interface Pivot { i: number; price: number; type: "high" | "low" }
/** Topos e fundos: candle cujo máximo/mínimo é extremo numa janela de k candles de cada lado. */
export function pivots(c: Candle[], k = 5): Pivot[] {
  const out: Pivot[] = [];
  for (let i = k; i < c.length - k; i++) {
    const w = c.slice(i - k, i + k + 1);
    if (c[i].high === Math.max(...w.map((x) => x.high))) out.push({ i, price: c[i].high, type: "high" });
    if (c[i].low === Math.min(...w.map((x) => x.low))) out.push({ i, price: c[i].low, type: "low" });
  }
  return out;
}

export interface AutoLine { kind: "suporte" | "resistencia" | "lta" | "ltb" | "canal" | "fibo"; a: { i: number; p: number }; b: { i: number; p: number }; label: string; touches?: number }
export interface AutoAnalysis { lines: AutoLine[]; levels: { price: number; kind: "suporte" | "resistencia"; touches: number }[]; fibo: { from: { i: number; p: number }; to: { i: number; p: number }; levels: { r: number; price: number }[] } | null; reading: string[]; trend: "alta" | "baixa" | "lateral"; r2: number }

/** Linhas de tendência automáticas + leitura em linguagem simples. */
export function autoAnalysis(c: Candle[]): AutoAnalysis {
  const n = c.length, last = c[n - 1].close, k = Math.max(3, Math.round(n / 40));
  const piv = pivots(c, k), highs = piv.filter((p) => p.type === "high"), lows = piv.filter((p) => p.type === "low");
  // Regressão linear dos fechamentos (log) -> direção e força da tendência
  const ys = c.map((x) => Math.log(x.close)), xm = (n - 1) / 2, ym = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, sst = 0; ys.forEach((y, i) => { sxy += (i - xm) * (y - ym); sxx += (i - xm) ** 2; sst += (y - ym) ** 2; });
  const slope = sxy / sxx, r2 = sst ? (sxy * sxy) / (sxx * sst) : 0, perPeriod = Math.exp(slope) - 1;
  const total = Math.exp(slope * (n - 1)) - 1;
  const trend: AutoAnalysis["trend"] = Math.abs(total) < 0.08 || r2 < 0.25 ? "lateral" : slope > 0 ? "alta" : "baixa";
  const lines: AutoLine[] = [];
  // LTA: liga os dois últimos fundos ascendentes; LTB: os dois últimos topos descendentes
  const lastTwo = (arr: Pivot[], cond: (a: Pivot, b: Pivot) => boolean) => { for (let j = arr.length - 1; j > 0; j--) for (let m = j - 1; m >= 0; m--) if (cond(arr[m], arr[j]) && arr[j].i - arr[m].i >= k * 2) return [arr[m], arr[j]] as const; return null; };
  const lta = lastTwo(lows, (a, b) => b.price > a.price), ltb = lastTwo(highs, (a, b) => b.price < a.price);
  const lineAt = (a: { i: number; p: number }, b: { i: number; p: number }, i: number) => a.p + ((b.p - a.p) / (b.i - a.i)) * (i - a.i);
  const touches = (a: { i: number; p: number }, b: { i: number; p: number }, side: "low" | "high") => c.filter((x, i) => i >= a.i && Math.abs((side === "low" ? x.low : x.high) / lineAt(a, b, i) - 1) < 0.012).length;
  if (lta) { const a = { i: lta[0].i, p: lta[0].price }, b = { i: lta[1].i, p: lta[1].price }; lines.push({ kind: "lta", a, b, label: "LTA (fundos ascendentes)", touches: touches(a, b, "low") }); }
  if (ltb) { const a = { i: ltb[0].i, p: ltb[0].price }, b = { i: ltb[1].i, p: ltb[1].price }; lines.push({ kind: "ltb", a, b, label: "LTB (topos descendentes)", touches: touches(a, b, "high") }); }
  // Canal: paralela à linha principal passando pelo extremo oposto
  const main = trend === "baixa" ? lines.find((l) => l.kind === "ltb") : lines.find((l) => l.kind === "lta");
  if (main && trend !== "lateral") {
    const opp = c.slice(main.a.i).map((x, j) => ({ i: main.a.i + j, d: (trend === "alta" ? x.high : x.low) - lineAt(main.a, main.b, main.a.i + j) }));
    const ext = opp.reduce((m, x) => (trend === "alta" ? (x.d > m.d ? x : m) : (x.d < m.d ? x : m)));
    lines.push({ kind: "canal", a: { i: main.a.i, p: main.a.p + ext.d }, b: { i: main.b.i, p: main.b.p + ext.d }, label: "Canal (paralela)" });
  }
  // Níveis horizontais: agrupa topos/fundos com preços a menos de 1,5% entre si
  const clusters: { price: number; n: number; lastI: number }[] = [];
  for (const p of piv) { const cl = clusters.find((x) => Math.abs(x.price / p.price - 1) < 0.015); if (cl) { cl.price = (cl.price * cl.n + p.price) / (cl.n + 1); cl.n++; cl.lastI = Math.max(cl.lastI, p.i); } else clusters.push({ price: p.price, n: 1, lastI: p.i }); }
  const strong = clusters.filter((x) => x.n >= 2).sort((a, b) => b.n - a.n);
  const sup = strong.filter((x) => x.price < last).sort((a, b) => b.price - a.price).slice(0, 2), res = strong.filter((x) => x.price > last).sort((a, b) => a.price - b.price).slice(0, 2);
  const levels = [...sup.map((x) => ({ price: x.price, kind: "suporte" as const, touches: x.n })), ...res.map((x) => ({ price: x.price, kind: "resistencia" as const, touches: x.n }))];
  for (const l of levels) lines.push({ kind: l.kind, a: { i: 0, p: l.price }, b: { i: n - 1, p: l.price }, label: `${l.kind === "suporte" ? "Suporte" : "Resistência"} (${l.touches} toques)`, touches: l.touches });
  // Fibonacci do último grande movimento (maior topo e maior fundo da metade final)
  const half = c.slice(Math.floor(n / 2)), hiI = Math.floor(n / 2) + half.findIndex((x) => x.high === Math.max(...half.map((y) => y.high))), loI = Math.floor(n / 2) + half.findIndex((x) => x.low === Math.min(...half.map((y) => y.low)));
  let fibo: AutoAnalysis["fibo"] = null;
  if (hiI !== loI) {
    const up = loI < hiI, from = up ? { i: loI, p: c[loI].low } : { i: hiI, p: c[hiI].high }, to = up ? { i: hiI, p: c[hiI].high } : { i: loI, p: c[loI].low };
    fibo = { from, to, levels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((r) => ({ r, price: to.p - (to.p - from.p) * r })) };
  }
  // Leitura em linguagem simples
  const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1).replace(".", ",")}%`;
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const reading: string[] = [];
  reading.push(trend === "lateral" ? `Tendência lateral: no período o preço oscilou sem direção clara (variação de tendência ${pct(total)}, aderência ${(r2 * 100).toFixed(0)}%).`
    : `Tendência de ${trend}: a linha de regressão aponta ${pct(total)} no período (${pct(perPeriod)} por candle), com aderência de ${(r2 * 100).toFixed(0)}% — ${r2 > 0.7 ? "tendência forte e consistente" : r2 > 0.45 ? "tendência moderada" : "tendência fraca, com muito ruído"}.`);
  if (main) { const now = lineAt(main.a, main.b, n - 1), d = last / now - 1; reading.push(main.kind === "lta"
      ? (d >= 0 ? `Preço ${pct(d)} acima da LTA (${brl(now)}). Enquanto ela segurar, a alta segue válida; um fechamento abaixo dela é sinal de alerta.` : `Preço rompeu a LTA para baixo (${pct(d)}). Rompimentos de LTA costumam indicar perda de força da alta.`)
      : (d <= 0 ? `Preço ${pct(d)} abaixo da LTB (${brl(now)}). A baixa segue válida até um rompimento para cima com volume.` : `Preço rompeu a LTB para cima (${pct(d)}): possível reversão da tendência de baixa — confirmação vem com volume e novo fundo mais alto.`)); }
  if (sup[0]) reading.push(`Suporte mais próximo em ${brl(sup[0].price)} (${pct(sup[0].price / last - 1)}), testado ${sup[0].n} vezes.`);
  if (res[0]) reading.push(`Resistência mais próxima em ${brl(res[0].price)} (${pct(res[0].price / last - 1)}), testada ${res[0].n} vezes.`);
  if (sup[0] && res[0]) { const pos = (last - sup[0].price) / (res[0].price - sup[0].price); reading.push(pos < 0.3 ? "O preço está perto do suporte: região onde compradores costumam aparecer (relação risco/retorno melhor para compra)." : pos > 0.7 ? "O preço está perto da resistência: região onde vendedores costumam aparecer (cuidado com compras aqui)." : "O preço está no meio do caminho entre suporte e resistência."); }
  if (fibo) { const near = fibo.levels.slice(1, -1).reduce((m, l) => (Math.abs(l.price - last) < Math.abs(m.price - last) ? l : m)); reading.push(`No último movimento ${fibo.from.p < fibo.to.p ? "de alta" : "de baixa"}, o preço está perto da retração de ${(near.r * 100).toFixed(1).replace(".", ",")}% de Fibonacci (${brl(near.price)}). As retrações de 38,2%, 50% e 61,8% são as mais observadas pelo mercado.`); }
  const atr = c.slice(-14).reduce((a, x, i, arr) => a + (i ? Math.max(x.high - x.low, Math.abs(x.high - arr[i - 1].close), Math.abs(x.low - arr[i - 1].close)) : x.high - x.low), 0) / 14;
  reading.push(`Volatilidade (ATR 14): ${brl(atr)} por candle (${((atr / last) * 100).toFixed(1).replace(".", ",")}% do preço) — útil para definir stops e alvos realistas.`);
  return { lines, levels, fibo, reading, trend, r2 };
}
