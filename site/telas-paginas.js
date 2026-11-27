'use strict';

/* =====================================================================
   Placar Público — páginas de texto: Metodologia, Fontes, Fontes independentes, Verificação
   (v8: o Placar acompanha deputados federais, senadores, governadores e presidente)
   ===================================================================== */

function tabelaComponentes(componentes) {
  return html`<div class="rolagem"><table class="tabela">
    <thead><tr><th>Critério</th><th class="num">Peso</th><th>Como é medido</th></tr></thead>
    <tbody>${componentes.map(c => html`<tr><td><strong>${c.rotulo}</strong></td><td class="num">${c.peso}%</td><td>${c.regra}</td></tr>`)}</tbody>
  </table></div>`;
}

const SENTIDO_RANKING = { 'maior-melhor': 'maior é melhor', 'menor-melhor': 'menor é melhor', neutro: 'só posição (sem “melhor” ou “pior”)' };

function viewMetodologia() {
  document.title = 'Metodologia · Placar Público';
  const m = DADOS.metodo;
  const jan = ((DADOS.meta && DADOS.meta.fontes && DADOS.meta.fontes.camara) || {}).janela;
  const anoHoje = new Date().getFullYear();
  const periodo4 = jan ? `${jan.de} a ${jan.ate}` : `${anoHoje - 3} a ${anoHoje}`;
  const naoMedidos = (m && m.custoNaoMedidos) || [];
  mostrar(app, html`<article class="pagina">
    <h1>Como o índice é calculado</h1>
    <p class="lead">O índice vai de 0 a 100 e usa dados oficiais abertos. Fontes independentes (institutos e organizações) só complementam, vêm separadas e com selo próprio. Todas as regras estão escritas aqui, e o código que calcula é aberto: quem quiser conferir ou discordar de um peso pode ver e propor outra regra.</p>

    <h2>O que o índice é, e o que ele não é</h2>
    <div class="cartao"><ul class="pontos">
      <li>É um resumo de critérios objetivos que dá para medir com dados públicos, aplicados do mesmo jeito para todos do mesmo cargo. <strong>É uma regra criada pelo Placar Público, não um dado oficial.</strong></li>
      <li><strong>Não mede a qualidade do trabalho.</strong> Um parlamentar pode ter muitos projetos aprovados de pouca importância ou poucos de grande peso; o índice só enxerga a quantidade e o cumprimento de deveres.</li>
      <li><strong>Índice baixo não é acusação.</strong> Uma ausência pode ser missão oficial, licença ou doença. Um dado pode estar defasado na fonte ou ainda não ter sido publicado. O índice não sabe o motivo.</li>
      <li><strong>Quem pesa a mais, custa a mais?</strong> O critério de custo mostra quanto saiu dos cofres públicos por mês de mandato. Gasto dentro das regras faz parte do exercício do mandato: o número informa, não acusa.</li>
      <li>As cores servem só para leitura rápida: 70 ou mais em verde, de 40 a 69 em amarelo, abaixo de 40 em vermelho. Não são faixas oficiais.</li>
    </ul></div>

    <h2>Como separamos os números</h2>
    <p>Cada número na tela é de um destes tipos, e traz um selo dizendo de onde vem:</p>
    <div class="rolagem"><table class="tabela">
      <thead><tr><th>Selo</th><th>O que significa</th></tr></thead>
      <tbody>
        <tr><td>${selo('oficial')}</td><td>Valor que a fonte oficial publica, mostrado como está (por exemplo, o resultado de uma votação ou os eventos do histórico de mandato).</td></tr>
        <tr><td>${selo('calculado')}</td><td>Conta feita pelo Placar Público com dados oficiais: uma proporção (presença em %), uma soma (custo por mês) ou uma média. A regra está nesta página.</td></tr>
        <tr><td>${selo('independente')}</td><td>Valor publicado por instituto, organização ou veículo independente, não por órgão do governo. Traz a edição, o link da publicação e a data em que o Placar conferiu. Nunca entra no índice de ninguém. <a href="#/fontes-independentes">Veja as fontes</a>.</td></tr>
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
    <p>Calculado todo dia com os dados dos últimos 4 anos civis (agora, ${periodo4}; o ano em curso conta até o dia da atualização). Cada deputado é avaliado desde a primeira presença registrada nesse período, então quem assumiu depois não é comparado como se estivesse lá desde o início. Licenças e afastamentos registrados no histórico oficial da Câmara não contam contra o deputado: nem as sessões, votações e reuniões desse período, nem os meses no cálculo do custo e dos projetos por mês. Quem tem menos de ${m.federais.minSessoes} sessões deliberativas desde a primeira presença fica sem índice, porque o período seria curto demais para comparar. O índice exige pelo menos ${m.federais.minCriterios} critérios com dado.</p>
    ${tabelaComponentes(m.federais.componentes)}
    <p class="nota"><strong>Projetos aprovados</strong> (30%): conta os projetos e propostas (PL, PLP, PEC, PDL, PRC, MPV e semelhantes) de autoria ou coautoria do deputado cuja <em>situação atual</em>, nos arquivos abertos da Câmara, é “aprovado pela Câmara” (seguiu ao Senado ou à sanção) ou “transformado em norma jurídica”. Requerimentos, indicações e emendas não entram. O resultado é dividido pelos anos de exercício efetivo, e a nota é a posição do deputado entre todos os que estão em exercício. Só vale com pelo menos ${m.federais.minMesesAprovados || 12} meses de exercício no período e quando o arquivo da Câmara traz a situação dos projetos; se não traz, o critério fica <strong>sem dado</strong> (nunca vira zero) e o índice usa os demais. Aprovar não mede a qualidade nem o mérito da lei, e depende de acordos, da pauta e do partido.</p>
    <p class="nota"><strong>Presença em comissões</strong> (10%): só entram as <em>comissões permanentes</em> e só as reuniões <em>deliberativas já encerradas</em>, com o deputado como <em>titular</em> na data da reunião. Comissões especiais, mistas e de medida provisória e audiências públicas não entram. Quem teve menos de ${m.federais.minReunioesComissao} reuniões esperadas no período fica com “${MSG_INDISPONIVEL}” neste critério, em vez de uma nota. A Câmara não publica quem substituiu o titular numa reunião: o suplente que substituiu aparece sem presença nos dados, e a falta do titular substituído pode contar contra ele.</p>
    <p class="nota"><strong>Custo para os cofres públicos</strong> (25%): substitui o antigo critério “uso da cota”. Soma, por deputado e por ano, o que o Portal da Transparência da Câmara publica de <strong>cota parlamentar, verba de gabinete, auxílio-moradia (pago em dinheiro) e viagens oficiais</strong>, sem contar o subsídio, que é igual para todos. O total é dividido pelos meses de exercício dentro dos últimos 48 meses e comparado ao de <strong>todos os deputados do país</strong>, e não só aos do mesmo estado: custo menor dá pontuação maior. Exige pelo menos ${m.federais.minMesesCusto} meses de exercício. O perfil mostra o valor por mês, o total, cada rubrica por ano, a fonte e as ressalvas.</p>
    <div class="cartao"><h3 class="sub-titulo">O que o custo não mede, e como é tratado</h3><ul class="pontos">
      ${naoMedidos.map(x => html`<li><strong>Não medido:</strong> ${x}. Não entra na soma como zero: o Placar informa que não mede.</li>`)}
      <li><strong>“Ainda não há dados disponíveis”:</strong> quando a Câmara responde, em viagens oficiais ou auxílio-moradia, que não há lançamento no ano, o Placar conta R$ 0 apenas na soma e diz “sem lançamento” no perfil. Já uma página que falha, ou que não traz as frases de conferência esperadas, deixa o ano <strong>não confirmado</strong>: o deputado fica sem esse critério, em vez de receber um valor incompleto.</li>
      <li><strong>Limites:</strong> o limite mensal da cota varia por estado (por causa do preço das passagens até Brasília) e a Mesa e a Presidência da Câmara têm benefícios adicionais. O custo mede quanto saiu dos cofres, não o que o deputado entregou.</li>
    </ul></div>
    <p class="nota"><strong>Foto oficial:</strong> a foto ao lado do nome é a que a Câmara publica no cadastro do deputado. O Placar guarda só o endereço dela (não copia a imagem). Se a foto não carregar, aparecem as iniciais.</p>

    <h2>Senadores</h2>
    <p>Os senadores têm os <strong>mesmos critérios e pesos</strong> dos deputados federais <strong>no que as fontes do Senado permitem medir</strong>. Um critério que o Placar não consegue ler e conferir numa fonte oficial aparece como “${MSG_INDISPONIVEL}”, sai da conta e <strong>nunca vira nota zero</strong>; os pesos dos demais são redistribuídos. O índice exige pelo menos ${m.senadores.minCriterios} critérios com dado, e a comparação é entre os senadores em exercício.</p>
    <div class="cartao cartao-aviso"><p><strong>Situação nesta versão:</strong> só o <strong>custo para os cofres públicos</strong> (a cota CEAPS) tem leitura conferida. Presença no Plenário, votações nominais, projetos aprovados e presença em comissões ainda não têm fonte do Senado lida e conferida, e aparecem como “${MSG_INDISPONIVEL}”. Como o índice exige pelo menos ${m.senadores.minCriterios} critérios, <strong>nenhum senador tem índice calculado por enquanto</strong>: a lista mostra o custo por mês e a foto. Um índice feito com um único critério seria só um ranking de custo, e o Placar não o chama de índice. As respostas do Senado ainda serão conferidas na primeira atualização real: se algo não vier no formato esperado, o critério fica como “${MSG_INDISPONIVEL}”, com o motivo.</p></div>
    ${tabelaComponentes(m.senadores.componentes)}
    <p class="nota"><strong>Custo do senador:</strong> nesta versão entra só a cota para o exercício da atividade parlamentar (CEAPS), que o Senado publica por senador, mês a mês, dividida pelos meses de exercício. O que <strong>não é medido</strong> (o Placar ainda não lê um valor por senador de fonte conferida, e nada disso é somado como zero): ${((m && m.custoNaoMedidosSenadores) || []).join('; ') || 'auxílio-moradia, pessoal do gabinete, missões oficiais, assistência à saúde e apartamento funcional'}. Os arquivos da CEAPS trazem o CPF ou CNPJ dos fornecedores; o Placar descarta essa coluna na leitura e guarda só senador, ano, mês e valor. Foto: endereço oficial do Senado.</p>

    <h2>Governadores: índice de serviços públicos</h2>
    <p>O índice olha o <strong>resultado</strong> dos serviços públicos, em cinco áreas com o mesmo peso: <strong>saúde, educação, segurança, infraestrutura e saneamento (20% cada)</strong>. Gasto com pessoal e dívida <strong>não entram na nota</strong> e continuam nas abas do perfil, só como informação, junto com os limites da Lei de Responsabilidade Fiscal. Os governadores <strong>não usam</strong> os critérios dos parlamentares (projetos, votações, presença, custo): são cargos com funções diferentes.</p>
    ${tabelaComponentes(m.executivos.componentes)}
    <p style="margin-top:12px"><strong>Quais indicadores entram em cada área:</strong></p>
    <div class="rolagem"><table class="tabela">
      <thead><tr><th>Área</th><th>Indicador</th><th>Unidade</th><th>Melhor é</th></tr></thead>
      <tbody>${m.executivos.indicadores.filter(i => (i.esferas || []).includes('E')).map(i => html`<tr><td>${(m.executivos.componentes.find(c => c.k === i.area) || {}).rotulo || i.area}</td><td>${i.nome}</td><td>${i.unidade}</td><td>${i.sentido === 'menor' ? 'menor' : 'maior'}</td></tr>`)}</tbody>
    </table></div>
    <h3 class="sub-titulo">Como a pontuação é feita</h3>
    <ul class="pontos">
      <li><strong>Comparação com os pares:</strong> ${m.executivos.comparacao}</li>
      <li><strong>Período:</strong> só entram anos com pelo menos ${m.executivos.minMesesDoAno} meses dentro dos últimos 48 meses. Mortalidade infantil é a soma dos óbitos dividida pela soma dos nascimentos do período; Ideb é o mais recente do período.</li>
      <li><strong>Área = média dos indicadores</strong> que têm dado. <strong>Índice = média das áreas</strong> que têm dado, 20% cada, com os pesos redistribuídos entre elas.</li>
      <li><strong>Índice parcial:</strong> aceito com ${m.executivos.minAreas.E} áreas ou mais. O perfil sempre mostra de quantas áreas o índice é feito (por exemplo, “3 de 5”). Área sem dado fica de fora e <strong>nunca vira zero</strong>. Quem não alcança o mínimo fica sem índice, com o motivo.</li>
      <li><strong>Infraestrutura</strong> ainda não tem fonte aberta de resultado confirmada e aparece como “sem fonte”; o Placar não usa gasto como se fosse resultado. A aba de obras foi retirada.</li>
      <li><strong>Saneamento</strong> usa o Censo 2022: é um retrato do território, não um resultado da gestão atual, e isso é dito no perfil.</li>
      <li><strong>Gestão em exercício:</strong> se nenhum ano usado pertence, nem em parte, à gestão atual, o índice <strong>não é dado</strong>: o perfil explica que o mandato atual é recente demais. Quando o período mistura gestões, o perfil avisa.</li>
      <li><strong>Atribuição:</strong> resultados de saúde, educação, saneamento e segurança dependem de vários níveis de governo e de anos anteriores. O índice <strong>não prova mérito nem culpa</strong> de quem governa.</li>
    </ul>
    <p>Limites da Lei de Responsabilidade Fiscal, mostrados no perfil só como informação: estados e Distrito Federal, gasto com pessoal até ${m.executivos.limites.E.pessoal}% da receita corrente líquida e dívida até ${m.executivos.limites.E.divida}%.</p>
    <p class="nota">Os relatórios fiscais entregues ao Tesouro (RREO, RGF, DCA) <strong>não entram no índice</strong>. Eles aparecem na aba Transparência, como informação, porque um atraso pode ter causas técnicas e punir por isso distorceria o índice.</p>

    <h3 class="sub-titulo">Ranking entre os estados (temas sem nota)</h3>
    <p>Nas abas dos governadores que não têm nota (Economia, Serviços básicos, Orçamento e Transparência), cada estado mostra a <strong>posição entre os 27</strong> (1º = primeiro da lista), com o valor, o ano e o primeiro e o último colocados. O que não pode ser medido de forma justa foi retirado, e o que falta aparece como “${MSG_INDISPONIVEL}”.</p>
    <div id="metodo-ranking-estados"></div>

    ${m.presidente ? html`<h2>Presidente: índice econômico</h2>
    <p>O presidente tem um <strong>índice econômico parcial</strong>, calculado só para a gestão em exercício, a partir de três séries nacionais. Não inclui saúde, educação, segurança nem outras áreas, e por isso é sempre mostrado como parcial. A Selic <strong>não entra</strong>: juros são decisão do Banco Central. O presidente <strong>não usa</strong> os critérios dos parlamentares.</p>
    ${tabelaComponentes(m.presidente.componentes)}
    <p class="nota">O índice precisa de pelo menos ${m.presidente.minIndicadores} dos ${m.presidente.componentes.length} indicadores e de gestão com ${m.presidente.minMeses} meses ou mais no período. A meta de inflação considerada é ${String(m.presidente.meta.centro).replace('.', ',')}% com tolerância de ${String(m.presidente.meta.tolerancia).replace('.', ',')} ponto (confira em bcb.gov.br). Economia depende de muitos fatores, internos e externos: <strong>o índice não atribui o resultado só à pessoa do presidente</strong>.</p>` : ''}

    <h3 class="sub-titulo">Brasil no mundo (abas sem nota do presidente)</h3>
    <p>Nas abas Saúde, Educação, Segurança, Economia e Transparência, o presidente não tem nota: o Placar mostra a <strong>posição do Brasil entre os países</strong> (1º = melhor), com dados do Banco Mundial. As abas Serviços básicos, Saneamento, Infraestrutura e Obras foram retiradas, porque dependem principalmente de estados e municípios ou não podem ser medidas.</p>
    <div id="metodo-mundo"></div>

    <h2>Fontes independentes</h2>
    <p>O Placar também consulta institutos, universidades e organizações reconhecidas (como CLP, IPS Brasil, FBSP, DIEESE, Trata Brasil, Firjan, IEPS, QEdu, Base dos Dados, Transparência Brasil e o Banco Mundial), desde que o dado seja verificável e a metodologia seja pública. As regras:</p>
    <div class="cartao"><ul class="pontos">
      <li>Só entra número com <strong>link da publicação, edição e data da conferência</strong>. Quando o número foi lido numa reportagem que cita a fonte, isso aparece escrito, com o convite para conferir na publicação original.</li>
      <li>O Placar <strong>verifica todo dia</strong> se cada fonte publicou algo novo, mas essa vigilância só avisa: nada é copiado sozinho para o site.</li>
      <li>Quando o dado oficial é insuficiente, a fonte alternativa aparece com o selo “Fonte independente”, <strong>separada do dado oficial</strong> e fora de qualquer índice.</li>
      <li>Cada cargo recebe só o que é da sua competência: o Placar não atribui a um parlamentar, nem ao presidente, o resultado de um estado ou de um município. Hoje há valores independentes nas abas do presidente (segurança, economia e visão geral). Para senadores e deputados federais, o contexto do estado em que foram eleitos fica reservado até que a tabela completa dos 27 estados seja conferida na fonte; até lá, nada é mostrado.</li>
      <li>Ausência de informação <strong>nunca vira zero</strong>: aparece “${MSG_INDISPONIVEL}”.</li>
    </ul></div>
    <p><a class="botao" href="#/fontes-independentes">Ver o catálogo e a vigilância diária</a></p>`
    : html`<p class="nota">Os detalhes das regras ainda não foram carregados.</p>`}

    <h2>Perfil dos gestores: 48 meses, uma gestão de cada vez</h2>
    <div class="cartao"><ul class="pontos">
      <li><strong>Recorte:</strong> os últimos 48 meses fechados antes do mês atual.</li>
      <li><strong>Quem governava:</strong> cada gestão tem data de início e fim, tirada dos eleitos do TSE e, quando houve renúncia ou sucessão no meio do mandato, de um registro com fontes. Reeleição não é troca de gestor. Quando o recorte alcança uma gestão anterior, ela aparece separada, e nenhum número do passado é atribuído a quem governa hoje.</li>
      <li><strong>Ano com troca de gestor:</strong> as contas públicas são anuais. Um ano em que mudou o gestor aparece como “gestão dividida”, e o valor não é entregue a uma só pessoa. Anos que só em parte cabem nos 48 meses mostram o balanço do ano inteiro e dizem quantos meses ficam no recorte.</li>
      <li><strong>Presidente:</strong> as séries são mensais (inflação, desocupação, juros e dívida), e cada mês é ligado à gestão da época, com um resumo por gestão. O índice econômico parcial usa só inflação, desocupação e dívida da gestão em exercício.</li>
      <li><strong>Preços no Brasil (aba do presidente):</strong> gasolina (ANP), dólar (Banco Central) e cesta básica (DIEESE/Conab), com início do mandato, último valor e variação acumulada em cada gestão, e a comparação com as gestões anteriores. O preço sobe ou desce por petróleo, câmbio, safra, clima, impostos e decisões de empresas: <strong>o Placar não atribui a variação ao presidente</strong>, e esses números não entram em nenhum índice.</li>
      <li><strong>Resultados de serviços (IBGE Cidades e Estados):</strong> Ideb, matrículas, mortalidade infantil e internações por diarreia aparecem nas abas Educação e Saúde dos governadores, ligados à gestão de cada ano. Anos antes do recorte de 48 meses servem só de comparação. Cada resultado indica quem é responsável pelo serviço e <strong>não entra no índice</strong>.</li>
      <li><strong>Despesa:</strong> mostramos empenhada (compromisso assumido), e paga (dinheiro que saiu), em colunas separadas. Anunciado não é pago, e contratado não é concluído.</li>
      <li><strong>Resultado de serviço de outro ente:</strong> água e esgoto de companhias estaduais ou concessionárias, segurança pública estadual e saúde ou educação financiadas por mais de um nível de governo não são atribuídos só ao governador.</li>
      <li><strong>Foto oficial:</strong> a do governador é a foto de candidatura do TSE (DivulgaCand) da pessoa eleita; se houve troca de gestor, aparece o aviso “Troca de gestor registrada”. A do presidente é a da gestão em exercício. O Placar guarda só o endereço da foto, nunca a imagem.</li>
      <li><strong>Sem dado, sem número:</strong> o que não foi confirmado em fonte oficial aparece como “${MSG_INDISPONIVEL}”, com o órgão responsável e o link da fonte. Ausência nunca vira zero.</li>
    </ul></div>

    <h2>O que saiu do Placar nesta versão</h2>
    <p>Prefeitos, vereadores e deputados estaduais <strong>não fazem mais parte do Placar Público</strong>: a rotina deixou de coletar esses dados, e as telas foram retiradas. O código foi guardado, desligado, para que uma página própria seja feita mais adiante.</p>

    <h2>O que ainda não está no ar</h2>
    <p>Presidentes da Câmara e do Senado (gestão da Casa), emendas parlamentares, infraestrutura e obras (podem voltar com uma comparação mundial) e boa parte dos indicadores de saúde e educação (como cobertura vacinal, leitos, e o mínimo constitucional aplicado em saúde e educação) ainda não têm fonte oficial integrada. Nessas áreas aparece a mensagem “${MSG_INDISPONIVEL}” e nenhum número é inventado. Veja a página <a href="#/verificacao">Como verificamos</a>.</p>

    <h2>Limites que você precisa conhecer</h2>
    <div class="cartao"><ul class="pontos">
      <li><strong>Custo dos deputados:</strong> parte dos gastos não tem valor publicado por deputado (ajuda de custo, plano de saúde, serviço gráfico, encargos dos secretários e imóvel funcional). O custo mostrado é, portanto, o que se pode medir, não o custo total.</li>
      <li><strong>Senadores:</strong> o Placar só mostra um critério quando consegue ler e conferir a fonte do Senado. Nesta versão só o custo (CEAPS) é lido; os demais critérios aparecem como “${MSG_INDISPONIVEL}” e, por isso, ainda não há índice de senador. O custo não inclui auxílio-moradia, pessoal do gabinete nem missões oficiais.</li>
      <li><strong>Governadores:</strong> o índice de serviços públicos é parcial. Infraestrutura ainda não tem fonte; saneamento é um retrato de 2022; e os dados do IBGE chegam aos poucos. Governadores empossados recentemente ficam sem índice até haver dado do mandato deles. Resultados dependem de vários níveis de governo.</li>
      <li><strong>Trocas de gestor:</strong> o TSE não traz sucessões por vice nem renúncias de 2026. Elas vêm de um registro nosso com fontes, em geral reportagens, com datas aproximadas quando a fonte não diz o dia. Confirme sempre no site oficial.</li>
      <li><strong>Defasagem das fontes:</strong> o PIB estadual sai com cerca de dois anos de atraso; o Censo 2022 é uma foto de agosto de 2022, anterior ao recorte; o balanço de um ano só chega ao Tesouro no ano seguinte.</li>
      <li><strong>Quem está no cargo:</strong> a lista de governadores vem do TSE e mostra quem foi <em>eleito</em>. Renúncia, cassação e afastamento aparecem só quando registrados.</li>
      <li><strong>Histórico de mandatos:</strong> a Câmara registra a partir da 50ª legislatura (1995). Mandatos anteriores ou em outras Casas e cargos não aparecem.</li>
      <li><strong>Fontes independentes:</strong> têm metodologia e ciclo próprios, e nem sempre o recorte combina com o do Placar. Por isso nunca entram em índices e vêm com a edição e a data.</li>
      <li><strong>Em tempo real?</strong> Não exatamente. Os índices e votos são atualizados todo dia; o histórico de mandatos, o TSE e o Tesouro, toda semana; o custo dos deputados é relido aos poucos (a primeira leitura completa leva cerca de 20 minutos). As abas Projetos, Gastos e Fiscalização consultam a Câmara na hora em que você abre.</li>
    </ul></div>

    <h2>Quer mudar um peso?</h2>
    <p>Todas as regras estão no arquivo <code>scripts/nota.mjs</code>. Mudar um peso ou um limite lá e rodar a atualização de novo recalcula tudo, e esta página se atualiza sozinha.</p>
  </article>`);

  // Regras lidas dos arquivos gerados pela rotina; sem eles, só o texto acima aparece.
  const alvoRanking = $('#metodo-ranking-estados');
  lerArquivo('ranking-estados.json').then(rk => {
    if (!alvoRanking || !document.body.contains(alvoRanking)) return;
    mostrar(alvoRanking, html`<div class="rolagem"><table class="tabela">
      <thead><tr><th>Aba</th><th>Medida</th><th>Sentido</th></tr></thead>
      <tbody>${(rk.metricas || []).map(x => html`<tr><td>${NOMES_SECAO_EXEC[x.secao] || x.secao}</td><td>${x.nome}${x.aviso ? html`<br><small>${x.aviso}</small>` : ''}</td><td>${SENTIDO_RANKING[x.sentido] || x.sentido}</td></tr>`)}</tbody>
    </table></div>
    <p class="nota">${rk.regra || ''}</p>`);
  }).catch(() => { if (alvoRanking) mostrar(alvoRanking, indisponivel('A tabela do ranking entre estados aparece depois da próxima atualização diária.')); });

  const alvoMundo = $('#metodo-mundo');
  lerArquivo('mundo.json').then(mu => {
    if (!alvoMundo || !document.body.contains(alvoMundo)) return;
    mostrar(alvoMundo, html`<div class="rolagem"><table class="tabela">
      <thead><tr><th>Aba</th><th>Indicador</th><th>Melhor é</th></tr></thead>
      <tbody>${(mu.indicadores || []).map(i => html`<tr><td>${NOMES_SECAO_EXEC[i.tema] || i.tema}</td><td>${i.nome} <small>(${i.unidade})</small></td><td>${i.melhor === 'maior' ? 'maior' : 'menor'}</td></tr>`)}</tbody>
    </table></div>
    <p class="nota">${mu.regra || ''}</p>`);
  }).catch(() => { if (alvoMundo) mostrar(alvoMundo, indisponivel('A tabela do Brasil no mundo aparece depois da próxima atualização semanal.')); });
}

const NOMES_SECAO_EXEC = { economia: 'Economia', servicos: 'Serviços básicos', orcamento: 'Orçamento', transparencia: 'Transparência', saude: 'Saúde', educacao: 'Educação', seguranca: 'Segurança', saneamento: 'Saneamento', visao: 'Visão geral' };

function viewFontes() {
  document.title = 'Fontes · Placar Público';
  const f = (DADOS.meta && DADOS.meta.fontes) || {};
  const status = x => {
    if (!x) return html`<span>ainda não consultada</span>`;
    if (x.ok === false) return html`<span class="falha-txt">falhou</span>${x.erro ? html`<br><small>${x.erro}</small>` : ''}`;
    return html`<span class="ok-txt">funcionando</span>`;
  };
  const quando = x => (x && x.atualizadoEm ? dataHoraBR(x.atualizadoEm) : '—');
  const anoGov = f.tse && f.tse.eleicoes && !Array.isArray(f.tse.eleicoes) && typeof f.tse.eleicoes === 'object' ? f.tse.eleicoes.governadores : '';

  mostrar(app, html`<article class="pagina">
    <h1>De onde vêm os dados</h1>
    <p class="lead">Os dados oficiais vêm de bases públicas. Fontes independentes complementam, vêm separadas e com selo próprio. O Placar Público não tem acesso especial a nada: ele só junta, calcula e mostra.</p>

    ${DADOS.demo ? html`<div class="cartao cartao-aviso"><h2>Você está vendo dados inventados</h2>
      <p>Para ver os dados reais, o site precisa ser publicado com a rotina de atualização (GitHub). O passo a passo está no arquivo <strong>LEIA-ME</strong> que acompanha o aplicativo. Depois de publicado, esta página mostra a data e a situação de cada fonte.</p></div>` : ''}

    <h2>Fontes oficiais</h2>
    <div class="rolagem"><table class="tabela">
      <thead><tr><th>Fonte</th><th>O que usamos</th><th class="curto">Atualização</th><th class="curto">Última vez</th><th class="curto">Situação</th></tr></thead>
      <tbody>
        <tr><td><a href="https://dadosabertos.camara.leg.br" target="_blank" rel="noopener">Dados Abertos da Câmara dos Deputados</a></td>
          <td>Presença em sessões, votações nominais e votos de cada deputado, projetos, eventos e órgãos (presença em comissões permanentes) e o endereço da foto oficial${f.camara && f.camara.ano ? html` (${periodoAvaliado(f.camara, true)}: ${fmtNum.format(f.camara.sessoes || 0)} sessões, ${fmtNum.format(f.camara.votacoes || 0)} votações nominais)` : ''}.</td>
          <td class="curto">Todo dia</td><td class="curto">${quando(f.camara)}</td><td class="curto">${status(f.camara)}</td></tr>
        <tr><td><a href="https://www.camara.leg.br/transparencia/gastos-parlamentares" target="_blank" rel="noopener">Portal da Transparência da Câmara</a></td>
          <td>Custo de cada deputado, por ano: cota parlamentar, verba de gabinete, auxílio-moradia e viagens oficiais${f.custo && f.custo.deputadosCompletos != null ? html` (${fmtNum.format(f.custo.deputadosCompletos)} deputados com todos os anos lidos${f.custo.pendentes ? `; ${fmtNum.format(f.custo.pendentes)} leituras ficaram para o dia seguinte` : ''})` : ''}. O Portal é lido página a página; a primeira leitura completa leva cerca de 20 minutos e depois cada ano fechado é guardado.</td>
          <td class="curto">Todo dia (aos poucos)</td><td class="curto">${quando(f.custo)}</td><td class="curto">${status(f.custo)}</td></tr>
        <tr><td><a href="https://www.camara.leg.br" target="_blank" rel="noopener">Câmara: histórico de mandatos</a></td>
          <td>Posse, licenças, reassunções e fim de cada mandato, Mesa Diretora e dados cadastrais${f.historico && f.historico.total ? html` (${fmtNum.format(f.historico.total - (f.historico.falhas || 0))} de ${fmtNum.format(f.historico.total)} deputados)` : ''}.</td>
          <td class="curto">Toda semana</td><td class="curto">${quando(f.historico)}</td><td class="curto">${status(f.historico)}</td></tr>
        <tr><td><a href="https://www12.senado.leg.br/dados-abertos" target="_blank" rel="noopener">Dados Abertos do Senado Federal</a></td>
          <td>Lista de senadores em exercício (nome, partido, UF e endereço da foto oficial), períodos de exercício de cada um e a cota para o exercício da atividade parlamentar (CEAPS). Matérias de autoria, votações nominais, presença no Plenário e em comissões e auxílio-moradia ainda não são lidos com fonte conferida. Dos arquivos de gastos, só se guardam senador, ano, mês e valor.</td>
          <td class="curto">Todo dia</td><td class="curto">${quando(f.senado)}</td><td class="curto">${status(f.senado)}</td></tr>
        <tr><td><a href="https://dadosabertos.tse.jus.br" target="_blank" rel="noopener">Dados Abertos do TSE</a></td>
          <td>Lista de governadores eleitos${anoGov ? ` (eleição de ${anoGov})` : ''} e endereço da foto de candidatura (DivulgaCand).</td>
          <td class="curto">Toda semana</td><td class="curto">${quando(f.tse)}</td><td class="curto">${status(f.tse)}</td></tr>
        <tr><td><a href="https://siconfi.tesouro.gov.br" target="_blank" rel="noopener">Siconfi, Tesouro Nacional</a></td>
          <td>Gasto com pessoal, dívida e relatórios fiscais entregues pelos estados${f.siconfi && f.siconfi.exercicio ? ` (exercício ${f.siconfi.exercicio}${f.siconfi.comErro ? `; ${fmtNum.format(f.siconfi.comErro)} consultas com erro` : ''})` : ''}.</td>
          <td class="curto">Toda semana</td><td class="curto">${quando(f.siconfi)}</td><td class="curto">${status(f.siconfi)}</td></tr>
        <tr><td><a href="https://dadosabertos.tse.jus.br" target="_blank" rel="noopener">TSE: gestões dos últimos 48 meses</a></td>
          <td>Quem foi eleito em 2018, 2022 e 2026 (e eleições suplementares), para ligar cada ano de contas à gestão da época. Trocas no meio do mandato vêm de um registro com fontes de imprensa.</td>
          <td class="curto">Toda semana</td><td class="curto">${quando(f.administracoes)}</td><td class="curto">${status(f.administracoes)}</td></tr>
        <tr><td><a href="https://apidatalake.tesouro.gov.br/docs/siconfi/" target="_blank" rel="noopener">Tesouro Nacional: contas por ano</a></td>
          <td>Balanço anual (DCA): despesa empenhada, liquidada e paga por função, de 2022 até o último ano fechado, e a base do ranking entre estados. A coleta dos anos antigos é feita aos poucos.</td>
          <td class="curto">Todo dia</td><td class="curto">${quando(f.series)}</td><td class="curto">${status(f.series)}</td></tr>
        <tr><td><a href="https://sidra.ibge.gov.br" target="_blank" rel="noopener">IBGE (SIDRA)</a></td>
          <td>População estimada, PIB dos estados e Censo 2022 (água, esgoto e lixo).</td>
          <td class="curto">Toda semana</td><td class="curto">${quando(f.ibge)}</td><td class="curto">${status(f.ibge)}</td></tr>
        <tr><td><a href="https://dadosabertos.bcb.gov.br" target="_blank" rel="noopener">IBGE e Banco Central: séries do presidente</a></td>
          <td>Inflação (IPCA), desocupação (PNAD Contínua), Selic e dívida pública, mês a mês.</td>
          <td class="curto">Todo dia</td><td class="curto">${quando(f.presidente)}</td><td class="curto">${status(f.presidente)}</td></tr>
        <tr><td><a href="https://cidades.ibge.gov.br" target="_blank" rel="noopener">IBGE Cidades e Estados</a></td>
          <td>Resultados por estado: Ideb (Inep), matrículas (Censo Escolar), mortalidade infantil e internações por diarreia (Ministério da Saúde), como o IBGE os publica.</td>
          <td class="curto">Todo dia (cada local, a cada 7 dias)</td><td class="curto">${quando(f.cidades)}</td><td class="curto">${status(f.cidades)}</td></tr>
        <tr><td><a href="https://www.gov.br/mj/pt-br/assuntos/sua-seguranca/seguranca-publica/estatistica" target="_blank" rel="noopener">Sinesp, Ministério da Justiça e Segurança Pública</a></td>
          <td>Ocorrências criminais por estado: homicídios dolosos (vítimas) e roubos de veículos, usados na área de segurança do índice dos governadores. Só entram anos com 12 meses de dados.</td>
          <td class="curto">Toda semana</td><td class="curto">${quando(f.seguranca)}</td><td class="curto">${status(f.seguranca)}</td></tr>
        <tr><td>ANP, Banco Central e DIEESE/Conab</td>
          <td>Preços no Brasil, na aba do presidente: gasolina (ANP, preço médio de revenda semanal, mensal e por estado), dólar (Banco Central, PTAX de venda) e cesta básica (DIEESE em parceria com a Conab, por capital).</td>
          <td class="curto">Todo dia</td><td class="curto">${quando(f.precos)}</td><td class="curto">${status(f.precos)}</td></tr>
      </tbody>
    </table></div>

    <h2>Fontes independentes e organismos internacionais</h2>
    <div class="rolagem"><table class="tabela">
      <thead><tr><th>Fonte</th><th>O que usamos</th><th class="curto">Atualização</th><th class="curto">Última vez</th><th class="curto">Situação</th></tr></thead>
      <tbody>
        <tr><td><a href="https://data.worldbank.org/" target="_blank" rel="noopener">Banco Mundial</a></td>
          <td>Posição do Brasil entre os países em indicadores de saúde, educação, segurança, economia e transparência, nas abas do presidente${f.mundo && f.mundo.comPosicao != null ? ` (${fmtNum.format(f.mundo.comPosicao)} de ${fmtNum.format(f.mundo.indicadores || 0)} indicadores com posição)` : ''}.</td>
          <td class="curto">Toda semana, ou antes, se o Banco Mundial atualizar a base</td><td class="curto">${quando(f.mundo)}</td><td class="curto">${status(f.mundo)}</td></tr>
        <tr><td><a href="#/fontes-independentes">Catálogo de fontes independentes</a></td>
          <td>Institutos e organizações (CLP, IPS Brasil, FBSP, DIEESE, Trata Brasil, Firjan, IEPS, QEdu, Base dos Dados, Transparência Brasil e outras): o que cada uma publica, o que o Placar usa dela, os valores conferidos (com link e data) e a vigilância diária de edições novas.</td>
          <td class="curto">Vigilância todo dia</td><td class="curto">${quando(f.vigilancia)}</td><td class="curto">${status(f.vigilancia)}</td></tr>
      </tbody>
    </table></div>

    <h2>Fotos oficiais</h2>
    <p>A foto ao lado de cada nome vem do endereço oficial: Câmara dos Deputados (deputados), Senado Federal (senadores) e TSE, DivulgaCand (governadores e presidente). O Placar guarda só o endereço, não copia nem hospeda a imagem; se o órgão trocar ou tirar a foto do ar, aparecem as iniciais da pessoa.</p>

    <h2>Quão em tempo real?</h2>
    <p>Os índices, as votações e os votos são recalculados todo dia de madrugada. O histórico de mandatos, o TSE e o Tesouro mudam pouco e são atualizados uma vez por semana. O custo dos deputados é lido aos poucos no Portal da Câmara. As abas Projetos, Gastos e Fiscalização do perfil de cada deputado federal consultam a Câmara na hora em que são abertas.</p>

    <h2>Quem faz</h2>
    <p>O Placar Público é um aplicativo independente, sem vínculo com a Câmara dos Deputados, o Senado, o TSE, o Tesouro Nacional, partidos ou governos. Se você encontrar um número que não bate com a fonte oficial, o endereço da fonte está acima: a fonte oficial é sempre a referência.</p>
  </article>`);
}

/* ---------------------- Fontes independentes: catálogo e vigilância ---------------------- */

const NOMES_STATUS_FONTE = { 'em-uso': 'Em uso no Placar', monitorada: 'Monitorada', catalogada: 'Catalogada, ainda não usada' };
const CLASSE_STATUS_FONTE = { 'em-uso': 'selo selo-independente', monitorada: 'selo selo-calculado', catalogada: 'selo selo-neutro' };
const NOMES_CARGO_USO = { presidente: 'Presidente', senadores: 'Senadores', federais: 'Deputados federais', governadores: 'Governadores' };
const NOMES_LEITURA = { sim: 'sim', parcial: 'em parte', nao: 'não (conferência manual)' };
const NOMES_VIGIA = {
  'primeira-leitura': 'Primeira leitura feita; ainda sem comparação',
  'sem-mudanca': 'Sem novidade desde a última leitura',
  mudou: 'A página mudou, sem edição nova identificada',
  'nova-edicao': 'Edição nova identificada',
  falhou: 'Não foi possível ler nesta vez'
};
const ONDE_APARECE = { seguranca: ['Segurança', '#/presidente/seguranca'], economia: ['Economia', '#/presidente/economia'], visao: ['Visão geral', '#/presidente'] };

function situacaoVigia(reg) {
  if (!reg) return html`<span class="nota" style="margin:0">Ainda não vigiada.</span>`;
  const nova = reg.novidade ? html` Última novidade: ${dataBR(reg.novidade.em)}${reg.novidade.de && reg.novidade.para ? ` (${reg.novidade.de} → ${reg.novidade.para})` : ''}.` : '';
  const pendente = reg.pendente ? html` <strong class="falha-txt">Falta conferir os valores desta edição.</strong>` : '';
  return html`<span class="${reg.status === 'falhou' ? 'falha-txt' : ''}">${NOMES_VIGIA[reg.status] || reg.status}</span>${reg.status === 'falhou' && reg.motivo ? html` <small>(${reg.motivo})</small>` : ''}${nova}${pendente}
    <small>Última leitura boa: ${reg.ultimoSucesso ? dataHoraBR(reg.ultimoSucesso) : '—'}.</small>`;
}

function cartaoFonteIndependente(f, vig) {
  const reg = vig && vig.fontes ? vig.fontes[f.id] : null;
  const linkUrl = urlSegura(f.url);
  const met = f.metodologia ? urlSegura(f.metodologia) : '';
  return html`<section class="cartao" id="fonte-${f.id}">
    <h3 class="sub-titulo">${linkUrl ? html`<a href="${linkUrl}" target="_blank" rel="noopener">${f.nome}</a>` : f.nome} <span class="${CLASSE_STATUS_FONTE[f.status] || 'selo selo-neutro'}">${NOMES_STATUS_FONTE[f.status] || f.status}</span></h3>
    <p class="nota" style="margin-top:0">${f.organizacao} · ${f.tipo}</p>
    <ul class="pontos">
      <li><strong>Abrangência:</strong> ${f.abrangencia}. <strong>Frequência:</strong> ${f.frequencia}.</li>
      <li><strong>Temas:</strong> ${(f.temas || []).join(', ')}.</li>
      <li><strong>Formato:</strong> ${f.formato}. <strong>Leitura automática pelo Placar:</strong> ${NOMES_LEITURA[f.leituraAutomatica] || f.leituraAutomatica}.${met ? html` <a href="${met}" target="_blank" rel="noopener">Metodologia</a>.` : ' Metodologia: não conferida nesta verificação.'}</li>
      <li><strong>Licença de uso:</strong> ${f.licenca || 'não conferida: por isso o Placar mostra apenas o número com link e citação da fonte'}.</li>
      <li><strong>Limites:</strong> ${f.limites}</li>
    </ul>
    <details style="margin-top:8px"><summary>O que o Placar faz com esta fonte, por cargo</summary>
      <ul class="pontos" style="margin-top:8px">${Object.keys(NOMES_CARGO_USO).map(c => html`<li><strong>${NOMES_CARGO_USO[c]}:</strong> ${(f.usoNoPlacar || {})[c] || MSG_INDISPONIVEL}</li>`)}</ul>
    </details>
    ${(f.fatos || []).length ? html`<details style="margin-top:8px"><summary>Fatos conferidos (com o link de onde foram lidos)</summary>
      <ul class="pontos" style="margin-top:8px">${f.fatos.map(x => html`<li>${x.texto} <small>(${x.tipoDeLeitura}: <a href="${urlSegura(x.url)}" target="_blank" rel="noopener">link</a>)</small></li>`)}</ul>
    </details>` : ''}
    <p class="nota">Catálogo conferido em ${dataBR(f.verificadoEm)}. ${f.vigiada ? html`<strong>Vigilância diária:</strong> ` : html`Sem vigilância automática. `}${f.vigiada ? situacaoVigia(reg) : ''}</p>
  </section>`;
}

async function viewFontesIndependentes(token) {
  document.title = 'Fontes independentes · Placar Público';
  mostrar(app, html`<article class="pagina"><h1>Fontes independentes</h1><div class="esq" style="height:220px"></div></article>`);
  const [ind, vig] = await Promise.all([lerArquivo('independentes.json').catch(() => null), lerArquivo('vigilancia.json').catch(() => null)]);
  if (token !== rotaToken) return;
  if (!ind) {
    return mostrar(app, html`<article class="pagina"><h1>Fontes independentes</h1>
      <p class="lead">Institutos, universidades e organizações reconhecidas que complementam os dados oficiais, sempre com link, edição e data.</p>
      <div class="cartao">${indisponivel('O catálogo de fontes independentes aparece depois da próxima atualização diária.')}</div>
      <p><a href="#/mais">Voltar</a></p></article>`);
  }
  const usados = (ind.indicadores || []);
  const novas = vig && vig.fontes ? Object.values(vig.fontes).filter(r => r.pendente) : [];
  mostrar(app, html`<article class="pagina">
    <h1>Fontes independentes</h1>
    <p class="lead">Além dos portais oficiais, o Placar Público consulta institutos, universidades e organizações reconhecidas. O que entra tem dado verificável e metodologia pública, aparece com o selo ${selo('independente')} e <strong>nunca entra em um índice</strong>.</p>

    <h2>Regras</h2>
    <div class="cartao"><ul class="pontos">${(ind.regras || []).map(r => html`<li>${r}</li>`)}</ul></div>

    <h2>O que já aparece no Placar</h2>
    ${usados.length ? html`<div class="rolagem"><table class="tabela">
      <thead><tr><th>Valor</th><th>Fonte</th><th>Onde aparece</th><th>Edição</th><th class="curto">Conferido em</th></tr></thead>
      <tbody>${usados.map(i => { const o = ONDE_APARECE[i.secao]; return html`<tr><td>${i.nome}</td><td><a href="${urlSegura(i.fonte.url)}" target="_blank" rel="noopener">${i.fonte.nome}</a></td><td>${o ? html`Presidente, <a href="${o[1]}">${o[0]}</a>` : NOMES_CARGO_USO[i.cargo]}</td><td>${i.edicao}</td><td class="curto">${dataBR(i.conferidoEm)}</td></tr>`; })}</tbody>
    </table></div>
    <p class="nota">Valores lidos em reportagens que citam a fonte vêm avisados na tela, com os links de onde foram lidos. Confira sempre na publicação original.</p>`
      : html`<div class="cartao">${indisponivel('Nenhum valor independente conferido está publicado no momento.')}</div>`}
    <div class="cartao cartao-contexto"><p>${icone('info', 18)} <span>Senadores e deputados federais: o contexto do estado em que foram eleitos (por exemplo, o ranking de competitividade do CLP) fica reservado até que a tabela completa dos 27 estados seja conferida na fonte. Quando entrar, vai aparecer rotulado como “contexto do estado, não atribuído ao parlamentar” e fora do índice.</span></p></div>

    <h2>Vigilância diária</h2>
    <p>Todo dia o Placar confere se cada fonte do catálogo publicou algo novo (uma edição, um mês ou uma atualização de base). <strong>A vigilância só avisa:</strong> nada é copiado sozinho para o site. Um número novo só entra depois de conferido na publicação e registrado com link e data.</p>
    ${vig ? html`<p class="nota">Última rodada: ${dataHoraBR(vig.geradoEm)}.${novas.length ? html` <strong class="falha-txt">${novas.length === 1 ? '1 fonte tem' : `${novas.length} fontes têm`} edição nova ainda não conferida.</strong>` : ' Nenhuma edição nova aguardando conferência.'}</p>`
      : html`<div class="cartao">${indisponivel('A vigilância ainda não rodou. Ela aparece depois da próxima atualização diária.')}</div>`}

    <h2>Catálogo</h2>
    <p>${(ind.fontes || []).length} fontes conferidas. “Catalogada” quer dizer que a fonte foi lida e registrada, mas o Placar ainda não usa nenhum número dela; o motivo está em cada cartão.</p>
    ${(ind.fontes || []).map(f => cartaoFonteIndependente(f, vig))}

    <p class="nota">${ind.aviso || ''}</p>
  </article>`);
}

function viewVerificacao() {
  document.title = 'Como verificamos · Placar Público';
  mostrar(app, html`<article class="pagina">
    <h1>Como verificamos</h1>
    <p class="lead">Regras que o Placar Público segue para que nada falso apareça como se fosse oficial.</p>

    <h2>1. Nada fictício aparece como real</h2>
    <p>Quando o site é aberto sem os dados reais, ele entra em <strong>modo demonstração</strong>, com nomes e números inventados e uma faixa vermelha no topo de todas as telas. Nos dados reais, nenhum nome, voto ou número é criado por nós.</p>

    <h2>2. Todo dado mostra de onde vem</h2>
    <p>Cada informação tem a fonte e, quando existe, a data da última atualização: na própria tela, na aba Fontes de cada perfil e na página <a href="#/fontes">Fontes</a>. Os selos ${selo('oficial')} ${selo('calculado')} ${selo('independente')} ${selo('indice')} dizem se o número é oficial, calculado por nós, de uma fonte independente ou o índice.</p>

    <h2>3. Sem fonte oficial, sem número</h2>
    <p>Quando não há dado oficial (ou ele ainda não foi confirmado), aparece sempre a mesma mensagem:</p>
    <div class="cartao" style="margin-top:8px">${indisponivel()}</div>
    <p style="margin-top:12px">Nós não preenchemos a lacuna com estimativa, média ou número de outra fonte sem avisar. Ausência de informação nunca vira zero: um critério sem dado sai da conta, e o índice diz de quantos critérios é feito.</p>

    <h2>3b. Cada número ligado ao período e à gestão certos</h2>
    <p>Nos perfis de presidente e governadores, cada número traz o ano ou mês a que se refere, de quem era a gestão naquele período e o que a fonte diz sobre limitações. Anunciado não é pago, e contratado não é concluído: a despesa aparece empenhada e paga, em colunas separadas. Resultados de serviços prestados por outro ente ou por concessionárias não são atribuídos só ao gestor. Quando duas fontes divergem, a divergência fica à mostra, sem que o Placar escolha uma delas. Para cada indicador, a aba Fontes mostra a origem, o responsável e a licença de uso.</p>

    <h2>3c. Fontes independentes</h2>
    <p>Dados de institutos e organizações só entram com <strong>link da publicação, edição e data da conferência</strong>, com o selo “Fonte independente”, separados do dado oficial e fora de qualquer índice. A vigilância diária só avisa que há edição nova: o número novo só entra depois de conferido. Quando o valor foi lido numa reportagem que cita a fonte, a tela diz isso. Veja o <a href="#/fontes-independentes">catálogo e a vigilância</a>.</p>

    <h2>4. Votos nunca são inventados</h2>
    <p>Mostramos o voto que a Câmara (ou o Senado) registrou. Se uma matéria não teve votação nominal no Plenário, aparece: “${MSG_SEM_VOTACAO}” As votações são separadas pelo texto oficial em proposta principal, emenda, substitutivo, destaque e requerimento, porque o resultado de um não vale para o outro.</p>

    <h2>5. Correções ficam registradas</h2>
    <p>Todo dia o Placar Público compara as votações com as do dia anterior. Se a Câmara mudar um resultado, um placar, um texto ou o voto de alguém, a mudança é anotada em <a href="#/noticias">Notícias</a>, com a data, e o dado antigo não é apagado do histórico. Se uma atualização falhar, o site mantém o último dado bom e mostra uma faixa amarela de aviso.</p>

    <h2>6. Notícias automáticas</h2>
    <p>As “notícias” são resumos gerados por regra a partir de dados oficiais. Não têm opinião, não citam fontes de imprensa e não são reportagens. Cada item traz o link da fonte oficial para você conferir.</p>

    <h2>7. Dados pessoais</h2>
    <p>O Placar não lê nem guarda CPF, CNPJ ou outros dados pessoais de fornecedores, servidores ou candidatos. Nos arquivos de gastos, só são guardados parlamentar, ano, mês e valor.</p>

    <h2>8. Achou uma divergência?</h2>
    <p>A fonte oficial é sempre a referência. Se um número daqui não bate com o dela, o link está na própria tela. Divergências costumam ter explicação (data de atualização diferente, licença, suplência), e esta página e a Metodologia dizem como cada número é calculado.</p>
  </article>`);
}
