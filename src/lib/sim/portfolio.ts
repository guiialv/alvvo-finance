/**
 * Carteira por objetivos: simulação de Monte Carlo (cenários de mercado mensais, correlacionados) de como os aportes,
 * divididos entre objetivos e classes de ativo, chegam (ou não) a cada meta no prazo. Funções puras, rodam no navegador.
 */

export type AssetKey = "pos" | "lci" | "ipca" | "pre" | "acoes" | "fii" | "exterior" | "cripto";
export interface AssetClass { key: AssetKey; label: string; color: string; ret: number; vol: number; ir: number; liq: string }
export type Weights = Record<AssetKey, number>; // frações, somam 1

export const ASSET_KEYS: AssetKey[] = ["pos", "lci", "ipca", "pre", "acoes", "fii", "exterior", "cripto"];

/** Premissas padrão a partir do mercado de hoje (taxas em fração ao ano). Retornos nominais esperados, antes de IR. */
export function defaultAssets(m: { cdi: number; ipca: number; tesouroIpca: number | null; tesouroPre: number | null }): AssetClass[] {
  const cdi = m.cdi, ipca = m.ipca;
  const ipcaReal = m.tesouroIpca ?? 0.065, pre = m.tesouroPre ?? cdi * 0.95;
  return [
    { key: "pos", label: "Pós-fixado / Tesouro Selic", color: "#2f7d4f", ret: cdi, vol: 0.005, ir: 0.15, liq: "D+0 / D+1" },
    { key: "lci", label: "LCI / LCA (isentas)", color: "#9cc05a", ret: cdi * 0.9, vol: 0.005, ir: 0, liq: "carência 90 dias+" },
    { key: "ipca", label: "IPCA+ (Tesouro, títulos)", color: "#3f6aa8", ret: (1 + ipca) * (1 + ipcaReal) - 1, vol: 0.06, ir: 0.15, liq: "D+1, com oscilação" },
    { key: "pre", label: "Prefixado", color: "#7f9fe0", ret: pre, vol: 0.06, ir: 0.15, liq: "D+1, com oscilação" },
    { key: "acoes", label: "Ações Brasil", color: "#8d5a14", ret: cdi + 0.03, vol: 0.22, ir: 0.15, liq: "D+2" },
    { key: "fii", label: "Fundos imobiliários", color: "#e0853a", ret: (1 + ipca) * 1.07 - 1, vol: 0.13, ir: 0.05, liq: "D+2" },
    { key: "exterior", label: "Exterior (S&P, ETFs, BDRs)", color: "#8a4f9e", ret: 0.11, vol: 0.18, ir: 0.15, liq: "D+2" },
    { key: "cripto", label: "Cripto", color: "#c9a227", ret: 0.15, vol: 0.6, ir: 0.15, liq: "D+0, volátil" },
  ];
}

/** Correlações aproximadas entre as classes (mesma ordem de ASSET_KEYS). */
const CORR: number[][] = [
  // pos  lci  ipca  pre  acoes fii  ext  cripto
  [1, 0.9, 0.1, 0.1, 0, 0, 0, 0],
  [0.9, 1, 0.1, 0.1, 0, 0, 0, 0],
  [0.1, 0.1, 1, 0.7, 0.4, 0.5, 0, 0.1],
  [0.1, 0.1, 0.7, 1, 0.4, 0.4, 0, 0.1],
  [0, 0, 0.4, 0.4, 1, 0.5, 0.2, 0.3],
  [0, 0, 0.5, 0.4, 0.5, 1, 0.1, 0.1],
  [0, 0, 0, 0, 0.2, 0.1, 1, 0.3],
  [0, 0, 0.1, 0.1, 0.3, 0.1, 0.3, 1],
];

function cholesky(a: number[][]) {
  const n = a.length, L = a.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = a[i][j];
    for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j];
  }
  return L;
}

/** Gerador determinístico (mesmos cenários para todas as carteiras: comparação justa e resultado estável). */
function rng(seed: number) {
  let s = seed >>> 0;
  const u = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let spare: number | null = null;
  return () => { if (spare !== null) { const v = spare; spare = null; return v; } let a = 0, b = 0; while (a === 0) a = u(); b = u(); const r = Math.sqrt(-2 * Math.log(a)); spare = r * Math.sin(2 * Math.PI * b); return r * Math.cos(2 * Math.PI * b); };
}

/** Cenários: retornos mensais [cenário][mês][classe]. */
export function scenarios(assets: AssetClass[], months: number, paths: number, seed = 7) {
  const L = cholesky(CORR), g = rng(seed), n = ASSET_KEYS.length;
  const mu = assets.map((a) => Math.log(1 + a.ret) / 12), sd = assets.map((a) => a.vol / Math.sqrt(12));
  const out: Float64Array[] = [];
  for (let p = 0; p < paths; p++) {
    const arr = new Float64Array(months * n), z = new Array(n);
    for (let m = 0; m < months; m++) {
      for (let i = 0; i < n; i++) z[i] = g();
      for (let i = 0; i < n; i++) {
        let e = 0;
        for (let k = 0; k <= i; k++) e += L[i][k] * z[k];
        arr[m * n + i] = Math.exp(mu[i] - (sd[i] * sd[i]) / 2 + sd[i] * e) - 1;
      }
    }
    out.push(arr);
  }
  return out;
}

export interface GoalIn { id: string; name: string; target: number; months: number; balance: number }
export type Strategy = { kind: "fixed"; weights: Weights } | { kind: "objetivo"; profile: "conservador" | "moderado" | "arrojado" };

/** Alocação por prazo restante (estratégia "por objetivo"): reduz risco à medida que a data se aproxima. */
export function glide(monthsLeft: number, profile: "conservador" | "moderado" | "arrojado"): Weights {
  const w = (o: Partial<Weights>): Weights => normalize({ pos: 0, lci: 0, ipca: 0, pre: 0, acoes: 0, fii: 0, exterior: 0, cripto: 0, ...o });
  const risk = profile === "conservador" ? 0.6 : profile === "arrojado" ? 1.3 : 1;
  if (monthsLeft <= 12) return w({ pos: 0.75, lci: 0.25 });
  if (monthsLeft <= 36) return w({ pos: 0.5, lci: 0.15, ipca: 0.2, acoes: 0.1 * risk, exterior: 0.05 * risk });
  if (monthsLeft <= 72) return w({ pos: 0.25, ipca: 0.25, pre: 0.05, acoes: 0.2 * risk, fii: 0.1, exterior: 0.12 * risk, cripto: 0.03 * risk });
  return w({ pos: 0.1, ipca: 0.2, acoes: 0.28 * risk, fii: 0.12, exterior: 0.22 * risk, cripto: 0.05 * risk });
}

export function normalize(w: Weights): Weights {
  const s = ASSET_KEYS.reduce((a, k) => a + Math.max(0, w[k] || 0), 0) || 1;
  return Object.fromEntries(ASSET_KEYS.map((k) => [k, Math.max(0, w[k] || 0) / s])) as Weights;
}

/** Aporte mensal que um objetivo pede para chegar no prazo — com folga: rende só 85% do CDI líquido e mira acima da meta
 *  (cobre o IR do resgate e a oscilação: o objetivo não chega "raspando"). */
export function needMonthly(g: { target: number; months: number; balance: number }, cdiNet: number) {
  const i = Math.pow(1 + cdiNet * 0.85, 1 / 12) - 1, n = Math.max(1, g.months);
  const fv = g.balance * Math.pow(1 + i, n);
  // mira acima da meta para cobrir o IR do resgate (maior quanto mais longo o prazo: o ganho acumulado é maior)
  const aim = g.target * (n <= 12 ? 1.04 : n <= 36 ? 1.08 : n <= 120 ? 1.14 : 1.2);
  return Math.max(0, aim - fv) * (i / (Math.pow(1 + i, n) - 1 || 1e-9));
}

/** Divisão do aporte entre objetivos: por prioridade, cada um recebe o que precisa para chegar no prazo;
 *  o que sobra vai para "Longo prazo / livre". */
export function splitAporte(goals: GoalIn[], aporte: number, cdiNet: number) {
  let left = aporte;
  const per = goals.map((g) => {
    const need = needMonthly(g, cdiNet);
    const give = Math.min(left, need);
    left -= give;
    return { id: g.id, need, give };
  });
  return { per, livre: Math.max(0, left) };
}

export interface SimResult {
  allProb: number; // % dos cenários em que TODOS os objetivos chegam
  goals: { id: string; prob: number; p10: number; p50: number; p90: number; target: number }[];
  total: { p10: number[]; p50: number[]; p90: number[] }; // patrimônio total (líquido de IR estimado) mês a mês
  invested: number[];
  maxDrawdown: number; // mediana da maior queda ao longo do caminho
  irPaid: number; // IR estimado (mediana) nas datas de resgate das metas
  weightsNow: Weights; // alocação do aporte do primeiro mês
}

const quant = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };
const irShort = (months: number, base: number) => (base === 0 ? 0 : base === 0.15 ? (months <= 6 ? 0.225 : months <= 12 ? 0.2 : months <= 24 ? 0.175 : 0.15) : base);

/** Roda a estratégia em todos os cenários. Cada objetivo é um "pote"; o livre é um pote de longo prazo. */
export function simulate(opts: { goals: GoalIn[]; aporte: number; aporteGrowth: number; strategy: Strategy; assets: AssetClass[]; scen: Float64Array[]; horizon: number; cdiNet: number }): SimResult {
  const { goals, assets, scen, horizon, strategy } = opts, n = ASSET_KEYS.length;
  const weightsFor = (monthsLeft: number): Weights => (strategy.kind === "fixed" ? strategy.weights : glide(monthsLeft, strategy.profile));
  const W = (ml: number) => { const w = weightsFor(ml); return ASSET_KEYS.map((k) => w[k]); };
  const livreW = strategy.kind === "fixed" ? ASSET_KEYS.map((k) => strategy.weights[k]) : W(999);
  const totals: number[][] = Array.from({ length: horizon + 1 }, () => []);
  const goalVals: number[][] = goals.map(() => []), dd: number[] = [], irs: number[] = [];
  let allHit = 0;
  const nPots = goals.length + 1;

  for (const sc of scen) {
    // cada pote guarda valor por classe e o custo (para o IR na saída)
    const val = Array.from({ length: nPots }, () => new Float64Array(n)), cost = new Float64Array(nPots);
    goals.forEach((g, gi) => { const w = W(g.months); for (let k = 0; k < n; k++) val[gi][k] = g.balance * w[k]; cost[gi] = g.balance; });
    let peak = goals.reduce((a, g) => a + g.balance, 0), worst = 0, ir = 0;
    const done = new Array(goals.length).fill(false);
    totals[0].push(peak);
    for (let m = 1; m <= horizon; m++) {
      // rende
      for (let p = 0; p < nPots; p++) for (let k = 0; k < n; k++) val[p][k] *= 1 + sc[(m - 1) * n + k];
      // aporte do mês, dividido entre os objetivos ainda abertos
      const ap = opts.aporte * Math.pow(1 + opts.aporteGrowth, Math.floor((m - 1) / 12));
      const open = goals.map((g, gi) => ({ ...g, months: g.months - (m - 1), balance: val[gi].reduce((a, v) => a + v, 0) })).filter((_, gi) => !done[gi]);
      const sp = splitAporte(open, ap, opts.cdiNet);
      const give = new Map(sp.per.map((x) => [x.id, x.give]));
      goals.forEach((g, gi) => {
        if (done[gi]) return;
        const add = give.get(g.id) ?? 0, w = W(g.months - m), tot = val[gi].reduce((a, v) => a + v, 0) + add;
        for (let k = 0; k < n; k++) val[gi][k] = tot * w[k]; // rebalanceia o pote para a alocação do prazo restante
        cost[gi] += add;
      });
      { const p = goals.length, tot = val[p].reduce((a, v) => a + v, 0) + sp.livre; for (let k = 0; k < n; k++) val[p][k] = tot * livreW[k]; cost[p] += sp.livre; }
      // vencimento de objetivo: resgata (IR sobre o ganho, pela composição do pote) e registra
      goals.forEach((g, gi) => {
        if (done[gi] || m !== g.months) return;
        const gross = val[gi].reduce((a, v) => a + v, 0), gain = Math.max(0, gross - cost[gi]);
        const irRate = gross ? ASSET_KEYS.reduce((a, k, ki) => a + (val[gi][ki] / gross) * irShort(g.months, assets[ki].ir), 0) : 0;
        const tax = gain * irRate; ir += tax;
        goalVals[gi].push(gross - tax);
        done[gi] = true;
        for (let k = 0; k < n; k++) val[gi][k] = 0; // dinheiro sai para o objetivo
        cost[gi] = 0;
      });
      const totNow = val.reduce((a, pv) => a + pv.reduce((b, v) => b + v, 0), 0) + goals.reduce((a, g, gi) => a + (done[gi] ? (goalVals[gi][goalVals[gi].length - 1] ?? 0) : 0), 0);
      const totCost = cost.reduce((a, c) => a + c, 0) + goals.reduce((a, g, gi) => a + (done[gi] ? (goalVals[gi][goalVals[gi].length - 1] ?? 0) : 0), 0);
      const irEst = Math.max(0, totNow - totCost) * 0.13;
      totals[m].push(totNow - irEst);
      peak = Math.max(peak, totNow); worst = Math.max(worst, peak > 0 ? (peak - totNow) / peak : 0);
    }
    goals.forEach((g, gi) => { if (!done[gi]) { const gross = val[gi].reduce((a, v) => a + v, 0); goalVals[gi].push(gross); } });
    if (goals.every((g, gi) => (goalVals[gi][goalVals[gi].length - 1] ?? 0) >= g.target * 0.995)) allHit++;
    dd.push(worst); irs.push(ir);
  }
  // patrimônio aportado (determinístico)
  let acc = goals.reduce((a, g) => a + g.balance, 0);
  const inv2 = [acc];
  for (let m = 1; m <= horizon; m++) { acc += opts.aporte * Math.pow(1 + opts.aporteGrowth, Math.floor((m - 1) / 12)); inv2.push(acc); }
  const w0 = (() => {
    const sp = splitAporte(goals, opts.aporte, opts.cdiNet), mix: Weights = { pos: 0, lci: 0, ipca: 0, pre: 0, acoes: 0, fii: 0, exterior: 0, cripto: 0 };
    sp.per.forEach((x) => { const g = goals.find((y) => y.id === x.id)!; const w = W(g.months); ASSET_KEYS.forEach((k, ki) => { mix[k] += x.give * w[ki]; }); });
    ASSET_KEYS.forEach((k, ki) => { mix[k] += sp.livre * livreW[ki]; });
    return normalize(mix);
  })();
  return {
    allProb: scen.length ? allHit / scen.length : 0,
    goals: goals.map((g, gi) => ({ id: g.id, target: g.target, prob: goalVals[gi].filter((v) => v >= g.target * 0.995).length / Math.max(1, goalVals[gi].length), p10: quant(goalVals[gi], 0.1), p50: quant(goalVals[gi], 0.5), p90: quant(goalVals[gi], 0.9) })),
    total: { p10: totals.map((t) => quant(t, 0.1)), p50: totals.map((t) => quant(t, 0.5)), p90: totals.map((t) => quant(t, 0.9)) },
    invested: inv2,
    maxDrawdown: quant(dd, 0.5),
    irPaid: quant(irs, 0.5),
    weightsNow: w0,
  };
}

/** Plano de aportes dos próximos meses: quanto por objetivo e por classe, em cada mês (cenário base, sem oscilação). */
export function monthlyPlan(goals: GoalIn[], aporte: number, aporteGrowth: number, strategy: Strategy, cdiNet: number, months = 12) {
  const i = Math.pow(1 + cdiNet, 1 / 12) - 1;
  const bal = new Map(goals.map((g) => [g.id, g.balance]));
  const rows: { m: number; byGoal: Record<string, number>; livre: number; byClass: Weights }[] = [];
  for (let m = 1; m <= months; m++) {
    const ap = aporte * Math.pow(1 + aporteGrowth, Math.floor((m - 1) / 12));
    const open = goals.filter((g) => g.months - (m - 1) > 0).map((g) => ({ ...g, months: g.months - (m - 1), balance: bal.get(g.id)! }));
    const sp = splitAporte(open, ap, cdiNet);
    const byClass: Weights = { pos: 0, lci: 0, ipca: 0, pre: 0, acoes: 0, fii: 0, exterior: 0, cripto: 0 };
    const byGoal: Record<string, number> = {};
    for (const x of sp.per) {
      const g = open.find((y) => y.id === x.id)!;
      const w = strategy.kind === "fixed" ? strategy.weights : glide(g.months - 1, strategy.profile);
      ASSET_KEYS.forEach((k) => { byClass[k] += x.give * w[k]; });
      byGoal[x.id] = x.give;
      bal.set(x.id, bal.get(x.id)! * (1 + i) + x.give);
    }
    const lw = strategy.kind === "fixed" ? strategy.weights : glide(999, strategy.profile);
    ASSET_KEYS.forEach((k) => { byClass[k] += sp.livre * lw[k]; });
    rows.push({ m, byGoal, livre: sp.livre, byClass });
  }
  return rows;
}

/** Ajusta o aporte do mês para aproximar a carteira atual da alocação-alvo (dinheiro novo vai para o que está abaixo). */
export function rebalanceWithAporte(current: Weights, currentTotal: number, target: Weights, aporte: number): Weights {
  const newTotal = currentTotal + aporte;
  const def = ASSET_KEYS.map((k) => Math.max(0, target[k] * newTotal - current[k] * currentTotal));
  const sum = def.reduce((a, d) => a + d, 0);
  const out = {} as Weights;
  ASSET_KEYS.forEach((k, ki) => { out[k] = sum > 0 ? Math.min(def[ki], (def[ki] / sum) * aporte) : target[k] * aporte; });
  const used = ASSET_KEYS.reduce((a, k) => a + out[k], 0);
  if (used < aporte - 0.5) ASSET_KEYS.forEach((k) => { out[k] += (aporte - used) * target[k]; });
  return out; // em R$
}
