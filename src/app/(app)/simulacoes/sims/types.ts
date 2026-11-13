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
  sobra: number; despesas: number; // média mensal recente (critério de caixa)
  tesouro: { pre: number | null; ipca: number | null }; // % a.a. (IPCA+: taxa real)
  goals: { id: string; name: string; type: string; target: number; deadline: string | null; balance: number }[];
  carteira: Record<string, number>; // R$ por classe do simulador (pos, lci, ipca, pre, acoes, fii, exterior, cripto)
  hoje: string; // ciclo atual (AAAA-MM)
}
