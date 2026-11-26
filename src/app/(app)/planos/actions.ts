"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/context";

export async function quererAssinar(plano: "premium" | "familia", ciclo: "mensal" | "anual"): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await getContext();
  if (!["premium", "familia"].includes(plano) || !["mensal", "anual"].includes(ciclo)) return { error: "Opção inválida." };
  const { error } = await ctx.supabase.from("plan_interest").upsert({ user_id: ctx.user.id, household_id: ctx.household.id, plano, ciclo, created_at: new Date().toISOString() });
  if (error) return { error: "Não foi possível registrar agora." };
  revalidatePath("/planos");
  return { ok: true };
}

export async function usarCodigo(code: string): Promise<{ ok?: boolean; error?: string; jaTinha?: boolean }> {
  const ctx = await getContext();
  const c = (code || "").trim();
  if (c.replace(/[^a-z0-9]/gi, "").length < 4) return { error: "Digite o código completo." };
  const { data, error } = await ctx.supabase.rpc("resgatar_codigo_plano", { hh: ctx.household.id, p_code: c });
  if (error) return { error: "Não foi possível validar o código agora." };
  const r = (data ?? {}) as { ok?: boolean; erro?: string; ja_tinha?: boolean };
  if (!r.ok) return { error: r.erro ?? "Código inválido." };
  revalidatePath("/", "layout");
  return { ok: true, jaTinha: !!r.ja_tinha };
}
