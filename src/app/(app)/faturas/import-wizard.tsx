"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
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

type Status = "fila" | "lendo" | "senha" | "pronta" | "importando" | "feita" | "erro";
interface Item { id: string; file: File; status: Status; password: string; preview?: Preview; result?: { inserted?: number; batchId?: string; error?: string; reconciled?: number }; note?: string }
/** Soma com sinal: em extratos, entradas somam e saídas subtraem. */
const net = (rows: { amount: number; flow: "entrada" | "saida" | null }[]) => rows.reduce((a, r) => a + (r.flow === "entrada" ? r.amount : r.flow === "saida" ? -r.amount : r.amount), 0);
const ACCEPT = ".pdf,.csv,.ofx,.qfx,.txt";
const okExt = (f: File) => /\.(pdf|csv|ofx|qfx|txt)$/i.test(f.name);
const ST: Record<Status, [string, string]> = {
  fila: ["Na fila", "bg-ink/5 text-ink/55"], lendo: ["Lendo…", "bg-sky-50 text-sky-700"], senha: ["Precisa de senha", "bg-amber-50 text-amber-800"],
  pronta: ["Pronta para revisar", "bg-violet-50 text-violet-700"], importando: ["Importando…", "bg-sky-50 text-sky-700"], feita: ["Importada", "bg-emerald-50 text-emerald-700"], erro: ["Erro", "bg-rose-50 text-rose-700"],
};

/** Importação em lote: vários arquivos (botão ou arrastar e soltar), leitura com o leitor do banco ou IA, e importação automática. */
export function ImportWizard({ options }: { options: CatOpt[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [password, setPassword] = useState("");
  const [auto, setAuto] = useState(true);
  const [running, setRunning] = useState(false);
  const [drag, setDrag] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const router = useRouter();
  const patch = (id: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const add = (files: FileList | File[] | null) => {
    if (!files) return;
    const list = [...files].filter(okExt);
    setItems((xs) => [...xs, ...list.filter((f) => !xs.some((x) => x.file.name === f.name && x.file.size === f.size)).map((f) => ({ id: `${f.name}-${f.size}-${Math.random()}`, file: f, status: "fila" as Status, password: "" }))]);
  };

  async function processOne(it: Item, globalPw: string) {
    patch(it.id, { status: "lendo", note: undefined });
    const fd = new FormData();
    fd.append("file", it.file);
    const pw = it.password || globalPw;
    if (pw) fd.append("password", pw);
    let pv: Preview;
    try { pv = await analyzeStatement(undefined, fd); } catch (e) { patch(it.id, { status: "erro", note: (e as Error).message || "Falha ao ler o arquivo." }); return; }
    if (pv.needsPassword) { patch(it.id, { status: "senha", note: pv.error }); return; }
    if (pv.error || !pv.rows) { patch(it.id, { status: "erro", note: pv.error ?? "Nenhum lançamento encontrado." }); return; }
    if (!auto) { patch(it.id, { status: "pronta", preview: pv }); return; }
    const rows = pv.rows.filter((r) => !r.duplicate);
    if (!rows.length) { patch(it.id, { status: "feita", preview: pv, result: { inserted: 0 }, note: "Todos os lançamentos já tinham sido importados antes." }); return; }
    patch(it.id, { status: "importando", preview: pv });
    const r = await confirmImport({
      fileName: pv.fileName!, source: pv.source!, docType: pv.docType, accountRef: pv.accountRef ?? null, bank: pv.bank!, dueDate: pv.dueDate ?? null, statementTotal: pv.statementTotal ?? null, futureTotal: pv.futureTotal ?? null,
      futureItems: pv.futureItems, cardTotals: pv.cardTotals, currentTotal: pv.currentTotal ?? null,
      cycle: pv.cycle!, cards: (pv.cards ?? []).map((c) => ({ last4: c.last4, ownerUserId: c.ownerUserId })), rows: rows.map((x) => ({ ...x, categoryId: x.suggestedCategoryId })),
    });
    patch(it.id, r.error ? { status: "erro", note: r.error, result: r } : { status: "feita", result: r });
  }

  async function runAll(only?: string) {
    setRunning(true);
    const queue = items.filter((x) => (only ? x.id === only : ["fila", "senha", "erro"].includes(x.status)));
    for (const it of queue) await processOne(it, password); // um de cada vez: mais estável para PDFs grandes e para a IA
    setRunning(false);
    router.refresh();
  }

  const done = items.filter((x) => x.status === "feita"), inserted = done.reduce((a, x) => a + (x.result?.inserted ?? 0), 0);
  const pendingCount = items.filter((x) => ["fila", "senha", "erro"].includes(x.status)).length;
  const reviewing = items.find((x) => x.id === reviewId && x.preview?.rows);

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
        className={`card flex flex-col items-center gap-3 border-2 border-dashed py-10 text-center transition ${drag ? "border-brand bg-brand/[0.04]" : "border-ink/10"}`}>
        <div className="text-3xl">📄</div>
        <div><div className="font-semibold">Arraste e solte faturas e extratos aqui</div><p className="text-sm text-ink/50">Quantos arquivos quiser: faturas de cartão e extratos de conta, em PDF de qualquer banco, CSV ou OFX.</p></div>
        <label className="btn cursor-pointer">Selecionar arquivos<input type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { add(e.currentTarget.files); e.currentTarget.value = ""; }} /></label>
        <p className="text-xs text-ink/40">Faturas do Itaú são lidas pelo leitor próprio; as de outros bancos e os extratos, com IA. Pagamentos de fatura no extrato são conferidos com as faturas para não contar em dobro. Os arquivos são lidos no servidor e não ficam armazenados.</p>
      </div>

      {items.length > 0 && (
        <section className="card p-0">
          <div className="flex flex-wrap items-end gap-3 border-b border-ink/5 px-5 py-3">
            <div className="min-w-[220px] flex-1"><label className="label">Senha dos PDFs protegidos (opcional)</label>
              <input className="input" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Ex.: os 5 primeiros dígitos do CPF" />
              <p className="mt-1 text-[11px] text-ink/45">Usada só para abrir os arquivos nesta leitura; não fica salva.</p></div>
            <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Importar automaticamente (sem revisar uma a uma)</label>
            <button className="btn" disabled={running || !pendingCount} onClick={() => runAll()}>{running ? "Processando…" : `Ler e importar ${pendingCount} arquivo(s)`}</button>
          </div>
          <div className="divide-y divide-ink/5">
            {items.map((it) => { const pv = it.preview, isExt = pv?.docType === "extrato", tot = pv?.rows ? (isExt ? net(pv.rows.filter((r) => !r.duplicate)) : pv.rows.filter((r) => !r.duplicate).reduce((a, r) => a + r.amount, 0)) : 0, diff = !isExt && pv?.statementTotal != null ? Math.abs(tot - pv.statementTotal) : null; return (
              <div key={it.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-[200px] flex-1">
                  <div className="font-medium">{it.file.name} <span className="text-xs font-normal text-ink/40">{(it.file.size / 1024).toFixed(0)} KB</span></div>
                  {pv?.rows && <div className="text-xs text-ink/55">{pv.bank} · {isExt ? "extrato bancário" : `fatura · ciclo ${cycleName(pv.cycle!)}`} · {pv.rows.length} itens · {isExt ? `saldo do período ${brl(tot)}` : brl(tot)}{pv.readWith === "ia" ? " · lida com IA" : ""}
                    {diff != null && (diff < 1 ? <span className="text-gain"> · confere com o total da fatura</span> : <span className="text-amber-700"> · total da fatura {brl(pv.statementTotal!)} (confira)</span>)}</div>}
                  {it.note && <div className={`text-xs ${it.status === "erro" ? "text-loss" : "text-ink/55"}`}>{it.note}</div>}
                  {it.result?.inserted != null && it.status === "feita" && it.result.inserted > 0 && <div className="text-xs text-gain">{it.result.inserted} lançamentos importados{it.result.reconciled ? ` · ${it.result.reconciled} pagamento do extrato conferido com esta fatura (sem duplicidade)` : ""}</div>}
                </div>
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${ST[it.status][1]}`}>{ST[it.status][0]}</span>
                {it.status === "senha" && (
                  <span className="flex items-center gap-1">
                    <input className="input w-40 py-1" type="password" placeholder="Senha deste PDF" value={it.password} onChange={(e) => patch(it.id, { password: e.target.value })} />
                    <button className="btn-ghost !py-1 text-xs" disabled={running || !it.password} onClick={() => runAll(it.id)}>Abrir</button>
                  </span>)}
                {it.status === "erro" && <button className="btn-ghost !py-1 text-xs" disabled={running} onClick={() => runAll(it.id)}>Tentar de novo</button>}
                {it.status === "pronta" && <button className="btn-ghost !py-1 text-xs" onClick={() => setReviewId(it.id)}>Revisar e importar</button>}
                {it.result?.batchId && <Link className="btn-ghost !py-1 text-xs" href={`/faturas/${it.result.batchId}`}>{isExt ? "Ver extrato" : "Ver fatura"}</Link>}
                {["fila", "senha", "erro"].includes(it.status) && !running && <button className="text-xs text-ink/35 hover:text-loss" onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))}>Remover</button>}
              </div>); })}
          </div>
          {done.length > 0 && <div className="border-t border-ink/5 px-5 py-3 text-sm text-ink/70">✓ {done.length} fatura(s) processada(s), {inserted} lançamentos importados. As categorias vêm das suas regras e da IA; você ajusta item a item em cada fatura, e a plataforma aprende com as correções.</div>}
        </section>
      )}

      {reviewing && <Review key={reviewing.id} preview={reviewing.preview!} options={options} onDone={(r) => { patch(reviewing.id, { status: r.error ? "erro" : "feita", result: r, note: r.error }); setReviewId(null); router.refresh(); }} />}
    </div>
  );
}

function Review({ preview, options, onDone }: { preview: Preview; options: CatOpt[]; onDone?: (r: { error?: string; inserted?: number; batchId?: string }) => void }) {
  const rows = preview.rows!;
  const isExt = preview.docType === "extrato";
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
  const total = isExt ? net(selected) : selected.reduce((a, r) => a + r.amount, 0);
  const entradas = selected.filter((r) => r.flow === "entrada").reduce((a, r) => a + r.amount, 0), saidas = selected.filter((r) => r.flow === "saida").reduce((a, r) => a + r.amount, 0);
  const dupes = rows.filter((r) => r.duplicate).length;
  const toClassify = selected.filter((r) => !cats[r.idx] || uncIds.has(cats[r.idx]!)).length;
  const visible = filter === "classificar" ? rows.filter((r) => !cats[r.idx] || uncIds.has(cats[r.idx]!)) : rows;

  if (result?.inserted !== undefined) {
    return (
      <div className="card space-y-2">
        <h2 className="text-gain">✓ {result.inserted} lançamentos importados{isExt ? "" : ` no ciclo ${cycleName(cycle)}`}</h2>
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
      fileName: preview.fileName!, source: preview.source!, docType: preview.docType, accountRef: preview.accountRef ?? null, bank: preview.bank!, dueDate: preview.dueDate ?? null,
      statementTotal: preview.statementTotal ?? null, futureTotal: preview.futureTotal ?? null, cycle,
      futureItems: preview.futureItems, cardTotals: preview.cardTotals, currentTotal: preview.currentTotal ?? null,
      cards: (preview.cards ?? []).map((c) => ({ last4: c.last4, ownerUserId: owners[c.last4] ?? null })),
      rows: selected.map((r) => ({ ...r, categoryId: cats[r.idx] ?? null })),
    });
    if (onDone) { onDone(r); return; }
    setResult(r);
    if (r.batchId) router.push(`/faturas/${r.batchId}`);
  });

  return (
    <div className="space-y-4">
      <div className="card grid gap-4 md:grid-cols-4">
        <div><div className="label">Banco</div><div className="font-medium">{preview.bank}</div></div>
        {isExt ? (<>
          <div><div className="label">Entradas</div><div className="font-medium tabular-nums text-gain">{brl(entradas)}</div></div>
          <div><div className="label">Saídas</div><div className="font-medium tabular-nums">{brl(saidas)}</div></div>
          <div><div className="label">Ciclos</div><div className="text-sm">Cada lançamento entra no ciclo da sua data</div></div>
        </>) : (<>
        <div><div className="label">Vencimento</div><div className="font-medium">{preview.dueDate ? dt(preview.dueDate) : "—"}</div></div>
        <div><div className="label">Total da fatura</div><div className="font-medium tabular-nums">{preview.statementTotal != null ? brl(preview.statementTotal) : "—"}</div></div>
        <div>
          <div className="label">Entra no ciclo</div>
          <select className="input py-1" value={cycle} onChange={(e) => setCycle(e.target.value)}>
            {[-2, -1, 0, 1, 2].map((n) => { const c = shift(preview.cycle!, n); return <option key={c} value={c}>{cycleName(c)}</option>; })}
          </select>
          <p className="mt-1 text-[11px] text-ink/45">Compras no cartão contam no ciclo em que a fatura é paga.</p>
        </div>
        </>)}
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
          <thead><tr><th className="w-8"></th><th>Data</th><th>Descrição</th><th>{isExt ? "Ciclo" : "Cartão"}</th><th>Categoria</th><th className="num">Valor</th></tr></thead>
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
                    {r.note && <span className={`chip ${r.reconciledBatchId ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>{r.reconciledBatchId ? "✓ " : ""}{r.note}</span>}
                    {r.suggestionSource === "regra" && cats[r.idx] === r.suggestedCategoryId && <span className="chip bg-brand-soft text-brand">aprendido</span>}
                    {r.suggestionSource === "ia" && cats[r.idx] === r.suggestedCategoryId && <span className="chip bg-violet-50 text-violet-700">IA</span>}
                  </div>
                </td>
                <td className="text-xs text-ink/60">{isExt ? cycleName(r.cycle) : r.cardLast4 ? `•••• ${r.cardLast4}` : ""}</td>
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
                <td className={`num ${r.flow === "entrada" || r.amount < 0 ? "text-gain" : ""}`}>{r.flow === "entrada" ? `+ ${brl(r.amount)}` : r.flow === "saida" ? `− ${brl(r.amount)}` : brl(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-2xl bg-ink/95 p-3 text-white shadow-lg">
        {result?.error && <span className="text-sm text-rose-300">{result.error}</span>}
        <span className="text-sm text-white/70">{selected.length} lançamentos · {brl(total)}{isExt ? "" : ` → ciclo ${cycleName(cycle)}`}</span>
        <button className="btn" onClick={submit} disabled={pending || selected.length === 0}>{pending ? "Importando…" : "Confirmar importação"}</button>
      </div>
    </div>
  );
}
