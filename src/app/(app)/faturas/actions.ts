"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEdit } from "@/lib/context";
import { cycleOf } from "@/lib/cycle";
import { normalizeMerchant, suggestCategory, UNCATEGORIZED_KEY, type LearnedRule } from "@/lib/categorize";
import { fetchAll, categoryIndex, loadAccounts, loadCategories, loadMembers } from "@/lib/data";
import { faturaIssues, PdfPasswordError, pagesToText, parseStatementFile } from "@/lib/faturas";
import { aiAvailable, aiKeyFor } from "@/lib/ai";
import { aiCategorize, aiReadStatement } from "@/lib/ai-tasks";
import { brandOf } from "@/lib/cards";
import { cardKey, type CardAcc, fileAccountKey, matchCardAccount } from "@/lib/card-resolve";
import { cardCycle, type FaturaRef, type Flow, isAutoInvest, isCardPayment, isLoan, matchFatura, pairPixCredit, signedAmount, SYS } from "@/lib/reconcile";
import type { Ctx } from "@/lib/context";
import type { Category } from "@/lib/data";

export interface PreviewRow {
  idx: number;
  date: string;
  description: string;
  amount: number;
  cardLast4: string | null;
  installment: string | null;
  installmentNo: number | null;
  installmentTotal: number | null;
  bankCategory: string | null;
  city: string | null;
  international: boolean;
  foreignAmount: number | null;
  foreignCurrency: string | null;
  fxRate: number | null;
  suggestedCategoryId: string | null;
  suggestionSource: string;
  duplicate: boolean;
  hash: string;
  /** Extratos: entrada ou saída (valor sempre positivo) */
  flow: Flow | null;
  nature: string | null;
  /** Ciclo do lançamento (extrato: pela data; cartão: pelo vencimento) */
  cycle: string;
  /** Observação da conciliação (ex.: “Confere com a fatura …”) */
  note: string | null;
  reconciledBatchId: string | null;
}

export interface Preview {
  error?: string;
  /** "SENHA_NECESSARIA" | "SENHA_INCORRETA" quando o PDF tem senha */
  needsPassword?: string;
  readWith?: "leitor" | "ia";
  fileName?: string;
  source?: "fatura_pdf" | "extrato_pdf" | "csv" | "ofx";
  docType?: "fatura" | "extrato";
  accountRef?: string | null;
  bank?: string;
  dueDate?: string | null;
  statementTotal?: number | null;
  cycle?: string;
  warnings?: string[];
  rows?: PreviewRow[];
  cards?: { last4: string; total: number; accountId: string | null; ownerUserId: string | null }[];
  members?: { user_id: string; display_name: string }[];
  futureTotal?: number;
  /** "Compras parceladas - próximas faturas", como no PDF */
  futureItems?: FutureItem[];
  /** Totais por cartão informados na fatura ("Lançamentos no cartão (final xxxx)") */
  cardTotals?: Record<string, number>;
  /** "Total dos lançamentos atuais" */
  currentTotal?: number | null;
  /** Importações anteriores desta mesma fatura, que serão substituídas */
  replacesBatchIds?: string[];
  mainCard?: { last4: string; product?: string | null } | null;
  /** Cartão (linha) já existente a que esta fatura pertence */
  cardAccountName?: string | null;
}

export type FutureItem = { date: string; description: string; amount: number; installmentNo?: number | null; installmentTotal?: number | null };

export async function analyzeStatement(_: Preview | undefined, formData: FormData): Promise<Preview> {
  const ctx = await requireEdit("faturas");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo." };
  if (file.size > 15 * 1024 * 1024) return { error: "Arquivo muito grande (máx. 15 MB)." };

  let st;
  let readWith: "leitor" | "ia" = "leitor";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const password = String(formData.get("password") ?? "").trim() || undefined;
  try {
    st = await parseStatementFile(file.name, bytes, password);
    // PDF de outro banco: lê com IA (quando a conta tem IA ativa)
    if (!st.transactions.length && file.name.toLowerCase().endsWith(".pdf")) {
      if (!aiAvailable(ctx)) return { fileName: file.name, error: "Ainda não reconheço este PDF sem IA. Ative a IA em Configurações (chave do Claude) ou envie CSV/OFX." };
      const key = await aiKeyFor(ctx);
      if (!key) return { fileName: file.name, error: "Nenhuma chave de IA disponível. Salve a sua chave do Claude em Configurações." };
      // PDF com senha: a IA recebe o texto já aberto aqui no servidor
      st = await aiReadStatement(key, bytes, file.name, password && st.pages ? pagesToText(st.pages) : undefined);
      readWith = "ia";
    } else if (file.name.toLowerCase().endsWith(".pdf") && (st.docType ?? "fatura") === "fatura") {
      // Conferência: se a leitura não bate com a fatura (cartões, subtotais, total), relê com IA
      const issues = faturaIssues(st);
      if (issues.length && aiAvailable(ctx)) {
        const key = await aiKeyFor(ctx);
        if (key) {
          try {
            const ai = await aiReadStatement(key, bytes, file.name, password && st.pages ? pagesToText(st.pages) : undefined);
            const aiIssues = faturaIssues({ ...ai, cardTotals: st.cardTotals, currentTotal: st.currentTotal ?? ai.currentTotal ?? null });
            if (ai.transactions.length && aiIssues.length < issues.length) {
              st = { ...ai, dueDate: st.dueDate ?? ai.dueDate, statementTotal: st.statementTotal ?? ai.statementTotal, currentTotal: st.currentTotal ?? ai.currentTotal ?? null,
                cardTotals: Object.keys(st.cardTotals).length ? st.cardTotals : ai.cardTotals,
                futureInstallments: st.futureInstallments.length ? st.futureInstallments : ai.futureInstallments,
                warnings: [`O leitor automático não fechou com a fatura (${issues.join("; ")}). Relida com IA${aiIssues.length ? ` — ainda confira: ${aiIssues.join("; ")}` : " e conferida"}.`] };
              readWith = "ia";
            } else st.warnings.unshift(`Conferência: ${issues.join("; ")}.`);
          } catch { st.warnings.unshift(`Conferência: ${issues.join("; ")}.`); }
        }
      } else if (issues.length) st.warnings.unshift(`Conferência: ${issues.join("; ")}. Ative a IA para uma segunda leitura automática.`);
    }
  } catch (e) {
    if (e instanceof PdfPasswordError) return { fileName: file.name, needsPassword: e.code, error: e.message };
    return { fileName: file.name, error: e instanceof Error ? e.message : "Não foi possível ler o arquivo." };
  }
  if (!st.transactions.length) return { fileName: file.name, error: st.warnings[0] ?? "Nenhum lançamento encontrado no arquivo.", warnings: st.warnings };

  const [cats, rulesRes, accounts, members] = await Promise.all([
    loadCategories(ctx),
    ctx.supabase.from("category_rules").select("pattern, match_type, category_id").eq("household_id", ctx.household.id),
    loadAccounts(ctx),
    loadMembers(ctx),
  ]);
  const { byKey } = categoryIndex(cats);
  const rules = (rulesRes.data ?? []) as LearnedRule[];
  const uncId = byKey.get(UNCATEGORIZED_KEY)?.id ?? null;

  const docType = st.docType ?? "fatura";
  const startDay = ctx.household.cycle_start_day;
  const dueDate = st.dueDate;
  const seen = new Map<string, number>();
  const byName = (grp: string, name: string) => cats.find((c) => c.scope === "pessoal" && c.grp === grp && c.name === name);
  const sys = {
    fatura: byName("Transferências", SYS.pagamentoFatura), pix: byName("Transferências", SYS.pixCredito), loan: byName("Transferências", SYS.emprestimos),
    own: byName("Transferências", SYS.entreContas), semDetalhe: byName("A classificar", SYS.faturaSemDetalhe),
    outrasReceitas: cats.find((c) => c.scope === "pessoal" && c.kind === "receita" && /outras receitas/i.test(c.name)),
  };
  const { byId } = categoryIndex(cats);

  const rows: PreviewRow[] = st.transactions.map((t, idx) => {
    const flow = docType === "extrato" ? (t.flow ?? "saida") : null;
    const base = [st.bank, t.date, t.description, t.amount.toFixed(2), t.cardLast4 ?? "", t.installmentNo ?? "", t.installmentTotal ?? "", flow ?? ""].join("|");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const hash = createHash("sha256").update(`${base}|${n}`).digest("hex").slice(0, 32);
    const s = suggestCategory(t.description, t.bankCategory, rules);
    let suggestedCategoryId = s.categoryId ?? (s.categoryKey ? byKey.get(s.categoryKey)?.id ?? uncId : uncId);
    let suggestionSource: string = s.source;
    if (flow) {
      // Sugestão incompatível com o sentido do dinheiro (ex.: “PIX para a Maína” sugerido como receita)
      const k = suggestedCategoryId ? byId.get(suggestedCategoryId)?.kind : undefined;
      if ((flow === "saida" && k === "receita") || (flow === "entrada" && (k === "despesa" || k === "investimento") && suggestedCategoryId !== uncId)) { suggestedCategoryId = uncId; suggestionSource = "nenhuma"; }
      if (flow === "entrada" && suggestedCategoryId === uncId && sys.outrasReceitas) { suggestedCategoryId = sys.outrasReceitas.id; suggestionSource = "padrao"; }
    }
    return {
      idx, date: t.date, description: t.description, amount: t.amount, cardLast4: t.cardLast4,
      installment: t.installmentTotal ? `${t.installmentNo}/${t.installmentTotal}` : null,
      installmentNo: t.installmentNo, installmentTotal: t.installmentTotal,
      bankCategory: t.bankCategory, city: t.city, international: t.international,
      foreignAmount: t.foreignAmount ?? null, foreignCurrency: t.foreignCurrency ?? null, fxRate: t.fxRate ?? null, suggestedCategoryId, suggestionSource,
      duplicate: false, hash, flow, nature: t.nature ?? null,
      cycle: docType === "extrato" ? cycleOf(t.date, startDay) : cardCycle(t.date, startDay, dueDate),
      note: null, reconciledBatchId: null,
    };
  });

  if (docType === "extrato") {
    const faturas = await loadFaturaRefs(ctx, rows);
    const pix = pairPixCredit(rows);
    for (const r of rows) {
      const set = (c: Category | undefined, note: string | null, batch: string | null = null) => { if (c) { r.suggestedCategoryId = c.id; r.suggestionSource = "conciliacao"; r.note = note; r.reconciledBatchId = batch; } };
      if (pix.has(r.idx)) set(sys.pix, r.flow === "entrada" ? "Limite do cartão liberado para um PIX — o gasto aparece na fatura" : "PIX pago com o cartão — o gasto aparece na fatura");
      else if (r.flow === "saida" && isCardPayment(r.description, r.nature)) {
        const f = matchFatura(r.amount, r.date, faturas);
        if (f) set(sys.fatura, `Confere com a fatura ${f.label} — os gastos já estão na fatura`, f.id);
        else set(sys.semDetalhe ?? sys.fatura, "Pagamento de fatura ainda não importada. Ao importar a fatura, este pagamento vira transferência para não contar em dobro.");
      } else if (isLoan(r.description, r.nature)) set(sys.loan, r.flow === "entrada" ? "Dinheiro de empréstimo não é receita" : "Pagamento de empréstimo: confira se há juros a registrar como despesa");
      else if (isAutoInvest(r.description, r.nature)) set(sys.own, "Aplicação/resgate automático");
      else if (r.suggestionSource !== "regra") extratoDefaults(r, cats, sys.own);
    }
    splitLoanInterest(rows, cats, sys.loan);
  }

  // Lançamentos que as regras não reconheceram: sugestão com IA (se ativa)
  const pending = rows.filter((r) => r.suggestionSource !== "conciliacao" && (!r.suggestedCategoryId || r.suggestedCategoryId === uncId || r.suggestionSource === "padrao"));
  if (pending.length && aiAvailable(ctx)) {
    try {
      const key = await aiKeyFor(ctx);
      if (key) {
        const opts = cats.filter((c) => c.active && c.grp !== "A classificar").map((c) => ({ id: c.id, label: `${c.scope === "pj" ? "PJ · " : ""}${c.grp}${c.subgroup ? " › " + c.subgroup : ""} › ${c.name}` }));
        const got = await aiCategorize(key, pending.slice(0, 150).map((r) => ({ idx: r.idx, description: r.description, amount: r.amount, bankCategory: r.bankCategory, flow: r.flow ?? undefined })), opts);
        for (const r of pending) {
          const k = got[r.idx] ? byId.get(got[r.idx])?.kind : undefined;
          if (!k || (r.flow === "saida" && k === "receita")) continue;
          r.suggestedCategoryId = got[r.idx]; r.suggestionSource = "ia";
        }
      }
    } catch { /* segue sem IA */ }
  }

  // Reimportar a mesma fatura (mesmo banco e vencimento) substitui a anterior, mantendo as classificações
  // Só substitui a fatura do MESMO cartão (linha) e mesmo vencimento — cartões diferentes vencem no mesmo dia
  let replacesBatchIds: string[] = [];
  let cardAccountName: string | null = null;
  if (docType === "fatura") {
    const finals = [...new Set(st.transactions.map((t) => t.cardLast4).filter((x): x is string => !!x))];
    const acc = matchCardAccount((await loadAccounts(ctx)) as CardAcc[], { bank: st.bank, main: st.mainCard?.last4 ?? null, finals, fileName: file.name });
    cardAccountName = acc?.name ?? null;
    const m = st.mainCard;
    st.warnings.unshift(acc ? `Cartão: ${acc.name}${m?.product ? ` (${m.product})` : ""}.` : `Cartão novo: ${st.bank}${m?.product ? ` ${m.product}` : ""}${m ? ` ••${m.last4}` : finals[0] ? ` ••${finals[0]}` : ""} — será criado ao importar.`);
    const { data: prev } = acc && st.dueDate
      ? await ctx.supabase.from("import_batches").select("id").eq("household_id", ctx.household.id).eq("doc_type", "fatura").eq("account_id", acc.id).eq("due_date", st.dueDate)
      : { data: [] };
    replacesBatchIds = ((prev ?? []) as { id: string }[]).map((b) => b.id);
    if (replacesBatchIds.length) st.warnings.unshift(`Esta fatura já tinha sido importada${replacesBatchIds.length > 1 ? ` (${replacesBatchIds.length} vezes)` : ""}. Ao importar, a versão anterior é substituída por esta leitura — as classificações que você já fez são mantidas.`);
  }
  const hashes = rows.map((r) => r.hash);
  const existing = new Set<string>();
  for (let i = 0; i < hashes.length; i += 200) {
    const { data } = await ctx.supabase.from("transactions").select("external_hash, import_batch_id").eq("household_id", ctx.household.id).in("external_hash", hashes.slice(i, i + 200));
    (data ?? []).forEach((d) => { if (!replacesBatchIds.includes(d.import_batch_id as string)) existing.add(d.external_hash as string); });
  }
  rows.forEach((r) => (r.duplicate = existing.has(r.hash)));

  const lower = file.name.toLowerCase();
  const source = lower.endsWith(".pdf") ? (docType === "extrato" ? "extrato_pdf" : "fatura_pdf") : lower.endsWith(".ofx") || lower.endsWith(".qfx") ? "ofx" : "csv";
  const latest = rows.reduce((m, r) => (r.date > m ? r.date : m), rows[0].date);
  const cycle = docType === "extrato" ? cycleOf(latest, startDay) : cardCycle(latest, startDay, st.dueDate);
  if (docType === "fatura" && !st.dueDate) st.warnings.push("Vencimento não encontrado: as compras entram no ciclo do mês seguinte à compra (quando a fatura é paga). Ajuste se precisar.");
  if (docType === "extrato") {
    const conc = rows.filter((r) => r.reconciledBatchId).length, open = rows.filter((r) => r.flow === "saida" && !r.reconciledBatchId && r.note?.startsWith("Pagamento de fatura")).length;
    if (conc) st.warnings.push(`${conc} pagamento(s) de fatura conferido(s) com faturas já importadas: entram como transferência, sem contar os gastos em dobro.`);
    if (open) st.warnings.push(`${open} pagamento(s) de fatura sem a fatura correspondente. Importe as faturas desses vencimentos para ver o detalhe — o pagamento será convertido automaticamente.`);
  }

  const institution = st.bank;
  const cardSet = [...new Set(rows.map((r) => r.cardLast4).filter((c): c is string => !!c))];
  const cards = cardSet.map((last4) => {
    const acc = accounts.find((a) => a.last4 === last4 && (a.institution ?? "") === institution);
    return {
      last4,
      total: Math.round(rows.filter((r) => r.cardLast4 === last4).reduce((a, r) => a + r.amount, 0) * 100) / 100,
      accountId: acc?.id ?? null,
      ownerUserId: acc?.owner_user_id ?? ctx.user.id,
    };
  });

  return {
    fileName: file.name, readWith, source, docType, accountRef: st.accountRef ?? null, bank: st.bank, dueDate: st.dueDate, statementTotal: st.statementTotal, cycle,
    warnings: st.warnings, rows, cards, members: members.map((m) => ({ user_id: m.user_id, display_name: m.display_name })),
    futureTotal: Math.round(st.futureInstallments.reduce((a, f) => a + f.amount, 0) * 100) / 100,
    futureItems: st.futureInstallments, cardTotals: st.cardTotals, currentTotal: st.currentTotal ?? null, replacesBatchIds,
    mainCard: st.mainCard ?? null, cardAccountName,
  };
}

/** Faturas já importadas com vencimento perto das datas do extrato, com o total somado dos lançamentos. */
async function loadFaturaRefs(ctx: Ctx, rows: { date: string }[]): Promise<FaturaRef[]> {
  if (!rows.length) return [];
  const dates = rows.map((r) => r.date).sort();
  const shiftD = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
  const { data: batches } = await ctx.supabase.from("import_batches").select("id, institution, file_name, due_date, statement_total")
    .eq("household_id", ctx.household.id).eq("doc_type", "fatura").gte("due_date", shiftD(dates[0], -15)).lte("due_date", shiftD(dates[dates.length - 1], 15));
  const list = (batches ?? []) as { id: string; institution: string | null; file_name: string | null; due_date: string | null; statement_total: number | null }[];
  if (!list.length) return [];
  const txs = await fetchAll<{ import_batch_id: string; amount: number }>(() => ctx.supabase.from("transactions").select("id, import_batch_id, amount").eq("household_id", ctx.household.id).in("import_batch_id", list.map((b) => b.id)));
  const sum = new Map<string, number>();
  for (const t of (txs ?? []) as { import_batch_id: string; amount: number }[]) sum.set(t.import_batch_id, (sum.get(t.import_batch_id) ?? 0) + Number(t.amount));
  return list.map((b) => ({
    id: b.id, dueDate: b.due_date, statementTotal: b.statement_total != null ? Number(b.statement_total) : null, total: Math.round((sum.get(b.id) ?? 0) * 100) / 100,
    label: `${b.institution ?? ""}${b.due_date ? ` (vence ${b.due_date.slice(8, 10)}/${b.due_date.slice(5, 7)})` : ""}`.trim(),
  }));
}

/** Depois de importar uma fatura: pagamentos dessa fatura já lançados pelo extrato viram transferência (evita contar em dobro). */
async function reconcilePaymentsFor(ctx: Ctx, batchId: string, dueDate: string, total: number, statementTotal: number | null, label: string, cats: Category[]) {
  const fat = cats.find((c) => c.scope === "pessoal" && c.grp === "Transferências" && c.name === SYS.pagamentoFatura);
  if (!fat) return 0;
  const shiftD = (n: number) => new Date(Date.parse(dueDate) + n * 86400000).toISOString().slice(0, 10);
  const { data } = await ctx.supabase.from("transactions").select("id, date, description, amount, category_id")
    .eq("household_id", ctx.household.id).eq("flow", "saida").is("reconciled_batch_id", null).gte("date", shiftD(-10)).lte("date", shiftD(10));
  const semDetalhe = cats.find((c) => c.name === SYS.faturaSemDetalhe)?.id;
  const cands = ((data ?? []) as { id: string; date: string; description: string; amount: number; category_id: string | null }[])
    .filter((t) => t.category_id === semDetalhe || t.category_id === fat.id || isCardPayment(t.description));
  const ref: FaturaRef = { id: batchId, label, dueDate, total, statementTotal };
  const hit = cands.map((t) => ({ t, f: matchFatura(Math.abs(Number(t.amount)), t.date, [ref]) })).find((x) => x.f);
  if (!hit) return 0;
  await ctx.supabase.from("transactions").update({
    category_id: fat.id, kind: "transferencia", amount: Math.abs(Number(hit.t.amount)), reconciled_batch_id: batchId,
    notes: `Confere com a fatura ${label} — os gastos já estão na fatura`,
  }).eq("id", hit.t.id);
  return 1;
}

export interface ConfirmPayload {
  fileName: string;
  source: "fatura_pdf" | "extrato_pdf" | "csv" | "ofx";
  docType?: "fatura" | "extrato";
  accountRef?: string | null;
  bank: string;
  dueDate: string | null;
  statementTotal: number | null;
  futureTotal: number | null;
  futureItems?: FutureItem[];
  cardTotals?: Record<string, number>;
  currentTotal?: number | null;
  replacesBatchIds?: string[];
  mainCard?: { last4: string; product?: string | null } | null;
  cycle: string;
  cards: { last4: string; ownerUserId: string | null }[];
  rows: (PreviewRow & { categoryId: string | null })[];
}

export async function confirmImport(payload: ConfirmPayload): Promise<{ error?: string; inserted?: number; learned?: number; batchId?: string; reconciled?: number }> {
  const ctx = await requireEdit("faturas");
  const hh = ctx.household.id;
  if (!/^\d{4}-\d{2}$/.test(payload.cycle)) return { error: "Ciclo inválido" };
  const cats = await loadCategories(ctx);
  const { byId } = categoryIndex(cats);

  // Fatura: o cartão é a conta-cartão da fatura (número da conta no arquivo ou final do cartão principal).
  // Os cartões adicionais (finais diferentes na mesma fatura) entram no mesmo cartão; quem gastou fica em member_user_id.
  const accounts = await loadAccounts(ctx);
  const accByLast4 = new Map<string, string>();
  let cardAccountId: string | null = null;
  if (payload.docType !== "extrato") {
    const finals = [...new Set([...payload.cards.map((c) => c.last4), ...payload.rows.map((r) => r.cardLast4).filter((x): x is string => !!x)])];
    const main = payload.mainCard?.last4 ?? payload.cards[0]?.last4 ?? null;
    const brand = brandOf(`${payload.mainCard?.product ?? ""} ${payload.fileName}`);
    const product = payload.mainCard?.product ?? null;
    const key = main ? cardKey(payload.bank, main) : fileAccountKey(payload.fileName) ?? `${payload.bank}-${Date.now()}`;
    const find = (list: unknown[]) => matchCardAccount(list as CardAcc[], { bank: payload.bank, main, finals, fileName: payload.fileName });
    let acc = find(accounts);
    if (!acc) {
      const title = product ? product.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : brand;
      const { data, error } = await ctx.supabase.from("accounts").insert({
        household_id: hh, scope: "pessoal", type: "cartao", institution: payload.bank, brand, statement_key: key, last4: main, product, known_last4: finals,
        name: `${payload.bank}${title ? ` ${title}` : ""}${main ? ` ••${main}` : ""}`,
        due_day: payload.dueDate ? Number(payload.dueDate.slice(8, 10)) : null, owner_user_id: ctx.user.id,
      }).select("*").single();
      if (data) acc = data as CardAcc;
      // Outra fatura importada ao mesmo tempo já criou o cartão: usa esse
      if (error) acc = find(await loadAccounts(ctx));
    } else {
      const known = [...new Set([...(acc.known_last4 ?? []), ...finals])];
      const upd: Record<string, unknown> = {};
      if (known.length !== (acc.known_last4 ?? []).length) upd.known_last4 = known;
      if (product && !acc.product) upd.product = product;
      if (payload.dueDate && !acc.due_day) upd.due_day = Number(payload.dueDate.slice(8, 10));
      if (Object.keys(upd).length) await ctx.supabase.from("accounts").update(upd).eq("id", acc.id);
    }
    cardAccountId = acc?.id ?? null;
    if (cardAccountId) for (const c of payload.cards) accByLast4.set(c.last4, cardAccountId);
  }
  const ownerByLast4 = new Map<string, string | null>(payload.cards.map((c) => [c.last4, c.ownerUserId] as [string, string | null]));
  const isExtrato = payload.docType === "extrato";

  // Extrato: conta corrente do banco
  let bankAccountId: string | null = null;
  if (isExtrato) {
    let acc = accounts.find((a) => a.type === "conta" && (a.institution ?? "") === payload.bank);
    if (!acc) {
      const { data } = await ctx.supabase.from("accounts").insert({
        household_id: hh, scope: "pessoal", name: `${payload.bank} · conta${payload.accountRef ? ` ${payload.accountRef}` : ""}`, type: "conta",
        institution: payload.bank, owner_user_id: ctx.user.id,
      }).select("*").single();
      if (data) acc = data as typeof accounts[number];
    }
    bankAccountId = acc?.id ?? null;
  }

  // Substituição: guarda as classificações da versão anterior e libera os identificadores
  type OldTx = { date: string; amount: number; merchant_key: string | null; category_id: string | null; notes: string | null };
  const oldByKey = new Map<string, OldTx[]>();
  let replaceIds: string[] = [];
  if (!isExtrato && payload.replacesBatchIds?.length) {
    const { data: ok } = await ctx.supabase.from("import_batches").select("id").eq("household_id", hh).eq("doc_type", "fatura").eq("account_id", cardAccountId ?? "-").eq("due_date", payload.dueDate ?? "-").in("id", payload.replacesBatchIds);
    replaceIds = ((ok ?? []) as { id: string }[]).map((b) => b.id);
    if (replaceIds.length) {
      const olds = await fetchAll(() => ctx.supabase.from("transactions").select("id, date, amount, merchant_key, category_id, notes").eq("household_id", hh).in("import_batch_id", replaceIds));
      for (const o of (olds ?? []) as OldTx[]) {
        const k = `${o.date}|${Number(o.amount).toFixed(2)}|${o.merchant_key ?? ""}`;
        oldByKey.set(k, [...(oldByKey.get(k) ?? []), o]);
      }
      await ctx.supabase.from("transactions").update({ external_hash: null }).eq("household_id", hh).in("import_batch_id", replaceIds);
    }
  }
  if (oldByKey.size) {
    for (const r of payload.rows) {
      if (r.categoryId && r.categoryId !== r.suggestedCategoryId) continue; // mudou na prévia: vale a escolha nova
      const k = `${r.date}|${r.amount.toFixed(2)}|${normalizeMerchant(r.description)}`;
      const o = oldByKey.get(k)?.shift();
      if (o?.category_id && byId.has(o.category_id)) { r.categoryId = o.category_id; if (o.notes && !r.note) r.note = o.notes; }
    }
  }

  const { data: batch, error: bErr } = await ctx.supabase.from("import_batches").insert({
    household_id: hh, source: payload.source, doc_type: isExtrato ? "extrato" : "fatura", account_id: isExtrato ? bankAccountId : cardAccountId, institution: payload.bank, file_name: payload.fileName,
    due_date: payload.dueDate, statement_total: payload.statementTotal, future_total: payload.futureTotal,
    current_total: payload.currentTotal ?? null, card_totals: payload.cardTotals ?? {}, future_items: (payload.futureItems ?? []).slice(0, 300), tx_count: payload.rows.length, created_by: ctx.user.id,
  }).select("id").single();
  if (bErr || !batch) return { error: bErr?.message ?? "Falha ao registrar importação" };

  const rows = payload.rows.map((r) => {
    const cat = r.categoryId ? byId.get(r.categoryId) : undefined;
    const kind = cat?.kind ?? "despesa";
    return {
      household_id: hh, scope: cat?.scope ?? "pessoal", date: r.date, cycle: isExtrato && /^\d{4}-\d{2}$/.test(r.cycle ?? "") ? r.cycle : payload.cycle,
      description: r.description, merchant_key: normalizeMerchant(r.description),
      amount: isExtrato && r.flow ? signedAmount(r.amount, r.flow, kind) : r.amount, flow: r.flow ?? null,
      kind, category_id: cat?.id ?? null, notes: r.note ?? null,
      reconciled_batch_id: r.reconciledBatchId && r.categoryId === r.suggestedCategoryId ? r.reconciledBatchId : null,
      card_last4: isExtrato ? null : r.cardLast4 ?? null,
      account_id: isExtrato ? bankAccountId : (r.cardLast4 ? accByLast4.get(r.cardLast4) : null) ?? cardAccountId,
      member_user_id: !isExtrato && r.cardLast4 ? ownerByLast4.get(r.cardLast4) ?? null : ctx.user.id,
      installment_no: r.installmentNo, installment_total: r.installmentTotal,
      bank_category: r.bankCategory, city: r.city, international: r.international,
      foreign_amount: r.foreignAmount, foreign_currency: r.foreignCurrency, fx_rate: r.fxRate, source: isExtrato ? "extrato" : payload.source === "fatura_pdf" ? "fatura" : payload.source,
      import_batch_id: batch.id, external_hash: r.hash, created_by: ctx.user.id,
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await ctx.supabase.from("transactions").insert(rows.slice(i, i + 500));
    if (error) {
      await ctx.supabase.from("import_batches").delete().eq("id", batch.id);
      return { error: error.message.includes("duplicate") ? "Alguns lançamentos já tinham sido importados. Recarregue a prévia." : error.message };
    }
  }

  // Versão anterior desta fatura sai (os pagamentos conciliados voltam a ser conferidos abaixo)
  if (replaceIds.length) await ctx.supabase.from("import_batches").delete().eq("household_id", hh).in("id", replaceIds);

  // Fatura importada depois do extrato: converte o pagamento já lançado em transferência
  let reconciled = 0;
  if (!isExtrato && payload.dueDate) {
    const total = Math.round(rows.reduce((a, r) => a + Number(r.amount), 0) * 100) / 100;
    reconciled = await reconcilePaymentsFor(ctx, batch.id, payload.dueDate, total, payload.statementTotal, `${payload.bank} (vence ${payload.dueDate.slice(8, 10)}/${payload.dueDate.slice(5, 7)})`, cats);
  }

  // Aprende com as correções feitas na prévia
  const learned = new Map<string, { category_id: string; scope: string }>();
  for (const r of payload.rows) {
    if (!r.categoryId || r.categoryId === r.suggestedCategoryId) continue;
    const cat = byId.get(r.categoryId);
    const mk = normalizeMerchant(r.description);
    if (cat && cat.grp !== "A classificar" && mk.length >= 3) learned.set(mk, { category_id: cat.id, scope: cat.scope });
  }
  if (learned.size) {
    await ctx.supabase.from("category_rules").upsert(
      [...learned.entries()].map(([pattern, v]) => ({ household_id: hh, pattern, match_type: "prefix", ...v, updated_at: new Date().toISOString() })),
      { onConflict: "household_id,pattern" },
    );
  }

  revalidatePath("/");
  revalidatePath("/lancamentos");
  revalidatePath("/conta");
  revalidatePath("/orcamento");
  revalidatePath("/faturas");
  return { inserted: rows.length, learned: learned.size, batchId: batch.id, reconciled };
}

export async function deleteBatch(formData: FormData) {
  const ctx = await requireEdit("faturas");
  await ctx.supabase.from("import_batches").delete().eq("id", String(formData.get("id"))).eq("household_id", ctx.household.id);
  revalidatePath("/faturas", "layout");
  revalidatePath("/");
  revalidatePath("/lancamentos");
  revalidatePath("/conta");
  redirect(formData.get("back") === "/conta" ? "/conta" : "/faturas");
}


/** Interpretações padrão do extrato (o que as regras aprendidas ainda não cobrem). Sempre ajustáveis na prévia. */
function extratoDefaults(r: PreviewRow, cats: Category[], own: Category | undefined) {
  const named = (name: string) => cats.find((c) => c.active && c.scope === "pessoal" && c.name.toLowerCase() === name.toLowerCase());
  const d = r.description.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const set = (c: Category | undefined, note: string) => { if (c) { r.suggestedCategoryId = c.id; r.suggestionSource = "interpretacao"; r.note = note; } };
  if (r.nature === "transferencia_propria") {
    const day = Number(r.date.slice(8, 10));
    return set(own, r.flow === "entrada" && /TED/.test(d) && day >= 23 && day <= 28 && r.amount >= 5000
      ? "Transferência sua (padrão). Atenção: recorrente perto do dia 25 — se for salário, mude para Salário."
      : "Transferência entre suas contas: não conta como renda nem gasto");
  }
  if (r.nature === "tarifa") return set(named("Custos Financeiros"), "Juros, IOF, seguros e tarifas do banco");
  if (r.flow === "entrada") {
    if (/ZTE DO BRASIL/.test(d)) return r.amount >= 1000
      ? set(named("Salário / Retirada PJ"), "ZTE acima de R$ 1.000: tratado como salário (ajuste se for reembolso)")
      : set(named("Reembolsos Corporativo"), "ZTE abaixo de R$ 1.000: reembolso de despesa (abate o gasto, não é renda)");
    if (/ALVVO/.test(d)) return set(named("Salário / Retirada PJ"), "Pró-labore / lucros da ALVVO");
    if (/MAINA/.test(d)) return set(named("Maína"), "Dinheiro vindo da Maína");
    return;
  }
  if (/ELETROPAULO|ENEL/.test(d)) return set(named("Luz"), "Conta de luz");
  if (/COMGAS|NATURGY/.test(d)) return set(named("Gás"), "Conta de gás");
  if (/SABESP/.test(d)) return set(named("Água"), "Conta de água");
  if (/SEM PARAR/.test(d)) return set(named("Sem Parar"), "Pedágio/estacionamento automático");
  if (/CONDOMINIO/.test(d)) return set(named("Condomínio"), "Boleto do condomínio");
}

/** Quitação de empréstimo maior que o valor emprestado: separa o principal (transferência) dos juros (despesa). */
function splitLoanInterest(rows: PreviewRow[], cats: Category[], loanCat: Category | undefined) {
  const custos = cats.find((c) => c.active && c.scope === "pessoal" && c.name === "Custos Financeiros");
  if (!custos) return;
  const ins = rows.filter((r) => r.flow === "entrada" && r.nature === "emprestimo").sort((a, b) => a.date.localeCompare(b.date));
  for (const out of rows.filter((r) => r.flow === "saida" && r.nature === "pagamento_emprestimo")) {
    const principal = ins.filter((i) => i.date <= out.date && Date.parse(out.date) - Date.parse(i.date) < 400 * 86400000).reduce((a, i) => a + i.amount, 0);
    if (!(principal > 0 && out.amount > principal)) continue;
    const juros = Math.round((out.amount - principal) * 100) / 100;
    out.amount = Math.round(principal * 100) / 100;
    if (loanCat) { out.suggestedCategoryId = loanCat.id; out.suggestionSource = "conciliacao"; }
    out.note = `Quitação do empréstimo: R$ ${out.amount.toFixed(2).replace(".", ",")} de principal (transferência) + R$ ${juros.toFixed(2).replace(".", ",")} de juros (despesa)`;
    rows.push({ ...out, idx: rows.length, description: `Juros · ${out.description}`, amount: juros, suggestedCategoryId: custos.id, suggestionSource: "interpretacao",
      nature: "tarifa", hash: createHash("sha256").update(`${out.hash}|juros`).digest("hex").slice(0, 32), note: "Juros pagos na quitação do empréstimo" });
  }
}
