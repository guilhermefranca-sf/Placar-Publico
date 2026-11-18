// A NOTA. Todas as regras de cálculo estão neste arquivo, de propósito:
// quem quiser mudar um peso ou um limite muda aqui e roda a atualização de novo.
// O site mostra estas mesmas regras na página "Metodologia" (copiadas para dados/metodo.json).

import { arredondar, limitar } from './util.mjs';

export const METODO = {
  versao: 1,
  escala: 'A nota vai de 0 a 100.',

  // Deputados federais: o que cada um fez no ano em curso.
  federais: {
    minSessoes: 20, // quem tem menos sessões que isso no mandato do ano fica sem nota
    componentes: [
      { k: 'pres', rotulo: 'Presença no Plenário', peso: 30,
        regra: 'Porcentagem das sessões deliberativas do Plenário com presença registrada, contadas desde a primeira presença do deputado no ano.' },
      { k: 'vot', rotulo: 'Votações nominais', peso: 25,
        regra: 'Porcentagem das votações nominais do Plenário em que o deputado registrou voto. Votação simbólica não entra, pois não tem voto individual.' },
      { k: 'proj', rotulo: 'Projetos apresentados', peso: 20,
        regra: 'Projetos de lei, PECs e outras propostas de sua autoria (sozinho ou com outros) por mês de mandato, comparados aos dos demais deputados. Requerimentos, indicações e emendas não contam. Mede quantidade, não qualidade.' },
      { k: 'cota', rotulo: 'Uso da cota parlamentar', peso: 25,
        regra: 'Gasto mensal da cota parlamentar (valor do documento menos glosa), comparado ao dos colegas do mesmo estado. Quem gasta menos fica com nota maior. Comparar dentro do estado evita punir quem mora longe de Brasília.' }
    ]
  },

  // Prefeitos e governadores: a situação das contas da prefeitura ou do estado no último ano fechado.
  executivos: {
    componentes: [
      { k: 'pessoal', rotulo: 'Gasto com pessoal', peso: 40,
        regra: 'Despesa com pessoal do Poder Executivo sobre a receita corrente líquida, comparada ao limite da Lei de Responsabilidade Fiscal (54% nas prefeituras, 49% nos estados). Nota 100 até 80% do limite, caindo até 0 em 110% do limite.' },
      { k: 'divida', rotulo: 'Endividamento', peso: 30,
        regra: 'Dívida consolidada líquida sobre a receita corrente líquida, comparada ao limite do Senado (120% nas prefeituras, 200% nos estados). Nota 100 até metade do limite, caindo até 0 no limite.' },
      { k: 'entregas', rotulo: 'Relatórios fiscais entregues', peso: 30,
        regra: 'Quantos dos relatórios fiscais obrigatórios do ano (6 resumidos de execução orçamentária, 3 de gestão fiscal, ou 2 nas cidades pequenas que escolhem o semestre, e o balanço anual) foram entregues ao Tesouro Nacional.' }
    ],
    limites: { M: { pessoal: 54, divida: 120 }, E: { pessoal: 49, divida: 200 }, D: { pessoal: 49, divida: 200 } },
    minComponentes: 2
  }
};

export function pesoDe(grupo, k) {
  return METODO[grupo].componentes.find((c) => c.k === k).peso;
}

/** Média dos componentes que existem, cada um com seu peso. Devolve null se faltar dado demais. */
export function mediaPonderada(componentes, minimo = 1) {
  const validos = componentes.filter((c) => c.s != null && Number.isFinite(c.s));
  if (validos.length < minimo || validos.length === 0) return null;
  const soma = validos.reduce((a, c) => a + c.peso, 0);
  return arredondar(validos.reduce((a, c) => a + c.s * c.peso, 0) / soma, 1);
}

/** Gasto com pessoal: 100 até 80% do limite, 0 a partir de 110% do limite. */
export function scorePessoal(pctRcl, limite) {
  if (pctRcl == null) return null;
  const uso = pctRcl / limite;
  return arredondar(limitar(100 * (1.1 - uso) / 0.3, 0, 100), 1);
}

/** Dívida: 100 até metade do limite, 0 no limite. Dívida líquida negativa conta como 100. */
export function scoreDivida(pctRcl, limite) {
  if (pctRcl == null) return null;
  const uso = Math.max(0, pctRcl) / limite;
  return arredondar(limitar(100 * (1 - uso) / 0.5, 0, 100), 1);
}

export function scoreEntregas(feitas, esperado) {
  if (!esperado) return null;
  return arredondar(limitar(100 * feitas / esperado, 0, 100), 1);
}

/**
 * Dá a posição (rank) de quem tem nota. Maior nota = posição 1.
 * Empate: ordem alfabética, só para o resultado ser sempre o mesmo.
 */
export function atribuirPosicoes(itens) {
  const comNota = itens.filter((i) => i.nota != null)
    .sort((a, b) => b.nota - a.nota || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  comNota.forEach((i, k) => { i.rank = k + 1; });
  itens.filter((i) => i.nota == null).forEach((i) => { i.rank = null; });
  return comNota.length;
}
