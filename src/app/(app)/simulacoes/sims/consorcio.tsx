"use client";

import { useMemo, useState } from "react";
import { acquire } from "@/lib/sim/finance";
import { Answer, brl, compact, Field, Hi, Layout, Note, pct, years } from "@/components/sim/kit";
import type { SimData } from "./types";

export function ConsorcioSim({ d }: { d: SimData }) {
  const veh = d.credit.mods.veiculos;
  const [priceV, setPrice] = useState(120_000);
  const [down, setDown] = useState(24_000);
  const [finM, setFinM] = useState(veh ? +veh.median.toFixed(4) : 0.019);
  const [finMonths, setFinMonths] = useState(48);
  const [fee, setFee] = useState(0.16);
  const [reserve, setReserve] = useState(0.02);
  const [consMonths, setConsMonths] = useState(72);
  const [contemp, setContemp] = useState(36);
  const [growth, setGrowth] = useState(+d.ipca.toFixed(3));
  const [inv, setInv] = useState(+d.cdiNet.toFixed(3));

  const r = useMemo(() => acquire({ price: priceV, down, finMonthly: finM, finMonths, consFeePct: fee, consReservePct: reserve, consMonths, consContemplation: contemp, priceGrowth: growth, investAnnual: inv }),
    [priceV, down, finM, finMonths, fee, reserve, consMonths, contemp, growth, inv]);
  const opts = [
    { k: "fin", label: "Financiar", total: r.fin.total, have: "hoje", pmt: `${finMonths} × ${brl(r.fin.pmt)}`, extra: `entrada ${brl(down)} · juros ${compact(r.fin.juros)}` },
    { k: "cons", label: "Consórcio", total: r.cons.total, have: `em ~${years(contemp)} (sorteio ou lance)`, pmt: `${consMonths} × ~${brl(r.cons.pmt)}`, extra: `taxa de adm. ${pct(fee, 0)} + fundo ${pct(reserve, 0)} · parcela reajusta com o bem` },
    { k: "save", label: "Juntar e comprar à vista", total: r.save.total ?? Infinity, have: r.save.months !== null ? `em ${years(r.save.months)}` : "não chega", pmt: `${brl(r.fin.pmt)}/mês investido`, extra: `o bem estará em ${compact(r.save.price)} · rendendo ${pct(inv)} líquido` },
  ];
  const cheapest = [...opts].sort((a, b) => a.total - b.total)[0];
  const max = Math.max(...opts.map((o) => (isFinite(o.total) ? o.total : 0)));

  return (
    <Layout inputs={<>
      <Field label="Valor do bem hoje" value={priceV} onChange={setPrice} max={2_000_000} step={1000} />
      <Field label="Dinheiro que você já tem (entrada)" value={down} onChange={setDown} max={priceV} step={1000} />
      <Field label="Juros do financiamento (a.m.)" value={finM} onChange={setFinM} kind="pct" max={0.05} step={0.0005} hint={veh ? "mediana de veículos (BC)" : undefined} />
      <Field label="Prazo do financiamento" value={finMonths} onChange={setFinMonths} kind="months" min={12} max={420} step={6} />
      <Field label="Taxa de administração do consórcio (total)" value={fee} onChange={setFee} kind="pct" max={0.3} step={0.005} />
      <Field label="Fundo de reserva" value={reserve} onChange={setReserve} kind="pct" max={0.05} step={0.005} />
      <Field label="Prazo do consórcio" value={consMonths} onChange={setConsMonths} kind="months" min={12} max={240} step={6} />
      <Field label="Quando espera ser contemplado" value={contemp} onChange={setContemp} kind="months" min={1} max={consMonths} />
      <Field label="Reajuste do preço do bem (a.a.)" value={growth} onChange={setGrowth} kind="pct" max={0.15} />
      <Field label="Rendimento do que você investe (líquido)" value={inv} onChange={setInv} kind="pct" max={0.2} />
    </>}>
      <Answer sub={<>Financiar entrega o bem hoje, ao custo de {compact(r.fin.juros)} em juros. Juntando a mesma parcela, você compra à vista {r.save.months !== null ? `em ${years(r.save.months)}` : "só num prazo muito longo"}.</>}>
        Mais barato no total: <Hi>{cheapest.label.toLowerCase()}</Hi> ({compact(cheapest.total)}).{cheapest.k !== "fin" ? <> Financiar custa <Hi tone="bad">{compact(r.fin.total - cheapest.total)}</Hi> a mais pela pressa.</> : null}
      </Answer>
      <section className="grid gap-4 md:grid-cols-3">
        {opts.map((o) => (
          <div key={o.k} className={`card flex flex-col gap-2 ${o.k === cheapest.k ? "ring-2 ring-[#4f7a52]/40" : ""}`}>
            <div className="flex items-baseline justify-between gap-2"><h3 className="text-[16px] font-semibold">{o.label}</h3>{o.k === cheapest.k && <span className="text-[11px] font-semibold uppercase tracking-wider text-gain">mais barato</span>}</div>
            <div className="display text-[30px] leading-none">{isFinite(o.total) ? compact(o.total) : "—"}</div>
            <div className="h-2 rounded-full bg-ink/[0.06]"><div className="h-2 rounded-full bg-[#b8955a]" style={{ width: `${isFinite(o.total) ? (o.total / max) * 100 : 0}%` }} /></div>
            <div className="text-sm"><b>Tem o bem:</b> {o.have}</div>
            <div className="text-sm text-ink/65">{o.pmt}</div>
            <div className="text-[12px] text-ink/50">{o.extra}</div>
          </div>
        ))}
      </section>
      <Note>Totais em valores nominais (soma do que você paga). No consórcio, a carta e a parcela são reajustadas pelo preço do bem; a contemplação por sorteio é incerta e o lance antecipa usando dinheiro seu. Não inclui seguros nem IOF.</Note>
    </Layout>
  );
}
