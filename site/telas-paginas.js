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
      <li><strong>Não mede a qualidade do trabalho.</strong> Um deputado pode apresentar muitos projetos ruins ou poucos projetos excelentes; o índice só enxerga a quantidade.</li>
      <li><strong>Índice baixo não é acusação.</strong> Uma ausência pode ser missão oficial, licença ou doença. Um relatório fiscal pode estar atrasado por problema técnico da prefeitura. O índice não sabe o motivo.</li>
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
    <p class="nota">Produção legislativa e tempo de exercício: a aba Projetos mostra a produção por ano de exercício efetivo, que é o total de projetos dividido pelos anos em que a Câmara registra o deputado “em exercício”. Licenças e períodos em que outra pessoa ocupou a vaga não entram na divisão. Isso é mostrado para o mandato atual e para todo o histórico, e não entra no índice.</p>

    <h2>Prefeitos e governadores</h2>
    <p>Calculado com as contas do último ano fechado no Tesouro Nacional, atualizadas uma vez por semana. O índice é da administração, e vale para quem estava no cargo naquele ano. Quem tomou posse depois do fim do ano das contas fica sem índice até haver um ano fechado da sua gestão.</p>
    ${tabelaComponentes(m.executivos.componentes)}
    <p>Limites usados nas comparações:</p>
    <ul class="limites">
      <li>Prefeituras: gasto com pessoal até ${m.executivos.limites.M.pessoal}% da receita corrente líquida; dívida até ${m.executivos.limites.M.divida}%.</li>
      <li>Estados e Distrito Federal: gasto com pessoal até ${m.executivos.limites.E.pessoal}%; dívida até ${m.executivos.limites.E.divida}%.</li>
    </ul>
    <p>Se faltar algum critério (por exemplo, a prefeitura não enviou o relatório de dívida), o índice usa o que existe, mas só é calculado se houver pelo menos ${m.executivos.minComponentes} dos ${m.executivos.componentes.length}.</p>
    <p class="nota">Os relatórios fiscais entregues ao Tesouro (RREO, RGF, DCA) <strong>não entram no índice</strong>. Eles aparecem na aba Transparência, como informação de transparência, porque um atraso pode ter causas técnicas e punir por isso distorceria o índice.</p>` : html`
    <p class="nota">Os detalhes das regras ainda não foram carregados.</p>`}

    <h2>Perfil dos gestores: 48 meses, uma gestão de cada vez</h2>
    <div class="cartao"><ul class="pontos">
      <li><strong>Recorte:</strong> os últimos 48 meses fechados antes do mês atual (em novembro de 2026, de novembro de 2022 a outubro de 2026).</li>
      <li><strong>Quem governava:</strong> cada gestão tem data de início e fim, tirada dos eleitos do TSE e, quando houve renúncia ou sucessão no meio do mandato, de um registro com fontes. Reeleição não é troca de gestor. Quando o recorte alcança uma gestão anterior, ela aparece separada, e nenhum número do passado é atribuído a quem governa hoje.</li>
      <li><strong>Ano com troca de gestor:</strong> as contas públicas são anuais. Um ano em que mudou o gestor aparece como “gestão dividida”, e o valor não é entregue a uma só pessoa. Anos que só em parte cabem nos 48 meses (como 2022) mostram o balanço do ano inteiro e dizem quantos meses ficam no recorte.</li>
      <li><strong>Presidente:</strong> as séries são mensais (inflação, desocupação, juros e dívida), e cada mês é ligado à gestão da época, com um resumo por gestão. Não há índice para o presidente porque a base de indicadores ainda é parcial.</li>
      <li><strong>Despesa:</strong> mostramos empenhada (compromisso assumido), e paga (dinheiro que saiu), em colunas separadas. Anunciado não é pago, e contratado não é concluído.</li>
      <li><strong>Resultado de serviço de outro ente:</strong> água e esgoto de companhias estaduais ou concessionárias, segurança pública estadual e saúde ou educação financiadas por mais de um nível de governo não são atribuídos só ao prefeito ou governador.</li>
      <li><strong>Sem dado, sem número:</strong> o que não foi confirmado em fonte oficial aparece como “${MSG_INDISPONIVEL}”, com o órgão responsável e o link da fonte. Ausência nunca vira zero.</li>
      <li><strong>Índice:</strong> o índice de prefeitos e governadores continua usando só gasto com pessoal e dívida. Os demais indicadores aparecem como informação, sem nota automática, enquanto a base estiver incompleta.</li>
    </ul></div>

    <h2>Deputados estaduais e vereadores</h2>
    <p>Estes cargos <strong>ainda não têm índice</strong>. Não existe uma fonte única e padronizada com presença, votos e projetos dos 27 parlamentos estaduais e de mais de cinco mil câmaras municipais. Em vez de inventar um índice com dados incomparáveis, o Placar Público mostra a lista oficial de eleitos.</p>

    <h2>O que ainda não está no ar</h2>
    <p>Senadores, presidentes da Câmara e do Senado (gestão da Casa), emendas parlamentares e boa parte dos indicadores de saúde, educação, segurança, saneamento e obras ainda não têm fonte oficial integrada. Nessas áreas aparece a mensagem “${MSG_INDISPONIVEL}” e nenhum número é inventado. Veja a página <a href="#/verificacao">Como verificamos</a>.</p>

    <h2>Limites que você precisa conhecer</h2>
    <div class="cartao"><ul class="pontos">
      <li><strong>Prefeitos e governadores:</strong> o índice ainda não considera saúde, educação, obras e serviços, porque não há dado oficial comparável e atualizado para todas as cidades. Nas abas aparece o gasto por função (do balanço enviado ao Tesouro), que não mede a qualidade do serviço.</li>
      <li><strong>Trocas de gestor:</strong> o TSE não traz sucessões por vice nem renúncias de 2026. Elas vêm de um registro nosso com fontes, em geral reportagens, com datas aproximadas quando a fonte não diz o dia. O registro cobre os governadores e as capitais conhecidos; outros municípios podem ter trocas que ainda não estão lá. Confirme sempre no site oficial.</li>
      <li><strong>Defasagem das fontes:</strong> o PIB municipal sai com cerca de dois anos de atraso; o Censo 2022 é uma foto de agosto de 2022, anterior ao recorte; o balanço de um ano só chega ao Tesouro no ano seguinte.</li>
      <li><strong>Quem está no cargo:</strong> a lista de prefeitos, governadores, deputados estaduais e vereadores vem do TSE e mostra quem foi <em>eleito</em>. Renúncia, cassação, afastamento e suplentes que assumiram não aparecem.</li>
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
          <td>Lista de eleitos: prefeitos, vereadores, governadores e deputados estaduais${anosTse ? ` (${anosTse})` : ''}.</td>
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
      </tbody>
    </table></div>

    <h2>Quão em tempo real?</h2>
    <p>Os índices, as votações e os votos são recalculados todo dia de madrugada. O histórico de mandatos, o TSE e o Tesouro mudam pouco e são atualizados uma vez por semana. As abas Projetos, Gastos e Fiscalização do perfil de cada deputado federal, e a lista de sessões sem presença, consultam a Câmara na hora em que são abertas.</p>

    <h2>Quem faz</h2>
    <p>O Placar Público é um aplicativo independente, sem vínculo com a Câmara dos Deputados, o TSE, o Tesouro Nacional, partidos ou governos. Se você encontrar um número que não bate com a fonte oficial, o endereço da fonte está acima: a fonte oficial é sempre a referência.</p>
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
