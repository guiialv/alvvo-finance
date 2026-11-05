"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { addToPortfolio } from "./actions";

/** Botão “+ Carteira”: escolhe uma carteira de avaliação existente ou cria uma nova. */
export function AddToPortfolio({ yahoo, portfolios, inPortfolios = [], compact = false }: { yahoo: string; portfolios: { id: string; name: string }[]; inPortfolios?: string[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>(inPortfolios);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const add = (portfolioId?: string) => start(async () => {
    setMsg(null);
    const r = await addToPortfolio({ portfolioId, newName: portfolioId ? undefined : name, yahoo });
    if (r.error) { setMsg(r.error); return; }
    setAdded((a) => [...a, r.id!]);
    setName("");
    setMsg("Adicionado ✓");
    router.refresh();
  });

  return (
    <div className="relative inline-block" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className={compact ? `rounded-full border px-2 py-0.5 text-[11px] transition ${added.length ? "border-gold/50 bg-brand-soft text-brand" : "border-ink/12 text-ink/55 hover:border-ink/30 hover:text-ink"}` : "btn-ghost"}>
        {added.length ? (compact ? "✓ Carteira" : `Em ${added.length} carteira(s)`) : "+ Carteira"}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-64 rounded-2xl border border-ink/10 bg-surface p-2 text-left shadow-[0_18px_40px_-12px_rgba(40,30,20,.35)]">
          <div className="px-2 pb-1 pt-1 text-[10.5px] uppercase tracking-[0.14em] text-ink/45">Carteiras de avaliação</div>
          {portfolios.map((p) => (
            <button key={p.id} type="button" disabled={pending || added.includes(p.id)} onClick={() => add(p.id)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-ink/[0.04] disabled:opacity-50">
              <span className="truncate">{p.name}</span>{added.includes(p.id) && <span className="text-xs text-gain">✓</span>}
            </button>
          ))}
          <form className="mt-1 flex gap-1 border-t border-ink/5 px-1 pt-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add(); }}>
            <input className="input !rounded-lg !py-1 text-xs" placeholder="Nova carteira…" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <button className="btn !px-3 !py-1 text-xs" disabled={pending || !name.trim()}>Criar</button>
          </form>
          {msg && <p className={`px-2 pt-1 text-xs ${msg.endsWith("✓") ? "text-gain" : "text-loss"}`}>{msg}</p>}
        </div>
      )}
    </div>
  );
}
