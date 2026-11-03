"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { templateCategories, type Template } from "@/lib/categories-default";

export type OnbState = { error?: string } | undefined;

export async function onboard(_: OnbState, formData: FormData): Promise<OnbState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const mode = String(formData.get("mode"));
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (mode === "entrar") {
    const provider = (user.app_metadata as { provider?: string } | undefined)?.provider ?? "email";
    const { error } = await supabase.rpc("join_household", {
      p_code: String(formData.get("code") ?? ""), p_display_name: displayName, p_message: String(formData.get("message") ?? ""), p_provider: provider,
    });
    if (error) return { error: error.message.includes("inválido") ? "Código de convite inválido ou vencido. Peça um novo ao dono da conta." : error.message };
    redirect("/aguardando");
  }

  const template = (String(formData.get("template") ?? "familia") as Template);
  const { data: hh, error } = await supabase.rpc("create_household", { p_name: String(formData.get("household_name") ?? ""), p_display_name: displayName });
  if (error || !hh) return { error: error?.message ?? "Não foi possível criar a conta." };
  await supabase.from("households").update({ template }).eq("id", hh as string);

  const rows = templateCategories(template).map((c, i) => ({ household_id: hh as string, sort: i, ...c }));
  const { error: catErr } = await supabase.from("categories").insert(rows);
  if (catErr) return { error: "Conta criada, mas falhou ao criar as categorias: " + catErr.message };
  redirect("/");
}

export async function cancelRequest() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await supabase.from("household_members").delete().eq("user_id", user.id).eq("status", "pendente");
  redirect("/onboarding");
}
