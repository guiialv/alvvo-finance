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
  /** Extratos: sentido do dinheiro na conta. Em extratos, amount é sempre positivo. */
  flow?: "entrada" | "saida";
  /** Extratos: natureza identificada (pagamento_fatura, pix_credito, emprestimo, aplicacao_automatica, ...) */
  nature?: string | null;
}

export interface ParsedStatement {
  /** "fatura" de cartão (padrão) ou "extrato" de conta corrente */
  docType?: "fatura" | "extrato";
  /** Extratos: agência/conta, quando aparecem */
  accountRef?: string | null;
  /** Cartão principal informado na fatura (identifica a linha do cartão) */
  mainCard?: { last4: string; bin?: string | null; product?: string | null } | null;
  bank: string;
  holder: string | null;
  dueDate: string | null; // AAAA-MM-DD
  closingDate: string | null;
  statementTotal: number | null;
  transactions: ParsedCardTransaction[];
  /** Totais por cartão informados pelo banco, para conferência */
  cardTotals: Record<string, number>;
  /** Parcelas futuras já comprometidas (próximas faturas) */
  futureInstallments: { date: string; description: string; amount: number; installmentNo?: number | null; installmentTotal?: number | null }[];
  /** "Total dos lançamentos atuais" (sem saldo anterior/pagamentos), quando a fatura informa */
  currentTotal?: number | null;
  warnings: string[];
}
