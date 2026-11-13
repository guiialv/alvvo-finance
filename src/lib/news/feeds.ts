import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/** Fontes consolidadas com feed público. `w` = peso de autoridade na relevância. */
export const FEEDS: { key: string; name: string; url: string; w: number; kind?: "banco_central" }[] = [
  { key: "bcb_notas", name: "Banco Central", url: "https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/notasImprensa", w: 3, kind: "banco_central" },
  { key: "bcb_copom", name: "Banco Central · Copom", url: "https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/comunicadoscopom", w: 3.5, kind: "banco_central" },
  { key: "bcb_noticias", name: "Banco Central", url: "https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/noticias", w: 2.2, kind: "banco_central" },
  { key: "valor", name: "Valor Econômico", url: "https://pox.globo.com/rss/valor/", w: 1.5 },
  { key: "valor_fin", name: "Valor Investe", url: "https://pox.globo.com/rss/valor/financas", w: 1.4 },
  { key: "bloomberg", name: "Bloomberg", url: "https://feeds.bloomberg.com/markets/news.rss", w: 1.5 },
  { key: "bloomberg_linea", name: "Bloomberg Línea", url: "https://www.bloomberglinea.com.br/arc/outboundfeeds/rss/?outputType=xml", w: 1.3 },
  { key: "infomoney", name: "InfoMoney", url: "https://www.infomoney.com.br/feed/", w: 1.3 },
  { key: "investing", name: "Investing.com", url: "https://br.investing.com/rss/news.rss", w: 1.2 },
  { key: "investing_eco", name: "Investing.com", url: "https://br.investing.com/rss/news_14.rss", w: 1.2 },
  { key: "estadao", name: "Estadão", url: "https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/economia/", w: 1.2 },
  { key: "einvestidor", name: "E-Investidor (Estadão)", url: "https://einvestidor.estadao.com.br/feed/", w: 1.1 },
  { key: "g1", name: "g1 Economia", url: "https://g1.globo.com/rss/g1/economia/", w: 1 },
  { key: "exame", name: "Exame", url: "https://exame.com/feed/", w: 1 },
  { key: "moneytimes", name: "Money Times", url: "https://www.moneytimes.com.br/feed/", w: 1 },
  { key: "suno", name: "Suno", url: "https://www.suno.com.br/noticias/feed/", w: 0.9 },
  { key: "forbes", name: "Forbes Brasil", url: "https://forbes.com.br/feed/", w: 0.6 },
  { key: "yahoo", name: "Yahoo Finance", url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EBVSP,%5EGSPC,%5EIXIC,BZ%3DF,BRL%3DX&region=US&lang=en-US", w: 1 },
];
export const SOURCE_WEIGHT: Record<string, number> = { ...Object.fromEntries(FEEDS.map((f) => [f.key, f.w])), fundamentus: 2.5 };

const UA = "Mozilla/5.0 (compatible; ALVVO-Finance/1.0; +https://alvvo-finance.vercel.app)";
const id = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 24);
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
export function clean(s: string | undefined | null): string {
  if (!s) return "";
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m).replace(/\s+/g, " ").trim();
}
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1];
const TICKER = /\b([A-Z]{4}(?:3|4|5|6|11))\b/g;

type Row = { id: string; url: string; title: string; summary: string | null; source: string; source_key: string; kind: string; tickers: string[]; published_at: string | null; fetched_at: string };

function parseFeed(xml: string, f: (typeof FEEDS)[number], now: string): Row[] {
  const blocks = [...xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  const out: Row[] = [];
  for (const b of blocks.slice(0, 60)) {
    const title = clean(tag(b, "title"));
    let link = clean(tag(b, "link"));
    if (!link) link = b.match(/<link[^>]+href="([^"]+)"/i)?.[1] ?? "";
    if (!title || !/^https?:/.test(link)) continue;
    const date = clean(tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date"));
    const t = date ? Date.parse(date) : NaN;
    const summary = clean(tag(b, "description") ?? tag(b, "summary") ?? tag(b, "content")).slice(0, 400) || null;
    const tickers = [...new Set([...`${title} ${summary ?? ""}`.matchAll(TICKER)].map((m) => m[1]))];
    out.push({ id: id(link), url: link, title: title.slice(0, 300), summary, source: f.name, source_key: f.key, kind: f.kind ?? "noticia", tickers, published_at: isFinite(t) ? new Date(t).toISOString() : null, fetched_at: now });
  }
  return out;
}

/** Fatos relevantes e comunicados entregues à CVM (lista do Fundamentus). */
async function fetchFundamentus(now: string): Promise<Row[]> {
  const r = await fetch("https://www.fundamentus.com.br/fr.php", { headers: { "user-agent": UA }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) return [];
  const html = new TextDecoder("latin1").decode(await r.arrayBuffer());
  const out: Row[] = [];
  for (const m of html.matchAll(/<tr class="\s*row-comunicado">([\s\S]*?)<\/tr>/g)) {
    const tds = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1]);
    if (tds.length < 5) continue;
    const dt = clean(tds[0]).match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
    const empresa = clean(tds[1]), tipo = clean(tds[2]), desc = clean(tds[3]);
    const link = tds[4].match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
    const ticker = tds[4].match(/'([A-Z]{4}\d{1,2})_\d+'/)?.[1];
    if (!link || !desc) continue;
    const kind = /^FR$/i.test(tipo) ? "fato_relevante" : "comunicado";
    out.push({
      id: id(link), url: link, title: `${empresa}${ticker ? ` (${ticker})` : ""}: ${desc}`.slice(0, 300), summary: kind === "fato_relevante" ? "Fato relevante entregue à CVM" : "Comunicado ao mercado (CVM)",
      source: "CVM via Fundamentus", source_key: "fundamentus", kind, tickers: ticker ? [ticker] : [],
      published_at: dt ? new Date(`${dt[3]}-${dt[2]}-${dt[1]}T${dt[4]}:${dt[5]}:00-03:00`).toISOString() : null, fetched_at: now,
    });
    if (out.length >= 150) break;
  }
  return out;
}

export async function refreshFeeds() {
  const db = createAdminClient(), now = new Date().toISOString();
  const results = await Promise.allSettled([
    ...FEEDS.map(async (f) => {
      const r = await fetch(f.url, { headers: { "user-agent": UA, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" }, signal: AbortSignal.timeout(9000) });
      return r.ok ? parseFeed(await r.text(), f, now) : [];
    }),
    fetchFundamentus(now),
  ]);
  const rows = new Map<string, Row>();
  const failed: string[] = [];
  results.forEach((res, i) => {
    if (res.status === "fulfilled") res.value.forEach((r) => rows.set(r.id, r));
    else failed.push(i < FEEDS.length ? FEEDS[i].key : "fundamentus");
  });
  const list = [...rows.values()].filter((r) => !r.published_at || Date.now() - Date.parse(r.published_at) < 10 * 86400000);
  for (let i = 0; i < list.length; i += 500) await db.from("market_feed").upsert(list.slice(i, i + 500), { onConflict: "id", ignoreDuplicates: false });
  await db.from("market_feed").delete().lt("published_at", new Date(Date.now() - 14 * 86400000).toISOString());
  await db.from("market_macro").upsert({ key: "feed", value: { items: list.length, failed }, ref_date: now.slice(0, 10), updated_at: now });
  return { items: list.length, failed };
}

export async function ensureFeedsFresh(maxMinutes = 30) {
  const db = createAdminClient();
  const { data } = await db.from("market_macro").select("updated_at").eq("key", "feed").maybeSingle();
  const age = data?.updated_at ? (Date.now() - Date.parse(data.updated_at as string)) / 60000 : Infinity;
  if (age > maxMinutes) await refreshFeeds();
}
