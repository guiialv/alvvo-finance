import Link from "next/link";
import { currentCycle as cycleOfToday, cycleLabel, cycleRangeLabel, shiftCycle } from "@/lib/cycle";
import { formatBRL, formatPct } from "@/lib/format";
import { groupColor, MEMBER_COLORS } from "@/lib/theme";
import { Icon } from "./icons";

const MESES_L = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const cycleLong = (c: string) => `${MESES_L[Number(c.slice(5, 7)) - 1]} ${c.slice(0, 4)}`;

const qs = (params: Record<string, string | undefined>) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && sp.set(k, v));
  return sp.toString();
};

export function PageHeader({ title, subtitle, children }: { title: React.ReactNode; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-ink/55">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** Navegação entre ciclos preservando os demais parâmetros da URL. */
export function CycleNav({ cycle, startDay, basePath, params = {}, today }: {
  cycle: string; startDay: number; basePath: string; params?: Record<string, string | undefined>; today?: string;
}) {
  const href = (c: string) => `${basePath}?${qs({ ...params, ciclo: c })}`;
  const now = today ?? cycleOfToday(startDay);
  return (
    <div className="inline-flex items-center gap-2">
    {cycle !== now && <Link href={href(now)} className="btn-ghost !py-2">Hoje</Link>}
    <div className="inline-flex items-center rounded-xl border border-ink/10 bg-white shadow-sm">
      <Link className="grid h-10 w-9 place-items-center text-ink/50 hover:text-ink" href={href(shiftCycle(cycle, -1))} aria-label="Ciclo anterior"><Icon name="left" /></Link>
      <div className="min-w-[124px] border-x border-ink/5 px-3 py-1 text-center">
        <div className="text-sm font-semibold leading-tight">{cycleLong(cycle)}</div>
        <div className="text-[11px] text-ink/45">{cycleRangeLabel(cycle, startDay)}</div>
      </div>
      <Link className="grid h-10 w-9 place-items-center text-ink/50 hover:text-ink" href={href(shiftCycle(cycle, 1))} aria-label="Próximo ciclo"><Icon name="right" /></Link>
    </div>
    </div>
  );
}

export function YearNav({ year, basePath, params = {}, param = "ano" }: { year: number; basePath: string; params?: Record<string, string | undefined>; param?: string }) {
  const href = (y: number) => `${basePath}?${qs({ ...params, [param]: String(y) })}`;
  return (
    <div className="inline-flex items-center rounded-xl border border-ink/10 bg-white shadow-sm">
      <Link className="grid h-10 w-9 place-items-center text-ink/50" href={href(year - 1)}><Icon name="left" /></Link>
      <span className="px-3 font-semibold">{year}</span>
      <Link className="grid h-10 w-9 place-items-center text-ink/50" href={href(year + 1)}><Icon name="right" /></Link>
    </div>
  );
}

/** Abas segmentadas baseadas em links. */
export function Seg({ options, current, hrefFor }: { options: [string, string][]; current: string; hrefFor: (v: string) => string }) {
  return (
    <div className="inline-flex rounded-xl bg-ink/[0.05] p-1 text-sm">
      {options.map(([v, l]) => (
        <Link key={v} href={hrefFor(v)} className={`rounded-lg px-3 py-1.5 font-medium transition ${current === v ? "bg-white text-ink shadow-sm" : "text-ink/55 hover:text-ink"}`}>{l}</Link>
      ))}
    </div>
  );
}

export function ScopeTabs({ scope, basePath, params = {} }: { scope: string; basePath: string; params?: Record<string, string | undefined> }) {
  return <Seg options={[["pessoal", "Pessoal"], ["pj", "PJ"]]} current={scope} hrefFor={(s) => `${basePath}?${qs({ ...params, escopo: s })}`} />;
}

export function Kpi({ label, value, sub, accent = "#0f766e", tone }: { label: string; value: number; sub?: React.ReactNode; accent?: string; tone?: "auto" }) {
  return (
    <div className="card relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: accent }} />
      <div className="label">{label}</div>
      <div className={`mt-1 text-[26px] font-semibold tracking-tight tabular-nums ${tone === "auto" ? (value >= 0 ? "text-gain" : "text-loss") : ""}`}>{formatBRL(value)}</div>
      {sub && <div className="mt-1 text-xs text-ink/45">{sub}</div>}
    </div>
  );
}

export function Delta({ cur, prev, invert, prevLabel }: { cur: number; prev: number; invert?: boolean; prevLabel: string }) {
  if (!prev) return <span className="text-ink/40">sem ciclo anterior</span>;
  const d = (cur - prev) / Math.abs(prev);
  const good = invert ? d <= 0 : d >= 0;
  return (
    <span>
      <span className={`inline-flex items-center gap-0.5 font-medium ${good ? "text-emerald-700" : "text-rose-700"}`}><Icon name={d >= 0 ? "up" : "down"} className="h-3 w-3" />{formatPct(Math.abs(d))}</span>{" "}
      <span className="text-ink/40">vs. {prevLabel}</span>
    </span>
  );
}

export function Bar({ value, max, color = "#0f766e" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.06]"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></div>;
}

export function Empty({ children, icon = "spark" }: { children: React.ReactNode; icon?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-ink/15 px-6 py-10 text-center text-sm text-ink/50">
      <Icon name={icon} className="h-6 w-6 text-ink/30" />{children}
    </div>
  );
}

export function Pill({ cat }: { cat?: { name: string; grp: string; color?: string | null } | null }) {
  if (!cat || cat.grp === "A classificar") {
    return <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 ring-1 ring-orange-200"><span className="h-1.5 w-1.5 rounded-full bg-orange-500" />A classificar</span>;
  }
  const c = groupColor(cat.grp, cat.color);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: `${c}12`, color: c }}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c }} /><span className="truncate">{cat.name}</span>
    </span>
  );
}

export function GroupTag({ grp }: { grp: string }) {
  return <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: groupColor(grp) }}>{grp}</span>;
}

export function Avatar({ name, index = 0, size = "h-6 w-6 text-[10px]" }: { name?: string | null; index?: number; size?: string }) {
  if (!name) return null;
  return <span className={`inline-grid ${size} shrink-0 place-items-center rounded-full font-semibold text-white`} style={{ background: MEMBER_COLORS[index % MEMBER_COLORS.length] }} title={name}>{name[0]}</span>;
}

export function Donut({ parts, total, center }: { parts: { label: string; v: number; color: string }[]; total: number; center: [string, string] }) {
  const R = 52, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <svg viewBox="0 0 128 128" className="h-36 w-36 shrink-0">
      <circle cx="64" cy="64" r={R} fill="none" stroke="#0f1b2d0d" strokeWidth="14" />
      {parts.filter((p) => p.v > 0).map((p) => {
        const len = total ? (p.v / total) * C : 0;
        const el = <circle key={p.label} cx="64" cy="64" r={R} fill="none" stroke={p.color} strokeWidth="14" strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 64 64)"><title>{`${p.label}: ${formatBRL(p.v)}`}</title></circle>;
        off += len;
        return el;
      })}
      <text x="64" y="60" textAnchor="middle" fill="#0f1b2d73" style={{ fontSize: 9 }}>{center[0]}</text>
      <text x="64" y="76" textAnchor="middle" fill="#0f1b2d" style={{ fontSize: 14, fontWeight: 600 }}>{center[1]}</text>
    </svg>
  );
}

export function ComingSoon({ title, phase, items, icon }: { title: string; phase: string; items: string[]; icon: string }) {
  return (
    <div>
      <PageHeader title={title} subtitle={`Em construção — chega na ${phase}`} />
      <div className="card max-w-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand/10 text-brand"><Icon name={icon} className="h-5 w-5" /></div>
          <p className="text-sm text-ink/60">O que vai ter aqui:</p>
        </div>
        <ul className="space-y-2 text-sm">{items.map((i) => <li key={i} className="flex gap-2"><span className="mt-0.5 text-brand"><Icon name="check" /></span>{i}</li>)}</ul>
      </div>
    </div>
  );
}

export { cycleLabel };
