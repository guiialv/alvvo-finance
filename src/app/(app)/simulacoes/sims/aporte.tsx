"use client";

import { useMemo, useState } from "react";
import { ASSET_KEYS, defaultAssets, normalize, scenarios, type AssetKey, type GoalIn, type Weights } from "@/lib/sim/portfolio";
import { planAporte, stats, type Perfil } from "@/lib/sim/aporte";
import { Answer, brl, Choice, compact, Field, Hi, Layout, LineChart, Note, pct } from "@/components/sim/kit";
import type { AporteExtras } from "@/lib/sim/aporte-data";
import type { SimData } from "./types";

const monthsBetween = (a: string, b: string) => { const [ya, ma] = a.split("-").map(Number), [yb, mb] = b.split("-").map(Number); return (yb - ya) * 12 + (mb - ma); };
const TOM: Record<string, string> = { caixa: "#6e6458", reserva: "#2f7d4f", objetivo: "#3f6aa8", longo: "#8d5a14" };
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const round50 = (v: number) => Math.round(v / 50) * 50;

interface Pick { ativo: string; valor: number; porque: string }

export function AporteSim({ d, x }: { d: SimData; x: AporteExtras }) {
  const assets = useMemo(() => defaultAssets({ cdi: d.cdi / 100, ipca: d.ipca, tesouroIpca: d.tesouro.ipca != null ? d.tesouro.ipca / 100 : null, tesouroPre: d.tesouro.pre != null ? d.tesouro.pre / 100 : null }), [d]);
  const cdiNet = (d.cdi / 100) * 0.85;
  const [valor, setValor] = useState(18_000);
  const [perfil, setPerfil] = useState<Perfil>("moderado");
  const alvoCx = x.reserva.fonte === "caixinha" ? x.reserva.alvo : null;
  const [mesesRes, setMesesResRaw] = useState(alvoCx && d.despesas > 0 ? Math.min(12, Math.max(1, Math.round(alvoCx / d.despesas))) : 6);
  const [mexeuReserva, setMexeuReserva] = useState(false);
  const setMesesRes = (v: number) => { setMexeuReserva(true); setMesesResRaw(v); };
  const [naConta, setNaConta] = useState(x.banco.saldo != null && x.banco.saldo >= 18_000);
  const [usarAgenda, setUsarAgenda] = useState(true);
  const [resModo, setResModo] = useState<"primeiro" | "equilibrar">("primeiro");

  // Caixa: o que vence nos próximos dias contra o saldo da conta (sem contar o valor a investir, se ele já está lá)
  const saldoLivre = x.banco.saldo != null ? x.banco.saldo - (naConta ? valor : 0) : null;
  const compromissos = x.agenda.contas + x.agenda.cartoes - x.agenda.receber;
  const faltaCaixa = usarAgenda && saldoLivre != null ? Math.max(0, compromissos - saldoLivre) : 0;

  // A reserva tem camada própria: fica fora dos objetivos
  const goals: GoalIn[] = d.goals.filter((g) => g.type !== "independencia" && g.deadline && g.target > 0 && g.id !== x.reserva.goalId)
    .map((g) => ({ id: g.id, name: g.name, target: g.target, months: Math.max(1, monthsBetween(d.hoje, g.deadline!.slice(0, 7))), balance: g.balance }))
    .filter((g) => g.months > 0);
  const aporteMensal = Math.max(0, d.sobra > 0 ? d.sobra : d.aporte);

  const plan = useMemo(() => planAporte({
    valor, perfil, reservaMeses: mesesRes, reservaModo: resModo, despesas: d.despesas, reservaAtual: x.reserva.atual, reservaAlvo: !mexeuReserva ? alvoCx : null,
    faltaCaixa, goals, aporteMensal, cdiNet, carteira: d.carteira as Partial<Record<AssetKey, number>>,
  }), [valor, perfil, mesesRes, mexeuReserva, resModo, faltaCaixa, d, x]); // eslint-disable-line react-hooks/exhaustive-deps

  const investido = ASSET_KEYS.reduce((a, k) => a + plan.total[k], 0);
  const wSug = investido > 0 ? normalize(plan.total) : normalize({ ...plan.total, pos: 1 });
  const sSug = stats(wSug, assets), sCdi = stats({ ...ASSET_KEYS.reduce((a, k) => ({ ...a, [k]: 0 }), {} as Weights), pos: 1 }, assets);

  // Projeção de 5 anos do valor investido (sem novos aportes): sugestão × tudo no pós-fixado
  const H = 60;
  const scen = useMemo(() => scenarios(assets, H, 500, 11), [assets]);
  const proj = useMemo(() => {
    const paths = scen.map((arr) => { let v = investido; const out = [v]; for (let m = 0; m < H; m++) { let r = 0; ASSET_KEYS.forEach((k, i) => { r += wSug[k] * arr[m * ASSET_KEYS.length + i]; }); v *= 1 + r; out.push(v); } return out; });
    const q = (p: number) => Array.from({ length: H + 1 }, (_, m) => { const s = paths.map((x) => x[m]).sort((a, b) => a - b); return s[Math.floor(p * (s.length - 1))]; });
    const cdi = Array.from({ length: H + 1 }, (_, m) => investido * Math.pow(1 + assets[0].ret, m / 12));
    return { p10: q(0.1), p50: q(0.5), p90: q(0.9), cdi };
  }, [scen, investido, wSug, assets]);
  const ir = (gross: number) => investido + (gross - investido) * 0.85;

  // ---------- Onde aplicar: produtos concretos por classe ----------
  const rfPick = (index: string, years: number) => {
    const l = x.rf.filter((r) => r.index === index && !/juros semestrais|renda\+|educa/i.test(r.name));
    if (!l.length) return null;
    const alvo = Date.now() + years * 365 * 86400000;
    return [...l].sort((a, b) => Math.abs(Date.parse(a.maturity) - alvo) - Math.abs(Date.parse(b.maturity) - alvo))[0];
  };
  const objMeses = Math.max(36, ...plan.camadas.filter((c) => c.tom === "objetivo").map((c) => goals.find((g) => `obj-${g.id}` === c.key)?.months ?? 0));
  const held = (k: string) => (d.holdings ?? []).filter((h) => h.k === k).sort((a, b) => b.value - a.value);
  const nPicks = (v: number) => (v < 3000 ? 1 : v < 8000 ? 2 : v < 20000 ? 3 : 4);

  function variavel(k: "acoes" | "fii" | "exterior" | "cripto", v: number): Pick[] {
    if (v < 50) return [];
    const kinds = k === "acoes" ? ["acao"] : k === "fii" ? ["fii"] : ["etf", "bdr"];
    const cands: { t: string; porque: string }[] = [];
    // 1) suas análises: na lista de acompanhamento e no preço de compra que você definiu
    for (const w of x.watch.filter((w) => w.kind && kinds.includes(w.kind) && w.price && w.buy && w.price <= w.buy * 1.02))
      cands.push({ t: w.ticker, porque: `na sua lista: preço ${brl(w.price!, 2)} ≤ seu alvo de compra ${brl(w.buy!, 2)}${w.score != null ? ` · nota ${w.score} no Radar` : ""}` });
    // 2) o que você já tem, com nota boa no Radar (ou maior posição, para FIIs/exterior)
    for (const h of held(k)) {
      const sc = x.scores[h.ticker];
      if (k === "acoes" && sc != null && sc < 55) continue;
      cands.push({ t: h.ticker, porque: `já na carteira (${brl(h.value)})${sc != null ? ` · nota ${sc} no Radar` : ""}` });
    }
    // 3) destaques do Radar (ações)
    if (k === "acoes") for (const r of x.radarTop) cands.push({ t: r.ticker, porque: `destaque do Radar · nota ${r.score}${r.reasons.length ? ` · ${r.reasons.join(", ")}` : ""}` });
    // 4) padrão da classe
    if (k === "fii") cands.push({ t: "XFIX11", porque: "fundo de índice de FIIs (diversifica em um só ativo)" });
    if (k === "exterior") cands.push({ t: "IVVB11", porque: "S&P 500 em reais, na B3" });
    if (k === "cripto") cands.push({ t: "HASH11", porque: "cesta de criptomoedas na B3" });
    const seen = new Set<string>(), uniq = cands.filter((c) => !seen.has(c.t) && seen.add(c.t));
    const pick = uniq.slice(0, k === "acoes" ? nPicks(v) : 1);
    const each = round50(v / pick.length);
    return pick.map((p, i) => ({ ativo: p.t, valor: i === pick.length - 1 ? Math.round(v - each * (pick.length - 1)) : each, porque: p.porque }));
  }

  const linhas = ASSET_KEYS.filter((k) => plan.total[k] >= 50).map((k) => {
    const v = plan.total[k], a = assets[ASSET_KEYS.indexOf(k)];
    let picks: Pick[] = [];
    if (k === "pos") { const s = rfPick("selic", 2); picks = [{ ativo: s ? s.name : "Tesouro Selic", valor: Math.round(v), porque: `resgate no mesmo dia útil · ou CDB/conta remunerada ≥ 100% do CDI com liquidez diária` }]; }
    if (k === "lci") picks = [{ ativo: "LCI / LCA", valor: Math.round(v), porque: "isentas de IR; aceite a partir de ~90% do CDI e carência que caiba no prazo" }];
    if (k === "ipca") { const s = rfPick("ipca", objMeses / 12); picks = [{ ativo: s ? s.name : "Tesouro IPCA+", valor: Math.round(v), porque: s ? `IPCA + ${s.rate.toLocaleString("pt-BR")}% a.a., vence ${new Date(s.maturity).getFullYear()} · leve até o vencimento para garantir a taxa` : "proteção contra inflação" }]; }
    if (k === "pre") { const s = rfPick("pre", 4); picks = [{ ativo: s ? s.name : "Tesouro Prefixado", valor: Math.round(v), porque: s ? `${s.rate.toLocaleString("pt-BR")}% a.a. travados até ${new Date(s.maturity).getFullYear()}` : "taxa travada" }]; }
    if (k === "acoes" || k === "fii" || k === "exterior" || k === "cripto") picks = variavel(k, v);
    return { k, label: a.label, liq: a.liq, v, picks };
  });

  const caixa = plan.camadas.find((c) => c.tom === "caixa")?.valor ?? 0;
  const reserva = plan.camadas.find((c) => c.tom === "reserva")?.valor ?? 0;
  const objetivos = plan.camadas.filter((c) => c.tom === "objetivo").reduce((a, c) => a + c.valor, 0);
  const longo = plan.camadas.find((c) => c.tom === "longo")?.valor ?? 0;
  const rv = (["acoes", "fii", "exterior", "cripto"] as AssetKey[]).reduce((a, k) => a + plan.total[k], 0);
  const label = (m: number) => (m === 0 ? "hoje" : m % 12 === 0 ? `${m / 12} ano${m > 12 ? "s" : ""}` : `${m}m`);

  const inputs = (
    <>
      <Field label="Quanto tenho para investir agora" value={valor} onChange={(v) => setValor(Math.max(0, v))} max={Math.max(200_000, valor * 2)} step={500} />
      <Choice<Perfil> label="Quanto risco aceito no longo prazo" value={perfil} onChange={setPerfil} options={[["conservador", "Menos"], ["moderado", "Médio"], ["arrojado", "Mais"]]} />
      <Field label="Reserva de emergência" value={mesesRes} onChange={(v) => setMesesRes(Math.max(0, Math.round(v)))} kind="months" max={12} step={1} hint={x.reserva.fonte === "caixinha" && x.reserva.alvo ? `caixinha: alvo ${brl(x.reserva.alvo)}` : "meses de gastos"} />
      <Choice<"primeiro" | "equilibrar"> label="Reserva de emergência incompleta" value={resModo} onChange={setResModo} options={[["primeiro", "Completar antes de tudo"], ["equilibrar", "Dividir com o resto"]]} />
      <label className="flex items-start gap-2 text-[13px] text-ink/65">
        <input type="checkbox" className="mt-0.5 accent-[#7a5c32]" checked={usarAgenda} onChange={(e) => setUsarAgenda(e.target.checked)} />
        <span>Guardar na conta o que falta para os compromissos da agenda nos próximos 35 dias</span>
      </label>
      {x.banco.saldo != null && (
        <label className="flex items-start gap-2 text-[13px] text-ink/65">
          <input type="checkbox" className="mt-0.5 accent-[#7a5c32]" checked={naConta} onChange={(e) => setNaConta(e.target.checked)} />
          <span>Esse valor já está no saldo da conta ({brl(x.banco.saldo)} no Open Finance)</span>
        </label>
      )}
      <div className="rounded-xl bg-ink/[0.03] p-3 text-[12px] leading-relaxed text-ink/60">
        <div className="mb-1 font-medium text-ink/75">O que a plataforma considerou</div>
        Gastos médios: <b>{brl(d.despesas)}</b>/mês · sobra média: <b>{brl(d.sobra)}</b>/mês<br />
        Reserva: <b>{brl(x.reserva.atual)}</b> {x.reserva.fonte === "caixinha" ? `(caixinha “${x.reserva.nome}”)` : x.reserva.fonte === "carteira" ? "(pós-fixado da carteira)" : "(nenhuma cadastrada)"}<br />
        Próximos 35 dias (agenda): +{brl(x.agenda.receber)} a receber · −{brl(x.agenda.contas)} contas · −{brl(x.agenda.cartoes)} cartões<br />
        Objetivos com prazo: <b>{goals.length}</b> · carteira atual: <b>{brl(Object.values(d.carteira).reduce((a, v) => a + v, 0))}</b><br />
        Suas análises: <b>{x.watch.length}</b> ativo(s) na lista de acompanhamento · Radar com notas da B3
      </div>
    </>
  );

  return (
    <Layout inputs={inputs}>
      <Answer sub={<>Retorno esperado da divisão: <Hi>{pct(sSug.ret)}</Hi> a.a. líquido (tudo no pós-fixado: {pct(sCdi.ret)}). {rv > 0 ? <>Em um ano ruim (1 em 10), o investido poderia estar em torno de <Hi tone="bad">{brl(ir(proj.p10[12]))}</Hi> depois de 12 meses.</> : "Sem renda variável: o valor não oscila para baixo."}</>}>
        Dos <Hi>{brl(valor)}</Hi>:{" "}
        {[caixa && <span key="c">{brl(caixa)} ficam na conta</span>, reserva && <span key="r">{brl(reserva)} completam a reserva</span>, objetivos && <span key="o">{brl(objetivos)} vão para objetivos atrasados</span>, longo && <span key="l">{brl(longo)} para o longo prazo</span>]
          .filter(Boolean).reduce<React.ReactNode[]>((a, el, i, arr) => [...a, i ? (i === arr.length - 1 ? " e " : ", ") : "", el], [])}.
      </Answer>

      {/* Divisão em camadas */}
      <section className="card">
        <h2>Por que essa divisão</h2>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full">
          {plan.camadas.map((c) => <div key={c.key} style={{ width: `${(c.valor / Math.max(1, valor)) * 100}%`, background: TOM[c.tom] }} title={`${c.titulo}: ${brl(c.valor)}`} />)}
        </div>
        <div className="mt-4 space-y-3">
          {plan.camadas.map((c, i) => (
            <div key={c.key} className="rounded-xl border border-ink/[0.07] bg-white p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex items-center gap-2 font-medium"><span className="grid h-5 w-5 place-items-center rounded-full text-[11px] text-white" style={{ background: TOM[c.tom] }}>{i + 1}</span>{c.titulo}</span>
                <span className="tabular-nums font-semibold">{brl(c.valor)}</span>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink/60">{c.motivo}</p>
            </div>
          ))}
          {!plan.camadas.length && <Note>Informe um valor para ver a sugestão.</Note>}
        </div>
      </section>

      {/* Onde aplicar */}
      {linhas.length > 0 && (
        <section className="card">
          <h2>Onde aplicar</h2>
          <p className="mt-0.5 text-xs text-ink/45">Somando todas as camadas. Ativos de renda variável vêm das suas análises: lista de acompanhamento, carteira e Radar.</p>
          <div className="mt-3 space-y-3">
            {linhas.map((l) => (
              <div key={l.k} className="rounded-xl border border-ink/[0.07] bg-white p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium"><span className="h-2.5 w-2.5 rounded-full" style={{ background: assets[ASSET_KEYS.indexOf(l.k)].color }} />{l.label}</span>
                  <span className="text-sm"><b className="tabular-nums">{brl(l.v)}</b> <span className="text-ink/40">· {pct(l.v / Math.max(1, investido), 0)} · {l.liq}</span></span>
                </div>
                <div className="mt-1.5 space-y-1">
                  {l.picks.map((p) => (
                    <div key={p.ativo} className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-ink/5 pt-1 text-[13px]">
                      <span className="min-w-0"><b>{p.ativo}</b> <span className="text-ink/50">— {p.porque}</span></span>
                      <span className="shrink-0 tabular-nums">{brl(p.valor)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Projeção */}
      {investido > 0 && (
        <section className="card">
          <h2>Em 5 anos, sem novos aportes</h2>
          <p className="mt-0.5 text-xs text-ink/45">500 cenários de mercado com as premissas de hoje (CDI {pct(d.cdi / 100)}, IPCA {pct(d.ipca)}). Valores brutos de IR.</p>
          <div className="mt-3">
            <LineChart xLabel={label} series={[
              { label: "Sugestão · cenário central", color: "#8d5a14", values: proj.p50, area: true },
              { label: "Sugestão · cenário ruim (1 em 10)", color: "#a2412f", values: proj.p10, dashed: true },
              { label: "Sugestão · cenário bom (1 em 10)", color: "#4e6a47", values: proj.p90, dashed: true },
              { label: "Tudo no pós-fixado", color: "#3f6aa8", values: proj.cdi },
            ]} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            {[12, 36, 60].map((m) => (
              <div key={m}><div className="label">{label(m)}</div><div className="font-semibold tabular-nums">{compact(proj.p50[m])}</div><div className="text-[11px] text-ink/45">pós-fixado: {compact(proj.cdi[m])}</div></div>
            ))}
            <div><div className="label">Oscilação</div><div className="font-semibold">{pct(sSug.vol, 0)} a.a.</div><div className="text-[11px] text-ink/45">{rv > 0 ? `${pct(rv / investido, 0)} em renda variável` : "só renda fixa"}</div></div>
          </div>
        </section>
      )}

      {x.agenda.itens.length > 0 && (
        <section className="card">
          <h2>Compromissos dos próximos 35 dias</h2>
          <p className="mt-0.5 text-xs text-ink/45">Da agenda, ainda não pagos. {x.banco.saldo != null ? `Saldo na conta: ${brl(x.banco.saldo)}${naConta ? ` (sem os ${brl(valor)} a investir: ${brl(saldoLivre ?? 0)})` : ""}.` : "Conecte o Open Finance para considerar o saldo da conta."}</p>
          <div className="mt-2 space-y-0.5 text-[13px]">
            {x.agenda.itens.slice(0, 12).map((i, k) => (
              <div key={k} className="flex justify-between gap-3 border-b border-ink/5 py-0.5">
                <span className="text-ink/70">{ddmm(i.date)} · {i.label}</span>
                <span className={`tabular-nums ${i.tipo === "receita" ? "text-gain" : ""}`}>{i.tipo === "receita" ? "+" : "−"}{brl(i.amount)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <Note>Sugestão automática feita com os seus dados e critérios objetivos (reserva primeiro, depois prazos dos objetivos, depois reequilíbrio da carteira pelo perfil). Não é recomendação individual de investimento; confira taxas, carência e liquidez de cada produto antes de aplicar.</Note>
    </Layout>
  );
}
