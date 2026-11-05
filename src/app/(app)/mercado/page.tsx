import Link from "next/link";
import { canEdit, requireArea } from "@/lib/context";
import { formatCompact, formatMoney } from "@/lib/format";
import { ensureUniverseFresh, KIND_LABEL, type UniverseRow } from "@/lib/market/universe";
import { Empty, PageHeader, Seg } from "@/components/ui";
import { RefreshButton } from "@/components/refresh-button";
import { AddToPortfolio } from "./add-to-portfolio";

export const maxDuration = 60;

type SP = { m?: string; q?: string; tipo?: string; setor?: string; ordem?: string; dir?: string; pag?: string };
const MARKETS: [string, string][] = [["BR", "Brasil"], ["US", "EUA"], ["FX", "Moedas e cripto"], ["CMD", "Commodities"], ["IDX", "Índices"]];
const SORTS: Record<string, string> = { cap: "market_cap", preco: "price", dia: "change_pct", m1: "perf_1m", ytd: "perf_ytd", a12: "perf_1y", pl: "pe", pvp: "pb", dy: "dy", roe: "roe", vol: "volume", nome: "symbol", sinal: "rating" };
const PAGE = 50;
const TIPOS: Record<string, [string, string][]> = {
  BR: [["", "Todos"], ["acao", "Ações"], ["fii", "FIIs"], ["etf", "ETFs"], ["bdr", "BDRs"], ["fundo", "Outros fundos"]],
  US: [["", "Todos"], ["acao", "Ações"], ["etf", "ETFs"], ["adr", "ADRs"], ["fundo", "Fundos"]],
};

const pctCls = (v: number | null) => (v == null ? "text-ink/30" : v > 0 ? "text-gain" : v < 0 ? "text-loss" : "text-ink/50");
const pctTxt = (v: number | null, d = 2) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(d).replace(".", ",")}%`);
const n2 = (v: number | null, suf = "") => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: v < 100 ? 2 : 0 })}${suf}`);
const signal = (r: number | null) => r == null ? null : r > 0.5 ? ["Compra forte", "text-gain"] : r > 0.1 ? ["Compra", "text-gain"] : r < -0.5 ? ["Venda forte", "text-loss"] : r < -0.1 ? ["Venda", "text-loss"] : ["Neutro", "text-ink/45"];
const analiseHref = (r: Pick<UniverseRow, "market" | "symbol" | "yahoo">) => `/analise/${encodeURIComponent(r.market === "BR" ? r.symbol : r.yahoo)}`;

export default async function MercadoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireArea("analise");
  const sp = await searchParams;
  const m = MARKETS.some(([k]) => k === sp.m) ? sp.m! : "BR";
  const edit = canEdit(ctx, "analise");
  const age = await ensureUniverseFresh(20);

  const qs = (p: Partial<SP>) => { const o = { m, q: sp.q, tipo: sp.tipo, setor: sp.setor, ordem: sp.ordem, dir: sp.dir, ...p }; return `/mercado?${new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]).toString()}`; };
  const [{ data: strip }, { data: pf }, { data: mine }] = await Promise.all([
    ctx.supabase.from("market_universe").select("symbol, yahoo, name, price, change_pct, currency, market").in("yahoo", ["^BVSP", "^GSPC", "USDBRL=X", "EURBRL=X", "GC=F", "BZ=F", "BTC-BRL"]),
    ctx.supabase.from("eval_portfolios").select("id, name").eq("household_id", ctx.household.id).order("created_at"),
    ctx.supabase.from("eval_items").select("yahoo, portfolio_id").eq("household_id", ctx.household.id),
  ]);
  const portfolios = (pf ?? []) as { id: string; name: string }[];
  const inPf = new Map<string, string[]>();
  for (const x of (mine ?? []) as { yahoo: string; portfolio_id: string }[]) inPf.set(x.yahoo, [...(inPf.get(x.yahoo) ?? []), x.portfolio_id]);
  const order = ["^BVSP", "^GSPC", "USDBRL=X", "EURBRL=X", "GC=F", "BZ=F", "BTC-BRL"];
  const tape = ((strip ?? []) as UniverseRow[]).sort((a, b) => order.indexOf(a.yahoo) - order.indexOf(b.yahoo));

  const header = (
    <PageHeader title="Mercado" subtitle="Todos os ativos da B3 e dos EUA, moedas, commodities e índices — filtre, compare e leve para as suas carteiras de avaliação.">
      <span className="text-xs text-ink/45">{isFinite(age) ? `cotações com até ~15 min de atraso` : ""}</span>
      <RefreshButton universe label="Atualizar cotações" />
      <Link href="/mercado/carteiras" className="btn">Carteiras de avaliação</Link>
    </PageHeader>
  );
  const tapeEl = tape.length > 0 && (
    <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-ink/[0.07] bg-ink/[0.07] sm:grid-cols-4 xl:grid-cols-7">
      {tape.map((t) => (
        <Link key={t.yahoo} href={`/analise/${encodeURIComponent(t.yahoo)}`} className="bg-surface px-4 py-3 transition hover:bg-white">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-ink/45">{t.name}</div>
          <div className="display mt-0.5 text-[20px] leading-tight">{t.market === "IDX" ? n2(t.price).replace(/,\d+$/, "") : formatMoney(t.price, t.currency, t.price && t.price > 1000 ? 0 : 2)}</div>
          <div className={`text-xs tabular-nums ${pctCls(t.change_pct)}`}>{pctTxt(t.change_pct)}</div>
        </Link>))}
    </div>
  );
  const tabs = <div className="mb-4"><Seg options={MARKETS} current={m} hrefFor={(v) => `/mercado?m=${v}`} /></div>;

  // Moedas, commodities e índices: cartões por grupo
  if (m === "FX" || m === "CMD" || m === "IDX") {
    const { data } = await ctx.supabase.from("market_universe").select("*").eq("market", m).order("sort");
    const rows = (data ?? []) as UniverseRow[];
    const groups = [...new Set(rows.map((r) => (m === "FX" ? (r.kind === "cripto" ? "Cripto" : r.currency === "BRL" ? "Contra o real" : "Pares internacionais") : m === "CMD" ? r.kind ?? "" : "Bolsas")))];
    return (
      <div>{header}{tapeEl}{tabs}
        {!rows.length ? <div className="card"><Empty icon="globe2">Cotações ainda não carregadas. Clique em “Atualizar cotações”.</Empty></div> : groups.map((g) => (
          <section key={g} className="mb-6">
            <div className="eyebrow mb-2">{g}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rows.filter((r) => (m === "FX" ? (r.kind === "cripto" ? "Cripto" : r.currency === "BRL" ? "Contra o real" : "Pares internacionais") : m === "CMD" ? r.kind : "Bolsas") === g).map((r) => (
                <div key={r.yahoo} className="card flex flex-col gap-2 !p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/analise/${encodeURIComponent(r.yahoo)}`} className="min-w-0"><div className="truncate font-medium hover:underline">{r.name}</div><div className="text-xs text-ink/45">{r.symbol}{m === "CMD" ? " · contrato futuro" : ""}</div></Link>
                    {edit && <AddToPortfolio compact yahoo={r.yahoo} portfolios={portfolios} inPortfolios={inPf.get(r.yahoo) ?? []} />}
                  </div>
                  <div className="flex items-baseline justify-between"><span className="display text-[24px]">{m === "IDX" ? n2(r.price) : formatMoney(r.price, r.currency, r.price && r.price > 1000 ? 0 : r.price && r.price < 1 ? 4 : 2)}</span><span className={`text-sm tabular-nums ${pctCls(r.change_pct)}`}>{pctTxt(r.change_pct)}</span></div>
                  <Link href={`/analise/${encodeURIComponent(r.yahoo)}`} className="text-xs text-brand hover:underline">Gráfico e análise técnica →</Link>
                </div>))}
            </div>
          </section>))}
        <p className="text-[11px] text-ink/40">Fonte: Yahoo Finance. Commodities são cotadas pelos contratos futuros de referência (CME/ICE), em dólar.</p>
      </div>
    );
  }

  // Ações, FIIs, ETFs e BDRs: tabela com filtros, busca e ordenação
  const ordem = sp.ordem && SORTS[sp.ordem] ? sp.ordem : "cap";
  const asc = sp.dir === "asc";
  const page = Math.max(1, Number(sp.pag) || 1);
  const term = (sp.q ?? "").replace(/[%,()*]/g, " ").trim();
  let query = ctx.supabase.from("market_universe").select("*", { count: "exact" }).eq("market", m);
  if (sp.tipo) query = query.eq("kind", sp.tipo);
  if (sp.setor) query = query.eq("sector", sp.setor);
  if (term) query = query.or(`symbol.ilike.%${term}%,name.ilike.%${term}%`);
  const [{ data, count }, { data: secs }] = await Promise.all([
    query.order(SORTS[ordem], { ascending: asc, nullsFirst: false }).order("symbol").range((page - 1) * PAGE, page * PAGE - 1),
    ctx.supabase.from("market_universe").select("sector").eq("market", m).not("sector", "is", null).limit(8000),
  ]);
  const rows = (data ?? []) as UniverseRow[];
  const sectors = [...new Set(((secs ?? []) as { sector: string }[]).map((s) => s.sector))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const th = (key: string, label: string, cls = "num") => (
    <th className={cls}><Link href={qs({ ordem: key, dir: ordem === key && !asc ? "asc" : undefined, pag: undefined })} className={`inline-flex items-center gap-1 hover:text-ink ${ordem === key ? "text-ink" : ""}`}>{label}{ordem === key ? (asc ? "↑" : "↓") : ""}</Link></th>
  );

  return (
    <div>{header}{tapeEl}{tabs}
      <form className="mb-4 flex flex-wrap items-end gap-2" action="/mercado">
        <input type="hidden" name="m" value={m} />
        <div className="min-w-[220px] flex-1"><label className="label">Buscar</label><input className="input" name="q" defaultValue={sp.q ?? ""} placeholder={m === "BR" ? "Código ou empresa (PETR4, Itaú, HGLG11…)" : "Ticker ou empresa (AAPL, Microsoft…)"} /></div>
        <div><label className="label">Tipo</label><select className="input" name="tipo" defaultValue={sp.tipo ?? ""}>{TIPOS[m].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label className="label">Setor</label><select className="input max-w-[240px]" name="setor" defaultValue={sp.setor ?? ""}><option value="">Todos</option>{sectors.map((s) => <option key={s}>{s}</option>)}</select></div>
        {sp.ordem && <input type="hidden" name="ordem" value={sp.ordem} />}{sp.dir && <input type="hidden" name="dir" value={sp.dir} />}
        <button className="btn">Filtrar</button>
        {(sp.q || sp.tipo || sp.setor) && <Link href={`/mercado?m=${m}`} className="btn-ghost">Limpar</Link>}
      </form>

      <div className="card overflow-x-auto p-0">
        <div className="flex items-center justify-between px-5 py-3 text-sm text-ink/55"><span><b className="text-ink">{(count ?? 0).toLocaleString("pt-BR")}</b> ativos{sp.tipo ? ` · ${TIPOS[m].find(([v]) => v === sp.tipo)?.[1]}` : ""}{sp.setor ? ` · ${sp.setor}` : ""}</span><span className="text-xs">Clique no título de uma coluna para ordenar</span></div>
        {rows.length ? (
          <table className="table min-w-[1180px]">
            <thead className="sticky top-0 bg-surface"><tr>
              {th("nome", "Ativo", "")}{th("preco", "Preço")}{th("dia", "Dia")}{th("m1", "1 mês")}{th("a12", "12 meses")}{th("cap", "Valor de mercado")}{th("pl", "P/L")}{th("pvp", "P/VP")}{th("dy", "DY")}{th("roe", "ROE")}{th("sinal", "Sinal técnico", "")}<th></th>
            </tr></thead>
            <tbody>
              {rows.map((r) => { const sg = signal(r.rating); return (
                <tr key={r.symbol} className="group">
                  <td className="max-w-[300px]">
                    <Link href={analiseHref(r)} className="flex items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-ink/[0.05] text-[10px] font-semibold text-ink/50">
                        {r.logoid ? <img src={`https://s3-symbol-logo.tradingview.com/${r.logoid}--big.svg`} alt="" className="h-8 w-8" loading="lazy" /> : r.symbol.slice(0, 2)}
                      </span>
                      <span className="min-w-0"><span className="font-semibold group-hover:underline">{r.symbol}</span> <span className="chip ml-1">{KIND_LABEL[r.kind ?? ""] ?? r.kind}</span>
                        <span className="block truncate text-xs text-ink/50">{r.name}{r.sector ? ` · ${r.sector}` : ""}</span></span>
                    </Link>
                  </td>
                  <td className="num font-medium">{formatMoney(r.price, r.currency)}</td>
                  <td className={`num ${pctCls(r.change_pct)}`}>{pctTxt(r.change_pct)}</td>
                  <td className={`num ${pctCls(r.perf_1m)}`}>{pctTxt(r.perf_1m, 1)}</td>
                  <td className={`num ${pctCls(r.perf_1y)}`}>{pctTxt(r.perf_1y, 1)}</td>
                  <td className="num text-ink/70">{formatCompact(r.market_cap, r.currency)}</td>
                  <td className="num">{r.pe != null && r.pe > 0 ? n2(r.pe) : "—"}</td>
                  <td className="num">{n2(r.pb)}</td>
                  <td className="num">{r.dy ? n2(r.dy, "%") : "—"}</td>
                  <td className={`num ${pctCls(r.roe)}`}>{r.roe != null ? n2(r.roe, "%") : "—"}</td>
                  <td className={`text-xs ${sg?.[1] ?? ""}`}>{sg?.[0] ?? "—"}</td>
                  <td className="text-right">{edit && <AddToPortfolio compact yahoo={r.yahoo} portfolios={portfolios} inPortfolios={inPf.get(r.yahoo) ?? []} />}</td>
                </tr>); })}
            </tbody>
          </table>
        ) : <div className="p-6"><Empty icon="globe2">{count === 0 && !term && !sp.tipo && !sp.setor ? "Cotações ainda não carregadas. Clique em “Atualizar cotações”." : "Nenhum ativo encontrado com esses filtros."}</Empty></div>}
        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 text-sm">
            <span className="text-ink/50">Página {page} de {pages}</span>
            <div className="flex gap-2">{page > 1 && <Link className="btn-ghost !py-1" href={qs({ pag: String(page - 1) })}>← Anterior</Link>}{page < pages && <Link className="btn-ghost !py-1" href={qs({ pag: String(page + 1) })}>Próxima →</Link>}</div>
          </div>)}
      </div>
      <p className="mt-3 text-[11px] text-ink/40">Dados de mercado e indicadores: TradingView (cotações com atraso). P/L e ROE dos últimos 12 meses; DY atual. “Sinal técnico” resume médias móveis e osciladores — não é recomendação de investimento.</p>
    </div>
  );
}
