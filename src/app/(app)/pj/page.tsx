import Link from "next/link";
import { requireArea } from "@/lib/context";
import { cyclesOfYear, todayIso } from "@/lib/cycle";
import { categoryIndex, loadCategories, loadTransactions } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { Empty, Kpi, PageHeader } from "@/components/ui";
import { addInvoice, deleteInvoice } from "./actions";

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

  const sum = (k: keyof Invoice) => invoices.reduce((a, i) => a + Number(i[k] ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="PJ" subtitle="Notas fiscais emitidas, impostos e custos da empresa — separado das finanças pessoais">
        <div className="flex items-center gap-1 rounded-xl border border-black/10 bg-white p-1 text-sm">
          <Link className="rounded-lg px-2 py-1 hover:bg-black/5" href={`/pj?ano=${year - 1}`}>←</Link>
          <span className="px-2 font-semibold">{year}</span>
          <Link className="rounded-lg px-2 py-1 hover:bg-black/5" href={`/pj?ano=${year + 1}`}>→</Link>
        </div>
        <Link className="btn-ghost" href="/lancamentos?escopo=pj">Lançamentos PJ</Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Faturado (NFs)" value={faturado} accent="#4f7a52" sub={`Média ${formatBRL(faturado / monthsWithNF)}/mês`} />
        <Kpi label="Impostos" value={impostos} accent="#a33f30" sub={faturado ? `${((impostos / faturado) * 100).toFixed(1)}% do faturamento` : undefined} />
        <Kpi label="Custos PJ" value={custos} accent="#6b6459" />
        <Kpi label="Resultado PJ" value={resultado} tone="auto" />
        <Kpi label="Retiradas p/ pessoal" value={retiradas} accent="#0284c7" />
      </div>

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
