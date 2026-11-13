import Link from "next/link";
import { requireArea } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { GROUPS } from "./catalog";

export default async function SimulacoesPage() {
  await requireArea("visao-geral");
  return (
    <div>
      <PageHeader title="Simulações" subtitle="Decisões de dinheiro ao longo do tempo. Cada simulador já vem preenchido com o seu patrimônio, a sua renda e as taxas do mercado de hoje — e você ajusta tudo." />
      <div className="grid gap-5 lg:grid-cols-3">
        {GROUPS.map((g) => (
          <section key={g.title} className={`flex flex-col gap-3 rounded-[22px] p-5 ${g.dark ? "bg-espresso text-[#f6efe2]" : "border border-ink/[0.07] bg-surface"}`}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-serif text-[28px] font-normal">{g.title}</h2>
              {g.dark && <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#d9b77e]">novo</span>}
            </div>
            <p className={`text-sm ${g.dark ? "text-[#cfc3b0]" : "text-ink/60"}`}>{g.desc}</p>
            {g.items.map((it) => (
              <Link key={it.slug} href={`/simulacoes/${it.slug}`} className={`flex flex-col gap-1 rounded-2xl px-4 py-3.5 transition ${g.dark ? "bg-[#2a241f] hover:bg-[#332c26]" : "bg-paper hover:bg-[#ece6db]"}`}>
                <span className="text-[15.5px] font-semibold">{it.name}</span>
                <span className={`text-sm ${g.dark ? "text-[#e7dccb]" : "text-ink/70"}`}>{it.q}</span>
                <span className={`text-[12px] ${g.dark ? "text-[#bfb3a0]" : "text-ink/45"}`}>{it.uses}</span>
              </Link>
            ))}
          </section>
        ))}
      </div>
      <p className="mt-5 text-[12px] text-ink/45">Simulações são estimativas educativas com as premissas mostradas em cada tela — não são recomendação de investimento nem proposta de crédito.</p>
    </div>
  );
}
