"use server";

import { revalidatePath } from "next/cache";
import { logAction, requireEdit } from "@/lib/context";
import { parseMoneyInput } from "@/lib/format";

const day = (v: FormDataEntryValue | null) => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null; };

/** Nome, propósito, cor, dias de fechamento/vencimento e limite de um cartão. */
export async function updateCard(f: FormData) {
  const ctx = await requireEdit("faturas");
  const id = String(f.get("id"));
  const name = String(f.get("name") ?? "").trim().slice(0, 60);
  const color = String(f.get("color") ?? "");
  await ctx.supabase.from("accounts").update({
    ...(name ? { name } : {}), purpose: String(f.get("purpose") ?? "").trim().slice(0, 140) || null,
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : null, closing_day: day(f.get("closing_day")), due_day: day(f.get("due_day")),
    credit_limit: parseMoneyInput(String(f.get("credit_limit") ?? "")), sort: Number(f.get("sort")) || null,
  }).eq("id", id).eq("household_id", ctx.household.id).eq("type", "cartao");
  await logAction(ctx, `Editou o cartão ${name}`);
  revalidatePath("/faturas"); revalidatePath("/");
}

/** Junta dois cartões que são o mesmo conjunto: faturas e lançamentos vão para o destino, e as próximas importações também. */
export async function mergeCard(f: FormData) {
  const ctx = await requireEdit("faturas");
  const src = String(f.get("id")), dst = String(f.get("into"));
  if (!dst || src === dst) return;
  const hh = ctx.household.id;
  const { data: list } = await ctx.supabase.from("accounts").select("id, name, statement_key, merged_keys").eq("household_id", hh).eq("type", "cartao").in("id", [src, dst]);
  const a = (list ?? []).find((x) => x.id === src), b = (list ?? []).find((x) => x.id === dst);
  if (!a || !b) return;
  await ctx.supabase.from("import_batches").update({ account_id: dst }).eq("household_id", hh).eq("account_id", src);
  await ctx.supabase.from("transactions").update({ account_id: dst }).eq("household_id", hh).eq("account_id", src);
  const keys = [...new Set([...((b.merged_keys as string[] | null) ?? []), ...((a.merged_keys as string[] | null) ?? []), ...(a.statement_key ? [a.statement_key as string] : [])])];
  await ctx.supabase.from("accounts").update({ merged_keys: keys }).eq("id", dst);
  await ctx.supabase.from("accounts").delete().eq("id", src);
  await logAction(ctx, `Juntou o cartão ${a.name} em ${b.name}`);
  revalidatePath("/faturas"); revalidatePath("/");
}
