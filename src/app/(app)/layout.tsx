import { getContext, isAdminRole, visibleAreas } from "@/lib/context";
import { AREAS } from "@/lib/access";
import { ROLE_LABEL } from "@/lib/access";
import { Nav } from "@/components/nav";
import { Avatar } from "@/components/ui";
import { signOut } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  const { household, member, viewer } = ctx;
  const admin = isAdminRole(member.role) && !viewer.simulated;
  const areas = visibleAreas(ctx);
  const allowed = [...AREAS.filter(([k]) => areas.includes(k)).map(([, , href]) => href), ...(admin ? ["/acessos", "/configuracoes"] : [])];
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
      <div className="min-h-screen md:flex">
        <aside className="bg-ink text-white md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col">
          <div className="flex items-center gap-3 p-4 md:p-5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-teal-500 to-brand font-bold shadow-lg shadow-brand/30">A</div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight">{household.name}</div>
              <div className="text-xs text-white/45">ALVVO Finance</div>
            </div>
          </div>
          <Nav allowed={allowed} badges={{ "/acessos": pending }} />
          <div className="hidden border-t border-white/5 p-4 md:block">
            <div className="flex items-center gap-3">
              <Avatar name={viewer.name} index={viewer.role === "dono" ? 0 : 1} size="h-8 w-8 text-xs" />
              <div className="flex-1 text-sm">
                <div className="font-medium">{viewer.name}</div>
                <form action={signOut}><button className="text-xs text-white/40 hover:text-white">Sair</button></form>
              </div>
            </div>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-9"><div className="mx-auto max-w-[1280px]">{children}</div></main>
      </div>
    </>
  );
}
