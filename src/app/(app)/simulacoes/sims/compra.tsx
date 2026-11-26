"use client";

import { useMemo, useState, useTransition } from "react";
import { avaliarCompra, mesAno, type CompraBase, type Juros, type Modo } from "@/lib/sim/compra";
import type { CompraHist } from "@/lib/sim/compra-data";
import { brl, Choice, Field, Layout, Note } from "@/components/sim/kit";
import { decidirCompra, type CompraDecisao } from "../actions";

const TOM = {
  viavel: { eb: "#b9cfae", bar: "#8a9a7b" },
  ressalva: { eb: "#e2a64b", bar: "#e2a64b" },
  nao: { eb: "#e6a596", bar: "#d9a093" },
} as const;
const STATUS: Record<string, string> = { reavaliar: "Reavaliar", comprar: "Compra decidida", descartada: "Descartada", objetivo: "Virou objetivo" };
const VERED: Record<string, string> = { viavel: "Viável", ressalva: "Com ressalvas", nao: "Não recomendada" };

export interface CompraInit { item?: string; valor?: number; modo?: Modo; parcelas?: number; juros?: Juros; taxa?: number; entrada?: number; desconto?: number }

export function CompraSim({ b, hist, init, canGoal }: { b: CompraBase; hist: CompraHist[]; init: CompraInit; canGoal: boolean }) {
  const [item, setItem] = useState(init.item ?? "");
  const [valor, setValor] = useState(init.valor ?? 0);
  const [modo, setModo] = useState<Modo>(init.modo ?? "cartao");
  const [parcelas, setParcelas] = useState(init.parcelas ?? 10);
  const [juros, setJuros] = useState<Juros>(init.juros ?? "nao");
  const [taxa, setTaxa] = useState(init.taxa ?? (init.modo === "financiado" ? 0.018 : 0.025));
  const [entrada, setEntrada] = useState(init.entrada ?? 0);
  const [desconto, setDesconto] = useState(init.desconto ?? 0);
  const [limite, setLimite] = useState(0.85);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const a = useMemo(() => avaliarCompra(b, { item, valor, modo, parcelas, juros, taxa: taxa * 100, entrada, desconto: desconto * 100, limite }),
    [b, item, valor, modo, parcelas, juros, taxa, entrada, desconto, limite]);
  const juntar = a.alternativas.find((x) => x.key === "juntar");
  const tom = TOM[a.nivel];

  function decidir(status: CompraDecisao["status"]) {
    setMsg(null);
    start(async () => {
      const r = await decidirCompra({
        status, item: item || "Compra", amount: valor, verdict: a.nivel,
        params: { modo, parcelas: a.n, juros, taxa, entrada, desconto, parcela: Math.round(a.parcela * 100) / 100 },
        goal: status === "objetivo" && juntar ? { target: juntar.alvo ?? valor, deadline: juntar.ate ?? b.ciclo, monthly: juntar.mensal ?? 0 } : undefined,
      });
      if (r?.error) setMsg(r.error);
      else setMsg(status === "reavaliar" ? "Combinado. Amanhã esta compra aparecerá no Início para uma nova avaliação." : status === "descartada" ? "Compra descartada. A análise fica registrada no histórico." : "Decisão registrada.");
    });
  }

  const antesW = Math.min(100, a.antes * 100), novoW = Math.max(0, Math.min(100, a.depois * 100) - antesW);

  return (
    <Layout inputs={<>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="compra-item" className="text-[13px] text-ink/60">O que você pretende comprar</label>
        <input id="compra-item" className="input !rounded-xl !text-[15px]" placeholder="Ex.: celular, viagem, sofá" value={item} maxLength={80} onChange={(e) => setItem(e.target.value)} />
      </div>
      <Field label="Valor da compra" value={valor} onChange={setValor} max={Math.max(50000, valor * 1.5)} step={50} />
      <Choice label="Forma de pagamento" value={modo} onChange={(m) => { setModo(m); if (m === "financiado") { setParcelas((p) => Math.max(12, p)); setTaxa(0.018); } }} options={[["vista", "À vista"], ["cartao", "Parcelado no cartão"], ["financiado", "Financiado"]]} />
      {modo === "cartao" && <>
        <Field label="Número de parcelas" kind="num" value={parcelas} onChange={(v) => setParcelas(Math.max(2, Math.min(24, Math.round(v))))} min={2} max={24} step={1} />
        <Choice label="O parcelamento tem juros?" value={juros} onChange={setJuros} options={[["nao", "Não"], ["sim", "Sim"], ["naosei", "Não sei"]]} />
        {juros === "sim" && <Field label="Taxa de juros" kind="pct" value={taxa} onChange={setTaxa} max={0.15} step={0.001} hint="ao mês" />}
      </>}
      {modo === "financiado" && <>
        <Field label="Entrada" value={entrada} onChange={setEntrada} max={Math.max(1000, valor)} step={50} />
        <Field label="Número de parcelas" kind="num" value={parcelas} onChange={(v) => setParcelas(Math.max(2, Math.min(120, Math.round(v))))} min={2} max={120} step={1} />
        <Field label="Taxa de juros" kind="pct" value={taxa} onChange={setTaxa} max={0.06} step={0.001} hint="ao mês" />
      </>}
      <Field label="Desconto para pagamento à vista" kind="pct" value={desconto} onChange={setDesconto} max={0.3} step={0.01} hint="opcional" />
      <Field label="Limite de comprometimento da renda" kind="pct" value={limite} onChange={(v) => setLimite(Math.min(0.95, Math.max(0.6, v)))} min={0.6} max={0.95} step={0.05} hint="referência" />
      <Note>
        A análise utiliza os dados desta conta: renda média de {brl(b.renda)}, despesas médias de {brl(b.despesas)} e aportes médios de {brl(b.aporte)} por mês;
        {b.caixa.saldo != null ? ` saldo bancário de ${brl(b.caixa.saldo)};` : ""} reserva de {brl(b.reserva.atual)}; parcelas já assumidas de {brl(b.parcelas[0] ?? 0)} neste ciclo; e o ritmo de {b.goals.length} {b.goals.length === 1 ? "objetivo" : "objetivos"}.
      </Note>
    </>}>
      {!a.ok ? (
        <section className="card text-sm text-ink/70">{a.motivoSemDados}</section>
      ) : (<>
        <section className="rounded-[22px] px-6 py-5 text-[#f6efe2] shadow-[0_18px_40px_-24px_rgba(60,40,20,.6)]"
          style={{ background: "radial-gradient(90% 70% at 100% 0%, rgba(226,166,75,.42), rgba(226,166,75,0) 60%), radial-gradient(80% 70% at 0% 100%, rgba(143,94,19,.5), rgba(143,94,19,0) 70%), linear-gradient(160deg, #2a211a, #15120f)" }}>
          <div className="eyebrow" style={{ color: tom.eb }}>{item ? `${item} · ` : ""}{modo === "vista" ? `${brl(valor)} à vista` : `${brl(valor)} em ${a.n}x de ${brl(a.parcela, 2)}`}</div>
          <p className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[32px]">{a.titulo}</p>
          <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-[#cfc3b0]">{a.resumo}</p>
          {modo !== "vista" && (
            <div className="mt-4">
              <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
                <div className="absolute inset-y-0 left-0 bg-[#c9a96e]" style={{ width: `${antesW}%` }} />
                <div className="absolute inset-y-0" style={{ left: `${antesW}%`, width: `${novoW}%`, background: tom.bar }} />
                <div className="absolute inset-y-[-3px] w-[2px] bg-[#f6efe2]/80" style={{ left: `${limite * 100}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-[#cfc3b0]/80"><span>Comprometido hoje: {Math.round(a.antes * 100)}%</span><span>Com a compra: {Math.round(a.depois * 100)}%</span><span>Limite: {Math.round(limite * 100)}%</span></div>
            </div>
          )}
        </section>

        <section className="card">
          <p className="label">Pontos considerados</p>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed text-ink/80">{a.pontos.map((p, i) => <li key={i} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />{p}</li>)}</ul>
        </section>

        {a.impactos.length > 0 && (
          <section className="card">
            <p className="label">Efeito nos objetivos</p>
            <div className="mt-1 divide-y divide-[#efe7da]">
              {a.impactos.map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate">{g.name}</span>
                  {g.concluido ? <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-700">já concluído</span>
                    : g.antes == null ? <span className="text-xs text-ink/45">sem aportes no momento</span>
                    : g.atraso > 0 ? <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-rose-600">+{g.atraso} {g.atraso === 1 ? "mês" : "meses"}</span>
                    : <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-700">sem impacto</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="card">
          <p className="label">Alternativas</p>
          <div className="mt-2 grid gap-2">
            {a.alternativas.map((x) => (
              <div key={x.key} className={`rounded-2xl border p-3.5 ${x.key === "juntar" ? "border-amber-500/60 bg-amber-50/70" : "border-[#e2d8c6] bg-surface"}`}>
                <p className="text-[14px] font-semibold">{x.titulo}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink/60">{x.detalhe}</p>
                {!x.viavel && <p className="mt-1.5 text-[11.5px] font-medium text-rose-600">Exige ajustes adicionais no orçamento.</p>}
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {canGoal && juntar && <button className="btn" disabled={busy} onClick={() => decidir("objetivo")}>Criar objetivo para esta compra</button>}
            <button className="btn-ghost" disabled={busy} onClick={() => decidir("reavaliar")}>Reavaliar amanhã</button>
            <button className="btn-ghost" disabled={busy} onClick={() => decidir("comprar")}>Registrar decisão de compra</button>
            <button className="btn-ghost" disabled={busy} onClick={() => decidir("descartada")}>Descartar</button>
          </div>
          {msg && <p className="mt-3 text-sm text-brand">{msg}</p>}
          {canGoal && juntar && <p className="mt-2 text-[12px] text-ink/45">O objetivo é criado com valor de {brl(juntar.alvo ?? valor)}, prazo em {juntar.ate ? mesAno(juntar.ate) : "—"} e aporte de {brl(juntar.mensal ?? 0)} por mês. Depois, é possível adicionar uma foto.</p>}
        </section>
      </>)}

      {hist.length > 0 && (
        <section className="card">
          <p className="label">Análises anteriores</p>
          <div className="mt-1 divide-y divide-[#efe7da]">
            {hist.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">{h.item} <span className="text-ink/45">· {brl(h.amount)}</span></span>
                <span className="shrink-0 text-xs text-ink/55">{h.verdict ? `${VERED[h.verdict] ?? h.verdict} · ` : ""}{STATUS[h.status] ?? h.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </Layout>
  );
}
