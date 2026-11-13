"use client";

import { useMemo, useState } from "react";
import { leverage, toAnnual } from "@/lib/sim/finance";
import { Answer, brl, compact, Field, Hi, Layout, LineChart, Note, pct } from "@/components/sim/kit";
import type { SimData } from "./types";

type Dest = { id: string; label: string; annual: number; vol: number };

export function AlavancagemSim({ d, init }: { d: SimData; init: { valor?: number; prazo?: number; taxa?: number } }) {
  const [amount, setAmount] = useState(init.valor ?? 200_000);
  const [months, setMonths] = useState(init.prazo ?? 60);
  const [rate, setRate] = useState(init.taxa ?? 0.0115);
  const [income, setIncome] = useState(0);
  const [dests, setDests] = useState<Dest[]>([
    { id: "cdi", label: "Deixar no CDI", annual: +d.cdiNet.toFixed(3), vol: 0 },
    { id: "acoes", label: "Carteira de ações", annual: 0.16, vol: 0.2 },
    { id: "negocio", label: "Negócio ou ativo", annual: 0.22, vol: 0.15 },
  ]);
  const [sel, setSel] = useState("negocio");
  const res = useMemo(() => dests.map((x) => ({
    x, mid: leverage(amount, rate, months, x.annual),
    lo: leverage(amount, rate, months, x.annual - x.vol), hi: leverage(amount, rate, months, x.annual + x.vol),
  })), [dests, amount, rate, months]);
  const cur = res.find((r) => r.x.id === sel) ?? res[0];
  const be = toAnnual(rate), pmt = cur.mid.pmt;
  const span = Math.max(1, ...res.flatMap((r) => [Math.abs(r.lo.diff), Math.abs(r.hi.diff)]));
  const pos = (v: number) => 50 + (v / span) * 48;
  const upd = (id: string, k: "annual" | "vol" | "label", v: number | string) => setDests((ds) => ds.map((x) => (x.id === id ? { ...x, [k]: v } : x)));
  const step = months > 120 ? 12 : 3;
  const pts = cur.mid.series.filter((_, i) => i % step === 0 || i === months);

  return (
    <Layout inputs={<>
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink/50">A dívida</h2>
      <Field label="Valor captado" value={amount} onChange={setAmount} max={2_000_000} step={5000} />
      <Field label="Prazo" value={months} onChange={setMonths} kind="months" min={6} max={240} />
      <Field label="Custo da dívida ao mês" value={rate} onChange={setRate} kind="pct" max={0.08} step={0.0005} hint={`= ${pct(be)} a.a.`} />
      <h2 className="mt-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink/50">O destino</h2>
      <Field label="Renda mensal que o destino gera" value={income} onChange={setIncome} max={50_000} step={100} hint="aluguel, lucro… (opcional)" />
      <div className="rounded-xl bg-paper px-4 py-3">
        <div className="text-[13px] text-ink/60">Ponto de equilíbrio</div>
        <div className="display text-[34px] leading-none">{pct(be)} a.a.</div>
        <div className="mt-1 text-[12px] text-ink/50">Retorno líquido mínimo que o destino precisa entregar para a dívida empatar.</div>
      </div>
    </>}>
      <Answer sub={<>Parcela de {brl(pmt)} por {months} meses.{income > 0 ? <> A renda do destino cobre {(income / pmt).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}× a parcela{income / pmt < 1.2 ? " — abaixo de 1,2×, parte sai da sua renda." : "."}</> : null} Faixa pessimista para {cur.x.label.toLowerCase()}: {compact(cur.lo.diff)}.</>}>
        {cur.mid.diff >= 0
          ? <>Captar {compact(amount)} a {pct(be)} a.a. para <Hi>{cur.x.label.toLowerCase()}</Hi> (rendendo {pct(cur.x.annual)}) cria <Hi tone="good">{compact(cur.mid.diff)}</Hi> a mais em {months} meses do que não se endividar.</>
          : <>Captar {compact(amount)} a {pct(be)} a.a. para <Hi>{cur.x.label.toLowerCase()}</Hi> (rendendo {pct(cur.x.annual)}) <Hi tone="bad">destrói {compact(-cur.mid.diff)}</Hi>. Só vale se o destino render acima de {pct(be)} líquido.</>}
      </Answer>

      <section className="card">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2>Ganho ou perda da alavancagem</h2><span className="text-[12px] text-ink/50">barra: provável · traço: pessimista a otimista · clique para ver no gráfico</span></div>
        <div className="space-y-3">
          {res.map((r) => (
            <button type="button" key={r.x.id} onClick={() => setSel(r.x.id)} className={`grid w-full grid-cols-[minmax(0,200px)_minmax(0,1fr)_110px] items-center gap-3 rounded-xl px-2 py-1.5 text-left ${sel === r.x.id ? "bg-paper" : ""}`}>
              <span><b className="block text-[14px]">{r.x.label}</b><span className="text-[12px] text-ink/50">{pct(r.x.annual)} a.a.{r.x.vol ? ` · ±${pct(r.x.vol, 0)}` : ""}</span></span>
              <span className="relative block h-8 rounded-lg bg-ink/[0.04]">
                <span className="absolute inset-y-[-3px] left-1/2 w-px bg-ink/35" />
                <span className="absolute top-[15px] h-[2px] bg-ink/30" style={{ left: `${Math.min(pos(r.lo.diff), pos(r.hi.diff))}%`, width: `${Math.abs(pos(r.hi.diff) - pos(r.lo.diff))}%` }} />
                <span className="absolute top-[7px] h-[18px] rounded" style={{ left: `${Math.min(50, pos(r.mid.diff))}%`, width: `${Math.abs(pos(r.mid.diff) - 50)}%`, background: r.mid.diff >= 0 ? "#4f7a52" : "#a33f30" }} />
              </span>
              <span className={`text-right font-semibold tabular-nums ${r.mid.diff >= 0 ? "text-gain" : "text-loss"}`}>{r.mid.diff >= 0 ? "+" : ""}{compact(r.mid.diff)}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 border-t border-ink/[0.07] pt-4 sm:grid-cols-3">
          {dests.map((x) => (
            <div key={x.id} className="flex flex-col gap-1.5">
              <input aria-label="Nome do destino" className="input !py-1.5 font-medium" defaultValue={x.label} onBlur={(e) => upd(x.id, "label", e.target.value || x.label)} />
              <div className="flex gap-2">
                <label className="flex-1 text-[11px] text-ink/50">Retorno a.a. %<input inputMode="decimal" className="input !py-1.5 tabular-nums" defaultValue={String(+(x.annual * 100).toFixed(2)).replace(".", ",")} onBlur={(e) => { const n = Number(e.target.value.replace(",", ".")); if (isFinite(n)) upd(x.id, "annual", n / 100); }} /></label>
                <label className="flex-1 text-[11px] text-ink/50">Incerteza ± %<input inputMode="decimal" className="input !py-1.5 tabular-nums" defaultValue={String(+(x.vol * 100).toFixed(1)).replace(".", ",")} onBlur={(e) => { const n = Number(e.target.value.replace(",", ".")); if (isFinite(n)) upd(x.id, "vol", Math.abs(n) / 100); }} /></label>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3">{cur.x.label}: com dívida × sem dívida</h2>
        <LineChart xLabel={(i) => `${Math.round((pts[i]?.m ?? 0))}m`} series={[
          { label: "Com dívida (investe tudo hoje, paga as parcelas)", color: "#7a5c32", values: pts.map((p) => p.withDebt), area: true },
          { label: "Sem dívida (investe a parcela todo mês)", color: "#8a9a7b", values: pts.map((p) => p.without) },
        ]} />
        <Note>Os dois caminhos têm o mesmo esforço mensal (a parcela). Retornos esperados são premissas suas, não garantia: a parcela é fixa, o retorno não — por isso a faixa pessimista importa.</Note>
      </section>
    </Layout>
  );
}
