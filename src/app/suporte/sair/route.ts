import { NextResponse } from "next/server";
import { SUPPORT_COOKIE } from "@/lib/context";

export async function GET(request: Request) {
  const res = NextResponse.redirect(`${new URL(request.url).origin}/admin`);
  res.cookies.set(SUPPORT_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
