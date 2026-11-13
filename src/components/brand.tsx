/**
 * Identidade alvvo (holding) · área finance.
 * Símbolo: forma da área (moeda) + corte em A — dois cortes diagonais saindo do centro do topo, 19° da vertical,
 * espessura 6,5% da largura (mais grossa em tamanhos pequenos). Assinatura: "alvvo" em Outfit 500, minúsculas,
 * espaço −0,035em; a área ("finance") logo abaixo, Outfit 400, 30% do tamanho, na cor da área.
 */
import { useId } from "react";

export const FINANCE = { dark: "#E2A64B", light: "#8F5E13" } as const;
const COIN = "M50 0A50 50 0 1 1 49.99 0Z";

/** Símbolo (moeda com corte em A). `color` = cor da forma; o corte é transparente. */
export function BrandMark({ className = "h-8 w-8", color = FINANCE.dark, size, animated = false }: { className?: string; color?: string; size?: number; animated?: boolean }) {
  const id = useId().replace(/:/g, "");
  const px = size ?? 32;
  const stroke = px <= 16 ? 9 : px <= 24 ? 8 : 6.5;
  return (
    <svg viewBox="-4 -4 108 108" className={className} width={size} height={size} aria-hidden
      style={animated ? { animation: "alvvo-pulse 1.4s cubic-bezier(.4,0,.2,1) infinite alternate" } : undefined}>
      <mask id={`am${id}`}>
        <rect x="-4" y="-4" width="108" height="108" fill="#fff" />
        <g stroke="#000" strokeWidth={stroke}><line x1="50" y1="-10" x2="9" y2="112" /><line x1="50" y1="-10" x2="91" y2="112" /></g>
      </mask>
      <path fill={color} mask={`url(#am${id})`} d={COIN} />
    </svg>
  );
}

/** Assinatura: símbolo + "alvvo" + área. `size` = altura do "alvvo" em px. */
export function Wordmark({ className = "", size = 26, tone = "light", area = "finance", markClass }: { className?: string; size?: number; tone?: "light" | "dark"; area?: string | null; markClass?: string }) {
  const name = tone === "light" ? "#F4F1EA" : "#1D1915";
  const accent = tone === "light" ? FINANCE.dark : FINANCE.light;
  const markPx = Math.round(size * (area ? 1.3 : 1.05));
  return (
    <span className={`inline-flex items-center ${className}`} style={{ gap: Math.round(size * 0.28) }}>
      <BrandMark className={markClass ?? ""} size={markClass ? undefined : markPx} color={accent} />
      <span className="flex flex-col" style={{ gap: Math.max(3, Math.round(size * 0.15)) }}>
        <span style={{ fontWeight: 500, fontSize: size, letterSpacing: "-0.035em", lineHeight: 0.82, color: name }}>alvvo</span>
        {area && <span style={{ fontWeight: 400, fontSize: Math.max(11, Math.round(size * 0.3)), lineHeight: 1, color: accent, paddingLeft: 1 }}>{area}</span>}
      </span>
    </span>
  );
}

/** Selo "Leitura alvvo": moeda escura sobre disco dourado. */
export function Seal({ size = 64 }: { size?: number; id?: string }) {
  return (
    <span className="inline-grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size, background: FINANCE.dark, boxShadow: `inset 0 0 0 ${Math.round(size * 0.04)}px ${FINANCE.dark}, inset 0 0 0 ${Math.round(size * 0.04) + 1}px #7A5C32` }}>
      <BrandMark size={Math.round(size * 0.56)} color="#0E0C0A" />
    </span>
  );
}
