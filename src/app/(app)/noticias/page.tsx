import Link from "next/link";
import { requireArea } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { NewsCards } from "@/components/news-cards";
import { carregarPerfil, noticiasParaVoce } from "@/lib/news/personal";
import { INTERESSES, interessesDe } from "@/lib/perfil";

export const dynamic = "force-dynamic";

export default async function NoticiasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireArea("visao-geral");
  const perfil = await carregarPerfil(ctx);
  const sp = await searchParams;
  const qtd = Math.min(30, Math.max(5, Math.round((Number(sp.mais) || 5) / 5) * 5));
  const tema = sp.tema && (sp.tema === "carteira" || INTERESSES[sp.tema]) ? sp.tema : undefined;
  const itens = await noticiasParaVoce(ctx, perfil, qtd, tema);
  const temMais = itens.length >= qtd && qtd < 30;
  const ints = interessesDe(perfil.answers);
  const rotulos = new Set(ints.map((k) => INTERESSES[k].label));
  const outros = Object.keys(INTERESSES).filter((k) => { const l = INTERESSES[k].label; if (rotulos.has(l)) return false; rotulos.add(l); return true; });
  const nomeTema = tema === "carteira" ? "seus ativos" : tema ? INTERESSES[tema].label : "";
  const q = (extra: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams(); for (const [k, v] of Object.entries({ tema, ...extra })) if (v !== undefined && v !== "") u.set(k, String(v));
    const s = u.toString(); return s ? `/noticias?${s}` : "/noticias";
  };
  const chip = (ativo: boolean) => `rounded-full border px-3 py-1 text-xs font-medium transition ${ativo ? "border-ink bg-ink text-white" : "border-[#e2d8c6] bg-surface text-ink/70 hover:border-ink/30"}`;
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
  return (
    <div className="max-w-3xl">
      <PageHeader title="Notícias para você" subtitle={`As principais notícias de ${hoje}, selecionadas entre as fontes acompanhadas pelo Alvvo de acordo com o seu perfil, a sua carteira e os ativos que você acompanha.`} />
      <section className="mb-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">Filtrar por tema</p>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/noticias" className={chip(!tema)}>Todas</Link>
          {ints.map((k) => <Link key={k} href={`/noticias?tema=${k}`} className={chip(tema === k)}>{INTERESSES[k].label}</Link>)}
          {perfil.ativos.length > 0 && <Link href="/noticias?tema=carteira" className={chip(tema === "carteira")}>{perfil.ativos.length} {perfil.ativos.length === 1 ? "ativo acompanhado" : "ativos acompanhados"}</Link>}
          {tema && tema !== "carteira" && !ints.includes(tema) && <span className={chip(true)}>{INTERESSES[tema].label}</span>}
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-ink/55 hover:text-ink">Outros temas</summary>
          <div className="mt-2 flex flex-wrap gap-2">{outros.map((k) => <Link key={k} href={`/noticias?tema=${k}`} className={chip(tema === k)}>{INTERESSES[k].label}</Link>)}</div>
        </details>
        {!ints.length && !tema && <p className="mt-2 text-sm text-ink/55">Sem interesses informados: exibindo as notícias mais relevantes do dia.</p>}
        <Link href="/bem-vindo?editar=1" className="mt-2 inline-block text-xs font-medium text-brand">{perfil.concluido ? "Ajustar interesses do perfil" : "Informar meus interesses"} →</Link>
      </section>
      {tema && itens.length === 0 && <p className="mb-4 rounded-2xl border border-[#e2d8c6] bg-surface px-4 py-3 text-sm text-ink/65">Não há notícias sobre {nomeTema} nas últimas 48 horas entre as fontes acompanhadas. <Link href="/noticias" className="font-medium text-brand">Ver todas</Link></p>}
      {(!tema || itens.length > 0) && <NewsCards itens={itens} />}
      <div className="mt-5 flex flex-col items-center gap-2">
        {temMais
          ? <Link href={`${q({ mais: qtd + 5 })}#n-${qtd + 1}`} className="btn-ghost">Carregar mais notícias</Link>
          : itens.length > 5 && <p className="text-sm text-ink/50">Estas são todas as notícias relevantes {tema ? `sobre ${nomeTema}` : "para o seu perfil"} nas últimas 48 horas.</p>}
        {qtd > 5 && <Link href={q({})} className="text-xs text-ink/45 hover:text-ink">Voltar às 5 principais</Link>}
      </div>
      <p className="mt-5 text-[12px] leading-relaxed text-ink/45">A seleção combina a relevância da notícia (fonte, tema, cobertura e horário) com os setores, investimentos e objetivos do seu perfil. Os links abrem o site da fonte; sempre que possível, a seleção prefere fontes de acesso livre. Conteúdo informativo, não constitui recomendação de investimento.</p>
    </div>
  );
}
