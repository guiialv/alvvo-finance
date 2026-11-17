"use client";

import { useState, useTransition } from "react";

/**
 * Select que envia o formulário assim que muda. Controlado: mostra na hora o valor escolhido
 * (o React reinicia formulários após uma action, então um select não controlado "voltava" ao valor antigo).
 * O valor visível só muda de novo quando o servidor devolve outro valor salvo.
 */
export function AutoSelect({ name, defaultValue, options, action, fields, className = "rounded-lg border border-ink/10 bg-white px-2 py-1 text-xs" }: {
  name: string; defaultValue: string; options: readonly (readonly [string, string])[]; className?: string;
  /** Server action chamada direto (sem formulário), com `fields` + o valor escolhido. */
  action?: (f: FormData) => Promise<void>; fields?: Record<string, string>;
}) {
  const [value, setValue] = useState(defaultValue);
  const [saved, setSaved] = useState(defaultValue);
  const [pending, startTransition] = useTransition();
  if (saved !== defaultValue) { setSaved(defaultValue); setValue(defaultValue); }
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
      <select name={name} value={value} disabled={pending} className={`min-w-0 max-w-full ${className} ${pending ? "opacity-60" : ""}`}
        onChange={(e) => {
          const v = e.currentTarget.value, form = e.currentTarget.form;
          setValue(v);
          if (action) {
            const fd = new FormData();
            for (const [k, val] of Object.entries(fields ?? {})) fd.set(k, val);
            fd.set(name, v);
            startTransition(async () => { try { await action(fd); } catch { setValue(saved); } });
          } else form?.requestSubmit();
        }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {pending && <span className="text-[10px] text-ink/40">salvando…</span>}
    </span>
  );
}

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  return <button type="button" className="btn-ghost flex-1 !py-1.5 text-xs" onClick={() => navigator.clipboard?.writeText(text)}>{label}</button>;
}

export function ConfirmButton({ children, message, className }: { children: React.ReactNode; message: string; className?: string }) {
  return <button className={className} onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>{children}</button>;
}
