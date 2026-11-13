"use client";

import { useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { sendFeedback } from "@/app/feedback/actions";

const KINDS: [string, string][] = [["problema", "Algo errado"], ["ideia", "Ideia"], ["duvida", "Dúvida"], ["elogio", "Elogio"]];

/** Botão flutuante de feedback: registra junto a tela e os filtros em que a pessoa estava. */
export function FeedbackButton() {
  const [open, setOpen] = useState(false), [kind, setKind] = useState("problema"), [msg, setMsg] = useState("");
  const [done, setDone] = useState<string | null>(null), [pending, start] = useTransition();
  const path = usePathname(), sp = useSearchParams();
  const page = `${path}${sp?.toString() ? `?${sp}` : ""}`;
  const submit = () => start(async () => {
    const r = await sendFeedback(kind, msg, page);
    if (r.ok) { setDone("Obrigado! Recebemos o seu feedback."); setMsg(""); setTimeout(() => { setOpen(false); setDone(null); }, 1800); }
    else setDone(r.error ?? "Erro");
  });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="fixed bottom-4 right-4 z-40 rounded-full bg-espresso px-4 py-2.5 text-[13px] font-medium text-[#f6efe2] shadow-lg hover:bg-[#2a241f] print:hidden" aria-label="Enviar feedback">
        💬 Feedback
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="Enviar feedback" className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><h2>Feedback do beta</h2><button type="button" aria-label="Fechar" className="text-ink/40 hover:text-ink" onClick={() => setOpen(false)}>✕</button></div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {KINDS.map(([k, l]) => <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full px-3 py-1.5 text-[13px] ${kind === k ? "bg-ink text-[#f6efe2]" : "border border-ink/15 text-ink/65"}`}>{l}</button>)}
            </div>
            <textarea className="input min-h-[120px]" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={kind === "problema" ? "O que aconteceu? O que você esperava ver?" : "Conte para a gente…"} maxLength={4000} autoFocus />
            <p className="mt-1 text-[11px] text-ink/45">Vai junto: a tela em que você está ({path}). Não enviamos nenhum valor ou lançamento seu.</p>
            {done && <p className={`mt-2 text-sm ${done.startsWith("Obrigado") ? "text-gain" : "text-loss"}`}>{done}</p>}
            <button type="button" className="btn mt-3 w-full" disabled={pending || msg.trim().length < 2} onClick={submit}>{pending ? "Enviando…" : "Enviar"}</button>
          </div>
        </div>
      )}
    </>
  );
}
