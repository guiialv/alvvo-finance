/** Carteiras de avaliação: tipos e cálculos de desempenho. */
export interface EvalItem {
  id: string; portfolio_id: string; household_id: string; market: string; symbol: string; yahoo: string; name: string | null; currency: string | null;
  added_price: number | null; added_at: string; target_price: number | null; stop_price: number | null; rating: string; weight: number | null; thesis: string | null; updated_at: string;
}
export interface EvalNote { id: string; item_id: string; author_name: string | null; body: string; price: number | null; created_at: string }

export const RATING: Record<string, { l: string; c: string }> = {
  comprar: { l: "Comprar", c: "#4f7a52" }, acumular: { l: "Acumular", c: "#7d9a72" }, manter: { l: "Manter", c: "#8c8579" },
  reduzir: { l: "Reduzir", c: "#c0784a" }, vender: { l: "Vender", c: "#a33f30" }, observar: { l: "Observar", c: "#b8955a" },
};

export const itemReturn = (i: EvalItem, price?: number | null) => (i.added_price && price ? price / Number(i.added_price) - 1 : null);

/** Retorno médio (ponderado pelos pesos informados; sem pesos, igual para todos), melhor e pior ativo. */
export function portfolioStats(items: EvalItem[], prices: Map<string, number>) {
  const rets = items.map((i) => ({ i, r: itemReturn(i, prices.get(i.yahoo)) })).filter((x): x is { i: EvalItem; r: number } => x.r != null);
  if (!rets.length) return { ret: null as number | null, best: null as EvalItem | null, worst: null as EvalItem | null };
  const hasW = rets.some((x) => x.i.weight && Number(x.i.weight) > 0);
  const wsum = hasW ? rets.reduce((a, x) => a + (Number(x.i.weight) || 0), 0) : rets.length;
  const ret = rets.reduce((a, x) => a + x.r * (hasW ? Number(x.i.weight) || 0 : 1), 0) / (wsum || 1);
  const sorted = [...rets].sort((a, b) => b.r - a.r);
  return { ret, best: sorted[0].i, worst: sorted.length > 1 ? sorted[sorted.length - 1].i : null };
}
