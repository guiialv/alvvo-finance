import Link from "next/link";
import { requireArea } from "@/lib/context";
import { currentCycle, cycleLabel, cyclesOfYear, isValidCycle } from "@/lib/cycle";
import { type Category, loadCategories, loadTransactions, summarize, sumByCategory, type Transaction } from "@/lib/data";
import { formatBRL, formatPct } from "@/lib/format";
import { GROUP_HINT, GROUP_ORDER, type Scope } from "@/lib/categories-default";
import { groupColor } from "@/lib/theme";
import { Bar, CycleNav, PageHeader, ScopeTabs } from "@/components/ui";
import { BudgetInput } from "./budget-input";
import { fillBudget } from "./actions";

type SP = { ciclo?: string; visao?: string; escopo?: string; ano?: string };

export default async function OrcamentoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireArea("orcamento");
  const sp = await searchParams;
  const startDay = ctx.household.cycle_start_day;
  const scope: Scope = sp.escopo === "pj" ? "pj" : "pessoal";
  const cycle = isValidCycle(sp.ciclo) ? sp.ciclo : currentCycle(startDay);
  const annual = sp.visao === "anual";
  const year = Number(sp.ano) || Number(cycle.slice(0, 4));

  const cats = (await loadCategories(ctx, scope)).filter((c) => c.active);
  const params = { escopo: scope, visao: annual ? "anual" : undefined, ciclo: cycle };

  const viewTabs = (
    <div className="flex rounded-xl border border-ink/10 bg-white p-1 text-sm">
      <Link href={`/orcamento?escopo=${scope}&ciclo=${cycle}`} className={`rounded-lg px-3 py-1.5 ${!annual ? "bg-ink text-white" : "text-ink/60"}`}>Ciclo</Link>
      <Link href={`/orcamento?escopo=${scope}&visao=anual&ano=${year}`} className={`rounded-lg px-3 py-1.5 ${annual ? "bg-ink text-white" : "text-ink/60"}`}>Ano</Link>
    </div>
  );

  if (annual) {
    const cycles = cyclesOfYear(year);
    const txs = await loadTransactions(ctx, { scope, cycles });
    return (
      <div>
        <PageHeader title="Orçamento anual" subtitle="Realizado por categoria em cada ciclo — como na sua planilha">
          <ScopeTabs scope={scope} basePath="/orcamento" params={{ visao: "anual", ano: String(year) }} />
          {viewTabs}
          <div className="flex items-center gap-1 rounded-xl border border-ink/10 bg-white p-1 text-sm">
            <Link className="rounded-lg px-2 py-1 hover:bg-black/5" href={`/orcamento?escopo=${scope}&visao=anual&ano=${year - 1}`}>←</Link>
            <span className="px-2 font-semibold">{year}</span>
            <Link className="rounded-lg px-2 py-1 hover:bg-black/5" href={`/orcamento?escopo=${scope}&visao=anual&ano=${year + 1}`}>→</Link>
          </div>
        </PageHeader>
        <AnnualMatrix cats={cats} txs={txs} cycles={cycles} scope={scope} />
      </div>
    );
  }

  const [txs, budgetsRes] = await Promise.all([
    loadTransactions(ctx, { scope, cycles: [cycle] }),
    ctx.supabase.from("budgets").select("category_id, planned").eq("household_id", ctx.household.id).eq("cycle", cycle),
  ]);
  const planned = new Map<string, number>((budgetsRes.data ?? []).map((b: { category_id: string; planned: number }) => [b.category_id, Number(b.planned)] as [string, number]));
  const real = sumByCategory(txs);
  const s = summarize(txs, cats);

  const groups = GROUP_ORDER[scope].map((g) => ({ g, cats: cats.filter((c) => c.grp === g) })).filter((x) => x.cats.length);
  let totalPlanned = 0;
  for (const c of cats) if (c.kind === "despesa" && !c.excluded_from_totals) totalPlanned += planned.get(c.id) ?? 0;

  return (
    <div>
      <PageHeader title="Orçamento" subtitle="Defina quanto pretende gastar por categoria. O valor orçado funciona como limite e gera alertas.">
        <ScopeTabs scope={scope} basePath="/orcamento" params={params} />
        {viewTabs}
        <CycleNav cycle={cycle} startDay={startDay} basePath="/orcamento" params={{ escopo: scope }} />
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="card flex-1 py-3"><span className="label">Orçado (despesas)</span><span className="text-lg font-semibold tabular-nums">{formatBRL(totalPlanned)}</span></div>
        <div className="card flex-1 py-3"><span className="label">Realizado (despesas)</span><span className="text-lg font-semibold tabular-nums">{formatBRL(s.despesas)}</span></div>
        <div className="card flex-1 py-3"><span className="label">Receitas</span><span className="text-lg font-semibold tabular-nums">{formatBRL(s.receitas)}</span></div>
        <form action={fillBudget} className="flex gap-2">
          <input type="hidden" name="cycle" value={cycle} />
          <input type="hidden" name="scope" value={scope} />
          <button name="mode" value="copiar" className="btn-ghost">Copiar ciclo anterior</button>
          <button name="mode" value="media" className="btn-ghost">Média dos últimos 3</button>
        </form>
      </div>

      <div className="space-y-4">
        {groups.map(({ g, cats: gc }) => {
          const subgroups = [...new Set(gc.map((c) => c.subgroup))];
          const gReal = gc.reduce((a, c) => a + (c.excluded_from_totals ? 0 : real.get(c.id) ?? 0), 0);
          const gPlan = gc.reduce((a, c) => a + (c.excluded_from_totals ? 0 : planned.get(c.id) ?? 0), 0);
          return (
            <section key={g} className="card overflow-x-auto p-0">
              <div className="flex items-baseline justify-between px-5 pt-4">
                <div className="flex items-center gap-3"><span className="h-8 w-1 rounded-full" style={{ background: groupColor(g) }} /><div><h2>{g}</h2>{GROUP_HINT[g] && <p className="text-xs text-ink/45">{GROUP_HINT[g]}</p>}</div></div>
                <div className="text-sm tabular-nums text-ink/60">{formatBRL(gReal)} {gPlan > 0 && <>de {formatBRL(gPlan)}</>}</div>
              </div>
              <table className="table mt-2 min-w-[640px]">
                <thead><tr><th>Categoria</th><th className="num">Orçado</th><th className="num">Realizado</th><th className="num">Disponível</th><th className="w-40"></th></tr></thead>
                <tbody>
                  {subgroups.map((sg) => (
                    gc.filter((c) => c.subgroup === sg).map((c, i) => {
                      const p = planned.get(c.id) ?? 0;
                      const r = real.get(c.id) ?? 0;
                      const left = p - r;
                      return (
                        <tr key={c.id} className={c.excluded_from_totals ? "text-ink/40" : ""}>
                          <td>
                            {i === 0 && sg && <div className="text-[11px] uppercase tracking-wide text-ink/40">{sg}</div>}
                            <Link className="hover:underline" href={`/lancamentos?escopo=${scope}&ciclo=${cycle}&categoria=${c.id}`}>{c.name}</Link>
                            {c.excluded_from_totals && <span className="chip ml-2">fora do total</span>}
                          </td>
                          <td className="num">{c.kind === "receita" ? <span className="text-ink/30">—</span> : <BudgetInput categoryId={c.id} cycle={cycle} initial={p} />}</td>
                          <td className="num">{r ? formatBRL(r) : <span className="text-ink/30">—</span>}</td>
                          <td className={`num ${p && left < 0 ? "text-loss" : "text-ink/60"}`}>{p ? formatBRL(left) : ""}</td>
                          <td>{p > 0 && <Bar value={r} max={p} color={r > p ? "#e11d48" : r > p * 0.8 ? "#d97706" : groupColor(g)} />}</td>
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
  );
}

function AnnualMatrix({ cats, txs, cycles, scope }: { cats: Category[]; txs: Transaction[]; cycles: string[]; scope: Scope }) {
  const cell = new Map<string, number>();
  for (const t of txs) {
    const k = `${t.category_id}|${t.cycle}`;
    cell.set(k, (cell.get(k) ?? 0) + Number(t.amount));
  }
  const sums = cycles.map((c) => summarize(txs.filter((t) => t.cycle === c), cats));
  const groups = GROUP_ORDER[scope].map((g) => ({ g, cats: cats.filter((c) => c.grp === g) })).filter((x) => x.cats.length);
  const v = (n: number) => (n ? formatBRL(n).replace("R$", "").trim() : "");

  return (
    <div className="card overflow-x-auto p-0">
      <table className="table min-w-[1200px] text-xs">
        <thead className="sticky top-0 bg-white">
          <tr><th className="sticky left-0 bg-white">Categoria</th>{cycles.map((c) => <th key={c} className="num capitalize">{cycleLabel(c).slice(0, 3)}</th>)}<th className="num">Total</th></tr>
        </thead>
        <tbody>
          {groups.map(({ g, cats: gc }) => {
            const rows = gc.filter((c) => cycles.some((cy) => cell.get(`${c.id}|${cy}`)));
            const gTot = cycles.map((cy) => gc.reduce((a, c) => a + (c.excluded_from_totals ? 0 : cell.get(`${c.id}|${cy}`) ?? 0), 0));
            return [
              <tr key={g} className="font-semibold" style={{ background: `${groupColor(g)}0d` }}>
                <td className="sticky left-0 bg-white"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: groupColor(g) }} />{g}</span></td>{gTot.map((n, i) => <td key={i} className="num">{v(n)}</td>)}<td className="num">{v(gTot.reduce((a, b) => a + b, 0))}</td>
              </tr>,
              ...rows.map((c) => {
                const vals = cycles.map((cy) => cell.get(`${c.id}|${cy}`) ?? 0);
                return (
                  <tr key={c.id} className={c.excluded_from_totals ? "text-ink/40" : ""}>
                    <td className="sticky left-0 bg-white pl-6">{c.name}</td>{vals.map((n, i) => <td key={i} className="num">{v(n)}</td>)}<td className="num">{v(vals.reduce((a, b) => a + b, 0))}</td>
                  </tr>
                );
              }),
              ...(scope === "pessoal" && g !== "Receitas" && g !== "A classificar" ? [
                <tr key={g + "%"} className="text-ink/40"><td className="sticky left-0 bg-white pl-6 italic">% sobre receita</td>{gTot.map((n, i) => <td key={i} className="num">{sums[i].receitas && n ? formatPct(n / sums[i].receitas) : ""}</td>)}<td /></tr>,
              ] : []),
            ];
          })}
          <tr className="border-t-2 border-ink/20 font-semibold">
            <td className="sticky left-0 bg-white">Saldo</td>
            {sums.map((s, i) => <td key={i} className={`num ${s.saldo < 0 ? "text-loss" : s.saldo > 0 ? "text-gain" : ""}`}>{v(s.saldo)}</td>)}
            <td className="num">{v(sums.reduce((a, s) => a + s.saldo, 0))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
