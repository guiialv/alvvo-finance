import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AREA_KEYS, type Area, type Level, type Role, type TxScope } from "@/lib/access";

export interface Household {
  id: string;
  name: string;
  invite_code: string;
  invite_expires_at: string;
  cycle_start_day: number;
  template: string;
  ai_mode: "nenhuma" | "incluida" | "chave";
  ai_included: boolean;
}

export interface Member {
  household_id: string;
  user_id: string;
  display_name: string;
  role: Role;
  status: "pendente" | "ativo" | "suspenso";
  areas: Partial<Record<Area, Level>>;
  tx_scope: TxScope;
}

/** Permissões efetivas de quem está vendo a tela (o próprio usuário, ou o membro em "ver como"). */
export interface Viewer { userId: string; name: string; role: Role; areas: Partial<Record<Area, Level>>; txScope: TxScope; simulated: boolean }

export const VIEW_AS_COOKIE = "alvvo_view_as";

/**
 * Carrega usuário, conta e permissões. Redireciona para /login, /onboarding ou /aguardando quando necessário.
 * Memorizado por requisição: layout e página compartilham a mesma leitura (antes eram duas).
 */
export const getContext = cache(loadContext);
async function loadContext() {
  const supabase = await createClient();
  // O middleware já validou a sessão com o servidor de autenticação nesta mesma requisição (getUser);
  // aqui lemos do cookie para não repetir a viagem. Os dados continuam protegidos: o banco confere a
  // assinatura do token em toda consulta (RLS), então um cookie adulterado não acessa nada.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("household_members")
    .select("household_id, user_id, display_name, role, status, areas, tx_scope, support, expires_at, households(id, name, invite_code, invite_expires_at, cycle_start_day, template, ai_mode, ai_included)")
    .eq("user_id", user.id);

  const all = (memberships ?? []) as (Member & { support?: boolean; expires_at?: string | null; households: Household | Household[] | null })[];
  // Acesso de suporte (temporário, só leitura) só vale quando o administrador da plataforma entra nele de propósito
  const supportHh = (await cookies()).get(SUPPORT_COOKIE)?.value;
  const sup = supportHh ? all.find((x) => x.support && x.household_id === supportHh && x.status === "ativo" && (!x.expires_at || Date.parse(x.expires_at) > Date.now())) : undefined;
  const list = all.filter((x) => !x.support);
  const m = sup ?? list.find((x) => x.status === "ativo") ?? list[0];
  if (!m) redirect("/onboarding");
  if (m.status !== "ativo") redirect("/aguardando");
  const household = (Array.isArray(m.households) ? m.households[0] : m.households) as Household;
  const member: Member = { household_id: m.household_id, user_id: m.user_id, display_name: m.display_name, role: m.role, status: m.status, areas: m.areas ?? {}, tx_scope: m.tx_scope ?? "todos" };

  let viewer: Viewer = { userId: user.id, name: member.display_name, role: member.role, areas: member.areas, txScope: member.tx_scope, simulated: false };
  const viewAs = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (viewAs && viewAs !== user.id && (member.role === "dono" || member.role === "admin")) {
    const { data: other } = await supabase.from("household_members").select("user_id, display_name, role, areas, tx_scope, status")
      .eq("household_id", household.id).eq("user_id", viewAs).maybeSingle();
    if (other && other.status === "ativo") viewer = { userId: other.user_id, name: other.display_name, role: other.role, areas: other.areas ?? {}, txScope: other.tx_scope, simulated: true };
  }

  return { supabase, user, household, member, viewer, support: sup ? { until: sup.expires_at ?? null } : null };
}

export const SUPPORT_COOKIE = "alvvo_suporte";
export type Ctx = Awaited<ReturnType<typeof getContext>>;

export const isAdminRole = (r: Role) => r === "dono" || r === "admin";
/** O que o "viewer" pode fazer numa área. */
export function levelOf(ctx: Ctx, area: Area): Level {
  if (isAdminRole(ctx.viewer.role)) return "editar";
  const l = ctx.viewer.areas[area] ?? "nada";
  return ctx.viewer.role === "leitura" && l === "editar" ? "ver" : l;
}
export const canSee = (ctx: Ctx, area: Area) => levelOf(ctx, area) !== "nada";
export const canEdit = (ctx: Ctx, area: Area) => !ctx.viewer.simulated && levelOf(ctx, area) === "editar";
export const visibleAreas = (ctx: Ctx) => AREA_KEYS.filter((a) => canSee(ctx, a));

/** Use no topo de cada página: sem permissão, mostra a tela "sem acesso". */
export async function requireArea(area: Area) {
  const ctx = await getContext();
  if (!canSee(ctx, area)) redirect("/sem-acesso");
  return ctx;
}
/** Use em server actions: sem permissão de edição, interrompe. */
export async function requireEdit(area: Area) {
  const ctx = await getContext();
  if (!canEdit(ctx, area)) throw new Error("Sem permissão para editar esta área.");
  return ctx;
}
export async function requireAdmin() {
  const ctx = await getContext();
  if (!isAdminRole(ctx.member.role) || ctx.viewer.simulated) redirect("/sem-acesso");
  return ctx;
}

export async function logAction(ctx: Ctx, action: string) {
  await ctx.supabase.from("audit_log").insert({ household_id: ctx.household.id, actor: ctx.user.id, actor_name: ctx.member.display_name, action });
}
