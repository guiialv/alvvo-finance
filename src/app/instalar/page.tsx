import Link from "next/link";
import type { Metadata } from "next";
import { Wordmark } from "@/components/brand";
import { createClient } from "@/lib/supabase/server";
import { PhoneCard } from "@/components/pwa";
import { InstallTabs } from "./tabs";

export const metadata: Metadata = { title: "Instalar o app · alvvo finance" };

const Step = ({ n, title, children, mock }: { n: number; title: string; children: React.ReactNode; mock?: React.ReactNode }) => (
  <li className="flex gap-3">
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-[#f6efe2]">{n}</span>
    <div className="min-w-0 flex-1"><b>{title}</b><p className="mt-0.5 text-[13px] leading-relaxed text-ink/60">{children}</p>{mock && <div className="mt-2 overflow-hidden rounded-xl border border-ink/10 bg-white text-[13px]">{mock}</div>}</div>
  </li>
);
const Row = ({ hl, children }: { hl?: boolean; children: React.ReactNode }) => <div className={`border-b border-ink/5 px-3 py-2 last:border-0 ${hl ? "bg-[#e2a64b]/20 font-medium" : "text-ink/55"}`}>{children}</div>;
const Home = () => <div className="flex flex-col items-center gap-1 py-3"><img src="/apple-touch-icon.png" alt="" width={52} height={52} className="rounded-xl" /><span className="text-[11px]">alvvo</span></div>;

export default async function InstalarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const beta = (sp.beta ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const host = "alvvo-finance.vercel.app";

  return (
    <div className="min-h-screen bg-[#f4f1ea]">
      <header className="bg-espresso"><div className="mx-auto flex max-w-xl items-center justify-between px-5 py-4"><Wordmark size={24} /><span className="text-xs text-[#f4f1ea]/55">Instalar o app</span></div></header>
      <main className="mx-auto max-w-xl space-y-5 px-5 py-7">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8f5e13]">Beta fechado · Android e iPhone</div>
          <h1 className="mt-1 text-[30px] font-semibold leading-tight tracking-[-0.02em]">Leve o alvvo finance no celular</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink/65">O app instala direto deste site, sem loja: ganha ícone na tela inicial, abre em tela cheia e pode pedir Face ID ou digital para abrir. Leva menos de um minuto.</p>
        </div>

        {beta && !user && (
          <section className="card border-[#e2a64b]/50">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8f5e13]">Seu convite</div>
            <div className="mt-1 font-mono text-xl font-semibold tracking-widest">{beta}</div>
            <p className="mt-1 text-[13px] text-ink/60">Primeiro instale o app (passos abaixo). Depois, abra pelo ícone e crie sua conta: o código já vai preenchido.</p>
            <Link className="btn mt-3" href={`/login?beta=${encodeURIComponent(beta)}`}>Criar minha conta agora</Link>
          </section>
        )}

        <InstallTabs
          iphone={
            <ol className="space-y-5">
              <Step n={1} title="Abra no Safari" mock={<Row>{host}</Row>}>No iPhone, só o Safari instala apps de sites. Se abriu pelo WhatsApp ou pelo Chrome, toque em ⋯ e escolha <b>Abrir no Safari</b>.</Step>
              <Step n={2} title="Toque em Compartilhar" mock={<div className="flex justify-around px-3 py-2 text-ink/45"><span>‹</span><span>›</span><span className="rounded bg-[#e2a64b]/30 px-1.5 text-ink">⬆︎</span><span>▢</span><span>⧉</span></div>}>É o quadrado com a seta para cima, na barra de baixo do Safari.</Step>
              <Step n={3} title="Adicionar à Tela de Início" mock={<><Row>Copiar</Row><Row hl>＋ Adicionar à Tela de Início</Row><Row>Adicionar aos Favoritos</Row></>}>Role a lista e toque nessa opção. Depois, em <b>Adicionar</b>.</Step>
              <Step n={4} title="Abra pelo ícone" mock={<Home />}>Entre na conta e, em <b>Configurações › Neste celular</b>, ative o Face ID para abrir o app.</Step>
            </ol>
          }
          android={
            <ol className="space-y-5">
              <Step n={1} title="Abra no Chrome" mock={<Row>{host} <span className="float-right">⋮</span></Row>}>Funciona também no Edge e no Samsung Internet.</Step>
              <Step n={2} title="Toque no menu ⋮" mock={<><Row>Nova guia</Row><Row hl>📲 Instalar app</Row><Row>Compartilhar…</Row></>}>Os três pontinhos, no canto de cima.</Step>
              <Step n={3} title="Instalar">Confirme em <b>Instalar</b>. Em alguns celulares a opção se chama <b>Adicionar à tela inicial</b>.</Step>
              <Step n={4} title="Abra pelo ícone" mock={<Home />}>Entre na conta e, em <b>Configurações › Neste celular</b>, ative a digital para abrir o app.</Step>
            </ol>
          }
        />

        <section className="card">
          <h2>O que muda com o app instalado</h2>
          <ul className="mt-3 space-y-3 text-sm">
            {[["🔒", "Face ID ou digital", "Para abrir o app. A biometria fica no aparelho; o alvvo não a recebe."],
              ["⚡", "Atalhos", "Toque e segure o ícone: Lançar gasto, Agenda e Faturas direto."],
              ["📄", "Faturas e extratos", "Envie o PDF da fatura ou do extrato direto do celular, ou deixe o Open Finance trazer tudo sozinho."],
              ["🛡️", "Nada guardado no aparelho", "Os valores ficam só na sua conta protegida. Sem internet, o app mostra um aviso em vez dos dados."],
            ].map(([i, t, d]) => <li key={t} className="flex gap-3"><span aria-hidden>{i}</span><div><b>{t}</b><div className="text-[13px] text-ink/55">{d}</div></div></li>)}
          </ul>
        </section>

        {user ? <PhoneCard userId={user.id} /> : (
          <section className="card text-sm">
            <h2>Ainda não tem acesso?</h2>
            <p className="mt-1 text-[13px] text-ink/60">O alvvo finance está em <b>beta fechado</b>. Para criar uma família nova você precisa de um código de convite. Para entrar na família de alguém, peça o link de convite em <b>Membros e acessos</b>.</p>
            <div className="mt-3 flex flex-wrap gap-2"><Link className="btn" href="/login">Entrar</Link><Link className="btn-ghost" href="/login?criar=1">Tenho um convite</Link></div>
          </section>
        )}

        <p className="text-xs text-ink/45">Durante o teste, o alvvo finance não está na App Store nem na Google Play. Não instale apps com o nome alvvo de outras fontes. <Link className="underline" href="/privacidade">Privacidade</Link> · <Link className="underline" href="/termos">Termos</Link></p>
      </main>
    </div>
  );
}
