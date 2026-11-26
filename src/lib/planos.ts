/**
 * Planos do Alvvo Finance: Free, Premium e Família (o plano é da família/conta).
 * Este arquivo é a única fonte da divisão: tabela comparativa, selos no menu e nas ferramentas.
 * Durante o beta, quem entrou com código tem tudo liberado (plano Família), com os recursos pagos sinalizados.
 */
import type { Household } from "@/lib/context";

export type Plano = "free" | "premium" | "familia";
export const NOME_PLANO: Record<Plano, string> = { free: "Free", premium: "Premium", familia: "Família" };

/** Valores de referência para o lançamento (vitrine; nada é cobrado durante o beta). */
export const PRECO = { premium: { mensal: 19.9, anual: 179.9 }, familia: { mensal: 29.9, anual: 269.9 } } as const;

/** Plano em vigor (vencido = Free). */
export function planoAtual(h: Pick<Household, "plan" | "plan_until">): Plano {
  const p = (h.plan ?? "free") as Plano;
  if (p !== "free" && h.plan_until && Date.parse(h.plan_until) < Date.now()) return "free";
  return p;
}
export const temPremium = (p: Plano) => p !== "free";

/** Telas cujo uso completo é do Premium (ou do Família). */
export const ROTAS_PLANO: Record<string, Exclude<Plano, "free">> = {
  "/fluxo": "premium",
  "/insights": "premium",
  "/conexoes": "premium",
  "/analise": "premium",
  "/mercado/carteiras": "premium",
  "/pj": "premium",
  "/acessos": "familia",
};
/** Simulações: no Free ficam "Meta e prazo" e o "Posso comprar?" (com limite mensal). */
export const SIM_FREE = new Set(["meta", "posso-comprar"]);
export const planoDaRota = (href: string): Exclude<Plano, "free"> | null => {
  if (ROTAS_PLANO[href]) return ROTAS_PLANO[href];
  const m = href.match(/^\/simulacoes\/([^/?#]+)/);
  return m && !SIM_FREE.has(m[1]) ? "premium" : null;
};

/** [recurso, Free, Premium, Família] — true = incluído, false = não incluído, texto = limite. */
export const TABELA: [string, boolean | string, boolean | string, boolean | string][] = [
  ["Início com resumo do mês, pulso, próximos 7 dias e pendências", true, true, true],
  ["Lançamentos, categorias e regras de classificação", true, true, true],
  ["Orçamento por categoria e agenda de contas", true, true, true],
  ["Leitura de faturas e extratos em PDF por IA", "2 por mês", "Ilimitada", "Ilimitada"],
  ["Parcelamentos e conta corrente", true, true, true],
  ["Carteira de investimentos com cotações", true, true, true],
  ["Mercado: bolsas do mundo, câmbio, cripto e commodities", true, true, true],
  ["Objetivos com foto", "Até 2", "Ilimitados", "Ilimitados"],
  ["Notícias para você", "3 por dia", "Seleção completa", "Seleção completa"],
  ["Posso comprar?", "2 análises por mês", "Ilimitado", "Ilimitado"],
  ["Simulações (aporte, carteira, financiar ou alugar, captar recursos)", "Meta e prazo", true, true],
  ["Fluxo do dinheiro e insights automáticos", false, true, true],
  ["Open Finance: contas e cartões direto do banco", false, true, true],
  ["Análise técnica e fundamentalista e carteiras de avaliação", false, true, true],
  ["Finanças PJ: distribuição de lucros e notas", false, true, true],
  ["Pessoas na conta", "Só você", "Você e mais 1 em leitura", "Até 5, com permissões por área"],
  ["Visão por pessoa: cada membro vê os próprios lançamentos", false, false, true],
];

export const DESTAQUES: Record<Exclude<Plano, "free">, string[]> = {
  premium: ["Tudo do Free", "Leitura de PDFs por IA sem limite", "Open Finance", "Fluxo do dinheiro e insights", "Todas as simulações e o Posso comprar? ilimitado", "Análise técnica e fundamentalista", "Finanças PJ"],
  familia: ["Tudo do Premium", "Até 5 pessoas na mesma conta", "Permissões por área para cada pessoa", "Visão individual dos lançamentos"],
};
export const DESTAQUES_FREE = ["Início, lançamentos, orçamento e agenda", "Carteira de investimentos e mercado", "2 leituras de PDF por IA por mês", "Até 2 objetivos com foto", "Notícias e Posso comprar? com limite"];
