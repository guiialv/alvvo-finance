import { NextResponse } from "next/server";
import { ensureFeedsFresh } from "@/lib/news/feeds";
import { rankStories, selectRelevant, type FeedItem } from "@/lib/news/rank";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchNews } from "@/lib/market/sources";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Atualiza o radar de notícias (fontes públicas), no máximo a cada 10 min. `?top=1` mostra a seleção geral (diagnóstico). */
export async function GET(req: Request) {
  const tk = new URL(req.url).searchParams.get("ticker"); // diagnóstico das notícias por ativo (não grava nada)
  if (tk && /^[A-Z0-9.^-]{1,15}$/i.test(tk)) {
    const sym = tk.toUpperCase().includes(".") || /[A-Z]{4}\d/.test(tk.toUpperCase()) === false ? tk.toUpperCase() : `${tk.toUpperCase()}.SA`;
    const { data: u } = await createAdminClient().from("market_universe").select("name").eq("yahoo", sym).maybeSingle();
    const items = await fetchNews(sym, (u?.name as string) ?? null);
    return NextResponse.json({ symbol: sym, name: u?.name ?? null, count: items.length, items: items.slice(0, 5).map((i) => `${i.source}: ${i.title.slice(0, 100)}`) });
  }
  await ensureFeedsFresh(10);
  if (!new URL(req.url).searchParams.get("top")) return NextResponse.json({ ok: true });
  const { data } = await createAdminClient().from("market_feed").select("id, url, title, summary, source, source_key, kind, tickers, published_at")
    .gte("published_at", new Date(Date.now() - 4 * 86400000).toISOString()).limit(1000);
  const st = rankStories((data ?? []) as FeedItem[], { mine: [] });
  return NextResponse.json({
    total: data?.length, stories: st.length, relevant: selectRelevant(st.filter((s) => s.kind === "noticia"), 12).map((s) => `${s.score.toFixed(1)} [${s.sources.length}] ${s.lead.source}: ${s.lead.title.slice(0, 110)}`),
    top: st.slice(0, 40).map((s) => `${s.score.toFixed(1)} [${s.sources.length}] ${s.kind.slice(0, 5)} ${s.lead.source}: ${s.lead.title.slice(0, 110)} | ${s.topics.join("/")}`),
  });
}
