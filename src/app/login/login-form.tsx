"use client";

import { useActionState, useState } from "react";
import { authenticate, signInWithGoogle, type AuthState } from "./actions";

type Mode = "entrar" | "criar" | "magic";

export function LoginForm({ next, googleError }: { next: string; googleError: boolean }) {
  const [mode, setMode] = useState<Mode>("entrar");
  const [state, action, pending] = useActionState<AuthState, FormData>(authenticate, undefined);

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand/40 blur-3xl" />
        <div className="absolute -bottom-32 left-10 h-80 w-80 rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div className="relative flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-lg font-bold">A</div><span className="font-semibold tracking-wide">ALVVO Finance</span></div>
        <div className="relative">
          <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-tight">Toda a vida financeira em um só lugar.</h1>
          <p className="mt-4 max-w-md text-white/60">Orçamento por ciclo, faturas lidas automaticamente, investimentos, objetivos e análises, com cada pessoa vendo só o que você liberar.</p>
        </div>
        <div className="relative text-xs text-white/40">Beta fechado · acesso por convite</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 lg:hidden"><span className="font-semibold">ALVVO Finance</span></div>
          <div className="mb-5 inline-flex rounded-xl bg-ink/[0.05] p-1 text-sm">
            {([["entrar", "Entrar"], ["criar", "Criar conta"]] as const).map(([m, l]) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-lg px-3 py-1.5 font-medium ${mode === m ? "bg-white shadow-sm" : "text-ink/55"}`}>{l}</button>
            ))}
          </div>
          <form action={signInWithGoogle} className="mb-4">
            <input type="hidden" name="next" value={next} />
            <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm font-medium shadow-sm hover:bg-ink/[0.03]">
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
