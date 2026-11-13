"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";

async function platformAdmin() {
  const ctx = await getContext();
  const { data } = await ctx.supabase.rpc("is_platform_admin");
  if (!data) redirect("/");
  return ctx;
}

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export async function createBetaCode(formData: FormData) {
  const ctx = await platformAdmin();
  const uses = Math.max(1, Math.min(50, Number(formData.get("uses") ?? 1) || 1));
  const days = Math.max(0, Math.min(180, Number(formData.get("days") ?? 30) || 0));
  const custom = String(formData.get("code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const rnd = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHA[b % ALPHA.length]).join("");
  const code = custom.length >= 4 ? custom : `ALVVO-${rnd}`;
  await ctx.supabase.from("beta_codes").insert({ code, note: String(formData.get("note") ?? "").slice(0, 120) || null, uses_left: uses, expires_at: days ? new Date(Date.now() + days * 864e5).toISOString() : null, created_by: ctx.user.id });
  revalidatePath("/admin");
}
export async function disableBetaCode(code: string) {
  const ctx = await platformAdmin();
  await ctx.supabase.from("beta_codes").update({ uses_left: 0 }).eq("code", code);
  revalidatePath("/admin");
}
export async function setFeedbackStatus(id: string, status: "novo" | "visto" | "resolvido") {
  const ctx = await platformAdmin();
  await ctx.supabase.from("feedback").update({ status }).eq("id", id);
  revalidatePath("/admin");
}
