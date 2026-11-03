import type { Ctx } from "@/lib/context";
import { type AgendaItem, occurrences } from "@/lib/agenda";

/** Carrega itens e pagamentos da agenda e estima a fatura do cartão pela última importação. */
export async function loadAgenda(ctx: Ctx, from: string, to: string) {
  const hh = ctx.household.id;
  const [itemsRes, payRes, batchRes] = await Promise.all([
    ctx.supabase.from("agenda_items").select("*").eq("household_id", hh).order("due_day"),
    ctx.supabase.from("agenda_payments").select("item_id, month, event, transaction_id").eq("household_id", hh).gte("month", from.slice(0, 7)).lte("month", to.slice(0, 7)),
    ctx.supabase.from("import_batches").select("statement_total").eq("household_id", hh).eq("source", "fatura_pdf").order("due_date", { ascending: false }).limit(1),
  ]);
  const items = (itemsRes.data ?? []) as AgendaItem[];
  const lastStatement = batchRes.data?.[0]?.statement_total != null ? Number(batchRes.data[0].statement_total) : null;
  const occ = occurrences(items, payRes.data ?? [], from, to, () => lastStatement);
  return { items, occ };
}
