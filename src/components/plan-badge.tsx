import type { Plano } from "@/lib/planos";

const STAR = <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[0.95em] w-[0.95em]"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor" /></svg>;

/** Selo de recurso pago (Premium ou Família). `tom="escuro"` para fundos escuros (menu lateral). */
export function PlanBadge({ plano = "premium", tom = "claro", so = false }: { plano?: Exclude<Plano, "free">; tom?: "claro" | "escuro"; so?: boolean }) {
  const cls = tom === "escuro" ? "bg-gold/15 text-gold" : "bg-[linear-gradient(135deg,#f6dfb0,#e8c88a)] text-[#6b4a12]";
  if (so) return <span title={plano === "familia" ? "Recurso do plano Família" : "Recurso Premium"} className={`inline-grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] ${cls}`}>{STAR}</span>;
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${cls}`}>{STAR}{plano === "familia" ? "Família" : "Premium"}</span>;
}
