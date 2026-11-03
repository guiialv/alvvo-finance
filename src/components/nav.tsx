"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";

const SECTIONS: { title: string; items: { href: string; label: string; icon: string; soon?: string }[] }[] = [
  { title: "Dia a dia", items: [
    { href: "/", label: "Visão geral", icon: "home" },
    { href: "/insights", label: "Insights", icon: "spark" },
    { href: "/agenda", label: "Agenda", icon: "calendar" },
    { href: "/orcamento", label: "Orçamento", icon: "pie" },
    { href: "/lancamentos", label: "Lançamentos", icon: "list" },
    { href: "/faturas", label: "Faturas do cartão", icon: "card" },
    { href: "/parcelamentos", label: "Parcelamentos", icon: "layers" },
    { href: "/pj", label: "PJ", icon: "building" },
  ] },
  { title: "Patrimônio", items: [
    { href: "/investimentos", label: "Investimentos", icon: "trend" },
    { href: "/objetivos", label: "Objetivos", icon: "target" },
    { href: "/analise", label: "Análise", icon: "candle" },
  ] },
  { title: "", items: [{ href: "/acessos", label: "Membros e acessos", icon: "users" }, { href: "/configuracoes", label: "Configurações", icon: "cog" }] },
];

/** `allowed`: hrefs liberados para quem está vendo; `badges`: contadores (ex.: pedidos pendentes). */
export function Nav({ allowed, badges = {} }: { allowed: string[]; badges?: Record<string, number> }) {
  const path = usePathname();
  const sections = SECTIONS.map((s) => ({ ...s, items: s.items.filter((it) => allowed.includes(it.href)) })).filter((s) => s.items.length);
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:gap-0 md:overflow-y-auto md:pb-0">
      {sections.map((s, i) => (
        <div key={i} className={`contents md:block ${s.title ? "" : "md:mt-auto"}`}>
          {s.title && <div className="hidden px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-white/30 md:block">{s.title}</div>}
          {s.items.map((it) => {
            const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
            return (
              <Link key={it.href} href={it.href}
                className={`relative flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${active ? "bg-white/10 font-medium text-white" : "text-white/55 hover:bg-white/5 hover:text-white"}`}>
                {active && <span className="absolute bottom-2 left-0 top-2 hidden w-0.5 rounded-full bg-teal-400 md:block" />}
                <Icon name={it.icon} className="h-[18px] w-[18px] shrink-0" />
                <span className="flex-1 whitespace-nowrap">{it.label}</span>
                {it.soon && <span className="hidden rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-white/40 md:inline">{it.soon}</span>}
                {badges[it.href] ? <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">{badges[it.href]}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
