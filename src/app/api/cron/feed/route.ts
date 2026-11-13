import { NextResponse } from "next/server";
import { ensureFeedsFresh } from "@/lib/news/feeds";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Atualiza o radar de notícias (fontes públicas). No máximo a cada 10 min, independente de quantas chamadas. */
export async function GET() {
  await ensureFeedsFresh(10);
  return NextResponse.json({ ok: true });
}
