"use client";

import { useEffect, useState } from "react";
import { platform, promptInstall } from "@/components/pwa";

/** Escolhe iPhone/Android pelo aparelho, mostra "já instalado" e o botão nativo quando o navegador oferece. */
export function InstallTabs({ iphone, android }: { iphone: React.ReactNode; android: React.ReactNode }) {
  const [tab, setTab] = useState<"iphone" | "android">("android");
  const [st, setSt] = useState<{ standalone: boolean; iosOther: boolean } | null>(null);
  const [can, setCan] = useState(false);
  useEffect(() => {
    const p = platform();
    setTab(location.hash === "#iphone" ? "iphone" : location.hash === "#android" ? "android" : p.ios ? "iphone" : "android");
    setSt({ standalone: p.standalone, iosOther: p.iosOther });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => null);
    const on = (e: Event) => { e.preventDefault(); (window as unknown as { __bip?: Event }).__bip = e; setCan(true); };
    addEventListener("beforeinstallprompt", on);
    return () => removeEventListener("beforeinstallprompt", on);
  }, []);
  const install = async () => {
    const e = (window as unknown as { __bip?: Event & { prompt: () => Promise<void> } }).__bip;
    if (e) { await e.prompt(); setCan(false); } else await promptInstall();
  };
  return (
    <>
      {st?.standalone && <div className="card text-sm"><b>✓ O alvvo finance já está instalado neste aparelho.</b> <a className="text-brand underline" href="/">Abrir</a></div>}
      {st?.iosOther && <div className="card text-sm"><b>Você está fora do Safari.</b> <span className="text-ink/60">Copie o endereço e abra no Safari para instalar.</span></div>}
      <div className="inline-flex rounded-full bg-ink/[0.06] p-1 text-sm" role="tablist" aria-label="Seu celular">
        {(["iphone", "android"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => { setTab(t); history.replaceState(null, "", `#${t}`); }}
            className={`rounded-full px-5 py-1.5 font-medium ${tab === t ? "bg-ink text-[#f6efe2]" : "text-ink/55"}`}>{t === "iphone" ? "iPhone" : "Android"}</button>
        ))}
      </div>
      {tab === "android" && can && <button type="button" className="btn w-full py-3" onClick={install}>Instalar o app agora</button>}
      {tab === "iphone" ? iphone : android}
    </>
  );
}
