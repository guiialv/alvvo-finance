import Link from "next/link";
import { canEdit, requireArea } from "@/lib/context";
import { Empty, PageHeader } from "@/components/ui";
import { createPortfolioForm } from "../actions";
import { portfolioStats, type EvalItem } from "@/lib/eval";

export default async function CarteirasPage() {
  const ctx = await requireArea("analise");
  const edit = canEdit(ctx, "analise");
  const [{ data: pf }, { data: items }] = await Promise.all([
    ctx.supabase.from("eval_portfolios").select("id, name, description, created_at, updated_at").eq("household_id", ctx.household.id).order("created_at"),
    ctx.supabase.from("eval_items").select("*").eq("household_id", ctx.household.id),
  ]);
  const list = (items ?? []) as EvalItem[];
  const { data: u } = list.length ? await ctx.supabase.from("market_universe").select("yahoo, price").in("yahoo", [...new Set(list.map((i) => i.yahoo))]) : { data: [] };
  const price = new Map<string, number>(((u ?? []) as { yahoo: string; price: number }[]).map((x) => [x.yahoo, Number(x.price)] as [string, number]));

  return (
    <div>
      <PageHeader title="Carteiras de avaliação" subtitle="Monte carteiras com os ativos que está estudando, registre a tese e as análises, e acompanhe o desempenho desde que entraram.">
        <Link href="/mercado" className="btn-ghost">← Mercado</Link>
      </PageHeader>

      {edit && (
        <form action={createPortfolioForm} className="card mb-6 flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1"><label className="label">Nova carteira</label><input className="input" name="name" required maxLength={80} placeholder="Ex.: Dividendos Brasil, Tech EUA, Teses 2027" /></div>
          <div className="min-w-[260px] flex-[2]"><label className="label">Objetivo (opcional)</label><input className="input" name="description" maxLength={400} placeholder="O que esta carteira procura" /></div>
          <button className="btn">Criar carteira</button>
        </form>)}

      {!(pf ?? []).length ? <div className="card"><Empty icon="briefcase">Nenhuma carteira ainda. Crie uma acima ou use “+ Carteira” em qualquer ativo do <Link className="text-brand underline" href="/mercado">Mercado</Link>.</Empty></div> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(pf as { id: string; name: string; description: string | null; updated_at: string }[]).map((p) => {
            const its = list.filter((i) => i.portfolio_id === p.id);
            const st = portfolioStats(its, price);
            return (
              <Link key={p.id} href={`/mercado/carteiras/${p.id}`} className="card group flex flex-col gap-3 transition hover:border-gold/40">
                <div><div className="eyebrow">{its.length} ativo(s)</div><h2 className="mt-1 font-serif text-[24px] font-normal leading-tight group-hover:underline">{p.name}</h2>
                  {p.description && <p className="mt-1 line-clamp-2 text-sm text-ink/55">{p.description}</p>}</div>
                <div className="mt-auto flex items-end justify-between border-t border-ink/[0.06] pt-3">
                  <div><div className="label !mb-0">Desde a inclusão</div><div className={`display text-[26px] ${st.ret == null ? "text-ink/30" : st.ret >= 0 ? "text-gain" : "text-loss"}`}>{st.ret == null ? "—" : `${st.ret >= 0 ? "+" : ""}${(st.ret * 100).toFixed(1).replace(".", ",")}%`}</div></div>
                  <div className="text-right text-xs text-ink/50">{st.best && <div>Melhor: <b className="text-gain">{st.best.symbol}</b></div>}{st.worst && <div>Pior: <b className="text-loss">{st.worst.symbol}</b></div>}</div>
                </div>
                <div className="flex flex-wrap gap-1">{its.slice(0, 10).map((i) => <span key={i.id} className="chip">{i.symbol}</span>)}{its.length > 10 && <span className="chip">+{its.length - 10}</span>}</div>
              </Link>);
          })}
        </div>)}
    </div>
  );
}
