import Link from "next/link";
import type { Ctx } from "@/lib/context";
import { KIND_L, avgAnnual, breakevenInflation, cdiPath, rank, simulate, type Index, type Kind, type Option, type Result, type Scenario } from "@/lib/renda-fixa";
import { getMacro } from "@/lib/market/read";
import { monthsBetween, type Goal } from "@/lib/goals";
import { formatBRL, formatDateBR, parseMoneyInput } from "@/lib/format";
import { todayIso } from "@/lib/cycle";
import { RefreshButton } from "@/components/refresh-button";
import { addRfOffer, delRfOffer } from "./actions";

const pc2 = (v: number | null | undefined, d = 2) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(d).replace(".", ",")}%`);
const rateLbl = (o: { index: string; rate: number }) => o.index === "selic" ? (o.rate ? `Selic + ${o.rate.toFixed(4).replace(".", ",")}%` : "100% da Selic") : o.index === "cdi" ? `${String(o.rate).replace(".", ",")}% do CDI` : o.index === "cdi+" ? `CDI + ${pc2(o.rate)}` : o.index === "pre" ? `${pc2(o.rate)} a.a.` : o.index === "ipca" ? `IPCA + ${pc2(o.rate)}` : "0,5% a.m. + TR";
const FIT: Record<Result["fit"], [string, string]> = { ok: ["Prazo certo", "bg-emerald-50 text-emerald-700"], liquidez: ["Liquidez diária", "bg-sky-50 text-sky-700"], antes: ["Vence antes", "bg-amber-50 text-amber-800"], depois: ["Vence depois", "bg-rose-50 text-rose-700"] };
const BANK_REF: Option[] = [
  { id: "ref-cdb-d", name: "CDB liquidez diária (referência)", kind: "cdb", index: "cdi", rate: 100, daily: true, maturity: null, note: "Média dos bancos grandes e digitais" },
  { id: "ref-poup", name: "Poupança", kind: "poup", index: "poup", rate: 0, daily: true, maturity: null, note: "0,5% a.m. + TR enquanto a Selic estiver acima de 8,5%" },
];

interface MarketRf { id: string; name: string; index: "selic" | "pre" | "ipca"; rate: number; maturity: string; min_investment: number | null; grp: string; coupon: boolean; ref_date: string }

export async function RendaFixa({ ctx, sp, edit }: { ctx: Ctx; sp: Record<string, string | undefined>; edit: boolean }) {
  const [macro, { data: rfD }, { data: offersD }, { data: goalsD }] = await Promise.all([
    getMacro(ctx),
    ctx.supabase.from("market_rf").select("*").order("index").order("maturity"),
    ctx.supabase.from("rf_offers").select("*").eq("household_id", ctx.household.id).order("created_at"),
    ctx.supabase.from("goals").select("*").eq("household_id", ctx.household.id),
  ]);
  const titles = ((rfD ?? []) as MarketRf[]).map((t) => ({ ...t, rate: Number(t.rate) }));
  const offers = (offersD ?? []) as (Option & { id: string })[];
  const goals = (goalsD ?? []) as Goal[];
  const start = todayIso(), y = new Date().getFullYear();
  const selicPath = Object.fromEntries(Object.entries(macro.focus.selic).filter(([k]) => +k >= y).map(([k, v]) => [Number(k), Number(v)])) as Record<number, number>;
  const ipcaDefault = macro.focus.ipca[String(y + 1)] ?? macro.focus.ipca[String(y)] ?? 4.5;
  const amount = parseMoneyInput(sp.valor ?? "") ?? 10000, months = Math.max(1, Math.min(480, Number(sp.prazo) || 24));
  const cdiFixed = sp.cdi ? parseMoneyInput(sp.cdi) : null, ipca = (sp.ipca ? parseMoneyInput(sp.ipca) : null) ?? ipcaDefault;
  const scenario = (m: number, amt: number): Scenario => ({ months: m, amount: amt, cdiPath: cdiFixed != null ? Array(m).fill(cdiFixed) : cdiPath(m, start, macro.cdi, selicPath), ipca, start });
  const sc = scenario(months, amount), avgCdi = avgAnnual(sc.cdiPath);
  const toOpt = (t: MarketRf): Option => ({ id: t.id, name: t.name, kind: "tesouro", index: t.index as Index, rate: t.rate, maturity: t.maturity, min: t.min_investment ?? undefined, coupon: t.coupon, group: t.grp });
  const options: Option[] = [...titles.filter((t) => ["pos", "pre", "ipca"].includes(t.grp) && !t.coupon).map(toOpt), ...BANK_REF, ...offers.map((o) => ({ ...o, rate: Number(o.rate), kind: o.kind as Kind, index: o.index as Index, note: "sua oferta" }))];
  const goal = sp.filtro ?? "todos";
  let res = rank(options.map((o) => simulate(o, sc)));
  if (goal === "reserva") res = res.filter((r) => r.fit === "liquidez" && r.opt.index !== "pre" && r.opt.index !== "ipca");
  if (goal === "prazo") res = res.filter((r) => r.fit === "ok" || r.fit === "liquidez");
  if (goal === "isentos") res = res.filter((r) => r.exempt);
  if (sp.ordem === "net") res.sort((a, b) => b.final - a.final); else if (sp.ordem === "real") res.sort((a, b) => b.realYear - a.realYear);
  const topIds = res.filter((r) => r.fit === "ok" || r.fit === "liquidez").slice(0, 3).map((r) => r.opt.id);
  const qs = (patch: Record<string, string | undefined>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ aba: "rf", valor: sp.valor, prazo: sp.prazo, cdi: sp.cdi, ipca: sp.ipca, filtro: sp.filtro, ordem: sp.ordem, todos: sp.todos, ...patch })) if (v) p.set(k, v); return `/analise?${p}`; };

  // Leitura do momento (calculada com as taxas de hoje)
  const T = (re: RegExp, idx: string) => titles.filter((t) => t.index === idx && !t.coupon && re.test(t.name)).sort((a, b) => a.maturity.localeCompare(b.maturity));
  const pre = T(/Prefixado/i, "pre"), ip = T(/IPCA\+? ?\d|IPCA\+$|IPCA\+ \d/i, "ipca").filter((t) => t.grp === "ipca");
  const preShort = pre[0], preMid = pre[1] ?? pre[0], ipMid = ip.find((t) => preMid && Math.abs(Date.parse(t.maturity) - Date.parse(preMid.maturity)) < 400 * 864e5) ?? ip[0];
  const insights: [string, string][] = [];
  insights.push(["📅", `Selic em ${pc2(macro.selic)}; CDI em ${pc2(macro.cdi)}. O Focus espera a Selic em ${Object.entries(macro.focus.selic).map(([k, v]) => `${pc2(Number(v))} no fim de ${k}`).join(" e ")}.`]);
  if (preShort) { const m = Math.max(1, monthsBetween(start.slice(0, 7), preShort.maturity.slice(0, 7))); const avg = avgAnnual(cdiPath(m, start, macro.cdi, selicPath));
    insights.push(["📈", `Prefixado ou pós? O ${preShort.name} trava ${pc2(preShort.rate)} a.a. Pelo caminho da Selic do Focus, o CDI médio até lá ficaria perto de ${pc2(avg, 1)}. O prefixado ganha se a Selic cair como o mercado espera e perde se ela ficar acima de ~${pc2(preShort.rate, 1)} em média.`]); }
  if (preMid && ipMid) insights.push(["⚖️", `Inflação implícita até ${ipMid.maturity.slice(0, 4)}: ${pc2(breakevenInflation(preMid.rate, ipMid.rate))} a.a. (${preMid.name} a ${pc2(preMid.rate)} contra ${ipMid.name} a IPCA + ${pc2(ipMid.rate)}). Com IPCA médio abaixo disso o prefixado rende mais; acima, o IPCA+.`]);
  if (ipMid) { const m = Math.max(12, monthsBetween(start.slice(0, 7), ipMid.maturity.slice(0, 7))); const r = simulate(toOpt(ipMid), scenario(m, 10000), false); insights.push(["🛡️", `Juro real: levando o ${ipMid.name} até o vencimento, o ganho acima da inflação fica perto de ${pc2(r.realYear)} a.a. depois do IR e da custódia (IPCA de ${pc2(ipca)}).`]); }
  { const s12: Scenario = { months: 12, amount: 10000, cdiPath: Array(12).fill(macro.cdi), ipca, start };
    const lci = simulate({ id: "l", name: "", kind: "lci", index: "cdi", rate: 90 }, s12), cdb = simulate({ id: "c", name: "", kind: "cdb", index: "cdi", rate: 100 }, s12, false), poup = simulate({ id: "p", name: "", kind: "poup", index: "poup", rate: 0 }, s12, false);
    insights.push(["🧾", `Isentos: em 12 meses, uma LCI/LCA a 90% do CDI rende o mesmo que um CDB a ${pc2(lci.equivCdb, 1).replace("%", "")}% do CDI (${formatBRL(lci.net)} contra ${formatBRL(cdb.net)} do CDB 100% em R$ 10 mil).`]);
    insights.push(["🐷", `Poupança: em 12 meses rende ${formatBRL(poup.net)} em R$ 10 mil, contra ${formatBRL(cdb.net)} de um CDB 100% do CDI já descontado o IR.`]); }
  insights.push(["⚠️", "Prefixados e IPCA+ oscilam de preço: se as taxas sobem, quem vende antes do vencimento pode ter prejuízo. Levando até o vencimento, recebe a taxa contratada."]);

  // Sugestão por objetivo
  const goalCards = goals.filter((g) => g.data.deadline || g.type === "independencia").map((g) => {
    const reserva = g.type === "caixinha" && g.data.auto === "reserva", m = g.type === "independencia" ? 240 : Math.max(3, monthsBetween(start.slice(0, 7), g.data.deadline!));
    const s2 = scenario(m, 10000);
    let rr = rank(options.map((o) => simulate(o, s2, false))).filter((r) => r.fit === "ok" || r.fit === "liquidez");
    if (reserva) rr = rr.filter((r) => r.opt.index === "selic" || r.opt.daily);
    if (g.type === "independencia") { const end = Date.parse(start) + m * 30.44 * 864e5; rr = options.filter((o) => o.index === "ipca" && o.maturity).sort((a, b) => Math.abs(Date.parse(a.maturity!) - end) - Math.abs(Date.parse(b.maturity!) - end)).map((o) => simulate(o, s2, false)); }
    const b = rr[0]; if (!b) return null;
    const why = reserva ? "Reserva precisa de liquidez diária e pouca oscilação: entre essas opções, é a que mais rende líquido." : g.type === "independencia" ? `Para décadas, o que importa é o ganho acima da inflação: ${pc2(b.realYear)} a.a. real líquido estimado.` : b.fit === "liquidez" ? "Liquidez diária e o maior líquido estimado até a data do objetivo." : "Vence perto da data do objetivo e tem o maior líquido estimado nesse prazo.";
    return { g, b, m, why };
  }).filter(Boolean) as { g: Goal; b: Result; m: number; why: string }[];

  const refDate = titles[0]?.ref_date, stale = refDate ? Date.parse(start) - Date.parse(refDate) > 4 * 864e5 : true;
  const kpi = (l: string, v: string, s: string) => <div className="card !p-4"><div className="label">{l}</div><div className="mt-1 text-xl font-semibold tabular-nums">{v}</div><div className="mt-0.5 text-[11px] text-ink/50">{s}</div></div>;
  const presets: [number, string][] = [[6, "6m"], [12, "1 ano"], [24, "2 anos"], [36, "3 anos"], [60, "5 anos"], [120, "10 anos"], [240, "20 anos"]];
  const preT = preShort, ipT = ipMid;

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpi("Selic", pc2(macro.selic), "meta do Copom")}{kpi("CDI", pc2(macro.cdi), "ao ano")}
        {kpi("IPCA esperado", Object.values(macro.focus.ipca).map((v) => pc2(Number(v))).slice(0, 2).join(" · "), `Focus ${Object.keys(macro.focus.ipca).slice(0, 2).join(" · ")}`)}
        {kpi("Selic esperada", Object.values(macro.focus.selic).map((v) => pc2(Number(v))).slice(0, 2).join(" · "), `Focus fim de ${Object.keys(macro.focus.selic).slice(0, 2).join(" · ")}`)}
        {preT ? kpi(preT.name, pc2(preT.rate), "Tesouro, hoje") : kpi("Prefixado", "—", "")}{ipT ? kpi(ipT.name, `IPCA + ${pc2(ipT.rate)}`, "Tesouro, hoje") : kpi("IPCA+", "—", "")}
      </div>

      <section className="card mb-4 border-amber-200/70 bg-gradient-to-b from-amber-50/60 to-white">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2>Leitura do momento</h2>
          <span className="flex items-center gap-2 text-xs"><span className={`rounded-md px-1.5 py-0.5 font-medium ${stale ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{stale ? `Taxas do Tesouro de ${refDate ? formatDateBR(refDate) : "—"}` : `Taxas do Tesouro de ${formatDateBR(refDate!)}`}</span><RefreshButton /></span></div>
        <ul className="space-y-2 text-sm text-ink/75">{insights.map(([ic, t], i) => <li key={i} className="flex gap-2.5"><span className="shrink-0">{ic}</span><span>{t}</span></li>)}</ul>
        <p className="mt-3 text-[11px] text-ink/45">Fontes: Banco Central (Selic, CDI e Focus{macro.focusDate ? ` de ${formatDateBR(macro.focusDate)}` : ""}) e Tesouro Nacional. {macro.updatedAt ? `Atualizado em ${new Date(macro.updatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.` : ""}</p>
      </section>

      {goalCards.length > 0 && (
        <section className="card mb-4"><h2 className="mb-1">Para os seus objetivos</h2><p className="mb-3 text-xs text-ink/50">A opção de renda fixa que mais combina com o prazo de cada objetivo.</p>
          <div className="grid gap-3 md:grid-cols-3">{goalCards.map(({ g, b, m, why }) => (
            <div key={g.id} className="rounded-xl border border-ink/[0.06] p-3"><div className="text-xs text-ink/50">{g.name} · {m >= 24 ? `${Math.round(m / 12)} anos` : `${m} meses`}</div>
              <div className="mt-0.5 font-semibold">{b.opt.name} <span className="font-normal text-ink/55">· {rateLbl(b.opt)}</span></div><div className="mt-1 text-xs text-ink/60">{why}</div>
              <div className="mt-1 text-[11px] text-ink/45">Líquido {pc2(b.netYear)} a.a. · real {pc2(b.realYear)} a.a.</div></div>))}</div>
        </section>)}

      <section className="card mb-4 overflow-x-auto p-0">
        <form className="flex flex-wrap items-end gap-3 border-b border-ink/5 px-5 py-3">
          <input type="hidden" name="aba" value="rf" />
          <div><h2>Comparador</h2><p className="text-xs text-ink/50">Quanto cada opção deixa no seu bolso, já com IR e custódia.</p></div>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <div><label className="label">Valor</label><input className="input w-32" name="valor" defaultValue={amount.toLocaleString("pt-BR")} inputMode="decimal" /></div>
            <div><label className="label">Prazo (meses)</label><input className="input w-20" name="prazo" defaultValue={months} /></div>
            <div><label className="label" title="Vazio = caminho da Selic do Focus">CDI médio</label><input className="input w-24" name="cdi" defaultValue={sp.cdi ?? ""} placeholder={pc2(avgCdi)} /></div>
            <div><label className="label">IPCA a.a.</label><input className="input w-20" name="ipca" defaultValue={sp.ipca ?? ""} placeholder={pc2(ipcaDefault)} /></div>
            <button className="btn">Calcular</button>
          </div>
        </form>
        <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-xs">
          {presets.map(([v, l]) => <Link key={v} href={qs({ prazo: String(v) })} className={`rounded-lg px-2.5 py-1 font-medium ${months === v ? "bg-ink text-white" : "bg-ink/[0.05] text-ink/60"}`}>{l}</Link>)}
          <span className="mx-2 h-4 w-px bg-ink/10" />
          {[["todos", "Tudo"], ["reserva", "Reserva (liquidez diária)"], ["prazo", "Combina com o prazo"], ["isentos", "Só isentos de IR"]].map(([v, l]) => <Link key={v} href={qs({ filtro: v })} className={`rounded-lg px-2.5 py-1 font-medium ${goal === v ? "bg-brand text-white" : "bg-ink/[0.05] text-ink/60"}`}>{l}</Link>)}
          <span className="ml-auto text-ink/50">Ordenar: {[["", "Recomendado"], ["net", "Maior líquido"], ["real", "Maior ganho real"]].map(([v, l]) => <Link key={v} href={qs({ ordem: v || undefined })} className={`ml-2 ${(sp.ordem ?? "") === v ? "font-semibold text-ink" : "hover:text-ink"}`}>{l}</Link>)}</span>
        </div>
        <p className="px-5 pb-2 text-[11px] text-ink/45">Premissas: CDI {cdiFixed != null ? `fixo em ${pc2(cdiFixed)}` : `seguindo o Focus (média de ${pc2(avgCdi)} no período)`}, IPCA de {pc2(ipca)} a.a. Se o título vence antes, o restante é reaplicado a 100% do CDI.</p>
        <table className="table min-w-[1180px]"><thead><tr><th>Opção</th><th>Taxa</th><th>Vencimento</th><th>Liquidez · garantia</th><th className="num">Bruto</th><th className="num">IR + custódia</th><th className="num">Líquido</th><th className="num">Líquido a.a.</th><th className="num">Real a.a.</th><th className="num" title="Quanto um CDB tributado teria de pagar para empatar">= CDB</th><th>Prazo</th></tr></thead><tbody>
          {res.map((r) => { const o = r.opt, top = topIds.indexOf(o.id), mine = offers.some((x) => x.id === o.id); return (
            <tr key={o.id} className={top >= 0 ? "bg-emerald-50/40" : ""}>
              <td><div className="flex items-center gap-1.5 font-semibold">{top >= 0 && <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-600 text-[10px] text-white">{top + 1}</span>}{o.name}{mine && <span className="chip">sua oferta</span>}</div><div className="text-[11px] text-ink/45">{KIND_L[o.kind]}{r.exempt ? " · isento de IR" : ""}{o.note && !mine ? ` · ${o.note}` : ""}</div></td>
              <td className="whitespace-nowrap">{rateLbl(o)}</td><td className="text-ink/60">{o.maturity ? formatDateBR(o.maturity) : "—"}</td>
              <td className="text-xs text-ink/60">{r.liquidity}<div className="text-ink/40">{r.guarantee}</div></td>
              <td className="num">{formatBRL(r.gross)}</td><td className="num text-loss/80">{r.ir + r.custody > 0.5 ? `−${formatBRL(r.ir + r.custody)}` : "—"}{r.irRate ? <div className="text-[10px] text-ink/40">IR {pc2(r.irRate * 100, 1)}</div> : null}</td>
              <td className="num font-semibold">{formatBRL(r.net)}</td><td className="num">{pc2(r.netYear)}</td><td className={`num ${r.realYear >= 0 ? "text-gain" : "text-loss"}`}>{pc2(r.realYear)}</td><td className="num text-ink/60">{r.equivCdb ? `${Math.round(r.equivCdb)}%` : "—"}</td>
              <td><span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${FIT[r.fit][1]}`} title={r.fitNote}>{FIT[r.fit][0]}</span>
                {mine && edit && <form action={delRfOffer} className="inline"><input type="hidden" name="id" value={o.id} /><button className="ml-1 text-xs text-ink/30 hover:text-loss">×</button></form>}</td>
            </tr>); })}
        </tbody></table>
        <p className="px-5 py-2 text-[11px] text-ink/45">Ofertas de CDB, LCI e LCA variam por corretora e por dia: cadastre as que você recebeu em “Comparar uma oferta”. Títulos com juros semestrais ficam fora do comparador (os cupons são tributados a cada pagamento); eles aparecem na tabela do Tesouro.</p>
        {edit && (
          <form action={addRfOffer} className="flex flex-wrap items-end gap-2 border-t border-ink/5 px-5 py-3"><div className="w-full text-sm font-semibold">Comparar uma oferta</div>
            <div><label className="label">Nome</label><input className="input w-48" name="name" required placeholder="CDB Banco X" /></div>
            <div><label className="label">Tipo</label><select className="input" name="kind">{(["cdb", "lci", "lca", "cri", "cra", "deb-inc", "deb"] as Kind[]).map((k) => <option key={k} value={k}>{KIND_L[k]}</option>)}</select></div>
            <div><label className="label">Indexador</label><select className="input" name="index"><option value="cdi">% do CDI</option><option value="cdi+">CDI + x%</option><option value="pre">Prefixado</option><option value="ipca">IPCA + x%</option></select></div>
            <div><label className="label">Taxa</label><input className="input w-24" name="rate" required inputMode="decimal" placeholder="110" /></div>
            <div><label className="label">Vencimento</label><input className="input" type="date" name="maturity" /></div>
            <label className="flex items-center gap-1.5 pb-2 text-sm"><input type="checkbox" name="daily" /> Liquidez diária</label>
            <button className="btn">Comparar</button>
          </form>)}
      </section>

      <section className="card mb-4 overflow-x-auto p-0">
        <div className="flex items-center justify-between px-5 py-3"><div><h2>Tesouro Direto hoje</h2><p className="text-xs text-ink/50">Taxas de compra{refDate ? ` de ${formatDateBR(refDate)}` : ""}.</p></div>
          <Link className="btn-ghost !py-1.5 text-xs" href={qs({ todos: sp.todos ? undefined : "1" })}>{sp.todos ? "Só os principais" : "Ver RendA+ e Educa+"}</Link></div>
        <table className="table"><thead><tr><th>Título</th><th>Taxa de compra</th><th>Vencimento</th><th className="num">Mínimo</th><th>Para quê</th></tr></thead><tbody>
          {titles.filter((t) => sp.todos || !["renda", "educa"].includes(t.grp)).map((t) => (
            <tr key={t.id}><td className="font-medium">{t.name}</td><td>{rateLbl(t)}</td><td className="text-ink/60">{formatDateBR(t.maturity)}</td><td className="num">{t.min_investment ? formatBRL(t.min_investment) : "—"}</td>
              <td className="text-xs text-ink/60">{({ pos: "Reserva e liquidez: acompanha a Selic, quase sem oscilação", pre: "Travar a taxa de hoje até o vencimento; ganha se os juros caírem", ipca: "Proteger da inflação no longo prazo", renda: "Renda mensal na aposentadoria (20 anos)", educa: "Custear estudos (60 parcelas mensais)" } as Record<string, string>)[t.grp]}{t.coupon ? " · paga juros a cada 6 meses" : ""}</td></tr>))}
        </tbody></table>
      </section>

      <section className="card"><h2 className="mb-2">Como ler</h2>
        <div className="grid gap-x-6 gap-y-2 text-sm text-ink/70 md:grid-cols-2">
          <p><b>Pós-fixado</b> (Selic, % do CDI): acompanha os juros do momento. É o lugar da reserva de emergência.</p>
          <p><b>Prefixado</b>: você sabe hoje quanto vai receber no vencimento. Se vender antes, recebe o preço do dia.</p>
          <p><b>IPCA+</b>: inflação mais um juro real. O melhor para objetivos longos, porque preserva o poder de compra.</p>
          <p><b>Marcação a mercado</b>: o preço de prefixados e IPCA+ sobe quando os juros caem e cai quando os juros sobem.</p>
          <p><b>IR</b>: 22,5% até 6 meses, 20% até 1 ano, 17,5% até 2 anos, 15% depois. LCI, LCA, CRI, CRA, debênture incentivada e poupança são isentos.</p>
          <p><b>Garantias</b>: Tesouro é garantido pelo governo federal; CDB, LCI e LCA pelo FGC até R$ 250 mil por CPF e por instituição. CRI, CRA e debêntures não têm FGC.</p>
          <p><b>Custódia</b>: a B3 cobra 0,20% a.a. no Tesouro; o Tesouro Selic é isento até R$ 10 mil.</p>
          <p><b>Real a.a.</b>: quanto o dinheiro cresce acima da inflação, já líquido de IR.</p>
        </div>
        <p className="mt-3 text-[11px] text-ink/45">Ferramenta de comparação, não recomendação de investimento.</p>
      </section>
    </div>
  );
}
