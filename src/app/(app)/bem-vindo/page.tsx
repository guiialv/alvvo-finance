import { getContext } from "@/lib/context";
import type { Respostas } from "@/lib/perfil";
import { Questionario } from "./questionario";

export default async function BemVindoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const { data } = await ctx.supabase.from("member_profiles").select("answers, completed_at").eq("user_id", ctx.user.id).maybeSingle();
  const nome = (ctx.member.display_name || "").split(" ")[0] || "Olá";
  return (
    <div className="py-2 sm:py-6">
      <Questionario nome={nome} inicial={(data?.answers ?? {}) as Respostas} edicao={!!sp.editar || !!data?.completed_at} />
    </div>
  );
}
