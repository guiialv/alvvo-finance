/** Investimentos ligados a objetivos: quanto da carteira compõe cada objetivo. Funções puras. */
export interface LinkedItem { ref: string; label: string; detail: string; value: number; kind: "rv" | "rf" }
export interface GoalLinks { byGoal: Map<string, LinkedItem[]>; totalOf: (goalId: string) => number; linkedTotal: number; free: number }

export function linkGoals(
  rows: { ticker: string; name: string | null; value: number; qty?: number }[],
  rf: { id: string; name: string; kind: string; value: number; goal_id?: string | null }[],
  tickerGoal: Record<string, string>,
  portfolioTotal: number,
): GoalLinks {
  const byGoal = new Map<string, LinkedItem[]>();
  const push = (g: string, it: LinkedItem) => byGoal.set(g, [...(byGoal.get(g) ?? []), it]);
  for (const r of rows) { const g = tickerGoal[r.ticker]; if (g) push(g, { ref: r.ticker, label: r.ticker, detail: r.name ?? "", value: r.value, kind: "rv" }); }
  for (const f of rf) if (f.goal_id) push(f.goal_id, { ref: f.id, label: f.name, detail: f.kind, value: f.value, kind: "rf" });
  const totalOf = (id: string) => (byGoal.get(id) ?? []).reduce((a, x) => a + x.value, 0);
  const linkedTotal = [...byGoal.values()].flat().reduce((a, x) => a + x.value, 0);
  return { byGoal, totalOf, linkedTotal, free: Math.max(0, portfolioTotal - linkedTotal) };
}
