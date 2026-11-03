import { isItauStatement, parseItauStatement } from "./itau";
import { parseCSV, parseOFX } from "./ofx-csv";
import type { ParsedStatement, PdfPage } from "./types";

export type { ParsedStatement, ParsedCardTransaction } from "./types";

/** Extrai itens de texto com posição de um PDF (roda no servidor). */
export async function pdfToPages(data: Uint8Array): Promise<PdfPage[]> {
  const { getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(data);
  const pages: PdfPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = (tc.items as Array<{ str?: string; transform?: number[]; width?: number }>)
      .filter((it) => typeof it.str === "string" && Array.isArray(it.transform))
      .map((it) => ({ str: it.str as string, x: it.transform![4], y: it.transform![5], w: it.width ?? 0 }));
    pages.push({ width: vp.width, height: vp.height, items });
  }
  return pages;
}

export async function parseStatementFile(fileName: string, bytes: Uint8Array): Promise<ParsedStatement> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".ofx") || lower.endsWith(".qfx")) {
    return parseOFX(new TextDecoder("latin1").decode(bytes));
  }
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    let text = new TextDecoder("utf-8").decode(bytes);
    if (text.includes("�")) text = new TextDecoder("latin1").decode(bytes);
    return parseCSV(text);
  }
  if (lower.endsWith(".pdf")) {
    const pages = await pdfToPages(bytes);
    if (isItauStatement(pages)) return parseItauStatement(pages);
    return {
      bank: "Desconhecido", holder: null, dueDate: null, closingDate: null, statementTotal: null,
      transactions: [], cardTotals: {}, futureInstallments: [],
      warnings: ["Layout de PDF não reconhecido sem IA."],
    };
  }
  throw new Error("Formato não suportado. Envie PDF, CSV ou OFX.");
}
