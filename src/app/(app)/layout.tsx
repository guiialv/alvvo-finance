import { getContext, isAdminRole, visibleAreas } from "@/lib/context";
import { AREAS } from "@/lib/access";
import { ROLE_LABEL } from "@/lib/access";
import { cookies } from "next/headers";
import { Shell } from "@/components/shell";
import { signOut } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  const jar = await cookies();
  const { household, member, viewer } = ctx;
  const admin = isAdminRole(member.role) && !viewer.simulated;
  const areas = visibleAreas(ctx);
  const allowed = [...AREAS.filter(([k]) => areas.includes(k)).map(([, , href]) => href), ...(admin ? ["/acessos", "/configuracoes"] : [])];
  if (areas.includes("orcamento") || areas.includes("visao-geral")) allowed.push("/fluxo");
  if (areas.includes("faturas")) allowed.push("/conta");
  if (areas.includes("visao-geral")) allowed.push("/simulacoes");
  if (areas.includes("analise")) allowed.push("/mercado", "/mercado/carteiras");
  let pending = 0;
  if (admin) {
    const { count } = await ctx.supabase.from("household_members").select("user_id", { count: "exact", head: true }).eq("household_id", household.id).eq("status", "pendente");
    pending = count ?? 0;
  }
  return (
    <>
      {viewer.simulated && (
        <div className="sticky top-0 z-40 flex flex-wrap items-center gap-3 bg-violet-600 px-4 py-2 text-sm text-white">
          <span>👁 Você está vendo a plataforma como <b>{viewer.name}</b> ({ROLE_LABEL[viewer.role]}{viewer.txScope === "proprios" ? ", só os próprios lançamentos" : ""}). Nada pode ser alterado neste modo.</span>
          <a href="/ver-como/sair" className="ml-auto rounded-lg bg-white/15 px-3 py-1 text-xs font-medium hover:bg-white/25">Voltar a ser {member.display_name}</a>
        </div>
      )}
      <Shell allowed={allowed} badges={{ "/acessos": pending }} household={household.name} signOut={signOut}
        viewer={{ name: viewer.name, initials: viewer.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() }}
        initialCollapsed={jar.get("alvvo_nav")?.value === "min"} initialPrivacy={jar.get("alvvo_priv")?.value === "1"}>
        {children}
      </Shell>
    </>
  );
}
