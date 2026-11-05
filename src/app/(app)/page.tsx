import Link from "next/link";
import { requireArea } from "@/lib/context";
import { currentCycle, cycleLabel, isValidCycle, shiftCycle, todayIso } from "@/lib/cycle";
import { addDays, eventLabel, occurrenceStatus } from "@/lib/agenda";
import { loadAgenda } from "@/lib/agenda-data";
import { categoryIndex, loadCategories, loadTransactions, summarize, sumByCategory } from "@/lib/data";
import { formatBRL, formatPct } from "@/lib/format";
import { AGENDA_COLOR, groupColor } from "@/lib/theme";
import { Bar, cycleLong, CycleNav, Delta, Donut, Empty, Kpi, PageHeader, Pill } from "@/components/ui";
import { Icon } from "@/components/icons";
import { buildFlow } from "@/lib/flow";
import { Sankey } from "@/components/sankey";

const kfmt = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k` : String(Math.round(v)));

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ ciclo?: string }> }) {
  const ctx = await requireArea("visao-geral");
  const sp = await searchParams;
  const startDay = ctx.household.cycle_start_day;
  const cycle = isValidCycle(sp.ciclo) ? sp.ciclo : currentCycle(startDay);
  const prevC = shiftCycle(cycle, -1);
  // O gráfico fica ancorado no ciclo atual: clicar num mês passado não "arrasta" a janela.
  const nowCycle = currentCycle(startDay);
  const windowEnd = cycle <= nowCycle && cycle >= shiftCycle(nowCycle, -11) ? nowCycle : cycle;
  const history = Array.from({ length: 12 }, (_, i) => shiftCycle(windowEnd, i - 11));
  const today = todayIso();

  const [cats, txs, budgetsRes, agenda, lastBatch] = await Promise.all([
    loadCategories(ctx, "pessoal"),
    loadTransactions(ctx, { scope: "pessoal", cycles: [...new Set([...history, prevC])] }),
    ctx.supabase.from("budgets").select("category_id, planned").eq("household_id", ctx.household.id).eq("cycle", cycle),
    loadAgenda(ctx, addDays(today, -5), addDays(today, 14)),
    ctx.supabase.from("import_batches").select("id, institution, due_date, statement_total, tx_count").eq("household_id", ctx.household.id).neq("source", "planilha").order("due_date", { ascending: false, nullsFirst: false }).limit(1),
  ]);
  const { byId } = categoryIndex(cats);
  const curTx = txs.filter((t) => t.cycle === cycle);
  const flow = buildFlow(curTx, cats, "grupo", 6);
  const s = summarize(curTx, cats);
  const p = summarize(txs.filter((t) => t.cycle === prevC), cats);
  const hist = history.map((c) => ({ c, ...summarize(txs.filter((t) => t.cycle === c), cats) }));

  const spent = sumByCategory(curTx);
  const alerts = (budgetsRes.data ?? [])
    .map((b: { category_id: string; planned: number }) => ({ cat: byId.get(b.category_id), planned: Number(b.planned), real: spent.get(b.category_id) ?? 0 }))
    .filter((a) => a.cat && a.cat.kind === "despesa" && a.planned > 0 && a.real >= a.planned * 0.8)
    .sort((a, b) => b.real / b.planned - a.real / a.planned);
  const top = [...spent.entries()].map(([id, v]) => ({ cat: byId.get(id), v }))
    .filter((x) => x.cat && x.cat.kind === "despesa" && !x.cat.excluded_from_totals).sort((a, b) => b.v - a.v).slice(0, 7);
  const toClassify = curTx.filter((t) => !t.category_id || byId.get(t.category_id)?.grp === "A classificar").length;
  const groups = [...new Set(cats.filter((c) => c.kind === "despesa" && c.scope === "pessoal").map((c) => c.grp))]
    .map((g) => ({ label: g, v: s.porGrupo[g] ?? 0, color: groupColor(g, cats.find((c) => c.grp === g)?.color) }));
  const upcoming = agenda.occ.filter((o) => !o.paid && (o.date >= today || o.event !== "fechamento")).slice(0, 4);
  const batch = lastBatch.data?.[0];

  // Gráfico de barras
  const W = 720, H = 190, max = Math.max(1, ...hist.map((x) => Math.max(x.receitas, x.despesas))), bw = 15, gap = W / 12;

  return (
    <div>
      <PageHeader title={`Olá, ${ctx.member.display_name}`} subtitle={`Resumo das finanças pessoais do ciclo de ${cycleLong(cycle).toLowerCase()}.`}>
        <CycleNav cycle={cycle} startDay={startDay} basePath="/" today={nowCycle} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Receitas" value={s.receitas} accent="#4f7a52" sub={<Delta cur={s.receitas} prev={p.receitas} prevLabel={cycleLabel(prevC)} />} />
        <Kpi label="Despesas" value={s.despesas} accent="#a33f30" sub={<Delta cur={s.despesas} prev={p.despesas} invert prevLabel={cycleLabel(prevC)} />} />
        <Kpi label="Investido" value={s.investimentos} accent="#4a5a73" sub={s.receitas ? `${formatPct(s.investimentos / s.receitas)} da receita` : "—"} />
        <Kpi label="Sobra do ciclo" value={s.saldo} accent={s.saldo >= 0 ? "#7d5f36" : "#a33f30"} sub={s.receitas ? `${formatPct(s.saldo / s.receitas)} da receita` : "—"} />
      </div>

      {upcoming.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {upcoming.map((o) => {
            const st = occurrenceStatus(o, today);
            return (
              <Link key={o.key} href="/agenda" className="flex items-center gap-3 rounded-2xl border border-ink/[0.06] bg-white p-3 shadow-sm transition hover:shadow-md">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: AGENDA_COLOR[o.item.type] }}>
                  <Icon name={o.item.type === "cartao" ? "card" : o.item.type === "receita" ? "up" : "bell"} className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{o.item.name}</div><div className="text-xs text-ink/50">{eventLabel(o)} · {o.date.slice(8)}/{o.date.slice(5, 7)}</div></div>
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.text.startsWith("melhor") ? "fecha" : st.text}</span>
              </Link>
            );
          })}
        </div>
      )}

      {toClassify > 0 && (
        <Link href={`/lancamentos?ciclo=${cycle}&categoria=a-classificar`} className="mt-4 flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50/80 px-4 py-3 text-sm text-orange-900 transition hover:bg-orange-50">
          <Icon name="spark" className="h-5 w-5 text-orange-500" /><span className="flex-1"><b>{toClassify} lançamento(s)</b> aguardando categoria. Cada classificação ensina a plataforma.</span><Icon name="right" />
        </Link>
      )}

      {flow && flow.receitas > 0 && (
        <section className="card mt-5 px-6">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <div><div className="eyebrow">Fluxo de {cycleLong(cycle).toLowerCase()}</div><h2 className="mt-1 font-serif text-[24px] font-normal">Para onde foi sua renda</h2></div>
            <Link href={`/fluxo?ciclo=${cycle}`} className="text-sm text-brand hover:underline">Ver fluxo completo →</Link>
          </div>
          <Sankey data={flow} compact />
        </section>
      )}

      <div className="mt-5 grid gap-4 xl:grid-cols-5">
        <section className="card xl:col-span-3">
          <div className="mb-2 flex items-center justify-between"><h2>Receitas × despesas</h2>
            <div className="flex gap-3 text-xs text-ink/55"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#4f7a52]" />Receitas</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#a33f30]" />Despesas</span></div></div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {[0, 0.5, 1].map((f) => <line key={f} x1="0" x2={W} y1={150 - f * 130} y2={150 - f * 130} stroke="#1f1b17" strokeOpacity=".06" />)}
            {hist.map((x, i) => {
              const cx = gap * i + gap / 2, hr = (x.receitas / max) * 130, hd = (x.despesas / max) * 130, act = x.c === cycle;
              return (
                <a key={x.c} href={`/?ciclo=${x.c}`}>
                  <rect x={cx - gap / 2 + 4} y="0" width={gap - 8} height={H} rx="10" fill={act ? "#7d5f360d" : "transparent"} />
                  <rect x={cx - bw - 2} y={150 - hr} width={bw} height={Math.max(hr, 1)} rx="5" fill="#4f7a52" opacity={act ? 1 : 0.55}><title>{`Receitas ${formatBRL(x.receitas)}`}</title></rect>
                  <rect x={cx + 2} y={150 - hd} width={bw} height={Math.max(hd, 1)} rx="5" fill="#a33f30" opacity={act ? 1 : 0.5}><title>{`Despesas ${formatBRL(x.despesas)}`}</title></rect>
                  <text x={cx} y="170" textAnchor="middle" style={{ fontSize: 11, fontWeight: act ? 600 : 400 }} fill={act ? "#1f1b17" : "#1f1b1780"}>{cycleLabel(x.c).slice(0, 3)}</text>
                  <text x={cx} y="185" textAnchor="middle" style={{ fontSize: 10 }} fill={x.saldo >= 0 ? "#4f7a52" : "#a33f30"}>{x.receitas || x.despesas ? `${x.saldo >= 0 ? "+" : "−"}${kfmt(Math.abs(x.saldo))}` : ""}</text>
                </a>
              );
            })}
          </svg>
          <p className="text-xs text-ink/40">Últimos 12 ciclos. Clique em um mês para abri-lo; a janela continua no mês atual. O número abaixo de cada mês é a sobra.</p>
        </section>

        <section className="card xl:col-span-2">
          <h2 className="mb-4">Para onde foi o dinheiro</h2>
          {s.despesas === 0 ? <Empty>Nenhuma despesa neste ciclo.<Link className="font-medium text-brand" href="/faturas/importar">Importe uma fatura →</Link></Empty> : (
            <div className="flex items-center gap-5">
              <Donut parts={groups} total={s.despesas} center={["despesas", formatBRL(s.despesas).replace(/,\d{2}$/, "")]} />
              <div className="flex-1 space-y-2.5">
                {groups.filter((g) => g.v).map((g) => (
                  <div key={g.label}>
                    <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />{g.label}</span><span className="tabular-nums text-ink/70">{formatPct(g.v / s.despesas)}</span></div>
                    <div className="pl-[18px] text-xs tabular-nums text-ink/45">{formatBRL(g.v)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="card xl:col-span-3">
          <div className="mb-3 flex items-center justify-between"><h2>Maiores categorias</h2><Link className="text-sm font-medium text-brand" href={`/orcamento?ciclo=${cycle}`}>Ver orçamento →</Link></div>
          {top.length === 0 ? <Empty>Sem dados ainda.</Empty> : (
            <div className="divide-y divide-ink/5">
              {top.map((x) => (
                <Link key={x.cat!.id} href={`/lancamentos?ciclo=${cycle}&categoria=${x.cat!.id}`} className="flex items-center gap-3 py-2.5 hover:bg-ink/[0.02]">
                  <div className="w-44 shrink-0"><Pill cat={x.cat} /></div>
                  <div className="flex-1"><Bar value={x.v} max={top[0].v} color={groupColor(x.cat!.grp, x.cat!.color)} /></div>
                  <div className="w-28 text-right text-sm font-medium tabular-nums">{formatBRL(x.v)}</div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="card xl:col-span-2">
          <div className="mb-3 flex items-center justify-between"><h2>Limites</h2><Link className="text-sm font-medium text-brand" href={`/orcamento?ciclo=${cycle}`}>Definir →</Link></div>
          {alerts.length === 0 ? <Empty icon="check">Nenhuma categoria acima de 80% do limite.</Empty> : (
            <div className="space-y-3">
              {alerts.map((a) => (
                <div key={a.cat!.id}>
                  <div className="mb-1 flex justify-between text-sm"><span>{a.cat!.name}</span><span className={`tabular-nums ${a.real > a.planned ? "font-medium text-rose-700" : "text-ink/60"}`}>{formatBRL(a.real)} <span className="text-ink/35">/ {formatBRL(a.planned)}</span></span></div>
                  <Bar value={a.real} max={a.planned} color={a.real > a.planned ? "#a33f30" : "#b8955a"} />
                </div>
              ))}
            </div>
          )}
          {batch && (
            <div className="mt-5 border-t border-ink/5 pt-4">
              <div className="label mb-2">Última fatura</div>
              <Link href={`/faturas/${batch.id}`} className="flex items-center gap-3 rounded-xl bg-ink/[0.03] p-3 hover:bg-ink/[0.05]">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#b0703f] text-xs font-bold text-white">{(batch.institution ?? "").slice(0, 4).toLowerCase()}</div>
                <div className="flex-1 text-sm"><div className="font-medium">{batch.due_date ? `Venc. ${String(batch.due_date).split("-").reverse().join("/")}` : "Fatura"}</div><div className="text-xs text-ink/50">{batch.tx_count} itens</div></div>
                <div className="font-semibold tabular-nums">{formatBRL(batch.statement_total)}</div>
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
