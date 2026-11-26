"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canEdit, logAction, requireArea } from "@/lib/context";
import { addDays } from "@/lib/agenda";
import { todayIso } from "@/lib/cycle";

export interface CompraDecisao {
  status: "reavaliar" | "comprar" | "descartada" | "objetivo";
  item: string; amount: number; verdict: string;
  params: Record<string, unknown>;
  goal?: { target: number; deadline: string; monthly: number };
}

/** Registra a decisão tomada no "Posso comprar?" (e cria o objetivo, quando for o caso). */
export async function decidirCompra(x: CompraDecisao): Promise<{ error?: string } | void> {
  const ctx = await requireArea("visao-geral");
  const hh = ctx.household.id, item = (x.item || "").trim().slice(0, 80) || "Compra";
  if (!["reavaliar", "comprar", "descartada", "objetivo"].includes(x.status) || !(x.amount > 0)) return { error: "Dados inválidos." };
  let goalId: string | null = null;
  if (x.status === "objetivo") {
    if (!canEdit(ctx, "objetivos") || !x.goal) return { error: "Você não tem permissão para criar objetivos nesta conta." };
    const { data, error } = await ctx.supabase.from("goals").insert({
      household_id: hh, type: "caixinha", name: item,
      data: { target: Math.round(x.goal.target), deadline: x.goal.deadline, balance: 0, monthly: Math.round(x.goal.monthly), note: "Criado a partir da análise “Posso comprar?”" },
    }).select("id").single();
    if (error || !data) return { error: "Não foi possível criar o objetivo." };
    goalId = data.id as string;
  }
  const { error } = await ctx.supabase.from("purchase_checks").insert({
    household_id: hh, item, amount: x.amount, verdict: x.verdict, params: x.params, status: x.status, goal_id: goalId,
    remind_on: x.status === "reavaliar" ? addDays(todayIso(), 1) : null,
  });
  if (error) return { error: "Não foi possível registrar a decisão." };
  await logAction(ctx, `Posso comprar? ${item}: ${x.status === "objetivo" ? "virou objetivo" : x.status === "reavaliar" ? "reavaliar amanhã" : x.status === "comprar" ? "decidiu comprar" : "descartada"}`);
  revalidatePath("/simulacoes/posso-comprar"); revalidatePath("/");
  if (goalId) redirect(`/objetivos#${goalId}`);
}

/** Lembrete do dia seguinte: manter (reabrir a análise), adiar de novo ou descartar. */
export async function atualizarCompra(id: string, status: "descartada" | "comprar" | "reavaliar") {
  const ctx = await requireArea("visao-geral");
  await ctx.supabase.from("purchase_checks").update({ status, remind_on: status === "reavaliar" ? addDays(todayIso(), 1) : null }).eq("id", id).eq("household_id", ctx.household.id);
  revalidatePath("/"); revalidatePath("/simulacoes/posso-comprar");
}
