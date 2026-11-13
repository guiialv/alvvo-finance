"use server";

import { requireArea } from "@/lib/context";
import { aiAvailable, aiKeyFor, askClaude, parseJson } from "@/lib/ai";
import { rankStories, type FeedItem } from "@/lib/news/rank";

export type Brief = { resumo: string; picks: { id: string; porque: string; impacto: "positivo" | "negativo" | "neutro" }[]; at: string };

/** Leitura com IA das notícias do momento, para a carteira da família. Guardada por 2 horas. */
export async function getNewsBrief(): Promise<Brief | { error: string } | null> {
  const ctx = await requireArea("investimentos");
  if (!aiAvailable(ctx)) return null;
  const hh = ctx.household.id;
  const now = new Date();
  const slot = `${now.toISOString().slice(0, 10)}-${Math.floor(now.getUTCHours() / 2)}`;
  const { data: cached } = await ctx.supabase.from("news_briefs").select("payload").eq("household_id", hh).eq("slot", slot).maybeSingle();
  if (cached?.payload) return cached.payload as Brief;

  const key = await aiKeyFor(ctx);
  if (!key) return null;
  const [{ data: ops }, { data: wl }, { data: feed }] = await Promise.all([
    ctx.supabase.from("inv_ops").select("ticker").eq("household_id", hh),
    ctx.supabase.from("watchlist").select("ticker").eq("household_id", hh),
    ctx.supabase.from("market_feed").select("id, url, title, summary, source, source_key, kind, tickers, published_at")
      .gte("published_at", new Date(Date.now() - 2 * 86400000).toISOString()).limit(1000),
  ]);
  const mine = [...new Set([...(ops ?? []), ...(wl ?? [])].map((r) => (r as { ticker: string }).ticker))];
  const stories = rankStories((feed ?? []) as FeedItem[], { mine }).filter((s) => s.score >= 3).slice(0, 30);
  if (!stories.length) return null;
  const list = stories.map((s) => `${s.id} | ${s.lead.source}${s.sources.length > 1 ? ` (+${s.sources.length - 1} fontes)` : ""} | ${s.lead.title}${s.lead.summary ? ` — ${s.lead.summary.slice(0, 180)}` : ""}`).join("\n");
  try {
    const text = await askClaude(key, {
      system: "Você é o analista de mercado de uma plataforma de finanças pessoais no Brasil. Escreva em português do Brasil, objetivo, sem sensacionalismo e sem recomendar compra ou venda.",
      content: [{ type: "text", text: `Carteira/acompanhamento da família: ${mine.join(", ") || "sem ações"}.\n\nNotícias candidatas (id | fonte | título — resumo):\n${list}\n\nEscolha SOMENTE o que for realmente relevante para quem investe no Brasil e para esta carteira (no máximo 6; pode ser menos, ou nenhuma, se nada importar). Evite repetir o mesmo assunto. Para cada escolhida: "porque" em 1 frase curta (até 160 caracteres) explicando o efeito prático (juros, câmbio, bolsa, renda fixa, a ação da carteira…) e "impacto" para a carteira: positivo, negativo ou neutro. Depois, "resumo": 2 frases sobre o que está movendo o mercado agora.\nResponda só JSON: {"resumo":"...","picks":[{"id":"...","porque":"...","impacto":"neutro"}]}` }],
      maxTokens: 1200, model: process.env.AI_MODEL_FAST ?? "claude-haiku-5-5",
    });
    const j = parseJson<Omit<Brief, "at">>(text);
    const ids = new Set(stories.map((s) => s.id));
    const brief: Brief = { resumo: String(j.resumo ?? "").slice(0, 500), picks: (j.picks ?? []).filter((p) => ids.has(p.id)).slice(0, 6), at: now.toISOString() };
    await ctx.supabase.from("news_briefs").upsert({ household_id: hh, slot, payload: brief });
    return brief;
  } catch (e) {
    return { error: (e as Error).message.slice(0, 160) };
  }
}
