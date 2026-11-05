"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Botão "Atualizar" dos dados de mercado. */
export function RefreshButton({ label = "Atualizar", universe = false }: { label?: string; universe?: boolean }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <button type="button" disabled={busy} className="btn-ghost !px-2.5 !py-1 text-xs"
      onClick={async () => { setBusy(true); try { await fetch(`/api/market/refresh${universe ? "?universo=1" : ""}`, { method: "POST" }); router.refresh(); } finally { setBusy(false); } }}>
      {busy ? "Atualizando…" : `↻ ${label}`}
    </button>
  );
}
