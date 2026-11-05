import type { Ctx } from "@/lib/context";
import { GROUP_HINT, GROUP_ORDER, type Kind, type Scope } from "@/lib/categories-default";
import { groupColor } from "@/lib/theme";

export interface Group {
  id: string;
  scope: Scope;
  kind: Kind;
  name: string;
  hint: string | null;
  color: string | null;
  sort: number;
  system: boolean;
}

export const KIND_LABEL: Record<Kind, string> = { receita: "Receitas", investimento: "Investimentos", despesa: "Despesas", transferencia: "Transferências" };
export const KIND_ORDER: Kind[] = ["receita", "investimento", "despesa", "transferencia"];
export const KIND_COLOR: Record<Kind, string> = { receita: "#15803d", investimento: "#0369a1", despesa: "#e11d48", transferencia: "#64748b" };
export const KIND_HINT: Record<Kind, string> = {
  receita: "Dinheiro que entra",
  investimento: "Dinheiro que você guarda e faz render",
  despesa: "Dinheiro que sai para gastos",
  transferencia: "Movimentações entre contas — não entram nos totais",
};

export const colorOf = (g: Pick<Group, "name" | "color">) => groupColor(g.name, g.color);

/** Grupos da conta, na ordem definida. Se algum grupo existe só nas categorias (contas antigas), ele é criado. */
export async function loadGroups(ctx: Ctx, scope?: Scope): Promise<Group[]> {
  let q = ctx.supabase.from("category_groups").select("*").eq("household_id", ctx.household.id);
  if (scope) q = q.eq("scope", scope);
  const { data } = await q.order("sort");
  const groups = (data ?? []) as Group[];

  let cq = ctx.supabase.from("categories").select("scope, kind, grp").eq("household_id", ctx.household.id);
  if (scope) cq = cq.eq("scope", scope);
  const { data: cats } = await cq;
  const have = new Set(groups.map((g) => `${g.scope}|${g.name}`));
  const missing = new Map<string, { scope: Scope; kind: Kind; name: string }>();
  for (const c of (cats ?? []) as { scope: Scope; kind: Kind; grp: string }[]) {
    const k = `${c.scope}|${c.grp}`;
    if (!have.has(k) && !missing.has(k)) missing.set(k, { scope: c.scope, kind: c.kind, name: c.grp });
  }
  if (missing.size) {
    const max = groups.reduce((a, g) => Math.max(a, g.sort), 0);
    const rows = [...missing.values()].map((m, i) => {
      const pos = GROUP_ORDER[m.scope].indexOf(m.name);
      return {
        household_id: ctx.household.id, scope: m.scope, kind: m.kind, name: m.name, hint: GROUP_HINT[m.name] ?? null,
        sort: pos >= 0 ? (pos + 1) * 10 + (m.scope === "pj" ? 70 : 0) : max + (i + 1) * 10, system: m.name === "A classificar",
      };
    });
    const { data: ins } = await ctx.supabase.from("category_groups").upsert(rows, { onConflict: "household_id,scope,name", ignoreDuplicates: true }).select("*");
    const added = (ins ?? []) as Group[];
    // Sem permissão de escrita: mostra mesmo assim, só não persiste
    const list = added.length ? added : rows.map((r, i) => ({ ...r, id: `tmp-${i}`, color: null }) as Group);
    groups.push(...list);
    groups.sort((a, b) => a.sort - b.sort);
  }
  return groups.sort((a, b) => (a.scope === b.scope ? 0 : a.scope === "pessoal" ? -1 : 1) || a.sort - b.sort);
}

/** Linhas de grupos para uma conta nova, a partir das categorias do modelo. */
export function templateGroups(cats: { scope: Scope; kind: Kind; grp: string }[]) {
  const seen = new Map<string, { scope: Scope; kind: Kind; name: string; hint: string | null; sort: number; system: boolean }>();
  for (const c of cats) {
    const k = `${c.scope}|${c.grp}`;
    if (seen.has(k)) continue;
    const pos = GROUP_ORDER[c.scope].indexOf(c.grp);
    seen.set(k, { scope: c.scope, kind: c.kind, name: c.grp, hint: GROUP_HINT[c.grp] ?? null, sort: (pos + 1) * 10 + (c.scope === "pj" ? 70 : 0), system: c.grp === "A classificar" });
  }
  return [...seen.values()];
}
