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
  await refreshConnections(ctx.supabase, ctx.household.id, !!platform);
  done();
}

export async function setLinkAccount(f: FormData) {
  const ctx = await requireAdmin();
  const id = str(f, "link_id"), value = str(f, "account_id");
  const { data: link } = await ctx.supabase.from("bank_links").select("*").eq("id", id).eq("household_id", ctx.household.id).single();
  if (!link) return;
  let accountId: string | null = value || null;
  if (value === "novo") {
    const l4 = String(link.number ?? "").replace(/\D/g, "").slice(-4) || null;
    const { data: acc, error } = await ctx.supabase.from("accounts").insert({
      household_id: ctx.household.id, scope: "pessoal", type: link.kind === "cartao" ? "cartao" : "conta", institution: link.institution,
      name: `${link.institution ?? ""} ${link.name ?? (link.kind === "cartao" ? "Cartão" : "Conta")}${l4 ? ` ••${l4}` : ""}`.trim(), last4: l4,
      known_last4: l4 ? [l4] : [], owner_user_id: ctx.user.id,
    }).select("id").single();
    if (error) throw new Error(error.message);
    accountId = acc.id as string;
  }
  await ctx.supabase.from("bank_links").update({ account_id: accountId, enabled: accountId ? link.enabled : false }).eq("id", id);
  done();
}

export async function setLinkEnabled(f: FormData) {
  const ctx = await requireAdmin();
  const on = str(f, "enabled") === "sim";
  await ctx.supabase.from("bank_links").update({ enabled: on }).eq("id", str(f, "link_id")).eq("household_id", ctx.household.id).not("account_id", "is", null);
  done();
}

export async function setSyncFrom(f: FormData) {
  const ctx = await requireAdmin();
  const v = str(f, "sync_from");
  await ctx.supabase.from("bank_links").update({ sync_from: /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null }).eq("id", str(f, "link_id")).eq("household_id", ctx.household.id);
  done();
}

export interface SyncState { summary?: SyncSummary; error?: string }
export async function runSync(_: SyncState | undefined, f: FormData): Promise<SyncState> {
  const ctx = await requireAdmin();
  const dryRun = str(f, "mode") !== "importar";
  try {
    const summary = await syncHousehold(ctx, { dryRun });
    if (!dryRun) {
      const n = summary.lines.reduce((a, l) => a + (l.action === "importar" || l.action === "atualizar" ? l.rows : 0), 0);
      await logAction(ctx, `Sincronizou o Open Finance: ${n} lançamento(s)`);
      for (const p of ["/", "/lancamentos", "/conta", "/faturas", "/orcamento", "/fluxo", "/conexoes"]) revalidatePath(p);
    }
    return { summary };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao sincronizar." };
  }
}
