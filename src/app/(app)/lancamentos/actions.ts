"use server";

import { revalidatePath } from "next/cache";
import { requireEdit } from "@/lib/context";
import { cycleOf } from "@/lib/cycle";
import { normalizeMerchant } from "@/lib/categorize";
import { parseMoneyInput } from "@/lib/format";

function refresh() {
  revalidatePath("/lancamentos");
  revalidatePath("/orcamento");
  revalidatePath("/pj");
  revalidatePath("/");
}

/**
 * Altera a categoria de um lançamento e APRENDE: cria/atualiza uma regra para o estabelecimento
 * e aplica a mesma categoria aos lançamentos ainda não classificados do mesmo estabelecimento.
 */
export async function setCategory(txId: string, categoryId: string, learn = true) {
  const ctx = await requireEdit("lancamentos");
  const hh = ctx.household.id;
  const [{ data: cat }, { data: tx }] = await Promise.all([
    ctx.supabase.from("categories").select("id, kind, scope, grp").eq("id", categoryId).eq("household_id", hh).single(),
    ctx.supabase.from("transactions").select("id, merchant_key, description").eq("id", txId).eq("household_id", hh).single(),
  ]);
  if (!cat || !tx) return { error: "Lançamento ou categoria não encontrados" };

  const { error } = await ctx.supabase.from("transactions").update({ category_id: cat.id, kind: cat.kind, scope: cat.scope }).eq("id", txId);
  if (error) return { error: error.message };

  let applied = 0;
  const mk = tx.merchant_key || normalizeMerchant(tx.description);
  if (learn && mk && mk.length >= 3 && cat.grp !== "A classificar") {
    await ctx.supabase.from("category_rules").upsert(
      { household_id: hh, pattern: mk, match_type: "prefix", category_id: cat.id, scope: cat.scope, updated_at: new Date().toISOString() },
      { onConflict: "household_id,pattern" },
    );
    const { data: unc } = await ctx.supabase.from("categories").select("id").eq("household_id", hh).eq("grp", "A classificar");
    const uncIds = (unc ?? []).map((c) => c.id as string);
    const filter = uncIds.length ? `category_id.is.null,category_id.in.(${uncIds.join(",")})` : "category_id.is.null";
    const { data: upd } = await ctx.supabase
      .from("transactions")
      .update({ category_id: cat.id, kind: cat.kind, scope: cat.scope })
      .eq("household_id", hh)
      .eq("merchant_key", mk)
      .or(filter)
      .select("id");
    applied = upd?.length ?? 0;
  }
  refresh();
  return { ok: true, applied };
}

export async function createTransaction(formData: FormData) {
  const ctx = await requireEdit("lancamentos");
  const hh = ctx.household.id;
  const date = String(formData.get("date"));
  const description = String(formData.get("description") ?? "").trim();
  const amount = parseMoneyInput(String(formData.get("amount") ?? ""));
  const categoryId = String(formData.get("category_id") ?? "") || null;
  if (!date || !description || amount === null) return;

  let kind = "despesa";
  let scope = String(formData.get("scope") ?? "pessoal");
  if (categoryId) {
    const { data: cat } = await ctx.supabase.from("categories").select("kind, scope").eq("id", categoryId).single();
    if (cat) { kind = cat.kind; scope = cat.scope; }
  }
  const installments = Math.max(1, Math.min(48, Number(formData.get("installments") || 1)));
  const rows = Array.from({ length: installments }, (_, i) => {
    const d = new Date(date + "T12:00:00");
    d.setMonth(d.getMonth() + i);
    const iso = d.toISOString().slice(0, 10);
    return {
      household_id: hh, scope, date: iso, cycle: cycleOf(iso, ctx.household.cycle_start_day),
      description, merchant_key: normalizeMerchant(description),
      amount: Math.round((amount / installments) * 100) / 100, kind, category_id: categoryId,
      account_id: String(formData.get("account_id") ?? "") || null,
      member_user_id: String(formData.get("member_user_id") ?? "") || ctx.user.id,
      installment_no: installments > 1 ? i + 1 : null, installment_total: installments > 1 ? installments : null,
      source: "manual", notes: String(formData.get("notes") ?? "") || null, created_by: ctx.user.id,
    };
  });
  await ctx.supabase.from("transactions").insert(rows);
  refresh();
}

export async function deleteTransaction(formData: FormData) {
  const ctx = await requireEdit("lancamentos");
  await ctx.supabase.from("transactions").delete().eq("id", String(formData.get("id"))).eq("household_id", ctx.household.id);
  refresh();
}

export interface TxUpdate {
  categoryId: string | null;
  memberUserId: string | null;
  cycle: string;
  notes: string | null;
  learn: boolean;
}

/** Atualiza o "perfil do gasto" de um lançamento (painel lateral). */
export async function updateTransaction(txId: string, u: TxUpdate): Promise<{ error?: string; applied?: number }> {
  const ctx = await requireEdit("lancamentos");
  const hh = ctx.household.id;
  if (!/^\d{4}-\d{2}$/.test(u.cycle)) return { error: "Ciclo inválido" };
  const { data: tx } = await ctx.supabase.from("transactions").select("id, category_id, merchant_key, description").eq("id", txId).eq("household_id", hh).single();
  if (!tx) return { error: "Lançamento não encontrado" };
  let patch: Record<string, unknown> = { member_user_id: u.memberUserId, cycle: u.cycle, notes: u.notes };
  let cat: { id: string; kind: string; scope: string; grp: string } | null = null;
  if (u.categoryId) {
    const { data } = await ctx.supabase.from("categories").select("id, kind, scope, grp").eq("id", u.categoryId).eq("household_id", hh).single();
    cat = data;
    if (cat) patch = { ...patch, category_id: cat.id, kind: cat.kind, scope: cat.scope };
  }
  const { error } = await ctx.supabase.from("transactions").update(patch).eq("id", txId);
  if (error) return { error: error.message };

  let applied = 0;
  const mk = tx.merchant_key || normalizeMerchant(tx.description);
  if (cat && u.learn && cat.id !== tx.category_id && mk && mk.length >= 3 && cat.grp !== "A classificar") {
    await ctx.supabase.from("category_rules").upsert(
      { household_id: hh, pattern: mk, match_type: "prefix", category_id: cat.id, scope: cat.scope, updated_at: new Date().toISOString() },
      { onConflict: "household_id,pattern" },
    );
    const { data: upd } = await ctx.supabase.from("transactions").update({ category_id: cat.id, kind: cat.kind, scope: cat.scope })
      .eq("household_id", hh).eq("merchant_key", mk).neq("id", txId).neq("category_id", cat.id).select("id");
    const { data: upd2 } = await ctx.supabase.from("transactions").update({ category_id: cat.id, kind: cat.kind, scope: cat.scope })
      .eq("household_id", hh).eq("merchant_key", mk).neq("id", txId).is("category_id", null).select("id");
    applied = (upd?.length ?? 0) + (upd2?.length ?? 0);
  }
  refresh();
  revalidatePath("/faturas", "layout");
  return { applied };
}

export async function deleteTransactionById(txId: string) {
  const ctx = await requireEdit("lancamentos");
  await ctx.supabase.from("transactions").delete().eq("id", txId).eq("household_id", ctx.household.id);
  refresh();
  revalidatePath("/faturas", "layout");
}
