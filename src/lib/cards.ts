/**
 * Cartões de crédito vistos pelas faturas: cada conta-cartão (ex.: número da conta no nome do PDF do Itaú)
 * vira um cartão, com a fatura mês a mês, o que já está comprometido em parcelas e o resumo de cada fatura.
 */
import { buildInstallmentPlans, type InstallmentTx } from "@/lib/installments";
import type { Category } from "@/lib/data";
import { cycleOf } from "@/lib/cycle";

export interface CardAccount {
  id: string; name: string; institution: string | null; brand: string | null; color: string | null; purpose: string | null;
  statement_key: string | null; merged_keys?: string[] | null; last4: string | null; closing_day: number | null; due_day: number | null; credit_limit: number | null; sort: number | null;
}
export interface Batch { id: string; account_id: string | null; due_date: string | null; statement_total: number | null; current_total?: number | null; institution: string | null; file_name: string | null }
export interface CardTx extends InstallmentTx { import_batch_id: string | null; international?: boolean | null; bank_category?: string | null; kind?: string }

export function brandOf(text: string | null | undefined) {
  const t = (text ?? "").toUpperCase();
  return /VISA/.test(t) ? "Visa" : /MASTER/.test(t) ? "Mastercard" : /\bELO\b/.test(t) ? "Elo" : /AMEX|AMERICAN EXPRESS/.test(t) ? "Amex" : /HIPER/.test(t) ? "Hipercard" : null;
}

/** Números que são data/hora do download (ex.: Fatura_Itau_20261111-135442.pdf), não o número da conta. */
const isDateLike = (n: string) => /^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(\d{4,6})?$/.test(n);

/**
 * Chave da conta-cartão: número da conta no nome do arquivo (ex.: Fatura_VISA_100252576003_08-11-2026.pdf),
 * senão o final do cartão principal, senão só o banco. Nunca usa a data do download.
 */
export function statementKey(fileName: string, bank: string, cardLast4s: string[]) {
  // Tira data e hora do download (20261111-135442) e datas (08-11-2026) antes de procurar o número da conta
  const clean = fileName.replace(/(19|20)\d{6}[-_ ]?\d{4,6}/g, " ").replace(/\d{2}[-_.]\d{2}[-_.]\d{4}/g, " ");
  const nums = [...clean.matchAll(/\d{8,}/g)].map((m) => m[0]).filter((n) => !isDateLike(n));
  if (nums.length) return nums[0];
  const b = bank.toLowerCase().trim().replace(/\s+/g, "-");
  const main = [...cardLast4s].sort()[0];
  return main ? `${b}-${main}` : b;
}

export const CARD_COLORS: [string, string][] = [["#1d1915", "Grafite"], ["#2b3445", "Azul-noite"], ["#3b2a1f", "Café"], ["#4a3b5c", "Ameixa"], ["#24433a", "Verde-inglês"], ["#7a5c32", "Bronze"], ["#5b1f24", "Bordô"]];
export const defaultCardColor = (c: Pick<CardAccount, "color" | "brand" | "name">) =>
  c.color ?? (/black|infinite|the essential|personnalit/i.test(c.name) ? "#1d1915" : c.brand === "Visa" ? "#2b3445" : "#3b2a1f");

const FEES = /\bIOF\b|ANUIDADE|JUROS|ENCARGO|MULTA|MORA|TARIFA|SEGURO CART|AVAL EMERG/i;

export interface MonthCell { cycle: string; total: number; batchId: string | null; dueDate: string | null; projected: boolean; paid: boolean }
export interface CardSummary {
  card: CardAccount; months: MonthCell[]; selected: MonthCell | null;
  breakdown: { aVista: number; parcelas: number; internacional: number; encargos: number; creditos: number; itens: number };
  categories: { cat: Category | undefined; v: number }[]; upcoming: { cycle: string; v: number }[]; avg: number;
}

/**
 * Monta a visão de um cartão: até 7 meses com fatura importada + 3 meses seguintes com as parcelas já compradas.
 * `selectedCycle` escolhe o mês detalhado (padrão: o último com fatura).
 */
export function cardSummary(card: CardAccount, batches: Batch[], txs: CardTx[], byId: Map<string, Category>, paidBatches: Set<string>, startDay: number, currentCycle: string, selectedCycle?: string): CardSummary {
  const mine = batches.filter((b) => b.account_id === card.id && b.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const tx = txs.filter((t) => t.import_batch_id && mine.some((b) => b.id === t.import_batch_id));
  const sumBatch = (id: string) => Math.round(tx.filter((t) => t.import_batch_id === id).reduce((a, t) => a + Number(t.amount), 0) * 100) / 100;
  const real: MonthCell[] = mine.slice(-12).map((b) => ({ cycle: cycleOf(b.due_date!, startDay), total: b.current_total != null ? Number(b.current_total) : sumBatch(b.id), batchId: b.id, dueDate: b.due_date, projected: false, paid: paidBatches.has(b.id) }));
  // Próximas faturas: parcelas já compradas que ainda vão cair
  const last = real.length ? real[real.length - 1].cycle : currentCycle;
  const plans = buildInstallmentPlans(tx, last);
  const future: MonthCell[] = [];
  for (let i = 1; i <= 3; i++) {
    const [y, m] = last.split("-").map(Number); const k = (y * 12 + m - 1 + i);
    const cy = `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`;
    const v = plans.reduce((a, p) => a + (p.schedule.get(cy)?.known === false ? p.schedule.get(cy)!.amount : 0), 0);
    if (v > 0) future.push({ cycle: cy, total: Math.round(v * 100) / 100, batchId: null, dueDate: card.due_day ? `${cy}-${String(card.due_day).padStart(2, "0")}` : null, projected: true, paid: false });
  }
  const months = [...real, ...future];
  const selected = months.find((x) => x.cycle === selectedCycle) ?? real[real.length - 1] ?? months[0] ?? null;

  const sel = selected?.batchId ? tx.filter((t) => t.import_batch_id === selected.batchId) : [];
  const breakdown = { aVista: 0, parcelas: 0, internacional: 0, encargos: 0, creditos: 0, itens: sel.length };
  const catMap = new Map<string, number>();
  for (const t of sel) {
    const v = Number(t.amount);
    if (v < 0) { breakdown.creditos += -v; continue; }
    if (FEES.test(t.description)) breakdown.encargos += v;
    else if (t.installment_total && t.installment_total > 1) breakdown.parcelas += v;
    else breakdown.aVista += v;
    if (t.international) breakdown.internacional += v;
    const k = t.category_id ?? "_";
    catMap.set(k, (catMap.get(k) ?? 0) + v);
  }
  const categories = [...catMap].map(([k, v]) => ({ cat: byId.get(k), v })).sort((a, b) => b.v - a.v).slice(0, 4);
  const upcoming = (selected && !selected.projected ? future : future.filter((f) => f.cycle > selected!.cycle)).map((f) => ({ cycle: f.cycle, v: f.total }));
  const avg = real.length ? real.reduce((a, r) => a + r.total, 0) / real.length : 0;
  return { card, months, selected, breakdown, categories, upcoming, avg };
}

/** Melhor dia de compra: o dia seguinte ao fechamento. Sem fechamento conhecido, estima 7 dias antes do vencimento (ex.: vence 08 → compra a partir do dia 01). */
export function bestPurchaseDay(card: Pick<CardAccount, "closing_day" | "due_day">): { day: number; estimated: boolean } | null {
  if (card.closing_day) return { day: (card.closing_day % 31) + 1, estimated: false };
  if (card.due_day) return { day: ((card.due_day - 8 + 30) % 30) + 1, estimated: true };
  return null;
}
