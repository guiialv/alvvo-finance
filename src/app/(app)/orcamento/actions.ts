"use server";

import { revalidatePath } from "next/cache";
import { requireEdit } from "@/lib/context";
import { isValidCycle, shiftCycle } from "@/lib/cycle";
import { parseMoneyInput, round2 } from "@/lib/format";

export async function saveBudget(categoryId: string, cycle: string, value: string) {
  if (!isValidCycle(cycle)) return { error: "Ciclo inválido" };
  const ctx = await requireEdit("orcamento");
  const planned = parseMoneyInput(value) ?? 0;
  const { error } = planned === 0
    ? await ctx.supabase.from("budgets").delete().eq("category_id", categoryId).eq("cycle", cycle)
    : await ctx.supabase.from("budgets").upsert({ household_id: ctx.household.id, category_id: categoryId, cycle, planned }, { onConflict: "category_id,cycle" });
  if (error) return { error: error.message };
  revalidatePath("/orcamento");
  revalidatePath("/");
  return { ok: true };
}

/** Preenche o orçamento do ciclo copiando o anterior ou usando a média realizada dos últimos 3 ciclos. */
export async function fillBudget(formData: FormData) {
  const ctx = await requireEdit("orcamento");
  const cycle = String(formData.get("cycle"));
  const mode = String(formData.get("mode"));
  const scope = String(formData.get("scope") ?? "pessoal");
  if (!isValidCycle(cycle)) return;
  const hh = ctx.household.id;

  const { data: cats } = await ctx.supabase.from("categories").select("id, kind").eq("household_id", hh).eq("scope", scope);
  const ids = new Set((cats ?? []).filter((c) => c.kind !== "transferencia").map((c) => c.id as string));
  let rows: { household_id: string; category_id: string; cycle: string; planned: number }[] = [];

  if (mode === "copiar") {
    const { data } = await ctx.supabase.from("budgets").select("category_id, planned").eq("household_id", hh).eq("cycle", shiftCycle(cycle, -1));
    rows = (data ?? []).filter((b) => ids.has(b.category_id)).map((b) => ({ household_id: hh, category_id: b.category_id, cycle, planned: Number(b.planned) }));
  } else {
    const prev = [1, 2, 3].map((n) => shiftCycle(cycle, -n));
    const { data } = await ctx.supabase.from("transactions").select("category_id, amount").eq("household_id", hh).eq("scope", scope).in("cycle", prev).limit(10000);
    const sum = new Map<string, number>();
    for (const t of data ?? []) if (t.category_id && ids.has(t.category_id)) sum.set(t.category_id, (sum.get(t.category_id) ?? 0) + Number(t.amount));
    rows = [...sum.entries()].filter(([, v]) => v > 0).map(([id, v]) => ({ household_id: hh, category_id: id, cycle, planned: Math.ceil(round2(v / 3) / 10) * 10 }));
  }
  if (rows.length) await ctx.supabase.from("budgets").upsert(rows, { onConflict: "category_id,cycle" });
  revalidatePath("/orcamento");
  revalidatePath("/");
}
