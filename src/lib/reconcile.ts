/**
 * Regras de extrato bancário e conciliação com as faturas de cartão.
 *
 * Modelo de valores da plataforma: cada lançamento tem um tipo (pela categoria) e um valor
 * positivo quando "vai no sentido do tipo": receita que entra, despesa/investimento que sai.
 * No sentido contrário o valor fica negativo (estorno de despesa, devolução de receita, resgate).
 * Transferências ficam sempre positivas e não entram nos totais.
 */
import { cycleOf } from "@/lib/cycle";
import type { Kind } from "@/lib/categories-default";

export type Flow = "entrada" | "saida";

/** Nomes das categorias de sistema usadas na conciliação (grupo "Transferências"). */
export const SYS = {
  pagamentoFatura: "Pagamento de fatura",
  pixCredito: "PIX no crédito",
  emprestimos: "Empréstimos",
  entreContas: "Entre contas próprias",
  faturaSemDetalhe: "Fatura de cartão sem detalhe",
} as const;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

export function isCardPayment(description: string, nature?: string | null) {
  if (nature === "pagamento_fatura") return true;
  const d = norm(description);
  if (/SEGURO CARTAO|PIX CARTAO|ANUIDADE|TARIFA/.test(d)) return false;
  return /PAG(TO|AMENTO)?\.? ?(DE )?FATURA|FATURA (DO )?CART|PAG(TO)?\.? ?CART(AO)?( DE)? CRED|INT PAG CART|DEB(ITO)? AUT(OMATICO)?\.? FATURA|(ITAU|PERSONNALITE|UNICLASS)\s+(VISA|MASTER|MC|ELO|AMEX)|CARTAO CREDITO/.test(d);
}

export const isPixCreditOut = (description: string, nature?: string | null) => nature === "pix_credito" || /PIX (NO )?CART(AO)?|PIX CRED(ITO)?\b/.test(norm(description));
export const isPixCreditIn = (description: string, nature?: string | null) => nature === "pix_credito" || /CREDITO LIBERAD|PIX CRED(ITO)? LIBERAD|LIBERACAO PIX/.test(norm(description));
export const isLoan = (description: string, nature?: string | null) => nature === "emprestimo" || nature === "pagamento_emprestimo" || /CREDIARIO|EMPRESTIMO|FINANCIAMENTO|CREDITO PESSOAL|LIQUIDA OPERACAO/.test(norm(description));
export const isAutoInvest = (description: string, nature?: string | null) => nature === "aplicacao_automatica" || /APLIC(ACAO)? AUT|RES(GATE)? APLIC AUT|REND(IMENTO)? PAGO APLIC/.test(norm(description));

/** Pares "PIX no crédito": a entrada do limite e a saída do PIX, mesmo valor, até 1 dia de diferença. */
export function pairPixCredit<T extends { idx: number; date: string; amount: number; flow?: Flow | null; description: string; nature?: string | null }>(rows: T[]) {
  const paired = new Set<number>();
  const outs = rows.filter((r) => r.flow === "saida" && isPixCreditOut(r.description, r.nature));
  for (const o of outs) {
    const inn = rows.find((r) => !paired.has(r.idx) && r.flow === "entrada" && isPixCreditIn(r.description, r.nature)
      && Math.abs(r.amount - o.amount) < 0.01 && Math.abs(daysBetween(r.date, o.date)) <= 1);
    if (inn) { paired.add(o.idx); paired.add(inn.idx); }
  }
  return paired;
}

export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86400000);
}

export interface FaturaRef { id: string; label: string; dueDate: string | null; total: number; statementTotal: number | null }

/** Fatura que corresponde a um pagamento: vencimento até 10 dias de diferença e valor igual (tolerância 2% ou R$ 2). */
export function matchFatura(amount: number, date: string, faturas: FaturaRef[]): FaturaRef | null {
  const tol = (v: number) => Math.max(2, v * 0.02);
  const cands = faturas
    .filter((f) => f.dueDate && Math.abs(daysBetween(date, f.dueDate)) <= 10)
    .map((f) => {
      const diffs = [f.total, f.statementTotal ?? NaN].filter((v) => isFinite(v)).map((v) => Math.abs(v - amount));
      return { f, diff: Math.min(...diffs) };
    })
    .filter((x) => x.diff <= tol(amount))
    .sort((a, b) => a.diff - b.diff || Math.abs(daysBetween(date, a.f.dueDate!)) - Math.abs(daysBetween(date, b.f.dueDate!)));
  return cands[0]?.f ?? null;
}

/** Valor com sinal no modelo da plataforma, a partir do valor absoluto do extrato. */
export function signedAmount(abs: number, flow: Flow, kind: Kind) {
  const v = Math.abs(abs);
  if (kind === "transferencia") return v;
  const aligned = kind === "receita" ? flow === "entrada" : flow === "saida";
  return aligned ? v : -v;
}

/**
 * Competência de compras no cartão: entram no ciclo em que a fatura é paga.
 * Com vencimento conhecido, é o ciclo do vencimento. Sem ele, compras de um mês vencem no mês seguinte, no dia de vencimento.
 */
export function cardCycle(purchaseDate: string, startDay: number, dueDate?: string | null, dueDay = startDay) {
  if (dueDate) return cycleOf(dueDate, startDay);
  const [y, m] = purchaseDate.slice(0, 10).split("-").map(Number);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return cycleOf(`${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(28, dueDay)).padStart(2, "0")}`, startDay);
}
