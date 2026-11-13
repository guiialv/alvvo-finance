import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Juros de crédito por modalidade e por banco, publicados pelo Banco Central
 * (médias dos últimos 5 dias úteis; algumas modalidades só têm média mensal).
 * Guardados em market_macro (chave "credit_rates") e atualizados 1x por dia.
 */
export interface CreditMod { key: string; label: string; segment: "PF" | "PJ"; median: number; best: { name: string; monthly: number }[]; n: number; period: string }
export interface CreditRates { at: string | null; mods: Record<string, CreditMod> }

const MODS: { key: string; label: string; segment: "PF" | "PJ"; re: RegExp }[] = [
  { key: "consignado_inss", label: "Consignado INSS", segment: "PF", re: /consignado.*inss/i },
  { key: "consignado_publico", label: "Consignado servidor público", segment: "PF", re: /consignado.*p[uú]blico/i },
  { key: "consignado_privado", label: "Consignado CLT (setor privado)", segment: "PF", re: /consignado.*privado/i },
  { key: "pessoal", label: "Crédito pessoal", segment: "PF", re: /pessoal n[aã]o consignado/i },
  { key: "veiculos", label: "Financiamento de veículo", segment: "PF", re: /aquisi[cç][aã]o de ve[ií]culos/i },
  { key: "imobiliario", label: "Financiamento imobiliário", segment: "PF", re: /imobili[aá]rio.*mercado/i },
  { key: "cartao_parcelado", label: "Cartão de crédito parcelado", segment: "PF", re: /cart[aã]o de cr[eé]dito.*parcelado/i },
  { key: "cheque", label: "Cheque especial", segment: "PF", re: /cheque especial/i },
  { key: "rotativo", label: "Rotativo do cartão", segment: "PF", re: /rotativo total/i },
  { key: "pj_giro", label: "Capital de giro", segment: "PJ", re: /capital de giro com prazo (superior|acima)/i },
  { key: "pj_giro_curto", label: "Capital de giro curto prazo", segment: "PJ", re: /capital de giro com prazo (at[eé]|inferior)/i },
  { key: "pj_duplicatas", label: "Desconto de duplicatas", segment: "PJ", re: /desconto de duplicata/i },
  { key: "pj_recebiveis", label: "Antecipação de recebíveis de cartão", segment: "PJ", re: /antecipa[cç][aã]o de faturas de cart[aã]o/i },
  { key: "pj_conta_garantida", label: "Conta garantida", segment: "PJ", re: /conta garantida/i },
  { key: "pj_cheque", label: "Cheque especial PJ", segment: "PJ", re: /cheque especial/i },
];

const BASE = "https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata";
type Row = Record<string, unknown>;
const str = (r: Row, ...k: string[]) => { for (const x of k) if (r[x] != null) return String(r[x]); return ""; };
const num = (r: Row, ...k: string[]) => { for (const x of k) if (r[x] != null && isFinite(Number(r[x]))) return Number(r[x]); return NaN; };

async function fetchRows(resource: string, orderField: string): Promise<Row[]> {
  const url = `${BASE}/${resource}?$format=json&$top=6000&$orderby=${orderField}%20desc`;
  const r = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`BCB taxaJuros ${resource}: ${r.status}`);
  const j = (await r.json()) as { value?: Row[] };
  const rows = j.value ?? [];
  // só o período mais recente
  const latest = rows.reduce((a, x) => (str(x, orderField) > a ? str(x, orderField) : a), "");
  return rows.filter((x) => str(x, orderField) === latest);
}

export async function refreshCreditRates(): Promise<CreditRates> {
  const [daily, monthly] = await Promise.allSettled([
    fetchRows("TaxasJurosDiariaPorInicioPeriodo", "InicioPeriodo"),
    fetchRows("TaxasJurosMensalPorMes", "Mes"),
  ]);
  const rows = [
    ...(daily.status === "fulfilled" ? daily.value.map((r) => ({ r, period: str(r, "InicioPeriodo") + " a " + str(r, "FimPeriodo") })) : []),
    ...(monthly.status === "fulfilled" ? monthly.value.map((r) => ({ r, period: str(r, "Mes") })) : []),
  ];
  const mods: Record<string, CreditMod> = {};
  for (const m of MODS) {
    const seg = m.segment === "PF" ? /f[ií]sica/i : /jur[ií]dica/i;
    const hits = rows.filter(({ r }) => {
      const mod = str(r, "Modalidade");
      if (!m.re.test(mod) || !seg.test(str(r, "Segmento"))) return false;
      // taxas pós-fixadas são spread sobre um índice: só usamos as prefixadas (o imobiliário é sempre indexado)
      return m.key === "imobiliario" || !/p[oó]s-fixad/i.test(mod);
    })
      .map(({ r, period }) => ({ name: str(r, "InstituicaoFinanceira"), monthly: num(r, "TaxaJurosAoMes") / 100, period }))
      .filter((x) => x.name && isFinite(x.monthly) && x.monthly > 0);
    if (!hits.length) continue;
    // a mesma instituição pode aparecer em pré e pós; fica a menor
    const byBank = new Map<string, { name: string; monthly: number; period: string }>();
    for (const h of hits) { const o = byBank.get(h.name); if (!o || h.monthly < o.monthly) byBank.set(h.name, h); }
    const list = [...byBank.values()].sort((a, b) => a.monthly - b.monthly);
    const median = list[Math.floor(list.length / 2)].monthly;
    mods[m.key] = { key: m.key, label: m.label, segment: m.segment, median, best: list.slice(0, 5).map(({ name, monthly }) => ({ name, monthly })), n: list.length, period: list[0].period };
  }
  const out: CreditRates = { at: new Date().toISOString(), mods };
  if (Object.keys(mods).length) await createAdminClient().from("market_macro").upsert({ key: "credit_rates", value: out, ref_date: out.at!.slice(0, 10), updated_at: out.at });
  return out;
}

/** Taxas guardadas; com mais de 24 h, atualiza (em segundo plano quando já há dados). */
export async function getCreditRates(later?: (fn: () => Promise<unknown>) => void): Promise<CreditRates> {
  const { data } = await createAdminClient().from("market_macro").select("value, updated_at").eq("key", "credit_rates").maybeSingle();
  const cached = (data?.value ?? null) as CreditRates | null;
  const age = data?.updated_at ? (Date.now() - Date.parse(data.updated_at as string)) / 3600000 : Infinity;
  if (!cached) { try { return await refreshCreditRates(); } catch (e) { console.error("[crédito]", (e as Error).message); return { at: null, mods: {} }; } }
  if (age > 24 && later) later(() => refreshCreditRates());
  return cached;
}

/**
 * Linhas sem série no Banco Central: referência de mercado (faixas publicadas por comparadores em 2026),
 * sempre editável — a pessoa digita a proposta que recebeu.
 */
export const REFERENCE: { key: string; label: string; monthly: number; note: string; requires: string }[] = [
  { key: "home_equity", label: "Garantia de imóvel (home equity)", monthly: 0.012, note: "Referência de mercado: ~0,99% a 1,49% a.m.", requires: "Imóvel quitado · 30–60 dias para liberar" },
  { key: "auto_equity", label: "Garantia de veículo", monthly: 0.025, note: "Referência de mercado: ~1,99% a 3,99% a.m.", requires: "Veículo quitado · até ~90% da FIPE" },
  { key: "garantia_invest", label: "Garantia de investimentos", monthly: 0.015, note: "Referência — peça a proposta ao seu banco", requires: "Aplicações bloqueadas no mesmo banco" },
];
