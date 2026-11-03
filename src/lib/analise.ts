/** Monitor de ações: zona de compra/venda, sinais técnicos, preço justo e sugestão explicável. */
import { fairValues, suggest, techSummary, type Candle } from "@/lib/technical";

export interface Fund { pl?: number | null; pvp?: number | null; dy?: number | null; lpa?: number | null; vpa?: number | null; roe?: number | null; divEbitda?: number | null; analystTarget?: number | null; source?: string | null }
export interface Watch { ticker: string; buy: number | null; sell: number | null; note: string | null; fund: Fund }

export function analyzeTicker(w: Watch, candles: Candle[], quote: number | null) {
  const price = quote ?? candles[candles.length - 1]?.close ?? null;
  const tech = candles.length >= 60 ? techSummary(candles) : null;
  const f = w.fund ?? {};
  const fair = price ? fairValues({ price, pl: f.pl, pvp: f.pvp, dy: f.dy, lpa: f.lpa, vpa: f.vpa }) : { graham: null, bazin: null, lpa: null, vpa: null };
  const targets = f.analystTarget ? [Number(f.analystTarget)] : [];
  const sug = price ? suggest(price, tech, fair, targets, { buy: w.buy, sell: w.sell }) : null;
  let zone: { t: string; tone: "buy" | "sell" } | null = null;
  if (price && w.buy) { if (price <= w.buy) zone = { t: "Na zona de compra", tone: "buy" }; else if (price <= w.buy * 1.03) zone = { t: "Perto do alvo de compra", tone: "buy" }; }
  if (price && w.sell) { if (price >= w.sell) zone = { t: "Na zona de venda", tone: "sell" }; else if (price >= w.sell * 0.97) zone = { t: "Perto do alvo de venda", tone: "sell" }; }
  return { price, tech, fair, sug, zone };
}
