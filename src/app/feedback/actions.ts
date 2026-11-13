"use server";

import { getContext } from "@/lib/context";

const KINDS = ["problema", "ideia", "elogio", "duvida"] as const;

/** Feedback dos testadores: vai para a lista do administrador da plataforma (/admin). */
export async function sendFeedback(kind: string, message: string, page: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await getContext();
  const msg = message.trim();
  if (msg.length < 2) return { error: "Escreva um pouco mais." };
  const { error } = await ctx.supabase.from("feedback").insert({
    household_id: ctx.household.id, user_id: ctx.user.id, author_name: ctx.member.display_name,
    kind: (KINDS as readonly string[]).includes(kind) ? kind : "ideia", page: page.slice(0, 300), message: msg.slice(0, 4000),
  });
  return error ? { error: "Não foi possível enviar agora. Tente de novo." } : { ok: true };
}
