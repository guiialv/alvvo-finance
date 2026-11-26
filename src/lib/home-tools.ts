/** Atalhos da página inicial: ferramentas de uso frequente, escolhidas (ou ocultadas) por pessoa. */
export interface HomeTool { key: string; href: string; title: string; desc: string; icon: string; need: string; bg: string }

export const HOME_TOOLS: HomeTool[] = [
  { key: "posso-comprar", href: "/simulacoes/posso-comprar", title: "Posso comprar?", desc: "Avalie uma compra antes de decidir", icon: "bag", need: "/simulacoes",
    bg: "radial-gradient(90% 90% at 100% 0%, #f3d9d1 0%, rgba(243,217,209,0) 60%), linear-gradient(150deg, #fcf4f1, #f1dcd3)" },
  { key: "investir", href: "/simulacoes/aporte", title: "Tenho um valor para investir", desc: "Sugestão de divisão do aporte", icon: "trend", need: "/simulacoes",
    bg: "radial-gradient(90% 90% at 100% 0%, #f6dfb0 0%, rgba(246,223,176,0) 60%), linear-gradient(150deg, #fcf6ea, #f1ddb4)" },
  { key: "lancar", href: "/lancamentos?novo=1", title: "Novo lançamento", desc: "Registre um gasto ou uma entrada", icon: "edit", need: "/lancamentos",
    bg: "radial-gradient(90% 90% at 100% 0%, #dfe8d6 0%, rgba(223,232,214,0) 60%), linear-gradient(150deg, #f6f8f2, #e3ebdb)" },
  { key: "importar", href: "/faturas/importar", title: "Importar fatura ou extrato", desc: "PDF do cartão ou da conta", icon: "upload", need: "/faturas",
    bg: "radial-gradient(90% 90% at 100% 0%, #dde3ea 0%, rgba(221,227,234,0) 60%), linear-gradient(150deg, #f6f7f9, #e2e7ed)" },
  { key: "meta", href: "/simulacoes/meta", title: "Meta e prazo", desc: "Quanto aportar para chegar lá", icon: "target", need: "/simulacoes",
    bg: "radial-gradient(90% 90% at 100% 0%, #eadbc4 0%, rgba(234,219,196,0) 60%), linear-gradient(150deg, #faf5ed, #eaddc8)" },
  { key: "agenda", href: "/agenda", title: "Contas a pagar", desc: "Vencimentos e recebimentos", icon: "calendar", need: "/agenda",
    bg: "radial-gradient(90% 90% at 100% 0%, #e8dde8 0%, rgba(232,221,232,0) 60%), linear-gradient(150deg, #faf7fa, #ebe1eb)" },
];
export const HOME_TOOLS_DEFAULT = ["posso-comprar", "investir", "lancar", "importar"];

/** `saved` vem das preferências da pessoa: lista escolhida, [] = ocultos, ausente = padrão. */
export function activeTools(saved: unknown, allowed: string[]): HomeTool[] {
  const keys = Array.isArray(saved) ? (saved as string[]) : HOME_TOOLS_DEFAULT;
  return keys.map((k) => HOME_TOOLS.find((t) => t.key === k)).filter((t): t is HomeTool => !!t && allowed.includes(t.need));
}
