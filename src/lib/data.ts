import type { Ctx } from "@/lib/context";
import { categoryKey, GROUP_ORDER, type Kind, type Scope } from "@/lib/categories-default";

export interface Category {
  id: string;
  scope: Scope;
  kind: Kind;
  grp: string;
  subgroup: string;
  name: string;
  sort: number;
  excluded_from_totals: boolean;
  active: boolean;
  /** Cor do grupo (definida no Orçamento). */
  color?: string | null;
  /** Posição do grupo na ordem definida pelo usuário. */
  group_sort?: number;
}

export interface Transaction {
  id: string;
  scope: Scope;
  date: string;
  cycle: string;
  description: string;
  merchant_key: string | null;
  amount: number;
  kind: Kind;
  category_id: string | null;
  account_id: string | null;
  import_batch_id?: string | null;
  member_user_id: string | null;
  installment_no: number | null;
  installment_total: number | null;
  bank_category: string | null;
  source: string;
  notes: string | null;
}

export interface Account {
  id: string;
  scope: Scope;
  name: string;
  type: string;
  institution: string | null;
  last4: string | null;
  owner_user_id: string | null;
  active: boolean;
}

export async function loadCategories(ctx: Ctx, scope?: Scope): Promise<Category[]> {
  let q = ctx.supabase.from("categories").select("*").eq("household_id", ctx.household.id);
  if (scope) q = q.eq("scope", scope);
  let gq = ctx.supabase.from("category_groups").select("scope, name, color, sort").eq("household_id", ctx.household.id);
  if (scope) gq = gq.eq("scope", scope);
  const [{ data }, { data: groups }] = await Promise.all([q.order("sort"), gq]);
  const gm = new Map<string, { color: string | null; sort: number }>(((groups ?? []) as { scope: string; name: string; color: string | null; sort: number }[]).map((g) => [`${g.scope}|${g.name}`, g] as [string, { color: string | null; sort: number }]));
  const cats = ((data ?? []) as Category[]).map((c) => {
    const g = gm.get(`${c.scope}|${c.grp}`);
    return { ...c, color: g?.color ?? null, group_sort: g?.sort };
  });
  return sortCategories(cats);
}

export function sortCategories(cats: Category[]): Category[] {
  const order = (c: Category) => {
    if (c.group_sort != null) return (c.scope === "pj" ? 100000 : 0) + c.group_sort;
    const g = GROUP_ORDER[c.scope]?.indexOf(c.grp) ?? 99;
    return (c.scope === "pj" ? 100000 : 0) + (g < 0 ? 9999 : (g + 1) * 10);
  };
  return [...cats].sort((a, b) => order(a) - order(b) || a.sort - b.sort || a.name.localeCompare(b.name));
}

export function categoryIndex(cats: Category[]) {
  const byId = new Map<string, Category>(cats.map((c) => [c.id, c] as [string, Category]));
  const byKey = new Map<string, Category>(cats.map((c) => [categoryKey(c), c] as [string, Category]));
  return { byId, byKey };
}

export async function loadTransactions(ctx: Ctx, opts: { scope?: Scope; cycles?: string[]; limit?: number }) {
  const build = () => {
    let q = ctx.supabase.from("transactions").select("*").eq("household_id", ctx.household.id);
    if (opts.scope) q = q.eq("scope", opts.scope);
    if (opts.cycles?.length) q = q.in("cycle", opts.cycles);
    // "Ver como" e escopo "só os próprios" (o banco já aplica isso para o próprio membro)
    if (ctx.viewer.txScope === "proprios" && ctx.viewer.role !== "dono" && ctx.viewer.role !== "admin") q = q.eq("member_user_id", ctx.viewer.userId);
    if (ctx.viewer.simulated && (ctx.viewer.areas.pj ?? "nada") === "nada" && ctx.viewer.role !== "admin") q = q.neq("scope", "pj");
    return q.order("date", { ascending: false }).order("created_at", { ascending: false });
  };
  // Paginação para não esbarrar no limite de 1000 linhas do Supabase
  const all: Transaction[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await build().range(from, from + page - 1);
    if (error) throw new Error(error.message);
    all.push(...((data ?? []) as Transaction[]));
    if (!data || data.length < page || (opts.limit && all.length >= opts.limit)) break;
  }
  return opts.limit ? all.slice(0, opts.limit) : all;
}

export async function loadAccounts(ctx: Ctx): Promise<Account[]> {
  const { data } = await ctx.supabase.from("accounts").select("*").eq("household_id", ctx.household.id).order("name");
  return (data ?? []) as Account[];
}

export async function loadMembers(ctx: Ctx) {
  const { data } = await ctx.supabase.from("household_members").select("user_id, display_name, role").eq("household_id", ctx.household.id);
  return (data ?? []) as { user_id: string; display_name: string; role: string }[];
}

/** Soma de lançamentos por categoria, ignorando categorias marcadas como fora do total. */
export function sumByCategory(txs: Transaction[]) {
  const m = new Map<string, number>();
  for (const t of txs) {
    const k = t.category_id ?? "_none";
    m.set(k, (m.get(k) ?? 0) + Number(t.amount));
  }
  return m;
}

export interface CycleSummary {
  receitas: number;
  investimentos: number;
  despesas: number;
  porGrupo: Record<string, number>;
  saldo: number;
}

export function summarize(txs: Transaction[], cats: Category[]): CycleSummary {
  const { byId } = categoryIndex(cats);
  const s: CycleSummary = { receitas: 0, investimentos: 0, despesas: 0, porGrupo: {}, saldo: 0 };
  for (const t of txs) {
    const c = t.category_id ? byId.get(t.category_id) : undefined;
    if (c?.excluded_from_totals) continue;
    const kind = c?.kind ?? t.kind;
    const v = Number(t.amount);
    if (kind === "receita") s.receitas += v;
    else if (kind === "investimento") s.investimentos += v;
    else if (kind === "despesa") {
      s.despesas += v;
      const g = c?.grp ?? "A classificar";
      s.porGrupo[g] = (s.porGrupo[g] ?? 0) + v;
    }
  }
  s.saldo = s.receitas - s.investimentos - s.despesas;
  return s;
}
