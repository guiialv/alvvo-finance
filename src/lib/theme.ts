/** Cor de cada perfil de gasto — a mesma em todas as telas. */
export const GROUP_COLOR: Record<string, string> = {
  Receitas: "#15803d", Investimentos: "#0369a1", Fixas: "#4f46e5", "Variáveis": "#0d9488", Extras: "#d97706",
  Adicionais: "#c026d3", "A classificar": "#ea580c", "Receitas PJ": "#15803d", Impostos: "#e11d48", "Custos PJ": "#475569", Retiradas: "#0284c7",
};
const PALETTE = ["#4f46e5", "#0d9488", "#d97706", "#c026d3", "#0284c7", "#65a30d", "#db2777", "#7c3aed", "#ea580c", "#0891b2", "#be123c", "#475569"];
/** Cor do grupo: a cor escolhida pelo usuário, a padrão, ou uma cor estável derivada do nome. */
export const groupColor = (g: string | null | undefined, custom?: string | null) =>
  custom || (g ? GROUP_COLOR[g] ?? PALETTE[[...g].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % PALETTE.length] : "#64748b");
export const MEMBER_COLORS = ["#0f766e", "#c026d3", "#0369a1", "#d97706"];
export const AGENDA_COLOR = { cartao: "#ec7000", conta: "#e11d48", receita: "#15803d" } as const;
