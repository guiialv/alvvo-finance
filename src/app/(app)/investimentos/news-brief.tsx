"use client";

import { useEffect, useState } from "react";
import { getNewsBrief, type Brief } from "./news-actions";

type Lite = { title: string; url: string; source: string };
const IMPACT: Record<string, [string, string]> = { positivo: ["▲", "text-emerald-700"], negativo: ["▼", "text-loss"], neutro: ["●", "text-ink/40"] };

/** Leitura da IA: carrega depois da página (não atrasa a abertura) e fica guardada por 2 horas. */
export function NewsBrief({ stories }: { stories: Record<string, Lite> }) {
  const [state, setState] = useState<"loading" | "off" | "error" | Brief>("loading");
  useEffect(() => {
    let live = true;
    getNewsBrief().then((b) => { if (live) setState(!b ? "off" : "error" in b ? "error" : b); }).catch(() => live && setState("error"));
    return () => { live = false; };
  }, []);
  if (state === "off") return null;
  return (
    <section className="card mb-5 border border-[#b8955a]/25 bg-gradient-to-br from-[#fbf6ec] to-white">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="eyebrow text-[#9a7a44]">Leitura ALVVO · o que importa agora</div>
        {typeof state === "object" && <span className="text-[11px] text-ink/40">às {new Date(state.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</span>}
      </div>
      {state === "loading" && <div className="space-y-2"><div className="skeleton h-4 w-3/4 rounded" /><div className="skeleton h-4 w-2/3 rounded" /><div className="skeleton h-4 w-1/2 rounded" /></div>}
      {state === "error" && <p className="text-sm text-ink/50">Não foi possível gerar a leitura agora. As notícias abaixo já estão filtradas por relevância.</p>}
      {typeof state === "object" && (
        <>
          {state.resumo && <p className="text-[15px] leading-relaxed text-ink/80">{state.resumo}</p>}
          {state.picks.length > 0 ? (
            <ul className="mt-3 space-y-2.5">
              {state.picks.map((p) => {
                const s = stories[p.id];
                if (!s) return null;
                const [ic, cl] = IMPACT[p.impacto] ?? IMPACT.neutro;
                return (
                  <li key={p.id} className="flex gap-2.5">
                    <span className={`mt-0.5 text-xs ${cl}`} title={`Impacto ${p.impacto} para a carteira`}>{ic}</span>
                    <div className="min-w-0">
                      <a href={s.url} target="_blank" rel="noreferrer" className="font-medium leading-snug hover:underline">{s.title}</a>
                      <div className="text-[13px] text-ink/60">{p.porque} <span className="text-ink/35">· {s.source}</span></div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <p className="mt-2 text-sm text-ink/50">Nada que mexa com a sua carteira neste momento.</p>}
        </>
      )}
    </section>
  );
}
