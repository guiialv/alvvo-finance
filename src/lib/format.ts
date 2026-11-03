const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const formatBRL = (v: number | null | undefined) => brl.format(Number(v ?? 0));
export const formatNumber = (v: number | null | undefined) => num.format(Number(v ?? 0));
export const formatPct = (v: number | null | undefined) => (v === null || v === undefined || !isFinite(v) ? "—" : pct.format(v));

export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Aceita "1.234,56", "1234,56", "1234.56" ou "-12,30" */
export function parseMoneyInput(s: string | null | undefined): number | null {
  if (s === null || s === undefined) return null;
  let t = String(s).trim().replace(/R\$\s?/i, "").replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
