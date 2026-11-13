import Link from "next/link";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { PageHeader, Empty } from "@/components/ui";
import { createBetaCode, disableBetaCode, setFeedbackStatus } from "./actions";

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const KIND: Record<string, string> = { problema: "Algo errado", ideia: "Ideia", duvida: "Dúvida", elogio: "Elogio" };

/** Administração do beta: famílias (só números), códigos de acesso e feedback. Nenhum dado financeiro aparece aqui. */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ erro?: string; fb?: string }> }) {
  const ctx = await getContext();
  const { data: isAdmin } = await ctx.supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/");
  const sp = await searchParams;
  const [{ data: fams }, { data: codes }, { data: fbs }] = await Promise.all([
    ctx.supabase.rpc("platform_overview"),
    ctx.supabase.from("beta_codes").select("*").order("created_at", { ascending: false }),
    ctx.supabase.from("feedback").select("*").order("created_at", { ascending: false }).limit(200),
  ]);
  type Fam = { household_id: string; name: string; created_at: string; beta_code: string | null; members: number; tx_count: number; last_activity: string | null; support_until: string | null };
  type Code = { code: string; note: string | null; uses_left: number; used: number; expires_at: string | null; created_at: string };
  type Fb = { id: string; author_name: string | null; kind: string; page: string | null; message: string; status: string; created_at: string; household_id: string | null };
  const families = (fams ?? []) as Fam[], betaCodes = (codes ?? []) as Code[];
  const feedback = ((fbs ?? []) as Fb[]).filter((f) => (sp.fb ?? "abertos") === "todos" || f.status !== "resolvido");
  const famName = new Map(families.map((f) => [f.household_id, f.name]));
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://alvvo-finance.vercel.app";

  return (
    <div className="space-y-6">
      <PageHeader title="Administração do beta" subtitle="Só você vê esta página. Famílias aparecem só com números (sem valores, lançamentos ou nomes de membros)." />
      {sp.erro === "sem-acesso" && <p className="rounded-xl bg-loss/10 px-4 py-2 text-sm text-loss">Essa família não liberou acesso de suporte (ou ele expirou).</p>}

      <section className="card">
        <div className="mb-3 flex items-center justify-between"><h2>Feedback dos testadores</h2>
          <div className="flex gap-1 text-[12.5px]">{[["abertos", "Abertos"], ["todos", "Todos"]].map(([k, l]) => <Link key={k} href={`/admin?fb=${k}`} className={`rounded-full px-3 py-1 ${(sp.fb ?? "abertos") === k ? "bg-ink text-[#f6efe2]" : "border border-ink/15 text-ink/60"}`}>{l}</Link>)}</div></div>
        {feedback.length === 0 ? <Empty>Nenhum feedback {sp.fb === "todos" ? "ainda" : "em aberto"}.</Empty> : (
          <div className="divide-y divide-ink/5">
            {feedback.map((f) => (
              <div key={f.id} className="flex flex-wrap items-start gap-3 py-3">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${f.kind === "problema" ? "bg-loss/10 text-loss" : f.kind === "elogio" ? "bg-gain/10 text-gain" : "bg-brand-soft text-brand"}`}>{KIND[f.kind] ?? f.kind}</span>
                <div className="min-w-[240px] flex-1">
                  <p className="whitespace-pre-wrap text-sm">{f.message}</p>
                  <p className="mt-1 text-xs text-ink/45">{f.author_name ?? "—"} · {famName.get(f.household_id ?? "") ?? "—"} · {fmt(f.created_at)} · tela <code>{f.page}</code></p>
                </div>
                <div className="flex gap-1">
                  {(["visto", "resolvido"] as const).map((s) => (
                    <form key={s} action={setFeedbackStatus.bind(null, f.id, f.status === s ? "novo" : s)}><button className={`rounded-full px-2.5 py-1 text-[12px] ${f.status === s ? "bg-ink text-[#f6efe2]" : "border border-ink/15 text-ink/60"}`}>{s === "visto" ? "Visto" : "Resolvido"}</button></form>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card">
          <h2 className="mb-1">Códigos de acesso ao beta</h2>
          <p className="mb-3 text-xs text-ink/50">Para criar uma família nova é preciso um código. Envie ao colega: o link <b>{site}</b> + o código. Quem entra numa família existente usa o convite da própria família (não precisa de código).</p>
          <form action={createBetaCode} className="mb-4 grid gap-2 sm:grid-cols-[1fr_90px_90px_auto]">
            <input className="input" name="note" placeholder="Para quem? (ex.: Família do Rafael)" />
            <input className="input" name="uses" type="number" min={1} max={50} defaultValue={1} aria-label="Usos" title="Quantas famílias podem usar" />
            <input className="input" name="days" type="number" min={0} max={180} defaultValue={30} aria-label="Validade em dias" title="Validade (dias; 0 = sem prazo)" />
            <button className="btn">Gerar código</button>
          </form>
          {betaCodes.length === 0 ? <Empty>Nenhum código ainda.</Empty> : (
            <table className="table">
              <thead><tr><th>Código</th><th>Para</th><th className="num">Usos</th><th>Validade</th><th></th></tr></thead>
              <tbody>{betaCodes.map((c) => {
                const off = c.uses_left <= 0 || (c.expires_at && Date.parse(c.expires_at) < Date.now());
                return (
                  <tr key={c.code} className={off ? "opacity-50" : ""}>
                    <td className="font-mono text-[13px]">{c.code}</td><td>{c.note ?? "—"}</td>
                    <td className="num">{c.used} usado(s) · {c.uses_left} livre(s)</td><td className="text-ink/60">{c.expires_at ? fmt(c.expires_at).slice(0, 8) : "sem prazo"}</td>
                    <td>{!off && <form action={disableBetaCode.bind(null, c.code)}><button className="text-[12px] text-ink/45 hover:text-loss">Desativar</button></form>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h2 className="mb-1">Famílias no beta</h2>
          <p className="mb-3 text-xs text-ink/50">Só contagens. Para olhar uma conta por dentro, a família precisa liberar o acesso de suporte em Configurações — ele é só leitura, expira sozinho e fica registrado para ela.</p>
          <table className="table">
            <thead><tr><th>Família</th><th className="num">Membros</th><th className="num">Lançamentos</th><th>Última atividade</th><th>Suporte</th></tr></thead>
            <tbody>{families.map((f) => (
              <tr key={f.household_id}>
                <td>{f.name}<span className="block text-[11px] text-ink/40">desde {fmt(f.created_at).slice(0, 8)}{f.beta_code ? ` · ${f.beta_code}` : ""}</span></td>
                <td className="num">{f.members}</td><td className="num">{Number(f.tx_count).toLocaleString("pt-BR")}</td><td className="text-ink/60">{fmt(f.last_activity)}</td>
                <td>{f.household_id === ctx.household.id && !ctx.support ? <span className="text-[12px] text-ink/40">sua conta</span>
                  : f.support_until ? <a className="text-[12.5px] font-medium text-brand" href={`/suporte/entrar?f=${f.household_id}`}>Entrar (só leitura) · até {fmt(f.support_until)}</a>
                  : <span className="text-[12px] text-ink/40">não liberado</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
