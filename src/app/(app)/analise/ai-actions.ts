"use server";

import { revalidatePath } from "next/cache";
import { requireArea, requireEdit } from "@/lib/context";
import { aiAvailable, aiKeyFor, askClaude } from "@/lib/ai";
import { loadHistory } from "@/lib/market/history";
import { attentionPoints, riskStats } from "@/lib/performance";
import type { UniverseRow } from "@/lib/market/universe";

const n = (v: number | null | undefined, d = 2, suf = "") => (v == null ? "n/d" : `${Number(v).toFixed(d)}${suf}`);

/** Pergunta livre sobre um ativo. A IA recebe só os dados que a plataforma tem (cotação, fundamentos, desempenho, riscos, pares e notícias). */
export async function askAsset(yahoo: string, question: string): Promise<{ text?: string; error?: string }> {
  const ctx = await requireArea("analise");
  const q = question.trim().slice(0, 600);
  if (!q) return { error: "Escreva uma pergunta." };
  if (!aiAvailable(ctx)) return { error: "Ative a IA em Configurações (chave do Claude) para perguntar sobre os ativos." };
  const key = await aiKeyFor(ctx);
  if (!key) return { error: "Nenhuma chave de IA disponível. Salve a sua chave do Claude em Configurações." };

  const { data: uRow } = await ctx.supabase.from("market_universe").select("*").eq("yahoo", yahoo).limit(1).maybeSingle();
  const u = uRow as UniverseRow | null;
  const candles = await loadHistory(ctx, yahoo, false);
  const risk = riskStats(candles);
  const flags = attentionPoints(u, risk, null, "índice");
  const [{ data: peers }, { data: news }] = await Promise.all([
    u?.sector ? ctx.supabase.from("market_universe").select("symbol, name, pe, pb, dy, roe, perf_1y, market_cap").eq("market", u.market).eq("sector", u.sector).eq("kind", u.kind ?? "acao").neq("symbol", u.symbol).order("market_cap", { ascending: false, nullsFirst: false }).limit(6) : Promise.resolve({ data: [] }),
    ctx.supabase.from("market_news").select("title, source, published_at").eq("symbol", yahoo).order("published_at", { ascending: false }).limit(8),
  ]);
  const last = candles[candles.length - 1];
  const facts = [
    `Ativo: ${u?.symbol ?? yahoo} — ${u?.name ?? ""} (${u?.kind ?? "?"}; mercado ${u?.market ?? "?"}; setor ${u?.sector ?? "n/d"}; indústria ${u?.industry ?? "n/d"}; moeda ${u?.currency ?? "n/d"})`,
    `Preço: ${n(u?.price ?? last?.close)} em ${last?.date ?? "n/d"}; variação no dia ${n(u?.change_pct, 2, "%")}; 1 mês ${n(u?.perf_1m, 1, "%")}; no ano ${n(u?.perf_ytd, 1, "%")}; 12 meses ${n(u?.perf_1y, 1, "%")}`,
    `Fundamentos (12 meses): P/L ${n(u?.pe)}; P/VP ${n(u?.pb)}; DY ${n(u?.dy, 1, "%")}; ROE ${n(u?.roe, 1, "%")}; margem líquida ${n(u?.net_margin, 1, "%")}; dívida/patrimônio ${n(u?.debt_equity)}; EV/EBITDA ${n(u?.ev_ebitda)}; LPA ${n(u?.eps)}; valor de mercado ${u?.market_cap ? (Number(u.market_cap) / 1e9).toFixed(1) + " bi" : "n/d"}`,
    `Risco: volatilidade anualizada ${risk.vol != null ? (risk.vol * 100).toFixed(0) + "%" : "n/d"}; distância da máxima de 12 meses ${risk.fromHigh != null ? (risk.fromHigh * 100).toFixed(0) + "%" : "n/d"}; IFR(14) ${n(u?.rsi, 0)}`,
    `Pontos de atenção automáticos: ${flags.length ? flags.map((f) => f.title).join("; ") : "nenhum"}`,
    `Pares do mesmo setor: ${((peers ?? []) as UniverseRow[]).map((p) => `${p.symbol} (P/L ${n(p.pe, 1)}, P/VP ${n(p.pb)}, DY ${n(p.dy, 1, "%")}, ROE ${n(p.roe, 1, "%")}, 12m ${n(p.perf_1y, 0, "%")})`).join("; ") || "n/d"}`,
    `Manchetes recentes: ${((news ?? []) as { title: string; source: string | null; published_at: string | null }[]).map((x) => `“${x.title}” (${x.source ?? ""}, ${x.published_at?.slice(0, 10) ?? ""})`).join("; ") || "nenhuma"}`,
  ].join("\n");

  try {
    const text = await askClaude(key, {
      system: "Você é um analista de investimentos que explica com clareza, em português do Brasil, para um investidor pessoa física. Use os dados fornecidos e cite os números. " +
        "Quando um dado não estiver disponível, diga isso em vez de supor. Não faça recomendação individual de compra ou venda: apresente argumentos a favor e contra, riscos e o que observar. " +
        "Responda em até 220 palavras, em parágrafos curtos ou tópicos, sem cabeçalhos.",
      content: [{ type: "text", text: `Dados do ativo (fonte: plataforma ALVVO, cotações com atraso):\n${facts}\n\nPergunta: ${q}` }],
      maxTokens: 1200, model: process.env.AI_MODEL_FAST ?? "claude-haiku-5-5",
    });
    return { text: text.trim() };
  } catch (e) { return { error: (e as Error).message }; }
}

/** Guarda uma resposta da IA no histórico de análises do ativo numa carteira de avaliação. */
export async function saveAnswer(itemId: string, question: string, answer: string): Promise<{ ok?: true; error?: string }> {
  const ctx = await requireEdit("analise");
  const { data: it } = await ctx.supabase.from("eval_items").select("yahoo").eq("id", itemId).eq("household_id", ctx.household.id).maybeSingle();
  if (!it) return { error: "Item não encontrado." };
  const { data: u } = await ctx.supabase.from("market_universe").select("price").eq("yahoo", it.yahoo).limit(1).maybeSingle();
  const { error } = await ctx.supabase.from("eval_notes").insert({ item_id: itemId, household_id: ctx.household.id, author: ctx.user.id, author_name: `${ctx.member.display_name} · IA`, body: `Pergunta: ${question}\n\n${answer}`.slice(0, 4000), price: (u?.price as number | null) ?? null });
  if (error) return { error: error.message };
  revalidatePath("/mercado", "layout");
  return { ok: true };
}
