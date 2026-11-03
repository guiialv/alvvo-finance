"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEdit } from "@/lib/context";
import { parseMoneyInput } from "@/lib/format";
import { currentCycle } from "@/lib/cycle";
import type { GoalData, GoalType } from "@/lib/goals";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => parseMoneyInput(str(f, k)) ?? undefined;

export async function saveGoal(f: FormData) {
  const ctx = await requireEdit("objetivos");
  const type = str(f, "type") as GoalType, id = str(f, "id");
  const data: GoalData = type === "independencia"
    ? { income: num(f, "income"), multiple: num(f, "multiple"), initial: num(f, "initial") ?? 0, monthly: num(f, "monthly") ?? 0, rate: num(f, "rate") ?? 1, birth: str(f, "birth") || undefined, startMonth: str(f, "startMonth") || currentCycle(ctx.household.cycle_start_day) }
    : type === "patrimonio"
      ? { target: num(f, "target"), deadline: str(f, "deadline"), rate: num(f, "rate") ?? 1, source: "carteira", extra: num(f, "extra") ?? 0, start: str(f, "start") || currentCycle(ctx.household.cycle_start_day) }
      : { target: f.get("auto") ? undefined : num(f, "target"), auto: f.get("auto") ? "reserva" : null, deadline: str(f, "deadline"), balance: num(f, "balance") ?? 0, monthly: num(f, "monthly") ?? 0 };
  if (id) {
    const { data: old } = await ctx.supabase.from("goals").select("data").eq("id", id).eq("household_id", ctx.household.id).maybeSingle();
    await ctx.supabase.from("goals").update({ name: str(f, "name"), data: { ...((old?.data as GoalData) ?? {}), ...data } }).eq("id", id).eq("household_id", ctx.household.id);
  } else {
    await ctx.supabase.from("goals").insert({ household_id: ctx.household.id, type, name: str(f, "name"), data });
  }
  revalidatePath("/objetivos");
  redirect("/objetivos");
}

/** Ajuste rápido de um campo numérico (aporte mensal, saldo, valores fora da carteira). */
export async function patchGoal(f: FormData) {
  const ctx = await requireEdit("objetivos");
  const id = str(f, "id"), field = str(f, "field");
  if (!["monthly", "balance", "extra"].includes(field)) return;
  const { data: old } = await ctx.supabase.from("goals").select("data").eq("id", id).eq("household_id", ctx.household.id).maybeSingle();
  if (!old) return;
  await ctx.supabase.from("goals").update({ data: { ...(old.data as GoalData), [field]: num(f, "value") ?? 0 } }).eq("id", id).eq("household_id", ctx.household.id);
  revalidatePath("/objetivos");
}

export async function deleteGoal(f: FormData) {
  const ctx = await requireEdit("objetivos");
  await ctx.supabase.from("goals").delete().eq("id", str(f, "id")).eq("household_id", ctx.household.id);
  revalidatePath("/objetivos");
}
