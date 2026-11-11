import Link from "next/link";
import { requireArea, visibleAreas } from "@/lib/context";
import { currentCycle, cycleLabel, cycleRange, isValidCycle, shiftCycle, todayIso } from "@/lib/cycle";
import { addDays, eventLabel, occurrenceStatus } from "@/lib/agenda";
import { loadAgenda } from "@/lib/agenda-data";
import { categoryIndex, loadCategories, loadTransactions, summarize, sumByCategory } from "@/lib/data";
import { formatBRL, formatPct } from "@/lib/format";
import { groupColor } from "@/lib/theme";
import { Bar, cycleLong, CycleNav, Delta, Donut, Empty, Kpi, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { buildFlow } from "@/lib/flow";
import { Sankey } from "@/components/sankey";
import { CatIcon } from "@/components/cat-icon";
import { EvolutionChart, type DayPoint } from "@/components/evolution-chart";
import { positions, type Op } from "@/lib/invest";
import type { Goal } from "@/lib/goals";

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

  const range = cycleRange(cycle, startDay);
  const areas = visibleAreas(ctx);
  const seeInv = areas.includes("investimentos"), seeGoals = areas.includes("objetivos");
  const nextRange = cycleRange(shiftCycle(cycle, 1), startDay);
  const [cats, txs, budgetsRes, agenda, lastBatch, cycAgenda, accRes, goalsRes, opsRes, fixedRes, fatRes] = await Promise.all([
    loadCategories(ctx, "pessoal"),
    loadTransactions(ctx, { scope: "pessoal", cycles: [...new Set([...history, prevC, cycle, shiftCycle(cycle, 1)])] }),
    ctx.supabase.from("budgets").select("category_id, planned").eq("household_id", ctx.household.id).eq("cycle", cycle),
    loadAgenda(ctx, addDays(today, -5), addDays(today, 14)),
    ctx.supabase.from("import_batches").select("id, institution, due_date, statement_total, tx_count").eq("household_id", ctx.household.id).neq("source", "planilha").order("due_date", { ascending: false, nullsFirst: false }).limit(1),
    loadAgenda(ctx, range.start, range.end),
    ctx.supabase.from("accounts").select("id, name, type, institution, last4, closing_day, due_day, statement_key, color").eq("household_id", ctx.household.id).eq("type", "cartao").eq("active", true),
    seeGoals ? ctx.supabase.from("goals").select("*").eq("household_id", ctx.household.id).eq("type", "caixinha").order("sort") : Promise.resolve({ data: [] }),
    seeInv ? ctx.supabase.from("inv_ops").select("*").eq("household_id", ctx.household.id) : Promise.resolve({ data: [] }),
    seeInv ? ctx.supabase.from("inv_fixed").select("amount, redeemed_at").eq("household_id", ctx.household.id) : Promise.resolve({ data: [] }),
    ctx.supabase.from("import_batches").select("id, institution, file_name, due_date, account_id").eq("household_id", ctx.household.id).eq("doc_type", "fatura").gte("due_date", range.start).lte("due_date", nextRange.end),
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
  const batch = lastBatch.data?.[0];

  // ---------- Situação do ciclo: o que já entrou/saiu e o que ainda vem (agenda) ----------
  const occ = cycAgenda.occ.filter((o) => o.event !== "fechamento");
  const aReceber = occ.filter((o) => o.event === "receita" && !o.paid).reduce((a, o) => a + (o.amount ?? 0), 0);
  const aPagar = occ.filter((o) => o.event === "conta" && !o.paid).reduce((a, o) => a + (o.amount ?? 0), 0);
  const pago = s.despesas + s.investimentos;
  const saldoPrev = s.receitas + aReceber - pago - aPagar;
  const contas = occ.filter((o) => o.event === "conta" || o.event === "receita").sort((a, b) => a.date.localeCompare(b.date));
  const contasPagar = contas.filter((o) => o.event === "conta");
  const cnt = { total: contasPagar.reduce((a, o) => a + (o.amount ?? 0), 0), pagas: contasPagar.filter((o) => o.paid).length,
    pend: contasPagar.filter((o) => !o.paid && o.date >= today).length, atras: contasPagar.filter((o) => !o.paid && o.date < today).length };

  // ---------- Evolução do saldo no ciclo (realizado até hoje + previsto) ----------
  const days: string[] = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) days.push(d);
  const dayIn = new Map<string, number>(), dayOut = new Map<string, number>();
  const clamp = (d: string) => (d < range.start ? range.start : d > range.end ? range.end : d);
  for (const t of curTx) {
    const c = t.category_id ? byId.get(t.category_id) : undefined;
    if (c?.excluded_from_totals) continue;
    const kind = c?.kind ?? t.kind, v = Number(t.amount), d = clamp(t.date);
    if (kind === "receita") dayIn.set(d, (dayIn.get(d) ?? 0) + v);
    else if (kind === "despesa" || kind === "investimento") dayOut.set(d, (dayOut.get(d) ?? 0) + v);
  }
  const lastReal = today < range.end ? today : range.end;
  for (const o of occ) if (!o.paid && o.amount && o.date > lastReal) {
    if (o.event === "receita") dayIn.set(o.date, (dayIn.get(o.date) ?? 0) + o.amount);
    else if (o.event === "conta") dayOut.set(o.date, (dayOut.get(o.date) ?? 0) + o.amount);
  }
  let acc = 0;
  const evo: DayPoint[] = days.map((d) => { const e = dayIn.get(d) ?? 0, o = dayOut.get(d) ?? 0; acc += e - o; return { date: d, saldo: acc, entrou: e, saiu: o, projected: d > lastReal }; });
  const evoNow = evo.filter((p) => !p.projected).pop()?.saldo ?? 0;

  // ---------- Cartões, cofrinhos e investimentos ----------
  const cards: { id: string; name: string; institution: string | null; last4: string | null; closing_day: number | null; due_day: number | null; fat: number; next: number; closing: number | null; due: number | null }[] = ((accRes.data ?? []) as { id: string; name: string; institution: string | null; last4: string | null; closing_day: number | null; due_day: number | null }[]).map((a) => {
    const item = agenda.items.find((i) => i.type === "cartao" && i.card_last4 && i.card_last4 === a.last4);
    const fat = txs.filter((t) => t.account_id === a.id && t.cycle === cycle).reduce((x, t) => x + Number(t.amount), 0);
    const next = txs.filter((t) => t.account_id === a.id && t.cycle === shiftCycle(cycle, 1)).reduce((x, t) => x + Number(t.amount), 0);
    return { ...a, fat, next, closing: item?.closing_day ?? a.closing_day, due: item?.due_day ?? a.due_day };
  }).filter((c) => c.fat || c.next).sort((a, b) => b.fat - a.fat);
  // Sem cartões cadastrados: monta os cartões a partir das faturas importadas (vencimento neste ciclo e no próximo)
  if (!cards.length) {
    const byCard = new Map<string, (typeof cards)[number]>();
    for (const b of (fatRes.data ?? []) as { id: string; institution: string | null; file_name: string | null; due_date: string }[]) {
      const fn = (b.file_name ?? "").toUpperCase(), brand = fn.match(/VISA|MASTERCARD|MASTER|ELO|AMEX|HIPERCARD/)?.[0], last4 = fn.match(/(\d{4})(?:_|\.|-)\d{2}-\d{2}-\d{4}|(\d{4})\D*$/)?.slice(1).find(Boolean) ?? null;
      const key = `${b.institution}|${brand ?? ""}|${last4 ?? ""}`;
      const total = txs.filter((t) => t.import_batch_id === b.id).reduce((x, t) => x + Number(t.amount), 0);
      const isThis = b.due_date <= range.end;
      const cur = byCard.get(key) ?? { id: key, name: [b.institution, brand ? brand[0] + brand.slice(1).toLowerCase() : null].filter(Boolean).join(" "), institution: b.institution, last4, closing_day: null, due_day: Number(b.due_date.slice(8, 10)), fat: 0, next: 0, closing: null, due: Number(b.due_date.slice(8, 10)) };
      if (isThis) cur.fat += total; else cur.next += total;
      byCard.set(key, cur);
    }
    cards.push(...[...byCard.values()].filter((c) => c.fat || c.next).sort((a, b) => b.fat - a.fat));
  }
  const maxFat = Math.max(1, ...cards.map((c) => c.fat + c.next));
  const sideCols = [cards.length > 0, seeGoals, seeInv].filter(Boolean).length;
  const caixinhas = (goalsRes.data ?? []) as Goal[];
  const invCost = seeInv ? positions((opsRes.data ?? []) as Op[]).reduce((a, p) => a + p.cost, 0) + ((fixedRes.data ?? []) as { amount: number; redeemed_at: string | null }[]).filter((f) => !f.redeemed_at).reduce((a, f) => a + Number(f.amount), 0) : 0;

  // Gráfico de barras
  const W = 720, H = 190, max = Math.max(1, ...hist.map((x) => Math.max(x.receitas, x.despesas))), bw = 15, gap = W / 12;

  return (
    <div>
      <PageHeader title={`Olá, ${ctx.member.display_name}`} subtitle={`Resumo das finanças pessoais do ciclo de ${cycleLong(cycle).toLowerCase()}.`}>
        <CycleNav cycle={cycle} startDay={startDay} basePath="/" today={nowCycle} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label="Receitas" value={s.receitas} accent="#4f7a52" sub={<Delta cur={s.receitas} prev={p.receitas} prevLabel={cycleLabel(prevC)} />} />
        <Kpi label="Despesas" value={s.despesas} accent="#a33f30" sub={<Delta cur={s.despesas} prev={p.despesas} invert prevLabel={cycleLabel(prevC)} />} />
        <Kpi label="Investido" value={s.investimentos} accent="#4a5a73" sub={s.receitas ? `${formatPct(s.investimentos / s.receitas)} da receita` : "—"} />
        <Kpi label="Sobra do ciclo" value={s.saldo} accent={s.saldo >= 0 ? "#7d5f36" : "#a33f30"} sub={s.receitas ? `${formatPct(s.saldo / s.receitas)} da receita` : "—"} />
      </div>

      <section className="card mt-4 grid grid-cols-2 gap-4 !py-4 md:grid-cols-[1fr_1fr_1fr_1.2fr] md:gap-5 md:divide-x md:divide-ink/[0.06]">
        <div><div className="label">Recebido</div><div className="display text-[22px] leading-tight text-gain">{formatBRL(s.receitas)}</div><div className="text-xs text-ink/45">{aReceber ? <>+ <span className="tabular-nums">{formatBRL(aReceber)}</span> a receber</> : "nada mais previsto"}</div></div>
        <div className="md:pl-5"><div className="label">Pago</div><div className="display text-[22px] leading-tight">{formatBRL(pago)}</div><div className="text-xs text-ink/45">despesas e aportes do ciclo</div></div>
        <div className="md:pl-5"><div className="label">Falta pagar</div><div className={`display text-[22px] leading-tight ${aPagar ? "text-[#b0703f]" : ""}`}>{formatBRL(aPagar)}</div><div className="text-xs text-ink/45">contas da agenda em aberto</div></div>
        <div className="col-span-2 md:col-span-1 md:pl-5"><div className="label flex items-center gap-1.5">Saldo previsto no fim do ciclo</div><div className={`display text-[28px] leading-tight ${saldoPrev >= 0 ? "text-gain" : "text-loss"}`}>{formatBRL(saldoPrev)}</div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]"><div className="h-full rounded-full bg-[#7d5f36]" style={{ width: `${Math.min(100, ((pago) / Math.max(1, pago + aPagar)) * 100)}%` }} /></div>
          <div className="mt-1 text-[11px] text-ink/45">{pago + aPagar ? `${Math.round((pago / (pago + aPagar)) * 100)}% dos compromissos já pagos` : ""}</div></div>
      </section>

      <div className="mt-5 grid gap-4 xl:grid-cols-5">
        <section className="card xl:col-span-3">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2"><div><h2>Evolução do saldo</h2><p className="text-xs text-ink/45">Acumulado no ciclo · tracejado = previsto pela agenda</p></div>
            <div className="text-right"><div className="label !mb-0">Hoje</div><div className={`display text-[22px] ${evoNow >= 0 ? "text-gain" : "text-loss"}`}>{formatBRL(evoNow)}</div></div></div>
          <EvolutionChart points={evo} />
        </section>
        <section className="card xl:col-span-2">
          <div className="mb-3 flex items-baseline justify-between"><div><h2>Contas do ciclo</h2><p className="text-xs text-ink/45">Recorrentes da agenda</p></div><Link href="/agenda" className="text-sm text-brand hover:underline">Agenda →</Link></div>
          {contas.length === 0 ? <Empty icon="calendar">Nenhuma conta cadastrada. <Link className="font-medium text-brand" href="/agenda">Cadastre na agenda →</Link></Empty> : (<>
            <div className="mb-3 grid grid-cols-4 gap-2 rounded-xl bg-ink/[0.03] p-2.5 text-center text-xs">
              <div><div className="text-ink/45">Total</div><div className="font-semibold tabular-nums">{formatBRL(cnt.total).replace(/,\d{2}$/, "")}</div></div>
              <div><div className="text-ink/45">Pagas</div><div className="font-semibold text-gain">{cnt.pagas}</div></div>
              <div><div className="text-ink/45">Próximas</div><div className="font-semibold">{cnt.pend}</div></div>
              <div><div className="text-ink/45">Atrasadas</div><div className={`font-semibold ${cnt.atras ? "text-loss" : ""}`}>{cnt.atras}</div></div>
            </div>
            <div className="max-h-[300px] divide-y divide-ink/[0.05] overflow-y-auto pr-1">
              {contas.map((o) => {
                const st = occurrenceStatus(o, today), c = o.item.category_id ? byId.get(o.item.category_id) : undefined;
                return (
                  <Link key={o.key} href="/agenda" className="flex items-center gap-3 py-2 hover:bg-ink/[0.02]">
                    <CatIcon name={c?.name ?? o.item.name} grp={c?.grp ?? (o.event === "receita" ? "Receitas" : null)} color={c?.color} />
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{o.item.name}</div><div className="text-xs text-ink/45">{c?.name ?? eventLabel(o)} · dia {o.date.slice(8)}</div></div>
                    <div className="text-right"><div className={`text-sm tabular-nums ${o.event === "receita" ? "text-gain" : ""}`}>{o.amount ? formatBRL(o.amount) : "—"}</div>
                      <span className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ${st.cls}`}>{st.text}</span></div>
                  </Link>);
              })}
            </div>
          </>)}
        </section>
      </div>

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

      {(cards.length > 0 || caixinhas.length > 0 || seeInv) && (
        <div className={`mt-5 grid gap-4 ${sideCols === 3 ? "lg:grid-cols-3" : sideCols === 2 ? "lg:grid-cols-2" : ""}`}>
          {cards.length > 0 && (
            <section className="card">
              <div className="mb-3 flex items-baseline justify-between"><div><h2>Seus cartões</h2><p className="text-xs text-ink/45">Fatura deste ciclo e a próxima</p></div><Link href="/faturas" className="text-sm text-brand hover:underline">Faturas →</Link></div>
              <div className="space-y-3">{cards.slice(0, 4).map((c) => (
                <div key={c.id} className="rounded-2xl bg-gradient-to-br from-[#2a241e] to-[#191613] p-3.5 text-[#efe7da]">
                  <div className="flex items-center justify-between text-xs"><span className="font-medium">{c.name}</span><span className="tracking-[0.2em] text-[#efe7da]/50">•••• {c.last4 ?? ""}</span></div>
                  <div className="mt-2 flex items-end justify-between"><div><div className="text-[10px] uppercase tracking-[0.16em] text-gold/80">Fatura do ciclo</div><div className="display text-[22px] text-[#f6efe2]">{formatBRL(c.fat)}</div></div>
                    {c.next > 0 && <div className="text-right text-[11px] text-[#efe7da]/55">próxima<div className="tabular-nums text-[#efe7da]/80">{formatBRL(c.next)}</div></div>}</div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gold" style={{ width: `${((c.fat + c.next) / maxFat) * 100}%` }} /></div>
                  {(c.closing || c.due) && <div className="mt-1.5 flex justify-between text-[10.5px] text-[#efe7da]/45">{c.closing ? <span>Fecha dia {c.closing}</span> : <span />}{c.due ? <span>Vence dia {c.due}</span> : null}</div>}
                </div>))}</div>
            </section>)}
          {seeGoals && (
            <section className="card">
              <div className="mb-3 flex items-baseline justify-between"><div><h2>Cofrinhos</h2><p className="text-xs text-ink/45">Reserva e metas de poupança</p></div><Link href="/objetivos" className="text-sm text-brand hover:underline">Gerenciar →</Link></div>
              {caixinhas.length === 0 ? <Empty icon="target">Crie uma caixinha em <Link className="text-brand" href="/objetivos">Objetivos</Link>.</Empty> : (
                <div className="space-y-4">{caixinhas.slice(0, 4).map((g) => {
                  const bal = g.data.balance ?? 0, tgt = g.data.target ?? 0, pc = tgt ? Math.min(1, bal / tgt) : 0;
                  return (
                    <div key={g.id}>
                      <div className="flex items-center gap-3"><CatIcon name={g.name} grp="Investimentos" size="h-8 w-8 text-[15px]" />
                        <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{g.name}</div><div className="text-xs text-ink/45">{tgt ? `${Math.round(pc * 100)}% do objetivo` : "sem meta definida"}</div></div>
                        <div className="text-right"><div className="text-sm font-medium tabular-nums">{formatBRL(bal)}</div>{tgt ? <div className="text-[11px] tabular-nums text-ink/40">de {formatBRL(tgt).replace(/,\d{2}$/, "")}</div> : null}</div></div>
                      <div className="ml-11 mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]"><div className="h-full rounded-full" style={{ width: `${pc * 100}%`, background: pc >= 1 ? "#4f7a52" : "#b8955a" }} /></div>
                    </div>);
                })}</div>)}
            </section>)}
          {seeInv && (
            <section className="card">
              <div className="mb-3 flex items-baseline justify-between"><div><h2>Seus investimentos</h2><p className="text-xs text-ink/45">Carteira e aportes do ciclo</p></div><Link href="/investimentos" className="text-sm text-brand hover:underline">Abrir →</Link></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-ink/[0.03] p-3"><div className="label">Total aplicado</div><div className="display text-[22px]">{formatBRL(invCost)}</div><div className="text-[11px] text-ink/45">valor de custo</div></div>
                <div className="rounded-xl bg-ink/[0.03] p-3"><div className="label">Aporte no ciclo</div><div className="display text-[22px] text-gain">{formatBRL(s.investimentos)}</div><div className="text-[11px] text-ink/45">{s.receitas ? `${formatPct(s.investimentos / s.receitas)} da renda` : "—"}</div></div>
              </div>
              <div className="mt-3 flex gap-2 text-sm"><Link href="/mercado" className="btn-ghost flex-1 !py-1.5">Mercado</Link><Link href="/objetivos" className="btn-ghost flex-1 !py-1.5">Objetivos</Link></div>
            </section>)}
        </div>
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
                  <CatIcon name={x.cat!.name} grp={x.cat!.grp} color={x.cat!.color} size="h-8 w-8 text-[15px]" />
                  <div className="w-40 shrink-0 truncate text-sm">{x.cat!.name}<div className="text-[11px] text-ink/40">{x.cat!.grp}</div></div>
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
