import Link from "next/link";
import { canEdit, requireArea } from "@/lib/context";
import { analyzeTicker, type Watch } from "@/lib/analise";
import { getQuotes } from "@/lib/market/read";
import { loadHistory } from "@/lib/market/history";
import { ensureNewsFresh } from "@/lib/market/refresh";
import { yahooSymbol } from "@/lib/market/sources";
import { formatCompact, formatMoney } from "@/lib/format";
import type { UniverseRow } from "@/lib/market/universe";
import { type EvalItem, RATING } from "@/lib/eval";
import { AddToPortfolio } from "../../mercado/add-to-portfolio";
import { Empty } from "@/components/ui";
import { AnalysisChart } from "@/components/analise/chart";
import { addWatch, saveFund, setTargets } from "../actions";

const VERD_C: Record<string, string> = { "Compra forte": "#4f7a52", Compra: "#7d9a72", Neutro: "#8c8579", Venda: "#c0784a", "Venda forte": "#a33f30" };
const ACT_C: Record<string, string> = { Compra: "bg-emerald-600 text-white", Neutro: "bg-ink/10 text-ink/70", Venda: "bg-rose-600 text-white" };
const STEPS = ["Venda forte", "Venda", "Neutro", "Compra", "Compra forte"];
const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2).replace(".", ",")}%`;
function Gauge({ verdict, label }: { verdict: string; label: string }) {
  const i = STEPS.indexOf(verdict);
  return <div><div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink/40">{label}</div><div className="flex gap-0.5">{STEPS.map((s, k) => <div key={s} className="h-2 flex-1 rounded-sm" style={{ background: k === i ? VERD_C[s] : "#1f1b1712" }} />)}</div><div className="mt-1 text-sm font-semibold" style={{ color: VERD_C[verdict] }}>{verdict}</div></div>;
}

export default async function TickerPage({ params }: { params: Promise<{ ticker: string }> }) {
  const ctx = await requireArea("analise");
  const ticker = decodeURIComponent((await params).ticker).toUpperCase(), sym = yahooSymbol(ticker), edit = canEdit(ctx, "analise");
  const [{ data: wl }, { data: dr }, quotes, candles, { data: uniRow }, { data: pfs }, { data: evalItems }] = await Promise.all([
    ctx.supabase.from("watchlist").select("ticker, buy, sell, note, fund").eq("household_id", ctx.household.id).eq("ticker", ticker).maybeSingle(),
    ctx.supabase.from("chart_drawings").select("drawings").eq("household_id", ctx.household.id).eq("ticker", ticker).maybeSingle(),
    getQuotes(ctx, [sym]), loadHistory(ctx, sym),
    ctx.supabase.from("market_universe").select("*").eq("yahoo", sym).limit(1).maybeSingle(),
    ctx.supabase.from("eval_portfolios").select("id, name").eq("household_id", ctx.household.id).order("created_at"),
    ctx.supabase.from("eval_items").select("*").eq("household_id", ctx.household.id).eq("yahoo", sym),
  ]);
  const u = uniRow as UniverseRow | null;
  const myItems = (evalItems ?? []) as EvalItem[];
  const portfolios = (pfs ?? []) as { id: string; name: string }[];
  try { await ensureNewsFresh([sym]); } catch { /* cache */ }
  const { data: news } = await ctx.supabase.from("market_news").select("*").eq("symbol", sym).order("published_at", { ascending: false }).limit(12);
  const w: Watch = wl ? { ...(wl as Watch), buy: wl.buy == null ? null : Number(wl.buy), sell: wl.sell == null ? null : Number(wl.sell), fund: (wl.fund ?? {}) as Watch["fund"] } : { ticker, buy: null, sell: null, note: null, fund: {} };
  // Fundamentos: os informados por você têm prioridade; o resto vem do scanner de mercado
  if (u) {
    const auto = { pl: u.pe != null && u.pe > 0 ? Number(u.pe) : null, pvp: u.pb != null ? Number(u.pb) : null, dy: u.dy ? Number(u.dy) : null, roe: u.roe != null ? Number(u.roe) : null,
      lpa: u.eps != null ? Number(u.eps) : null, vpa: u.pb && u.price ? Number(u.price) / Number(u.pb) : null };
    const merged = { ...w.fund };
    let used = false;
    for (const [k, v] of Object.entries(auto) as [keyof typeof auto, number | null][]) if (merged[k] == null && v != null) { merged[k] = Math.round(v * 100) / 100; used = true; }
    if (used) merged.source = w.fund.source ? `${w.fund.source} + TradingView (automático)` : "TradingView (automático)";
    w.fund = merged;
  }
  const q = quotes[sym], r = analyzeTicker(w, candles, q?.price ?? null), f = w.fund;
  const cur = u?.currency ?? (sym.endsWith(".SA") || sym.endsWith("-BRL") ? "BRL" : null);
  const formatBRL = (v: number | null | undefined) => formatMoney(v, cur);
  const back = <div className="mb-4 flex gap-4 text-sm text-ink/55"><Link className="hover:text-ink" href="/mercado">← Mercado</Link><Link className="hover:text-ink" href="/analise">Monitor</Link></div>;
  if (!candles.length) return <div>{back}<h1>{ticker}</h1><div className="card mt-4"><Empty icon="candle">Não encontramos histórico para {ticker}. Confira o código (ex.: PETR4, IVVB11, AAPL, BTC).</Empty></div></div>;
  const chg = q?.price && q.prev_close ? q.price / q.prev_close - 1 : candles.length > 1 ? candles[candles.length - 1].close / candles[candles.length - 2].close - 1 : 0;
  const fundRow = (l: string, v: React.ReactNode) => <div className="flex justify-between py-1.5 text-sm"><span className="text-ink/50">{l}</span><span className="font-medium tabular-nums">{v ?? "—"}</span></div>;
  const fin = (k: keyof Watch["fund"], l: string, ph = "") => <div><label className="label">{l}</label><input className="input py-1" name={k} defaultValue={f[k] != null ? String(f[k]).replace(".", ",") : ""} placeholder={ph} /></div>;

  return (
    <div>{back}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><div className="flex items-baseline gap-3"><h1>{u?.market === "FX" || u?.market === "CMD" || u?.market === "IDX" ? u.name : ticker}</h1><span className="text-ink/50">{u?.market === "FX" || u?.market === "CMD" || u?.market === "IDX" ? u.symbol : q?.name ?? u?.name ?? ""}</span></div>
          {u?.sector && <div className="eyebrow mt-1">{u.sector}{u.industry ? ` · ${u.industry}` : ""}</div>}
          <div className="mt-1 flex items-baseline gap-3"><span className="display text-[40px] leading-none">{formatBRL(r.price)}</span><span className={`font-medium ${chg >= 0 ? "text-gain" : "text-loss"}`}>{pct(chg)}</span>
            {q?.updated_at && <span className="text-xs text-ink/45">atualizado {new Date(q.updated_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}</div></div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-ghost" href={`https://br.investing.com/search/?q=${encodeURIComponent(ticker)}`} target="_blank" rel="noreferrer">Ver no Investing.com ↗</a>
          {edit && <AddToPortfolio yahoo={sym} portfolios={portfolios} inPortfolios={myItems.map((x) => x.portfolio_id)} />}
          {!wl && edit && <form action={addWatch}><input type="hidden" name="ticker" value={ticker} /><button className="btn-ghost">+ Adicionar ao monitor</button></form>}
          {r.sug && <span className={`rounded-xl px-4 py-2 text-sm font-semibold ${ACT_C[r.sug.action]}`}>Sugestão: {r.sug.action}</span>}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <AnalysisChart ticker={ticker} candles={candles} drawings={(dr?.drawings as unknown[]) ?? []} buy={w.buy} sell={w.sell} readOnly={!edit} />
          <section className="card"><div className="mb-3 flex items-center justify-between"><h2>Notícias</h2><span className="text-xs text-ink/45">Yahoo Finance</span></div>
            {(news ?? []).length ? <div className="divide-y divide-ink/5">{(news as { id: string; title: string; url: string; source: string | null; published_at: string | null }[]).map((n) => (
              <a key={n.id} href={n.url} target="_blank" rel="noreferrer" className="flex items-start gap-3 py-2.5 hover:bg-ink/[0.02]"><span className="flex-1 text-sm">{n.title}<span className="block text-xs text-ink/45">{n.source}{n.published_at ? ` · ${new Date(n.published_at).toLocaleDateString("pt-BR")}` : ""}</span></span><span className="text-ink/30">↗</span></a>))}</div>
              : <Empty>Sem notícias recentes para esta ação.</Empty>}
          </section>
        </div>
        <aside className="space-y-4">
          {myItems.length > 0 && (
            <section className="card"><h2 className="mb-3">Nas suas carteiras de avaliação</h2>
              <div className="space-y-3">{myItems.map((it) => { const pf = portfolios.find((x) => x.id === it.portfolio_id); const ret = it.added_price && r.price ? r.price / Number(it.added_price) - 1 : null; return (
                <Link key={it.id} href={`/mercado/carteiras/${it.portfolio_id}`} className="block rounded-xl border border-ink/[0.07] p-3 hover:border-gold/40">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{pf?.name}</span><span className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: RATING[it.rating]?.c }}>{RATING[it.rating]?.l}</span></div>
                  <div className="mt-1 flex justify-between text-xs text-ink/55"><span>Entrou a {formatBRL(it.added_price)}</span><span className={ret == null ? "" : ret >= 0 ? "text-gain" : "text-loss"}>{ret == null ? "" : `${ret >= 0 ? "+" : ""}${(ret * 100).toFixed(1).replace(".", ",")}%`}</span></div>
                  {it.target_price && <div className="text-xs text-ink/55">Alvo {formatBRL(Number(it.target_price))}</div>}
                  {it.thesis && <p className="mt-1 line-clamp-3 text-xs text-ink/65">{it.thesis}</p>}
                </Link>); })}</div>
              <p className="mt-2 text-[11px] text-ink/45">Registre análises e ajuste a tese na página da carteira.</p>
            </section>)}
          {r.tech && (
            <section className="card"><h2 className="mb-3">Resumo técnico</h2><div className="space-y-3"><Gauge verdict={r.tech.verdict} label="Geral" /><Gauge verdict={r.tech.maVerdict} label="Médias móveis" /><Gauge verdict={r.tech.indVerdict} label="Indicadores" /></div>
              <div className="mt-4 grid grid-cols-2 gap-x-4 text-xs">{[...r.tech.ma, ...r.tech.ind].map((i) => <div key={i.label} className="flex justify-between border-b border-ink/5 py-1"><span className="text-ink/55">{i.label}</span><span className={`font-medium ${i.signal === "compra" ? "text-gain" : i.signal === "venda" ? "text-loss" : "text-ink/50"}`}>{i.signal}</span></div>)}</div>
              <div className="mt-3 flex justify-between text-xs text-ink/55"><span>Suporte (60d): <b>{formatBRL(r.tech.support)}</b></span><span>Resistência: <b>{formatBRL(r.tech.resistance)}</b></span></div></section>)}
          {r.sug && (
            <section className="card"><h2 className="mb-2">Por que “{r.sug.action}”?</h2>
              <ul className="space-y-1.5 text-sm text-ink/70">{r.sug.reasons.map((x, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink/30" />{x}</li>)}</ul>
              <div className="mt-4 rounded-xl bg-ink/[0.03] p-3"><div className="label">Alvos sugeridos pela plataforma</div>
                <div className="mt-1 flex justify-between text-sm"><span>Compra</span><b className="tabular-nums text-gain">{r.sug.buyTarget ? formatBRL(r.sug.buyTarget) : "—"}</b></div>
                <div className="flex justify-between text-sm"><span>Venda</span><b className="tabular-nums text-loss">{r.sug.sellTarget ? formatBRL(r.sug.sellTarget) : "—"}</b></div>
                {edit && wl && <form action={setTargets} className="mt-2"><input type="hidden" name="ticker" value={ticker} /><input type="hidden" name="buy" value={r.sug.buyTarget ? r.sug.buyTarget.toFixed(2).replace(".", ",") : ""} /><input type="hidden" name="sell" value={r.sug.sellTarget ? r.sug.sellTarget.toFixed(2).replace(".", ",") : ""} /><button className="btn-ghost w-full !py-1.5 text-xs">Usar como meus alvos</button></form>}
                <p className="mt-2 text-[11px] text-ink/45">Compra: suporte técnico ou preço justo com margem de 15%. Venda: o alvo mais próximo entre resistência, preço justo e analistas que dê ao menos 8% de alta.</p></div>
            </section>)}
          {u && (u.market === "BR" || u.market === "US") && (
            <section className="card"><h2 className="mb-2">Mercado</h2>
              {fundRow("Valor de mercado", u.market_cap ? formatCompact(Number(u.market_cap), u.currency) : null)}
              {fundRow("12 meses", u.perf_1y != null ? `${u.perf_1y >= 0 ? "+" : ""}${Number(u.perf_1y).toFixed(1).replace(".", ",")}%` : null)}
              {fundRow("No ano", u.perf_ytd != null ? `${u.perf_ytd >= 0 ? "+" : ""}${Number(u.perf_ytd).toFixed(1).replace(".", ",")}%` : null)}
              {fundRow("Margem líquida", u.net_margin != null ? `${Number(u.net_margin).toFixed(1).replace(".", ",")}%` : null)}
              {fundRow("Dívida / patrimônio", u.debt_equity != null ? Number(u.debt_equity).toFixed(2).replace(".", ",") : null)}
              {fundRow("EV/EBITDA", u.ev_ebitda != null ? Number(u.ev_ebitda).toFixed(1).replace(".", ",") : null)}
            </section>)}
          <section className="card"><h2 className="mb-2">Fundamentos</h2>
            {fundRow("P/L", f.pl?.toLocaleString("pt-BR"))}{fundRow("P/VP", f.pvp?.toLocaleString("pt-BR"))}{fundRow("Dividend yield", f.dy ? `${f.dy.toLocaleString("pt-BR")}%` : null)}{fundRow("ROE", f.roe ? `${f.roe.toLocaleString("pt-BR")}%` : null)}{fundRow("Dív. líq./EBITDA", f.divEbitda?.toLocaleString("pt-BR"))}
            <div className="mt-2 border-t border-ink/5 pt-2">
              {fundRow("Preço justo — Graham", r.fair.graham && r.price ? <>{formatBRL(r.fair.graham)} <span className={`text-xs ${r.fair.graham > r.price ? "text-gain" : "text-loss"}`}>{pct(r.fair.graham / r.price - 1)}</span></> : null)}
              {fundRow("Preço teto — Bazin (6%)", r.fair.bazin && r.price ? <>{formatBRL(r.fair.bazin)} <span className={`text-xs ${r.fair.bazin > r.price ? "text-gain" : "text-loss"}`}>{pct(r.fair.bazin / r.price - 1)}</span></> : null)}
              {fundRow("Preço-alvo de analistas", f.analystTarget ? formatBRL(f.analystTarget) : null)}
            </div>
            {edit && wl && (
              <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-brand">Informar fundamentos</summary>
                <form action={saveFund} className="mt-3 grid grid-cols-2 gap-2"><input type="hidden" name="ticker" value={ticker} />
                  {fin("pl", "P/L")}{fin("pvp", "P/VP")}{fin("dy", "DY (%)")}{fin("roe", "ROE (%)")}{fin("divEbitda", "Dív./EBITDA")}{fin("analystTarget", "Alvo analistas (R$)")}
                  <div className="col-span-2"><label className="label">Fonte</label><input className="input py-1" name="source" defaultValue={f.source ?? ""} placeholder="Ex.: Investing, Status Invest, relatório XP" /></div>
                  <button className="btn col-span-2 !py-1.5 text-xs">Salvar</button></form>
                <p className="mt-2 text-[11px] text-ink/45">Copie do Investing.com ou de outra fonte de sua confiança. Com P/L, P/VP e DY a plataforma calcula Graham e Bazin.</p></details>)}
            {f.source && <p className="mt-2 text-[11px] text-ink/45">Fonte: {f.source}</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
