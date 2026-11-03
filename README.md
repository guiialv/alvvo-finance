# ALVVO Finance

Plataforma de gestão financeira: orçamento por ciclo, lançamentos, importação automática de faturas (Itaú, OFX, CSV e qualquer banco com IA),
visão PJ, investimentos com cotações, objetivos, análise de ações e de renda fixa, e contas compartilhadas com aprovação do dono.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres + login) · Vercel

## Módulos

| Módulo | O que faz |
|---|---|
| **Login e família** | Cada pessoa tem o próprio login. A Maína entra com o código de convite e vocês compartilham os dados. Segurança por linha (RLS): ninguém de fora enxerga nada. |
| **Agenda** | Datas de fechamento e vencimento dos cartões, contas a pagar e receitas, calendário do mês, próximos 30 dias, atrasos e “marcar como pago”, que já cria o lançamento. |
| **Parcelamentos** | Compras parceladas mês a mês: quais ainda estão no cartão, a que se referem, parcela atual, valor a vencer e projeção das próximas faturas (confere com o “Compras parceladas — próximas faturas” do PDF). |
| **Insights** | Análises automáticas e explicáveis: aumento de preço em cobranças recorrentes (ex.: internet, assinaturas), gastos acima do normal, ritmo do orçamento, taxa de poupança, reserva de emergência sugerida, parcelas comprometendo a renda, IOF pago, possíveis cobranças duplicadas, juros/tarifas, vencimentos e pendências da agenda. Cada insight pode ser dispensado. |
| **Visão geral** | Receitas, despesas, investido e saldo do ciclo, despesas por grupo, últimos 6 ciclos, maiores categorias e alertas de limite. |
| **Orçamento** | As mesmas categorias da planilha (Fixas, Variáveis, Extras, Adicionais). Orçado × realizado por ciclo, com limites e alertas a partir de 80%. Visão anual igual à da planilha, com % sobre a receita e saldo. Preenchimento automático (copiar o ciclo anterior ou usar a média dos últimos 3). |
| **Lançamentos** | Lista por ciclo com busca, filtro "a classificar", lançamento manual (inclusive parcelado) e troca de categoria com **aprendizado**: ao corrigir, a plataforma cria uma regra e aplica aos lançamentos iguais. |
| **Faturas do cartão** | Lista das faturas importadas e o detalhe de cada uma, item a item e separado por cartão, com o painel lateral que mostra como cada gasto foi lançado e permite mudar o perfil (Pessoal/PJ, grupo, categoria, quem, ciclo, observação). |
| **Importar fatura** | PDF Itaú (todos os cartões, parcelas, compras internacionais com câmbio e IOF; confere a soma com o total da fatura), CSV e OFX de qualquer banco. Prévia editável, detecção de duplicados, dono de cada cartão e opção de desfazer a importação. |
| **PJ** | Notas fiscais (salário, comissão, outros), impostos, custos e retiradas, separados das finanças pessoais. |
| **Configurações** | Dia de início do ciclo, membros e convite, cartões, regras aprendidas e categorias. |

## Publicar

### 1. Supabase (banco e login)
1. Crie um projeto em supabase.com (região São Paulo).
2. Em **SQL Editor**, rode em ordem: `0001_base.sql`, `0002_agenda_e_faturas.sql`, `0003_insights.sql`, `0004_acessos.sql`, `0005_patrimonio.sql` (pasta `supabase/migrations`). Todos podem ser rodados de novo sem estragar nada.
3. **Authentication → Providers**: e-mail (com senha e link mágico) já vem ligado. Para o Google, veja "Login com Google" abaixo.
4. **Authentication → URL Configuration**: em *Site URL* coloque o endereço do app (ex.: `https://alvvo-finance.vercel.app`) e em *Redirect URLs* adicione `https://alvvo-finance.vercel.app/auth/callback`.

### 2. GitHub + Vercel
1. Repositório privado `alvvo-finance`.
2. Na Vercel, importe o repositório e cadastre as variáveis do `.env.example`.
3. O `vercel.json` agenda a atualização diária dos dados de mercado (dias úteis, 7h de Brasília). As páginas também atualizam sozinhas ao abrir quando o dado tem mais de 1 hora.

### 3. Login com Google
1. Google Cloud Console → APIs e serviços → Tela de consentimento OAuth (externo) → Credenciais → Criar ID do cliente OAuth (aplicativo da Web).
2. Em *URIs de redirecionamento autorizados*: `https://SEU-PROJETO.supabase.co/auth/v1/callback`.
3. Copie o ID e a chave secreta para Supabase → Authentication → Providers → Google.

### 4. Primeiro acesso
1. Crie a sua conta (e-mail, link mágico ou Google) e escolha o modelo (Família, Individual ou Autônomo/PJ). Você vira o **dono**.
2. Em **Membros e acessos**, copie o link de convite. Quem entrar por ele fica **aguardando aprovação** até você aprovar e escolher o papel e as áreas.
3. IA: em Configurações, escolha "Minha chave do Claude" e cole uma chave do Claude Console, ou peça ao administrador da plataforma para liberar a "IA incluída" (`update households set ai_included = true, ai_mode = 'incluida' where id = '...'`, rodado com a service role).

## Rodar localmente
```bash
cp .env.example .env.local   # preencha as chaves do Supabase
npm install
npm run dev                  # http://localhost:3000
```

## Regras de negócio
- **Ciclo:** do dia 8 ao dia 7 do mês seguinte (configurável). O ciclo "nov/2026" vai de 08/11 a 07/12.
- **Fatura de cartão:** entra no ciclo da **data de vencimento**, que é quando o dinheiro sai. Isso pode ser ajustado na prévia.
- **Valores:** gastos são positivos e estornos negativos. Categorias "fora do total" (reembolsos ZTE/Bianca) aparecem, mas não somam nas despesas.
- **Categorização:** regras aprendidas → palavras-chave → categoria informada pelo banco → "A classificar".

## Também incluído
| Módulo | O que faz |
|---|---|
| **Membros e acessos** | Convite por link/código, aprovação do dono, papéis (administrador, membro, só leitura), permissão por área e escopo "só os próprios lançamentos", suspender/remover, "ver como" e registro de atividades. As regras valem no banco (RLS). |
| **Investimentos** | Carteira por preço médio, cotações automáticas (Yahoo Finance), renda fixa com CDI e IPCA do Banco Central, proventos, histórico de vendas, alocação-alvo, próximo aporte, notícias e leitura de nota de corretagem com IA. |
| **Objetivos** | Meta de patrimônio, independência financeira e caixinhas (reserva de emergência automática). |
| **Análise** | Monitor de preços com alvos, sinais técnicos, preço justo (Graham/Bazin), sugestão explicável, desempenho por período, gráfico desde o primeiro pregão com ferramentas de desenho e tendências automáticas. Renda fixa: comparador líquido (IR, custódia, inflação) com Tesouro e ofertas cadastradas. |
| **IA (opcional)** | Faturas de qualquer banco, sugestão de categorias, nota de corretagem e resumo do ciclo. Usa a chave da plataforma (contas liberadas) ou a chave do Claude Console do usuário, guardada criptografada. |

## Estrutura
```
src/app/login, onboarding      autenticação e criação/entrada na família
src/app/(app)/                 páginas autenticadas (visão geral, orçamento, lançamentos, faturas, pj, configurações)
src/lib/faturas/               leitores de fatura (Itaú PDF, OFX, CSV)
src/lib/categorize.ts          sugestão de categoria e normalização de estabelecimentos
src/lib/categories-default.ts  categorias padrão (espelham a planilha)
src/lib/cycle.ts               ciclos de competência
supabase/migrations/           esquema do banco + RLS
scripts/                       importação das planilhas
```
