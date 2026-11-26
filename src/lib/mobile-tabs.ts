/** Barra de baixo no celular (como no alvvo health): 4 abas escolhidas pela pessoa + Mais; o "+" de lançar fica no topo. */
export const TAB_MAX = 4;
export const TAB_DEFAULT = ["/", "/lancamentos", "/investimentos", "/mercado"];
/** Áreas que podem ir para a barra (as de configuração ficam no Mais). */
export const TAB_OPTIONS: [string, string, string][] = [
  ["/", "Início", "home"], ["/lancamentos", "Lançamentos", "list"], ["/orcamento", "Orçamento", "pie"], ["/agenda", "Agenda", "calendar"],
  ["/fluxo", "Fluxo", "flow"], ["/insights", "Insights", "spark"], ["/conta", "Conta", "bank"], ["/faturas", "Faturas", "card"],
  ["/parcelamentos", "Parcelas", "layers"], ["/pj", "PJ", "building"], ["/investimentos", "Investimentos", "trend"], ["/objetivos", "Objetivos", "target"],
  ["/simulacoes", "Simular", "sliders"], ["/noticias", "Notícias", "news"], ["/mercado", "Mercado", "globe2"], ["/analise", "Análise", "candle"],
];
/** Abas válidas para quem está vendo, completando com o padrão quando faltar. */
export function activeTabs(saved: unknown, allowed: string[]) {
  const ok = (h: string) => allowed.includes(h) && TAB_OPTIONS.some(([x]) => x === h);
  const list = (Array.isArray(saved) ? saved : []).filter((h): h is string => typeof h === "string" && ok(h)).slice(0, TAB_MAX);
  for (const h of [...TAB_DEFAULT, ...TAB_OPTIONS.map(([x]) => x)]) if (list.length < TAB_MAX && !list.includes(h) && ok(h)) list.push(h);
  return list;
}
