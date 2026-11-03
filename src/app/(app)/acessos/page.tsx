import { headers } from "next/headers";
import { requireAdmin } from "@/lib/context";
import { AREAS, LEVEL_LABEL, ROLE_LABEL, type Level, type Role } from "@/lib/access";
import { formatDateBR } from "@/lib/format";
import { Avatar, Empty, PageHeader } from "@/components/ui";
import { AutoSelect, ConfirmButton, CopyButton } from "@/components/auto-submit";
import { approveMember, denyMember, newInviteCode, removeMember, setArea, setRole, setScope, toggleSuspend, viewAs } from "./actions";

interface Row { user_id: string; display_name: string; role: Role; status: string; areas: Record<string, Level>; tx_scope: string; email: string | null; provider: string | null; request_message: string | null; created_at: string; approved_at: string | null }
const PROV: Record<string, string> = { google: "Google", email: "e-mail", magiclink: "link mágico" };
const ROLE_OPTS = (["admin", "membro", "leitura"] as const).map((r) => [r, ROLE_LABEL[r]] as const);
const LEVEL_OPTS = (["nada", "ver", "editar"] as const).map((l) => [l, LEVEL_LABEL[l]] as const);

export default async function AccessPage() {
  const ctx = await requireAdmin();
  const [{ data: rows }, { data: log }] = await Promise.all([
    ctx.supabase.from("household_members").select("user_id, display_name, role, status, areas, tx_scope, email, provider, request_message, created_at, approved_at").eq("household_id", ctx.household.id).order("created_at"),
    ctx.supabase.from("audit_log").select("actor_name, action, at").eq("household_id", ctx.household.id).order("at", { ascending: false }).limit(60),
  ]);
  const all = (rows ?? []) as Row[];
  const pending = all.filter((r) => r.status === "pendente"), owner = all.find((r) => r.role === "dono"), members = all.filter((r) => r.status !== "pendente" && r.role !== "dono");
  const h = await headers(), origin = h.get("origin") ?? `https://${h.get("host")}`, link = `${origin}/convite/${ctx.household.invite_code}`;
  const expired = new Date(ctx.household.invite_expires_at) < new Date();
  const hidden = (k: string, v: string) => <input type="hidden" name={k} value={v} />;

  return (
    <div>
      <PageHeader title="Membros e acessos" subtitle="Quem entra na conta e o que cada pessoa vê. Ninguém entra sem a sua aprovação." />
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {pending.length > 0 && (
            <section className="card border-amber-200">
              <h2 className="mb-3">Pedidos aguardando aprovação <span className="ml-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs text-white">{pending.length}</span></h2>
              <div className="space-y-3">{pending.map((r) => (
                <div key={r.user_id} className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50/60 p-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-amber-200 text-xs font-semibold text-amber-900">{r.display_name[0]}</div>
                  <div className="min-w-[200px] flex-1"><div className="font-medium">{r.display_name}</div>
                    <div className="text-xs text-ink/50">{r.email}{r.provider ? ` · via ${PROV[r.provider] ?? r.provider}` : ""} · {formatDateBR(r.created_at.slice(0, 10))}{r.request_message ? ` · “${r.request_message}”` : ""}</div></div>
                  <form action={approveMember} className="flex items-center gap-2">{hidden("user_id", r.user_id)}
                    <select name="role" defaultValue="leitura" className="rounded-lg border border-ink/10 bg-white px-2 py-1 text-xs">{ROLE_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    <button className="btn !px-3 !py-1.5 text-xs">Aprovar</button></form>
                  <form action={denyMember}>{hidden("user_id", r.user_id)}<button className="btn-ghost !px-3 !py-1.5 text-xs text-loss">Recusar</button></form>
                </div>
              ))}</div>
              <p className="mt-2 text-[11px] text-ink/45">Ao aprovar, a pessoa entra com as áreas padrão do papel escolhido; você ajusta abaixo.</p>
            </section>
          )}

          <section className="card">
            <div className="mb-3 flex items-center justify-between"><h2>Membros</h2><span className="text-xs text-ink/45">{members.length + 1} pessoas</span></div>
            {owner && <div className="mb-3 flex items-center gap-3 rounded-2xl bg-brand/[0.06] p-4"><Avatar name={owner.display_name} index={0} size="h-9 w-9 text-xs" /><div className="flex-1"><div className="font-semibold">{owner.display_name}</div><div className="text-xs text-ink/50">{owner.email} · dono da conta (vê e edita tudo)</div></div><span className="chip">Dono</span></div>}
            <div className="space-y-3">
              {members.length === 0 && <Empty icon="users">Só você por enquanto. Envie o convite ao lado.</Empty>}
              {members.map((m, i) => { const off = m.status !== "ativo"; return (
                <div key={m.user_id} className={`rounded-2xl border border-ink/[0.07] p-4 ${off ? "bg-ink/[0.02] opacity-70" : "bg-white"}`}>
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <Avatar name={m.display_name} index={i + 1} size="h-9 w-9 text-xs" />
                    <div className="flex-1"><div className="font-semibold">{m.display_name} {off && <span className="chip">suspenso</span>}</div>
                      <div className="text-xs text-ink/45">{m.email}{m.provider ? ` · entra com ${PROV[m.provider] ?? m.provider}` : ""}{m.approved_at ? ` · desde ${formatDateBR(m.approved_at.slice(0, 10))}` : ""}</div></div>
                    {m.role !== "dono" && <form action={setRole}>{hidden("user_id", m.user_id)}<AutoSelect name="role" defaultValue={m.role} options={ROLE_OPTS} /></form>}
                    {!off && <form action={viewAs}>{hidden("user_id", m.user_id)}<button className="btn-ghost !px-2.5 !py-1 text-xs">👁 Ver como {m.display_name.split(" ")[0]}</button></form>}
                    <form action={toggleSuspend}>{hidden("user_id", m.user_id)}{hidden("status", m.status)}<button className="btn-ghost !px-2.5 !py-1 text-xs">{off ? "Reativar" : "Suspender"}</button></form>
                    <form action={removeMember}>{hidden("user_id", m.user_id)}<ConfirmButton message={`Remover ${m.display_name} da conta?`} className="text-xs text-loss hover:underline">Remover</ConfirmButton></form>
                  </div>
                  <form action={setScope} className="mb-3 flex flex-wrap items-center gap-2 text-xs">{hidden("user_id", m.user_id)}
                    <span className="font-medium text-ink/60">Lançamentos que vê:</span>
                    <AutoSelect name="scope" defaultValue={m.tx_scope} options={[["todos", "De todos da conta"], ["proprios", "Só os próprios (seus cartões e gastos)"]]} />
                  </form>
                  <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {AREAS.map(([k, l]) => (
                      <form key={k} action={setArea} className="flex items-center justify-between gap-2 border-b border-ink/5 py-1 text-sm">
                        {hidden("user_id", m.user_id)}{hidden("area", k)}
                        <span className={(m.areas[k] ?? "nada") === "nada" ? "text-ink/35" : ""}>{l}</span>
                        <AutoSelect name="level" defaultValue={m.role === "admin" ? "editar" : (m.areas[k] ?? "nada")} options={m.role === "leitura" ? LEVEL_OPTS.filter(([v]) => v !== "editar") : LEVEL_OPTS} />
                      </form>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-ink/40">{m.role === "admin" ? "Administradores veem e editam tudo, inclusive esta tela." : "Configurações e esta tela ficam só com o dono e administradores."} As mudanças valem na hora, também no banco de dados.</p>
                </div>
              ); })}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card">
            <h2 className="mb-2">Convidar</h2>
            <p className="mb-3 text-xs text-ink/50">Mande o link ou o código. A pessoa entra com e-mail e senha, Google ou link mágico, e o pedido chega aqui para você aprovar.</p>
            <div className="rounded-xl bg-ink/[0.04] p-3">
              <div className="label">Link</div><div className="break-all font-mono text-xs">{link}</div>
              <div className="label mt-2">Código</div><div className="font-mono text-xl font-semibold tracking-widest">{ctx.household.invite_code}</div>
              <div className={`mt-1 text-[11px] ${expired ? "text-loss" : "text-ink/45"}`}>{expired ? "Vencido — gere um novo" : `Vale até ${formatDateBR(ctx.household.invite_expires_at.slice(0, 10))}`}</div>
            </div>
            <div className="mt-3 flex gap-2"><CopyButton text={link} label="Copiar link" /><form action={newInviteCode} className="flex-1"><button className="btn-ghost w-full !py-1.5 text-xs">Gerar novo código</button></form></div>
            <p className="mt-2 text-[11px] text-ink/45">Gerar um novo código invalida o anterior.</p>
          </section>
          <section className="card">
            <h2 className="mb-2">Papéis</h2>
            <div className="space-y-1.5 text-xs text-ink/65">
              <p><b>Dono</b>: tudo, inclusive aprovar pessoas e apagar a conta.</p>
              <p><b>Administrador</b>: tudo, menos apagar a conta e transferir a posse.</p>
              <p><b>Membro</b>: o dia a dia (lançamentos, faturas, orçamento, agenda, objetivos). PJ, investimentos e análise começam fechados.</p>
              <p><b>Só leitura</b>: vê, mas não altera nada. Bom para contador ou consultor.</p>
            </div>
          </section>
          <section className="card">
            <h2 className="mb-2">Registro de atividades</h2>
            <div className="max-h-80 space-y-2 overflow-y-auto text-xs">
              {(log ?? []).map((l, i) => (
                <div key={i} className="flex gap-2"><span className="shrink-0 text-ink/40">{new Date(l.at as string).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</span><span><b>{l.actor_name}</b> · {l.action as string}</span></div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
