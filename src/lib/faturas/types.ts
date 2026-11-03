/** Item de texto extraído de um PDF (independente da biblioteca usada). */
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  w: number;
}

export interface PdfPage {
  width: number;
  height: number;
  items: PdfTextItem[];
}

/** Lançamento lido de uma fatura, antes de ser categorizado e salvo. */
export interface ParsedCardTransaction {
  /** Data da compra no formato AAAA-MM-DD */
  date: string;
  description: string;
  /** Valor em R$. Positivo = gasto; negativo = estorno/crédito */
  amount: number;
  cardLast4: string | null;
  holder: string | null;
  installmentNo: number | null;
  installmentTotal: number | null;
  /** Categoria informada pelo banco (ex.: "ALIMENTAÇÃO") */
  bankCategory: string | null;
  city: string | null;
  international: boolean;
  /** Valor na moeda original, quando internacional */
  foreignAmount?: number | null;
  foreignCurrency?: string | null;
  fxRate?: number | null;
}

export interface ParsedStatement {
  bank: string;
  holder: string | null;
  dueDate: string | null; // AAAA-MM-DD
  closingDate: string | null;
  statementTotal: number | null;
  transactions: ParsedCardTransaction[];
  /** Totais por cartão informados pelo banco, para conferência */
  cardTotals: Record<string, number>;
  /** Parcelas futuras já comprometidas (próximas faturas) */
  futureInstallments: { date: string; description: string; amount: number }[];
  warnings: string[];
}
