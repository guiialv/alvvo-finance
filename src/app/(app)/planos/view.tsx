"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { PlanBadge } from "@/components/plan-badge";
import { DESTAQUES, DESTAQUES_FREE, NOME_PLANO, PRECO, TABELA, type Plano } from "@/lib/planos";
import { quererAssinar, usarCodigo } from "./actions";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const BG: Record<Plano, string> = {
  free: "linear-gradient(160deg, #fffdf8, #f4efe6)",
  premium: "radial-gradient(90% 80% at 100% 0%, #f6dfb0 0%, rgba(246,223,176,0) 60%), linear-gradient(150deg, #fcf6ea, #f1ddb4)",
  familia: "radial-gradient(90% 70% at 100% 0%, rgba(226,166,75,.45), rgba(226,166,75,0) 60%), radial-gradient(80% 70% at 0% 100%, rgba(143,94,19,.5), rgba(143,94,19,0) 70%), linear-gradient(160deg, #2a211a, #15120f)",
};

function Cel({ v }: { v: boolean | string }) {
  if (v === true) return <Icon name="check" className="mx-auto h-4 w-4 text-emerald-700" />;
  if (v === false) return <span className="text-ink/30">—</span>;
  return <span className="text-[12px] leading-tight text-ink/75">{v}</span>;
}

export function PlanosView({ plano, origem, ate, interesse, podeCodigo }: { plano: Plano; origem: string | null; ate: string | null; interesse: { plano: string; ciclo: string } | null; podeCodigo: boolean }) {
  const [ciclo, setCiclo] = useState<"mensal" | "anual">((interesse?.ciclo as "mensal" | "anual") ?? "anual");
  const [quero, setQuero] = useState<string | null>(interesse?.plano ?? null);
  const [msg, setMsg] = useState<string | null>(null);
  const [cod, setCod] = useState("");
  const [busy, start] = useTransition();

  const card = (k: Plano, sub: string, itens: string[]) => {
    const dark = k === "familia", cur = plano === k;
    const preco = k === "free" ? null : PRECO[k];
    const mes = preco ? (ciclo === "anual" ? preco.anual / 12 : preco.mensal) : 0;
    return (
      <article key={k} className={`flex flex-col rounded-[24px] p-5 shadow-[0_16px_40px_-28px_rgba(60,40,20,.6)] ${dark ? "text-[#f6efe2]" : ""} ${cur ? "ring-2 ring-gold" : ""}`} style={{ background: BG[k] }}>
        <div className="flex items-center justify-between"><span className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${dark ? "text-gold" : "text-finance"}`}>{NOME_PLANO[k]}</span>{cur && <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${dark ? "bg-white/10" : "bg-white/70"}`}>Seu plano</span>}</div>
        <div className="mt-3"><span className="text-[30px] font-semibold tracking-[-0.02em] tabular-nums">{preco ? brl(mes) : "R$ 0"}</span><span className={`ml-1 text-xs ${dark ? "text-[#cfc3b0]" : "text-ink/55"}`}>{preco ? `por mês${ciclo === "anual" ? `, ${brl(preco.anual)} por ano` : ""}` : "para sempre"}</span></div>
        <p className={`mt-1.5 text-[13px] leading-relaxed ${dark ? "text-[#cfc3b0]" : "text-ink/65"}`}>{sub}</p>
        <ul className="mt-3 flex-1 space-y-1.5 text-[13px]">{itens.map((x) => <li key={x} className="flex gap-2"><Icon name="check" className={`mt-0.5 h-4 w-4 shrink-0 ${dark ? "text-gold" : "text-emerald-700"}`} />{x}</li>)}</ul>
        {k !== "free" && !cur && (
          <button disabled={busy} onClick={() => start(async () => { const r = await quererAssinar(k, ciclo); if (r.ok) { setQuero(k); setMsg("Combinado. A assinatura abre no lançamento oficial e você será avisado primeiro."); } else setMsg(r.error ?? null); })}
            className={`mt-4 rounded-full py-2.5 text-sm font-semibold transition ${dark ? "bg-gold text-espresso hover:brightness-105" : "bg-espresso text-[#f6efe2] hover:brightness-110"}`}>{quero === k ? "Interesse registrado ✓" : "Quero assinar"}</button>
        )}
      </article>
    );
  };

  return (
    <div className="space-y-5">
      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="label">Seu plano</div>
          <div className="mt-1 flex items-center gap-2 text-[20px] font-semibold">Alvvo {NOME_PLANO[plano]} {plano !== "free" && <PlanBadge plano={plano === "familia" ? "familia" : "premium"} />}</div>
          <p className="mt-1 text-sm text-ink/60">{plano === "free" ? "O essencial para organizar as finanças da família, sem custo." : origem === "codigo" ? "Liberado pelo seu código de tester: todos os recursos ficam disponíveis até o fim do beta." : origem === "cortesia" ? "Acesso de cortesia com todos os recursos." : "Assinatura ativa."}{ate ? ` Válido até ${new Date(ate).toLocaleDateString("pt-BR")}.` : ""}</p>
        </div>
        {plano === "free" && podeCodigo && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await usarCodigo(cod); setMsg(r.error ?? (r.jaTinha ? "Sua conta já tem acesso completo." : "Pronto. O plano Família foi liberado para esta conta.")); }); }}>
            <input className="input !w-48" placeholder="Código de acesso" value={cod} onChange={(e) => setCod(e.target.value.toUpperCase())} maxLength={40} />
            <button className="btn" disabled={busy}>Usar código</button>
          </form>
        )}
      </section>

      <div className="flex justify-center">
        <div className="inline-flex rounded-full bg-ink/[0.05] p-1 text-sm">
          {(["mensal", "anual"] as const).map((c) => <button key={c} onClick={() => setCiclo(c)} className={`rounded-full px-4 py-1.5 font-medium transition ${ciclo === c ? "bg-surface shadow-sm" : "text-ink/55"}`}>{c === "mensal" ? "Mensal" : <>Anual <b className="text-emerald-700">−25%</b></>}</button>)}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {card("free", "Organize o dia a dia, os investimentos e o mercado sem pagar nada.", DESTAQUES_FREE)}
        {card("premium", "Para quem quer o Alvvo trabalhando por você: leitura automática, banco conectado e análises completas.", DESTAQUES.premium)}
        {card("familia", "O Premium para toda a família, com permissões para cada pessoa.", DESTAQUES.familia)}
      </div>
      {msg && <p className="text-center text-sm text-brand">{msg}</p>}

      <section className="card overflow-x-auto">
        <h2 className="mb-3">Compare os planos</h2>
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-[0.14em] text-ink/45"><th className="py-2 pr-3 font-medium">Recurso</th>{(["free", "premium", "familia"] as const).map((k) => <th key={k} className="w-[19%] py-2 text-center font-medium">{NOME_PLANO[k]}</th>)}</tr></thead>
          <tbody className="divide-y divide-[#efe7da]">
            {TABELA.map(([l, a, b, c]) => <tr key={l}><td className="py-2.5 pr-3 text-ink/80">{l}</td><td className="py-2.5 text-center"><Cel v={a} /></td><td className="py-2.5 text-center"><Cel v={b} /></td><td className="py-2.5 text-center"><Cel v={c} /></td></tr>)}
          </tbody>
        </table>
      </section>

      <section className="card space-y-2">
        <h2>Perguntas frequentes</h2>
        {[
          ["Sou tester do beta. O que muda para mim?", "Com o código que você recebeu, todos os recursos ficam liberados até o fim do beta. Os recursos pagos aparecem sinalizados com o selo Premium ou Família. Antes do lançamento oficial avisaremos com antecedência, e quem participou do beta terá condição especial no primeiro ano."],
          ["Se eu voltar para o Free, perco meus dados?", "Não. Tudo o que foi registrado continua na conta. Apenas os recursos pagos ficam pausados até a assinatura ser retomada."],
          ["Quando a assinatura abre?", "No lançamento oficial do Alvvo Finance. Ao tocar em “Quero assinar”, você será avisado primeiro."],
          ["Posso cancelar quando quiser?", "Sim, sem multa. O acesso continua até o fim do período já pago."],
        ].map(([q, a]) => <details key={q} className="rounded-xl px-1 py-1.5"><summary className="cursor-pointer text-[14px] font-medium">{q}</summary><p className="mt-1.5 text-sm leading-relaxed text-ink/65">{a}</p></details>)}
      </section>
      <p className="text-center text-xs text-ink/45">Valores de referência para o lançamento, sujeitos a ajuste. Nada é cobrado durante o beta.</p>
    </div>
  );
}
