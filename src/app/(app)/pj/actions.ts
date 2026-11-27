"use server";

import { revalidatePath } from "next/cache";
import { requireEdit } from "@/lib/context";
import { parseMoneyInput } from "@/lib/format";
import { cycleOf } from "@/lib/cycle";
import { normalizeMerchant } from "@/lib/categorize";

function refresh() { revalidatePath("/pj"); revalidatePath("/lancamentos"); revalidatePath("/"); }

export async function addInvoice(formData: FormData) {
  const ctx = await requireEdit("pj");
  const month = String(formData.get("month") ?? ""); // AAAA-MM
  if (!/^\d{4}-\d{2}$/.test(month)) return;
  const salary = parseMoneyInput(String(formData.get("salary_part") ?? "")) ?? 0;
  const commission = parseMoneyInput(String(formData.get("commission_part") ?? "")) ?? 0;
  const other = parseMoneyInput(String(formData.get("other_part") ?? "")) ?? 0;
  const totalIn = parseMoneyInput(String(formData.get("total") ?? ""));
  await ctx.supabase.from("pj_invoices").insert({
    household_id: ctx.household.id, month: `${month}-01`,
    number: String(formData.get("number") ?? "") || null, client: String(formData.get("client") ?? "") || null,
    total: totalIn ?? salary + commission + other, salary_part: salary, commission_part: commission, other_part: other,
    notes: String(formData.get("notes") ?? "") || null,
  });
  revalidatePath("/pj");
}

export async function deleteInvoice(formData: FormData) {
  const ctx = await requireEdit("pj");
  await ctx.supabase.from("pj_invoices").delete().eq("id", String(formData.get("id"))).eq("household_id", ctx.household.id);
  revalidatePath("/pj");
}

/** Imposto, custo, retirada ou outra receita da empresa, lançado direto na tela PJ. */
export async function addPjEntry(formData: FormData) {
  const ctx = await requireEdit("pj");
  const hh = ctx.household.id;
  const date = String(formData.get("date") ?? "");
  const categoryId = String(formData.get("category_id") ?? "");
  const amount = parseMoneyInput(String(formData.get("amount") ?? ""));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !categoryId || amount === null || amount <= 0) return;
  const { data: cat } = await ctx.supabase.from("categories").select("id, kind, scope, name").eq("id", categoryId).eq("household_id", hh).single();
  if (!cat || cat.scope !== "pj") return;
  const description = String(formData.get("description") ?? "").trim() || (cat.name as string);
  await ctx.supabase.from("transactions").insert({
    household_id: hh, scope: "pj", date, cycle: cycleOf(date, ctx.household.cycle_start_day),
    description, merchant_key: normalizeMerchant(description), amount, kind: cat.kind, category_id: cat.id,
    member_user_id: ctx.user.id, source: "manual", notes: null, created_by: ctx.user.id,
  });
  refresh();
}

export async function deletePjEntry(formData: FormData) {
  const ctx = await requireEdit("pj");
  await ctx.supabase.from("transactions").delete().eq("id", String(formData.get("id"))).eq("household_id", ctx.household.id).eq("scope", "pj");
  refresh();
}
