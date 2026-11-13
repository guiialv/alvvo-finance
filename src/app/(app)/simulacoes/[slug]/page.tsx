import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/context";
import { loadSimData } from "@/lib/sim/load";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ALL, GROUPS } from "../catalog";
import { MetaSim } from "../sims/meta";
import { InvestSim } from "../sims/investimentos";
import { CaptacaoSim } from "../sims/captacao";
import { AlavancagemSim } from "../sims/alavancagem";
import { AlugarSim } from "../sims/alugar";
import { ConsorcioSim } from "../sims/consorcio";

export default async function SimPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireArea("visao-geral");
  const { slug } = await params, sp = await searchParams;
  const info = ALL.find((s) => s.slug === slug);
  if (!info) notFound();
  const group = GROUPS.find((g) => g.items.includes(info))!;
  const { data, tesouro } = await loadSimData(ctx);
  const num = (v?: string) => (v && isFinite(Number(v)) ? Number(v) : undefined);

  return (
    <div>
      <Link href="/simulacoes" className="mb-3 inline-flex items-center gap-1 text-sm text-ink/55 hover:text-ink"><Icon name="left" /> Simulações</Link>
      <PageHeader title={info.name} subtitle={<><span className="eyebrow mr-2">{group.title}</span>{info.q}</>}>
        <div className="flex flex-wrap gap-1.5">
          {group.items.filter((s) => s.slug !== slug).map((s) => <Link key={s.slug} href={`/simulacoes/${s.slug}`} className="btn-ghost">{s.name}</Link>)}
        </div>
      </PageHeader>
      {slug === "meta" && <MetaSim d={data} />}
      {slug === "investimentos" && <InvestSim d={data} tesouro={tesouro} />}
      {slug === "captacao" && <CaptacaoSim d={data} />}
      {slug === "alavancagem" && <AlavancagemSim d={data} init={{ valor: num(sp.valor), prazo: num(sp.prazo), taxa: num(sp.taxa) }} />}
      {slug === "alugar-ou-comprar" && <AlugarSim d={data} />}
      {slug === "financiar-ou-consorcio" && <ConsorcioSim d={data} />}
      <p className="mt-6 text-[12px] text-ink/45">Estimativa educativa com as premissas desta tela — não é recomendação de investimento nem proposta de crédito.</p>
    </div>
  );
}
