import { parseBRL, squash } from "./pdf-lines";
import type { ParsedCardTransaction, ParsedStatement, PdfPage, PdfTextItem } from "./types";

/**
 * Extrato de conta corrente Itaú (PDF exportado do app/internet banking).
 * Colunas: Data · Lançamentos (tipo) · Descrição · Valor (R$) · Saldo (R$).
 * Linhas só com data + saldo são o saldo do fim do dia: usamos para conferir a leitura.
 */
export function isItauExtrato(pages: PdfPage[]): boolean {
  const sq = squash(pages.slice(0, 2).flatMap((p) => p.items.map((i) => i.str)).join(" "));
  return /Extratocontacorrente/i.test(sq) && /DataLançamentosDescriçãoValor\(R\$\)Saldo/i.test(sq);
}

type Rec = { date: string; tipo: string; desc: string; valor: number; future: boolean };

const iso = (d: string) => `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}`;
const MONEY = /^-?\d{1,3}(\.\d{3})*,\d{2}$/;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Natureza do lançamento pelo tipo informado pelo banco (e, quando preciso, pela descrição). */
export function extratoNature(tipo: string, desc: string, valor: number, holder: string | null): string {
  const t = norm(tipo), d = norm(desc), h = holder ? norm(holder) : "";
  if (/CREDITO LIBERADO PARA PIX/.test(t) || /PIX ENVIADO COM CARTAO/.test(t)) return "pix_credito";
  if (/PAGAMENTO DE FATURA/.test(t) || (/DEBITO AUTOMATICO/.test(t) && /FATURA|ITAU BLACK|INFINIT|UNICLASS|PERSON|BLACK|PLATINUM|GOLD|VISA|MASTER|\bMC\b|CARTAO/.test(d))) return "pagamento_fatura";
  if (/CREDIARIO|EMPRESTIMO|CREDITO PESSOAL/.test(d) && valor > 0) return "emprestimo";
  if (/LIQUIDA OPERACAO|CREDIARIO|EMPRESTIMO/.test(d) && valor < 0) return "pagamento_emprestimo";
  if (/APLIC(ACAO)? AUT|RES(GATE)? APLIC/.test(d)) return "aplicacao_automatica";
  if (valor < 0 && /IMPOSTO|SEGURO|JUROS|TARIFA|CAMBIO|IOF|ANUIDADE/.test(t + " " + d)) return "tarifa";
  // Para/de você mesmo (ou sem nome do remetente, como o banco mostra TED/PIX próprios)
  if (h && d.includes(h)) return "transferencia_propria";
  if (valor > 0 && /^(TED RECEBIDA|PIX RECEBIDO)$/.test(d.trim())) return "transferencia_propria";
  return valor > 0 ? "outro" : "compra";
}

export function parseItauExtrato(pages: PdfPage[]): ParsedStatement {
  const warnings: string[] = [];
  const first = pages.slice(0, 1).flatMap((p) => p.items.map((i) => i.str)).join("\n");
  const holder = first.split("\n").map((s) => s.trim()).find((s) => /^[A-ZÀ-Ü][A-ZÀ-Ü ]{4,}$/.test(s)) ?? null;
  const ag = first.match(/agência:\s*(\d+)\s*conta:\s*([\d-]+)/i);
  const accountRef = ag ? `ag. ${ag[1]} · c/c ${ag[2]}` : null;

  const recs: Rec[] = [];
  const balances: { date: string; saldo: number }[] = [];
  let section: "" | "tx" | "future" = "";
  let cols: { tipo: number; desc: number; valor: number; saldo: number } | null = null;
  let cur: Rec | null = null;

  for (const page of pages) {
    const items = page.items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: PdfTextItem[][] = [];
    for (const it of items) {
      const r = rows[rows.length - 1];
      if (r && Math.abs(r[0].y - it.y) <= 3) r.push(it); else rows.push([it]);
    }
    for (const row of rows) {
      row.sort((a, b) => a.x - b.x);
      const text = row.map((i) => i.str).join(" ").trim();
      const sq = squash(text);
      if (/^Lançamentosfuturos/i.test(sq)) { section = "future"; cur = null; continue; }
      if (/^Lançamentos$/i.test(sq)) { section = "tx"; cur = null; continue; }
      if (/^(Posiçãoconsolidada|Limites$|Aviso$)/i.test(sq)) { section = ""; cur = null; continue; }
      if (/^DataLançamentosDescrição/i.test(sq)) {
        const x = (re: RegExp) => row.find((i) => re.test(i.str))?.x;
        const tipo = x(/^Lançamentos/), desc = x(/^Descrição/), valor = x(/^Valor/), saldo = x(/^Saldo/);
        if (tipo != null && desc != null && valor != null && saldo != null) cols = { tipo, desc, valor, saldo };
        cur = null;
        continue;
      }
      if (!section || !cols) continue;
      const c = cols;
      const band = (a: number, b: number) => row.filter((i) => i.x >= a && i.x < b).map((i) => i.str.trim()).join(" ").trim();
      const dateIt = row.find((i) => i.x < c.tipo - 4 && /^\d{2}\/\d{2}\/\d{4}$/.test(i.str.trim()));
      const moneyIn = (a: number, b: number) => row.filter((i) => i.x >= a && i.x < b && MONEY.test(i.str.trim())).map((i) => i.str.trim())[0];
      const valor = moneyIn(c.valor - 40, c.saldo - 4);
      const saldo = moneyIn(c.saldo - 4, Infinity);
      const tipo = band(c.tipo - 4, c.desc - 4);
      const desc = band(c.desc - 4, c.valor - 40);
      if (dateIt) {
        if (!valor && saldo && !tipo) { balances.push({ date: iso(dateIt.str.trim()), saldo: parseBRL(saldo.replace("-", "")) * (saldo.startsWith("-") ? -1 : 1) }); cur = null; continue; }
        if (!valor) { cur = null; continue; }
        cur = { date: iso(dateIt.str.trim()), tipo, desc, valor: parseBRL(valor.replace("-", "")) * (valor.startsWith("-") ? -1 : 1), future: section === "future" };
        recs.push(cur);
      } else if (cur && !valor && !saldo) {
        if (tipo) cur.tipo += " " + tipo;
        if (desc) cur.desc += " " + desc;
      }
    }
  }

  const future = recs.filter((r) => r.future);
  const done = recs.filter((r) => !r.future);
  if (future.length) warnings.push(`${future.length} lançamento(s) futuro(s) agendado(s) não importado(s) — entram quando acontecerem (ex.: ${future[0].tipo} ${future[0].desc} em ${future[0].date.slice(8, 10)}/${future[0].date.slice(5, 7)}).`);

  // Conferência com o saldo de cada dia: saldo(dia) = saldo(dia anterior) + lançamentos do dia
  const bal = [...balances].sort((a, b) => a.date.localeCompare(b.date));
  const bad: string[] = [];
  for (let i = 1; i < bal.length; i++) {
    const sum = done.filter((r) => r.date > bal[i - 1].date && r.date <= bal[i].date).reduce((a, r) => a + r.valor, 0);
    const calc = bal[i - 1].saldo + sum;
    // Saldo negativo vem sem o sinal no texto do PDF (só na cor): aceitamos o valor com o sinal que fecha a conta
    if (Math.abs(calc - bal[i].saldo) <= 0.05) continue;
    if (Math.abs(calc + bal[i].saldo) <= 0.05) { bal[i].saldo = -bal[i].saldo; continue; }
    bad.push(`${bal[i].date.slice(8, 10)}/${bal[i].date.slice(5, 7)}`);
    bal[i].saldo = calc;
  }
  if (bad.length) warnings.push(`O saldo do dia não fecha em ${bad.length} data(s) (${bad.slice(0, 6).join(", ")}${bad.length > 6 ? "…" : ""}). Confira esses dias.`);
  else if (bal.length > 1) warnings.push(`Leitura conferida com o saldo de ${bal.length - 1} dias do extrato ✓`);

  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const transactions: ParsedCardTransaction[] = done.map((r) => {
    const tipo = clean(r.tipo), desc = clean(r.desc);
    const description = !desc || norm(desc) === norm(tipo) ? tipo : `${tipo} · ${desc}`;
    return {
      date: r.date, description, amount: Math.abs(r.valor), flow: r.valor > 0 ? "entrada" : "saida",
      nature: extratoNature(tipo, desc, r.valor, holder),
      cardLast4: null, holder, installmentNo: null, installmentTotal: null, bankCategory: tipo, city: null, international: false,
    };
  });

  return {
    docType: "extrato", accountRef, bank: "Itaú", holder, dueDate: null, closingDate: bal.length ? bal[bal.length - 1].date : null,
    statementTotal: null, transactions, cardTotals: {}, futureInstallments: [], warnings,
  };
}
