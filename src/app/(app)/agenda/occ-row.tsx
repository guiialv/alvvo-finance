import { eventLabel, occurrenceStatus, weekday, type Occurrence } from "@/lib/agenda";
import { formatBRL } from "@/lib/format";
import { AGENDA_COLOR } from "@/lib/theme";
import { Icon } from "@/components/icons";
import { payOccurrence, unpayOccurrence } from "./actions";

export function OccRow({ o, today, actions = true }: { o: Occurrence; today: string; actions?: boolean }) {
  const st = occurrenceStatus(o, today);
  const color = AGENDA_COLOR[o.item.type];
  return (
    <div className={`flex items-center gap-3 py-2.5 ${o.paid ? "opacity-60" : ""}`}>
      <div className="w-12 shrink-0 text-center">
        <div className="text-lg font-semibold leading-none tabular-nums">{o.date.slice(8)}</div>
        <div className="text-[10px] uppercase text-ink/40">{weekday(o.date)}</div>
      </div>
      <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{o.item.name}</div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink/50">{eventLabel(o)} <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.text}</span></div>
      </div>
      {o.amount != null && o.event !== "fechamento" && (
        <div className={`text-right text-sm font-semibold tabular-nums ${o.event === "receita" ? "text-gain" : ""}`}>
          {o.event === "receita" ? "+" : ""}{formatBRL(o.amount)}
          {o.event === "vencimento" && <div className="text-[10px] font-normal text-ink/40">última fatura</div>}
        </div>
      )}
      {actions && o.event !== "fechamento" && (
        <div className="w-24 text-right">
          {o.paid ? (
            <form action={unpayOccurrence}><input type="hidden" name="key" value={o.key} /><button className="text-xs text-ink/40 hover:text-ink">desfazer</button></form>
          ) : (
            <form action={payOccurrence}><input type="hidden" name="key" value={o.key} /><button className="btn-ghost !py-1.5 text-xs"><Icon name="check" className="h-3.5 w-3.5" />{o.event === "receita" ? "Recebido" : "Pago"}</button></form>
          )}
        </div>
      )}
    </div>
  );
}

