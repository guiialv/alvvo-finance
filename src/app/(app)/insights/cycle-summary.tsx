"use client";

import { useState } from "react";
import { summarizeCycle } from "./actions";

/** Resumo do ciclo em linguagem simples, gerado com IA quando o usuário pede. */
export function CycleSummary() {
  const [busy, setBusy] = useState(false), [res, setRes] = useState<{ text?: string; error?: string } | null>(null);
  return (
    <section className="card mb-5 border-violet-100 bg-gradient-to-b from-violet-50/50 to-white">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2>Resumo do ciclo com IA</h2><p className="text-xs text-ink/50">Um parágrafo sobre como está o mês, a partir dos seus números.</p></div>
        <button className="btn-ghost" disabled={busy} onClick={async () => { setBusy(true); try { setRes(await summarizeCycle()); } finally { setBusy(false); } }}>{busy ? "Gerando…" : res ? "Gerar de novo" : "Gerar resumo"}</button></div>
      {res?.text && <p className="mt-3 whitespace-pre-line text-sm text-ink/75">{res.text}</p>}
      {res?.error && <p className="mt-3 text-sm text-loss">{res.error}</p>}
    </section>
  );
}
