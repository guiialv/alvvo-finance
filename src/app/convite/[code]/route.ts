import { NextResponse } from "next/server";

/** Link de convite: leva ao login (se preciso) e depois ao pedido de entrada com o código preenchido. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { origin } = new URL(request.url);
  const target = `/onboarding?code=${encodeURIComponent(code.toUpperCase())}`;
  return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(target)}`);
}
