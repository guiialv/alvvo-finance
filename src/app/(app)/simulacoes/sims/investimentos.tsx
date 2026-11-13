"use client";

import { useMemo, useState } from "react";
import { irRate, ratePathFrom, simulateProduct, type Product, type ProductKind } from "@/lib/sim/finance";
import { Answer, brl, compact, Field, Hi, Layout, LineChart, Note, pct, years } from "@/components/sim/kit";
import type { SimData } from "./types";

const COLORS = ["#7a5c32", "#8a9a7b", "#4a5a73", "#c9973f", "#a36b4f", "#6b6459", "#3d7a74"];
const KIND_LABEL: Record<ProductKind, string> = { cdb: "% do CDI", lci: "% do CDI (isento)", selic: "Selic +", pre: "% a.a.", ipca: "IPCA +", poupanca: "regra da poupança", acoes: "% a.a. (premissa)" };

export function InvestSim({ d, tesouro }: { d: SimData; tesouro: { pre: number | null; ipca: number | null } }) {
  const [pv, setPv] = useState(10_000);
  const [pmt, setPmt] = useState(1_000);
  const [months, setMonths] = useState(36);
  const [prods, setProds] = useState<Product[]>([
    { id: "cdb", kind: "cdb", label: "CDB", rate: 1.0 },
    { id: "lci", kind: "lci", label: "LCI / LCA", rate: 0.9 },
    { id: "selic", kind: "selic", label: "Tesouro Selic", rate: 0.0 },
    { id: "pre", kind: "pre", label: "Tesouro Prefixado", rate: (tesouro.pre ?? d.cdi) / 100 },
    { id: "ipca", kind: "ipca", label: "Tesouro IPCA+", rate: (tesouro.ipca ?? 7) / 100 },
    { id: "poup", kind: "poupanca", label: "Poupança", rate: 0 },
    { id: "acoes", kind: "acoes", label: "Ações (Ibovespa)", rate: 0.14, note: "premissa: retorno esperado, não garantido" },
  ]);
  const path = useMemo(() => ratePathFrom({ cdi: d.cdi, selic: d.selic, focus: d.focus }, Math.ceil(months / 12) + 1), [d, months]);
  const res = useMemo(() => prods.map((p, k) => ({ p, color: COLORS[k % COLORS.length], r: simulateProduct(p, path, pv, pmt, months) })).sort((a, b) => b.r.net - a.r.net), [prods, path, pv, pmt, months]);
  const fixed = res.filter((x) => x.p.kind !== "acoes");
  const best = fixed[0], poup = res.find((x) => x.p.kind === "poupanca");
  const setRate = (id: string, v: number) => setProds((ps) => ps.map((p) => (p.id === id ? { ...p, rate: v } : p)));
  const step = months > 120 ? 12 : months > 36 ? 3 : 1;
  const idx = Array.from({ length: Math.floor(months / step) + 1 }, (_, i) => i * step);
  const shown = (p: Product) => (p.kind === "cdb" || p.kind === "lci" ? p.rate * 100 : p.rate * 100);

  return (
    <Layout inputs={<>
      <Field label="Valor inicial" value={pv} onChange={setPv} max={1_000_000} step={1000} />
      <Field label="Aporte mensal" value={pmt} onChange={setPmt} max={50_000} step={100} />
      <Field label="Prazo" value={months} onChange={setMonths} kind="months" min={1} max={360} />
      <div className="rounded-xl bg-paper px-3 py-2.5 text-[12px] leading-relaxed text-ink/60">
        CDI hoje <b>{d.cdi.toFixed(2).replace(".", ",")}%</b> e Selic projetada pelo Focus nos próximos anos: {path.selic.map((s, i) => `${i ? "" : "hoje "}${(s * 100).toFixed(1).replace(".", ",")}%`).join(" → ")}. IPCA esperado {pct(path.ipca[0])}.
      </div>
      <Note>IR regressivo pelo prazo ({pct(irRate(months * 30.4), 1)} aqui), custódia da B3 de 0,2% a.a. no Tesouro, LCI/LCA e poupança isentas. Ações: 15% sobre o ganho, sem a isenção de vendas até R$ 20 mil/mês.</Note>
    </>}>
      <Answer sub={poup && best ? <>Diferença para a poupança: {compact(best.r.net - poup.r.net)}. Você investe {compact(best.r.invested)} no total.</> : undefined}>
        Em {years(months)}, a melhor renda fixa é <Hi>{best?.p.label}</Hi>: {compact(best?.r.net ?? 0)} líquidos, <Hi>{compact(best?.r.gain ?? 0)}</Hi> de ganho depois de impostos e taxas.
      </Answer>
      <section className="card">
        <h2 className="mb-3">Saldo bruto ao longo do tempo</h2>
        <LineChart xLabel={(i) => `${idx[i]}m`} series={res.map((x) => ({ label: x.p.label, color: x.color, values: idx.map((m) => x.r.series[m]), dashed: x.p.kind === "acoes" }))} />
      </section>
      <section className="card overflow-x-auto">
        <h2 className="mb-2">Do bruto ao líquido</h2>
        <table className="table min-w-[760px]">
          <thead><tr><th>Produto</th><th>Taxa</th><th className="num">Bruto</th><th className="num">IR</th><th className="num">Custódia</th><th className="num">Líquido</th><th className="num">Ganho</th></tr></thead>
          <tbody>{res.map((x, k) => (
            <tr key={x.p.id} className={k === 0 && x.p.kind !== "acoes" ? "bg-[#f3f6ef]" : ""}>
              <td><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: x.color }} /><b>{x.p.label}</b></span>{x.p.note && <span className="block text-[11px] text-ink/45">{x.p.note}</span>}</td>
              <td>{x.p.kind === "poupanca" ? <span className="text-[12px] text-ink/50">{KIND_LABEL.poupanca}</span> : (
                <label className="inline-flex items-center gap-1 text-[12px] text-ink/50">
                  {x.p.kind === "selic" || x.p.kind === "ipca" ? KIND_LABEL[x.p.kind] : ""}
                  <input aria-label={`Taxa de ${x.p.label}`} inputMode="decimal" className="input !w-20 !py-1 text-right tabular-nums" defaultValue={String(+shown(x.p).toFixed(2)).replace(".", ",")}
                    onBlur={(e) => { const n = Number(e.target.value.replace(",", ".")); if (isFinite(n)) setRate(x.p.id, n / 100); }} />
                  {x.p.kind === "selic" || x.p.kind === "ipca" ? "%" : KIND_LABEL[x.p.kind]}
                </label>)}</td>
              <td className="num">{brl(x.r.gross)}</td>
              <td className="num text-loss">{x.r.tax ? `−${brl(x.r.tax)}` : "isento"}</td>
              <td className="num text-ink/55">{x.r.custody ? `−${brl(x.r.custody)}` : "—"}</td>
              <td className="num font-semibold">{brl(x.r.net)}</td>
              <td className="num">{brl(x.r.gain)}</td>
            </tr>
          ))}</tbody>
        </table>
        <Note>Taxas do Tesouro: as de hoje no Tesouro Direto quando disponíveis; edite qualquer taxa para comparar a proposta do seu banco. CDI e Selic seguem as projeções do Focus ano a ano — não ficam constantes.</Note>
      </section>
    </Layout>
  );
}
