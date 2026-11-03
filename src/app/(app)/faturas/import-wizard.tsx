"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { analyzeStatement, confirmImport, type Preview } from "./actions";

export interface CatOpt { id: string; label: string; group: string }

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}`;
const cycleName = (c: string) => {
  const m = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(c.slice(5, 7)) - 1];
  return `${m}/${c.slice(0, 4)}`;
};
const shift = (c: string, n: number) => {
  const i = Number(c.slice(0, 4)) * 12 + Number(c.slice(5, 7)) - 1 + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
};

export function ImportWizard({ options }: { options: CatOpt[] }) {
  const [preview, analyze, analyzing] = useActionState<Preview | undefined, FormData>(analyzeStatement, undefined);
  return (
    <div className="space-y-4">
      <form action={analyze} className="card flex flex-wrap items-center gap-3">
        <input type="file" name="file" accept=".pdf,.csv,.ofx,.qfx,.txt" required className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand" />
        <button className="btn" disabled={analyzing}>{analyzing ? "Lendo arquivo…" : "Ler fatura"}</button>
        <p className="w-full text-xs text-ink/40">PDF da fatura Itaú (todos os cartões), ou CSV/OFX de qualquer banco. O arquivo é lido no servidor e não fica armazenado.</p>
      </form>
      {preview?.error && <div className="card border-loss/30 text-sm text-loss">{preview.error}</div>}
      {preview?.rows && <Review key={preview.fileName + String(preview.rows.length)} preview={preview} options={options} />}
    </div>
  );
}

function Review({ preview, options }: { preview: Preview; options: CatOpt[] }) {
  const rows = preview.rows!;
  const [cats, setCats] = useState<Record<number, string | null>>(() => Object.fromEntries(rows.map((r) => [r.idx, r.suggestedCategoryId])));
  const [include, setInclude] = useState<Record<number, boolean>>(() => Object.fromEntries(rows.map((r) => [r.idx, !r.duplicate])));
  const [owners, setOwners] = useState<Record<string, string | null>>(() => Object.fromEntries((preview.cards ?? []).map((c) => [c.last4, c.ownerUserId])));
  const [cycle, setCycle] = useState(preview.cycle!);
  const [filter, setFilter] = useState<"todos" | "classificar">("todos");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ error?: string; inserted?: number; learned?: number; batchId?: string } | null>(null);
  const router = useRouter();
  const groups = useMemo(() => [...new Set(options.map((o) => o.group))], [options]);
  const uncIds = useMemo(() => new Set(options.filter((o) => o.group.endsWith("A classificar")).map((o) => o.id)), [options]);

  const selected = rows.filter((r) => include[r.idx]);
  const total = selected.reduce((a, r) => a + r.amount, 0);
  const dupes = rows.filter((r) => r.duplicate).length;
  const toClassify = selected.filter((r) => !cats[r.idx] || uncIds.has(cats[r.idx]!)).length;
  const visible = filter === "classificar" ? rows.filter((r) => !cats[r.idx] || uncIds.has(cats[r.idx]!)) : rows;

  if (result?.inserted !== undefined) {
    return (
      <div className="card space-y-2">
        <h2 className="text-gain">✓ {result.inserted} lançamentos importados no ciclo {cycleName(cycle)}</h2>
        {!!result.learned && <p className="text-sm text-ink/60">A plataforma aprendeu {result.learned} nova(s) regra(s) com as suas correções.</p>}
        <div className="flex gap-2 pt-2">
          <Link className="btn" href={`/lancamentos?ciclo=${cycle}`}>Ver lançamentos</Link>
          <Link className="btn-ghost" href={`/?ciclo=${cycle}`}>Visão geral</Link>
        </div>
      </div>
    );
  }

  const submit = () => start(async () => {
    const r = await confirmImport({
      fileName: preview.fileName!, source: preview.source!, bank: preview.bank!, dueDate: preview.dueDate ?? null,
      statementTotal: preview.statementTotal ?? null, futureTotal: preview.futureTotal ?? null, cycle,
      cards: (preview.cards ?? []).map((c) => ({ last4: c.last4, ownerUserId: owners[c.last4] ?? null })),
      rows: selected.map((r) => ({ ...r, categoryId: cats[r.idx] ?? null })),
    });
    setResult(r);
    if (r.batchId) router.push(`/faturas/${r.batchId}`);
  });

  return (
    <div className="space-y-4">
      <div className="card grid gap-4 md:grid-cols-4">
        <div><div className="label">Banco</div><div className="font-medium">{preview.bank}</div></div>
        <div><div className="label">Vencimento</div><div className="font-medium">{preview.dueDate ? dt(preview.dueDate) : "—"}</div></div>
        <div><div className="label">Total da fatura</div><div className="font-medium tabular-nums">{preview.statementTotal != null ? brl(preview.statementTotal) : "—"}</div></div>
        <div>
          <div className="label">Entra no ciclo</div>
          <select className="input py-1" value={cycle} onChange={(e) => setCycle(e.target.value)}>
            {[-2, -1, 0, 1, 2].map((n) => { const c = shift(preview.cycle!, n); return <option key={c} value={c}>{cycleName(c)}</option>; })}
          </select>
        </div>
        {!!preview.futureTotal && <p className="text-xs text-ink/50 md:col-span-4">Parcelas já comprometidas para as próximas faturas: <b>{brl(preview.futureTotal)}</b> (serão importadas quando as faturas chegarem).</p>}
        {preview.warnings?.map((w) => <p key={w} className="text-sm text-amber-700 md:col-span-4">⚠ {w}</p>)}
      </div>

      {(preview.cards?.length ?? 0) > 0 && (
        <div className="card">
          <h2 className="mb-3">Cartões encontrados</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {preview.cards!.map((c) => (
              <div key={c.last4} className="rounded-xl border border-ink/10 p-3">
                <div className="flex justify-between text-sm"><span className="font-medium">•••• {c.last4}</span><span className="tabular-nums">{brl(c.total)}</span></div>
                <select className="input mt-2 py-1" value={owners[c.last4] ?? ""} onChange={(e) => setOwners({ ...owners, [c.last4]: e.target.value || null })}>
                  <option value="">De quem é?</option>
                  {preview.members?.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
          <div className="text-sm">
            <b>{selected.length}</b> de {rows.length} selecionados · <b className="tabular-nums">{brl(total)}</b>
            {dupes > 0 && <span className="ml-2 text-amber-700">· {dupes} já importado(s) (desmarcados)</span>}
            {toClassify > 0 && <span className="ml-2 text-amber-700">· {toClassify} sem categoria</span>}
          </div>
          <div className="flex gap-1 text-sm">
            <button className={`rounded-lg px-3 py-1 ${filter === "todos" ? "bg-ink text-white" : "bg-ink/5"}`} onClick={() => setFilter("todos")}>Todos</button>
            <button className={`rounded-lg px-3 py-1 ${filter === "classificar" ? "bg-ink text-white" : "bg-ink/5"}`} onClick={() => setFilter("classificar")}>A classificar</button>
          </div>
        </div>
        <table className="table min-w-[860px]">
          <thead><tr><th className="w-8"></th><th>Data</th><th>Descrição</th><th>Cartão</th><th>Categoria</th><th className="num">Valor</th></tr></thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.idx} className={!include[r.idx] ? "opacity-40" : ""}>
                <td><input type="checkbox" checked={!!include[r.idx]} onChange={(e) => setInclude({ ...include, [r.idx]: e.target.checked })} aria-label="Incluir" /></td>
                <td className="whitespace-nowrap text-ink/60">{dt(r.date)}</td>
                <td>
                  <div>{r.description}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {r.installment && <span className="chip">{r.installment}</span>}
                    {r.bankCategory && <span className="chip">{r.bankCategory.toLowerCase()}</span>}
                    {r.city && <span className="chip">{r.city.toLowerCase()}</span>}
                    {r.duplicate && <span className="chip bg-amber-100 text-amber-800">já importado</span>}
                    {r.suggestionSource === "regra" && cats[r.idx] === r.suggestedCategoryId && <span className="chip bg-brand-soft text-brand">aprendido</span>}
                    {r.suggestionSource === "ia" && cats[r.idx] === r.suggestedCategoryId && <span className="chip bg-violet-50 text-violet-700">IA</span>}
                  </div>
                </td>
                <td className="text-xs text-ink/60">{r.cardLast4 ? `•••• ${r.cardLast4}` : ""}</td>
                <td>
                  <select className={`max-w-[230px] rounded-md border border-transparent bg-ink/[0.03] px-2 py-1 text-sm hover:border-ink/10 ${!cats[r.idx] || uncIds.has(cats[r.idx]!) ? "text-amber-700" : ""}`}
                    value={cats[r.idx] ?? ""} onChange={(e) => {
                      const v = e.target.value;
                      // Ao corrigir uma, aplica às demais do mesmo estabelecimento que ainda estão com a sugestão original
                      const same = rows.filter((x) => x.description === r.description && cats[x.idx] === cats[r.idx]);
                      setCats({ ...cats, ...Object.fromEntries(same.map((x) => [x.idx, v])) });
                    }} aria-label="Categoria">
                    <option value="">A classificar</option>
                    {groups.map((g) => <optgroup key={g} label={g}>{options.filter((o) => o.group === g).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</optgroup>)}
                  </select>
                </td>
                <td className={`num ${r.amount < 0 ? "text-gain" : ""}`}>{brl(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-2xl bg-ink/95 p-3 text-white shadow-lg">
        {result?.error && <span className="text-sm text-rose-300">{result.error}</span>}
        <span className="text-sm text-white/70">{selected.length} lançamentos · {brl(total)} → ciclo {cycleName(cycle)}</span>
        <button className="btn" onClick={submit} disabled={pending || selected.length === 0}>{pending ? "Importando…" : "Confirmar importação"}</button>
      </div>
    </div>
  );
}
