import type { PdfPage, PdfTextItem } from "./types";

/** Linha-sentinela entre colunas (só quando lemos por colunas). */
export const COLUMN_BREAK = "\u0000col";

/** Cabeçalhos que abrem um bloco/coluna nas faturas (Itaú e similares). */
const COLUMN_HEADERS = /^(Lançamentos: compras e saques|Lançamentos internacionais|Lançamentos no cartão|Compras parceladas - próximas faturas|Total dos lançamentos atuais|Limites de crédito|Encargos cobrados|Simulação de Compras|DATA$|.+\(final \d{4}\)$)/;

/**
 * Agrupa itens de texto em linhas, coluna por coluna.
 *
 * As faturas têm até três faixas verticais: uma barra lateral de avisos, a coluna de
 * lançamentos e o painel da direita (total, compras parceladas, limites). Uma linha
 * nunca pode juntar textos de faixas diferentes, senão o lançamento da esquerda “cola”
 * no parcelamento da direita. Detectamos as faixas pela posição dos cabeçalhos; quando
 * passamos `columnMarker`, também aceitamos esse marcador como cabeçalho.
 */
export function pageToLines(page: PdfPage, columnMarker?: RegExp): string[] {
  const items = page.items.filter((i) => i.str.trim() !== "");
  if (!columnMarker) return groupLines(items);

  const cols = columnStarts(items, page.width, columnMarker);
  if (cols.length === 0) return groupLines(items);

  // Faixa de cada item: a última coluna que começa antes dele (com folga de 8pt).
  const bands: PdfTextItem[][] = cols.map(() => []);
  const sidebar: PdfTextItem[] = [];
  for (const it of items) {
    let idx = -1;
    for (let c = 0; c < cols.length; c++) if (it.x >= cols[c] - 8) idx = c;
    if (idx === -1) sidebar.push(it);
    else bands[idx].push(it);
  }
  // A barra lateral (avisos) vem por último, para não interromper os lançamentos.
  // COLUMN_BREAK separa as faixas: quem lê sabe que a linha anterior não continua.
  return [...bands, sidebar].flatMap((b) => [COLUMN_BREAK, ...groupLines(b)]);
}

/** Posições X onde começam as colunas da página, da esquerda para a direita. */
function columnStarts(items: PdfTextItem[], width: number, marker: RegExp): number[] {
  const xs = items
    .filter((i) => marker.test(i.str.trim()) || COLUMN_HEADERS.test(i.str.trim()))
    .map((i) => i.x)
    .sort((a, b) => a - b);
  if (!xs.length) return [];
  // Agrupa posições próximas (mesma coluna); colunas reais ficam a ≥ 15% da largura.
  const clusters: number[][] = [];
  for (const x of xs) {
    const last = clusters[clusters.length - 1];
    if (last && x - last[last.length - 1] < width * 0.15) last.push(x);
    else clusters.push([x]);
  }
  return clusters.map((c) => Math.min(...c));
}

function groupLines(items: PdfTextItem[]): string[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PdfTextItem[][] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - it.y) <= 2.5) row.push(it);
    else rows.push([it]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let out = "";
    let lastEnd = -Infinity;
    for (const it of row) {
      const gap = it.x - lastEnd;
      out += out && gap > 1 ? " " + it.str : it.str;
      lastEnd = it.x + it.w;
    }
    return out.replace(/\s+/g, " ").trim();
  }).filter(Boolean);
}

/** "1.234,56" -> 1234.56 */
export function parseBRL(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", "."));
}
