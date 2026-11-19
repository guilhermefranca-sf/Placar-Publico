'use strict';

/* =====================================================================
   Placar Público — páginas de texto: Metodologia e Fontes
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
  mostrar(app, html`<article class="pagina">
    <h1>Como a nota é calculada</h1>
    <p class="lead">A nota vai de 0 a 100 e usa só dados oficiais abertos. Todas as regras estão escritas aqui, e o código que calcula é aberto: quem quiser conferir ou discordar de um peso pode ver e propor outra regra.</p>

    <h2>O que a nota é, e o que ela não é</h2>
    <div class="cartao"><ul class="pontos">
      <li>É um resumo de critérios objetivos que dá para medir com dados públicos, aplicados do mesmo jeito para todos do mesmo cargo.</li>
      <li><strong>Não mede a qualidade do trabalho.</strong> Um deputado pode apresentar muitos projetos ruins ou poucos projetos excelentes; a nota só enxerga a quantidade.</li>
      <li><strong>Nota baixa não é acusação.</strong> Uma ausência pode ser missão oficial, licença ou doença. Um relatório fiscal pode estar atrasado por problema técnico da prefeitura. A nota não sabe o motivo.</li>
      <li>As cores servem só para leitura rápida: 70 ou mais em verde, de 40 a 69 em amarelo, abaixo de 40 em vermelho. Não são faixas oficiais.</li>
    </ul></div>

    ${m ? html`
    <h2>Deputados federais</h2>
    <p>Calculada todo dia com os dados do ano em curso. Quem tem menos de ${m.federais.minSessoes} sessões deliberativas desde a primeira presença no ano fica sem nota, porque o período seria curto demais para comparar.</p>
    ${tabelaComponentes(m.federais.componentes)}

    <h2>Prefeitos e governadores</h2>
    <p>Calculada com as contas do último ano fechado no Tesouro Nacional, atualizadas uma vez por semana. A nota é da administração, e vale para quem estava no cargo naquele ano. Quem tomou posse depois do fim do ano das contas fica sem nota até haver um ano fechado da sua gestão.</p>
    ${tabelaComponentes(m.executivos.componentes)}
    <p>Limites usados nas comparações:</p>
    <ul class="limites">
      <li>Prefeituras: gasto com pessoal até ${m.executivos.limites.M.pessoal}% da receita corrente líquida; dívida até ${m.executivos.limites.M.divida}%.</li>
      <li>Estados e Distrito Federal: gasto com pessoal até ${m.executivos.limites.E.pessoal}%; dívida até ${m.executivos.limites.E.divida}%.</li>
    </ul>
    <p>Se faltar algum critério (por exemplo, a prefeitura não enviou o relatório de dívida), a nota usa os que existem, mas só é calculada se houver pelo menos ${m.executivos.minComponentes} dos 3.</p>` : html`
    <p class="nota">Os detalhes das regras ainda não foram carregados.</p>`}

    <h2>Deputados estaduais e vereadores</h2>
    <p>Estes cargos <strong>ainda não têm nota</strong>. Não existe uma fonte única e padronizada com presença, votos e projetos dos 27 parlamentos estaduais e de mais de cinco mil câmaras municipais. Em vez de inventar uma nota com dados incomparáveis, o Placar Público mostra a lista oficial de eleitos.</p>

    <h2>Limites que você precisa conhecer</h2>
    <div class="cartao"><ul class="pontos">
      <li><strong>Prefeitos e governadores:</strong> a nota ainda não considera saúde, educação, obras e serviços, porque não há dado oficial comparável e atualizado para todas as cidades.</li>
      <li><strong>Quem está no cargo:</strong> a lista de prefeitos, governadores, deputados estaduais e vereadores vem do TSE e mostra quem foi <em>eleito</em>. Renúncia, cassação, afastamento e suplentes que assumiram não aparecem.</li>
      <li><strong>Prefeituras:</strong> o município do TSE é ligado ao do Tesouro pelo nome e pelo estado. Quando os dois órgãos escrevem o nome um pouco diferente (por exemplo "Assú" e "Açu"), só é aceito o município do mesmo estado que for claramente o mais parecido. Se houver dúvida ou empate, a pessoa fica sem nota, em vez de arriscar uma nota errada.</li>
      <li><strong>Em tempo real?</strong> Não exatamente. Os dados são atualizados todo dia (os do TSE e do Tesouro, toda semana). As abas Projetos, Votações, Presença e Gastos dos deputados federais consultam a Câmara na hora em que você abre.</li>
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
          <td>Presença em sessões, votações nominais, projetos e cota parlamentar dos deputados federais${f.camara && f.camara.ano ? html` (${f.camara.ano}: ${fmtNum.format(f.camara.sessoes || 0)} sessões, ${fmtNum.format(f.camara.votacoes || 0)} votações nominais)` : ''}.</td>
          <td class="curto">Todo dia</td><td class="curto">${quando(f.camara)}</td><td class="curto">${status(f.camara)}</td></tr>
        <tr><td><a href="https://dadosabertos.tse.jus.br" target="_blank" rel="noopener">Dados Abertos do TSE</a></td>
          <td>Lista de eleitos: prefeitos, vereadores, governadores e deputados estaduais${anosTse ? ` (${anosTse})` : ''}.</td>
          <td class="curto">Toda semana</td><td class="curto">${quando(f.tse)}</td><td class="curto">${status(f.tse)}</td></tr>
        <tr><td><a href="https://siconfi.tesouro.gov.br" target="_blank" rel="noopener">Siconfi, Tesouro Nacional</a></td>
          <td>Gasto com pessoal, dívida e relatórios fiscais entregues por prefeituras e estados${f.siconfi && f.siconfi.exercicio ? ` (exercício ${f.siconfi.exercicio}; ${fmtNum.format(f.siconfi.entes || 0)} prefeituras e estados${f.siconfi.comErro ? `, ${fmtNum.format(f.siconfi.comErro)} consultas com erro` : ''})` : ''}.</td>
          <td class="curto">Toda semana</td><td class="curto">${quando(f.siconfi)}</td><td class="curto">${status(f.siconfi)}</td></tr>
      </tbody>
    </table></div>

    <h2>Quão em tempo real?</h2>
    <p>Os números e as notas são recalculados todo dia de madrugada. As abas Projetos, Votações, Presença e Gastos do perfil de cada deputado federal consultam a Câmara na hora em que são abertas. Os dados do TSE e do Tesouro mudam pouco e são atualizados uma vez por semana.</p>

    <h2>Quem faz</h2>
    <p>O Placar Público é um aplicativo independente, sem vínculo com a Câmara dos Deputados, o TSE, o Tesouro Nacional, partidos ou governos. Se você encontrar um número que não bate com a fonte oficial, o endereço da fonte está acima: a fonte oficial é sempre a referência.</p>
  </article>`);
}
