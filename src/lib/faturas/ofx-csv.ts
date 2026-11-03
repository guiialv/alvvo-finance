import type { ParsedCardTransaction, ParsedStatement } from "./types";

const emptyStatement = (bank: string): ParsedStatement => ({
  bank, holder: null, dueDate: null, closingDate: null, statementTotal: null,
  transactions: [], cardTotals: {}, futureInstallments: [], warnings: [],
});

const tx = (date: string, description: string, amount: number): ParsedCardTransaction => {
  let installmentNo: number | null = null;
  let installmentTotal: number | null = null;
  const m = description.match(/\s*(?:PARC(?:ELA)?\s*)?(\d{1,2})\s*\/\s*(\d{1,2})\s*$/i);
  if (m && Number(m[1]) <= Number(m[2]) && Number(m[2]) >= 2) {
    installmentNo = Number(m[1]);
    installmentTotal = Number(m[2]);
    description = description.slice(0, m.index).trim();
  }
  return { date, description, amount, cardLast4: null, holder: null, installmentNo, installmentTotal, bankCategory: null, city: null, international: false };
};

/**
 * OFX (extrato de conta ou de cartão). Em cartão, débitos vêm negativos;
 * convertemos para "gasto positivo".
 */
export function parseOFX(text: string): ParsedStatement {
  const st = emptyStatement((text.match(/<ORG>([^<\r\n]+)/)?.[1] ?? "OFX").trim());
  const isCard = /<CCSTMTRS>|<CREDITCARDMSGSRSV1>/i.test(text);
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const b of blocks) {
    const get = (tag: string) => b.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"))?.[1]?.trim() ?? "";
    const d = get("DTPOSTED");
    const amt = Number(get("TRNAMT").replace(",", "."));
    const desc = get("MEMO") || get("NAME") || "Lançamento";
    if (!d || !isFinite(amt)) continue;
    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    // Em OFX, saída de dinheiro é negativa. Gasto = positivo no nosso modelo.
    st.transactions.push(tx(date, desc, Math.round(-amt * 100) / 100));
  }
  const acct = text.match(/<ACCTID>([^<\r\n]+)/)?.[1]?.trim();
  if (acct) {
    const last4 = acct.replace(/\D/g, "").slice(-4) || null;
    st.transactions.forEach((t) => (t.cardLast4 = last4));
  }
  if (!isCard) st.warnings.push("Extrato de conta: valores positivos são saídas e negativos são entradas. Revise o tipo de cada lançamento.");
  return st;
}

/** Divide uma linha CSV respeitando aspas. */
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === sep && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseDateFlexible(s: string): string | null {
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (m) return `20${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function parseAmountFlexible(s: string): number | null {
  let t = s.replace(/R\$\s?/i, "").replace(/\s/g, "");
  if (!t) return null;
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = Number(t);
  return isFinite(n) ? n : null;
}

/**
 * CSV genérico: procura colunas de data, descrição e valor pelo cabeçalho
 * (data/date, descrição/lançamento/histórico/title, valor/amount).
 */
export function parseCSV(text: string): ParsedStatement {
  const st = emptyStatement("CSV");
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) { st.warnings.push("Arquivo vazio."); return st; }
  const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = splitCsvLine(lines[0], sep).map((h) => h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
  const find = (re: RegExp) => header.findIndex((h) => re.test(h));
  const iDate = find(/^(data|date)/);
  const iDesc = find(/(descri|lancamento|historico|estabelecimento|title|memo)/);
  const iAmt = find(/(valor|amount|value)/);
  if (iDate < 0 || iDesc < 0 || iAmt < 0) {
    st.warnings.push("Não encontrei as colunas de data, descrição e valor no cabeçalho do CSV.");
    return st;
  }
  // Nubank exporta gastos positivos; extratos bancários costumam exportar saídas negativas.
  const rows = lines.slice(1).map((l) => splitCsvLine(l, sep));
  const amounts = rows.map((r) => parseAmountFlexible(r[iAmt] ?? "")).filter((n): n is number => n !== null);
  const negatives = amounts.filter((n) => n < 0).length;
  const flip = negatives > amounts.length / 2;
  for (const r of rows) {
    const date = parseDateFlexible(r[iDate] ?? "");
    const amount = parseAmountFlexible(r[iAmt] ?? "");
    if (!date || amount === null) continue;
    st.transactions.push(tx(date, r[iDesc] || "Lançamento", Math.round((flip ? -amount : amount) * 100) / 100));
  }
  return st;
}
