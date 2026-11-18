import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pluggyConfigured } from "@/lib/pluggy/client";
import { refreshConnections, syncHousehold, systemCtx } from "@/lib/pluggy/sync";

export const maxDuration = 300;

/** Sincronização diária do Open Finance (vercel.json). Protegida por CRON_SECRET. */
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new NextResponse("unauthorized", { status: 401 });
  if (!pluggyConfigured()) return NextResponse.json({ ok: true, skipped: "sem chaves" });
  const db = createAdminClient();
  const { data } = await db.from("bank_connections").select("household_id");
  const households = [...new Set(((data ?? []) as { household_id: string }[]).map((r) => r.household_id))];
  const out: Record<string, unknown> = {};
  for (const hh of households) {
    try {
      const errors = await refreshConnections(db, hh, false);
      const s = await syncHousehold(await systemCtx(hh));
      out[hh] = { rows: s.lines.reduce((a, l) => a + l.rows, 0), errors: [...errors, ...s.errors].length };
    } catch (e) {
      console.error("[openfinance]", e);
      out[hh] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return NextResponse.json({ ok: true, households: out });
}
