import Link from "next/link";
import { requireArea } from "@/lib/context";
import { currentCycle, isValidCycle } from "@/lib/cycle";
import { categoryIndex, loadAccounts, loadCategories, loadMembers, loadTransactions } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import type { Scope } from "@/lib/categories-default";
import { buildTxViews, toCatLite, toMemberLite } from "@/lib/tx-view";
import { CycleNav, Empty, PageHeader, Pill, ScopeTabs } from "@/components/ui";
import { Icon } from "@/components/icons";
import { TxTable } from "@/components/tx-table";
import { createTransaction } from "./actions";

type SP = { ciclo?: string; escopo?: string; categoria?: string; q?: string };

export default async function LancamentosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireArea("lancamentos");
  const sp = await searchParams;
  const startDay = ctx.household.cycle_start_day;
  const scope: Scope = sp.escopo === "pj" ? "pj" : "pessoal";
  const cycle = isValidCycle(sp.ciclo) ? sp.ciclo : currentCycle(startDay);

  const [allCats, accounts, members, txsAll] = await Promise.all([
    loadCategories(ctx), loadAccounts(ctx), loadMembers(ctx), loadTransactions(ctx, { scope, cycles: [cycle] }),
  ]);
  const { byId } = categoryIndex(allCats);
  let txs = txsAll;
  if (sp.categoria === "a-classificar") txs = txs.filter((t) => !t.category_id || byId.get(t.category_id)?.grp === "A classificar");
  else if (sp.categoria) txs = txs.filter((t) => t.category_id === sp.categoria);
  if (sp.q) { const q = sp.q.toLowerCase(); txs = txs.filter((t) => t.description.toLowerCase().includes(q)); }

  const isIncome = (t: (typeof txs)[number]) => ((t.category_id && byId.get(t.category_id)?.kind) || t.kind) === "receita";
  const out = txs.filter((t) => !isIncome(t)).reduce((a, t) => a + Number(t.amount), 0);
  const inc = txs.filter(isIncome).reduce((a, t) => a + Number(t.amount), 0);
  const filterCat = sp.categoria && sp.categoria !== "a-classificar" ? byId.get(sp.categoria) : null;
  const rows = await buildTxViews(ctx, txs, accounts);
  const groups = [...new Set(allCats.filter((c) => c.active).map((c) => `${c.scope === "pj" ? "PJ · " : ""}${c.grp}`))];

  return (
    <div>
      <PageHeader title="Lançamentos" subtitle="Tudo o que entrou e saiu no ciclo. Clique em um lançamento para ver os detalhes e mudar o perfil do gasto.">
        <ScopeTabs scope={scope} basePath="/lancamentos" params={{ ciclo: cycle }} />
        <CycleNav cycle={cycle} startDay={startDay} basePath="/lancamentos" params={{ escopo: scope, categoria: sp.categoria, q: sp.q }} />
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action="/lancamentos" className="relative">
          <input type="hidden" name="escopo" value={scope} /><input type="hidden" name="ciclo" value={cycle} />
          {sp.categoria && <input type="hidden" name="categoria" value={sp.categoria} />}
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35"><Icon name="search" /></span>
          <input className="input w-72 pl-9" name="q" defaultValue={sp.q} placeholder="Buscar estabelecimento…" />
        </form>
        <Link className={`btn-ghost ${sp.categoria === "a-classificar" ? "!border-orange-300 !bg-orange-50 !text-orange-800" : ""}`} href={`/lancamentos?escopo=${scope}&ciclo=${cycle}&categoria=a-classificar`}>Só a classificar</Link>
        {filterCat ? <span className="inline-flex items-center gap-1"><Pill cat={filterCat} /><Link className="text-ink/40 hover:text-ink" href={`/lancamentos?escopo=${scope}&ciclo=${cycle}`}><Icon name="x" /></Link></span>
          : (sp.q || sp.categoria) && <Link className="btn-ghost" href={`/lancamentos?escopo=${scope}&ciclo=${cycle}`}>Limpar filtros</Link>}
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="text-ink/50">{txs.length} itens</span>
          <span>Saídas <b className="tabular-nums">{formatBRL(out)}</b></span>
          {inc > 0 && <span>Entradas <b className="tabular-nums text-gain">{formatBRL(inc)}</b></span>}
        </div>
      </div>

      <details className="card mb-4">
        <summary className="cursor-pointer text-sm font-medium text-brand">+ Novo lançamento</summary>
        <form action={createTransaction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input type="hidden" name="scope" value={scope} />
          <div><label className="label">Data</label><input className="input" type="date" name="date" defaultValue={`${cycle}-15`} required /></div>
          <div className="lg:col-span-2"><label className="label">Descrição</label><input className="input" name="description" required placeholder="Ex.: Supermercado Sonda" /></div>
          <div><label className="label">Valor (R$)</label><input className="input" name="amount" inputMode="decimal" required placeholder="0,00" /></div>
          <div className="lg:col-span-2"><label className="label">Categoria</label>
            <select className="input" name="category_id" defaultValue="">
              <option value="">A classificar</option>
              {groups.map((g) => <optgroup key={g} label={g}>{allCats.filter((c) => c.active && `${c.scope === "pj" ? "PJ · " : ""}${c.grp}` === g).map((c) => <option key={c.id} value={c.id}>{c.subgroup ? `${c.name} · ${c.subgroup}` : c.name}</option>)}</optgroup>)}
            </select>
          </div>
          <div><label className="label">Conta / cartão</label><select className="input" name="account_id" defaultValue=""><option value="">—</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div><label className="label">Quem</label><select className="input" name="member_user_id" defaultValue={ctx.user.id}>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></div>
          <div><label className="label">Parcelas</label><input className="input" type="number" name="installments" min={1} max={48} defaultValue={1} /></div>
          <div className="lg:col-span-2"><label className="label">Observação</label><input className="input" name="notes" /></div>
          <div className="flex items-end"><button className="btn w-full">Salvar</button></div>
        </form>
        <p className="mt-3 text-xs text-ink/40">Receitas: escolha uma categoria do grupo Receitas. Parcelado: o valor é dividido e lançado nos ciclos seguintes.</p>
      </details>

      {rows.length === 0 ? <Empty>Nenhum lançamento neste ciclo. <Link className="font-medium text-brand" href="/faturas/importar">Importe uma fatura →</Link></Empty> : (
        <div className="card overflow-x-auto p-0">
          <TxTable rows={rows} cats={toCatLite(allCats)} members={toMemberLite(members)} cycleStartDay={startDay} />
        </div>
      )}
    </div>
  );
}
