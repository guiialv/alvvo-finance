"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { PERGUNTAS, type Respostas } from "@/lib/perfil";
import { adiarPerfil, salvarPerfil } from "./actions";

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="overflow-hidden rounded-[28px] shadow-[0_24px_60px_-30px_rgba(60,40,20,.55)]">{children}</div>
    </div>
  );
}

export function Questionario({ nome, inicial, edicao }: { nome: string; inicial: Respostas; edicao: boolean }) {
  const [r, setR] = useState<Respostas>(inicial);
  const [i, setI] = useState(edicao ? 0 : -1); // -1 = abertura
  const [erro, setErro] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const total = PERGUNTAS.length, p = PERGUNTAS[i];

  const valor = p ? r[p.id] : undefined;
  const respondida = !p || p.opcional || (p.kind === "many" ? Array.isArray(valor) && valor.length > 0 : !!valor);
  const set = (v: string | string[]) => { setErro(null); setR((x) => ({ ...x, [p.id]: v })); };
  const toggle = (k: string) => {
    const cur = Array.isArray(valor) ? valor : [];
    if (cur.includes(k)) set(cur.filter((x) => x !== k));
    else if (p.max && cur.length >= p.max) setErro(`Escolha no máximo ${p.max} opções.`);
    else set([...cur, k]);
  };
  const avancar = () => {
    if (!respondida) { setErro("Selecione uma opção para continuar."); return; }
    setErro(null);
    if (i < total - 1) { setI(i + 1); start(async () => { await salvarPerfil(r, false); }); return; }
    start(async () => {
      const res = await salvarPerfil(r, true);
      if (res.error) { setErro(res.error); return; }
      setI(total);
    });
  };

  if (i === -1) return (
    <Moldura>
      <div className="px-7 pb-8 pt-9 text-[#f6efe2]" style={{ background: "radial-gradient(90% 70% at 100% 0%, rgba(226,166,75,.45), rgba(226,166,75,0) 60%), radial-gradient(80% 70% at 0% 100%, rgba(143,94,19,.5), rgba(143,94,19,0) 70%), linear-gradient(160deg, #2a211a, #15120f)" }}>
        <div className="eyebrow !text-[#e2a64b]">Boas-vindas ao Alvvo Finance</div>
        <h1 className="mt-3 !text-[30px] leading-tight !text-[#f6efe2]">Olá, {nome}. Vamos conhecer o seu momento.</h1>
        <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-[#cfc3b0]">São {total} perguntas rápidas sobre o seu momento de vida, seus objetivos e seus interesses. Com elas, a plataforma destaca o que é mais pertinente para você, inclusive as notícias do dia.</p>
        <p className="mt-3 text-xs leading-relaxed text-[#cfc3b0]/75">As respostas ficam vinculadas ao seu perfil, podem ser alteradas a qualquer momento e são lidas pela equipe do Alvvo apenas para aprimorar a plataforma.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <button className="rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-espresso transition hover:brightness-105" onClick={() => setI(0)}>Começar</button>
          <button className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-[#f6efe2]/80 transition hover:bg-white/5" disabled={busy}
            onClick={() => start(async () => { await adiarPerfil(); router.push("/"); })}>Responder depois</button>
        </div>
      </div>
    </Moldura>
  );

  if (i >= total) return (
    <Moldura>
      <div className="px-7 py-9" style={{ background: "radial-gradient(90% 80% at 100% 0%, #dfe8d6 0%, rgba(223,232,214,0) 60%), linear-gradient(150deg, #f6f8f2, #e6eddf)" }}>
        <span className="grid h-12 w-12 place-items-center rounded-full bg-white/80 text-emerald-700"><Icon name="check" className="h-6 w-6" /></span>
        <h1 className="mt-4 !text-[28px]">Obrigado, {nome}.</h1>
        <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-ink/70">Seu perfil foi registrado. As notícias do dia já consideram os seus interesses, e você pode revisar as respostas quando quiser no menu do perfil.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button className="btn" onClick={() => router.push("/noticias")}>Ver as notícias para você</button>
          <button className="btn-ghost" onClick={() => router.push("/")}>Ir para o Início</button>
        </div>
      </div>
    </Moldura>
  );

  return (
    <Moldura>
      <div className="bg-surface px-6 pb-6 pt-6 sm:px-8">
        <div className="flex items-center justify-between text-xs text-ink/50">
          <span>Pergunta {i + 1} de {total}</span>
          {!edicao && <button className="hover:text-ink" disabled={busy} onClick={() => start(async () => { await salvarPerfil(r, false); await adiarPerfil(); router.push("/"); })}>Continuar depois</button>}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]"><div className="h-full rounded-full transition-all" style={{ width: `${((i + 1) / total) * 100}%`, background: "linear-gradient(90deg, #e8d2a1, #c9973f)" }} /></div>
        <h2 className="mt-6 text-[22px] font-semibold leading-snug tracking-[-0.01em]">{p.titulo}</h2>
        {p.ajuda && <p className="mt-1 text-sm text-ink/55">{p.ajuda}</p>}

        <div className="mt-5">
          {p.kind === "text" ? (
            <textarea className="input min-h-[120px] !rounded-2xl !text-[15px]" maxLength={600} value={typeof valor === "string" ? valor : ""} onChange={(e) => set(e.target.value)} />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {p.opcoes!.map(([k, l]) => {
                const on = p.kind === "one" ? valor === k : Array.isArray(valor) && valor.includes(k);
                return (
                  <button key={k} type="button" onClick={() => (p.kind === "one" ? set(k) : toggle(k))}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[14px] transition ${on ? "border-gold/70 font-medium" : "border-[#e2d8c6] hover:border-ink/25"}`}
                    style={on ? { background: "radial-gradient(90% 90% at 100% 0%, #f6dfb0 0%, rgba(246,223,176,0) 60%), linear-gradient(150deg, #fcf6ea, #f3e3c2)" } : undefined}>
                    <span className={`grid h-5 w-5 shrink-0 place-items-center border ${p.kind === "one" ? "rounded-full" : "rounded-md"} ${on ? "border-espresso bg-espresso text-[#f6efe2]" : "border-ink/25 bg-white"}`}>{on && <Icon name="check" className="h-3 w-3" />}</span>
                    {l}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {erro && <p className="mt-3 text-sm text-loss">{erro}</p>}
        <div className="mt-6 flex items-center justify-between gap-3">
          <button className="btn-ghost" disabled={busy || i === 0} onClick={() => { setErro(null); setI(i - 1); }}>Voltar</button>
          <button className="btn" disabled={busy} onClick={avancar}>{i === total - 1 ? (busy ? "Salvando…" : "Concluir") : p.opcional && !valor ? "Pular" : "Continuar"}</button>
        </div>
      </div>
    </Moldura>
  );
}
