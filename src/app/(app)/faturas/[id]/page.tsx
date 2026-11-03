import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/context";
import { cycleOf } from "@/lib/cycle";
import { categoryIndex, loadAccounts, loadCategories, loadMembers, type Transaction } from "@/lib/data";
import { formatBRL, formatDateBR, formatPct } from "@/lib/format";
import { groupColor } from "@/lib/theme";
import { buildTxViews, toCatLite, toMemberLite } from "@/lib/tx-view";
import { Avatar, Bar, cycleLong, Donut, Empty, GroupTag, PageHeader, Pill } from "@/components/ui";
import { Icon } from "@/components/icons";
import { TxTable } from "@/components/tx-table";
import { deleteBatch } from "../actions";

type SP = { cartao?: string; perfil?: string; q?: string };

export default async function FaturaDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const ctx = await requireArea("faturas");
  const { id } = await params;
  const sp = await searchParams;
  const { data: batch } = await ctx.supabase.from("import_batches").select("*").eq("id", id).eq("household_id", ctx.household.id).single();
  if (!batch) notFound();

  const [cats, accounts, members, txRes] = await Promise.all([
    loadCategories(ctx), loadAccounts(ctx), loadMembers(ctx),
    ctx.supabase.from("transactions").select("*").eq("household_id", ctx.household.id).eq("import_batch_id", id).order("date"),
  ]);
  const all = (txRes.data ?? []) as Transaction[];
  const { byId } = categoryIndex(cats);
  const memberLite = toMemberLite(members);
  const memberIdx = new Map(memberLite.map((m) => [m.user_id, m] as [string, (typeof memberLite)[number]]));
  const isUnc = (t: Transaction) => !t.category_id || byId.get(t.category_id)?.grp === "A classificar";

  let items = all;
  if (sp.cartao) items = items.filter((t) => t.account_id === sp.cartao);
  if (sp.perfil === "a-classificar") items = items.filter(isUnc);
  else if (sp.perfil) items = items.filter((t) => t.category_id && byId.get(t.category_id)?.grp === sp.perfil);
  if (sp.q) { const q = sp.q.toLowerCase(); items = items.filter((t) => t.description.toLowerCase().includes(q)); }

  const total = batch.statement_total != null ? Number(batch.statement_total) : all.reduce((a, t) => a + Number(t.amount), 0);
  const sumAll = Math.round(all.reduce((a, t) => a + Number(t.amount), 0) * 100) / 100;
  const unc = all.filter(isUnc).length;
  const intl = all.filter((t) => (t as Transaction & { international?: boolean }).international).reduce((a, t) => a + Number(t.amount), 0);
  const parc = all.filter((t) => t.installment_total).reduce((a, t) => a + Number(t.amount), 0);
  const g: Record<string, number> = {};
  for (const t of all) { const k = (t.category_id && byId.get(t.category_id)?.grp) || "A classificar"; g[k] = (g[k] ?? 0) + Number(t.amount); }
  const catSum = new Map<string, number>();
  for (const t of all) catSum.set(t.category_id ?? "_", (catSum.get(t.category_id ?? "_") ?? 0) + Number(t.amount));
  const topCats = [...catSum.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const accIds = [...new Set(all.map((t) => t.account_id ?? "_"))];
  const cards = accIds.map((aid) => {
    const acc = accounts.find((a) => a.id === aid);
    const its = all.filter((t) => (t.account_id ?? "_") === aid);
    return { id: aid, acc, n: its.length, total: its.reduce((a, t) => a + Number(t.amount), 0) };
  }).sort((a, b) => b.total - a.total);

  const views = await buildTxViews(ctx, items, accounts);
  const catLite = toCatLite(cats);
  const base = `/faturas/${id}`;
  const link = (p: SP) => {
    const q = new URLSearchParams();
    Object.entries({ cartao: sp.cartao, perfil: sp.perfil, q: sp.q, ...p }).forEach(([k, v]) => v && q.set(k, v));
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const cycle = batch.due_date ? cycleOf(batch.due_date, ctx.household.cycle_start_day) : null;

  return (
    <div>
      <Link href="/faturas" className="mb-4 inline-flex items-center gap-1 text-sm text-ink/55 hover:text-ink"><Icon name="left" /> Faturas</Link>
      <PageHeader title={`Fatura ${batch.institution ?? ""}${batch.due_date ? ` · venc. ${formatDateBR(batch.due_date)}` : ""}`}
        subtitle={<>{cycle && <>Ciclo {cycleLong(cycle).toLowerCase()} · </>}importada em {formatDateBR(String(batch.created_at).slice(0, 10))} · {all.length} itens. Clique em qualquer item para ver como foi lançado e mudar o perfil do gasto.</>}>
        <form action={deleteBatch}><input type="hidden" name="id" value={batch.id} /><button className="btn-ghost text-loss">Desfazer importação</button></form>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card"><div className="label">Total da fatura</div><div className="mt-1 text-[26px] font-semibold tabular-nums">{formatBRL(total)}</div>
          <div className={`mt-1 text-xs font-medium ${Math.abs(sumAll - total) < 0.05 ? "text-emerald-700" : "text-amber-700"}`}>{Math.abs(sumAll - total) < 0.05 ? "✓ confere com o PDF" : `itens somam ${formatBRL(sumAll)}`}</div></div>
        <div className="card"><div className="label">Parcelados</div><div className="mt-1 text-[26px] font-semibold tabular-nums">{formatBRL(parc)}</div>{batch.future_total != null && <div className="mt-1 text-xs text-ink/50">{formatBRL(batch.future_total)} já comprometidos nas próximas</div>}</div>
        <div className="card"><div className="label">Internacional + IOF</div><div className="mt-1 text-[26px] font-semibold tabular-nums">{formatBRL(intl)}</div><div className="mt-1 text-xs text-ink/50">{total ? formatPct(intl / total) : "—"} da fatura</div></div>
        <div className="card"><div className="label">Classificação</div><div className="mt-1 text-[26px] font-semibold tabular-nums">{all.length - unc}<span className="text-base text-ink/40">/{all.length}</span></div><div className="mt-2"><Bar value={all.length - unc} max={all.length || 1} color={unc ? "#ea580c" : "#15803d"} /></div></div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <form action={base} className="relative">
              {sp.cartao && <input type="hidden" name="cartao" value={sp.cartao} />}{sp.perfil && <input type="hidden" name="perfil" value={sp.perfil} />}
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35"><Icon name="search" /></span>
              <input className="input w-60 pl-9" name="q" defaultValue={sp.q} placeholder="Buscar item…" />
            </form>
            <Link href={link({ cartao: undefined })} className={`rounded-full px-3 py-1.5 text-xs font-medium ${!sp.cartao ? "bg-ink text-white" : "bg-white text-ink/60 ring-1 ring-ink/10"}`}>Todos os cartões</Link>
            {cards.map((c) => {
              const m = c.acc?.owner_user_id ? memberIdx.get(c.acc.owner_user_id) : undefined;
              return (
                <Link key={c.id} href={link({ cartao: c.id })} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${sp.cartao === c.id ? "bg-ink text-white" : "bg-white text-ink/60 ring-1 ring-ink/10"}`}>
                  {m && <Avatar name={m.display_name} index={m.index} size="h-4 w-4 text-[8px]" />}{c.acc?.last4 ? `•••• ${c.acc.last4}` : c.acc?.name ?? "Sem cartão"}
                </Link>
              );
            })}
          </div>
          {(sp.perfil || sp.q) && (
            <div className="mb-3 flex items-center gap-2 text-sm text-ink/60">Filtrando: {sp.perfil === "a-classificar" ? <Pill cat={null} /> : sp.perfil ? <GroupTag grp={sp.perfil} /> : null} {sp.q && `“${sp.q}”`}
              <Link className="text-brand" href={link({ perfil: undefined, q: undefined })}>limpar</Link></div>
          )}
          {views.length === 0 ? <Empty>Nenhum item com esse filtro.</Empty> : cards.map((c) => {
            const rows = views.filter((v) => (all.find((t) => t.id === v.id)?.account_id ?? "_") === c.id);
            if (!rows.length) return null;
            const m = c.acc?.owner_user_id ? memberIdx.get(c.acc.owner_user_id) : undefined;
            return (
              <section key={c.id} className="card mb-4 overflow-x-auto p-0">
                <div className="flex items-center justify-between gap-3 border-b border-ink/5 px-5 py-3">
                  <div className="flex items-center gap-3">
                    {m && <Avatar name={m.display_name} index={m.index} size="h-8 w-8 text-xs" />}
                    <div><div className="font-semibold">{c.acc?.name ?? "Sem cartão"}</div><div className="text-xs text-ink/50">{m?.display_name ?? "—"} · {rows.length} de {c.n} itens</div></div>
                  </div>
                  <div className="text-right font-semibold tabular-nums">{formatBRL(rows.reduce((a, r) => a + r.amount, 0))}</div>
                </div>
                <TxTable rows={rows} cats={catLite} members={memberLite} cycleStartDay={ctx.household.cycle_start_day} showAccount={false} />
              </section>
            );
          })}
        </div>

        <aside className="space-y-4">
          <section className="card">
            <h2 className="mb-3">Por perfil</h2>
            <div className="flex justify-center"><Donut parts={Object.entries(g).map(([k, v]) => ({ label: k, v, color: groupColor(k) }))} total={Object.values(g).reduce((a, v) => a + Math.max(0, v), 0)} center={["total", formatBRL(total).replace(/,\d{2}$/, "")]} /></div>
            <div className="mt-3 space-y-1">
              {Object.entries(g).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
                const key = k === "A classificar" ? "a-classificar" : k;
                return (
                  <Link key={k} href={link({ perfil: sp.perfil === key ? undefined : key })} className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-ink/[0.03] ${sp.perfil === key ? "bg-ink/[0.05]" : ""}`}>
                    <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: groupColor(k) }} />{k}</span>
                    <span className="tabular-nums text-ink/70">{formatBRL(v)}</span>
                  </Link>
                );
              })}
            </div>
          </section>
          <section className="card">
            <h2 className="mb-3">Maiores categorias</h2>
            <div className="space-y-2.5">
              {topCats.map(([cid, v]) => {
                const c = byId.get(cid);
                return <div key={cid}><div className="mb-1 flex items-center justify-between gap-2 text-sm"><Pill cat={c} /><span className="tabular-nums text-ink/70">{formatBRL(v)}</span></div><Bar value={v} max={topCats[0][1]} color={groupColor(c?.grp)} /></div>;
              })}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
