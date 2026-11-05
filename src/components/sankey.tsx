import type { FlowData, FlowNode } from "@/lib/flow";
import { formatBRL } from "@/lib/format";

/**
 * Diagrama de Sankey em SVG puro (renderizado no servidor).
 * Colunas alinhadas ao topo, faixas com curvas suaves e rótulos à esquerda das barras, como em extratos de private banking.
 */
const pctFmt = (v: number) => `${Math.round(v * 100)}%`;
const brl0 = (v: number) => formatBRL(v).replace(/,\d{2}$/, "");

interface Placed extends FlowNode { x: number; y: number; h: number; outY: number; inY: number }

export function Sankey({ data, width = 960, compact = false, caption }: { data: FlowData; width?: number; compact?: boolean; caption?: string }) {
  const cols = Math.max(...data.nodes.map((n) => n.col)) + 1;
  const byCol = Array.from({ length: cols }, (_, c) => data.nodes.filter((n) => n.col === c));
  const densest = Math.max(...byCol.map((c) => c.length));
  const gap = compact ? 8 : 10, nodeW = 9, top = caption ? 28 : 8, padX = 4;
  // Cada nó reserva altura mínima para o rótulo (duas linhas), sem distorcer a espessura das faixas
  const minSlot = compact ? 30 : 36;
  const base = Math.max(compact ? 280 : 360, densest * (compact ? 34 : 42));
  const colSum = byCol.map((c) => c.reduce((a, n) => a + n.value, 0));
  const k = Math.min(...byCol.map((c, i) => (base - top - 8 - (c.length - 1) * gap) / (colSum[i] || 1)));
  const colHeight = byCol.map((c) => c.reduce((a, n) => a + Math.max(n.value * k, minSlot), 0) + (c.length - 1) * gap);
  const H = Math.max(base, top + 8 + Math.max(...colHeight));
  const xOf = (c: number) => padX + (cols === 1 ? 0 : (c * (width - 2 * padX - nodeW)) / (cols - 1));

  const placed = new Map<string, Placed>();
  byCol.forEach((col, c) => {
    let y = top;
    for (const n of col) {
      const h = Math.max(2, n.value * k);
      placed.set(n.id, { ...n, x: xOf(c), y, h, outY: y, inY: y });
      y += Math.max(h, minSlot) + gap;
    }
  });

  // Faixas: ordenadas pela posição do destino (na saída) e da origem (na chegada)
  const links = data.links.map((l) => ({ ...l, s: placed.get(l.source)!, t: placed.get(l.target)!, w: Math.max(1, l.value * k) })).filter((l) => l.s && l.t);
  const paths: { d: string; color: string; title: string }[] = [];
  const outOrder = [...links].sort((a, b) => a.s.y - b.s.y || a.t.y - b.t.y);
  const sy = new Map<typeof links[number], number>();
  for (const l of outOrder) { sy.set(l, l.s.outY); l.s.outY += l.w; }
  const inOrder = [...links].sort((a, b) => a.t.y - b.t.y || a.s.y - b.s.y);
  for (const l of inOrder) {
    const y0 = sy.get(l)!, y1 = l.t.inY; l.t.inY += l.w;
    const x0 = l.s.x + nodeW, x1 = l.t.x, xm = (x0 + x1) / 2;
    paths.push({
      d: `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + l.w} C${xm},${y1 + l.w} ${xm},${y0 + l.w} ${x0},${y0 + l.w} Z`,
      color: l.t.id === "sobra" ? l.t.color : l.s.id === "deficit" ? l.s.color : l.t.color,
      title: `${l.s.label} → ${l.t.label}: ${formatBRL(l.value)}`,
    });
  }

  const total = data.total || 1;
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${width} ${H}`} className="h-auto w-full" role="img" aria-label="Para onde foi a renda">
        {caption && <text x={padX} y={14} className="fill-ink/45" style={{ fontSize: 11, letterSpacing: ".04em" }}>{caption}</text>}
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill={p.color} fillOpacity={0.16} className="transition-[fill-opacity] hover:[fill-opacity:.32]"><title>{p.title}</title></path>
        ))}
        {[...placed.values()].map((n) => {
          const first = n.col === 0 && cols > 1;
          const tx = first ? n.x + nodeW + 10 : n.x - 10, anchor = first ? "start" : "end";
          const two = true;
          const cy = n.y + Math.max(12, Math.min(n.h / 2, 26));
          const label = (
            <text x={tx} textAnchor={anchor} style={{ paintOrder: "stroke", stroke: "#fffdf9", strokeWidth: 4, strokeLinejoin: "round" }}>
              {two ? (<>
                <tspan x={tx} y={cy - 2} className="fill-ink" style={{ fontSize: 13 }}>{n.label}</tspan>
                <tspan x={tx} y={cy + 14} className="fill-ink/55" style={{ fontSize: 11.5 }}>{brl0(n.value)} · {pctFmt(n.value / total)}</tspan>
              </>) : <tspan y={cy + 4} className="fill-ink" style={{ fontSize: 12 }}>{n.label} <tspan className="fill-ink/55">· {pctFmt(n.value / total)}</tspan></tspan>}
            </text>
          );
          return (
            <g key={n.id}>
              <rect x={n.x} y={n.y} width={nodeW} height={n.h} rx={1.5} fill={n.color}><title>{`${n.label}: ${formatBRL(n.value)} (${pctFmt(n.value / total)})`}</title></rect>
              {n.href ? <a href={n.href}>{label}</a> : label}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
