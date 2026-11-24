"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark, Wordmark } from "./brand";
import { Icon } from "./icons";
import { Nav } from "./nav";
import { openFeedback } from "./feedback-button";
import { TAB_OPTIONS } from "@/lib/mobile-tabs";

const setCookie = (k: string, v: string) => { document.cookie = `${k}=${v}; path=/; max-age=31536000; samesite=lax`; };

/**
 * Moldura do app: menu lateral recolhível (desktop), gaveta com barra superior (celular),
 * troca Pessoal/Empresa, “ocultar valores” e atalhos.
 */
export function Shell({ children, allowed, badges, household, viewer, initialCollapsed, initialPrivacy, signOut, tabs = [], feedback = true }: {
  children: React.ReactNode; allowed: string[]; badges: Record<string, number>; household: string;
  viewer: { name: string; initials: string }; initialCollapsed: boolean; initialPrivacy: boolean; signOut: () => Promise<void>;
  tabs?: string[]; feedback?: boolean;
}) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [privacy, setPrivacy] = useState(initialPrivacy);
  const [open, setOpen] = useState(false);
  const [acct, setAcct] = useState(false);
  const [plus, setPlus] = useState(false);
  useEffect(() => { setOpen(false); setAcct(false); setPlus(false); }, [path]);
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; }, [open]);

  const toggleCollapse = () => setCollapsed((c) => { setCookie("alvvo_nav", c ? "full" : "min"); return !c; });
  const togglePrivacy = () => setPrivacy((p) => { setCookie("alvvo_priv", p ? "0" : "1"); return !p; });
  const hasPj = allowed.includes("/pj");
  const inPj = path.startsWith("/pj");

  const eye = (
    <button type="button" onClick={togglePrivacy} title={privacy ? "Mostrar valores" : "Ocultar valores"} aria-pressed={privacy}
      className="grid h-9 w-9 place-items-center rounded-full text-current/70 transition hover:bg-black/5">
      <Icon name={privacy ? "eyeoff" : "eye"} className="h-[18px] w-[18px]" />
    </button>
  );

  const fbBtn = feedback && (
    <button type="button" onClick={openFeedback} title="Enviar feedback" aria-label="Enviar feedback" className="grid h-9 w-9 place-items-center rounded-full text-current/70 transition hover:bg-black/5">
      <Icon name="chat" className="h-[18px] w-[18px]" />
    </button>
  );
  const avatarBtn = (
    <button type="button" onClick={() => setAcct((v) => !v)} aria-expanded={acct} aria-label="Perfil e conta" className="ml-0.5 grid h-8 w-8 place-items-center rounded-full border border-gold/50 text-[12px] font-semibold text-gold">{viewer.initials}</button>
  );
  const MenuItem = ({ href, icon, label, onClick }: { href?: string; icon: string; label: string; onClick?: () => void }) => href
    ? <Link href={href} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink/80 hover:bg-ink/[0.05]"><Icon name={icon} className="h-[18px] w-[18px] text-ink/50" />{label}</Link>
    : <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-ink/80 hover:bg-ink/[0.05]"><Icon name={icon} className="h-[18px] w-[18px] text-ink/50" />{label}</button>;
  const acctMenu = acct && (
    <>
      <div className="fixed inset-0 z-50" onClick={() => setAcct(false)} />
      <div role="menu" className="fixed right-3 top-14 z-50 w-72 rounded-2xl border border-ink/10 bg-surface p-2 text-ink shadow-xl md:right-8 md:top-12">
        <div className="flex items-center gap-3 px-3 pb-2 pt-1.5"><span className="grid h-9 w-9 place-items-center rounded-full bg-espresso text-sm font-semibold text-gold">{viewer.initials}</span>
          <div className="min-w-0"><div className="truncate text-sm font-medium">{viewer.name}</div><div className="truncate text-xs text-ink/45">{household}</div></div></div>
        <div className="my-1 h-px bg-ink/[0.06]" />
        {feedback && <MenuItem icon="chat" label="Enviar feedback (texto, áudio ou print)" onClick={() => { setAcct(false); openFeedback(); }} />}
        <MenuItem href="/menu" icon="grid" label="Personalizar a barra do celular" />
        <MenuItem href="/instalar" icon="phone" label="Instalar o app no celular" />
        {allowed.includes("/acessos") && <MenuItem href="/acessos" icon="users" label="Membros e acessos" />}
        {allowed.includes("/configuracoes") && <MenuItem href="/configuracoes" icon="cog" label="Configurações" />}
        <MenuItem href="/privacidade" icon="help" label="Privacidade e termos" />
        <div className="my-1 h-px bg-ink/[0.06]" />
        <form action={signOut}><button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-loss hover:bg-loss/5"><Icon name="logout" className="h-[18px] w-[18px]" />Sair</button></form>
      </div>
    </>
  );
  const tabItems = tabs.map((h) => TAB_OPTIONS.find(([x]) => x === h)).filter((x): x is [string, string, string] => !!x);
  const isActive = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  const Tab = ({ t }: { t: [string, string, string] }) => (
    <Link href={t[0]} className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] tracking-tight ${isActive(t[0]) ? "font-semibold text-gold" : "text-[#f4f1ea]/55"}`}>
      <Icon name={t[2]} className="h-[21px] w-[21px]" /><span className="max-w-full truncate">{t[1]}</span>
    </Link>
  );

  return (
    <div className={`min-h-screen md:flex ${privacy ? "privacy-on" : ""}`}>
      {/* Barra superior no celular: marca à esquerda; ocultar valores, feedback e perfil à direita */}
      <header className="sticky top-0 z-30 flex items-center gap-1 bg-espresso px-3 py-2.5 text-[#f4f1ea] md:hidden" style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}>
        <Link href="/" className="flex-1 pl-1"><Wordmark size={22} /></Link>
        <span className="flex items-center [&>button]:text-[#f4f1ea] [&>button:hover]:bg-white/10">{eye}{fbBtn}</span>
        {avatarBtn}
      </header>
      {acctMenu}

      {open && <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden" onClick={() => setOpen(false)} />}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-espresso text-[#f4f1ea] transition-[transform,width] duration-300 ease-out md:sticky md:top-0 md:z-auto md:h-screen md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"} ${collapsed ? "md:w-[76px]" : "md:w-64"}`}>
        <div className={`flex items-center gap-2 p-4 ${collapsed ? "md:justify-center md:px-2" : "md:p-5"}`}>
          <Link href="/" className="min-w-0 flex-1">
            {collapsed ? <><span className="hidden md:block"><BrandMark className="h-9 w-9" /></span><span className="md:hidden"><Wordmark size={26} /></span></> : <Wordmark size={26} />}
          </Link>
          <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10 md:hidden" aria-label="Fechar menu"><Icon name="x" className="h-4 w-4" /></button>
        </div>
        {!collapsed && <div className="-mt-2 truncate px-5 pb-3 text-[11px] uppercase tracking-[0.18em] text-[#f4f1ea]/45 max-md:px-4">{household}</div>}

        {hasPj && (
          <div className={`mx-3 mb-2 grid grid-cols-2 gap-1 rounded-full bg-white/[0.06] p-1 text-xs ${collapsed ? "md:hidden" : ""}`}>
            <Link href="/" className={`flex items-center justify-center gap-1.5 rounded-full py-1.5 transition ${!inPj ? "bg-[#f4f1ea] font-medium text-ink" : "text-[#f4f1ea]/60 hover:text-[#f6efe2]"}`}><Icon name="user" className="h-3.5 w-3.5" />Pessoal</Link>
            <Link href="/pj" className={`flex items-center justify-center gap-1.5 rounded-full py-1.5 transition ${inPj ? "bg-[#f4f1ea] font-medium text-ink" : "text-[#f4f1ea]/60 hover:text-[#f6efe2]"}`}><Icon name="building" className="h-3.5 w-3.5" />Empresa</Link>
          </div>
        )}

        <Link href="/menu" className="mx-3 mb-1 flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs text-[#f4f1ea]/50 hover:bg-white/[0.04] md:hidden"><Icon name="grid" className="h-4 w-4" />Personalizar a barra de baixo</Link>
        <Nav allowed={allowed} badges={badges} collapsed={collapsed} />

        <div className={`border-t border-white/[0.06] p-3 ${collapsed ? "md:px-2" : ""}`}>
          <button type="button" onClick={toggleCollapse} className="mb-2 hidden w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[#f4f1ea]/50 transition hover:bg-white/[0.04] hover:text-[#f6efe2] md:flex" title={collapsed ? "Expandir menu" : "Recolher menu"}>
            <Icon name={collapsed ? "right" : "left"} className="h-[18px] w-[18px] shrink-0" />{!collapsed && <span>Recolher menu</span>}
          </button>
          <div className={`flex items-center gap-3 px-1 ${collapsed ? "md:justify-center" : ""}`}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gold/40 text-sm font-medium text-gold">{viewer.initials}</span>
            <div className={`min-w-0 flex-1 text-sm ${collapsed ? "md:hidden" : ""}`}>
              <div className="truncate font-medium">{viewer.name}</div>
              <form action={signOut}><button className="text-xs text-white/40 hover:text-white">Sair</button></form>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {/* Barra de atalhos no desktop */}
        <div className="sticky top-0 z-20 hidden items-center justify-end gap-1 border-b border-ink/[0.05] bg-paper/80 px-12 py-2 backdrop-blur-md md:flex">
          {allowed.includes("/faturas") && <Link href="/faturas/importar" className="rounded-full px-3 py-1.5 text-sm text-ink/60 transition hover:bg-ink/[0.05] hover:text-ink">Importar faturas e extratos</Link>}
          {allowed.includes("/lancamentos") && <Link href="/lancamentos?novo=1" className="rounded-full px-3 py-1.5 text-sm text-ink/60 transition hover:bg-ink/[0.05] hover:text-ink">+ Lançamento</Link>}
          <span className="mx-1 h-5 w-px bg-ink/10" />
          {eye}{fbBtn}{avatarBtn}
        </div>
        <div className="px-4 pb-28 pt-6 md:px-12 md:py-8"><div className="mx-auto max-w-[1440px]">{children}</div></div>
      </main>

      {/* Barra de baixo no celular: 4 abas escolhidas pela pessoa, Lançar no meio e Mais (abre o menu completo) */}
      {tabItems.length > 0 && (
        <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-30 flex items-end border-t border-white/[0.06] bg-espresso px-1 md:hidden print:hidden" style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))" }}>
          {tabItems.slice(0, 2).map((t) => <Tab key={t[0]} t={t} />)}
          <button type="button" onClick={() => setPlus(true)} className="flex flex-1 flex-col items-center gap-0.5 pb-1.5 text-[10.5px] text-[#f4f1ea]/70" aria-label="Lançar">
            <span className="-mt-4 grid h-12 w-12 place-items-center rounded-full bg-gold text-espresso shadow-lg"><Icon name="plus" className="h-6 w-6" /></span>Lançar
          </button>
          {tabItems.slice(2, 4).map((t) => <Tab key={t[0]} t={t} />)}
          <button type="button" onClick={() => setOpen(true)} className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10.5px] ${tabItems.some((t) => isActive(t[0])) ? "text-[#f4f1ea]/55" : "font-semibold text-gold"}`}>
            <Icon name="dots" className="h-[21px] w-[21px]" /><span>Mais</span>
          </button>
        </nav>
      )}
      {plus && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:hidden" onClick={() => setPlus(false)}>
          <div className="w-full rounded-t-3xl bg-surface p-4 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/15" />
            <div className="space-y-1">
              {allowed.includes("/lancamentos") && <MenuItem href="/lancamentos?novo=1" icon="edit" label="Novo lançamento" />}
              {allowed.includes("/faturas") && <MenuItem href="/faturas/importar" icon="upload" label="Importar fatura ou extrato (PDF)" />}
              {allowed.includes("/agenda") && <MenuItem href="/agenda" icon="calendar" label="Conta a pagar ou a receber" />}
              {feedback && <MenuItem icon="chat" label="Enviar feedback" onClick={() => { setPlus(false); openFeedback(); }} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
