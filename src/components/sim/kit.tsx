"use client";

import { useId, useMemo, useState } from "react";

export const brl = (v: number, digits = 0) => (isFinite(v) ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—");
export const compact = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 1e6) return `${s}R$ ${(a / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (a >= 1e3) return `${s}R$ ${(a / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `${s}R$ ${a.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
};
export const pct = (v: number, digits = 1) => (isFinite(v) ? `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%` : "—");
export const years = (months: number) => {
  const y = Math.floor(months / 12), m = months % 12;
  return [y ? `${y} ${y === 1 ? "ano" : "anos"}` : "", m ? `${m} ${m === 1 ? "mês" : "meses"}` : ""].filter(Boolean).join(" e ") || "0 meses";
};

/** Campo numérico com controle deslizante. `kind` define formato: dinheiro, % ao ano/mês, meses, anos. */
export function Field({ label, value, onChange, kind = "money", min = 0, max, step, hint }: {
  label: string; value: number; onChange: (v: number) => void; kind?: "money" | "pct" | "months" | "years" | "num"; min?: number; max: number; step?: number; hint?: React.ReactNode;
}) {
  const id = useId();
  const shown = kind === "pct" ? +(value * 100).toFixed(2) : Math.round(value * 100) / 100;
  const [text, setText] = useState<string | null>(null);
  const st = step ?? (kind === "pct" ? 0.0005 : kind === "money" ? Math.max(1, Math.round(max / 200)) : 1);
  const commit = (s: string) => {
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    if (isFinite(n)) onChange(kind === "pct" ? n / 100 : n);
    setText(null);
  };
  const suffix = kind === "pct" ? "%" : kind === "months" ? "meses" : kind === "years" ? "anos" : "";
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-[13px] text-ink/60">{label}{hint && <span className="text-[11px] text-ink/40">{hint}</span>}</label>
      <div className="flex items-center gap-2 rounded-xl border border-ink/10 bg-white px-3 focus-within:border-gold focus-within:ring-4 focus-within:ring-gold/15">
        {kind === "money" && <span className="text-sm text-ink/40">R$</span>}
        <input id={id} inputMode="decimal" className="min-w-0 flex-1 bg-transparent py-2 text-[15px] font-semibold tabular-nums outline-none"
          value={text ?? (kind === "money" ? shown.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : String(shown).replace(".", ","))}
          onChange={(e) => setText(e.target.value)} onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commit((e.target as HTMLInputElement).value); }} />
        {suffix && <span className="text-sm text-ink/40">{suffix}</span>}
      </div>
      <input aria-label={`${label} (controle deslizante)`} type="range" min={min} max={max} step={st} value={Math.min(max, Math.max(min, value))} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#7a5c32]" />
    </div>
  );
}

export function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-ink/60">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([k, l]) => (
          <button key={k} type="button" onClick={() => onChange(k)} className={`min-h-[36px] rounded-full px-3 text-[13px] font-medium transition ${value === k ? "bg-ink text-[#f6efe2]" : "border border-ink/12 bg-white text-ink/65 hover:border-ink/25"}`}>{l}</button>
        ))}
      </div>
    </div>
  );
}

export function Layout({ inputs, children }: { inputs: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-5">
      <aside className="card flex w-full flex-col gap-4 lg:sticky lg:top-4 lg:w-[340px] lg:shrink-0">{inputs}</aside>
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">{children}</div>
    </div>
  );
}

export function Answer({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <section className="rounded-[22px] bg-espresso px-6 py-5 text-[#f6efe2]">
      <div className="eyebrow !text-[#d9b77e]">Resposta</div>
      <p className="mt-2 text-[24px] font-light leading-snug tracking-[-0.02em] sm:text-[28px]">{children}</p>
      {sub && <p className="mt-2 text-sm leading-relaxed text-[#cfc3b0]">{sub}</p>}
    </section>
  );
}
export const Hi = ({ children, tone = "gold" }: { children: React.ReactNode; tone?: "gold" | "good" | "bad" }) => (
  <span className={tone === "good" ? "text-[#a9c79a]" : tone === "bad" ? "text-[#e59a85]" : "text-[#d9b77e]"}>{children}</span>
);

export interface Series { label: string; color: string; values: number[]; dashed?: boolean; area?: boolean }

/** Gráfico de linhas simples (SVG), com eixo em R$ compacto e marca opcional (ex.: ponto de equilíbrio). */
export function LineChart({ series, xLabel, marker, height = 260 }: { series: Series[]; xLabel: (i: number) => string; marker?: { index: number; label: string } | null; height?: number }) {
  const W = 760, H = height, P = { l: 84, r: 16, t: 14, b: 28 };
  const n = Math.max(...series.map((s) => s.values.length));
  const all = series.flatMap((s) => s.values).filter(isFinite);
  const lo = Math.min(0, ...all), hi = Math.max(1, ...all);
  const x = (i: number) => P.l + (i / Math.max(1, n - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo || 1)) * (H - P.t - P.b);
  const ticks = useMemo(() => { const t: number[] = []; for (let k = 0; k <= 4; k++) t.push(lo + ((hi - lo) * k) / 4); return t; }, [lo, hi]);
  const xt = useMemo(() => { const step = Math.max(1, Math.ceil((n - 1) / 6)); const t: number[] = []; for (let i = 0; i < n; i += step) t.push(i); if (t[t.length - 1] !== n - 1) t.push(n - 1); return t; }, [n]);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Gráfico da simulação ao longo do tempo"
        onMouseMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(n - 1, Math.round(((px - P.l) / (W - P.l - P.r)) * (n - 1))))); }}
        onMouseLeave={() => setHover(null)}>
        {ticks.map((t, k) => <g key={k}><line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="#1d1915" strokeOpacity={0.06} /><text x={P.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#6b6459">{compact(t)}</text></g>)}
        {lo < 0 && <line x1={P.l} x2={W - P.r} y1={y(0)} y2={y(0)} stroke="#1d1915" strokeOpacity={0.3} />}
        {xt.map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#6b6459">{xLabel(i)}</text>)}
        {series.map((s) => {
          const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
          return <g key={s.label}>
            {s.area && <path d={`${d}L${x(s.values.length - 1)},${y(lo)}L${x(0)},${y(lo)}Z`} fill={s.color} opacity={0.08} />}
            <path d={d} fill="none" stroke={s.color} strokeWidth={2.2} strokeDasharray={s.dashed ? "5 5" : undefined} />
          </g>;
        })}
        {marker && marker.index < n && <g><line x1={x(marker.index)} x2={x(marker.index)} y1={P.t} y2={H - P.b} stroke="#7a5c32" strokeDasharray="3 4" /><text x={x(marker.index) + 6} y={P.t + 12} fontSize="11" fill="#7a5c32">{marker.label}</text></g>}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="#1d1915" strokeOpacity={0.25} />}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink/60">
        {series.map((s) => <span key={s.label} className="inline-flex items-center gap-1.5"><span className="h-[3px] w-4 rounded" style={{ background: s.color }} />{s.label}{hover !== null && s.values[hover] !== undefined && <b className="tabular-nums text-ink/80">{compact(s.values[hover])}</b>}</span>)}
        {hover !== null && <span className="text-ink/40">· {xLabel(hover)}</span>}
      </div>
    </div>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] leading-relaxed text-ink/45">{children}</p>;
}
