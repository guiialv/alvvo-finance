"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEdit } from "@/lib/context";
import { cycleOf } from "@/lib/cycle";
import { normalizeMerchant, suggestCategory, UNCATEGORIZED_KEY, type LearnedRule } from "@/lib/categorize";
import { categoryIndex, loadAccounts, loadCategories, loadMembers } from "@/lib/data";
import { PdfPasswordError, pagesToText, parseStatementFile } from "@/lib/faturas";
import { aiAvailable, aiKeyFor } from "@/lib/ai";
import { aiCategorize, aiReadStatement } from "@/lib/ai-tasks";

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
}

export interface Preview {
  error?: string;
  /** "SENHA_NECESSARIA" | "SENHA_INCORRETA" quando o PDF tem senha */
  needsPassword?: string;
  readWith?: "leitor" | "ia";
  fileName?: string;
  source?: "fatura_pdf" | "csv" | "ofx";
  bank?: string;
  dueDate?: string | null;
  statementTotal?: number | null;
  cycle?: string;
  warnings?: string[];
  rows?: PreviewRow[];
  cards?: { last4: string; total: number; accountId: string | null; ownerUserId: string | null }[];
  members?: { user_id: string; display_name: string }[];
  futureTotal?: number;
}

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

  const seen = new Map<string, number>();
  const rows: PreviewRow[] = st.transactions.map((t, idx) => {
    const base = [st.bank, t.date, t.description, t.amount.toFixed(2), t.cardLast4 ?? "", t.installmentNo ?? "", t.installmentTotal ?? ""].join("|");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const hash = createHash("sha256").update(`${base}|${n}`).digest("hex").slice(0, 32);
    const s = suggestCategory(t.description, t.bankCategory, rules);
    const suggestedCategoryId = s.categoryId ?? (s.categoryKey ? byKey.get(s.categoryKey)?.id ?? uncId : uncId);
    return {
      idx, date: t.date, description: t.description, amount: t.amount, cardLast4: t.cardLast4,
      installment: t.installmentTotal ? `${t.installmentNo}/${t.installmentTotal}` : null,
      installmentNo: t.installmentNo, installmentTotal: t.installmentTotal,
      bankCategory: t.bankCategory, city: t.city, international: t.international,
      foreignAmount: t.foreignAmount ?? null, foreignCurrency: t.foreignCurrency ?? null, fxRate: t.fxRate ?? null, suggestedCategoryId, suggestionSource: s.source,
      duplicate: false, hash,
    };
  });

  // Lançamentos que as regras não reconheceram: sugestão com IA (se ativa)
  const pending = rows.filter((r) => !r.suggestedCategoryId || r.suggestedCategoryId === uncId);
  if (pending.length && aiAvailable(ctx)) {
    try {
      const key = await aiKeyFor(ctx);
      if (key) {
        const opts = cats.filter((c) => c.active && c.grp !== "A classificar").map((c) => ({ id: c.id, label: `${c.scope === "pj" ? "PJ · " : ""}${c.grp}${c.subgroup ? " › " + c.subgroup : ""} › ${c.name}` }));
        const got = await aiCategorize(key, pending.slice(0, 150).map((r) => ({ idx: r.idx, description: r.description, amount: r.amount, bankCategory: r.bankCategory })), opts);
        for (const r of pending) if (got[r.idx]) { r.suggestedCategoryId = got[r.idx]; r.suggestionSource = "ia"; }
      }
    } catch { /* segue sem IA */ }
  }

  const hashes = rows.map((r) => r.hash);
  const existing = new Set<string>();
  for (let i = 0; i < hashes.length; i += 200) {
    const { data } = await ctx.supabase.from("transactions").select("external_hash").eq("household_id", ctx.household.id).in("external_hash", hashes.slice(i, i + 200));
    (data ?? []).forEach((d) => existing.add(d.external_hash as string));
  }
  rows.forEach((r) => (r.duplicate = existing.has(r.hash)));

  const startDay = ctx.household.cycle_start_day;
  const lower = file.name.toLowerCase();
  const source = lower.endsWith(".pdf") ? "fatura_pdf" : lower.endsWith(".ofx") || lower.endsWith(".qfx") ? "ofx" : "csv";
  const latest = rows.reduce((m, r) => (r.date > m ? r.date : m), rows[0].date);
  const cycle = cycleOf(st.dueDate ?? latest, startDay);

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
    fileName: file.name, readWith, source, bank: st.bank, dueDate: st.dueDate, statementTotal: st.statementTotal, cycle,
    warnings: st.warnings, rows, cards, members: members.map((m) => ({ user_id: m.user_id, display_name: m.display_name })),
    futureTotal: Math.round(st.futureInstallments.reduce((a, f) => a + f.amount, 0) * 100) / 100,
  };
}

export interface ConfirmPayload {
  fileName: string;
  source: "fatura_pdf" | "csv" | "ofx";
  bank: string;
  dueDate: string | null;
  statementTotal: number | null;
  futureTotal: number | null;
  cycle: string;
  cards: { last4: string; ownerUserId: string | null }[];
  rows: (PreviewRow & { categoryId: string | null })[];
}

export async function confirmImport(payload: ConfirmPayload): Promise<{ error?: string; inserted?: number; learned?: number; batchId?: string }> {
  const ctx = await requireEdit("faturas");
  const hh = ctx.household.id;
  if (!/^\d{4}-\d{2}$/.test(payload.cycle)) return { error: "Ciclo inválido" };
  const cats = await loadCategories(ctx);
  const { byId } = categoryIndex(cats);

  // Garante uma conta para cada cartão
  const accounts = await loadAccounts(ctx);
  const accByLast4 = new Map<string, string>();
  for (const c of payload.cards) {
    let acc = accounts.find((a) => a.last4 === c.last4 && (a.institution ?? "") === payload.bank);
    if (!acc) {
      const { data } = await ctx.supabase.from("accounts").insert({
        household_id: hh, scope: "pessoal", name: `${payload.bank} •••• ${c.last4}`, type: "cartao",
        institution: payload.bank, last4: c.last4, owner_user_id: c.ownerUserId,
      }).select("*").single();
      if (data) acc = data as typeof accounts[number];
    } else if (c.ownerUserId && acc.owner_user_id !== c.ownerUserId) {
      await ctx.supabase.from("accounts").update({ owner_user_id: c.ownerUserId }).eq("id", acc.id);
      acc.owner_user_id = c.ownerUserId;
    }
    if (acc) accByLast4.set(c.last4, acc.id);
  }
  const ownerByLast4 = new Map<string, string | null>(payload.cards.map((c) => [c.last4, c.ownerUserId] as [string, string | null]));

  const { data: batch, error: bErr } = await ctx.supabase.from("import_batches").insert({
    household_id: hh, source: payload.source, institution: payload.bank, file_name: payload.fileName,
    due_date: payload.dueDate, statement_total: payload.statementTotal, future_total: payload.futureTotal, tx_count: payload.rows.length, created_by: ctx.user.id,
  }).select("id").single();
  if (bErr || !batch) return { error: bErr?.message ?? "Falha ao registrar importação" };

  const rows = payload.rows.map((r) => {
    const cat = r.categoryId ? byId.get(r.categoryId) : undefined;
    return {
      household_id: hh, scope: cat?.scope ?? "pessoal", date: r.date, cycle: payload.cycle,
      description: r.description, merchant_key: normalizeMerchant(r.description), amount: r.amount,
      kind: cat?.kind ?? "despesa", category_id: cat?.id ?? null,
      account_id: r.cardLast4 ? accByLast4.get(r.cardLast4) ?? null : null,
      member_user_id: r.cardLast4 ? ownerByLast4.get(r.cardLast4) ?? null : ctx.user.id,
      installment_no: r.installmentNo, installment_total: r.installmentTotal,
      bank_category: r.bankCategory, city: r.city, international: r.international,
      foreign_amount: r.foreignAmount, foreign_currency: r.foreignCurrency, fx_rate: r.fxRate, source: payload.source === "fatura_pdf" ? "fatura" : payload.source,
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
  revalidatePath("/orcamento");
  revalidatePath("/faturas");
  return { inserted: rows.length, learned: learned.size, batchId: batch.id };
}

export async function deleteBatch(formData: FormData) {
  const ctx = await requireEdit("faturas");
  await ctx.supabase.from("import_batches").delete().eq("id", String(formData.get("id"))).eq("household_id", ctx.household.id);
  revalidatePath("/faturas", "layout");
  revalidatePath("/");
  revalidatePath("/lancamentos");
  redirect("/faturas");
}
