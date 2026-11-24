import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <OnboardingForm code={(sp.code ?? "").toUpperCase()} beta={(sp.beta ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40)} />;
}
