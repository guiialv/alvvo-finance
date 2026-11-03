"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEdit } from "@/lib/context";
import { cycleOf, todayIso } from "@/lib/cycle";
import { lastDayOf } from "@/lib/agenda";
import { normalizeMerchant } from "@/lib/categorize";
import { parseMoneyInput } from "@/lib/format";

const day = (v: FormDataEntryValue | null) => Math.max(1, Math.min(31, Number(v) || 1));
const refresh = () => { revalidatePath("/agenda"); revalidatePath("/"); revalidatePath("/lancamentos"); };

export async function saveAgendaItem(formData: FormData) {
  const ctx = await requireEdit("agenda");
  const id = String(formData.get("id") ?? "");
  const type = String(formData.get("type"));
  if (!["cartao", "conta", "receita"].includes(type)) return;
  const row = {
    household_id: ctx.household.id, type,
    name: String(formData.get("name") ?? "").trim() || "Sem nome",
    due_day: day(formData.get("due_day")),
    closing_day: type === "cartao" ? day(formData.get("closing_day")) : null,
    card_last4: type === "cartao" ? String(formData.get("card_last4") ?? "").trim() || null : null,
    amount: type === "cartao" ? null : parseMoneyInput(String(formData.get("amount") ?? "")),
    category_id: type === "cartao" ? null : String(formData.get("category_id") ?? "") || null,
    member_user_id: String(formData.get("member_user_id") ?? "") || ctx.user.id,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
  if (id) await ctx.supabase.from("agenda_items").update(row).eq("id", id).eq("household_id", ctx.household.id);
  else await ctx.supabase.from("agenda_items").insert({ ...row, starts_on: todayIso() });
  refresh();
  redirect("/agenda");
}

export async function deleteAgendaItem(formData: FormData) {
  const ctx = await requireEdit("agenda");
  await ctx.supabase.from("agenda_items").delete().eq("id", String(formData.get("id"))).eq("household_id", ctx.household.id);
  refresh();
}

/** Marca uma ocorrência como paga/recebida. Contas e receitas viram lançamento; fatura só é marcada. */
export async function payOccurrence(formData: FormData) {
  const ctx = await requireEdit("agenda");
  const [itemId, month, event] = String(formData.get("key")).split("|");
  const { data: it } = await ctx.supabase.from("agenda_items").select("*").eq("id", itemId).eq("household_id", ctx.household.id).single();
  if (!it || !/^\d{4}-\d{2}$/.test(month)) return;

  let transactionId: string | null = null;
  if (event !== "vencimento") {
    const [y, m] = month.split("-").map(Number);
    const date = `${month}-${String(Math.min(it.due_day, lastDayOf(y, m))).padStart(2, "0")}`;
    let kind = event === "receita" ? "receita" : "despesa";
    let scope = "pessoal";
    if (it.category_id) {
      const { data: cat } = await ctx.supabase.from("categories").select("kind, scope").eq("id", it.category_id).single();
      if (cat) { kind = cat.kind; scope = cat.scope; }
    }
    const { data: tx } = await ctx.supabase.from("transactions").insert({
      household_id: ctx.household.id, scope, date, cycle: cycleOf(date, ctx.household.cycle_start_day),
      description: it.name, merchant_key: normalizeMerchant(it.name), amount: Number(it.amount ?? 0), kind,
      category_id: it.category_id, member_user_id: it.member_user_id, source: "agenda", notes: it.notes, created_by: ctx.user.id,
    }).select("id").single();
    transactionId = tx?.id ?? null;
  }
  await ctx.supabase.from("agenda_payments").upsert({ household_id: ctx.household.id, item_id: itemId, month, event, transaction_id: transactionId });
  refresh();
}

export async function unpayOccurrence(formData: FormData) {
  const ctx = await requireEdit("agenda");
  const [itemId, month, event] = String(formData.get("key")).split("|");
  const { data: p } = await ctx.supabase.from("agenda_payments").select("transaction_id").eq("item_id", itemId).eq("month", month).eq("event", event).single();
  if (p?.transaction_id) await ctx.supabase.from("transactions").delete().eq("id", p.transaction_id).eq("household_id", ctx.household.id);
  await ctx.supabase.from("agenda_payments").delete().eq("item_id", itemId).eq("month", month).eq("event", event);
  refresh();
}
