import { requireAdmin } from "@/lib/context";
import { categoryIndex, loadAccounts, loadCategories, loadMembers } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { addCategory, deleteRule, grantSupport, renameCategory, revokeSupport, saveAiKey, setAiMode, toggleCategory, updateAccount, updateHousehold } from "./actions";


export default async function ConfigPage() {
  const ctx = await requireAdmin();
  const [cats, accounts, members, rulesRes] = await Promise.all([
    loadCategories(ctx), loadAccounts(ctx), loadMembers(ctx),
    ctx.supabase.from("category_rules").select("id, pattern, category_id, hits, updated_at").eq("household_id", ctx.household.id).order("updated_at", { ascending: false }),
  ]);
  const { byId } = categoryIndex(cats);
  const rules = rulesRes.data ?? [];
  const { data: last4 } = await ctx.supabase.rpc("ai_key_last4", { hh: ctx.household.id });
  const ai = ctx.household.ai_mode;
  const { data: sup } = await ctx.supabase.from("household_members").select("expires_at").eq("household_id", ctx.household.id).eq("support", true).gt("expires_at", new Date().toISOString()).order("expires_at", { ascending: false }).limit(1);
  const supportUntil = (sup?.[0]?.expires_at as string | undefined) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" />

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="mb-1">Acesso de suporte</h2>
            <p className="text-sm text-ink/60">Se algo não estiver certo (uma fatura lida errado, um número que não bate), você pode liberar temporariamente o suporte do ALVVO para olhar a sua conta. É <b>só leitura</b>, expira sozinho, aparece em Membros e acessos e fica no registro de atividades. Sem a sua liberação, ninguém do suporte vê seus dados na plataforma.</p>
          </div>
          {supportUntil ? (
            <div className="flex flex-col items-end gap-2">
              <span className="rounded-full bg-sky-50 px-3 py-1 text-[13px] text-sky-800">Liberado até {new Date(supportUntil).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              <form action={revokeSupport}><button className="btn-ghost">Encerrar agora</button></form>
            </div>
          ) : (
            <form action={grantSupport} className="flex items-center gap-2">
              <select name="days" className="input w-auto" defaultValue="7" aria-label="Por quanto tempo"><option value="1">1 dia</option><option value="3">3 dias</option><option value="7">7 dias</option><option value="14">14 dias</option></select>
              <button className="btn">Liberar acesso de suporte</button>
            </form>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-4">Conta</h2>
          <form action={updateHousehold} className="space-y-3">
            <div><label className="label">Nome</label><input className="input" name="name" defaultValue={ctx.household.name} /></div>
            <div><label className="label">Seu nome</label><input className="input" name="display_name" defaultValue={ctx.member.display_name} /></div>
            <div>
              <label className="label">Dia de início do ciclo</label>
              <input className="input w-24" type="number" min={1} max={28} name="cycle_start_day" defaultValue={ctx.household.cycle_start_day} />
              <p className="mt-1 text-xs text-ink/40">Hoje: dia {ctx.household.cycle_start_day} até o dia {ctx.household.cycle_start_day - 1 || 28} do mês seguinte. A fatura entra no ciclo da data de vencimento.</p>
            </div>
            <button className="btn">Salvar</button>
          </form>
        </section>

        <section className="card">
          <h2 className="mb-2">Membros e acessos</h2>
          <p className="mb-3 text-sm text-ink/55">{members.length} pessoas na conta. Convites, aprovações e o que cada pessoa vê.</p>
          <a href="/acessos" className="btn-ghost">Gerenciar membros e acessos</a>
        </section>
      </div>

      <section className="card overflow-x-auto p-0">
        <h2 className="px-5 pt-4">Contas e cartões</h2>
        {accounts.length === 0 ? <p className="px-5 py-4 text-sm text-ink/50">Os cartões são criados automaticamente quando você importa uma fatura.</p> : (
          <table className="table mt-2">
            <thead><tr><th>Nome</th><th>Final</th><th>Titular</th><th></th></tr></thead>
            <tbody>{accounts.map((a) => (
              <tr key={a.id}>
                <td colSpan={4}>
                  <form action={updateAccount} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={a.id} />
                    <input className="input max-w-xs py-1" name="name" defaultValue={a.name} />
                    <span className="w-16 text-ink/50">{a.last4 ? `•••• ${a.last4}` : ""}</span>
                    <select className="input max-w-[160px] py-1" name="owner_user_id" defaultValue={a.owner_user_id ?? ""}><option value="">—</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select>
                    <button className="btn-ghost py-1">Salvar</button>
                  </form>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <section className="card overflow-x-auto p-0">
        <div className="px-5 pt-4"><h2>Regras aprendidas</h2><p className="text-xs text-ink/40">Criadas automaticamente quando você corrige uma categoria. Novas importações usam estas regras primeiro.</p></div>
        {rules.length === 0 ? <p className="px-5 py-4 text-sm text-ink/50">Nenhuma regra ainda.</p> : (
          <table className="table mt-2"><thead><tr><th>Estabelecimento começa com</th><th>Categoria</th><th></th></tr></thead>
            <tbody>{rules.map((r) => { const c = byId.get(r.category_id); return (
              <tr key={r.id}><td className="font-mono text-xs">{r.pattern}</td><td>{c ? `${c.scope === "pj" ? "PJ · " : ""}${c.name}` : "—"}</td>
                <td className="num"><form action={deleteRule}><input type="hidden" name="id" value={r.id} /><button className="text-xs text-ink/40 hover:text-loss">Remover</button></form></td></tr>
            ); })}</tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2 className="mb-1">Inteligência artificial</h2>
        <p className="mb-3 text-sm text-ink/55">A IA lê faturas de qualquer banco, sugere categorias, lê notas de corretagem e resume o ciclo.</p>
        <form action={setAiMode} className="grid gap-3 md:grid-cols-3">
          {ctx.household.ai_included && (
            <label className={`cursor-pointer rounded-xl border p-3 ${ai === "incluida" ? "border-brand bg-brand/[0.05]" : "border-ink/10"}`}>
              <input type="radio" name="ai_mode" value="incluida" defaultChecked={ai === "incluida"} className="mr-1" /><b>Incluída</b>
              <p className="mt-1 text-xs text-ink/55">Esta conta usa a IA da plataforma sem custo extra no beta.</p>
            </label>)}
          <label className={`cursor-pointer rounded-xl border p-3 ${ai === "chave" ? "border-brand bg-brand/[0.05]" : "border-ink/10"}`}>
            <input type="radio" name="ai_mode" value="chave" defaultChecked={ai === "chave"} className="mr-1" /><b>Minha chave do Claude</b>
            <p className="mt-1 text-xs text-ink/55">Chave de API criada no Claude Console; o consumo é cobrado na sua conta da Anthropic.</p>
          </label>
          <label className={`cursor-pointer rounded-xl border p-3 ${ai === "nenhuma" ? "border-brand bg-brand/[0.05]" : "border-ink/10"}`}>
            <input type="radio" name="ai_mode" value="nenhuma" defaultChecked={ai === "nenhuma"} className="mr-1" /><b>Sem IA</b>
            <p className="mt-1 text-xs text-ink/55">Faturas Itaú, OFX e CSV continuam sendo lidas normalmente. Plano pago em breve.</p>
          </label>
          <div className="md:col-span-3"><button className="btn-ghost">Salvar escolha</button></div>
        </form>
        {ai === "chave" && (
          <form action={saveAiKey} className="mt-3 flex flex-wrap items-end gap-2">
            <div className="flex-1"><label className="label">Chave de API (sk-ant-…)</label><input className="input font-mono" name="key" type="password" placeholder={last4 ? `••••••••${last4}` : "sk-ant-api03-…"} required /></div>
            <button className="btn">Salvar chave</button>
            <span className="pb-2 text-xs text-ink/45">{last4 ? `Chave salva (final ${last4}), guardada criptografada` : "Nenhuma chave salva"}</span>
          </form>)}
        <p className="mt-3 text-[11px] text-ink/45">A assinatura do Claude.ai (Pro/Max) não pode ser usada por aplicativos de terceiros: a Anthropic só permite chave de API do Claude Console para isso.</p>
      </section>

      <section className="card">
        <div className="mb-4 flex items-baseline justify-between gap-3"><h2>Categorias</h2><a href="/orcamento?editar=1" className="text-sm text-brand hover:underline">Editar grupos e categorias no Orçamento →</a></div>
        <form action={addCategory} className="mb-5 flex flex-wrap gap-2">
          <select className="input max-w-[200px]" name="group" defaultValue="pessoal|despesa|Variáveis">
            {[...new Map(cats.filter((c) => c.grp !== "A classificar").map((c) => [`${c.scope}|${c.grp}`, c] as [string, typeof c])).values()].map((c) => (
              <option key={c.scope + c.grp} value={`${c.scope}|${c.kind}|${c.grp}`}>{c.scope === "pj" ? "PJ · " : ""}{c.grp}</option>
            ))}
          </select>
          <input className="input max-w-[180px]" name="subgroup" placeholder="Subgrupo (opcional)" />
          <input className="input max-w-[220px]" name="name" placeholder="Nova categoria" required />
          <button className="btn">Adicionar</button>
        </form>
        <div className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {cats.map((c) => (
            <form key={c.id} action={toggleCategory} className="flex items-center justify-between border-b border-ink/5 py-1">
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="active" value={String(!c.active)} />
              <span className={c.active ? "" : "text-ink/30 line-through"}>
                <span className="text-ink/40">{c.scope === "pj" ? "PJ · " : ""}{c.grp}{c.subgroup ? ` › ${c.subgroup}` : ""} › </span>{c.name}
              </span>
              <button className="text-xs text-ink/40 hover:text-ink">{c.active ? "Ocultar" : "Reativar"}</button>
            </form>
          ))}
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-brand">Renomear categorias</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {cats.filter((c) => c.grp !== "A classificar").map((c) => (
              <form key={c.id} action={renameCategory} className="flex gap-1.5">
                <input type="hidden" name="id" value={c.id} />
                <input className="input py-1 text-sm" name="name" defaultValue={c.name} aria-label={`Renomear ${c.name}`} />
                <button className="btn-ghost !px-2 !py-1 text-xs">OK</button>
              </form>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink/45">Os lançamentos já feitos acompanham o novo nome.</p>
        </details>
      </section>
    </div>
  );
}
