// Ranking entre os 27 estados (26 estados e o Distrito Federal) nos temas do governador que NÃO têm nota:
// serviços básicos, economia, orçamento e transparência. (Saúde, educação, segurança e saneamento já têm nota própria.)
//
// Regras:
//   - Cada métrica é comparada só entre estados com o dado do MESMO ano. Vale o ano mais recente em que pelo menos
//     MIN_ESTADOS estados têm o dado; quem não tem esse ano fica sem posição ("Dado não encontrado ou não confirmado").
//   - Sentido: "maior-melhor" e "menor-melhor" ordenam do melhor ao pior. "neutro" (gasto por habitante, PIB por
//     habitante) ordena só do maior valor ao menor: gasto alto não é bom nem ruim, e o ranking não diz quem faz melhor.
//   - Empate divide a mesma posição (a de melhor colocação), e os seguintes continuam na posição seguinte à do grupo.
//   - Ausência de dado nunca vira zero nem entra na comparação.

import { arredondar } from './util.mjs';

export const MIN_ESTADOS = 20;
export const MSG = 'Dado não encontrado ou não confirmado';

const finito = (v) => typeof v === 'number' && Number.isFinite(v);

/** Último ano fechado com valor, para cada ano da janela: { ano: valor }. */
function porAno(perfil, pega) {
  const r = {};
  for (const [ano, a] of Object.entries(perfil?.anos || {})) {
    if (a?.situacao !== 'fechado') continue;
    const v = pega(a);
    if (finito(v)) r[ano] = v;
  }
  return r;
}

export const METRICAS_ESTADOS = [
  { id: 'eco.pib-pc', secao: 'economia', nome: 'PIB por habitante', unidade: 'R$ por habitante', sentido: 'neutro', casas: 0,
    leitura: (p) => (finito(p.contexto?.pib?.porHabitante) ? { [p.contexto.pib.ano]: p.contexto.pib.porHabitante } : {}),
    aviso: 'O PIB é a riqueza produzida no território, não a renda das pessoas nem o desempenho da gestão; o ano mais recente costuma ter quase dois anos de defasagem.' },
  { id: 'servicos.pc-15', secao: 'servicos', nome: 'Despesa paga com urbanismo por habitante', unidade: 'R$ por habitante', sentido: 'neutro', casas: 0,
    leitura: (p) => porAno(p, (a) => a.d?.['15']?.[0]),
    aviso: 'Gasto não é resultado: gastar mais ou menos com urbanismo não diz se o serviço é bom. A maior parte dos serviços urbanos é municipal.' },
  { id: 'orc.pc-total', secao: 'orcamento', nome: 'Despesa paga total por habitante', unidade: 'R$ por habitante', sentido: 'neutro', casas: 0,
    leitura: (p) => porAno(p, (a) => a.d?.total?.[0]),
    aviso: 'Gasto não é resultado: o ranking só ordena do maior valor ao menor e não diz quem administra melhor.' },
  { id: 'orc.pessoal', secao: 'orcamento', nome: 'Despesa com pessoal sobre a receita corrente líquida', unidade: '% da RCL', sentido: 'menor-melhor', casas: 1,
    leitura: (p) => porAno(p, (a) => a.pessoal),
    aviso: 'O limite da Lei de Responsabilidade Fiscal para o Poder Executivo estadual é 49%. Valor entregue pelo próprio Executivo ao Tesouro.' },
  { id: 'orc.divida', secao: 'orcamento', nome: 'Dívida consolidada líquida sobre a receita corrente líquida', unidade: '% da RCL', sentido: 'menor-melhor', casas: 1,
    leitura: (p) => porAno(p, (a) => a.divida),
    aviso: 'O limite do Senado para os estados é 200%. Pode ser negativa quando o estado tem mais caixa do que dívida.' },
  { id: 'transp.entregas', secao: 'transparencia', nome: 'Relatórios fiscais entregues ao Tesouro', unidade: '% dos relatórios esperados', sentido: 'maior-melhor', casas: 0,
    leitura: (p) => (p.entregas && finito(p.entregas.feitas) && finito(p.entregas.esperado) && p.entregas.esperado > 0 ? { '': (p.entregas.feitas / p.entregas.esperado) * 100 } : {}),
    aviso: 'Mede se o estado entregou os relatórios, não se o conteúdo está correto.' }
];

/** Posições com empate: ordena e devolve { chave: posição }. */
export function posicionar(valores, sentido) {
  const lista = Object.entries(valores).map(([k, v]) => ({ k, v }));
  lista.sort((a, b) => (sentido === 'menor-melhor' ? a.v - b.v : b.v - a.v));
  const pos = {};
  lista.forEach((x, i) => { pos[x.k] = i > 0 && lista[i - 1].v === x.v ? pos[lista[i - 1].k] : i + 1; });
  return pos;
}

/**
 * perfis: [{ uf, perfil }] com o perfil de cada governo estadual (saída de montarExecutivoEnte).
 * Devolve o conteúdo de dados/ranking-estados.json.
 */
export function montarRankingEstados(perfis, hoje = new Date()) {
  const ufs = perfis.map((p) => p.uf);
  const metricas = METRICAS_ESTADOS.map((m) => {
    const lidos = Object.fromEntries(perfis.map(({ uf, perfil }) => [uf, m.leitura(perfil)]));
    // ano comparável: o mais recente em que ao menos MIN_ESTADOS têm valor
    const contagem = {};
    for (const porUf of Object.values(lidos)) for (const ano of Object.keys(porUf)) contagem[ano] = (contagem[ano] || 0) + 1;
    const ano = Object.keys(contagem).filter((a) => contagem[a] >= MIN_ESTADOS).sort().pop();
    const base = { id: m.id, secao: m.secao, nome: m.nome, unidade: m.unidade, sentido: m.sentido, casas: m.casas, aviso: m.aviso };
    if (ano === undefined) return { ...base, ano: null, de: 0, itens: {}, motivo: `${MSG}: menos de ${MIN_ESTADOS} estados têm este dado no mesmo ano.` };
    const valores = Object.fromEntries(ufs.filter((uf) => finito(lidos[uf][ano])).map((uf) => [uf, arredondar(lidos[uf][ano], m.casas)]));
    const pos = posicionar(valores, m.sentido);
    const itens = {};
    for (const uf of ufs) itens[uf] = uf in valores ? { valor: valores[uf], posicao: pos[uf] } : { valor: null, posicao: null };
    const todos = Object.values(valores);
    const melhor = m.sentido === 'menor-melhor' ? Math.min(...todos) : Math.max(...todos);
    const pior = m.sentido === 'menor-melhor' ? Math.max(...todos) : Math.min(...todos);
    return { ...base, ano: ano === '' ? null : Number(ano), de: todos.length, itens, extremos: { primeiro: melhor, ultimo: pior } };
  });
  return {
    versao: 1, geradoEm: hoje.toISOString(), estados: ufs.length,
    regra: `Cada métrica é comparada entre os estados que têm o dado no mesmo ano (mínimo de ${MIN_ESTADOS} estados). Posição 1 = melhor, quando há sentido (menos pessoal, menos dívida, mais relatórios entregues); nas métricas neutras (gasto e PIB por habitante), 1 = maior valor, sem juízo de qualidade. Quem não tem o dado fica sem posição e fora da comparação.`,
    metricas
  };
}
