"use client";

import { useActionState } from "react";
import { readBrokerNote, type NoteState } from "./actions";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Nota de corretagem → operações, lidas com IA e conferidas antes de salvar. */
export function BrokerNote() {
  const [state, action, pending] = useActionState<NoteState, FormData>(readBrokerNote, undefined);
  return (
    <section className="card mt-5">
      <h2 className="mb-1">Ler nota de corretagem com IA</h2>
      <p className="mb-3 text-xs text-ink/50">Envie o PDF (qualquer corretora) ou cole o texto. As operações aparecem para você conferir antes de salvar.</p>
      {state?.ops ? (
        <form action={action} className="space-y-3">
          <input type="hidden" name="confirm" value="1" />
          <input type="hidden" name="ops" value={JSON.stringify(state.ops)} />
          <table className="table"><thead><tr><th>Data</th><th>Tipo</th><th>Ativo</th><th className="num">Qtd</th><th className="num">Preço</th><th className="num">Custos</th></tr></thead><tbody>
            {state.ops.map((o, i) => <tr key={i}><td>{o.date.split("-").reverse().join("/")}</td><td>{o.type}</td><td className="font-semibold">{o.ticker}</td><td className="num">{o.qty}</td><td className="num">{brl(o.price)}</td><td className="num">{brl(o.costs)}</td></tr>)}
          </tbody></table>
          <div className="flex gap-2"><button className="btn" disabled={pending}>Salvar {state.ops.length} operações</button><a className="btn-ghost" href="/investimentos?aba=operacoes">Cancelar</a></div>
        </form>
      ) : (
        <form action={action} className="flex flex-wrap items-end gap-3">
          <div><label className="label">PDF da nota</label><input type="file" name="file" accept="application/pdf" className="text-sm" /></div>
          <div className="min-w-[260px] flex-1"><label className="label">ou cole o texto</label><textarea name="text" rows={2} className="input" /></div>
          <button className="btn" disabled={pending}>{pending ? "Lendo…" : "Ler nota"}</button>
        </form>
      )}
      {state?.error && <p className="mt-2 text-sm text-loss">{state.error}</p>}
      {state?.saved ? <p className="mt-2 text-sm text-gain">{state.saved} operações salvas.</p> : null}
    </section>
  );
}
