import type { CreditRates } from "@/lib/sim/credit-rates";

/** O que o servidor entrega a todos os simuladores: mercado de hoje + a situação da família. */
export interface SimData {
  cdi: number; selic: number; // % a.a.
  focus: { ipca: Record<string, number>; selic: Record<string, number> };
  ipca: number; // fração, próximos 12 meses (Focus)
  cdiNet: number; // fração, CDI líquido de IR (15%)
  patrimonio: number; renda: number; aporte: number; // R$ (renda e aporte: média mensal recente)
  credit: CreditRates;
  reference: { key: string; label: string; monthly: number; note: string; requires: string }[];
}
