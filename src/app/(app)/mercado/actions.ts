"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAction, requireEdit } from "@/lib/context";
import { parseMoneyInput } from "@/lib/format";
import { yahooSymbol } from "@/lib/market/sources";

type R = { ok?: true; error?: string; id?: string };
const RATINGS = ["comprar", "acumular", "manter", "reduzir", "vender", "observar"];
const done = () => { revalidatePath("/mercado", "layout"); revalidatePath("/analise", "layout"); };
const clean = (v: unknown, max = 80) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

export async function createPortfolio(name: string, description?: string): Promise<R> {
  const ctx = await requireEdit("analise");
  const n = clean(name);
  if (!n) return { error: "Dê um nome à carteira." };
  const { data, error } = await ctx.supabase.from("eval_portfolios").insert({ household_id: ctx.household.id, name: n, description: clean(description, 400) || null, created_by: ctx.user.id }).select("id").single();
  if (error || !data) return { error: error?.message ?? "Não foi possível criar." };
  await logAction(ctx, `Criou a carteira de avaliação ${n}`);
  done();
  return { ok: true, id: data.id as string };
}

export async function createPortfolioForm(f: FormData) {
  const r = await createPortfolio(String(f.get("name") ?? ""), String(f.get("description") ?? ""));
  if (r.id) redirect(`/mercado/carteiras/${r.id}`);
}

export async function updatePortfolio(f: FormData) {
  const ctx = await requireEdit("analise");
  const name = clean(f.get("name"));
  if (!name) return;
  await ctx.supabase.from("eval_portfolios").update({ name, description: clean(f.get("description"), 400) || null, updated_at: new Date().toISOString() })
    .eq("id", String(f.get("id"))).eq("household_id", ctx.household.id);
  done();
}

export async function deletePortfolio(f: FormData) {
  const ctx = await requireEdit("analise");
  await ctx.supabase.from("eval_portfolios").delete().eq("id", String(f.get("id"))).eq("household_id", ctx.household.id);
  await logAction(ctx, "Excluiu uma carteira de avaliação");
  done();
  redirect("/mercado/carteiras");
}

/** Adiciona um ativo a uma carteira (existente ou nova), guardando o preço do momento como referência. */
export async function addToPortfolio(input: { portfolioId?: string; newName?: string; yahoo: string }): Promise<R> {
  const ctx = await requireEdit("analise");
  let pid = input.portfolioId;
  if (!pid) {
    const r = await createPortfolio(input.newName ?? "");
    if (r.error) return r;
    pid = r.id!;
  }
  // Recebe o símbolo do Yahoo (PETR4.SA, AAPL, USDBRL=X); aceita também o ticker da B3 sem sufixo
  const yahoo = yahooSymbol(input.yahoo.trim());
  const { data: u } = await ctx.supabase.from("market_universe").select("market, symbol, name, currency, price").eq("yahoo", yahoo).limit(1).maybeSingle();
  const { data: q } = u ? { data: null } : await ctx.supabase.from("market_quotes").select("name, currency, price").eq("symbol", yahoo).maybeSingle();
  const market = (u?.market as string) ?? (yahoo.endsWith(".SA") ? "BR" : "US");
  const symbol = (u?.symbol as string) ?? yahoo.replace(/\.SA$/, "");
  const { error } = await ctx.supabase.from("eval_items").insert({
    portfolio_id: pid, household_id: ctx.household.id, market, symbol, yahoo,
    name: (u?.name ?? q?.name ?? null) as string | null, currency: (u?.currency ?? q?.currency ?? (market === "BR" ? "BRL" : "USD")) as string,
    added_price: (u?.price ?? q?.price ?? null) as number | null,
  });
  if (error) return { error: error.code === "23505" ? "Esse ativo já está nessa carteira." : error.message };
  done();
  return { ok: true, id: pid };
}

export async function updateItem(f: FormData) {
  const ctx = await requireEdit("analise");
  const rating = String(f.get("rating") ?? "observar");
  const w = parseMoneyInput(String(f.get("weight") ?? ""));
  await ctx.supabase.from("eval_items").update({
    target_price: parseMoneyInput(String(f.get("target") ?? "")), stop_price: parseMoneyInput(String(f.get("stop") ?? "")),
    rating: RATINGS.includes(rating) ? rating : "observar", weight: w, thesis: String(f.get("thesis") ?? "").trim().slice(0, 4000) || null,
    updated_at: new Date().toISOString(),
  }).eq("id", String(f.get("id"))).eq("household_id", ctx.household.id);
  done();
}

export async function removeItem(f: FormData) {
  const ctx = await requireEdit("analise");
  await ctx.supabase.from("eval_items").delete().eq("id", String(f.get("id"))).eq("household_id", ctx.household.id);
  done();
}

/** Registro de análise datado, com o preço do momento (histórico de por que comprar/vender). */
export async function addNote(f: FormData) {
  const ctx = await requireEdit("analise");
  const body = String(f.get("body") ?? "").trim().slice(0, 4000);
  const itemId = String(f.get("item_id"));
  if (!body) return;
  const { data: it } = await ctx.supabase.from("eval_items").select("yahoo").eq("id", itemId).eq("household_id", ctx.household.id).maybeSingle();
  if (!it) return;
  const { data: u } = await ctx.supabase.from("market_universe").select("price").eq("yahoo", it.yahoo).limit(1).maybeSingle();
  await ctx.supabase.from("eval_notes").insert({ item_id: itemId, household_id: ctx.household.id, author: ctx.user.id, author_name: ctx.member.display_name, body, price: (u?.price as number | null) ?? null });
  await ctx.supabase.from("eval_items").update({ updated_at: new Date().toISOString() }).eq("id", itemId);
  done();
}

export async function deleteNote(f: FormData) {
  const ctx = await requireEdit("analise");
  await ctx.supabase.from("eval_notes").delete().eq("id", String(f.get("id"))).eq("household_id", ctx.household.id);
  done();
}
