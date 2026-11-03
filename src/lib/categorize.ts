/**
 * Sugestão automática de categoria para lançamentos importados.
 * Ordem de prioridade:
 *   1) regras aprendidas com as suas correções (category_rules)
 *   2) palavras-chave conhecidas (abaixo)
 *   3) categoria informada pelo banco (ex.: "ALIMENTAÇÃO" na fatura Itaú)
 *   4) "A classificar"
 */

export function normalizeMerchant(desc: string): string {
  let s = desc
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  // Prefixos de adquirentes/intermediadores: "MP *", "EC *", "DL*", "IFD*", "JIM.COM*", "EBN *", "PAG*", "CAPPTA *"
  s = s.replace(/^(MP|EC|DL|IFD|JIM\.COM|EBN|PAG|PG|CAPPTA|SUMUP|SQ|PP|NATURA PAY|UBER UBER)\s*\*\s*/, "");
  s = s.replace(/-CT\b/g, " ");
  s = s.replace(/[^A-Z0-9 ]+/g, " ");
  s = s.replace(/\b\d{3,}\b/g, " "); // números longos (códigos, lojas)
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Palavras-chave -> chave de categoria "scope|grp|subgroup|name" */
const KEYWORDS: [RegExp, string][] = [
  [/QUINTOANDAR|QUINTO ANDAR|ALUGUEL/, "pessoal|Fixas|Habitação|Aluguel"],
  [/CONDOMINIO/, "pessoal|Fixas|Habitação|Condomínio"],
  [/AZUL SEGUROS|PORTO SEGURO AUTO|SEGURO AUTO|YOUSE/, "pessoal|Fixas|Transporte|Seguro do carro"],
  [/PRUDENT|SEGURO DE VIDA|MAPFRE VIDA/, "pessoal|Fixas|Outros|Seguro de vida"],
  [/CONTABILIZEI/, "pj|Custos PJ||Contabilizei"],
  [/SIMPLES NACIONAL|DAS SIMPLES/, "pj|Impostos||Simples Nacional"],
  [/SPOTIFY/, "pessoal|Variáveis|Habitação|Spotify"],
  [/AMAZON PRIME|PRIME VIDEO/, "pessoal|Variáveis|Habitação|Amazon Prime"],
  [/NETFLIX/, "pessoal|Variáveis|Habitação|Netflix"],
  [/MELIMAIS|MELI\+|MELI MAIS/, "pessoal|Variáveis|Habitação|Meli+"],
  [/APPLE COM|APPLE\.COM|ITUNES|APPLE/, "pessoal|Variáveis|Habitação|Apple"],
  [/CANVA|GOOGLE ONE|YOUTUBE|DISNEY|HBO|MAX COM|GLOBOPLAY|CHATGPT|OPENAI|CLAUDE/, "pessoal|Variáveis|Habitação|Outras assinaturas"],
  [/VIVO|CLARO|TIM CELULAR|\bTIM\b/, "pessoal|Variáveis|Habitação|Telefone Celular"],
  [/ENEL|ELETROPAULO|CPFL|LIGHT S/, "pessoal|Variáveis|Habitação|Luz"],
  [/SABESP/, "pessoal|Variáveis|Habitação|Água"],
  [/COMGAS|ULTRAGAZ|NATURGY/, "pessoal|Variáveis|Habitação|Gás"],
  [/^UBER|UBER TRIP|99 ?APP|99POP|CABIFY/, "pessoal|Variáveis|Transporte|Uber"],
  [/SEM PARAR|SEMPARAR|CONECTCAR|VELOE|TAG ?PASS/, "pessoal|Variáveis|Transporte|Sem Parar"],
  [/SHELLBOX|POSTO|AUTO POSTO|IPIRANGA|PETROBRAS|COMBUST|AGUA ESPRAIADA/, "pessoal|Variáveis|Transporte|Combustível"],
  [/ESTAC|ESTACIONAMENTO|ZONA AZUL|PARK/, "pessoal|Variáveis|Transporte|Estacionamento"],
  [/METRO|CPTM|BILHETE UNICO|TOP SP/, "pessoal|Variáveis|Transporte|Metrô"],
  [/IFOOD|^IFD|RAPPI|ZE DELIVERY|AIQFOME/, "pessoal|Variáveis|Alimentação|Delivery (iFood)"],
  [/SUPERMERC|MERCADO|HORTIFRUTI|HORTI|CARREFOUR|PAO DE ACUCAR|EXTRA |ASSAI|ATACADAO|DAKI|MINUTO PA|OXXO|SONDA|DIA BRASIL|EMPORIO|ARMAZEM|HONEST MARKET/, "pessoal|Variáveis|Alimentação|Supermercado"],
  [/FEIRA/, "pessoal|Variáveis|Alimentação|Feira"],
  [/PADARIA|PANIFIC/, "pessoal|Variáveis|Alimentação|Padaria"],
  [/CAFE|STARBUCKS|COFFEE|ACAI/, "pessoal|Variáveis|Alimentação|Cafés"],
  [/CONVENIENCIA|AM PM|AMPM|SELECT /, "pessoal|Variáveis|Alimentação|Conveniência"],
  [/DROGA|FARMA|FARM |DROGASIL|RAIA|PAGUE MENOS|PANVEL|FILIAL 501/, "pessoal|Variáveis|Saúde|Farmácia"],
  [/BARBEARIA|CABELEIREIR|SALAO/, "pessoal|Variáveis|Cuidados pessoais|Cabeleireiro"],
  [/MANICURE|ESMALTERIA/, "pessoal|Variáveis|Cuidados pessoais|Manicure"],
  [/CROSSFIT|SMARTFIT|SMART FIT|ACADEMIA|GYMPASS|WELLHUB|TOTALPASS/, "pessoal|Variáveis|Cuidados pessoais|Crossfit"],
  [/PSICOLOG/, "pessoal|Variáveis|Cuidados pessoais|Psicólogo"],
  [/DENTIST|ODONTO/, "pessoal|Extras|Saúde|Dentista"],
  [/CLINICA|MEDIC|HOSPITAL|LABORAT|FLEURY|DRA |DR\. /, "pessoal|Extras|Saúde|Médico"],
  [/HOTEIS|HOTEL|BOOKING|DECOLAR|AIRBNB|AIRASIA|TURKISH|LATAM|GOL LINHAS|AZUL LINHAS|AZUL WEB|MOVIDA|LOCALIZA|UNIDAS|TAXA DE EMBARQUE|123MILHAS|MAXMILHAS/, "pessoal|Adicionais|Lazer|Viagens"],
  [/VINHO|WINE|ADEGA|EVINO|CASA DA BEBIDA/, "pessoal|Adicionais|Lazer|Vinhos"],
  [/CINEMA|CINEMARK|INGRESSO|TICKET|SYMPLA|EVENTIM|TEATRO/, "pessoal|Adicionais|Lazer|Passeios/Eventos"],
  [/LOTERIA|LOTERIAS|BET |BETANO|BLAZE/, "pessoal|Adicionais|Lazer|Apostas/Loterias"],
  [/RESTAURANTE|BAR |CHOPP|BRASA|PIZZA|BURGER|SUSHI|CHURRASC|OUTBACK|MADERO|BARRACA|LANCHONETE/, "pessoal|Adicionais|Lazer|Restaurantes/bares"],
  [/YOUCOM|RENNER|RIACHUELO|C ?& ?A|ZARA|SHEIN|HERING|FARM |AREZZO|DR TERNO|AURORA SOL|CENTAURO|NETSHOES/, "pessoal|Adicionais|Vestuário|Roupas"],
  [/MERCADOLIVRE|MERCADO LIVRE|AMAZON|ALIEXPRESS|SHOPEE|MAGALU|AMERICANAS|PBKIDS/, "pessoal|Adicionais|Outros|Compras diversas"],
  [/^IOF/, "pessoal|Adicionais|Lazer|Viagens"],
];

/** Categoria do banco -> categoria padrão (fallback) */
const BANK_CATEGORY: Record<string, string> = {
  "ALIMENTAÇÃO": "pessoal|Adicionais|Lazer|Restaurantes/bares",
  "SAÚDE": "pessoal|Variáveis|Saúde|Farmácia",
  "VEÍCULOS": "pessoal|Variáveis|Transporte|Combustível",
  "VESTUÁRIO": "pessoal|Adicionais|Vestuário|Roupas",
  "TURISMO E ENTRETENIM": "pessoal|Adicionais|Lazer|Viagens",
  "HOBBY": "pessoal|Adicionais|Lazer|Outros lazer",
  "EDUCAÇÃO": "pessoal|Fixas|Educação|Curso",
  "DIVERSOS": "pessoal|Adicionais|Outros|Compras diversas",
};

export const UNCATEGORIZED_KEY = "pessoal|A classificar||A classificar";

export interface LearnedRule {
  pattern: string;
  match_type: "exact" | "prefix" | "contains";
  category_id: string;
}

export interface Suggestion {
  categoryKey?: string;   // quando veio de palavra-chave/banco
  categoryId?: string;    // quando veio de regra aprendida
  source: "regra" | "palavra-chave" | "banco" | "nenhuma";
}

export function ruleMatches(rule: LearnedRule, merchantKey: string): boolean {
  const p = rule.pattern;
  if (!p) return false;
  if (rule.match_type === "exact") return merchantKey === p;
  if (rule.match_type === "prefix") return merchantKey.startsWith(p);
  return merchantKey.includes(p);
}

export function suggestCategory(description: string, bankCategory: string | null, rules: LearnedRule[]): Suggestion {
  const mk = normalizeMerchant(description);
  // Regras mais específicas (padrões mais longos) primeiro
  const sorted = [...rules].sort((a, b) => b.pattern.length - a.pattern.length);
  const learned = sorted.find((r) => ruleMatches(r, mk));
  if (learned) return { categoryId: learned.category_id, source: "regra" };

  const raw = description.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const [re, key] of KEYWORDS) {
    if (re.test(mk) || re.test(raw)) return { categoryKey: key, source: "palavra-chave" };
  }
  if (bankCategory) {
    const k = BANK_CATEGORY[bankCategory.trim().toUpperCase().replace(/\.$/, "")];
    if (k) return { categoryKey: k, source: "banco" };
  }
  return { categoryKey: UNCATEGORIZED_KEY, source: "nenhuma" };
}
