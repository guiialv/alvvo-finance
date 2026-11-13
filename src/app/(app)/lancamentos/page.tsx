import Link from "next/link";
import { requireArea } from "@/lib/context";
import { currentCycle, isValidCycle } from "@/lib/cycle";
import { categoryIndex, fetchAll, loadAccounts, loadCategories, loadMembers, loadTransactions, type Transaction } from "@/lib/data";
import { toCashView } from "@/lib/cash-flow";
import { formatBRL } from "@/lib/format";
import type { Scope } from "@/lib/categories-default";
import { buildTxViews, toCatLite, toMemberLite } from "@/lib/tx-view";
import { CycleNav, Empty, PageHeader, Pill, ScopeTabs } from "@/components/ui";
import { Icon } from "@/components/icons";
import { TxTable } from "@/components/tx-table";
import { createTransaction } from "./actions";

type SP = { ciclo?: string; escopo?: string; categoria?: string; q?: string; novo?: string; origem?: string };

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
  type T = Transaction & { flow?: "entrada" | "saida" | null; reconciled_batch_id?: string | null };
  const cardIds = new Set(accounts.filter((a) => a.type === "cartao").map((a) => a.id));
  const isCard = (t: T) => (t.account_id ? cardIds.has(t.account_id) : false) || t.source === "fatura" || (!!t.import_batch_id && t.source !== "extrato");
  const isPayment = (t: T) => !!t.category_id && byId.get(t.category_id)?.name === "Pagamento de fatura";

  // Critério de caixa (igual a Visão geral, Orçamento e Fluxo): com extrato no ciclo, as compras no cartão que aparecem
  // são as das faturas PAGAS neste ciclo (consumo do mês anterior), cada uma na sua categoria — e o pagamento da fatura
  // fica na lista só como referência, sem somar de novo. Sem extrato no ciclo, vale a fatura que vence no ciclo.
  const raw = txsAll as T[];
  const hasExtrato = raw.some((t) => t.source === "extrato");
  let base: T[] = raw;
  const factor = new Map<string, number>(); // fatura -> valor pago / total das compras (pagamento parcial)
  const openedPay = new Set<string>();
  if (hasExtrato) {
    await toCashView(ctx, raw, allCats.filter((c) => c.scope === scope), [cycle]); // liga pagamentos antecipados à fatura
    const pays = raw.filter((t) => t.source === "extrato" && isPayment(t) && (t.flow ?? "saida") === "saida" && t.reconciled_batch_id);
    const ids = [...new Set(pays.map((t) => t.reconciled_batch_id!))];
    const items = ids.length ? await fetchAll<T>(() => ctx.supabase.from("transactions").select("*").eq("household_id", ctx.household.id).eq("scope", scope).in("import_batch_id", ids)) : [];
    for (const id of ids) {
      const net = items.filter((i) => i.import_batch_id === id).reduce((a, i) => a + Number(i.amount), 0);
      const paid = pays.filter((t) => t.reconciled_batch_id === id).reduce((a, t) => a + Math.abs(Number(t.amount)), 0);
      if (net > 0.005) { factor.set(id, paid / net); for (const t of pays) if (t.reconciled_batch_id === id) openedPay.add(t.id); }
    }
    base = [...raw.filter((t) => !isCard(t)), ...items.filter((i) => factor.has(i.import_batch_id!))]
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  let txs = base;
  if (sp.categoria === "a-classificar") txs = txs.filter((t) => !t.category_id || byId.get(t.category_id)?.grp === "A classificar");
  else if (sp.categoria) txs = txs.filter((t) => t.category_id === sp.categoria);
  if (sp.q) { const q = sp.q.toLowerCase(); txs = txs.filter((t) => t.description.toLowerCase().includes(q)); }

  // Entradas x saídas = o que passou pela conta. Fatura paga e aberta: entram as compras (× parcela paga), não o pagamento.
  if (sp.origem === "conta") txs = txs.filter((t) => !isCard(t));
  if (sp.origem === "cartao") txs = txs.filter((t) => isCard(t));
  const isIncome = (t: T) => ((t.category_id && byId.get(t.category_id)?.kind) || t.kind) === "receita";
  const flowOf = (t: T): "entrada" | "saida" => t.flow ?? (isIncome(t) ? "entrada" : Number(t.amount) < 0 ? "entrada" : "saida");
  const cash = (txs as T[]).filter((t) => !isCard(t) && !openedPay.has(t.id));
  const cardOpened = hasExtrato ? (txs as T[]).filter((t) => isCard(t) && t.import_batch_id && factor.has(t.import_batch_id)).reduce((a, t) => a + Number(t.amount) * factor.get(t.import_batch_id!)!, 0) : 0;
  const out = cash.filter((t) => flowOf(t) === "saida").reduce((a, t) => a + Math.abs(Number(t.amount)), 0) + cardOpened;
  const inc = cash.filter((t) => flowOf(t) === "entrada").reduce((a, t) => a + Math.abs(Number(t.amount)), 0);
  const cardTotal = hasExtrato ? cardOpened : (txs as T[]).filter(isCard).reduce((a, t) => a + Number(t.amount), 0);
  const qs = (p: Partial<SP>) => `/lancamentos?${new URLSearchParams(Object.entries({ escopo: scope, ciclo: cycle, categoria: sp.categoria, q: sp.q, origem: sp.origem, ...p }).filter(([, v]) => v) as [string, string][]).toString()}`;
  const filterCat = sp.categoria && sp.categoria !== "a-classificar" ? byId.get(sp.categoria) : null;
  const rows = await buildTxViews(ctx, txs, accounts);
  const groups = [...new Set(allCats.filter((c) => c.active).map((c) => `${c.scope === "pj" ? "PJ · " : ""}${c.grp}`))];

  return (
    <div>
      <PageHeader title="Lançamentos" subtitle={hasExtrato ? "O que entrou e saiu da conta no ciclo. As faturas pagas aparecem abertas nas compras delas (consumo do mês anterior), cada uma na sua categoria. Clique em um lançamento para ver os detalhes." : "Ciclo sem extrato importado: mostra as compras do cartão das faturas que vencem no ciclo. Clique em um lançamento para ver os detalhes."}>
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
        <div className="flex gap-1 rounded-full bg-ink/[0.05] p-1 text-[12.5px]">
          {([["", "Tudo"], ["conta", "Conta corrente"], ["cartao", "Cartões"]] as const).map(([k, l]) => (
            <Link key={k || "tudo"} href={qs({ origem: k || undefined })} className={`rounded-full px-3 py-1 ${(sp.origem ?? "") === k ? "bg-ink text-[#f6efe2]" : "text-ink/60 hover:text-ink"}`}>{l}</Link>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm">
          <span className="text-ink/50">{txs.length} itens</span>
          {sp.origem !== "cartao" && <>
            <span title="Só o que passou pela conta corrente (extrato)">Entradas <b className="tabular-nums text-gain">{formatBRL(inc)}</b></span>
            <span title="O que saiu da conta corrente; cada fatura paga entra pelas compras dela">Saídas <b className="tabular-nums">{formatBRL(out)}</b></span>
            <span className="text-ink/45">Saldo <b className={`tabular-nums ${inc - out < 0 ? "text-loss" : "text-ink/70"}`}>{formatBRL(inc - out)}</b></span>
          </>}
          {cardTotal !== 0 && (hasExtrato
            ? <span className="text-ink/45" title="Compras das faturas pagas neste ciclo (já somadas nas saídas)">Faturas pagas <b className="tabular-nums text-ink/60">{formatBRL(cardTotal)}</b>{openedPay.size ? ` · ${openedPay.size} pagamento(s) aberto(s) por compra` : ""}</span>
            : <span className="text-ink/45" title="Compras no cartão das faturas do ciclo">Cartões <b className="tabular-nums text-ink/60">{formatBRL(cardTotal)}</b></span>)}
        </div>
      </div>

      <details className="card mb-4" open={sp.novo === "1"} id="novo">
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
