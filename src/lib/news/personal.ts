import { after } from "next/server";
import type { Ctx } from "@/lib/context";
import { PAYWALL, refreshFeeds } from "./feeds";
import { rankStories, type FeedItem, type Story } from "./rank";
import { INTERESSES, interessesDe, tickersDe, type Respostas } from "@/lib/perfil";

export interface NoticiaPessoal { story: Story; motivos: string[]; nota: number; assinatura?: boolean }

/** Prefere uma fonte aberta da mesma notícia; se só houver fontes com assinatura, sinaliza. */
function abrirSemAssinatura(s: Story): { story: Story; assinatura: boolean } {
  if (!PAYWALL.has(s.lead.source_key)) return { story: s, assinatura: false };
  const livre = s.others.find((o) => !PAYWALL.has(o.source_key));
  if (!livre) return { story: s, assinatura: true };
  return { story: { ...s, lead: { ...livre, summary: livre.summary ?? s.lead.summary }, others: [s.lead, ...s.others.filter((o) => o !== livre)] }, assinatura: false };
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Perfil da pessoa (respostas da pesquisa inicial) e os ativos que ela acompanha. */
export async function carregarPerfil(ctx: Ctx) {
  const hh = ctx.household.id;
  const [{ data: prof }, { data: ops }, { data: wl }] = await Promise.all([
    ctx.supabase.from("member_profiles").select("answers, completed_at").eq("user_id", ctx.user.id).maybeSingle(),
    ctx.supabase.from("inv_ops").select("ticker").eq("household_id", hh),
    ctx.supabase.from("watchlist").select("ticker").eq("household_id", hh),
  ]);
  const answers = ((prof?.answers ?? {}) as Respostas);
  const ativos = [...new Set([...((ops ?? []) as { ticker: string }[]).map((o) => o.ticker), ...((wl ?? []) as { ticker: string }[]).map((w) => w.ticker), ...tickersDe(answers)])];
  return { answers, concluido: !!prof?.completed_at, ativos };
}

/**
 * As 3 a 5 notícias do dia mais pertinentes para a pessoa: o ranking geral do radar de notícias
 * (autoridade da fonte, tema de mercado, cobertura e recência) somado aos interesses do perfil
 * (setores, classes de investimento, objetivos) e aos ativos da carteira e da lista de acompanhamento.
 */
export async function noticiasParaVoce(ctx: Ctx, perfil: { answers: Respostas; ativos: string[] }, max = 5, tema?: string): Promise<NoticiaPessoal[]> {
  const { data: meta } = await ctx.supabase.from("market_macro").select("updated_at").eq("key", "feed").maybeSingle();
  const age = meta?.updated_at ? (Date.now() - Date.parse(meta.updated_at as string)) / 60000 : Infinity;
  if (age === Infinity) await refreshFeeds().catch(() => null);
  else if (age > 20) after(() => refreshFeeds().then(() => undefined).catch(() => undefined));

  const desde = new Date(Date.now() - 48 * 3600000).toISOString();
  const [{ data: feedD }, { data: uni }] = await Promise.all([
    ctx.supabase.from("market_feed").select("id, url, title, summary, source, source_key, kind, tickers, published_at").gte("published_at", desde).order("published_at", { ascending: false }).limit(800),
    perfil.ativos.length ? ctx.supabase.from("market_universe").select("symbol, name").in("symbol", perfil.ativos) : Promise.resolve({ data: [] }),
  ]);
  const names = Object.fromEntries(((uni ?? []) as { symbol: string; name: string | null }[]).map((u) => [u.symbol, (u.name ?? "").replace(/\s+(S\.?A\.?|ON|PN|UNT|N[12M]|NM|EJ|ED|ATZ).*$/i, "").trim()]));
  const stories = rankStories((feedD ?? []) as FeedItem[], { mine: perfil.ativos, names });

  // Filtro por tema escolhido na tela ("carteira" = ativos da carteira e da lista de acompanhamento)
  const filtro = tema && (tema === "carteira" || INTERESSES[tema]) ? tema : undefined;
  const ints = filtro && filtro !== "carteira" ? [filtro] : interessesDe(perfil.answers);
  const geral = ints.length === 0;
  const hoje = Date.now() - 30 * 3600000;
  const pontuadas = stories
    .filter((s) => (s.kind === "noticia" || s.mine.length || s.kind === "fato_relevante") && !(s.kind === "comunicado" && !s.mine.length))
    .map(abrirSemAssinatura)
    .map(({ story: s, assinatura }) => {
      const titulo = norm(`${s.lead.title} ${s.others.map((o) => o.title).join(" ")}`), resumo = norm(s.lead.summary ?? "");
      const hits = ints.filter((k) => INTERESSES[k].re.test(titulo) || INTERESSES[k].re.test(resumo));
      const peso = (k: string) => INTERESSES[k].w * (INTERESSES[k].re.test(titulo) ? 1 : 0.5);
      const motivos = [...s.mine.map((t) => `Sua carteira · ${t}`), ...hits.map((k) => INTERESSES[k].label)];
      const recente = s.published_at && Date.parse(s.published_at) >= hoje ? 1 : 0.55;
      const nota = (s.score + hits.reduce((a, k) => a + peso(k), 0) * 1.6 + (geral ? 0 : hits.length ? 0 : -2.5) - (assinatura ? 2 : 0)) * recente;
      return { story: s, assinatura, hits: hits.length, motivos: [...new Set(motivos)].slice(0, 3), nota, chave: hits[0] ?? s.mine[0] ?? s.topics[0] ?? "_" };
    })
    // Com tema escolhido, só entram as notícias daquele tema
    .filter((p) => !filtro || (filtro === "carteira" ? p.story.mine.length > 0 : p.hits > 0))
    .sort((a, b) => b.nota - a.nota);

  // Variedade: poucas notícias pelo mesmo motivo principal e poucos resumos de mercado (afrouxa ao carregar mais)
  const out: NoticiaPessoal[] = [], por = new Map<string, number>();
  const porMotivo = filtro ? max : 2 + Math.floor((max - 5) / 5), maxResumos = max > 5 ? 2 : 1, corte = filtro ? -Infinity : max > 5 ? 1.5 : 3;
  let resumos = 0;
  for (const p of pontuadas) {
    if (out.length >= max || p.nota < corte) break;
    if ((por.get(p.chave) ?? 0) >= Math.max(2, porMotivo)) continue;
    if (p.story.wrap) { if (resumos >= maxResumos) continue; resumos++; }
    por.set(p.chave, (por.get(p.chave) ?? 0) + 1);
    out.push({ story: p.story, motivos: p.motivos, nota: Math.round(p.nota * 10) / 10, assinatura: p.assinatura });
  }
  // Dia fraco de notícias: completa até 3 com as mais relevantes do dia
  if (!filtro) for (const p of pontuadas) { if (out.length >= Math.min(3, max)) break; if (!out.some((o) => o.story.id === p.story.id)) out.push({ story: p.story, motivos: p.motivos, nota: Math.round(p.nota * 10) / 10, assinatura: p.assinatura }); }
  return out;
}

export const ha = (iso: string | null) => {
  if (!iso) return "";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `há ${Math.max(1, m)} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
};
