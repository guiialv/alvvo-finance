import Link from "next/link";
import { requireArea } from "@/lib/context";
import { cyclesOfYear, todayIso } from "@/lib/cycle";
import { categoryIndex, loadCategories, loadTransactions } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { Empty, Kpi, PageHeader } from "@/components/ui";
import { addInvoice, addPjEntry, deleteInvoice, deletePjEntry } from "./actions";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

interface Invoice { id: string; month: string; number: string | null; client: string | null; total: number; salary_part: number; commission_part: number; other_part: number; notes: string | null }

export default async function PJPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const ctx = await requireArea("pj");
  const sp = await searchParams;
  const year = Number(sp.ano) || Number(todayIso().slice(0, 4));

  const [invRes, cats, txs] = await Promise.all([
    ctx.supabase.from("pj_invoices").select("*").eq("household_id", ctx.household.id).gte("month", `${year}-01-01`).lte("month", `${year}-12-31`).order("month"),
    loadCategories(ctx, "pj"),
    loadTransactions(ctx, { scope: "pj", cycles: cyclesOfYear(year) }),
  ]);
  const invoices = (invRes.data ?? []) as Invoice[];
  const { byId } = categoryIndex(cats);

  const byGroup: Record<string, number> = {};
  for (const t of txs) {
    const g = (t.category_id && byId.get(t.category_id)?.grp) || "Outros";
    byGroup[g] = (byGroup[g] ?? 0) + Number(t.amount);
  }
  const faturado = invoices.reduce((a, i) => a + Number(i.total), 0);
  const monthsWithNF = new Set(invoices.map((i) => i.month.slice(0, 7))).size || 1;
  const impostos = byGroup["Impostos"] ?? 0;
  const custos = byGroup["Custos PJ"] ?? 0;
  const retiradas = byGroup["Retiradas"] ?? 0;
  const resultado = faturado + (byGroup["Receitas PJ"] ?? 0) - impostos - custos;

  // Categorias PJ para o lançamento rápido (Impostos, Custos, Retiradas e Receitas PJ)
  const ORDEM = ["Impostos", "Custos PJ", "Retiradas", "Receitas PJ"];
  const grupos = [...new Set(cats.filter((c) => c.active).map((c) => c.grp))].sort((a, b) => (ORDEM.indexOf(a) + 1 || 9) - (ORDEM.indexOf(b) + 1 || 9));
  const ultimos = [...txs].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 12);

  const sum = (k: keyof Invoice) => invoices.reduce((a, i) => a + Number(i[k] ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="PJ" subtitle="Notas fiscais emitidas, impostos e custos da empresa — separado das finanças pessoais">
        <div className="flex items-center gap-1 rounded-xl border border-black/10 bg-white p-1 text-sm">
          <Link className="rounded-lg px-2 py-1 hover:bg-black/5" href={`/pj?ano=${year - 1}`}>←</Link>
          <span className="px-2 font-semibold">{year}</span>
          <Link className="rounded-lg px-2 py-1 hover:bg-black/5" href={`/pj?ano=${year + 1}`}>→</Link>
        </div>
        <a className="btn" href="#despesas-pj">Lançar imposto ou custo</a>
        <Link className="btn-ghost" href="/lancamentos?escopo=pj">Lançamentos PJ</Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Faturado (NFs)" value={faturado} accent="#4f7a52" sub={`Média ${formatBRL(faturado / monthsWithNF)}/mês`} />
        <Kpi label="Impostos" value={impostos} accent="#a33f30" sub={faturado ? `${((impostos / faturado) * 100).toFixed(1)}% do faturamento` : undefined} />
        <Kpi label="Custos PJ" value={custos} accent="#6b6459" />
        <Kpi label="Resultado PJ" value={resultado} tone="auto" />
        <Kpi label="Retiradas p/ pessoal" value={retiradas} accent="#0284c7" />
      </div>

      {impostos === 0 && custos === 0 && (
        <p className="rounded-2xl border border-[#e2d8c6] bg-surface px-4 py-3 text-sm text-ink/65">Ainda não há impostos nem custos em {year}. <a href="#despesas-pj" className="font-medium text-brand">Lance-os em “Impostos, custos e retiradas” ↓</a></p>
      )}

      <section className="card">
        <h2 className="mb-4">Nova nota fiscal</h2>
        <form action={addInvoice} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-8">
          <div className="lg:col-span-1"><label className="label">Mês</label><input className="input" type="month" name="month" defaultValue={todayIso().slice(0, 7)} required /></div>
          <div><label className="label">Nº NF</label><input className="input" name="number" /></div>
          <div><label className="label">Cliente</label><input className="input" name="client" /></div>
          <div><label className="label">Salário</label><input className="input" name="salary_part" inputMode="decimal" placeholder="0,00" /></div>
          <div><label className="label">Comissão</label><input className="input" name="commission_part" inputMode="decimal" placeholder="0,00" /></div>
          <div><label className="label">Outros</label><input className="input" name="other_part" inputMode="decimal" placeholder="0,00" /></div>
          <div><label className="label">Obs.</label><input className="input" name="notes" placeholder="Abono, 13º…" /></div>
          <div className="flex items-end"><button className="btn w-full">Adicionar</button></div>
        </form>
        <p className="mt-2 text-xs text-ink/40">O total da NF é a soma de salário + comissão + outros.</p>
      </section>

      <section id="despesas-pj" className="card scroll-mt-24">
        <h2>Impostos, custos e retiradas</h2>
        <p className="mb-4 mt-1 text-sm text-ink/55">Registre aqui o DAS, o INSS, a contabilidade e as demais despesas da empresa, além das retiradas para a conta pessoal. Os lançamentos do extrato da conta PJ classificados nessas categorias também entram automaticamente.</p>
        {grupos.length === 0 ? <Empty>Nenhuma categoria PJ ativa. Crie as categorias em Orçamento, na visão PJ.</Empty> : (
          <form action={addPjEntry} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_.8fr_.8fr_auto]">
            <div><label className="label">Categoria</label>
              <select className="input" name="category_id" required defaultValue="">
                <option value="" disabled>Selecione…</option>
                {grupos.map((g) => <optgroup key={g} label={g}>{cats.filter((c) => c.active && c.grp === g).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}
              </select></div>
            <div><label className="label">Descrição (opcional)</label><input className="input" name="description" placeholder="Ex.: DAS de novembro" /></div>
            <div><label className="label">Data</label><input className="input" type="date" name="date" defaultValue={todayIso()} required /></div>
            <div><label className="label">Valor</label><input className="input" name="amount" inputMode="decimal" placeholder="0,00" required /></div>
            <div className="flex items-end"><button className="btn w-full">Lançar</button></div>
          </form>
        )}
        {ultimos.length > 0 && (
          <div className="mt-5 divide-y divide-[#efe7da] border-t border-[#efe7da]">
            {ultimos.map((t) => {
              const c = t.category_id ? byId.get(t.category_id) : undefined;
              return (
                <div key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-12 shrink-0 text-xs text-ink/45">{String(t.date).slice(8, 10)}/{String(t.date).slice(5, 7)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{t.description}</span><span className="text-xs text-ink/45">{c ? `${c.grp} · ${c.name}` : "Sem categoria"}</span></span>
                  <span className="num font-medium">{formatBRL(Number(t.amount))}</span>
                  <form action={deletePjEntry}><input type="hidden" name="id" value={t.id} /><button className="text-xs text-ink/30 hover:text-loss" aria-label="Excluir">✕</button></form>
                </div>
              );
            })}
            <p className="pt-3 text-xs text-ink/45">Últimos lançamentos PJ de {year}. <Link href="/lancamentos?escopo=pj" className="font-medium text-brand">Ver todos →</Link></p>
          </div>
        )}
      </section>

      <section className="card overflow-x-auto p-0">
        <h2 className="px-5 pt-4">Notas fiscais de {year}</h2>
        {invoices.length === 0 ? <div className="p-5"><Empty>Nenhuma NF lançada em {year}.</Empty></div> : (
          <table className="table mt-2 min-w-[720px]">
            <thead><tr><th>Mês</th><th>NF / Cliente</th><th className="num">Total</th><th className="num">Salário</th><th className="num">Comissão</th><th className="num">Outros</th><th>Obs.</th><th></th></tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td className="capitalize">{MESES[Number(i.month.slice(5, 7)) - 1]}</td>
                  <td className="text-ink/60">{[i.number, i.client].filter(Boolean).join(" · ")}</td>
                  <td className="num font-medium">{formatBRL(i.total)}</td>
                  <td className="num">{formatBRL(i.salary_part)}</td>
                  <td className="num">{formatBRL(i.commission_part)}</td>
                  <td className="num">{formatBRL(i.other_part)}</td>
                  <td className="text-ink/60">{i.notes}</td>
                  <td><form action={deleteInvoice}><input type="hidden" name="id" value={i.id} /><button className="text-xs text-ink/30 hover:text-loss">✕</button></form></td>
                </tr>
              ))}
              <tr className="font-semibold"><td>Total</td><td /><td className="num">{formatBRL(faturado)}</td><td className="num">{formatBRL(sum("salary_part"))}</td><td className="num">{formatBRL(sum("commission_part"))}</td><td className="num">{formatBRL(sum("other_part"))}</td><td colSpan={2} /></tr>
              <tr className="text-ink/60"><td>Média</td><td /><td className="num">{formatBRL(faturado / monthsWithNF)}</td><td className="num">{formatBRL(sum("salary_part") / monthsWithNF)}</td><td className="num">{formatBRL(sum("commission_part") / monthsWithNF)}</td><td className="num">{formatBRL(sum("other_part") / monthsWithNF)}</td><td colSpan={2} /></tr>
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
