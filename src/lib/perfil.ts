/**
 * Perfil financeiro (pesquisa inicial): perguntas, opções e o que cada interesse significa
 * para a seleção de notícias. Compartilhado entre o questionário, o painel de administração e as notícias.
 */

export type QKind = "one" | "many" | "text";
export interface Pergunta { id: string; titulo: string; ajuda?: string; kind: QKind; opcoes?: [string, string][]; max?: number; opcional?: boolean }

export const PERGUNTAS: Pergunta[] = [
  { id: "momento", titulo: "Qual descreve melhor o seu momento de vida?", kind: "one", opcoes: [
    ["estudante", "Estudante"], ["inicio_carreira", "Início de carreira"], ["construindo", "Construindo a vida a dois"], ["filhos", "Família com filhos"],
    ["estabilidade", "Carreira estável, foco em patrimônio"], ["empreendedor", "Empreendedor ou autônomo"], ["pre_aposentadoria", "Preparando a aposentadoria"], ["aposentado", "Aposentado"],
  ] },
  { id: "financas", titulo: "Com quem você organiza as finanças?", kind: "one", opcoes: [["sozinho", "Sozinho(a)"], ["casal", "Em casal"], ["familia", "Em família"], ["empresa", "Pessoal e empresa (PJ)"]] },
  { id: "situacao", titulo: "Ao fim de um mês típico, como fica o seu orçamento?", kind: "one", opcoes: [["sobra", "Sobra dinheiro"], ["zero", "Fica equilibrado"], ["falta", "Costuma faltar"], ["varia", "Varia bastante de um mês para o outro"]] },
  { id: "objetivos", titulo: "Quais são os seus principais objetivos hoje?", ajuda: "Escolha até quatro.", kind: "many", max: 4, opcoes: [
    ["organizar", "Organizar os gastos"], ["dividas", "Quitar dívidas"], ["reserva", "Formar a reserva de emergência"], ["imovel", "Comprar um imóvel"],
    ["carro", "Comprar um carro"], ["viagem", "Viajar"], ["patrimonio", "Investir e aumentar o patrimônio"], ["independencia", "Independência financeira ou aposentadoria"],
    ["educacao", "Educação dos filhos"], ["empresa", "Investir no próprio negócio"],
  ] },
  { id: "experiencia", titulo: "Qual é a sua experiência com investimentos?", kind: "one", opcoes: [
    ["nenhuma", "Ainda não invisto"], ["iniciante", "Iniciante: poupança, CDB, Tesouro"], ["intermediario", "Intermediário: renda fixa, fundos e algumas ações"], ["avancado", "Avançado: ações, FIIs, exterior, derivativos"],
  ] },
  { id: "risco", titulo: "Como você se descreve diante do risco?", kind: "one", opcoes: [
    ["conservador", "Conservador: prefiro segurança, mesmo rendendo menos"], ["moderado", "Moderado: aceito alguma oscilação por mais retorno"], ["arrojado", "Arrojado: busco retorno e tolero oscilações maiores"],
  ] },
  { id: "classes", titulo: "Em quais investimentos você aplica ou tem interesse?", kind: "many", opcoes: [
    ["renda_fixa", "Renda fixa e Tesouro Direto"], ["acoes", "Ações no Brasil"], ["fiis", "Fundos imobiliários"], ["exterior", "Investimentos no exterior"],
    ["cripto", "Criptoativos"], ["previdencia", "Previdência privada"], ["dolar", "Dólar e câmbio"], ["commodities", "Ouro e commodities"],
  ] },
  { id: "setores", titulo: "Quais setores e temas você gostaria de acompanhar?", ajuda: "Usamos para selecionar as notícias do dia.", kind: "many", opcoes: [
    ["agro", "Agronegócio"], ["bancos", "Bancos e serviços financeiros"], ["petroleo", "Petróleo, gás e combustíveis"], ["mineracao", "Mineração e siderurgia"],
    ["eletricas", "Energia elétrica e saneamento"], ["varejo", "Varejo e consumo"], ["tecnologia", "Tecnologia e inteligência artificial"], ["imobiliario", "Construção e mercado imobiliário"],
    ["saude", "Saúde"], ["industria", "Indústria e infraestrutura"], ["economia", "Juros, inflação e economia"], ["global", "Mercados internacionais"],
  ] },
  { id: "destaques", titulo: "O que você gostaria de ver em destaque na plataforma?", kind: "many", opcoes: [
    ["gastos", "Gastos do dia a dia e orçamento"], ["faturas", "Faturas e cartões"], ["contas", "Contas a pagar e a receber"], ["investimentos", "Carteira de investimentos"],
    ["mercado", "Mercado e notícias"], ["objetivos", "Progresso dos objetivos"], ["simulacoes", "Simulações e decisões de compra"],
  ] },
  { id: "ativos", titulo: "Há empresas ou ativos que você acompanha de perto?", ajuda: "Opcional. Ex.: PETR4, VALE3, SLCE3, IVVB11.", kind: "text", opcional: true },
  { id: "comentario", titulo: "Gostaria de nos contar mais alguma coisa?", ajuda: "Opcional. O que espera do Alvvo Finance, o que mais importa para você.", kind: "text", opcional: true },
];

export type Respostas = Record<string, string | string[]>;
export const rotulo = (id: string, v: string) => PERGUNTAS.find((p) => p.id === id)?.opcoes?.find(([k]) => k === v)?.[1] ?? v;
export const tickersDe = (r: Respostas) => [...new Set(String(r.ativos ?? "").toUpperCase().match(/\b[A-Z]{4}\d{1,2}\b/g) ?? [])];

/** Interesses → palavras que identificam uma notícia como pertinente (texto sem acentos, minúsculo). */
export const INTERESSES: Record<string, { label: string; re: RegExp; w: number }> = {
  agro: { label: "Agronegócio", re: /\b(agro\w*|agricult\w*|agricola\w*|produtor(es)? rura\w*|safra|soja|milho|trigo|cafe|acucar|etanol|algodao|boi gordo|pecuaria|frigorific\w*|fertilizant\w*|graos|colheita|plantio|conab|jbs|minerva|marfrig|brf|slc agricola|3tentos|sao martinho|raizen|cosan|adecoagro|brasilagro|camil|tereos|usda|el nino|la nina)\b/, w: 3 },
  bancos: { label: "Bancos", re: /\b(bancos?|bancari\w*|itau|bradesco|santander|banco do brasil|nubank|btg|inter&co|banco inter|xp inc|b3 sa|spread bancario|credito bancario|febraban|fintechs?|pix)\b/, w: 3 },
  petroleo: { label: "Petróleo e gás", re: /\b(petrobras|petroleo|brent|wti|opep|opec|gas natural|combustive\w*|gasolina|diesel|prio|petroreconcavo|brava energia|ultrapar|vibra|refinaria|pre-sal)\b/, w: 3 },
  mineracao: { label: "Mineração e siderurgia", re: /\b(vale|minerio de ferro|mineracao|mineradora|siderurg\w*|aco|gerdau|usiminas|csn|cmin|cobre|niquel|litio)\b/, w: 3 },
  eletricas: { label: "Energia elétrica e saneamento", re: /\b(eletric\w*|energia eletrica|eletrobras|axia|copel|cemig|taesa|isa cteep|engie|equatorial|neoenergia|cpfl|aneel|bandeira tarifaria|saneamento|sabesp|copasa|sanepar|transmissao|hidreletric\w*|renovave\w*)\b/, w: 3 },
  varejo: { label: "Varejo e consumo", re: /\b(varejo|varejista\w*|consumo|magazine luiza|magalu|renner|c&a|americanas|casas bahia|assai|carrefour|grupo mateus|natura|ambev|black friday|vendas no varejo|e-?commerce|mercado livre)\b/, w: 3 },
  tecnologia: { label: "Tecnologia", re: /\b(tecnologia|inteligencia artificial|\bia\b|nvidia|apple|microsoft|alphabet|google|meta platforms|amazon|tesla|openai|semicondutor\w*|chips?|big techs?|totvs|locaweb|software|data ?centers?)\b/, w: 3 },
  imobiliario: { label: "Imobiliário", re: /\b(imobiliari\w*|imoveis?|construtora\w*|incorporadora\w*|cyrela|mrv|direcional|cury|even|tenda|minha casa minha vida|financiamento imobiliario|credito imobiliario|aluguel|alugueis|fii|fundos? imobiliarios?|ifix)\b/, w: 3 },
  saude: { label: "Saúde", re: /\b(saude|hapvida|rede d.?or|dasa|fleury|hospita\w*|planos? de saude|ans|farmac\w*|raia drogasil|hypera|vacina)\b/, w: 3 },
  industria: { label: "Indústria e infraestrutura", re: /\b(industria\w*|weg|embraer|randon|tupy|marcopolo|infraestrutura|concess\w*|rodovias?|ferrovias?|rumo|ccr|motiva|ecorodovias|portos?|logistica)\b/, w: 2.5 },
  economia: { label: "Economia", re: /\b(selic|copom|juros|ipca|inflacao|pib|fiscal|arcabouco|desemprego|focus|banco central)\b/, w: 2 },
  global: { label: "Internacional", re: /\b(fed|wall street|s&p 500|nasdaq|dow jones|china|europa|bce|treasur\w*|tarifas?|trump|global)\b/, w: 2 },
  // classes de investimento
  renda_fixa: { label: "Renda fixa", re: /\b(tesouro direto|tesouro (selic|ipca|prefixado)|renda fixa|cdb|lci|lca|debentures?|cdi|titulos publicos)\b/, w: 2.5 },
  acoes: { label: "Ações", re: /\b(ibovespa|acoes|dividendos?|jcp|balanco|lucro (liquido|trimestral)|resultado do [1-4]|recompra|b3)\b/, w: 1.5 },
  fiis: { label: "FIIs", re: /\b(fii|fiis|fundos? imobiliarios?|ifix|rendimentos? mensa\w*)\b/, w: 2.5 },
  exterior: { label: "Exterior", re: /\b(bdrs?|etf|s&p 500|nasdaq|wall street|investir no exterior|ivvb11|stocks?)\b/, w: 2 },
  cripto: { label: "Cripto", re: /\b(bitcoin|btc|ethereum|cripto\w*|blockchain|stablecoins?|solana)\b/, w: 3 },
  previdencia: { label: "Previdência", re: /\b(previdencia|pgbl|vgbl|inss|aposentadoria)\b/, w: 2.5 },
  dolar: { label: "Câmbio", re: /\b(dolar|cambio|real brasileiro|euro)\b/, w: 2 },
  commodities: { label: "Commodities", re: /\b(ouro|commodit\w*|petroleo|minerio|soja|prata|cobre)\b/, w: 2 },
  // objetivos
  o_imovel: { label: "Imóvel", re: /\b(financiamento imobiliario|credito imobiliario|minha casa minha vida|fgts|taxa de financiamento|preco dos imoveis)\b/, w: 2.5 },
  o_dividas: { label: "Crédito", re: /\b(endividamento|inadimplencia|serasa|rotativo|cartao de credito|juros do cartao|renegocia\w*|desenrola)\b/, w: 2.5 },
  o_independencia: { label: "Aposentadoria", re: /\b(aposentadoria|previdencia|independencia financeira|renda passiva|inss)\b/, w: 2 },
  o_carro: { label: "Veículos", re: /\b(financiamento de veiculos|carros?|veiculos?|montadoras?|ipva)\b/, w: 1.5 },
  o_viagem: { label: "Viagem", re: /\b(passagens aereas|turismo|iof|cartao internacional|cambio para viagem)\b/, w: 1.5 },
};

/** Lista de interesses (com peso) a partir das respostas. */
export function interessesDe(r: Respostas): string[] {
  const arr = (k: string) => (Array.isArray(r[k]) ? (r[k] as string[]) : []);
  const objetivos = arr("objetivos").map((o) => ({ imovel: "o_imovel", dividas: "o_dividas", independencia: "o_independencia", carro: "o_carro", viagem: "o_viagem" } as Record<string, string>)[o]).filter(Boolean);
  return [...new Set([...arr("setores"), ...arr("classes"), ...objetivos])].filter((k) => INTERESSES[k]);
}
