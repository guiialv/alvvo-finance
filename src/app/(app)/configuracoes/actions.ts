"use server";

import { revalidatePath } from "next/cache";
import { logAction, requireAdmin } from "@/lib/context";
import { encryptSecret } from "@/lib/crypto";

const done = () => revalidatePath("/", "layout");

export async function updateHousehold(formData: FormData) {
  const ctx = await requireAdmin();
  const day = Math.max(1, Math.min(28, Number(formData.get("cycle_start_day")) || 8));
  await ctx.supabase.from("households").update({ name: String(formData.get("name") ?? "").trim() || ctx.household.name, cycle_start_day: day }).eq("id", ctx.household.id);
  await ctx.supabase.from("household_members").update({ display_name: String(formData.get("display_name") ?? "").trim() || ctx.member.display_name })
    .eq("household_id", ctx.household.id).eq("user_id", ctx.user.id);
  done();
}

export async function addCategory(formData: FormData) {
  const ctx = await requireAdmin();
  const [scope, kind, grp] = String(formData.get("group") ?? "pessoal|despesa|Variáveis").split("|");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await ctx.supabase.from("categories").insert({
    household_id: ctx.household.id, scope, kind, grp, subgroup: String(formData.get("subgroup") ?? "").trim(), name, sort: 9999,
  });
  done();
}

export async function toggleCategory(formData: FormData) {
  const ctx = await requireAdmin();
  await ctx.supabase.from("categories").update({ active: formData.get("active") === "true" }).eq("id", String(formData.get("id"))).eq("household_id", ctx.household.id);
  done();
}

export async function deleteRule(formData: FormData) {
  const ctx = await requireAdmin();
  await ctx.supabase.from("category_rules").delete().eq("id", String(formData.get("id"))).eq("household_id", ctx.household.id);
  done();
}

export async function updateAccount(formData: FormData) {
  const ctx = await requireAdmin();
  await ctx.supabase.from("accounts").update({
    name: String(formData.get("name") ?? "").trim(),
    owner_user_id: String(formData.get("owner_user_id") ?? "") || null,
  }).eq("id", String(formData.get("id"))).eq("household_id", ctx.household.id);
  done();
}

export async function renameCategory(formData: FormData) {
  const ctx = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await ctx.supabase.from("categories").update({ name }).eq("id", String(formData.get("id"))).eq("household_id", ctx.household.id);
  done();
}

export async function setAiMode(formData: FormData) {
  const ctx = await requireAdmin();
  const mode = String(formData.get("ai_mode"));
  if (!["nenhuma", "incluida", "chave"].includes(mode)) return;
  await ctx.supabase.from("households").update({ ai_mode: mode }).eq("id", ctx.household.id);
  await logAction(ctx, `IA: ${mode === "chave" ? "chave própria do Claude" : mode === "incluida" ? "incluída" : "desligada"}`);
  done();
}

export async function saveAiKey(formData: FormData) {
  const ctx = await requireAdmin();
  const key = String(formData.get("key") ?? "").trim();
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) throw new Error("A chave do Claude Console começa com sk-ant-.");
  await ctx.supabase.rpc("set_ai_key", { hh: ctx.household.id, p_enc: await encryptSecret(key), p_last4: key.slice(-4) });
  await ctx.supabase.from("households").update({ ai_mode: "chave" }).eq("id", ctx.household.id);
  await logAction(ctx, "Salvou uma chave de API do Claude");
  done();
}

/** Acesso de suporte: o administrador da plataforma ganha "Só leitura" por alguns dias, com registro, e perde sozinho. */
export async function grantSupport(formData: FormData) {
  const ctx = await requireAdmin();
  const days = Math.max(1, Math.min(30, Number(formData.get("days") ?? 7) || 7));
  await ctx.supabase.rpc("grant_support", { hh: ctx.household.id, p_days: days });
  done();
}
export async function revokeSupport() {
  const ctx = await requireAdmin();
  await ctx.supabase.rpc("revoke_support", { hh: ctx.household.id });
  done();
}
