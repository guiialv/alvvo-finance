export interface SimInfo { slug: string; name: string; q: string; uses: string }
export const GROUPS: { title: string; desc: string; dark?: boolean; items: SimInfo[] }[] = [
  { title: "Investir", desc: "Quanto, por quanto tempo e onde o dinheiro rende mais — líquido de IR e custos.", items: [
    { slug: "meta", name: "Meta e prazo", q: "Em quanto tempo chego a R$ X? Quanto aportar? Quanto terei?", uses: "Usa: seu patrimônio · aportes do orçamento · CDI e IPCA" },
    { slug: "investimentos", name: "Comparador de investimentos", q: "CDB, LCI, Tesouro, poupança, bolsa — qual rende mais no meu prazo?", uses: "Usa: curva do Focus · taxas do Tesouro" },
  ] },
  { title: "Decidir uma compra", desc: "O custo real de cada caminho, incluindo o que o dinheiro deixaria de render.", items: [
    { slug: "alugar-ou-comprar", name: "Alugar × comprar", q: "À vista ou financiado, com custos, valorização e o aluguel reajustado.", uses: "Usa: juros imobiliários (BC) · CDI · IPCA" },
    { slug: "financiar-ou-consorcio", name: "Financiar × consórcio × juntar", q: "Qual sai mais barato e quando eu tenho o bem?", uses: "Usa: juros de veículos (BC) · CDI · IPCA" },
  ] },
  { title: "Captar recursos", dark: true, desc: "Pegar dinheiro com critério: onde é mais barato e se o destino paga a dívida.", items: [
    { slug: "captacao", name: "Comparador de captação", q: "Preciso de R$ X: qual modalidade e qual banco cobram menos? PF e PJ.", uses: "Usa: juros por modalidade e banco (Banco Central) · suas garantias" },
    { slug: "alavancagem", name: "Vale a pena se alavancar?", q: "O retorno do que vou fazer com o dinheiro paga o custo da dívida?", uses: "Usa: custo da opção escolhida · retorno esperado do destino" },
  ] },
];
export const ALL = GROUPS.flatMap((g) => g.items);
