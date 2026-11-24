'use strict';
// Gerado por scripts/gerar-metodo-demo.mjs. Não edite à mão.
const METODO_DEMO = {
  "versao": 1,
  "escala": "O índice vai de 0 a 100.",
  "federais": {
    "janelaAnos": 4,
    "minSessoes": 20,
    "componentes": [
      {
        "k": "pres",
        "rotulo": "Presença no Plenário",
        "peso": 30,
        "regra": "Porcentagem das sessões deliberativas do Plenário com presença registrada nos últimos 4 anos, contadas desde a primeira presença do deputado nesse período. Sessões em que o deputado estava licenciado ou afastado, segundo o histórico oficial da Câmara, não contam contra ele."
      },
      {
        "k": "vot",
        "rotulo": "Votações nominais",
        "peso": 25,
        "regra": "Porcentagem das votações nominais do Plenário, nos últimos 4 anos, em que o deputado registrou voto. Votação simbólica não entra, pois não tem voto individual. Votações durante licença ou afastamento não contam contra ele."
      },
      {
        "k": "proj",
        "rotulo": "Projetos apresentados",
        "peso": 20,
        "regra": "Projetos de lei, PECs e outras propostas de sua autoria (sozinho ou com outros) apresentados nos últimos 4 anos, por mês de exercício, comparados aos dos demais deputados. Requerimentos, indicações e emendas não contam. Mede quantidade, não qualidade nem aprovação."
      },
      {
        "k": "cota",
        "rotulo": "Uso da cota parlamentar",
        "peso": 25,
        "regra": "Gasto mensal da cota parlamentar nos últimos 4 anos (valor do documento menos glosa, dividido pelos meses de exercício), comparado ao dos colegas do mesmo estado. Quem gasta menos fica com índice maior. Comparar dentro do estado evita punir quem mora longe de Brasília."
      }
    ]
  },
  "executivos": {
    "componentes": [
      {
        "k": "pessoal",
        "rotulo": "Gasto com pessoal",
        "peso": 60,
        "regra": "Despesa com pessoal do Poder Executivo sobre a receita corrente líquida, comparada ao limite da Lei de Responsabilidade Fiscal (54% nas prefeituras, 49% nos estados). Índice 100 até 80% do limite, caindo até 0 em 110% do limite."
      },
      {
        "k": "divida",
        "rotulo": "Endividamento",
        "peso": 40,
        "regra": "Dívida consolidada líquida sobre a receita corrente líquida, comparada ao limite do Senado (120% nas prefeituras, 200% nos estados). Índice 100 até metade do limite, caindo até 0 no limite."
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
