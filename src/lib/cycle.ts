/**
 * Ciclos de competência. Com início no dia 8, o ciclo "2026-11" vai de 08/11/2026 a 07/12/2026.
 * Com início no dia 1, ciclo = mês civil.
 */

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const pad = (n: number) => String(n).padStart(2, "0");
const key = (y: number, m: number) => `${y}-${pad(m)}`;

export function cycleOf(dateIso: string, startDay = 8): string {
  const [y, m, d] = dateIso.slice(0, 10).split("-").map(Number);
  if (d >= startDay) return key(y, m);
  return m === 1 ? key(y - 1, 12) : key(y, m - 1);
}

export function shiftCycle(cycle: string, n: number): string {
  const [y, m] = cycle.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return key(Math.floor(idx / 12), (idx % 12) + 1);
}

export function cycleRange(cycle: string, startDay = 8): { start: string; end: string } {
  const [y, m] = cycle.split("-").map(Number);
  const start = `${key(y, m)}-${pad(startDay)}`;
  const [ny, nm] = shiftCycle(cycle, 1).split("-").map(Number);
  const endDate = new Date(Date.UTC(ny, nm - 1, startDay));
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  return { start, end: endDate.toISOString().slice(0, 10) };
}

export function cycleLabel(cycle: string): string {
  const [y, m] = cycle.split("-").map(Number);
  return `${MESES[m - 1]}/${y}`;
}

export function cycleRangeLabel(cycle: string, startDay = 8): string {
  const { start, end } = cycleRange(cycle, startDay);
  const f = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  return `${f(start)} a ${f(end)}`;
}

export function todayIso(): string {
  // Data local de São Paulo
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function currentCycle(startDay = 8): string {
  return cycleOf(todayIso(), startDay);
}

/** Ciclos de um ano (jan..dez) */
export function cyclesOfYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => key(year, i + 1));
}

export function isValidCycle(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}
