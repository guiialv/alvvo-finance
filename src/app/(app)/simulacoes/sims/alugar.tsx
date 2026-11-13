"use client";

import { useMemo, useState } from "react";
import { rentVsBuy, toAnnual } from "@/lib/sim/finance";
import { Answer, brl, Choice, compact, Field, Hi, Layout, LineChart, Note, pct } from "@/components/sim/kit";
import type { SimData } from "./types";

export function AlugarSim({ d }: { d: SimData }) {
  const imob = d.credit.mods.imobiliario;
  const [priceV, setPrice] = useState(800_000);
  const [rent, setRent] = useState(3_600);
  const [financed, setFinanced] = useState<"fin" | "vista">("fin");
  const [downPct, setDown] = useState(0.2);
  const [fin, setFin] = useState(imob ? +toAnnual(imob.median).toFixed(3) : 0.12);
  const [finMonths, setFinMonths] = useState(360);
  const [system, setSystem] = useState<"sac" | "price">("sac");
  const [costs, setCosts] = useState(0.05);
  const [maint, setMaint] = useState(0.005);
  const [app, setApp] = useState(+d.ipca.toFixed(3));
  const [rentG, setRentG] = useState(+d.ipca.toFixed(3));
  const [inv, setInv] = useState(+d.cdiNet.toFixed(3));
  const [yrs, setYrs] = useState(15);

  const r = useMemo(() => rentVsBuy({ price: priceV, rent, downPct, finAnnual: fin, finMonths, system, buyCostsPct: costs, maintPct: maint, appreciation: app, rentGrowth: rentG, investAnnual: inv, years: yrs, financed: financed === "fin" }),
    [priceV, rent, downPct, fin, finMonths, system, costs, maint, app, rentG, inv, yrs, financed]);
  const winner = r.buy >= r.rent ? "comprar" : "alugar";
  const yieldRent = (rent * 12) / priceV;

  return (
    <Layout inputs={<>
      <Field label="Preço do imóvel" value={priceV} onChange={setPrice} max={5_000_000} step={10_000} />
      <Field label="Aluguel de um imóvel equivalente" value={rent} onChange={setRent} max={30_000} step={100} hint={`${pct(yieldRent / 12, 2)} do preço ao mês`} />
      <Choice label="Compra" value={financed} onChange={setFinanced} options={[["fin", "Financiada"], ["vista", "À vista"]]} />
      {financed === "fin" && <>
        <Field label="Entrada" value={downPct} onChange={setDown} kind="pct" min={0.1} max={0.9} step={0.01} hint={brl(priceV * downPct)} />
        <Field label="Juros do financiamento (a.a.)" value={fin} onChange={setFin} kind="pct" max={0.2} hint={imob ? "mediana dos bancos (BC)" : undefined} />
        <Field label="Prazo do financiamento" value={finMonths} onChange={setFinMonths} kind="months" min={60} max={420} step={12} />
        <Choice label="Sistema" value={system} onChange={setSystem} options={[["sac", "SAC"], ["price", "Price"]]} />
      </>}
      <Field label="ITBI, cartório e custos da compra" value={costs} onChange={setCosts} kind="pct" max={0.1} step={0.005} hint={brl(priceV * costs)} />
      <Field label="Manutenção do dono (a.a. do valor)" value={maint} onChange={setMaint} kind="pct" max={0.03} step={0.001} />
      <Field label="Valorização do imóvel (a.a.)" value={app} onChange={setApp} kind="pct" max={0.15} />
      <Field label="Reajuste do aluguel (a.a.)" value={rentG} onChange={setRentG} kind="pct" max={0.15} />
      <Field label="Rendimento do dinheiro investido (líquido)" value={inv} onChange={setInv} kind="pct" max={0.2} hint="CDI líquido" />
      <Field label="Horizonte" value={yrs} onChange={setYrs} kind="years" min={1} max={35} />
    </>}>
      <Answer sub={<>Em {yrs} anos: comprando, patrimônio de {compact(r.buy)}; alugando e investindo a diferença, {compact(r.rent)}. {financed === "fin" ? <>Primeira parcela {brl(r.firstPmt)} · juros pagos {compact(r.totalInterest)}.</> : null} Aluguéis pagos: {compact(r.totalRent)}.</>}>
        {winner === "comprar"
          ? <>Comprar vale mais a pena: <Hi tone="good">{compact(r.buy - r.rent)}</Hi> a mais em {yrs} anos{r.breakEven !== null ? <>, passando o aluguel no <Hi>ano {r.breakEven}</Hi></> : ""}.</>
          : <>Alugar e investir a diferença vale mais: <Hi tone="good">{compact(r.rent - r.buy)}</Hi> a mais em {yrs} anos. {r.breakEven === null ? <>Comprar não empata nesse horizonte.</> : null}</>}
      </Answer>
      <section className="card">
        <h2 className="mb-3">Patrimônio ano a ano</h2>
        <LineChart xLabel={(i) => `${r.years[i]?.year ?? i}a`} marker={r.breakEven !== null ? { index: r.breakEven, label: "comprar passa a valer" } : null} series={[
          { label: "Comprando (imóvel − saldo devedor + sobras investidas)", color: "#7d5f36", values: r.years.map((y) => y.buy), area: true },
          { label: "Alugando e investindo a diferença", color: "#8a9a7b", values: r.years.map((y) => y.rent) },
        ]} />
        <Note>Quem compra paga entrada, custos e parcelas; quem aluga investe a entrada e os custos, e todo mês investe o que gastaria a mais como dono (ou o contrário, se o aluguel for maior). Condomínio e IPTU ficam fora por pesarem nos dois casos. Não considera FGTS nem o valor de não precisar mudar.</Note>
      </section>
    </Layout>
  );
}
