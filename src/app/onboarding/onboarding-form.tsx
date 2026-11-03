"use client";

import { useActionState, useState } from "react";
import { onboard, type OnbState } from "./actions";

const TEMPLATES = [
  ["familia", "Família", "Orçamento da casa em grupos (Fixas, Variáveis, Extras, Adicionais) e visão PJ."],
  ["individual", "Individual", "As mesmas categorias da casa, sem a visão PJ."],
  ["autonomo", "Autônomo / PJ", "Casa e empresa: notas emitidas, impostos (Simples, DAS, INSS), custos e retiradas."],
] as const;

export function OnboardingForm({ code }: { code: string }) {
  const [mode, setMode] = useState<"criar" | "entrar">(code ? "entrar" : "criar");
  const [state, action, pending] = useActionState<OnbState, FormData>(onboard, undefined);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-brand text-lg font-bold text-white">A</div>
          <h1>Bem-vindo ao ALVVO Finance</h1>
          <p className="mt-1 text-sm text-ink/50">Crie a sua conta ou peça para entrar numa conta existente.</p>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-ink/5 p-1">
          {(["criar", "entrar"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-lg py-2 text-sm font-medium ${mode === m ? "bg-white shadow-sm" : "text-ink/50"}`}>
              {m === "criar" ? "Criar minha conta" : "Tenho um convite"}
            </button>
          ))}
        </div>
        <form action={action} className="card space-y-4">
          <input type="hidden" name="mode" value={mode} />
          <div><label className="label">Seu nome</label><input className="input" name="display_name" required placeholder="Nome e sobrenome" /></div>
          {mode === "criar" ? (
            <>
              <div><label className="label">Nome da conta</label><input className="input" name="household_name" placeholder="Ex.: Casa Silva" /></div>
              <div><label className="label">Comece com o modelo</label>
                <div className="space-y-2">{TEMPLATES.map(([v, l, d], i) => (
                  <label key={v} className="flex cursor-pointer gap-3 rounded-xl border border-ink/10 p-3 has-[:checked]:border-brand has-[:checked]:bg-brand/[0.05]">
                    <input type="radio" name="template" value={v} defaultChecked={i === 0} className="mt-1" />
                    <span><span className="block text-sm font-medium">{l}</span><span className="text-xs text-ink/55">{d}</span></span>
                  </label>
                ))}</div>
                <p className="mt-2 text-xs text-ink/45">É só um ponto de partida: você cria, renomeia e oculta categorias quando quiser.</p>
              </div>
            </>
          ) : (
            <>
              <div><label className="label">Código de convite</label><input className="input font-mono uppercase" name="code" required defaultValue={code} placeholder="EX.: 3F9A1C2B" /></div>
              <div><label className="label">Mensagem para o dono (opcional)</label><input className="input" name="message" placeholder="Ex.: sou a contadora do CNPJ" /></div>
              <p className="text-xs text-ink/50">O dono da conta precisa aprovar o seu pedido. Até lá, você não vê nenhum dado.</p>
            </>
          )}
          {state?.error && <p className="text-sm text-loss">{state.error}</p>}
          <button className="btn w-full" disabled={pending}>{pending ? "Aguarde…" : mode === "criar" ? "Criar conta" : "Pedir acesso"}</button>
        </form>
      </div>
    </main>
  );
}
