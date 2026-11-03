import type { Ctx } from "@/lib/context";
import type { Account, Category, Transaction } from "@/lib/data";
import type { CatLite, MemberLite, TxView } from "@/components/tx-table";

/** Prepara os lançamentos para a tabela com painel lateral. */
export async function buildTxViews(ctx: Ctx, txs: Transaction[], accounts: Account[]): Promise<TxView[]> {
  const acc = new Map(accounts.map((a) => [a.id, a] as [string, Account]));
  const batchIds = [...new Set(txs.map((t) => (t as Transaction & { import_batch_id?: string | null }).import_batch_id).filter((x): x is string => !!x))];
  const labels = new Map<string, string>();
  if (batchIds.length) {
    const { data } = await ctx.supabase.from("import_batches").select("id, institution, due_date").in("id", batchIds);
    for (const b of data ?? []) labels.set(b.id, `Fatura ${b.institution ?? ""} · venc. ${b.due_date ? String(b.due_date).split("-").reverse().join("/") : "—"}`);
  }
  const mkCount = new Map<string, number>();
  for (const t of txs) if (t.merchant_key) mkCount.set(t.merchant_key, (mkCount.get(t.merchant_key) ?? 0) + 1);
  return txs.map((t) => {
    const x = t as Transaction & Record<string, unknown>;
    const a = t.account_id ? acc.get(t.account_id) : undefined;
    return {
      id: t.id, date: t.date, cycle: t.cycle, description: t.description, amount: Number(t.amount), kind: t.kind, scope: t.scope,
      category_id: t.category_id, member_user_id: t.member_user_id, notes: t.notes, merchant_key: t.merchant_key,
      installment_no: t.installment_no, installment_total: t.installment_total, bank_category: t.bank_category,
      city: (x.city as string) ?? null, international: !!x.international,
      foreign_amount: x.foreign_amount != null ? Number(x.foreign_amount) : null, foreign_currency: (x.foreign_currency as string) ?? null,
      fx_rate: x.fx_rate != null ? Number(x.fx_rate) : null, source: t.source,
      account_name: a ? a.name : null, batch_label: x.import_batch_id ? labels.get(x.import_batch_id as string) ?? null : null,
      same_merchant: t.merchant_key ? (mkCount.get(t.merchant_key) ?? 1) - 1 : 0,
    };
  });
}

export const toCatLite = (cats: Category[]): CatLite[] =>
  cats.map((c) => ({ id: c.id, name: c.name, grp: c.grp, subgroup: c.subgroup, scope: c.scope, kind: c.kind, active: c.active }));

export const toMemberLite = (members: { user_id: string; display_name: string; role: string }[]): MemberLite[] =>
  [...members].sort((a, b) => (a.role === "dono" ? -1 : b.role === "dono" ? 1 : 0)).map((m, i) => ({ user_id: m.user_id, display_name: m.display_name, index: i }));
