import Link from "next/link";
import { canEdit, requireArea } from "@/lib/context";
import { GOAL_T, goalCalc, reserveTarget, type Goal, type GoalType } from "@/lib/goals";
import { summary, type Dividend, type Fixed, type Op } from "@/lib/invest";
import { getMacro, getQuotes, ipcaRef } from "@/lib/market/read";
import { yahooSymbol } from "@/lib/market/sources";
import { categoryIndex, loadCategories, loadTransactions } from "@/lib/data";
import { currentCycle, shiftCycle, todayIso } from "@/lib/cycle";
import { formatBRL, formatPct } from "@/lib/format";
import { Bar, Empty, PageHeader, Seg, cycleLong } from "@/components/ui";
import { Icon } from "@/components/icons";
import { deleteGoal, patchGoal, saveGoal } from "./actions";

const brl0 = (v: number) => formatBRL(v).replace(/,\d\d$/, "");
function LineChart({ series, target, color }: { series: number[]; target?: number | null; color: string }) {
  const W = 520, H = 120, max = Math.max(target || 0, ...series) * 1.05 || 1, x = (k: number) => 6 + (k / Math.max(1, series.length - 1)) * (W - 12), y = (v: number) => H - 6 - (v / max) * (H - 12);
  const d = series.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {target ? <line x1="6" x2={W - 6} y1={y(target)} y2={y(target)} stroke={color} strokeDasharray="4 4" strokeOpacity=".6" /> : null}
      <path d={`${d}L${x(series.length - 1)},${H - 6}L6,${H - 6}Z`} fill={color} fillOpacity=".08" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}
function Inline({ id, field, value, edit, width = "w-28" }: { id: string; field: string; value: number; edit: boolean; width?: string }) {
  if (!edit) return <b>{formatBRL(value)}</b>;
  return (
    <form action={patchGoal} className="inline-flex items-center gap-1"><input type="hidden" name="id" value={id} /><input type="hidden" name="field" value={field} />
      <input className={`${width} rounded border border-ink/10 px-1 text-right`} name="value" defaultValue={value.toLocaleString("pt-BR")} /><button className="text-brand">ok</button></form>
  );
}

export default async function GoalsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireArea("objetivos");
  const sp = await searchParams, edit = canEdit(ctx, "objetivos"), hh = ctx.household.id;
  const now = currentCycle(ctx.household.cycle_start_day);
  const [{ data: goalsD }, cats, txs] = await Promise.all([
    ctx.supabase.from("goals").select("*").eq("household_id", hh).order("sort").order("created_at"),
    loadCategories(ctx, "pessoal"),
    loadTransactions(ctx, { scope: "pessoal", cycles: [0, 1, 2, 3, 4, 5].map((k) => shiftCycle(now, -k)) }),
  ]);
  const goals = (goalsD ?? []) as Goal[];
  // patrimônio da carteira (se o membro puder ver investimentos; senão, só os valores informados)
  let portfolio = 0;
  if (goals.some((g) => g.type === "patrimonio")) {
    const [{ data: ops }, { data: fixed }, { data: st }] = await Promise.all([
      ctx.supabase.from("inv_ops").select("*").eq("household_id", hh), ctx.supabase.from("inv_fixed").select("*").eq("household_id", hh), ctx.supabase.from("inv_settings").select("manual_quotes").eq("household_id", hh).maybeSingle(),
    ]);
    const o = (ops ?? []) as Op[], tickers = [...new Set(o.map((x) => x.ticker))], sym = (t: string) => yahooSymbol(t, o.find((x) => x.ticker === t)?.cls);
    const [macro, q] = await Promise.all([getMacro(ctx), getQuotes(ctx, tickers.map(sym))]);
    const manual = (st?.manual_quotes ?? {}) as Record<string, number>;
    portfolio = summary(o, (fixed ?? []) as Fixed[], [] as Dividend[], Object.fromEntries(tickers.map((t) => [t, manual[t] ?? q[sym(t)]?.price ?? null])), macro.cdi, ipcaRef(macro), todayIso()).total;
  }
  const { byId } = categoryIndex(cats);
  const reserve = reserveTarget(txs, byId as unknown as Map<string, { kind: string; grp: string; excluded_from_totals: boolean }>, now);
  const ed = sp.editar ? goals.find((g) => g.id === sp.editar) : null;
  const nt = (ed?.type ?? (sp.tipo as GoalType) ?? "caixinha") as GoalType;
  const F = ({ n, l, v, type = "text", req }: { n: string; l: string; v?: string | number | null; type?: string; req?: boolean }) => (
    <div><label className="label">{l}</label><input className="input" name={n} type={type} defaultValue={v == null ? "" : String(v)} required={req} /></div>
  );

  return (
    <div>
      <PageHeader title="Objetivos" subtitle="Metas com prazo, independência financeira e caixinhas. A plataforma calcula quanto aportar por mês." />
      {goals.length === 0 && <div className="card mb-5"><Empty icon="target">Nenhum objetivo ainda. Crie o primeiro abaixo.</Empty></div>}
      <div className="grid gap-4 xl:grid-cols-2">
        {goals.map((g) => {
          const T = GOAL_T[g.type], c = goalCalc(g, now, portfolio, reserve), d = g.data;
          return (
            <article key={g.id} className="card relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: T.c }} />
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: T.c }}><Icon name={T.i} className="h-5 w-5" /></div>
                  <div><div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: T.c }}>{T.l}</div><h2>{g.name}</h2>{d.note && <div className="text-xs text-ink/45">{d.note}</div>}</div></div>
                {edit && <div className="flex gap-2 text-xs"><Link className="text-ink/45 hover:text-ink" href={`/objetivos?editar=${g.id}`}>Editar</Link><form action={deleteGoal}><input type="hidden" name="id" value={g.id} /><button className="text-ink/35 hover:text-loss">Remover</button></form></div>}
              </div>
              {c.kind === "fi" ? (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-ink/[0.03] p-3"><div className="label">Renda de {brl0(d.income ?? 0)}/mês</div><div className="text-lg font-semibold">{c.renda ? cycleLong(c.renda.m) : "—"}</div><div className="text-xs text-ink/50">{c.ageR ? `aos ${c.ageR} anos · ` : ""}patrimônio de {brl0(c.rendaAlvo)}</div></div>
                    <div className="rounded-xl bg-ink/[0.03] p-3"><div className="label">{d.multiple}× a renda</div><div className="text-lg font-semibold">{c.mult ? cycleLong(c.mult.m) : "—"}</div><div className="text-xs text-ink/50">{c.ageM ? `aos ${c.ageM} anos · ` : ""}{brl0(c.goal)}</div></div>
                  </div>
                  <div className="mt-3"><LineChart series={c.series} target={c.goal} color={T.c} /></div>
                  <p className="text-xs text-ink/50">Aporte inicial {brl0(d.initial ?? 0)}, {String(d.rate ?? 1).replace(".", ",")}% a.m. Aporte mensal: <Inline id={g.id} field="monthly" value={d.monthly ?? 0} edit={edit} width="w-24" /></p>
                </>
              ) : (
                <>
                  <div className="flex items-end justify-between gap-3">
                    <div><div className="text-[26px] font-semibold tabular-nums">{formatBRL(c.current)}</div><div className="text-xs text-ink/50">de {c.target ? formatBRL(c.target) : "—"}{d.auto === "reserva" ? " (6× seu custo essencial)" : ""}</div></div>
                    <div className="text-right"><div className="text-2xl font-semibold tabular-nums" style={{ color: T.c }}>{formatPct(Math.min(1, c.pct))}</div><span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${c.onTrack ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{c.onTrack ? "no ritmo" : "atrás do ritmo"}</span></div>
                  </div>
                  <div className="mt-3"><Bar value={c.current} max={c.target || 1} color={T.c} /></div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-ink/[0.03] p-2"><div className="text-ink/50">Prazo</div><div className="font-semibold">{d.deadline ? cycleLong(d.deadline) : "—"}</div><div className="text-ink/40">{c.n} meses</div></div>
                    <div className="rounded-lg bg-ink/[0.03] p-2"><div className="text-ink/50">Precisa por mês</div><div className="font-semibold" style={{ color: T.c }}>{brl0(c.need)}</div><div className="text-ink/40">{g.type === "patrimonio" ? `a ${String(d.rate ?? 1).replace(".", ",")}% a.m.` : "a ~100% CDI"}</div></div>
                    <div className="rounded-lg bg-ink/[0.03] p-2"><div className="text-ink/50">{g.type === "patrimonio" ? "Esperado hoje" : "No ritmo atual"}</div><div className="font-semibold">{g.type === "patrimonio" ? brl0(c.expected ?? 0) : c.monthsAtPace != null ? `${c.monthsAtPace} meses` : "—"}</div></div>
                  </div>
                  {g.type === "patrimonio" ? (
                    <>{c.series && <div className="mt-3"><LineChart series={c.series} target={c.target} color={T.c} /></div>}
                      <p className="text-xs text-ink/50">Usa o patrimônio da aba Investimentos ({brl0(portfolio)}). Outros valores fora da carteira: <Inline id={g.id} field="extra" value={d.extra ?? 0} edit={edit} /></p></>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs"><span className="text-ink/50">Saldo atual:</span><Inline id={g.id} field="balance" value={d.balance ?? 0} edit={edit} /><span className="text-ink/50">Aporte/mês:</span><Inline id={g.id} field="monthly" value={d.monthly ?? 0} edit={edit} width="w-24" /></div>
                  )}
                  {d.auto === "reserva" && !reserve && <p className="mt-2 text-xs text-amber-700">O alvo da reserva aparece depois de 1 ciclo com pelo menos 5 despesas lançadas.</p>}
                </>
              )}
            </article>
          );
        })}
      </div>

      {edit && (
        <section className="card mt-5 max-w-3xl">
          <h2 className="mb-3">{ed ? "Editar objetivo" : "Novo objetivo"}</h2>
          {!ed && <div className="mb-3"><Seg options={[["patrimonio", "Meta de patrimônio"], ["caixinha", "Caixinha"], ["independencia", "Independência financeira"]]} current={nt} hrefFor={(v) => `/objetivos?tipo=${v}`} /></div>}
          <form action={saveGoal} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="type" value={nt} />{ed && <input type="hidden" name="id" value={ed.id} />}
            <F n="name" l="Nome" v={ed?.name} req />
            {nt === "independencia" ? (<>
              <F n="income" l="Renda desejada (R$/mês)" v={ed?.data.income ?? 30000} />
              <F n="multiple" l="Múltiplo (× renda)" v={ed?.data.multiple ?? 300} />
              <F n="initial" l="Aporte inicial" v={ed?.data.initial ?? 0} />
              <F n="monthly" l="Aporte mensal" v={ed?.data.monthly ?? 1000} />
              <F n="rate" l="Rentabilidade (% a.m.)" v={String(ed?.data.rate ?? 1).replace(".", ",")} />
              <F n="birth" l="Seu mês de nascimento" v={ed?.data.birth} type="month" />
            </>) : (<>
              {nt === "caixinha" && <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="auto" defaultChecked={ed?.data.auto === "reserva"} /> É a reserva de emergência (alvo automático)</label>}
              <F n="target" l="Valor alvo (R$)" v={ed?.data.target} />
              <F n="deadline" l="Prazo" v={ed?.data.deadline ?? shiftCycle(now, 12)} type="month" />
              {nt === "patrimonio" ? <F n="rate" l="Rentabilidade esperada (% a.m.)" v={String(ed?.data.rate ?? 1).replace(".", ",")} /> : (<>
                <F n="balance" l="Já guardado (R$)" v={ed?.data.balance ?? 0} />
                <F n="monthly" l="Aporte mensal (R$)" v={ed?.data.monthly ?? 0} />
              </>)}
            </>)}
            <div className="flex items-end gap-2 sm:col-span-3">{ed && <Link className="btn-ghost" href="/objetivos">Cancelar</Link>}<button className="btn">{ed ? "Salvar" : "Criar objetivo"}</button></div>
          </form>
        </section>
      )}
    </div>
  );
}
