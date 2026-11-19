import type { Ctx } from "@/lib/context";
import { loadAgenda } from "@/lib/agenda-data";
import { addDays } from "@/lib/agenda";
import { todayIso } from "@/lib/cycle";
import { radar } from "@/lib/market/radar";
import type { UniverseRow } from "@/lib/market/universe";
import type { SimData } from "@/app/(app)/simulacoes/sims/types";

export interface AporteExtras {
  reserva: { atual: number; alvo: number | null; nome: string | null; fonte: "caixinha" | "carteira" | "nenhuma"; goalId: string | null; prazo: string | null };
  banco: { saldo: number | null; atualizado: string | null };
  agenda: { receber: number; contas: number; cartoes: number; ate: string; itens: { date: string; label: string; amount: number; tipo: "receita" | "conta" | "cartao" }[] };
  watch: { ticker: string; name: string | null; price: number | null; buy: number | null; sell: number | null; note: string | null; kind: string | null; score: number | null }[];
  radarTop: { ticker: string; name: string | null; score: number; sector: string | null; reasons: string[] }[];
  scores: Record<string, number>; // nota do Radar dos ativos da carteira
  rf: { name: string; index: string; rate: number; maturity: string }[];
}

/** Dados extras da simulação "Tenho R$ X para investir": reserva, banco, agenda, análises (lista e Radar) e Tesouro. */
export async function loadAporteExtras(ctx: Ctx, d: SimData): Promise<AporteExtras> {
  const hh = ctx.household.id, today = todayIso(), ate = addDays(today, 35);
  const [goalsR, linksR, agenda, watchR, uniR, rfR] = await Promise.all([
    ctx.supabase.from("goals").select("id, name, type, data").eq("household_id", hh).eq("type", "caixinha"),
    ctx.supabase.from("bank_links").select("kind, balance, last_sync_at").eq("household_id", hh).eq("kind", "conta"),
    loadAgenda(ctx, today, ate),
    ctx.supabase.from("watchlist").select("ticker, buy, sell, note").eq("household_id", hh),
    ctx.supabase.from("market_universe").select("*").eq("market", "BR").in("kind", ["acao", "fii", "etf", "bdr"]).order("market_cap", { ascending: false, nullsFirst: false }).limit(1500),
    ctx.supabase.from("market_rf").select("name, index, rate, maturity").order("maturity"),
  ]);

  // Reserva de emergência: a caixinha marcada como reserva; sem ela, o pós-fixado da carteira
  const cx = (goalsR.data ?? []) as { id: string; name: string; data: { auto?: string | null; balance?: number; target?: number; deadline?: string } }[];
  const res = cx.find((g) => g.data?.auto === "reserva") ?? cx.find((g) => /reserva|emerg/i.test(g.name));
  const reserva = res
    ? { atual: d.goals.find((g) => g.id === res.id)?.balance ?? Number(res.data.balance ?? 0), alvo: res.data.target ? Number(res.data.target) : null, nome: res.name, fonte: "caixinha" as const, goalId: res.id, prazo: res.data.deadline ?? null }
    : (d.carteira.pos ?? 0) > 0 ? { atual: Number(d.carteira.pos), alvo: null, nome: null, fonte: "carteira" as const, goalId: null, prazo: null } : { atual: 0, alvo: null, nome: null, fonte: "nenhuma" as const, goalId: null, prazo: null };

  const links = (linksR.data ?? []) as { balance: number | null; last_sync_at: string | null }[];
  const banco = { saldo: links.length ? links.reduce((a, l) => a + Number(l.balance ?? 0), 0) : null, atualizado: links.map((l) => l.last_sync_at).filter(Boolean).sort().pop() ?? null };

  const pend = agenda.occ.filter((o) => !o.paid && o.amount && o.date >= today && o.event !== "fechamento");
  const itens = pend.map((o) => ({ date: o.date, label: o.item.name, amount: o.amount ?? 0, tipo: (o.event === "receita" ? "receita" : o.event === "vencimento" ? "cartao" : "conta") as "receita" | "conta" | "cartao" }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const sum = (t: string) => itens.filter((i) => i.tipo === t).reduce((a, i) => a + i.amount, 0);

  const uni = (uniR.data ?? []) as UniverseRow[];
  // Nota do Radar de todas as ações líquidas (para a carteira e a lista de acompanhamento) e os destaques
  const radRes = radar(uni, 2_000_000);
  const scoreOf = new Map(radRes.all.map((r) => [r.row.symbol, Math.round(r.score)]));
  const rad = [...radRes.all].sort((a, b) => b.score - a.score);
  const bySym = new Map(uni.map((r) => [r.symbol, r]));
  const watch = ((watchR.data ?? []) as { ticker: string; buy: number | null; sell: number | null; note: string | null }[]).map((w) => {
    const u = bySym.get(w.ticker);
    return { ticker: w.ticker, name: u?.name ?? null, price: u?.price != null ? Number(u.price) : null, buy: w.buy != null ? Number(w.buy) : null, sell: w.sell != null ? Number(w.sell) : null, note: w.note, kind: u?.kind ?? null, score: scoreOf.get(w.ticker) ?? null };
  });
  const scores: Record<string, number> = {};
  for (const h of d.holdings ?? []) { const s = scoreOf.get(h.ticker); if (s != null) scores[h.ticker] = s; }

  return {
    reserva, banco,
    agenda: { receber: sum("receita"), contas: sum("conta"), cartoes: sum("cartao"), ate, itens },
    watch,
    radarTop: rad.slice(0, 12).map((r) => ({ ticker: r.row.symbol, name: r.row.name, score: Math.round(r.score), sector: r.row.sector, reasons: r.reasons.slice(0, 3) })),
    scores,
    rf: ((rfR.data ?? []) as { name: string; index: string; rate: number; maturity: string }[]).map((r) => ({ ...r, rate: Number(r.rate) })),
  };
}
