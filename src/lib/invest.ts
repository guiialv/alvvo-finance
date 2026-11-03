/** Carteira: posições por preço médio, renda fixa estimada, resultado realizado e próximo aporte. Funções puras. */
export type Cls = "acao" | "fii" | "etf" | "exterior" | "cripto" | "rf";
export const CLS: Record<Cls, { l: string; c: string }> = {
  acao: { l: "Ações", c: "#0f766e" }, fii: { l: "FIIs", c: "#0369a1" }, etf: { l: "ETFs", c: "#7c3aed" },
  exterior: { l: "Exterior", c: "#c026d3" }, cripto: { l: "Cripto", c: "#d97706" }, rf: { l: "Renda fixa", c: "#475569" },
};
export const RF_TYPES = ["CDB", "LCI", "LCA", "Tesouro Selic", "Tesouro Prefixado", "Tesouro IPCA+", "Debênture", "CRI", "CRA", "Outro"];

export interface Op { id: string; date: string; type: "compra" | "venda"; ticker: string; name: string | null; cls: Exclude<Cls, "rf">; qty: number; price: number; costs: number }
export interface Fixed { id: string; name: string; kind: string; amount: number; date: string; index: "cdi" | "ipca" | "pre" | "selic"; rate: number; maturity: string | null; redeemed_at: string | null }
export interface Dividend { id: string; date: string; ticker: string; kind: string; amount: number }

const daysBetween = (a: string, b: string) => Math.max(0, (Date.parse(b) - Date.parse(a)) / 864e5);

/** Valor bruto estimado de um título hoje (sem IR e sem marcação a mercado). */
export function rfValue(f: Fixed, cdi: number, ipca: number, today: string) {
  const years = daysBetween(f.date, today) / 365;
  const annual = f.index === "cdi" ? (cdi / 100) * (f.rate / 100) : f.index === "selic" ? (cdi + 0.1 + f.rate) / 100 : f.index === "ipca" ? (1 + ipca / 100) * (1 + f.rate / 100) - 1 : f.rate / 100;
  return Number(f.amount) * Math.pow(1 + annual, years);
}

export interface Position { ticker: string; name: string | null; cls: Exclude<Cls, "rf">; qty: number; cost: number; realized: number; costs: number; first: string }
export function positions(ops: Op[]): Position[] {
  const map = new Map<string, Position>();
  for (const o of [...ops].sort((a, b) => a.date.localeCompare(b.date) || (a.type === "compra" ? -1 : 1))) {
    const p = map.get(o.ticker) ?? { ticker: o.ticker, name: o.name, cls: o.cls, qty: 0, cost: 0, realized: 0, costs: 0, first: o.date };
    const qty = Number(o.qty), price = Number(o.price), costs = Number(o.costs || 0);
    if (o.type === "compra") { p.qty += qty; p.cost += qty * price + costs; }
    else { const avg = p.qty ? p.cost / p.qty : 0, q = Math.min(qty, p.qty); p.realized += q * price - costs - q * avg; p.qty -= q; p.cost -= q * avg; }
    p.costs += costs; p.name = o.name || p.name; map.set(o.ticker, p);
  }
  return [...map.values()];
}

export interface Row extends Position { avg: number; quote: number | null; value: number; pnl: number; pnlPct: number }
export function summary(ops: Op[], fixed: Fixed[], divs: Dividend[], quotes: Record<string, number | null>, cdi: number, ipca: number, today: string) {
  const pos = positions(ops), open = pos.filter((p) => p.qty > 1e-7);
  const rows: Row[] = open.map((p) => { const q = quotes[p.ticker] ?? null, avg = p.cost / p.qty, value = q != null ? q * p.qty : p.cost; return { ...p, avg, quote: q, value, pnl: value - p.cost, pnlPct: p.cost ? (value - p.cost) / p.cost : 0 }; });
  const rf = fixed.filter((f) => !f.redeemed_at).map((f) => { const v = rfValue(f, cdi, ipca, today); return { ...f, value: v, pnl: v - Number(f.amount) }; });
  const byCls: Partial<Record<Cls, number>> = {};
  for (const r of rows) byCls[r.cls] = (byCls[r.cls] ?? 0) + r.value;
  for (const f of rf) byCls.rf = (byCls.rf ?? 0) + f.value;
  const total = Object.values(byCls).reduce((a, v) => a + (v ?? 0), 0);
  const invested = rows.reduce((a, r) => a + r.cost, 0) + rf.reduce((a, f) => a + Number(f.amount), 0);
  const realized = pos.reduce((a, p) => a + p.realized, 0);
  const since = new Date(Date.parse(today) - 365 * 864e5).toISOString().slice(0, 10);
  const divs12 = divs.filter((d) => d.date >= since).reduce((a, d) => a + Number(d.amount), 0);
  return { rows, rf, byCls, total, invested, realized, divs12 };
}

/** Divide o aporte para aproximar a carteira da alocação-alvo (preenche os déficits primeiro). */
export function splitContribution(byCls: Partial<Record<Cls, number>>, total: number, targets: Record<string, number>, aporte: number) {
  const keys = Object.keys(CLS) as Cls[], newTotal = total + aporte;
  const deficits = keys.map((k) => ({ k, d: Math.max(0, ((targets[k] ?? 0) / 100) * newTotal - (byCls[k] ?? 0)) }));
  const dSum = deficits.reduce((a, x) => a + x.d, 0);
  return deficits.map((x) => ({ k: x.k, v: dSum ? (x.d / dSum) * aporte : ((targets[x.k] ?? 0) / 100) * aporte })).filter((x) => x.v >= 1);
}

/** Cada venda contra o preço médio do momento (mesma regra da Receita). */
export function closedTrades(ops: Op[]) {
  const st: Record<string, { qty: number; cost: number; first: string }> = {}, rows: { v: Op; firstDate: string; avg: number; cost: number; res: number }[] = [];
  for (const o of [...ops].sort((a, b) => a.date.localeCompare(b.date) || (a.type === "compra" ? -1 : 1))) {
    const p = (st[o.ticker] = st[o.ticker] ?? { qty: 0, cost: 0, first: o.date });
    const qty = Number(o.qty), price = Number(o.price), costs = Number(o.costs || 0);
    if (o.type === "compra") { if (!p.qty) p.first = o.date; p.qty += qty; p.cost += qty * price + costs; continue; }
    const avg = p.qty ? p.cost / p.qty : 0, q = Math.min(qty, p.qty), cost = q * avg, net = q * price - costs;
    rows.push({ v: o, firstDate: p.first, avg, cost, res: net - cost }); p.qty -= q; p.cost -= cost;
  }
  return rows.sort((a, b) => b.v.date.localeCompare(a.v.date));
}
