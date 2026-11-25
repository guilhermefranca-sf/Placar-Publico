'use strict';

/* =====================================================================
   Placar Público — páginas de texto: Metodologia, Fontes, Verificação
   ===================================================================== */

function tabelaComponentes(componentes) {
  return html`<div class="rolagem"><table class="tabela">
    <thead><tr><th>Critério</th><th class="num">Peso</th><th>Como é medido</th></tr></thead>
    <tbody>${componentes.map(c => html`<tr><td><strong>${c.rotulo}</strong></td><td class="num">${c.peso}%</td><td>${c.regra}</td></tr>`)}</tbody>
  </table></div>`;
}

function viewMetodologia() {
  document.title = 'Metodologia · Placar Público';
  const m = DADOS.metodo;
  const jan = ((DADOS.meta && DADOS.meta.fontes && DADOS.meta.fontes.camara) || {}).janela;
  const anoHoje = new Date().getFullYear();
  const periodo4 = jan ? `${jan.de} a ${jan.ate}` : `${anoHoje - 3} a ${anoHoje}`;
  mostrar(app, html`<article class="pagina">
    <h1>Como o índice é calculado</h1>
    <p class="lead">O índice vai de 0 a 100 e usa só dados oficiais abertos. Todas as regras estão escritas aqui, e o código que calcula é aberto: quem quiser conferir ou discordar de um peso pode ver e propor outra regra.</p>

    <h2>O que o índice é, e o que ele não é</h2>
    <div class="cartao"><ul class="pontos">
      <li>É um resumo de critérios objetivos que dá para medir com dados públicos, aplicados do mesmo jeito para todos do mesmo cargo. <strong>É uma regra criada pelo Placar Público, não um dado oficial.</strong></li>
      <li><strong>Não mede a qualidade do trabalho.</strong> Um deputado pode ter muitos projetos aprovados de pouca importância ou poucos de grande peso; o índice só enxerga a quantidade e o cumprimento de deveres.</li>
      <li><strong>Índice baixo não é acusação.</strong> Uma ausência pode ser missão oficial, licença ou doença. Um dado pode estar defasado na fonte ou ainda não ter sido publicado. O índice não sabe o motivo.</li>
      <li>As cores servem só para leitura rápida: 70 ou mais em verde, de 40 a 69 em amarelo, abaixo de 40 em vermelho. Não são faixas oficiais.</li>
    </ul></div>

    <h2>Como separamos os números</h2>
    <p>Cada número na tela é de um destes tipos, e traz um selo dizendo de onde vem:</p>
    <div class="rolagem"><table class="tabela">
      <thead><tr><th>Selo</th><th>O que significa</th></tr></thead>
      <tbody>
        <tr><td>${selo('oficial')}</td><td>Valor que a fonte oficial publica, mostrado como está (por exemplo, o resultado de uma votação ou os eventos do histórico de mandato).</td></tr>
        <tr><td>${selo('calculado')}</td><td>Conta feita pelo Placar Público com dados oficiais: uma proporção (presença em %), uma soma (gasto da cota) ou uma média. A regra está nesta página.</td></tr>
        <tr><td>${selo('indice')}</td><td>O índice de 0 a 100. Combina vários números calculados, com pesos escolhidos por nós.</td></tr>
      </tbody>
    </table></div>
    <p style="margin-top:12px">E cada indicador é de uma natureza, para não misturar coisas diferentes:</p>
    <ul class="pontos">
      <li><strong>Quantitativo:</strong> uma contagem (projetos apresentados, sessões, relatórios entregues).</li>
      <li><strong>Proporcional:</strong> uma taxa (presença em % das sessões, gasto com pessoal em % da receita).</li>
      <li><strong>De resultado:</strong> o que aconteceu de fato (matéria aprovada ou rejeitada). Só aparece com fonte oficial.</li>
      <li><strong>De contexto:</strong> informação para entender o número (população, anos de exercício, licenças).</li>
    </ul>

    ${m ? html`
    <h2>Deputados federais</h2>
    <p>Calculado todo dia com os dados dos últimos 4 anos civis (agora, ${periodo4}; o ano em curso conta até o dia da atualização). Cada deputado é avaliado desde a primeira presença registrada nesse período, então quem assumiu depois não é comparado como se estivesse lá desde o início. Licenças e afastamentos registrados no histórico oficial da Câmara não contam contra o deputado: nem as sessões e votações desse período, nem os meses no cálculo do gasto e dos projetos por mês. Quem tem menos de ${m.federais.minSessoes} sessões deliberativas desde a primeira presença fica sem índice, porque o período seria curto demais para comparar.</p>
    ${tabelaComponentes(m.federais.componentes)}
    <p class="nota"><strong>Projetos aprovados</strong> (30%): conta os projetos e propostas (PL, PLP, PEC, PDL, PRC, MPV e semelhantes) de autoria ou coautoria do deputado cuja <em>situação atual</em>, nos arquivos abertos da Câmara, é “aprovado pela Câmara” (seguiu ao Senado ou à sanção) ou “transformado em norma jurídica”. Requerimentos, indicações e emendas não entram. O resultado é dividido pelos anos de exercício efetivo, e a nota é a posição do deputado entre todos os que estão em exercício. Só vale com pelo menos ${m.federais.minMesesAprovados || 12} meses de exercício no período e quando o arquivo da Câmara traz a situação dos projetos; se não traz, o critério fica <strong>sem dado</strong> (nunca vira zero) e o índice usa os demais. Aprovar não mede a qualidade nem o mérito da lei, e depende de acordos, da pauta e do partido.</p>
    <p class="nota">Produção legislativa e tempo de exercício: a aba Projetos mostra a produção por ano de exercício efetivo, que é o total de projetos dividido pelos anos em que a Câmara registra o deputado “em exercício”. Licenças e períodos em que outra pessoa ocupou a vaga não entram na divisão.</p>

    <h2>Prefeitos e governadores: índice de serviços públicos</h2>
    <p>O índice olha o <strong>resultado</strong> dos serviços públicos, em cinco áreas com o mesmo peso: <strong>saúde, educação, segurança, infraestrutura e saneamento (20% cada)</strong>. Gasto com pessoal e dívida <strong>saíram da nota</strong> e continuam nas abas do perfil, só como informação, junto com os limites da Lei de Responsabilidade Fiscal.</p>
    ${tabelaComponentes(m.executivos.componentes)}
    <p style="margin-top:12px"><strong>Quais indicadores entram em cada área:</strong></p>
    <div class="rolagem"><table class="tabela">
      <thead><tr><th>Área</th><th>Indicador</th><th>Unidade</th><th>Quem tem</th><th>Melhor é</th></tr></thead>
      <tbody>${m.executivos.indicadores.map(i => html`<tr><td>${(m.executivos.componentes.find(c => c.k === i.area) || {}).rotulo || i.area}</td><td>${i.nome}</td><td>${i.unidade}</td><td>${i.esferas.map(e => e === 'E' ? 'estados' : 'municípios').join(' e ')}</td><td>${i.sentido === 'menor' ? 'menor' : 'maior'}</td></tr>`)}</tbody>
    </table></div>
    <h3 class="sub-titulo">Como a pontuação é feita</h3>
    <ul class="pontos">
      <li><strong>Comparação com os pares:</strong> ${m.executivos.comparacao}</li>
      <li><strong>Período:</strong> só entram anos com pelo menos ${m.executivos.minMesesDoAno} meses dentro dos últimos 48 meses. Mortalidade infantil é a soma dos óbitos dividida pela soma dos nascimentos do período (município com menos de ${m.executivos.minNascidos} nascimentos fica sem esse indicador); Ideb é o mais recente do período.</li>
      <li><strong>Área = média dos indicadores</strong> que têm dado. <strong>Índice = média das áreas</strong> que têm dado, 20% cada, com os pesos redistribuídos entre elas.</li>
      <li><strong>Índice parcial:</strong> aceito com ${m.executivos.minAreas.E} áreas ou mais nos estados e ${m.executivos.minAreas.M} ou mais nos municípios. O perfil sempre mostra de quantas áreas o índice é feito (por exemplo, “3 de 5”). Área sem dado fica de fora e <strong>nunca vira zero</strong>. Quem não alcança o mínimo fica sem índice, com o motivo.</li>
      <li><strong>Segurança</strong> não se aplica a prefeitos (a segurança pública é principalmente estadual). <strong>Infraestrutura</strong> ainda não tem fonte aberta de resultado confirmada e aparece como “sem fonte”; o Placar não usa gasto como se fosse resultado.</li>
      <li><strong>Saneamento</strong> usa o Censo 2022: é um retrato do território, não um resultado da gestão atual, e isso é dito no perfil.</li>
      <li><strong>Gestão em exercício:</strong> se nenhum ano usado pertence, nem em parte, à gestão atual (por exemplo, prefeito empossado em 2025 cujos dados do IBGE ainda são anteriores), o índice <strong>não é dado</strong>: o perfil explica que o mandato atual é recente demais. Quando o período mistura gestões, o perfil avisa.</li>
      <li><strong>Atribuição:</strong> resultados de saúde, educação, saneamento e segurança dependem de vários níveis de governo e de anos anteriores. O índice <strong>não prova mérito nem culpa</strong> de quem governa.</li>
    </ul>
    <p>Limites da Lei de Responsabilidade Fiscal, mostrados no perfil só como informação:</p>
    <ul class="limites">
      <li>Prefeituras: gasto com pessoal até ${m.executivos.limites.M.pessoal}% da receita corrente líquida; dívida até ${m.executivos.limites.M.divida}%.</li>
      <li>Estados e Distrito Federal: gasto com pessoal até ${m.executivos.limites.E.pessoal}%; dívida até ${m.executivos.limites.E.divida}%.</li>
    </ul>
    <p class="nota">Os relatórios fiscais entregues ao Tesouro (RREO, RGF, DCA) <strong>não entram no índice</strong>. Eles aparecem na aba Transparência, como informação, porque um atraso pode ter causas técnicas e punir por isso distorceria o índice.</p>

    ${m.presidente ? html`<h2>Presidente: índice econômico</h2>
    <p>O presidente tem um <strong>índice econômico parcial</strong>, calculado só para a gestão em exercício, a partir de três séries nacionais. Não inclui saúde, educação, segurança, saneamento nem obras federais, que ainda não têm fonte integrada, e por isso é sempre mostrado como parcial. A Selic <strong>não entra</strong>: juros são decisão do Banco Central.</p>
    ${tabelaComponentes(m.presidente.componentes)}
    <p class="nota">O índice precisa de pelo menos ${m.presidente.minIndicadores} dos ${m.presidente.componentes.length} indicadores e de gestão com ${m.presidente.minMeses} meses ou mais no período. A meta de inflação considerada é ${String(m.presidente.meta.centro).replace('.', ',')}% com tolerância de ${String(m.presidente.meta.tolerancia).replace('.', ',')} ponto (confira em bcb.gov.br). Economia depende de muitos fatores, internos e externos: <strong>o índice não atribui o resultado só à pessoa do presidente</strong>.</p>` : ''}` : html`
    <p class="nota">Os detalhes das regras ainda não foram carregados.</p>`}

    <h2>Perfil dos gestores: 48 meses, uma gestão de cada vez</h2>
    <div class="cartao"><ul class="pontos">
      <li><strong>Recorte:</strong> os últimos 48 meses fechados antes do mês atual (em novembro de 2026, de novembro de 2022 a outubro de 2026).</li>
      <li><strong>Quem governava:</strong> cada gestão tem data de início e fim, tirada dos eleitos do TSE e, quando houve renúncia ou sucessão no meio do mandato, de um registro com fontes. Reeleição não é troca de gestor. Quando o recorte alcança uma gestão anterior, ela aparece separada, e nenhum número do passado é atribuído a quem governa hoje.</li>
      <li><strong>Ano com troca de gestor:</strong> as contas públicas são anuais. Um ano em que mudou o gestor aparece como “gestão dividida”, e o valor não é entregue a uma só pessoa. Anos que só em parte cabem nos 48 meses (como 2022) mostram o balanço do ano inteiro e dizem quantos meses ficam no recorte.</li>
      <li><strong>Presidente:</strong> as séries são mensais (inflação, desocupação, juros e dívida), e cada mês é ligado à gestão da época, com um resumo por gestão. O índice econômico parcial usa só inflação, desocupação e dívida da gestão em exercício, com a ressalva de que a economia depende de muitos fatores.</li>
      <li><strong>Preços no Brasil (aba do presidente):</strong> gasolina (ANP), dólar (Banco Central) e cesta básica (DIEESE/Conab), com início do mandato, último valor e variação acumulada em cada gestão, e a comparação com as gestões anteriores. O preço sobe ou desce por petróleo, câmbio, safra, clima, impostos e decisões de empresas: <strong>o Placar não atribui a variação ao presidente</strong>, e esses números não entram em nenhum índice.</li>
      <li><strong>Resultados de serviços (IBGE Cidades):</strong> Ideb, matrículas, mortalidade infantil e internações por diarreia aparecem nas abas Educação e Saúde, ligados à gestão de cada ano. Anos antes do recorte de 48 meses servem só de comparação. Cada resultado indica quem é responsável pelo serviço (prefeitura, governo estadual ou vários níveis) e <strong>não entra no índice</strong>.</li>
      <li><strong>Despesa:</strong> mostramos empenhada (compromisso assumido), e paga (dinheiro que saiu), em colunas separadas. Anunciado não é pago, e contratado não é concluído.</li>
      <li><strong>Resultado de serviço de outro ente:</strong> água e esgoto de companhias estaduais ou concessionárias, segurança pública estadual e saúde ou educação financiadas por mais de um nível de governo não são atribuídos só ao prefeito ou governador.</li>
      <li><strong>Sem dado, sem número:</strong> o que não foi confirmado em fonte oficial aparece como “${MSG_INDISPONIVEL}”, com o órgão responsável e o link da fonte. Ausência nunca vira zero.</li>
      <li><strong>Índice:</strong> o índice de serviços públicos de prefeitos e governadores é parcial: usa as áreas que têm dado confiável (saúde, educação, segurança só para estados, e saneamento) e mostra de quantas é feito. Infraestrutura segue sem fonte.</li>
    </ul></div>

    <h2>Deputados estaduais: índice parcial</h2>
    <p>Cada Assembleia Legislativa publica seus dados de um jeito, e algumas quase não publicam. Por isso o índice dos deputados estaduais é <strong>parcial</strong> e existe só onde o Placar consegue <strong>ler e conferir</strong> os dados da Assembleia. Os critérios previstos são os mesmos dos deputados federais (verba de gabinete 30%, votações 20%, presença 20% e projetos aprovados 30%), mas hoje só o primeiro tem leitura integrada, e apenas para a Assembleia de São Paulo (Alesp).</p>
    ${m && m.estaduais ? tabelaComponentes(m.estaduais.componentes) : ''}
    <ul class="pontos">
      <li><strong>Comparação só dentro da Assembleia:</strong> o deputado é comparado apenas com os colegas da mesma casa, e a posição (ranking) também é só dentro dela. Não há ranking nacional de deputados estaduais.</li>
      <li><strong>Mínimos:</strong> ${m && m.estaduais ? `pelo menos ${m.estaduais.minMeses} meses de despesas no período (${m.estaduais.janelaAnos} anos) e ${m.estaduais.minColegas} colegas com dado para comparar; com ${m.estaduais.minCriterios} critério já é possível ter índice parcial` : 'veja o código'}. Quem tem pouco histórico fica sem índice; zero não é nota baixa.</li>
      <li><strong>Sem dado, sem nota:</strong> deputados de Assembleias que o Placar ainda não lê aparecem “sem índice”, com o motivo. A lista de cada casa, o que foi pesquisado e o que ainda falta estão na página <a href="#/fontes">Fontes</a>.</li>
      <li><strong>Privacidade:</strong> o Placar soma os valores por deputado e por mês. CNPJ, CPF e dados pessoais de fornecedores não são lidos nem guardados.</li>
      <li><strong>Atenção:</strong> o índice parcial mede só quanto o deputado gasta da verba de gabinete em relação aos colegas, não o trabalho legislativo. Vereadores não fazem parte do Placar Público.</li>
    </ul>

    <h2>O que ainda não está no ar</h2>
    <p>Senadores, presidentes da Câmara e do Senado (gestão da Casa), emendas parlamentares, obras e infraestrutura e boa parte dos indicadores de saúde e educação (como cobertura vacinal, leitos, e o mínimo constitucional aplicado em saúde e educação) ainda não têm fonte oficial integrada. Nessas áreas aparece a mensagem “${MSG_INDISPONIVEL}” e nenhum número é inventado. Veja a página <a href="#/verificacao">Como verificamos</a>.</p>

    <h2>Limites que você precisa conhecer</h2>
    <div class="cartao"><ul class="pontos">
      <li><strong>Prefeitos e governadores:</strong> o índice de serviços públicos é parcial. Infraestrutura ainda não tem fonte; segurança só existe para estados; saneamento é um retrato de 2022; e os dados do IBGE Cidades chegam aos poucos, então muitos municípios ainda estão sem índice. Prefeitos empossados recentemente ficam sem índice até haver dado do mandato deles. Resultados dependem de vários níveis de governo.</li>
      <li><strong>Trocas de gestor:</strong> o TSE não traz sucessões por vice nem renúncias de 2026. Elas vêm de um registro nosso com fontes, em geral reportagens, com datas aproximadas quando a fonte não diz o dia. O registro cobre os governadores e as capitais conhecidos; outros municípios podem ter trocas que ainda não estão lá. Confirme sempre no site oficial.</li>
      <li><strong>Defasagem das fontes:</strong> o PIB municipal sai com cerca de dois anos de atraso; o Censo 2022 é uma foto de agosto de 2022, anterior ao recorte; o balanço de um ano só chega ao Tesouro no ano seguinte.</li>
      <li><strong>Quem está no cargo:</strong> a lista de prefeitos, governadores e deputados estaduais vem do TSE e mostra quem foi <em>eleito</em>. Renúncia, cassação, afastamento e suplentes que assumiram não aparecem.</li>
      <li><strong>Prefeituras:</strong> o município do TSE é ligado ao do Tesouro pelo nome e pelo estado. Quando os dois órgãos escrevem o nome um pouco diferente (por exemplo “Assú” e “Açu”), só é aceito o município do mesmo estado que for claramente o mais parecido. Se houver dúvida ou empate, a pessoa fica sem índice, em vez de arriscar um valor errado.</li>
      <li><strong>Histórico de mandatos:</strong> a Câmara registra a partir da 50ª legislatura (1995). Mandatos anteriores ou em outras Casas e cargos não aparecem.</li>
      <li><strong>Em tempo real?</strong> Não exatamente. Os índices e votos são atualizados todo dia; o histórico de mandatos, o TSE e o Tesouro, toda semana. As abas Projetos, Gastos e Fiscalização, e a lista de ausências, consultam a Câmara na hora em que você abre.</li>
    </ul></div>

    <h2>Quer mudar um peso?</h2>
    <p>Todas as regras estão no arquivo <code>scripts/nota.mjs</code>. Mudar um peso ou um limite lá e rodar a atualização de novo recalcula tudo, e esta página se atualiza sozinha.</p>
  </article>`);
}

function viewFontes() {
  document.title = 'Fontes · Placar Público';
  const f = (DADOS.meta && DADOS.meta.fontes) || {};
  const status = x => {
    if (!x) return html`<span>ainda não consultada</span>`;
    if (x.ok === false) return html`<span class="falha-txt">falhou</span>${x.erro ? html`<br><small>${x.erro}</small>` : ''}`;
    return html`<span class="ok-txt">funcionando</span>`;
  };
  const quando = x => (x && x.atualizadoEm ? dataHoraBR(x.atualizadoEm) : '—');
  const anosTse = f.tse && f.tse.eleicoes
    ? (typeof f.tse.eleicoes === 'object' && !Array.isArray(f.tse.eleicoes)
      ? `municipais ${f.tse.eleicoes.municipal}; governadores ${f.tse.eleicoes.governadores}; deputados estaduais ${f.tse.eleicoes.estaduais}`
      : f.tse.eleicoes.join(', '))
    : '';

  mostrar(app, html`<article class="pagina">
    <h1>De onde vêm os dados</h1>
    <p class="lead">Tudo vem de bases públicas e oficiais. O Placar Público não tem acesso especial a nada: ele só junta, calcula e mostra.</p>

    ${DADOS.demo ? html`<div class="cartao cartao-aviso"><h2>Você está vendo dados inventados</h2>
      <p>Para ver os dados reais, o site precisa ser publicado com a rotina de atualização (GitHub). O passo a passo está no arquivo <strong>LEIA-ME</strong> que acompanha o aplicativo. Depois de publicado, esta página mostra a data e a situação de cada fonte.</p></div>` : ''}

    <div class="rolagem"><table class="tabela">
      <thead><tr><th>Fonte</th><th>O que usamos</th><th class="curto">Atualização</th><th class="curto">Última vez</th><th class="curto">Situação</th></tr></thead>
      <tbody>
        <tr><td><a href="https://dadosabertos.camara.leg.br" target="_blank" rel="noopener">Dados Abertos da Câmara dos Deputados</a></td>
          <td>Presença em sessões, votações nominais e votos de cada deputado, projetos e cota parlamentar${f.camara && f.camara.ano ? html` (${periodoAvaliado(f.camara, true)}: ${fmtNum.format(f.camara.sessoes || 0)} sessões, ${fmtNum.format(f.camara.votacoes || 0)} votações nominais)` : ''}.</td>
          <td class="curto">Todo dia</td><td class="curto">${quando(f.camara)}</td><td class="curto">${status(f.camara)}</td></tr>
        <tr><td><a href="https://dadosabertos.camara.leg.br" target="_blank" rel="noopener">Câmara: histórico de mandatos</a></td>
          <td>Posse, licenças, reassunções e fim de cada mandato, Mesa Diretora e dados cadastrais${f.historico && f.historico.total ? html` (${fmtNum.format(f.historico.total - (f.historico.falhas || 0))} de ${fmtNum.format(f.historico.total)} deputados)` : ''}.</td>
          <td class="curto">Toda semana</td><td class="curto">${quando(f.historico)}</td><td class="curto">${status(f.historico)}</td></tr>
        <tr><td><a href="https://dadosabertos.tse.jus.br" target="_blank" rel="noopener">Dados Abertos do TSE</a></td>
          <td>Lista de eleitos: prefeitos, governadores e deputados estaduais${anosTse ? ` (${anosTse})` : ''}.</td>
          <td class="curto">Toda semana</td><td class="curto">${quando(f.tse)}</td><td class="curto">${status(f.tse)}</td></tr>
        <tr><td><a href="https://siconfi.tesouro.gov.br" target="_blank" rel="noopener">Siconfi, Tesouro Nacional</a></td>
          <td>Gasto com pessoal, dívida e relatórios fiscais entregues por prefeituras e estados${f.siconfi && f.siconfi.exercicio ? ` (exercício ${f.siconfi.exercicio}; ${fmtNum.format(f.siconfi.entes || 0)} prefeituras e estados${f.siconfi.comErro ? `, ${fmtNum.format(f.siconfi.comErro)} consultas com erro` : ''})` : ''}.</td>
          <td class="curto">Toda semana</td><td class="curto">${quando(f.siconfi)}</td><td class="curto">${status(f.siconfi)}</td></tr>
        <tr><td><a href="https://dadosabertos.tse.jus.br" target="_blank" rel="noopener">TSE: gestões dos últimos 48 meses</a></td>
          <td>Quem foi eleito em 2018, 2020, 2022, 2024 e 2026 (e eleições suplementares), para ligar cada ano de contas à gestão da época. Trocas no meio do mandato vêm de um registro com fontes de imprensa.</td>
          <td class="curto">Toda semana</td><td class="curto">${quando(f.administracoes)}</td><td class="curto">${status(f.administracoes)}</td></tr>
        <tr><td><a href="https://apidatalake.tesouro.gov.br/docs/siconfi/" target="_blank" rel="noopener">Tesouro Nacional: contas por ano</a></td>
          <td>Balanço anual (DCA): despesa empenhada, liquidada e paga por função, de 2022 até o último ano fechado. A coleta dos anos antigos é feita aos poucos.</td>
          <td class="curto">Todo dia</td><td class="curto">${quando(f.series)}</td><td class="curto">${status(f.series)}</td></tr>
        <tr><td><a href="https://sidra.ibge.gov.br" target="_blank" rel="noopener">IBGE (SIDRA)</a></td>
          <td>População estimada, PIB dos municípios e dos estados e Censo 2022 (água, esgoto e lixo).</td>
          <td class="curto">Toda semana</td><td class="curto">${quando(f.ibge)}</td><td class="curto">${status(f.ibge)}</td></tr>
        <tr><td><a href="https://dadosabertos.bcb.gov.br" target="_blank" rel="noopener">IBGE e Banco Central: séries do presidente</a></td>
          <td>Inflação (IPCA), desocupação (PNAD Contínua), Selic e dívida pública, mês a mês.</td>
          <td class="curto">Todo dia</td><td class="curto">${quando(f.presidente)}</td><td class="curto">${status(f.presidente)}</td></tr>
        <tr><td><a href="https://cidades.ibge.gov.br" target="_blank" rel="noopener">IBGE Cidades e Estados</a></td>
          <td>Resultados por município e por estado: Ideb (Inep), matrículas (Censo Escolar), mortalidade infantil e internações por diarreia (Ministério da Saúde), como o IBGE os publica. Cada município é relido a cada 7 dias${f.cidades && f.cidades.municipios != null ? html` (${fmtNum.format((f.cidades.municipios || 0) + (f.cidades.estados || 0))} lidos na última rodada${f.cidades.pendentes ? `, ${fmtNum.format(f.cidades.pendentes)} ficaram para o dia seguinte` : ''})` : ''}.</td>
          <td class="curto">Todo dia (cada local, a cada 7 dias)</td><td class="curto">${quando(f.cidades)}</td><td class="curto">${status(f.cidades)}</td></tr>
        <tr><td><a href="https://www.gov.br/mj/pt-br/assuntos/sua-seguranca/seguranca-publica/estatistica" target="_blank" rel="noopener">Sinesp, Ministério da Justiça e Segurança Pública</a></td>
          <td>Ocorrências criminais por estado: homicídios dolosos (vítimas) e roubos de veículos, usados na área de segurança do índice dos governadores. Só entram anos com 12 meses de dados.</td>
          <td class="curto">Toda semana</td><td class="curto">${quando(f.seguranca)}</td><td class="curto">${status(f.seguranca)}</td></tr>
        <tr><td><a href="https://www.al.sp.gov.br/dados-abertos/" target="_blank" rel="noopener">Alesp, Assembleia Legislativa de São Paulo</a></td>
          <td>Despesas de gabinete por deputado e por mês, usadas no índice parcial dos deputados estaduais de São Paulo. Só valores por mês; fornecedores e documentos pessoais não são lidos.</td>
          <td class="curto">Todo dia</td><td class="curto">${quando(f.estaduais)}</td><td class="curto">${status(f.estaduais)}</td></tr>
        <tr><td>ANP, Banco Central e DIEESE/Conab</td>
          <td>Preços no Brasil, na aba do presidente: gasolina (ANP, preço médio de revenda semanal, mensal e por estado), dólar (Banco Central, PTAX de venda) e cesta básica (DIEESE em parceria com a Conab, por capital).</td>
          <td class="curto">Todo dia</td><td class="curto">${quando(f.precos)}</td><td class="curto">${status(f.precos)}</td></tr>
      </tbody>
    </table></div>

    <h2>Assembleias Legislativas: situação de cada uma</h2>
    <p>O índice dos deputados estaduais só existe onde o Placar consegue ler e conferir os dados da Assembleia. Esta é a situação de cada casa.</p>
    <div id="assembleias"><div class="esq" style="height:120px"></div></div>

    <h2>Quão em tempo real?</h2>
    <p>Os índices, as votações e os votos são recalculados todo dia de madrugada. O histórico de mandatos, o TSE e o Tesouro mudam pouco e são atualizados uma vez por semana. As abas Projetos, Gastos e Fiscalização do perfil de cada deputado federal, e a lista de sessões sem presença, consultam a Câmara na hora em que são abertas.</p>

    <h2>Quem faz</h2>
    <p>O Placar Público é um aplicativo independente, sem vínculo com a Câmara dos Deputados, o TSE, o Tesouro Nacional, partidos ou governos. Se você encontrar um número que não bate com a fonte oficial, o endereço da fonte está acima: a fonte oficial é sempre a referência.</p>
  </article>`);

  const alvoAssembleias = $('#assembleias');
  const STATUS_ASSEMBLEIA = { 'integrada-parcial': 'Integrada em parte', 'pesquisada-nao-integrada': 'Pesquisada, ainda não integrada' };
  const NOMES_CRITERIO = { cota: 'verba de gabinete', pres: 'presença', vot: 'votações', aprov: 'projetos aprovados' };
  const NOMES_API = { sim: 'sim', parcial: 'parcial', nao: 'não' };
  lerArquivo('assembleias.json').then(a => {
    if (!alvoAssembleias || !document.body.contains(alvoAssembleias)) return;
    mostrar(alvoAssembleias, html`<div class="rolagem"><table class="tabela">
        <thead><tr><th>UF</th><th>Assembleia</th><th class="curto">API aberta</th><th>Situação no Placar</th><th>Critérios lidos</th><th>Observação</th></tr></thead>
        <tbody>${a.itens.map(i => html`<tr><td>${i.uf}</td>
          <td>${(i.portais || []).map(urlSegura).find(Boolean) ? html`<a href="${(i.portais || []).map(urlSegura).find(Boolean)}" target="_blank" rel="noopener">${i.casa}</a>` : i.casa}</td>
          <td class="curto">${NOMES_API[i.api] || '—'}</td>
          <td>${STATUS_ASSEMBLEIA[i.statusPlacar] || i.statusPlacar}</td>
          <td>${(i.criteriosLidos || []).length ? i.criteriosLidos.map(k => NOMES_CRITERIO[k] || k).join(', ') : 'nenhum'}</td>
          <td>${i.observacao || ''}</td></tr>`)}</tbody>
      </table></div>
      <p class="nota">${a.aviso || ''} Pesquisado em ${a.pesquisadoEm ? dataBR(a.pesquisadoEm) : '—'}. Base da pesquisa: ${a.fonteDoEstudo || ''}</p>`);
  }).catch(() => {
    if (alvoAssembleias) mostrar(alvoAssembleias, indisponivel('O registro das Assembleias ainda não foi gerado. Ele aparece depois da próxima atualização diária.'));
  });
}

function viewVerificacao() {
  document.title = 'Como verificamos · Placar Público';
  mostrar(app, html`<article class="pagina">
    <h1>Como verificamos</h1>
    <p class="lead">Regras que o Placar Público segue para que nada falso apareça como se fosse oficial.</p>

    <h2>1. Nada fictício aparece como real</h2>
    <p>Quando o site é aberto sem os dados reais, ele entra em <strong>modo demonstração</strong>, com nomes e números inventados e uma faixa vermelha no topo de todas as telas. Nos dados reais, nenhum nome, voto ou número é criado por nós.</p>

    <h2>2. Todo dado mostra de onde vem</h2>
    <p>Cada informação tem a fonte e, quando existe, a data da última atualização: na própria tela, na aba Fontes de cada perfil e na página <a href="#/fontes">Fontes</a>. Os selos ${selo('oficial')} ${selo('calculado')} ${selo('indice')} dizem se o número é oficial, calculado por nós ou o índice.</p>

    <h2>3. Sem fonte oficial, sem número</h2>
    <p>Quando não há dado oficial (ou ele ainda não foi confirmado), aparece sempre a mesma mensagem:</p>
    <div class="cartao" style="margin-top:8px">${indisponivel()}</div>
    <p style="margin-top:12px">Nós não preenchemos a lacuna com estimativa, média ou número de outra fonte.</p>

    <h2>3b. Cada número ligado ao período e à gestão certos</h2>
    <p>Nos perfis de presidente, governadores e prefeitos, cada número traz o ano ou mês a que se refere, de quem era a gestão naquele período e o que a fonte diz sobre limitações. Anunciado não é pago, e contratado não é concluído: a despesa aparece empenhada e paga, em colunas separadas. Resultados de serviços prestados por outro ente ou por concessionárias não são atribuídos só ao gestor. Quando duas fontes divergem, a divergência fica à mostra, sem que o Placar escolha uma delas. Para cada indicador, a aba Fontes mostra a origem, o responsável e a licença de uso.</p>

    <h2>4. Votos nunca são inventados</h2>
    <p>Mostramos o voto que a Câmara registrou. Se uma matéria não teve votação nominal no Plenário, aparece: “${MSG_SEM_VOTACAO}” As votações são separadas pelo texto oficial em proposta principal, emenda, substitutivo, destaque e requerimento, porque o resultado de um não vale para o outro.</p>

    <h2>5. Correções ficam registradas</h2>
    <p>Todo dia o Placar Público compara as votações com as do dia anterior. Se a Câmara mudar um resultado, um placar, um texto ou o voto de alguém, a mudança é anotada em <a href="#/noticias">Notícias</a>, com a data, e o dado antigo não é apagado do histórico. Se uma atualização falhar, o site mantém o último dado bom e mostra uma faixa amarela de aviso.</p>

    <h2>6. Notícias automáticas</h2>
    <p>As “notícias” são resumos gerados por regra a partir de dados oficiais. Não têm opinião, não citam fontes de imprensa e não são reportagens. Cada item traz o link da fonte oficial para você conferir.</p>

    <h2>7. Achou uma divergência?</h2>
    <p>A fonte oficial é sempre a referência. Se um número daqui não bate com o dela, o link está na própria tela. Divergências costumam ter explicação (data de atualização diferente, licença, suplência), e esta página e a Metodologia dizem como cada número é calculado.</p>
  </article>`);
}
