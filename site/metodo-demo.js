'use strict';
// Gerado por scripts/gerar-metodo-demo.mjs. Não edite à mão.
const METODO_DEMO = {
  "versao": 2,
  "escala": "O índice vai de 0 a 100.",
  "federais": {
    "janelaAnos": 4,
    "minSessoes": 20,
    "minMesesAprovados": 12,
    "minReunioesComissao": 10,
    "minMesesCusto": 3,
    "minCriterios": 3,
    "componentes": [
      {
        "k": "aprov",
        "rotulo": "Projetos aprovados",
        "peso": 30,
        "regra": "Projetos de lei, PECs e outras propostas de sua autoria (sozinho ou em coautoria) apresentados nos últimos 4 anos que hoje constam como aprovados pelo Plenário da Câmara, incluindo os já transformados em lei, os enviados ao Senado e os que aguardam sanção. O número de aprovados é dividido pelos anos de exercício e comparado ao dos demais deputados. Projeto aprovado só em comissão, em tramitação, arquivado ou rejeitado não conta como aprovado. Quem tem menos de 12 meses de exercício no período fica sem este critério (histórico insuficiente), porque zero projetos aprovados no começo do mandato não é desempenho negativo; nesse caso o índice usa os outros critérios. Mede quantidade de projetos aprovados, não a importância nem o alcance social de cada um."
      },
      {
        "k": "vot",
        "rotulo": "Votações nominais",
        "peso": 15,
        "regra": "Porcentagem das votações nominais do Plenário, nos últimos 4 anos, em que o deputado registrou voto. Votação simbólica não entra, pois não tem voto individual. Votações durante licença ou afastamento não contam contra ele."
      },
      {
        "k": "pres",
        "rotulo": "Presença no Plenário",
        "peso": 20,
        "regra": "Porcentagem das sessões deliberativas do Plenário com presença registrada nos últimos 4 anos, contadas desde a primeira presença do deputado nesse período. Sessões em que o deputado estava licenciado ou afastado, segundo o histórico oficial da Câmara, não contam contra ele."
      },
      {
        "k": "comis",
        "rotulo": "Presença em comissões",
        "peso": 10,
        "regra": "Porcentagem das reuniões deliberativas já encerradas das comissões permanentes da Câmara, nos últimos 4 anos, em que o deputado, como membro titular da comissão na data da reunião, teve presença registrada. Audiências públicas, reuniões não deliberativas, comissões especiais, mistas e de medida provisória não entram. Reuniões em que estava licenciado ou afastado não contam contra ele. Quem teve menos de 10 reuniões esperadas no período fica sem este critério (\"Dado não encontrado ou não confirmado\"; não vira zero). Limites: a Câmara não publica quem substituiu o titular numa reunião; o suplente que substituiu um titular não aparece como presente nos dados, e a falta do titular substituído pode contar contra ele. Comissões têm médias de comparecimento diferentes, e o índice usa a porcentagem do próprio deputado, sem ajuste."
      },
      {
        "k": "custo",
        "rotulo": "Custo para os cofres públicos",
        "peso": 25,
        "regra": "Quanto o deputado custou aos cofres públicos por mês de exercício nos últimos 4 anos, sem contar o subsídio (igual para todos). Entram os valores que o Portal da Transparência da Câmara publica por deputado e por ano: cota parlamentar, verba de gabinete, auxílio-moradia (pago em dinheiro) e viagens oficiais. O total é dividido pelos meses de exercício e comparado ao de TODOS os deputados do país, e não só aos do mesmo estado: menos custo dá pontuação maior. Não medidos, por não haver valor publicado por deputado: ajuda de custo, plano de saúde (Pró-Saúde), serviço gráfico, encargos dos secretários parlamentares (13º, férias, auxílio-alimentação) e o uso de imóvel funcional (a Câmara publica só os dias de ocupação, sem valor em reais). Estes itens não são somados como zero: simplesmente não entram na conta. Ausência de lançamento na fonte (por exemplo, nenhuma viagem oficial) significa que a Câmara não publicou gasto, não que o Placar preencheu um dado. Limites: o limite mensal da cota varia por estado (por causa do preço das passagens até Brasília), e Mesa e Presidência da Câmara têm benefícios adicionais; o custo mede quanto saiu dos cofres, não o que o deputado entregou, e gasto dentro das regras faz parte do mandato."
      }
    ]
  },
  "senadores": {
    "nome": "Índice do senador",
    "janelaAnos": 4,
    "minMesesAprovados": 12,
    "minMesesCusto": 3,
    "minVotacoes": 20,
    "minCriterios": 2,
    "componentes": [
      {
        "k": "aprov",
        "rotulo": "Projetos aprovados",
        "peso": 30,
        "regra": "Matérias de autoria do senador (sozinho ou em coautoria) apresentadas nos últimos 4 anos que hoje constam como aprovadas pelo Plenário do Senado ou transformadas em norma jurídica, segundo a situação publicada pelo Senado. O número é dividido pelos anos de exercício e comparado ao dos demais senadores. Quem tem menos de 12 meses de exercício no período fica sem este critério (zero no começo do mandato não é desempenho negativo). Mede quantidade de matérias aprovadas, não a importância de cada uma."
      },
      {
        "k": "vot",
        "rotulo": "Votações nominais",
        "peso": 15,
        "regra": "Porcentagem das votações nominais do Plenário do Senado, nos últimos 4 anos, em que o senador registrou voto (Sim, Não ou Abstenção), segundo o Senado. Votação secreta, simbólica ou em que o senador presidia a sessão não entra. Quem tem menos de 20 votações nominais no período fica sem este critério."
      },
      {
        "k": "pres",
        "rotulo": "Presença no Plenário",
        "peso": 20,
        "regra": "Porcentagem das sessões deliberativas do Plenário com presença registrada. Só entra quando o Placar consegue ler e conferir a presença por senador numa fonte oficial. Se não conseguir, aparece \"Dado não encontrado ou não confirmado\" e o critério fica de fora, sem virar nota zero."
      },
      {
        "k": "comis",
        "rotulo": "Presença em comissões",
        "peso": 10,
        "regra": "Porcentagem das reuniões deliberativas das comissões permanentes do Senado em que o senador, como titular, teve presença registrada. Só entra quando o Placar consegue ler e conferir a presença por reunião numa fonte oficial. Se não conseguir, aparece \"Dado não encontrado ou não confirmado\" e o critério fica de fora, sem virar nota zero."
      },
      {
        "k": "custo",
        "rotulo": "Custo para os cofres públicos",
        "peso": 25,
        "regra": "Quanto o senador custou aos cofres públicos por mês de exercício nos últimos 4 anos, sem contar o subsídio (igual para todos). Nesta versão só entra a cota para o exercício da atividade parlamentar (CEAPS), que o Senado publica por senador, mês a mês. O total é dividido pelos meses de exercício (pelos períodos de exercício que o Senado publica para cada senador; quando só as datas do mandato estão disponíveis, o perfil avisa que licenças não foram descontadas) e comparado ao dos demais senadores em exercício: menos custo dá pontuação maior. Não medidos nesta versão, porque o Placar ainda não lê um valor por senador de fonte conferida: auxílio-moradia, remuneração do pessoal do gabinete, missões e viagens oficiais pagas diretamente pelo Senado, assistência à saúde (o Senado publica só o total mensal, sem separar por senador) e o uso de apartamento funcional. Estes itens não são somados como zero: simplesmente não entram na conta. Limites: valores recentes podem ainda não ter sido publicados, o que vale para todos os senadores; o custo mede quanto saiu dos cofres, não o que o senador entregou, e gasto dentro das regras faz parte do mandato."
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
  },
  "custoNaoMedidos": [
    "ajuda de custo (paga no início e no fim do mandato)",
    "plano de saúde e atendimento médico (Pró-Saúde)",
    "serviço gráfico",
    "encargos dos secretários parlamentares (13º, férias, auxílio-alimentação)",
    "uso de imóvel funcional: valor não publicado por deputado (a Câmara publica só os dias de ocupação)"
  ],
  "custoNaoMedidosSenadores": [
    "auxílio-moradia (o Placar ainda não lê um valor por senador de fonte conferida)",
    "remuneração do pessoal do gabinete (valor por senador ainda não lido)",
    "missões e viagens oficiais pagas diretamente pelo Senado (valor por senador ainda não lido)",
    "assistência à saúde (o Senado publica só o total mensal, sem separar por senador)",
    "uso de apartamento funcional (valor não publicado por senador)"
  ]
};
