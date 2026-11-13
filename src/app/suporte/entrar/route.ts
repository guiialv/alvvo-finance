import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SUPPORT_COOKIE } from "@/lib/context";

/** Administrador da plataforma entra (só leitura) numa família que liberou o acesso de suporte. */
export async function GET(request: Request) {
  const url = new URL(request.url), hh = url.searchParams.get("f") ?? "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !/^[0-9a-f-]{36}$/.test(hh)) return NextResponse.redirect(`${url.origin}/admin`);
  const { data } = await supabase.from("household_members").select("expires_at").eq("household_id", hh).eq("user_id", user.id).eq("support", true).maybeSingle();
  if (!data || (data.expires_at && Date.parse(data.expires_at) < Date.now())) return NextResponse.redirect(`${url.origin}/admin?erro=sem-acesso`);
  const res = NextResponse.redirect(`${url.origin}/`);
  res.cookies.set(SUPPORT_COOKIE, hh, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 8 });
  return res;
}
