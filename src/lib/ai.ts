import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import type { Ctx } from "@/lib/context";

/**
 * Chamadas à API da Anthropic (Claude). A chave vem:
 * - da plataforma (ANTHROPIC_API_KEY), só para contas com IA incluída (liberadas pelo administrador da plataforma); ou
 * - da chave do próprio usuário (Claude Console), guardada criptografada.
 * A assinatura do Claude.ai (Pro/Max) não pode ser usada por aplicativos de terceiros.
 */
export const AI_MODEL = process.env.AI_MODEL ?? "claude-sonnet-5-5";

export async function aiKeyFor(ctx: Ctx): Promise<string | null> {
  if (ctx.household.ai_mode === "incluida" && ctx.household.ai_included) return process.env.ANTHROPIC_API_KEY ?? null;
  if (ctx.household.ai_mode === "chave") {
    const { data } = await createAdminClient().from("household_secrets").select("ai_key_enc").eq("household_id", ctx.household.id).maybeSingle();
    return data?.ai_key_enc ? decryptSecret(data.ai_key_enc as string) : null;
  }
  return null;
}
export const aiAvailable = (ctx: Ctx) => ctx.household.ai_mode === "chave" || (ctx.household.ai_mode === "incluida" && ctx.household.ai_included);

export type AiContent = { type: "text"; text: string } | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

/** Envia uma mensagem e devolve o texto da resposta. Lança erro com mensagem amigável. */
export async function askClaude(apiKey: string, opts: { system?: string; content: AiContent[]; maxTokens?: number; model?: string }): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: opts.model ?? AI_MODEL, max_tokens: opts.maxTokens ?? 8000, system: opts.system, messages: [{ role: "user", content: opts.content }] }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) throw new Error("A chave de API do Claude foi recusada. Confira em Configurações → Inteligência artificial.");
    if (res.status === 429) throw new Error("Limite de uso da API atingido. Tente de novo em alguns minutos.");
    if (res.status === 400 && body.includes("credit")) throw new Error("Sem créditos na conta do Claude Console desta chave.");
    throw new Error(`Falha na IA (${res.status}).`);
  }
  const json = (await res.json()) as { content: { type: string; text?: string }[] };
  return json.content.filter((c) => c.type === "text").map((c) => c.text).join("");
}

/** Extrai o primeiro objeto/array JSON da resposta (a IA às vezes envolve em ```json). */
export function parseJson<T>(text: string): T {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (m ? m[1] : text).trim();
  const start = raw.search(/[[{]/);
  return JSON.parse(start > 0 ? raw.slice(start) : raw) as T;
}
