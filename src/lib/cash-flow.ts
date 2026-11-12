import type { Ctx } from "@/lib/context";
import { type Category, fetchAll, type Transaction } from "@/lib/data";

type Tx = Transaction & { flow?: "entrada" | "saida" | null; reconciled_batch_id?: string | null };

export interface CashView {
  /** Lançamentos “de caixa”: extrato do mês, com cada fatura paga aberta nas categorias das compras */
  txs: Transaction[];
  /** Ciclos sem extrato importado: ficam na visão por competência (compras do cartão no mês da fatura) */
  competencia: string[];
  /** Transferências e empréstimos que passaram pela conta (não são renda nem gasto) */
  transfers: { entrou: number; saiu: number };
  /** Faturas pagas no período que foram abertas por categoria / sem detalhe */
  faturas: { abertas: number; semDetalhe: number; valor: number };
}

/**
 * Visão de caixa: o que entrou e saiu da conta corrente em cada ciclo. O pagamento de uma fatura é
 * substituído pelas compras daquela fatura (consumidas no ciclo anterior), proporcionalmente ao valor
 * pago — assim o fluxo mostra em que grupos/categorias o dinheiro do mês realmente foi gasto.
 */
/** `cycles` = ciclos do período exibido (para os totais de transferências/faturas); os demais ciclos carregados seguem o mesmo critério. */
export async function toCashView(ctx: Ctx, txs: Transaction[], cats: Category[], cycles: string[]): Promise<CashView> {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const all = txs as Tx[];
  const cashCycles = new Set(all.filter((t) => t.source === "extrato").map((t) => t.cycle));
  const competencia = cycles.filter((c) => !cashCycles.has(c));
  const semDetalhe = cats.find((c) => c.name === "Fatura de cartão sem detalhe");
  const isFaturaPayment = (t: Tx) => t.category_id ? byId.get(t.category_id)?.name === "Pagamento de fatura" : false;

  // Compras das faturas pagas no período
  const payments = all.filter((t) => cashCycles.has(t.cycle) && t.source === "extrato" && isFaturaPayment(t) && (t.flow ?? "saida") === "saida");
  // Pagamento antecipado (antes do vencimento) ainda sem fatura ligada: liga à fatura que vence logo depois
  // cujo total dos lançamentos, descontado o que já foi pago no vencimento, bate com o valor
  const loose = payments.filter((p) => !p.reconciled_batch_id);
  if (loose.length) {
    const { data: bs } = await ctx.supabase.from("import_batches").select("id, due_date, statement_total, current_total")
      .eq("household_id", ctx.household.id).eq("doc_type", "fatura").not("due_date", "is", null);
    const used = new Set<string>();
    for (const p of loose) {
      const lim = new Date(Date.parse(p.date) + 25 * 86400000).toISOString().slice(0, 10);
      const v = Math.abs(Number(p.amount));
      const hit = ((bs ?? []) as { id: string; due_date: string; statement_total: number | null; current_total: number | null }[])
        .filter((b) => b.due_date >= p.date && b.due_date <= lim && !used.has(b.id))
        .find((b) => {
          const cur = Number(b.current_total ?? b.statement_total ?? 0), st = Number(b.statement_total ?? 0);
          return Math.abs(cur - st - v) < 0.05 || Math.abs(cur - v) < 0.05;
        });
      if (hit) { used.add(hit.id); p.reconciled_batch_id = hit.id; }
    }
  }
  const batchIds = [...new Set(payments.map((p) => p.reconciled_batch_id).filter((x): x is string => !!x))];
  const items = batchIds.length
    ? await fetchAll<Tx>(() => ctx.supabase.from("transactions").select("id, category_id, kind, amount, import_batch_id, scope").eq("household_id", ctx.household.id).in("import_batch_id", batchIds))
    : [];
  const byBatch = new Map<string, Tx[]>();
  for (const it of items) byBatch.set(it.import_batch_id!, [...(byBatch.get(it.import_batch_id!) ?? []), it]);

  const out: Transaction[] = [];
  const transfers = { entrou: 0, saiu: 0 };
  const faturas = { abertas: 0, semDetalhe: 0, valor: 0 };
  for (const t of all) {
    const cash = cashCycles.has(t.cycle);
    if (!cash) { out.push(t); continue; } // sem extrato no ciclo: competência
    if (t.source !== "extrato") continue; // compras no cartão entram pela fatura paga
    const c = t.category_id ? byId.get(t.category_id) : undefined;
    const kind = c?.kind ?? t.kind;
    const v = Math.abs(Number(t.amount));
    const inPeriod = cycles.includes(t.cycle);
    if (isFaturaPayment(t) && (t.flow ?? "saida") === "saida") {
      if (inPeriod) faturas.valor += v;
      const its = (t.reconciled_batch_id && byBatch.get(t.reconciled_batch_id)) || [];
      const net = its.reduce((a, i) => a + Number(i.amount), 0);
      if (its.length && net > 0.005) {
        if (inPeriod) faturas.abertas++;
        const f = v / net;
        for (const i of its) out.push({ ...t, id: `${t.id}:${i.id}`, category_id: i.category_id, kind: i.kind, amount: Number(i.amount) * f } as Transaction);
      } else {
        if (inPeriod) faturas.semDetalhe++;
        out.push({ ...t, category_id: semDetalhe?.id ?? null, kind: "despesa", amount: v } as Transaction);
      }
      continue;
    }
    if (kind === "transferencia" || c?.excluded_from_totals) {
      if (inPeriod) { if ((t.flow ?? (Number(t.amount) < 0 ? "entrada" : "saida")) === "entrada") transfers.entrou += v; else transfers.saiu += v; }
      continue;
    }
    out.push(t);
  }
  return { txs: out, competencia, transfers, faturas };
}
