/**
 * Compras parceladas: agrupa as parcelas de uma mesma compra (vindas de várias faturas
 * ou lançadas manualmente) e projeta as parcelas futuras ciclo a ciclo.
 */

export interface InstallmentTx {
  id: string;
  date: string;              // data da compra (fatura) ou da parcela (manual)
  cycle: string;             // 'AAAA-MM'
  description: string;
  merchant_key: string | null;
  amount: number;
  installment_no: number;
  installment_total: number;
  category_id: string | null;
  account_id: string | null;
  member_user_id: string | null;
  notes: string | null;
  source: string;
}

export type CellStatus = "pago" | "atual" | "previsto";

export interface InstallmentPlan {
  key: string;
  description: string;
  purchaseDate: string;
  installmentAmount: number;
  total: number;             // valor total da compra (parcela × nº de parcelas)
  installmentTotal: number;
  category_id: string | null;
  account_id: string | null;
  member_user_id: string | null;
  notes: string | null;
  latestTxId: string;
  /** ciclo -> parcela */
  schedule: Map<string, { n: number; amount: number; known: boolean; status: CellStatus }>;
  firstCycle: string;
  lastCycle: string;
  paidCount: number;         // parcelas em ciclos já passados (inclui a atual se o ciclo já passou)
  remaining: number;         // valor ainda a vencer a partir do ciclo atual (inclusive)
  remainingCount: number;
}

const shift = (c: string, n: number) => {
  const i = Number(c.slice(0, 4)) * 12 + Number(c.slice(5, 7)) - 1 + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
};
const diff = (a: string, b: string) => (Number(a.slice(0, 4)) * 12 + Number(a.slice(5, 7))) - (Number(b.slice(0, 4)) * 12 + Number(b.slice(5, 7)));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Chave que identifica a mesma compra em faturas diferentes. */
function purchaseKey(t: InstallmentTx): string {
  const who = (t.merchant_key || t.description).toUpperCase().trim();
  // Fatura: a data é a da compra original e se repete em todas as parcelas.
  // Manual: cada parcela tem uma data diferente, então usamos a data da 1ª parcela estimada.
  const base = t.source === "manual" ? shift(t.cycle, -(t.installment_no - 1)) : t.date;
  return [who, base, t.installment_total, Math.round(Number(t.amount) * 100), t.account_id ?? ""].join("|");
}

export function buildInstallmentPlans(txs: InstallmentTx[], currentCycle: string): InstallmentPlan[] {
  const groups = new Map<string, InstallmentTx[]>();
  for (const t of txs) {
    if (!t.installment_total || !t.installment_no || t.installment_total < 2) continue;
    const k = purchaseKey(t);
    const g = groups.get(k);
    if (g) g.push(t); else groups.set(k, [t]);
  }

  const plans: InstallmentPlan[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.installment_no - b.installment_no || a.cycle.localeCompare(b.cycle));
    const latest = list[list.length - 1];
    const N = latest.installment_total;
    const amount = Number(latest.amount);
    // Ciclo da parcela 1, ancorado na parcela conhecida mais recente
    const firstCycle = shift(latest.cycle, -(latest.installment_no - 1));
    const known = new Map(list.map((t) => [t.installment_no, t] as [number, InstallmentTx]));
    const schedule: InstallmentPlan["schedule"] = new Map();
    let remaining = 0, remainingCount = 0, paidCount = 0;
    for (let n = 1; n <= N; n++) {
      const kt = known.get(n);
      const cycle = kt ? kt.cycle : shift(firstCycle, n - 1);
      const v = kt ? Number(kt.amount) : amount;
      const d = diff(cycle, currentCycle);
      const status: CellStatus = d < 0 ? "pago" : d === 0 ? "atual" : "previsto";
      schedule.set(cycle, { n, amount: v, known: !!kt, status });
      if (d < 0) paidCount++; else { remaining += v; remainingCount++; }
    }
    plans.push({
      key, description: latest.description, purchaseDate: latest.source === "manual" ? list[0].date : latest.date,
      installmentAmount: amount, total: round2(amount * N), installmentTotal: N,
      category_id: latest.category_id, account_id: latest.account_id, member_user_id: latest.member_user_id, notes: latest.notes,
      latestTxId: latest.id, schedule, firstCycle, lastCycle: shift(firstCycle, N - 1),
      paidCount, remaining: round2(remaining), remainingCount,
    });
  }
  return plans.sort((a, b) => b.lastCycle.localeCompare(a.lastCycle) || b.remaining - a.remaining);
}

/** Total por ciclo (todas as compras parceladas). */
export function totalsByCycle(plans: InstallmentPlan[], cycles: string[]) {
  return cycles.map((c) => round2(plans.reduce((a, p) => a + (p.schedule.get(c)?.amount ?? 0), 0)));
}

export { shift as shiftCycleBy };
