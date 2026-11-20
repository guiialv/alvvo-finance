"use client";

import { useTransition } from "react";
import { refreshBankBalances } from "@/app/(app)/conexoes/actions";

export function RefreshBankButton() {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => refreshBankBalances())} className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-50">
      {pending ? "Buscando no banco…" : "↻ Atualizar do banco"}
    </button>
  );
}
