import Link from "next/link";
import { requireArea } from "@/lib/context";
import { currentCycle, cycleLabel, cyclesOfYear, isValidCycle, shiftCycle } from "@/lib/cycle";
import { categoryIndex, loadCategories, loadTransactions } from "@/lib/data";
import { buildFlow, FLOW_COLORS, shareByCycle } from "@/lib/flow";
import { toCashView } from "@/lib/cash-flow";
import { formatBRL } from "@/lib/format";
import { groupColor } from "@/lib/theme";
import { cycleLong, CycleNav, Empty, PageHeader, Seg } from "@/components/ui";
import { Sankey } from "@/components/sankey";

type SP = { ciclo?: string; periodo?: string; nivel?: string };
const PERIODS: [string, string][] = [["ciclo", "Ciclo"], ["3c", "3 ciclos"], ["12c", "12 ciclos"], ["ano", "Ano"]];
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

export default async function FluxoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireArea("visao-geral");
  const sp = await searchParams;
  const startDay = ctx.household.cycle_start_day;
  const cycle = isValidCycle(sp.ciclo) ? sp.ciclo : currentCycle(startDay);
  const periodo = PERIODS.some(([v]) => v === sp.periodo) ? sp.periodo! : "ciclo";
  const nivel = sp.nivel === "categoria" ? "categoria" : "grupo";
  const cycles = periodo === "ano" ? cyclesOfYear(Number(cycle.slice(0, 4)))
    : Array.from({ length: periodo === "12c" ? 12 : periodo === "3c" ? 3 : 1 }, (_, i) => shiftCycle(cycle, -i)).reverse();
  const trend = Array.from({ length: 12 }, (_, i) => shiftCycle(cycle, i - 11));
  const prevCycles = cycles.map((c) => shiftCycle(c, -cycles.length));

  const [cats, rawTxs] = await Promise.all([
    loadCategories(ctx, "pessoal"),
    loadTransactions(ctx, { scope: "pessoal", cycles: [...new Set([...cycles, ...trend, ...prevCycles])] }),
  ]);
  // Caixa: o que entrou e saiu da conta no ciclo; cada fatura paga é aberta nas categorias das compras dela
  const cash = await toCashView(ctx, rawTxs, cats, cycles);
  const txs = cash.txs;
  const inPeriod = txs.filter((t) => cycles.includes(t.cycle));
  const flow = buildFlow(inPeriod, cats, nivel, nivel === "categoria" ? 10 : 8);
  const shares = shareByCycle(txs, cats, trend);
  const { byId } = categoryIndex(cats);

  const label = periodo === "ciclo" ? cycleLong(cycle) : periodo === "ano" ? `Ano de ${cycle.slice(0, 4)}` : `${cycleLabel(cycles[0])} a ${cycleLabel(cycles[cycles.length - 1])}`;
  const href = (p: Partial<SP>) => `/fluxo?${new URLSearchParams({ ciclo: cycle, periodo, nivel, ...p } as Record<string, string>).toString()}`;

  // Maiores destinos (por categoria), comparados ao período anterior de mesmo tamanho
  const sumBy = (list: typeof txs) => {
    const m = new Map<string, number>();
    for (const t of list) { const c = t.category_id ? byId.get(t.category_id) : undefined; if (!c || c.excluded_from_totals || c.kind !== "despesa") continue; m.set(c.id, (m.get(c.id) ?? 0) + Number(t.amount)); }
    return m;
  };
  const cur = sumBy(inPeriod), prev = sumBy(txs.filter((t) => prevCycles.includes(t.cycle)));
  const top = [...cur].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const grpOrder = [...new Set(cats.filter((c) => c.kind === "despesa").map((c) => c.grp))];

  return (
    <div>
      <PageHeader title="Para onde foi sua renda?" subtitle="O que entrou e saiu da conta corrente em cada ciclo. As faturas pagas no mês aparecem abertas nos grupos e categorias das compras que elas contêm (feitas no ciclo anterior).">
        <Seg options={PERIODS} current={periodo} hrefFor={(v) => href({ periodo: v })} />
        <Seg options={[["grupo", "Por grupo"], ["categoria", "Por categoria"]]} current={nivel} hrefFor={(v) => href({ nivel: v })} />
        <CycleNav cycle={cycle} startDay={startDay} basePath="/fluxo" params={{ periodo, nivel }} />
      </PageHeader>

      <section className="card px-6 py-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div><div className="eyebrow">Fluxo de {label}</div>
            {flow && <div className="display mt-1 text-[40px] leading-none">{formatBRL(flow.receitas)}</div>}
            <div className="mt-1 text-sm text-ink/50">de renda no período</div></div>
          {flow && (
            <div className="grid grid-cols-3 gap-6 text-right">
              {[["Despesas", flow.despesas, FLOW_COLORS.despesas], ["Investido", flow.investimentos, FLOW_COLORS.investimentos], [flow.saldo >= 0 ? "Sobra" : "Déficit", Math.abs(flow.saldo), flow.saldo >= 0 ? FLOW_COLORS.sobra : FLOW_COLORS.deficit]].map(([l, v, c]) => (
                <div key={l as string}><div className="label flex items-center justify-end gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: c as string }} />{l}</div>
                  <div className="display text-[24px] leading-tight">{formatBRL(v as number).replace(/,\d{2}$/, "")}</div>
                  <div className="text-xs text-ink/45">{flow.receitas ? pct((v as number) / flow.receitas) : "—"} da renda</div></div>
              ))}
            </div>)}
        </div>
        {flow ? <Sankey data={flow} /> : <Empty icon="flow">Sem receitas ou despesas neste período. <Link className="font-medium text-brand" href="/faturas/importar">Importe faturas e extratos →</Link></Empty>}
        <div className="mt-3 space-y-1 text-[11px] text-ink/45">
          {cash.faturas.valor > 0 && <p>Faturas pagas no período: {formatBRL(cash.faturas.valor)}{cash.faturas.abertas ? ` · ${cash.faturas.abertas} aberta(s) por categoria` : ""}{cash.faturas.semDetalhe ? ` · ${cash.faturas.semDetalhe} sem a fatura importada (aparece em “A classificar”)` : ""}.</p>}
          {(cash.transfers.entrou > 0 || cash.transfers.saiu > 0) && <p>Fora do fluxo (não são renda nem gasto): transferências entre suas contas, empréstimos e PIX no crédito — entrou {formatBRL(cash.transfers.entrou)}, saiu {formatBRL(cash.transfers.saiu)}.</p>}
          {cash.competencia.length > 0 && <p>Sem extrato importado em {cash.competencia.map(cycleLabel).join(", ")}: {cash.competencia.length === cycles.length ? "este período usa" : "esses ciclos usam"} as compras do cartão no mês da fatura (competência).</p>}
          <p>Passe o mouse sobre as faixas para ver os valores.</p>
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-5">
        <section className="card xl:col-span-3">
          <div className="mb-1 flex items-baseline justify-between"><h2>A cada R$ 100 que entraram</h2><span className="text-xs text-ink/45">últimos 12 ciclos</span></div>
          <p className="mb-4 text-xs text-ink/45">Quanto de cada R$ 100 de renda foi para cada destino.</p>
          <div className="space-y-2">
            {shares.map((s) => {
              const base = Math.max(s.receitas, s.despesas + s.investimentos) || 1;
              const parts = [...grpOrder.map((g) => ({ l: g, v: Math.max(0, s.groups.get(g) ?? 0), c: groupColor(g, cats.find((c) => c.grp === g)?.color) })),
                { l: "Investido", v: s.investimentos, c: FLOW_COLORS.investimentos }, { l: "Sobra", v: Math.max(0, s.saldo), c: FLOW_COLORS.sobra }].filter((p) => p.v > 0);
              return (
                <Link key={s.cycle} href={href({ ciclo: s.cycle, periodo: "ciclo" })} className={`grid grid-cols-[52px_1fr_64px] items-center gap-3 rounded-lg px-1 py-0.5 text-xs hover:bg-ink/[0.03] ${s.cycle === cycle ? "font-semibold" : ""}`}>
                  <span className="capitalize text-ink/60">{cycleLabel(s.cycle)}</span>
                  <span className="flex h-5 overflow-hidden rounded-[5px] bg-ink/[0.04]">
                    {parts.map((p) => <span key={p.l} style={{ width: `${(p.v / base) * 100}%`, background: p.c }} className="h-full border-r border-surface/70 last:border-0" title={`${p.l}: ${formatBRL(p.v)} (R$ ${((p.v / (s.receitas || base)) * 100).toFixed(0)} de cada R$ 100)`} />)}
                  </span>
                  <span className={`text-right tabular-nums ${s.saldo < 0 ? "text-loss" : "text-ink/55"}`}>{s.receitas ? `${s.saldo >= 0 ? "sobra" : "déficit"} ${pct(Math.abs(s.saldo) / s.receitas)}` : "—"}</span>
                </Link>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink/55">
            {[...grpOrder.map((g) => [g, groupColor(g, cats.find((c) => c.grp === g)?.color)]), ["Investido", FLOW_COLORS.investimentos], ["Sobra", FLOW_COLORS.sobra]].map(([l, c]) => <span key={l} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: c }} />{l}</span>)}
          </div>
        </section>

        <section className="card xl:col-span-2">
          <div className="mb-1 flex items-baseline justify-between"><h2>Maiores destinos</h2><span className="text-xs text-ink/45">vs. período anterior</span></div>
          <p className="mb-4 text-xs text-ink/45">As categorias que mais levaram da sua renda.</p>
          {top.length ? <ol className="space-y-3">{top.map(([id, v], i) => {
            const c = byId.get(id)!, p = prev.get(id) ?? 0, d = p ? v / p - 1 : null, col = groupColor(c.grp, c.color);
            return (
              <li key={id}>
                <div className="flex items-baseline gap-3 text-sm"><span className="display w-5 text-ink/35">{i + 1}</span>
                  <Link href={`/lancamentos?ciclo=${cycle}&categoria=${id}`} className="flex-1 truncate hover:underline">{c.name}<span className="ml-2 text-[11px] text-ink/40">{c.grp}</span></Link>
                  <span className="tabular-nums">{formatBRL(v).replace(/,\d{2}$/, "")}</span>
                  <span className={`w-14 text-right text-xs tabular-nums ${d == null ? "text-ink/30" : d > 0.05 ? "text-loss" : d < -0.05 ? "text-gain" : "text-ink/45"}`}>{d == null ? "novo" : `${d > 0 ? "+" : ""}${(d * 100).toFixed(0)}%`}</span></div>
                <div className="ml-8 mt-1 h-1 overflow-hidden rounded-full bg-ink/[0.05]"><div className="h-full rounded-full" style={{ width: `${(v / top[0][1]) * 100}%`, background: col }} /></div>
                {flow?.receitas ? <div className="ml-8 mt-0.5 text-[11px] text-ink/40">{pct(v / flow.receitas)} da renda</div> : null}
              </li>);
          })}</ol> : <Empty>Sem despesas no período.</Empty>}
        </section>
      </div>
    </div>
  );
}
