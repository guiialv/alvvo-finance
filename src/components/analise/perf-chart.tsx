import type { Point } from "@/lib/performance";

/** Gráfico de desempenho acumulado (%), ativo × referências. SVG renderizado no servidor. */
export interface Series { label: string; color: string; points: Point[]; strong?: boolean }

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(Math.abs(v) < 0.1 ? 1 : 0).replace(".", ",")}%`;

export function PerfChart({ series, width = 860, height = 300 }: { series: Series[]; width?: number; height?: number }) {
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return <div className="grid h-40 place-items-center text-sm text-ink/40">Sem dados suficientes para o período.</div>;
  const padL = 46, padR = 58, padT = 14, padB = 26;
  const t = (d: string) => Date.parse(`${d}T12:00:00Z`);
  const t0 = Math.min(...all.map((p) => t(p.date))), t1 = Math.max(...all.map((p) => t(p.date)));
  let lo = Math.min(0, ...all.map((p) => p.v)), hi = Math.max(0, ...all.map((p) => p.v));
  const pad = (hi - lo) * 0.08 || 0.01; lo -= pad; hi += pad;
  const X = (d: string) => padL + ((t(d) - t0) / (t1 - t0 || 1)) * (width - padL - padR);
  const Y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (height - padT - padB);
  const span = hi - lo, stepRaw = span / 4, mag = 10 ** Math.floor(Math.log10(stepRaw)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= stepRaw) ?? stepRaw;
  const ticks: number[] = []; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  const days = (t1 - t0) / 86400000;
  const xticks = Array.from({ length: 6 }, (_, i) => t0 + ((t1 - t0) * i) / 5).map((ms) => { const d = new Date(ms); return { x: padL + ((ms - t0) / (t1 - t0 || 1)) * (width - padL - padR), l: days > 800 ? String(d.getUTCFullYear()) : `${MES[d.getUTCMonth()]}${days > 330 ? `/${String(d.getUTCFullYear()).slice(2)}` : ` ${d.getUTCDate()}`}` }; });
  // Rótulos finais sem sobreposição
  const ends = series.filter((s) => s.points.length).map((s) => ({ s, y: Y(s.points[s.points.length - 1].v), v: s.points[s.points.length - 1].v })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
  const path = (pts: Point[]) => {
    const step = Math.max(1, Math.floor(pts.length / 700));
    return pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p, i) => `${i ? "L" : "M"}${X(p.date).toFixed(1)},${Y(p.v).toFixed(1)}`).join("");
  };
  const main = series.find((s) => s.strong);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Desempenho no período">
      <defs><linearGradient id="perf-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={main?.color ?? "#7d5f36"} stopOpacity=".16" /><stop offset="1" stopColor={main?.color ?? "#7d5f36"} stopOpacity="0" /></linearGradient></defs>
      {ticks.map((v) => <g key={v}><line x1={padL} x2={width - padR} y1={Y(v)} y2={Y(v)} stroke="#1f1b17" strokeOpacity={Math.abs(v) < 1e-9 ? 0.18 : 0.05} strokeDasharray={Math.abs(v) < 1e-9 ? "" : "2 4"} />
        <text x={padL - 8} y={Y(v) + 3.5} textAnchor="end" className="fill-ink/35" style={{ fontSize: 10 }}>{pct(v)}</text></g>)}
      {xticks.map((x, i) => <text key={i} x={x.x} y={height - 6} textAnchor={i === 0 ? "start" : i === 5 ? "end" : "middle"} className="fill-ink/35" style={{ fontSize: 10 }}>{x.l}</text>)}
      {main && main.points.length > 1 && <path d={`${path(main.points)}L${X(main.points[main.points.length - 1].date)},${Y(Math.max(lo, Math.min(0, hi)))}L${X(main.points[0].date)},${Y(Math.max(lo, Math.min(0, hi)))}Z`} fill="url(#perf-fill)" />}
      {[...series].sort((a, b) => Number(!!a.strong) - Number(!!b.strong)).map((s) => s.points.length > 1 && (
        <path key={s.label} d={path(s.points)} fill="none" stroke={s.color} strokeWidth={s.strong ? 2 : 1.4} strokeOpacity={s.strong ? 1 : 0.85} strokeLinejoin="round"><title>{`${s.label}: ${pct(s.points[s.points.length - 1].v)}`}</title></path>
      ))}
      {ends.map(({ s, y, v }) => (
        <g key={s.label}><circle cx={X(s.points[s.points.length - 1].date)} cy={Y(v)} r={s.strong ? 3.5 : 2.5} fill={s.color} />
          <text x={width - padR + 6} y={y + 3.5} style={{ fontSize: 11, fontWeight: s.strong ? 600 : 500 }} fill={s.color} paintOrder="stroke" stroke="#fffdf9" strokeWidth={3}>{pct(v)}</text></g>
      ))}
    </svg>
  );
}
