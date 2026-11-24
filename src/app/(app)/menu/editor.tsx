"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { TAB_DEFAULT, TAB_MAX } from "@/lib/mobile-tabs";
import { saveTabs } from "./actions";

export function TabsEditor({ current, options }: { current: string[]; options: [string, string, string][] }) {
  const [draft, setDraft] = useState(current);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const lbl = (h: string) => options.find(([x]) => x === h);
  const toggle = (h: string) => {
    setMsg(null);
    const i = draft.indexOf(h);
    if (i >= 0) setDraft(draft.filter((x) => x !== h));
    else if (draft.length < TAB_MAX) setDraft([...draft, h]);
    else setMsg(`A barra tem ${TAB_MAX} lugares. Tire uma aba antes.`);
  };
  const Slot = ({ h, n }: { h?: string; n: number }) => {
    const o = h ? lbl(h) : null;
    return o ? <span className="flex flex-1 flex-col items-center gap-0.5 text-[10.5px] text-gold"><span className="relative"><Icon name={o[2]} className="h-5 w-5" /><b className="absolute -right-2.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-gold text-[9px] text-espresso">{n}</b></span>{o[1]}</span>
      : <span className="flex flex-1 flex-col items-center gap-0.5 text-[10.5px] text-[#f4f1ea]/35"><span className="h-5 w-5 rounded border border-dashed border-current" />vazio</span>;
  };
  return (
    <div className="space-y-4">
      <section className="card">
        <div className="label mb-2">Prévia</div>
        <div className="flex items-end rounded-2xl bg-espresso px-1 pb-2 pt-3">
          <Slot h={draft[0]} n={1} /><Slot h={draft[1]} n={2} /><Slot h={draft[2]} n={3} /><Slot h={draft[3]} n={4} />
          <span className="flex flex-1 flex-col items-center gap-0.5 text-[10.5px] text-[#f4f1ea]/55"><Icon name="dots" className="h-5 w-5" />Mais</span>
        </div>
      </section>
      <section className="card">
        <div className="label mb-2">Toque para colocar ou tirar da barra</div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {options.map(([h, l, ic]) => { const i = draft.indexOf(h); return (
            <button key={h} type="button" onClick={() => toggle(h)} aria-pressed={i >= 0}
              className={`relative flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs ${i >= 0 ? "border-gold bg-gold/10 font-medium" : "border-ink/10 text-ink/65"}`}>
              <Icon name={ic} className="h-5 w-5" />{l}
              {i >= 0 && <b className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-gold text-[9px] text-espresso">{i + 1}</b>}
            </button>); })}
        </div>
        <p className="mt-2 text-xs text-ink/50">{msg ?? (draft.length < TAB_MAX ? `Escolha mais ${TAB_MAX - draft.length}.` : "Barra completa. Para trocar, tire uma aba primeiro.")}</p>
      </section>
      <div className="flex gap-2">
        <button type="button" className="btn" disabled={pending || !draft.length} onClick={() => start(async () => { const r = await saveTabs(draft); if (r.ok) { setMsg("Barra salva. Vale em todos os seus aparelhos."); router.refresh(); } else setMsg(r.error ?? "Erro"); })}>{pending ? "Salvando…" : "Salvar"}</button>
        <button type="button" className="btn-ghost" onClick={() => setDraft(TAB_DEFAULT.filter((h) => options.some(([x]) => x === h)))}>Voltar ao padrão</button>
      </div>
    </div>
  );
}
