import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Retorno do Google, do link mágico e da confirmação de e-mail. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "/";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(`${origin}/login?erro=link`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
