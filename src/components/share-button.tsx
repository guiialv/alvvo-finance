"use client";

import { useState } from "react";

/** Compartilhar um convite: no celular abre o compartilhar do aparelho (WhatsApp, e-mail…); no computador, copia. */
export function ShareButton({ url, text, title = "alvvo finance", label = "Enviar convite", className = "" }: { url: string; text: string; title?: string; label?: string; className?: string }) {
  const [ok, setOk] = useState(false);
  const go = async () => {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) { try { await nav.share({ title, text, url }); return; } catch { /* cancelado: copia */ } }
    try { await navigator.clipboard.writeText(`${text} ${url}`); setOk(true); setTimeout(() => setOk(false), 1800); } catch { /* sem permissão */ }
  };
  return <button type="button" onClick={go} className={className || "text-[12px] text-brand hover:underline"}>{ok ? "Copiado ✓" : label}</button>;
}
