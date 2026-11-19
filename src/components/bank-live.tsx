import Link from "next/link";
import type { Ctx } from "@/lib/context";
import type { Occurrence } from "@/lib/agenda";
import { addDays } from "@/lib/agenda";
import { cycleLabel, cycleOf, shiftCycle } from "@/lib/cycle";
import { fetchAll } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { RefreshBankButton } from "@/components/refresh-bank";

type Link_ = { id: string; kind: string; name: string | null; number: string | null; institution: string | null; balance: number | null; credit_limit: number | null; available_limit: number | null; account_id: string | null; connection_id: string };
type Daily = { link_id: string; date: string; balance: number; inflow: number; outflow: number };
type Pt = { date: string; bank?: number; plat?: number; proj?: number };

/**
 * Visão geral · conta no banco em tempo real (Open Finance): saldo agora, faturas atuais, previsão até o fim do ciclo
 * com a agenda, e o cruzamento do saldo/entradas/saídas do banco com o que está lançado na plataforma.
 */
type Props = { ctx: Ctx; today: string; cycle: string; cycleEnd: string; occ: Occurrence[]; admin: boolean };

/** Nunca derruba a Visão geral: se algo falhar no quadro do banco, mostra um aviso no lugar. */
export async function BankLive(props: Props) {
  try { return await BankLiveInner(props); }
  catch (e) {
    console.error("[bank-live]", e);
    return <section className="card mt-4 text-xs text-ink/50">Não foi possível carregar os dados do banco agora. O restante da Visão geral não foi afetado.</section>;
  }
}

async function BankLiveInner({ ctx, today, cycle, cycleEnd, occ, admin }: Props) {
  const hh = ctx.household.id;
  const { data: ls } = await ctx.supabase.from("bank_links").select("id, kind, name, number, institution, balance, credit_limit, available_limit, account_id, connection_id").eq("household_id", hh);
  const links = (ls ?? []) as Link_[];
  if (!links.length) return null;
  const contas = links.filter((l) => l.kind === "conta"), cards = links.filter((l) => l.kind === "cartao");
  const { data: cs } = await ctx.supabase.from("bank_connections").select("provider_updated_at, status").eq("household_id", hh);
  const updated = ((cs ?? []) as { provider_updated_at: string | null }[]).map((c) => c.provider_updated_at).filter(Boolean).sort().pop() ?? null;

  const startDay = ctx.household.cycle_start_day;
  const winStart = addDays(today, -60), tableStart = addDays(today, -200);
  const contaIds = contas.map((l) => l.id), accIds = [...new Set(contas.map((l) => l.account_id).filter((x): x is string => !!x))];
  const [daily, platTx] = await Promise.all([
    contaIds.length ? ctx.supabase.from("bank_daily").select("link_id, date, balance, inflow, outflow").in("link_id", contaIds).gte("date", addDays(tableStart, -1)).order("date").limit(5000).then((r) => (r.data ?? []) as Daily[]) : Promise.resolve([] as Daily[]),
    accIds.length ? fetchAll<{ date: string; amount: number; flow: string | null }>(() => ctx.supabase.from("transactions").select("id, date, amount, flow").eq("household_id", hh).in("account_id", accIds).eq("source", "extrato").gte("date", tableStart)) : Promise.resolve([]),
  ]);

  const saldo = contas.reduce((a, l) => a + Number(l.balance ?? 0), 0);
  const faturas = cards.reduce((a, l) => a + Number(l.balance ?? 0), 0);
  const limite = cards.reduce((a, l) => a + Number(l.available_limit ?? 0), 0);

  // Saldo do banco por dia (todas as contas somadas)
  const bankByDay = new Map<string, number>(), inByDay = new Map<string, number>(), outByDay = new Map<string, number>();
  for (const d of daily) {
    bankByDay.set(d.date, (bankByDay.get(d.date) ?? 0) + Number(d.balance));
    inByDay.set(d.date, (inByDay.get(d.date) ?? 0) + Number(d.inflow));
    outByDay.set(d.date, (outByDay.get(d.date) ?? 0) + Number(d.outflow));
  }
  const hasHistory = bankByDay.size > 0;
  // Lançado na plataforma (extrato das mesmas contas)
  const platIn = new Map<string, number>(), platOut = new Map<string, number>();
  for (const t of platTx) {
    const v = Math.abs(Number(t.amount)), entrada = t.flow ? t.flow === "entrada" : Number(t.amount) > 0;
    (entrada ? platIn : platOut).set(t.date, ((entrada ? platIn : platOut).get(t.date) ?? 0) + v);
  }

  // Previsto até o fim do ciclo pela agenda (o que ainda não foi pago)
  const pend = occ.filter((o) => !o.paid && o.amount && o.date > today && o.date <= cycleEnd && o.event !== "fechamento");
  const aReceber = pend.filter((o) => o.event === "receita").reduce((a, o) => a + (o.amount ?? 0), 0);
  const aPagar = pend.filter((o) => o.event === "conta").reduce((a, o) => a + (o.amount ?? 0), 0);
  const cartoes = pend.filter((o) => o.event === "vencimento").reduce((a, o) => a + (o.amount ?? 0), 0);
  const previsto = saldo + aReceber - aPagar - cartoes;

  // Gráfico: saldo do banco × saldo pelos lançamentos (ancorado no mesmo ponto de partida) + previsão
  const pts: Pt[] = [];
  const anchor = bankByDay.get(addDays(winStart, -1)) ?? bankByDay.get(winStart) ?? null;
  let plat = anchor ?? 0;
  for (let d = winStart; d <= today; d = addDays(d, 1)) {
    plat += (platIn.get(d) ?? 0) - (platOut.get(d) ?? 0);
    pts.push({ date: d, bank: bankByDay.get(d), plat: anchor != null ? plat : undefined });
  }
  pts[pts.length - 1] = { ...pts[pts.length - 1], bank: saldo };
  let proj = saldo;
  pts[pts.length - 1].proj = saldo;
  for (let d = addDays(today, 1); d <= cycleEnd; d = addDays(d, 1)) {
    for (const o of pend.filter((x) => x.date === d)) proj += o.event === "receita" ? o.amount ?? 0 : -(o.amount ?? 0);
    pts.push({ date: d, proj });
  }
  const divergence = anchor != null ? Math.round((saldo - plat) * 100) / 100 : null;

  // Tabela mensal: banco × plataforma
  const months = Array.from({ length: 6 }, (_, i) => shiftCycle(cycle, i - 5));
  const sumBy = (m: Map<string, number>, c: string) => [...m.entries()].filter(([d]) => cycleOf(d, startDay) === c).reduce((a, [, v]) => a + v, 0);
  const rows = months.map((c) => ({ c, bi: sumBy(inByDay, c), bo: sumBy(outByDay, c), pi: sumBy(platIn, c), po: sumBy(platOut, c) }))
    .filter((r) => r.bi || r.bo || r.pi || r.po);

  return (
    <section className="card mt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div><h2>Conta no banco · Open Finance</h2>
          <p className="text-xs text-ink/45">Dados do banco{updated ? ` atualizados em ${new Date(updated).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""} · cruzados com os lançamentos e a agenda</p></div>
        {admin && <RefreshBankButton />}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:divide-x md:divide-ink/[0.06]">
        <div><div className="label">Saldo no banco agora</div><div className={`display text-[26px] leading-tight ${saldo >= 0 ? "text-gain" : "text-loss"}`}>{formatBRL(saldo)}</div>
          <div className="text-xs text-ink/45">{contas.map((l) => `${l.institution ?? l.name}: ${formatBRL(Number(l.balance ?? 0))}`).join(" · ")}</div></div>
        <div className="md:pl-4"><div className="label">Faturas atuais</div><div className="display text-[22px] leading-tight">{formatBRL(faturas)}</div>
          <div className="text-xs text-ink/45">{formatBRL(limite)} de limite disponível</div></div>
        <div className="md:pl-4"><div className="label">Até o fim do ciclo</div>
          <div className="text-xs leading-relaxed text-ink/60">+ {formatBRL(aReceber)} a receber<br />− {formatBRL(aPagar)} contas<br />− {formatBRL(cartoes)} cartões</div></div>
        <div className="md:pl-4"><div className="label">Saldo previsto no banco</div><div className={`display text-[22px] leading-tight ${previsto >= 0 ? "text-gain" : "text-loss"}`}>{formatBRL(previsto)}</div>
          <div className="text-xs text-ink/45">em {cycleEnd.slice(8, 10)}/{cycleEnd.slice(5, 7)}, pela agenda</div></div>
      </div>

      {hasHistory ? (
        <div className="mt-4">
          <BankChart points={pts} />
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink/50">
            <span><i className="mr-1 inline-block h-0.5 w-4 bg-[#4a5a73] align-middle" />saldo no banco</span>
            <span><i className="mr-1 inline-block h-0.5 w-4 border-t-2 border-dashed border-[#7a5c32] align-middle" />saldo pelos lançamentos da plataforma</span>
            <span><i className="mr-1 inline-block h-0.5 w-4 border-t-2 border-dotted border-[#4a5a73] align-middle" />previsto pela agenda</span>
          </div>
          {divergence != null && (
            <p className={`mt-2 text-xs ${Math.abs(divergence) < 1 ? "text-gain" : "text-bronze"}`}>
              {Math.abs(divergence) < 1 ? "✓ Os lançamentos da plataforma explicam todo o saldo do banco nos últimos 60 dias." : `Diferença de ${formatBRL(divergence)} entre o saldo do banco e o que está lançado nos últimos 60 dias${divergence > 0 ? " (entrou mais no banco do que foi lançado)" : " (saiu mais do banco do que foi lançado)"}.`}
              {" "}<Link href="/conexoes" className="underline">Ver detalhes</Link>
            </p>
          )}
        </div>
      ) : <p className="mt-4 text-xs text-ink/45">O histórico do saldo aparece depois da primeira atualização das contas.</p>}

      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="table min-w-[560px] text-xs">
            <thead><tr><th>Mês</th><th className="num">Entradas · banco</th><th className="num">· lançadas</th><th className="num">Saídas · banco</th><th className="num">· lançadas</th><th className="num">Diferença</th></tr></thead>
            <tbody>{rows.map((r) => {
              const diff = Math.round(((r.bi - r.bo) - (r.pi - r.po)) * 100) / 100;
              return (
                <tr key={r.c}>
                  <td>{cycleLabel(r.c)}</td>
                  <td className="num">{formatBRL(r.bi)}</td><td className={`num ${Math.abs(r.bi - r.pi) >= 1 ? "text-bronze" : "text-ink/50"}`}>{formatBRL(r.pi)}</td>
                  <td className="num">{formatBRL(r.bo)}</td><td className={`num ${Math.abs(r.bo - r.po) >= 1 ? "text-bronze" : "text-ink/50"}`}>{formatBRL(r.po)}</td>
                  <td className={`num ${Math.abs(diff) < 1 ? "text-gain" : "text-bronze"}`}>{Math.abs(diff) < 1 ? "✓" : formatBRL(diff)}</td>
                </tr>
              );
            })}</tbody>
          </table>
          <p className="mt-1 text-[11px] text-ink/40">“Lançadas” = extrato da conta na plataforma (PDF ou Open Finance). Diferença = movimento líquido do banco − o lançado.</p>
        </div>
      )}
    </section>
  );
}

function BankChart({ points, width = 720, height = 200 }: { points: Pt[]; width?: number; height?: number }) {
  const padL = 52, padR = 12, padT = 12, padB = 22;
  const vals = points.flatMap((p) => [p.bank, p.plat, p.proj]).filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const pad = (hi - lo) * 0.08 || 100; lo -= pad; hi += pad;
  const X = (i: number) => padL + (i / Math.max(1, points.length - 1)) * (width - padL - padR);
  const Y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (height - padT - padB);
  const path = (key: "bank" | "plat" | "proj") => {
    let d = "", pen = false;
    points.forEach((p, i) => { const v = p[key]; if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; });
    return d;
  };
  const k = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : Math.round(v).toLocaleString("pt-BR"));
  const every = Math.max(1, Math.ceil(points.length / 8));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Saldo no banco e saldo pelos lançamentos">
      {[lo + pad, (lo + hi) / 2, hi - pad].map((v, i) => <g key={i}><line x1={padL} x2={width - padR} y1={Y(v)} y2={Y(v)} stroke="#1d1915" strokeOpacity=".05" strokeDasharray="2 4" />
        <text x={padL - 8} y={Y(v) + 3.5} textAnchor="end" className="fill-ink/35" style={{ fontSize: 10 }}>{k(v)}</text></g>)}
      <line x1={padL} x2={width - padR} y1={Y(0)} y2={Y(0)} stroke="#1d1915" strokeOpacity=".15" />
      <path d={path("plat")} fill="none" stroke="#7a5c32" strokeWidth={1.6} strokeDasharray="5 4" />
      <path d={path("bank")} fill="none" stroke="#4a5a73" strokeWidth={2} strokeLinejoin="round" />
      <path d={path("proj")} fill="none" stroke="#4a5a73" strokeOpacity=".6" strokeWidth={1.6} strokeDasharray="1.5 3.5" strokeLinecap="round" />
      {points.map((p, i) => ((i % every === 0 && points.length - 1 - i >= every * 0.6) || i === points.length - 1) && (
        <text key={p.date} x={X(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} className="fill-ink/35" style={{ fontSize: 10 }}>{p.date.slice(8, 10)}/{p.date.slice(5, 7)}</text>
      ))}
      {points.map((p, i) => (
        <rect key={`h${p.date}`} x={X(i) - (width - padL - padR) / points.length / 2} y={padT} width={(width - padL - padR) / points.length} height={height - padT - padB} fill="transparent" className="hover:fill-ink/[0.04]">
          <title>{`${p.date.slice(8, 10)}/${p.date.slice(5, 7)}${p.bank != null ? `\nBanco: ${formatBRL(p.bank)}` : ""}${p.plat != null ? `\nPelos lançamentos: ${formatBRL(p.plat)}` : ""}${p.proj != null && p.bank == null ? `\nPrevisto: ${formatBRL(p.proj)}` : ""}`}</title>
        </rect>
      ))}
    </svg>
  );
}
