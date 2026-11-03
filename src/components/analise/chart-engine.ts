// @ts-nocheck
/**
 * Motor do gráfico de análise (portado da prévia testada): gera o SVG como texto, trata clique e arraste
 * das ferramentas de desenho e as tendências automáticas. Usado só pelo componente cliente <AnalysisChart/>.
 */
import { sma, rsi, macd, bollinger, aggregate, performance, autoAnalysis, PERIODS } from "@/lib/technical";

const TA = { sma, rsi, macd, bollinger, aggregate, performance, autoAnalysis, PERIODS };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const brl = (v) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ico = () => `<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>`;
const seg = (opts, cur, action) => `<div class="inline-flex flex-wrap rounded-xl bg-ink/[0.05] p-1 text-sm">${opts.map(([v, l]) => `<button data-a="${action}" data-v="${v}" class="rounded-lg px-2.5 py-1 font-medium transition ${cur === v ? "bg-white text-ink shadow-sm" : "text-ink/55 hover:text-ink"}">${l}</button>`).join("")}</div>`;

let A = null, OPTS = null, ROOT = null;
const anState = () => A;
const MKT = { assets: new Proxy({}, { get: () => OPTS }) };
const PREFS = "alvvo-chart-prefs";
function update() { render(); persist(); }
function save() { persist(); }
let saveTimer = null;
function persist() {
  try { const { range, unit, ctype, log, bb, ma200, magnet } = A; localStorage.setItem(PREFS, JSON.stringify({ range, unit, ctype, log, bb, ma200, magnet })); } catch {}
  if (OPTS.readOnly) return;
  const json = JSON.stringify(A.draw[OPTS.ticker] ?? []);
  if (json === OPTS._lastSaved) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { OPTS._lastSaved = json; OPTS.onSave?.(JSON.parse(json)); }, 600);
}
const AN_RANGES = [["1M", "1M", 30], ["3M", "3M", 91], ["6M", "6M", 182], ["YTD", "No ano", 0], ["1A", "1A", 365], ["3A", "3A", 1095], ["5A", "5A", 1826], ["10A", "10A", 3652], ["MAX", "Máx", -1]];
const AN_UNIT_AUTO = { "1M": "D", "3M": "D", "6M": "D", YTD: "D", "1A": "D", "3A": "W", "5A": "W", "10A": "M", MAX: "M" };
/** Recorte do gráfico: período + intervalo dos candles (diário/semanal/mensal), com indicadores calculados antes do recorte. */
function viewSeries(t) {
  const A = anState(), full = OPTS.candles; if (!full?.length) return null;
  if (typeof A.range === "number") A.range = A.range <= 66 ? "3M" : A.range <= 130 ? "6M" : "1A";
  const rg = AN_RANGES.find((x) => x[0] === A.range) ?? AN_RANGES[2], lastD = full[full.length - 1].date;
  let unit = A.unit && A.unit !== "auto" ? A.unit : AN_UNIT_AUTO[rg[0]];
  let cut = full[0].date;
  if (rg[0] === "YTD") cut = lastD.slice(0, 4) + "-01-01"; else if (rg[2] > 0) { const d = new Date(lastD + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - rg[2]); cut = d.toISOString().slice(0, 10); }
  const count = full.filter((c) => c.date >= cut).length; let forced = null;
  if (unit === "D" && count > 1400) { unit = "W"; forced = "Período longo demais para candles diários: exibindo semanal."; }
  if (unit === "W" && count / 5 > 1400) { unit = "M"; forced = "Exibindo mensal para este período."; }
  const agg = unit === "D" ? full : TA.aggregate(full, unit), i0 = Math.max(0, agg.findIndex((c) => c.date >= cut));
  return { full, agg, i0, s: agg.slice(i0), unit, forced, range: rg, cut };
}
const UNIT_LBL = { D: "diário", W: "semanal", M: "mensal" };
const fmtPct = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2).replace(".", ",")}%`);
const perfColor = (v) => { if (v == null) return "color:#0f1b2d55"; const a = Math.min(1, Math.abs(v) / 0.5) * 0.28 + 0.04; return v >= 0 ? `background:rgba(21,128,61,${a});color:#14532d` : `background:rgba(225,29,72,${a});color:#881337`; };

// ---------- Ferramentas de desenho ----------
const AN_TOOLS = [
  { k: "cursor", ic: "↖", l: "Selecionar", pts: 0, tip: "Clique num desenho para selecionar; arraste para mover ou puxe as pontas para ajustar. Delete apaga." },
  { k: "trend", ic: "╱", l: "Linha de tendência", pts: 2, tip: "Clique e arraste ligando dois fundos (LTA, tendência de alta) ou dois topos (LTB, de baixa). Quanto mais toques a linha tiver, mais relevante." },
  { k: "ray", ic: "↗", l: "Raio", pts: 2, tip: "Como a linha de tendência, mas se estende para o futuro: mostra onde a tendência estará nos próximos candles." },
  { k: "ext", ic: "⟷", l: "Linha estendida", pts: 2, tip: "Linha infinita nos dois sentidos: útil para ver se uma antiga tendência ainda serve de suporte/resistência." },
  { k: "hline", ic: "—", l: "Horizontal", pts: 1, tip: "Clique na altura do preço para marcar suporte (onde as quedas param) ou resistência (onde as altas param)." },
  { k: "vline", ic: "│", l: "Vertical", pts: 1, tip: "Marque uma data importante (resultado, fato relevante, data-com) e veja a reação do preço." },
  { k: "channel", ic: "▱", l: "Canal paralelo", pts: 3, tip: "Arraste a linha principal (ex.: fundos) e depois mova o mouse até o extremo oposto e clique. O preço tende a oscilar dentro do canal; rompimentos indicam aceleração ou reversão." },
  { k: "fib", ic: "≡", l: "Retração de Fibonacci", pts: 2, tip: "Arraste do início ao fim de um movimento (fundo → topo numa alta). As retrações de 38,2%, 50% e 61,8% são regiões clássicas de correção e de entrada." },
  { k: "fibext", ic: "⋰", l: "Extensão de Fibonacci", pts: 3, tip: "Clique no início do movimento, no fim dele e no fundo da correção. Projeta alvos em 61,8%, 100% e 161,8% do movimento original." },
  { k: "pitch", ic: "⋔", l: "Tridente de Andrews", pts: 3, tip: "Clique num pivô e depois no topo e no fundo seguintes. A linha central costuma atrair o preço; as laterais funcionam como suporte e resistência." },
  { k: "rect", ic: "▭", l: "Zona", pts: 2, tip: "Arraste para marcar uma região de preço (zona de acumulação, gap, área de compra)." },
  { k: "measure", ic: "⇕", l: "Régua", pts: 2, tip: "Arraste entre dois pontos para medir a variação em %, em reais e o tempo decorrido." },
];
const DRAW_COLORS = ["#7c3aed", "#0369a1", "#d97706", "#0f1b2d"];
const FIB_R = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1], FIBEXT_R = [0, 0.618, 1, 1.618, 2.618];
let AN_GEO = null, AN_DRAG = null;

function anGeometry(t, vs) {
  const A = anState(), s = vs.s, n = s.length, W = 900, H = 340, P = 8, AX = 54, BOT = 18, fut = Math.max(3, Math.round(n * 0.08)), slots = n + fut, plotW = W - P - AX;
  const close = vs.agg.map((x) => x.close), bb = TA.bollinger(close), off = vs.i0;
  const bbu = bb.upper.slice(off), bbl = bb.lower.slice(off);
  const w = A.watch.find((x) => x.ticker === t) ?? {};
  const all = [Math.min(...s.map((x) => x.low)), Math.max(...s.map((x) => x.high)), ...(A.bb && !A.log ? [...bbu, ...bbl].filter(isFinite) : []), ...(w.buy ? [w.buy] : []), ...(w.sell ? [w.sell] : [])];
  const lo = Math.min(...all), hi = Math.max(...all), log = !!A.log;
  const pmin = log ? lo / 1.04 : lo - (hi - lo) * 0.04, pmax = log ? hi * 1.04 : hi + (hi - lo) * 0.04;
  const f = (p) => (log ? Math.log(Math.max(p, 1e-6)) : p), fi = (v) => (log ? Math.exp(v) : v);
  const top = P, bot = H - BOT, y = (p) => top + (1 - (f(p) - f(pmin)) / (f(pmax) - f(pmin))) * (bot - top), yInv = (py) => fi(f(pmin) + (1 - (py - top) / (bot - top)) * (f(pmax) - f(pmin)));
  const cwid = plotW / slots, x = (i) => P + (i + 0.5) * cwid, xInv = (px) => (px - P) / cwid - 0.5;
  const t0 = Date.parse(s[0].date), t1 = Date.parse(s[n - 1].date), avgMs = n > 1 ? (t1 - t0) / (n - 1) : 864e5;
  const idxOf = (d) => { const ms = Date.parse(d); if (ms > t1) return n - 1 + (ms - t1) / avgMs; if (ms < t0) return (ms - t0) / avgMs; let a = 0, b = n - 1; while (a < b) { const m = (a + b) >> 1; if (s[m].date < d) a = m + 1; else b = m; } return a; };
  const dateAt = (i) => { const k = Math.round(i); if (k >= 0 && k < n) return s[k].date; return new Date((k >= n ? t1 : t0) + (k >= n ? k - (n - 1) : k) * avgMs).toISOString().slice(0, 10); };
  return { t, vs, s, n, W, H, P, AX, BOT, top, bot, slots, plotW, cwid, x, xInv, y, yInv, f, fi, pmin, pmax, idxOf, dateAt, log, bbu, bbl, off, close, w, xr: W - AX };
}
/** Converte o ponteiro em ponto do gráfico {d, p}; com ímã, gruda no OHLC mais próximo do candle. */
function anPoint(e, G) {
  const svg = document.getElementById("an-chart"), b = svg.getBoundingClientRect();
  const px = ((e.clientX - b.left) / b.width) * G.W, py = ((e.clientY - b.top) / b.height) * G.H;
  let i = Math.round(G.xInv(px)), p = G.yInv(Math.min(G.bot, Math.max(G.top, py)));
  i = Math.max(-G.n, Math.min(G.slots - 1, i));
  if (anState().magnet && i >= 0 && i < G.n) { const c = G.s[i], opts = [c.open, c.high, c.low, c.close], best = opts.reduce((m, v) => (Math.abs(G.y(v) - py) < Math.abs(G.y(m) - py) ? v : m)); if (Math.abs(G.y(best) - py) < 18) p = best; }
  return { d: G.dateAt(i), p: Math.round(p * 100) / 100, px, py, i };
}
const fmtP = (p) => p.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Desenha um objeto. Pontos guardados como {d: data, p: preço} para valerem em qualquer período/intervalo. */
function drawShape(dr, G, opt = {}) {
  const col = dr.color ?? DRAW_COLORS[0], sw = opt.sel ? 2.2 : 1.5, dash = opt.dash ? `stroke-dasharray="${opt.dash}"` : "";
  const P = (pt) => ({ X: G.x(G.idxOf(pt.d)), Y: G.y(pt.p), i: G.idxOf(pt.d), v: G.f(pt.p) });
  const L = G.P, R = G.xr, hit = (inner) => opt.k == null ? inner : `<g data-dk="${opt.k}" style="cursor:${anState().tool === "cursor" ? "move" : "inherit"}">${inner}</g>`;
  const seg = (x1, y1, x2, y2, extra = "") => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="${sw}" ${dash} ${extra}/>` + (opt.k != null ? `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="transparent" stroke-width="12"/>` : "");
  const handles = (pts) => (opt.sel ? pts.map((pt, j) => `<circle data-dh="${opt.k}:${j}" cx="${P(pt).X}" cy="${P(pt).Y}" r="5" fill="#fff" stroke="${col}" stroke-width="2" style="cursor:grab"/>`).join("") : "");
  // reta por dois pontos em (índice, f(preço)) -> y em qualquer x
  const lineY = (a, b, xi) => { const A1 = P(a), B1 = P(b), m = (B1.v - A1.v) / (B1.i - A1.i || 1e-9); return G.y(G.fi(A1.v + m * (xi - A1.i))); };
  const xiL = G.xInv(L), xiR = G.xInv(R);
  const tag = (X, Y, txt, c = col, anchor = "start") => `<text x="${X}" y="${Y}" text-anchor="${anchor}" style="font-size:10px;font-weight:600;paint-order:stroke;stroke:#fff;stroke-width:3px" fill="${c}">${txt}</text>`;
  const { a, b, c } = dr;
  switch (dr.type) {
    case "h": case "hline": { const Y = G.y(dr.price ?? a.p); return hit(seg(L, Y, R, Y) + `<rect x="${R + 1}" y="${Y - 8}" width="${G.AX - 2}" height="16" rx="3" fill="${col}"/>` + `<text x="${R + 4}" y="${Y + 4}" style="font-size:10px;font-weight:600" fill="#fff">${fmtP(dr.price ?? a.p)}</text>` + (dr.label ? tag(L + 4, Y - 4, esc(dr.label)) : "") + (opt.sel && a ? handles([a]) : "")); }
    case "vline": { const X = P(a).X; return hit(seg(X, G.top, X, G.bot) + tag(X + 3, G.top + 10, dBR(a.d)) + handles([a])); }
    case "t": case "trend": { const A1 = P(a), B1 = P(b); return hit(seg(A1.X, A1.Y, B1.X, B1.Y) + (dr.label ? tag(B1.X + 4, B1.Y - 4, esc(dr.label)) : "") + handles([a, b])); }
    case "ray": { const A1 = P(a), dir = P(b).i >= A1.i ? xiR : xiL; return hit(seg(A1.X, A1.Y, G.x(dir), lineY(a, b, dir)) + (dr.label ? tag(G.x(dir) - 4, lineY(a, b, dir) - 5, esc(dr.label), col, "end") : "") + handles([a, b])); }
    case "ext": return hit(seg(L, lineY(a, b, xiL), R, lineY(a, b, xiR)) + handles([a, b]));
    case "channel": { if (!c) return drawShape({ ...dr, type: "trend" }, G, opt); const A1 = P(a), B1 = P(b), C1 = P(c), m = (B1.v - A1.v) / (B1.i - A1.i || 1e-9), dv = C1.v - (A1.v + m * (C1.i - A1.i));
      const yy = (xi, d0) => G.y(G.fi(A1.v + m * (xi - A1.i) + d0)), x1 = Math.min(A1.i, B1.i), x2 = dr.extend === false ? Math.max(A1.i, B1.i) : xiR;
      return hit(`<path d="M${G.x(x1)},${yy(x1, 0)} L${G.x(x2)},${yy(x2, 0)} L${G.x(x2)},${yy(x2, dv)} L${G.x(x1)},${yy(x1, dv)}Z" fill="${col}" fill-opacity=".06"/>` + seg(G.x(x1), yy(x1, 0), G.x(x2), yy(x2, 0)) + seg(G.x(x1), yy(x1, dv), G.x(x2), yy(x2, dv)) + `<line x1="${G.x(x1)}" y1="${yy(x1, dv / 2)}" x2="${G.x(x2)}" y2="${yy(x2, dv / 2)}" stroke="${col}" stroke-opacity=".45" stroke-dasharray="4 4"/>` + (dr.label ? tag(G.x(x1) + 4, yy(x1, dv) - 5, esc(dr.label)) : "") + handles([a, b, c])); }
    case "fib": { const A1 = P(a), B1 = P(b), x1 = Math.min(A1.X, B1.X), up = b.p >= a.p; const cols = ["#64748b", "#e11d48", "#d97706", "#15803d", "#0f766e", "#0369a1", "#64748b"];
      return hit(FIB_R.map((r, j) => { const pr = b.p - (b.p - a.p) * r, Y = G.y(pr), Yn = j < FIB_R.length - 1 ? G.y(b.p - (b.p - a.p) * FIB_R[j + 1]) : Y; return `${j < FIB_R.length - 1 ? `<rect x="${x1}" y="${Math.min(Y, Yn)}" width="${R - x1}" height="${Math.abs(Yn - Y)}" fill="${cols[j]}" fill-opacity=".06"/>` : ""}<line x1="${x1}" x2="${R}" y1="${Y}" y2="${Y}" stroke="${cols[j]}" stroke-width="${[0.382, 0.5, 0.618].includes(r) ? 1.4 : 0.9}"/>${tag(x1 + 3, Y - 3, `${(r * 100).toFixed(1).replace(".", ",")}% · ${fmtP(pr)}`, cols[j])}`; }).join("") + `<line x1="${A1.X}" y1="${A1.Y}" x2="${B1.X}" y2="${B1.Y}" stroke="${col}" stroke-dasharray="3 3" stroke-opacity=".6"/>` + (opt.k != null ? `<rect x="${x1}" y="${Math.min(A1.Y, B1.Y)}" width="${R - x1}" height="${Math.abs(A1.Y - B1.Y)}" fill="transparent"/>` : "") + handles([a, b]) + (dr.label ? tag(x1 + 3, Math.min(A1.Y, B1.Y) - 12, esc(dr.label), col) : "") + `<title>${up ? "Retração de uma alta" : "Retração de uma queda"}</title>`); }
    case "fibext": { if (!c) return drawShape({ ...dr, type: "trend" }, G, opt); const C1 = P(c), mv = b.p - a.p; const x1 = C1.X;
      return hit(`<polyline points="${P(a).X},${P(a).Y} ${P(b).X},${P(b).Y} ${C1.X},${C1.Y}" fill="none" stroke="${col}" stroke-dasharray="3 3" stroke-opacity=".6"/>` + FIBEXT_R.map((r) => { const pr = c.p + mv * r, Y = G.y(pr); return `<line x1="${x1}" x2="${R}" y1="${Y}" y2="${Y}" stroke="${col}" stroke-width="${r === 1 || r === 1.618 ? 1.4 : 0.9}"/>${tag(x1 + 3, Y - 3, `${(r * 100).toFixed(1).replace(".", ",")}% · ${fmtP(pr)}`)}`; }).join("") + (opt.k != null ? `<rect x="${x1}" y="${Math.min(G.y(c.p), G.y(c.p + mv * 2.618))}" width="${R - x1}" height="${Math.abs(G.y(c.p) - G.y(c.p + mv * 2.618))}" fill="transparent"/>` : "") + handles([a, b, c])); }
    case "pitch": { if (!c) return drawShape({ ...dr, type: "trend" }, G, opt); const A1 = P(a), B1 = P(b), C1 = P(c), Mi = (B1.i + C1.i) / 2, Mv = (B1.v + C1.v) / 2, m = (Mv - A1.v) / (Mi - A1.i || 1e-9);
      const ln = (i0, v0) => seg(G.x(i0), G.y(G.fi(v0)), R, G.y(G.fi(v0 + m * (xiR - i0))));
      return hit(ln(A1.i, A1.v) + ln(B1.i, B1.v) + ln(C1.i, C1.v) + `<line x1="${B1.X}" y1="${B1.Y}" x2="${C1.X}" y2="${C1.Y}" stroke="${col}" stroke-dasharray="3 3" stroke-opacity=".6"/>` + handles([a, b, c])); }
    case "rect": { const A1 = P(a), B1 = P(b); return hit(`<rect x="${Math.min(A1.X, B1.X)}" y="${Math.min(A1.Y, B1.Y)}" width="${Math.abs(B1.X - A1.X)}" height="${Math.abs(B1.Y - A1.Y)}" fill="${col}" fill-opacity=".12" stroke="${col}" stroke-width="${sw}"/>` + handles([a, b])); }
    case "measure": { const A1 = P(a), B1 = P(b), ch = b.p / a.p - 1, days = Math.round((Date.parse(b.d) - Date.parse(a.d)) / 864e5), cand = Math.round(B1.i - A1.i), cc = ch >= 0 ? "#15803d" : "#e11d48";
      const bx = Math.min(G.xr - 120, Math.max(G.P + 120, (A1.X + B1.X) / 2)), by0 = Math.min(A1.Y, B1.Y) - 26, by = by0 < G.top ? Math.max(A1.Y, B1.Y) + 4 : by0;
      return hit(`<rect x="${Math.min(A1.X, B1.X)}" y="${Math.min(A1.Y, B1.Y)}" width="${Math.abs(B1.X - A1.X)}" height="${Math.abs(B1.Y - A1.Y)}" fill="${cc}" fill-opacity=".1"/><line x1="${bx}" y1="${A1.Y}" x2="${bx}" y2="${B1.Y}" stroke="${cc}" marker-end="url(#arr)"/>` +
        (() => { const txt = `${fmtPct(ch)} · ${brl(b.p - a.p)} · ${Math.abs(days)} dias (${Math.abs(cand)} candles)`, wd = txt.length * 6 + 14; return `<rect x="${bx - wd / 2}" y="${by}" width="${wd}" height="22" rx="5" fill="${cc}"/><text x="${bx}" y="${by + 15}" text-anchor="middle" style="font-size:10.5px;font-weight:600" fill="#fff">${txt}</text>`; })() + handles([a, b])); }
  }
  return "";
}
/** Camada de desenhos + linhas automáticas + rascunho, redesenhada sem recarregar a página durante o arraste. */
function anOverlay(G) {
  const A = anState(), draws = A.draw[G.t] ?? [];
  let h = "";
  if (A.auto?.[G.t]) { const au = anAutoLines(G); h += au.map((dr) => drawShape(dr, G, { dash: dr.dash })).join(""); }
  h += draws.map((dr, k) => drawShape(dr, G, { k, sel: A.selDraw === k })).join("");
  if (AN_DRAG?.draft) h += drawShape(AN_DRAG.draft, G, { sel: true, k: -1 });
  return h;
}
function anRefreshOverlay() { const g = document.getElementById("an-ov"); if (g && AN_GEO) g.innerHTML = anOverlay(AN_GEO); }

// ---------- Tendências automáticas ----------
const AUTO_STYLE = { lta: ["#15803d", ""], ltb: ["#e11d48", ""], canal: ["#64748b", "5 4"], suporte: ["#15803d", "2 4"], resistencia: ["#e11d48", "2 4"] };
function anAuto(G) { const key = G.t + "|" + G.vs.range[0] + "|" + G.vs.unit + "|" + G.n; if (anAuto.k !== key) { anAuto.k = key; anAuto.v = TA.autoAnalysis(G.s); } return anAuto.v; }
function anAutoLines(G) {
  const au = anAuto(G), d = (i) => G.dateAt(i), out = [];
  for (const l of au.lines) {
    const [color, dash] = AUTO_STYLE[l.kind] ?? ["#0f1b2d", ""];
    if (l.kind === "suporte" || l.kind === "resistencia") out.push({ type: "hline", price: l.a.p, color, dash, label: l.label });
    else out.push({ type: "ray", a: { d: d(l.a.i), p: l.a.p }, b: { d: d(l.b.i), p: l.b.p }, color, dash, label: l.label });
  }
  if (au.fibo) out.push({ type: "fib", a: { d: d(au.fibo.from.i), p: au.fibo.from.p }, b: { d: d(au.fibo.to.i), p: au.fibo.to.p }, color: "#d97706", label: "Fibonacci do último movimento" });
  return out;
}

const MES_C = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function anReadout(G, i) {
  const c = G.s[Math.max(0, Math.min(G.n - 1, i))], pv = G.s[Math.max(0, Math.min(G.n - 1, i) - 1)], ch = pv ? c.close / pv.close - 1 : 0;
  return `<b>${dBR(c.date)}</b>${G.vs.unit !== "D" ? ` <span class="text-ink/40">(${UNIT_LBL[G.vs.unit]})</span>` : ""} · A <b>${fmtP(c.open)}</b> · M <b>${fmtP(c.high)}</b> · m <b>${fmtP(c.low)}</b> · F <b>${fmtP(c.close)}</b> <span class="${ch >= 0 ? "text-emerald-700" : "text-rose-700"}">${fmtPct(ch)}</span>`;
}
/** Card do gráfico: períodos até "desde o início", intervalo, escala log, ferramentas de desenho e tendências automáticas. */
function anChartSection(t, r) {
  const A = anState(), vs = viewSeries(t), G = anGeometry(t, vs); AN_GEO = G;
  const { s, n, W, H, P, x, y, top, bot, xr } = G;
  const close = G.close, off = G.off, sl = (arr) => arr.slice(off);
  const s20 = sl(TA.sma(close, 20)), s50 = sl(TA.sma(close, 50)), s200 = sl(TA.sma(close, 200)), rs = sl(TA.rsi(close)), md = TA.macd(close), mh = sl(md.hist), ml = sl(md.line), msg = sl(md.signal);
  const ctype = A.ctype && A.ctype !== "auto" ? A.ctype : n > 320 ? "line" : "candle", cw = Math.max(1, G.cwid * 0.65);
  const path = (arr) => arr.map((v, i) => (isFinite(v) ? `${i && isFinite(arr[i - 1]) ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}` : "")).join("");
  const grid = Array.from({ length: 6 }, (_, k) => G.fi(G.f(G.pmin) + ((G.f(G.pmax) - G.f(G.pmin)) * (k + 0.5)) / 6));
  const span = Date.parse(s[n - 1].date) - Date.parse(s[0].date), ticks = [];
  for (let k = 0; k < 7; k++) { const i = Math.round((k * (n - 1)) / 6), d = s[i].date, lab = span > 2 * 365 * 864e5 ? (vs.unit === "M" && span > 8 * 365 * 864e5 ? d.slice(0, 4) : `${MES_C[+d.slice(5, 7) - 1]}/${d.slice(2, 4)}`) : `${d.slice(8, 10)}/${MES_C[+d.slice(5, 7) - 1]}`; ticks.push([i, lab]); }
  const target = (p, c, l) => (p ? `<line x1="${P}" x2="${xr}" y1="${y(p)}" y2="${y(p)}" stroke="${c}" stroke-dasharray="5 4"/><text x="${P + 4}" y="${y(p) - 4 < top + 10 ? y(p) + 12 : y(p) - 4}" style="font-size:10px;font-weight:600;paint-order:stroke;stroke:#fff;stroke-width:3px" fill="${c}">${l} ${fmtP(p)}</text>` : "");
  const lastC = s[n - 1];
  const tool = A.tool ?? "cursor", tdef = AN_TOOLS.find((x) => x.k === tool);
  const price = ctype === "candle"
    ? s.map((c, i) => { const up = c.close >= c.open, col = up ? "#15803d" : "#e11d48"; return `<line x1="${x(i)}" x2="${x(i)}" y1="${y(c.high)}" y2="${y(c.low)}" stroke="${col}"/><rect x="${x(i) - cw / 2}" y="${y(Math.max(c.open, c.close))}" width="${cw}" height="${Math.max(1, Math.abs(y(c.open) - y(c.close)))}" fill="${col}"/>`; }).join("")
    : `<path d="${path(s.map((c) => c.close))} L${x(n - 1)},${bot} L${x(0)},${bot}Z" fill="url(#an-grad)"/><path d="${path(s.map((c) => c.close))}" fill="none" stroke="#0f766e" stroke-width="1.6"/>`;
  const svg = `<svg id="an-chart" viewBox="0 0 ${W} ${H}" class="w-full touch-none select-none" style="cursor:${tool === "cursor" ? "default" : "crosshair"}">
    <defs><clipPath id="an-clip"><rect x="${P}" y="${top}" width="${xr - P}" height="${bot - top}"/></clipPath><linearGradient id="an-grad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0f766e" stop-opacity=".18"/><stop offset="1" stop-color="#0f766e" stop-opacity="0"/></linearGradient><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="context-stroke"/></marker></defs>
    <rect x="${P}" y="${top}" width="${xr - P}" height="${bot - top}" fill="transparent"/>
    ${grid.map((g) => `<line x1="${P}" x2="${xr}" y1="${y(g)}" y2="${y(g)}" stroke="#0f1b2d" stroke-opacity=".06"/><text x="${xr + 4}" y="${y(g) + 4}" style="font-size:10px" fill="#0f1b2d80">${fmtP(g)}</text>`).join("")}
    ${ticks.map(([i, l]) => `<line x1="${x(i)}" x2="${x(i)}" y1="${top}" y2="${bot}" stroke="#0f1b2d" stroke-opacity=".04"/><text x="${x(i)}" y="${H - 5}" text-anchor="middle" style="font-size:10px" fill="#0f1b2d80">${l}</text>`).join("")}
    <line x1="${x(n - 1) + G.cwid / 2}" x2="${x(n - 1) + G.cwid / 2}" y1="${top}" y2="${bot}" stroke="#0f1b2d" stroke-opacity=".12" stroke-dasharray="2 3"/>
    <g clip-path="url(#an-clip)">
    ${A.bb ? `<path d="${path(G.bbu)}" fill="none" stroke="#0369a1" stroke-opacity=".35"/><path d="${path(G.bbl)}" fill="none" stroke="#0369a1" stroke-opacity=".35"/>` : ""}
    ${price}
    <path d="${path(s20)}" fill="none" stroke="#d97706" stroke-width="1.3"/><path d="${path(s50)}" fill="none" stroke="#4f46e5" stroke-width="1.3"/>${A.ma200 ? `<path d="${path(s200)}" fill="none" stroke="#be185d" stroke-width="1.3"/>` : ""}
    ${target(G.w.buy, "#15803d", "meu alvo compra")}${target(G.w.sell, "#be123c", "meu alvo venda")}
    <g id="an-ov">${anOverlay(G)}</g></g>
    <rect x="${xr + 1}" y="${y(lastC.close) - 8}" width="${G.AX - 2}" height="16" rx="3" fill="#0f766e"/><text x="${xr + 4}" y="${y(lastC.close) + 4}" style="font-size:10px;font-weight:600" fill="#fff">${fmtP(lastC.close)}</text>
    <g id="an-cross" pointer-events="none"></g></svg>`;
  const sub = (arr, h, lo2, hi2, color, refs = []) => { const yy = (v) => 4 + (1 - (v - lo2) / (hi2 - lo2)) * (h - 8); return `<svg viewBox="0 0 ${W} ${h}" class="w-full">${refs.map(([v, c]) => `<line x1="${P}" x2="${xr}" y1="${yy(v)}" y2="${yy(v)}" stroke="${c}" stroke-dasharray="3 3" stroke-opacity=".5"/><text x="${xr + 4}" y="${yy(v) + 3}" style="font-size:9px" fill="#0f1b2d80">${v}</text>`).join("")}<path d="${arr.map((v, i) => (isFinite(v) ? `${i && isFinite(arr[i - 1]) ? "L" : "M"}${x(i).toFixed(1)},${yy(v).toFixed(1)}` : "")).join("")}" fill="none" stroke="${color}" stroke-width="1.3"/></svg>`; };
  const mmax = Math.max(0.0001, ...mh.filter(isFinite).map(Math.abs), ...ml.filter(isFinite).map(Math.abs));
  const macdSvg = `<svg viewBox="0 0 ${W} 80" class="w-full">${mh.map((v, i) => (isFinite(v) ? `<rect x="${x(i) - cw / 2}" y="${v >= 0 ? 40 - (v / mmax) * 36 : 40}" width="${cw}" height="${Math.abs(v / mmax) * 36}" fill="${v >= 0 ? "#15803d" : "#e11d48"}" opacity=".5"/>` : "")).join("")}<path d="${ml.map((v, i) => (isFinite(v) ? `${i && isFinite(ml[i - 1]) ? "L" : "M"}${x(i)},${40 - (v / mmax) * 36}` : "")).join("")}" fill="none" stroke="#4f46e5"/><path d="${msg.map((v, i) => (isFinite(v) ? `${i && isFinite(msg[i - 1]) ? "L" : "M"}${x(i)},${40 - (v / mmax) * 36}` : "")).join("")}" fill="none" stroke="#d97706"/></svg>`;
  const vmax = Math.max(...s.map((c) => c.volume)), volSvg = `<svg viewBox="0 0 ${W} 46" class="w-full">${s.map((c, i) => `<rect x="${x(i) - cw / 2}" y="${46 - (c.volume / vmax) * 42}" width="${cw}" height="${(c.volume / vmax) * 42}" fill="${c.close >= c.open ? "#15803d" : "#e11d48"}" opacity=".3"/>`).join("")}</svg>`;
  const draws = A.draw[t] ?? [], selD = A.selDraw != null ? draws[A.selDraw] : null;
  const tb = (k, ic, l, on) => `<button data-a="an-tool" data-v="${k}" title="${l}" class="flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg px-2 text-sm ${on ? "bg-violet-600 text-white" : "text-ink/65 hover:bg-ink/5"}"><span class="w-4 text-center">${ic}</span><span class="hidden text-xs 2xl:inline">${l}</span></button>`;
  const perf = TA.performance(vs.full), a = MKT.assets[t] ?? {};
  const strip = `<div class="grid grid-cols-5 gap-px overflow-hidden rounded-xl border border-ink/[0.06] bg-ink/[0.06] sm:grid-cols-10">${TA.PERIODS.map((p) => { const v = perf[p.key], rk = { "1D": null, "1S": null, "1M": "1M", "3M": "3M", YTD: "YTD", "1A": "1A", "3A": "3A", "5A": "5A", "10A": "10A", MAX: "MAX" }[p.key];
    return `<button ${rk ? `data-a="an-range" data-v="${rk}"` : "disabled"} class="px-2 py-2 text-center ${A.range === rk ? "ring-2 ring-inset ring-brand" : ""}" style="${perfColor(v)}"><div class="text-[10px] font-medium uppercase tracking-wide opacity-70">${p.key === "MAX" ? `Desde ${(a.since ?? s[0].date).slice(0, 4)}` : p.label}</div><div class="text-sm font-semibold tabular-nums">${fmtPct(v)}</div></button>`; }).join("")}</div>`;
  const au = A.auto?.[t] ? anAuto(G) : null;
  const autoCard = au ? `<section class="card border-amber-200/70 bg-gradient-to-b from-amber-50/60 to-white"><div class="mb-2 flex flex-wrap items-center justify-between gap-2"><h2>Leitura automática do gráfico</h2><span class="text-xs text-ink/45">${vs.range[1]} · ${n} candles ${UNIT_LBL[vs.unit]}s</span></div>
      <div class="mb-3 flex flex-wrap gap-2 text-[11px]">${[["LTA", "#15803d", ""], ["LTB", "#e11d48", ""], ["Canal", "#64748b", "5 4"], ["Suporte", "#15803d", "2 4"], ["Resistência", "#e11d48", "2 4"], ["Fibonacci", "#d97706", ""]].map(([l, c, d]) => `<span class="flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 ring-1 ring-ink/5"><svg width="18" height="6"><line x1="0" x2="18" y1="3" y2="3" stroke="${c}" stroke-width="2" stroke-dasharray="${d}"/></svg>${l}</span>`).join("")}</div>
      <ul class="space-y-2 text-sm text-ink/75">${au.reading.map((x) => `<li class="flex gap-2"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"></span><span>${esc(x)}</span></li>`).join("")}</ul>
      <div class="mt-3 flex flex-wrap gap-2"><button class="btn-ghost !py-1.5 text-xs" data-a="an-auto-keep">Copiar para meus desenhos</button><button class="btn-ghost !py-1.5 text-xs" data-a="an-auto">Ocultar</button></div>
      <p class="mt-2 text-[11px] text-ink/45">Como a plataforma encontra as linhas: topos e fundos (pivôs) do período, LTA/LTB ligando os dois últimos fundos ascendentes/topos descendentes, canal pela paralela no extremo oposto, suportes e resistências onde 2+ pivôs se repetem (±1,5%), Fibonacci do maior movimento da metade final e regressão linear para a força da tendência. Mude o período para outra leitura (curto prazo × longo prazo). Não é recomendação.</p></section>` : "";
  const html = `<section class="card p-0">
      <div class="flex flex-wrap items-center gap-2 border-b border-ink/5 px-4 py-2.5">
        ${seg(AN_RANGES.map(([k, l]) => [k, l]), A.range, "an-range")}
        <select data-anunit class="rounded-lg border border-ink/10 bg-white px-2 py-1.5 text-xs"><option value="auto" ${!A.unit || A.unit === "auto" ? "selected" : ""}>Intervalo: auto (${UNIT_LBL[AN_UNIT_AUTO[vs.range[0]]]})</option>${["D", "W", "M"].map((u) => `<option value="${u}" ${A.unit === u ? "selected" : ""}>${UNIT_LBL[u][0].toUpperCase() + UNIT_LBL[u].slice(1)}</option>`).join("")}</select>
        <select data-anctype class="rounded-lg border border-ink/10 bg-white px-2 py-1.5 text-xs"><option value="auto" ${!A.ctype || A.ctype === "auto" ? "selected" : ""}>Tipo: auto</option><option value="candle" ${A.ctype === "candle" ? "selected" : ""}>Candles</option><option value="line" ${A.ctype === "line" ? "selected" : ""}>Linha</option></select>
        <label class="flex items-center gap-1 text-xs text-ink/60" title="Escala logarítmica: distâncias iguais = variações % iguais. Essencial para períodos longos."><input type="checkbox" data-anlog ${A.log ? "checked" : ""}> Log</label>
        <label class="flex items-center gap-1 text-xs text-ink/60"><input type="checkbox" data-anbb ${A.bb ? "checked" : ""}> Bollinger</label>
        <label class="flex items-center gap-1 text-xs text-ink/60"><input type="checkbox" data-anma200 ${A.ma200 ? "checked" : ""}> MMS200</label>
        <span class="ml-auto flex items-center gap-1 text-[11px] text-ink/50"><span class="h-0.5 w-3 bg-[#d97706]"></span>MMS20 <span class="ml-1 h-0.5 w-3 bg-[#4f46e5]"></span>MMS50${A.ma200 ? ` <span class="ml-1 h-0.5 w-3 bg-[#be185d]"></span>MMS200` : ""}</span>
      </div>
      <div class="flex">
        <div class="flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-ink/5 py-2 2xl:w-auto 2xl:items-stretch 2xl:px-1.5">${AN_TOOLS.map((x) => tb(x.k, x.ic, x.l, tool === x.k)).join("")}
          <span class="my-1 h-px w-6 bg-ink/10 2xl:w-auto"></span>
          <button data-a="an-magnet" title="Ímã: gruda os pontos na máxima/mínima/abertura/fechamento do candle" class="flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-sm ${A.magnet ? "bg-brand text-white" : "text-ink/65 hover:bg-ink/5"}">⊙<span class="hidden text-xs 2xl:inline">Ímã</span></button>
          ${draws.length ? `<button data-a="an-clear" title="Apagar todos os desenhos" class="flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-sm text-ink/45 hover:bg-rose-50 hover:text-rose-700">🗑<span class="hidden text-xs 2xl:inline">Apagar (${draws.length})</span></button>` : ""}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2 border-b border-ink/5 px-3 py-1.5">
            <button data-a="an-auto" class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${au ? "bg-amber-500 text-white" : "bg-amber-100 text-amber-900 hover:bg-amber-200"}">${ico("spark", "h-3.5 w-3.5")} Tendências automáticas</button>
            <div id="an-read" class="text-xs tabular-nums text-ink/60">${anReadout(G, n - 1)}</div>
          </div>
          <div class="px-3 py-1.5 text-xs ${tool === "cursor" ? "text-ink/45" : "bg-violet-50 text-violet-800"}"><b>${tdef.l}:</b> ${tdef.tip}${vs.forced ? ` <span class="text-amber-700">${vs.forced}</span>` : ""}</div>
          ${selD ? `<div class="flex flex-wrap items-center gap-2 border-y border-violet-100 bg-violet-50/50 px-3 py-1.5 text-xs"><span class="font-medium text-violet-800">Desenho selecionado: ${AN_TOOLS.find((x) => x.k === selD.type)?.l ?? "Linha"}</span>${DRAW_COLORS.map((c) => `<button data-a="an-color" data-v="${c}" class="h-4 w-4 rounded-full ring-2 ${(selD.color ?? DRAW_COLORS[0]) === c ? "ring-ink/40" : "ring-transparent"}" style="background:${c}"></button>`).join("")}<input data-anlabel class="w-44 rounded-md border border-ink/10 bg-white px-2 py-0.5" placeholder="Rótulo (opcional)" value="${esc(selD.label ?? "")}"><button data-a="an-deldraw" class="ml-auto text-rose-700 hover:underline">Excluir (Delete)</button></div>` : ""}
          <div class="px-1 pt-1">${svg}</div><div class="px-1">${volSvg}</div>
          <div class="border-t border-ink/5 px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink/40">RSI (14) · ${isFinite(rs.at(-1)) ? rs.at(-1).toFixed(1) : "—"}</div><div class="px-1">${sub(rs, 64, 0, 100, "#7c3aed", [[70, "#be123c"], [30, "#15803d"]])}</div>
          <div class="border-t border-ink/5 px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink/40">MACD (12, 26, 9)</div><div class="px-1 pb-2">${macdSvg}</div>
        </div></div>
      <p class="border-t border-ink/5 px-4 py-2.5 text-[11px] text-ink/40">Histórico desde ${dBR(vs.full[0].date)} (primeiro pregão disponível), ajustado por proventos e desdobramentos. Fonte: Yahoo Finance, com atraso. Os desenhos ficam salvos por ação e valem em qualquer período e intervalo.${OPTS.readOnly ? " Você está no modo somente leitura." : ""}</p></section>`;
  return { html, strip, autoCard, last: lastC, prev: s[n - 2] };
}


// ---------- Interação com o gráfico (arrastar, mover, ajustar) ----------
function anFindDraw(e) { const h = e.target.closest("[data-dh]"); if (h) { const [k, j] = h.dataset.dh.split(":").map(Number); return { k, j }; } const g = e.target.closest("[data-dk]"); return g ? { k: +g.dataset.dk } : null; }
const ptKeys = ["a", "b", "c"];
const onDown = (e) => {
  const svg = e.target.closest("#an-chart"); if (!svg || !AN_GEO || e.button > 0) return;
  const A = anState(), G = AN_GEO, t = G.t, tool = A.tool ?? "cursor", pt = anPoint(e, G), def = AN_TOOLS.find((x) => x.k === tool);
  A.draw[t] = A.draw[t] ?? [];
  if (OPTS.readOnly && tool !== "cursor") return;
  e.preventDefault(); svg.setPointerCapture?.(e.pointerId);
  // rascunho esperando o próximo clique (modo clique-clique ou 3º ponto)
  if (AN_DRAG?.await) { const dr = AN_DRAG.draft; dr[AN_DRAG.await] = { d: pt.d, p: pt.p };
    if (AN_DRAG.await === "b" && def.pts === 3) { AN_DRAG.await = "c"; dr.c = { d: pt.d, p: pt.p }; anRefreshOverlay(); return; }
    A.draw[t].push(dr); A.selDraw = A.draw[t].length - 1; A.tool = "cursor"; AN_DRAG = null; update(); return; }
  if (tool === "cursor") {
    const hit = anFindDraw(e);
    if (!hit || hit.k < 0) { if (A.selDraw != null) { A.selDraw = null; update(); } return; }
    if (A.selDraw !== hit.k) { A.selDraw = hit.k; update(); AN_DRAG = { kind: hit.j != null ? "handle" : "move", k: hit.k, j: hit.j, start: anPoint(e, AN_GEO), orig: JSON.parse(JSON.stringify(A.draw[t][hit.k])) }; return; }
    AN_DRAG = { kind: hit.j != null ? "handle" : "move", k: hit.k, j: hit.j, start: pt, orig: JSON.parse(JSON.stringify(A.draw[t][hit.k])) }; return;
  }
  if (def.pts === 1) { A.draw[t].push(tool === "hline" ? { type: "hline", price: pt.p, a: { d: pt.d, p: pt.p } } : { type: "vline", a: { d: pt.d, p: pt.p } }); A.selDraw = A.draw[t].length - 1; A.tool = "cursor"; update(); return; }
  AN_DRAG = { kind: "new", draft: { type: tool, a: { d: pt.d, p: pt.p }, b: { d: pt.d, p: pt.p }, color: DRAW_COLORS[0] }, start: pt };
  anRefreshOverlay();
};
const onMove = (e) => {
  const svg = document.getElementById("an-chart"); if (!svg || !AN_GEO) return;
  const inside = e.target.closest?.("#an-chart"); const G = AN_GEO;
  if (!AN_DRAG && !inside) { const c = document.getElementById("an-cross"); if (c && c.innerHTML) { c.innerHTML = ""; document.getElementById("an-read").innerHTML = anReadout(G, G.n - 1); } return; }
  const pt = anPoint(e, G), A = anState();
  // mira (crosshair) + leitura OHLC
  const ci = Math.max(0, Math.min(G.n - 1, pt.i)), cross = document.getElementById("an-cross");
  if (cross) cross.innerHTML = `<line x1="${G.x(pt.i)}" x2="${G.x(pt.i)}" y1="${G.top}" y2="${G.bot}" stroke="#0f1b2d" stroke-opacity=".3" stroke-dasharray="3 3"/><line x1="${G.P}" x2="${G.xr}" y1="${pt.py}" y2="${pt.py}" stroke="#0f1b2d" stroke-opacity=".3" stroke-dasharray="3 3"/><rect x="${G.xr + 1}" y="${pt.py - 8}" width="${G.AX - 2}" height="16" rx="3" fill="#0f1b2d"/><text x="${G.xr + 4}" y="${pt.py + 4}" style="font-size:10px;font-weight:600" fill="#fff">${fmtP(pt.p)}</text><rect x="${G.x(pt.i) - 32}" y="${G.bot + 1}" width="64" height="15" rx="3" fill="#0f1b2d"/><text x="${G.x(pt.i)}" y="${G.bot + 12}" text-anchor="middle" style="font-size:10px" fill="#fff">${dBR(pt.d)}</text>`;
  const rd = document.getElementById("an-read"); if (rd) rd.innerHTML = anReadout(G, ci);
  if (!AN_DRAG || (OPTS.readOnly && AN_DRAG.kind !== "new")) return;
  if (AN_DRAG.kind === "new") { AN_DRAG.draft[AN_DRAG.await ?? "b"] = { d: pt.d, p: pt.p }; anRefreshOverlay(); return; }
  const dr = A.draw[G.t][AN_DRAG.k], o = AN_DRAG.orig; if (!dr) return;
  if (AN_DRAG.kind === "handle") { const key = ptKeys[AN_DRAG.j]; dr[key] = { d: pt.d, p: pt.p }; if (dr.type === "hline") dr.price = pt.p; }
  else { const di = pt.i - AN_DRAG.start.i, dv = G.f(pt.p) - G.f(AN_DRAG.start.p);
    const mv = (q) => ({ d: G.dateAt(G.idxOf(q.d) + di), p: Math.round(G.fi(G.f(q.p) + dv) * 100) / 100 });
    for (const key of ptKeys) if (o[key]) dr[key] = mv(o[key]);
    if (o.price != null) dr.price = Math.round(G.fi(G.f(o.price) + dv) * 100) / 100; }
  AN_DRAG.moved = true; anRefreshOverlay();
};
const onUp = (e) => {
  if (!AN_DRAG || !AN_GEO) return; const A = anState(), G = AN_GEO, def = AN_TOOLS.find((x) => x.k === AN_DRAG.draft?.type);
  if (AN_DRAG.kind === "new" && !AN_DRAG.await) {
    const pt = anPoint(e, G), dist = Math.hypot(pt.px - AN_DRAG.start.px, pt.py - AN_DRAG.start.py);
    if (dist < 5) { AN_DRAG.await = "b"; return; } // clique sem arrastar: espera o 2º clique
    if (def.pts === 3) { AN_DRAG.await = "c"; AN_DRAG.draft.c = { ...AN_DRAG.draft.b }; anRefreshOverlay(); return; }
    A.draw[G.t].push(AN_DRAG.draft); A.selDraw = A.draw[G.t].length - 1; A.tool = "cursor"; AN_DRAG = null; update(); return;
  }
  if (AN_DRAG.kind === "move" || AN_DRAG.kind === "handle") { AN_DRAG = null; save(); return; }
};

function render() {
  if (!ROOT) return;
  const t = OPTS.ticker, CH = anChartSection(t, null);
  ROOT.innerHTML = `<div class="space-y-4">${CH.strip}${CH.html}${CH.autoCard}</div>`;
}
function onClick(e) {
  const el = e.target.closest("[data-a]"); if (!el || !ROOT.contains(el)) return;
  const a = el.dataset.a, v = el.dataset.v, t = OPTS.ticker;
  switch (a) {
    case "an-range": A.range = v; break;
    case "an-tool": if (OPTS.readOnly && v !== "cursor") return; A.tool = v; AN_DRAG = null; if (v !== "cursor") A.selDraw = null; break;
    case "an-magnet": A.magnet = !A.magnet; break;
    case "an-auto": A.auto[t] = !A.auto[t]; break;
    case "an-auto-keep": if (OPTS.readOnly) return; if (AN_GEO) { A.draw[t] = [...(A.draw[t] ?? []), ...anAutoLines(AN_GEO).map(({ dash, ...d }) => d)]; A.auto[t] = false; } break;
    case "an-color": { const d = A.draw[t]?.[A.selDraw]; if (d && !OPTS.readOnly) d.color = v; break; }
    case "an-deldraw": if (OPTS.readOnly) return; A.draw[t]?.splice(A.selDraw, 1); A.selDraw = null; break;
    case "an-clear": if (OPTS.readOnly || !confirm("Apagar todos os desenhos desta ação?")) return; A.draw[t] = []; A.selDraw = null; break;
    default: return;
  }
  update();
}
function onChange(e) {
  const tg = e.target, d = tg.dataset; if (!ROOT.contains(tg)) return;
  if ("anlog" in d) A.log = tg.checked; else if ("anbb" in d) A.bb = tg.checked; else if ("anma200" in d) A.ma200 = tg.checked;
  else if ("anunit" in d) A.unit = tg.value; else if ("anctype" in d) A.ctype = tg.value;
  else if ("anlabel" in d) { const dr = A.draw[OPTS.ticker]?.[A.selDraw]; if (dr && !OPTS.readOnly) dr.label = tg.value.trim() || undefined; }
  else return;
  update();
}
function onKey(e) {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (e.key === "Escape" && (AN_DRAG || A.tool !== "cursor")) { AN_DRAG = null; A.tool = "cursor"; update(); }
  if ((e.key === "Delete" || e.key === "Backspace") && A.selDraw != null && !OPTS.readOnly) { A.draw[OPTS.ticker]?.splice(A.selDraw, 1); A.selDraw = null; update(); e.preventDefault(); }
}

/** Monta o gráfico num elemento. Retorna a função de desmontagem. */
export function mountChart(root, opts) {
  ROOT = root; OPTS = { ...opts, _lastSaved: JSON.stringify(opts.drawings ?? []) };
  let prefs = {}; try { prefs = JSON.parse(localStorage.getItem(PREFS) || "{}"); } catch {}
  A = { range: "1A", unit: "auto", ctype: "auto", log: false, bb: true, ma200: false, magnet: false, ...prefs, tool: "cursor", auto: {}, selDraw: null, draw: { [opts.ticker]: opts.drawings ?? [] }, watch: [{ ticker: opts.ticker, buy: opts.buy, sell: opts.sell }] };
  AN_GEO = null; AN_DRAG = null;
  render();
  root.addEventListener("click", onClick); root.addEventListener("change", onChange);
  document.addEventListener("pointerdown", onDown); document.addEventListener("pointermove", onMove); document.addEventListener("pointerup", onUp); document.addEventListener("keydown", onKey);
  return () => {
    root.removeEventListener("click", onClick); root.removeEventListener("change", onChange);
    document.removeEventListener("pointerdown", onDown); document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); document.removeEventListener("keydown", onKey);
    clearTimeout(saveTimer); ROOT = null;
  };
}
