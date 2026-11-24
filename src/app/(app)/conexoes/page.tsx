import { requireAdmin } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { pluggyConfigured } from "@/lib/pluggy/client";
import { refreshConnections, type ConnectionRow, type LinkRow } from "@/lib/pluggy/sync";
import { adoptBankBill, refreshBank } from "./actions";
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
  const { data: accs } = await ctx.supabase.from("accounts").select("id, name").eq("household_id", ctx.household.id);
  const accounts = (accs ?? []) as { id: string; name: string }[];
  const C = (conns ?? []) as ConnectionRow[], L = (links ?? []) as LinkRow[];
  const { data: cmp } = await ctx.supabase.from("source_comparisons").select("*").eq("household_id", ctx.household.id).order("ref", { ascending: false }).limit(40);
  type Item = { date: string; description: string; amount: number };
  const comps = (cmp ?? []) as { id: string; kind: string; ref: string; label: string; pdf_count: number; pdf_total: number; of_count: number; of_total: number; matched: number; only_pdf: Item[]; only_of: Item[]; updated_at: string }[];
  const ready = L.length > 0;
  const { data: isPlat } = await ctx.supabase.rpc("is_platform_admin");
  if (!C.length && !isPlat) return (
    <div className="space-y-4">
      <PageHeader title="Open Finance" subtitle="Contas e cartões lidos direto do banco, com a sua autorização." />
      <section className="card text-sm leading-relaxed text-ink/70">A conexão direta com o banco está em teste fechado e chega para todos nas próximas versões do beta. Enquanto isso, importe as faturas e extratos em PDF: tudo entra nas mesmas telas.</section>
    </div>
  );

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
                return (
                  <div key={l.id} className="rounded-xl border border-ink/[0.07] bg-white p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <div className="min-w-0 flex-1 basis-[200px]">
                        <div className="font-medium [overflow-wrap:anywhere]">{l.kind === "cartao" ? "💳" : "🏦"} {l.name ?? "Conta"} {l.number && <span className="text-xs text-ink/45">••{String(l.number).replace(/\D/g, "").slice(-4)}</span>}</div>
                        <div className="text-xs text-ink/50">{l.institution ?? ""}{l.kind === "cartao" ? ` · fatura atual ${brl(l.balance)} · limite disponível ${brl(l.available_limit)}` : ` · saldo ${brl(l.balance)}`}</div>
                      </div>
                      {l.last_sync_at && <span className="text-[11px] text-ink/40">sincronizado {when(l.last_sync_at)}</span>}
                    </div>
                    <div className="mt-1.5 text-xs text-ink/60">
                      {l.account_id ? <>→ entra em <b className="text-ink/80">{accounts.find((a) => a.id === l.account_id)?.name ?? "conta da plataforma"}</b></> : l.kind === "outro" ? "Tipo de conta ainda não importado" : "Vinculando na próxima sincronização…"}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {configured && C.length > 0 && <SyncPanel ready={ready} />}

      {comps.length > 0 && (
        <section className="card">
          <h2>PDF × Open Finance</h2>
          <p className="mt-1 text-xs text-ink/50">Faturas e meses que existem nas duas fontes. Nos totais da plataforma vale o PDF; o Open Finance aparece aqui só para comparar (atualizado a cada prévia ou sincronização). Daqui em diante, só entra pelo Open Finance o que vem depois do último PDF de cada conta.</p>
          <div className="mt-3 space-y-2">
            {comps.map((c) => {
              const diff = Math.round((Number(c.of_total) - Number(c.pdf_total)) * 100) / 100;
              const ok = Math.abs(diff) < 0.01 && !c.only_pdf.length && !c.only_of.length;
              return (
                <details key={c.id} className="rounded-xl border border-ink/[0.07] bg-white p-3">
                  <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                    <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{c.kind === "fatura" ? "💳" : "🏦"} {c.label}</span>
                    <span className={`text-xs ${ok ? "text-gain" : "text-bronze"}`}>{ok ? "✓ idênticos" : `diferença ${brl(diff)}`}</span>
                  </summary>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-ink/60">
                    <div>PDF: <b className="text-ink">{brl(c.pdf_total)}</b> · {c.pdf_count} lanç.</div>
                    <div>Open Finance: <b className="text-ink">{brl(c.of_total)}</b> · {c.of_count} lanç.</div>
                    <div className="col-span-2">{c.matched} lançamento(s) iguais nas duas fontes{c.only_pdf.length + c.only_of.length ? ` · ${c.only_pdf.length} só no PDF · ${c.only_of.length} só no Open Finance` : ""}</div>
                  </div>
                  {c.kind === "fatura" && Math.abs(diff) >= 1 && (
                    <form action={adoptBankBill} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={c.id} />
                      <button className="btn !px-3 !py-1.5 text-xs">Usar a versão do banco nesta fatura</button>
                      <span className="text-[11px] text-ink/45">Troca os lançamentos do PDF pelos do banco, mantendo as categorias que batem.</span>
                    </form>
                  )}
                  {[["Só no PDF", c.only_pdf], ["Só no Open Finance", c.only_of]].map(([t, list]) => (list as Item[]).length > 0 && (
                    <div key={t as string} className="mt-2">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-ink/45">{t as string}</div>
                      {(list as Item[]).map((x, i) => (
                        <div key={i} className="flex justify-between gap-3 border-b border-ink/5 py-0.5 text-xs">
                          <span className="min-w-0 [overflow-wrap:anywhere]">{x.date.slice(8, 10)}/{x.date.slice(5, 7)} · {x.description}</span>
                          <span className="shrink-0 tabular-nums">{brl(x.amount)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </details>
              );
            })}
          </div>
        </section>
      )}

      <section className="card text-xs leading-relaxed text-ink/55">
        <b className="text-ink/70">Como funciona.</b> A autorização é feita no app do seu banco, pelo Open Finance, e fica no Meu Pluggy (dá para revogar lá a qualquer momento).
        A plataforma só lê: não movimenta dinheiro. Cartões entram por fatura (a fatura aberta aparece como provisória e é trocada pela fechada);
        contas entram por mês. Se um PDF for enviado para um período que já veio pelo Open Finance, o PDF passa a valer e as duas versões ficam comparadas acima. As categorias seguem as mesmas regras e aprendizados dos PDFs, e o que você reclassificar é mantido nas próximas sincronizações.
      </section>
    </div>
  );
}
