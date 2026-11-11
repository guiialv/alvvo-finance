import Link from "next/link";
import { requireArea } from "@/lib/context";
import { categoryIndex, loadAccounts, loadCategories, loadMembers, type Transaction } from "@/lib/data";
import { formatBRL, formatDateBR } from "@/lib/format";
import { groupColor } from "@/lib/theme";
import { buildTxViews, toCatLite, toMemberLite } from "@/lib/tx-view";
import { Bar, Empty, PageHeader, Pill } from "@/components/ui";
import { Icon } from "@/components/icons";
import { TxTable } from "@/components/tx-table";
import { deleteBatch } from "../faturas/actions";

type SP = { mes?: string; f?: string; q?: string };
type Tx = Transaction & { flow?: "entrada" | "saida" | null; reconciled_batch_id?: string | null };

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesLabel = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const FILTROS: [string, string][] = [["todos", "Tudo"], ["entradas", "Entradas"], ["saidas", "Saídas"], ["transferencias", "Transferências e faturas"], ["classificar", "A classificar"]];

export default async function ContaCorrentePage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireArea("faturas");
  const sp = await searchParams;
  const hh = ctx.household.id;
  const [cats, accounts, members, txRes, batchRes] = await Promise.all([
    loadCategories(ctx), loadAccounts(ctx), loadMembers(ctx),
    ctx.supabase.from("transactions").select("*").eq("household_id", hh).eq("source", "extrato").order("date", { ascending: false }).order("created_at", { ascending: false }).limit(10000),
    ctx.supabase.from("import_batches").select("id, institution, file_name, created_at, tx_count").eq("household_id", hh).eq("doc_type", "extrato").order("created_at", { ascending: false }),
  ]);
  const all = (txRes.data ?? []) as Tx[];
  const batches = (batchRes.data ?? []) as { id: string; institution: string | null; file_name: string | null; created_at: string; tx_count: number }[];
  const { byId } = categoryIndex(cats);
  const contas = accounts.filter((a) => a.type === "conta");

  const header = (
    <PageHeader title="Conta corrente" subtitle="Tudo o que entra e sai da conta, lido do extrato do banco. Clique em qualquer lançamento para corrigir a interpretação — a plataforma aprende com as suas correções.">
      <Link href="/faturas/importar?tipo=extrato" className="btn"><Icon name="plus" /> Importar extrato</Link>
    </PageHeader>
  );
  if (!all.length) return (
    <div>{header}
      <Empty icon="list">Nenhum extrato importado ainda. Exporte o extrato da conta em PDF (Itaú: app → Extrato → Exportar), ou em OFX/CSV de qualquer banco, e importe aqui.</Empty>
    </div>
  );

  // Meses (calendário) com movimento
  const months = [...new Set(all.map((t) => t.date.slice(0, 7)))].sort().reverse();
  const mes = sp.mes && months.includes(sp.mes) ? sp.mes : months[0];
  const flowOf = (t: Tx): "entrada" | "saida" => t.flow ?? (Number(t.amount) < 0 ? "entrada" : "saida");
  const abs = (t: Tx) => Math.abs(Number(t.amount));
  const kindOf = (t: Tx) => (t.category_id ? byId.get(t.category_id)?.kind : undefined) ?? t.kind;
  const isUnc = (t: Tx) => !t.category_id || byId.get(t.category_id)?.grp === "A classificar";

  const summary = (list: Tx[]) => {
    let entradas = 0, saidas = 0, renda = 0, gasto = 0, neutro = 0;
    for (const t of list) {
      const f = flowOf(t), v = abs(t), k = kindOf(t);
      if (f === "entrada") entradas += v; else saidas += v;
      if (k === "transferencia" || k === "investimento") neutro += f === "saida" ? v : 0;
      else if (k === "receita") renda += f === "entrada" ? v : -v;
      else gasto += f === "saida" ? v : -v; // reembolso que entra abate o gasto
    }
    return { entradas, saidas, renda, gasto, neutro, liquido: entradas - saidas };
  };
  const monthTx = all.filter((t) => t.date.startsWith(mes));
  const s = summary(monthTx);
  const strip = months.slice(0, 12).reverse().map((m) => ({ m, ...summary(all.filter((t) => t.date.startsWith(m))) }));
  const maxStrip = Math.max(1, ...strip.map((x) => Math.max(x.entradas, x.saidas)));

  let items = monthTx;
  const f = sp.f ?? "todos";
  if (f === "entradas") items = items.filter((t) => flowOf(t) === "entrada");
  if (f === "saidas") items = items.filter((t) => flowOf(t) === "saida");
  if (f === "transferencias") items = items.filter((t) => kindOf(t) === "transferencia");
  if (f === "classificar") items = items.filter(isUnc);
  if (sp.q) { const q = sp.q.toLowerCase(); items = items.filter((t) => t.description.toLowerCase().includes(q)); }
  const unc = monthTx.filter(isUnc).length;

  // Para onde foi (saídas reais do mês, por categoria)
  const catSum = new Map<string, number>();
  for (const t of monthTx) {
    const k = kindOf(t);
    if (k === "transferencia" || k === "receita") continue;
    const v = flowOf(t) === "saida" ? abs(t) : -abs(t);
    catSum.set(t.category_id ?? "_", (catSum.get(t.category_id ?? "_") ?? 0) + v);
  }
  const topCats = [...catSum.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const faturasPagas = monthTx.filter((t) => t.category_id && byId.get(t.category_id)?.name === "Pagamento de fatura");

  const views = await buildTxViews(ctx, items, accounts);
  const link = (p: SP) => {
    const q = new URLSearchParams();
    Object.entries({ mes, f: sp.f, q: sp.q, ...p }).forEach(([k, v]) => v && v !== "todos" && q.set(k, v));
    return `/conta?${q.toString()}`;
  };

  return (
    <div>
      {header}
      {contas.length > 0 && <p className="-mt-3 mb-4 text-xs text-ink/50">{contas.map((c) => c.name).join(" · ")}</p>}

      {/* Meses: entradas x saídas */}
      <div className="card mb-4 overflow-x-auto p-3">
        <div className="flex min-w-max items-end gap-1.5">
          {strip.map((x) => (
            <Link key={x.m} href={link({ mes: x.m })} className={`flex w-16 flex-col items-center gap-1 rounded-xl px-1 pb-1.5 pt-2 transition ${x.m === mes ? "bg-ink/[0.06]" : "hover:bg-ink/[0.03]"}`}>
              <div className="flex h-16 items-end gap-1">
                <span className="w-2.5 rounded-t bg-emerald-600/70" style={{ height: `${Math.max(2, (x.entradas / maxStrip) * 64)}px` }} title={`Entradas ${formatBRL(x.entradas)}`} />
                <span className="w-2.5 rounded-t bg-[#b0703c]/80" style={{ height: `${Math.max(2, (x.saidas / maxStrip) * 64)}px` }} title={`Saídas ${formatBRL(x.saidas)}`} />
              </div>
              <span className={`text-[11px] ${x.m === mes ? "font-semibold text-ink" : "text-ink/55"}`}>{mesLabel(x.m)}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card"><div className="label">Renda do mês</div><div className="mt-1 text-[26px] font-semibold tabular-nums text-emerald-800">{formatBRL(s.renda)}</div><div className="mt-1 text-xs text-ink/50">entrou {formatBRL(s.entradas)} na conta</div></div>
        <div className="card"><div className="label">Gastos pela conta</div><div className="mt-1 text-[26px] font-semibold tabular-nums">{formatBRL(s.gasto)}</div><div className="mt-1 text-xs text-ink/50">PIX, boletos, débitos e tarifas (já descontados reembolsos)</div></div>
        <div className="card"><div className="label">Faturas e transferências</div><div className="mt-1 text-[26px] font-semibold tabular-nums">{formatBRL(s.neutro)}</div><div className="mt-1 text-xs text-ink/50">{faturasPagas.length ? `${faturasPagas.length} fatura(s) paga(s) · ` : ""}não contam como gasto</div></div>
        <div className="card"><div className="label">Saldo do mês</div><div className={`mt-1 text-[26px] font-semibold tabular-nums ${s.liquido < 0 ? "text-loss" : ""}`}>{formatBRL(s.liquido)}</div><div className="mt-1 text-xs text-ink/50">entradas − saídas de {mesLabel(mes)}</div></div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <form action="/conta" className="relative">
              <input type="hidden" name="mes" value={mes} />{sp.f && <input type="hidden" name="f" value={sp.f} />}
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35"><Icon name="search" /></span>
              <input className="input w-56 pl-9" name="q" defaultValue={sp.q} placeholder="Buscar lançamento…" />
            </form>
            {FILTROS.map(([k, l]) => (
              <Link key={k} href={link({ f: k })} className={`rounded-full px-3 py-1.5 text-xs font-medium ${f === k ? "bg-ink text-white" : "bg-white text-ink/60 ring-1 ring-ink/10"}`}>
                {l}{k === "classificar" && unc ? ` · ${unc}` : ""}
              </Link>
            ))}
          </div>
          {views.length === 0 ? <Empty>Nenhum lançamento com esse filtro.</Empty> : (
            <section className="card overflow-x-auto p-0">
              <TxTable rows={views} cats={toCatLite(cats)} members={toMemberLite(members)} cycleStartDay={ctx.household.cycle_start_day} showAccount={false} />
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="card">
            <h2 className="mb-3">Para onde foi</h2>
            {topCats.length === 0 ? <p className="text-sm text-ink/50">Sem gastos pela conta neste mês.</p> : (
              <div className="space-y-2.5">
                {topCats.map(([cid, v]) => {
                  const c = byId.get(cid);
                  return <div key={cid}><div className="mb-1 flex items-center justify-between gap-2 text-sm"><Pill cat={c} /><span className="tabular-nums text-ink/70">{formatBRL(v)}</span></div><Bar value={v} max={topCats[0][1]} color={groupColor(c?.grp)} /></div>;
                })}
              </div>
            )}
          </section>
          {faturasPagas.length > 0 && (
            <section className="card">
              <h2 className="mb-3">Faturas pagas pela conta</h2>
              <div className="space-y-2 text-sm">
                {faturasPagas.map((t) => (
                  <div key={t.id} className="flex items-start justify-between gap-3">
                    <div><div className="leading-snug">{t.description.replace(/^DÉBITO AUTOMÁTICO · |^PAGAMENTO DE FATURA · /, "")}</div>
                      <div className={`text-[11px] ${t.reconciled_batch_id ? "text-emerald-700" : "text-amber-700"}`}>{formatDateBR(t.date)} · {t.reconciled_batch_id ? "✓ conferida com a fatura" : "fatura ainda não importada"}</div></div>
                    <span className="tabular-nums">{formatBRL(abs(t))}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="card">
            <h2 className="mb-3">Extratos importados</h2>
            <div className="space-y-2 text-sm">
              {batches.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0"><div className="truncate">{b.institution ?? "Extrato"} · {b.tx_count} lançamentos</div><div className="text-[11px] text-ink/45">importado em {formatDateBR(String(b.created_at).slice(0, 10))}</div></div>
                  <form action={deleteBatch}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="back" value="/conta" /><button className="text-xs text-loss hover:underline">desfazer</button></form>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
