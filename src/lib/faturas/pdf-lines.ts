import type { PdfPage, PdfTextItem } from "./types";

/**
 * Agrupa itens de texto em linhas. Faturas costumam ter duas colunas;
 * quando detectamos colunas, devolvemos a coluna esquerda inteira e depois a direita,
 * para que a leitura siga a ordem natural do documento.
 */
export function pageToLines(page: PdfPage, columnMarker?: RegExp): string[] {
  const items = page.items.filter((i) => i.str.trim() !== "");
  let splitX: number | null = null;

  if (columnMarker) {
    const markers = items.filter((i) => columnMarker.test(i.str)).sort((a, b) => a.x - b.x);
    if (markers.length >= 2 && markers[markers.length - 1].x - markers[0].x > page.width * 0.2) {
      splitX = markers[markers.length - 1].x - 8;
    }
  }

  if (splitX === null) return groupLines(items);
  return [
    ...groupLines(items.filter((i) => i.x < splitX!)),
    ...groupLines(items.filter((i) => i.x >= splitX!)),
  ];
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
