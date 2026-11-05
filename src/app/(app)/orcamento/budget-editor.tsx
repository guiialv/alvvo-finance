"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Kind, Scope } from "@/lib/categories-default";
import type { Category } from "@/lib/data";
import { type Group, KIND_COLOR, KIND_HINT, KIND_LABEL, KIND_ORDER } from "@/lib/groups";
import { groupColor } from "@/lib/theme";
import {
  deleteCategory, deleteGroup, deleteSubgroup, moveCategory, moveGroup, renameSubgroup, saveCategory, saveGroup, toggleCategoryActive,
} from "./edit-actions";

type Res = { ok?: true; error?: string };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<Res>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) { setError(r.error); return; }
      after?.();
      router.refresh();
    });
  return { pending, error, run, setError };
}

const icoBtn = "rounded-md px-1.5 py-0.5 text-xs text-ink/45 hover:bg-black/5 hover:text-ink disabled:opacity-30";
const ERR = ({ e }: { e: string | null }) => (e ? <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{e}</p> : null);

export function BudgetEditor({ scope, groups, cats, allGroups, allCats }: { scope: Scope; groups: Group[]; cats: Category[]; allGroups: Group[]; allCats: Category[] }) {
  const kinds = KIND_ORDER.filter((k) => scope === "pj" || k !== "transferencia" || groups.some((g) => g.kind === k));
  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-brand/20 bg-brand/[0.04] px-5 py-4 text-sm text-ink/70">
        <b className="text-ink">Modo de edição.</b> Crie, renomeie, reordene ou exclua grupos, subgrupos e categorias. O <b>tipo</b> do grupo define se ele conta como
        receita, investimento ou despesa nos totais. Ao excluir uma categoria, os lançamentos dela vão para a categoria que você escolher (ou para “A classificar”).
      </div>
      {kinds.map((k) => (
        <KindSection key={k} kind={k} scope={scope} groups={groups.filter((g) => g.kind === k)} cats={cats} allGroups={allGroups} allCats={allCats} />
      ))}
    </div>
  );
}

function KindSection({ kind, scope, groups, cats, allGroups, allCats }: { kind: Kind; scope: Scope; groups: Group[]; cats: Category[]; allGroups: Group[]; allCats: Category[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3 border-b-2 pb-2" style={{ borderColor: KIND_COLOR[kind] }}>
        <div>
          <h2 style={{ color: KIND_COLOR[kind] }}>{KIND_LABEL[kind]}</h2>
          <p className="text-xs text-ink/45">{KIND_HINT[kind]}</p>
        </div>
        <button className="btn-ghost text-sm" onClick={() => setAdding(true)}>+ Novo grupo</button>
      </div>
      <div className="space-y-3">
        {adding && <GroupForm scope={scope} kind={kind} onClose={() => setAdding(false)} />}
        {groups.map((g, i) => (
          <GroupCard key={g.id} g={g} first={i === 0} last={i === groups.length - 1} cats={cats.filter((c) => c.grp === g.name && c.scope === g.scope)} allGroups={allGroups} allCats={allCats} />
        ))}
        {!groups.length && !adding && <p className="rounded-xl border border-dashed border-ink/15 px-4 py-5 text-center text-sm text-ink/45">Nenhum grupo de {KIND_LABEL[kind].toLowerCase()} ainda.</p>}
      </div>
    </section>
  );
}

function GroupForm({ g, scope, kind, onClose }: { g?: Group; scope: Scope; kind: Kind; onClose: () => void }) {
  const { pending, error, run } = useRun();
  const [name, setName] = useState(g?.name ?? "");
  const [hint, setHint] = useState(g?.hint ?? "");
  const [k, setK] = useState<Kind>(g?.kind ?? kind);
  const [color, setColor] = useState(g ? groupColor(g.name, g.color) : KIND_COLOR[kind]);
  return (
    <form className="card border-brand/30" onSubmit={(e) => { e.preventDefault(); run(() => saveGroup({ id: g?.id, scope, kind: k, name, hint, color }), onClose); }}>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_1.5fr_auto]">
        <div><label className="label">Cor</label><input type="color" className="h-10 w-12 cursor-pointer rounded-lg border border-ink/10" value={color} onChange={(e) => setColor(e.target.value)} /></div>
        <div><label className="label">Nome do grupo</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={g?.system} autoFocus required maxLength={60} /></div>
        <div><label className="label">Descrição (opcional)</label><input className="input" value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Ex.: Mesmo valor todo mês" maxLength={120} /></div>
        <div>
          <label className="label">Tipo</label>
          <select className="input" value={k} onChange={(e) => setK(e.target.value as Kind)} disabled={g?.system}>
            {KIND_ORDER.map((x) => <option key={x} value={x}>{KIND_LABEL[x].replace(/s$/, "")}</option>)}
          </select>
        </div>
      </div>
      {g && k !== g.kind && <p className="mt-2 text-xs text-amber-700">As categorias deste grupo passam a contar como {KIND_LABEL[k].toLowerCase()}.</p>}
      <ERR e={error} />
      <div className="mt-3 flex gap-2"><button className="btn" disabled={pending}>{pending ? "Salvando…" : g ? "Salvar" : "Criar grupo"}</button><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button></div>
    </form>
  );
}

function GroupCard({ g, first, last, cats, allGroups, allCats }: { g: Group; first: boolean; last: boolean; cats: Category[]; allGroups: Group[]; allCats: Category[] }) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const { pending, error, run } = useRun();
  const [target, setTarget] = useState("");
  const col = groupColor(g.name, g.color);
  const subs = [...new Set(cats.map((c) => c.subgroup))].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : 0));
  const others = allGroups.filter((x) => x.id !== g.id && !x.id.startsWith("tmp-"));

  if (mode === "edit") return <GroupForm g={g} scope={g.scope} kind={g.kind} onClose={() => setMode("view")} />;

  return (
    <div className="card p-0">
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <span className="h-8 w-1 rounded-full" style={{ background: col }} />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{g.name}{g.system && <span className="chip ml-2">sistema</span>}</h3>
          {g.hint && <p className="text-xs text-ink/45">{g.hint}</p>}
        </div>
        <div className="flex items-center gap-0.5">
          <button className={icoBtn} disabled={first || pending} onClick={() => run(() => moveGroup(g.id, -1))} title="Subir">↑</button>
          <button className={icoBtn} disabled={last || pending} onClick={() => run(() => moveGroup(g.id, 1))} title="Descer">↓</button>
          <button className={icoBtn} onClick={() => setMode("edit")}>Editar</button>
          {!g.system && <button className={`${icoBtn} hover:!text-loss`} onClick={() => setMode("delete")}>Excluir</button>}
        </div>
      </div>

      {mode === "delete" && (
        <div className="mx-5 mb-3 rounded-xl bg-rose-50 p-4 text-sm">
          <p className="font-medium text-rose-800">Excluir o grupo “{g.name}”?</p>
          {cats.length > 0 ? (
            <>
              <p className="mt-1 text-rose-700/80">Ele tem {cats.length} categoria{cats.length > 1 ? "s" : ""}. O que fazer com elas?</p>
              <select className="input mt-2 max-w-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Escolha…</option>
                <optgroup label="Mover categorias para o grupo">
                  {others.map((x) => <option key={x.id} value={x.id}>{x.scope === "pj" ? "PJ · " : ""}{x.name} ({KIND_LABEL[x.kind].toLowerCase()})</option>)}
                </optgroup>
                <option value="__del">Excluir as categorias também (lançamentos vão para “A classificar”)</option>
              </select>
            </>
          ) : <p className="mt-1 text-rose-700/80">Ele está vazio.</p>}
          <ERR e={error} />
          <div className="mt-3 flex gap-2">
            <button className="btn !bg-loss" disabled={pending || (cats.length > 0 && !target)}
              onClick={() => run(() => deleteGroup(g.id, target === "__del" ? { deleteCategories: true } : { moveTo: target || undefined }))}>
              {pending ? "Excluindo…" : "Excluir grupo"}
            </button>
            <button className="btn-ghost" onClick={() => setMode("view")}>Cancelar</button>
          </div>
        </div>
      )}
      {mode === "view" && <ERR e={error} />}

      <div className="border-t border-ink/5 px-5 pb-4">
        {subs.map((sg) => (
          <div key={sg || "_"} className="mt-3">
            {sg && <SubgroupHeader g={g} sub={sg} count={cats.filter((c) => c.subgroup === sg).length} />}
            <ul className="divide-y divide-ink/5">
              {cats.filter((c) => c.subgroup === sg).map((c, i, arr) => (
                <CategoryRow key={c.id} c={c} g={g} subs={subs} first={i === 0} last={i === arr.length - 1} allGroups={allGroups} allCats={allCats} />
              ))}
            </ul>
          </div>
        ))}
        <AddCategory g={g} subs={subs} />
      </div>
    </div>
  );
}

function SubgroupHeader({ g, sub, count }: { g: Group; sub: string; count: number }) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [name, setName] = useState(sub);
  const { pending, error, run } = useRun();
  if (mode === "edit") {
    return (
      <form className="flex flex-wrap items-center gap-2 py-1" onSubmit={(e) => { e.preventDefault(); run(() => renameSubgroup(g.scope, g.name, sub, name), () => setMode("view")); }}>
        <input className="input max-w-[220px] py-1 text-sm" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} />
        <button className="btn py-1 text-xs" disabled={pending}>Salvar</button>
        <button type="button" className="btn-ghost py-1 text-xs" onClick={() => setMode("view")}>Cancelar</button>
        <ERR e={error} />
      </form>
    );
  }
  return (
    <div>
      <div className="group flex items-center gap-2 py-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink/45">{sub}</span>
        <span className="text-[11px] text-ink/30">· subgrupo</span>
        <button className={`${icoBtn} opacity-0 group-hover:opacity-100 focus:opacity-100`} onClick={() => setMode("edit")}>Renomear</button>
        <button className={`${icoBtn} opacity-0 hover:!text-loss group-hover:opacity-100 focus:opacity-100`} onClick={() => setMode("delete")}>Excluir</button>
      </div>
      {mode === "delete" && (
        <div className="mb-2 rounded-xl bg-rose-50 p-3 text-sm">
          <p className="text-rose-800">Excluir o subgrupo “{sub}” ({count} categoria{count > 1 ? "s" : ""})?</p>
          <ERR e={error} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn-ghost text-xs" disabled={pending} onClick={() => run(() => deleteSubgroup(g.scope, g.name, sub, false))}>Manter as categorias no grupo, sem subgrupo</button>
            <button className="btn !bg-loss text-xs" disabled={pending} onClick={() => run(() => deleteSubgroup(g.scope, g.name, sub, true))}>Excluir as categorias também</button>
            <button className="btn-ghost text-xs" onClick={() => setMode("view")}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryRow({ c, g, subs, first, last, allGroups, allCats }: { c: Category; g: Group; subs: string[]; first: boolean; last: boolean; allGroups: Group[]; allCats: Category[] }) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const { pending, error, run } = useRun();
  const [name, setName] = useState(c.name);
  const [sub, setSub] = useState(c.subgroup);
  const [groupId, setGroupId] = useState(g.id);
  const [excluded, setExcluded] = useState(c.excluded_from_totals);
  const [target, setTarget] = useState("");
  const locked = c.grp === "A classificar";
  const listId = `subs-${c.id}`;

  if (mode === "edit") {
    return (
      <li className="py-2">
        <form className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); run(() => saveCategory({ id: c.id, groupId, subgroup: sub, name, excluded }), () => setMode("view")); }}>
          <input className="input py-1.5 text-sm" value={name} onChange={(e) => setName(e.target.value)} autoFocus required maxLength={60} placeholder="Nome" />
          <div>
            <input className="input py-1.5 text-sm" value={sub} onChange={(e) => setSub(e.target.value)} list={listId} placeholder="Subgrupo (opcional)" maxLength={60} />
            <datalist id={listId}>{subs.filter(Boolean).map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <select className="input py-1.5 text-sm" value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={locked}>
            {allGroups.filter((x) => !x.id.startsWith("tmp-")).map((x) => <option key={x.id} value={x.id}>{x.scope === "pj" ? "PJ · " : ""}{x.name}</option>)}
          </select>
          <div className="flex gap-1"><button className="btn py-1.5 text-xs" disabled={pending}>Salvar</button><button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setMode("view")}>Cancelar</button></div>
          <label className="flex items-center gap-2 text-xs text-ink/60 sm:col-span-4">
            <input type="checkbox" checked={excluded} onChange={(e) => setExcluded(e.target.checked)} /> Fora do total (não soma nas receitas, investimentos ou despesas)
          </label>
        </form>
        <ERR e={error} />
      </li>
    );
  }

  return (
    <li className="py-1.5">
      <div className="group flex items-center gap-2 text-sm">
        <span className={`flex-1 ${c.active ? "" : "text-ink/35 line-through"}`}>{c.name}</span>
        {c.excluded_from_totals && <span className="chip">fora do total</span>}
        {!c.active && <span className="chip">oculta</span>}
        <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100">
          <button className={icoBtn} disabled={first || pending} onClick={() => run(() => moveCategory(c.id, -1))} title="Subir">↑</button>
          <button className={icoBtn} disabled={last || pending} onClick={() => run(() => moveCategory(c.id, 1))} title="Descer">↓</button>
          <button className={icoBtn} onClick={() => setMode("edit")}>Editar</button>
          {!locked && <button className={icoBtn} disabled={pending} onClick={() => run(() => toggleCategoryActive(c.id, !c.active))}>{c.active ? "Ocultar" : "Reativar"}</button>}
          {!locked && <button className={`${icoBtn} hover:!text-loss`} onClick={() => setMode("delete")}>Excluir</button>}
        </div>
      </div>
      {mode === "delete" && (
        <div className="mt-2 rounded-xl bg-rose-50 p-3 text-sm">
          <p className="text-rose-800">Excluir “{c.name}”? Os lançamentos, regras e itens da agenda dela vão para:</p>
          <select className="input mt-2 max-w-sm py-1.5 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">A classificar</option>
            {allCats.filter((x) => x.id !== c.id && x.active && x.grp !== "A classificar").map((x) => <option key={x.id} value={x.id}>{x.scope === "pj" ? "PJ · " : ""}{x.grp} › {x.name}</option>)}
          </select>
          <p className="mt-1 text-xs text-ink/50">Se preferir guardar o histórico, use “Ocultar”: a categoria some das listas, mas continua nos lançamentos antigos.</p>
          <ERR e={error} />
          <div className="mt-2 flex gap-2">
            <button className="btn !bg-loss text-xs" disabled={pending} onClick={() => run(() => deleteCategory(c.id, target || undefined))}>{pending ? "Excluindo…" : "Excluir categoria"}</button>
            <button className="btn-ghost text-xs" onClick={() => setMode("view")}>Cancelar</button>
          </div>
        </div>
      )}
      {mode === "view" && <ERR e={error} />}
    </li>
  );
}

function AddCategory({ g, subs }: { g: Group; subs: string[] }) {
  const [name, setName] = useState("");
  const [sub, setSub] = useState("");
  const { pending, error, run } = useRun();
  const listId = `add-subs-${g.id}`;
  if (g.id.startsWith("tmp-")) return null;
  return (
    <form className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-ink/10 pt-3" onSubmit={(e) => { e.preventDefault(); run(() => saveCategory({ groupId: g.id, subgroup: sub, name }), () => setName("")); }}>
      <input className="input max-w-[240px] py-1.5 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova categoria" required maxLength={60} />
      <input className="input max-w-[200px] py-1.5 text-sm" value={sub} onChange={(e) => setSub(e.target.value)} list={listId} placeholder="Subgrupo (novo ou existente)" maxLength={60} />
      <datalist id={listId}>{subs.filter(Boolean).map((s) => <option key={s} value={s} />)}</datalist>
      <button className="btn-ghost py-1.5 text-xs" disabled={pending}>{pending ? "Adicionando…" : "+ Adicionar"}</button>
      <ERR e={error} />
    </form>
  );
}
