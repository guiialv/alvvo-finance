"use client";

/*
 * Feedback do beta (mesmo modelo do alvvo health): texto, áudio de até 2 minutos e até 4 prints.
 * Os anexos vão para a pasta privada da pessoa no bucket "feedback"; os prints são redesenhados no aparelho
 * (tira localização e outros metadados da foto e reduz o tamanho). No computador, dá para colar o print (Ctrl+V).
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { sendFeedback, type Attachment } from "@/app/feedback/actions";
import { createClient } from "@/lib/supabase/client";

const KINDS: [string, string][] = [["problema", "Algo errado"], ["ideia", "Ideia"], ["duvida", "Dúvida"], ["elogio", "Elogio"]];
const MAX_IMG = 4, MAX_SEC = 120, MAX_SIDE = 1600;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
type Img = { blob: Blob; url: string };
type Aud = { blob: Blob; url: string; sec: number };

async function shrink(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    const g = cv.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise((ok) => cv.toBlob((b) => ok(b), "image/jpeg", 0.85));
  } finally { URL.revokeObjectURL(url); }
}

/** Abre o feedback de qualquer lugar (topo da tela, menu do perfil, Lançar). */
export const openFeedback = () => window.dispatchEvent(new Event("alvvo:feedback"));

/** Formulário de feedback (abre pelo ícone 💬 no topo): registra junto a tela em que a pessoa estava. */
export function FeedbackButton({ floating = false }: { floating?: boolean }) {
  const [open, setOpen] = useState(false), [kind, setKind] = useState("problema"), [msg, setMsg] = useState("");
  const [done, setDone] = useState<string | null>(null), [pending, start] = useTransition();
  const [imgs, setImgs] = useState<Img[]>([]), [audio, setAudio] = useState<Aud | null>(null);
  const [rec, setRec] = useState<{ t0: number } | null>(null), [tick, setTick] = useState(0);
  const recRef = useRef<{ mr: MediaRecorder; stream: MediaStream; timer: ReturnType<typeof setInterval>; t0: number } | null>(null);
  const path = usePathname(), sp = useSearchParams();
  const page = `${path}${sp?.toString() ? `?${sp}` : ""}`;

  const stopStream = () => { const r = recRef.current; if (r) { clearInterval(r.timer); r.stream.getTracks().forEach((t) => t.stop()); } recRef.current = null; setRec(null); };
  const reset = () => { stopStream(); imgs.forEach((x) => URL.revokeObjectURL(x.url)); if (audio) URL.revokeObjectURL(audio.url); setImgs([]); setAudio(null); setMsg(""); setDone(null); };
  const close = () => { reset(); setOpen(false); };

  async function startRec() {
    setDone(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return setDone("Este navegador não grava áudio. Escreva a mensagem ou envie um print.");
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return setDone("Sem acesso ao microfone. Libere o microfone para o alvvo nos ajustes do navegador ou do celular."); }
    const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
    const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined); const chunks: Blob[] = [];
    mr.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    const t0 = Date.now();
    mr.onstop = () => {
      const sec = (Date.now() - t0) / 1000; stopStream();
      const blob = new Blob(chunks, { type: (mr.mimeType || type || "audio/webm").split(";")[0] });
      if (blob.size && sec >= 1) setAudio({ blob, url: URL.createObjectURL(blob), sec }); else setDone("A gravação ficou curta demais. Tente de novo.");
    };
    mr.start(1000);
    recRef.current = { mr, stream, t0, timer: setInterval(() => { setTick((x) => x + 1); if ((Date.now() - t0) / 1000 >= MAX_SEC) mr.stop(); }, 500) };
    setRec({ t0 });
  }
  async function addImages(files: File[]) {
    const next = [...imgs];
    for (const f of files) {
      if (next.length >= MAX_IMG) { setDone(`Até ${MAX_IMG} prints por mensagem.`); break; }
      if (!/^image\//.test(f.type)) continue;
      try { const b = await shrink(f); if (b) next.push({ blob: b, url: URL.createObjectURL(b) }); } catch { setDone("Não consegui abrir essa imagem. Tente um print em PNG ou JPG."); }
    }
    setImgs(next);
  }
  useEffect(() => { const f = () => setOpen(true); addEventListener("alvvo:feedback", f); return () => removeEventListener("alvvo:feedback", f); }, []);
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => { const fs = [...(e.clipboardData?.files ?? [])].filter((f) => /^image\//.test(f.type)); if (fs.length) { e.preventDefault(); addImages(fs); } };
    addEventListener("paste", onPaste); return () => removeEventListener("paste", onPaste);
  }, [open, imgs]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => start(async () => {
    setDone(null);
    if (rec) return setDone("Pare a gravação antes de enviar.");
    if (msg.trim().length < 2 && !audio && !imgs.length) return setDone("Escreva uma mensagem, grave um áudio ou adicione um print.");
    try {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      const att: Attachment[] = [];
      const files = [...(audio ? [{ blob: audio.blob, kind: "audio" as const, sec: Math.round(audio.sec) }] : []), ...imgs.map((x) => ({ blob: x.blob, kind: "print" as const, sec: 0 }))];
      for (const f of files) {
        const ext = ({ "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/mpeg": "mp3", "image/jpeg": "jpg" } as Record<string, string>)[f.blob.type] || "bin";
        const path = `${user?.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await sb.storage.from("feedback").upload(path, f.blob, { contentType: f.blob.type, upsert: false });
        if (error) throw new Error("Não foi possível enviar o anexo. Tente de novo.");
        att.push({ path, tipo: f.kind, mime: f.blob.type, bytes: f.blob.size, ...(f.sec ? { segundos: f.sec } : {}) });
      }
      const r = await sendFeedback(kind, msg, page, att, `${navigator.userAgent.slice(0, 160)} · ${innerWidth}x${innerHeight}`);
      if (r.ok) { setDone("Obrigado! Recebemos o seu feedback."); setTimeout(close, 1600); }
      else setDone(r.error ?? "Erro");
    } catch (e) { setDone(e instanceof Error ? e.message : "Erro ao enviar."); }
  });

  void tick;
  const recSec = rec ? (Date.now() - rec.t0) / 1000 : 0;
  return (
    <>
      {floating && <button type="button" onClick={() => setOpen(true)} className="fixed bottom-4 right-4 z-40 rounded-full bg-espresso px-4 py-2.5 text-[13px] font-medium text-[#f6efe2] shadow-lg hover:bg-[#2a241f] print:hidden" style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }} aria-label="Enviar feedback">
        💬 Feedback
      </button>}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" onClick={close}>
          <div role="dialog" aria-label="Enviar feedback" className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between"><div><div className="text-[11px] font-semibold uppercase tracking-wider text-[#8f5e13]">Beta</div><h2>Conte o que achou</h2></div><button type="button" aria-label="Fechar" className="text-ink/40 hover:text-ink" onClick={close}>✕</button></div>
            <p className="mb-3 text-xs text-ink/50">Vai direto para quem está construindo o app.</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {KINDS.map(([k, l]) => <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full px-3 py-1.5 text-[13px] ${kind === k ? "bg-ink text-[#f6efe2]" : "border border-ink/15 text-ink/65"}`}>{l}</button>)}
            </div>
            <textarea className="input min-h-[110px]" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="O que você tentou fazer, o que aconteceu, o que esperava… Se preferir, grave um áudio." maxLength={4000} />

            <div className="mt-3">
              <div className="label">Áudio e prints <span className="font-normal text-ink/40">(opcional)</span></div>
              <div className="mt-1 flex flex-wrap gap-2">
                {!audio && <button type="button" onClick={() => (rec ? recRef.current?.mr.stop() : startRec())} className={`rounded-full px-3 py-1.5 text-[13px] ${rec ? "bg-loss text-white" : "border border-ink/15 text-ink/70"}`}>{rec ? "■ Parar gravação" : "🎙 Gravar áudio"}</button>}
                {imgs.length < MAX_IMG && <label className="cursor-pointer rounded-full border border-ink/15 px-3 py-1.5 text-[13px] text-ink/70">🖼 Adicionar print<input type="file" accept="image/*" multiple hidden onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; addImages(fs); }} /></label>}
              </div>
              <div className="mt-2 space-y-2">
                {rec && <div className="flex items-center gap-2 text-sm" role="status"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-loss" /><b className="tabular-nums">{mmss(recSec)}</b><span className="text-xs text-ink/50">Gravando · até 2 min</span></div>}
                {audio && <div className="flex items-center gap-2"><audio controls preload="metadata" src={audio.url} className="h-9 min-w-0 flex-1" /><span className="text-xs tabular-nums text-ink/50">{mmss(audio.sec)}</span><button type="button" aria-label="Apagar o áudio" className="text-ink/40 hover:text-loss" onClick={() => { URL.revokeObjectURL(audio.url); setAudio(null); }}>✕</button></div>}
                {imgs.length > 0 && <div className="flex flex-wrap gap-2">{imgs.map((x, i) => (
                  <div key={x.url} className="relative"><img src={x.url} alt={`Print ${i + 1}`} className="h-20 w-20 rounded-lg border border-ink/10 object-cover" />
                    <button type="button" aria-label={`Remover o print ${i + 1}`} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-[11px] text-white" onClick={() => { URL.revokeObjectURL(x.url); setImgs(imgs.filter((_, j) => j !== i)); }}>✕</button></div>
                ))}</div>}
              </div>
              <p className="mt-2 text-[11px] text-ink/45">Vai junto a tela em que você está ({path}). Áudios e prints vão só para a equipe do alvvo. Se o print mostrar valores, corte a imagem antes de enviar.</p>
            </div>
            {done && <p className={`mt-2 text-sm ${done.startsWith("Obrigado") ? "text-gain" : "text-loss"}`}>{done}</p>}
            <button type="button" className="btn mt-3 w-full" disabled={pending || !!rec} onClick={submit}>{pending ? "Enviando…" : "Enviar"}</button>
          </div>
        </div>
      )}
    </>
  );
}
