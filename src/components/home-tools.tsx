import Link from "next/link";
import { Icon } from "@/components/icons";
import type { HomeTool } from "@/lib/home-tools";
import { hideHomeTools } from "@/app/(app)/menu/actions";
import { planoDaRota } from "@/lib/planos";
import { PlanBadge } from "./plan-badge";

/** Faixa de atalhos do Início (a pessoa escolhe quais aparecem ou oculta a faixa). */
export function HomeTools({ tools }: { tools: HomeTool[] }) {
  if (!tools.length) return null;
  return (
    <section data-tour="atalhos" className="mt-4">
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <span className="label !mb-0">Atalhos</span>
        <span className="flex items-center gap-3 text-xs">
          <Link href="/menu#atalhos" className="text-ink/45 hover:text-ink">Personalizar</Link>
          <form action={hideHomeTools}><button className="text-ink/45 hover:text-ink">Ocultar</button></form>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tools.map((t) => (
          <Link key={t.key} href={t.href} className="card-hover group flex min-h-[104px] flex-col justify-between gap-3 rounded-2xl p-4 shadow-[0_10px_30px_-22px_rgba(60,45,30,.45)]" style={{ background: t.bg }}>
            <span className="flex items-start justify-between gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white/70 text-brand"><Icon name={t.icon} className="h-[18px] w-[18px]" /></span>{planoDaRota(t.href) && <PlanBadge plano={planoDaRota(t.href)!} />}</span>
            <span><span className="block text-[14px] font-semibold leading-tight">{t.title}</span><span className="mt-0.5 block text-[12px] leading-snug text-ink/55">{t.desc}</span></span>
          </Link>
        ))}
      </div>
    </section>
  );
}
