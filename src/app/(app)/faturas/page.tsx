import Link from "next/link";
import { requireArea } from "@/lib/context";
import { cycleLabel, cycleOf } from "@/lib/cycle";
import { categoryIndex, loadCategories } from "@/lib/data";
import { formatBRL, formatDateBR } from "@/lib/format";
import { groupColor } from "@/lib/theme";
import { Bar, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

export default async function FaturasPage() {
  const ctx = await requireArea("faturas");
  const hh = ctx.household.id;
  const [cats, batchesRes, txRes] = await Promise.all([
    loadCategories(ctx),
    ctx.supabase.from("import_batches").select("*").eq("household_id", hh).neq("source", "planilha").order("due_date", { ascending: false, nullsFirst: false }).limit(36),
    ctx.supabase.from("transactions").select("import_batch_id, category_id, amount, account_id").eq("household_id", hh).not("import_batch_id", "is", null).limit(20000),
  ]);
  const { byId } = categoryIndex(cats);
  const batches = batchesRes.data ?? [];
  const txs = txRes.data ?? [];

  return (
    <div>
      <PageHeader title="Faturas do cartão" subtitle="Abra uma fatura para ver item a item como cada gasto foi lançado e ajustar o perfil.">
        <Link className="btn" href="/faturas/importar"><Icon name="upload" /> Importar fatura</Link>
      </PageHeader>
      {batches.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-12 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-brand"><Icon name="card" className="h-7 w-7" /></div>
          <h2>Nenhuma fatura importada ainda</h2>
          <p className="max-w-md text-sm text-ink/55">Envie o PDF da sua fatura Itaú. Todos os cartões, parcelas e compras internacionais são lidos e conferidos com o total.</p>
          <Link className="btn mt-2" href="/faturas/importar"><Icon name="upload" /> Importar a primeira fatura</Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {batches.map((b) => {
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
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#ec7000] text-sm font-bold text-white">{(b.institution ?? "?").slice(0, 4).toLowerCase()}</div>
                  <div className="flex-1"><div className="font-semibold">{b.institution ?? "Fatura"}</div><div className="text-xs text-ink/50">{b.due_date ? `Vencimento ${formatDateBR(b.due_date)} · ciclo ${cycleLabel(cycleOf(b.due_date, ctx.household.cycle_start_day))}` : b.file_name}</div></div>
                  <span className="text-ink/30 transition group-hover:translate-x-0.5 group-hover:text-brand"><Icon name="right" /></span>
                </div>
                <div className="mt-4 text-[28px] font-semibold tracking-tight tabular-nums">{formatBRL(total)}</div>
                <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-ink/5">{Object.entries(g).map(([k, v]) => <div key={k} style={{ width: `${(v / tot) * 100}%`, background: groupColor(k) }} title={`${k}: ${formatBRL(v)}`} />)}</div>
                <div className="mt-3 flex items-center justify-between text-xs text-ink/55">
                  <span>{items.length} itens · {cards} cartões</span>
                  <span className={`font-medium ${unc ? "text-orange-700" : "text-emerald-700"}`}>{unc ? `${unc} a classificar` : "tudo classificado"}</span>
                </div>
                <div className="mt-1"><Bar value={items.length - unc} max={items.length || 1} color={unc ? "#ea580c" : "#15803d"} /></div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
