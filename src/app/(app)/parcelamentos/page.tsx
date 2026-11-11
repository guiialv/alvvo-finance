import Link from "next/link";
import { requireArea } from "@/lib/context";
import { currentCycle, cycleLabel, isValidCycle, shiftCycle } from "@/lib/cycle";
import { fetchAll, loadAccounts, loadCategories, loadMembers, type Transaction } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { buildInstallmentPlans, totalsByCycle, type InstallmentTx } from "@/lib/installments";
import { buildTxViews, toCatLite, toMemberLite } from "@/lib/tx-view";
import { cycleLong, Empty, Kpi, PageHeader, Seg } from "@/components/ui";
import { Icon } from "@/components/icons";
import { InstallmentMatrix, type PlanRow } from "./matrix";

type SP = { de?: string; ver?: string };

export default async function ParcelamentosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireArea("parcelamentos");
  const sp = await searchParams;
  const current = currentCycle(ctx.household.cycle_start_day);
  const start = isValidCycle(sp.de) ? sp.de : shiftCycle(current, -2);
  const cycles = Array.from({ length: 12 }, (_, i) => shiftCycle(start, i));
  const showAll = sp.ver === "todas";

  const [cats, accounts, members, txRes] = await Promise.all([
    loadCategories(ctx), loadAccounts(ctx), loadMembers(ctx),
    fetchAll(() => ctx.supabase.from("transactions").select("*").eq("household_id", ctx.household.id).not("installment_total", "is", null).gt("installment_total", 1)).then((data) => ({ data })),
  ]);
  const txs = (txRes.data ?? []) as Transaction[];
  const all = buildInstallmentPlans(txs as unknown as InstallmentTx[], current);
  const open = all.filter((p) => p.remainingCount > 0);
  const plans = showAll ? all : open;
  const accName = new Map(accounts.map((a) => [a.id, a.name] as [string, string]));

  const totals = totalsByCycle(plans, cycles);
  const curTotal = totalsByCycle(open, [current])[0];
  const nextTotal = totalsByCycle(open, [shiftCycle(current, 1)])[0];
  const future = open.reduce((a, p) => a + p.remaining, 0);
  const lastCycle = open.reduce((m, p) => (p.lastCycle > m ? p.lastCycle : m), current);
  const max = Math.max(1, ...totals);

  const latestIds = new Set(plans.map((p) => p.latestTxId));
  const viewsArr = await buildTxViews(ctx, txs.filter((t) => latestIds.has(t.id)), accounts);
  const views = Object.fromEntries(viewsArr.map((v) => [v.id, v]));
  const rows: PlanRow[] = plans.map((p) => ({
    key: p.key, description: p.description, purchaseDate: p.purchaseDate, installmentAmount: p.installmentAmount, total: p.total,
    installmentTotal: p.installmentTotal, category_id: p.category_id, account_name: p.account_id ? accName.get(p.account_id) ?? null : null,
    member_user_id: p.member_user_id, notes: p.notes, latestTxId: p.latestTxId, cells: Object.fromEntries(p.schedule),
    remaining: p.remaining, remainingCount: p.remainingCount, lastCycle: p.lastCycle, currentN: p.schedule.get(current)?.n ?? null,
  }));

  const nav = (
    <div className="inline-flex items-center rounded-xl border border-ink/10 bg-white shadow-sm">
      <Link className="grid h-10 w-9 place-items-center text-ink/50 hover:text-ink" href={`/parcelamentos?de=${shiftCycle(start, -6)}${showAll ? "&ver=todas" : ""}`}><Icon name="left" /></Link>
      <Link className="border-x border-ink/5 px-3 py-2 text-sm font-semibold" href={`/parcelamentos${showAll ? "?ver=todas" : ""}`}>Hoje</Link>
      <Link className="grid h-10 w-9 place-items-center text-ink/50 hover:text-ink" href={`/parcelamentos?de=${shiftCycle(start, 6)}${showAll ? "&ver=todas" : ""}`}><Icon name="right" /></Link>
    </div>
  );

  return (
    <div>
      <PageHeader title="Parcelamentos" subtitle="Compras parceladas que ainda estão no cartão, mês a mês, com a projeção das próximas faturas. Clique em uma compra para dizer a que ela se refere ou mudar o perfil.">
        <Seg options={[["abertas", `Em aberto (${open.length})`], ["todas", `Todas (${all.length})`]]} current={showAll ? "todas" : "abertas"} hrefFor={(v) => `/parcelamentos?de=${start}${v === "todas" ? "&ver=todas" : ""}`} />
        {nav}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={`Neste ciclo (${cycleLabel(current)})`} value={curTotal} accent="#7d5f36" sub="parcelas na fatura atual" />
        <Kpi label={`Próximo ciclo (${cycleLabel(shiftCycle(current, 1))})`} value={nextTotal} accent="#b8955a" sub="já comprometido" />
        <Kpi label="Total a vencer" value={future} accent="#a33f30" sub={`${open.length} compras em aberto`} />
        <div className="card relative overflow-hidden"><div className="absolute inset-x-0 top-0 h-0.5 bg-[#4a5a73]" /><div className="label">Cartão livre de parcelas em</div><div className="mt-1 text-[26px] font-semibold tracking-tight">{open.length ? cycleLong(shiftCycle(lastCycle, 1)) : "—"}</div><div className="mt-1 text-xs text-ink/45">se nenhuma compra nova for parcelada</div></div>
      </div>

      {all.length === 0 ? (
        <div className="mt-5"><Empty icon="layers">Nenhuma compra parcelada ainda. Elas aparecem aqui ao <Link className="font-medium text-brand" href="/faturas/importar">importar uma fatura</Link> ou lançar um gasto parcelado.</Empty></div>
      ) : (
        <>
          <section className="card mt-5">
            <div className="mb-3 flex items-center justify-between"><h2>Comprometido por fatura</h2><div className="flex gap-3 text-xs text-ink/50"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-ink/20" />passadas</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-brand" />atual</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-500/70" />projetadas</span></div></div>
            <div className="flex h-44 items-end gap-2">
              {cycles.map((c, i) => {
                const v = totals[i];
                const col = c < current ? "bg-ink/20" : c === current ? "bg-brand" : "bg-amber-500/70";
                return (
                  <div key={c} className="flex flex-1 flex-col items-center gap-1">
                    <div className="text-[10px] tabular-nums text-ink/50">{v ? (v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k` : Math.round(v)) : ""}</div>
                    <div className={`w-full rounded-md ${col}`} style={{ height: `${(v / max) * 120}px` }} title={`${cycleLabel(c)}: ${formatBRL(v)}`} />
                    <div className={`text-[11px] ${c === current ? "font-semibold text-brand" : "text-ink/50"}`}>{cycleLabel(c).slice(0, 3)}<span className="text-ink/30">/{c.slice(2, 4)}</span></div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card mt-5 overflow-x-auto p-0">
            <InstallmentMatrix plans={rows} cycles={cycles} current={current} totals={totals} cats={toCatLite(cats)} members={toMemberLite(members)} views={views} cycleStartDay={ctx.household.cycle_start_day} />
          </section>
          <p className="mt-3 text-xs text-ink/45">Valores em itálico são projetados a partir da última fatura importada; viram reais quando a fatura do mês chega. Parcelas passadas aparecem em cinza.</p>
        </>
      )}
    </div>
  );
}
