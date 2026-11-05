import { NextResponse } from "next/server";
import { refreshMacro, refreshNews, refreshQuotes } from "@/lib/market/refresh";
import { allSymbols } from "@/lib/market/tickers";
import { refreshUniverse } from "@/lib/market/universe";

export const maxDuration = 60;

/** Chamado pela Vercel Cron (vercel.json). Protegido por CRON_SECRET. */
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new NextResponse("unauthorized", { status: 401 });
  const symbols = await allSymbols();
  await Promise.all([refreshMacro(), refreshQuotes(symbols), refreshNews(symbols), refreshUniverse().catch((e) => console.error("[universo]", e))]);
  return NextResponse.json({ ok: true, symbols: symbols.length });
}
