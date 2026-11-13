import { NextResponse } from "next/server";
import { ensureFeedsFresh } from "@/lib/news/feeds";
import { rankStories, RELEVANT, type FeedItem } from "@/lib/news/rank";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Atualiza o radar de notícias (fontes públicas), no máximo a cada 10 min. `?top=1` mostra a seleção geral (diagnóstico). */
export async function GET(req: Request) {
  await ensureFeedsFresh(10);
  if (!new URL(req.url).searchParams.get("top")) return NextResponse.json({ ok: true });
  const { data } = await createAdminClient().from("market_feed").select("id, url, title, summary, source, source_key, kind, tickers, published_at")
    .gte("published_at", new Date(Date.now() - 4 * 86400000).toISOString()).limit(1000);
  const st = rankStories((data ?? []) as FeedItem[], { mine: [] });
  return NextResponse.json({
    total: data?.length, stories: st.length, relevant: st.filter((s) => s.score >= RELEVANT).length,
    top: st.slice(0, 40).map((s) => `${s.score.toFixed(1)} [${s.sources.length}] ${s.kind.slice(0, 5)} ${s.lead.source}: ${s.lead.title.slice(0, 110)} | ${s.topics.join("/")}`),
  });
}
