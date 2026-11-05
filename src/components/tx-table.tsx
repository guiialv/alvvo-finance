"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cycleLabel, cycleRangeLabel, shiftCycle } from "@/lib/cycle";
import { formatBRL, formatDateBR } from "@/lib/format";
import type { Scope } from "@/lib/categories-default";
import { groupColor } from "@/lib/theme";
import { deleteTransactionById, updateTransaction } from "@/app/(app)/lancamentos/actions";
import { Avatar, GroupTag, Pill } from "./ui";
import { Icon } from "./icons";

export interface TxView {
  id: string; date: string; cycle: string; description: string; amount: number; kind: string; scope: string;
  category_id: string | null; member_user_id: string | null; notes: string | null; merchant_key: string | null;
  installment_no: number | null; installment_total: number | null; bank_category: string | null; city: string | null;
  international: boolean; foreign_amount: number | null; foreign_currency: string | null; fx_rate: number | null;
  source: string; account_name: string | null; batch_label: string | null; same_merchant: number;
}
export interface CatLite { id: string; name: string; grp: string; subgroup: string; scope: Scope; kind: string; active: boolean; color?: string | null }
export interface MemberLite { user_id: string; display_name: string; index: number }

const title = (s: string | null) => (s ?? "").toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());

export function TxTable({ rows, cats, members, cycleStartDay, showAccount = true }: {
  rows: TxView[]; cats: CatLite[]; members: MemberLite[]; cycleStartDay: number; showAccount?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const byId = useMemo(() => new Map(cats.map((c) => [c.id, c] as [string, CatLite])), [cats]);
  const mem = useMemo(() => new Map(members.map((m) => [m.user_id, m] as [string, MemberLite])), [members]);
  const tx = open ? rows.find((r) => r.id === open) : null;

  return (
    <>
      <table className="table min-w-[720px]">
        <thead><tr><th>Data</th><th>Descrição</th><th>Perfil / categoria</th><th>Quem</th><th className="num">Valor</th></tr></thead>
        <tbody>
          {rows.map((t) => {
            const c = t.category_id ? byId.get(t.category_id) : undefined;
            const income = (c?.kind ?? t.kind) === "receita";
            const m = t.member_user_id ? mem.get(t.member_user_id) : undefined;
            return (
              <tr key={t.id} className="group cursor-pointer hover:bg-brand/[0.03]" onClick={() => setOpen(t.id)}>
                <td className="whitespace-nowrap text-ink/55">{formatDateBR(t.date).slice(0, 5)}</td>
                <td>
                  <div className="font-medium">{t.description}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    {t.installment_total && <span className="chip">parcela {t.installment_no}/{t.installment_total}</span>}
                    {t.city && <span className="chip">{title(t.city)}</span>}
                    {t.international && <span className="chip"><Icon name="globe" className="h-3 w-3" />internacional</span>}
                    {showAccount && t.account_name && <span className="chip">{t.account_name}</span>}
                    {t.source !== "manual" && t.source !== "fatura" && <span className="chip">{t.source}</span>}
                    {t.notes && <span className="chip">📝 {t.notes}</span>}
                  </div>
                </td>
                <td><div className="flex flex-col items-start gap-1">{c && c.grp !== "A classificar" && <GroupTag grp={c.grp} />}<Pill cat={c} /></div></td>
                <td>{m && <Avatar name={m.display_name} index={m.index} />}</td>
                <td className={`num font-medium ${income || t.amount < 0 ? "text-gain" : ""}`}>
                  {income ? "+" : ""}{formatBRL(t.amount)}
                  <span className="ml-2 inline-block text-transparent group-hover:text-ink/40"><Icon name="edit" className="inline h-3.5 w-3.5" /></span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {tx && <TxDrawer key={tx.id} tx={tx} cats={cats} byId={byId} members={members} cycleStartDay={cycleStartDay} onClose={() => setOpen(null)} />}
    </>
  );
}

export function TxDrawer({ tx, cats, byId, members, cycleStartDay, onClose }: {
  tx: TxView; cats: CatLite[]; byId: Map<string, CatLite>; members: MemberLite[]; cycleStartDay: number; onClose: () => void;
}) {
  const router = useRouter();
  const cur = tx.category_id ? byId.get(tx.category_id) : undefined;
  const [scope, setScope] = useState<Scope>((cur?.scope ?? tx.scope ?? "pessoal") as Scope);
  const [grp, setGrp] = useState<string>(cur && cur.grp !== "A classificar" ? cur.grp : "");
  const [catId, setCatId] = useState<string>(cur && cur.grp !== "A classificar" ? cur.id : "");
  const [member, setMember] = useState(tx.member_user_id ?? members[0]?.user_id ?? "");
  const [cycle, setCycle] = useState(tx.cycle);
  const [notes, setNotes] = useState(tx.notes ?? "");
  const [learn, setLearn] = useState(true);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const groups = [...new Set(cats.filter((c) => c.active && c.scope === scope).map((c) => c.grp))].filter((g) => g !== "A classificar");
  const options = cats.filter((c) => c.active && c.scope === scope && c.grp === grp);

  const row = (l: string, v: React.ReactNode) => <div className="flex justify-between gap-4 py-2 text-sm"><span className="text-ink/50">{l}</span><span className="text-right font-medium">{v}</span></div>;

  const save = () => {
    if (grp && !catId) { setMsg("Escolha a categoria."); return; }
    start(async () => {
      const r = await updateTransaction(tx.id, { categoryId: catId || null, memberUserId: member || null, cycle, notes: notes || null, learn });
      if (r.error) { setMsg(r.error); return; }
      router.refresh();
      onClose();
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl" role="dialog" aria-label="Detalhes do lançamento">
        <div className="flex items-start justify-between gap-3 border-b border-ink/5 p-5">
          <div>
            <div className="label">{tx.source === "fatura" ? "Item da fatura" : "Lançamento"}</div>
            <h2 className="mt-0.5 text-xl">{tx.description}</h2>
            <div className={`mt-1 text-2xl font-semibold tabular-nums ${tx.amount < 0 ? "text-gain" : ""}`}>{formatBRL(tx.amount)}</div>
          </div>
          <button className="rounded-lg p-1.5 text-ink/40 hover:bg-ink/5 hover:text-ink" onClick={onClose} aria-label="Fechar"><Icon name="x" className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="label mb-1">Como foi lançado</div>
          <div className="mb-5 divide-y divide-ink/5 rounded-xl bg-ink/[0.025] px-4">
            {row("Data da compra", formatDateBR(tx.date))}
            {row("Ciclo de competência", <>{cycleLabel(tx.cycle)} <span className="font-normal text-ink/40">({cycleRangeLabel(tx.cycle, cycleStartDay)})</span></>)}
            {row("Visão", (cur?.scope ?? tx.scope) === "pj" ? "PJ" : "Pessoal")}
            {row("Perfil do gasto", cur && cur.grp !== "A classificar" ? <GroupTag grp={cur.grp} /> : "—")}
            {row("Categoria", <Pill cat={cur} />)}
            {tx.account_name && row("Cartão / conta", tx.account_name)}
            {tx.installment_total && row("Parcela", `${tx.installment_no}/${tx.installment_total}`)}
            {tx.bank_category && row("Categoria do banco", title(tx.bank_category))}
            {tx.city && row("Cidade", title(tx.city))}
            {tx.foreign_currency && row("Moeda original", `${tx.foreign_currency} ${Number(tx.foreign_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · câmbio ${Number(tx.fx_rate).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`)}
            {row("Origem", tx.source === "fatura" ? (tx.batch_label ?? "Fatura") : tx.source === "agenda" ? "Agenda" : tx.source === "manual" ? "Manual" : tx.source.toUpperCase())}
          </div>

          <div className="label mb-2">Alterar perfil do gasto</div>
          <div className="space-y-3">
            <div className="inline-flex rounded-xl bg-ink/[0.05] p-1 text-sm">
              {(["pessoal", "pj"] as const).map((s) => (
                <button key={s} type="button" onClick={() => { setScope(s); setGrp(""); setCatId(""); }}
                  className={`rounded-lg px-3 py-1.5 font-medium ${scope === s ? "bg-white shadow-sm" : "text-ink/55"}`}>{s === "pj" ? "PJ" : "Pessoal"}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => {
                const col = groupColor(g, cats.find((c) => c.grp === g && c.scope === scope)?.color);
                return (
                  <button key={g} type="button" onClick={() => { setGrp(g); setCatId(""); }} className="rounded-full border px-3 py-1.5 text-xs font-medium transition"
                    style={grp === g ? { background: col, borderColor: col, color: "#fff" } : { borderColor: `${col}40`, color: col }}>{g}</button>
                );
              })}
            </div>
            <div>
              <label className="label">Categoria</label>
              <select className="input" value={catId} disabled={!grp} onChange={(e) => setCatId(e.target.value)}>
                {!grp ? <option>Escolha o perfil primeiro</option> : <option value="">Escolha…</option>}
                {[...new Set(options.map((o) => o.subgroup))].map((sg) => (
                  <optgroup key={sg || "_"} label={sg || grp}>{options.filter((o) => o.subgroup === sg).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Quem gastou</label>
                <select className="input" value={member} onChange={(e) => setMember(e.target.value)}>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></div>
              <div><label className="label">Ciclo</label>
                <select className="input" value={cycle} onChange={(e) => setCycle(e.target.value)}>{[-2, -1, 0, 1, 2].map((n) => { const c = shiftCycle(tx.cycle, n); return <option key={c} value={c}>{cycleLabel(c)}</option>; })}</select></div>
            </div>
            <div><label className="label">Observação</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: presente de aniversário da mãe" /></div>
            {tx.merchant_key && (
              <label className="flex items-start gap-2 rounded-xl bg-brand/[0.06] p-3 text-sm">
                <input type="checkbox" className="mt-0.5 accent-[#0f766e]" checked={learn} onChange={(e) => setLearn(e.target.checked)} />
                <span><b>Lembrar para “{tx.merchant_key}”</b><br /><span className="text-ink/55">Aplica aos {tx.same_merchant ? `${tx.same_merchant} outros lançamentos` : "próximos lançamentos"} deste estabelecimento e às próximas faturas.</span></span>
              </label>
            )}
            {msg && <p className="text-sm text-loss">{msg}</p>}
          </div>
        </div>
        <div className="flex gap-2 border-t border-ink/5 p-4">
          <button className="btn-ghost text-loss" disabled={pending} onClick={() => start(async () => { await deleteTransactionById(tx.id); router.refresh(); onClose(); })}>Excluir</button>
          <div className="flex-1" />
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={save} disabled={pending}>{pending ? "Salvando…" : "Salvar"}</button>
        </div>
      </aside>
    </>
  );
}
