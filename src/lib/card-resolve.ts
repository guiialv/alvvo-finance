import type { Account } from "@/lib/data";

export type CardAcc = Account & { statement_key?: string | null; merged_keys?: string[] | null; known_last4?: string[] | null; product?: string | null };

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, "-");

/** Chave estável da linha do cartão: banco + final do cartão principal informado na fatura. */
export const cardKey = (bank: string, mainLast4: string) => `${slug(bank)}-cartao-${mainLast4}`;

/** Número de conta no nome do arquivo (alguns bancos), ignorando datas/horas de download. */
export function fileAccountKey(fileName: string): string | null {
  const clean = fileName.replace(/(19|20)\d{6}[-_ ]?\d{4,6}/g, " ").replace(/\d{2}[-_.]\d{2}[-_.]\d{4}/g, " ");
  const n = [...clean.matchAll(/\d{8,}/g)].map((m) => m[0]).find((x) => !/^(19|20)\d{2}(0[1-9]|1[0-2])\d{2}$/.test(x));
  return n ?? null;
}

/**
 * Encontra a conta-cartão de uma fatura. Nunca junta cartões “por ser do mesmo banco”:
 * precisa bater o cartão principal, um final já visto neste cartão, ou o número da conta do arquivo.
 */
export function matchCardAccount(accounts: CardAcc[], o: { bank: string; main: string | null; finals: string[]; fileName: string }): CardAcc | undefined {
  const cards = accounts.filter((a) => a.type === "cartao");
  const sameBank = (a: CardAcc) => slug(a.institution ?? "") === slug(o.bank);
  if (o.main) {
    const k = cardKey(o.bank, o.main);
    const hit = cards.find((a) => a.statement_key === k || (a.merged_keys ?? []).includes(k))
      ?? cards.find((a) => sameBank(a) && (a.last4 === o.main || (a.known_last4 ?? []).includes(o.main!)));
    if (hit) return hit;
  }
  const finals = o.finals.filter(Boolean);
  if (finals.length) {
    const hit = cards.find((a) => sameBank(a) && finals.some((f) => a.last4 === f || (a.known_last4 ?? []).includes(f)));
    if (hit) return hit;
  }
  const fk = fileAccountKey(o.fileName);
  if (fk) return cards.find((a) => a.statement_key === fk || (a.merged_keys ?? []).includes(fk));
  return undefined;
}
