import Link from "next/link";
import { Icon } from "@/components/icons";
import { formatBRL } from "@/lib/format";
import { payOccurrence } from "@/app/(app)/agenda/actions";

export interface Pulso { usado: number; ref: number; refLabel: string; centro: string; diasPassados: number; diasTotal: number; porDia: number | null }
export interface Proximo { key: string; date: string; name: string; amount: number | null; tipo: "conta" | "receita" | "vencimento" | "fechamento"; atrasado: boolean; pagavel: boolean }
export interface Pendencia { label: string; href: string; done: boolean; detail?: string }

const SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const dia = (iso: string) => { const d = new Date(iso + "T12:00:00Z"); return { n: iso.slice(8, 10), w: SEM[d.getUTCDay()] }; };
const TIPO: Record<Proximo["tipo"], [string, string]> = {
  conta: ["Conta a pagar", "#a33f30"], receita: ["Receita prevista", "#4f7a52"], vencimento: ["Vencimento da fatura", "#c9973f"], fechamento: ["Fechamento da fatura", "#6e6458"],
};

/** Anel do pulso do mês: arco externo = orçamento utilizado; interno = parte do mês já decorrida. */
function Anel({ a, b }: { a: number; b: number }) {
  const R1 = 52, R2 = 40, C1 = 2 * Math.PI * R1, C2 = 2 * Math.PI * R2;
  const over = a > b + 0.05;
  return (
    <svg viewBox="0 0 128 128" className="h-36 w-36 shrink-0 -rotate-90">
      <defs>
        <linearGradient id="pulsoA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={over ? "#d9a093" : "#e2a64b"} /><stop offset="1" stopColor={over ? "#a2412f" : "#8f5e13"} /></linearGradient>
      </defs>
      <circle cx="64" cy="64" r={R1} fill="none" stroke="rgba(29,25,21,.07)" strokeWidth="11" />
      <circle cx="64" cy="64" r={R1} fill="none" stroke="url(#pulsoA)" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${Math.min(1, a) * C1} ${C1}`} />
      <circle cx="64" cy="64" r={R2} fill="none" stroke="rgba(29,25,21,.06)" strokeWidth="5" />
      <circle cx="64" cy="64" r={R2} fill="none" stroke="#8a9a7b" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${Math.min(1, b) * C2} ${C2}`} />
    </svg>
  );
}

export function HomeToday({ pulso, proximos, pendencias, editAgenda }: { pulso: Pulso | null; proximos: Proximo[]; pendencias: Pendencia[]; editAgenda: boolean }) {
  const feitas = pendencias.filter((p) => p.done).length;
  const a = pulso && pulso.ref > 0 ? pulso.usado / pulso.ref : 0, b = pulso ? pulso.diasPassados / pulso.diasTotal : 0;
  const ritmo = !pulso ? null : a <= b + 0.05 ? { t: "Gastos em ritmo adequado", c: "text-emerald-700" } : a <= b + 0.15 ? { t: "Gastos levemente acima do ritmo", c: "text-amber-800" } : { t: "Gastos acima do ritmo do mês", c: "text-rose-700" };
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      {pulso && (
        <section className="card !border-transparent" style={{ background: "radial-gradient(90% 80% at 100% 0%, #f6e4c2 0%, rgba(246,228,194,0) 60%), linear-gradient(160deg, #fffdf8, #f6efe2)" }}>
          <div className="label">Pulso do mês</div>
          <div className="mt-2 flex items-center gap-4">
            <div className="relative shrink-0">
              <Anel a={a} b={b} />
              <div className="absolute inset-0 grid place-items-center text-center"><div><div className="text-[21px] font-semibold leading-none tabular-nums">{Math.round(a * 100)}%</div><div className="mt-1 text-[9.5px] leading-none text-ink/50">{pulso.centro}</div></div></div>
            </div>
            <div className="min-w-0 text-sm">
              <p className="leading-snug text-ink/75"><b className="tabular-nums text-ink">{Math.round(a * 100)}%</b> {pulso.refLabel} em <b className="tabular-nums text-ink">{Math.round(b * 100)}%</b> do mês.</p>
              {ritmo && <p className={`mt-1.5 text-[13px] font-medium ${ritmo.c}`}>{ritmo.t}</p>}
              {pulso.porDia != null && <p className="mt-1.5 text-xs text-ink/55">{pulso.porDia > 0 ? <>Disponível por dia até o fim do ciclo: <b className="tabular-nums text-ink/80">{formatBRL(pulso.porDia)}</b></> : "O orçamento do ciclo já foi integralmente utilizado."}</p>}
            </div>
          </div>
          <div className="mt-3 flex gap-4 text-[11px] text-ink/50"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gold" />{pulso.centro.replace(/^d[oa] /, "")}</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sage" />mês decorrido</span></div>
        </section>
      )}

      <section className="card">
        <div className="flex items-baseline justify-between"><div className="label">Próximos 7 dias</div><Link href="/agenda" className="text-xs text-brand">Agenda →</Link></div>
        {proximos.length === 0 ? <p className="mt-3 text-sm text-ink/55">Nenhum compromisso nos próximos dias.</p> : (
          <div className="mt-1 divide-y divide-[#efe7da]">
            {proximos.slice(0, 6).map((o) => {
              const d = dia(o.date), [lbl, cor] = TIPO[o.tipo];
              return (
                <div key={o.key} className="flex items-center gap-3 py-2">
                  <div className={`w-10 shrink-0 rounded-xl py-1 text-center ${o.atrasado ? "bg-rose-50 text-rose-700" : "bg-ink/[0.04]"}`}><div className="text-[15px] font-semibold leading-none tabular-nums">{d.n}</div><div className="text-[10px] uppercase text-ink/45">{d.w}</div></div>
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{o.name}</div><div className="text-[11.5px]" style={{ color: o.atrasado ? "#a2412f" : cor }}>{o.atrasado ? "Em atraso" : lbl}</div></div>
                  {o.amount != null && <div className={`shrink-0 text-sm tabular-nums ${o.tipo === "receita" ? "text-gain" : ""}`}>{formatBRL(o.amount)}</div>}
                  {editAgenda && o.pagavel && (
                    <form action={payOccurrence}><input type="hidden" name="key" value={o.key} />
                      <button title={o.tipo === "receita" ? "Marcar como recebida" : "Marcar como paga"} className="grid h-8 w-8 place-items-center rounded-full border border-[#e2d8c6] text-ink/50 transition hover:border-gain hover:text-gain"><Icon name="check" className="h-4 w-4" /></button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <div className="flex items-baseline justify-between"><div className="label">Pendências do mês</div><span className="text-xs tabular-nums text-ink/50">{feitas} de {pendencias.length}</span></div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]"><div className="h-full rounded-full" style={{ width: `${pendencias.length ? (feitas / pendencias.length) * 100 : 0}%`, background: "linear-gradient(90deg, #c9d6c0, #6f8f68)" }} /></div>
        {pendencias.length > 0 && feitas === pendencias.length ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl p-3" style={{ background: "linear-gradient(135deg, #f1f4ee, #e2e9dc)" }}>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white/70 text-emerald-700"><Icon name="check" className="h-5 w-5" /></span>
            <div><p className="text-sm font-semibold text-emerald-800">Mês em dia</p><p className="text-xs text-emerald-800/70">Todas as pendências foram concluídas.</p></div>
          </div>
        ) : (
          <ul className="mt-2 space-y-0.5">
            {pendencias.map((p) => (
              <li key={p.label}>
                <Link href={p.href} className={`flex items-center gap-3 rounded-xl px-1.5 py-1.5 text-sm transition hover:bg-ink/[0.03] ${p.done ? "text-ink/40" : ""}`}>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${p.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-ink/25"}`}>{p.done && <Icon name="check" className="h-3 w-3" />}</span>
                  <span className={`min-w-0 flex-1 ${p.done ? "line-through decoration-ink/20" : ""}`}>{p.label}{p.detail && !p.done && <span className="block text-[11.5px] text-ink/45">{p.detail}</span>}</span>
                  {!p.done && <Icon name="right" className="h-4 w-4 text-ink/30" />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
