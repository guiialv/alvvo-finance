"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { fundingCost, toMonthly, type FundingOption } from "@/lib/sim/finance";
import { Answer, brl, Choice, compact, Field, Hi, Layout, Note, pct } from "@/components/sim/kit";
import type { SimData } from "./types";

type Seg = "PF" | "PJ";
type Bond = "nenhum" | "clt" | "servidor" | "inss";

export function buildOptions(d: SimData, seg: Seg, g: { imovel: boolean; veiculo: boolean; invest: boolean; bond: Bond }, proposal: number | null): FundingOption[] {
  const out: FundingOption[] = [];
  const bc = (key: string, label: string, note: string, requires: string, tone?: "bad") => {
    const m = d.credit.mods[key];
    if (m) out.push({ id: key, label, monthly: m.median, note: `${note} · mediana de ${m.n} bancos (Banco Central)`, requires, source: "bcb", tone, banks: m.best });
  };
  if (seg === "PF") {
    if (g.invest && d.patrimonio > 0) out.push({ id: "proprio", label: "Usar seus investimentos", monthly: toMonthly(d.cdiNet), note: "Custo de oportunidade: o CDI líquido que o dinheiro deixa de render", requires: `Ter o valor investido (você tem ${compact(d.patrimonio)})`, source: "proprio", tone: "good" });
    for (const r of d.reference) {
      if (r.key === "home_equity" && !g.imovel) continue;
      if (r.key === "auto_equity" && !g.veiculo) continue;
      if (r.key === "garantia_invest" && !g.invest) continue;
      out.push({ id: r.key, label: r.label, monthly: r.monthly, note: r.note, requires: r.requires, source: "referencia" });
    }
    if (g.bond === "inss") bc("consignado_inss", "Consignado INSS", "Desconto no benefício", "Aposentado ou pensionista");
    if (g.bond === "servidor") bc("consignado_publico", "Consignado servidor", "Desconto em folha", "Servidor público");
    if (g.bond === "clt") bc("consignado_privado", "Consignado CLT", "Desconto em folha", "Empregado com carteira assinada");
    bc("pessoal", "Crédito pessoal", "Sem garantia", "Análise de crédito");
    bc("cartao_parcelado", "Cartão parcelado com juros", "Parcelamento da fatura", "Cartão de crédito");
    bc("cheque", "Cheque especial", "Evite: só para poucos dias", "Conta corrente", "bad");
    bc("rotativo", "Rotativo do cartão", "Evite: o crédito mais caro do país", "Pagar menos que a fatura", "bad");
  } else {
    if (g.invest && d.patrimonio > 0) out.push({ id: "proprio", label: "Usar caixa / investimentos", monthly: toMonthly(d.cdiNet), note: "Custo de oportunidade: o CDI líquido que o dinheiro deixa de render", requires: "Ter o valor em caixa", source: "proprio", tone: "good" });
    bc("pj_giro", "Capital de giro (prazo longo)", "Prazo acima de 365 dias", "Empresa com faturamento");
    bc("pj_giro_curto", "Capital de giro (prazo curto)", "Prazo até 365 dias", "Empresa com faturamento");
    bc("pj_duplicatas", "Desconto de duplicatas", "Antecipa vendas a prazo", "Duplicatas emitidas");
    bc("pj_recebiveis", "Antecipação de recebíveis de cartão", "Antecipa vendas no cartão", "Vendas no cartão");
    bc("pj_conta_garantida", "Conta garantida", "Limite rotativo", "Relacionamento bancário");
    bc("pj_cheque", "Cheque especial PJ", "Evite: emergência", "Conta PJ", "bad");
  }
  if (proposal && proposal > 0) out.push({ id: "proposta", label: "A proposta que você recebeu", monthly: proposal, note: "Taxa informada por você", requires: "—", source: "proposta" });
  return out;
}

export function CaptacaoSim({ d }: { d: SimData }) {
  const [amount, setAmount] = useState(200_000);
  const [months, setMonths] = useState(60);
  const [seg, setSeg] = useState<Seg>("PF");
  const [imovel, setImovel] = useState(true);
  const [veiculo, setVeiculo] = useState(true);
  const [invest, setInvest] = useState(true);
  const [bond, setBond] = useState<Bond>("clt");
  const [renda, setRenda] = useState(Math.round(d.renda));
  const [proposal, setProposal] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => buildOptions(d, seg, { imovel, veiculo, invest, bond }, proposal)
    .map((o) => fundingCost(o, amount, months)).sort((a, b) => a.juros - b.juros), [d, seg, imovel, veiculo, invest, bond, proposal, amount, months]);
  const loans = rows.filter((r) => r.source !== "proprio");
  const own = rows.find((r) => r.source === "proprio");
  const bestLoan = loans[0];
  const max = Math.max(1, ...rows.map((r) => r.juros));
  const share = bestLoan && renda > 0 ? bestLoan.pmt / renda : null;
  const pessoal = rows.find((r) => r.id === "pessoal");
  const noData = !Object.keys(d.credit.mods).length;

  const chip = (on: boolean, set: (v: boolean) => void, label: string) => (
    <button type="button" onClick={() => set(!on)} aria-pressed={on} className={`min-h-[36px] rounded-full px-3 text-[13px] font-medium ${on ? "border border-[#7a5c32] bg-brand-soft text-[#5c4526]" : "border border-ink/12 bg-white text-ink/55"}`}>{on ? "✓ " : ""}{label}</button>
  );

  return (
    <Layout inputs={<>
      <Choice<Seg> label="Para" value={seg} onChange={setSeg} options={[["PF", "Pessoa física"], ["PJ", "Empresa (PJ)"]]} />
      <Field label="Quanto você precisa" value={amount} onChange={setAmount} max={2_000_000} step={5000} />
      <Field label="Prazo para pagar" value={months} onChange={setMonths} kind="months" min={3} max={240} />
      {seg === "PF" && <>
        <div className="flex flex-col gap-1.5"><span className="text-[13px] text-ink/60">O que você pode dar como garantia</span>
          <div className="flex flex-wrap gap-1.5">{chip(imovel, setImovel, "Imóvel quitado")}{chip(veiculo, setVeiculo, "Veículo quitado")}{chip(invest, setInvest, "Investimentos")}</div></div>
        <Choice<Bond> label="Vínculo para consignado" value={bond} onChange={setBond} options={[["nenhum", "Nenhum"], ["clt", "CLT"], ["servidor", "Servidor"], ["inss", "INSS"]]} />
      </>}
      {seg === "PJ" && <div className="flex flex-wrap gap-1.5">{chip(invest, setInvest, "Tenho caixa investido")}</div>}
      <Field label="Renda líquida mensal" value={renda} onChange={setRenda} max={100_000} step={500} hint={d.renda ? "média do Orçamento" : undefined} />
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] text-ink/60" htmlFor="prop">Recebeu uma proposta? Taxa ao mês</label>
        <div className="flex items-center gap-2 rounded-xl border border-ink/10 bg-white px-3">
          <input id="prop" inputMode="decimal" placeholder="ex.: 1,49" className="min-w-0 flex-1 bg-transparent py-2 text-[15px] font-semibold outline-none"
            onBlur={(e) => { const n = Number(e.target.value.replace(",", ".")); setProposal(isFinite(n) && n > 0 ? n / 100 : null); }} />
          <span className="text-sm text-ink/40">% a.m.</span>
        </div>
      </div>
    </>}>
      {bestLoan ? (
        <Answer sub={<>{pessoal && bestLoan.id !== "pessoal" ? <>O crédito pessoal custaria {compact(pessoal.juros)} de juros pelo mesmo dinheiro. </> : null}{share !== null ? <>A parcela de {brl(bestLoan.pmt)} é {pct(share, 0)} da renda{share > 0.3 ? " — acima de 30%, aperta o orçamento." : "."}</> : null}</>}>
          {own && own.juros < bestLoan.juros ? <>Usar seus investimentos custa menos: você deixa de ganhar <Hi tone="good">{compact(own.juros)}</Hi>. Entre os empréstimos, </> : <>A opção mais barata é </>}
          <Hi>{bestLoan.label.toLowerCase()}</Hi>: parcela de <Hi>{brl(bestLoan.pmt)}</Hi> e <Hi>{compact(bestLoan.juros)}</Hi> de juros em {months} meses.
        </Answer>
      ) : <Answer>Marque ao menos uma garantia ou vínculo para comparar.</Answer>}

      <section className="card overflow-x-auto !px-0">
        <table className="table min-w-[860px]">
          <thead><tr><th className="!pl-5">Opção</th><th className="num">Taxa a.m.</th><th className="num">Custo a.a.</th><th className="num">Parcela</th><th className="w-[28%]">Juros no prazo</th><th className="!pr-5">Exige</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className={`cursor-pointer ${r.source === "proprio" ? "bg-[#f3f6ef]" : r.tone === "bad" ? "bg-[#fbf1ee]" : ""}`} onClick={() => setOpen(open === r.id ? null : r.id)}>
              <td className="!pl-5"><b>{r.label}</b><span className={`block text-[11.5px] ${r.tone === "bad" ? "text-loss" : r.source === "proprio" ? "text-gain" : "text-ink/50"}`}>{r.note}</span>
                {open === r.id && r.banks?.length ? <span className="mt-2 block text-[12px] text-ink/70">Mais baratos: {r.banks.slice(0, 5).map((b) => `${b.name} ${pct(b.monthly, 2)}`).join(" · ")}</span> : null}
                {r.banks?.length && open !== r.id ? <span className="block text-[11px] text-brand">ver bancos mais baratos ▾</span> : null}</td>
              <td className="num">{pct(r.monthly, 2)}</td>
              <td className="num font-semibold">{pct(r.annual, 1)}</td>
              <td className="num">{brl(r.pmt)}</td>
              <td><div className="flex items-center gap-2"><div className="h-2 flex-1 rounded-full bg-ink/[0.06]"><div className="h-2 rounded-full" style={{ width: `${Math.max(2, (r.juros / max) * 100)}%`, background: r.source === "proprio" ? "#4f7a52" : r.tone === "bad" ? "#a33f30" : "#c9973f" }} /></div><span className="w-24 text-right tabular-nums">{compact(r.juros)}</span></div></td>
              <td className="!pr-5 text-[12.5px] text-ink/60">{r.requires}</td>
            </tr>
          ))}</tbody>
        </table>
        <div className="px-5 pt-2"><Note>
          {noData ? "As taxas do Banco Central ainda não foram carregadas — tente atualizar em alguns minutos. " : `Taxas do Banco Central (${Object.values(d.credit.mods)[0]?.period ?? ""}): média por banco das operações dos últimos 5 dias úteis, já com encargos. A taxa de cada cliente muda com garantia, prazo e histórico. `}
          Home equity, garantia de veículo e de investimentos não têm série no Banco Central: valores de referência — digite a proposta real para comparar. Parcela pela tabela Price, sem IOF e seguros (o CET da proposta inclui).
        </Note></div>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <div className="card"><h3 className="mb-1.5 text-[15px] font-semibold">O dinheiro vai render?</h3><p className="text-sm text-ink/65">Se for para investir, abrir ou ampliar um negócio, veja se o retorno paga o custo da dívida.</p>
          <Link className="mt-2 inline-block text-sm font-medium" href={`/simulacoes/alavancagem?valor=${amount}&prazo=${months}&taxa=${(bestLoan?.monthly ?? 0.015).toFixed(5)}`}>Simular alavancagem com esta opção →</Link></div>
        <div className="card"><h3 className="mb-1.5 text-[15px] font-semibold">Antes de contratar</h3>
          <ul className="space-y-1 text-sm text-ink/65"><li>• Compare pelo CET da proposta, não pela taxa anunciada.</li><li>• Garantia de imóvel: o imóvel fica alienado até quitar.</li><li>• Tem dívida mais cara? Trocar por uma mais barata (portabilidade) costuma ser o melhor uso de crédito.</li></ul></div>
      </section>
    </Layout>
  );
}
