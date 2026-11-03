/**
 * Motor de insights: regras explicáveis sobre os dados da plataforma.
 * Cada insight diz o que aconteceu, mostra os números e aponta uma ação.
 * Não usa dados externos; a Fase 2 adiciona cotações e taxas de referência.
 */

export type InsightKind = "atencao" | "oportunidade" | "info";
export type InsightArea = "precos" | "orcamento" | "cartao" | "investimentos" | "agenda" | "organizacao";

export interface Insight {
  key: string;            // estável: permite "dispensar" sem sumir com insights novos
  kind: InsightKind;
  area: InsightArea;
  title: string;
  body: string;
  metric?: string;        // destaque numérico (ex.: "+5,7%")
  link?: { href: string; label: string };
  weight: number;         // ordenação (maior = mais importante)
}

export interface InsightTx {
  id: string;
  date: string;
  cycle: string;
  description: string;
  merchant_key: string | null;
  amount: number;
  kind: string;           // receita | despesa | investimento | transferencia
  grp: string | null;     // perfil (Fixas, Variáveis…)
  category_id: string | null;
  category_name: string | null;
  excluded: boolean;
  source: string;
  installment_no: number | null;
  installment_total: number | null;
  international: boolean;
}

export interface InsightInput {
  txs: InsightTx[];
  currentCycle: string;
  today: string;                       // AAAA-MM-DD
  cycleRange: (c: string) => { start: string; end: string };
  budgets: { category_id: string; cycle: string; planned: number }[];
  committedByCycle?: Record<string, number>;   // parcelas por ciclo (Parcelamentos)
  installmentsFreeCycle?: string | null;
  overdueAgenda?: { name: string; date: string; amount: number | null }[];
  nextDue?: { name: string; date: string; amount: number | null }[];
  links?: Partial<Record<string, string>>;
  /** Monitor de preços (Análise de ações) */
  watch?: { ticker: string; price: number | null; buy: number | null; sell: number | null; zone: string | null; action: string | null }[];
  /** Carteira de investimentos (Fase 2) */
  portfolio?: {
    total: number;
    classes: { key: string; label: string; value: number; target: number }[];   // target em %
    positions: { ticker: string; value: number; pnlPct: number; targetHit: boolean }[];
    fixedIncome: { name: string; index: string; rate: number }[];
  };
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const pctAbs = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const lbl = (c: string) => `${MESES[Number(c.slice(5, 7)) - 1]}/${c.slice(0, 4)}`;
const shift = (c: string, n: number) => {
  const i = Number(c.slice(0, 4)) * 12 + Number(c.slice(5, 7)) - 1 + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
};
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const cv = (a: number[]) => { const m = mean(a); if (!m) return Infinity; return Math.sqrt(mean(a.map((x) => (x - m) ** 2))) / Math.abs(m); };
const title = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()).replace(/^Planilha · /i, "");

/** Chave de "item recorrente": estabelecimento normalizado, ou a descrição. */
const itemKey = (t: InsightTx) => (t.merchant_key || t.description).toUpperCase().replace(/^PLANILHA · /, "").trim();

export function generateInsights(inp: InsightInput): Insight[] {
  const out: Insight[] = [];
  const L = { analise: "/analise", lancamentos: "/lancamentos", orcamento: "/orcamento", parcelamentos: "/parcelamentos", agenda: "/agenda", faturas: "/faturas", investimentos: "/investimentos", ...(inp.links as Record<string, string>) } as Record<string, string>;
  const expenses = inp.txs.filter((t) => t.kind === "despesa" && !t.excluded);
  const cyclesWithData = [...new Set(inp.txs.map((t) => t.cycle))].sort();
  // Último ciclo "fechado" com dados (ou o atual, se tiver)
  // Ciclo de referência: o mais recente (até o atual) com movimento suficiente para comparar
  const countBy = new Map<string, number>();
  for (const t of expenses) countBy.set(t.cycle, (countBy.get(t.cycle) ?? 0) + 1);
  const ref = cyclesWithData.filter((c) => c <= inp.currentCycle && (countBy.get(c) ?? 0) >= 5).pop() ?? inp.currentCycle;

  // ---------- 1. Mudança de preço em cobranças recorrentes ----------
  const byItemCycle = new Map<string, Map<string, number>>();
  const itemName = new Map<string, string>();
  for (const t of expenses) {
    if (t.installment_total) continue;   // parcelas têm valor fixo por definição
    const k = itemKey(t);
    if (!byItemCycle.has(k)) byItemCycle.set(k, new Map());
    const m = byItemCycle.get(k)!;
    m.set(t.cycle, (m.get(t.cycle) ?? 0) + Number(t.amount));
    itemName.set(k, t.source === "planilha" && t.category_name ? t.category_name : title(t.merchant_key || t.description));
  }
  const recurring: { k: string; name: string; last: number; cycles: number }[] = [];
  for (const [k, m] of byItemCycle) {
    const series = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (series.length < 3) continue;
    // recorrente = aparece em ciclos consecutivos
    const lastC = series[series.length - 1][0];
    const values = series.map((s) => s[1]);
    // procura a última mudança relevante após um período estável (≥3 valores com CV ≤ 5%)
    for (let i = series.length - 1; i >= 3; i--) {
      const prev = values.slice(Math.max(0, i - 4), i);
      if (prev.length < 3 || cv(prev) > 0.05) continue;
      const base = median(prev), now = values[i], d = (now - base) / base;
      if (Math.abs(d) >= 0.03 && Math.abs(now - base) >= 2) {
        const up = d > 0;
        out.push({
          key: `preco|${k}|${series[i][0]}`, kind: up ? "atencao" : "info", area: "precos",
          title: `${itemName.get(k)} ${up ? "ficou mais cara" : "ficou mais barata"}`,
          body: `Valor estável em ${brl(base)} nos ciclos anteriores e ${brl(now)} em ${lbl(series[i][0])}. ${up ? `${d > 0.8 ? "Pode ser cobrança acumulada de mais de um mês; se não for, " : "Se continuar assim, "}são ${brl((now - base) * 12)} a mais por ano. Vale conferir se houve reajuste do fornecedor, troca de plano ou cobrança indevida.` : "Confira se foi desconto pontual ou mudança de plano."}`,
          metric: pct(d), link: { href: `${L.lancamentos}?ciclo=${series[i][0]}&q=${encodeURIComponent(itemName.get(k) ?? "")}`, label: "Ver lançamentos" },
          weight: up ? 80 + Math.min(15, Math.abs(d) * 100) : 30,
        });
        break;
      }
    }
    const recent = series.filter((s) => s[0] >= shift(ref, -3));
    if (recent.length >= 3 && cv(recent.map((s) => s[1])) <= 0.1 && lastC >= shift(ref, -1)) recurring.push({ k, name: itemName.get(k) ?? k, last: values[values.length - 1], cycles: series.length });
  }
  if (recurring.length) {
    const monthly = recurring.reduce((a, r) => a + r.last, 0);
    const top = [...recurring].sort((a, b) => b.last - a.last).slice(0, 4).map((r) => `${r.name} (${brl(r.last)})`).join(", ");
    out.push({
      key: `recorrentes|${ref}`, kind: "info", area: "precos",
      title: `${recurring.length} cobranças recorrentes somam ${brl(monthly)} por mês`,
      body: `São ${brl(monthly * 12)} por ano em itens que se repetem com valor estável. Os maiores: ${top}. Revisar assinaturas pouco usadas é um dos jeitos mais rápidos de liberar dinheiro para investir.`,
      metric: `${brl(monthly * 12)}/ano`, link: { href: `${L.orcamento}?ciclo=${ref}`, label: "Ver orçamento" }, weight: 40,
    });
  }

  // ---------- 2. Categoria acima do normal ----------
  const catCycle = new Map<string, Map<string, number>>();
  const catName = new Map<string, string>();
  for (const t of expenses) {
    if (!t.category_id || t.grp === "A classificar") continue;
    if (!catCycle.has(t.category_id)) catCycle.set(t.category_id, new Map());
    const m = catCycle.get(t.category_id)!;
    m.set(t.cycle, (m.get(t.cycle) ?? 0) + Number(t.amount));
    catName.set(t.category_id, t.category_name ?? "");
  }
  for (const [cid, m] of catCycle) {
    const cur = m.get(ref) ?? 0;
    const prev = [1, 2, 3].map((n) => m.get(shift(ref, -n)) ?? 0);
    if (prev.filter((v) => v > 0).length < 2) continue;
    const avg = mean(prev);
    if (avg > 0 && cur >= avg * 1.4 && cur - avg >= 150) {
      out.push({
        key: `pico|${cid}|${ref}`, kind: "atencao", area: "orcamento",
        title: `${catName.get(cid)} acima do normal em ${lbl(ref)}`,
        body: `Foram ${brl(cur)} contra uma média de ${brl(avg)} nos 3 ciclos anteriores: ${brl(cur - avg)} a mais. Se foi pontual (viagem, presente, conserto), considere marcar como Extra ou Adicional para não distorcer o orçamento.`,
        metric: pct((cur - avg) / avg), link: { href: `${L.lancamentos}?ciclo=${ref}&categoria=${cid}`, label: "Ver itens" },
        weight: 60 + Math.min(20, (cur - avg) / 200),
      });
    }
  }

  // ---------- 3. Ritmo do orçamento no ciclo atual ----------
  const { start, end } = inp.cycleRange(inp.currentCycle);
  const total = (Date.parse(end) - Date.parse(start)) / 864e5 + 1;
  const elapsed = Math.min(total, Math.max(1, (Date.parse(inp.today) - Date.parse(start)) / 864e5 + 1));
  const curSpent = new Map<string, number>();
  for (const t of expenses.filter((t) => t.cycle === inp.currentCycle)) if (t.category_id) curSpent.set(t.category_id, (curSpent.get(t.category_id) ?? 0) + Number(t.amount));
  for (const b of inp.budgets.filter((b) => b.cycle === inp.currentCycle && b.planned > 0)) {
    const s = curSpent.get(b.category_id) ?? 0;
    const name = catName.get(b.category_id) ?? "Categoria";
    if (s > b.planned) {
      out.push({ key: `estouro|${b.category_id}|${b.cycle}`, kind: "atencao", area: "orcamento", title: `${name}: limite estourado`,
        body: `Gasto de ${brl(s)} para um limite de ${brl(b.planned)} no ciclo ${lbl(b.cycle)} (${brl(s - b.planned)} acima).`, metric: pctAbs(s / b.planned),
        link: { href: `${L.orcamento}?ciclo=${b.cycle}`, label: "Ajustar limite" }, weight: 85 });
    } else if (elapsed < total && s / b.planned > (elapsed / total) * 1.25 && s / b.planned >= 0.5) {
      const proj = (s / elapsed) * total;
      out.push({ key: `ritmo|${b.category_id}|${b.cycle}`, kind: "atencao", area: "orcamento", title: `${name} no ritmo de passar do limite`,
        body: `Com ${Math.round(elapsed)} de ${Math.round(total)} dias do ciclo, você já usou ${pctAbs(s / b.planned)} do limite. Nesse ritmo, o ciclo fecha em cerca de ${brl(proj)} (limite: ${brl(b.planned)}).`,
        metric: pctAbs(s / b.planned), link: { href: `${L.orcamento}?ciclo=${b.cycle}`, label: "Ver orçamento" }, weight: 70 });
    }
  }

  // ---------- 4. Poupança e investimentos ----------
  const last3 = [0, 1, 2].map((n) => shift(ref, -n)).filter((c) => cyclesWithData.includes(c));
  const sums = last3.map((c) => {
    const ts = inp.txs.filter((t) => t.cycle === c && !t.excluded);
    const r = ts.filter((t) => t.kind === "receita").reduce((a, t) => a + Number(t.amount), 0);
    const d = ts.filter((t) => t.kind === "despesa").reduce((a, t) => a + Number(t.amount), 0);
    const i = ts.filter((t) => t.kind === "investimento").reduce((a, t) => a + Number(t.amount), 0);
    return { c, r, d, i, sobra: r - d - i };
  }).filter((s) => s.r > 0);
  if (sums.length >= 2) {
    const r = mean(sums.map((s) => s.r)), d = mean(sums.map((s) => s.d)), inv = mean(sums.map((s) => s.i)), sobra = mean(sums.map((s) => s.sobra));
    const rate = (sobra + inv) / r;
    if (rate < 0.1) {
      out.push({ key: `poupanca-baixa|${ref}`, kind: "atencao", area: "investimentos", title: "Taxa de poupança baixa",
        body: `Nos últimos ${sums.length} ciclos, sobraram (ou foram investidos) em média ${brl(sobra + inv)} de ${brl(r)} de receita (${pctAbs(rate)}). Uma referência comum é guardar ao menos 20% da renda. Os grupos Adicionais e Extras costumam ser os mais fáceis de ajustar.`,
        metric: pctAbs(rate), link: { href: `${L.orcamento}?visao=anual`, label: "Ver orçamento anual" }, weight: 75 });
    } else {
      out.push({ key: `poupanca|${ref}`, kind: "oportunidade", area: "investimentos", title: `Você poupa ${pctAbs(rate)} da receita`,
        body: `Média de ${brl(sobra + inv)} por ciclo nos últimos ${sums.length} ciclos${inv ? `, dos quais ${brl(inv)} já investidos` : ""}. ${sobra > 500 ? `Há ${brl(sobra)} por ciclo que sobram sem destino registrado: programar um aporte automático logo após o recebimento evita que esse valor se dilua em gastos.` : "Bom ritmo: mantenha os aportes logo após o recebimento."}`,
        metric: pctAbs(rate), link: { href: L.investimentos, label: "Investimentos" }, weight: sobra > 500 ? 65 : 35 });
    }
    const essential = mean(last3.map((c) => inp.txs.filter((t) => t.cycle === c && t.kind === "despesa" && !t.excluded && (t.grp === "Fixas" || t.grp === "Variáveis")).reduce((a, t) => a + Number(t.amount), 0)));
    if (essential > 0) {
      out.push({ key: `reserva|${ref}`, kind: "info", area: "investimentos", title: `Reserva de emergência sugerida: ${brl(essential * 6)}`,
        body: `Seu custo essencial (Fixas + Variáveis) está em ${brl(essential)} por ciclo. A referência usual é ter de 6 a 12 meses disso em aplicação de liquidez diária e baixo risco (${brl(essential * 6)} a ${brl(essential * 12)}) antes de aumentar a parcela em ativos de maior volatilidade.`,
        metric: "6–12×", link: { href: L.investimentos, label: "Planejar" }, weight: 45 });
    }
    // ---------- 5. Parcelas comprometendo a renda ----------
    if (inp.committedByCycle) {
      const next = inp.committedByCycle[shift(inp.currentCycle, 1)] ?? 0;
      if (next > 0) {
        const share = next / r;
        out.push({ key: `parcelas|${inp.currentCycle}`, kind: share > 0.2 ? "atencao" : "info", area: "cartao",
          title: `${pctAbs(share)} da receita já está comprometida com parcelas no próximo ciclo`,
          body: `São ${brl(next)} em parcelas para ${lbl(shift(inp.currentCycle, 1))}${inp.installmentsFreeCycle ? `; sem novas compras parceladas, o cartão fica livre em ${lbl(inp.installmentsFreeCycle)}` : ""}. ${share > 0.2 ? "Acima de 20% da renda, parcelas começam a reduzir a capacidade de investir." : ""}`,
          metric: brl(next), link: { href: L.parcelamentos, label: "Ver parcelamentos" }, weight: share > 0.2 ? 72 : 38 });
      }
    }
    void d;
  }

  // ---------- 6. IOF e compras internacionais ----------
  const iof = expenses.filter((t) => /^IOF/i.test(t.description) && t.cycle >= shift(ref, -11));
  const intl = expenses.filter((t) => t.international && !/^IOF/i.test(t.description) && t.cycle >= shift(ref, -11));
  if (iof.length) {
    const v = iof.reduce((a, t) => a + Number(t.amount), 0), vi = intl.reduce((a, t) => a + Number(t.amount), 0);
    out.push({ key: `iof|${ref}`, kind: "oportunidade", area: "cartao", title: `${brl(v)} pagos em IOF de compras internacionais`,
      body: `Nos últimos 12 ciclos, ${brl(vi)} em compras no exterior geraram ${brl(v)} de IOF no cartão. Para próximas viagens, compare com conta/cartão em moeda estrangeira ou compra antecipada de moeda, que costumam ter IOF e spread diferentes.`,
      metric: brl(v), link: { href: `${L.lancamentos}?q=IOF`, label: "Ver itens" }, weight: 50 });
  }

  // ---------- 7. Possível cobrança duplicada ----------
  const seen = new Map<string, InsightTx[]>();
  for (const t of expenses.filter((t) => t.source !== "planilha" && !t.installment_total && t.cycle >= shift(ref, -1) && Number(t.amount) >= 20)) {
    const k = `${itemKey(t)}|${t.date}|${Number(t.amount).toFixed(2)}`;
    seen.set(k, [...(seen.get(k) ?? []), t]);
  }
  for (const [k, list] of seen) if (list.length > 1) {
    const t = list[0];
    out.push({ key: `dup|${k}`, kind: "atencao", area: "cartao", title: `Possível cobrança duplicada: ${title(t.description)}`,
      body: `${list.length} lançamentos de ${brl(Number(t.amount))} no mesmo dia (${t.date.split("-").reverse().join("/")}). Se não foram compras separadas, conteste com o banco.`,
      metric: `${list.length}×`, link: { href: `${L.lancamentos}?ciclo=${t.cycle}&q=${encodeURIComponent(t.description)}`, label: "Conferir" }, weight: 78 });
  }

  // ---------- 8. Juros, multas e encargos ----------
  const fees = expenses.filter((t) => /JUROS|ENCARGO|MULTA|ROTATIVO|ANUIDADE|TARIFA/i.test(t.description) && t.cycle >= shift(ref, -2));
  if (fees.length) {
    const v = fees.reduce((a, t) => a + Number(t.amount), 0);
    out.push({ key: `tarifas|${ref}`, kind: "atencao", area: "cartao", title: `${brl(v)} em juros, tarifas ou anuidade`,
      body: `Encontrei ${fees.length} cobrança(s) como ${[...new Set(fees.map((f) => title(f.description)))].slice(0, 3).join(", ")}. Anuidade costuma ser negociável, e juros de rotativo do cartão estão entre os mais caros do mercado.`,
      metric: brl(v), link: { href: `${L.lancamentos}?ciclo=${ref}`, label: "Ver itens" }, weight: 82 });
  }

  // ---------- 9. Concentração de gastos ----------
  const refExp = expenses.filter((t) => t.cycle === ref);
  const refTotal = refExp.reduce((a, t) => a + Number(t.amount), 0);
  if (refTotal >= 1000) {
    const byCat = new Map<string, number>();
    for (const t of refExp) if (t.category_name) byCat.set(t.category_name, (byCat.get(t.category_name) ?? 0) + Number(t.amount));
    const [topName, topV] = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    if (topV / refTotal >= 0.3) {
      out.push({ key: `concentracao|${ref}|${topName}`, kind: "info", area: "orcamento", title: `${topName} concentrou ${pctAbs(topV / refTotal)} das despesas de ${lbl(ref)}`,
        body: `${brl(topV)} de ${brl(refTotal)}. Gastos concentrados numa só categoria são os que mais movem o resultado do mês; vale planejar esse item com antecedência (ex.: uma caixinha específica).`,
        metric: pctAbs(topV / refTotal), link: { href: `${L.orcamento}?ciclo=${ref}`, label: "Ver orçamento" }, weight: 42 });
    }
  }

  // ---------- 10. Organização ----------
  const unc = inp.txs.filter((t) => t.cycle >= shift(ref, -1) && (!t.category_id || t.grp === "A classificar"));
  if (unc.length) {
    out.push({ key: `classificar|${ref}|${unc.length}`, kind: "info", area: "organizacao", title: `${unc.length} lançamento(s) sem categoria`,
      body: `Somam ${brl(unc.reduce((a, t) => a + Number(t.amount), 0))}. Cada um que você classifica vira regra para as próximas faturas, e os insights ficam mais precisos.`,
      metric: String(unc.length), link: { href: `${L.lancamentos}?ciclo=${ref}&categoria=a-classificar`, label: "Classificar" }, weight: 55 });
  }

  // ---------- 11. Agenda ----------
  for (const o of inp.overdueAgenda ?? []) {
    out.push({ key: `atraso|${o.name}|${o.date}`, kind: "atencao", area: "agenda", title: `${o.name} venceu em ${o.date.split("-").reverse().join("/")}`,
      body: `${o.amount ? `Valor previsto de ${brl(o.amount)}. ` : ""}Se já foi pago, marque na Agenda para registrar o lançamento; se não, atrasos podem gerar multa e juros.`,
      link: { href: L.agenda, label: "Abrir agenda" }, weight: 90 });
  }
  const soon = (inp.nextDue ?? []).filter((o) => o.amount);
  if (soon.length) {
    const v = soon.reduce((a, o) => a + (o.amount ?? 0), 0);
    out.push({ key: `proximos|${inp.today}`, kind: "info", area: "agenda", title: `${brl(v)} vencem nos próximos 7 dias`,
      body: soon.map((o) => `${o.name} (${o.date.slice(8)}/${o.date.slice(5, 7)}: ${brl(o.amount ?? 0)})`).join(" · "),
      link: { href: L.agenda, label: "Ver agenda" }, weight: 58 });
  }

  // ---------- 12. Carteira ----------
  const pf = inp.portfolio;
  if (pf && pf.total > 0) {
    for (const p of pf.positions) {
      const w = p.value / pf.total;
      if (w >= 0.25) out.push({ key: `conc-ativo|${p.ticker}`, kind: "atencao", area: "investimentos", title: `${p.ticker} representa ${pctAbs(w)} da carteira`,
        body: `Um único ativo acima de 25% do patrimônio deixa o resultado muito dependente dele. Considere direcionar os próximos aportes para outras posições em vez de vender.`, metric: pctAbs(w), link: { href: L.investimentos, label: "Ver carteira" }, weight: 68 });
      if (p.targetHit) out.push({ key: `meta-ativo|${p.ticker}`, kind: "oportunidade", area: "investimentos", title: `${p.ticker} atingiu a meta de +45%`,
        body: `A posição já rende ${pct(p.pnlPct)} sobre o preço médio. É o momento que você definiu para reavaliar: realizar parte, manter ou subir a meta.`, metric: pct(p.pnlPct), link: { href: L.investimentos, label: "Ver posição" }, weight: 66 });
    }
    const off = pf.classes.filter((c) => c.target > 0 || c.value > 0).map((c) => ({ ...c, cur: (c.value / pf.total) * 100 })).filter((c) => Math.abs(c.cur - c.target) >= 10);
    if (off.length) {
      const under = off.filter((c) => c.cur < c.target).map((c) => c.label), over = off.filter((c) => c.cur > c.target).map((c) => c.label);
      out.push({ key: `alocacao|${off.map((c) => c.key).join(",")}`, kind: "info", area: "investimentos", title: "Carteira fora da alocação-alvo",
        body: `${over.length ? `Acima do alvo: ${over.join(", ")}. ` : ""}${under.length ? `Abaixo: ${under.join(", ")}. ` : ""}O jeito mais barato de rebalancear é direcionar os próximos aportes para as classes abaixo do alvo — o quadro "Próximo aporte" mostra quanto em cada uma.`,
        metric: `${off.length} classe(s)`, link: { href: L.investimentos, label: "Ver alocação" }, weight: 52 });
    }
    const low = pf.fixedIncome.filter((f) => f.index === "cdi" && f.rate < 100);
    if (low.length) out.push({ key: `rf-baixa|${low.map((f) => f.name).join(",")}`, kind: "oportunidade", area: "investimentos", title: `${low.length} título(s) rendendo menos de 100% do CDI`,
      body: `${low.map((f) => `${f.name} (${f.rate}% do CDI)`).join(", ")}. Para aplicações tributadas, há opções de liquidez diária que pagam 100% do CDI ou mais; compare prazo, garantia (FGC) e IR antes de trocar.`,
      link: { href: L.investimentos, label: "Ver renda fixa" }, weight: 48 });
  }

  // ---------- 13. Monitor de preços ----------
  for (const w of inp.watch ?? []) {
    if (!w.price || !w.zone) continue;
    const buyZone = w.zone.includes("compra");
    out.push({ key: `monitor|${w.ticker}|${w.zone}|${w.price}`, kind: buyZone ? "oportunidade" : "atencao", area: "investimentos",
      title: `${w.ticker}: ${w.zone.toLowerCase()}`,
      body: `Cotação de ${brl(w.price)} ${buyZone ? `para seu alvo de compra de ${brl(w.buy ?? 0)}` : `para seu alvo de venda de ${brl(w.sell ?? 0)}`}.${w.action ? ` A leitura combinada da plataforma está em “${w.action}”.` : ""} Abra a análise para ver gráfico, fundamentos e notícias antes de decidir.`,
      metric: brl(w.price), link: { href: L.analise, label: "Abrir análise" }, weight: buyZone ? 74 : 76 });
  }

  // Um assunto por vez: se o item já tem alerta de preço, não repete como pico/concentração
  const priced = new Set(out.filter((i) => i.area === "precos" && i.key.startsWith("preco|")).map((i) => i.title.split(" ficou ")[0]));
  const dedup = out.filter((i) => !((i.key.startsWith("pico|") || i.key.startsWith("concentracao|")) && [...priced].some((n) => i.title.startsWith(n + " "))));
  return dedup.sort((a, b) => b.weight - a.weight);
}
