import Link from "next/link";
import { canSee, requireArea } from "@/lib/context";
import { CLS, summary, type Cls, type Fixed, type Op } from "@/lib/invest";
import { analyzeTicker, type Watch } from "@/lib/analise";
import { goalCalc, reserveTarget, GOAL_T, type Goal } from "@/lib/goals";
import { getMacro, getQuotes, ipcaRef } from "@/lib/market/read";
import { loadHistory } from "@/lib/market/history";
import { yahooSymbol } from "@/lib/market/sources";
import { aiAvailable } from "@/lib/ai";
import { formatBRL } from "@/lib/format";
import { CycleSummary } from "./cycle-summary";
import { currentCycle, cycleRange, shiftCycle, todayIso } from "@/lib/cycle";
import { addDays } from "@/lib/agenda";
import { loadAgenda } from "@/lib/agenda-data";
import { categoryIndex, loadCategories, loadTransactions, type Transaction } from "@/lib/data";
import { buildInstallmentPlans, totalsByCycle, type InstallmentTx } from "@/lib/installments";
import { generateInsights, type InsightArea, type InsightKind, type InsightTx } from "@/lib/insights";
import { Empty, PageHeader, Seg } from "@/components/ui";
import { Icon } from "@/components/icons";
import { dismissInsight, restoreInsights } from "./actions";

const KIND: Record<InsightKind, { label: string; color: string; bg: string; icon: string }> = {
  atencao: { label: "Atenção", color: "#a33f30", bg: "#f9efec", icon: "bell" },
  oportunidade: { label: "Oportunidade", color: "#4f7a52", bg: "#f1f4ee", icon: "trend" },
  info: { label: "Informação", color: "#4a5a73", bg: "#eef1f4", icon: "spark" },
};
const AREA: Record<InsightArea, string> = {
  precos: "Preços e assinaturas", orcamento: "Orçamento", cartao: "Cartão", investimentos: "Investimentos", agenda: "Agenda", organizacao: "Organização",
};

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const ctx = await requireArea("insights");
  const sp = await searchParams;
  const startDay = ctx.household.cycle_start_day;
  const cur = currentCycle(startDay);
  const today = todayIso();
  const cycles = Array.from({ length: 13 }, (_, i) => shiftCycle(cur, i - 12));

  const [cats, txs, budgetsRes, instRes, agenda, dismissRes] = await Promise.all([
    loadCategories(ctx),
    loadTransactions(ctx, { cycles }),
    ctx.supabase.from("budgets").select("category_id, cycle, planned").eq("household_id", ctx.household.id).eq("cycle", cur),
    ctx.supabase.from("transactions").select("*").eq("household_id", ctx.household.id).not("installment_total", "is", null).gt("installment_total", 1).limit(10000),
    loadAgenda(ctx, addDays(today, -60), addDays(today, 7)),
    ctx.supabase.from("insight_dismissals").select("key").eq("household_id", ctx.household.id),
  ]);
  const { byId } = categoryIndex(cats);
  const itx: InsightTx[] = txs.map((t: Transaction) => {
    const c = t.category_id ? byId.get(t.category_id) : undefined;
    return {
      id: t.id, date: t.date, cycle: t.cycle, description: t.description, merchant_key: t.merchant_key, amount: Number(t.amount),
      kind: c?.kind ?? t.kind, grp: c?.grp ?? null, category_id: t.category_id, category_name: c?.name ?? null, excluded: !!c?.excluded_from_totals,
      source: t.source, installment_no: t.installment_no, installment_total: t.installment_total,
      international: !!(t as Transaction & { international?: boolean }).international,
    };
  });
  const plans = buildInstallmentPlans((instRes.data ?? []) as unknown as InstallmentTx[], cur);
  const future = Array.from({ length: 24 }, (_, i) => shiftCycle(cur, i));
  const committed = Object.fromEntries(future.map((c, i) => [c, totalsByCycle(plans, future)[i]]));
  const open = plans.filter((p) => p.remainingCount > 0);
  const free = open.length ? shiftCycle(open.reduce((m, p) => (p.lastCycle > m ? p.lastCycle : m), cur), 1) : null;

  // Carteira e monitor (só se quem está vendo tem acesso a essas áreas)
  let portfolio: Parameters<typeof generateInsights>[0]["portfolio"], watch: Parameters<typeof generateInsights>[0]["watch"];
  let pfTotal = 0;
  if (canSee(ctx, "investimentos")) {
    const [{ data: ops }, { data: fixed }, { data: st }] = await Promise.all([
      ctx.supabase.from("inv_ops").select("*").eq("household_id", ctx.household.id), ctx.supabase.from("inv_fixed").select("*").eq("household_id", ctx.household.id), ctx.supabase.from("inv_settings").select("*").eq("household_id", ctx.household.id).maybeSingle(),
    ]);
    const o = (ops ?? []) as Op[], tickers = [...new Set(o.map((x) => x.ticker))], sym = (t: string) => yahooSymbol(t, o.find((x) => x.ticker === t)?.cls);
    const [macro, q] = await Promise.all([getMacro(ctx), getQuotes(ctx, tickers.map(sym))]);
    const manual = (st?.manual_quotes ?? {}) as Record<string, number>, targets = (st?.targets ?? {}) as Record<string, number>;
    const sm = summary(o, (fixed ?? []) as Fixed[], [], Object.fromEntries(tickers.map((t) => [t, manual[t] ?? q[sym(t)]?.price ?? null])), macro.cdi, ipcaRef(macro), today);
    pfTotal = sm.total;
    portfolio = { total: sm.total, classes: (Object.keys(CLS) as Cls[]).map((k) => ({ key: k, label: CLS[k].l, value: sm.byCls[k] ?? 0, target: Number(targets[k] ?? 0) })),
      positions: sm.rows.map((r) => ({ ticker: r.ticker, value: r.value, pnlPct: r.pnlPct, targetHit: r.quote != null && r.quote >= r.avg * 1.45 })),
      fixedIncome: sm.rf.map((f) => ({ name: f.name, index: f.index, rate: Number(f.rate) })) };
  }
  if (canSee(ctx, "analise")) {
    const { data: wl } = await ctx.supabase.from("watchlist").select("ticker, buy, sell, note, fund").eq("household_id", ctx.household.id);
    const ws = ((wl ?? []) as Watch[]).map((w) => ({ ...w, buy: w.buy == null ? null : Number(w.buy), sell: w.sell == null ? null : Number(w.sell) }));
    const q = await getQuotes(ctx, ws.map((w) => yahooSymbol(w.ticker)));
    watch = await Promise.all(ws.map(async (w) => { const sym = yahooSymbol(w.ticker), r = analyzeTicker(w, await loadHistory(ctx, sym, false), q[sym]?.price ?? null); return { ticker: w.ticker, price: r.price, buy: w.buy, sell: w.sell, zone: r.zone?.t ?? null, action: r.sug?.action ?? null }; }));
  }

  const all = generateInsights({ portfolio, watch,
    txs: itx, currentCycle: cur, today, cycleRange: (c) => cycleRange(c, startDay),
    budgets: (budgetsRes.data ?? []).map((b: { category_id: string; cycle: string; planned: number }) => ({ ...b, planned: Number(b.planned) })),
    committedByCycle: committed, installmentsFreeCycle: free,
    overdueAgenda: agenda.occ.filter((o) => o.date < today && !o.paid && o.event !== "fechamento").map((o) => ({ name: o.item.name, date: o.date, amount: o.amount })),
    nextDue: agenda.occ.filter((o) => o.date >= today && o.date <= addDays(today, 7) && !o.paid && o.event !== "fechamento").map((o) => ({ name: o.item.name, date: o.date, amount: o.amount })),
  });
  // Objetivos fora do ritmo
  if (canSee(ctx, "objetivos")) {
    const { data: gl } = await ctx.supabase.from("goals").select("*").eq("household_id", ctx.household.id);
    const reserve = reserveTarget(txs, byId as unknown as Map<string, { kind: string; grp: string; excluded_from_totals: boolean }>, cur);
    for (const g of (gl ?? []) as Goal[]) {
      if (g.type === "independencia") continue;
      const c = goalCalc(g, cur, pfTotal, reserve);
      if (c.kind === "meta" && c.target && !c.onTrack) all.push({ key: `objetivo|${g.id}|${cur}`, kind: "atencao", area: "organizacao", title: `${g.name}: fora do ritmo`,
        body: `Faltam ${formatBRL(Math.max(0, c.target - c.current))} em ${c.n} meses. Para chegar no prazo, o aporte precisa ser de cerca de ${formatBRL(c.need)} por mês (${GOAL_T[g.type].l.toLowerCase()}).`,
        metric: formatBRL(c.need), link: { href: "/objetivos", label: "Ver objetivo" }, weight: 60 });
    }
  }
  const dismissed = new Set((dismissRes.data ?? []).map((d: { key: string }) => d.key));
  const visible = all.filter((i) => !dismissed.has(i.key));
  const area = sp.area && sp.area in AREA ? (sp.area as InsightArea) : null;
  const shown = area ? visible.filter((i) => i.area === area) : visible;
  const counts = (k: InsightKind) => visible.filter((i) => i.kind === k).length;
  const areas = (Object.keys(AREA) as InsightArea[]).filter((a) => visible.some((i) => i.area === a));

  return (
    <div>
      <PageHeader title="Insights" subtitle="Análises automáticas sobre tudo o que está na plataforma: preços que mudaram, gastos fora do padrão, compromissos do cartão e oportunidades para investir melhor.">
        {dismissed.size > 0 && <form action={restoreInsights}><button className="btn-ghost">Mostrar {dismissed.size} dispensado(s)</button></form>}
      </PageHeader>

      {aiAvailable(ctx) && <CycleSummary />}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {(Object.keys(KIND) as InsightKind[]).map((k) => (
          <div key={k} className="card flex items-center gap-4">
            <div className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: KIND[k].bg, color: KIND[k].color }}><Icon name={KIND[k].icon} className="h-5 w-5" /></div>
            <div><div className="text-2xl font-semibold tabular-nums">{counts(k)}</div><div className="text-xs text-ink/50">{KIND[k].label}</div></div>
          </div>
        ))}
      </div>

      {areas.length > 1 && (
        <div className="mb-4">
          <Seg options={[["", "Todos"], ...areas.map((a) => [a, AREA[a]] as [string, string])]} current={area ?? ""} hrefFor={(v) => (v ? `/insights?area=${v}` : "/insights")} />
        </div>
      )}

      {shown.length === 0 ? (
        <Empty icon="spark">Nenhum insight por enquanto. Eles aparecem conforme você importa faturas, cadastra a agenda e define o orçamento — quanto mais ciclos, mais comparações.</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map((i) => {
            const K = KIND[i.kind];
            return (
              <article key={i.key} className="card relative flex flex-col gap-3 overflow-hidden">
                <div className="absolute inset-y-0 left-0 w-1" style={{ background: K.color }} />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: K.color }}>
                    <Icon name={K.icon} className="h-3.5 w-3.5" />{K.label}<span className="text-ink/30">·</span><span className="text-ink/45">{AREA[i.area]}</span>
                  </div>
                  {i.metric && <span className="rounded-lg px-2 py-0.5 text-sm font-semibold tabular-nums" style={{ background: K.bg, color: K.color }}>{i.metric}</span>}
                </div>
                <h2 className="text-[15px] leading-snug">{i.title}</h2>
                <p className="text-sm leading-relaxed text-ink/65">{i.body}</p>
                <div className="mt-auto flex items-center justify-between pt-1">
                  {i.link ? <Link href={i.link.href} className="text-sm font-medium text-brand hover:underline">{i.link.label} →</Link> : <span />}
                  <form action={dismissInsight}><input type="hidden" name="key" value={i.key} /><button className="text-xs text-ink/40 hover:text-ink">Entendi, dispensar</button></form>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="mt-6 text-xs text-ink/40">Os insights são calculados a partir dos seus próprios dados e não são recomendação de investimento. Na Fase 2 entram cotações e taxas de referência (CDI, Selic, IPCA); na Fase 3, uma análise com IA em linguagem natural.</p>
    </div>
  );
}
