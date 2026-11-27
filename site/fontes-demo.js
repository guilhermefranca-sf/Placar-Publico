'use strict';
// Gerado por scripts/gerar-fontes-demo.mjs. Não edite à mão.
// Modo demonstração: o catálogo de fontes é o verdadeiro; os valores e a vigilância são INVENTADOS.
const INDEPENDENTES_DEMO = {
 "versao": 1,
 "geradoEm": "2026-11-26T22:02:22.865Z",
 "aviso": "Catálogo das fontes independentes (institutos, universidades, organizações da sociedade civil e organismos internacionais) que o Placar Público consulta além dos portais oficiais. Cada fato abaixo tem o endereço da publicação em que foi lido e a data da conferência. Nenhum número entra no Placar sem esse registro. Fonte catalogada não é fonte em uso: o campo \"status\" diz o que cada uma faz hoje.",
 "regras": [
  "Uma fonte independente só entra com dado verificável: o Placar guarda o endereço da publicação, a edição, o ano do dado e a data em que o número foi conferido.",
  "O Placar verifica todo dia se há edição nova (vigilância). A vigilância apenas avisa: nada é copiado sozinho para o site; um número novo só entra depois de conferido na fonte.",
  "Quando o dado oficial é insuficiente, o Placar consulta a fonte alternativa e a mostra com o selo \"independente\", separada do dado oficial.",
  "Cada cargo só recebe o que é da sua competência. Indicador de estado ou de município não é atribuído a presidente, senador ou deputado federal.",
  "O Placar não inventa dado. Ausência de informação nunca vira zero: aparece como \"Dado não encontrado ou não confirmado\".",
  "Números reproduzidos de reportagens que citam a fonte vêm marcados como tal, com o convite para conferir na publicação original."
 ],
 "status": {
  "em-uso": "Há valor desta fonte publicado no Placar.",
  "monitorada": "A fonte é vigiada todo dia, mas ainda não há valor dela no Placar.",
  "catalogada": "A fonte foi conferida e registrada; ainda não é usada. O motivo está em \"usoNoPlacar\"."
 },
 "fontes": [
  {
   "id": "instituto-exemplo",
   "nome": "Instituto Exemplo (inventado)",
   "organizacao": "Instituto Exemplo (inventado para a demonstração)",
   "tipo": "instituto de pesquisa",
   "url": "https://exemplo.invalid/",
   "metodologia": "https://exemplo.invalid/metodologia",
   "temas": [
    "preços",
    "custo de vida",
    "salário mínimo"
   ],
   "abrangencia": "27 capitais",
   "frequencia": "Mensal",
   "formato": "PDF mensal",
   "leituraAutomatica": "parcial",
   "licenca": null,
   "status": "em-uso",
   "usoNoPlacar": {
    "presidente": "Aba Preços no Brasil (cesta básica por capital, já em uso) e aba Economia (salário mínimo necessário estimado pelo DIEESE, com o mês e a comparação com o piso nacional).",
    "senadores": "Não se aplica (indicador nacional).",
    "federais": "Não se aplica (indicador nacional).",
    "governadores": "Não se aplica."
   },
   "limites": "O salário mínimo necessário é uma estimativa do DIEESE: parte da cesta mais cara do mês (a de São Paulo, em outubro de 2026) e supõe uma família de quatro pessoas. É metodologia própria do DIEESE, não um dado oficial do governo. O DIEESE publica a tabela em PDF.",
   "verificadoEm": "2026-11-25",
   "fatos": [
    {
     "texto": "Fonte inventada: existe só para mostrar como os cartões aparecem.",
     "url": "https://exemplo.invalid/fato",
     "tipoDeLeitura": "publicação original (PDF)"
    },
    {
     "texto": "Fonte inventada: existe só para mostrar como os cartões aparecem.",
     "url": "https://exemplo.invalid/fato",
     "tipoDeLeitura": "publicação original (PDF)"
    },
    {
     "texto": "Fonte inventada: existe só para mostrar como os cartões aparecem.",
     "url": "https://exemplo.invalid/fato",
     "tipoDeLeitura": "publicação original (PDF)"
    }
   ],
   "vigiada": true
  },
  {
   "id": "banco-mundial",
   "nome": "Banco Mundial — Indicadores de Desenvolvimento Mundial e de Governança",
   "organizacao": "Banco Mundial",
   "tipo": "organismo internacional",
   "url": "https://data.worldbank.org/",
   "metodologia": "https://datatopics.worldbank.org/world-development-indicators/",
   "temas": [
    "saúde",
    "educação",
    "segurança",
    "economia",
    "transparência"
   ],
   "abrangencia": "Países (comparação do Brasil com o mundo)",
   "frequencia": "Atualizações ao longo do ano; cada indicador tem seu ano de referência",
   "formato": "API pública (JSON)",
   "leituraAutomatica": "sim",
   "licenca": "Dados abertos do Banco Mundial (conferir os termos em data.worldbank.org)",
   "status": "em-uso",
   "usoNoPlacar": {
    "presidente": "Posição do Brasil entre os países nas abas Saúde, Educação, Segurança, Economia e Transparência.",
    "senadores": "Não se aplica (indicador nacional).",
    "federais": "Não se aplica (indicador nacional).",
    "governadores": "Não se aplica."
   },
   "limites": "O ano do dado varia por país; o Placar só compara países com dado de até 5 anos antes do ano do Brasil e mostra os anos usados.",
   "verificadoEm": "2026-11-26",
   "fatos": [],
   "vigiada": true
  },
  {
   "id": "fbsp",
   "nome": "Anuário Brasileiro de Segurança Pública",
   "organizacao": "Fórum Brasileiro de Segurança Pública (FBSP)",
   "tipo": "organização da sociedade civil",
   "url": "https://forumseguranca.org.br/",
   "metodologia": null,
   "temas": [
    "segurança pública"
   ],
   "abrangencia": "Brasil e unidades da federação",
   "frequencia": "Anual (20ª edição divulgada em 23/07/2026, com dados de 2025)",
   "formato": "Relatório em PDF e tabelas",
   "leituraAutomatica": "nao",
   "licenca": null,
   "status": "em-uso",
   "usoNoPlacar": {
    "presidente": "Aba Segurança: mortes violentas intencionais no Brasil (valor nacional, com ano e edição), ao lado do ranking mundial.",
    "senadores": "Não usada: o valor por estado ainda não foi conferido na fonte para os 27 estados.",
    "federais": "Não usada: o valor por estado ainda não foi conferido na fonte para os 27 estados.",
    "governadores": "Não usada (as abas dos governadores seguem como estavam)."
   },
   "limites": "Os números são enviados pelas secretarias estaduais de segurança e por outras bases oficiais; o próprio Fórum alerta que o critério de registro varia entre estados.",
   "verificadoEm": "2026-11-26",
   "fatos": [
    {
     "texto": "O 20º Anuário foi divulgado em 23/07/2026. O Brasil contabilizou 40.775 mortes violentas intencionais (MVI) em 2025.",
     "url": "https://jornalgrandebahia.com.br/?p=1372041",
     "tipoDeLeitura": "reportagem que cita o Anuário"
    },
    {
     "texto": "A taxa nacional de MVI foi de 19,1 por 100 mil habitantes em 2025, abaixo de 20 pela primeira vez desde o início da série, em 2012.",
     "url": "https://www.jb.com.br/brasil/2026/07/1060384-brasil-tem-menor-taxa-de-mortes-violentas-intencionais-desde-2012.html",
     "tipoDeLeitura": "reportagem que cita o Anuário"
    },
    {
     "texto": "A taxa nacional de MVI passou de 20,6 por 100 mil habitantes em 2024 para 19,1 em 2025; em 2012 era de 27,7.",
     "url": "https://www.diariodepernambuco.com.br/amp/brasil/2026/07/11719408-mortes-violentas-caem-82-no-pais-em-2025-feminicidios-aumentam-4.html",
     "tipoDeLeitura": "reportagem que cita o Anuário"
    },
    {
     "texto": "O Anuário é feito com informações das secretarias estaduais de Segurança Pública, das polícias civis, militares e Federal e de outras bases oficiais.",
     "url": "https://jornalgrandebahia.com.br/?p=1372041",
     "tipoDeLeitura": "reportagem que cita o Anuário"
    }
   ],
   "vigiada": true
  },
  {
   "id": "ips-brasil",
   "nome": "IPS Brasil — Índice de Progresso Social",
   "organizacao": "Imazon, com Fundação Avina, Amazônia 2030, Centro de Empreendedorismo da Amazônia e Social Progress Imperative",
   "tipo": "instituto de pesquisa",
   "url": "https://ipsbrasil.org.br/",
   "metodologia": "https://www.socialprogress.org/",
   "temas": [
    "progresso social",
    "necessidades humanas básicas",
    "bem-estar",
    "oportunidades"
   ],
   "abrangencia": "5.570 municípios, com resultado médio por estado",
   "frequencia": "Anual (edição 2026 divulgada em 20/05/2026, com dados de 2025)",
   "formato": "Painel e relatório",
   "leituraAutomatica": "nao",
   "licenca": null,
   "status": "em-uso",
   "usoNoPlacar": {
    "presidente": "Aba Visão geral: média nacional do IPS Brasil nas três últimas edições, com a escala (0 a 100) e o aviso de que mede o país inteiro, e não só o governo federal.",
    "senadores": "Não usada: a nota por estado ainda não foi conferida para os 27 estados.",
    "federais": "Não usada: a nota por estado ainda não foi conferida para os 27 estados.",
    "governadores": "Não usada (as abas dos governadores seguem como estavam)."
   },
   "limites": "O índice mede a qualidade de vida nos municípios com 57 indicadores sociais e ambientais. Reflete União, estados, municípios, economia e sociedade; não é nota de um governante.",
   "verificadoEm": "2026-11-26",
   "fatos": [
    {
     "texto": "O IPS Brasil 2026 avalia os 5.570 municípios com 57 indicadores sociais e ambientais, em escala de 0 a 100.",
     "url": "https://portalamazonia.com/amazonia/ranking-qualidade-vida-amazonia/",
     "tipoDeLeitura": "reportagem que cita o IPS Brasil"
    },
    {
     "texto": "A média nacional do IPS Brasil foi de 63,40 em 2026, 63,05 em 2025 e 62,85 em 2024.",
     "url": "https://www.gazetasp.com.br/cotidiano/interior-de-sp-4-melhores-cidades-para-viver/",
     "tipoDeLeitura": "reportagem que cita o IPS Brasil"
    },
    {
     "texto": "Os dados da edição 2026 usam informações de 2025; o índice é elaborado por Imazon, Fundação Avina, Amazônia 2030, Centro de Empreendedorismo da Amazônia e Social Progress Imperative.",
     "url": "https://www.itatiaia.com.br/valedoaco/ips-brasil-2026-aponta-ipatinga-como-destaque-regional-em-qualidade-de-vida/",
     "tipoDeLeitura": "reportagem que cita o IPS Brasil"
    },
    {
     "texto": "O IPS também avalia o desempenho médio dos estados: Distrito Federal, São Paulo e Santa Catarina ficaram nas primeiras posições; Pará, Maranhão e Acre nas últimas.",
     "url": "https://www.infomoney.com.br/economia/pequeno-municipio-de-sp-e-tricampeao-em-ranking-de-qualidade-de-vida-veja-lista/",
     "tipoDeLeitura": "reportagem que cita o IPS Brasil"
    }
   ],
   "vigiada": true
  },
  {
   "id": "dieese",
   "nome": "Pesquisa Nacional da Cesta Básica de Alimentos e salário mínimo necessário",
   "organizacao": "DIEESE, em parceria com a Conab",
   "tipo": "instituto de pesquisa",
   "url": "https://www.dieese.org.br/",
   "metodologia": "https://www.dieese.org.br/analisecestabasica/2026/202610cestabasica.pdf",
   "temas": [
    "preços",
    "custo de vida",
    "salário mínimo"
   ],
   "abrangencia": "27 capitais",
   "frequencia": "Mensal",
   "formato": "PDF mensal",
   "leituraAutomatica": "parcial",
   "licenca": null,
   "status": "em-uso",
   "usoNoPlacar": {
    "presidente": "Aba Preços no Brasil (cesta básica por capital, já em uso) e aba Economia (salário mínimo necessário estimado pelo DIEESE, com o mês e a comparação com o piso nacional).",
    "senadores": "Não se aplica (indicador nacional).",
    "federais": "Não se aplica (indicador nacional).",
    "governadores": "Não se aplica."
   },
   "limites": "O salário mínimo necessário é uma estimativa do DIEESE: parte da cesta mais cara do mês (a de São Paulo, em outubro de 2026) e supõe uma família de quatro pessoas. É metodologia própria do DIEESE, não um dado oficial do governo. O DIEESE publica a tabela em PDF.",
   "verificadoEm": "2026-11-26",
   "fatos": [
    {
     "texto": "O DIEESE estima mensalmente o valor do salário mínimo necessário para uma família de quatro pessoas, com base na cesta mais cara; em outubro de 2026 foi a de São Paulo.",
     "url": "https://www.dieese.org.br/analisecestabasica/2026/202610cestabasica.pdf",
     "tipoDeLeitura": "publicação original (PDF)"
    },
    {
     "texto": "Em setembro de 2026 o salário mínimo necessário era de R$ 7.750,01, o que correspondeu a 4,78 vezes o piso nacional.",
     "url": "https://www.dieese.org.br/analisecestabasica/2026/202610cestabasica.pdf",
     "tipoDeLeitura": "publicação original (PDF)"
    },
    {
     "texto": "Em setembro de 2025 o salário mínimo necessário deveria ter sido de R$ 7.075,83, ou 4,66 vezes o piso então vigente, de R$ 1.518,00.",
     "url": "https://www.dieese.org.br/analisecestabasica/2026/202609cestabasica.pdf",
     "tipoDeLeitura": "publicação original (PDF)"
    }
   ],
   "vigiada": true
  },
  {
   "id": "clp",
   "nome": "Ranking de Competitividade dos Estados",
   "organizacao": "Centro de Liderança Pública (CLP), com desenvolvimento técnico da Tendências Consultoria",
   "tipo": "organização suprapartidária",
   "url": "https://clp.org.br/",
   "metodologia": null,
   "temas": [
    "competitividade",
    "infraestrutura",
    "segurança pública",
    "educação",
    "solidez fiscal",
    "eficiência da máquina pública",
    "capital humano",
    "sustentabilidade ambiental"
   ],
   "abrangencia": "27 unidades da federação",
   "frequencia": "Anual (15ª edição divulgada em 27/08/2026)",
   "formato": "Relatório e painel",
   "leituraAutomatica": "nao",
   "licenca": null,
   "status": "catalogada",
   "usoNoPlacar": {
    "presidente": "Não se aplica (ranking de estados).",
    "senadores": "Reservada para um quadro \"contexto do estado\", rotulado como não atribuído ao parlamentar, quando a tabela completa das 27 UFs for conferida na publicação do CLP.",
    "federais": "Reservada para um quadro \"contexto do estado\", rotulado como não atribuído ao parlamentar, quando a tabela completa das 27 UFs for conferida na publicação do CLP.",
    "governadores": "Não usada (as abas dos governadores seguem como estavam; o ranking entre estados do Placar usa dados oficiais)."
   },
   "limites": "A posição é relativa: uma mudança de posição não significa, necessariamente, piora ou melhora absoluta em todos os indicadores. Os rankings mostram o estado, não o desempenho do parlamentar.",
   "verificadoEm": "2026-11-26",
   "fatos": [
    {
     "texto": "O ranking reúne indicadores em dez pilares; na edição de 2026, Santa Catarina assumiu a liderança (87,06 pontos), à frente de São Paulo (80,68), Paraná (76,30) e Rio Grande do Sul (68,00).",
     "url": "https://www.gazetadopovo.com.br/economia/santa-catarina-estado-mais-competitivo/",
     "tipoDeLeitura": "reportagem que cita o ranking"
    },
    {
     "texto": "O ranking avalia 27 estados com base em cerca de 100 indicadores distribuídos em dez pilares e foi divulgado em 27/08/2026.",
     "url": "https://timesbrasil.com.br/brasil/quais-estados-tem-melhor-desempenho-em-seguranca-infraestrutura/",
     "tipoDeLeitura": "reportagem que cita o ranking"
    },
    {
     "texto": "O ranking é elaborado desde 2011 pela organização suprapartidária Centro de Liderança Pública.",
     "url": "https://correiodoestado.com.br/economia/campo-grande-esta-entre-as-100-cidades-mais-competitivos-do-pais/453424/",
     "tipoDeLeitura": "reportagem que cita o ranking"
    }
   ],
   "vigiada": true
  },
  {
   "id": "social-progress",
   "nome": "Social Progress Index (índice mundial de progresso social)",
   "organizacao": "Social Progress Imperative",
   "tipo": "organização da sociedade civil",
   "url": "https://www.socialprogress.org/",
   "metodologia": "https://www.socialprogress.org/",
   "temas": [
    "progresso social"
   ],
   "abrangencia": "Países",
   "frequencia": "Anual",
   "formato": "Painel e planilhas",
   "leituraAutomatica": "nao",
   "licenca": null,
   "status": "catalogada",
   "usoNoPlacar": {
    "presidente": "Candidata a ranking mundial na Visão geral. A posição do Brasil na edição mais recente ainda não foi conferida: aparece como \"Dado não encontrado ou não confirmado\" e nada é publicado.",
    "senadores": "Não se aplica.",
    "federais": "Não se aplica.",
    "governadores": "Não se aplica."
   },
   "limites": "Mede o país todo, e não o governo federal.",
   "verificadoEm": "2026-11-26",
   "fatos": [
    {
     "texto": "O índice foi desenvolvido pela organização internacional Social Progress Imperative e é calculado em 170 países desde 2014; o IPS Brasil aplica o método aos municípios brasileiros.",
     "url": "https://goias.gov.br/turismo/?p=42858",
     "tipoDeLeitura": "publicação de órgão público que cita o índice"
    }
   ],
   "vigiada": true
  },
  {
   "id": "trata-brasil",
   "nome": "Ranking do Saneamento",
   "organizacao": "Instituto Trata Brasil, com GO Associados",
   "tipo": "organização da sociedade civil",
   "url": "https://tratabrasil.org.br/",
   "metodologia": "https://tratabrasil.org.br/wp-content/uploads/2026/03/Release-Ranking-2026_vf.pdf",
   "temas": [
    "saneamento",
    "água",
    "esgoto"
   ],
   "abrangencia": "100 municípios mais populosos",
   "frequencia": "Anual (18ª edição divulgada em 18/03/2026, com base no SINISA 2024)",
   "formato": "Relatório em PDF",
   "leituraAutomatica": "nao",
   "licenca": null,
   "status": "catalogada",
   "usoNoPlacar": {
    "presidente": "Não usada: o ranking é municipal e saneamento é competência principalmente de estados e municípios (a aba Saneamento do presidente foi retirada).",
    "senadores": "Não se aplica (indicador municipal).",
    "federais": "Não se aplica (indicador municipal).",
    "governadores": "Não usada nesta versão."
   },
   "limites": "Cobre só os 100 maiores municípios. Os dados são autodeclarados pelos prestadores de serviço ao SINISA.",
   "verificadoEm": "2026-11-26",
   "fatos": [
    {
     "texto": "A 18ª edição do Ranking do Saneamento foi publicada em março de 2026, com foco nos 100 municípios mais populosos, e combina três dimensões: Nível de Atendimento, Melhoria do Atendimento e Nível de Eficiência (pontuação máxima de 300 pontos).",
     "url": "https://tratabrasil.org.br/wp-content/uploads/2026/03/Release-Ranking-2026_vf.pdf",
     "tipoDeLeitura": "publicação original (PDF)"
    },
    {
     "texto": "O estudo usa os indicadores mais atuais do SINISA, ano-base 2024; o atendimento médio de água entre os 100 maiores municípios foi de 93,55%.",
     "url": "https://brasil61.com/n/saneamento-basico-28-municipios-atingem-universalizacao-no-abastecimento-de-agua-aponta-trata-brasil-copia-bras2616438.amp",
     "tipoDeLeitura": "reportagem que cita o ranking"
    }
   ],
   "vigiada": true
  },
  {
   "id": "firjan",
   "nome": "Índice Firjan de Gestão Fiscal (IFGF)",
   "organizacao": "Firjan — Federação das Indústrias do Estado do Rio de Janeiro",
   "tipo": "instituto de pesquisa",
   "url": "https://www.firjan.com.br/ifgf/",
   "metodologia": "https://firjan.com.br/data/files/8B/B6/AF/0C/E595991031B91689D8284EA8/Anexo%20Metodologico.pdf",
   "temas": [
    "gestão fiscal",
    "finanças públicas"
   ],
   "abrangencia": "Municípios",
   "frequencia": "Bienal (edição 2025, de setembro de 2025, com dados de 2024)",
   "formato": "Relatório em PDF e base de dados",
   "leituraAutomatica": "nao",
   "licenca": null,
   "status": "catalogada",
   "usoNoPlacar": {
    "presidente": "Não se aplica (índice municipal).",
    "senadores": "Não se aplica (índice municipal).",
    "federais": "Não se aplica (índice municipal).",
    "governadores": "Não usada."
   },
   "limites": "O IFGF avalia prefeituras. O IFDM e outros produtos da Firjan não foram conferidos nesta rodada e não aparecem aqui.",
   "verificadoEm": "2026-11-26",
   "fatos": [
    {
     "texto": "O IFGF 2025 analisou, com dados de 2024, as contas de 5.129 municípios, onde vivem 95,6% da população; o índice é construído com base em resultados fiscais oficiais declarados pelos próprios entes. A publicação é bienal.",
     "url": "https://www.firjan.com.br/data/files/E6/06/90/DD/9226991031B91689D8284EA8/IFGF_2025.pdf",
     "tipoDeLeitura": "publicação original (PDF)"
    }
   ],
   "vigiada": true
  },
  {
   "id": "qedu",
   "nome": "QEdu",
   "organizacao": "Iede — Interdisciplinaridade e Evidências no Debate Educacional (gestora da plataforma desde 2020)",
   "tipo": "plataforma de dados",
   "url": "https://qedu.org.br/",
   "metodologia": null,
   "temas": [
    "educação",
    "aprendizagem",
    "Ideb"
   ],
   "abrangencia": "Escolas, municípios, estados e Brasil",
   "frequencia": "Acompanha as divulgações do MEC/Inep",
   "formato": "Painel na internet",
   "leituraAutomatica": "nao",
   "licenca": null,
   "status": "catalogada",
   "usoNoPlacar": {
    "presidente": "Não usada: os dados primários (Ideb, Saeb, Censo Escolar) são do Inep, que é fonte oficial; o QEdu serve para conferência.",
    "senadores": "Não usada.",
    "federais": "Não usada.",
    "governadores": "Não usada nesta versão."
   },
   "limites": "O QEdu reorganiza dados do MEC/Inep: quando o dado oficial existe, o Placar prefere o oficial.",
   "verificadoEm": "2026-11-26",
   "fatos": [
    {
     "texto": "O QEdu monitora resultados educacionais de bases como Prova Brasil, Censo Escolar, Ideb e Enem, do Ministério da Educação.",
     "url": "https://data.europa.eu/sites/default/files/use-cases/brazil_-_qedu.pdf",
     "tipoDeLeitura": "publicação de terceiros que descreve a plataforma"
    },
    {
     "texto": "O Ideb 2025 foi divulgado pelo MEC em 05/08/2026.",
     "url": "https://agenciabrasil.ebc.com.br/educacao/noticia/2026-08/ideb-mostra-avanco-da-educacao-basica-no-pais",
     "tipoDeLeitura": "reportagem de agência pública"
    }
   ],
   "vigiada": true
  },
  {
   "id": "ieps-data",
   "nome": "IEPS Data",
   "organizacao": "Instituto de Estudos para Políticas de Saúde (IEPS)",
   "tipo": "instituto de pesquisa",
   "url": "https://www.iepsdata.org.br/",
   "metodologia": "https://ieps.org.br/wp-content/uploads/2022/09/IEPS_NT28.pdf",
   "temas": [
    "saúde",
    "atenção básica",
    "mortalidade",
    "gastos em saúde"
   ],
   "abrangencia": "Municípios, regiões de saúde e estados",
   "frequencia": "Atualização contínua dos indicadores",
   "formato": "Painel e bases para download",
   "leituraAutomatica": "nao",
   "licenca": null,
   "status": "catalogada",
   "usoNoPlacar": {
    "presidente": "Não se aplica (indicadores locais; o Ministério da Saúde e o DATASUS são as fontes oficiais).",
    "senadores": "Reservada para o quadro \"contexto do estado\" em saúde, quando um indicador por estado for conferido.",
    "federais": "Reservada para o quadro \"contexto do estado\" em saúde, quando um indicador por estado for conferido.",
    "governadores": "Não usada nesta versão."
   },
   "limites": "Usa dados do SUS (SISAB, SINASC, SIH e SIM), reorganizados. Quando o dado oficial existe, o Placar prefere o oficial.",
   "verificadoEm": "2026-11-26",
   "fatos": [
    {
     "texto": "O IEPS Data reúne mais de 180 indicadores de saúde de todos os municípios brasileiros desde 2010, com visualizações, documentação e bases prontas para download.",
     "url": "https://medicinasa.com.br/gastos-saude-23/",
     "tipoDeLeitura": "reportagem que cita o IEPS"
    },
    {
     "texto": "A Nota Técnica 28 do IEPS compara os estados brasileiros em dimensões-chave da saúde, com indicadores estaduais do portal.",
     "url": "https://ieps.org.br/wp-content/uploads/2022/09/IEPS_NT28.pdf",
     "tipoDeLeitura": "publicação original (PDF)"
    }
   ],
   "vigiada": true
  },
  {
   "id": "base-dos-dados",
   "nome": "Base dos Dados",
   "organizacao": "Base dos Dados",
   "tipo": "plataforma de dados",
   "url": "https://basedosdados.org/",
   "metodologia": "https://basedosdados.org/en/docs/access_data_bq",
   "temas": [
    "dados públicos tratados",
    "economia",
    "saúde",
    "educação",
    "eleições"
   ],
   "abrangencia": "Bases públicas brasileiras tratadas e padronizadas",
   "frequencia": "Varia por base",
   "formato": "Datalake público no BigQuery; pacotes para Python, R e Stata; CSV para tabelas de até 200 mil linhas",
   "leituraAutomatica": "nao",
   "licenca": null,
   "status": "catalogada",
   "usoNoPlacar": {
    "presidente": "Consulta manual para conferir números; o Placar não usa a plataforma na rotina diária.",
    "senadores": "Consulta manual.",
    "federais": "Consulta manual.",
    "governadores": "Consulta manual."
   },
   "limites": "Consultar o datalake exige um projeto no Google Cloud (a cota gratuita é de 1 TB de consultas por mês). A rotina do Placar não guarda credenciais, então não lê a plataforma sozinha. Os dados são os mesmos das fontes originais, tratados.",
   "verificadoEm": "2026-11-26",
   "fatos": [
    {
     "texto": "A plataforma oferece tabelas tratadas em um datalake público; é possível consultar por BigQuery (1 TB gratuito por mês por projeto), por pacotes em Python, R e Stata ou baixar o CSV (não disponível para arquivos com mais de 200 mil linhas).",
     "url": "https://basedosdados.github.io/sdk/en",
     "tipoDeLeitura": "publicação original (documentação)"
    }
   ],
   "vigiada": true
  },
  {
   "id": "transparencia-brasil",
   "nome": "Transparência Brasil",
   "organizacao": "Transparência Brasil",
   "tipo": "organização da sociedade civil",
   "url": "https://www.transparencia.org.br/",
   "metodologia": null,
   "temas": [
    "transparência",
    "contratações públicas",
    "dados abertos",
    "controle social"
   ],
   "abrangencia": "Brasil",
   "frequencia": "Varia por projeto",
   "formato": "Relatórios e painéis",
   "leituraAutomatica": "nao",
   "licenca": null,
   "status": "catalogada",
   "usoNoPlacar": {
    "presidente": "Não usada: nenhum painel com dado reutilizável sobre o governo federal foi confirmado nesta verificação.",
    "senadores": "Não usada: nenhum painel sobre o mandato de parlamentares foi confirmado nesta verificação.",
    "federais": "Não usada: nenhum painel sobre o mandato de parlamentares foi confirmado nesta verificação.",
    "governadores": "Não usada."
   },
   "limites": "A organização atua em dados abertos e contratações públicas. O Placar só passará a usar um produto dela depois de conferir a metodologia e a licença daquele produto.",
   "verificadoEm": "2026-11-26",
   "fatos": [
    {
     "texto": "O Relatório de Impacto 2025 da organização descreve o trabalho com boas práticas de contratação pública, transparência e dados abertos.",
     "url": "https://backend.transparencia.org.br/wp-content/uploads/2026/05/Relatorio-de-Impacto-2025-1.pdf",
     "tipoDeLeitura": "publicação original (PDF)"
    }
   ],
   "vigiada": true
  },
  {
   "id": "congresso-em-foco",
   "nome": "Radar do Congresso",
   "organizacao": "Congresso em Foco",
   "tipo": "veículo de jornalismo de dados",
   "url": "https://www.congressoemfoco.com.br/",
   "metodologia": null,
   "temas": [
    "transparência de mandatos",
    "atuação parlamentar"
   ],
   "abrangencia": "Deputados federais e senadores",
   "frequencia": "Não conferida",
   "formato": "Reportagens e conjuntos de dados",
   "leituraAutomatica": "nao",
   "licenca": null,
   "status": "catalogada",
   "usoNoPlacar": {
    "presidente": "Não se aplica.",
    "senadores": "Candidata a complementar a transparência do gabinete. Edição, data e licença do conjunto de dados ainda não foram conferidas: nada é publicado.",
    "federais": "Candidata a complementar a transparência do gabinete. Edição, data e licença do conjunto de dados ainda não foram conferidas: nada é publicado.",
    "governadores": "Não se aplica."
   },
   "limites": "É uma avaliação feita por um veículo de imprensa, com critérios próprios. Só entra no Placar com metodologia pública conferida e rotulada como independente.",
   "verificadoEm": "2026-11-26",
   "fatos": [
    {
     "texto": "O Radar do Congresso, projeto do Congresso em Foco, publica um levantamento sobre o grau de transparência dos mandatos de deputados federais e senadores.",
     "url": "https://congressoemfoco.com.br/noticia/23180/congresso-em-foco-vai-medir-transparencia-de-deputados-e-senadores",
     "tipoDeLeitura": "reportagem do próprio veículo"
    }
   ],
   "vigiada": true
  }
 ],
 "indicadores": [
  {
   "id": "exemplo-seguranca",
   "cargo": "presidente",
   "secao": "seguranca",
   "nome": "Mortes violentas (exemplo inventado)",
   "unidade": "por 100 mil habitantes",
   "melhor": "menor",
   "casas": 1,
   "pontos": [
    {
     "rotulo": "2022",
     "valor": 24.3
    },
    {
     "rotulo": "2023",
     "valor": 22.8
    },
    {
     "rotulo": "2024",
     "valor": 21
    }
   ],
   "destaque": "Valor inventado: a taxa do exemplo caiu nos três anos mostrados.",
   "edicao": "Anuário de exemplo 2025 (inventado)",
   "leitura": "publicação original (inventada)",
   "urls": [
    "https://exemplo.invalid/anuario"
   ],
   "aviso": "Número inventado do modo demonstração. Na versão real, cada valor traz a edição, o endereço onde foi lido e a data de conferência.",
   "conferidoEm": "2026-11-25",
   "fonte": {
    "id": "instituto-exemplo",
    "nome": "Instituto Exemplo (inventado)",
    "organizacao": "Instituto Exemplo (inventado para a demonstração)",
    "url": "https://exemplo.invalid/",
    "tipo": "instituto de pesquisa"
   }
  },
  {
   "id": "exemplo-economia",
   "cargo": "presidente",
   "secao": "economia",
   "nome": "Custo da cesta de exemplo (inventado)",
   "unidade": "R$ por mês",
   "melhor": "neutro",
   "casas": 2,
   "pontos": [
    {
     "rotulo": "out/2025",
     "valor": 710.5
    },
    {
     "rotulo": "out/2026",
     "valor": 745.9
    }
   ],
   "destaque": "Valor inventado, só para mostrar o formato do cartão.",
   "edicao": "Pesquisa de exemplo, outubro de 2026 (inventada)",
   "leitura": "publicação original (inventada)",
   "urls": [
    "https://exemplo.invalid/cesta"
   ],
   "aviso": "Número inventado do modo demonstração.",
   "conferidoEm": "2026-11-25",
   "fonte": {
    "id": "instituto-exemplo",
    "nome": "Instituto Exemplo (inventado)",
    "organizacao": "Instituto Exemplo (inventado para a demonstração)",
    "url": "https://exemplo.invalid/",
    "tipo": "instituto de pesquisa"
   }
  },
  {
   "id": "exemplo-visao",
   "cargo": "presidente",
   "secao": "visao",
   "nome": "Índice de progresso social de exemplo (inventado)",
   "unidade": "pontos de 0 a 100",
   "melhor": "maior",
   "casas": 2,
   "pontos": [
    {
     "rotulo": "2023",
     "valor": 61.2
    },
    {
     "rotulo": "2024",
     "valor": 61.9
    },
    {
     "rotulo": "2025",
     "valor": 62.4
    }
   ],
   "destaque": "Valor inventado.",
   "edicao": "Edição de exemplo 2025 (inventada)",
   "leitura": "publicação original (inventada)",
   "urls": [
    "https://exemplo.invalid/ips"
   ],
   "aviso": "Número inventado do modo demonstração.",
   "conferidoEm": "2026-11-25",
   "fonte": {
    "id": "instituto-exemplo",
    "nome": "Instituto Exemplo (inventado)",
    "organizacao": "Instituto Exemplo (inventado para a demonstração)",
    "url": "https://exemplo.invalid/",
    "tipo": "instituto de pesquisa"
   }
  }
 ],
 "descartados": 0,
 "demo": true
};
const VIGILANCIA_DEMO = {
 "versao": 1,
 "geradoEm": "2026-11-25T22:02:22.865Z",
 "regra": "A vigilância só avisa que há edição ou atualização nova. Nenhum número é copiado sozinho: ele só entra no Placar depois de conferido na fonte e registrado, com link e data.",
 "fontes": {
  "instituto-exemplo": {
   "id": "instituto-exemplo",
   "nome": "Instituto Exemplo (inventado)",
   "url": "https://exemplo.invalid/",
   "tipo": "pagina",
   "lidoEm": "2026-11-25T22:02:22.865Z",
   "status": "sem-mudanca",
   "marcador": {
    "hash": "14c89970b9ef72eb",
    "anoMaisRecente": 2026,
    "tamanho": 515
   },
   "ultimoSucesso": "2026-11-25T22:02:22.865Z",
   "falhasSeguidas": 0,
   "pendente": false
  },
  "banco-mundial": {
   "id": "banco-mundial",
   "nome": "Banco Mundial — Indicadores de Desenvolvimento Mundial e de Governança",
   "url": "https://data.worldbank.org/",
   "tipo": "banco-mundial",
   "lidoEm": "2026-11-25T22:02:22.865Z",
   "status": "sem-mudanca",
   "marcador": {
    "atualizadoEm": "2026-10-27"
   },
   "ultimoSucesso": "2026-11-25T22:02:22.865Z",
   "falhasSeguidas": 0,
   "pendente": false
  },
  "fbsp": {
   "id": "fbsp",
   "nome": "Anuário Brasileiro de Segurança Pública",
   "url": "https://forumseguranca.org.br/",
   "tipo": "pagina",
   "lidoEm": "2026-11-25T22:02:22.865Z",
   "status": "mudou",
   "marcador": {
    "hash": "c52089958824dc43",
    "anoMaisRecente": 2026,
    "tamanho": 543
   },
   "ultimoSucesso": "2026-11-25T22:02:22.865Z",
   "falhasSeguidas": 0,
   "pendente": false
  },
  "ips-brasil": {
   "id": "ips-brasil",
   "nome": "IPS Brasil — Índice de Progresso Social",
   "url": "https://ipsbrasil.org.br/",
   "tipo": "pagina",
   "lidoEm": "2026-11-25T22:02:22.865Z",
   "status": "nova-edicao",
   "marcador": {
    "hash": "9ef1b5063f4fe248",
    "anoMaisRecente": 2027,
    "tamanho": 538
   },
   "ultimoSucesso": "2026-11-25T22:02:22.865Z",
   "falhasSeguidas": 0,
   "novidade": {
    "em": "2026-11-25",
    "de": "2026",
    "para": "2027"
   },
   "pendente": false
  },
  "dieese": {
   "id": "dieese",
   "nome": "Pesquisa Nacional da Cesta Básica de Alimentos e salário mínimo necessário",
   "url": "https://www.dieese.org.br/",
   "tipo": "url-mensal",
   "lidoEm": "2026-11-25T22:02:22.865Z",
   "status": "sem-mudanca",
   "marcador": {
    "ultimoMes": "202611"
   },
   "ultimoSucesso": "2026-11-25T22:02:22.865Z",
   "falhasSeguidas": 0,
   "pendente": false
  },
  "clp": {
   "id": "clp",
   "nome": "Ranking de Competitividade dos Estados",
   "url": "https://clp.org.br/",
   "tipo": "pagina",
   "lidoEm": "2026-11-25T22:02:22.865Z",
   "status": "sem-mudanca",
   "marcador": {
    "hash": "14c89970b9ef72eb",
    "anoMaisRecente": 2026,
    "tamanho": 515
   },
   "ultimoSucesso": "2026-11-25T22:02:22.865Z",
   "falhasSeguidas": 0,
   "pendente": false
  },
  "social-progress": {
   "id": "social-progress",
   "nome": "Social Progress Index (índice mundial de progresso social)",
   "url": "https://www.socialprogress.org/",
   "tipo": "pagina",
   "lidoEm": "2026-11-25T22:02:22.865Z",
   "status": "sem-mudanca",
   "marcador": {
    "hash": "14c89970b9ef72eb",
    "anoMaisRecente": 2026,
    "tamanho": 515
   },
   "ultimoSucesso": "2026-11-25T22:02:22.865Z",
   "falhasSeguidas": 0,
   "pendente": false
  },
  "trata-brasil": {
   "id": "trata-brasil",
   "nome": "Ranking do Saneamento",
   "url": "https://tratabrasil.org.br/",
   "tipo": "pagina",
   "lidoEm": "2026-11-25T22:02:22.865Z",
   "status": "sem-mudanca",
   "marcador": {
    "hash": "14c89970b9ef72eb",
    "anoMaisRecente": 2026,
    "tamanho": 515
   },
   "ultimoSucesso": "2026-11-25T22:02:22.865Z",
   "falhasSeguidas": 0,
   "pendente": false
  },
  "firjan": {
   "id": "firjan",
   "nome": "Índice Firjan de Gestão Fiscal (IFGF)",
   "url": "https://www.firjan.com.br/ifgf/",
   "tipo": "pagina",
   "lidoEm": "2026-11-25T22:02:22.865Z",
   "status": "sem-mudanca",
   "marcador": {
    "hash": "14c89970b9ef72eb",
    "anoMaisRecente": 2026,
    "tamanho": 515
   },
   "ultimoSucesso": "2026-11-25T22:02:22.865Z",
   "falhasSeguidas": 0,
   "pendente": false
  },
  "qedu": {
   "id": "qedu",
   "nome": "QEdu",
   "url": "https://qedu.org.br/",
   "tipo": "pagina",
   "lidoEm": "2026-11-25T22:02:22.865Z",
   "status": "sem-mudanca",
   "marcador": {
    "hash": "14c89970b9ef72eb",
    "anoMaisRecente": 2026,
    "tamanho": 515
   },
   "ultimoSucesso": "2026-11-25T22:02:22.865Z",
   "falhasSeguidas": 0,
   "pendente": false
  },
  "ieps-data": {
   "id": "ieps-data",
   "nome": "IEPS Data",
   "url": "https://www.iepsdata.org.br/",
   "tipo": "pagina",
   "lidoEm": "2026-11-25T22:02:22.865Z",
   "status": "sem-mudanca",
   "marcador": {
    "hash": "14c89970b9ef72eb",
    "anoMaisRecente": 2026,
    "tamanho": 515
   },
   "ultimoSucesso": "2026-11-25T22:02:22.865Z",
   "falhasSeguidas": 0,
   "pendente": false
  },
  "base-dos-dados": {
   "id": "base-dos-dados",
   "nome": "Base dos Dados",
   "url": "https://basedosdados.org/",
   "tipo": "pagina",
   "lidoEm": "2026-11-25T22:02:22.865Z",
   "status": "sem-mudanca",
   "marcador": {
    "hash": "14c89970b9ef72eb",
    "anoMaisRecente": 2026,
    "tamanho": 515
   },
   "ultimoSucesso": "2026-11-25T22:02:22.865Z",
   "falhasSeguidas": 0,
   "pendente": false
  },
  "transparencia-brasil": {
   "id": "transparencia-brasil",
   "nome": "Transparência Brasil",
   "url": "https://www.transparencia.org.br/",
   "tipo": "pagina",
   "lidoEm": "2026-11-25T22:02:22.865Z",
   "status": "sem-mudanca",
   "marcador": {
    "hash": "14c89970b9ef72eb",
    "anoMaisRecente": 2026,
    "tamanho": 515
   },
   "ultimoSucesso": "2026-11-25T22:02:22.865Z",
   "falhasSeguidas": 0,
   "pendente": false
  },
  "congresso-em-foco": {
   "id": "congresso-em-foco",
   "nome": "Radar do Congresso",
   "url": "https://www.congressoemfoco.com.br/",
   "tipo": "pagina",
   "lidoEm": "2026-11-25T22:02:22.865Z",
   "status": "sem-mudanca",
   "marcador": {
    "hash": "14c89970b9ef72eb",
    "anoMaisRecente": 2026,
    "tamanho": 515
   },
   "ultimoSucesso": "2026-11-25T22:02:22.865Z",
   "falhasSeguidas": 0,
   "pendente": false
  }
 },
 "demo": true
};
