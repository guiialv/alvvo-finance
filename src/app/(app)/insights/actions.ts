"use server";

import { revalidatePath } from "next/cache";
import { requireEdit } from "@/lib/context";

export async function dismissInsight(formData: FormData) {
  const ctx = await requireEdit("insights");
  await ctx.supabase.from("insight_dismissals").upsert({ household_id: ctx.household.id, key: String(formData.get("key")), dismissed_by: ctx.user.id });
  revalidatePath("/insights");
}

export async function restoreInsights() {
  const ctx = await requireEdit("insights");
  await ctx.supabase.from("insight_dismissals").delete().eq("household_id", ctx.household.id);
  revalidatePath("/insights");
}

/** Resumo do ciclo atual com IA, a partir dos números já calculados pela plataforma. */
export async function summarizeCycle(): Promise<{ text?: string; error?: string }> {
  const { getContext } = await import("@/lib/context");
  const { aiKeyFor } = await import("@/lib/ai");
  const { aiCycleSummary } = await import("@/lib/ai-tasks");
  const { currentCycle, shiftCycle } = await import("@/lib/cycle");
  const { categoryIndex, loadCategories, loadTransactions } = await import("@/lib/data");
  const ctx = await getContext();
  const key = await aiKeyFor(ctx);
  if (!key) return { error: "IA não está ativa nesta conta (Configurações → Inteligência artificial)." };
  const cur = currentCycle(ctx.household.cycle_start_day), prev = shiftCycle(cur, -1);
  const [cats, txs] = await Promise.all([loadCategories(ctx, "pessoal"), loadTransactions(ctx, { scope: "pessoal", cycles: [cur, prev] })]);
  const { byId } = categoryIndex(cats);
  const sum = (c: string, kind: string) => txs.filter((t) => t.cycle === c && byId.get(t.category_id ?? "")?.kind === kind && !byId.get(t.category_id ?? "")?.excluded_from_totals).reduce((a, t) => a + Number(t.amount), 0);
  const byCat: Record<string, number> = {};
  for (const t of txs.filter((t) => t.cycle === cur)) { const c = byId.get(t.category_id ?? ""); if (c?.kind === "despesa" && !c.excluded_from_totals) byCat[c.name] = (byCat[c.name] ?? 0) + Number(t.amount); }
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, v]) => `${n}: R$ ${v.toFixed(2)}`).join("; ");
  const facts = `Ciclo ${cur}: receitas R$ ${sum(cur, "receita").toFixed(2)}, despesas R$ ${sum(cur, "despesa").toFixed(2)}, investido R$ ${sum(cur, "investimento").toFixed(2)}. Ciclo anterior (${prev}): receitas R$ ${sum(prev, "receita").toFixed(2)}, despesas R$ ${sum(prev, "despesa").toFixed(2)}. Maiores despesas do ciclo: ${top || "nenhuma"}.`;
  try { return { text: await aiCycleSummary(key, facts) }; } catch (e) { return { error: (e as Error).message }; }
}
