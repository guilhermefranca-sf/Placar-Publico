'use strict';
// Gerado por scripts/gerar-metodo-demo.mjs. Não edite à mão.
const METODO_DEMO = {
  "versao": 1,
  "escala": "A nota vai de 0 a 100.",
  "federais": {
    "minSessoes": 20,
    "componentes": [
      {
        "k": "pres",
        "rotulo": "Presença no Plenário",
        "peso": 30,
        "regra": "Porcentagem das sessões deliberativas do Plenário com presença registrada, contadas desde a primeira presença do deputado no ano."
      },
      {
        "k": "vot",
        "rotulo": "Votações nominais",
        "peso": 25,
        "regra": "Porcentagem das votações nominais do Plenário em que o deputado registrou voto. Votação simbólica não entra, pois não tem voto individual."
      },
      {
        "k": "proj",
        "rotulo": "Projetos apresentados",
        "peso": 20,
        "regra": "Projetos de lei, PECs e outras propostas de sua autoria (sozinho ou com outros) por mês de mandato, comparados aos dos demais deputados. Requerimentos, indicações e emendas não contam. Mede quantidade, não qualidade."
      },
      {
        "k": "cota",
        "rotulo": "Uso da cota parlamentar",
        "peso": 25,
        "regra": "Gasto mensal da cota parlamentar (valor do documento menos glosa), comparado ao dos colegas do mesmo estado. Quem gasta menos fica com nota maior. Comparar dentro do estado evita punir quem mora longe de Brasília."
      }
    ]
  },
  "executivos": {
    "componentes": [
      {
        "k": "pessoal",
        "rotulo": "Gasto com pessoal",
        "peso": 40,
        "regra": "Despesa com pessoal do Poder Executivo sobre a receita corrente líquida, comparada ao limite da Lei de Responsabilidade Fiscal (54% nas prefeituras, 49% nos estados). Nota 100 até 80% do limite, caindo até 0 em 110% do limite."
      },
      {
        "k": "divida",
        "rotulo": "Endividamento",
        "peso": 30,
        "regra": "Dívida consolidada líquida sobre a receita corrente líquida, comparada ao limite do Senado (120% nas prefeituras, 200% nos estados). Nota 100 até metade do limite, caindo até 0 no limite."
      },
      {
        "k": "entregas",
        "rotulo": "Relatórios fiscais entregues",
        "peso": 30,
        "regra": "Quantos dos relatórios fiscais obrigatórios do ano (6 resumidos de execução orçamentária, 3 de gestão fiscal, ou 2 nas cidades pequenas que escolhem o semestre, e o balanço anual) foram entregues ao Tesouro Nacional."
      }
    ],
    "limites": {
      "M": {
        "pessoal": 54,
        "divida": 120
      },
      "E": {
        "pessoal": 49,
        "divida": 200
      },
      "D": {
        "pessoal": 49,
        "divida": 200
      }
    },
    "minComponentes": 2
  }
};
