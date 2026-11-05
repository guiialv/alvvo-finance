/**
 * Fluxo do dinheiro: para onde foi a renda de um período (dados para o diagrama de Sankey e afins).
 */
import { type Category, categoryIndex, type Transaction } from "@/lib/data";
import { groupColor } from "@/lib/theme";

export interface FlowNode { id: string; label: string; value: number; color: string; col: number; href?: string }
export interface FlowLink { source: string; target: string; value: number }
export interface FlowData { nodes: FlowNode[]; links: FlowLink[]; total: number; receitas: number; despesas: number; investimentos: number; saldo: number }

export const FLOW_COLORS = {
  renda: "#8a9a7b", fonte: "#a3b094", despesas: "#9a5b3c", investimentos: "#a8834f", sobra: "#8f9a8a", deficit: "#a33f30", menores: "#b9a894",
};

interface Totals { receitas: Map<string, number>; despesas: Map<string, number>; invest: Map<string, number> }

function totals(txs: Transaction[], cats: Category[]): Totals {
  const { byId } = categoryIndex(cats);
  const t: Totals = { receitas: new Map(), despesas: new Map(), invest: new Map() };
  for (const x of txs) {
    const c = x.category_id ? byId.get(x.category_id) : undefined;
    if (c?.excluded_from_totals) continue;
    const kind = c?.kind ?? x.kind, v = Number(x.amount), id = c?.id ?? "_sem";
    const m = kind === "receita" ? t.receitas : kind === "despesa" ? t.despesas : kind === "investimento" ? t.invest : null;
    if (m) m.set(id, (m.get(id) ?? 0) + v);
  }
  return t;
}

/** Top N + “outros”, só valores positivos. */
function topN(entries: [string, number, string, string][], n: number, otherLabel: string, otherColor: string) {
  const pos = entries.filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]);
  if (pos.length <= n + 1) return pos;
  const rest = pos.slice(n).reduce((a, [, v]) => a + v, 0);
  return [...pos.slice(0, n), ["_outros", rest, otherLabel, otherColor] as [string, number, string, string]];
}

export function buildFlow(txs: Transaction[], cats: Category[], level: "grupo" | "categoria" = "grupo", maxItems = 8): FlowData | null {
  const { byId } = categoryIndex(cats);
  const t = totals(txs, cats);
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, v) => a + Math.max(0, v), 0);
  const receitas = sum(t.receitas), despesas = sum(t.despesas), investimentos = sum(t.invest);
  if (receitas <= 0 && despesas <= 0) return null;
  const saldo = receitas - despesas - investimentos;
  const nodes: FlowNode[] = [], links: FlowLink[] = [];
  const catName = (id: string) => byId.get(id)?.name ?? "Sem categoria";

  // Coluna 0: fontes de renda (só quando há mais de uma)
  const fontes = topN([...t.receitas].map(([id, v]) => [id, v, catName(id), FLOW_COLORS.fonte]), 5, "Outras receitas", FLOW_COLORS.fonte);
  const multi = fontes.length > 1;
  const c0 = multi ? 0 : -1;
  if (multi) for (const [id, v, l] of fontes) { nodes.push({ id: `f:${id}`, label: l, value: v, color: FLOW_COLORS.fonte, col: 0 }); links.push({ source: `f:${id}`, target: "renda", value: v }); }

  // Coluna 1: renda (+ déficit, quando se gastou mais do que entrou)
  const c1 = c0 + 1;
  if (receitas > 0) nodes.push({ id: "renda", label: "Renda", value: receitas, color: FLOW_COLORS.renda, col: c1 });
  const deficit = Math.max(0, -saldo);
  if (deficit > 0) nodes.push({ id: "deficit", label: "Déficit", value: deficit, color: FLOW_COLORS.deficit, col: c1 });

  // Coluna 2: despesas, investimentos, sobra
  const c2 = c1 + 1;
  let fromRenda = receitas;
  const feed = (target: string, value: number) => {
    const a = Math.min(fromRenda, value);
    if (a > 0.005) links.push({ source: "renda", target, value: a });
    fromRenda -= a;
    if (value - a > 0.005) links.push({ source: "deficit", target, value: value - a });
  };
  if (despesas > 0) { nodes.push({ id: "despesas", label: "Despesas", value: despesas, color: FLOW_COLORS.despesas, col: c2 }); feed("despesas", despesas); }
  if (investimentos > 0) { nodes.push({ id: "invest", label: "Investimentos", value: investimentos, color: FLOW_COLORS.investimentos, col: c2, href: "/investimentos" }); feed("invest", investimentos); }
  if (saldo > 0.005) { nodes.push({ id: "sobra", label: "Sobra", value: saldo, color: FLOW_COLORS.sobra, col: c2 }); links.push({ source: "renda", target: "sobra", value: saldo }); }

  // Coluna 3: para onde foram as despesas (por grupo ou por categoria) e os investimentos
  const c3 = c2 + 1;
  let entries: [string, number, string, string][];
  if (level === "grupo") {
    const g = new Map<string, number>();
    for (const [id, v] of t.despesas) { const c = byId.get(id); const k = c?.grp ?? "A classificar"; g.set(k, (g.get(k) ?? 0) + v); }
    const colorOf = (name: string) => groupColor(name, cats.find((c) => c.grp === name)?.color);
    entries = [...g].map(([name, v]) => [`g:${name}`, v, name, colorOf(name)]);
  } else {
    entries = [...t.despesas].map(([id, v]) => { const c = byId.get(id); return [`c:${id}`, v, c?.name ?? "Sem categoria", groupColor(c?.grp, c?.color)]; });
  }
  for (const [id, v, l, col] of topN(entries, maxItems, "Despesas menores", FLOW_COLORS.menores)) {
    nodes.push({ id: `d:${id}`, label: l, value: v, color: col, col: c3 }); links.push({ source: "despesas", target: `d:${id}`, value: v });
  }
  const inv = topN([...t.invest].map(([id, v]) => [id, v, catName(id), FLOW_COLORS.investimentos]), 3, "Outros investimentos", FLOW_COLORS.investimentos);
  if (inv.length > 1) for (const [id, v, l] of inv) { nodes.push({ id: `i:${id}`, label: l, value: v, color: FLOW_COLORS.investimentos, col: c3 }); links.push({ source: "invest", target: `i:${id}`, value: v }); }

  return { nodes, links, total: Math.max(receitas, despesas + investimentos), receitas, despesas, investimentos, saldo };
}

/** “A cada R$ 100 que entraram”: participação de cada destino na renda, por ciclo. */
export function shareByCycle(txs: Transaction[], cats: Category[], cycles: string[]) {
  const { byId } = categoryIndex(cats);
  return cycles.map((cy) => {
    const t = totals(txs.filter((x) => x.cycle === cy), cats);
    const receitas = [...t.receitas.values()].reduce((a, v) => a + Math.max(0, v), 0);
    const groups = new Map<string, number>();
    for (const [id, v] of t.despesas) { const g = byId.get(id)?.grp ?? "A classificar"; groups.set(g, (groups.get(g) ?? 0) + v); }
    const inv = [...t.invest.values()].reduce((a, v) => a + Math.max(0, v), 0);
    const desp = [...groups.values()].reduce((a, v) => a + Math.max(0, v), 0);
    return { cycle: cy, receitas, groups, investimentos: inv, despesas: desp, saldo: receitas - desp - inv };
  });
}
