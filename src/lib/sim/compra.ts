/**
 * "Posso comprar?" — avalia uma compra adicional com os dados reais da família:
 * renda e gastos médios, parcelas que já vêm por aí, caixa, reserva e o ritmo de cada objetivo.
 * Cálculo puro (roda no navegador para a resposta mudar enquanto a pessoa ajusta os campos).
 */

export interface CompraBase {
  ciclo: string;                    // ciclo atual (AAAA-MM)
  renda: number; despesas: number; sobra: number; aporte: number; // médias mensais recentes (critério de caixa)
  reserva: { atual: number; alvo: number | null; nome: string | null; goalId: string | null };
  caixa: { saldo: number | null; contas: number; receber: number }; // saldo do banco e agenda dos próximos 35 dias
  parcelas: number[];               // parcelas já assumidas por ciclo, a partir do atual (24 ciclos)
  cortes: { name: string; avg: number }[]; // categorias variáveis com maior gasto médio
  goals: { id: string; name: string; target: number; balance: number; deadline: string | null }[];
  cdiNetM: number;                  // CDI líquido de IR, ao mês (fração)
}

export type Modo = "vista" | "cartao" | "financiado";
export type Juros = "nao" | "sim" | "naosei";
export interface CompraInput {
  item: string; valor: number; modo: Modo; parcelas: number; juros: Juros;
  taxa: number;      // % a.m. (quando há juros)
  entrada: number;   // financiamento
  desconto: number;  // % de desconto à vista (para a alternativa de juntar)
  limite: number;    // limite de referência de comprometimento da renda (fração, ex.: 0,85)
}

export type Nivel = "viavel" | "ressalva" | "nao";
export interface Impacto { id: string; name: string; antes: number | null; depois: number | null; atraso: number; concluido: boolean }
export interface Alternativa { key: "cortar" | "juntar" | "aguardar" | "seguir"; titulo: string; detalhe: string; viavel: boolean; meses?: number; mensal?: number; alvo?: number; ate?: string }
export interface Avaliacao {
  ok: boolean; motivoSemDados?: string;
  parcela: number; n: number; totalPago: number; juros: number;
  antes: number; depois: number;     // comprometimento da renda (fração)
  sobraDepois: number;
  usoReserva: number; reservaMesesDepois: number | null; livre: number;
  nivel: Nivel; titulo: string; resumo: string; pontos: string[];
  impactos: Impacto[];
  alternativas: Alternativa[];
  liberaEm: { ciclo: string; valor: number } | null;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const mesAno = (c: string) => `${MESES[Number(c.slice(5, 7)) - 1]} de ${c.slice(0, 4)}`;
export const shift = (c: string, n: number) => { const i = Number(c.slice(0, 4)) * 12 + Number(c.slice(5, 7)) - 1 + n; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`; };
const diff = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: v >= 1000 ? 0 : 2 }).format(v);
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Parcela pela tabela Price (taxa ao mês em %). */
export function price(pv: number, taxaPct: number, n: number) {
  const i = taxaPct / 100;
  if (n <= 1) return pv;
  return i > 0 ? pv * i / (1 - Math.pow(1 + i, -n)) : pv / n;
}

/** Meses para juntar `alvo` guardando `m` por mês a uma taxa mensal `i`. */
function mesesParaJuntar(alvo: number, m: number, i: number) {
  if (m <= 0) return Infinity;
  let s = 0, k = 0;
  while (s < alvo && k < 600) { s = s * (1 + i) + m; k++; }
  return k;
}

/** Meses até concluir um objetivo, com aporte mensal `c` reduzido em `corte` durante `n` meses. */
function mesesAteConcluir(rem: number, c: number, corte: number, n: number, perda = 0) {
  let s = -perda, k = 0;
  while (s < rem && k < 600) { s += k < n ? Math.max(0, c - corte) : c; k++; }
  return k >= 600 ? null : k;
}

export function avaliarCompra(b: CompraBase, x: CompraInput): Avaliacao {
  const valor = Math.max(0, x.valor || 0);
  const n = x.modo === "vista" ? 1 : Math.max(1, Math.round(x.parcelas || 1));
  const entrada = x.modo === "financiado" ? Math.min(valor, Math.max(0, x.entrada || 0)) : 0;
  const taxa = x.modo === "financiado" ? (x.taxa || 0) : x.modo === "cartao" && x.juros === "sim" ? (x.taxa || 0) : 0;
  const parcela = x.modo === "vista" ? 0 : price(valor - entrada, taxa, n);
  const totalPago = x.modo === "vista" ? valor : entrada + parcela * n;
  const juros = Math.max(0, totalPago - valor);
  const R = b.renda, D = b.despesas;
  const vazio: Avaliacao = { ok: false, parcela, n, totalPago, juros, antes: 0, depois: 0, sobraDepois: 0, usoReserva: 0, reservaMesesDepois: null, livre: 0, nivel: "ressalva", titulo: "", resumo: "", pontos: [], impactos: [], alternativas: [], liberaEm: null };
  if (R <= 0) return { ...vazio, motivoSemDados: "Para avaliar a compra, é necessário ter ao menos um ciclo com receitas e despesas lançadas." };
  if (valor <= 0) return { ...vazio, motivoSemDados: "Informe o valor da compra para ver a análise." };

  const antes = D / R, depois = (D + parcela) / R, sobraDepois = b.sobra - parcela;
  // Caixa: saldo do banco + o que entra nos próximos dias − contas da agenda (sem o banco, a sobra média de um mês)
  const livre = Math.max(0, b.caixa.saldo != null ? b.caixa.saldo + b.caixa.receber - b.caixa.contas : b.sobra);
  const pagoAgora = x.modo === "vista" ? valor : entrada;
  const usoReserva = Math.max(0, Math.min(b.reserva.atual, pagoAgora - livre));
  const faltaCaixa = Math.max(0, pagoAgora - livre - b.reserva.atual);
  const reservaMesesDepois = D > 0 ? (b.reserva.atual - usoReserva) / D : null;

  // Objetivos: o aporte mensal da família é dividido pelo que cada objetivo precisa por mês
  const C = b.aporte > 0 ? b.aporte : Math.max(0, b.sobra);
  const folga = Math.max(0, b.sobra - C);                 // sobra que hoje não vai para objetivo nenhum
  const corte = Math.max(0, parcela - folga);             // quanto a parcela tira dos aportes
  const ativos = b.goals.filter((g) => g.target > g.balance);
  const need = ativos.map((g) => (g.target - g.balance) / Math.max(1, g.deadline ? diff(b.ciclo, g.deadline) : 24));
  const soma = need.reduce((a, v) => a + v, 0) || 1;
  const impactos: Impacto[] = b.goals.map((g) => {
    const k = ativos.indexOf(g);
    if (k < 0) return { id: g.id, name: g.name, antes: 0, depois: 0, atraso: 0, concluido: true };
    const w = need[k] / soma, c = C * w, rem = g.target - g.balance;
    const perda = g.id === b.reserva.goalId ? usoReserva : 0;
    if (c <= 0) return { id: g.id, name: g.name, antes: null, depois: null, atraso: 0, concluido: false };
    const a = mesesAteConcluir(rem, c, 0, 0), d = mesesAteConcluir(rem, c, corte * w, x.modo === "vista" ? 0 : n, perda);
    return { id: g.id, name: g.name, antes: a, depois: d, atraso: a != null && d != null ? Math.max(0, d - a) : 0, concluido: false };
  });
  const maxAtraso = Math.max(0, ...impactos.map((i) => i.atraso));

  // Parcelas atuais que terminam enquanto a nova compra é paga
  let liberaEm: Avaliacao["liberaEm"] = null;
  const p0 = b.parcelas[0] ?? 0;
  for (let k = 1; k < Math.min(13, b.parcelas.length); k++) {
    const lib = p0 - (b.parcelas[k] ?? 0);
    if (parcela > 0 && lib >= parcela * 0.6) { liberaEm = { ciclo: shift(b.ciclo, k), valor: lib }; break; }
  }

  // Veredito
  const pontos: string[] = [];
  const L = x.limite;
  if (x.modo !== "vista") pontos.push(`Com a parcela de ${brl(parcela)}, o comprometimento da renda passa de ${pct(antes)} para ${pct(depois)} (limite de referência: ${pct(L)}).`);
  if (sobraDepois < 0) pontos.push(`As despesas médias passariam a superar a renda média em ${brl(-sobraDepois)} por mês.`);
  else if (x.modo !== "vista") pontos.push(`A sobra média mensal passa de ${brl(b.sobra)} para ${brl(sobraDepois)}.`);
  if (pagoAgora > 0) {
    if (faltaCaixa > 0) pontos.push(`O pagamento de ${brl(pagoAgora)} supera o caixa disponível e a reserva somados em ${brl(faltaCaixa)}.`);
    else if (usoReserva > 0) pontos.push(`O pagamento utilizaria ${brl(usoReserva)} da reserva de emergência${reservaMesesDepois != null ? `, que passaria a cobrir ${reservaMesesDepois.toFixed(1).replace(".", ",")} meses de gastos` : ""}.`);
    else pontos.push(`O pagamento de ${brl(pagoAgora)} cabe no caixa disponível (${brl(livre)}), sem utilizar a reserva.`);
  }
  if (maxAtraso > 0) pontos.push(`Os aportes aos objetivos ficam menores e o prazo mais afetado se estende em ${maxAtraso} ${maxAtraso === 1 ? "mês" : "meses"}.`);
  if (juros > 0) pontos.push(`Os juros somam ${brl(juros)} ao longo de ${n} parcelas (total pago: ${brl(totalPago)}).`);
  if (x.modo === "cartao" && x.juros === "naosei") pontos.push("Confirme com a loja se o parcelamento tem juros: a análise considera parcelas sem juros.");

  const nao = sobraDepois < 0 || depois > L + 0.1 || faltaCaixa > 0 || (usoReserva > 0 && reservaMesesDepois != null && reservaMesesDepois < 3);
  const ressalva = !nao && (depois > L || maxAtraso >= 3 || usoReserva > 0 || sobraDepois < 0.1 * R || juros > valor * 0.15);
  const nivel: Nivel = nao ? "nao" : ressalva ? "ressalva" : "viavel";
  const titulo = nivel === "viavel" ? "Compra viável" : nivel === "ressalva" ? "Viável, com ressalvas" : "Não recomendada neste momento";
  const resumo = nivel === "viavel"
    ? (x.modo === "vista" ? "A compra à vista cabe no caixa e não compromete a reserva nem o orçamento dos próximos meses." : "A parcela cabe no orçamento e mantém o comprometimento da renda dentro do limite de referência.")
    : nivel === "ressalva" ? "A compra é possível, mas reduz a margem do orçamento ou o ritmo dos objetivos. Avalie as alternativas abaixo."
    : "Nas condições atuais, a compra desequilibra o orçamento ou a reserva. As alternativas abaixo indicam como torná-la viável.";

  // Alternativas
  const alternativas: Alternativa[] = [];
  const precisaCortar = Math.max(0, D + parcela - L * R, -sobraDepois);
  if (x.modo !== "vista" && precisaCortar > 0) {
    const sel: { name: string; avg: number }[] = []; let cap = 0;
    for (const c of b.cortes) { if (cap >= precisaCortar) break; sel.push(c); cap += c.avg * 0.3; }
    const nomes = sel.map((c) => c.name);
    const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}` : nomes[0] ?? "";
    alternativas.push(cap >= precisaCortar && nomes.length
      ? { key: "cortar", titulo: `Reduzir ${brl(precisaCortar)} por mês em ${lista}`, detalhe: `Média atual: ${sel.map((c) => `${c.name} ${brl(c.avg)}`).join(" · ")}. Uma redução de até 30% nessas categorias acomoda a parcela.`, viavel: true, mensal: precisaCortar }
      : { key: "cortar", titulo: `Reduzir ${brl(precisaCortar)} por mês nos gastos variáveis`, detalhe: "O valor é alto em relação aos gastos variáveis atuais; esta alternativa exige revisar também despesas fixas.", viavel: false, mensal: precisaCortar });
  }
  const alvoVista = valor * (1 - Math.max(0, x.desconto || 0) / 100);
  const guardar = parcela > 0 ? Math.min(parcela, Math.max(b.sobra, parcela * 0.5)) : Math.max(b.sobra * 0.5, valor / 24);
  const mJ = mesesParaJuntar(alvoVista, guardar, b.cdiNetM);
  if (isFinite(mJ) && guardar > 0 && !(x.modo === "vista" && nivel === "viavel")) {
    const ate = shift(b.ciclo, mJ);
    alternativas.push({ key: "juntar", titulo: `Guardar ${brl(guardar)} por mês e comprar à vista em ${mesAno(ate)}`, detalhe: `Aplicando a cerca de 100% do CDI${x.desconto > 0 ? `, com desconto de ${x.desconto}% à vista` : ""}. Sem juros e sem parcelas futuras${juros > 0 ? `; economia de ${brl(juros + valor - alvoVista)}` : ""}.`, viavel: true, meses: mJ, mensal: guardar, alvo: alvoVista, ate });
  }
  if (liberaEm && nivel !== "viavel") alternativas.push({ key: "aguardar", titulo: `Aguardar até ${mesAno(liberaEm.ciclo)}`, detalhe: `Parcelas atuais que terminam até lá liberam ${brl(liberaEm.valor)} por mês no orçamento.`, viavel: true, ate: liberaEm.ciclo });
  alternativas.push({ key: "seguir", titulo: x.modo === "vista" ? "Comprar à vista agora" : `Seguir com a compra em ${n}x de ${brl(parcela)}`, detalhe: x.modo === "vista" ? "O valor sai do caixa disponível neste ciclo." : "As parcelas passarão a constar nas próximas faturas e no planejamento dos ciclos seguintes.", viavel: nivel !== "nao" });

  return { ok: true, parcela, n, totalPago, juros, antes, depois, sobraDepois, usoReserva, reservaMesesDepois, livre, nivel, titulo, resumo, pontos, impactos, alternativas, liberaEm };
}
