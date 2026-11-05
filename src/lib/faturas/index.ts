import { isItauStatement, parseItauStatement } from "./itau";
import { parseCSV, parseOFX } from "./ofx-csv";
import type { ParsedStatement, PdfPage } from "./types";
import { pageToLines } from "./pdf-lines";

export type { ParsedStatement, ParsedCardTransaction } from "./types";

/** Extrai itens de texto com posição de um PDF (roda no servidor). */
/** Erro de PDF protegido: code "SENHA_NECESSARIA" ou "SENHA_INCORRETA". */
export class PdfPasswordError extends Error { constructor(public code: "SENHA_NECESSARIA" | "SENHA_INCORRETA") { super(code === "SENHA_NECESSARIA" ? "Este PDF tem senha. Informe a senha para abrir." : "Senha do PDF incorreta."); } }

export async function pdfToPages(data: Uint8Array, password?: string): Promise<PdfPage[]> {
  const { getDocumentProxy } = await import("unpdf");
  let doc;
  try {
    doc = await getDocumentProxy(new Uint8Array(data), password ? { password } : undefined);
  } catch (e) {
    const err = e as { name?: string; code?: number; message?: string };
    if (err?.name === "PasswordException" || /password/i.test(err?.message ?? "")) throw new PdfPasswordError(err.code === 2 || (password && err.code !== 1) ? "SENHA_INCORRETA" : "SENHA_NECESSARIA");
    throw e;
  }
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

/** Texto do PDF linha a linha (para a leitura com IA de PDFs protegidos por senha). */
export const pagesToText = (pages: PdfPage[]) => pages.map((p, i) => `--- Página ${i + 1} ---\n` + pageToLines(p).join("\n")).join("\n\n");

export async function parseStatementFile(fileName: string, bytes: Uint8Array, password?: string): Promise<ParsedStatement & { pages?: PdfPage[] }> {
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
    const pages = await pdfToPages(bytes, password);
    if (isItauStatement(pages)) return parseItauStatement(pages);
    return { pages,
      bank: "Desconhecido", holder: null, dueDate: null, closingDate: null, statementTotal: null,
      transactions: [], cardTotals: {}, futureInstallments: [],
      warnings: ["Layout de PDF não reconhecido sem IA."],
    };
  }
  throw new Error("Formato não suportado. Envie PDF, CSV ou OFX.");
}
