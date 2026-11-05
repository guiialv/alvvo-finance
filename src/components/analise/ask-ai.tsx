"use client";

import { useState, useTransition } from "react";
import { askAsset, saveAnswer } from "@/app/(app)/analise/ai-actions";

const SUGGESTED = ["Quais são os principais riscos deste ativo?", "Como ele se compara aos pares do setor?", "O que explica o desempenho recente?", "Resuma os fundamentos em linguagem simples."];

/** “Pergunte à IA” sobre o ativo, com perguntas sugeridas e opção de guardar a resposta numa carteira de avaliação. */
export function AskAI({ yahoo, enabled, items = [] }: { yahoo: string; enabled: boolean; items?: { id: string; portfolio: string }[] }) {
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ask = (question: string) => start(async () => {
    setErr(null); setAnswer(null); setSaved(null); setAsked(question);
    const r = await askAsset(yahoo, question);
    if (r.error) setErr(r.error); else setAnswer(r.text ?? "");
  });

  return (
    <section className="card">
      <div className="mb-3 flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-[11px] text-[#f3e3bf]">✦</span><h2>Pergunte à IA</h2></div>
      {!enabled ? <p className="text-sm text-ink/55">Ative a IA em <a className="text-brand underline" href="/configuracoes">Configurações</a> para conversar sobre este ativo.</p> : (<>
        <div className="space-y-1">
          {SUGGESTED.map((s) => (
            <button key={s} type="button" disabled={pending} onClick={() => ask(s)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink/75 transition hover:bg-ink/[0.04] disabled:opacity-50">
              {s}<span className="text-ink/30">›</span>
            </button>))}
        </div>
        <form className="mt-2 flex items-center gap-1 rounded-full border border-ink/10 bg-surface py-1 pl-3 pr-1 focus-within:border-gold" onSubmit={(e) => { e.preventDefault(); if (q.trim()) ask(q.trim()); }}>
          <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Pergunte o que quiser…" value={q} onChange={(e) => setQ(e.target.value)} maxLength={600} />
          <button className="grid h-7 w-7 place-items-center rounded-full bg-ink text-[#f6efe2] disabled:opacity-40" disabled={pending || !q.trim()} aria-label="Enviar">↑</button>
        </form>
        {(pending || answer || err) && (
          <div className="mt-3 rounded-2xl bg-ink/[0.03] p-3">
            {asked && <div className="mb-1 text-xs font-medium text-ink/50">{asked}</div>}
            {pending && <div className="space-y-2 py-1"><div className="skeleton h-3 w-full" /><div className="skeleton h-3 w-5/6" /><div className="skeleton h-3 w-4/6" /></div>}
            {err && <p className="text-sm text-loss">{err}</p>}
            {answer && <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">{answer}</p>}
            {answer && items.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-ink/[0.06] pt-2 text-xs">
                <span className="text-ink/45">Guardar em:</span>
                {items.map((it) => <button key={it.id} type="button" className="rounded-full border border-ink/12 px-2 py-0.5 hover:border-gold" onClick={() => start(async () => { const r = await saveAnswer(it.id, asked ?? "", answer); setSaved(r.error ?? `Guardado em ${it.portfolio} ✓`); })}>{it.portfolio}</button>)}
                {saved && <span className={saved.endsWith("✓") ? "text-gain" : "text-loss"}>{saved}</span>}
              </div>)}
            {answer && <p className="mt-2 text-[10.5px] text-ink/40">Gerado por IA com os dados da plataforma. Não é recomendação de investimento.</p>}
          </div>)}
      </>)}
    </section>
  );
}
