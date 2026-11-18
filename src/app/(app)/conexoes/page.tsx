import { requireAdmin } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { AutoSelect } from "@/components/auto-submit";
import { pluggyConfigured } from "@/lib/pluggy/client";
import { refreshConnections, type ConnectionRow, type LinkRow } from "@/lib/pluggy/sync";
import { refreshBank, setLinkAccount, setLinkEnabled, setSyncFrom } from "./actions";
import { SyncPanel } from "./sync-panel";

export const maxDuration = 300;

const STATUS: Record<string, [string, string]> = {
  UPDATED: ["Atualizado", "bg-gain/10 text-gain"], UPDATING: ["Atualizando no banco…", "bg-amber-100 text-amber-800"],
  LOGIN_ERROR: ["Autorização recusada — reconecte no Meu Pluggy", "bg-loss/10 text-loss"], OUTDATED: ["Desatualizado — o banco não respondeu", "bg-amber-100 text-amber-800"],
  WAITING_USER_INPUT: ["Aguardando sua confirmação no banco", "bg-amber-100 text-amber-800"],
};
const brl = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const when = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

export default async function ConexoesPage() {
  const ctx = await requireAdmin();
  const configured = pluggyConfigured();
  let [{ data: conns }, { data: links }] = await Promise.all([
    ctx.supabase.from("bank_connections").select("*").eq("household_id", ctx.household.id).order("created_at"),
    ctx.supabase.from("bank_links").select("*").eq("household_id", ctx.household.id).order("kind").order("name"),
  ]);
  // Primeira visita do administrador da plataforma: liga as conexões configuradas na Vercel a esta conta
  if (configured && !(conns ?? []).length) {
    const { data: platform } = await ctx.supabase.rpc("is_platform_admin");
    if (platform) {
      await refreshConnections(ctx.supabase, ctx.household.id, true).catch(() => []);
      [{ data: conns }, { data: links }] = await Promise.all([
        ctx.supabase.from("bank_connections").select("*").eq("household_id", ctx.household.id).order("created_at"),
        ctx.supabase.from("bank_links").select("*").eq("household_id", ctx.household.id).order("kind").order("name"),
      ]);
    }
  }
  const { data: accs } = await ctx.supabase.from("accounts").select("id, name, type, active").eq("household_id", ctx.household.id).order("name");
  const accounts = ((accs ?? []) as { id: string; name: string; type: string; active: boolean }[]).filter((a) => a.active !== false);
  const C = (conns ?? []) as ConnectionRow[], L = (links ?? []) as LinkRow[];
  const ready = L.some((l) => l.enabled && l.account_id);

  return (
    <div className="space-y-4">
      <PageHeader title="Open Finance" subtitle="Contas e cartões lidos direto do banco, com a sua autorização. Entram nas mesmas telas dos PDFs, sem contar em dobro.">
        {configured && <form action={refreshBank}><button className="btn-ghost !px-3 !py-1.5 text-xs">Atualizar contas e saldos</button></form>}
      </PageHeader>

      {!configured && <section className="card text-sm text-ink/70">As chaves da Pluggy ainda não estão na Vercel (PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET). Depois de criar, publique de novo.</section>}
      {configured && !C.length && <section className="card text-sm text-ink/70">Nenhuma conexão ligada a esta conta. Confira a variável PLUGGY_ITEM_IDS na Vercel e clique em “Atualizar contas e saldos”.</section>}

      {C.map((c) => {
        const st = STATUS[c.status ?? ""] ?? [c.status ?? "Sem status", "bg-ink/5 text-ink/60"];
        const days = c.consent_expires_at ? Math.round((Date.parse(c.consent_expires_at) - Date.now()) / 86400000) : null;
        const mine = L.filter((l) => l.connection_id === c.id);
        return (
          <section key={c.id} className="card">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto">{c.connector ?? "Conexão"}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs ${st[1]}`}>{st[0]}</span>
            </div>
            <p className="text-xs text-ink/50">
              Dados do banco atualizados em {when(c.provider_updated_at)} · última sincronização aqui: {when(c.last_sync_at)}
              {days != null && <> · autorização vale até {new Date(c.consent_expires_at!).toLocaleDateString("pt-BR")}{days <= 30 && <b className="text-loss"> — renove no Meu Pluggy ({days} dias)</b>}</>}
            </p>
            {c.status_detail && c.status !== "UPDATED" && <p className="mt-1 text-xs text-loss">{c.status_detail}</p>}

            <div className="mt-3 space-y-2">
              {mine.length === 0 && <p className="text-sm text-ink/50">Nenhuma conta encontrada nesta conexão ainda.</p>}
              {mine.map((l) => {
                const opts: [string, string][] = [["", "— escolher conta —"], ...accounts.filter((a) => (l.kind === "cartao" ? a.type === "cartao" : a.type !== "cartao")).map((a) => [a.id, a.name] as [string, string]), ["novo", "+ criar nova"]];
                return (
                  <div key={l.id} className="rounded-xl border border-ink/[0.07] bg-white p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <div className="min-w-0 flex-1 basis-[200px]">
                        <div className="font-medium [overflow-wrap:anywhere]">{l.kind === "cartao" ? "💳" : "🏦"} {l.name ?? "Conta"} {l.number && <span className="text-xs text-ink/45">••{String(l.number).replace(/\D/g, "").slice(-4)}</span>}</div>
                        <div className="text-xs text-ink/50">{l.institution ?? ""}{l.kind === "cartao" ? ` · fatura atual ${brl(l.balance)} · limite disponível ${brl(l.available_limit)}` : ` · saldo ${brl(l.balance)}`}</div>
                      </div>
                      {l.last_sync_at && <span className="text-[11px] text-ink/40">sincronizado {when(l.last_sync_at)}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-ink/60">Na plataforma:</span>
                      <AutoSelect key={`${l.id}-${l.account_id ?? ""}`} name="account_id" defaultValue={l.account_id ?? ""} options={opts} action={setLinkAccount} fields={{ link_id: l.id }} />
                      {l.account_id && <>
                        <span className="ml-2 text-ink/60">Importar:</span>
                        <AutoSelect key={`${l.id}-on-${l.enabled}`} name="enabled" defaultValue={l.enabled ? "sim" : "nao"} options={[["nao", "Não"], ["sim", "Sim, todo dia"]]} action={setLinkEnabled} fields={{ link_id: l.id }} />
                      </>}
                    </div>
                    {l.account_id && (
                      <form action={setSyncFrom} className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink/60">
                        <input type="hidden" name="link_id" value={l.id} />
                        <span>{l.kind === "cartao" ? "Faturas que vencem a partir de" : "Lançamentos a partir de"}</span>
                        <input type="date" name="sync_from" defaultValue={l.sync_from ?? ""} className="rounded-lg border border-ink/10 bg-white px-2 py-1" />
                        <button className="btn-ghost !px-2 !py-1 text-xs">Salvar</button>
                        <span className="basis-full text-[11px] text-ink/40">Em branco: começa logo depois do último PDF importado desta conta{l.kind === "cartao" ? " (fatura seguinte)" : ""}.</span>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {configured && C.length > 0 && <SyncPanel ready={ready} />}

      <section className="card text-xs leading-relaxed text-ink/55">
        <b className="text-ink/70">Como funciona.</b> A autorização é feita no app do seu banco, pelo Open Finance, e fica no Meu Pluggy (dá para revogar lá a qualquer momento).
        A plataforma só lê: não movimenta dinheiro. Cartões entram por fatura (a fatura aberta aparece como provisória e é trocada pela fechada);
        contas entram por mês. As categorias seguem as mesmas regras e aprendizados dos PDFs, e o que você reclassificar é mantido nas próximas sincronizações.
      </section>
    </div>
  );
}
