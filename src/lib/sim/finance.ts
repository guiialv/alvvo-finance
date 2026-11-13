/**
 * Cálculos dos simuladores (funções puras, usadas no navegador e no servidor).
 * Taxas: anuais em fração (0.147 = 14,7% a.a.), mensais em fração (0.0115 = 1,15% a.m.).
 */

export const toMonthly = (annual: number) => Math.pow(1 + annual, 1 / 12) - 1;
export const toAnnual = (monthly: number) => Math.pow(1 + monthly, 12) - 1;

/** IR regressivo da renda fixa pelo prazo em dias. */
export const irRate = (days: number) => (days <= 180 ? 0.225 : days <= 360 ? 0.2 : days <= 720 ? 0.175 : 0.15);

export interface AmortRow { m: number; pmt: number; juros: number; amort: number; saldo: number }

/** Tabela Price: parcela fixa. */
export function price(pv: number, i: number, n: number): { pmt: number; rows: AmortRow[]; juros: number } {
  const pmt = i === 0 ? pv / n : (pv * i) / (1 - Math.pow(1 + i, -n));
  const rows: AmortRow[] = [];
  let saldo = pv, juros = 0;
  for (let m = 1; m <= n; m++) {
    const j = saldo * i, a = pmt - j;
    saldo = Math.max(0, saldo - a); juros += j;
    rows.push({ m, pmt, juros: j, amort: a, saldo });
  }
  return { pmt, rows, juros };
}

/** SAC: amortização constante, parcela decrescente. */
export function sac(pv: number, i: number, n: number): { first: number; last: number; rows: AmortRow[]; juros: number } {
  const a = pv / n, rows: AmortRow[] = [];
  let saldo = pv, juros = 0;
  for (let m = 1; m <= n; m++) {
    const j = saldo * i; saldo = Math.max(0, saldo - a); juros += j;
    rows.push({ m, pmt: a + j, juros: j, amort: a, saldo });
  }
  return { first: rows[0]?.pmt ?? 0, last: rows[rows.length - 1]?.pmt ?? 0, rows, juros };
}

// ---------------------------------------------------------------- Meta e prazo

export interface GoalInput { pv: number; pmt: number; annualRate: number; inflation: number; months: number; pmtGrowth?: number }

/** Saldo mês a mês com aporte no fim de cada mês (aporte reajustado 1x por ano por `pmtGrowth`). */
export function projectGoal(g: GoalInput): { month: number; nominal: number; real: number; invested: number }[] {
  const i = toMonthly(g.annualRate), inf = toMonthly(g.inflation);
  const out = [{ month: 0, nominal: g.pv, real: g.pv, invested: g.pv }];
  let bal = g.pv, inv = g.pv, pmt = g.pmt;
  for (let m = 1; m <= g.months; m++) {
    if (m > 1 && (m - 1) % 12 === 0) pmt *= 1 + (g.pmtGrowth ?? 0);
    bal = bal * (1 + i) + pmt; inv += pmt;
    out.push({ month: m, nominal: bal, real: bal / Math.pow(1 + inf, m), invested: inv });
  }
  return out;
}

/** Meses até atingir `target` (em valores de hoje se `real`). null se não chega em 100 anos. */
export function monthsToTarget(g: Omit<GoalInput, "months">, target: number, real = true): number | null {
  const s = projectGoal({ ...g, months: 1200 });
  const hit = s.find((p) => (real ? p.real : p.nominal) >= target);
  return hit ? hit.month : null;
}

/** Aporte mensal necessário para chegar a `target` em `months` (busca binária, respeita reajuste do aporte). */
export function requiredPmt(g: Omit<GoalInput, "pmt">, target: number, real = true): number {
  let lo = 0, hi = Math.max(target, 1);
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    const last = projectGoal({ ...g, pmt: mid }).at(-1)!;
    if ((real ? last.real : last.nominal) >= target) hi = mid; else lo = mid;
  }
  return hi;
}

// ---------------------------------------------------------------- Comparador de investimentos

export type ProductKind = "cdb" | "lci" | "selic" | "pre" | "ipca" | "poupanca" | "acoes";
export interface Product { id: string; kind: ProductKind; label: string; rate: number; note?: string }
export interface RatePath { cdi: number[]; selic: number[]; ipca: number[] } // por ano de simulação (0 = primeiros 12 meses)

/** Valor bruto e líquido de cada produto, com aporte inicial e mensal, mês a mês. */
export function simulateProduct(p: Product, path: RatePath, pv: number, pmt: number, months: number) {
  const yr = (m: number, arr: number[]) => arr[Math.min(arr.length - 1, Math.floor((m - 1) / 12))];
  let bal = pv, invested = pv, custody = 0;
  const series: number[] = [pv];
  for (let m = 1; m <= months; m++) {
    let annual: number;
    switch (p.kind) {
      case "cdb": case "lci": annual = yr(m, path.cdi) * p.rate; break;
      case "selic": annual = yr(m, path.selic) + p.rate; break;
      case "pre": annual = p.rate; break;
      case "ipca": annual = (1 + yr(m, path.ipca)) * (1 + p.rate) - 1; break;
      case "poupanca": { const s = yr(m, path.selic); annual = s > 0.085 ? toAnnual(0.005) : s * 0.7; break; }
      case "acoes": annual = p.rate; break;
    }
    bal = bal * (1 + toMonthly(annual)) + pmt; invested += pmt;
    if (p.kind === "selic" || p.kind === "pre" || p.kind === "ipca") { const c = bal * (0.002 / 12); custody += c; bal -= c; }
    series.push(bal);
  }
  const gain = Math.max(0, bal - invested);
  const tax = p.kind === "lci" || p.kind === "poupanca" ? 0 : p.kind === "acoes" ? gain * 0.15 : gain * irRate(months * 30.4);
  const net = bal - tax;
  const netAnnual = months > 0 && pmt === 0 && pv > 0 ? Math.pow(net / pv, 12 / months) - 1 : null;
  return { gross: bal, net, tax, custody, invested, gain: net - invested, series, netAnnual };
}

/** Curva de taxas por ano a partir do cenário atual e das projeções do Focus (Banco Central). */
export function ratePathFrom(macro: { cdi: number; selic: number; focus: { ipca: Record<string, number>; selic: Record<string, number> } }, years: number, from = new Date()): RatePath {
  const y0 = from.getFullYear();
  const out: RatePath = { cdi: [], selic: [], ipca: [] };
  for (let k = 0; k < Math.max(1, years); k++) {
    const y = String(y0 + k), yNext = String(y0 + k + 1);
    // ano 0 usa a taxa de hoje; depois, a Selic projetada no fim do ano (Focus); sem projeção, repete a última
    const selicPct = k === 0 ? macro.selic : (macro.focus.selic[y] ?? macro.focus.selic[yNext] ?? out.selic[k - 1] * 100);
    const s = selicPct / 100;
    out.selic.push(s);
    out.cdi.push(k === 0 ? macro.cdi / 100 : Math.max(0, s - 0.001));
    out.ipca.push(((macro.focus.ipca[y] ?? macro.focus.ipca[yNext] ?? 4) as number) / 100);
  }
  return out;
}

// ---------------------------------------------------------------- Captação e alavancagem

export interface FundingOption { id: string; label: string; monthly: number; note: string; requires: string; source: "bcb" | "referencia" | "proprio" | "proposta"; tone?: "good" | "bad"; banks?: { name: string; monthly: number }[] }

export function fundingCost(o: FundingOption, amount: number, months: number) {
  const r = price(amount, o.monthly, months);
  return { ...o, pmt: r.pmt, juros: r.juros, total: r.pmt * months, annual: toAnnual(o.monthly) };
}

/**
 * Alavancagem: com dívida, investe `amount` hoje no destino e paga a parcela;
 * sem dívida, investe a parcela todo mês no mesmo destino. Diferença de patrimônio no fim.
 */
export function leverage(amount: number, loanMonthly: number, months: number, destAnnual: number) {
  const pmt = price(amount, loanMonthly, months).pmt, i = toMonthly(destAnnual);
  let withDebt = amount, without = 0;
  const series: { m: number; withDebt: number; without: number }[] = [{ m: 0, withDebt: amount, without: 0 }];
  for (let m = 1; m <= months; m++) {
    withDebt *= 1 + i; without = without * (1 + i) + pmt;
    series.push({ m, withDebt, without });
  }
  return { pmt, withDebt, without, diff: withDebt - without, breakEvenAnnual: toAnnual(loanMonthly), series };
}

// ---------------------------------------------------------------- Alugar × comprar

export interface RentBuyInput {
  price: number; rent: number; downPct: number; finAnnual: number; finMonths: number; system: "sac" | "price";
  buyCostsPct: number; maintPct: number; appreciation: number; rentGrowth: number; investAnnual: number; years: number; financed: boolean;
}

/** Patrimônio ano a ano de quem compra × quem aluga e investe a diferença. */
export function rentVsBuy(x: RentBuyInput) {
  const months = x.years * 12, inv = toMonthly(x.investAnnual), app = toMonthly(x.appreciation);
  const down = x.financed ? x.price * x.downPct : x.price;
  const loan = x.financed ? x.price - down : 0;
  const sched = loan > 0 ? (x.system === "sac" ? sac(loan, toMonthly(x.finAnnual), x.finMonths).rows : price(loan, toMonthly(x.finAnnual), x.finMonths).rows) : [];
  const upfront = down + x.price * x.buyCostsPct;
  let home = x.price, rent = x.rent, renterPot = upfront, buyerPot = 0, totalRent = 0, totalInterest = 0;
  const years: { year: number; buy: number; rent: number; saldo: number }[] = [{ year: 0, buy: home - loan - x.price * x.buyCostsPct, rent: upfront, saldo: loan }];
  let breakEven: number | null = null;
  for (let m = 1; m <= months; m++) {
    if (m > 1 && (m - 1) % 12 === 0) rent *= 1 + x.rentGrowth;
    home *= 1 + app;
    const row = sched[m - 1];
    const ownerCost = (row?.pmt ?? 0) + (home * x.maintPct) / 12;
    if (row) totalInterest += row.juros;
    totalRent += rent;
    // quem gasta menos no mês investe a diferença
    const diff = ownerCost - rent;
    renterPot = renterPot * (1 + inv) + Math.max(0, diff);
    buyerPot = buyerPot * (1 + inv) + Math.max(0, -diff);
    if (m % 12 === 0) {
      const saldo = row ? row.saldo : sched.length && m > sched.length ? 0 : loan;
      const buyNW = home - saldo + buyerPot, rentNW = renterPot;
      years.push({ year: m / 12, buy: buyNW, rent: rentNW, saldo });
      if (breakEven === null && buyNW >= rentNW) breakEven = m / 12;
    }
  }
  const last = years[years.length - 1];
  return { years, breakEven, buy: last.buy, rent: last.rent, totalRent, totalInterest, firstPmt: sched[0]?.pmt ?? 0, upfront };
}

// ---------------------------------------------------------------- Financiar × consórcio × juntar

export interface AcquireInput {
  price: number; down: number; finMonthly: number; finMonths: number;
  consFeePct: number; consReservePct: number; consMonths: number; consContemplation: number;
  priceGrowth: number; investAnnual: number;
}

export function acquire(x: AcquireInput) {
  const inv = toMonthly(x.investAnnual), grow = toMonthly(x.priceGrowth);
  const fin = price(x.price - x.down, x.finMonthly, x.finMonths);
  const finTotal = x.down + fin.pmt * x.finMonths;
  // consórcio: carta reajustada pela inflação do bem; parcela = (carta × (1 + taxas)) / prazo, reajustada junto
  let consPaid = 0, consPmt = (x.price * (1 + x.consFeePct + x.consReservePct)) / x.consMonths;
  for (let m = 1; m <= x.consMonths; m++) { if (m > 1 && (m - 1) % 12 === 0) consPmt *= Math.pow(1 + grow, 12); consPaid += consPmt; }
  // juntar: investe a mesma parcela do financiamento (mais a entrada hoje) até o bem (que também sobe de preço) caber
  let pot = x.down, m = 0, target = x.price;
  while (pot < target && m < 600) { m++; pot = pot * (1 + inv) + fin.pmt; target *= 1 + grow; }
  const saveMonths = m < 600 ? m : null;
  const savePaid = saveMonths === null ? null : x.down + fin.pmt * saveMonths;
  return {
    fin: { pmt: fin.pmt, total: finTotal, juros: fin.juros, haveAt: 0 },
    cons: { pmt: (x.price * (1 + x.consFeePct + x.consReservePct)) / x.consMonths, total: consPaid, haveAt: x.consContemplation },
    save: { months: saveMonths, total: savePaid, price: target },
  };
}
