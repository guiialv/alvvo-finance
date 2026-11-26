import Link from "next/link";
import { requireArea } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { GROUPS } from "./catalog";
import { PlanBadge } from "@/components/plan-badge";
import { SIM_FREE } from "@/lib/planos";

const CAPA: Record<string, string> = {
  "Investir": "radial-gradient(90% 120% at 100% 0%, #f6d79a 0%, rgba(246,215,154,0) 60%), linear-gradient(135deg, #e2a64b, #8f5e13)",
  "Decidir uma compra": "radial-gradient(90% 120% at 100% 0%, #e6bfb5 0%, rgba(230,191,181,0) 60%), linear-gradient(135deg, #b8955a, #6b2e26)",
  "Captar recursos": "radial-gradient(90% 120% at 100% 0%, rgba(226,166,75,.55) 0%, rgba(226,166,75,0) 60%), linear-gradient(135deg, #3a322b, #15120f)",
};

export default async function SimulacoesPage() {
  await requireArea("visao-geral");
  return (
    <div>
      <PageHeader title="Simulações" subtitle="Decisões de dinheiro ao longo do tempo. Cada simulador já vem preenchido com o seu patrimônio, a sua renda e as taxas do mercado de hoje — e você ajusta tudo." />
      <div className="grid gap-5 lg:grid-cols-3">
        {GROUPS.map((g) => (
          <section key={g.title} className={`flex flex-col gap-3 overflow-hidden rounded-[22px] p-5 ${g.dark ? "bg-espresso text-[#f6efe2]" : "border border-ink/[0.07] bg-surface"}`}>
            {CAPA[g.title] && <div aria-hidden className="-mx-5 -mt-5 mb-1 h-16" style={{ background: CAPA[g.title] }} />}
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[28px] font-semibold tracking-[-0.02em]">{g.title}</h2>
              {g.dark && <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#d9b77e]">novo</span>}
            </div>
            <p className={`text-sm ${g.dark ? "text-[#cfc3b0]" : "text-ink/60"}`}>{g.desc}</p>
            {g.items.map((it) => (
              <Link key={it.slug} href={`/simulacoes/${it.slug}`} className={`flex flex-col gap-1 rounded-2xl px-4 py-3.5 transition ${g.dark ? "bg-[#2a241f] hover:bg-[#332c26]" : "bg-paper hover:bg-[#ece6db]"}`}>
                <span className="flex items-center gap-2 text-[15.5px] font-semibold">{it.name}{it.slug === "posso-comprar" && <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-finance">novo</span>}{!SIM_FREE.has(it.slug) && <PlanBadge tom={g.dark ? "escuro" : "claro"} />}</span>
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
