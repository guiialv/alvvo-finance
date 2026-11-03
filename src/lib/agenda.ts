/** Agenda financeira: gera as ocorrências mensais de cartões, contas e receitas. */

export type AgendaType = "cartao" | "conta" | "receita";
export type AgendaEvent = "fechamento" | "vencimento" | "conta" | "receita";

export interface AgendaItem {
  id: string;
  type: AgendaType;
  name: string;
  closing_day: number | null;
  due_day: number;
  amount: number | null;
  category_id: string | null;
  card_last4: string | null;
  member_user_id: string | null;
  notes: string | null;
  active: boolean;
  starts_on: string;
}

export interface Occurrence {
  item: AgendaItem;
  date: string;
  month: string;
  event: AgendaEvent;
  amount: number | null;
  key: string;
  paid: boolean;
  transactionId: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const weekday = (iso: string) => WEEKDAYS[new Date(iso + "T12:00:00Z").getUTCDay()];

export function occurrences(
  items: AgendaItem[],
  payments: { item_id: string; month: string; event: string; transaction_id: string | null }[],
  from: string,
  to: string,
  cardEstimate?: (item: AgendaItem) => number | null,
): Occurrence[] {
  const paid = new Map(payments.map((p) => [`${p.item_id}|${p.month}|${p.event}`, p.transaction_id]));
  const out: Occurrence[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  while (`${y}-${pad(m)}` <= to.slice(0, 7)) {
    const month = `${y}-${pad(m)}`;
    const at = (d: number) => `${month}-${pad(Math.min(d, lastDayOf(y, m)))}`;
    for (const it of items) {
      if (!it.active) continue;
      const push = (event: AgendaEvent, day: number, amount: number | null) => {
        const date = at(day);
        if (date < from || date > to || date < it.starts_on) return;
        const key = `${it.id}|${month}|${event}`;
        out.push({ item: it, date, month, event, amount, key, paid: paid.has(key), transactionId: paid.get(key) ?? null });
      };
      if (it.type === "cartao") {
        if (it.closing_day) push("fechamento", it.closing_day, null);
        push("vencimento", it.due_day, cardEstimate ? cardEstimate(it) : null);
      } else push(it.type, it.due_day, it.amount === null ? null : Number(it.amount));
    }
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function eventLabel(o: Occurrence) {
  return o.event === "fechamento" ? "Fecha a fatura" : o.event === "vencimento" ? "Vence a fatura" : o.event === "receita" ? "Recebimento" : "Vencimento";
}

export function occurrenceStatus(o: Occurrence, today: string): { text: string; cls: string } {
  if (o.event === "fechamento") {
    if (o.date < today) return { text: "fechada", cls: "bg-ink/5 text-ink/50" };
    const best = addDays(o.date, 1);
    return { text: `melhor dia de compra: ${best.slice(8, 10)}/${best.slice(5, 7)}`, cls: "bg-sky-50 text-sky-700" };
  }
  if (o.paid) return { text: o.event === "receita" ? "recebido" : "pago", cls: "bg-emerald-50 text-emerald-700" };
  if (o.date < today) return { text: "atrasado", cls: "bg-rose-50 text-rose-700" };
  const d = Math.round((Date.parse(o.date) - Date.parse(today)) / 864e5);
  return { text: d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} dias`, cls: d <= 3 ? "bg-amber-50 text-amber-800" : "bg-ink/5 text-ink/60" };
}
