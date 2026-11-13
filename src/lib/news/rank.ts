import { SOURCE_WEIGHT } from "./feeds";

export interface FeedItem { id: string; url: string; title: string; summary: string | null; source: string; source_key: string; kind: string; tickers: string[]; published_at: string | null }
export interface Story {
  id: string; lead: FeedItem; others: FeedItem[]; sources: string[]; score: number;
  topics: string[]; mine: string[]; kind: string; published_at: string | null;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Temas que movem mercado e patrimônio: [rótulo, regex, peso]. */
const TOPICS: [string, RegExp, number][] = [
  ["Juros / Copom", /\b(copom|selic|taxa basica|juros futuros?|di futuro|curva de juros|politica monetaria|galipolo|banco central)\b/, 3],
  ["Inflação", /\b(ipca|inflacao|igp-?m|ipca-15|deflacao|cpi|pce)\b/, 2.5],
  ["Fed / EUA", /\b(fed|fomc|powell|treasur(y|ies)|federal reserve|rate cut|rate hike|payroll|jobs report)\b/, 2.5],
  ["Câmbio", /\b(dolar|cambio|real brasileiro|usd\/brl|brl)\b/, 2],
  ["Fiscal", /\b(fiscal|arcabouco|meta fiscal|divida publica|haddad|tesouro nacional|orcamento|ldo|ploa|rombo|deficit primario|superavit|ir sobre|imposto de renda|tributa(cao|r))\b/, 2],
  ["Atividade", /\b(pib|gdp|varejo|producao industrial|desemprego|caged|pnad|recessao|recession)\b/, 2],
  ["Bolsa", /\b(ibovespa|ibov|b3|s&p 500|nasdaq|dow jones|stocks?|wall street|bolsas?)\b/, 1.5],
  ["Resultados", /\b(balanco|lucro|prejuizo|resultado (do|no) [1-4]º? ?tri|[1-4](º|o) tri(mestre)?|earnings|guidance|receita liquida|ebitda)\b/, 1.6],
  ["Proventos", /\b(dividendos?|jcp|juros sobre capital|proventos|recompra|buyback|data com)\b/, 2],
  ["Eventos corporativos", /\b(fato relevante|ipo|follow-?on|oferta de acoes|fusao|aquisicao|incorpora(cao|r)|opa|privatiza|venda de ativos|cisao|spin-?off)\b/, 1.8],
  ["Crédito / risco", /\b(recuperacao judicial|default|calote|rebaix(a|amento)|rating|downgrade|upgrade|inadimplencia|falencia)\b/, 2.5],
  ["Commodities", /\b(petroleo|brent|minerio|soja|ouro|gold|oil|commodit)\w*/, 1.2],
  ["Renda fixa", /\b(tesouro direto|tesouro ipca|tesouro selic|cdb|lci|lca|debentures?|fii|fundos? imobiliarios?|renda fixa)\b/, 1.5],
  ["China / global", /\b(china|tarifas?|tariffs?|guerra comercial|trade war|bce|ecb|opep|opec)\b/, 1.2],
];
/** Assuntos fora do escopo financeiro (estilo de vida, entretenimento, esporte…). */
const OFF = /\b(drink|coquetel|receita de|culinaria|horoscopo|celebridade|famosos|novela|bbb|futebol|campeonato|moda|look|viagem dos sonhos|turismo|memes?|lifestyle|casamento real|realeza|gastronomia|restaurante|vinho|whisky|beleza|skincare)\b/;

const STOP = new Set("para pela pelo como mais sobre apos entre com sem por que dos das nos nas uma uns umas the and for with from após está são não sua seu seus suas este esta isso essa esse ainda pode deve diz afirma veja hoje".split(" "));
const tokens = (s: string) => new Set(norm(s).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((w) => w.length > 3 && !STOP.has(w)));
const jaccard = (a: Set<string>, b: Set<string>) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i || 1); };

/**
 * Agrupa a mesma história contada por várias fontes e dá uma nota:
 * autoridade da fonte + tema de mercado + ligação com a carteira + cobertura (várias fontes) × recência.
 */
export function rankStories(items: FeedItem[], opts: { mine: string[]; names?: Record<string, string> }): Story[] {
  const mineSet = new Set(opts.mine.map((t) => t.toUpperCase()));
  const nameRe = Object.entries(opts.names ?? {}).filter(([, n]) => n && n.length >= 4).map(([t, n]) => [t, new RegExp(`\\b${norm(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)] as [string, RegExp]);
  const now = Date.now();

  const scored = items.map((it) => {
    const text = norm(`${it.title} ${it.summary ?? ""}`);
    const topics = TOPICS.filter(([, re]) => re.test(text));
    const off = OFF.test(norm(it.title));
    const mine = [...new Set([...it.tickers.filter((t) => mineSet.has(t)), ...nameRe.filter(([, re]) => re.test(text)).map(([t]) => t).filter((t) => mineSet.has(t))])];
    let base = (SOURCE_WEIGHT[it.source_key] ?? 1) + topics.reduce((a, [, , w]) => a + w, 0) * 0.9 + mine.length * 4 + (it.tickers.length ? 0.4 : 0);
    if (it.kind === "fato_relevante") base += mine.length ? 3 : 0.5;
    if (it.kind === "comunicado") base += mine.length ? 1 : -3;
    if (off) base -= 6;
    if (!topics.length && !mine.length && it.kind === "noticia") base -= 1.5;
    return { it, tok: tokens(it.title), topics: topics.map(([l]) => l), mine, base };
  });

  // Mesma história em fontes diferentes
  const clusters: (typeof scored)[] = [];
  for (const s of scored.sort((a, b) => (b.it.published_at ?? "").localeCompare(a.it.published_at ?? ""))) {
    const c = s.it.kind === "noticia" ? clusters.find((cl) => cl[0].it.kind === "noticia" && cl.some((x) => jaccard(x.tok, s.tok) >= 0.42)) : undefined;
    if (c) c.push(s); else clusters.push([s]);
  }

  return clusters.map((cl) => {
    const lead = [...cl].sort((a, b) => b.base - a.base || (SOURCE_WEIGHT[b.it.source_key] ?? 1) - (SOURCE_WEIGHT[a.it.source_key] ?? 1))[0];
    const sources = [...new Set(cl.map((x) => x.it.source))];
    const newest = cl.map((x) => x.it.published_at).filter(Boolean).sort().pop() ?? null;
    const ageH = newest ? Math.max(0, (now - Date.parse(newest)) / 3600000) : 48;
    const halfLife = lead.it.kind === "banco_central" || lead.it.kind === "fato_relevante" ? 48 : 20;
    const coverage = Math.min(4, sources.length - 1) * 1.3;
    const score = (lead.base + coverage) * Math.pow(0.5, ageH / halfLife);
    return {
      id: lead.it.id, lead: lead.it, others: cl.filter((x) => x !== lead).map((x) => x.it), sources, score: Math.round(score * 10) / 10,
      topics: [...new Set(cl.flatMap((x) => x.topics))].slice(0, 3), mine: [...new Set(cl.flatMap((x) => x.mine))], kind: lead.it.kind, published_at: newest,
    };
  }).sort((a, b) => b.score - a.score);
}

/** Corte de relevância: só aparece o que passa da nota mínima (pode não aparecer nada). */
export const RELEVANT = 4.5;
