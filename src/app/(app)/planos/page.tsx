import { getContext, isAdminRole } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { planoAtual } from "@/lib/planos";
import { PlanosView } from "./view";

export default async function PlanosPage() {
  const ctx = await getContext();
  const { data: int } = await ctx.supabase.from("plan_interest").select("plano, ciclo").eq("user_id", ctx.user.id).eq("household_id", ctx.household.id).maybeSingle();
  return (
    <div className="max-w-5xl">
      <PageHeader title="Free, Premium ou Família?" subtitle="O essencial para organizar as finanças é gratuito. O Premium traz a leitura automática, o banco conectado e as análises completas; o Família estende tudo para quem divide as finanças com você." />
      <PlanosView plano={planoAtual(ctx.household)} origem={ctx.household.plan_origin ?? null} ate={ctx.household.plan_until ?? null}
        interesse={(int as { plano: string; ciclo: string } | null) ?? null} podeCodigo={isAdminRole(ctx.member.role)} />
    </div>
  );
}
