"use server";

import { revalidatePath } from "next/cache";
import { logAction, requireEdit } from "@/lib/context";
import type { Kind, Scope } from "@/lib/categories-default";

type R = { ok?: true; error?: string };
const KINDS: Kind[] = ["receita", "despesa", "investimento", "transferencia"];
const done = (): R => { revalidatePath("/", "layout"); return { ok: true }; };
const clean = (v: unknown, max = 60) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

async function ctxEdit() { return requireEdit("orcamento"); }

async function getGroup(ctx: Awaited<ReturnType<typeof ctxEdit>>, id: string) {
  const { data } = await ctx.supabase.from("category_groups").select("*").eq("id", id).eq("household_id", ctx.household.id).maybeSingle();
  return data as { id: string; scope: Scope; kind: Kind; name: string; sort: number; system: boolean } | null;
}

/* ───────────── Grupos ───────────── */

export async function saveGroup(input: { id?: string; scope: Scope; kind: Kind; name: string; hint?: string; color?: string }): Promise<R> {
  const ctx = await ctxEdit();
  const name = clean(input.name);
  const hint = clean(input.hint, 120) || null;
  const color = /^#[0-9a-f]{6}$/i.test(input.color ?? "") ? input.color! : null;
  if (!name) return { error: "Dê um nome ao grupo." };
  if (!KINDS.includes(input.kind)) return { error: "Tipo inválido." };
  const hh = ctx.household.id;

  if (!input.id) {
    const { data: last } = await ctx.supabase.from("category_groups").select("sort").eq("household_id", hh).eq("scope", input.scope).order("sort", { ascending: false }).limit(1);
    const { error } = await ctx.supabase.from("category_groups").insert({ household_id: hh, scope: input.scope, kind: input.kind, name, hint, color, sort: (last?.[0]?.sort ?? 0) + 10 });
    if (error) return { error: error.code === "23505" ? "Já existe um grupo com esse nome." : error.message };
    await logAction(ctx, `Criou o grupo ${name}`);
    return done();
  }

  const g = await getGroup(ctx, input.id);
  if (!g) return { error: "Grupo não encontrado." };
  if (g.system && (name !== g.name || input.kind !== g.kind)) return { error: "O grupo “A classificar” não pode ser renomeado nem mudar de tipo." };
  const { error } = await ctx.supabase.from("category_groups").update({ name, hint, color, kind: input.kind }).eq("id", g.id);
  if (error) return { error: error.code === "23505" ? "Já existe um grupo com esse nome." : error.message };
  // As categorias seguem o grupo (nome e tipo)
  if (name !== g.name || input.kind !== g.kind) {
    await ctx.supabase.from("categories").update({ grp: name, kind: input.kind }).eq("household_id", ctx.household.id).eq("scope", g.scope).eq("grp", g.name);
  }
  await logAction(ctx, name !== g.name ? `Renomeou o grupo ${g.name} para ${name}` : `Editou o grupo ${name}`);
  return done();
}

export async function moveGroup(id: string, dir: -1 | 1): Promise<R> {
  const ctx = await ctxEdit();
  const g = await getGroup(ctx, id);
  if (!g) return { error: "Grupo não encontrado." };
  const { data } = await ctx.supabase.from("category_groups").select("id, sort").eq("household_id", ctx.household.id).eq("scope", g.scope).order("sort");
  const list = (data ?? []) as { id: string; sort: number }[];
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  [list[i], list[j]] = [list[j], list[i]];
  await Promise.all(list.map((x, k) => ctx.supabase.from("category_groups").update({ sort: (k + 1) * 10 }).eq("id", x.id)));
  return done();
}

/** Exclui um grupo. As categorias vão para outro grupo ou são excluídas (lançamentos vão para “A classificar”). */
export async function deleteGroup(id: string, opts: { moveTo?: string; deleteCategories?: boolean }): Promise<R> {
  const ctx = await ctxEdit();
  const g = await getGroup(ctx, id);
  if (!g) return { error: "Grupo não encontrado." };
  if (g.system) return { error: "O grupo “A classificar” é usado para lançamentos novos e não pode ser excluído." };
  const hh = ctx.household.id;
  const { data: cats } = await ctx.supabase.from("categories").select("id").eq("household_id", hh).eq("scope", g.scope).eq("grp", g.name);
  const ids = ((cats ?? []) as { id: string }[]).map((c) => c.id);

  if (ids.length) {
    if (opts.moveTo) {
      const t = await getGroup(ctx, opts.moveTo);
      if (!t || t.id === g.id) return { error: "Escolha outro grupo de destino." };
      const { error } = await ctx.supabase.from("categories").update({ grp: t.name, kind: t.kind, scope: t.scope }).in("id", ids);
      if (error) return { error: error.message };
    } else if (opts.deleteCategories) {
      for (const cid of ids) {
        const { error } = await ctx.supabase.rpc("delete_category", { p_id: cid, p_target: null });
        if (error) return { error: error.message };
      }
    } else return { error: "Escolha para onde vão as categorias do grupo." };
  }
  const { error } = await ctx.supabase.from("category_groups").delete().eq("id", g.id);
  if (error) return { error: error.message };
  await logAction(ctx, `Excluiu o grupo ${g.name}`);
  return done();
}

/* ───────────── Subgrupos ───────────── */

export async function renameSubgroup(scope: Scope, grp: string, from: string, to: string): Promise<R> {
  const ctx = await ctxEdit();
  const name = clean(to);
  if (!name) return { error: "Dê um nome ao subgrupo." };
  const { error } = await ctx.supabase.from("categories").update({ subgroup: name }).eq("household_id", ctx.household.id).eq("scope", scope).eq("grp", grp).eq("subgroup", from);
  if (error) return { error: error.message };
  return done();
}

/** Remove o subgrupo: as categorias continuam no grupo, sem subgrupo — ou são excluídas. */
export async function deleteSubgroup(scope: Scope, grp: string, sub: string, deleteCategories: boolean): Promise<R> {
  const ctx = await ctxEdit();
  const q = () => ctx.supabase.from("categories").select("id").eq("household_id", ctx.household.id).eq("scope", scope).eq("grp", grp).eq("subgroup", sub);
  if (deleteCategories) {
    const { data } = await q();
    for (const c of (data ?? []) as { id: string }[]) {
      const { error } = await ctx.supabase.rpc("delete_category", { p_id: c.id, p_target: null });
      if (error) return { error: error.message };
    }
  } else {
    const { error } = await ctx.supabase.from("categories").update({ subgroup: "" }).eq("household_id", ctx.household.id).eq("scope", scope).eq("grp", grp).eq("subgroup", sub);
    if (error) return { error: error.message };
  }
  await logAction(ctx, `Excluiu o subgrupo ${sub} de ${grp}`);
  return done();
}

/* ───────────── Categorias ───────────── */

export async function saveCategory(input: { id?: string; groupId: string; subgroup: string; name: string; excluded?: boolean }): Promise<R> {
  const ctx = await ctxEdit();
  const name = clean(input.name);
  if (!name) return { error: "Dê um nome à categoria." };
  const g = await getGroup(ctx, input.groupId);
  if (!g) return { error: "Grupo não encontrado." };
  const row = { scope: g.scope, kind: g.kind, grp: g.name, subgroup: clean(input.subgroup), name, excluded_from_totals: !!input.excluded };

  if (!input.id) {
    const { data: last } = await ctx.supabase.from("categories").select("sort").eq("household_id", ctx.household.id).eq("scope", g.scope).eq("grp", g.name).order("sort", { ascending: false }).limit(1);
    const { error } = await ctx.supabase.from("categories").insert({ household_id: ctx.household.id, ...row, sort: (last?.[0]?.sort ?? 0) + 1 });
    if (error) return { error: error.code === "23505" ? "Já existe uma categoria com esse nome nesse grupo." : error.message };
    await logAction(ctx, `Criou a categoria ${g.name} › ${name}`);
    return done();
  }
  const { data: cur } = await ctx.supabase.from("categories").select("grp").eq("id", input.id).eq("household_id", ctx.household.id).maybeSingle();
  if (!cur) return { error: "Categoria não encontrada." };
  if ((cur as { grp: string }).grp === "A classificar" && g.name !== "A classificar") return { error: "A categoria “A classificar” não pode sair do seu grupo." };
  const { error } = await ctx.supabase.from("categories").update(row).eq("id", input.id).eq("household_id", ctx.household.id);
  if (error) return { error: error.code === "23505" ? "Já existe uma categoria com esse nome nesse grupo." : error.message };
  return done();
}

export async function toggleCategoryActive(id: string, active: boolean): Promise<R> {
  const ctx = await ctxEdit();
  const { error } = await ctx.supabase.from("categories").update({ active }).eq("id", id).eq("household_id", ctx.household.id);
  return error ? { error: error.message } : done();
}

export async function moveCategory(id: string, dir: -1 | 1): Promise<R> {
  const ctx = await ctxEdit();
  const { data: c } = await ctx.supabase.from("categories").select("scope, grp").eq("id", id).eq("household_id", ctx.household.id).maybeSingle();
  if (!c) return { error: "Categoria não encontrada." };
  const { data } = await ctx.supabase.from("categories").select("id, sort, name").eq("household_id", ctx.household.id).eq("scope", c.scope).eq("grp", c.grp).order("sort").order("name");
  const list = (data ?? []) as { id: string; sort: number }[];
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  [list[i], list[j]] = [list[j], list[i]];
  await Promise.all(list.map((x, k) => ctx.supabase.from("categories").update({ sort: k + 1 }).eq("id", x.id)));
  return done();
}

/** Exclui a categoria; lançamentos, regras e agenda vão para a categoria de destino (padrão: “A classificar”). */
export async function deleteCategory(id: string, target?: string): Promise<R> {
  const ctx = await ctxEdit();
  const { data: c } = await ctx.supabase.from("categories").select("name, grp").eq("id", id).eq("household_id", ctx.household.id).maybeSingle();
  if (!c) return { error: "Categoria não encontrada." };
  if ((c as { grp: string }).grp === "A classificar") return { error: "A categoria “A classificar” não pode ser excluída." };
  const { error } = await ctx.supabase.rpc("delete_category", { p_id: id, p_target: target || null });
  if (error) return { error: error.message };
  await logAction(ctx, `Excluiu a categoria ${(c as { name: string }).name}`);
  return done();
}
