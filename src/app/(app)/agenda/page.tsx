import Link from "next/link";
import { requireArea } from "@/lib/context";
import { shiftCycle, todayIso } from "@/lib/cycle";
import { addDays, eventLabel, lastDayOf, WEEKDAYS } from "@/lib/agenda";
import { loadAgenda } from "@/lib/agenda-data";
import { loadCategories, loadMembers } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { AGENDA_COLOR } from "@/lib/theme";
import { Empty, Kpi, PageHeader, Seg } from "@/components/ui";
import { Icon } from "@/components/icons";
import { deleteAgendaItem, saveAgendaItem } from "./actions";
import { OccRow } from "./occ-row";

const MESES_L = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const TYPE_LABEL = { cartao: "Cartão de crédito", conta: "Conta a pagar", receita: "Receita" } as const;

type SP = { mes?: string; tipo?: string; editar?: string };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireArea("agenda");
  const sp = await searchParams;
  const today = todayIso();
  const ym = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : today.slice(0, 7);
  const [Y, M] = ym.split("-").map(Number);
  const monthEnd = `${ym}-${String(lastDayOf(Y, M)).padStart(2, "0")}`;
  const from = [addDays(today, -60), `${ym}-01`].sort()[0];
  const to = [addDays(today, 30), monthEnd].sort()[1];

  const [{ items, occ }, cats, members] = await Promise.all([loadAgenda(ctx, from, to), loadCategories(ctx), loadMembers(ctx)]);
  const monthOcc = occ.filter((o) => o.date >= `${ym}-01` && o.date <= monthEnd);
  const next = occ.filter((o) => o.date >= today && o.date <= addDays(today, 30));
  const overdue = occ.filter((o) => o.date < today && !o.paid && o.event !== "fechamento");
  const pagar = monthOcc.filter((o) => o.event === "conta" || o.event === "vencimento").reduce((a, o) => a + (o.amount ?? 0), 0);
  const receber = monthOcc.filter((o) => o.event === "receita").reduce((a, o) => a + (o.amount ?? 0), 0);
  const first = new Date(Date.UTC(Y, M - 1, 1)).getUTCDay();
  const cells: (number | null)[] = [...Array.from({ length: first }, () => null), ...Array.from({ length: lastDayOf(Y, M) }, (_, i) => i + 1)];

  const edit = sp.editar ? items.find((i) => i.id === sp.editar) : undefined;
  const type = (edit?.type ?? (["cartao", "conta", "receita"].includes(sp.tipo ?? "") ? sp.tipo : "conta")) as keyof typeof TYPE_LABEL;
  const memberName = new Map(members.map((m) => [m.user_id, m.display_name] as [string, string]));
  const catName = new Map(cats.map((c) => [c.id, c.name] as [string, string]));
  const catGroups = [...new Set(cats.filter((c) => c.active).map((c) => `${c.scope === "pj" ? "PJ · " : ""}${c.grp}`))];

  return (
    <div>
      <PageHeader title="Agenda financeira" subtitle="Datas de fechamento e vencimento dos cartões, contas a pagar e receitas. Marque como pago para registrar o lançamento automaticamente.">
        <div className="inline-flex items-center rounded-xl border border-ink/10 bg-white shadow-sm">
          <Link className="grid h-10 w-9 place-items-center text-ink/50" href={`/agenda?mes=${shiftCycle(ym, -1)}`}><Icon name="left" /></Link>
          <span className="min-w-[130px] px-3 text-center text-sm font-semibold">{MESES_L[M - 1]} {Y}</span>
          <Link className="grid h-10 w-9 place-items-center text-ink/50" href={`/agenda?mes=${shiftCycle(ym, 1)}`}><Icon name="right" /></Link>
        </div>
      </PageHeader>

      {overdue.length > 0 && (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-rose-800"><Icon name="bell" /> {overdue.length} pendência(s) em atraso</div>
          <div className="divide-y divide-rose-100">{overdue.map((o) => <OccRow key={o.key} o={o} today={today} />)}</div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="A pagar no mês" value={pagar} sub="contas + faturas previstas" accent="#e11d48" />
        <Kpi label="A receber no mês" value={receber} sub="receitas cadastradas" accent="#15803d" />
        <Kpi label="Saldo previsto" value={receber - pagar} sub="antes dos gastos variáveis" accent="#0f766e" />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_380px]">
        <section className="card">
          <div className="mb-3 grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wider text-ink/40">{WEEKDAYS.map((d) => <div key={d}>{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const iso = `${ym}-${String(d).padStart(2, "0")}`;
              const evs = monthOcc.filter((o) => o.date === iso);
              const isToday = iso === today;
              return (
                <div key={i} className={`min-h-[86px] rounded-xl border p-1.5 ${isToday ? "border-brand bg-brand/[0.04]" : "border-ink/[0.06]"}`}>
                  <div className={`mb-1 text-xs font-semibold ${isToday ? "text-brand" : "text-ink/45"}`}>{d}</div>
                  {evs.map((o) => (
                    <div key={o.key} title={`${o.item.name} — ${eventLabel(o)}`} className={`mb-0.5 truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium ${o.paid ? "line-through opacity-50" : ""}`}
                      style={{ background: `${AGENDA_COLOR[o.item.type]}14`, color: AGENDA_COLOR[o.item.type] }}>
                      {o.event === "fechamento" ? "⟂ " : o.event === "vencimento" ? "$ " : ""}{o.item.name}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink/50">
            {(Object.keys(TYPE_LABEL) as (keyof typeof TYPE_LABEL)[]).map((t) => <span key={t} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: AGENDA_COLOR[t] }} />{TYPE_LABEL[t]}</span>)}
            <span>⟂ fechamento · $ vencimento</span>
          </div>
        </section>
        <section className="card">
          <h2 className="mb-1">Próximos 30 dias</h2>
          {next.length ? <div className="divide-y divide-ink/5">{next.map((o) => <OccRow key={o.key} o={o} today={today} />)}</div> : <Empty icon="calendar">Nada agendado.</Empty>}
        </section>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_420px]">
        <section className="card overflow-x-auto p-0">
          <h2 className="px-5 pt-4">Cadastros</h2>
          {items.length === 0 ? <div className="p-5"><Empty icon="calendar">Cadastre cartões, contas e receitas para montar sua agenda.</Empty></div> : (
            <table className="table mt-2 min-w-[620px]">
              <thead><tr><th>Item</th><th>Tipo</th><th>Datas</th><th className="num">Valor previsto</th><th></th></tr></thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td><div className="font-medium">{a.name}</div><div className="text-xs text-ink/45">{[a.category_id && catName.get(a.category_id), a.member_user_id && memberName.get(a.member_user_id), a.card_last4 && `final ${a.card_last4}`, a.notes].filter(Boolean).join(" · ")}</div></td>
                    <td><span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: AGENDA_COLOR[a.type] }}><span className="h-2 w-2 rounded-full" style={{ background: AGENDA_COLOR[a.type] }} />{TYPE_LABEL[a.type]}</span></td>
                    <td>{a.type === "cartao" ? <>fecha dia <b>{a.closing_day}</b> · vence dia <b>{a.due_day}</b></> : <>{a.type === "receita" ? "recebe" : "vence"} dia <b>{a.due_day}</b></>}</td>
                    <td className="num">{a.amount != null ? formatBRL(a.amount) : a.type === "cartao" ? <span className="text-ink/40">pela fatura</span> : "—"}</td>
                    <td className="num whitespace-nowrap">
                      <Link className="text-xs text-ink/50 hover:text-ink" href={`/agenda?mes=${ym}&editar=${a.id}`}>Editar</Link>
                      <form action={deleteAgendaItem} className="ml-3 inline"><input type="hidden" name="id" value={a.id} /><button className="text-xs text-ink/40 hover:text-loss">Remover</button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h2 className="mb-3">{edit ? "Editar item" : "Novo item"}</h2>
          {!edit && <div className="mb-3"><Seg options={[["cartao", "Cartão"], ["conta", "Conta a pagar"], ["receita", "Receita"]]} current={type} hrefFor={(t) => `/agenda?mes=${ym}&tipo=${t}`} /></div>}
          <form action={saveAgendaItem} className="space-y-3" key={edit?.id ?? type}>
            <input type="hidden" name="id" value={edit?.id ?? ""} />
            <input type="hidden" name="type" value={type} />
            <div><label className="label">Nome</label><input className="input" name="name" required defaultValue={edit?.name ?? ""} placeholder={type === "cartao" ? "Ex.: Itaú Personnalité" : type === "receita" ? "Ex.: Salário, aluguel recebido" : "Ex.: Condomínio, luz, internet, IPVA"} /></div>
            {type === "cartao" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Dia de fechamento</label><input className="input" type="number" min={1} max={31} name="closing_day" required defaultValue={edit?.closing_day ?? ""} /></div>
                  <div><label className="label">Dia de vencimento</label><input className="input" type="number" min={1} max={31} name="due_day" required defaultValue={edit?.due_day ?? ""} /></div>
                </div>
                <div><label className="label">Final do cartão</label><input className="input" name="card_last4" defaultValue={edit?.card_last4 ?? ""} placeholder="1617 ou vazio para todos" /></div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">{type === "receita" ? "Dia do recebimento" : "Dia do vencimento"}</label><input className="input" type="number" min={1} max={31} name="due_day" required defaultValue={edit?.due_day ?? ""} /></div>
                  <div><label className="label">Valor previsto</label><input className="input" name="amount" inputMode="decimal" placeholder="0,00" defaultValue={edit?.amount != null ? Number(edit.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""} /></div>
                </div>
                <div><label className="label">Categoria (ao marcar como {type === "receita" ? "recebido" : "pago"})</label>
                  <select className="input" name="category_id" defaultValue={edit?.category_id ?? ""}>
                    <option value="">A classificar</option>
                    {catGroups.map((g) => (
                      <optgroup key={g} label={g}>{cats.filter((c) => c.active && `${c.scope === "pj" ? "PJ · " : ""}${c.grp}` === g).map((c) => <option key={c.id} value={c.id}>{c.subgroup ? `${c.name} · ${c.subgroup}` : c.name}</option>)}</optgroup>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">De quem</label><select className="input" name="member_user_id" defaultValue={edit?.member_user_id ?? ctx.user.id}>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></div>
              <div><label className="label">Observação</label><input className="input" name="notes" defaultValue={edit?.notes ?? ""} /></div>
            </div>
            <div className="flex gap-2 pt-1">
              {edit && <Link className="btn-ghost" href={`/agenda?mes=${ym}`}>Cancelar</Link>}
              <button className="btn flex-1">{edit ? "Salvar" : "Adicionar à agenda"}</button>
            </div>
          </form>
          <p className="mt-3 text-xs text-ink/45">
            {type === "cartao"
              ? "A fatura entra no ciclo do vencimento. O dia seguinte ao fechamento é o melhor dia de compra. Pagar a fatura não gera despesa nova: os gastos já entram item a item."
              : "Ao marcar como pago, o lançamento é criado no ciclo da data, com a categoria escolhida. Dá para ajustar o valor depois em Lançamentos."}
          </p>
        </section>
      </div>
    </div>
  );
}
