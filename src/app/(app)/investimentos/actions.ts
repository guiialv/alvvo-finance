"use server";

import { revalidatePath } from "next/cache";
import { requireEdit } from "@/lib/context";
import { parseMoneyInput } from "@/lib/format";
import { aiAvailable, aiKeyFor, askClaude, parseJson } from "@/lib/ai";

const done = () => revalidatePath("/investimentos");
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => parseMoneyInput(str(f, k));

export async function addOp(f: FormData) {
  const ctx = await requireEdit("investimentos");
  const qty = num(f, "qty"), price = num(f, "price");
  if (!qty || price == null || !str(f, "ticker")) return;
  await ctx.supabase.from("inv_ops").insert({
    household_id: ctx.household.id, date: str(f, "date"), type: str(f, "type") === "venda" ? "venda" : "compra", ticker: str(f, "ticker").toUpperCase(),
    name: str(f, "name") || null, cls: str(f, "cls") || "acao", qty, price, costs: num(f, "costs") ?? 0, created_by: ctx.user.id,
  });
  done();
}
export async function delOp(f: FormData) {
  const ctx = await requireEdit("investimentos");
  await ctx.supabase.from("inv_ops").delete().eq("id", str(f, "id")).eq("household_id", ctx.household.id);
  done();
}
export async function addFixed(f: FormData) {
  const ctx = await requireEdit("investimentos");
  const amount = num(f, "amount"), rate = num(f, "rate");
  if (!amount || rate == null) return;
  await ctx.supabase.from("inv_fixed").insert({ household_id: ctx.household.id, name: str(f, "name"), kind: str(f, "kind"), amount, date: str(f, "date"), index: str(f, "index"), rate, maturity: str(f, "maturity") || null });
  done();
}
export async function delFixed(f: FormData) {
  const ctx = await requireEdit("investimentos");
  await ctx.supabase.from("inv_fixed").delete().eq("id", str(f, "id")).eq("household_id", ctx.household.id);
  done();
}
export async function addDividend(f: FormData) {
  const ctx = await requireEdit("investimentos");
  const amount = num(f, "amount");
  if (!amount) return;
  await ctx.supabase.from("inv_dividends").insert({ household_id: ctx.household.id, date: str(f, "date"), ticker: str(f, "ticker").toUpperCase(), kind: str(f, "kind"), amount });
  done();
}
export async function delDividend(f: FormData) {
  const ctx = await requireEdit("investimentos");
  await ctx.supabase.from("inv_dividends").delete().eq("id", str(f, "id")).eq("household_id", ctx.household.id);
  done();
}
export async function saveTargets(f: FormData) {
  const ctx = await requireEdit("investimentos");
  const targets = Object.fromEntries(["acao", "fii", "etf", "exterior", "cripto", "rf"].map((k) => [k, Math.max(0, Math.min(100, Number(str(f, k)) || 0))]));
  await ctx.supabase.from("inv_settings").upsert({ household_id: ctx.household.id, targets });
  done();
}
export async function saveManualQuote(f: FormData) {
  const ctx = await requireEdit("investimentos");
  const { data } = await ctx.supabase.from("inv_settings").select("manual_quotes").eq("household_id", ctx.household.id).maybeSingle();
  const mq = { ...((data?.manual_quotes as Record<string, number>) ?? {}) }, v = num(f, "price"), t = str(f, "ticker");
  if (v == null) delete mq[t]; else mq[t] = v;
  await ctx.supabase.from("inv_settings").upsert({ household_id: ctx.household.id, manual_quotes: mq });
  done();
}

export type NoteState = { error?: string; ops?: { date: string; type: string; ticker: string; qty: number; price: number; costs: number }[]; saved?: number } | undefined;
/** Lê uma nota de corretagem (PDF ou texto colado) com IA e devolve as operações para conferir. */
export async function readBrokerNote(_: NoteState, f: FormData): Promise<NoteState> {
  const ctx = await requireEdit("investimentos");
  if (str(f, "confirm") === "1") {
    const ops = JSON.parse(str(f, "ops")) as NonNullable<NoteState>["ops"];
    if (!ops?.length) return { error: "Nada para salvar." };
    await ctx.supabase.from("inv_ops").insert(ops.map((o) => ({ household_id: ctx.household.id, ...o, cls: /11$/.test(o.ticker) ? "fii" : "acao", created_by: ctx.user.id })));
    done();
    return { saved: ops.length };
  }
  if (!aiAvailable(ctx)) return { error: "A leitura com IA não está ativa nesta conta. Ative em Configurações → Inteligência artificial." };
  const key = await aiKeyFor(ctx);
  if (!key) return { error: "Nenhuma chave de IA disponível. Salve a sua chave do Claude em Configurações." };
  const file = f.get("file") as File | null, text = str(f, "text");
  const content = file && file.size ? [{ type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: Buffer.from(await file.arrayBuffer()).toString("base64") } }] : [];
  if (!content.length && !text) return { error: "Envie o PDF da nota ou cole o texto." };
  try {
    const out = await askClaude(key, {
      system: "Você lê notas de corretagem brasileiras (padrão SINACOR). Responda só com JSON.",
      content: [...content, { type: "text", text: `${text ? "Texto da nota:\n" + text + "\n\n" : ""}Extraia cada negócio: {"ops":[{"date":"AAAA-MM-DD","type":"compra|venda","ticker":"PETR4","qty":100,"price":36.5,"costs":0}]}. Distribua as taxas e emolumentos da nota proporcionalmente ao valor de cada negócio em "costs". Use o código de negociação (sem F de fracionário).` }],
      maxTokens: 4000,
    });
    const j = parseJson<{ ops: NonNullable<NoteState>["ops"] }>(out);
    return { ops: (j.ops ?? []).map((o) => ({ ...o, ticker: o.ticker.toUpperCase().replace(/F$/, "") })) };
  } catch (e) { return { error: (e as Error).message }; }
}
