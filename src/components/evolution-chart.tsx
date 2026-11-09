import { formatBRL } from "@/lib/format";

/** Evolução do saldo dentro do ciclo: realizado (área) até hoje e projeção (tracejada) com o que ainda vence. */
export interface DayPoint { date: string; saldo: number; entrou: number; saiu: number; projected?: boolean }

export function EvolutionChart({ points, width = 720, height = 210 }: { points: DayPoint[]; width?: number; height?: number }) {
  if (points.length < 2) return <div className="grid h-40 place-items-center text-sm text-ink/40">Sem movimentações no ciclo.</div>;
  const padL = 52, padR = 12, padT = 12, padB = 24;
  const vals = points.map((p) => p.saldo);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const pad = (hi - lo) * 0.1 || 100; lo -= pad; hi += pad;
  const X = (i: number) => padL + (i / (points.length - 1)) * (width - padL - padR);
  const Y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (height - padT - padB);
  const real = points.map((p, i) => ({ ...p, i })).filter((p) => !p.projected);
  const proj = points.map((p, i) => ({ ...p, i })).filter((p, k, a) => p.projected || (k < a.length - 1 && a[k + 1].projected));
  const line = (arr: typeof real) => arr.map((p, k) => `${k ? "L" : "M"}${X(p.i).toFixed(1)},${Y(p.saldo).toFixed(1)}`).join("");
  const y0 = Y(0);
  const k = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : Math.round(v).toLocaleString("pt-BR"));
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const every = Math.max(1, Math.ceil(points.length / 8));
  const last = real[real.length - 1], end = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Evolução do saldo no ciclo">
      <defs>
        <linearGradient id="evo-pos" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7d5f36" stopOpacity=".22" /><stop offset="1" stopColor="#7d5f36" stopOpacity="0" /></linearGradient>
      </defs>
      {ticks.map((v, i) => <g key={i}><line x1={padL} x2={width - padR} y1={Y(v)} y2={Y(v)} stroke="#1f1b17" strokeOpacity=".05" strokeDasharray="2 4" />
        <text x={padL - 8} y={Y(v) + 3.5} textAnchor="end" className="fill-ink/35 money-t" style={{ fontSize: 10 }}>{k(v)}</text></g>)}
      <line x1={padL} x2={width - padR} y1={y0} y2={y0} stroke="#1f1b17" strokeOpacity=".15" />
      {real.length > 1 && <path d={`${line(real)}L${X(last.i)},${y0}L${X(real[0].i)},${y0}Z`} fill="url(#evo-pos)" />}
      {real.length > 1 && <path d={line(real)} fill="none" stroke="#7d5f36" strokeWidth={2} strokeLinejoin="round" />}
      {proj.length > 1 && <path d={line(proj)} fill="none" stroke="#7d5f36" strokeOpacity=".55" strokeWidth={1.6} strokeDasharray="4 4" />}
      {points.map((p, i) => ((i % every === 0 && points.length - 1 - i >= every * 0.6) || i === points.length - 1) && (
        <text key={p.date} x={X(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} className="fill-ink/35" style={{ fontSize: 10 }}>{p.date.slice(8, 10)}/{p.date.slice(5, 7)}</text>
      ))}
      {/* Faixas invisíveis com o resumo de cada dia ao passar o mouse */}
      {points.map((p, i) => (
        <rect key={`h${p.date}`} x={X(i) - (width - padL - padR) / points.length / 2} y={padT} width={(width - padL - padR) / points.length} height={height - padT - padB} fill="transparent" className="hover:fill-ink/[0.04]">
          <title>{`${p.date.slice(8, 10)}/${p.date.slice(5, 7)}${p.projected ? " (previsto)" : ""}\nEntradas: ${formatBRL(p.entrou)}\nSaídas: ${formatBRL(p.saiu)}\nSaldo: ${formatBRL(p.saldo)}`}</title>
        </rect>
      ))}
      {last && <circle cx={X(last.i)} cy={Y(last.saldo)} r={4} fill="#7d5f36" stroke="#fffdf9" strokeWidth={2} />}
      {end.projected && <circle cx={X(points.length - 1)} cy={Y(end.saldo)} r={3} fill="#fffdf9" stroke="#7d5f36" strokeWidth={1.5} />}
    </svg>
  );
}
