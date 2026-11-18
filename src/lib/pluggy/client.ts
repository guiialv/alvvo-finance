
/**
 * Cliente mínimo da API da Pluggy (Open Finance). Só no servidor: as chaves ficam nas variáveis
 * de ambiente da Vercel (PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET) e nunca chegam ao navegador.
 */
const BASE = "https://api.pluggy.ai";

export interface PluggyItem {
  id: string;
  status: string; // UPDATED | UPDATING | LOGIN_ERROR | OUTDATED | WAITING_USER_INPUT
  executionStatus?: string | null;
  lastUpdatedAt?: string | null;
  updatedAt?: string | null;
  error?: { code?: string; message?: string } | null;
  connector?: { id: number; name: string; imageUrl?: string | null; primaryColor?: string | null } | null;
  consentExpiresAt?: string | null;
}

export interface PluggyAccount {
  id: string;
  itemId: string;
  type: "BANK" | "CREDIT" | string;
  subtype?: string | null; // CHECKING_ACCOUNT | SAVINGS_ACCOUNT | CREDIT_CARD
  number?: string | null;
  name?: string | null;
  marketingName?: string | null;
  owner?: string | null;
  balance?: number | null;
  currencyCode?: string | null;
  bankData?: { transferNumber?: string | null; closingBalance?: number | null; automaticallyInvestedBalance?: number | null } | null;
  creditData?: {
    level?: string | null; brand?: string | null; balanceCloseDate?: string | null; balanceDueDate?: string | null;
    availableCreditLimit?: number | null; creditLimit?: number | null; minimumPayment?: number | null;
  } | null;
}

export interface PluggyTransaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  descriptionRaw?: string | null;
  amount: number;
  amountInAccountCurrency?: number | null;
  currencyCode?: string | null;
  type: "DEBIT" | "CREDIT";
  status?: "POSTED" | "PENDING" | string;
  category?: string | null;
  operationType?: string | null;
  balance?: number | null;
  paymentData?: {
    payer?: { documentNumber?: { value?: string | null } | null; name?: string | null } | null;
    receiver?: { documentNumber?: { value?: string | null } | null; name?: string | null } | null;
    paymentMethod?: string | null;
  } | null;
  creditCardMetadata?: {
    installmentNumber?: number | null; totalInstallments?: number | null; totalAmount?: number | null;
    purchaseDate?: string | null; payeeMCC?: number | null; cardNumber?: string | null; billId?: string | null;
  } | null;
  merchant?: { name?: string | null; businessName?: string | null; category?: string | null } | null;
}

export interface PluggyBill {
  id: string;
  dueDate: string;
  totalAmount: number;
  totalAmountCurrencyCode?: string | null;
  minimumPaymentAmount?: number | null;
}

export interface PluggyInvestment {
  id: string;
  name: string;
  code?: string | null;
  type?: string | null;
  subtype?: string | null;
  balance?: number | null;
  amount?: number | null;
  quantity?: number | null;
  value?: number | null;
  date?: string | null;
  dueDate?: string | null;
  issuer?: string | null;
  rate?: number | null;
  rateType?: string | null;
  status?: string | null;
}

export class PluggyError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

export const pluggyConfigured = () => !!(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET);
export const envItemIds = () => (process.env.PLUGGY_ITEM_IDS ?? "").split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);

let cached: { key: string; until: number } | null = null;
async function apiKey(): Promise<string> {
  if (cached && cached.until > Date.now()) return cached.key;
  if (!pluggyConfigured()) throw new PluggyError("Chaves da Pluggy não configuradas na Vercel.");
  const r = await fetch(`${BASE}/auth`, {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
    body: JSON.stringify({ clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET }),
  });
  if (!r.ok) throw new PluggyError(r.status === 401 || r.status === 403 ? "A Pluggy recusou as chaves (Client ID/Secret). Confira as variáveis na Vercel." : `Pluggy indisponível (${r.status}).`, r.status);
  const j = (await r.json()) as { apiKey: string };
  cached = { key: j.apiKey, until: Date.now() + 100 * 60 * 1000 }; // vale 2h; renova antes
  return j.apiKey;
}

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));
  const url = `${BASE}${path}${qs.size ? `?${qs}` : ""}`;
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers: { "X-API-KEY": await apiKey() }, cache: "no-store" });
    if (r.status === 401 && attempt === 0) { cached = null; continue; }
    if (r.status === 429 && attempt < 3) { await new Promise((res) => setTimeout(res, 1500 * (attempt + 1))); continue; }
    if (!r.ok) {
      let msg = "";
      try { msg = ((await r.json()) as { message?: string }).message ?? ""; } catch { /* sem corpo */ }
      throw new PluggyError(`Pluggy ${path}: ${r.status}${msg ? ` · ${msg}` : ""}`, r.status);
    }
    return (await r.json()) as T;
  }
}

async function paged<T>(path: string, params: Record<string, string | number | undefined>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 60; page++) {
    const j = await get<{ results: T[]; totalPages?: number; page?: number }>(path, { ...params, page, pageSize: 500 });
    out.push(...(j.results ?? []));
    if (!j.totalPages || page >= j.totalPages) break;
  }
  return out;
}

export const getItem = (id: string) => get<PluggyItem>(`/items/${encodeURIComponent(id)}`);
export const listAccounts = async (itemId: string) => (await get<{ results: PluggyAccount[] }>("/accounts", { itemId })).results ?? [];
/** Lançamentos de uma conta (GET /v2/transactions, paginação por cursor). */
export async function listTransactions(accountId: string, from?: string, to?: string): Promise<PluggyTransaction[]> {
  const out: PluggyTransaction[] = [];
  let j = await get<{ results: PluggyTransaction[]; next?: string | null }>("/v2/transactions", { accountId, dateFrom: from, dateTo: to });
  for (let guard = 0; ; guard++) {
    out.push(...(j.results ?? []));
    if (!j.next || guard > 200) break;
    // `next` vem como "?accountId=...&after=..."
    const q = Object.fromEntries(new URLSearchParams(j.next.replace(/^[^?]*\?/, "")));
    j = await get<{ results: PluggyTransaction[]; next?: string | null }>("/v2/transactions", q);
  }
  return out;
}
export async function listBills(accountId: string): Promise<PluggyBill[]> {
  try { return (await get<{ results: PluggyBill[] }>("/bills", { accountId })).results ?? []; }
  catch (e) { if (e instanceof PluggyError && (e.status === 404 || e.status === 400)) return []; throw e; }
}
export async function listInvestments(itemId: string): Promise<PluggyInvestment[]> {
  try { return await paged<PluggyInvestment>("/investments", { itemId }); }
  catch (e) { if (e instanceof PluggyError && (e.status === 404 || e.status === 400)) return []; throw e; }
}
