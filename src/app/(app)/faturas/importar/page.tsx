import Link from "next/link";
import { requireArea } from "@/lib/context";
import { loadCategories } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ImportWizard, type CatOpt } from "../import-wizard";

export const maxDuration = 300;

export default async function ImportarFaturaPage() {
  const ctx = await requireArea("faturas");
  const cats = await loadCategories(ctx);
  const options: CatOpt[] = cats.filter((c) => c.active).map((c) => ({
    id: c.id, label: c.subgroup ? `${c.name} · ${c.subgroup}` : c.name, group: `${c.scope === "pj" ? "PJ · " : ""}${c.grp}`,
  }));
  return (
    <div>
      <Link href="/faturas" className="mb-4 inline-flex items-center gap-1 text-sm text-ink/55 hover:text-ink"><Icon name="left" /> Faturas</Link>
      <PageHeader title="Importar faturas" subtitle="Envie quantas faturas quiser, de qualquer banco (PDF, CSV ou OFX). A plataforma lê cada item, sugere a categoria e aprende com as suas correções." />
      <ImportWizard options={options} />
    </div>
  );
}
