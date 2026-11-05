/**
 * Identidade ALVVO.
 * Marca: linhas verticais que desenham um “A” — o topo sobe como um gráfico em alta e a abertura da letra fica no centro.
 */
// Linhas verticais que desenham um “A”: o topo sobe até um pico e a abertura da letra fica embaixo, no centro.
// [topo, base] de cada linha num quadro de 40 × 40.
const LINES: [number, number][] = [[28, 36], [22, 36], [15, 36], [8, 25], [4, 22], [8, 25], [15, 36], [22, 36], [28, 36]];
const X0 = 4.4, STEP = 3.9, BW = 2.2;

export function BrandMark({ className = "h-8 w-8", color = "currentColor", animated = false, size }: { className?: string; color?: string; animated?: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 40 40" className={className} width={size} height={size} aria-hidden fill={color}>
      {LINES.map(([top, bottom], i) => {
        const x = X0 + i * STEP;
        const style = animated ? { animation: `alvvo-rise 1s cubic-bezier(.2,.7,.2,1) ${Math.abs(i - 4) * 90}ms infinite alternate`, transformOrigin: `${x + BW / 2}px ${bottom}px` } : undefined;
        return <rect key={i} x={x} y={top} width={BW} height={bottom - top} rx={BW / 2} style={style} />;
      })}
    </svg>
  );
}

/** Marca + nome em serifa. */
export function Wordmark({ className = "", markClass = "h-8 w-8", tone = "light" }: { className?: string; markClass?: string; tone?: "light" | "dark" }) {
  const c = tone === "light" ? "#d8bf8f" : "#1f1b17";
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark className={markClass} color={c} />
      <span className="font-serif text-[24px] leading-none tracking-[0.14em]" style={{ color: tone === "light" ? "#f3eadb" : "#1f1b17" }}>ALVVO</span>
    </span>
  );
}

/** Selo-medalha em ouro escovado, usado em destaques da plataforma (ex.: “Leitura ALVVO” de um ativo). */
export function Seal({ size = 64, id = "seal" }: { size?: number; id?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <defs>
        <radialGradient id={`${id}-g`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#f3e3bf" /><stop offset=".45" stopColor="#cfb07a" /><stop offset=".8" stopColor="#a8834f" /><stop offset="1" stopColor="#7d5f36" />
        </radialGradient>
        <linearGradient id={`${id}-r`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff6e2" stopOpacity=".9" /><stop offset="1" stopColor="#6b4f2c" stopOpacity=".8" /></linearGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill={`url(#${id}-g)`} />
      <circle cx="32" cy="32" r="27.5" fill="none" stroke={`url(#${id}-r)`} strokeWidth="1.2" />
      <circle cx="32" cy="32" r="25" fill="none" stroke="#6b4f2c" strokeOpacity=".25" strokeWidth=".6" strokeDasharray="1 1.6" />
      <g transform="translate(14 13)">
        <g transform="translate(.7 .8)" opacity=".4"><BrandMark className="" size={36} color="#4a3519" /></g>
        <BrandMark className="" size={36} color="#fbf1dc" />
      </g>
    </svg>
  );
}
