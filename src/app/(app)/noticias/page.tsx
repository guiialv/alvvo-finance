import Link from "next/link";
import { requireArea } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { NewsCards } from "@/components/news-cards";
import { carregarPerfil, noticiasParaVoce } from "@/lib/news/personal";
import { INTERESSES, interessesDe } from "@/lib/perfil";

export const dynamic = "force-dynamic";

export default async function NoticiasPage() {
  const ctx = await requireArea("visao-geral");
  const perfil = await carregarPerfil(ctx);
  const itens = await noticiasParaVoce(ctx, perfil, 5);
  const ints = interessesDe(perfil.answers);
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
  return (
    <div className="max-w-3xl">
      <PageHeader title="Notícias para você" subtitle={`As principais notícias de ${hoje}, selecionadas entre as fontes acompanhadas pelo Alvvo de acordo com o seu perfil, a sua carteira e os ativos que você acompanha.`} />
      <section className="mb-5 flex flex-wrap items-center gap-2">
        {ints.length ? ints.map((k) => <span key={k} className="rounded-full border border-[#e2d8c6] bg-surface px-3 py-1 text-xs font-medium text-ink/70">{INTERESSES[k].label}</span>)
          : <span className="text-sm text-ink/55">Sem interesses informados: exibindo as notícias mais relevantes do dia.</span>}
        {perfil.ativos.length > 0 && <span className="rounded-full border border-[#e2d8c6] bg-surface px-3 py-1 text-xs font-medium text-ink/70">{perfil.ativos.length} {perfil.ativos.length === 1 ? "ativo acompanhado" : "ativos acompanhados"}</span>}
        <Link href="/bem-vindo?editar=1" className="ml-auto text-xs font-medium text-brand">{perfil.concluido ? "Ajustar interesses" : "Informar meus interesses"} →</Link>
      </section>
      <NewsCards itens={itens} />
      <p className="mt-5 text-[12px] leading-relaxed text-ink/45">A seleção combina a relevância da notícia (fonte, tema, cobertura e horário) com os setores, investimentos e objetivos do seu perfil. Os links abrem o site da fonte. Conteúdo informativo, não constitui recomendação de investimento.</p>
    </div>
  );
}
