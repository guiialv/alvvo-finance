import { askClaude, parseJson } from "@/lib/ai";
import type { ParsedStatement } from "@/lib/faturas";

/** Lê a fatura em PDF de qualquer banco com IA. Com `text`, envia o texto já extraído (PDFs com senha). */
export async function aiReadStatement(apiKey: string, pdf: Uint8Array, fileName: string, text?: string): Promise<ParsedStatement> {
  const out = await askClaude(apiKey, {
    system: "Você extrai lançamentos de faturas de cartão de crédito brasileiras com precisão. Responda só com JSON válido.",
    content: [
      ...(text ? [] : [{ type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: Buffer.from(pdf).toString("base64") } }]),
      { type: "text", text: `${text ? `Texto extraído da fatura (linhas na ordem da página):\n${text.slice(0, 180000)}\n\n` : ""}Arquivo: ${fileName}. Extraia a fatura no formato:
{"bank":"Nome do banco","holder":"titular ou null","dueDate":"AAAA-MM-DD ou null","closingDate":"AAAA-MM-DD ou null","statementTotal":1234.56,
 "transactions":[{"date":"AAAA-MM-DD","description":"texto do lançamento","amount":12.34,"cardLast4":"1234 ou null","installmentNo":2,"installmentTotal":10,"bankCategory":"categoria do banco ou null","city":"cidade ou null","international":false}],
 "futureInstallments":[{"date":"AAAA-MM-DD","description":"...","amount":12.34}]}
Regras: amount positivo para gastos e negativo para estornos/créditos; NÃO inclua pagamentos da fatura anterior, saldo anterior, juros/encargos de resumo nem totais; inclua tarifas e IOF como lançamentos; parcelas "02/10" viram installmentNo 2 e installmentTotal 10; datas sem ano usam o ano da fatura (dezembro em fatura de janeiro é do ano anterior).` },
    ],
    maxTokens: 16000,
  });
  const j = parseJson<Partial<ParsedStatement> & { transactions?: ParsedStatement["transactions"] }>(out);
  const tx = (j.transactions ?? []).map((t) => ({ ...t, amount: Number(t.amount), cardLast4: t.cardLast4 ? String(t.cardLast4).slice(-4) : null, holder: null, installmentNo: t.installmentNo ?? null, installmentTotal: t.installmentTotal ?? null, bankCategory: t.bankCategory ?? null, city: t.city ?? null, international: !!t.international }));
  const sum = Math.round(tx.reduce((a, t) => a + t.amount, 0) * 100) / 100;
  const warnings = ["Lida com IA: confira os valores antes de importar."];
  if (j.statementTotal && Math.abs(sum - Number(j.statementTotal)) > 1) warnings.push(`A soma dos lançamentos (R$ ${sum.toFixed(2)}) difere do total da fatura (R$ ${Number(j.statementTotal).toFixed(2)}).`);
  return {
    bank: j.bank ?? "Outro banco", holder: j.holder ?? null, dueDate: j.dueDate ?? null, closingDate: j.closingDate ?? null, statementTotal: j.statementTotal ?? null,
    transactions: tx, cardTotals: {}, futureInstallments: j.futureInstallments ?? [], warnings,
  };
}

/** Sugere categoria para lançamentos que as regras não reconheceram. Devolve índice → id da categoria. */
export async function aiCategorize(apiKey: string, items: { idx: number; description: string; amount: number; bankCategory: string | null }[], cats: { id: string; label: string }[]): Promise<Record<number, string>> {
  if (!items.length) return {};
  const out = await askClaude(apiKey, {
    system: "Você classifica gastos pessoais brasileiros em categorias de orçamento. Responda só com JSON.",
    content: [{ type: "text", text: `Categorias (id: nome):\n${cats.map((c) => `${c.id}: ${c.label}`).join("\n")}\n\nLançamentos:\n${items.map((i) => `${i.idx}. ${i.description} | R$ ${i.amount.toFixed(2)}${i.bankCategory ? ` | banco: ${i.bankCategory}` : ""}`).join("\n")}\n\nResponda {"n": "id_da_categoria"} para cada número. Se não tiver segurança razoável, omita o item.` }],
    maxTokens: 4000, model: process.env.AI_MODEL_FAST ?? "claude-haiku-5-5",
  });
  const j = parseJson<Record<string, string>>(out), valid = new Set(cats.map((c) => c.id));
  return Object.fromEntries(Object.entries(j).filter(([, v]) => valid.has(v)).map(([k, v]) => [Number(k), v]));
}

/** Resumo do ciclo em linguagem simples, a partir dos números já calculados. */
export async function aiCycleSummary(apiKey: string, facts: string): Promise<string> {
  return askClaude(apiKey, {
    system: "Você é um assistente de finanças pessoais. Escreva em português do Brasil, direto e útil, sem jargão e sem recomendar produtos específicos.",
    content: [{ type: "text", text: `Com base nestes números do ciclo, escreva um resumo de 4 a 6 frases curtas: como foi o mês, o que mais pesou, o que mudou em relação ao ciclo anterior e uma sugestão prática. Não invente números.\n\n${facts}` }],
    maxTokens: 800, model: process.env.AI_MODEL_FAST ?? "claude-haiku-5-5",
  });
}
