"use server";

import { revalidatePath } from "next/cache";
import { logAction, requireAdmin } from "@/lib/context";
import { adoptBill, refreshBalances, refreshConnections, syncHousehold, type SyncSummary } from "@/lib/pluggy/sync";
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

/** Visão geral: atualiza saldos, faturas atuais e o histórico diário da conta (não importa lançamentos). */
export async function refreshBankBalances() {
  const ctx = await requireAdmin();
  if (!pluggyConfigured()) return;
  await refreshBalances(ctx.supabase, ctx.household.id, ctx.user.id);
  revalidatePath("/");
  revalidatePath("/conexoes");
}

/** Comparação: usar a versão do banco para uma fatura cujo PDF veio incompleto. */
export async function adoptBankBill(f: FormData) {
  const ctx = await requireAdmin();
  const { data: c } = await ctx.supabase.from("source_comparisons").select("account_id, kind, ref, label").eq("id", str(f, "id")).eq("household_id", ctx.household.id).single();
  if (!c || c.kind !== "fatura") return;
  const n = await adoptBill(ctx, c.account_id as string, c.ref as string);
  await logAction(ctx, `Fatura ${c.label} substituída pela versão do Open Finance (${n} lançamentos)`);
  for (const p of ["/", "/lancamentos", "/conta", "/faturas", "/orcamento", "/fluxo", "/conexoes"]) revalidatePath(p);
}
