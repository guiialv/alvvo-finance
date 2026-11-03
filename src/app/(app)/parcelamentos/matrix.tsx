"use client";

import { useMemo, useState } from "react";
import { formatBRL, formatDateBR } from "@/lib/format";
import { groupColor } from "@/lib/theme";
import { Avatar, Pill } from "@/components/ui";
import { TxDrawer, type CatLite, type MemberLite, type TxView } from "@/components/tx-table";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const lbl = (c: string) => `${MESES[Number(c.slice(5, 7)) - 1]}/${c.slice(2, 4)}`;

export interface PlanRow {
  key: string; description: string; purchaseDate: string; installmentAmount: number; total: number; installmentTotal: number;
  category_id: string | null; account_name: string | null; member_user_id: string | null; notes: string | null; latestTxId: string;
  cells: Record<string, { n: number; amount: number; known: boolean; status: "pago" | "atual" | "previsto" }>;
  remaining: number; remainingCount: number; lastCycle: string; currentN: number | null;
}

export function InstallmentMatrix({ plans, cycles, current, totals, cats, members, views, cycleStartDay }: {
  plans: PlanRow[]; cycles: string[]; current: string; totals: number[]; cats: CatLite[]; members: MemberLite[];
  views: Record<string, TxView>; cycleStartDay: number;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const byId = useMemo(() => new Map(cats.map((c) => [c.id, c] as [string, CatLite])), [cats]);
  const mem = useMemo(() => new Map(members.map((m) => [m.user_id, m] as [string, MemberLite])), [members]);
  const tx = open ? views[open] : null;

  return (
    <>
      <table className="table min-w-[1100px] text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 min-w-[260px] bg-white">Compra</th>
            <th className="num">Parcela</th>
            <th className="num">Total</th>
            <th className="num">A vencer</th>
            {cycles.map((c) => <th key={c} className={`num ${c === current ? "!text-brand" : ""}`}>{lbl(c)}</th>)}
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => {
            const c = p.category_id ? byId.get(p.category_id) : undefined;
            const m = p.member_user_id ? mem.get(p.member_user_id) : undefined;
            return (
              <tr key={p.key} className={`group cursor-pointer hover:bg-brand/[0.03] ${p.remainingCount === 0 ? "opacity-50" : ""}`} onClick={() => setOpen(p.latestTxId)}>
                <td className="sticky left-0 z-10 bg-white group-hover:bg-[#f7fbfa]">
                  <div className="flex items-start gap-2">
                    <span className="mt-1 h-8 w-1 shrink-0 rounded-full" style={{ background: groupColor(c?.grp) }} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{p.description}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <Pill cat={c} />
                        {m && <Avatar name={m.display_name} index={m.index} size="h-4 w-4 text-[8px]" />}
                        <span className="text-[11px] text-ink/45">{formatDateBR(p.purchaseDate)}{p.account_name ? ` · ${p.account_name}` : ""}</span>
                      </div>
                      {p.notes && <div className="mt-0.5 text-[11px] text-ink/55">📝 {p.notes}</div>}
                    </div>
                  </div>
                </td>
                <td className="num">{p.currentN ? <b>{p.currentN}</b> : "—"}<span className="text-ink/40">/{p.installmentTotal}</span></td>
                <td className="num">{formatBRL(p.total)}</td>
                <td className="num font-semibold">{p.remaining ? formatBRL(p.remaining) : <span className="font-normal text-emerald-700">quitada</span>}</td>
                {cycles.map((cy) => {
                  const cell = p.cells[cy];
                  if (!cell) return <td key={cy} className="num text-ink/15">·</td>;
                  const cls = cell.status === "pago" ? "text-ink/35" : cell.status === "atual" ? "bg-brand/[0.07] font-semibold text-ink" : cell.known ? "text-ink/80" : "text-ink/60 italic";
                  return (
                    <td key={cy} className={`num ${cls}`} title={`Parcela ${cell.n}/${p.installmentTotal}${cell.known ? "" : " (projetada)"}`}>
                      {cell.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      <div className="text-[9px] font-normal not-italic text-ink/35">{cell.n}/{p.installmentTotal}</div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td className="sticky left-0 z-10 bg-white">Total no cartão</td><td /><td /><td className="num">{formatBRL(plans.reduce((a, p) => a + p.remaining, 0))}</td>
            {totals.map((t, i) => <td key={cycles[i]} className={`num ${cycles[i] === current ? "bg-brand/[0.07] text-brand" : ""}`}>{t ? t.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""}</td>)}
          </tr>
        </tfoot>
      </table>
      {tx && <TxDrawer key={tx.id} tx={tx} cats={cats} byId={byId} members={members} cycleStartDay={cycleStartDay} onClose={() => setOpen(null)} />}
    </>
  );
}
