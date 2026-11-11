import Link from "next/link";
import type { MonthCell } from "@/lib/cards";

const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const k = (v: number) => (v >= 10000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }));

/** Faixa de meses com a curva da fatura (realizado contínuo, previsto tracejado). Cada mês é um link que seleciona a fatura. */
export function CardMonths({ months, selected, hrefFor, color }: { months: MonthCell[]; selected: string | null; hrefFor: (cycle: string) => string; color: string }) {
  if (!months.length) return null;
  const W = 100, H = 46, max = Math.max(1, ...months.map((m) => m.total)), min = Math.min(...months.map((m) => m.total));
  const y = (v: number) => 8 + (1 - (v - Math.min(0, min)) / (max - Math.min(0, min) || 1)) * (H - 16);
  const pts = months.map((m, i) => ({ x: i * W + W / 2, y: y(m.total), p: m.projected }));
  const curve = (arr: typeof pts) => arr.map((p, i) => {
    if (!i) return `M${p.x},${p.y}`;
    const a = arr[i - 1], c = (p.x - a.x) / 2;
    return `C${a.x + c},${a.y} ${p.x - c},${p.y} ${p.x},${p.y}`;
  }).join("");
  const real = pts.filter((p) => !p.p), proj = pts.filter((p, i) => p.p || pts[i + 1]?.p);
  const total = months.length * W;
  return (
    <div className="-mx-1 overflow-x-auto pb-1" dir="rtl">
      <div className="relative px-1" dir="ltr" style={{ minWidth: months.length * 64 }}>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
          {months.map((m) => {
            const on = m.cycle === selected;
            return (
              <Link key={m.cycle} href={hrefFor(m.cycle)} scroll={false}
                className={`flex h-[104px] flex-col items-center justify-between rounded-2xl px-1 pb-2 pt-2 text-center transition ${on ? "bg-white shadow-[0_6px_18px_-10px_rgba(40,30,20,.45)] ring-1 ring-ink/10" : "bg-ink/[0.035] hover:bg-ink/[0.06]"} ${m.projected ? "border border-dashed border-ink/15 !bg-transparent" : ""}`}>
                <span className={`text-[12px] ${on ? "font-semibold text-ink" : "text-ink/55"}`}>{MES[Number(m.cycle.slice(5, 7)) - 1]}{m.cycle.slice(0, 4) !== String(new Date().getFullYear()) ? `/${m.cycle.slice(2, 4)}` : ""}</span>
                <span className={`text-[11px] tabular-nums ${on ? "font-semibold text-ink" : "text-ink/60"}`}>{m.projected ? "≈ " : ""}{k(m.total)}</span>
              </Link>
            );
          })}
        </div>
        <svg viewBox={`0 0 ${total} ${H}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-x-1 top-[26px] h-[46px] w-[calc(100%-8px)]">
          <defs><linearGradient id={`cm-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".18" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
          {real.length > 1 && <path d={`${curve(real)}L${real[real.length - 1].x},${H}L${real[0].x},${H}Z`} fill={`url(#cm-${color.slice(1)})`} />}
          {real.length > 1 && <path d={curve(real)} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />}
          {proj.length > 1 && <path d={curve(proj)} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={1.4} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
        </svg>
        <div className="pointer-events-none absolute inset-x-1 top-[26px] grid h-[46px]" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))`, columnGap: 6 }}>
          {pts.map((p, i) => <span key={i} className="relative"><span className={`absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${months[i].cycle === selected ? "scale-125" : ""}`} style={{ top: `${(p.y / H) * 100}%`, background: p.p ? "#fffdf9" : color, outline: p.p ? `1.5px solid ${color}` : undefined }} /></span>)}
        </div>
      </div>
    </div>
  );
}
