"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEdit } from "@/lib/context";
import { faturaIssues, PdfPasswordError, pagesToText, parseStatementFile } from "@/lib/faturas";
import { aiAvailable, aiKeyFor } from "@/lib/ai";
import { aiReadStatement } from "@/lib/ai-tasks";
import { buildPreview, commitImport, type ConfirmPayload, type Preview } from "@/lib/import-core";

export type { ConfirmPayload, FutureItem, Preview, PreviewRow } from "@/lib/import-core";

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


  return buildPreview(ctx, st, { fileName: file.name, readWith });
}

export async function confirmImport(payload: ConfirmPayload) {
  const ctx = await requireEdit("faturas");
  // Pela tela, a conta é sempre identificada pelo arquivo
  return commitImport(ctx, { ...payload, accountId: null, appendToBatchId: null, externalRef: null, externalSig: null });
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

