"use client";

import { useMemo, useState } from "react";
import { monthsToTarget, projectGoal, requiredPmt } from "@/lib/sim/finance";
import { Answer, brl, Choice, compact, Field, Hi, Layout, LineChart, Note, pct, years } from "@/components/sim/kit";
import type { SimData } from "./types";

type Ask = "prazo" | "aporte" | "valor";

export function MetaSim({ d }: { d: SimData }) {
  const [ask, setAsk] = useState<Ask>("prazo");
  const [pv, setPv] = useState(Math.round(d.patrimonio));
  const [pmt, setPmt] = useState(Math.max(500, Math.round(d.aporte / 100) * 100 || 2000));
  const [rate, setRate] = useState(+(d.cdiNet).toFixed(3));
  const [inf, setInf] = useState(+d.ipca.toFixed(3));
  const [target, setTarget] = useState(1_000_000);
  const [yrs, setYrs] = useState(15);
  const [growth, setGrowth] = useState(+d.ipca.toFixed(3));
  const [real, setReal] = useState<"real" | "nominal">("real");
  const isReal = real === "real";

  const base = { pv, annualRate: rate, inflation: inf, pmtGrowth: growth };
  const r = useMemo(() => {
    if (ask === "prazo") {
      const m = monthsToTarget({ ...base, pmt }, target, isReal);
      return { months: m, pmt, series: projectGoal({ ...base, pmt, months: Math.min(1200, (m ?? 480) + 12) }) };
    }
    if (ask === "aporte") {
      const need = requiredPmt({ ...base, months: yrs * 12 }, target, isReal);
      return { months: yrs * 12, pmt: need, series: projectGoal({ ...base, pmt: need, months: yrs * 12 }) };
    }
    return { months: yrs * 12, pmt, series: projectGoal({ ...base, pmt, months: yrs * 12 }) };
  }, [ask, pv, pmt, rate, inf, target, yrs, growth, isReal]); // eslint-disable-line react-hooks/exhaustive-deps

  // no modo "em quanto tempo", o resumo é do mês em que a meta é atingida (o gráfico segue um ano além)
  const last = ask === "prazo" && r.months !== null ? r.series[Math.min(r.months, r.series.length - 1)] : r.series[r.series.length - 1];
  const val = (p: { real: number; nominal: number }) => (isReal ? p.real : p.nominal);
  const step = r.series.length > 241 ? 12 : r.series.length > 61 ? 3 : 1;
  const pts = r.series.filter((_, i) => i % step === 0 || i === r.series.length - 1);
  const hitIdx = ask === "prazo" && r.months !== null ? pts.findIndex((p) => p.month >= r.months!) : -1;

  return (
    <Layout inputs={<>
      <Choice<Ask> label="Quero descobrir" value={ask} onChange={setAsk} options={[["prazo", "Em quanto tempo chego"], ["aporte", "Quanto aportar por mês"], ["valor", "Quanto terei"]]} />
      <Field label="Já tenho" value={pv} onChange={setPv} max={Math.max(2_000_000, pv * 2)} hint={d.patrimonio ? "seu patrimônio hoje" : undefined} />
      {ask !== "aporte" && <Field label="Aporte mensal" value={pmt} onChange={setPmt} max={50_000} step={100} hint={d.aporte ? `média recente ${brl(d.aporte)}` : undefined} />}
      {ask !== "valor" && <Field label="Quero chegar a" value={target} onChange={setTarget} max={10_000_000} step={10_000} />}
      {ask !== "prazo" && <Field label="Prazo" value={yrs} onChange={setYrs} kind="years" min={1} max={50} />}
      <Field label="Rentabilidade líquida" value={rate} onChange={setRate} kind="pct" max={0.3} hint={`CDI líquido hoje ${pct(d.cdiNet)}`} />
      <Field label="Inflação" value={inf} onChange={setInf} kind="pct" max={0.15} hint="Focus" />
      <Field label="Reajuste anual do aporte" value={growth} onChange={setGrowth} kind="pct" max={0.15} />
      <Choice label="Valores em" value={real} onChange={setReal} options={[["real", "Dinheiro de hoje"], ["nominal", "Valor nominal"]]} />
    </>}>
      <Answer sub={<>Você aporta {compact(last.invested)} no total e os juros somam {compact(last.nominal - last.invested)} (valores nominais).</>}>
        {ask === "prazo" && (r.months === null ? <>Com esse aporte você <Hi tone="bad">não chega</Hi> a {compact(target)} em 100 anos. Aumente o aporte ou o prazo.</>
          : <>Você chega a <Hi>{compact(target)}</Hi> em <Hi>{years(r.months)}</Hi>{isReal ? " — em dinheiro de hoje" : ""}.</>)}
        {ask === "aporte" && <>Para ter <Hi>{compact(target)}</Hi> em {yrs} anos, aporte <Hi>{brl(r.pmt)}</Hi> por mês{growth ? `, reajustando ${pct(growth)} ao ano` : ""}.</>}
        {ask === "valor" && <>Em {yrs} anos você terá <Hi>{compact(val(last))}</Hi>{isReal ? " em dinheiro de hoje" : ""} ({compact(last.nominal)} nominais).</>}
      </Answer>
      <section className="card">
        <h2 className="mb-3">Evolução do patrimônio</h2>
        <LineChart xLabel={(i) => `${(pts[i].month / 12).toFixed(pts[i].month % 12 ? 1 : 0).replace(".", ",")}a`}
          marker={hitIdx > 0 ? { index: hitIdx, label: "meta" } : null}
          series={[
            { label: isReal ? "Patrimônio (dinheiro de hoje)" : "Patrimônio", color: "#7a5c32", values: pts.map(val), area: true },
            { label: "Total aportado", color: "#8a9a7b", values: pts.map((p) => p.invested * (isReal ? p.real / p.nominal : 1)), dashed: true },
            ...(ask !== "valor" ? [{ label: "Meta", color: "#1d1915", values: pts.map(() => target), dashed: true }] : []),
          ]} />
      </section>
      <section className="card overflow-x-auto">
        <h2 className="mb-2">Ano a ano</h2>
        <table className="table min-w-[560px]">
          <thead><tr><th>Ano</th><th className="num">Aportado</th><th className="num">Patrimônio nominal</th><th className="num">Em dinheiro de hoje</th></tr></thead>
          <tbody>{r.series.filter((p) => p.month % 12 === 0 && p.month > 0).slice(0, 50).map((p) => (
            <tr key={p.month}><td>{p.month / 12}</td><td className="num">{brl(p.invested)}</td><td className="num">{brl(p.nominal)}</td><td className="num">{brl(p.real)}</td></tr>
          ))}</tbody>
        </table>
        <Note>Aporte no fim de cada mês, juros compostos mensais. Rentabilidade constante — veja o comparador para o efeito de cada produto e dos impostos.</Note>
      </section>
    </Layout>
  );
}
