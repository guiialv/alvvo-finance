"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import type { HomeTool } from "@/lib/home-tools";
import { saveHomeTools } from "./actions";

export function HomeToolsEditor({ current, options }: { current: string[]; options: HomeTool[] }) {
  const [sel, setSel] = useState(current);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (next: string[]) => { setSel(next); setMsg(null); start(async () => { const r = await saveHomeTools(next); setMsg(r.error ?? (next.length ? "Atalhos atualizados." : "Atalhos ocultados na página inicial.")); }); };
  return (
    <section id="atalhos" className="card scroll-mt-20">
      <h2>Atalhos na página inicial</h2>
      <p className="mt-1 text-sm text-ink/55">Ferramentas exibidas logo abaixo do resumo do mês. Desmarque todas para ocultar a faixa.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map((t) => {
          const on = sel.includes(t.key);
          return (
            <button key={t.key} type="button" disabled={pending} onClick={() => save(on ? sel.filter((k) => k !== t.key) : [...sel, t.key])}
              className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${on ? "border-gold/60" : "border-[#e2d8c6] opacity-70 hover:opacity-100"}`} style={on ? { background: t.bg } : undefined}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/70 text-brand"><Icon name={t.icon} className="h-[18px] w-[18px]" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t.title}</span><span className="block text-xs text-ink/55">{t.desc}</span></span>
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${on ? "border-espresso bg-espresso text-[#f6efe2]" : "border-ink/25"}`}>{on && <Icon name="check" className="h-3 w-3" />}</span>
            </button>
          );
        })}
      </div>
      {msg && <p className="mt-2 text-xs text-brand">{msg}</p>}
    </section>
  );
}
