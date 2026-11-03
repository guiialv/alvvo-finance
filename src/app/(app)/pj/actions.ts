"use server";

import { revalidatePath } from "next/cache";
import { requireEdit } from "@/lib/context";
import { parseMoneyInput } from "@/lib/format";

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
