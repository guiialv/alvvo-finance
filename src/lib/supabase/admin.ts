import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com a service role: só no servidor, para o que o usuário não pode fazer direto
 * (ler a chave de IA criptografada, gravar dados de mercado). Nunca exponha ao navegador.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
