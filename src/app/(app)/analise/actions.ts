"use server";

import { revalidatePath } from "next/cache";
import { requireEdit } from "@/lib/context";
import { parseMoneyInput } from "@/lib/format";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => parseMoneyInput(str(f, k));
const done = () => revalidatePath("/analise", "layout");

export async function addWatch(f: FormData) {
  const ctx = await requireEdit("analise");
  const ticker = str(f, "ticker").toUpperCase();
  if (!ticker) return;
  await ctx.supabase.from("watchlist").upsert({ household_id: ctx.household.id, ticker, buy: num(f, "buy"), sell: num(f, "sell"), note: str(f, "note") || null });
  done();
}
export async function delWatch(f: FormData) {
  const ctx = await requireEdit("analise");
  await ctx.supabase.from("watchlist").delete().eq("household_id", ctx.household.id).eq("ticker", str(f, "ticker"));
  done();
}
export async function setTargets(f: FormData) {
  const ctx = await requireEdit("analise");
  await ctx.supabase.from("watchlist").update({ buy: num(f, "buy"), sell: num(f, "sell") }).eq("household_id", ctx.household.id).eq("ticker", str(f, "ticker"));
  done();
}
export async function saveFund(f: FormData) {
  const ctx = await requireEdit("analise");
  const fund = Object.fromEntries(["pl", "pvp", "dy", "lpa", "vpa", "roe", "divEbitda", "analystTarget"].map((k) => [k, num(f, k)]).filter(([, v]) => v != null));
  await ctx.supabase.from("watchlist").update({ fund: { ...fund, source: str(f, "source") || null } }).eq("household_id", ctx.household.id).eq("ticker", str(f, "ticker"));
  done();
}
/** Grava os desenhos do gráfico (chamado pelo componente do gráfico). */
export async function saveDrawings(ticker: string, drawings: unknown[]) {
  const ctx = await requireEdit("analise");
  await ctx.supabase.from("chart_drawings").upsert({ household_id: ctx.household.id, ticker, drawings, updated_at: new Date().toISOString() });
}
export async function addRfOffer(f: FormData) {
  const ctx = await requireEdit("analise");
  const rate = num(f, "rate");
  if (rate == null) return;
  await ctx.supabase.from("rf_offers").insert({ household_id: ctx.household.id, name: str(f, "name"), kind: str(f, "kind"), index: str(f, "index"), rate, maturity: str(f, "maturity") || null, daily: !!f.get("daily") });
  done();
}
export async function delRfOffer(f: FormData) {
  const ctx = await requireEdit("analise");
  await ctx.supabase.from("rf_offers").delete().eq("household_id", ctx.household.id).eq("id", str(f, "id"));
  done();
}
