/** Áreas, papéis e níveis de acesso — compartilhado entre servidor e cliente. */
export const AREAS = [
  ["visao-geral", "Visão geral", "/"],
  ["insights", "Insights", "/insights"],
  ["agenda", "Agenda", "/agenda"],
  ["orcamento", "Orçamento", "/orcamento"],
  ["lancamentos", "Lançamentos", "/lancamentos"],
  ["faturas", "Faturas do cartão", "/faturas"],
  ["parcelamentos", "Parcelamentos", "/parcelamentos"],
  ["pj", "PJ", "/pj"],
  ["investimentos", "Investimentos", "/investimentos"],
  ["objetivos", "Objetivos", "/objetivos"],
  ["analise", "Análise", "/analise"],
] as const;
export type Area = (typeof AREAS)[number][0];
export const AREA_KEYS = AREAS.map((a) => a[0]) as Area[];
export type Level = "nada" | "ver" | "editar";
export type Role = "dono" | "admin" | "membro" | "leitura";
export type TxScope = "todos" | "proprios";

export const ROLE_LABEL: Record<Role, string> = { dono: "Dono", admin: "Administrador", membro: "Membro", leitura: "Só leitura" };
export const LEVEL_LABEL: Record<Level, string> = { nada: "Sem acesso", ver: "Ver", editar: "Ver e editar" };

/** Áreas padrão por papel (espelha public.role_areas no banco). */
export function roleAreas(role: Role): Record<Area, Level> {
  const all = (l: Level) => Object.fromEntries(AREA_KEYS.map((k) => [k, l])) as Record<Area, Level>;
  if (role === "dono" || role === "admin") return all("editar");
  if (role === "membro") return { ...all("editar"), pj: "nada", investimentos: "nada", analise: "nada" };
  return { ...all("ver"), pj: "nada" };
}
export const areaOfPath = (path: string): Area | null => {
  const hit = [...AREAS].sort((a, b) => b[2].length - a[2].length).find(([, , href]) => (href === "/" ? path === "/" : path.startsWith(href)));
  return hit ? hit[0] : null;
};
