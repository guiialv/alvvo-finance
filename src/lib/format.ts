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

/** Valor na moeda do ativo (BRL, USD, EUR...). Sem moeda conhecida, só o número. */
export function formatMoney(v: number | null | undefined, currency?: string | null, digits?: number) {
  if (v === null || v === undefined || !isFinite(Number(v))) return "—";
  const d = digits ?? (Math.abs(Number(v)) < 1 ? 4 : 2);
  try {
    return currency ? new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v))
      : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v));
  } catch { return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v)); }
}

/** 1,2 tri / 350 bi / 12 mi */
export function formatCompact(v: number | null | undefined, currency?: string | null) {
  if (v === null || v === undefined || !isFinite(Number(v))) return "—";
  const a = Math.abs(Number(v)), sym = currency === "USD" ? "US$ " : currency === "BRL" ? "R$ " : "";
  const [div, suf] = a >= 1e12 ? [1e12, " tri"] : a >= 1e9 ? [1e9, " bi"] : a >= 1e6 ? [1e6, " mi"] : a >= 1e3 ? [1e3, " mil"] : [1, ""];
  return `${sym}${(Number(v) / div).toLocaleString("pt-BR", { maximumFractionDigits: a / div >= 100 ? 0 : 1 })}${suf}`;
}
