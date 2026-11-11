"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark, Wordmark } from "./brand";
import { Icon } from "./icons";
import { Nav } from "./nav";

const setCookie = (k: string, v: string) => { document.cookie = `${k}=${v}; path=/; max-age=31536000; samesite=lax`; };

/**
 * Moldura do app: menu lateral recolhível (desktop), gaveta com barra superior (celular),
 * troca Pessoal/Empresa, “ocultar valores” e atalhos.
 */
export function Shell({ children, allowed, badges, household, viewer, initialCollapsed, initialPrivacy, signOut }: {
  children: React.ReactNode; allowed: string[]; badges: Record<string, number>; household: string;
  viewer: { name: string; initials: string }; initialCollapsed: boolean; initialPrivacy: boolean; signOut: () => Promise<void>;
}) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [privacy, setPrivacy] = useState(initialPrivacy);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
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

  return (
    <div className={`min-h-screen md:flex ${privacy ? "privacy-on" : ""}`}>
      {/* Barra superior no celular */}
      <header className="sticky top-0 z-30 flex items-center gap-2 bg-espresso px-3 py-2.5 text-[#efe7da] md:hidden">
        <button type="button" onClick={() => setOpen(true)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" aria-label="Abrir menu"><Icon name="menu" className="h-5 w-5" /></button>
        <Link href="/" className="flex-1"><Wordmark markClass="h-6 w-6" className="scale-90 origin-left" /></Link>
        <span className="[&_button]:text-[#efe7da] [&_button:hover]:bg-white/10">{eye}</span>
      </header>

      {open && <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden" onClick={() => setOpen(false)} />}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-espresso text-[#efe7da] transition-[transform,width] duration-300 ease-out md:sticky md:top-0 md:z-auto md:h-screen md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"} ${collapsed ? "md:w-[76px]" : "md:w-64"}`}>
        <div className={`flex items-center gap-2 p-4 ${collapsed ? "md:justify-center md:px-2" : "md:p-5"}`}>
          <Link href="/" className="min-w-0 flex-1">
            {collapsed ? <><span className="hidden md:block"><BrandMark className="h-8 w-8" color="#d8bf8f" /></span><span className="md:hidden"><Wordmark markClass="h-8 w-8" /></span></> : <Wordmark markClass="h-8 w-8" />}
          </Link>
          <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10 md:hidden" aria-label="Fechar menu"><Icon name="x" className="h-4 w-4" /></button>
        </div>
        {!collapsed && <div className="-mt-2 truncate px-5 pb-3 text-[11px] uppercase tracking-[0.18em] text-[#efe7da]/45 max-md:px-4">{household}</div>}

        {hasPj && (
          <div className={`mx-3 mb-2 grid grid-cols-2 gap-1 rounded-full bg-white/[0.06] p-1 text-xs ${collapsed ? "md:hidden" : ""}`}>
            <Link href="/" className={`flex items-center justify-center gap-1.5 rounded-full py-1.5 transition ${!inPj ? "bg-[#f3eadb] font-medium text-ink" : "text-[#efe7da]/60 hover:text-[#f6efe2]"}`}><Icon name="user" className="h-3.5 w-3.5" />Pessoal</Link>
            <Link href="/pj" className={`flex items-center justify-center gap-1.5 rounded-full py-1.5 transition ${inPj ? "bg-[#f3eadb] font-medium text-ink" : "text-[#efe7da]/60 hover:text-[#f6efe2]"}`}><Icon name="building" className="h-3.5 w-3.5" />Empresa</Link>
          </div>
        )}

        <Nav allowed={allowed} badges={badges} collapsed={collapsed} />

        <div className={`border-t border-white/[0.06] p-3 ${collapsed ? "md:px-2" : ""}`}>
          <button type="button" onClick={toggleCollapse} className="mb-2 hidden w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[#efe7da]/50 transition hover:bg-white/[0.04] hover:text-[#f6efe2] md:flex" title={collapsed ? "Expandir menu" : "Recolher menu"}>
            <Icon name={collapsed ? "right" : "left"} className="h-[18px] w-[18px] shrink-0" />{!collapsed && <span>Recolher menu</span>}
          </button>
          <div className={`flex items-center gap-3 px-1 ${collapsed ? "md:justify-center" : ""}`}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gold/40 font-serif text-sm text-gold">{viewer.initials}</span>
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
          {eye}
        </div>
        <div className="px-4 py-6 md:px-12 md:py-8"><div className="mx-auto max-w-[1440px]">{children}</div></div>
      </main>
    </div>
  );
}
