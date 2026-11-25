'use strict';
// Gerado por scripts/gerar-metodo-demo.mjs. Não edite à mão.
const METODO_DEMO = {
  "versao": 2,
  "escala": "O índice vai de 0 a 100.",
  "federais": {
    "janelaAnos": 4,
    "minSessoes": 20,
    "minMesesAprovados": 12,
    "componentes": [
      {
        "k": "cota",
        "rotulo": "Uso da cota parlamentar",
        "peso": 30,
        "regra": "Gasto mensal da cota parlamentar nos últimos 4 anos (valor do documento menos glosa, dividido pelos meses de exercício), comparado ao dos colegas do mesmo estado. Quem gasta menos fica com índice maior. Comparar dentro do estado evita punir quem mora longe de Brasília."
      },
      {
        "k": "vot",
        "rotulo": "Votações nominais",
        "peso": 20,
        "regra": "Porcentagem das votações nominais do Plenário, nos últimos 4 anos, em que o deputado registrou voto. Votação simbólica não entra, pois não tem voto individual. Votações durante licença ou afastamento não contam contra ele."
      },
      {
        "k": "pres",
        "rotulo": "Presença no plenário",
        "peso": 20,
        "regra": "Porcentagem das sessões deliberativas do Plenário com presença registrada nos últimos 4 anos, contadas desde a primeira presença do deputado nesse período. Sessões em que o deputado estava licenciado ou afastado, segundo o histórico oficial da Câmara, não contam contra ele."
      },
      {
        "k": "aprov",
        "rotulo": "Projetos aprovados",
        "peso": 30,
        "regra": "Projetos de lei, PECs e outras propostas de sua autoria (sozinho ou em coautoria) apresentados nos últimos 4 anos que hoje constam como aprovados pelo Plenário da Câmara, incluindo os já transformados em lei, os enviados ao Senado e os que aguardam sanção. O número de aprovados é dividido pelos anos de exercício e comparado ao dos demais deputados. Projeto aprovado só em comissão, em tramitação, arquivado ou rejeitado não conta como aprovado. Quem tem menos de 12 meses de exercício no período fica sem este critério (histórico insuficiente), porque zero projetos aprovados no começo do mandato não é desempenho negativo; nesse caso o índice usa os outros critérios. Mede quantidade de projetos aprovados, não a importância nem o alcance social de cada um."
      }
    ]
  },
  "estaduais": {
    "nome": "Índice parcial de deputado estadual",
    "janelaAnos": 4,
    "minMeses": 12,
    "minColegas": 10,
    "minCriterios": 1,
    "componentes": [
      {
        "k": "cota",
        "rotulo": "Uso da verba de gabinete",
        "peso": 30,
        "regra": "Gasto médio mensal da verba de gabinete entre o primeiro e o último mês com despesa registrada nos últimos 4 anos, comparado ao dos colegas da mesma Assembleia (menos gasto = pontuação maior). Exige pelo menos 12 meses e 10 deputados com dado. Lido hoje só da Alesp (São Paulo)."
      },
      {
        "k": "vot",
        "rotulo": "Votações",
        "peso": 20,
        "regra": "Participação nas votações nominais do plenário. Só entra quando a Assembleia publica o voto de cada deputado. Ainda não há leitura integrada em nenhuma casa."
      },
      {
        "k": "pres",
        "rotulo": "Presença",
        "peso": 20,
        "regra": "Presença em plenário. Só entra quando a Assembleia publica a presença por deputado em formato que o Placar consegue ler. Ainda não há leitura integrada em nenhuma casa."
      },
      {
        "k": "aprov",
        "rotulo": "Projetos aprovados",
        "peso": 30,
        "regra": "Projetos de autoria do deputado que viraram lei ou foram aprovados pelo plenário. Só entra quando a Assembleia publica autoria e situação de cada projeto em formato que o Placar consegue ler. Ainda não há leitura integrada em nenhuma casa."
      }
    ]
  },
  "executivos": {
    "nome": "Índice de serviços públicos",
    "comparacao": "Cada indicador é comparado com os pares: os governadores com os demais estados; os prefeitos com os demais municípios do mesmo estado (ou do país inteiro, quando o estado tem menos de 10 municípios com o dado). A pontuação de cada indicador é a posição do ente entre os pares, de 0 a 100, com o sentido certo (quanto menor a mortalidade, maior a pontuação). A pontuação da área é a média dos indicadores dela que existem, e o índice é a média das áreas, com os pesos abaixo. Só entram anos com pelo menos 6 meses dentro dos últimos 48 meses. Os resultados descrevem o território, que pode incluir anos de gestões anteriores: o perfil mostra quais anos entraram e quais são de outra gestão, e quem tomou posse depois do último ano com resultado fica sem índice até haver dado do seu mandato.",
    "minAreas": {
      "E": 3,
      "M": 2
    },
    "minMesesDoAno": 6,
    "minNascidos": 100,
    "minPares": 10,
    "componentes": [
      {
        "k": "saude",
        "rotulo": "Saúde",
        "peso": 20,
        "regra": "Mortalidade infantil (óbitos de menores de 1 ano por mil nascidos vivos, somando os anos do período) e, só nos municípios, internações pelo SUS por diarreia. Resultado menor dá pontuação maior. Fonte: Ministério da Saúde, pelo IBGE Cidades e Estados."
      },
      {
        "k": "educacao",
        "rotulo": "Educação",
        "peso": 20,
        "regra": "Ideb mais recente do período: nos estados, anos finais do ensino fundamental e ensino médio da rede estadual; nos municípios, anos iniciais e anos finais da rede municipal. Ideb maior dá pontuação maior. Fonte: Inep, pelo IBGE Cidades e Estados."
      },
      {
        "k": "seguranca",
        "rotulo": "Segurança",
        "peso": 20,
        "regra": "Só para estados, pois a segurança pública é responsabilidade principalmente estadual: homicídios dolosos (vítimas) e roubos de veículos por 100 mil habitantes, média dos anos completos do período. Taxa menor dá pontuação maior. Fonte: Sinesp, Ministério da Justiça e Segurança Pública. Não se aplica aos prefeitos."
      },
      {
        "k": "infra",
        "rotulo": "Infraestrutura",
        "peso": 20,
        "regra": "Ainda sem indicador de resultado com fonte aberta confirmada (por exemplo, condição das rodovias ou obras entregues). A despesa por função continua no perfil, mas gasto não é resultado e por isso não entra na nota. Enquanto não houver fonte, a área aparece como \"sem dado\" e o índice usa as outras."
      },
      {
        "k": "saneamento",
        "rotulo": "Saneamento",
        "peso": 20,
        "regra": "Porcentagem de domicílios com água da rede geral, com esgoto na rede ou fossa ligada à rede e com lixo coletado. Fonte: Censo Demográfico 2022 (IBGE). É um retrato do território em 2022, não um resultado da gestão atual. Porcentagem maior dá pontuação maior."
      }
    ],
    "indicadores": [
      {
        "area": "saude",
        "k": "mortalidade",
        "nome": "Mortalidade infantil",
        "unidade": "óbitos de menores de 1 ano por mil nascidos vivos",
        "casas": 1,
        "sentido": "menor",
        "esferas": [
          "E",
          "M"
        ]
      },
      {
        "area": "saude",
        "k": "diarreia",
        "nome": "Internações por diarreia",
        "unidade": "internações pelo SUS por mil habitantes",
        "casas": 2,
        "sentido": "menor",
        "esferas": [
          "M"
        ]
      },
      {
        "area": "educacao",
        "k": "ideb-af-est",
        "nome": "Ideb, anos finais do fundamental, rede estadual",
        "unidade": "nota de 0 a 10",
        "casas": 1,
        "sentido": "maior",
        "esferas": [
          "E"
        ]
      },
      {
        "area": "educacao",
        "k": "ideb-em-est",
        "nome": "Ideb, ensino médio, rede estadual",
        "unidade": "nota de 0 a 10",
        "casas": 1,
        "sentido": "maior",
        "esferas": [
          "E"
        ]
      },
      {
        "area": "educacao",
        "k": "ideb-ai-mun",
        "nome": "Ideb, anos iniciais do fundamental, rede municipal",
        "unidade": "nota de 0 a 10",
        "casas": 1,
        "sentido": "maior",
        "esferas": [
          "M"
        ]
      },
      {
        "area": "educacao",
        "k": "ideb-af-mun",
        "nome": "Ideb, anos finais do fundamental, rede municipal",
        "unidade": "nota de 0 a 10",
        "casas": 1,
        "sentido": "maior",
        "esferas": [
          "M"
        ]
      },
      {
        "area": "seguranca",
        "k": "homicidio",
        "nome": "Homicídios dolosos",
        "unidade": "vítimas por 100 mil habitantes",
        "casas": 1,
        "sentido": "menor",
        "esferas": [
          "E"
        ]
      },
      {
        "area": "seguranca",
        "k": "roubo-veiculo",
        "nome": "Roubos de veículos",
        "unidade": "ocorrências por 100 mil habitantes",
        "casas": 1,
        "sentido": "menor",
        "esferas": [
          "E"
        ]
      },
      {
        "area": "saneamento",
        "k": "agua",
        "nome": "Domicílios com água da rede geral",
        "unidade": "% dos domicílios",
        "casas": 1,
        "sentido": "maior",
        "esferas": [
          "E",
          "M"
        ]
      },
      {
        "area": "saneamento",
        "k": "esgoto",
        "nome": "Domicílios com esgoto na rede ou fossa ligada à rede",
        "unidade": "% dos domicílios",
        "casas": 1,
        "sentido": "maior",
        "esferas": [
          "E",
          "M"
        ]
      },
      {
        "area": "saneamento",
        "k": "lixo",
        "nome": "Domicílios com lixo coletado",
        "unidade": "% dos domicílios",
        "casas": 1,
        "sentido": "maior",
        "esferas": [
          "E",
          "M"
        ]
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
    }
  },
  "presidente": {
    "nome": "Índice econômico",
    "minIndicadores": 2,
    "minMeses": 12,
    "meta": {
      "centro": 3,
      "tolerancia": 1.5
    },
    "componentes": [
      {
        "k": "inflacao",
        "rotulo": "Inflação (IPCA)",
        "peso": 35,
        "param": {
          "abaixo": 3,
          "acima": 6
        },
        "regra": "IPCA acumulado em 12 meses no último mês da gestão no período. Pontuação 100 dentro da faixa da meta (3%, com tolerância de 1,5 ponto); abaixo da faixa cai até 0 em 3 pontos abaixo do piso; acima do teto cai até 0 em 6 pontos acima. A inflação depende também do Banco Central, do câmbio e de preços internacionais."
      },
      {
        "k": "desocupacao",
        "rotulo": "Desemprego",
        "peso": 35,
        "param": {
          "melhor": 4,
          "pior": 12
        },
        "regra": "Média da taxa de desocupação (PNAD Contínua) nos meses da gestão dentro do período. 100 com taxa de 4% ou menos, caindo até 0 com taxa de 12% ou mais."
      },
      {
        "k": "divida",
        "rotulo": "Dívida pública",
        "peso": 30,
        "param": {
          "aumentoMax": 10
        },
        "regra": "Variação da dívida bruta do governo geral, em pontos percentuais do PIB, entre o primeiro e o último mês da gestão no período. 100 sem aumento (ou com queda), caindo até 0 com aumento de 10 pontos ou mais. Só vale para gestão com pelo menos 12 meses no período."
      }
    ]
  }
};
