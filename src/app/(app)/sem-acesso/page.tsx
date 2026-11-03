import { PageHeader, Empty } from "@/components/ui";

export default function NoAccessPage() {
  return (
    <div>
      <PageHeader title="Sem acesso" subtitle="Esta área não foi liberada para você." />
      <div className="card max-w-xl"><Empty icon="users">Peça ao dono da conta para liberar esta área em Membros e acessos.</Empty></div>
    </div>
  );
}
