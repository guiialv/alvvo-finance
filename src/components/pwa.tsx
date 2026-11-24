"use client";

/*
 * alvvo finance no celular (mesmo modelo do alvvo health): app instalável (PWA), aviso de instalação,
 * desbloqueio com Face ID / digital neste aparelho (WebAuthn de plataforma: a biometria fica no aparelho,
 * o alvvo nunca a recebe) e o cartão "Neste celular" em Configurações.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* ok */ } },
};
export function platform() {
  if (typeof navigator === "undefined") return { ios: false, android: false, mobile: false, standalone: false, iosOther: false };
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return { ios, android: /Android/.test(ua), mobile: ios || /Android|Mobi/.test(ua), standalone, iosOther: ios && /CriOS|FxiOS|EdgiOS|GSA|Instagram|FBAN|WhatsApp/.test(ua) };
}
const bioName = () => (platform().ios ? "Face ID ou Touch ID" : "digital, rosto ou PIN do aparelho");
export async function promptInstall() {
  if (!deferred) return false;
  await deferred.prompt();
  const r = await deferred.userChoice.catch(() => ({ outcome: "" }));
  deferred = null; emit();
  return r.outcome === "accepted";
}
function useInstallable() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set((x) => x + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  return !!deferred;
}

// ---------------------------------------------------------------- desbloqueio com biometria
const BIO = "alvvo.fin.bio";
const b64u = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const bioGet = (): { id: string; uid: string } | null => { try { return JSON.parse(ls.get(BIO) || "null"); } catch { return null; } };
export async function bioAvailable() {
  try { return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
}
async function bioEnable(uid: string) {
  const cred = (await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: "alvvo finance", id: location.hostname },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "alvvo finance", displayName: "Desbloqueio do alvvo finance" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
    timeout: 60000, attestation: "none",
  } })) as PublicKeyCredential;
  ls.set(BIO, JSON.stringify({ id: b64u(cred.rawId), uid }));
}
async function bioVerify() {
  const b = bioGet(); if (!b) return;
  await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: location.hostname, allowCredentials: [{ type: "public-key", id: unb64u(b.id) }], userVerification: "required", timeout: 60000 } });
}

/** Montado uma vez no app: registra o service worker, guarda o convite de instalação e cuida da tela de bloqueio. */
export function PwaBoot({ userId, signOut }: { userId: string; signOut: () => Promise<void> }) {
  const [locked, setLocked] = useState(false);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => null);
    const onPrompt = (e: Event) => { e.preventDefault(); deferred = e as BIPEvent; emit(); };
    const onInstalled = () => { deferred = null; ls.set("alvvo.fin.inst.x", "1"); emit(); };
    addEventListener("beforeinstallprompt", onPrompt); addEventListener("appinstalled", onInstalled);
    const on = () => bioGet()?.uid === userId;
    if (on()) setLocked(true);
    let hiddenAt = 0;
    const vis = () => { if (document.hidden) hiddenAt = Date.now(); else if (hiddenAt && Date.now() - hiddenAt > 60_000 && on()) setLocked(true); };
    document.addEventListener("visibilitychange", vis);
    return () => { removeEventListener("beforeinstallprompt", onPrompt); removeEventListener("appinstalled", onInstalled); document.removeEventListener("visibilitychange", vis); };
  }, [userId]);
  const unlock = async () => {
    setErr(false);
    try { await bioVerify(); setLocked(false); } catch { setErr(true); }
  };
  useEffect(() => { if (locked) { const t = setTimeout(unlock, 250); return () => clearTimeout(t); } }, [locked]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!locked) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="alvvo finance bloqueado" className="fixed inset-0 z-[100] grid place-items-center bg-espresso p-6 text-center text-[#f4f1ea]">
      <div className="max-w-xs">
        <BrandMark size={56} className="mx-auto" />
        <div className="mt-4 text-xl font-medium">alvvo finance bloqueado</div>
        <p className="mt-1 text-sm text-[#f4f1ea]/60">Use {bioName()} para ver seus dados.</p>
        <button type="button" onClick={unlock} className="mt-5 rounded-full bg-[#e2a64b] px-6 py-2.5 text-sm font-semibold text-espresso">Desbloquear</button>
        {err && <p className="mt-3 text-xs text-[#f0b4a8]">Não foi possível confirmar. Tente de novo ou saia e entre com a senha.</p>}
        <form action={signOut} className="mt-4"><button className="text-xs text-[#f4f1ea]/55 underline" onClick={() => ls.set(BIO, null)}>Sair e entrar com a senha</button></form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- instalar: passos curtos
function InstallHelp() {
  const can = useInstallable();
  const [p, setP] = useState<ReturnType<typeof platform> | null>(null);
  useEffect(() => setP(platform()), []);
  if (!p) return null;
  if (p.standalone) return <p className="text-xs text-gain">✓ Você está usando o alvvo finance instalado como app.</p>;
  if (can) return <button type="button" className="btn !px-4 !py-1.5 text-xs" onClick={() => promptInstall()}>Instalar o app</button>;
  if (p.ios) return p.iosOther
    ? <p className="text-xs text-ink/60">No iPhone, a instalação é feita pelo <b>Safari</b>. Abra este endereço no Safari e siga os passos.</p>
    : <ol className="list-decimal space-y-0.5 pl-4 text-xs text-ink/60"><li>Toque em <b>Compartilhar</b> ⬆︎ na barra do Safari.</li><li>Toque em <b>Adicionar à Tela de Início</b>.</li><li>Toque em <b>Adicionar</b>.</li></ol>;
  if (p.android) return <ol className="list-decimal space-y-0.5 pl-4 text-xs text-ink/60"><li>No Chrome, toque no menu <b>⋮</b>.</li><li>Toque em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>).</li><li>Confirme.</li></ol>;
  return <p className="text-xs text-ink/60">No computador, use o ícone de instalar na barra de endereço do Chrome ou do Edge. No celular, abra este endereço no Chrome (Android) ou no Safari (iPhone).</p>;
}

/** Aviso no início (só no celular, fora do app instalado): instalar com um toque ou ver como. */
export function InstallBanner() {
  const can = useInstallable();
  const [show, setShow] = useState(false);
  useEffect(() => { const p = platform(); setShow(p.mobile && !p.standalone && !ls.get("alvvo.fin.inst.x")); }, []);
  if (!show) return null;
  return (
    <section className="card mb-4 flex items-start gap-3">
      <span className="text-2xl" aria-hidden>📲</span>
      <div className="min-w-0 flex-1">
        <b className="text-sm">Instale o alvvo finance no celular</b>
        <p className="text-xs text-ink/55">Abre em tela cheia, com ícone próprio e desbloqueio com {bioName()}.</p>
        <div className="mt-2 flex items-center gap-3">
          {can ? <button type="button" className="btn !px-4 !py-1.5 text-xs" onClick={async () => { if (await promptInstall()) setShow(false); }}>Instalar</button>
            : <Link className="btn !px-4 !py-1.5 text-xs" href="/instalar">Como instalar</Link>}
          <button type="button" className="text-xs text-ink/50 underline" onClick={() => { ls.set("alvvo.fin.inst.x", "1"); setShow(false); }}>Agora não</button>
        </div>
      </div>
    </section>
  );
}

/** Configurações › Neste celular: instalar, desbloqueio com biometria e (em breve) avisos. */
export function PhoneCard({ userId }: { userId: string }) {
  const [bio, setBio] = useState<"?" | "sem" | "on" | "off">("?");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { bioAvailable().then((ok) => setBio(!ok ? "sem" : bioGet()?.uid === userId ? "on" : "off")); }, [userId]);
  const toggle = async (on: boolean) => {
    setMsg(null);
    if (on) { try { await bioEnable(userId); setBio("on"); setMsg("Desbloqueio ativado neste celular."); } catch { setMsg("Não foi possível ativar. Confira se o celular tem Face ID, digital ou PIN configurado."); } }
    else { ls.set(BIO, null); setBio("off"); setMsg("Desbloqueio desativado neste celular."); }
  };
  return (
    <section className="card">
      <h2>Neste celular</h2>
      <p className="mb-3 text-xs text-ink/50">Recursos de app para este aparelho. Cada celular tem os próprios ajustes.</p>
      <div className="space-y-4">
        <div className="flex gap-3"><span aria-hidden>📲</span><div className="min-w-0 flex-1 space-y-1.5"><b className="text-sm">Instalar como app</b><InstallHelp /><Link className="block text-xs text-brand" href="/instalar">Passo a passo completo</Link></div></div>
        <div className="flex gap-3"><span aria-hidden>🔒</span><div className="min-w-0 flex-1 space-y-1"><b className="text-sm">Desbloqueio com {bioName()}</b>
          {bio === "?" ? <p className="text-xs text-ink/50">Verificando…</p>
            : bio === "sem" ? <p className="text-xs text-ink/55">Este navegador não oferece desbloqueio biométrico. Instale o app ou use o Safari (iPhone) ou o Chrome (Android).</p>
            : <label className="flex items-start gap-2 text-xs text-ink/70"><input type="checkbox" className="mt-0.5" checked={bio === "on"} onChange={(e) => toggle(e.target.checked)} /><span>Pedir {bioName()} ao abrir o alvvo finance e ao voltar depois de 1 minuto. A biometria fica no aparelho; o alvvo não recebe sua digital nem seu rosto.</span></label>}
          {msg && <p className="text-xs text-ink/60">{msg}</p>}</div></div>
        <div className="flex gap-3"><span aria-hidden>🔔</span><div className="min-w-0 flex-1"><b className="text-sm">Avisos de vencimento</b><p className="text-xs text-ink/55">Em breve: lembrete das contas e faturas da agenda, sem mostrar valores na tela bloqueada.</p></div></div>
      </div>
    </section>
  );
}
