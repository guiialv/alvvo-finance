import type { Ctx } from "@/lib/context";
import { fetchAll, loadCategories, loadTransactions } from "@/lib/data";
import { currentCycle, shiftCycle, todayIso } from "@/lib/cycle";
import { loadAgenda } from "@/lib/agenda-data";
import { addDays } from "@/lib/agenda";
import { toCashView } from "@/lib/cash-flow";
import { buildInstallmentPlans, totalsByCycle, type InstallmentTx } from "@/lib/installments";
import type { SimData } from "@/app/(app)/simulacoes/sims/types";
import type { CompraBase } from "./compra";

export interface CompraHist { id: string; item: string; amount: number; status: string; verdict: string | null; remind_on: string | null; created_at: string; params: Record<string, unknown> }

/** Situação da família para o "Posso comprar?": caixa, reserva, parcelas já assumidas e gastos variáveis. */
export async function loadCompraBase(ctx: Ctx, d: SimData): Promise<{ base: CompraBase; hist: CompraHist[] }> {
  const hh = ctx.household.id, today = todayIso();
  const cycle = currentCycle(ctx.household.cycle_start_day);
  const prev = [1, 2, 3].map((k) => shiftCycle(cycle, -k));
  const [goalsR, linksR, agenda, inst, cats, raw, histR] = await Promise.all([
    ctx.supabase.from("goals").select("id, name, type, data").eq("household_id", hh).eq("type", "caixinha"),
    ctx.supabase.from("bank_links").select("balance").eq("household_id", hh).eq("kind", "conta"),
    loadAgenda(ctx, today, addDays(today, 35)),
    fetchAll(() => ctx.supabase.from("transactions").select("*").eq("household_id", hh).eq("scope", "pessoal").not("installment_total", "is", null).gt("installment_total", 1)),
    loadCategories(ctx, "pessoal"),
    loadTransactions(ctx, { scope: "pessoal", cycles: prev }),
    ctx.supabase.from("purchase_checks").select("id, item, amount, status, verdict, remind_on, created_at, params").eq("household_id", hh).order("created_at", { ascending: false }).limit(12),
  ]);

  const cx = (goalsR.data ?? []) as { id: string; name: string; data: { auto?: string | null; balance?: number; target?: number } }[];
  const res = cx.find((g) => g.data?.auto === "reserva") ?? cx.find((g) => /reserva|emerg/i.test(g.name));
  const reserva = res
    ? { atual: d.goals.find((g) => g.id === res.id)?.balance ?? Number(res.data.balance ?? 0), alvo: res.data.target ? Number(res.data.target) : null, nome: res.name, goalId: res.id }
    : { atual: Number(d.carteira.pos ?? 0), alvo: null, nome: null, goalId: null };

  const links = (linksR.data ?? []) as { balance: number | null }[];
  const pend = agenda.occ.filter((o) => !o.paid && o.amount && o.date >= today && o.event !== "fechamento");
  const caixa = {
    saldo: links.length ? links.reduce((a, l) => a + Number(l.balance ?? 0), 0) : null,
    contas: pend.filter((o) => o.event !== "receita").reduce((a, o) => a + (o.amount ?? 0), 0),
    receber: pend.filter((o) => o.event === "receita").reduce((a, o) => a + (o.amount ?? 0), 0),
  };

  const plans = buildInstallmentPlans(inst as unknown as InstallmentTx[], cycle);
  const fut = Array.from({ length: 24 }, (_, i) => shiftCycle(cycle, i));
  const parcelas = totalsByCycle(plans.filter((p) => p.remainingCount > 0), fut);

  // Gastos variáveis por categoria (média dos últimos 3 ciclos com movimento, critério de caixa)
  const txs = (await toCashView(ctx, raw, cats, prev)).txs;
  const byId = new Map(cats.map((c) => [c.id, c]));
  const ativos = new Set(txs.map((t) => t.cycle)).size || 1;
  const soma = new Map<string, number>();
  for (const t of txs) {
    const c = t.category_id ? byId.get(t.category_id) : undefined;
    if (!c || c.excluded_from_totals || c.kind !== "despesa" || !["Variáveis", "Extras", "Adicionais"].includes(c.grp)) continue;
    soma.set(c.name, (soma.get(c.name) ?? 0) + Number(t.amount));
  }
  const cortes = [...soma].map(([name, v]) => ({ name, avg: v / ativos })).filter((c) => c.avg >= 50).sort((a, b) => b.avg - a.avg).slice(0, 6);

  return {
    base: {
      ciclo: cycle, renda: d.renda, despesas: d.despesas, sobra: d.sobra, aporte: d.aporte,
      reserva, caixa, parcelas, cortes,
      goals: d.goals.map((g) => ({ id: g.id, name: g.name, target: g.target, balance: g.balance, deadline: g.deadline })),
      cdiNetM: Math.pow(1 + d.cdiNet, 1 / 12) - 1,
    },
    hist: ((histR.data ?? []) as CompraHist[]).map((h) => ({ ...h, amount: Number(h.amount) })),
  };
}
