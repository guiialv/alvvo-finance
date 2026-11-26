import Link from "next/link";
import { getContext, visibleAreas } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { TourButton } from "./tour-button";

interface Secao { id: string; titulo: string; icon: string; area?: string; bg: string; passos: [string, string][]; links: [string, string][] }

const BG = {
  ouro: "radial-gradient(90% 90% at 100% 0%, #f6dfb0 0%, rgba(246,223,176,0) 60%), linear-gradient(150deg, #fcf6ea, #f3e3c2)",
  salvia: "radial-gradient(90% 90% at 100% 0%, #dfe8d6 0%, rgba(223,232,214,0) 60%), linear-gradient(150deg, #f6f8f2, #e6eddf)",
  rose: "radial-gradient(90% 90% at 100% 0%, #f3dcd4 0%, rgba(243,220,212,0) 60%), linear-gradient(150deg, #fcf4f1, #f3e1da)",
  ardosia: "radial-gradient(90% 90% at 100% 0%, #dde3ea 0%, rgba(221,227,234,0) 60%), linear-gradient(150deg, #f6f7f9, #e4e8ee)",
  areia: "radial-gradient(90% 90% at 100% 0%, #eadbc4 0%, rgba(234,219,196,0) 60%), linear-gradient(150deg, #faf5ed, #ecdecb)",
  lilas: "radial-gradient(90% 90% at 100% 0%, #e8dde8 0%, rgba(232,221,232,0) 60%), linear-gradient(150deg, #faf7fa, #ebe1eb)",
};

const SECOES: Secao[] = [
  { id: "inicio", titulo: "Primeiros passos", icon: "spark", bg: BG.ouro, passos: [
    ["Responda ao perfil financeiro", "Momento de vida, objetivos e interesses. É com ele que a plataforma escolhe as notícias e os destaques para você."],
    ["Traga os seus dados", "Importe as faturas do cartão e os extratos da conta em PDF, ou conecte o banco pelo Open Finance, quando disponível."],
    ["Revise as categorias", "Os lançamentos chegam classificados. Ajuste o que for necessário: a plataforma aprende com cada correção."],
    ["Defina o orçamento", "Informe quanto pretende gastar por categoria. O orçamento passa a gerar alertas e alimenta o Pulso do mês."],
  ], links: [["/bem-vindo?editar=1", "Perfil financeiro"], ["/faturas/importar", "Importar faturas e extratos"], ["/orcamento", "Orçamento"]] },
  { id: "dia", titulo: "O dia a dia", icon: "home", area: "visao-geral", bg: BG.salvia, passos: [
    ["Comece pelo Início", "O resumo do mês, o ciclo em andamento, o Pulso do mês, os próximos 7 dias e as pendências estão reunidos na primeira tela."],
    ["Registre o que não vem do banco", "Use o botão “+” para lançar um gasto ou uma entrada em poucos segundos."],
    ["Acompanhe as contas", "Cadastre na Agenda as contas fixas e as receitas. Elas aparecem nos próximos 7 dias e podem ser marcadas como pagas com um toque."],
    ["Entenda para onde foi o dinheiro", "O Fluxo do dinheiro mostra, em um só gráfico, como a renda se dividiu entre despesas, investimentos e sobra."],
  ], links: [["/", "Início"], ["/agenda", "Agenda"], ["/fluxo", "Fluxo do dinheiro"], ["/lancamentos", "Lançamentos"]] },
  { id: "cartoes", titulo: "Faturas e cartões", icon: "card", area: "faturas", bg: BG.rose, passos: [
    ["Importe a fatura todo mês", "Envie o PDF assim que a fatura fechar. A plataforma confere o total com o documento e separa as parcelas."],
    ["Acompanhe as parcelas", "Em Parcelamentos você vê o que já está comprometido nos próximos meses, cartão a cartão."],
    ["Defina o propósito de cada cartão", "Associe cada cartão ao seu uso principal para facilitar a leitura das faturas."],
  ], links: [["/faturas", "Faturas"], ["/parcelamentos", "Parcelamentos"]] },
  { id: "patrimonio", titulo: "Investimentos e objetivos", icon: "trend", area: "investimentos", bg: BG.ardosia, passos: [
    ["Registre a carteira", "Lance as operações de ações, FIIs, ETFs e cripto, e os títulos de renda fixa. Cotações, resultado e alocação são calculados automaticamente."],
    ["Crie objetivos com foto", "Defina valor e prazo, ligue os investimentos de cada objetivo e adicione uma foto que represente aquela conquista."],
    ["Acompanhe o mercado", "Bolsas do mundo, câmbio, cripto e commodities, com análise técnica e fundamentalista de cada ativo."],
  ], links: [["/investimentos", "Investimentos"], ["/objetivos", "Objetivos"], ["/mercado", "Mercado"]] },
  { id: "decisoes", titulo: "Decisões e simulações", icon: "sliders", area: "visao-geral", bg: BG.areia, passos: [
    ["Posso comprar?", "Antes de uma compra relevante, informe valor e forma de pagamento. A análise mostra o impacto no orçamento, na reserva e nos objetivos, e sugere alternativas."],
    ["Tenho um valor para investir", "A plataforma sugere como dividir um aporte com base na sua reserva, nos seus objetivos e na sua carteira."],
    ["Compare cenários", "Alugar ou comprar, financiar ou juntar, meta e prazo: cada simulador já vem preenchido com os seus números."],
  ], links: [["/simulacoes/posso-comprar", "Posso comprar?"], ["/simulacoes", "Todas as simulações"]] },
  { id: "noticias", titulo: "Notícias para você", icon: "news", area: "visao-geral", bg: BG.lilas, passos: [
    ["Notícias do dia pelo seu perfil", "As principais notícias são selecionadas de acordo com os setores, investimentos e objetivos informados, além da sua carteira."],
    ["Ajuste os interesses", "Altere os setores e ativos acompanhados no perfil financeiro sempre que quiser."],
  ], links: [["/noticias", "Notícias para você"], ["/bem-vindo?editar=1", "Ajustar interesses"]] },
  { id: "familia", titulo: "Família, app e privacidade", icon: "users", bg: BG.salvia, passos: [
    ["Convide a família", "Em Membros e acessos, convide quem divide as finanças com você e defina o que cada pessoa pode ver e editar."],
    ["Instale no celular", "Adicione o Alvvo Finance à tela inicial e use o desbloqueio por Face ID ou digital."],
    ["Personalize", "Escolha as abas da barra do celular e os atalhos do Início em Personalizar."],
    ["Privacidade", "O ícone de olho oculta os valores da tela. Os dados de cada família ficam separados e protegidos."],
  ], links: [["/acessos", "Membros e acessos"], ["/instalar", "Instalar o app"], ["/menu", "Personalizar"]] },
];

export default async function TutorialPage() {
  const ctx = await getContext();
  const areas = visibleAreas(ctx);
  const secoes = SECOES.filter((s) => !s.area || areas.includes(s.area as never));
  return (
    <div className="max-w-4xl">
      <PageHeader title="Como usar o Alvvo Finance" subtitle="Um guia rápido de cada área da plataforma. Você também pode fazer o tour pelo Início, que destaca cada parte da tela.">
        <TourButton />
      </PageHeader>
      <nav className="mb-6 flex flex-wrap gap-2">
        {secoes.map((s) => <a key={s.id} href={`#${s.id}`} className="rounded-full border border-[#e2d8c6] bg-surface px-3 py-1 text-xs font-medium text-ink/70 hover:border-ink/25">{s.titulo}</a>)}
      </nav>
      <div className="space-y-4">
        {secoes.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-20 overflow-hidden rounded-[24px] shadow-[0_12px_32px_-26px_rgba(60,45,30,.55)]" style={{ background: s.bg }}>
            <div className="px-5 pb-5 pt-5 sm:px-7">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/75 text-brand"><Icon name={s.icon} className="h-5 w-5" /></span>
                <h2 className="text-[20px] font-semibold tracking-[-0.01em]">{s.titulo}</h2>
              </div>
              <ol className="mt-4 grid gap-3 sm:grid-cols-2">
                {s.passos.map(([t, d], k) => (
                  <li key={t} className="flex gap-3 rounded-2xl bg-white/60 p-3.5">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-espresso text-[11px] font-semibold text-gold">{k + 1}</span>
                    <span><span className="block text-[14px] font-semibold leading-snug">{t}</span><span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink/65">{d}</span></span>
                  </li>
                ))}
              </ol>
              <div className="mt-4 flex flex-wrap gap-2">
                {s.links.map(([href, l]) => <Link key={href} href={href} className="rounded-full bg-white/80 px-3.5 py-1.5 text-[12.5px] font-medium text-brand transition hover:bg-white">{l} →</Link>)}
              </div>
            </div>
          </section>
        ))}
      </div>
      <section className="card mt-6 flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-semibold">Ficou alguma dúvida?</p><p className="text-sm text-ink/55">Envie pelo ícone de mensagem no topo da tela, por texto, áudio ou print.</p></div>
        <TourButton className="btn-ghost" />
      </section>
    </div>
  );
}
