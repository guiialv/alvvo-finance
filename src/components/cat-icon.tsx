import { groupColor } from "@/lib/theme";

/** Ícone de categoria (emoji por palavra-chave) num quadrado com o tom do grupo — deixa as listas fáceis de ler. */
const RULES: [RegExp, string][] = [
  [/aluguel|moradia|condom|iptu|casa|apartamento|reforma/i, "🏠"], [/luz|energia|eletro/i, "💡"], [/água|agua|sabesp/i, "💧"], [/gás|gas\b|comgas/i, "🔥"],
  [/internet|tv|telefone|celular|claro|vivo|tim\b/i, "📶"], [/mercado|supermerc|feira|hortifruti|padaria/i, "🛒"], [/restaurante|lanche|ifood|delivery|bar\b|café|cafe/i, "🍽️"],
  [/academia|crossfit|esporte|totalpass|fitness/i, "🏋️"], [/saúde|saude|médic|medic|farmác|farmac|drogar|plano de saúde|unimed|dentista|terapia/i, "🩺"],
  [/escola|faculdade|curso|educa|livro/i, "🎓"], [/carro|combust|posto|gasolina|uber|99|transporte|estacion|pedágio|sem parar|ipva|seguro auto/i, "🚗"],
  [/viage|hotel|passage|milhas|airbnb/i, "✈️"], [/assinatura|netflix|spotify|streaming|apple|google|amazon prime|disney/i, "🎬"],
  [/roupa|vestu|calçad|moda|beleza|cabelo|salão/i, "👗"], [/pet|veterin|ração/i, "🐾"], [/filho|criança|bebê|brinquedo/i, "🧸"], [/presente|doaç|dizimo|dízimo/i, "🎁"],
  [/imposto|irpf|das\b|inss|taxa/i, "🧾"], [/banco|tarifa|juros|iof|financeir|anuidade|seguro/i, "🏦"], [/fatura|cartão|cartao/i, "💳"],
  [/salário|salario|pró-labore|retirada|bônus|bonus|13º|férias|plr|comiss/i, "💼"], [/aluguel recebido|renda extra|freela|receita/i, "💰"],
  [/invest|ação|ações|fii|tesouro|cdb|reserva|previd|cripto/i, "📈"], [/empréstimo|emprestimo|financiamento|crediário/i, "🔁"], [/pix|transfer/i, "↔️"],
  [/lazer|cinema|show|festa|entretenimento|jogo/i, "🎉"], [/casa|móve|decora|utensíl/i, "🛋️"], [/a classificar/i, "❔"],
];
export function catEmoji(name: string, grp?: string | null) {
  for (const [re, e] of RULES) if (re.test(name)) return e;
  if (grp) for (const [re, e] of RULES) if (re.test(grp)) return e;
  return "•";
}

export function CatIcon({ name, grp, color, size = "h-9 w-9 text-[17px]" }: { name: string; grp?: string | null; color?: string | null; size?: string }) {
  const c = groupColor(grp ?? name, color);
  return <span className={`grid shrink-0 place-items-center rounded-xl ${size}`} style={{ background: `${c}1f` }} aria-hidden>{catEmoji(name, grp)}</span>;
}
