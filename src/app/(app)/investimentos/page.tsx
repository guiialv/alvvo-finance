import Link from "next/link";
import { canEdit, requireArea } from "@/lib/context";
import { CLS, RF_TYPES, closedTrades, splitContribution, summary, type Cls, type Dividend, type Fixed, type Op } from "@/lib/invest";
import { getMacro, getQuotes, ipcaRef } from "@/lib/market/read";
import { ensureNewsFresh } from "@/lib/market/refresh";
import { yahooSymbol } from "@/lib/market/sources";
import { formatBRL, formatDateBR, formatPct } from "@/lib/format";
import { todayIso } from "@/lib/cycle";
import { Bar, Donut, Empty, Kpi, PageHeader, Seg } from "@/components/ui";
import { RefreshButton } from "@/components/refresh-button";
import { addDividend, addFixed, addOp, delDividend, delFixed, delOp, saveManualQuote, saveTargets } from "./actions";
import { BrokerNote } from "./broker-note";

const TABS: [string, string][] = [["carteira", "Carteira"], ["operacoes", "Operações"], ["renda-fixa", "Renda fixa"], ["proventos", "Proventos"], ["noticias", "Notícias"], ["historico", "Histórico"]];
const pctS = (v: number) => `${v >= 0 ? "+" : ""}${formatPct(v)}`;
const rateLbl = (f: { index: string; rate: number }) => (f.index === "cdi" ? `${f.rate}% do CDI` : f.index === "ipca" ? `IPCA + ${f.rate}%` : f.index === "selic" ? `Selic + ${f.rate}%` : `${f.rate}% a.a.`);

export default async function InvestPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireArea("investimentos");
  const sp = await searchParams, tab = TABS.some(([k]) => k === sp.aba) ? sp.aba! : "carteira", edit = canEdit(ctx, "investimentos");
  const hh = ctx.household.id;
  const [{ data: opsD }, { data: fixedD }, { data: divsD }, { data: setD }] = await Promise.all([
    ctx.supabase.from("inv_ops").select("*").eq("household_id", hh).order("date", { ascending: false }),
    ctx.supabase.from("inv_fixed").select("*").eq("household_id", hh).order("date"),
    ctx.supabase.from("inv_dividends").select("*").eq("household_id", hh).order("date", { ascending: false }),
    ctx.supabase.from("inv_settings").select("*").eq("household_id", hh).maybeSingle(),
  ]);
  const ops = (opsD ?? []) as Op[], fixed = (fixedD ?? []) as Fixed[], divs = (divsD ?? []) as Dividend[];
  const targets = (setD?.targets ?? { acao: 25, fii: 15, etf: 10, exterior: 15, cripto: 5, rf: 30 }) as Record<string, number>;
  const manual = (setD?.manual_quotes ?? {}) as Record<string, number>;
  const tickers = [...new Set(ops.map((o) => o.ticker))], symOf = (t: string) => yahooSymbol(t, ops.find((o) => o.ticker === t)?.cls);
  const [macro, q] = await Promise.all([getMacro(ctx), getQuotes(ctx, tickers.map(symOf))]);
  const quotes = Object.fromEntries(tickers.map((t) => [t, manual[t] ?? q[symOf(t)]?.price ?? null]));
  const today = todayIso(), ipca = ipcaRef(macro);
  const sm = summary(ops, fixed, divs, quotes, macro.cdi, ipca, today);
  const href = (v: string) => `/investimentos?aba=${v}`;

  const head = (
    <>
      <PageHeader title="Investimentos" subtitle="Carteira consolidada com preço médio, resultado e alocação. Cotações atualizadas automaticamente; renda fixa com CDI e IPCA do Banco Central.">
        <Seg options={TABS} current={tab} hrefFor={href} />
      </PageHeader>
      {tab !== "noticias" && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Kpi label="Patrimônio investido" value={sm.total} sub={`${sm.rows.length} ativos · ${sm.rf.length} títulos de renda fixa`} />
          <Kpi label="Custo de aquisição" value={sm.invested} accent="#475569" />
          <Kpi label="Resultado em aberto" value={sm.total - sm.invested} tone="auto" accent={sm.total - sm.invested >= 0 ? "#15803d" : "#e11d48"} sub={sm.invested ? pctS((sm.total - sm.invested) / sm.invested) : undefined} />
          <Kpi label="Resultado realizado" value={sm.realized} accent="#0369a1" sub="todas as vendas, já descontados custos" />
          <Kpi label="Proventos 12 meses" value={sm.divs12} accent="#d97706" />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink/50">
        <span>CDI {macro.cdi.toFixed(2).replace(".", ",")}% · IPCA esperado {ipca.toFixed(2).replace(".", ",")}% (Focus){macro.updatedAt ? ` · atualizado ${new Date(macro.updatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</span>
        <RefreshButton />
      </div>
    </>
  );

  if (tab === "operacoes") return (
    <div>{head}
      {edit && <BrokerNote />}
      {edit && (
        <section className="card mt-5"><h2 className="mb-3">Registrar operação</h2>
          <form action={addOp} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-8">
            <div><label className="label">Data</label><input className="input" type="date" name="date" defaultValue={today} required /></div>
            <div><label className="label">Tipo</label><select className="input" name="type"><option value="compra">Compra</option><option value="venda">Venda</option></select></div>
            <div><label className="label">Ativo</label><input className="input uppercase" name="ticker" required placeholder="PETR4, IVVB11, BTC" /></div>
            <div><label className="label">Classe</label><select className="input" name="cls">{(Object.keys(CLS) as Cls[]).filter((k) => k !== "rf").map((k) => <option key={k} value={k}>{CLS[k].l}</option>)}</select></div>
            <div><label className="label">Quantidade</label><input className="input" name="qty" inputMode="decimal" required /></div>
            <div><label className="label">Preço (R$)</label><input className="input" name="price" inputMode="decimal" required /></div>
            <div><label className="label">Custos (R$)</label><input className="input" name="costs" inputMode="decimal" placeholder="0,00" /></div>
            <div className="flex items-end"><button className="btn w-full">Adicionar</button></div>
          </form></section>)}
      <section className="card mt-5 overflow-x-auto p-0"><h2 className="px-5 pt-4">{ops.length} operações</h2>
        {ops.length ? <table className="table mt-2 min-w-[760px]"><thead><tr><th>Data</th><th>Tipo</th><th>Ativo</th><th>Classe</th><th className="num">Qtd</th><th className="num">Preço</th><th className="num">Total</th><th className="num">Custos</th><th /></tr></thead><tbody>
          {ops.map((o) => <tr key={o.id}><td className="text-ink/60">{formatDateBR(o.date)}</td><td><span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${o.type === "compra" ? "bg-sky-50 text-sky-700" : "bg-emerald-50 text-emerald-700"}`}>{o.type}</span></td><td className="font-semibold">{o.ticker}</td><td className="text-xs" style={{ color: CLS[o.cls]?.c }}>{CLS[o.cls]?.l}</td><td className="num">{Number(o.qty).toLocaleString("pt-BR")}</td><td className="num">{formatBRL(o.price)}</td><td className="num">{formatBRL(o.qty * o.price)}</td><td className="num text-ink/50">{Number(o.costs) ? formatBRL(o.costs) : ""}</td>
            <td>{edit && <form action={delOp}><input type="hidden" name="id" value={o.id} /><button className="text-xs text-ink/30 hover:text-loss">Excluir</button></form>}</td></tr>)}
        </tbody></table> : <div className="p-5"><Empty icon="trend">Nenhuma operação registrada.</Empty></div>}
      </section>
    </div>
  );

  if (tab === "renda-fixa") return (
    <div>{head}
      {edit && (
        <section className="card mt-5"><h2 className="mb-3">Novo título</h2>
          <form action={addFixed} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-8">
            <div className="lg:col-span-2"><label className="label">Nome</label><input className="input" name="name" required placeholder="CDB Banco X 2028" /></div>
            <div><label className="label">Tipo</label><select className="input" name="kind">{RF_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div><label className="label">Aplicado (R$)</label><input className="input" name="amount" inputMode="decimal" required /></div>
            <div><label className="label">Data</label><input className="input" type="date" name="date" defaultValue={today} required /></div>
            <div><label className="label">Indexador</label><select className="input" name="index"><option value="cdi">% do CDI</option><option value="selic">Selic +</option><option value="ipca">IPCA +</option><option value="pre">Prefixado</option></select></div>
            <div><label className="label">Taxa (%)</label><input className="input" name="rate" inputMode="decimal" required placeholder="110" /></div>
            <div><label className="label">Vencimento</label><input className="input" type="date" name="maturity" /></div>
            <div className="flex items-end lg:col-start-8"><button className="btn w-full">Adicionar</button></div>
          </form></section>)}
      <section className="card mt-5 overflow-x-auto p-0"><h2 className="px-5 pt-4">Títulos</h2>
        {sm.rf.length ? <table className="table mt-2 min-w-[820px]"><thead><tr><th>Título</th><th>Rentabilidade</th><th className="num">Aplicado</th><th className="num">Valor estimado</th><th className="num">Rendimento</th><th>Vencimento</th><th /></tr></thead><tbody>
          {sm.rf.map((f) => <tr key={f.id}><td><div className="font-medium">{f.name}</div><div className="text-xs text-ink/45">{f.kind} · desde {formatDateBR(f.date)}</div></td><td>{rateLbl(f)}</td><td className="num">{formatBRL(f.amount)}</td><td className="num font-semibold">{formatBRL(f.value)}</td><td className="num text-gain">{formatBRL(f.pnl)}<div className="text-[11px]">{pctS(f.pnl / f.amount)}</div></td><td>{f.maturity ? formatDateBR(f.maturity) : "—"}</td>
            <td>{edit && <form action={delFixed}><input type="hidden" name="id" value={f.id} /><button className="text-xs text-ink/30 hover:text-loss">Excluir</button></form>}</td></tr>)}
        </tbody></table> : <div className="p-5"><Empty>Nenhum título cadastrado.</Empty></div>}
        <p className="px-5 pb-4 text-xs text-ink/45">Valores brutos estimados (sem IR e sem marcação a mercado), com o CDI do Banco Central e o IPCA esperado do Focus. Para comparar onde aplicar, veja Análise → Renda fixa.</p>
      </section>
    </div>
  );

  if (tab === "proventos") return (
    <div>{head}
      {edit && (
        <section className="card mt-5"><h2 className="mb-3">Registrar provento</h2>
          <form action={addDividend} className="grid gap-3 sm:grid-cols-5">
            <div><label className="label">Data</label><input className="input" type="date" name="date" defaultValue={today} required /></div>
            <div><label className="label">Ativo</label><input className="input uppercase" name="ticker" required /></div>
            <div><label className="label">Tipo</label><select className="input" name="kind"><option>Dividendo</option><option>JCP</option><option>Rendimento FII</option><option>Juros RF</option></select></div>
            <div><label className="label">Valor (R$)</label><input className="input" name="amount" inputMode="decimal" required /></div>
            <div className="flex items-end"><button className="btn w-full">Adicionar</button></div>
          </form></section>)}
      <section className="card mt-5 overflow-x-auto p-0"><h2 className="px-5 pt-4">Proventos recebidos</h2>
        {divs.length ? <table className="table mt-2"><thead><tr><th>Data</th><th>Ativo</th><th>Tipo</th><th className="num">Valor</th><th /></tr></thead><tbody>
          {divs.map((d) => <tr key={d.id}><td>{formatDateBR(d.date)}</td><td className="font-semibold">{d.ticker}</td><td>{d.kind}</td><td className="num text-gain">{formatBRL(d.amount)}</td><td>{edit && <form action={delDividend}><input type="hidden" name="id" value={d.id} /><button className="text-xs text-ink/30 hover:text-loss">Excluir</button></form>}</td></tr>)}
        </tbody></table> : <div className="p-5"><Empty>Nenhum provento registrado.</Empty></div>}
      </section>
    </div>
  );

  if (tab === "historico") {
    const rows = closedTrades(ops);
    if (!rows.length) return <div>{head}<div className="card mt-5"><Empty>Nenhuma operação encerrada ainda. Quando você registrar uma venda, o resultado pelo preço médio aparece aqui.</Empty></div></div>;
    const tot = rows.reduce((a, r) => a + r.res, 0), totCost = rows.reduce((a, r) => a + r.cost, 0), wins = rows.filter((r) => r.res > 0).length;
    const years: Record<string, number> = {}; for (const r of rows) years[r.v.date.slice(0, 4)] = (years[r.v.date.slice(0, 4)] ?? 0) + r.res;
    const ymax = Math.max(1, ...Object.values(years).map(Math.abs));
    return (
      <div>{head}
        <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_340px]">
          <section className="card overflow-x-auto p-0"><div className="px-5 pt-4"><h2>Operações encerradas</h2><p className="text-xs text-ink/45">Cada venda comparada ao preço médio de compra na data.</p></div>
            <table className="table mt-2 min-w-[760px]"><thead><tr><th>Ativo</th><th>Início</th><th>Venda</th><th className="num">Qtd</th><th className="num">Preço médio</th><th className="num">Preço venda</th><th className="num">Resultado</th></tr></thead><tbody>
              {rows.map((r) => <tr key={r.v.id}><td className="font-semibold">{r.v.ticker}</td><td className="text-ink/60">{formatDateBR(r.firstDate)}</td><td className="text-ink/60">{formatDateBR(r.v.date)}</td><td className="num">{Number(r.v.qty).toLocaleString("pt-BR")}</td><td className="num">{formatBRL(r.avg)}</td><td className="num">{formatBRL(r.v.price)}</td><td className={`num font-medium ${r.res >= 0 ? "text-gain" : "text-loss"}`}>{formatBRL(r.res)}<div className="text-[11px]">{r.cost ? pctS(r.res / r.cost) : ""}</div></td></tr>)}
            </tbody><tfoot><tr className="font-semibold"><td colSpan={6}>Resultado total</td><td className={`num ${tot >= 0 ? "text-gain" : "text-loss"}`}>{formatBRL(tot)}<div className="text-[11px]">{totCost ? pctS(tot / totCost) : ""}</div></td></tr></tfoot></table></section>
          <aside className="space-y-4">
            <section className="card"><div className="label">Resultado total</div><div className={`mt-1 text-[26px] font-semibold tabular-nums ${tot >= 0 ? "text-gain" : "text-loss"}`}>{formatBRL(tot)}</div><div className="mt-1 text-xs text-ink/50">{rows.length} vendas · {wins} com lucro</div></section>
            <section className="card"><h2 className="mb-3">Por ano</h2><div className="space-y-2">{Object.entries(years).sort().map(([y, v]) => <div key={y}><div className="mb-1 flex justify-between text-sm"><span>{y}</span><span className={`tabular-nums ${v >= 0 ? "text-gain" : "text-loss"}`}>{formatBRL(v)}</span></div><Bar value={Math.abs(v)} max={ymax} color={v >= 0 ? "#15803d" : "#e11d48"} /></div>)}</div></section>
          </aside>
        </div>
      </div>
    );
  }

  if (tab === "noticias") {
    const { data: wl } = await ctx.supabase.from("watchlist").select("ticker").eq("household_id", hh);
    const all = [...new Set([...tickers, ...((wl ?? []) as { ticker: string }[]).map((w) => w.ticker)])], syms = all.map(symOf);
    try { await ensureNewsFresh(syms); } catch { /* segue com o cache */ }
    const filt = sp.ativo && all.includes(sp.ativo) ? sp.ativo : "";
    const { data: news } = syms.length ? await ctx.supabase.from("market_news").select("*").in("symbol", filt ? [symOf(filt)] : syms).order("published_at", { ascending: false }).limit(60) : { data: [] };
    const tOf = (s: string) => all.find((t) => symOf(t) === s) ?? s;
    return (
      <div>{head}
        <section className="card mt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2>Notícias das suas ações</h2>{all.length > 0 && <Seg options={[["", "Todas"], ...all.map((t) => [t, t] as [string, string])]} current={filt} hrefFor={(v) => `/investimentos?aba=noticias${v ? `&ativo=${v}` : ""}`} />}</div>
          {(news ?? []).length ? <div className="divide-y divide-ink/5">{(news as { id: string; symbol: string; title: string; url: string; source: string | null; published_at: string | null }[]).map((n) => (
            <a key={n.id} href={n.url} target="_blank" rel="noreferrer" className="flex items-start gap-3 py-3 hover:bg-ink/[0.02]"><span className="w-16 shrink-0 font-semibold">{tOf(n.symbol)}</span><span className="flex-1 text-sm">{n.title}<span className="block text-xs text-ink/45">{n.source}{n.published_at ? ` · ${new Date(n.published_at).toLocaleDateString("pt-BR")}` : ""}</span></span><span className="text-ink/30">↗</span></a>
          ))}</div> : <Empty>Sem notícias ainda. Elas aparecem para as ações que você tem, já teve ou acompanha no monitor de Análise.</Empty>}
          <p className="mt-3 text-[11px] text-ink/45">Fonte: Yahoo Finance (links para as matérias originais). Atualiza a cada poucas horas.</p>
        </section>
      </div>
    );
  }

  // ----- Carteira -----
  const keys = Object.keys(CLS) as Cls[];
  const parts = keys.map((k) => ({ label: CLS[k].l, v: sm.byCls[k] ?? 0, color: CLS[k].c }));
  const tgtSum = keys.reduce((a, k) => a + Number(targets[k] ?? 0), 0);
  const aporte = Number(sp.aporte?.replace(/\D/g, "")) || 5000;
  const split = splitContribution(sm.byCls, sm.total, targets, aporte);
  const groups = keys.filter((k) => k !== "rf").map((k) => ({ k, rows: sm.rows.filter((r) => r.cls === k) })).filter((g) => g.rows.length);
  return (
    <div>{head}
      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          {groups.length === 0 && !sm.rf.length && (
            <div className="card flex flex-col items-center gap-3 py-10 text-center"><h2>Nenhuma posição aberta</h2><p className="max-w-md text-sm text-ink/55">Registre uma compra em Operações (ou leia uma nota de corretagem com IA) e um título em Renda fixa.</p>
              <div className="flex gap-2"><Link className="btn" href={href("operacoes")}>Registrar operação</Link><Link className="btn-ghost" href={href("renda-fixa")}>Adicionar renda fixa</Link></div></div>)}
          {groups.map((g) => { const tot = g.rows.reduce((a, r) => a + r.value, 0); return (
            <section key={g.k} className="card overflow-x-auto p-0">
              <div className="flex items-center justify-between px-5 py-3"><div className="flex items-center gap-3"><span className="h-8 w-1 rounded-full" style={{ background: CLS[g.k].c }} /><h2>{CLS[g.k].l}</h2></div><div className="text-right"><div className="font-semibold tabular-nums">{formatBRL(tot)}</div><div className="text-xs text-ink/45">{sm.total ? formatPct(tot / sm.total) : ""} da carteira</div></div></div>
              <table className="table min-w-[860px]"><thead><tr><th>Ativo</th><th className="num">Qtd</th><th className="num">Preço médio</th><th className="num">Cotação</th><th className="num">Valor</th><th className="num">Resultado</th><th className="num">Alvo +45%</th><th className="num">Peso</th></tr></thead><tbody>
                {g.rows.map((r) => { const tgt = r.avg * 1.45, dist = r.quote ? tgt / r.quote - 1 : null, isManual = manual[r.ticker] != null; return (
                  <tr key={r.ticker}><td><div className="font-semibold">{r.ticker}</div><div className="text-xs text-ink/45">{r.name ?? q[symOf(r.ticker)]?.name ?? ""}</div></td><td className="num">{r.qty.toLocaleString("pt-BR", { maximumFractionDigits: 8 })}</td><td className="num">{formatBRL(r.avg)}</td>
                    <td className="num">{edit ? (
                      <form action={saveManualQuote} className="inline-flex flex-col items-end"><input type="hidden" name="ticker" value={r.ticker} />
                        <input className="w-24 rounded-lg border border-transparent bg-ink/[0.04] px-2 py-1 text-right tabular-nums outline-none hover:border-ink/10 focus:border-brand" name="price" defaultValue={r.quote != null ? r.quote.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""} placeholder="—" title="Deixe vazio para usar a cotação automática" />
                        <span className="text-[10px] text-ink/40">{isManual ? "manual" : r.quote != null ? "automática" : "sem cotação"}</span></form>) : (r.quote != null ? formatBRL(r.quote) : "—")}</td>
                    <td className="num font-medium">{formatBRL(r.value)}</td><td className={`num ${r.pnl >= 0 ? "text-gain" : "text-loss"}`}>{formatBRL(r.pnl)}<div className="text-[11px]">{pctS(r.pnlPct)}</div></td>
                    <td className="num">{formatBRL(tgt)}<div className={`text-[11px] ${dist != null && dist <= 0 ? "font-semibold text-gain" : "text-ink/45"}`}>{dist == null ? "" : dist <= 0 ? "meta atingida" : `falta ${formatPct(dist)}`}</div></td><td className="num">{sm.total ? formatPct(r.value / sm.total) : ""}</td></tr>); })}
              </tbody></table></section>); })}
          {sm.rf.length > 0 && (
            <section className="card p-0"><div className="flex items-center justify-between px-5 py-3"><div className="flex items-center gap-3"><span className="h-8 w-1 rounded-full" style={{ background: CLS.rf.c }} /><h2>Renda fixa</h2></div><Link className="text-sm font-medium text-brand" href={href("renda-fixa")}>Detalhes →</Link></div>
              <div className="divide-y divide-ink/5 px-5 pb-3">{sm.rf.map((f) => <div key={f.id} className="flex items-center justify-between py-2 text-sm"><span>{f.name} <span className="text-ink/45">· {rateLbl(f)}</span></span><span className="font-medium tabular-nums">{formatBRL(f.value)} <span className="text-xs text-gain">+{formatBRL(f.pnl)}</span></span></div>)}</div></section>)}
        </div>
        <aside className="space-y-4">
          <section className="card"><h2 className="mb-3">Alocação</h2>
            {sm.total ? <div className="flex justify-center"><Donut parts={parts} total={sm.total} center={["patrimônio", formatBRL(sm.total).replace(/,\d\d$/, "")]} /></div> : <p className="text-sm text-ink/50">Sem posições ainda.</p>}
            <form action={saveTargets}>
              <table className="mt-3 w-full text-sm"><thead><tr className="text-[11px] uppercase tracking-wider text-ink/40"><th className="pb-1 text-left font-semibold">Classe</th><th className="pb-1 text-right font-semibold">Atual</th><th className="pb-1 text-right font-semibold">Alvo</th></tr></thead><tbody>
                {keys.map((k) => { const a = sm.total ? ((sm.byCls[k] ?? 0) / sm.total) * 100 : 0, t = Number(targets[k] ?? 0); return (
                  <tr key={k}><td className="py-1"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CLS[k].c }} />{CLS[k].l}</span></td><td className="py-1 text-right tabular-nums">{sm.total ? `${a.toFixed(0)}%` : "—"}</td><td className="py-1 text-right"><input className="w-12 rounded border border-ink/10 px-1 text-right tabular-nums" name={k} defaultValue={t} disabled={!edit} />%</td></tr>); })}
                <tr className="border-t border-ink/10 text-xs"><td className="pt-1 text-ink/50">Soma do alvo</td><td /><td className={`pt-1 text-right font-medium ${tgtSum === 100 ? "text-gain" : "text-loss"}`}>{tgtSum}%</td></tr>
              </tbody></table>
              {edit && <button className="btn-ghost mt-2 w-full !py-1.5 text-xs">Salvar alvo</button>}
            </form>
          </section>
          <section className="card"><h2 className="mb-1">Próximo aporte</h2><p className="mb-3 text-xs text-ink/50">Como dividir para aproximar a carteira do alvo, sem vender nada.</p>
            <form className="mb-3 flex items-center gap-2"><input type="hidden" name="aba" value="carteira" /><span className="text-sm text-ink/50">R$</span><input className="input" name="aporte" defaultValue={aporte.toLocaleString("pt-BR")} inputMode="decimal" /><button className="btn-ghost !py-1.5 text-xs">Calcular</button></form>
            <div className="space-y-2">{split.map((x) => <div key={x.k}><div className="mb-1 flex justify-between text-sm"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CLS[x.k].c }} />{CLS[x.k].l}</span><b className="tabular-nums">{formatBRL(x.v)}</b></div><Bar value={x.v} max={aporte} color={CLS[x.k].c} /></div>)}</div>
          </section>
        </aside>
      </div>
    </div>
  );
}
