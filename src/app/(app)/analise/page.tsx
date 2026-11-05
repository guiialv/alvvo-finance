import Link from "next/link";
import { canEdit, requireArea } from "@/lib/context";
import { analyzeTicker, type Watch } from "@/lib/analise";
import { PERIODS, performance } from "@/lib/technical";
import { getQuotes } from "@/lib/market/read";
import { loadHistory } from "@/lib/market/history";
import { yahooSymbol } from "@/lib/market/sources";
import { formatBRL } from "@/lib/format";
import { Empty, PageHeader, Seg } from "@/components/ui";
import { RefreshButton } from "@/components/refresh-button";
import { addWatch, delWatch, setTargets } from "./actions";
import { RendaFixa } from "./renda-fixa";

const VERD_C: Record<string, string> = { "Compra forte": "#4f7a52", Compra: "#7d9a72", Neutro: "#8c8579", Venda: "#c0784a", "Venda forte": "#a33f30" };
const ACT_C: Record<string, string> = { Compra: "bg-emerald-600 text-white", Neutro: "bg-ink/10 text-ink/70", Venda: "bg-rose-600 text-white" };
const pct = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2).replace(".", ",")}%`);
const perfStyle = (v: number | null) => { if (v == null) return { color: "#1f1b1755" }; const a = Math.min(1, Math.abs(v) / 0.5) * 0.28 + 0.04; return v >= 0 ? { background: `rgba(21,128,61,${a})`, color: "#14532d" } : { background: `rgba(225,29,72,${a})`, color: "#881337" }; };
const money = (v: number | null) => (v == null ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2 }));

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireArea("analise");
  const sp = await searchParams, tab = sp.aba === "rf" ? "rf" : "acoes", edit = canEdit(ctx, "analise");
  const tabs = <div className="mb-5"><Seg options={[["acoes", "Ações"], ["rf", "Renda fixa"]]} current={tab} hrefFor={(v) => `/analise?aba=${v}`} /></div>;
  if (tab === "rf") return (
    <div>
      <PageHeader title="Análise" subtitle="Onde a renda fixa paga mais hoje: Tesouro Direto, CDB, LCI/LCA e poupança comparados pelo que fica no seu bolso, com IR, custódia e inflação." />
      {tabs}<RendaFixa ctx={ctx} sp={sp} edit={edit} />
    </div>
  );

  const { data: wl } = await ctx.supabase.from("watchlist").select("ticker, buy, sell, note, fund").eq("household_id", ctx.household.id).order("created_at");
  const watch = ((wl ?? []) as Watch[]).map((w) => ({ ...w, buy: w.buy == null ? null : Number(w.buy), sell: w.sell == null ? null : Number(w.sell) }));
  const syms = watch.map((w) => yahooSymbol(w.ticker));
  const [quotes, histories] = await Promise.all([getQuotes(ctx, syms), Promise.all(syms.map((s) => loadHistory(ctx, s)))]);
  const rows = watch.map((w, i) => { const h = histories[i], q = quotes[syms[i]]; return { w, sym: syms[i], name: q?.name ?? null, h, ...analyzeTicker(w, h, q?.price ?? null), perf: h.length > 1 ? performance(h) : null }; });
  const alerts = rows.filter((r) => r.zone);
  const sortKey = sp.ord ?? "", desc = sortKey.startsWith("-"), key = sortKey.replace("-", "");
  const perfRows = [...rows].filter((r) => r.perf);
  if (key) perfRows.sort((a, b) => ((a.perf![key] ?? -Infinity) - (b.perf![key] ?? -Infinity)) * (desc ? 1 : -1));

  return (
    <div>
      <PageHeader title="Análise" subtitle="Monitor de preços das ações que você acompanha: seus alvos de compra e venda, sinais técnicos, preço justo e desempenho. Clique numa ação para o gráfico completo."><RefreshButton label="Atualizar cotações" /></PageHeader>
      {tabs}
      {alerts.length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{alerts.map((r) => (
          <Link key={r.w.ticker} href={`/analise/${r.w.ticker}`} className="flex items-center gap-3 rounded-2xl border border-ink/[0.06] bg-white p-3 shadow-sm hover:shadow-md">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700">🔔</div><div className="flex-1"><div className="font-semibold">{r.w.ticker} · {formatBRL(r.price)}</div><div className="text-xs text-ink/55">{r.zone!.t}</div></div>
          </Link>))}</div>)}
      <section className="card overflow-x-auto p-0">
        <div className="flex items-center justify-between px-5 py-3"><h2>Monitor de preços</h2><span className="text-xs text-ink/45">{rows.length} ações acompanhadas</span></div>
        {rows.length === 0 ? <div className="border-t border-ink/5 px-5 py-8"><Empty icon="candle">Nenhuma ação no monitor ainda. Adicione abaixo as ações que você quer acompanhar, com seus preços-alvo.</Empty></div> : (
          <table className="table min-w-[1100px]"><thead><tr><th>Ação</th><th className="num">Cotação</th><th className="num">Meus alvos (compra · venda)</th><th>Situação</th><th>Técnico</th><th className="num">Preço justo</th><th>Sugestão</th><th /></tr></thead><tbody>
            {rows.map((r) => { const fv = [r.fair.graham, r.fair.bazin].filter((x): x is number => !!x), fvAvg = fv.length ? fv.reduce((a, b) => a + b, 0) / fv.length : null; return (
              <tr key={r.w.ticker} className="hover:bg-brand/[0.03]">
                <td><Link href={`/analise/${r.w.ticker}`} className="font-semibold hover:text-brand">{r.w.ticker}</Link><div className="text-xs text-ink/45">{r.name ?? ""}{r.w.note ? ` · ${r.w.note}` : ""}</div></td>
                <td className="num">{r.price != null ? formatBRL(r.price) : "—"}</td>
                <td className="num">{edit ? (
                  <form action={setTargets} className="inline-flex items-center gap-1"><input type="hidden" name="ticker" value={r.w.ticker} />
                    <input name="buy" defaultValue={money(r.w.buy)} placeholder="compra" className="w-20 rounded-lg border border-transparent bg-ink/[0.04] px-2 py-1 text-right tabular-nums hover:border-ink/10 focus:border-brand" />
                    <input name="sell" defaultValue={money(r.w.sell)} placeholder="venda" className="w-20 rounded-lg border border-transparent bg-ink/[0.04] px-2 py-1 text-right tabular-nums hover:border-ink/10 focus:border-brand" />
                    <button className="text-xs text-brand">ok</button></form>) : `${r.w.buy ? formatBRL(r.w.buy) : "—"} · ${r.w.sell ? formatBRL(r.w.sell) : "—"}`}</td>
                <td>{r.zone ? <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${r.zone.tone === "buy" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{r.zone.t}</span> : <span className="text-xs text-ink/35">—</span>}</td>
                <td>{r.tech ? <span className="text-xs font-semibold" style={{ color: VERD_C[r.tech.verdict] }}>{r.tech.verdict}</span> : <span className="text-xs text-ink/35">sem histórico</span>}</td>
                <td className="num">{fvAvg && r.price ? <>{formatBRL(fvAvg)}<div className={`text-[10px] ${fvAvg > r.price ? "text-gain" : "text-loss"}`}>{pct(fvAvg / r.price - 1)}</div></> : <span className="text-xs text-ink/30" title="Informe P/L, P/VP e DY no gráfico da ação">—</span>}</td>
                <td>{r.sug ? <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${ACT_C[r.sug.action]}`}>{r.sug.action}</span> : <span className="text-xs text-ink/40">sem cotação</span>}</td>
                <td>{edit && <form action={delWatch}><input type="hidden" name="ticker" value={r.w.ticker} /><button className="text-xs text-ink/30 hover:text-loss">Remover</button></form>}</td>
              </tr>); })}
          </tbody></table>)}
        {edit && (
          <form action={addWatch} className="flex flex-wrap items-end gap-2 border-t border-ink/5 px-5 py-3">
            <div><label className="label">Adicionar ação</label><input className="input w-32 uppercase" name="ticker" required placeholder="PETR4" /></div>
            <div><label className="label">Alvo compra</label><input className="input w-28" name="buy" inputMode="decimal" /></div>
            <div><label className="label">Alvo venda</label><input className="input w-28" name="sell" inputMode="decimal" /></div>
            <div className="flex-1"><label className="label">Nota</label><input className="input" name="note" placeholder="Por que estou de olho" /></div>
            <button className="btn">Adicionar</button>
          </form>)}
      </section>

      {perfRows.length > 0 && (
        <section className="card mt-4 overflow-x-auto p-0">
          <div className="px-5 py-3"><h2>Desempenho</h2><p className="text-xs text-ink/50">Variação % do preço em cada período (ajustada por proventos). Clique no título de uma coluna para ordenar.</p></div>
          <table className="table min-w-[980px]"><thead><tr><th>Ação</th>{PERIODS.map((p) => <th key={p.key} className="num"><Link href={`/analise?ord=${key === p.key && !desc ? "-" : ""}${p.key}`} className="hover:text-ink">{p.key === "MAX" ? "Máx" : p.label}{key === p.key ? (desc ? " ↑" : " ↓") : ""}</Link></th>)}</tr></thead><tbody>
            {perfRows.map((r) => <tr key={r.w.ticker}><td><Link href={`/analise/${r.w.ticker}`} className="font-semibold">{r.w.ticker}</Link><div className="text-[11px] text-ink/45">desde {r.h[0]?.date.slice(0, 4)}</div></td>
              {PERIODS.map((p) => <td key={p.key} className="num !px-1.5"><span className="inline-block min-w-[74px] rounded-md px-1.5 py-1 text-xs font-semibold" style={perfStyle(r.perf![p.key])}>{pct(r.perf![p.key])}</span></td>)}</tr>)}
          </tbody></table>
        </section>)}
      <p className="mt-3 text-xs text-ink/45">A sugestão combina sinais técnicos, preço justo (Graham e Bazin, com os fundamentos que você informar), preço-alvo de analistas e os seus alvos, e mostra o porquê. É uma ferramenta de priorização, não recomendação de investimento. Cotações: Yahoo Finance, com atraso.</p>
    </div>
  );
}
