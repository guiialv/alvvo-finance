/**
 * Renda fixa: rendimento líquido comparável entre Tesouro Direto, CDB, LCI/LCA, debêntures e poupança.
 * Funções puras. Taxas em % ao ano (ex.: 13.65), prazos em meses.
 *
 * Regras (PF, nov/2026):
 * - IR regressivo: 22,5% até 180 dias, 20% até 360, 17,5% até 720, 15% acima. LCI, LCA, CRI, CRA,
 *   debênture incentivada e poupança são isentos.
 * - Custódia B3 no Tesouro: 0,20% a.a.; Tesouro Selic isento até R$ 10 mil (aplicamos a mesma regra ao Tesouro Reserva, como premissa).
 * - FGC: R$ 250 mil por CPF por instituição (teto de R$ 1 milhão a cada 4 anos).
 */

export type Index = "selic" | "cdi" | "cdi+" | "pre" | "ipca" | "poup";
export type Kind = "tesouro" | "cdb" | "lci" | "lca" | "cri" | "cra" | "deb-inc" | "deb" | "poup";
export interface Option {
  id: string; name: string; kind: Kind; index: Index;
  /** selic: spread sobre a Selic; cdi: % do CDI; cdi+: spread sobre o CDI; pre: taxa a.a.; ipca: juro real a.a. */
  rate: number; maturity?: string | null; daily?: boolean; min?: number; issuer?: string; coupon?: boolean; note?: string; group?: string;
}
export interface Scenario { months: number; amount: number; cdiPath: number[]; ipca: number; start: string }
export interface Result {
  opt: Option; gross: number; ir: number; irRate: number; custody: number; net: number; final: number;
  netYear: number; realYear: number; equivCdb: number | null; grossYear: number;
  fit: "ok" | "antes" | "depois" | "liquidez"; fitNote: string; liquidity: string; guarantee: string; exempt: boolean; mtm: boolean;
}

export const EXEMPT: Kind[] = ["lci", "lca", "cri", "cra", "deb-inc", "poup"];
export const KIND_L: Record<Kind, string> = { tesouro: "Tesouro Direto", cdb: "CDB", lci: "LCI", lca: "LCA", cri: "CRI", cra: "CRA", "deb-inc": "Debênture incentivada", deb: "Debênture", poup: "Poupança" };
export const irRateFor = (days: number) => (days <= 180 ? 0.225 : days <= 360 ? 0.2 : days <= 720 ? 0.175 : 0.15);
const mRate = (annualPct: number) => Math.pow(1 + annualPct / 100, 1 / 12) - 1;

/**
 * Caminho mensal do CDI (% a.a.) a partir do Focus: interpola do CDI atual até a Selic esperada no fim de cada ano
 * (CDI ≈ Selic − 0,10) e mantém o último valor depois.
 */
export function cdiPath(months: number, start: string, cdiNow: number, selicEndOfYear: Record<number, number>): number[] {
  const y0 = +start.slice(0, 4), m0 = +start.slice(5, 7);
  const anchors: [number, number][] = [[0, cdiNow]];
  for (const [y, s] of Object.entries(selicEndOfYear).sort()) anchors.push([(+y - y0) * 12 + (12 - m0) + 1, s - 0.1]);
  const out: number[] = [];
  for (let k = 0; k < months; k++) {
    const t = k + 0.5; let v = anchors[anchors.length - 1][1];
    for (let j = 0; j < anchors.length - 1; j++) { const [a, va] = anchors[j], [b, vb] = anchors[j + 1]; if (t >= a && t <= b) { v = va + ((vb - va) * (t - a)) / (b - a || 1); break; } }
    out.push(v);
  }
  return out;
}
export const avgAnnual = (path: number[]) => (Math.pow(path.reduce((f, r) => f * (1 + mRate(r)), 1), 12 / path.length) - 1) * 100;

function monthsTo(start: string, iso: string) { return (+iso.slice(0, 4) - +start.slice(0, 4)) * 12 + (+iso.slice(5, 7) - +start.slice(5, 7)) + (+iso.slice(8, 10) - +start.slice(8, 10)) / 30; }

/** Fator bruto mensal da opção no mês k do cenário. */
function monthFactor(o: Option, k: number, sc: Scenario) {
  const cdi = sc.cdiPath[k] ?? sc.cdiPath[sc.cdiPath.length - 1];
  switch (o.index) {
    case "selic": return 1 + mRate(cdi + 0.1 + o.rate);
    case "cdi": return 1 + mRate(cdi) * (o.rate / 100);
    case "cdi+": return 1 + mRate(cdi + o.rate);
    case "pre": return 1 + mRate(o.rate);
    case "ipca": return (1 + mRate(sc.ipca)) * (1 + mRate(o.rate));
    case "poup": return 1 + (cdi + 0.1 > 8.5 ? 0.005 + 0.0017 : mRate((cdi + 0.1) * 0.7)); // 0,5% a.m. + TR (~0,17% a.m.)
  }
}

/** Simula a aplicação por `months` meses. Se a opção vence antes, o restante é reaplicado a 100% do CDI (premissa). */
export function simulate(o: Option, sc: Scenario, withEquiv = true): Result {
  const n = sc.months, exempt = EXEMPT.includes(o.kind) || o.index === "poup";
  const matM = o.maturity ? monthsTo(sc.start, o.maturity) : Infinity;
  let custody = 0, gainTaxable = 0, value = sc.amount;
  const holdM = Math.min(n, Math.max(0, Math.floor(matM)));
  for (let k = 0; k < holdM; k++) { const mf = monthFactor(o, k, sc); value *= mf; if (o.kind === "tesouro") { const base = o.index === "selic" ? Math.max(0, value - 10000) : value; custody += base * (0.002 / 12); } }
  const firstLeg = value - sc.amount;
  let ir = 0, irRate = exempt ? 0 : irRateFor(holdM * 30.4);
  if (!exempt) { gainTaxable = Math.max(0, firstLeg - custody); ir = gainTaxable * irRate; }
  let final = value - custody - ir;
  if (holdM < n) { // reaplica o líquido em CDB 100% CDI até o fim do prazo
    const reinv = { id: "r", name: "", kind: "cdb", index: "cdi", rate: 100 } as Option; let v2 = final;
    for (let k = holdM; k < n; k++) v2 *= monthFactor(reinv, k, sc);
    const g2 = v2 - final, ir2 = g2 * irRateFor((n - holdM) * 30.4); ir += ir2; final = v2 - ir2;
  }
  const years = n / 12, gross = final + ir + custody - sc.amount, net = final - sc.amount;
  const netYear = (Math.pow(final / sc.amount, 1 / years) - 1) * 100, realYear = ((1 + netYear / 100) / (1 + sc.ipca / 100) - 1) * 100;
  const grossYear = (Math.pow((sc.amount + gross) / sc.amount, 1 / years) - 1) * 100;
  const mtm = (o.index === "pre" || o.index === "ipca") && o.kind === "tesouro";
  let fit: Result["fit"] = "ok", fitNote = "Vence perto do seu prazo.";
  if (o.daily) { fit = "liquidez"; fitNote = "Liquidez diária: resgata quando quiser."; }
  else if (o.index === "selic" || o.index === "poup") { fit = "liquidez"; fitNote = o.index === "poup" ? "Liquidez diária, mas o rendimento só é creditado no aniversário mensal." : "Resgate diário com pouca oscilação de preço."; }
  else if (matM < n - 3) { fit = "antes"; fitNote = `Vence ${Math.round(n - matM)} meses antes do seu prazo; a simulação reaplica o restante a 100% do CDI.`; }
  else if (matM > n + 6) { fit = "depois"; fitNote = mtm ? `Vence ${Math.round((matM - n) / 12 * 10) / 10} anos depois do seu prazo: para sair antes, você vende a preço de mercado, que pode ser maior ou menor que o contratado.` : `Vence ${Math.round((matM - n) / 12 * 10) / 10} anos depois do seu prazo e não tem liquidez antes: o dinheiro fica preso até o vencimento.`; }
  const liquidity = o.daily ? "Diária" : o.kind === "tesouro" ? (o.index === "selic" ? "Diária" : "Diária, a preço de mercado") : o.kind === "poup" ? "Diária" : "No vencimento";
  const guarantee = o.kind === "tesouro" ? "Tesouro Nacional" : ["cdb", "lci", "lca", "poup"].includes(o.kind) ? "FGC até R$ 250 mil" : "Sem FGC (risco do emissor)";
  return { opt: o, gross, ir, irRate, custody, net, final, netYear, realYear, equivCdb: withEquiv ? equivCdb(final, sc) : null, grossYear, fit, fitNote, liquidity, guarantee, exempt, mtm };
}

/** Qual % do CDI um CDB (com IR) precisaria pagar para chegar ao mesmo valor final. */
export function equivCdb(final: number, sc: Scenario): number | null {
  const f = (p: number) => simulate({ id: "eq", name: "", kind: "cdb", index: "cdi", rate: p }, sc, false).final;
  let lo = 0, hi = 300; if (f(hi) < final) return null;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (f(m) < final) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/** Inflação implícita entre um prefixado e um IPCA+ de mesmo prazo (% a.a.). */
export const breakevenInflation = (pre: number, real: number) => ((1 + pre / 100) / (1 + real / 100) - 1) * 100;

/** Ranking: primeiro o que combina com o prazo (ou tem liquidez), depois o maior líquido. */
export function rank(results: Result[]): Result[] {
  const w = (r: Result) => (r.fit === "ok" || r.fit === "liquidez" ? 0 : r.fit === "antes" ? 1 : 2);
  return [...results].sort((a, b) => w(a) - w(b) || b.final - a.final);
}
