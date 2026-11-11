import { askClaude, parseJson } from "@/lib/ai";
import type { ParsedStatement } from "@/lib/faturas";

/** Lê a fatura em PDF de qualquer banco com IA. Com `text`, envia o texto já extraído (PDFs com senha). */
const NATURES = ["compra", "pagamento_fatura", "pix_credito", "emprestimo", "pagamento_emprestimo", "aplicacao_automatica", "transferencia_propria", "salario", "tarifa", "outro"] as const;

export async function aiReadStatement(apiKey: string, pdf: Uint8Array, fileName: string, text?: string): Promise<ParsedStatement> {
  const out = await askClaude(apiKey, {
    system: "Você extrai lançamentos de faturas de cartão de crédito e de extratos de conta corrente de bancos brasileiros com precisão. Responda só com JSON válido.",
    content: [
      ...(text ? [] : [{ type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: Buffer.from(pdf).toString("base64") } }]),
      { type: "text", text: `${text ? `Texto extraído do PDF (linhas na ordem da página):\n${text.slice(0, 180000)}\n\n` : ""}Arquivo: ${fileName}.

Primeiro identifique o documento: "fatura" (fatura de cartão de crédito: tem vencimento, total a pagar, compras com estabelecimento) ou "extrato" (extrato de conta corrente/poupança: tem saldo, entradas e saídas, PIX, TED, boletos, débitos automáticos).

Responda neste formato:
{"docType":"fatura|extrato","bank":"Nome do banco","holder":"titular ou null","accountRef":"agência/conta (extrato) ou null",
 "dueDate":"AAAA-MM-DD ou null","closingDate":"AAAA-MM-DD ou null","statementTotal":1234.56,
 "transactions":[{"date":"AAAA-MM-DD","description":"texto do lançamento","amount":12.34,"flow":"entrada|saida|null","nature":"...","cardLast4":"1234 ou null","installmentNo":2,"installmentTotal":10,"bankCategory":"categoria do banco ou null","city":"cidade ou null","international":false}],
 "currentTotal":1234.56,"cardTotals":{"1234":567.89},
 "futureInstallments":[{"date":"AAAA-MM-DD","description":"...","amount":12.34,"installmentNo":3,"installmentTotal":10}]}

Se for FATURA:
- amount positivo para gastos e negativo para estornos/créditos; flow = null.
- NÃO inclua o pagamento da fatura anterior, saldo anterior, juros/encargos de resumo nem totais; inclua tarifas, IOF, anuidade e juros lançados como itens.
- dueDate é o vencimento desta fatura (obrigatório se aparecer). statementTotal é o "total desta fatura"/"valor a pagar" (não o pagamento mínimo).
- Parcelas "02/10" viram installmentNo 2 e installmentTotal 10. Datas sem ano usam o ano da fatura (dezembro em fatura de janeiro é do ano anterior).
- CARTÕES: a fatura separa os lançamentos em blocos "NOME (final XXXX)". Todo lançamento recebe o cardLast4 do bloco em que está — inclusive quando o bloco continua em outra coluna ou página. Nunca deixe cardLast4 vazio se houver blocos.
- cardTotals: o valor de cada "Lançamentos no cartão (final XXXX)" (chave = os 4 dígitos). currentTotal: "Total dos lançamentos atuais".
- A fatura costuma ter duas colunas: leia cada coluna inteira de cima a baixo. Não misture a coluna de lançamentos com o painel da direita (total, compras parceladas, limites).
- futureInstallments: a lista "Compras parceladas - próximas faturas" (são parcelas futuras — NÃO inclua em transactions).

Se for EXTRATO:
- Uma linha por movimentação. amount SEMPRE positivo (valor absoluto) e flow = "entrada" (crédito, dinheiro que entrou) ou "saida" (débito, dinheiro que saiu). Use o sinal ou a coluna do banco (C/D, "-") para decidir — não deduza pelo texto.
- NÃO inclua linhas de saldo (SALDO DO DIA, SALDO ANTERIOR, SALDO TOTAL, S A L D O), limites, totais nem lançamentos futuros/agendados.
- nature, um destes: ${NATURES.join(", ")}.
  pagamento_fatura = pagamento de fatura de cartão de crédito (ex.: "PAGTO FATURA", "PAG CARTAO", "ITAU VISA", "FATURA CARTAO", "INT PAG CART"). NÃO confunda com "SEGURO CARTAO" (tarifa) nem "PIX CARTAO".
  pix_credito = PIX feito com o limite do cartão de crédito, que aparece como uma entrada ("CREDITO LIBERAD PIX", "PIX CRED LIBERADO") e uma saída do mesmo valor ("PIX CARTAO ...") — marque as duas linhas.
  emprestimo = dinheiro de empréstimo/crediário/financiamento que entrou. pagamento_emprestimo = quitação ou parcela de empréstimo.
  aplicacao_automatica = aplicação ou resgate automático (ex.: "APLIC AUT", "RES APLIC AUT", "REND PAGO APLIC").
  transferencia_propria = transferência entre contas do mesmo titular, quando o nome é claramente o do titular.
  salario = salário, pró-labore, retirada de empresa. tarifa = tarifas, juros, IOF, seguros do banco.
- dueDate, statementTotal e futureInstallments = null/[] para extrato.` },
    ],
    maxTokens: 16000,
  });
  const j = parseJson<Partial<ParsedStatement> & { transactions?: (ParsedStatement["transactions"][number] & { flow?: string | null })[] }>(out);
  const docType = j.docType === "extrato" ? "extrato" : "fatura";
  const tx = (j.transactions ?? []).map((t) => {
    const amount = Number(t.amount);
    const flow = docType === "extrato" ? (t.flow === "entrada" || t.flow === "saida" ? t.flow : amount < 0 ? "entrada" : "saida") : undefined;
    return {
      ...t, amount: docType === "extrato" ? Math.abs(amount) : amount, flow, nature: t.nature && (NATURES as readonly string[]).includes(t.nature) ? t.nature : null,
      cardLast4: docType === "fatura" && t.cardLast4 ? String(t.cardLast4).slice(-4) : null, holder: null, installmentNo: t.installmentNo ?? null, installmentTotal: t.installmentTotal ?? null,
      bankCategory: t.bankCategory ?? null, city: t.city ?? null, international: !!t.international,
    };
  });
  const sum = Math.round(tx.reduce((a, t) => a + t.amount, 0) * 100) / 100;
  const warnings = [docType === "extrato" ? "Extrato bancário lido com IA: confira entradas e saídas antes de importar." : "Lida com IA: confira os valores antes de importar."];
  if (docType === "fatura" && j.statementTotal && Math.abs(sum - Number(j.statementTotal)) > 1) warnings.push(`A soma dos lançamentos (R$ ${sum.toFixed(2)}) difere do total da fatura (R$ ${Number(j.statementTotal).toFixed(2)}).`);
  return {
    docType, accountRef: j.accountRef ?? null,
    bank: j.bank ?? "Outro banco", holder: j.holder ?? null, dueDate: docType === "fatura" ? j.dueDate ?? null : null, closingDate: j.closingDate ?? null,
    statementTotal: docType === "fatura" ? j.statementTotal ?? null : null,
    transactions: tx, cardTotals: docType === "fatura" && j.cardTotals && typeof j.cardTotals === "object" ? Object.fromEntries(Object.entries(j.cardTotals).map(([k, v]) => [String(k).slice(-4), Number(v)])) : {},
    currentTotal: docType === "fatura" && j.currentTotal != null ? Number(j.currentTotal) : null, futureInstallments: docType === "fatura" ? j.futureInstallments ?? [] : [], warnings,
  };
}

/** Sugere categoria para lançamentos que as regras não reconheceram. Devolve índice → id da categoria. */
export async function aiCategorize(apiKey: string, items: { idx: number; description: string; amount: number; bankCategory: string | null; flow?: "entrada" | "saida" }[], cats: { id: string; label: string }[]): Promise<Record<number, string>> {
  if (!items.length) return {};
  const out = await askClaude(apiKey, {
    system: "Você classifica gastos pessoais brasileiros em categorias de orçamento. Responda só com JSON.",
    content: [{ type: "text", text: `Categorias (id: nome):\n${cats.map((c) => `${c.id}: ${c.label}`).join("\n")}\n\nLançamentos:\n${items.map((i) => `${i.idx}. ${i.description} | R$ ${i.amount.toFixed(2)}${i.flow ? ` | ${i.flow === "entrada" ? "ENTRADA na conta" : "SAÍDA da conta"}` : ""}${i.bankCategory ? ` | banco: ${i.bankCategory}` : ""}`).join("\n")}\n\nEntradas na conta normalmente são receitas; saídas são despesas, investimentos ou transferências. Responda {"n": "id_da_categoria"} para cada número. Se não tiver segurança razoável, omita o item.` }],
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
