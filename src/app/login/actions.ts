"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

const safeNext = (v: FormDataEntryValue | null) => { const s = String(v ?? ""); return s.startsWith("/") && !s.startsWith("//") ? s : "/"; };
async function origin() { const h = await headers(); return h.get("origin") ?? `https://${h.get("host")}`; }

export async function authenticate(prev: AuthState, formData: FormData): Promise<AuthState> {
  const mode = String(formData.get("mode"));
  if (mode === "magic") return magicLink(formData);
  return mode === "criar" ? signUp(formData) : signIn(formData);
}

async function signIn(formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return { error: error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message };
  redirect(safeNext(formData.get("next")));
}

async function signUp(formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const next = safeNext(formData.get("next"));
  const { data, error } = await supabase.auth.signUp({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    options: { emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next === "/" ? "/onboarding" : next)}` },
  });
  if (error) return { error: error.message.includes("Password") ? "A senha precisa ter pelo menos 8 caracteres." : error.message };
  if (data.session) redirect(next === "/" ? "/onboarding" : next);
  return { message: "Conta criada! Confirme pelo link enviado ao seu e-mail." };
}

async function magicLink(formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Informe o seu e-mail." };
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(safeNext(formData.get("next")))}` } });
  if (error) return { error: error.message };
  return { message: `Enviamos um link de acesso para ${email}. Abra no mesmo navegador.` };
}

export async function signInWithGoogle(formData: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(safeNext(formData.get("next")))}` },
  });
  if (error || !data?.url) redirect("/login?erro=google");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
