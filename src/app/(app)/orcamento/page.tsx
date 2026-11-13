import Link from "next/link";
import { canEdit as canEditArea, requireArea } from "@/lib/context";
import { currentCycle, cycleLabel, cyclesOfYear, isValidCycle } from "@/lib/cycle";
import { type Category, loadCategories, loadTransactions, summarize, sumByCategory, type Transaction } from "@/lib/data";
import { colorOf, type Group, KIND_COLOR, KIND_HINT, KIND_LABEL, KIND_ORDER, loadGroups } from "@/lib/groups";
import { BudgetEditor } from "./budget-editor";
import { formatBRL, formatPct } from "@/lib/format";
import type { Kind, Scope } from "@/lib/categories-default";
import { Bar, CycleNav, PageHeader, ScopeTabs } from "@/components/ui";
import { BudgetInput } from "./budget-input";
import { fillBudget } from "./actions";
import { toCashView } from "@/lib/cash-flow";

type SP = { ciclo?: string; visao?: string; escopo?: string; ano?: string; editar?: string };

export default async function OrcamentoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireArea("orcamento");
  const sp = await searchParams;
  const startDay = ctx.household.cycle_start_day;
  const scope: Scope = sp.escopo === "pj" ? "pj" : "pessoal";
  const cycle = isValidCycle(sp.ciclo) ? sp.ciclo : currentCycle(startDay);
  const annual = sp.visao === "anual";
  const year = Number(sp.ano) || Number(cycle.slice(0, 4));

  const canEdit = canEditArea(ctx, "orcamento");
  const editing = sp.editar === "1" && canEdit;
  const [allCats, groups] = await Promise.all([loadCategories(ctx, scope), loadGroups(ctx, scope)]);
  const cats = allCats.filter((c) => c.active);
  const params = { escopo: scope, visao: annual ? "anual" : undefined, ciclo: cycle };
  const editBtn = canEdit && (
    <Link href={editing ? `/orcamento?escopo=${scope}&ciclo=${cycle}` : `/orcamento?escopo=${scope}&ciclo=${cycle}&editar=1`} className={editing ? "btn" : "btn-ghost"}>
      {editing ? "Concluir edição" : "Editar grupos e categorias"}
    </Link>
  );

  if (editing) {
    const [everyGroup, everyCat] = await Promise.all([loadGroups(ctx), loadCategories(ctx)]);
    return (
      <div>
        <PageHeader title="Editar orçamento" subtitle="Monte seus próprios grupos, subgrupos e categorias — separados em receitas, investimentos e despesas.">
          <ScopeTabs scope={scope} basePath="/orcamento" params={{ editar: "1", ciclo: cycle }} />
          {editBtn}
        </PageHeader>
        <BudgetEditor scope={scope} groups={groups} cats={allCats} allGroups={everyGroup} allCats={everyCat} />
      </div>
    );
  }

  const viewTabs = (
    <div className="flex rounded-xl border border-ink/10 bg-white p-1 text-sm">
      <Link href={`/orcamento?escopo=${scope}&ciclo=${cycle}`} className={`rounded-lg px-3 py-1.5 ${!annual ? "bg-ink text-white" : "text-ink/60"}`}>Ciclo</Link>
      <Link href={`/orcamento?escopo=${scope}&visao=anual&ano=${year}`} className={`rounded-lg px-3 py-1.5 ${annual ? "bg-ink text-white" : "text-ink/60"}`}>Ano</Link>
    </div>
  );

  if (annual) {
    const cycles = cyclesOfYear(year);
    // Realizado no critério de caixa: o que saiu da conta no ciclo, com cada fatura paga aberta nas categorias das compras
    const txs = (await toCashView(ctx, await loadTransactions(ctx, { scope, cycles }), cats, cycles)).txs;
    return (
      <div>
        <PageHeader title="Orçamento anual" subtitle="Realizado por categoria em cada ciclo: o que saiu da conta, com cada fatura paga aberta nas categorias das compras">
          <ScopeTabs scope={scope} basePath="/orcamento" params={{ visao: "anual", ano: String(year) }} />
          {viewTabs}
          {editBtn}
          <div className="flex items-center gap-1 rounded-xl border border-ink/10 bg-white p-1 text-sm">
            <Link className="rounded-lg px-2 py-1 hover:bg-black/5" href={`/orcamento?escopo=${scope}&visao=anual&ano=${year - 1}`}>←</Link>
            <span className="px-2 font-semibold">{year}</span>
            <Link className="rounded-lg px-2 py-1 hover:bg-black/5" href={`/orcamento?escopo=${scope}&visao=anual&ano=${year + 1}`}>→</Link>
          </div>
        </PageHeader>
        <AnnualMatrix cats={cats} groups={groups} txs={txs} cycles={cycles} />
      </div>
    );
  }

  const [rawTxs, budgetsRes] = await Promise.all([
    loadTransactions(ctx, { scope, cycles: [cycle] }),
    ctx.supabase.from("budgets").select("category_id, planned").eq("household_id", ctx.household.id).eq("cycle", cycle),
  ]);
  const planned = new Map<string, number>((budgetsRes.data ?? []).map((b: { category_id: string; planned: number }) => [b.category_id, Number(b.planned)] as [string, number]));
  // Realizado no critério de caixa (igual a Lançamentos e Fluxo): a fatura paga no ciclo entra pelas compras dela
  // (consumo do mês anterior), cada uma na sua categoria. Ciclo sem extrato importado fica nas compras do cartão do mês.
  const cash = await toCashView(ctx, rawTxs, cats, [cycle]);
  const txs = cash.txs.filter((t) => t.cycle === cycle);
  const real = sumByCategory(txs);
  const s = summarize(txs, cats);

  const plan = { receita: 0, investimento: 0, despesa: 0, transferencia: 0 } as Record<Kind, number>;
  for (const c of cats) if (!c.excluded_from_totals) plan[c.kind] += planned.get(c.id) ?? 0;
  const saldoPrev = plan.receita - plan.investimento - plan.despesa;

  const byKind = KIND_ORDER.map((k) => ({
    k,
    groups: groups.filter((g) => g.kind === k).map((g) => ({ g, cats: cats.filter((c) => c.grp === g.name) })).filter((x) => x.cats.length),
  })).filter((x) => x.groups.length);
  const realOf: Record<Kind, number> = { receita: s.receitas, investimento: s.investimentos, despesa: s.despesas, transferencia: 0 };

  const Kpi = ({ k, label }: { k: Kind; label: string }) => (
    <div className="card flex-1 py-3" style={{ borderTop: `3px solid ${KIND_COLOR[k]}` }}>
      <span className="label">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{formatBRL(realOf[k])}</span>
      <span className="block text-xs text-ink/45 tabular-nums">{plan[k] ? `orçado ${formatBRL(plan[k])}` : "sem orçamento"}</span>
    </div>
  );

  return (
    <div>
      <PageHeader title="Orçamento" subtitle="Defina quanto espera receber, investir e gastar por categoria. O valor orçado funciona como limite e gera alertas. O realizado segue a conta corrente: a fatura paga no mês entra pelas compras dela, cada uma na sua categoria.">
        <ScopeTabs scope={scope} basePath="/orcamento" params={params} />
        {viewTabs}
        <CycleNav cycle={cycle} startDay={startDay} basePath="/orcamento" params={{ escopo: scope }} />
        {editBtn}
      </PageHeader>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi k="receita" label="Receitas" />
        <Kpi k="investimento" label="Investimentos" />
        <Kpi k="despesa" label="Despesas" />
        <div className="card py-3" style={{ borderTop: "3px solid #0f172a" }}>
          <span className="label">Saldo</span>
          <span className={`text-lg font-semibold tabular-nums ${s.saldo < 0 ? "text-loss" : s.saldo > 0 ? "text-gain" : ""}`}>{formatBRL(s.saldo)}</span>
          <span className="block text-xs text-ink/45 tabular-nums">{plan.receita ? `previsto ${formatBRL(saldoPrev)}` : "receitas − investimentos − despesas"}</span>
        </div>
      </div>
      {canEdit && (
        <form action={fillBudget} className="mb-6 flex flex-wrap gap-2">
          <input type="hidden" name="cycle" value={cycle} />
          <input type="hidden" name="scope" value={scope} />
          <button name="mode" value="copiar" className="btn-ghost">Copiar ciclo anterior</button>
          <button name="mode" value="media" className="btn-ghost">Média dos últimos 3</button>
        </form>
      )}

      <div className="space-y-8">
        {byKind.map(({ k, groups: kg }) => (
          <div key={k}>
            <div className="mb-3 flex items-end justify-between gap-3 border-b-2 pb-2" style={{ borderColor: KIND_COLOR[k] }}>
              <div><h2 style={{ color: KIND_COLOR[k] }}>{KIND_LABEL[k]}</h2><p className="text-xs text-ink/45">{KIND_HINT[k]}</p></div>
              {k !== "transferencia" && <div className="text-sm tabular-nums text-ink/60">{formatBRL(realOf[k])}{plan[k] > 0 && <> de {formatBRL(plan[k])}</>}</div>}
            </div>
            <div className="space-y-4">
              {kg.map(({ g, cats: gc }) => {
                const col = colorOf(g);
                const subgroups = [...new Set(gc.map((c) => c.subgroup))].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : 0));
                const gReal = gc.reduce((a, c) => a + (c.excluded_from_totals ? 0 : real.get(c.id) ?? 0), 0);
                const gPlan = gc.reduce((a, c) => a + (c.excluded_from_totals ? 0 : planned.get(c.id) ?? 0), 0);
                return (
                  <section key={g.id} className="card overflow-x-auto p-0">
                    <div className="flex items-baseline justify-between px-5 pt-4">
                      <div className="flex items-center gap-3"><span className="h-8 w-1 rounded-full" style={{ background: col }} /><div><h3 className="font-semibold">{g.name}</h3>{g.hint && <p className="text-xs text-ink/45">{g.hint}</p>}</div></div>
                      <div className="text-sm tabular-nums text-ink/60">{formatBRL(gReal)} {gPlan > 0 && <>de {formatBRL(gPlan)}</>}</div>
                    </div>
                    <table className="table mt-2 min-w-[640px]">
                      <thead><tr><th>Categoria</th><th className="num">{k === "receita" ? "Previsto" : "Orçado"}</th><th className="num">Realizado</th><th className="num">{k === "receita" ? "Falta receber" : "Disponível"}</th><th className="w-40"></th></tr></thead>
                      <tbody>
                        {subgroups.map((sg) => (
                          gc.filter((c) => c.subgroup === sg).map((c, i) => {
                            const p = planned.get(c.id) ?? 0;
                            const r = real.get(c.id) ?? 0;
                            const left = p - r;
                            const over = k === "despesa" && p > 0 && r > p;
                            return (
                              <tr key={c.id} className={c.excluded_from_totals || !c.active ? "text-ink/40" : ""}>
                                <td>
                                  {i === 0 && sg && <div className="text-[11px] uppercase tracking-wide text-ink/40">{sg}</div>}
                                  <Link className="hover:underline" href={`/lancamentos?escopo=${scope}&ciclo=${cycle}&categoria=${c.id}`}>{c.name}</Link>
                                  {c.excluded_from_totals && <span className="chip ml-2">fora do total</span>}
                                </td>
                                <td className="num">{canEdit && k !== "transferencia" ? <BudgetInput categoryId={c.id} cycle={cycle} initial={p} /> : p ? formatBRL(p) : <span className="text-ink/30">—</span>}</td>
                                <td className="num">{r ? formatBRL(r) : <span className="text-ink/30">—</span>}</td>
                                <td className={`num ${over ? "text-loss" : "text-ink/60"}`}>{p ? formatBRL(Math.max(k === "despesa" ? -Infinity : 0, left)) : ""}</td>
                                <td>{p > 0 && <Bar value={r} max={p} color={k !== "despesa" ? col : r > p ? "#a33f30" : r > p * 0.8 ? "#c9973f" : col} />}</td>
                              </tr>
                            );
                          })
                        ))}
                      </tbody>
                    </table>
                  </section>
                );
              })}
            </div>
          </div>
        ))}
        {!byKind.length && <p className="rounded-xl border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-ink/45">Nenhuma categoria ainda. {canEdit && <Link className="text-brand hover:underline" href={`/orcamento?escopo=${scope}&editar=1`}>Criar grupos e categorias</Link>}</p>}
      </div>
    </div>
  );
}

function AnnualMatrix({ cats, groups, txs, cycles }: { cats: Category[]; groups: Group[]; txs: Transaction[]; cycles: string[] }) {
  const cell = new Map<string, number>();
  for (const t of txs) {
    const k = `${t.category_id}|${t.cycle}`;
    cell.set(k, (cell.get(k) ?? 0) + Number(t.amount));
  }
  const sums = cycles.map((c) => summarize(txs.filter((t) => t.cycle === c), cats));
  const v = (n: number) => (n ? formatBRL(n).replace("R$", "").trim() : "");
  const kindTotal = (k: Kind, i: number) => (k === "receita" ? sums[i].receitas : k === "investimento" ? sums[i].investimentos : k === "despesa" ? sums[i].despesas : 0);
  const sections = KIND_ORDER.map((k) => ({
    k, gs: groups.filter((g) => g.kind === k).map((g) => ({ g, cats: cats.filter((c) => c.grp === g.name) })).filter((x) => x.cats.length),
  })).filter((x) => x.gs.length);
  const n = cycles.length + 2;

  return (
    <div className="card overflow-x-auto p-0">
      <table className="table min-w-[1200px] text-xs">
        <thead className="sticky top-0 bg-white">
          <tr><th className="sticky left-0 bg-white">Categoria</th>{cycles.map((c) => <th key={c} className="num capitalize">{cycleLabel(c).slice(0, 3)}</th>)}<th className="num">Total</th></tr>
        </thead>
        <tbody>
          {sections.map(({ k, gs }) => {
            const kt = cycles.map((_, i) => kindTotal(k, i));
            return [
              <tr key={k} className="text-sm font-bold" style={{ color: KIND_COLOR[k], borderTop: `2px solid ${KIND_COLOR[k]}` }}>
                <td className="sticky left-0 bg-white uppercase tracking-wide">{KIND_LABEL[k]}</td>
                {k === "transferencia" ? <td colSpan={n - 1} className="text-[11px] font-normal text-ink/40">não entram nos totais</td> : <>{kt.map((x, i) => <td key={i} className="num">{v(x)}</td>)}<td className="num">{v(kt.reduce((a, b) => a + b, 0))}</td></>}
              </tr>,
              ...gs.flatMap(({ g, cats: gc }) => {
                const col = colorOf(g);
                const rows = gc.filter((c) => cycles.some((cy) => cell.get(`${c.id}|${cy}`)));
                const gTot = cycles.map((cy) => gc.reduce((a, c) => a + (c.excluded_from_totals ? 0 : cell.get(`${c.id}|${cy}`) ?? 0), 0));
                return [
                  <tr key={g.id} className="font-semibold" style={{ background: `${col}0d` }}>
                    <td className="sticky left-0 bg-white"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: col }} />{g.name}</span></td>{gTot.map((x, i) => <td key={i} className="num">{v(x)}</td>)}<td className="num">{v(gTot.reduce((a, b) => a + b, 0))}</td>
                  </tr>,
                  ...rows.map((c) => {
                    const vals = cycles.map((cy) => cell.get(`${c.id}|${cy}`) ?? 0);
                    return (
                      <tr key={c.id} className={c.excluded_from_totals ? "text-ink/40" : ""}>
                        <td className="sticky left-0 bg-white pl-6">{c.name}</td>{vals.map((x, i) => <td key={i} className="num">{v(x)}</td>)}<td className="num">{v(vals.reduce((a, b) => a + b, 0))}</td>
                      </tr>
                    );
                  }),
                  ...(k !== "receita" && k !== "transferencia" && !g.system ? [
                    <tr key={g.id + "%"} className="text-ink/40"><td className="sticky left-0 bg-white pl-6 italic">% sobre receita</td>{gTot.map((x, i) => <td key={i} className="num">{sums[i].receitas && x ? formatPct(x / sums[i].receitas) : ""}</td>)}<td /></tr>,
                  ] : []),
                ];
              }),
            ];
          })}
          <tr className="border-t-2 border-ink/20 font-semibold">
            <td className="sticky left-0 bg-white">Saldo <span className="font-normal text-ink/40">(receitas − investimentos − despesas)</span></td>
            {sums.map((x, i) => <td key={i} className={`num ${x.saldo < 0 ? "text-loss" : x.saldo > 0 ? "text-gain" : ""}`}>{v(x.saldo)}</td>)}
            <td className="num">{v(sums.reduce((a, x) => a + x.saldo, 0))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
