"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { marcarTourVisto } from "@/app/(app)/tutorial/actions";

interface Passo { alvo: string; titulo: string; texto: string }

/** Passos do tour do Início. Os que não existem na tela (por permissão ou tamanho de tela) são pulados. */
const PASSOS: Passo[] = [
  { alvo: "resumo", titulo: "O resumo do mês", texto: "Receitas, despesas, investimentos e a sobra do ciclo, com a comparação com o ciclo anterior." },
  { alvo: "ciclo", titulo: "O ciclo em andamento", texto: "O que já foi recebido e pago, o que ainda falta pagar pela agenda e o saldo previsto para o fim do ciclo." },
  { alvo: "pulso", titulo: "Pulso do mês", texto: "Quanto do orçamento já foi utilizado em comparação com quanto do mês já passou, e quanto ainda está disponível por dia." },
  { alvo: "proximos", titulo: "Próximos 7 dias", texto: "Contas, receitas e faturas da semana. Use o botão ✓ para marcar como paga ou recebida." },
  { alvo: "pendencias", titulo: "Pendências do mês", texto: "O que falta para manter o mês em dia: classificar lançamentos, importar faturas, definir o orçamento e outros." },
  { alvo: "atalhos", titulo: "Atalhos", texto: "Ferramentas de uso frequente, como o “Posso comprar?”. Você escolhe quais aparecem ou oculta a faixa." },
  { alvo: "noticias", titulo: "Notícias do dia para você", texto: "As principais notícias do dia, selecionadas pelo seu perfil e pela sua carteira." },
  { alvo: "lancar", titulo: "Lançar", texto: "Registre um gasto, importe uma fatura ou um extrato em PDF, cadastre uma conta a pagar ou avalie uma compra." },
  { alvo: "importar", titulo: "Importar faturas e extratos", texto: "Envie o PDF da fatura do cartão ou do extrato da conta: os lançamentos entram classificados." },
  { alvo: "barra", titulo: "Barra de navegação", texto: "As abas que você mais usa. O “Mais” abre o menu completo, e a barra pode ser personalizada." },
  { alvo: "menu", titulo: "Menu completo", texto: "Todas as áreas da plataforma, organizadas entre o dia a dia e o patrimônio." },
  { alvo: "privacidade", titulo: "Ocultar valores", texto: "Esconde os valores da tela, útil em locais públicos. Toque de novo para mostrar." },
  { alvo: "feedback", titulo: "Feedback", texto: "Envie sugestões, dúvidas ou problemas por texto, áudio ou print. Toda mensagem é lida pela equipe." },
  { alvo: "perfil", titulo: "Seu perfil", texto: "Perfil financeiro, personalização, instalação do app, membros da família, configurações e o tutorial completo." },
];

const visivel = (el: Element) => {
  const r = el.getBoundingClientRect(), st = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none" && r.right > 0 && r.left < window.innerWidth;
};
const achar = (alvo: string) => [...document.querySelectorAll(`[data-tour="${alvo}"]`)].find(visivel) ?? null;

export function openTour() { window.dispatchEvent(new Event("alvvo:tour")); }

export function Tour({ auto }: { auto: boolean }) {
  const path = usePathname(), router = useRouter();
  const [ativo, setAtivo] = useState(false);
  const [passos, setPassos] = useState<Passo[]>([]);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const iniciar = useCallback(() => {
    const lista = PASSOS.filter((p) => achar(p.alvo));
    if (!lista.length) return;
    setPassos(lista); setI(0); setAtivo(true);
  }, []);

  // Primeira visita ao Início: começa sozinho (uma única vez)
  useEffect(() => {
    if (!auto || path !== "/") return;
    const t = setTimeout(iniciar, 900);
    return () => clearTimeout(t);
  }, [auto, path, iniciar]);

  // Pedido manual (menu do perfil ou página "Como usar"): vai ao Início e começa
  useEffect(() => {
    const go = () => { if (path === "/") iniciar(); else { sessionStorage.setItem("alvvo.tour", "1"); router.push("/"); } };
    window.addEventListener("alvvo:tour", go);
    return () => window.removeEventListener("alvvo:tour", go);
  }, [path, iniciar, router]);
  useEffect(() => {
    if (path !== "/") return;
    try { if (sessionStorage.getItem("alvvo.tour")) { sessionStorage.removeItem("alvvo.tour"); setTimeout(iniciar, 700); } } catch { /* ok */ }
  }, [path, iniciar]);

  const passo = ativo ? passos[i] : null;
  useLayoutEffect(() => {
    if (!passo) return;
    const el = achar(passo.alvo);
    if (!el) { setRect(null); return; }
    const fixo = getComputedStyle(el).position === "fixed" || !!el.closest("[class*='sticky'], header");
    if (!fixo) el.scrollIntoView({ block: "center", behavior: "smooth" });
    const upd = () => setRect(el.getBoundingClientRect());
    upd();
    const t = setTimeout(upd, 420);
    window.addEventListener("resize", upd); window.addEventListener("scroll", upd, true);
    return () => { clearTimeout(t); window.removeEventListener("resize", upd); window.removeEventListener("scroll", upd, true); };
  }, [passo]);

  const fechar = useCallback(() => { setAtivo(false); setRect(null); marcarTourVisto().catch(() => undefined); }, []);
  useEffect(() => {
    if (!ativo) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); if (e.key === "ArrowRight") setI((x) => Math.min(passos.length - 1, x + 1)); if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1)); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [ativo, fechar, passos.length]);

  if (!ativo || !passo) return null;
  const vw = typeof window !== "undefined" ? window.innerWidth : 390, vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const pad = 8, r = rect;
  const W = Math.min(340, vw - 24);
  const abaixo = r ? r.bottom + 14 + 190 < vh || r.top < 220 : true;
  const pos: { top?: number; bottom?: number } = !r ? { top: vh / 2 - 100 } : abaixo ? { top: Math.min(vh - 210, r.bottom + 14) } : { bottom: Math.max(12, vh - r.top + 14) };
  const left = r ? Math.min(vw - W - 12, Math.max(12, r.left + r.width / 2 - W / 2)) : vw / 2 - W / 2;
  const ultimo = i === passos.length - 1;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Tour pela plataforma">
      {r ? (
        <div className="pointer-events-none absolute rounded-2xl transition-all duration-300 ease-out"
          style={{ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2, boxShadow: "0 0 0 2px #e2a64b, 0 0 0 9999px rgba(21,18,15,.62)" }} />
      ) : <div className="absolute inset-0 bg-[rgba(21,18,15,.62)]" />}
      <div className="absolute inset-0" onClick={fechar} />
      <div className="absolute rounded-[22px] p-5 text-[#f6efe2] shadow-2xl transition-all duration-300 ease-out" style={{ ...pos, left, width: W, minHeight: 170, background: "radial-gradient(90% 70% at 100% 0%, rgba(226,166,75,.42), rgba(226,166,75,0) 60%), linear-gradient(160deg, #2a211a, #15120f)" }}>
        <div className="flex items-center justify-between text-[11px] text-[#cfc3b0]">
          <span className="font-medium uppercase tracking-[0.18em] text-gold">Tour · {i + 1} de {passos.length}</span>
          <button onClick={fechar} className="hover:text-white">Pular tour</button>
        </div>
        <p className="mt-2 text-[17px] font-semibold leading-snug">{passo.titulo}</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#e7dccb]">{passo.texto}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex gap-1">{passos.map((_, k) => <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? "w-4 bg-gold" : "w-1.5 bg-white/25"}`} />)}</div>
          <div className="flex gap-2">
            {i > 0 && <button onClick={() => setI(i - 1)} className="rounded-full border border-white/20 px-3.5 py-1.5 text-[13px] font-medium hover:bg-white/5">Voltar</button>}
            <button onClick={() => (ultimo ? fechar() : setI(i + 1))} className="rounded-full bg-gold px-4 py-1.5 text-[13px] font-semibold text-espresso hover:brightness-105">{ultimo ? "Concluir" : "Próximo"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
