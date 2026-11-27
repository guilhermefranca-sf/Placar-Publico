'use strict';

/* =====================================================================
   Placar Público — perfil do senador (versão 8)
   Abas: Visão geral (foto, destaques, índice, custo) e Fontes.
   O índice usa os mesmos critérios dos deputados federais, no que as fontes do Senado
   permitem medir. Nesta versão só o custo (cota CEAPS) tem leitura conferida; os outros
   critérios aparecem como "Dado não encontrado ou não confirmado" e ficam fora da conta.
   Nada é inventado e ausência de dado nunca vira zero.
   ===================================================================== */

const PORTAL_SENADO = 'https://www12.senado.leg.br/transparencia';
const DADOS_ABERTOS_SENADO = 'https://www12.senado.leg.br/dados-abertos/administrativo';
const API_SENADO = 'https://legis.senado.leg.br/dadosabertos';
const RUBRICAS_SENADO = [['ceaps', 'Cota para o exercício da atividade parlamentar (CEAPS)']];
const TEXTO_SEM_LANCAMENTO_SENADO = '“Sem lançamento” quer dizer que o Senado não publicou nenhuma despesa da CEAPS em nome deste senador naquele ano, embora ele estivesse em exercício. Ela entra como R$ 0 só na soma do total; o Placar não preencheu nenhum valor.';
const RESSALVA_CUSTO_SENADO = 'o limite mensal da CEAPS varia por estado (por causa do preço das passagens até Brasília), e valores recentes podem ainda não ter sido publicados, o que vale para todos os senadores.';

/* Posição do custo por mês entre os senadores com custo comparável (1 = menor custo). */
function resumoCustoSenadores(dado, item) {
  const valores = dado.itens.map(custoPorMes).filter(v => v != null).sort((a, b) => a - b);
  if (!valores.length) return null;
  const meu = custoPorMes(item);
  const mediana = valores.length % 2 ? valores[(valores.length - 1) / 2] : (valores[valores.length / 2 - 1] + valores[valores.length / 2]) / 2;
  return {
    n: valores.length, mediana, menor: valores[0], maior: valores[valores.length - 1],
    pos: meu == null ? null : valores.filter(v => v < meu).length + 1
  };
}

function legendaCustoSenador(e, desde) {
  const c = e.custo;
  if (!c) return `${MSG_INDISPONIVEL}: ${e.custoMotivo || 'a CEAPS não foi lida para este senador'}`;
  if (c.poucosMeses) return `só a cota CEAPS, desde ${dataBR(desde)}; ${dec(c.meses, 1)} meses de exercício, pouco para comparar por mês`;
  return `só a cota CEAPS: ${fmtBRL.format(c.total)} desde ${dataBR(desde)} em ${dec(c.meses, 1)} meses de exercício, sem o subsídio`;
}

async function viewSenador(id, abaInicial, token) {
  const voltar = ['#/senadores', 'Senadores'];
  document.title = 'Placar Público';
  mostrar(app, esqueletoPerfil(...voltar));
  let dado;
  try {
    dado = await lerArquivo('senadores.json');
  } catch (e) {
    console.error(e);
    if (token === rotaToken) { mostrar(app, html`<div id="erro"></div>`); mostrarErro($('#erro'), 'Não foi possível carregar os dados.', () => viewSenador(id, abaInicial, token)); }
    return;
  }
  if (token !== rotaToken) return;
  const item = dado.itens.find(i => i.id === String(id));
  if (!item) return naoEncontrado(...voltar, 'Senador(a)');
  document.title = `${item.nome} · Placar Público`;

  const resumo = resumoCustoSenadores(dado, item);
  const selos = [html`<span class="distintivo">Em exercício no Senado</span>`];
  if (item.nota == null) selos.push(html`<span class="distintivo distintivo-aviso">Índice ainda não calculado</span>`);
  else if (item.rank != null) selos.push(html`<span class="distintivo distintivo-neutro">${fmtNum.format(item.rank)}º entre ${fmtNum.format(dado.comNota)}</span>`);
  if (resumo && resumo.pos != null) selos.push(html`<span class="distintivo distintivo-neutro">${fmtNum.format(resumo.pos)}º menor custo por mês entre ${fmtNum.format(resumo.n)}</span>`);

  mostrar(app, html`
    <a class="voltar" href="${voltar[0]}">${icone('voltar', 16)}${voltar[1]}</a>
    ${heroPerfil({ item, cargoTxt: 'Senador(a)', meta: `${item.partido || 'Sem partido'}${item.uf ? ' · ' + (NOMES_UF[item.uf] || item.uf) : ''}`, selos })}
    ${barraAbas(ABAS_SENADOR, `#/senadores/${id}`)}
    <section class="painel" id="painel" role="tabpanel" aria-live="polite"></section>`);

  const ctx = { id, item, dado, resumo, demo: DADOS.demo };
  const PAINEIS = { visao: painelVisaoSenador, fontes: painelFontesSenador };
  ligarAbas({
    chave: `senadores/${id}`, abas: ABAS_SENADOR, abaInicial, token, antigas: ABAS_ANTIGAS_SENADOR,
    desenharPainel: (aba, painel, vale) => {
      mostrar(painel, esqueletoLinhas(3));
      Promise.resolve(PAINEIS[aba](painel, ctx, vale)).catch(e => {
        console.error(e);
        if (vale()) mostrarErro(painel, 'Não foi possível carregar esta seção.', () => perfilAtual && perfilAtual.redesenhar());
      });
    }
  });
}

function painelVisaoSenador(el, ctx) {
  const { item, resumo, demo } = ctx;
  const e = item.extra || {};
  const semDado = (ic, cor, rotulo) => tile({ icone: ic, cor, rotulo, valor: '—', legenda: `${MSG_INDISPONIVEL}: o Placar ainda não lê isto do Senado de uma fonte conferida. Não é nota zero.` });
  const naoMedidos = (DADOS.metodo && DADOS.metodo.custoNaoMedidosSenadores) || [];

  mostrar(el, html`
    ${item.nota == null ? html`<section class="cartao cartao-aviso" style="margin-top:0"><h3>Índice ainda não calculado</h3>
      <p>${item.motivo || 'Não há dados suficientes para calcular o índice.'}</p></section>` : ''}
    <h2 class="painel-titulo">Destaques do mandato</h2>
    <p class="painel-sub">Números dos ${periodoAvaliado(ctx.dado)}, calculados com os dados abertos do Senado. Onde o Placar ainda não consegue confirmar o dado, aparece "${MSG_INDISPONIVEL}".</p>
    <div class="tiles">
      ${tile({ icone: 'moedas', cor: 'roxo', rotulo: 'Custo para os cofres públicos', valor: e.custo && !e.custo.poucosMeses ? reaisCurto(e.custo.porMes) + ' por mês' : e.custo ? reaisCurto(e.custo.total) : '—', legenda: legendaCustoSenador(e, item.desde), origem: 'calculado', natureza: 'quantitativo' })}
      ${semDado('pessoas', 'verde', 'Presença no Plenário')}
      ${semDado('urna', 'azul', 'Votações nominais')}
      ${semDado('arquivo', 'laranja', 'Projetos aprovados')}
      ${semDado('pessoas', 'laranja', 'Presença em comissões')}
    </div>
    ${cartaoIndice(item, 'senadores')}
    ${cartaoCusto(item, { rubricas: RUBRICAS_SENADO, naoMedidos, fonteTxt: 'Portal da Transparência do Senado Federal', fonteUrl: PORTAL_SENADO, quem: 'senador', comparados: 'todos os senadores em exercício', textoSemLancamento: TEXTO_SEM_LANCAMENTO_SENADO, ressalva: RESSALVA_CUSTO_SENADO })}
    ${resumo && custoPorMes(item) != null ? html`<section class="cartao">
      <h2 class="painel-titulo">Custo por mês entre os senadores ${selo('calculado', 'quantitativo')}</h2>
      <p class="painel-sub">Só a cota CEAPS, por mês de exercício, entre os ${fmtNum.format(resumo.n)} senadores em exercício com pelo menos 3 meses de exercício no período.</p>
      <div class="numeros">
        <div class="numero"><span>Este senador</span><strong>${reaisCurto(custoPorMes(item))}</strong><small>${fmtNum.format(resumo.pos)}º menor custo entre ${fmtNum.format(resumo.n)}</small></div>
        <div class="numero"><span>Mediana</span><strong>${reaisCurto(resumo.mediana)}</strong><small>metade custou menos, metade mais</small></div>
        <div class="numero"><span>Menor</span><strong>${reaisCurto(resumo.menor)}</strong><small>entre os senadores comparados</small></div>
        <div class="numero"><span>Maior</span><strong>${reaisCurto(resumo.maior)}</strong><small>entre os senadores comparados</small></div>
      </div>
      <p class="nota">Custo menor não quer dizer mandato melhor: a CEAPS paga passagens, aluguel de escritório, divulgação e outras despesas do exercício do mandato, e o limite varia por estado.</p>
    </section>` : ''}
    ${item.pagina && urlSegura(item.pagina) ? html`<section class="cartao"><h2 class="painel-titulo">Perfil oficial ${selo('oficial')}</h2>
      <p class="painel-sub">Biografia, mandatos, comissões, autorias e votações, no site do Senado: <a href="${urlSegura(item.pagina)}" target="_blank" rel="noopener">página de ${item.nome}</a>.</p></section>` : ''}
    ${demo ? html`<p class="nota">No modo demonstração nenhum destes números é real.</p>` : ''}`);
}

function painelFontesSenador(el, ctx) {
  const f = (DADOS.meta && DADOS.meta.fontes) || {};
  const quando = x => (x && x.atualizadoEm ? dataHoraBR(x.atualizadoEm) : '—');
  const linhas = [
    ['Lista de senadores em exercício, partido, UF e foto oficial', 'Dados Abertos do Senado Federal (lista atual de senadores)', `${API_SENADO}/senador/lista/atual`, 'Todo dia', quando(f.senado)],
    ['Períodos de exercício (usados para dividir o custo por mês)', 'Dados Abertos do Senado Federal (mandatos do senador)', `${API_SENADO}/senador/${ctx.id}/mandatos`, 'Todo dia', quando(f.senado)],
    ['Custo para os cofres públicos (cota CEAPS)', 'Dados abertos de despesas dos senadores, Senado Federal', DADOS_ABERTOS_SENADO, 'Todo dia (anos fechados ficam guardados)', quando(f.senado)],
    ['Presença, votações nominais, projetos aprovados e comissões', 'Ainda não lidos com fonte conferida: aparecem como "Dado não encontrado ou não confirmado"', 'https://www12.senado.leg.br/transparencia', '—', '—']
  ];
  mostrar(el, html`<section class="cartao" style="margin-top:0">
    <h2 class="painel-titulo">De onde vem cada informação</h2>
    <p class="painel-sub">Tudo vem de fontes oficiais abertas do Senado. O índice de 0 a 100 é uma regra do Placar Público aplicada a esses dados; as regras estão na <a href="#/metodologia">Metodologia</a>. A foto é a oficial do Senado, carregada do site dele (o Placar não guarda cópia).</p>
    <div class="rolagem"><table class="tabela"><thead><tr><th>O quê</th><th>Fonte</th><th class="curto">Atualização</th><th class="curto">Última vez</th></tr></thead>
      <tbody>${linhas.map(([o, fo, url, atu, ult]) => html`<tr><td>${o}</td><td><a href="${url}" target="_blank" rel="noopener">${fo}</a></td><td class="curto">${atu}</td><td class="curto">${ult}</td></tr>`)}</tbody></table></div>
    <p class="nota">${ctx.demo ? 'No modo demonstração nada disto é real.' : html`A planilha de despesas do Senado traz CPF e CNPJ de fornecedores; o Placar descarta esses campos ao ler e não guarda nem publica nenhum deles.`}</p>
  </section>`);
}
