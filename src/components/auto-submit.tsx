"use client";

/** Select/radio que envia o formulário assim que muda. */
export function AutoSelect({ name, defaultValue, options, className = "rounded-lg border border-ink/10 bg-white px-2 py-1 text-xs" }: {
  name: string; defaultValue: string; options: readonly (readonly [string, string])[]; className?: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue} className={className} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  return <button type="button" className="btn-ghost flex-1 !py-1.5 text-xs" onClick={() => navigator.clipboard?.writeText(text)}>{label}</button>;
}

export function ConfirmButton({ children, message, className }: { children: React.ReactNode; message: string; className?: string }) {
  return <button className={className} onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>{children}</button>;
}
