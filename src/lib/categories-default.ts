/**
 * Categorias padrão, espelhando a "Planilha de Orçamento Familiar" (Guilherme & Maína).
 * Visão Pessoal: Receitas, Investimentos, Fixas, Variáveis, Extras, Adicionais.
 * Visão PJ: Receitas PJ, Impostos, Custos PJ, Retiradas.
 */

export type Scope = "pessoal" | "pj";
export type Kind = "receita" | "despesa" | "investimento" | "transferencia";

export interface DefaultCategory {
  scope: Scope;
  kind: Kind;
  grp: string;
  subgroup: string;
  name: string;
  excluded_from_totals?: boolean;
}

export const UNCATEGORIZED = { scope: "pessoal", kind: "despesa", grp: "A classificar", subgroup: "", name: "A classificar" } as const;

export const GROUP_ORDER: Record<Scope, string[]> = {
  pessoal: ["Receitas", "Investimentos", "Fixas", "Variáveis", "Extras", "Adicionais", "Transferências", "A classificar"],
  pj: ["Receitas PJ", "Impostos", "Custos PJ", "Retiradas"],
};

export const GROUP_HINT: Record<string, string> = {
  Fixas: "Mesmo valor todo mês",
  "Variáveis": "Todo mês, mas dá para reduzir",
  Extras: "Extraordinárias — esteja preparado",
  Adicionais: "Não precisam acontecer todo mês",
  "Transferências": "Pagamento de fatura, PIX no crédito, empréstimos e transferências entre suas contas — não entram nos totais",
};

type Def = [grp: string, subgroup: string, names: string[], kind?: Kind, excluded?: boolean];

const PESSOAL: Def[] = [
  ["Receitas", "", ["Salário / Retirada PJ", "Aluguel recebido", "Maína", "Bônus/Comissão/PLR", "13º salário", "Férias", "Outras receitas"], "receita"],
  ["Investimentos", "", ["Ações", "Tesouro Direto", "Renda fixa", "Previdência Privada", "Criptoativos", "Exterior", "Outros investimentos"], "investimento"],
  ["Fixas", "Habitação", ["Aluguel", "Condomínio", "Condomínio mãe", "Prestação da casa", "Seguro da casa", "Diarista", "Mensalista"]],
  ["Fixas", "Transporte", ["Prestação do carro", "Seguro do carro", "Estacionamento fixo"]],
  ["Fixas", "Saúde", ["Seguro saúde", "Plano de saúde"]],
  ["Fixas", "Educação", ["Colégio", "Faculdade", "Curso"]],
  ["Fixas", "Impostos", ["IPTU", "IPVA"]],
  ["Fixas", "Outros", ["Seguro de vida"]],
  ["Variáveis", "Habitação", ["Luz", "Água", "Banco", "Telefone Celular", "Gás", "TV+Internet", "Spotify", "Amazon Prime", "Netflix", "Meli+", "TV+Internet (Mãe)", "Apple", "Outras assinaturas"]],
  ["Variáveis", "Transporte", ["Metrô", "Uber", "Sem Parar", "Combustível", "Estacionamento"]],
  ["Variáveis", "Alimentação", ["Supermercado", "Conveniência", "Delivery (iFood)", "Cafés", "Feira", "Padaria"]],
  ["Variáveis", "Saúde", ["Farmácia"]],
  ["Variáveis", "Cuidados pessoais", ["Cabeleireiro", "Manicure", "Psicólogo", "Crossfit", "Outros cuidados"]],
  ["Extras", "Saúde", ["Médico", "Dentista", "Estética", "Bem-estar"]],
  ["Extras", "Manutenção/prevenção", ["Carro", "Apartamento", "Outras manutenções"]],
  ["Extras", "Educação", ["Material escolar", "Uniforme"]],
  ["Extras", "Reembolsáveis", ["Reembolsos Corporativo"], "despesa", true],
  ["Adicionais", "Lazer", ["Viagens", "Vinhos", "Cinema/teatro", "Restaurantes/bares", "Passeios/Eventos", "Apostas/Loterias", "Outros lazer"]],
  ["Adicionais", "Vestuário", ["Roupas", "Calçados", "Acessórios"]],
  ["Adicionais", "Outros", ["Presentes", "Casamento", "Compras diversas"]],
  ["Transferências", "", ["Pagamento de fatura", "PIX no crédito", "Empréstimos", "Entre contas próprias"], "transferencia"],
  ["A classificar", "", ["A classificar", "Fatura de cartão sem detalhe"]],
];

const PJ: Def[] = [
  ["Receitas PJ", "", ["Notas fiscais", "Outras receitas PJ"], "receita"],
  ["Impostos", "", ["Simples Nacional", "DARF INSS", "Taxas (CNPJ)"]],
  ["Custos PJ", "", ["Contabilizei", "Software e ferramentas", "Outros custos PJ"]],
  ["Retiradas", "", ["Pró-labore / Distribuição de lucros"], "transferencia"],
];

function expand(scope: Scope, defs: Def[]): DefaultCategory[] {
  return defs.flatMap(([grp, subgroup, names, kind = "despesa", excluded = false]) =>
    names.map((name) => ({ scope, kind, grp, subgroup, name, excluded_from_totals: excluded })),
  );
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [...expand("pessoal", PESSOAL), ...expand("pj", PJ)];

export const categoryKey = (c: { scope: string; grp: string; subgroup: string | null; name: string }) =>
  `${c.scope}|${c.grp}|${c.subgroup ?? ""}|${c.name}`;

export type Template = "familia" | "individual" | "autonomo";
/** Categorias iniciais de cada modelo de conta (o usuário edita depois). */
export function templateCategories(t: Template): DefaultCategory[] {
  return t === "individual" ? DEFAULT_CATEGORIES.filter((c) => c.scope === "pessoal") : DEFAULT_CATEGORIES;
}
