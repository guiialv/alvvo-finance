/** Objetivos: meta de patrimônio, independência financeira e caixinhas. Funções puras. */
import { shiftCycle } from "@/lib/cycle";

export type GoalType = "patrimonio" | "independencia" | "caixinha";
export interface Goal { id: string; type: GoalType; name: string; data: GoalData; sort: number }
export interface GoalData {
  target?: number; deadline?: string; start?: string; rate?: number; source?: "carteira" | "manual"; extra?: number; note?: string;
  income?: number; multiple?: number; initial?: number; monthly?: number; birth?: string; startMonth?: string;
  balance?: number; auto?: "reserva" | null;
}
export const GOAL_T: Record<GoalType, { l: string; c: string; i: string }> = {
  patrimonio: { l: "Meta de patrimônio", c: "#7a5c32", i: "trend" },
  independencia: { l: "Independência financeira", c: "#7b5c7e", i: "target" },
  caixinha: { l: "Caixinha", c: "#c9973f", i: "layers" },
};

export const monthsBetween = (a: string, b: string) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
/** Aporte mensal para sair de pv e chegar a fv em n meses a juros i (a.m.). */
export const pmtNeeded = (pv: number, fv: number, n: number, i: number) =>
  n <= 0 ? Math.max(0, fv - pv) : i ? Math.max(0, ((fv - pv * Math.pow(1 + i, n)) * i) / (Math.pow(1 + i, n) - 1)) : Math.max(0, (fv - pv) / n);
export function growth(pv: number, pmt: number, i: number, months: number) { const out = [pv]; let a = pv; for (let k = 1; k <= months; k++) { a = a * (1 + i) + pmt; out.push(a); } return out; }

/** Reserva de emergência: 6× o custo essencial (Fixas + Variáveis) médio dos 3 últimos ciclos com despesas. */
export function reserveTarget(txs: { cycle: string; amount: number; category_id: string | null; scope: string }[], cats: Map<string, { kind: string; grp: string; excluded_from_totals: boolean }>, now: string) {
  const cnt: Record<string, number> = {};
  for (const t of txs) if (t.scope === "pessoal" && t.category_id && cats.get(t.category_id)?.kind === "despesa") cnt[t.cycle] = (cnt[t.cycle] ?? 0) + 1;
  const cyc = Object.keys(cnt).filter((c) => c <= now && cnt[c] >= 5).sort().slice(-3);
  if (!cyc.length) return null;
  const tot = txs.filter((t) => { const c = t.category_id ? cats.get(t.category_id) : undefined; return cyc.includes(t.cycle) && t.scope === "pessoal" && c && ["Fixas", "Variáveis"].includes(c.grp) && !c.excluded_from_totals; }).reduce((a, t) => a + Number(t.amount), 0);
  return Math.round((tot / cyc.length) * 6);
}

export function goalCalc(g: Goal, now: string, portfolioTotal: number, reserve: number | null) {
  const d = g.data;
  if (g.type === "patrimonio") {
    const target = d.target ?? 0, deadline = d.deadline ?? shiftCycle(now, 12), start = d.start ?? now, i = (d.rate ?? 0) / 100;
    const current = (d.source === "manual" ? 0 : portfolioTotal) + (d.extra ?? 0), n = Math.max(0, monthsBetween(now, deadline));
    const need = pmtNeeded(current, target, n, i), elapsed = Math.max(0, monthsBetween(start, now)), totalM = Math.max(1, monthsBetween(start, deadline));
    const expected = target * (elapsed / totalM);
    return { kind: "meta" as const, current, target, n, need, pct: target ? current / target : 0, onTrack: current >= expected * 0.9, expected, series: growth(current, need, i, n), monthsAtPace: null as number | null };
  }
  if (g.type === "independencia") {
    const i = (d.rate ?? 1) / 100, income = d.income ?? 0, goal = income * (d.multiple ?? 300), monthly = d.monthly ?? 0;
    let a = (d.initial ?? 0) + monthly, m = d.startMonth ?? now, k = 1;
    let renda: { m: string; k: number } | null = null, mult: { m: string; k: number } | null = null;
    const pts: number[] = [];
    while (k < 900 && !mult) { pts.push(a); if (!renda && a * i >= income) renda = { m, k }; if (a >= goal) mult = { m, k }; a = a * (1 + i) + monthly; m = shiftCycle(m, 1); k++; }
    const age = (ym?: string) => (ym && d.birth ? Math.floor(monthsBetween(d.birth, ym) / 12) : null);
    return { kind: "fi" as const, goal, rendaAlvo: i ? income / i : 0, renda, mult, ageR: age(renda?.m), ageM: age(mult?.m), series: pts.filter((_, j) => j % 12 === 0) };
  }
  const target = d.auto === "reserva" ? reserve ?? 0 : d.target ?? 0, n = Math.max(0, monthsBetween(now, d.deadline ?? shiftCycle(now, 12)));
  const bal = d.balance ?? 0, monthly = d.monthly ?? 0, need = pmtNeeded(bal, target, n, 0.0105), proj = bal + monthly * n;
  return { kind: "meta" as const, current: bal, target, n, need, pct: target ? bal / target : 0, onTrack: proj >= target, expected: null as number | null, series: null as number[] | null, monthsAtPace: monthly ? Math.ceil(Math.max(0, target - bal) / monthly) : null };
}
