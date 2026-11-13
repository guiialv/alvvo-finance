"use client";

import { useMemo, useState } from "react";
import { shiftCycle, cycleLabel } from "@/lib/cycle";
import {
  ASSET_KEYS, type AssetKey, defaultAssets, type GoalIn, monthlyPlan, needMonthly, normalize, rebalanceWithAporte, scenarios, simulate, type Strategy, type Weights,
} from "@/lib/sim/portfolio";
import { Answer, brl, Choice, compact, Field, Hi, LineChart, Note, pct } from "@/components/sim/kit";
import type { SimData } from "./types";

type Preset = "objetivo" | "conservadora" | "equilibrada" | "arrojada" | "personalizada";
type Profile = "conservador" | "moderado" | "arrojado";
interface Cart { name: string; preset: Preset; profile: Profile; custom: Weights }
interface GoalRow { id: string; name: string; target: number; months: number; balance: number }

const W0: Weights = { pos: 0, lci: 0, ipca: 0, pre: 0, acoes: 0, fii: 0, exterior: 0, cripto: 0 };
const PRESETS: Record<Exclude<Preset, "objetivo" | "personalizada">, Weights> = {
  conservadora: normalize({ ...W0, pos: 0.5, lci: 0.2, ipca: 0.2, pre: 0.1 }),
  equilibrada: normalize({ ...W0, pos: 0.25, lci: 0.1, ipca: 0.2, pre: 0.05, acoes: 0.15, fii: 0.1, exterior: 0.12, cripto: 0.03 }),
  arrojada: normalize({ ...W0, pos: 0.1, ipca: 0.15, acoes: 0.3, fii: 0.12, exterior: 0.25, cripto: 0.08 }),
};
const PRESET_LABEL: Record<Preset, string> = { objetivo: "Por objetivo (automática)", conservadora: "Conservadora", equilibrada: "Equilibrada", arrojada: "Arrojada", personalizada: "Personalizada" };
const CART_COLOR = ["#9a6a2a", "#3f6aa8", "#3f8a5a"];
const CART_TAG = ["A", "B", "C"];

const strategyOf = (c: Cart): Strategy => c.preset === "objetivo" ? { kind: "objetivo", profile: c.profile }
  : { kind: "fixed", weights: c.preset === "personalizada" ? normalize(c.custom) : PRESETS[c.preset] };
const monthsBetween = (a: string, b: string) => { const [ya, ma] = a.split("-").map(Number), [yb, mb] = b.split("-").map(Number); return (yb - ya) * 12 + (mb - ma); };

export function CarteiraSim({ d }: { d: SimData }) {
  const assetsBase = useMemo(() => defaultAssets({ cdi: d.cdi / 100, ipca: d.ipca, tesouroIpca: d.tesouro.ipca != null ? d.tesouro.ipca / 100 : null, tesouroPre: d.tesouro.pre != null ? d.tesouro.pre / 100 : null }), [d]);
  const [assumptions, setAssumptions] = useState(assetsBase);
  const cdiNet = (d.cdi / 100) * 0.85;

  const initialGoals: GoalRow[] = d.goals.length
    ? d.goals.map((g) => ({ id: g.id, name: g.name, target: Math.round(g.target), months: Math.max(1, g.deadline ? monthsBetween(d.hoje, g.deadline) : 300), balance: Math.round(g.balance) }))
    : [{ id: "g1", name: "Reserva de emergência", target: Math.round((d.despesas || 10_000) * 6 / 1000) * 1000, months: 12, balance: 0 }, { id: "g2", name: "Meta de patrimônio", target: 500_000, months: 60, balance: 0 }];
  const [goals, setGoals] = useState<GoalRow[]>(initialGoals.sort((a, b) => a.months - b.months));
  const [aporte, setAporte] = useState(Math.max(500, Math.round((d.sobra > 0 ? d.sobra : d.aporte || 3000) / 100) * 100));
  const [growth, setGrowth] = useState(+d.ipca.toFixed(3));
  const [carts, setCarts] = useState<Cart[]>([
    { name: "Carteira A", preset: "conservadora", profile: "moderado", custom: PRESETS.conservadora },
    { name: "Carteira B", preset: "equilibrada", profile: "moderado", custom: PRESETS.equilibrada },
    { name: "Carteira C", preset: "objetivo", profile: "moderado", custom: PRESETS.equilibrada },
  ]);
  const [sel, setSel] = useState(2);
  const [useCurrent, setUseCurrent] = useState(true);

  const gIn: GoalIn[] = goals.filter((g) => g.target > 0 && g.months > 0).map((g) => ({ ...g, months: Math.min(360, Math.round(g.months)) }));
  const horizon = Math.min(360, Math.max(12, ...gIn.map((g) => g.months)));
  const paths = horizon > 180 ? 400 : 700;
  const scen = useMemo(() => scenarios(assumptions, horizon, paths), [assumptions, horizon, paths]);
  const strategies = carts.map(strategyOf);
  const key = JSON.stringify([gIn, aporte, growth, strategies, horizon]);
  const results = useMemo(() => strategies.map((st) => simulate({ goals: gIn, aporte, aporteGrowth: growth, strategy: st, assets: assumptions, scen, horizon, cdiNet })), [key, scen]); // eslint-disable-line react-hooks/exhaustive-deps

  const allProb = (ri: number) => results[ri].allProb;
  const best = [0, 1, 2].sort((a, b) => allProb(b) - allProb(a) || results[b].total.p50[horizon] - results[a].total.p50[horizon])[0];
  const expRet = (w: Weights) => ASSET_KEYS.reduce((a, k, i) => a + w[k] * assumptions[i].ret, 0);
  const liq = (w: Weights) => w.pos + w.lci * 0.5;

  // plano do mês: carteira selecionada
  const plan = useMemo(() => monthlyPlan(gIn, aporte, growth, strategies[sel], cdiNet, 12), [key, sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const curTotal = Object.values(d.carteira).reduce((a, v) => a + v, 0);
  const curW = normalize({ ...W0, ...d.carteira } as Weights);
  const firstTarget = normalize(plan[0]?.byClass ?? W0);
  const thisMonth: Weights = useCurrent && curTotal > 0 ? rebalanceWithAporte(curW, curTotal, firstTarget, aporte) : (plan[0]?.byClass ?? W0);

  const step = horizon > 120 ? 12 : horizon > 36 ? 3 : 1;
  const idx = Array.from({ length: horizon + 1 }, (_, i) => i).filter((i) => i % step === 0 || i === horizon);
  const label = (m: number) => (step >= 12 ? `${cycleLabel(shiftCycle(d.hoje, m)).slice(-4)}` : cycleLabel(shiftCycle(d.hoje, m)).slice(0, 3) + (step > 1 ? `/${shiftCycle(d.hoje, m).slice(2, 4)}` : ""));

  const setGoal = (i: number, patch: Partial<GoalRow>) => setGoals((gs) => gs.map((g, k) => (k === i ? { ...g, ...patch } : g)));
  const move = (i: number, dir: -1 | 1) => setGoals((gs) => { const c = [...gs], j = i + dir; if (j < 0 || j >= c.length) return gs; [c[i], c[j]] = [c[j], c[i]]; return c; });
  const setCart = (i: number, patch: Partial<Cart>) => setCarts((cs) => cs.map((c, k) => (k === i ? { ...c, ...patch } : c)));

  return (
    <div className="flex flex-col gap-5">
      {/* ---------- 1. Objetivos e aporte ---------- */}
      <section className="card">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2>1 · Objetivos e aporte</h2>
          <span className="text-xs text-ink/45">Ordem = prioridade: o aporte completa primeiro o de cima. Vêm da aba Objetivos; ajuste à vontade aqui.</span>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <div className="overflow-x-auto">
            <table className="table min-w-[620px]">
              <thead><tr><th></th><th>Objetivo</th><th className="num">Quanto</th><th className="num">Prazo (meses)</th><th className="num">Já tenho</th><th className="num">Precisa/mês*</th><th></th></tr></thead>
              <tbody>{goals.map((g, i) => {
                const need = needMonthly(g, cdiNet);
                return (
                  <tr key={g.id}>
                    <td className="w-14 whitespace-nowrap text-ink/40"><button type="button" aria-label="Subir prioridade" className="px-1 hover:text-ink" onClick={() => move(i, -1)}>↑</button><button type="button" aria-label="Descer prioridade" className="px-1 hover:text-ink" onClick={() => move(i, 1)}>↓</button></td>
                    <td><input className="input min-w-[170px] !py-1.5" value={g.name} onChange={(e) => setGoal(i, { name: e.target.value })} /></td>
                    <td className="num"><NumIn value={g.target} onChange={(v) => setGoal(i, { target: v })} /></td>
                    <td className="num"><NumIn value={g.months} onChange={(v) => setGoal(i, { months: Math.max(1, Math.round(v)) })} w="w-20" /><span className="block text-[11px] text-ink/40">{cycleLabel(shiftCycle(d.hoje, g.months))}</span></td>
                    <td className="num"><NumIn value={g.balance} onChange={(v) => setGoal(i, { balance: v })} /></td>
                    <td className="num tabular-nums text-ink/70">{brl(need)}</td>
                    <td><button type="button" className="text-ink/35 hover:text-loss" aria-label="Remover objetivo" onClick={() => setGoals((gs) => gs.filter((_, k) => k !== i))}>×</button></td>
                  </tr>
                );
              })}</tbody>
            </table>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button type="button" className="btn-ghost" onClick={() => setGoals((gs) => [...gs, { id: `n${Date.now()}`, name: "Novo objetivo", target: 100_000, months: 24, balance: 0 }])}>+ Objetivo</button>
              <Note>* Aporte mensal que o objetivo pede para chegar no prazo com folga (rendendo 85% do CDI líquido, {pct(cdiNet * 0.85)} a.a., e mirando um pouco acima da meta para cobrir o IR do resgate). Soma: <b>{brl(goals.reduce((a, g) => a + needMonthly(g, cdiNet), 0))}</b>/mês.</Note>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <Field label="Aporte mensal" value={aporte} onChange={setAporte} max={Math.max(60_000, aporte * 2)} step={100} hint={d.sobra > 0 ? `sobra média ${brl(d.sobra)}` : undefined} />
            <Field label="Reajuste anual do aporte" value={growth} onChange={setGrowth} kind="pct" max={0.15} hint="IPCA (Focus)" />
            {curTotal > 0 && <p className="text-[12px] text-ink/50">Carteira atual: <b>{brl(curTotal)}</b> — usada no plano do mês para reequilibrar.</p>}
          </div>
        </div>
      </section>

      {/* ---------- 2. Carteiras ---------- */}
      <section className="card">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2>2 · Carteiras para comparar</h2><span className="text-xs text-ink/45">Mesmos cenários de mercado para as três — a diferença vem só da divisão do dinheiro.</span></div>
        <div className="grid gap-4 md:grid-cols-3">
          {carts.map((c, i) => {
            const w0 = results[i].weightsNow;
            return (
              <div key={i} className={`rounded-2xl border p-4 ${sel === i ? "border-ink/40 bg-ink/[0.02]" : "border-ink/10"}`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium"><span className="grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-white" style={{ background: CART_COLOR[i] }}>{CART_TAG[i]}</span>{c.name}</span>
                  <button type="button" onClick={() => setSel(i)} className={`rounded-full px-2.5 py-1 text-[12px] ${sel === i ? "bg-ink text-[#f6efe2]" : "border border-ink/15 text-ink/60"}`}>{sel === i ? "Em detalhe" : "Detalhar"}</button>
                </div>
                <select className="input mb-2" value={c.preset} onChange={(e) => setCart(i, { preset: e.target.value as Preset })} aria-label={`Estratégia da ${c.name}`}>
                  {(Object.keys(PRESET_LABEL) as Preset[]).map((p) => <option key={p} value={p}>{PRESET_LABEL[p]}</option>)}
                </select>
                {c.preset === "objetivo" && <div className="mb-2"><Choice<Profile> label="Apetite a risco no longo prazo" value={c.profile} onChange={(v) => setCart(i, { profile: v })} options={[["conservador", "Menor"], ["moderado", "Médio"], ["arrojado", "Maior"]]} /><Note>Cada objetivo tem a própria alocação pelo prazo que falta: perto da data, só renda fixa com liquidez; longe, mais bolsa e exterior.</Note></div>}
                {c.preset === "personalizada" && (
                  <div className="mb-2 space-y-1.5">
                    {ASSET_KEYS.map((k, ki) => (
                      <label key={k} className="flex items-center gap-2 text-[12px]">
                        <span className="w-24 shrink-0 truncate text-ink/60" title={assumptions[ki].label}>{assumptions[ki].label.split(" (")[0].split(" /")[0]}</span>
                        <input type="range" min={0} max={100} step={5} value={Math.round((c.custom[k] || 0) * 100)} onChange={(e) => setCart(i, { custom: { ...c.custom, [k]: Number(e.target.value) / 100 } })} className="flex-1 accent-[#7d5f36]" aria-label={`Peso de ${assumptions[ki].label}`} />
                        <span className="w-10 text-right tabular-nums">{pct(normalize(c.custom)[k], 0)}</span>
                      </label>
                    ))}
                  </div>
                )}
                <Stack w={w0} labels={assumptions.map((a) => a.label)} colors={assumptions.map((a) => a.color)} />
                <p className="mt-1 text-[11px] text-ink/45">Divisão do aporte deste mês · retorno esperado {pct(expRet(w0))} a.a. bruto</p>
              </div>
            );
          })}
        </div>
        <Legend assets={assumptions} />
      </section>

      {/* ---------- 3. Comparativo ---------- */}
      <Answer sub={<>Calculado em {paths} cenários de mercado mês a mês (juros, inflação, bolsa, câmbio e cripto variando juntos), com IR na data de cada objetivo. Mude qualquer seletor e tudo se recalcula.</>}>
        A <Hi>{carts[best].name}</Hi> — {PRESET_LABEL[carts[best].preset].toLowerCase()} — tem a maior chance de cumprir todos os objetivos no prazo: <Hi tone={allProb(best) >= 0.7 ? "good" : "bad"}>{pct(allProb(best), 0)}</Hi>.
        {(() => {
          const sp = gIn.map((g, gi) => ({ g, lo: Math.min(...results.map((r) => r.goals[gi].prob)), hi: Math.max(...results.map((r) => r.goals[gi].prob)) })).sort((a, b) => (b.hi - b.lo) - (a.hi - a.lo))[0];
          return sp && sp.hi - sp.lo >= 0.02 ? <> Onde a escolha mais pesa: “{sp.g.name}”, com chance de {pct(sp.lo, 0)} a {pct(sp.hi, 0)} conforme a carteira.</> : null;
        })()}
      </Answer>

      <section className="card">
        <h2 className="mb-1">Chance de chegar em cada objetivo no prazo</h2>
        <p className="mb-3 text-xs text-ink/45">% dos cenários em que o valor, já descontado o IR, alcança a meta na data.</p>
        <ProbBars goals={gIn} results={results.map((r) => r.goals.map((g) => g.prob))} names={carts.map((c) => c.name)} />
      </section>

      <section className="card">
        <h2 className="mb-1">Patrimônio ao longo do tempo</h2>
        <p className="mb-3 text-xs text-ink/45">Linha cheia: cenário típico (mediana) de cada carteira. Tracejado: faixa de 80% dos cenários da {carts[sel].name}. Inclui o que já foi resgatado para metas.</p>
        <LineChart xLabel={(i) => label(idx[i])} series={[
          ...carts.map((c, i) => ({ label: `${CART_TAG[i]} · ${c.name} (típico)`, color: CART_COLOR[i], values: idx.map((m) => results[i].total.p50[m]) })),
          { label: `${CART_TAG[sel]} · cenário ruim (10%)`, color: CART_COLOR[sel], values: idx.map((m) => results[sel].total.p10[m]), dashed: true },
          { label: `${CART_TAG[sel]} · cenário bom (90%)`, color: CART_COLOR[sel], values: idx.map((m) => results[sel].total.p90[m]), dashed: true },
          { label: "Total aportado", color: "#6b6459", values: idx.map((m) => results[0].invested[m]), dashed: true },
        ]} />
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-2">Comparativo</h2>
        <table className="table min-w-[640px]">
          <thead><tr><th></th>{carts.map((c, i) => <th key={i} className="num"><span style={{ color: CART_COLOR[i] }}>●</span> {c.name}</th>)}</tr></thead>
          <tbody>
            <tr><td>Chance de cumprir todos os objetivos</td>{results.map((_, i) => <td key={i} className={`num font-semibold ${i === best ? "text-gain" : ""}`}>{pct(allProb(i), 0)}</td>)}</tr>
            {gIn.map((g, gi) => (
              <tr key={g.id}><td>{g.name} <span className="text-ink/40">· meta {compact(g.target)}</span></td>{results.map((r, i) => <td key={i} className="num">{compact(r.goals[gi].p50)}<span className="block text-[11px] text-ink/45">ruim: {compact(r.goals[gi].p10)} · {pct(r.goals[gi].prob, 0)}</span></td>)}</tr>
            ))}
            <tr><td>Patrimônio em {label(horizon)} (típico)</td>{results.map((r, i) => <td key={i} className="num">{compact(r.total.p50[horizon])}</td>)}</tr>
            <tr><td>Cenário ruim (1 em 10)</td>{results.map((r, i) => <td key={i} className="num">{compact(r.total.p10[horizon])}</td>)}</tr>
            <tr><td>Maior queda no caminho (típica)</td>{results.map((r, i) => <td key={i} className="num">{pct(r.maxDrawdown, 0)}</td>)}</tr>
            <tr><td>IR estimado nos resgates</td>{results.map((r, i) => <td key={i} className="num">{compact(r.irPaid)}</td>)}</tr>
            <tr><td>Liquidez imediata do aporte</td>{results.map((r, i) => <td key={i} className="num">{pct(liq(r.weightsNow), 0)}</td>)}</tr>
          </tbody>
        </table>
      </section>

      {/* ---------- 4. Plano do mês ---------- */}
      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2>Onde colocar o aporte deste mês · {carts[sel].name}</h2>
          <div className="flex flex-wrap gap-1.5">
            {carts.map((c, i) => <button key={i} type="button" onClick={() => setSel(i)} className={`rounded-full px-3 py-1 text-[12.5px] ${sel === i ? "bg-ink text-[#f6efe2]" : "border border-ink/15 text-ink/60"}`}>{CART_TAG[i]}</button>)}
            {curTotal > 0 && <button type="button" onClick={() => setUseCurrent(!useCurrent)} className={`rounded-full px-3 py-1 text-[12.5px] ${useCurrent ? "bg-brand-soft text-brand" : "border border-ink/15 text-ink/60"}`}>{useCurrent ? "✓ " : ""}Reequilibrar com a carteira atual</button>}
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <div className="label mb-2">Por classe — {brl(aporte)}</div>
            <div className="space-y-2">
              {ASSET_KEYS.map((k, ki) => ({ k, ki, v: thisMonth[k] })).filter((x) => x.v >= 1).sort((a, b) => b.v - a.v).map(({ k, ki, v }) => (
                <div key={k}>
                  <div className="flex justify-between text-sm"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: assumptions[ki].color }} />{assumptions[ki].label}</span><b className="tabular-nums">{brl(v)}</b></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]"><div className="h-full rounded-full" style={{ width: `${(v / aporte) * 100}%`, background: assumptions[ki].color }} /></div>
                </div>
              ))}
            </div>
            {useCurrent && curTotal > 0 && <Note>O dinheiro novo vai primeiro para as classes que estão abaixo do alvo na sua carteira atual — você reequilibra sem vender (e sem IR).</Note>}
          </div>
          <div>
            <div className="label mb-2">Por objetivo</div>
            <table className="table">
              <tbody>
                {gIn.map((g) => <tr key={g.id}><td>{g.name}</td><td className="num">{brl(plan[0]?.byGoal[g.id] ?? 0)}</td></tr>)}
                <tr><td className="text-ink/60">Longo prazo / livre</td><td className="num">{brl(plan[0]?.livre ?? 0)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-brand">Próximos 12 meses, mês a mês</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="table min-w-[880px]">
              <thead><tr><th>Mês</th>{ASSET_KEYS.map((k, ki) => <th key={k} className="num"><span style={{ color: assumptions[ki].color }}>●</span> {assumptions[ki].label.split(" (")[0].split(" /")[0]}</th>)}</tr></thead>
              <tbody>{plan.map((r) => (
                <tr key={r.m}><td className="capitalize">{cycleLabel(shiftCycle(d.hoje, r.m - 1))}</td>{ASSET_KEYS.map((k) => <td key={k} className="num tabular-nums">{r.byClass[k] >= 1 ? brl(r.byClass[k]) : "—"}</td>)}</tr>
              ))}</tbody>
            </table>
            <Note>Cenário base, sem oscilação de mercado. Na estratégia por objetivo, a divisão muda sozinha quando um objetivo se aproxima da data ou é concluído.</Note>
          </div>
        </details>
      </section>

      {/* ---------- Premissas ---------- */}
      <details className="card">
        <summary className="cursor-pointer font-medium">Premissas por classe (retorno esperado, oscilação e IR) — editáveis</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="table min-w-[640px]">
            <thead><tr><th>Classe</th><th className="num">Retorno esperado a.a.</th><th className="num">Oscilação a.a.</th><th className="num">IR no resgate</th><th>Liquidez</th></tr></thead>
            <tbody>{assumptions.map((a, i) => (
              <tr key={a.key}>
                <td><span style={{ color: a.color }}>●</span> {a.label}</td>
                <td className="num"><PctIn value={a.ret} onChange={(v) => setAssumptions((as) => as.map((x, k) => (k === i ? { ...x, ret: v } : x)))} /></td>
                <td className="num"><PctIn value={a.vol} onChange={(v) => setAssumptions((as) => as.map((x, k) => (k === i ? { ...x, vol: v } : x)))} /></td>
                <td className="num">{a.ir ? pct(a.ir, 0) : "isento"}{a.ir === 0.15 ? <span className="block text-[11px] text-ink/40">RF: 22,5%→15% pelo prazo</span> : null}</td>
                <td className="text-ink/60">{a.liq}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="mt-2 flex items-center gap-3"><button type="button" className="btn-ghost" onClick={() => setAssumptions(assetsBase)}>Voltar às premissas de mercado</button>
            <Note>Base: CDI {pct(d.cdi / 100)}, IPCA esperado {pct(d.ipca)} (Focus){d.tesouro.ipca != null ? `, Tesouro IPCA+ IPCA + ${pct(d.tesouro.ipca / 100)}` : ""}{d.tesouro.pre != null ? `, prefixado ${pct(d.tesouro.pre / 100)}` : ""}. Bolsa, exterior e cripto: prêmios históricos aproximados — ajuste conforme sua visão.</Note></div>
        </div>
      </details>
      <Note>Simulação com premissas — resultados passados e retornos esperados não garantem retornos futuros. Use como apoio à decisão, não como recomendação de investimento.</Note>
    </div>
  );
}

function NumIn({ value, onChange, w = "w-28" }: { value: number; onChange: (v: number) => void; w?: string }) {
  const [t, setT] = useState<string | null>(null);
  const commit = (s: string) => { const n = Number(s.replace(/\./g, "").replace(",", ".")); if (isFinite(n) && n >= 0) onChange(n); setT(null); };
  return <input inputMode="decimal" className={`input !py-1.5 text-right tabular-nums ${w}`} value={t ?? value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} onChange={(e) => setT(e.target.value)} onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commit((e.target as HTMLInputElement).value); }} />;
}
function PctIn({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [t, setT] = useState<string | null>(null);
  const commit = (s: string) => { const n = Number(s.replace(",", ".")); if (isFinite(n)) onChange(n / 100); setT(null); };
  return <span className="inline-flex items-center gap-1"><input inputMode="decimal" className="input w-20 !py-1 text-right tabular-nums" value={t ?? (value * 100).toFixed(1).replace(".", ",")} onChange={(e) => setT(e.target.value)} onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commit((e.target as HTMLInputElement).value); }} />%</span>;
}

/** Barra empilhada da composição (com 2px de respiro entre segmentos). */
function Stack({ w, labels, colors }: { w: Weights; labels: string[]; colors: string[] }) {
  return (
    <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
      {ASSET_KEYS.map((k, i) => w[k] > 0.004 && <div key={k} title={`${labels[i]}: ${pct(w[k], 0)}`} style={{ width: `${w[k] * 100}%`, background: colors[i] }} className="h-full first:rounded-l-full last:rounded-r-full" />)}
    </div>
  );
}
function Legend({ assets }: { assets: { key: AssetKey; label: string; color: string }[] }) {
  return <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink/60">{assets.map((a) => <span key={a.key} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: a.color }} />{a.label}</span>)}</div>;
}

/** Barras horizontais agrupadas: objetivo × carteira, rótulo de % em cada barra. */
function ProbBars({ goals, results, names }: { goals: GoalIn[]; results: number[][]; names: string[] }) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {goals.map((g, gi) => (
        <div key={g.id}>
          <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{g.name}</span><span className="text-ink/45">{compact(g.target)} · {g.months} meses</span></div>
          <div className="space-y-1">
            {results.map((r, ci) => {
              const id = `${gi}-${ci}`;
              return (
                <div key={ci} className="flex items-center gap-2" onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)} title={`${names[ci]}: ${pct(r[gi], 0)} de chance`}>
                  <span className="w-5 text-center text-[11px] font-bold" style={{ color: CART_COLOR[ci] }}>{CART_TAG[ci]}</span>
                  <div className="relative h-4 flex-1 rounded-full bg-ink/[0.05]">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(1, r[gi] * 100)}%`, background: CART_COLOR[ci], opacity: hover && hover !== id ? 0.55 : 1 }} />
                  </div>
                  <span className="w-11 text-right text-[12px] tabular-nums text-ink/75">{pct(r[gi], 0)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-x-4 text-[12px] text-ink/60">{names.map((n, i) => <span key={i} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CART_COLOR[i] }} />{CART_TAG[i]} · {n}</span>)}</div>
    </div>
  );
}

