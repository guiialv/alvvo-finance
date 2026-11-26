"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { removeGoalPhoto, setGoalPhoto } from "@/app/(app)/objetivos/actions";

async function shrink(file: File, max = 1800): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    const g = cv.getContext("2d")!; g.drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise((ok) => cv.toBlob((b) => ok(b), "image/jpeg", 0.86));
  } finally { URL.revokeObjectURL(url); }
}

/** Capa do objetivo: a foto que a própria pessoa escolheu para representar aquele objetivo. */
export function GoalPhoto({ goalId, householdId, url, chip, edit }: { goalId: string; householdId: string; url: string | null; chip?: string | null; edit: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const src = preview ?? url;

  async function pick(f: File | undefined) {
    if (!f) return;
    setMsg(null);
    const blob = await shrink(f).catch(() => null);
    if (!blob) { setMsg("Não foi possível abrir esta imagem. Utilize uma foto em JPG ou PNG."); return; }
    setPreview(URL.createObjectURL(blob));
    start(async () => {
      const path = `${householdId}/${goalId}/${crypto.randomUUID()}.jpg`;
      const { error } = await createClient().storage.from("goals").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (error) { setPreview(null); setMsg("Não foi possível enviar a foto. Tente novamente."); return; }
      const r = await setGoalPhoto(goalId, path);
      if (r?.error) { setPreview(null); setMsg(r.error); }
    });
  }

  const file = <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />;

  if (!src) {
    if (!edit) return null;
    return (
      <div className="-mx-4 -mt-4 mb-4 sm:-mx-5 sm:-mt-5">
        {file}
        <button type="button" onClick={() => input.current?.click()} disabled={busy}
          className="flex h-16 w-full items-center justify-center gap-2 border-b border-dashed border-[#e2d8c6] bg-[linear-gradient(135deg,#faf4e8,#f1e6d2)] text-[13px] font-medium text-brand transition hover:brightness-[.98]">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white/70 text-base leading-none">+</span>
          {busy ? "Enviando a foto…" : "Adicionar uma foto deste objetivo"}
        </button>
        {msg && <p className="px-4 pt-2 text-xs text-loss sm:px-5">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="relative -mx-4 -mt-4 mb-4 h-44 overflow-hidden sm:-mx-5 sm:-mt-5 sm:h-52">
      {file}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className={`h-full w-full object-cover transition ${busy ? "opacity-70" : ""}`} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(21,18,15,0)_45%,rgba(21,18,15,.55))]" />
      {chip && <span className="absolute right-3 top-3 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">{chip}</span>}
      {edit && (
        <div className="absolute bottom-3 left-3 flex gap-2">
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="rounded-full bg-white/85 px-3 py-1 text-[11.5px] font-medium text-ink backdrop-blur hover:bg-white">{busy ? "Enviando…" : "Trocar foto"}</button>
          {!busy && url && <button type="button" onClick={() => start(async () => { setPreview(null); await removeGoalPhoto(goalId); })} className="rounded-full bg-black/35 px-3 py-1 text-[11.5px] font-medium text-white backdrop-blur hover:bg-black/50">Remover</button>}
        </div>
      )}
      {msg && <p className="absolute inset-x-3 top-3 rounded-lg bg-white/90 px-2 py-1 text-xs text-loss">{msg}</p>}
    </div>
  );
}
