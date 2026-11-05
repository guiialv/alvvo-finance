export const metadata = { title: "Política de Privacidade — ALVVO Finance" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-ink/80">
      <a href="/login" className="text-brand">← ALVVO Finance</a>
      <h1 className="mb-1 mt-4">Política de Privacidade</h1>
      <p className="mb-6 text-xs text-ink/50">Versão beta · atualizada em novembro de 2026</p>
      <h2 className="mt-6">Quem somos</h2>
      <p>O ALVVO Finance é uma plataforma de gestão financeira pessoal e familiar, em fase de testes fechada (beta), operada pela ALVVO. Contato: guii.alv7@gmail.com.</p>
      <h2 className="mt-6">Quais dados coletamos</h2>
      <ul className="list-disc pl-5">
        <li>Dados de cadastro: nome e e-mail. Se você entrar com o Google, recebemos só o nome, o e-mail e a foto do perfil.</li>
        <li>Dados que você mesmo registra ou importa: lançamentos, faturas de cartão, contas, orçamento, investimentos, objetivos e anotações.</li>
        <li>Registros técnicos de acesso necessários para segurança.</li>
      </ul>
      <h2 className="mt-6">Para que usamos</h2>
      <p>Somente para oferecer as funcionalidades da plataforma à sua conta: organizar suas finanças, gerar análises e permitir o compartilhamento com as pessoas que você aprovar. Não vendemos nem compartilhamos seus dados com anunciantes.</p>
      <h2 className="mt-6">Compartilhamento</h2>
      <ul className="list-disc pl-5">
        <li>Com os membros da sua conta, apenas nas áreas que o dono da conta liberar.</li>
        <li>Com provedores que operam a plataforma: Supabase (banco de dados e login), Vercel (hospedagem) e, se você ativar a inteligência artificial, a Anthropic (para ler faturas e gerar resumos).</li>
      </ul>
      <h2 className="mt-6">Segurança</h2>
      <p>Os dados ficam isolados por conta, com regras de acesso aplicadas no próprio banco de dados. Chaves de API informadas por você são guardadas criptografadas.</p>
      <h2 className="mt-6">Seus direitos (LGPD)</h2>
      <p>Você pode pedir acesso, correção, exportação ou exclusão dos seus dados a qualquer momento pelo e-mail acima.</p>
      <h2 className="mt-6">Alterações</h2>
      <p>Esta política pode mudar durante o beta. Avisaremos os usuários sobre mudanças relevantes.</p>
    </main>
  );
}
