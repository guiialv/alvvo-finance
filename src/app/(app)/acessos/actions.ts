"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAction, requireAdmin, VIEW_AS_COOKIE } from "@/lib/context";
import { AREAS, LEVEL_LABEL, ROLE_LABEL, roleAreas, type Area, type Level, type Role } from "@/lib/access";

const done = () => revalidatePath("/", "layout");
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

async function memberName(ctx: Awaited<ReturnType<typeof requireAdmin>>, userId: string) {
  const { data } = await ctx.supabase.from("household_members").select("display_name").eq("household_id", ctx.household.id).eq("user_id", userId).maybeSingle();
  return (data?.display_name as string | undefined) ?? "membro";
}

export async function approveMember(f: FormData) {
  const ctx = await requireAdmin();
  const role = str(f, "role") as Role;
  const { error } = await ctx.supabase.rpc("approve_member", { hh: ctx.household.id, p_user: str(f, "user_id"), p_role: role });
  if (error) throw new Error(error.message);
  done();
}

export async function denyMember(f: FormData) {
  const ctx = await requireAdmin();
  const id = str(f, "user_id"), name = await memberName(ctx, id);
  await ctx.supabase.from("household_members").delete().eq("household_id", ctx.household.id).eq("user_id", id).eq("status", "pendente");
  await logAction(ctx, `Recusou o pedido de ${name}`);
  done();
}

export async function setRole(f: FormData) {
  const ctx = await requireAdmin();
  const id = str(f, "user_id"), role = str(f, "role") as Role;
  if (!["admin", "membro", "leitura"].includes(role)) return;
  await ctx.supabase.from("household_members").update({ role, areas: roleAreas(role) }).eq("household_id", ctx.household.id).eq("user_id", id);
  await logAction(ctx, `${await memberName(ctx, id)} agora é ${ROLE_LABEL[role]}`);
  done();
}

export async function setArea(f: FormData) {
  const ctx = await requireAdmin();
  const id = str(f, "user_id"), area = str(f, "area") as Area, level = str(f, "level") as Level;
  const { data } = await ctx.supabase.from("household_members").select("areas, display_name").eq("household_id", ctx.household.id).eq("user_id", id).maybeSingle();
  if (!data) return;
  const areas = { ...(data.areas as Record<string, Level>), [area]: level };
  await ctx.supabase.from("household_members").update({ areas }).eq("household_id", ctx.household.id).eq("user_id", id);
  await logAction(ctx, `${data.display_name} · ${AREAS.find((a) => a[0] === area)?.[1]}: ${LEVEL_LABEL[level]}`);
  done();
}

export async function setScope(f: FormData) {
  const ctx = await requireAdmin();
  const id = str(f, "user_id"), scope = str(f, "scope") === "proprios" ? "proprios" : "todos";
  await ctx.supabase.from("household_members").update({ tx_scope: scope }).eq("household_id", ctx.household.id).eq("user_id", id);
  await logAction(ctx, `${await memberName(ctx, id)}: lançamentos visíveis = ${scope === "proprios" ? "só os próprios" : "de todos"}`);
  done();
}

export async function toggleSuspend(f: FormData) {
  const ctx = await requireAdmin();
  const id = str(f, "user_id"), next = str(f, "status") === "ativo" ? "suspenso" : "ativo";
  await ctx.supabase.from("household_members").update({ status: next }).eq("household_id", ctx.household.id).eq("user_id", id);
  await logAction(ctx, `${next === "ativo" ? "Reativou" : "Suspendeu"} ${await memberName(ctx, id)}`);
  done();
}

export async function removeMember(f: FormData) {
  const ctx = await requireAdmin();
  const id = str(f, "user_id"), name = await memberName(ctx, id);
  await ctx.supabase.from("household_members").delete().eq("household_id", ctx.household.id).eq("user_id", id).neq("role", "dono");
  await logAction(ctx, `Removeu ${name}`);
  done();
}

export async function newInviteCode() {
  const ctx = await requireAdmin();
  await ctx.supabase.rpc("regenerate_invite", { hh: ctx.household.id });
  await logAction(ctx, "Gerou um novo código de convite");
  done();
}

export async function viewAs(f: FormData) {
  await requireAdmin();
  (await cookies()).set(VIEW_AS_COOKIE, str(f, "user_id"), { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 });
  redirect("/");
}
