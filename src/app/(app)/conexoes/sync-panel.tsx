"use client";

import { useActionState } from "react";
import { runSync, type SyncState } from "./actions";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const TONE: Record<string, string> = { importar: "text-gain", atualizar: "text-bronze", "sem novidades": "text-ink/40", erro: "text-loss" };

export function SyncPanel({ ready }: { ready: boolean }) {
  const [state, action, pending] = useActionState<SyncState, FormData>(runSync, {});
  const s = state.summary;
  return (
    <section className="card">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto">Sincronizar</h2>
        <form action={action}><input type="hidden" name="mode" value="previa" />
          <button disabled={!ready || pending} className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-40">Ver prévia</button></form>
        <form action={action}><input type="hidden" name="mode" value="importar" />
          <button disabled={!ready || pending} className="btn !px-3 !py-1.5 text-xs disabled:opacity-40">Sincronizar agora</button></form>
      </div>
      <p className="mt-1 text-xs text-ink/50">
        {ready ? "A prévia mostra o que entraria, sem gravar nada. A sincronização também roda sozinha todo dia de manhã." : "Escolha a conta da plataforma e ative a importação de pelo menos uma conta abaixo."}
      </p>
      {pending && <p className="mt-3 text-sm text-ink/60">Buscando no banco… pode levar até um minuto na primeira vez.</p>}
      {state.error && <p className="mt-3 rounded-lg bg-loss/10 p-3 text-sm text-loss">{state.error}</p>}
      {s && !pending && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-medium text-ink/60">{s.dryRun ? "Prévia (nada foi gravado)" : "Sincronização concluída"}</p>
          {s.lines.length === 0 && <p className="text-sm text-ink/50">Nenhuma conta ativa para sincronizar.</p>}
          {s.lines.map((l, i) => (
            <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-ink/5 py-1 text-sm">
              <span className="min-w-0 [overflow-wrap:anywhere]">{l.label}</span>
              <span className={`text-xs ${TONE[l.action] ?? ""}`}>
                {l.action === "erro" ? `erro: ${l.detail}` : l.action === "sem novidades" ? "sem novidades" : `${l.action === "atualizar" ? "atualiza" : s.dryRun ? "entraria" : "entrou"} · ${l.rows} lanç. · ${brl(Math.abs(l.total))}`}
                {l.detail && l.action !== "erro" ? ` · ${l.detail}` : ""}
              </span>
            </div>
          ))}
          {s.dryRun && s.lines.some((l) => l.rows > 0) && <p className="pt-1 text-xs text-ink/50">Confira os valores com as faturas e extratos. Se estiver certo, clique em “Sincronizar agora”.</p>}
        </div>
      )}
    </section>
  );
}
