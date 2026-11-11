import Link from "next/link";
import { canEdit, requireArea } from "@/lib/context";
import { formatCompact, formatMoney } from "@/lib/format";
import { ensureUniverseFresh, indexMembers, INDICES, KIND_LABEL, type UniverseRow } from "@/lib/market/universe";
import { radar, type RadarItem } from "@/lib/market/radar";
import { Seal } from "@/components/brand";
import { Empty, PageHeader, Seg } from "@/components/ui";
import { RefreshButton } from "@/components/refresh-button";
import { AddToPortfolio } from "./add-to-portfolio";

export const maxDuration = 60;

type SP = { m?: string; q?: string; tipo?: string; setor?: string; ordem?: string; dir?: string; pag?: string; visao?: string; indice?: string; liq?: string };
const MARKETS: [string, string][] = [["BR", "Brasil"], ["US", "EUA"], ["FX", "Moedas e cripto"], ["CMD", "Commodities"], ["IDX", "Índices"]];
const SORTS: Record<string, string> = {
  cap: "market_cap", preco: "price", dia: "change_pct", sem: "perf_w", m1: "perf_1m", m3: "perf_3m", m6: "perf_6m", ytd: "perf_ytd", a12: "perf_1y", a3: "perf_3y", a5: "perf_5y",
  pl: "pe", pvp: "pb", dy: "dy", roe: "roe", vol: "volume", liq: "liquidity", nome: "symbol", sinal: "rating", mm: "rec_ma", osc: "rec_osc", ifr: "rsi", adx: "adx",
  volm: "volatility_m", beta: "beta", eve: "ev_ebitda", payout: "payout", margem: "net_margin", div: "debt_equity",
};
const VIEWS: [string, string][] = [["resumo", "Resumo"], ["desempenho", "Desempenho"], ["tecnica", "Técnica"], ["fundamentos", "Fundamentalista"]];
const LIQ: Record<string, [string, string][]> = {
  BR: [["0", "Qualquer"], ["100000", "R$ 100 mil/dia"], ["1000000", "R$ 1 mi/dia"], ["10000000", "R$ 10 mi/dia"], ["50000000", "R$ 50 mi/dia"]],
  US: [["0", "Qualquer"], ["1000000", "US$ 1 mi/dia"], ["10000000", "US$ 10 mi/dia"], ["100000000", "US$ 100 mi/dia"]],
};
/** Escala da cor de fundo por coluna de desempenho (variação que chega à cor mais forte). */
const HEAT: Record<string, number> = { change_pct: 5, perf_w: 10, perf_1m: 20, perf_3m: 35, perf_6m: 50, perf_ytd: 60, perf_1y: 80, perf_3y: 150, perf_5y: 250 };
const PAGE = 50;
const TIPOS: Record<string, [string, string][]> = {
  BR: [["acao", "Ações"], ["todos", "Todos"], ["fii", "FIIs"], ["etf", "ETFs"], ["bdr", "BDRs"], ["fundo", "Outros fundos"]],
  US: [["acao", "Ações"], ["todos", "Todos"], ["etf", "ETFs"], ["adr", "ADRs"], ["fundo", "Fundos"]],
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

  const qs = (p: Partial<SP>) => { const o = { m, q: sp.q, tipo: sp.tipo, setor: sp.setor, ordem: sp.ordem, dir: sp.dir, visao: sp.visao, indice: sp.indice, liq: sp.liq, ...p }; return `/mercado?${new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]).toString()}`; };
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

  // Ações, FIIs, ETFs e BDRs: tabela com visões, filtros, busca e ordenação
  const visao = VIEWS.some(([k]) => k === sp.visao) ? sp.visao! : "resumo";
  const indice = INDICES.find((i) => i.market === m && i.code === sp.indice);
  const tipo = sp.tipo ?? (indice ? "todos" : "acao");
  const liqMin = Number(sp.liq ?? (m === "BR" ? "100000" : "1000000")) || 0;
  const ordem = sp.ordem && SORTS[sp.ordem] ? sp.ordem : visao === "desempenho" ? "a12" : indice ? "peso" : "cap";
  const asc = sp.dir === "asc";
  const page = Math.max(1, Number(sp.pag) || 1);
  const term = (sp.q ?? "").replace(/[%,()*]/g, " ").trim();
  const members = indice ? await indexMembers(ctx.supabase, m, indice.code) : null;
  let query = ctx.supabase.from("market_universe").select("*", { count: "exact" }).eq("market", m);
  if (tipo !== "todos") query = query.eq("kind", tipo);
  if (sp.setor) query = query.eq("sector", sp.setor);
  if (members) query = query.in("symbol", Object.keys(members));
  if (liqMin > 0 && !members) query = query.gte("liquidity", liqMin);
  if (term) query = query.or(`symbol.ilike.%${term}%,name.ilike.%${term}%`);
  const sortCol = ordem === "peso" ? "market_cap" : SORTS[ordem];
  const [{ data, count }, { data: secs }, { data: radarRows }, { data: myItems }] = await Promise.all([
    ordem === "peso" && members
      ? query.limit(1000)
      : query.order(sortCol, { ascending: asc, nullsFirst: false }).order("symbol").range((page - 1) * PAGE, page * PAGE - 1),
    ctx.supabase.from("market_universe").select("sector").eq("market", m).not("sector", "is", null).limit(8000),
    ctx.supabase.from("market_universe").select("*").eq("market", m).eq("kind", "acao").gte("liquidity", m === "BR" ? 2_000_000 : 20_000_000).limit(1000),
    ctx.supabase.from("eval_items").select("symbol, yahoo, target_price, stop_price, added_price, portfolio_id").eq("household_id", ctx.household.id).eq("market", m),
  ]);
  let rows = (data ?? []) as UniverseRow[];
  if (ordem === "peso" && members) {
    rows = rows.sort((a, b) => ((members[b.symbol] ?? 0) - (members[a.symbol] ?? 0)) * (asc ? -1 : 1)).slice((page - 1) * PAGE, page * PAGE);
  }
  const sectors = [...new Set(((secs ?? []) as { sector: string | null }[]).map((x) => x.sector).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const rad = radar((radarRows ?? []) as UniverseRow[], m === "BR" ? 2_000_000 : 20_000_000);
  const uniBySym = new Map(((radarRows ?? []) as UniverseRow[]).map((r) => [r.symbol, r] as [string, UniverseRow]));

  const th = (key: string, label: string, cls = "num", title?: string) => (
    <th className={`${cls} !px-2 !py-2.5 !text-[10px]`} title={title}><Link href={qs({ ordem: key, dir: ordem === key && !asc ? "asc" : undefined, pag: undefined })} className={`inline-flex items-center gap-0.5 hover:text-ink ${ordem === key ? "text-ink" : ""}`}>{label}{ordem === key ? (asc ? "↑" : "↓") : ""}</Link></th>
  );
  const heat = (col: string, v: number | null | undefined, d = 1, extra = "") => {
    const x = v == null ? null : Number(v), sc = HEAT[col] ?? 50, a = x == null ? 0 : Math.min(0.3, (Math.abs(x) / sc) * 0.3);
    return <td className={`num !px-2 ${pctCls(x)} ${extra}`} style={x == null ? undefined : { background: x >= 0 ? `rgba(79,122,82,${a})` : `rgba(163,63,48,${a})` }}>{pctTxt(x, d)}</td>;
  };
  const cell = (v: React.ReactNode, cls = "") => <td className={`num !px-2 ${cls}`}>{v}</td>;
  const vsMa = (r: UniverseRow, ma: number | null | undefined) => (r.price && ma ? (Number(r.price) / Number(ma) - 1) * 100 : null);
  const td2 = (v: number | null | undefined, d = 1, suf = "") => (v == null ? "—" : `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}${suf}`);

  const head = visao === "desempenho" ? (<>{th("preco", "Preço")}{th("dia", "Dia")}{th("sem", "Semana")}{th("m1", "1 mês")}{th("m3", "3 meses")}{th("m6", "6 meses")}{th("ytd", "No ano")}{th("a12", "12 meses")}{th("a3", "3 anos")}{th("a5", "5 anos", "num hidden xl:table-cell")}</>)
    : visao === "tecnica" ? (<>{th("preco", "Preço")}{th("dia", "Dia")}{th("sinal", "Sinal geral", "")}{th("mm", "Médias", "", "Médias móveis")}{th("osc", "Osciladores", "")}{th("ifr", "IFR", "num", "Índice de força relativa (14)")}{th("adx", "ADX", "num hidden 2xl:table-cell", "Força da tendência")}<th className="num hidden !px-2 !py-2.5 !text-[10px] xl:table-cell" title="Distância da média de 50 dias">vs MM50</th><th className="num !px-2 !py-2.5 !text-[10px]" title="Distância da média de 200 dias">vs MM200</th>{th("volm", "Volat.", "num", "Volatilidade do mês")}{th("beta", "Beta", "num hidden 2xl:table-cell")}</>)
    : visao === "fundamentos" ? (<>{th("preco", "Preço")}{th("cap", "Valor merc.")}{th("pl", "P/L")}{th("pvp", "P/VP")}{th("eve", "EV/EBITDA", "num hidden xl:table-cell")}{th("dy", "DY")}{th("payout", "Payout", "num hidden xl:table-cell")}{th("roe", "ROE")}{th("margem", "Margem")}{th("div", "Dív/PL")}</>)
    : (<>{indice && th("peso", "Peso")}{th("preco", "Preço")}{th("dia", "Dia")}{th("m1", "1 mês")}{th("a12", "12 meses")}{th("cap", "Valor merc.")}{th("pl", "P/L")}{th("dy", "DY")}{th("liq", "Liquidez", "num hidden 2xl:table-cell", "Volume financeiro médio por dia")}{th("sinal", "Sinal", "")}</>);

  const body = (r: UniverseRow) => {
    const sg = signal(r.rating), sMa = signal(r.rec_ma ?? null), sOsc = signal(r.rec_osc ?? null);
    if (visao === "desempenho") return (<>{cell(formatMoney(r.price, r.currency), "font-medium")}{heat("change_pct", r.change_pct, 2)}{heat("perf_w", r.perf_w)}{heat("perf_1m", r.perf_1m)}{heat("perf_3m", r.perf_3m)}{heat("perf_6m", r.perf_6m)}{heat("perf_ytd", r.perf_ytd)}{heat("perf_1y", r.perf_1y)}{heat("perf_3y", r.perf_3y, 0)}{heat("perf_5y", r.perf_5y, 0, "hidden xl:table-cell")}</>);
    if (visao === "tecnica") { const v50 = vsMa(r, r.sma50), v200 = vsMa(r, r.sma200); return (<>{cell(formatMoney(r.price, r.currency), "font-medium")}{cell(pctTxt(r.change_pct), pctCls(r.change_pct))}<td className={`!px-2 text-[11.5px] font-medium ${sg?.[1] ?? ""}`}>{sg?.[0] ?? "—"}</td><td className={`!px-2 text-[11.5px] ${sMa?.[1] ?? ""}`}>{sMa?.[0] ?? "—"}</td><td className={`!px-2 text-[11.5px] ${sOsc?.[1] ?? ""}`}>{sOsc?.[0] ?? "—"}</td>{cell(td2(r.rsi, 0), r.rsi != null && r.rsi > 70 ? "text-loss" : r.rsi != null && r.rsi < 30 ? "text-gain" : "")}<td className="num hidden !px-2 2xl:table-cell">{td2(r.adx, 0)}</td><td className={`num hidden !px-2 xl:table-cell ${pctCls(v50)}`}>{pctTxt(v50, 1)}</td>{cell(pctTxt(v200, 1), pctCls(v200))}{cell(td2(r.volatility_m, 1, "%"))}<td className="num hidden !px-2 2xl:table-cell">{td2(r.beta, 2)}</td></>); }
    if (visao === "fundamentos") return (<>{cell(formatMoney(r.price, r.currency), "font-medium")}{cell(formatCompact(r.market_cap, r.currency), "text-ink/70")}{cell(r.pe != null && r.pe > 0 ? td2(r.pe) : "—")}{cell(td2(r.pb, 2))}<td className="num hidden !px-2 xl:table-cell">{r.ev_ebitda != null && r.ev_ebitda > 0 ? td2(r.ev_ebitda) : "—"}</td>{cell(r.dy ? td2(r.dy, 1, "%") : "—")}<td className="num hidden !px-2 xl:table-cell">{r.payout ? td2(r.payout, 0, "%") : "—"}</td>{cell(td2(r.roe, 1, "%"), pctCls(r.roe))}{cell(td2(r.net_margin, 1, "%"), pctCls(r.net_margin))}{cell(td2(r.debt_equity, 2), r.debt_equity != null && r.debt_equity > 2 ? "text-loss" : "")}</>);
    return (<>{indice && cell(members?.[r.symbol] ? `${td2(members[r.symbol], 2)}%` : "—", "text-ink/60")}{cell(formatMoney(r.price, r.currency), "font-medium")}{cell(pctTxt(r.change_pct), pctCls(r.change_pct))}{cell(pctTxt(r.perf_1m, 1), pctCls(r.perf_1m))}{cell(pctTxt(r.perf_1y, 1), pctCls(r.perf_1y))}{cell(formatCompact(r.market_cap, r.currency), "text-ink/70")}{cell(r.pe != null && r.pe > 0 ? td2(r.pe) : "—")}{cell(r.dy ? td2(r.dy, 1, "%") : "—")}<td className="num hidden !px-2 text-ink/60 2xl:table-cell">{formatCompact(r.liquidity ?? null, r.currency)}</td><td className={`!px-2 text-[11.5px] ${sg?.[1] ?? ""}`}>{sg?.[0] ?? "—"}</td></>);
  };

  const radarList = (title: string, hint: string, list: RadarItem[], extra: (x: RadarItem) => React.ReactNode) => list.length > 0 && (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between"><span className="text-[13px] font-semibold">{title}</span><span className="text-[10.5px] text-ink/40">{hint}</span></div>
      <div className="divide-y divide-ink/[0.05]">{list.map((x) => (
        <Link key={x.row.symbol} href={analiseHref(x.row)} className="flex items-center gap-2 py-1.5 text-[12.5px] hover:bg-ink/[0.025]">
          <span className="w-[54px] shrink-0 font-semibold">{x.row.symbol}</span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink/50">{x.reasons.slice(0, 2).join(" · ") || x.row.name}</span>
          {extra(x)}
        </Link>))}</div>
    </div>
  );
  const watch = ((myItems ?? []) as { symbol: string; target_price: number | null; stop_price: number | null; added_price: number | null }[])
    .map((i) => { const u = uniBySym.get(i.symbol); const p = u?.price ? Number(u.price) : null; return { i, p, up: i.target_price && p ? Number(i.target_price) / p - 1 : null, ret: i.added_price && p ? p / Number(i.added_price) - 1 : null }; })
    .filter((x) => x.p != null).sort((a, b) => (b.up ?? -9) - (a.up ?? -9)).slice(0, 5);

  return (
    <div>{header}{tapeEl}{tabs}
      <div className="grid gap-5 min-[1800px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <form className="mb-3 grid grid-cols-2 items-end gap-2 md:flex md:flex-wrap" action="/mercado">
            <input type="hidden" name="m" value={m} /><input type="hidden" name="visao" value={visao} />
            <div className="col-span-2 min-w-[200px] md:flex-1"><label className="label">Buscar</label><input className="input !py-1.5" name="q" defaultValue={sp.q ?? ""} placeholder={m === "BR" ? "Código ou empresa" : "Ticker ou empresa"} /></div>
            <div><label className="label">Índice</label><select className="input !py-1.5 md:max-w-[200px]" name="indice" defaultValue={indice?.code ?? ""}><option value="">{m === "BR" ? "Todas as ações da B3" : "Todas as ações dos EUA"}</option>{INDICES.filter((i) => i.market === m).map((i) => <option key={i.code} value={i.code}>{i.name}</option>)}</select></div>
            <div><label className="label">Tipo</label><select className="input !py-1.5" name="tipo" defaultValue={tipo}>{TIPOS[m].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><label className="label">Setor</label><select className="input !py-1.5 md:max-w-[190px]" name="setor" defaultValue={sp.setor ?? ""}><option value="">Todos</option>{sectors.map((x) => <option key={x}>{x}</option>)}</select></div>
            <div><label className="label">Liquidez mínima</label><select className="input !py-1.5" name="liq" defaultValue={String(liqMin)} disabled={!!indice}>{LIQ[m].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            {sp.ordem && <input type="hidden" name="ordem" value={sp.ordem} />}{sp.dir && <input type="hidden" name="dir" value={sp.dir} />}
            <button className="btn !py-1.5">Filtrar</button>
            {(sp.q || sp.tipo || sp.setor || sp.indice || sp.liq) && <Link href={`/mercado?m=${m}&visao=${visao}`} className="btn-ghost !py-1.5">Limpar</Link>}
          </form>

          <div className="card overflow-x-auto !p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/[0.06] px-4 py-2.5">
              <div className="flex gap-1 text-[12.5px]">{VIEWS.map(([k, l]) => <Link key={k} href={qs({ visao: k, ordem: undefined, dir: undefined, pag: undefined })} className={`rounded-full px-3 py-1 transition ${visao === k ? "bg-ink text-[#f6efe2]" : "text-ink/55 hover:bg-ink/[0.04] hover:text-ink"}`}>{l}</Link>)}</div>
              <span className="text-[11.5px] text-ink/50"><b className="text-ink">{(count ?? 0).toLocaleString("pt-BR")}</b> ativos{indice ? ` no ${indice.name}` : ""}{sp.setor ? ` · ${sp.setor}` : ""} · clique numa coluna para ordenar</span>
            </div>
            {rows.length ? (
              <table className="table w-full table-auto text-[12px] xl:text-[12.5px]">
                <thead className="bg-surface"><tr>{th("nome", "Ativo", "")}{head}<th className="!px-2"></th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.symbol} className="group">
                      <td className="!px-2 !py-1.5">
                        <Link href={analiseHref(r)} className="flex items-center gap-2" title={`${r.name ?? ""}${r.sector ? ` · ${r.sector}` : ""}`}>
                          <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full bg-ink/[0.05] text-[8px] font-semibold text-ink/50">
                            {r.logoid ? <img src={`https://s3-symbol-logo.tradingview.com/${r.logoid}--big.svg`} alt="" className="h-6 w-6" loading="lazy" /> : r.symbol.slice(0, 2)}
                          </span>
                          <span className="min-w-0"><span className="font-semibold group-hover:underline">{r.symbol}</span>{tipo === "todos" && <span className="ml-1 text-[9.5px] uppercase tracking-wide text-ink/40">{KIND_LABEL[r.kind ?? ""] ?? r.kind}</span>}
                            <span className="block max-w-[120px] truncate text-[10.5px] text-ink/45 xl:max-w-[150px] 2xl:max-w-[210px]">{r.name}</span></span>
                        </Link>
                      </td>
                      {body(r)}
                      <td className="!px-1.5 text-right">{edit && <AddToPortfolio compact yahoo={r.yahoo} portfolios={portfolios} inPortfolios={inPf.get(r.yahoo) ?? []} />}</td>
                    </tr>))}
                </tbody>
              </table>
            ) : <div className="p-6"><Empty icon="globe2">{count === 0 && !term && !sp.setor && !indice ? "Cotações ainda não carregadas. Clique em “Atualizar cotações”." : "Nenhum ativo encontrado com esses filtros."}</Empty></div>}
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-2.5 text-[12.5px]">
                <span className="text-ink/50">Página {page} de {pages}</span>
                <div className="flex gap-2">{page > 1 && <Link className="btn-ghost !py-1 text-xs" href={qs({ pag: String(page - 1) })}>← Anterior</Link>}{page < pages && <Link className="btn-ghost !py-1 text-xs" href={qs({ pag: String(page + 1) })}>Próxima →</Link>}</div>
              </div>)}
          </div>
          <p className="mt-3 text-[11px] text-ink/40">Dados: TradingView (cotações com atraso) e carteiras teóricas oficiais da B3. Desempenho em preço, sem proventos. “Sinal” resume médias móveis e osciladores — não é recomendação de investimento.</p>
        </div>

        <aside className="space-y-4 min-[1800px]:sticky min-[1800px]:top-16 min-[1800px]:self-start">
          <section className="card overflow-hidden !p-0">
            <div className="flex items-center gap-3 bg-gradient-to-br from-[#2a241e] to-[#191613] px-4 py-3.5 text-[#f3eadb]">
              <Seal size={38} id="seal-radar" />
              <div><div className="font-serif text-[19px] leading-tight">Radar ALVVO</div><div className="text-[11px] text-[#efe7da]/55">Ações para ficar de olho · {rad.pool} líquidas analisadas</div></div>
            </div>
            <div className="grid gap-x-6 gap-y-4 p-4 md:grid-cols-2 xl:grid-cols-4 min-[1800px]:grid-cols-1">
              {rad.pool === 0 ? <p className="text-sm text-ink/50">O radar aparece depois da primeira atualização das cotações.</p> : (<>
                {radarList("Destaques da Nota ALVVO", "nota 0–100", rad.top.slice(0, 6), (x) => <span className={`grid h-6 w-9 shrink-0 place-items-center rounded-md text-[11px] font-semibold ${x.score >= 70 ? "bg-emerald-50 text-emerald-700" : x.score >= 55 ? "bg-amber-50 text-amber-800" : "bg-ink/[0.05] text-ink/60"}`}>{x.score}</span>)}
                {radarList("Momento forte", "6 meses", rad.momentum, (x) => <span className="shrink-0 text-[11.5px] tabular-nums text-gain">+{Number(x.row.perf_6m).toFixed(0)}%</span>)}
                {radarList("Descontadas e rentáveis", "P/L vs setor", rad.value, (x) => <span className="shrink-0 text-[11.5px] tabular-nums text-ink/60">P/L {Number(x.row.pe).toFixed(1).replace(".", ",")}</span>)}
                {radarList("Dividendos", "DY 12 meses", rad.dividends, (x) => <span className="shrink-0 text-[11.5px] tabular-nums text-gain">{Number(x.row.dy).toFixed(1).replace(".", ",")}%</span>)}
              </>)}
              {watch.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-baseline justify-between"><span className="text-[13px] font-semibold">Das suas carteiras</span><Link href="/mercado/carteiras" className="text-[10.5px] text-brand">ver →</Link></div>
                  {watch.map((w) => (
                    <div key={w.i.symbol} className="flex items-center gap-2 py-1 text-[12.5px]"><span className="w-[54px] font-semibold">{w.i.symbol}</span>
                      <span className="flex-1 text-[11px] text-ink/50">{w.up != null ? `${w.up >= 0 ? "+" : ""}${(w.up * 100).toFixed(0)}% até o alvo` : "sem alvo"}</span>
                      <span className={`text-[11.5px] tabular-nums ${w.ret == null ? "" : w.ret >= 0 ? "text-gain" : "text-loss"}`}>{w.ret == null ? "" : `${w.ret >= 0 ? "+" : ""}${(w.ret * 100).toFixed(1).replace(".", ",")}%`}</span></div>))}
                </div>)}
              <details className="text-[11px] text-ink/55 md:col-span-2 xl:col-span-4 min-[1800px]:col-span-1"><summary className="cursor-pointer text-brand">Como a nota é calculada</summary>
                <p className="mt-1.5 leading-relaxed">Só ações com liquidez acima de {m === "BR" ? "R$ 2 mi" : "US$ 20 mi"} por dia. Qualidade (ROE, margem, dívida) vale 35%; preço contra a mediana do setor (P/L e P/VP) 30%; momento (desempenho em 6 e 12 meses e preço acima da média de 200 dias) 20%; dividendos 15%. É um filtro para estudo, não recomendação de compra.</p></details>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
