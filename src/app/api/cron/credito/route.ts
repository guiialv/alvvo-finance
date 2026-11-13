import { NextResponse } from "next/server";
import { refreshCreditRates } from "@/lib/sim/credit-rates";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Atualiza as taxas de crédito do Banco Central (no máximo 1x por hora) e mostra um resumo. */
export async function GET() {
  const { data } = await createAdminClient().from("market_macro").select("value, updated_at").eq("key", "credit_rates").maybeSingle();
  const age = data?.updated_at ? (Date.now() - Date.parse(data.updated_at as string)) / 60000 : Infinity;
  const cr = age > 60 ? await refreshCreditRates().catch((e) => ({ error: (e as Error).message, at: null, mods: {} })) : (data!.value as Awaited<ReturnType<typeof refreshCreditRates>>);
  return NextResponse.json({
    at: cr.at, error: (cr as { error?: string }).error ?? null,
    mods: Object.values(cr.mods).map((m) => `${m.segment} ${m.label}: mediana ${(m.median * 100).toFixed(2)}% a.m. (${m.n} bancos, ${m.period}) · melhor ${m.best[0]?.name} ${(m.best[0]?.monthly * 100).toFixed(2)}%`),
  });
}
