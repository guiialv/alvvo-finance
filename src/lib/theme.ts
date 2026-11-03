/** Cor de cada perfil de gasto — a mesma em todas as telas. */
export const GROUP_COLOR: Record<string, string> = {
  Receitas: "#15803d", Investimentos: "#0369a1", Fixas: "#4f46e5", "Variáveis": "#0d9488", Extras: "#d97706",
  Adicionais: "#c026d3", "A classificar": "#ea580c", "Receitas PJ": "#15803d", Impostos: "#e11d48", "Custos PJ": "#475569", Retiradas: "#0284c7",
};
export const groupColor = (g: string | null | undefined) => (g && GROUP_COLOR[g]) || "#64748b";
export const MEMBER_COLORS = ["#0f766e", "#c026d3", "#0369a1", "#d97706"];
export const AGENDA_COLOR = { cartao: "#ec7000", conta: "#e11d48", receita: "#15803d" } as const;
