import type { NoticiaPessoal } from "@/lib/news/personal";
import { ha } from "@/lib/news/personal";

const FUNDOS = [
  "radial-gradient(90% 90% at 100% 0%, #f6dfb0 0%, rgba(246,223,176,0) 60%), linear-gradient(150deg, #fcf6ea, #f3e3c2)",
  "radial-gradient(90% 90% at 100% 0%, #dfe8d6 0%, rgba(223,232,214,0) 60%), linear-gradient(150deg, #f6f8f2, #e6eddf)",
  "radial-gradient(90% 90% at 100% 0%, #dde3ea 0%, rgba(221,227,234,0) 60%), linear-gradient(150deg, #f6f7f9, #e4e8ee)",
  "radial-gradient(90% 90% at 100% 0%, #f3dcd4 0%, rgba(243,220,212,0) 60%), linear-gradient(150deg, #fcf4f1, #f3e1da)",
  "radial-gradient(90% 90% at 100% 0%, #e8dde8 0%, rgba(232,221,232,0) 60%), linear-gradient(150deg, #faf7fa, #ebe1eb)",
];

/** Notícias selecionadas para a pessoa, com o motivo de cada uma. `compacta` = versão do Início. */
export function NewsCards({ itens, compacta = false }: { itens: NoticiaPessoal[]; compacta?: boolean }) {
  if (!itens.length) return <p className="text-sm text-ink/55">Ainda não há notícias suficientes hoje. A seleção é atualizada ao longo do dia.</p>;
  return (
    <div className={compacta ? "divide-y divide-[#efe7da]" : "grid gap-3"}>
      {itens.map((n, i) => {
        const s = n.story, extra = s.sources.length - 1;
        const tags = n.motivos.length ? n.motivos : s.topics.slice(0, 2);
        if (compacta) return (
          <a key={s.id} href={s.lead.url} target="_blank" rel="noreferrer" className="group block py-2.5">
            <div className="flex flex-wrap gap-1.5">{tags.slice(0, 2).map((t) => <span key={t} className="rounded-full bg-gold/15 px-2 py-0.5 text-[10.5px] font-semibold text-finance">{t}</span>)}</div>
            <p className="mt-1 text-[14px] font-medium leading-snug group-hover:text-brand">{s.lead.title}</p>
            <p className="mt-0.5 text-[11.5px] text-ink/45">{s.lead.source}{extra > 0 ? ` e mais ${extra} ${extra === 1 ? "fonte" : "fontes"}` : ""} · {ha(s.published_at)}</p>
          </a>
        );
        return (
          <a key={s.id} href={s.lead.url} target="_blank" rel="noreferrer" className="card-hover group block rounded-[22px] p-5 shadow-[0_12px_32px_-24px_rgba(60,45,30,.5)]" style={{ background: FUNDOS[i % FUNDOS.length] }}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-white/75 text-[11px] font-semibold text-brand">{i + 1}</span>
              {tags.map((t) => <span key={t} className="rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-semibold text-finance">{t}</span>)}
            </div>
            <h3 className="mt-3 text-[17px] font-semibold leading-snug tracking-[-0.01em] group-hover:text-brand">{s.lead.title}</h3>
            {s.lead.summary && <p className="mt-1.5 line-clamp-3 text-[13.5px] leading-relaxed text-ink/65">{s.lead.summary}</p>}
            <p className="mt-3 text-xs text-ink/50">{s.lead.source}{extra > 0 ? ` e mais ${extra} ${extra === 1 ? "fonte" : "fontes"}` : ""} · {ha(s.published_at)}</p>
          </a>
        );
      })}
    </div>
  );
}
