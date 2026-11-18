"use server";

import { revalidatePath } from "next/cache";
import { logAction, requireAdmin } from "@/lib/context";
import { refreshConnections, syncHousehold, type SyncSummary } from "@/lib/pluggy/sync";
import { pluggyConfigured } from "@/lib/pluggy/client";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const done = () => revalidatePath("/conexoes");

export async function refreshBank() {
  const ctx = await requireAdmin();
  if (!pluggyConfigured()) return;
  const { data: platform } = await ctx.supabase.rpc("is_platform_admin");
  await refreshConnections(ctx.supabase, ctx.household.id, !!platform, ctx.user.id);
  done();
}

export interface SyncState { summary?: SyncSummary; error?: string }
export async function runSync(_: SyncState | undefined, f: FormData): Promise<SyncState> {
  const ctx = await requireAdmin();
  const dryRun = str(f, "mode") !== "importar";
  try {
    // Atualiza contas, saldos e vínculos antes (cartões novos entram sozinhos)
    const { data: platform } = await ctx.supabase.rpc("is_platform_admin");
    const linkErrors = await refreshConnections(ctx.supabase, ctx.household.id, !!platform, ctx.user.id);
    const summary = await syncHousehold(ctx, { dryRun });
    summary.errors.unshift(...linkErrors);
    if (!dryRun) {
      const n = summary.lines.reduce((a, l) => a + (l.action === "importar" || l.action === "atualizar" ? l.rows : 0), 0);
      await logAction(ctx, `Sincronizou o Open Finance: ${n} lançamento(s)`);
      for (const p of ["/", "/lancamentos", "/conta", "/faturas", "/orcamento", "/fluxo", "/conexoes"]) revalidatePath(p);
    }
    revalidatePath("/conexoes"); // a comparação PDF × Open Finance é atualizada também na prévia
    return { summary };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao sincronizar." };
  }
}
