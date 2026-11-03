import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { cancelRequest } from "@/app/onboarding/actions";

export const dynamic = "force-dynamic";

export default async function WaitingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("household_members").select("status, display_name, created_at").eq("user_id", user.id);
  const rows = (data ?? []) as { status: string; display_name: string; created_at: string }[];
  if (!rows.length) redirect("/onboarding");
  if (rows.some((r) => r.status === "ativo")) redirect("/");
  const suspended = rows.some((r) => r.status === "suspenso");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-md">
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-amber-100 text-xl">{suspended ? "⏸" : "⏳"}</div>
        <h1 className="text-xl">{suspended ? "Acesso suspenso" : "Aguardando aprovação"}</h1>
        <p className="mt-2 text-sm text-ink/60">
          {suspended
            ? "O dono da conta suspendeu o seu acesso. Fale com ele para reativar."
            : "Seu pedido foi enviado ao dono da conta. Assim que ele aprovar, você entra e vê só as áreas liberadas para você. Pode fechar esta página e voltar depois."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a href="/aguardando" className="btn">Verificar de novo</a>
          {!suspended && <form action={cancelRequest}><button className="btn-ghost">Cancelar pedido</button></form>}
          <form action={signOut}><button className="btn-ghost">Sair</button></form>
        </div>
      </div>
    </main>
  );
}
