/**
 * "Tenho R$ X para investir agora": divide um valor disponível hoje em camadas, na ordem em que um planejador faria:
 * 1) compromissos dos próximos dias que o caixa não cobre; 2) reserva de emergência; 3) objetivos com prazo que estão
 * atrasados; 4) longo prazo, reequilibrando a carteira atual rumo à alocação do perfil. Funções puras (rodam no navegador).
 */
import { ASSET_KEYS, glide, needMonthly, normalize, rebalanceWithAporte, splitAporte, type AssetKey, type GoalIn, type Weights } from "./portfolio";

export type Perfil = "conservador" | "moderado" | "arrojado";
export interface Camada { key: string; titulo: string; valor: number; porClasse: Weights; motivo: string; tom: "caixa" | "reserva" | "objetivo" | "longo" }
export interface AporteIn {
  valor: number; perfil: Perfil; reservaMeses: number;
  /** "primeiro": completa a reserva antes de tudo; "equilibrar": até 60% do valor vai para a reserva e o resto segue */
  reservaModo: "primeiro" | "equilibrar";
  despesas: number; reservaAtual: number; reservaAlvo: number | null;
  faltaCaixa: number; // quanto falta na conta para os compromissos dos próximos dias
  goals: GoalIn[]; aporteMensal: number; cdiNet: number;
  carteira: Partial<Record<AssetKey, number>>;
}
const W0: Weights = { pos: 0, lci: 0, ipca: 0, pre: 0, acoes: 0, fii: 0, exterior: 0, cripto: 0 };
const scale = (w: Weights, v: number) => Object.fromEntries(ASSET_KEYS.map((k) => [k, w[k] * v])) as Weights;
const add = (a: Weights, b: Weights) => Object.fromEntries(ASSET_KEYS.map((k) => [k, a[k] + b[k]])) as Weights;
const brl0 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Quanto um objetivo precisa receber HOJE (de uma vez) para voltar ao prazo, além dos aportes mensais que já recebe. */
export function lumpNeeded(g: GoalIn, mensal: number, cdiNet: number) {
  const i = Math.pow(1 + cdiNet * 0.85, 1 / 12) - 1, n = Math.max(1, g.months);
  const aim = g.target * (n <= 12 ? 1.04 : n <= 36 ? 1.08 : n <= 120 ? 1.14 : 1.2);
  const pvAnnuity = mensal * (1 - Math.pow(1 + i, -n)) / i;
  return Math.max(0, aim / Math.pow(1 + i, n) - g.balance - pvAnnuity);
}

export function planAporte(inp: AporteIn): { camadas: Camada[]; total: Weights; sobraLivre: number } {
  let left = Math.max(0, inp.valor);
  const camadas: Camada[] = [];
  const take = (v: number) => { const x = Math.max(0, Math.min(left, Math.round(v))); left -= x; return x; };

  // 1) Caixa: compromissos próximos que o saldo da conta não cobre
  if (inp.faltaCaixa > 0) {
    const v = take(inp.faltaCaixa);
    if (v > 0) camadas.push({ key: "caixa", titulo: "Deixar na conta", valor: v, porClasse: { ...W0 }, tom: "caixa",
      motivo: `Pela agenda, faltam ${brl0(inp.faltaCaixa)} na conta para pagar o que vence nos próximos dias. Investir isso agora obrigaria a resgatar logo em seguida.` });
  }

  // 2) Reserva de emergência
  const alvo = inp.reservaAlvo ?? Math.round(inp.reservaMeses * inp.despesas);
  const gapRes = Math.max(0, alvo - inp.reservaAtual);
  if (gapRes > 0 && left > 0) {
    const v = take(inp.reservaModo === "equilibrar" ? Math.min(gapRes, left * 0.6) : gapRes);
    const meses = inp.despesas > 0 ? (inp.reservaAtual + v) / inp.despesas : 0;
    camadas.push({ key: "reserva", titulo: "Reserva de emergência", valor: v, porClasse: { ...W0, pos: v }, tom: "reserva",
      motivo: `A reserva tem ${brl0(inp.reservaAtual)} e o alvo é ${brl0(alvo)}${inp.reservaAlvo ? " (da sua caixinha" : " ("}${inp.despesas > 0 ? `${inp.reservaAlvo ? ", " : ""}≈ ${(alvo / inp.despesas).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} meses dos seus gastos médios de ${brl0(inp.despesas)}/mês` : ""}). Com este valor ela passa a cobrir ${meses.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} meses${v < gapRes ? ` (ainda faltam ${brl0(gapRes - v)})` : ""}. Fica em pós-fixado com resgate no mesmo dia.` });
  }

  // 3) Objetivos com prazo (até 10 anos), dos mais próximos para os mais distantes, só o que está atrasado
  const mensais = splitAporte(inp.goals, inp.aporteMensal, inp.cdiNet).per;
  for (const g of [...inp.goals].filter((x) => x.months <= 120).sort((a, b) => a.months - b.months)) {
    if (left <= 0) break;
    const mensal = mensais.find((m) => m.id === g.id)?.give ?? 0;
    const need = lumpNeeded(g, mensal, inp.cdiNet);
    if (need < 100) continue;
    const v = take(need);
    if (v <= 0) continue;
    const w = glide(g.months, inp.perfil);
    const precisa = needMonthly(g, inp.cdiNet);
    camadas.push({ key: `obj-${g.id}`, titulo: g.name, valor: v, porClasse: scale(w, v), tom: "objetivo",
      motivo: `Faltam ${g.months} meses e ${brl0(Math.max(0, g.target - g.balance))} para a meta. Ele pede ${brl0(precisa)}/mês e hoje recebe ${brl0(mensal)}/mês da sua sobra média; este valor tira o atraso. Pelo prazo, a divisão é ${g.months <= 12 ? "só renda fixa com liquidez" : g.months <= 36 ? "principalmente renda fixa" : "renda fixa com uma parte em renda variável"}.` });
  }

  // 4) Longo prazo: o que sobra reequilibra a carteira rumo à alocação do perfil (o dinheiro novo vai para o que está abaixo)
  if (left > 0) {
    const alvoW = glide(240, inp.perfil);
    const cur = normalize({ ...W0, ...inp.carteira } as Weights);
    const curTotal = ASSET_KEYS.reduce((a, k) => a + (inp.carteira[k] ?? 0), 0);
    const porClasse = curTotal > 0 ? rebalanceWithAporte(cur, curTotal, alvoW, left) : scale(alvoW, left);
    const abaixo = curTotal > 0 ? ASSET_KEYS.filter((k) => cur[k] < alvoW[k] - 0.03) : [];
    camadas.push({ key: "longo", titulo: "Longo prazo", valor: Math.round(left), porClasse, tom: "longo",
      motivo: curTotal > 0
        ? `O restante vai para o longo prazo, no perfil ${inp.perfil}. Como a carteira atual (${brl0(curTotal)}) está ${abaixo.length ? "abaixo do alvo em algumas classes" : "perto do alvo"}, o dinheiro novo entra primeiro no que está faltando — sem precisar vender nada.`
        : `O restante vai para o longo prazo, dividido pela alocação do perfil ${inp.perfil}.` });
    left = 0;
  }

  const total = camadas.reduce((a, c) => add(a, c.porClasse), { ...W0 });
  return { camadas, total, sobraLivre: left };
}

/** Retorno esperado e oscilação de uma divisão (frações) com as premissas das classes. */
export function stats(w: Weights, assets: { ret: number; vol: number; ir: number }[]) {
  const ret = ASSET_KEYS.reduce((a, k, i) => a + w[k] * assets[i].ret * (1 - assets[i].ir), 0);
  const vol = Math.sqrt(ASSET_KEYS.reduce((a, k, i) => a + Math.pow(w[k] * assets[i].vol, 2), 0));
  return { ret, vol };
}
