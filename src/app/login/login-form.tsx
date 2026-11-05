"use client";

import { BrandMark, Wordmark } from "@/components/brand";

import { useActionState, useState } from "react";
import { authenticate, signInWithGoogle, type AuthState } from "./actions";

type Mode = "entrar" | "criar" | "magic";

export function LoginForm({ next, googleError }: { next: string; googleError: boolean }) {
  const [mode, setMode] = useState<Mode>("entrar");
  const [state, action, pending] = useActionState<AuthState, FormData>(authenticate, undefined);

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-espresso p-14 text-[#efe7da] lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-gold/15 blur-3xl" />
        <div className="absolute -bottom-40 left-0 h-96 w-96 rounded-full bg-sage/15 blur-3xl" />
        <div className="relative flex items-center gap-3"><BrandMark className="h-11 w-11" color="#d8bf8f" /><span className="font-serif text-[26px] tracking-[0.14em] text-[#f3eadb]">ALVVO</span><span className="mt-1 text-[10px] uppercase tracking-[0.28em] text-gold/80">Finance</span></div>
        <div className="relative">
          <h1 className="max-w-md font-serif text-[52px] font-normal leading-[1.05]">Toda a vida financeira em um só lugar.</h1>
          <p className="mt-5 max-w-md leading-relaxed text-[#efe7da]/60">Orçamento por ciclo, faturas lidas automaticamente, investimentos, objetivos e análises, com cada pessoa vendo só o que você liberar.</p>
        </div>
        <div className="relative text-[11px] uppercase tracking-[0.2em] text-gold/60">Beta fechado · acesso por convite</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Wordmark tone="dark" /></div>
          <div className="mb-5 inline-flex rounded-full bg-ink/[0.05] p-1 text-sm">
            {([["entrar", "Entrar"], ["criar", "Criar conta"]] as const).map(([m, l]) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-full px-4 py-1.5 font-medium ${mode === m ? "bg-ink text-[#f6efe2]" : "text-ink/55"}`}>{l}</button>
            ))}
          </div>
          <form action={signInWithGoogle} className="mb-4">
            <input type="hidden" name="next" value={next} />
            <button className="flex w-full items-center justify-center gap-2 rounded-full border border-ink/12 bg-surface px-3 py-2.5 text-sm font-medium hover:border-ink/25">
              <span className="grid h-5 w-5 place-items-center rounded bg-[#ea4335] text-[11px] font-bold text-white">G</span>Continuar com Google
            </button>
            {googleError && <p className="mt-2 text-xs text-loss">Não foi possível entrar com o Google. Tente de novo ou use o e-mail.</p>}
          </form>
          <div className="mb-4 flex items-center gap-3 text-xs text-ink/40"><span className="h-px flex-1 bg-ink/10" />ou com e-mail<span className="h-px flex-1 bg-ink/10" /></div>
          <form action={action} className="space-y-3">
            <input type="hidden" name="mode" value={mode} />
            <input type="hidden" name="next" value={next} />
            <div><label className="label" htmlFor="email">E-mail</label><input className="input" id="email" name="email" type="email" required autoComplete="email" /></div>
            {mode !== "magic" && (
              <div><label className="label" htmlFor="password">Senha</label>
                <input className="input" id="password" name="password" type="password" required minLength={8} autoComplete={mode === "entrar" ? "current-password" : "new-password"} /></div>
            )}
            {state?.error && <p className="text-sm text-loss">{state.error}</p>}
            {state?.message && <p className="text-sm text-gain">{state.message}</p>}
            <button className="btn w-full py-2.5" disabled={pending}>{pending ? "Aguarde…" : mode === "criar" ? "Criar conta" : mode === "magic" ? "Enviar link de acesso" : "Entrar"}</button>
            <button type="button" onClick={() => setMode(mode === "magic" ? "entrar" : "magic")} className="w-full text-center text-sm text-brand hover:underline">
              {mode === "magic" ? "Prefiro entrar com senha" : "Prefiro receber um link de acesso por e-mail"}
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-ink/45">Recebeu um convite? Entre ou crie a conta e informe o código na próxima tela.</p>
          <p className="mt-3 text-center text-[11px] text-ink/40"><a href="/termos" className="hover:underline">Termos de Uso</a> · <a href="/privacidade" className="hover:underline">Política de Privacidade</a></p>
        </div>
      </div>
    </main>
  );
}
