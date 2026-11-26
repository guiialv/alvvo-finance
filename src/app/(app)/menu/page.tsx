import { getContext, isAdminRole, visibleAreas } from "@/lib/context";
import { AREAS } from "@/lib/access";
import { PageHeader } from "@/components/ui";
import { activeTabs, TAB_OPTIONS } from "@/lib/mobile-tabs";
import { TabsEditor } from "./editor";
import { HomeToolsEditor } from "./tools-editor";
import { HOME_TOOLS, activeTools } from "@/lib/home-tools";

export default async function MenuPage() {
  const ctx = await getContext();
  const areas = visibleAreas(ctx);
  // Mesmas regras de acesso do menu lateral
  const allowed = [...AREAS.filter(([k]) => areas.includes(k)).map(([, , href]) => href), ...(isAdminRole(ctx.member.role) ? ["/acessos"] : [])];
  if (areas.includes("orcamento") || areas.includes("visao-geral")) allowed.push("/fluxo");
  if (areas.includes("faturas")) allowed.push("/conta");
  if (areas.includes("visao-geral")) allowed.push("/simulacoes");
  if (areas.includes("analise")) allowed.push("/mercado");
  const { data: me } = await ctx.supabase.from("household_members").select("prefs").eq("household_id", ctx.household.id).eq("user_id", ctx.user.id).maybeSingle();
  const options = TAB_OPTIONS.filter(([h]) => allowed.includes(h));
  return (
    <div className="max-w-3xl">
      <PageHeader title="Personalizar" subtitle="Atalhos da página inicial e barra do celular. Na barra, escolha as 4 abas da barra de baixo, na ordem em que quer vê-las. O “+” de lançar fica no topo; o que ficar de fora continua no Mais e no menu completo." />
      <TabsEditor current={activeTabs((me?.prefs as { menu?: unknown } | null)?.menu, allowed)} options={options} />
      <div className="mt-6"><HomeToolsEditor current={activeTools((me?.prefs as { homeTools?: unknown } | null)?.homeTools, allowed).map((t) => t.key)} options={HOME_TOOLS.filter((t) => allowed.includes(t.need))} /></div>
    </div>
  );
}
