import { pageToLines, parseBRL } from "./pdf-lines";
import type { ParsedCardTransaction, ParsedStatement, PdfPage } from "./types";

const MONEY = String.raw`(\d{1,3}(?:\.\d{3})*,\d{2})`;
const TX_RE = new RegExp(String.raw`^(\d{2})\/(\d{2})\s+(.+?)\s+(-\s*)?${MONEY}$`);
const HOLDER_RE = /^(.+?)\s*\(final (\d{4})\)$/;
const CARD_TOTAL_RE = new RegExp(String.raw`^Lançamentos no cartão \(final (\d{4})\)\s+(-\s*)?${MONEY}`);
const INSTALLMENT_RE = /\s*(\d{2})\/(\d{2})$/;
const CATEGORY_RE = /^([A-ZÀ-Ü][A-ZÀ-Ü ]*?)\s*\.\s*(.*)$/;
const INTL_DETAIL_RE = new RegExp(String.raw`^(.*?)\s*${MONEY}\s+([A-Z]{3})\s+${MONEY}$`);

/** Identifica se o texto da primeira página parece uma fatura Itaú. */
export function isItauStatement(pages: PdfPage[]): boolean {
  const text = pages.slice(0, 3).flatMap((p) => p.items.map((i) => i.str)).join(" ");
  return /Itaú|Itau|itau\.com|4004 4828/i.test(text) && /Lançamentos: compras e saques/.test(text);
}

export function parseItauStatement(pages: PdfPage[]): ParsedStatement {
  const warnings: string[] = [];
  const fullText = pages.map((p) => pageToLines(p).join("\n")).join("\n");

  const dueDate = matchDate(fullText, /Vencimento:\s*(\d{2}\/\d{2}\/\d{4})/);
  const closingDate = matchDate(fullText, /Emissão:\s*(\d{2}\/\d{2}\/\d{4})/);
  const totalMatch = fullText.match(new RegExp(String.raw`Total desta fatura\s+${MONEY}`));
  const statementTotal = totalMatch ? parseBRL(totalMatch[1]) : null;
  const holderMatch = fullText.match(/Titular\s+(.+)/);
  const holder = holderMatch ? holderMatch[1].trim() : null;

  const ref = dueDate ? new Date(dueDate + "T12:00:00") : new Date();
  const refYear = ref.getFullYear();
  const refMonth = ref.getMonth() + 1;
  const toIso = (dd: string, mm: string) => {
    const m = Number(mm);
    const y = m > refMonth ? refYear - 1 : refYear;
    return `${y}-${mm}-${dd}`;
  };

  const transactions: ParsedCardTransaction[] = [];
  const futureInstallments: ParsedStatement["futureInstallments"] = [];
  const cardTotals: Record<string, number> = {};

  type Mode = "none" | "tx" | "intl" | "future";
  let mode: Mode = "none";
  let currentCard: string | null = null;
  let currentHolder: string | null = holder;
  let last: ParsedCardTransaction | null = null;

  const lines = pages.flatMap((p) => pageToLines(p, /^Lançamentos: compras e saques/));

  for (const line of lines) {
    if (/^Lançamentos: compras e saques/.test(line)) { if (mode === "none") mode = "tx"; last = null; continue; }
    if (/^Compras parceladas - próximas faturas/.test(line)) { mode = "future"; last = null; continue; }
    if (/^(Limites de crédito|Encargos cobrados|Próxima fatura|Demais faturas|Total para próximas)/.test(line)) {
      if (mode === "future" && /^Total para próximas/.test(line)) mode = "none";
      if (/^(Limites de crédito|Encargos cobrados)/.test(line)) mode = "none";
      last = null;
      continue;
    }
    if (mode === "none") continue;
    if (/^(DATA|Continua\.\.\.|L Total dos lançamentos)/.test(line)) { last = null; continue; }

    if (/^Lançamentos internacionais/.test(line)) { mode = "intl"; last = null; continue; }

    const ct = line.match(CARD_TOTAL_RE);
    if (ct) {
      cardTotals[ct[1]] = (ct[2] ? -1 : 1) * parseBRL(ct[3]);
      last = null;
      continue;
    }

    const hm = line.match(HOLDER_RE);
    if (hm && mode !== "future") {
      currentHolder = hm[1].trim();
      currentCard = hm[2];
      last = null;
      continue;
    }

    if (mode === "intl") {
      const fx = line.match(/^Dólar de Conversão R\$\s*([\d.,]+)/);
      if (fx && last) { last.fxRate = parseBRL(fx[1]); continue; }
      const iof = line.match(new RegExp(String.raw`^Repasse de IOF em R\$\s+${MONEY}`));
      if (iof) {
        transactions.push({
          date: closingDate ?? dueDate ?? new Date().toISOString().slice(0, 10),
          description: "IOF compras internacionais",
          amount: parseBRL(iof[1]),
          cardLast4: currentCard, holder: currentHolder,
          installmentNo: null, installmentTotal: null,
          bankCategory: "IOF", city: null, international: true,
        });
        last = null;
        continue;
      }
      const tot = line.match(new RegExp(String.raw`^Total lançamentos inter\. em R\$\s+${MONEY}`));
      if (tot) { cardTotals[`intl-${currentCard}`] = parseBRL(tot[1]); last = null; continue; }
      if (/^Total transações inter/.test(line)) { last = null; continue; }
      const det = line.match(INTL_DETAIL_RE);
      if (det && last) {
        last.city = det[1] || null;
        last.foreignAmount = parseBRL(det[2]);
        last.foreignCurrency = det[3];
        continue;
      }
    }

    const tx = line.match(TX_RE);
    if (tx) {
      const [, dd, mm, rawDesc, neg, value] = tx;
      const amount = (neg ? -1 : 1) * parseBRL(value);
      let description = rawDesc.trim();
      let installmentNo: number | null = null;
      let installmentTotal: number | null = null;
      const inst = description.match(INSTALLMENT_RE);
      if (inst) {
        const n = Number(inst[1]);
        const t = Number(inst[2]);
        if (n >= 1 && t >= 2 && n <= t && t <= 48) {
          installmentNo = n;
          installmentTotal = t;
          description = description.slice(0, inst.index).trim();
        }
      }
      if (mode === "future") {
        futureInstallments.push({ date: toIso(dd, mm), description: rawDesc.trim(), amount });
        continue;
      }
      last = {
        date: toIso(dd, mm),
        description: description.replace(/\s+/g, " "),
        amount,
        cardLast4: currentCard,
        holder: currentHolder,
        installmentNo,
        installmentTotal,
        bankCategory: null,
        city: null,
        international: mode === "intl",
      };
      transactions.push(last);
      continue;
    }

    // Linha de categoria/cidade logo abaixo do lançamento
    if (last && last.bankCategory === null && last.city === null && !/\d,\d{2}$/.test(line)) {
      const cm = line.match(CATEGORY_RE);
      if (cm) {
        last.bankCategory = cm[1].trim();
        last.city = cm[2].trim() || null;
      } else {
        last.city = line.trim();
      }
      continue;
    }
  }

  // Conferência dos totais
  const sum = round2(transactions.reduce((s, t) => s + t.amount, 0));
  if (statementTotal !== null && Math.abs(sum - statementTotal) > 0.05) {
    warnings.push(`A soma dos lançamentos lidos (R$ ${fmt(sum)}) difere do total da fatura (R$ ${fmt(statementTotal)}). Confira se faltou algum item.`);
  }
  for (const [card, total] of Object.entries(cardTotals)) {
    if (card.startsWith("intl-")) continue;
    const s = round2(transactions.filter((t) => t.cardLast4 === card && !t.international).reduce((a, t) => a + t.amount, 0));
    if (Math.abs(s - total) > 0.05) warnings.push(`Cartão final ${card}: lido R$ ${fmt(s)}, fatura informa R$ ${fmt(total)}.`);
  }

  return { bank: "Itaú", holder, dueDate, closingDate, statementTotal, transactions, cardTotals, futureInstallments, warnings };
}

function matchDate(text: string, re: RegExp): string | null {
  const m = text.match(re);
  if (!m) return null;
  const [d, mo, y] = m[1].split("/");
  return `${y}-${mo}-${d}`;
}
const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
