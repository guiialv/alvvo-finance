import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { cycleOf, todayIso } from "@/lib/cycle";
import { buildPreview, commitImport, type Preview } from "@/lib/import-core";
import type { ParsedCardTransaction, ParsedStatement } from "@/lib/faturas/types";
import type { Ctx, Household } from "@/lib/context";
import {
  envItemIds, getItem, listAccounts, listBills, listTransactions, PluggyError,
  type PluggyAccount, type PluggyBill, type PluggyTransaction,
} from "./client";

/*
 * Sincronização Open Finance (Pluggy) → mesmas tabelas das importações de PDF.
 * - Cartão: uma importação por fatura (vencimento), mais a fatura aberta (provisória, substituída quando fechar).
 * - Conta: uma importação por mês (ciclo), completada a cada sincronização.
 * - Só entra o que é posterior ao que já veio de PDF para a mesma conta (sem contar em dobro).
 * - Lançamentos têm o id da origem: sincronizar de novo não duplica.
 */

export interface LinkRow {
  id: string; household_id: string; connection_id: string; ext_account_id: string; kind: "conta" | "cartao" | "outro";
  name: string | null; number: string | null; institution: string | null; balance: number | null; credit_limit: number | null;
  available_limit: number | null; account_id: string | null; enabled: boolean; sync_from: string | null; last_sync_at: string | null;
}
export interface ConnectionRow {
  id: string; household_id: string; item_id: string; connector: string | null; status: string | null; status_detail: string | null;
  consent_expires_at: string | null; provider_updated_at: string | null; last_sync_at: string | null; last_sync_result: SyncSummary | null;
}
export interface SyncLine { link: string; label: string; rows: number; total: number; action: "importar" | "atualizar" | "sem novidades" | "erro"; detail?: string; cards?: { last4: string; rows: number; total: number }[] }
export interface SyncSummary { at: string; dryRun: boolean; lines: SyncLine[]; errors: string[] }

const brDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const last4 = (s?: string | null) => (s ?? "").replace(/\D/g, "").slice(-4) || null;
const round2 = (n: number) => Math.round(n * 100) / 100;
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Liga as conexões das variáveis de ambiente a esta conta (família), atualiza contas e saldos e
 * vincula automaticamente cada conta/cartão do banco a uma conta da plataforma (criando quando não existe),
 * do mesmo jeito que a importação de PDF faz. Tudo já fica ativo para sincronizar.
 */
export async function refreshConnections(db: SupabaseClient, householdId: string, bindEnv: boolean, ownerId?: string | null) {
  if (bindEnv) {
    for (const item of envItemIds()) {
      const { data } = await db.from("bank_connections").select("id").eq("item_id", item).maybeSingle();
      if (!data) await db.from("bank_connections").insert({ household_id: householdId, item_id: item });
    }
  }
  if (!ownerId) {
    const { data: o } = await db.from("household_members").select("user_id").eq("household_id", householdId).eq("role", "dono").limit(1).maybeSingle();
    ownerId = (o?.user_id as string | undefined) ?? null;
  }
  const { data: conns } = await db.from("bank_connections").select("*").eq("household_id", householdId);
  const errors: string[] = [];
  for (const c of (conns ?? []) as ConnectionRow[]) {
    try {
      const it = await getItem(c.item_id);
      await db.from("bank_connections").update({
        connector: it.connector?.name ?? c.connector, status: it.status, status_detail: it.error?.message ?? it.executionStatus ?? null,
        consent_expires_at: it.consentExpiresAt ?? null, provider_updated_at: it.lastUpdatedAt ?? it.updatedAt ?? null,
      }).eq("id", c.id);
      const accs = await listAccounts(c.item_id);
      for (const a of accs) {
        const kind = a.type === "CREDIT" ? "cartao" : a.type === "BANK" ? "conta" : "outro";
        const base = {
          name: a.marketingName || a.name || null, number: a.number ?? null, institution: guessInstitution(a, it.connector?.name),
          balance: a.balance ?? null, credit_limit: a.creditData?.creditLimit ?? null, available_limit: a.creditData?.availableCreditLimit ?? null,
        };
        const { data: ex } = await db.from("bank_links").select("id").eq("ext_account_id", a.id).maybeSingle();
        if (ex) await db.from("bank_links").update(base).eq("id", ex.id);
        else await db.from("bank_links").insert({ household_id: householdId, connection_id: c.id, ext_account_id: a.id, kind, ...base });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
      await db.from("bank_connections").update({ status_detail: msg }).eq("id", c.id);
    }
  }
  try { await autoLink(db, householdId, ownerId ?? null); } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
  return errors;
}

type OurAcc = { id: string; type: string; institution: string | null; last4: string | null; known_last4: string[] | null; name: string; active: boolean; statement_key: string | null };

/** Vincula cada conta do banco a uma conta da plataforma (ou cria), sem pedir nada a ninguém. */
async function autoLink(db: SupabaseClient, householdId: string, ownerId: string | null) {
  const { data: ls } = await db.from("bank_links").select("*").eq("household_id", householdId);
  const links = (ls ?? []) as LinkRow[];
  const load = async () => ((await db.from("accounts").select("id, type, institution, last4, known_last4, name, active, statement_key").eq("household_id", householdId)).data ?? []) as OurAcc[];
  let ours = await load();
  const byId = (id: string | null) => ours.find((o) => o.id === id);
  const sameInst = (o: OurAcc | undefined, inst: string | null) => !!o && !!inst && !!o.institution && norm(o.institution).split(" ")[0] === norm(inst).split(" ")[0];

  const errors: string[] = [];
  for (const l of links.filter((x) => x.kind !== "outro")) { try {
    const cur = byId(l.account_id);
    // Mantém o vínculo que já está certo (mesmo tipo e mesmo banco)
    if (cur && cur.type === (l.kind === "cartao" ? "cartao" : "conta") && (sameInst(cur, l.institution) || cur.statement_key === `of:${l.ext_account_id}`)) {
      if (!l.enabled) await db.from("bank_links").update({ enabled: true }).eq("id", l.id);
      continue;
    }
    let target: OurAcc | undefined;
    if (l.kind === "cartao") {
      // Finais dos cartões que aparecem nas compras (titular e adicionais) + final da conta do cartão
      const finals = new Set<string>();
      const n = last4(l.number); if (n) finals.add(n);
      try {
        for (const t of await listTransactions(l.ext_account_id, addDays(todayIso(), -120), todayIso())) { const f = last4(t.creditCardMetadata?.cardNumber); if (f) finals.add(f); }
      } catch (e) { throw new Error(`Não consegui ler as compras de ${l.name ?? "um cartão"} para reconhecê-lo: ${e instanceof Error ? e.message : e}`); }
      let best = 0;
      for (const o of ours.filter((x) => x.type === "cartao" && x.active !== false && (!x.institution || !l.institution || sameInst(x, l.institution)))) {
        const known = new Set([...(o.known_last4 ?? []), ...(o.last4 ? [o.last4] : [])]);
        const hit = [...finals].filter((f) => known.has(f)).length;
        if (hit > best && !links.some((x) => x.id !== l.id && x.account_id === o.id)) { best = hit; target = o; }
      }
      if (target && finals.size) {
        const merged = [...new Set([...(target.known_last4 ?? []), ...finals])];
        if (merged.length !== (target.known_last4 ?? []).length) await db.from("accounts").update({ known_last4: merged }).eq("id", target.id);
      }
      if (!target) {
        const l4 = last4(l.number) ?? [...finals][0] ?? null;
        const { data } = await db.from("accounts").insert({
          household_id: householdId, scope: "pessoal", type: "cartao", institution: l.institution, name: `${titleCase(l.name ?? "Cartão")}${l4 ? ` ••${l4}` : ""}`,
          last4: l4, known_last4: [...finals], statement_key: `of:${l.ext_account_id}`, owner_user_id: ownerId,
        }).select("id, type, institution, last4, known_last4, name, active, statement_key").single();
        target = (data as OurAcc | null) ?? undefined;
      }
    } else {
      // Conta corrente: a do mesmo banco que ainda não está ligada a outra conta do Open Finance; senão, cria
      target = ours.find((o) => o.type === "conta" && o.active !== false && sameInst(o, l.institution) && !links.some((x) => x.id !== l.id && x.account_id === o.id));
      if (!target) {
        const { data } = await db.from("accounts").insert({
          household_id: householdId, scope: "pessoal", type: "conta", institution: l.institution,
          name: uniqueName(`${l.institution ?? titleCase(l.name ?? "Banco")} · conta${l.number ? ` ${l.number}` : ""}`, ours), statement_key: `of:${l.ext_account_id}`, owner_user_id: ownerId,
        }).select("id, type, institution, last4, known_last4, name, active, statement_key").single();
        target = (data as OurAcc | null) ?? undefined;
      }
    }
    if (target) {
      await db.from("bank_links").update({ account_id: target.id, enabled: true }).eq("id", l.id);
      l.account_id = target.id;
      ours = await load();
    }
  } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); } }
  if (errors.length) throw new Error(errors.join(" · "));
}
const uniqueName = (n: string, ours: OurAcc[]) => { let k = n, i = 2; while (ours.some((o) => o.name === k)) k = `${n} (${i++})`; return k; };
const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
function guessInstitution(a: PluggyAccount, connector?: string | null) {
  const s = norm(`${a.name ?? ""} ${a.marketingName ?? ""}`);
  const known: [RegExp, string][] = [[/ITAU|PERSONNALITE/, "Itaú"], [/NUBANK|NU PAGAMENTOS/, "Nubank"], [/BRADESCO/, "Bradesco"], [/SANTANDER/, "Santander"],
    [/BANCO DO BRASIL|\bBB\b/, "Banco do Brasil"], [/CAIXA/, "Caixa"], [/INTER\b/, "Inter"], [/XP\b/, "XP"], [/BTG/, "BTG"], [/C6/, "C6"], [/SICREDI/, "Sicredi"], [/SICOOB/, "Sicoob"]];
  return known.find(([re]) => re.test(s))?.[1] ?? (connector && !/MEU ?PLUGGY/i.test(connector) ? connector : null);
}

/** Contexto para gravar como o dono da conta (usado pelo agendamento diário, sem sessão de usuário). */
export async function systemCtx(householdId: string): Promise<Ctx> {
  const db = createAdminClient();
  const { data: hh } = await db.from("households").select("id, name, invite_code, invite_expires_at, cycle_start_day, template, ai_mode, ai_included").eq("id", householdId).single();
  const { data: owner } = await db.from("household_members").select("user_id, display_name, role, status, areas, tx_scope").eq("household_id", householdId).eq("role", "dono").limit(1).single();
  if (!hh || !owner) throw new Error("Conta não encontrada para sincronizar.");
  const member = { household_id: householdId, user_id: owner.user_id, display_name: owner.display_name, role: owner.role, status: owner.status, areas: owner.areas ?? {}, tx_scope: owner.tx_scope ?? "todos" };
  return {
    supabase: db, user: { id: owner.user_id }, household: hh as Household, member,
    viewer: { userId: owner.user_id, name: owner.display_name, role: owner.role, areas: owner.areas ?? {}, txScope: owner.tx_scope ?? "todos", simulated: false }, support: null,
  } as unknown as Ctx;
}

/** Sincroniza as contas vinculadas e ativas de uma família. `dryRun` só calcula o que entraria. */
export async function syncHousehold(ctx: Ctx, opts: { dryRun?: boolean; linkIds?: string[] } = {}): Promise<SyncSummary> {
  const db = ctx.supabase;
  const summary: SyncSummary = { at: new Date().toISOString(), dryRun: !!opts.dryRun, lines: [], errors: [] };
  let q = db.from("bank_links").select("*").eq("household_id", ctx.household.id).eq("enabled", true).not("account_id", "is", null);
  if (opts.linkIds?.length) q = q.in("id", opts.linkIds);
  const { data } = await q;
  // Cartões antes das contas: os pagamentos de fatura no extrato encontram a fatura já importada
  const links = ((data ?? []) as LinkRow[]).sort((a, b) => (a.kind === "cartao" ? 0 : 1) - (b.kind === "cartao" ? 0 : 1));
  for (const link of links) {
    try {
      const lines = link.kind === "cartao" ? await syncCard(ctx, link, !!opts.dryRun) : link.kind === "conta" ? await syncConta(ctx, link, !!opts.dryRun) : [];
      summary.lines.push(...lines);
      if (!opts.dryRun) await db.from("bank_links").update({ last_sync_at: summary.at }).eq("id", link.id);
    } catch (e) {
      const msg = e instanceof PluggyError || e instanceof Error ? e.message : String(e);
      summary.errors.push(`${link.name ?? "conta"}: ${msg}`);
      summary.lines.push({ link: link.id, label: link.name ?? "conta", rows: 0, total: 0, action: "erro", detail: msg });
    }
  }
  // Saldo diário das contas (vale para prévia e sincronização: não grava lançamentos)
  const { data: contas } = await db.from("bank_links").select("*").eq("household_id", ctx.household.id).eq("kind", "conta");
  for (const l of (contas ?? []) as LinkRow[]) {
    try { await recordBankHistory(db, l); } catch (e) { summary.errors.push(`Saldo de ${l.name ?? "conta"}: ${e instanceof Error ? e.message : e}`); }
  }
  if (!opts.dryRun) {
    const conns = [...new Set(links.map((l) => l.connection_id))];
    if (conns.length) await db.from("bank_connections").update({ last_sync_at: summary.at, last_sync_result: summary }).in("id", conns);
  }
  return summary;
}

/** Lotes do Open Finance desta conta (para separar o que veio de PDF do que veio do banco). */
async function ofBatchIds(ctx: Ctx, accountId: string) {
  const { data } = await ctx.supabase.from("import_batches").select("id").eq("household_id", ctx.household.id).eq("account_id", accountId).like("external_ref", "pluggy:%");
  return ((data ?? []) as { id: string }[]).map((b) => b.id);
}

async function accountOf(ctx: Ctx, id: string) {
  const { data } = await ctx.supabase.from("accounts").select("id, name, institution, owner_user_id, due_day, closing_day, last4").eq("id", id).single();
  return data as { id: string; name: string; institution: string | null; owner_user_id: string | null; due_day: number | null; closing_day: number | null; last4: string | null };
}

const isBillPayment = (t: PluggyTransaction) => t.amount < 0 && /PAGAMENTO|PAGTO|PGTO|PAG FATURA|PAGAMENTO EFETUADO/i.test(t.description) && !/ESTORNO/i.test(t.description);
function cardRow(t: PluggyTransaction, fallbackL4: string | null): ParsedCardTransaction {
  const cc = t.creditCardMetadata ?? {};
  const foreign = t.currencyCode && t.currencyCode !== "BRL";
  const amount = foreign && t.amountInAccountCurrency != null ? t.amountInAccountCurrency : t.amount;
  return {
    date: brDate(t.date), description: t.description, amount: round2(amount), cardLast4: last4(cc.cardNumber) ?? fallbackL4, holder: null,
    installmentNo: cc.totalInstallments && cc.totalInstallments > 1 ? cc.installmentNumber ?? null : null,
    installmentTotal: cc.totalInstallments && cc.totalInstallments > 1 ? cc.totalInstallments : null,
    bankCategory: t.merchant?.category ?? t.category ?? null, city: null, international: !!foreign,
    foreignAmount: foreign ? round2(t.amount) : null, foreignCurrency: foreign ? t.currencyCode ?? null : null,
    fxRate: foreign && t.amountInAccountCurrency ? round2(Math.abs(t.amountInAccountCurrency / t.amount) * 10000) / 10000 : null,
    externalId: t.id,
  };
}
const sigOf = (txs: PluggyTransaction[]) => createHash("sha256").update(txs.map((t) => `${t.id}:${t.amount}`).sort().join("|")).digest("hex").slice(0, 24);

async function syncCard(ctx: Ctx, link: LinkRow, dryRun: boolean): Promise<SyncLine[]> {
  const acc = await accountOf(ctx, link.account_id!);
  const hh = ctx.household.id;
  // Até onde os PDFs já cobrem este cartão
  const { data: pdf } = await ctx.supabase.from("import_batches").select("due_date").eq("household_id", hh).eq("account_id", acc.id).eq("doc_type", "fatura").is("external_ref", null).order("due_date", { ascending: false }).limit(1);
  const pdfUntil = (pdf?.[0]?.due_date as string | undefined) ?? null;
  const diag: Record<string, unknown> = { card: link.name, pdfUntil };
  const floor = [pdfUntil, link.sync_from ? addDays(link.sync_from, -1) : null].filter(Boolean).sort().pop() ?? null;
  const fallbackL4 = last4(link.number) ?? acc.last4;

  const bills = (await listBills(link.ext_account_id)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const groups: { ref: string; due: string; total: number | null; txs: PluggyTransaction[]; open: boolean }[] = [];
  if (bills.length) {
    const seen = new Set<string>();
    // Uma busca só (desde ~45 dias antes da fatura mais antiga relevante) e separa por fatura
    const firstDue = brDate(bills.find((b) => brDate(b.dueDate) >= addDays(todayIso(), -370))?.dueDate ?? bills[0].dueDate);
    const all = await listTransactions(link.ext_account_id, addDays(firstDue, -50), todayIso());
    const byBill = new Map<string, PluggyTransaction[]>();
    for (const t of all) { const id = t.creditCardMetadata?.billId; if (id) byBill.set(id, [...(byBill.get(id) ?? []), t]); }
    diag.txs = all.length; diag.withBill = all.filter((t) => t.creditCardMetadata?.billId).length;
    diag.unknownBill = all.filter((t) => t.creditCardMetadata?.billId && !bills.some((b) => b.id === t.creditCardMetadata?.billId)).length;
    diag.dates = all.length ? [brDate(all.map((t) => t.date).sort()[0]), brDate(all.map((t) => t.date).sort().pop()!)] : [];
    diag.finals = [...new Set(all.map((t) => last4(t.creditCardMetadata?.cardNumber) ?? "-"))];
    if (!byBill.size && all.length) {
      // Banco não informa a fatura de cada compra: usa o fechamento (~8 dias antes do vencimento) de cada fatura
      const dues = bills.map((b) => ({ id: b.id, close: addDays(brDate(b.dueDate), -8) }));
      for (const t of all) {
        const d = brDate(t.date), b = dues.find((x) => d <= x.close && d > addDays(x.close, -32));
        if (b) byBill.set(b.id, [...(byBill.get(b.id) ?? []), t]);
      }
    }
    for (const b of bills) {
      const due = brDate(b.dueDate);
      const txs = byBill.get(b.id) ?? [];
      txs.forEach((t) => seen.add(t.id));
      if (pdfUntil && due <= pdfUntil) {
        // Fatura que já veio em PDF: o PDF vale; o Open Finance só é conferido contra ele
        if (due >= addDays(todayIso(), -370)) await compareBill(ctx, acc, due, txs.filter((t) => (t.status ?? "POSTED") === "POSTED" && !isBillPayment(t)), fallbackL4);
        continue;
      }
      if (floor && due <= floor) continue;
      if (!floor && due < addDays(todayIso(), -370)) continue; // sem PDF: até 12 meses (o que o banco libera)
      groups.push({ ref: `pluggy:bill:${b.id}`, due, total: b.totalAmount ?? null, txs, open: false });
    }
    // Fatura aberta: lançamentos sem fatura ainda
    const lastDue = brDate(bills[bills.length - 1].dueDate);
    // Compras sem fatura, ou de uma fatura que o banco ainda não listou (a aberta)
    const closedIds = new Set(bills.map((b) => b.id));
    const open = all.filter((t) => !seen.has(t.id) && (!t.creditCardMetadata?.billId || !closedIds.has(t.creditCardMetadata.billId)) && brDate(t.date) >= addDays(lastDue, -25));
    if (open.length) groups.push({ ref: `pluggy:open:${link.ext_account_id}`, due: nextDue(lastDue, acc.due_day), total: null, txs: open, open: true });
  } else {
    // Banco sem faturas na API: agrupa pelo vencimento calculado (dia de vencimento do cartão)
    const from = floor ? addDays(floor, -35) : addDays(todayIso(), -370);
    const txs = await listTransactions(link.ext_account_id, from, todayIso());
    const dueDay = acc.due_day ?? 10, closeDay = acc.closing_day ?? ((dueDay + 23) % 30 || 30);
    const byDue = new Map<string, PluggyTransaction[]>();
    for (const t of txs) { const d = dueFor(brDate(t.date), closeDay, dueDay); byDue.set(d, [...(byDue.get(d) ?? []), t]); }
    for (const [due, list] of [...byDue.entries()].sort()) {
      if (floor && due <= floor) continue;
      groups.push({ ref: `pluggy:due:${link.ext_account_id}:${due}`, due, total: null, txs: list, open: due > todayIso() });
    }
  }

  diag.bills = bills.map((b) => `${brDate(b.dueDate)}:${b.totalAmount}`);
  diag.groups = groups.map((g) => `${g.ref.split(":")[1]}:${g.due}:${g.txs.length}`);
  console.log("[openfinance:diag]", JSON.stringify(diag));
  const out: SyncLine[] = [];
  if (!groups.length) out.push({ link: link.id, label: acc.name, rows: 0, total: 0, action: "sem novidades", detail: `faturas no banco: ${bills.length}${bills.length ? ` (última vence ${brDate(bills[bills.length - 1].dueDate).split("-").reverse().join("/")})` : ""}` });
  for (const g of groups) {
    const txs = g.txs.filter((t) => (t.status ?? "POSTED") === "POSTED" && !isBillPayment(t));
    const sig = sigOf(txs);
    const { data: prev } = await ctx.supabase.from("import_batches").select("id, external_sig").eq("household_id", hh).eq("external_ref", g.ref).limit(1);
    const label = `${acc.name} · vence ${g.due.slice(8, 10)}/${g.due.slice(5, 7)}${g.open ? " (aberta)" : ""}`;
    if (prev?.[0]?.external_sig === sig) { out.push({ link: link.id, label, rows: txs.length, total: 0, action: "sem novidades" }); continue; }
    if (!txs.length) continue;
    const st: ParsedStatement = {
      docType: "fatura", bank: acc.institution ?? link.institution ?? "Cartão", holder: null, dueDate: g.due, closingDate: null,
      statementTotal: g.total != null ? round2(g.total) : null, transactions: txs.map((t) => cardRow(t, fallbackL4)),
      cardTotals: {}, futureInstallments: [], currentTotal: null, mainCard: fallbackL4 ? { last4: fallbackL4 } : null, warnings: [],
    };
    const res = await importStatement(ctx, st, { fileName: `Open Finance · ${label}`, accountId: acc.id, ownerUserId: acc.owner_user_id, externalRef: g.ref, externalSig: sig, replaceRefs: g.open ? [] : [`pluggy:open:${link.ext_account_id}`], dryRun });
    out.push({ link: link.id, label, rows: res.rows, total: res.total, action: prev?.length ? "atualizar" : "importar", detail: res.error, cards: res.cards });
  }
  return out;
}

/** Próximo vencimento depois de `after`, no dia de vencimento do cartão (ou ~1 mês depois). */
function nextDue(after: string, dueDay: number | null) {
  const [y, m] = after.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  const day = dueDay ?? Number(after.slice(8, 10));
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(day, 28)).padStart(2, "0")}`;
}
/** Vencimento de uma compra: fecha no `closeDay`; vence no `dueDay` seguinte ao fechamento. */
function dueFor(date: string, closeDay: number, dueDay: number) {
  let [y, m] = date.split("-").map(Number);
  if (Number(date.slice(8, 10)) > closeDay) { m++; if (m > 12) { m = 1; y++; } }
  if (dueDay <= closeDay) { m++; if (m > 12) { m = 1; y++; } }
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(dueDay, 28)).padStart(2, "0")}`;
}

function natureOf(t: PluggyTransaction, ownDoc: string | null): string | null {
  const op = (t.operationType ?? "").toUpperCase();
  const payer = t.paymentData?.payer?.documentNumber?.value?.replace(/\D/g, ""), receiver = t.paymentData?.receiver?.documentNumber?.value?.replace(/\D/g, "");
  if (payer && receiver && payer === receiver) return "transferencia_propria";
  if (ownDoc && ((t.type === "DEBIT" && receiver === ownDoc) || (t.type === "CREDIT" && payer === ownDoc))) return "transferencia_propria";
  if (/TARIFA|ENCARGOS|JUROS|IOF/.test(op)) return "tarifa";
  if (/RENDIMENTO_APLIC|RESGATE_APLIC|APLICACAO/.test(op)) return "aplicacao_automatica";
  if (op === "OPERACAO_CREDITO") return t.type === "CREDIT" ? "emprestimo" : "pagamento_emprestimo";
  return null;
}

async function syncConta(ctx: Ctx, link: LinkRow, dryRun: boolean): Promise<SyncLine[]> {
  const acc = await accountOf(ctx, link.account_id!);
  const hh = ctx.household.id;
  // Até onde os extratos em PDF já cobrem esta conta (lançamentos que não vieram do Open Finance)
  const ofIds = await ofBatchIds(ctx, acc.id);
  let lq = ctx.supabase.from("transactions").select("date").eq("household_id", hh).eq("account_id", acc.id).eq("source", "extrato");
  if (ofIds.length) lq = lq.not("import_batch_id", "in", `(${ofIds.join(",")})`);
  const { data: last, error: lastErr } = await lq.order("date", { ascending: false }).limit(1);
  if (lastErr) throw new Error(`Não consegui ver até onde vão os extratos em PDF: ${lastErr.message}`);
  const pdfUntil = (last?.[0]?.date as string | undefined) ?? null;
  const start = [pdfUntil ? addDays(pdfUntil, 1) : null, link.sync_from].filter(Boolean).sort().pop() ?? addDays(todayIso(), -365);
  if (pdfUntil) await compareConta(ctx, link, acc, pdfUntil);
  const txs = (await listTransactions(link.ext_account_id, start, todayIso())).filter((t) => (t.status ?? "POSTED") === "POSTED" && brDate(t.date) >= start);
  // CPF do titular (para reconhecer transferências entre as próprias contas)
  const ownDoc = txs.map((t) => (t.type === "DEBIT" ? t.paymentData?.payer : t.paymentData?.receiver)?.documentNumber?.value?.replace(/\D/g, "")).find((d) => d && d.length === 11) ?? null;
  const startDay = ctx.household.cycle_start_day;
  const byCycle = new Map<string, PluggyTransaction[]>();
  for (const t of txs) { const c = cycleOf(brDate(t.date), startDay); byCycle.set(c, [...(byCycle.get(c) ?? []), t]); }
  const out: SyncLine[] = [];
  for (const [cycle, list] of [...byCycle.entries()].sort()) {
    const ref = `pluggy:conta:${link.ext_account_id}:${cycle}`;
    const { data: prev } = await ctx.supabase.from("import_batches").select("id").eq("household_id", hh).eq("external_ref", ref).limit(1);
    const st: ParsedStatement = {
      docType: "extrato", bank: acc.institution ?? link.institution ?? "Banco", holder: null, dueDate: null, closingDate: null, statementTotal: null,
      cardTotals: {}, futureInstallments: [], currentTotal: null, warnings: [],
      transactions: list.map((t) => ({
        date: brDate(t.date), description: t.description, amount: round2(Math.abs(t.amount)), flow: t.type === "CREDIT" ? "entrada" : "saida",
        nature: natureOf(t, ownDoc), cardLast4: null, holder: null, installmentNo: null, installmentTotal: null,
        bankCategory: t.category ?? null, city: null, international: false, externalId: t.id,
      })),
    };
    const label = `${acc.name} · ${cycle.slice(5, 7)}/${cycle.slice(0, 4)}`;
    const res = await importStatement(ctx, st, { fileName: `Open Finance · ${label}`, accountId: acc.id, ownerUserId: acc.owner_user_id, externalRef: ref, appendTo: (prev?.[0]?.id as string | undefined) ?? null, dryRun });
    out.push({ link: link.id, label, rows: res.rows, total: res.total, action: res.rows ? (prev?.length ? "atualizar" : "importar") : "sem novidades", detail: res.error });
  }
  if (!byCycle.size) out.push({ link: link.id, label: acc.name, rows: 0, total: 0, action: "sem novidades" });
  return out;
}

async function importStatement(ctx: Ctx, st: ParsedStatement, o: { fileName: string; accountId: string; ownerUserId: string | null; externalRef: string; externalSig?: string; appendTo?: string | null; replaceRefs?: string[]; dryRun: boolean }) {
  // Fatura: substitui a versão anterior desta mesma fatura (e a provisória "aberta", quando ela fecha)
  let replaces: string[] = [];
  if (st.docType === "fatura") {
    const { data } = await ctx.supabase.from("import_batches").select("id").eq("household_id", ctx.household.id).eq("account_id", o.accountId).in("external_ref", [o.externalRef, ...(o.replaceRefs ?? [])]);
    replaces = ((data ?? []) as { id: string }[]).map((b) => b.id);
  }
  const p: Preview = await buildPreview(ctx, st, { fileName: o.fileName, source: "open_finance", accountId: o.accountId, replaces });
  const fresh = (p.rows ?? []).filter((r) => !r.duplicate);
  const signed = fresh.reduce((a, r) => a + (r.flow === "entrada" ? r.amount : r.flow === "saida" ? -r.amount : r.amount), 0);
  // Fatura: quanto de cada final de cartão (titular, adicionais e virtuais)
  const per = new Map<string, { rows: number; total: number }>();
  if (st.docType === "fatura") for (const r of fresh) { const k = r.cardLast4 ?? "?"; const v = per.get(k) ?? { rows: 0, total: 0 }; v.rows++; v.total = round2(v.total + r.amount); per.set(k, v); }
  const cards = [...per.entries()].map(([last4, v]) => ({ last4, ...v })).sort((a, b) => b.total - a.total);
  if (o.dryRun || !fresh.length) return { rows: fresh.length, total: round2(signed), cards };
  const res = await commitImport(ctx, {
    fileName: o.fileName, source: "open_finance", docType: st.docType, accountRef: null, bank: st.bank, dueDate: st.dueDate, statementTotal: st.statementTotal,
    futureTotal: null, futureItems: [], cardTotals: {}, currentTotal: null, replacesBatchIds: p.replacesBatchIds ?? [], mainCard: st.mainCard ?? null,
    cycle: p.cycle ?? cycleOf(todayIso(), ctx.household.cycle_start_day),
    cards: (p.cards ?? []).map((c) => ({ last4: c.last4, ownerUserId: o.ownerUserId ?? c.ownerUserId })),
    rows: fresh.map((r) => ({ ...r, categoryId: r.suggestedCategoryId })),
    accountId: o.accountId, appendToBatchId: o.appendTo ?? null, externalRef: o.externalRef, externalSig: o.externalSig ?? null,
  });
  return { rows: res.inserted ?? 0, total: round2(signed), error: res.error, cards };
}

// ---------- Comparação PDF × Open Finance ----------
type Item = { date: string; description: string; amount: number };
function matchItems(pdf: Item[], of: Item[], tolDays = 3) {
  const used = new Set<number>();
  const onlyPdf: Item[] = [];
  let matched = 0;
  for (const p of [...pdf].sort((a, b) => a.date.localeCompare(b.date))) {
    let best = -1, bestGap = Infinity;
    of.forEach((o, i) => {
      if (used.has(i) || Math.round(o.amount * 100) !== Math.round(p.amount * 100)) return;
      const gap = Math.abs(Date.parse(o.date) - Date.parse(p.date)) / 86400000;
      if (gap <= tolDays && gap < bestGap) { best = i; bestGap = gap; }
    });
    if (best >= 0) { used.add(best); matched++; } else onlyPdf.push(p);
  }
  // 2ª passada (mesma fatura): mesmo valor com data diferente — parcelas vêm com a data da compra no PDF e a da parcela no banco
  if (tolDays >= 3) {
    for (let k = onlyPdf.length - 1; k >= 0; k--) {
      const p = onlyPdf[k];
      const i = of.findIndex((o, j) => !used.has(j) && Math.round(o.amount * 100) === Math.round(p.amount * 100));
      if (i >= 0) { used.add(i); matched++; onlyPdf.splice(k, 1); }
    }
  }
  return { matched, onlyPdf, onlyOf: of.filter((_, i) => !used.has(i)) };
}
const sum = (l: Item[]) => round2(l.reduce((a, x) => a + x.amount, 0));

async function saveComparison(ctx: Ctx, accountId: string, kind: "fatura" | "mes", ref: string, label: string, pdf: Item[], of: Item[]) {
  const m = matchItems(pdf, of, kind === "fatura" ? 3 : 2);
  await ctx.supabase.from("source_comparisons").upsert({
    household_id: ctx.household.id, account_id: accountId, kind, ref, label,
    pdf_count: pdf.length, pdf_total: sum(pdf), of_count: of.length, of_total: sum(of), matched: m.matched,
    only_pdf: m.onlyPdf.slice(0, 60), only_of: m.onlyOf.slice(0, 60), updated_at: new Date().toISOString(),
  }, { onConflict: "account_id,kind,ref" });
}

async function compareBill(ctx: Ctx, acc: { id: string; name: string }, due: string, txs: PluggyTransaction[], l4: string | null) {
  const { data: b } = await ctx.supabase.from("import_batches").select("id").eq("household_id", ctx.household.id).eq("account_id", acc.id).eq("doc_type", "fatura")
    .is("external_ref", null).gte("due_date", addDays(due, -5)).lte("due_date", addDays(due, 5)).limit(1);
  const batch = b?.[0]?.id as string | undefined;
  if (!batch) return;
  const rows = (await ctx.supabase.from("transactions").select("date, description, amount").eq("import_batch_id", batch)).data ?? [];
  const pdf = (rows as { date: string; description: string; amount: number }[]).map((r) => ({ date: r.date, description: r.description, amount: round2(Number(r.amount)) }));
  const of = txs.map((t) => { const r = cardRow(t, l4); return { date: r.date, description: r.description, amount: r.amount }; });
  await saveComparison(ctx, acc.id, "fatura", due, `${acc.name} · vence ${due.slice(8, 10)}/${due.slice(5, 7)}/${due.slice(0, 4)}`, pdf, of);
}

async function compareConta(ctx: Ctx, link: LinkRow, acc: { id: string; name: string }, pdfUntil: string) {
  const from = addDays(pdfUntil, -370);
  const ofIds = await ofBatchIds(ctx, acc.id);
  let q = ctx.supabase.from("transactions").select("date, description, amount, flow").eq("household_id", ctx.household.id)
    .eq("account_id", acc.id).eq("source", "extrato").gte("date", from).lte("date", pdfUntil);
  if (ofIds.length) q = q.not("import_batch_id", "in", `(${ofIds.join(",")})`);
  const { data } = await q;
  const pdfRows = (data ?? []) as { date: string; description: string; amount: number; flow: string | null }[];
  if (!pdfRows.length) return;
  const signed = (flow: string | null, v: number) => round2((flow === "entrada" ? 1 : -1) * Math.abs(v));
  const of = (await listTransactions(link.ext_account_id, pdfRows.map((r) => r.date).sort()[0], pdfUntil)).filter((t) => (t.status ?? "POSTED") === "POSTED");
  const startDay = ctx.household.cycle_start_day;
  const byCycle = new Map<string, { pdf: Item[]; of: Item[] }>();
  const slot = (c: string) => byCycle.get(c) ?? byCycle.set(c, { pdf: [], of: [] }).get(c)!;
  for (const r of pdfRows) slot(cycleOf(r.date, startDay)).pdf.push({ date: r.date, description: r.description, amount: signed(r.flow, r.amount) });
  for (const t of of) { const d = brDate(t.date); if (d > pdfUntil) continue; slot(cycleOf(d, startDay)).of.push({ date: d, description: t.description, amount: signed(t.type === "CREDIT" ? "entrada" : "saida", t.amount) }); }
  for (const [cycle, v] of byCycle) {
    if (!v.pdf.length) continue;
    // Só o trecho que o PDF cobre dentro do mês
    const lo = v.pdf.map((x) => x.date).sort()[0], hi = v.pdf.map((x) => x.date).sort().pop()!;
    await saveComparison(ctx, acc.id, "mes", cycle, `${acc.name} · ${cycle.slice(5, 7)}/${cycle.slice(0, 4)}`, v.pdf, v.of.filter((x) => x.date >= lo && x.date <= hi));
  }
}

// ---------- Saldo diário da conta no banco ----------
/** Reconstrói o saldo de cada dia (12 meses) a partir do saldo atual e dos lançamentos do banco. */
export async function recordBankHistory(db: SupabaseClient, link: LinkRow) {
  if (link.kind !== "conta" || link.balance == null) return 0;
  const today = todayIso(), from = addDays(today, -365);
  const txs = (await listTransactions(link.ext_account_id, from, today)).filter((t) => (t.status ?? "POSTED") === "POSTED");
  const inflow = new Map<string, number>(), outflow = new Map<string, number>();
  for (const t of txs) {
    const d = brDate(t.date), v = Math.abs(t.amount);
    if (t.type === "CREDIT") inflow.set(d, (inflow.get(d) ?? 0) + v); else outflow.set(d, (outflow.get(d) ?? 0) + v);
  }
  const first = txs.length ? txs.map((t) => brDate(t.date)).sort()[0] : today;
  const rows: { link_id: string; household_id: string; date: string; balance: number; inflow: number; outflow: number }[] = [];
  let bal = Number(link.balance);
  for (let d = today; d >= first; d = addDays(d, -1)) {
    const i = round2(inflow.get(d) ?? 0), o = round2(outflow.get(d) ?? 0);
    rows.push({ link_id: link.id, household_id: link.household_id, date: d, balance: round2(bal), inflow: i, outflow: o });
    bal -= i - o; // saldo no fim do dia anterior
  }
  for (let i = 0; i < rows.length; i += 400) await db.from("bank_daily").upsert(rows.slice(i, i + 400), { onConflict: "link_id,date" });
  return rows.length;
}

/** Atualiza saldos e o histórico diário de todas as contas do banco (sem importar lançamentos). */
export async function refreshBalances(db: SupabaseClient, householdId: string, ownerId?: string | null) {
  const errors = await refreshConnections(db, householdId, false, ownerId);
  const { data } = await db.from("bank_links").select("*").eq("household_id", householdId).eq("kind", "conta");
  for (const l of (data ?? []) as LinkRow[]) {
    try { await recordBankHistory(db, l); } catch (e) { errors.push(`${l.name ?? "conta"}: ${e instanceof Error ? e.message : e}`); }
  }
  return errors;
}

export const describeLine = (l: SyncLine) => `${l.label}: ${l.action === "erro" ? `erro — ${l.detail}` : l.action === "sem novidades" ? "sem novidades" : `${l.rows} lançamento(s), ${brl(Math.abs(l.total))}`}`;
export type { PluggyBill };
