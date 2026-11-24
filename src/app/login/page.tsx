import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  // Link de convite do beta (/login?beta=CODIGO): abre em "Criar conta" e leva o código até a criação da família
  const beta = (sp.beta ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40);
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : beta ? `/onboarding?beta=${encodeURIComponent(beta)}` : "/";
  return <LoginForm next={next} googleError={sp.erro === "google"} beta={beta} startMode={beta || sp.criar ? "criar" : "entrar"} />;
}
