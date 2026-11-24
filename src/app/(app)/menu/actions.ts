"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/context";
import { TAB_MAX, TAB_OPTIONS } from "@/lib/mobile-tabs";

/** Salva as abas da barra de baixo da pessoa (só as próprias preferências). */
export async function saveTabs(tabs: string[]): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await getContext();
  const clean = tabs.filter((h) => TAB_OPTIONS.some(([x]) => x === h)).slice(0, TAB_MAX);
  const { error } = await ctx.supabase.rpc("set_my_prefs", { hh: ctx.household.id, p: { menu: clean } });
  if (error) return { error: "Não foi possível salvar agora." };
  revalidatePath("/", "layout");
  return { ok: true };
}
