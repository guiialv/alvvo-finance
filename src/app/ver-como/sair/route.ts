import { NextResponse } from "next/server";

/** Sai do modo "ver como" (GET, porque o modo bloqueia ações que gravam dados). */
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const res = NextResponse.redirect(`${origin}/acessos`);
  res.cookies.set("alvvo_view_as", "", { path: "/", maxAge: 0 });
  return res;
}
