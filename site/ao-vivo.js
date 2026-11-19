'use strict';

/* =====================================================================
   Placar Público — consulta ao vivo à Câmara dos Deputados
   Partes do perfil dos deputados federais (Projetos, Presença, Gastos,
   Fiscalização) consultam a API de Dados Abertos da Câmara na hora em que
   a pessoa abre a aba. O que a API da Câmara não libera para outros
   endereços (CORS) e o que muda pouco (histórico, votos) vem dos arquivos
   gerados todo dia pela rotina de atualização.
   ===================================================================== */

/* Proposições em que o deputado consta como autor, com data de apresentação no ano.
   Filtrar pelo campo "ano" deixaria de fora emendas, pareceres e destaques (a API grava
   ano 0 neles), e o total ficaria menor que o do portal da Câmara. Por isso a busca é
   por data de apresentação, em 4 trimestres, porque a API limita cada consulta a 3 meses. */
async function carregarProjetos(id, ano) {
  const trimestres = [['01-01', '03-31'], ['04-01', '06-30'], ['07-01', '09-30'], ['10-01', '12-31']];
  const partes = await Promise.all(trimestres.map(([ini, fim]) => buscarTudo(
    `/proposicoes?idDeputadoAutor=${id}&dataApresentacaoInicio=${ano}-${ini}&dataApresentacaoFim=${ano}-${fim}&ordem=DESC&ordenarPor=id`)));
  const itens = [...new Map(partes.flatMap(p => p.itens).map(p => [p.id, p])).values()]
    .sort((a, b) => (b.dataApresentacao || '').localeCompare(a.dataApresentacao || ''));
  return { itens, truncado: partes.some(p => p.truncado) };
}

// "PL 2385/2026"; documentos sem ano (pareceres, destaques) aparecem só com sigla e número.
const nomeProposicao = p => `${p.siglaTipo} ${p.numero}${p.ano ? `/${p.ano}` : ''}`;

/* Presença: compara as sessões deliberativas encerradas do Plenário no ano com as
   sessões em que o deputado tem presença registrada. Conferido com a frequência
   publicada no portal da Câmara. */
async function carregarPresenca(id, ano) {
  const fim = ano === ANO_ATUAL ? isoDia(new Date()) : `${ano}-12-31`;
  const periodo = `dataInicio=${ano}-01-01&dataFim=${fim}&ordem=ASC&ordenarPor=dataHoraInicio`;
  const [plenario, dele] = await Promise.all([
    buscarTudo(`/eventos?${periodo}&idOrgao=${ID_PLENARIO}`),
    buscarTudo(`/deputados/${id}/eventos?${periodo}`)
  ]);
  const ehSessao = e => e.descricaoTipo === 'Sessão Deliberativa' && e.situacao === 'Encerrada';
  const sessoes = [...new Map(plenario.itens.filter(ehSessao).map(e => [e.id, e])).values()];
  const presencas = new Set(dele.itens.filter(ehSessao).map(e => e.id));
  const ausentes = sessoes.filter(s => !presencas.has(s.id));
  const total = sessoes.length;
  const presente = total - ausentes.length;
  return {
    total, presente, ausentes,
    pct: total ? Math.round((presente / total) * 100) : null
  };
}

/* Gastos da cota parlamentar. O campo valorLiquido da API vem com o sinal trocado em
   muitos lançamentos, então o líquido é calculado aqui: valor do documento menos glosa.
   Esse cálculo reproduz exatamente o total que o portal da Câmara divulga. */
async function carregarGastos(id, ano) {
  const { itens, truncado } = await buscarTudo(
    `/deputados/${id}/despesas?ano=${ano}&ordem=DESC&ordenarPor=dataDocumento`, 40);
  const lancamentos = itens.map(x => ({
    mes: x.mes,
    tipo: frase(x.tipoDespesa),
    fornecedor: x.nomeFornecedor || 'Fornecedor não informado',
    data: x.dataDocumento,
    url: urlSegura(x.urlDocumento),
    valor: (x.valorDocumento || 0) - (x.valorGlosa || 0)
  }));
  const somar = chave => {
    const m = new Map();
    lancamentos.forEach(l => m.set(l[chave], (m.get(l[chave]) || 0) + l.valor));
    return [...m.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
  };
  const porMes = Array.from({ length: 12 }, () => 0);
  lancamentos.forEach(l => { if (l.mes >= 1 && l.mes <= 12) porMes[l.mes - 1] += l.valor; });
  return {
    total: lancamentos.reduce((a, l) => a + l.valor, 0),
    quantidade: lancamentos.length,
    truncado, porMes,
    porTipo: somar('tipo'),
    porFornecedor: somar('fornecedor'),
    maiores: [...lancamentos].sort((a, b) => b.valor - a.valor).slice(0, 8)
  };
}

/* Quantas proposições (só projetos e propostas) o deputado apresentou em cada ano.
   A API devolve o total na última página da lista, por isso basta pedir 1 item por consulta. */
async function contarProjetosAno(id, ano) {
  const r = await getJSON(`/proposicoes?idDeputadoAutor=${id}&siglaTipo=${[...SIGLAS_PROJETO].join(',')}&ano=${ano}&itens=1`);
  const ultima = (r.links || []).find(l => l.rel === 'last');
  if (ultima) return Number((/[?&]pagina=(\d+)/.exec(ultima.href) || [])[1]) || 0;
  return (r.dados || []).length;
}
async function carregarProjetosPorAno(id, deAno, ateAno) {
  const anos = Array.from({ length: ateAno - deAno + 1 }, (_, i) => deAno + i);
  const falhas = [];
  const contagens = await emLotes(anos, 4, async ano => {
    try { return await contarProjetosAno(id, ano); } catch (e) { falhas.push(ano); return null; }
  });
  return { anos: anos.map((ano, i) => ({ ano, n: contagens[i] })), falhas };
}

/* Comissões e outros órgãos de que o deputado participa. */
async function carregarOrgaos(id) {
  const r = await getJSON(`/deputados/${id}/orgaos?itens=100&ordem=DESC&ordenarPor=dataInicio`, { vazioSe404: true });
  return (r.dados || []).map(o => ({ sigla: o.siglaOrgao, nome: o.nomeOrgao, papel: o.titulo, ini: o.dataInicio, fim: o.dataFim }));
}

/* --- Aba Projetos --- */

function montarProjetos(el, { itens, truncado }, { ano }) {
  const grupos = {
    projetos: { rotulo: 'Projetos e propostas', filtro: p => SIGLAS_PROJETO.has(p.siglaTipo) },
    requerimentos: { rotulo: 'Requerimentos e indicações', filtro: p => SIGLAS_REQUERIMENTO.has(p.siglaTipo) },
    outros: { rotulo: 'Emendas, pareceres e outros', filtro: p => !SIGLAS_PROJETO.has(p.siglaTipo) && !SIGLAS_REQUERIMENTO.has(p.siglaTipo) },
    todos: { rotulo: 'Todos', filtro: () => true }
  };
  const contagem = Object.fromEntries(Object.entries(grupos).map(([k, g]) => [k, itens.filter(g.filtro).length]));
  const porSigla = [...itens.reduce((m, p) => m.set(p.siglaTipo, (m.get(p.siglaTipo) || 0) + 1), new Map())]
    .sort((a, b) => b[1] - a[1]);
  const vista = { grupo: contagem.projetos ? 'projetos' : 'todos', busca: '', limite: 40 };

  if (!itens.length) {
    return mostrar(el, html`<h2 class="painel-titulo">Projetos em ${ano}</h2>
      <p class="painel-sub">Nenhuma proposição em que este deputado conste como autor em ${ano}.</p>`);
  }

  // Cada montagem usa um contêiner novo, para os ouvintes de clique não se acumularem.
  const raiz = document.createElement('div');
  el.replaceChildren(raiz);

  mostrar(raiz, html`
    <h2 class="painel-titulo">Proposições em ${ano}</h2>
    <p class="painel-sub">${plural(itens.length, 'proposição apresentada', 'proposições apresentadas')} em ${ano}, como autor ou coautor${truncado ? ' (lista limitada)' : ''}. Inclui requerimentos, emendas, pareceres e destaques, como no total do portal da Câmara.</p>
    <div class="chips" role="group" aria-label="Tipo de proposição">
      ${Object.entries(grupos).map(([k, g]) => html`<button class="chip" type="button" data-grupo="${k}" aria-pressed="false">${g.rotulo}<b>${contagem[k]}</b></button>`)}
    </div>
    <p class="tipos-linha">Por tipo: ${porSigla.map(([s, n], i) => html`${i ? ' · ' : ''}<abbr title="${NOMES_TIPO[s] || s}">${s}</abbr> ${n}`)}</p>
    <label class="campo busca"><span>Buscar no texto</span><input id="busca-prop" type="search" placeholder="Ex.: saúde, educação, imposto" autocomplete="off"></label>
    <p class="contagem" id="contagem-prop" aria-live="polite"></p>
    <ul id="lista-prop"></ul>
    <div class="mais-itens" id="mais-prop"></div>`);

  const lista = $('#lista-prop', raiz);
  const desenhar = () => {
    raiz.querySelectorAll('[data-grupo]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.grupo === vista.grupo)));
    const q = semAcento(vista.busca.trim());
    const filtrados = itens.filter(p => grupos[vista.grupo].filtro(p) && (!q || semAcento(p.ementa).includes(q) || semAcento(nomeProposicao(p)).includes(q)));
    const visiveis = filtrados.slice(0, vista.limite);
    $('#contagem-prop', raiz).textContent = plural(filtrados.length, 'proposição', 'proposições');
    mostrar(lista, filtrados.length ? html`${visiveis.map(p => {
      const longo = (p.ementa || '').length > 240;
      return html`<li class="prop">
        <div class="prop-cab">
          <span class="prop-id">${nomeProposicao(p)}</span>
          <span class="prop-tipo">${NOMES_TIPO[p.siglaTipo] || ''}</span>
          <time class="prop-data">${dataBR(p.dataApresentacao)}</time>
        </div>
        <p class="prop-texto ${longo ? 'curto' : ''}">${p.ementa || 'Sem ementa informada.'}</p>
        <div class="prop-links">
          ${longo ? html`<button class="link-botao" type="button" data-expandir>Ler tudo</button>` : ''}
          <a href="${PORTAL}/propostas-legislativas/${p.id}" target="_blank" rel="noopener">Ver tramitação no portal da Câmara</a>
        </div>
      </li>`;
    })}` : html`<li class="vazio">Nenhuma proposição encontrada.</li>`);
    mostrar($('#mais-prop', raiz), filtrados.length > vista.limite
      ? html`<button class="botao" type="button" data-mais>Mostrar mais (${filtrados.length - vista.limite} restantes)</button>` : html``);
  };

  raiz.addEventListener('click', e => {
    const g = e.target.closest('[data-grupo]');
    if (g) { vista.grupo = g.dataset.grupo; vista.limite = 40; return desenhar(); }
    if (e.target.closest('[data-mais]')) { vista.limite += 40; return desenhar(); }
    const x = e.target.closest('[data-expandir]');
    if (x) {
      const texto = x.closest('.prop').querySelector('.prop-texto');
      const aberto = texto.classList.toggle('curto');
      x.textContent = aberto ? 'Ler tudo' : 'Recolher';
    }
  });
  $('#busca-prop', raiz).addEventListener('input', e => { vista.busca = e.target.value; vista.limite = 40; desenhar(); });
  desenhar();
}

/* --- Aba Presença --- */

function montarPresenca(el, d, { id, ano }) {
  if (!d.total) {
    return mostrar(el, html`<h2 class="painel-titulo">Presença no Plenário em ${ano}</h2>
      <p class="painel-sub">Ainda não há sessões deliberativas encerradas do Plenário em ${ano}.</p>`);
  }
  mostrar(el, html`
    <h2 class="painel-titulo">Presença no Plenário em ${ano}</h2>
    <p class="painel-sub">Sessões deliberativas do Plenário já encerradas no ano.</p>
    <p class="pres-num"><strong>${d.presente}</strong> de ${d.total} sessões <span class="pct">${d.pct}%</span></p>
    <div class="barra" role="img" aria-label="${d.pct}% de presença"><span style="width:${d.pct}%"></span></div>
    <ul class="pres-leg">
      <li><i class="ok"></i>Presença registrada: ${d.presente}</li>
      <li><i class="falta"></i>Sem presença registrada: ${d.ausentes.length}</li>
    </ul>
    ${d.ausentes.length ? html`<details class="datas"><summary>Ver as ${d.ausentes.length} sessões sem presença registrada</summary>
      <ul class="lista-datas">${d.ausentes.map(s => html`<li>${dataBR(s.dataHoraInicio)}</li>`)}</ul></details>` : ''}
    <p class="nota">A Câmara separa as ausências em justificadas e não justificadas. Esta contagem soma as duas, porque a API de dados abertos não traz a justificativa.
      Para suplentes e para quem assumiu o mandato ou se licenciou durante o ano, as sessões fora do período de exercício também aparecem como sem presença.
      A classificação oficial está no <a href="${PORTAL}/deputados/${id}" target="_blank" rel="noopener">portal da Câmara</a>.</p>`);
}

/* --- Aba Gastos --- */

function listaBarras(linhas, maximo) {
  return html`<ul class="hb">${linhas.map(l => html`
    <li class="${l.futuro ? 'futuro' : ''}">
      <span class="hb-rot">${l.rotulo}</span>
      <span class="hb-barra"><span style="width:${maximo > 0 ? Math.max(0, Math.min(100, (l.valor / maximo) * 100)).toFixed(1) : 0}%"></span></span>
      <span class="hb-valor" title="${fmtBRL.format(l.valor)}">${l.futuro ? '—' : fmtBRL.format(l.valor)}</span>
    </li>`)}</ul>`;
}

function montarGastos(el, d, { id, ano }) {
  if (!d.quantidade) {
    return mostrar(el, html`<h2 class="painel-titulo">Cota parlamentar em ${ano}</h2>
      <p class="painel-sub">Nenhum gasto registrado em ${ano}.</p>`);
  }
  const NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const mesAtual = ano === ANO_ATUAL ? new Date().getMonth() + 1 : 12;
  const meses = d.porMes.map((valor, i) => ({ rotulo: NOMES_MES[i], valor, futuro: i + 1 > mesAtual }));
  const maxMes = Math.max(...meses.map(m => m.valor), 0);
  const tipos = d.porTipo.slice(0, 10).map(t => ({ rotulo: t.nome, valor: t.valor }));
  const resto = d.porTipo.slice(10).reduce((a, t) => a + t.valor, 0);
  if (d.porTipo.length > 10) tipos.push({ rotulo: 'Outras categorias', valor: resto });
  const forn = d.porFornecedor.slice(0, 8).map(f => ({ rotulo: f.nome, valor: f.valor }));

  mostrar(el, html`
    <h2 class="painel-titulo">Cota parlamentar em ${ano}</h2>
    <p class="painel-sub">Verba para despesas do mandato, como passagens, combustível, divulgação e escritório.</p>
    <p class="gasto-total">${fmtBRL.format(d.total)}</p>
    <p class="painel-sub">${plural(d.quantidade, 'lançamento', 'lançamentos')} no ano${d.truncado ? ' (lista limitada)' : ''}.</p>

    <div class="secao"><h3>Por mês</h3>${listaBarras(meses, maxMes)}</div>
    <div class="secao"><h3>Por tipo de despesa</h3>${listaBarras(tipos, Math.max(...tipos.map(t => t.valor), 0))}</div>
    <div class="secao"><h3>Maiores fornecedores</h3>${listaBarras(forn, Math.max(...forn.map(f => f.valor), 0))}</div>
    <div class="secao"><h3>Maiores lançamentos</h3>
      <ul class="lanc">${d.maiores.map(l => html`
        <li>
          <div>
            <div class="lanc-forn">${l.fornecedor}</div>
            <div class="lanc-meta">${l.tipo} · ${dataBR(l.data)}${l.url ? html` · <a href="${l.url}" target="_blank" rel="noopener">ver documento</a>` : ''}</div>
          </div>
          <div class="lanc-valor">${fmtBRL.format(l.valor)}</div>
        </li>`)}</ul>
    </div>
    <p class="nota">Valores líquidos: valor do documento menos glosas (partes que a Câmara não reembolsou). O total confere com o divulgado no
      <a href="${PORTAL}/deputados/${id}" target="_blank" rel="noopener">portal da Câmara</a>.</p>`);
}
