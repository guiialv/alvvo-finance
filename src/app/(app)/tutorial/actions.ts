"use server";

import { getContext } from "@/lib/context";

/** O tour do Início não abre mais sozinho depois de visto (pode ser revisto em "Como usar"). */
export async function marcarTourVisto() {
  const ctx = await getContext();
  await ctx.supabase.rpc("set_my_prefs", { hh: ctx.household.id, p: { tour: "visto" } });
}
