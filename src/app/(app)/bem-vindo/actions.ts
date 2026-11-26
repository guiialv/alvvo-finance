"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/context";
import { PERGUNTAS, type Respostas } from "@/lib/perfil";

/** Guarda as respostas da pesquisa inicial (parcial ou concluída). */
export async function salvarPerfil(r: Respostas, concluir: boolean): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await getContext();
  const clean: Respostas = {};
  for (const p of PERGUNTAS) {
    const v = r[p.id];
    if (p.kind === "text") { if (typeof v === "string" && v.trim()) clean[p.id] = v.trim().slice(0, 600); continue; }
    const ok = new Set((p.opcoes ?? []).map(([k]) => k));
    if (p.kind === "one" && typeof v === "string" && ok.has(v)) clean[p.id] = v;
    if (p.kind === "many" && Array.isArray(v)) clean[p.id] = v.filter((x) => ok.has(x)).slice(0, p.max ?? 20);
  }
  const { error } = await ctx.supabase.from("member_profiles").upsert({
    user_id: ctx.user.id, household_id: ctx.household.id, display_name: ctx.member.display_name, answers: clean,
    updated_at: new Date().toISOString(), ...(concluir ? { completed_at: new Date().toISOString() } : {}),
  });
  if (error) return { error: "Não foi possível salvar as respostas agora." };
  revalidatePath("/"); revalidatePath("/noticias");
  return { ok: true };
}

/** "Responder depois": a pesquisa deixa de abrir sozinha e fica disponível no menu do perfil. */
export async function adiarPerfil() {
  const ctx = await getContext();
  await ctx.supabase.rpc("set_my_prefs", { hh: ctx.household.id, p: { anamnese: "adiada" } });
  revalidatePath("/");
}
