import Link from "next/link";
import { requireArea } from "@/lib/context";
import { cycleLabel, cycleOf } from "@/lib/cycle";
import { categoryIndex, loadCategories } from "@/lib/data";
import { formatBRL, formatDateBR } from "@/lib/format";
import { groupColor } from "@/lib/theme";
import { Bar, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { canEdit } from "@/lib/context";
import { currentCycle, todayIso } from "@/lib/cycle";
import { bestPurchaseDay, CARD_COLORS, type CardAccount, type CardSummary, cardSummary, type CardTx, defaultCardColor } from "@/lib/cards";
import { CardMonths } from "@/components/card-months";
import { BrandMark } from "@/components/brand";
import { updateCard } from "./card-actions";

type SP = { cartoes?: string; cartao?: string; mes?: string };
const MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesNome = (c: string) => `${MES[Number(c.slice(5, 7)) - 1]}${c.slice(0, 4) !== String(new Date().getFullYear()) ? ` de ${c.slice(0, 4)}` : ""}`;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const dm = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");

export default async function FaturasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireArea("faturas");
  const sp = await searchParams;
  const hh = ctx.household.id;
  const startDay = ctx.household.cycle_start_day;
  const [cats, batchesRes, txRes, accRes] = await Promise.all([
    loadCategories(ctx),
    ctx.supabase.from("import_batches").select("*").eq("household_id", hh).neq("source", "planilha").order("due_date", { ascending: false, nullsFirst: false }).limit(60),
    ctx.supabase.from("transactions").select("id, date, cycle, description, merchant_key, amount, installment_no, installment_total, category_id, account_id, member_user_id, notes, source, import_batch_id, international, reconciled_batch_id").eq("household_id", hh).or("import_batch_id.not.is.null,reconciled_batch_id.not.is.null").limit(20000),
    ctx.supabase.from("accounts").select("*").eq("household_id", hh).eq("type", "cartao").eq("active", true).order("sort", { nullsFirst: false }).order("name"),
  ]);
  const { byId } = categoryIndex(cats);
  const batches = (batchesRes.data ?? []).filter((b: { doc_type?: string }) => b.doc_type !== "extrato");
  const txs = (txRes.data ?? []) as (CardTx & { reconciled_batch_id: string | null })[];
  const paid = new Set(txs.map((t) => t.reconciled_batch_id).filter(Boolean) as string[]);

  // Cartões: contas-cartão que têm faturas importadas
  const withBatches = new Set(batches.map((b: { account_id: string | null }) => b.account_id).filter(Boolean));
  const cards = ((accRes.data ?? []) as CardAccount[]).filter((a) => withBatches.has(a.id) || a.statement_key);
  const cycleNow = currentCycle(startDay);
  const summaries = cards.map((c) => cardSummary(c, batches as never, txs, byId, paid, startDay, cycleNow, sp.mes));
  const mode = sp.cartoes === "um" ? "um" : "lado";
  const focus = summaries.find((x) => x.card.id === sp.cartao) ?? summaries[0];
  const shown = mode === "um" && focus ? [focus] : summaries;
  const edit = canEdit(ctx, "faturas");
  const today = todayIso();
  const href = (p: Partial<SP>) => `/faturas?${new URLSearchParams(Object.entries({ cartoes: mode, cartao: focus?.card.id, mes: sp.mes, ...p }).filter(([, v]) => v) as [string, string][]).toString()}`;

  return (
    <div>
      <PageHeader title="Faturas do cartão" subtitle="Abra uma fatura para ver item a item como cada gasto foi lançado e ajustar o perfil.">
        <Link className="btn" href="/faturas/importar"><Icon name="upload" /> Importar fatura</Link>
      </PageHeader>
      {summaries.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div><div className="eyebrow">Seus cartões</div><p className="text-sm text-ink/55">Fatura mês a mês de cada cartão. Clique num mês para ver o detalhe.</p></div>
            <div className="flex flex-wrap items-center gap-2">
              {mode === "um" && summaries.length > 1 && <div className="flex gap-1 rounded-full bg-ink/[0.05] p-1 text-[12.5px]">{summaries.map((x) => <Link key={x.card.id} href={href({ cartao: x.card.id })} className={`rounded-full px-3 py-1 ${x.card.id === focus?.card.id ? "bg-ink text-[#f6efe2]" : "text-ink/60 hover:text-ink"}`}>{x.card.name}</Link>)}</div>}
              <div className="flex gap-1 rounded-full bg-ink/[0.05] p-1 text-[12.5px]">
                <Link href={href({ cartoes: "lado" })} className={`rounded-full px-3 py-1 ${mode === "lado" ? "bg-ink text-[#f6efe2]" : "text-ink/60 hover:text-ink"}`}>Lado a lado</Link>
                <Link href={href({ cartoes: "um" })} className={`rounded-full px-3 py-1 ${mode === "um" ? "bg-ink text-[#f6efe2]" : "text-ink/60 hover:text-ink"}`}>Um por vez</Link>
              </div>
            </div>
          </div>
          <div className={`grid items-start gap-4 ${mode === "um" ? "mx-auto max-w-2xl" : shown.length >= 3 ? "lg:grid-cols-2 xl:grid-cols-3" : shown.length === 2 ? "lg:grid-cols-2" : "max-w-2xl"}`}>
            {shown.map((x) => <CardColumn key={x.card.id} s={x} edit={edit} today={today} hrefFor={(c) => href({ mes: c, cartao: x.card.id })} />)}
          </div>
        </section>
      )}

      {batches.length > 0 && <div className="eyebrow mb-3">Todas as faturas e extratos importados</div>}
      {batches.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-12 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-brand"><Icon name="card" className="h-7 w-7" /></div>
          <h2>Nenhuma fatura importada ainda</h2>
          <p className="max-w-md text-sm text-ink/55">Envie o PDF da sua fatura Itaú. Todos os cartões, parcelas e compras internacionais são lidos e conferidos com o total.</p>
          <Link className="btn mt-2" href="/faturas/importar"><Icon name="upload" /> Importar a primeira fatura</Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(batchesRes.data ?? []).map((b) => {
            const items = txs.filter((t) => t.import_batch_id === b.id);
            const unc = items.filter((t) => !t.category_id || byId.get(t.category_id)?.grp === "A classificar").length;
            const cards = new Set(items.map((t) => t.account_id).filter(Boolean)).size;
            const g: Record<string, number> = {};
            for (const t of items) { const c = t.category_id ? byId.get(t.category_id) : undefined; if (c?.excluded_from_totals) continue; const k = c?.grp ?? "A classificar"; g[k] = (g[k] ?? 0) + Math.max(0, Number(t.amount)); }
            const tot = Object.values(g).reduce((a, v) => a + v, 0) || 1;
            const total = b.statement_total != null ? Number(b.statement_total) : items.reduce((a, t) => a + Number(t.amount), 0);
            return (
              <Link key={b.id} href={`/faturas/${b.id}`} className="card group transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#b0703f] text-sm font-bold text-white">{(b.institution ?? "?").slice(0, 4).toLowerCase()}</div>
                  <div className="flex-1"><div className="font-semibold">{b.institution ?? "Fatura"}</div><div className="text-xs text-ink/50">{b.due_date ? `Vencimento ${formatDateBR(b.due_date)} · ciclo ${cycleLabel(cycleOf(b.due_date, ctx.household.cycle_start_day))}` : b.file_name}</div></div>
                  <span className="text-ink/30 transition group-hover:translate-x-0.5 group-hover:text-brand"><Icon name="right" /></span>
                </div>
                <div className="mt-4 text-[28px] font-semibold tracking-tight tabular-nums">{formatBRL(total)}</div>
                <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-ink/5">{Object.entries(g).map(([k, v]) => <div key={k} style={{ width: `${(v / tot) * 100}%`, background: groupColor(k) }} title={`${k}: ${formatBRL(v)}`} />)}</div>
                <div className="mt-3 flex items-center justify-between text-xs text-ink/55">
                  <span>{items.length} itens · {cards} cartões</span>
                  <span className={`font-medium ${unc ? "text-orange-700" : "text-emerald-700"}`}>{unc ? `${unc} a classificar` : "tudo classificado"}</span>
                </div>
                <div className="mt-1"><Bar value={items.length - unc} max={items.length || 1} color={unc ? "#c08a3e" : "#4f7a52"} /></div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CardColumn({ s, edit, today, hrefFor }: { s: CardSummary; edit: boolean; today: string; hrefFor: (cycle: string) => string }) {
  const c = s.card, color = defaultCardColor(c), sel = s.selected;
  const best = bestPurchaseDay(c);
  const status = !sel ? "" : sel.projected ? "Prevista · parcelas já compradas" : sel.paid ? "Paga · conferida com o extrato" : sel.dueDate && sel.dueDate < today ? `Fechada · venceu em ${dm(sel.dueDate)}` : `Fechada · vence ${dm(sel.dueDate)}`;
  const statusCls = !sel ? "" : sel.projected ? "text-ink/50" : sel.paid ? "text-gain" : sel.dueDate && sel.dueDate < today ? "text-ink/55" : "text-brand";
  const b = s.breakdown;
  const vsAvg = sel && !sel.projected && s.avg ? sel.total / s.avg - 1 : null;
  const limitUse = c.credit_limit && sel ? Math.min(1, sel.total / Number(c.credit_limit)) : null;
  const row = (l: string, v: number, neg = false) => v > 0.004 && <div className="flex justify-between py-0.5"><span className="text-ink/60">{l}</span><span className={`tabular-nums ${neg ? "text-gain" : ""}`}>{neg ? "− " : ""}{formatBRL(v)}</span></div>;
  return (
    <section className="card overflow-hidden !p-0">
      <div className="relative overflow-hidden px-5 pb-4 pt-4 text-[#f3eadb]" style={{ background: `linear-gradient(135deg, ${color} 0%, #191613 140%)` }}>
        <div className="pointer-events-none absolute -right-6 -top-6 opacity-[0.12]"><BrandMark size={120} color="#f3e3bf" /></div>
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0"><div className="truncate font-serif text-[21px] leading-tight">{c.name}</div>
            <div className="mt-0.5 text-[11.5px] text-[#efe7da]/60">{c.purpose ?? (edit ? "Defina o propósito deste cartão em ⚙" : "")}</div></div>
          <div className="text-right text-[11px] uppercase tracking-[0.18em] text-[#efe7da]/70">{c.brand ?? ""}<div className="mt-1 tracking-[0.2em] text-[#efe7da]/45">•••• {(c.last4 ?? c.statement_key ?? "").slice(-4)}</div></div>
        </div>
        {limitUse != null && <div className="relative mt-3"><div className="h-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#d8bf8f]" style={{ width: `${limitUse * 100}%` }} /></div><div className="mt-1 text-[10.5px] text-[#efe7da]/55">{Math.round(limitUse * 100)}% do limite de {formatBRL(Number(c.credit_limit)).replace(/,\d{2}$/, "")}</div></div>}
      </div>

      <div className="space-y-4 p-4">
        <CardMonths months={s.months} selected={sel?.cycle ?? null} hrefFor={hrefFor} color={color === "#1f1b17" ? "#7d5f36" : color} />
        {sel ? (<>
          <div>
            <div className="flex items-baseline justify-between gap-2"><span className="font-serif text-[20px]">Fatura de {mesNome(sel.cycle)}</span><span className="display text-[26px]">{formatBRL(sel.total)}</span></div>
            <div className={`text-[12px] ${statusCls}`}>{status}{vsAvg != null && Math.abs(vsAvg) >= 0.05 ? <span className="text-ink/45"> · {vsAvg > 0 ? "+" : ""}{Math.round(vsAvg * 100)}% vs. média</span> : null}</div>
            <div className="mt-3 divide-y divide-ink/[0.06] text-[13px]">
              <div className="flex justify-between py-1.5"><span className="text-ink/60">Melhor data de compra</span><span className="font-medium" title={best?.estimated ? "Estimado pelo vencimento; informe o fechamento em Configurar cartão" : undefined}>{best ? `dia ${String(best.day).padStart(2, "0")}${best.estimated ? " (estimado)" : ""}` : "—"}</span></div>
              <div className="flex justify-between py-1.5"><span className="text-ink/60">Vencimento</span><span className="font-medium">{sel.dueDate ? dm(sel.dueDate) : c.due_day ? `dia ${c.due_day}` : "—"}</span></div>
              <div className="flex justify-between py-1.5"><span className="text-ink/60">Média das faturas</span><span className="tabular-nums">{formatBRL(s.avg)}</span></div>
            </div>
          </div>

          {!sel.projected && (
            <div className="rounded-2xl border border-ink/[0.08] p-3.5 text-[13px]">
              <div className="mb-1.5 font-medium">Resumo da fatura</div>
              {row("Compras à vista", b.aVista)}{row("Parcelas", b.parcelas)}{row("Encargos, IOF e tarifas", b.encargos)}{row("Estornos e créditos", b.creditos, true)}
              {b.internacional > 0 && <div className="flex justify-between py-0.5 text-[12px] text-ink/45"><span>das quais internacionais</span><span className="tabular-nums">{formatBRL(b.internacional)}</span></div>}
              {sel.batchId && <Link href={`/faturas/${sel.batchId}`} className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline">Ver os {b.itens} lançamentos <Icon name="right" className="h-3.5 w-3.5" /></Link>}
            </div>)}

          {s.categories.length > 0 && !sel.projected && (
            <div>
              <div className="label">Onde foi gasto</div>
              <div className="space-y-1.5">{s.categories.map((x, i) => (
                <div key={i} className="text-[12.5px]"><div className="flex justify-between"><span className="truncate">{x.cat?.name ?? "A classificar"}</span><span className="tabular-nums text-ink/70">{formatBRL(x.v).replace(/,\d{2}$/, "")}</span></div>
                  <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-ink/[0.06]"><div className="h-full rounded-full" style={{ width: `${(x.v / (s.categories[0].v || 1)) * 100}%`, background: groupColor(x.cat?.grp, x.cat?.color) }} /></div></div>))}</div>
            </div>)}

          {s.upcoming.length > 0 && (
            <div>
              <div className="label">Já comprometido nas próximas faturas</div>
              <div className="flex gap-2">{s.upcoming.map((u) => <div key={u.cycle} className="flex-1 rounded-xl bg-ink/[0.035] px-2.5 py-2 text-center"><div className="text-[11px] text-ink/50">{cap(mesNome(u.cycle).split(" ")[0])}</div><div className="text-[13px] font-medium tabular-nums">{formatBRL(u.v).replace(/,\d{2}$/, "")}</div></div>)}</div>
            </div>)}
        </>) : <p className="text-sm text-ink/50">Nenhuma fatura deste cartão ainda.</p>}

        {edit && (
          <details className="border-t border-ink/[0.06] pt-3 text-[13px]">
            <summary className="cursor-pointer text-ink/55 hover:text-ink">⚙ Configurar cartão</summary>
            <form action={updateCard} className="mt-3 grid grid-cols-2 gap-2">
              <input type="hidden" name="id" value={c.id} />
              <div className="col-span-2"><label className="label">Nome</label><input className="input" name="name" defaultValue={c.name} maxLength={60} placeholder="Ex.: VISA Infinite Person" /></div>
              <div className="col-span-2"><label className="label">Propósito</label><input className="input" name="purpose" defaultValue={c.purpose ?? ""} maxLength={140} placeholder="Ex.: viagens e milhas · gastos da casa · empresa" /></div>
              <div><label className="label">Fecha no dia</label><input className="input" name="closing_day" type="number" min={1} max={31} defaultValue={c.closing_day ?? ""} /></div>
              <div><label className="label">Vence no dia</label><input className="input" name="due_day" type="number" min={1} max={31} defaultValue={c.due_day ?? ""} /></div>
              <div><label className="label">Limite</label><input className="input" name="credit_limit" defaultValue={c.credit_limit ? String(c.credit_limit).replace(".", ",") : ""} placeholder="opcional" /></div>
              <div><label className="label">Ordem</label><input className="input" name="sort" type="number" min={1} defaultValue={c.sort ?? ""} placeholder="1, 2, 3" /></div>
              <div className="col-span-2"><label className="label">Cor</label><div className="flex flex-wrap gap-2">{CARD_COLORS.map(([hex, l]) => (
                <label key={hex} className="cursor-pointer" title={l}><input type="radio" name="color" value={hex} defaultChecked={(c.color ?? "") === hex} className="peer sr-only" /><span className="block h-7 w-7 rounded-full ring-2 ring-transparent ring-offset-2 peer-checked:ring-gold" style={{ background: hex }} /></label>))}</div></div>
              <div className="col-span-2"><button className="btn !py-1.5 text-xs">Salvar</button></div>
            </form>
          </details>)}
      </div>
    </section>
  );
}
