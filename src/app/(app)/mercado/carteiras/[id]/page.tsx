import Link from "next/link";
import { notFound } from "next/navigation";
import { canEdit, requireArea } from "@/lib/context";
import { formatMoney } from "@/lib/format";
import { type UniverseRow } from "@/lib/market/universe";
import { type EvalItem, type EvalNote, itemReturn, portfolioStats, RATING } from "@/lib/eval";
import { Empty, PageHeader } from "@/components/ui";
import { addNote, deleteNote, deletePortfolio, removeItem, updateItem, updatePortfolio } from "../../actions";

const pctTxt = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1).replace(".", ",")}%`);
const pctCls = (v: number | null) => (v == null ? "text-ink/30" : v >= 0 ? "text-gain" : "text-loss");
const dt = (s: string) => new Date(s).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const dec = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));

export default async function CarteiraPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireArea("analise");
  const { id } = await params;
  const edit = canEdit(ctx, "analise");
  const { data: p } = await ctx.supabase.from("eval_portfolios").select("*").eq("id", id).eq("household_id", ctx.household.id).maybeSingle();
  if (!p) notFound();
  const { data: it } = await ctx.supabase.from("eval_items").select("*").eq("portfolio_id", id).order("added_at");
  const items = (it ?? []) as EvalItem[];
  const [{ data: u }, { data: nt }] = await Promise.all([
    items.length ? ctx.supabase.from("market_universe").select("*").in("yahoo", items.map((i) => i.yahoo)) : Promise.resolve({ data: [] }),
    items.length ? ctx.supabase.from("eval_notes").select("*").in("item_id", items.map((i) => i.id)).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const uni = new Map<string, UniverseRow>(((u ?? []) as UniverseRow[]).map((x) => [x.yahoo, x] as [string, UniverseRow]));
  const notes = (nt ?? []) as EvalNote[];
  const prices = new Map<string, number>([...uni].filter(([, x]) => x.price != null).map(([k, x]) => [k, Number(x.price)] as [string, number]));
  const st = portfolioStats(items, prices);
  const byRating = Object.keys(RATING).map((k) => [k, items.filter((i) => i.rating === k).length] as const).filter(([, n]) => n);

  return (
    <div>
      <PageHeader title={p.name} subtitle={p.description ?? "Carteira de avaliação"}>
        <Link href="/mercado/carteiras" className="btn-ghost">← Carteiras</Link>
        <Link href="/mercado" className="btn">+ Adicionar ativos</Link>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card"><div className="label">Desde a inclusão</div><div className={`display mt-1 text-[34px] leading-none ${pctCls(st.ret)}`}>{pctTxt(st.ret)}</div><div className="mt-1 text-xs text-ink/45">{items.some((i) => i.weight) ? "ponderado pelos pesos" : "média simples dos ativos"}</div></div>
        <div className="card"><div className="label">Ativos</div><div className="display mt-1 text-[34px] leading-none">{items.length}</div><div className="mt-1 text-xs text-ink/45">{notes.length} análise(s) registrada(s)</div></div>
        <div className="card"><div className="label">Destaques</div><div className="mt-2 space-y-1 text-sm">{st.best ? <div className="flex justify-between"><span>Melhor</span><b className="text-gain">{st.best.symbol} {pctTxt(itemReturn(st.best, prices.get(st.best.yahoo)))}</b></div> : "—"}{st.worst && <div className="flex justify-between"><span>Pior</span><b className="text-loss">{st.worst.symbol} {pctTxt(itemReturn(st.worst, prices.get(st.worst.yahoo)))}</b></div>}</div></div>
        <div className="card"><div className="label">Recomendações</div><div className="mt-2 flex flex-wrap gap-1.5">{byRating.length ? byRating.map(([k, n]) => <span key={k} className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: RATING[k].c }}>{RATING[k].l} · {n}</span>) : <span className="text-sm text-ink/40">—</span>}</div></div>
      </div>

      {!items.length ? <div className="card"><Empty icon="briefcase">Carteira vazia. Vá ao <Link className="text-brand underline" href="/mercado">Mercado</Link> e use “+ Carteira” nos ativos que quer avaliar.</Empty></div> : (
        <div className="space-y-3">
          {items.map((i) => {
            const x = uni.get(i.yahoo), price = x?.price != null ? Number(x.price) : null, ret = itemReturn(i, price);
            const up = i.target_price && price ? Number(i.target_price) / price - 1 : null;
            const toStop = i.stop_price && price ? Number(i.stop_price) / price - 1 : null;
            const ns = notes.filter((n) => n.item_id === i.id);
            const href = `/analise/${encodeURIComponent(i.market === "BR" ? i.symbol : i.yahoo)}`;
            return (
              <section key={i.id} className="card !p-0">
                <div className="grid items-center gap-4 px-5 py-4 md:grid-cols-[minmax(200px,1.6fr)_repeat(5,minmax(90px,1fr))]">
                  <div className="flex items-center gap-3">
                    <span className="h-10 w-1 rounded-full" style={{ background: RATING[i.rating]?.c }} />
                    <div className="min-w-0"><Link href={href} className="font-semibold hover:underline">{i.symbol}</Link> <span className="ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: RATING[i.rating]?.c }}>{RATING[i.rating]?.l}</span>
                      <div className="truncate text-xs text-ink/50">{i.name ?? x?.name}{x?.sector ? ` · ${x.sector}` : ""}</div></div>
                  </div>
                  <div><div className="label !mb-0">Atual</div><div className="tabular-nums">{formatMoney(price, i.currency)}</div><div className={`text-xs tabular-nums ${x?.change_pct == null ? "text-ink/30" : x.change_pct >= 0 ? "text-gain" : "text-loss"}`}>{x?.change_pct == null ? "" : `${x.change_pct >= 0 ? "+" : ""}${x.change_pct.toFixed(2).replace(".", ",")}% hoje`}</div></div>
                  <div><div className="label !mb-0">Na inclusão</div><div className="tabular-nums">{formatMoney(i.added_price, i.currency)}</div><div className="text-xs text-ink/45">{dt(i.added_at)}</div></div>
                  <div><div className="label !mb-0">Resultado</div><div className={`display text-[22px] leading-tight ${pctCls(ret)}`}>{pctTxt(ret)}</div></div>
                  <div><div className="label !mb-0">Alvo</div><div className="tabular-nums">{i.target_price ? formatMoney(Number(i.target_price), i.currency) : "—"}</div><div className={`text-xs ${pctCls(up)}`}>{up != null ? `${pctTxt(up)} até o alvo` : ""}</div></div>
                  <div><div className="label !mb-0">Stop</div><div className="tabular-nums">{i.stop_price ? formatMoney(Number(i.stop_price), i.currency) : "—"}</div><div className="text-xs text-ink/45">{toStop != null ? `${pctTxt(toStop)} até o stop` : ""}</div></div>
                </div>
                {(x?.pe != null || x?.dy != null || x?.pb != null) && (
                  <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-ink/[0.05] px-5 py-2 text-xs text-ink/55">
                    {x?.pe != null && x.pe > 0 && <span>P/L <b className="text-ink">{x.pe.toFixed(1).replace(".", ",")}</b></span>}
                    {x?.pb != null && <span>P/VP <b className="text-ink">{x.pb.toFixed(2).replace(".", ",")}</b></span>}
                    {x?.dy ? <span>DY <b className="text-ink">{x.dy.toFixed(1).replace(".", ",")}%</b></span> : null}
                    {x?.roe != null && <span>ROE <b className="text-ink">{x.roe.toFixed(1).replace(".", ",")}%</b></span>}
                    {x?.perf_1y != null && <span>12 meses <b className={x.perf_1y >= 0 ? "text-gain" : "text-loss"}>{x.perf_1y >= 0 ? "+" : ""}{x.perf_1y.toFixed(1).replace(".", ",")}%</b></span>}
                    {i.weight ? <span>Peso <b className="text-ink">{dec(i.weight)}%</b></span> : null}
                  </div>)}
                {i.thesis && <p className="whitespace-pre-line border-t border-ink/[0.05] px-5 py-3 text-sm text-ink/75"><span className="eyebrow mr-2">Tese</span>{i.thesis}</p>}
                <details className="border-t border-ink/[0.05]">
                  <summary className="cursor-pointer px-5 py-2.5 text-sm text-brand">Análises ({ns.length}){edit ? " · editar tese, alvo e recomendação" : ""}</summary>
                  <div className="grid gap-5 px-5 pb-5 lg:grid-cols-2">
                    <div>
                      {edit && (
                        <form action={addNote} className="mb-3 space-y-2">
                          <input type="hidden" name="item_id" value={i.id} />
                          <textarea name="body" required rows={3} maxLength={4000} className="input" placeholder="Registre a análise de hoje: o que viu no gráfico, no balanço, nas notícias…" />
                          <button className="btn !py-1.5 text-xs">Registrar análise{price ? ` (preço ${formatMoney(price, i.currency)})` : ""}</button>
                        </form>)}
                      <ol className="space-y-3">
                        {ns.map((n) => (
                          <li key={n.id} className="relative border-l border-gold/40 pl-4">
                            <span className="absolute -left-[4px] top-1.5 h-2 w-2 rounded-full bg-gold" />
                            <div className="text-xs text-ink/45">{dt(n.created_at)}{n.author_name ? ` · ${n.author_name}` : ""}{n.price != null ? ` · preço ${formatMoney(Number(n.price), i.currency)}` : ""}
                              {edit && <form action={deleteNote} className="ml-2 inline"><input type="hidden" name="id" value={n.id} /><button className="text-ink/30 hover:text-loss">excluir</button></form>}</div>
                            <p className="mt-0.5 whitespace-pre-line text-sm">{n.body}</p>
                          </li>))}
                        {!ns.length && <li className="text-sm text-ink/40">Nenhuma análise registrada ainda.</li>}
                      </ol>
                    </div>
                    {edit && (
                      <form action={updateItem} className="grid grid-cols-2 gap-2 self-start rounded-2xl bg-ink/[0.025] p-4">
                        <input type="hidden" name="id" value={i.id} />
                        <div><label className="label">Recomendação</label><select className="input" name="rating" defaultValue={i.rating}>{Object.entries(RATING).map(([k, r]) => <option key={k} value={k}>{r.l}</option>)}</select></div>
                        <div><label className="label">Peso na carteira (%)</label><input className="input" name="weight" defaultValue={dec(i.weight)} placeholder="opcional" /></div>
                        <div><label className="label">Preço-alvo</label><input className="input" name="target" defaultValue={dec(i.target_price)} placeholder={i.currency ?? ""} /></div>
                        <div><label className="label">Stop</label><input className="input" name="stop" defaultValue={dec(i.stop_price)} placeholder={i.currency ?? ""} /></div>
                        <div className="col-span-2"><label className="label">Tese de investimento</label><textarea className="input" name="thesis" rows={4} defaultValue={i.thesis ?? ""} placeholder="Por que este ativo está aqui? O que precisa acontecer para dar certo?" /></div>
                        <div className="col-span-2 flex items-center justify-between gap-2">
                          <button className="btn !py-1.5 text-xs">Salvar</button>
                          <Link href={href} className="text-xs text-brand hover:underline">Abrir gráfico e análise técnica →</Link>
                        </div>
                      </form>)}
                  </div>
                  {edit && <form action={removeItem} className="px-5 pb-4"><input type="hidden" name="id" value={i.id} /><button className="text-xs text-ink/40 hover:text-loss">Remover {i.symbol} desta carteira</button></form>}
                </details>
              </section>);
          })}
        </div>)}

      {edit && (
        <details className="card mt-8">
          <summary className="cursor-pointer text-sm font-medium">Configurações da carteira</summary>
          <form action={updatePortfolio} className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end">
            <input type="hidden" name="id" value={p.id} />
            <div><label className="label">Nome</label><input className="input" name="name" defaultValue={p.name} required maxLength={80} /></div>
            <div><label className="label">Objetivo</label><input className="input" name="description" defaultValue={p.description ?? ""} maxLength={400} /></div>
            <button className="btn">Salvar</button>
          </form>
          <form action={deletePortfolio} className="mt-4 border-t border-ink/[0.06] pt-4"><input type="hidden" name="id" value={p.id} /><button className="text-sm text-loss hover:underline">Excluir esta carteira e todas as análises dela</button></form>
        </details>)}
    </div>
  );
}
