/** Cor de cada perfil de gasto — a mesma em todas as telas. */
export const GROUP_COLOR: Record<string, string> = {
  Receitas: "#5f7f5c", Investimentos: "#a8834f", Fixas: "#4a5a73", "Variáveis": "#8b6b4a", Extras: "#b0703f",
  Adicionais: "#7b5c7e", "A classificar": "#c08a3e", "Transferências": "#8c8579", "Receitas PJ": "#5f7f5c", Impostos: "#9a3b32", "Custos PJ": "#6b6459", Retiradas: "#4a6a78",
};
const PALETTE = ["#4a5a73", "#8b6b4a", "#7b5c7e", "#5f7f5c", "#a8834f", "#b0703f", "#4a6a78", "#9a3b32", "#6b6459", "#8a7a52", "#5d6b4f", "#7a4f45"];
/** Cor do grupo: a cor escolhida pelo usuário, a padrão, ou uma cor estável derivada do nome. */
export const groupColor = (g: string | null | undefined, custom?: string | null) =>
  custom || (g ? GROUP_COLOR[g] ?? PALETTE[[...g].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % PALETTE.length] : "#8c8579");
export const MEMBER_COLORS = ["#7d5f36", "#7b5c7e", "#4a5a73", "#5f7f5c"];
export const AGENDA_COLOR = { cartao: "#b0703f", conta: "#9a3b32", receita: "#4f7a52" } as const;
