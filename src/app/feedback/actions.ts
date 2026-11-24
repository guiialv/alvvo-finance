"use server";

import { getContext } from "@/lib/context";

const KINDS = ["problema", "ideia", "elogio", "duvida"] as const;
export interface Attachment { path: string; tipo: "audio" | "print"; mime: string; bytes: number; segundos?: number }

/** Feedback dos testadores (texto, áudio e prints): vai para a lista do administrador da plataforma (/admin). */
export async function sendFeedback(kind: string, message: string, page: string, attachments: Attachment[] = [], device = ""): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await getContext();
  const msg = message.trim();
  // Só anexos da própria pasta (o upload já é restrito a ela no armazenamento)
  const att = (attachments ?? []).filter((a) => typeof a?.path === "string" && a.path.startsWith(`${ctx.user.id}/`)).slice(0, 5)
    .map((a) => ({ path: a.path.slice(0, 200), tipo: a.tipo === "audio" ? "audio" : "print", mime: String(a.mime).slice(0, 40), bytes: Number(a.bytes) || 0, ...(a.segundos ? { segundos: Math.round(Number(a.segundos)) } : {}) }));
  if (msg.length < 2 && !att.length) return { error: "Escreva uma mensagem, grave um áudio ou adicione um print." };
  const { error } = await ctx.supabase.from("feedback").insert({
    household_id: ctx.household.id, user_id: ctx.user.id, author_name: ctx.member.display_name,
    kind: (KINDS as readonly string[]).includes(kind) ? kind : "ideia", page: page.slice(0, 300), message: (msg || (att.some((a) => a.tipo === "audio") ? "(áudio)" : "(print)")).slice(0, 4000),
    attachments: att, device: device.slice(0, 220) || null,
  });
  return error ? { error: "Não foi possível enviar agora. Tente de novo." } : { ok: true };
}
