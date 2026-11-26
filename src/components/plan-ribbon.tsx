"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { planoDaRota, type Plano } from "@/lib/planos";
import { PlanBadge } from "./plan-badge";

/** Faixa discreta nas telas pagas: sinaliza o recurso e, no beta, avisa que está liberado. */
export function PlanRibbon({ plano, origem }: { plano: Plano; origem: string | null }) {
  const path = usePathname();
  const req = planoDaRota(path);
  if (!req) return null;
  const liberado = plano === "familia" || (plano === "premium" && req === "premium");
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[#ead9b6] px-3.5 py-2 text-[12.5px] text-[#6b4a12]" style={{ background: "linear-gradient(135deg, #fcf6ea, #f6e8cb)" }}>
      <PlanBadge plano={req} />
      <span className="min-w-0 flex-1">
        {liberado
          ? origem === "codigo" || origem === "cortesia" ? `Recurso do plano ${req === "familia" ? "Família" : "Premium"}, liberado para você durante o beta.` : `Incluído no seu plano.`
          : `Este recurso faz parte do plano ${req === "familia" ? "Família" : "Premium"}.`}
      </span>
      <Link href="/planos" className="font-semibold hover:underline">Ver planos</Link>
    </div>
  );
}
