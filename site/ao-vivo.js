'use strict';

/* =====================================================================
   Placar Público — consulta ao vivo à Câmara dos Deputados
   Estas abas do perfil dos deputados federais (Projetos, Votações,
   Presença e Gastos) vêm do aplicativo De Olho na Câmara. Elas consultam
   a API de Dados Abertos da Câmara na hora em que a pessoa abre a aba.
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

/* Votações nominais do Plenário nos últimos 12 meses.
   A API não tem "votos de um deputado". O caminho é: listar as votações do Plenário,
   separar as nominais (a descrição traz o placar, "Sim: 252; Não: 176") e ler os votos
   de cada uma. Isso é feito uma vez e vale para todos os deputados da visita. */
const ouvintesProgresso = new Set();
let textoProgresso = '';
let promessaVotacoes = null;
function informarProgresso(texto) { textoProgresso = texto; ouvintesProgresso.forEach(f => f(texto)); }

function carregarVotacoes() {
  if (promessaVotacoes) return promessaVotacoes;
  promessaVotacoes = (async () => {
    informarProgresso('Buscando as votações do Plenário…');
    const janelas = [];
    let fim = new Date();
    for (let i = 0; i < JANELAS_VOTACOES; i++) {
      const ini = somarDias(fim, -DIAS_JANELA);
      janelas.push([isoDia(ini), isoDia(fim)]);
      fim = somarDias(ini, -1);
    }
    let prontas = 0;
    const listas = await Promise.all(janelas.map(async ([ini, f]) => {
      const r = await buscarTudo(
        `/votacoes?idOrgao=${ID_PLENARIO}&dataInicio=${ini}&dataFim=${f}&ordem=DESC&ordenarPor=dataHoraRegistro`, 8);
      informarProgresso(`Buscando as votações do Plenário… (${++prontas} de ${janelas.length} períodos)`);
      return r.itens;
    }));
    const nominais = [...new Map(listas.flat().filter(v => /\bSim:\s*\d+/.test(v.descricao || '')).map(v => [v.id, v])).values()];
    let lidas = 0, falhas = 0;
    await emLotes(nominais, 6, async v => {
      try {
        const r = await getJSON(`/votacoes/${v.id}/votos`, { vazioSe404: true });
        v.votos = new Map((r.dados || []).map(x => [x.deputado_ && x.deputado_.id, x.tipoVoto]));
      } catch (e) {
        console.error(e);
        falhas++;
        v.votos = new Map();   // fica de fora e é contada no aviso da tela
      }
      informarProgresso(`Lendo os votos de ${nominais.length} votações nominais… (${++lidas} de ${nominais.length})`);
    });
    const comVotos = nominais.filter(v => v.votos.size > 0);
    return {
      falhas,                                              // erro de rede ao ler os votos
      semLista: nominais.length - comVotos.length - falhas, // a API não publicou a lista de votos
      nominais: comVotos.sort((a, b) => (a.dataHoraRegistro < b.dataHoraRegistro ? 1 : -1))
    };
  })();
  promessaVotacoes.catch(() => { promessaVotacoes = null; });
  return promessaVotacoes;
}

const carregarDetalheVotacao = id => getJSON(`/votacoes/${encodeURIComponent(id)}`);
function rotuloRede(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    if (/twitter|x\.com/.test(h)) return 'X (Twitter)';
    if (/instagram/.test(h)) return 'Instagram';
    if (/facebook/.test(h)) return 'Facebook';
    if (/youtube|youtu\.be/.test(h)) return 'YouTube';
    if (/tiktok/.test(h)) return 'TikTok';
    return h;
  } catch (e) { return 'Link'; }
}
function tile(chave, valor, legenda) {
  const el = $(`[data-stat="${chave}"]`);
  if (!el) return;
  $('.stat-valor', el).textContent = valor;
  $('.stat-legenda', el).textContent = legenda;
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

/* --- Aba Votações --- */

const TIPOS_VOTO = {
  Sim: { chave: 'sim', rotulo: 'Sim' },
  'Não': { chave: 'nao', rotulo: 'Não' },
  'Abstenção': { chave: 'abst', rotulo: 'Abstenção' },
  'Obstrução': { chave: 'obstr', rotulo: 'Obstrução' },
  'Artigo 17': { chave: 'art17', rotulo: 'Presidindo a sessão' }
};
const ORDEM_VOTOS = ['sim', 'nao', 'abst', 'obstr', 'art17', 'secreto', 'ausente', 'outro'];
const ROTULO_CHAVE = {
  sim: 'Sim', nao: 'Não', abst: 'Abstenção', obstr: 'Obstrução', art17: 'Presidindo a sessão',
  secreto: 'Voto secreto', ausente: 'Não votou', outro: 'Outro'
};

function classificarVoto(votacao, depId) {
  if (!votacao.votos.has(depId)) return { chave: 'ausente', rotulo: 'Não votou' };
  const t = votacao.votos.get(depId);
  if (t == null) return { chave: 'secreto', rotulo: 'Voto secreto' };
  return TIPOS_VOTO[t] || { chave: 'outro', rotulo: t };
}

async function painelVotacoes(painel, depId, vale) {
  mostrar(painel, html`<p class="progresso" id="progresso">${textoProgresso || 'Preparando a consulta…'}</p>
    <p class="painel-sub">Na primeira vez, a consulta lê os votos de todo o Plenário e leva alguns segundos. Depois, trocar de deputado é imediato.</p>
    ${esqueletoLinhas(5)}`);
  const ouvinte = t => { const p = $('#progresso'); if (p) p.textContent = t; };
  ouvintesProgresso.add(ouvinte);
  try {
    const { nominais, falhas, semLista } = await carregarVotacoes();
    if (!vale()) return;
    montarVotos(painel, Number(depId), nominais, falhas + semLista);
  } catch (e) {
    console.error(e);
    if (vale()) mostrarErro(painel, 'Não foi possível carregar as votações.', () => painelVotacoes(painel, depId, vale));
  } finally {
    ouvintesProgresso.delete(ouvinte);
  }
}

function montarVotos(el, depId, nominais, falhas = 0) {
  if (!nominais.length) {
    return mostrar(el, html`<h2 class="painel-titulo">Votações nominais</h2>
      <p class="painel-sub">Não encontramos votações nominais do Plenário nos últimos 12 meses.</p>`);
  }
  const registros = nominais.map(v => ({ v, voto: classificarVoto(v, depId) }));
  const contagem = {};
  registros.forEach(r => { contagem[r.voto.chave] = (contagem[r.voto.chave] || 0) + 1; });
  const votou = registros.length - (contagem.ausente || 0);
  const chaves = ORDEM_VOTOS.filter(k => contagem[k]);
  const vista = { filtro: 'todos', limite: 25 };
  tile('votacoes', `${votou} de ${registros.length}`, 'votações nominais em que votou (12 meses)');

  const maisAntiga = dataBR(nominais[nominais.length - 1].data);
  const maisNova = dataBR(nominais[0].data);

  const raiz = document.createElement('div');
  el.replaceChildren(raiz);

  mostrar(raiz, html`
    <h2 class="painel-titulo">Como votou nos últimos 12 meses</h2>
    <p class="painel-sub">${plural(registros.length, 'votação nominal', 'votações nominais')} no Plenário, de ${maisAntiga} a ${maisNova}. Votações simbólicas, em que ninguém registra voto individual, não entram.</p>
    <div class="pilha" role="img" aria-label="Distribuição dos votos">
      ${chaves.map(k => html`<span class="cor-${k}" style="flex:${contagem[k]}" title="${ROTULO_CHAVE[k]}: ${contagem[k]}"></span>`)}
    </div>
    <ul class="legenda">${chaves.map(k => html`<li><i class="cor-${k}"></i>${ROTULO_CHAVE[k]} <b>${contagem[k]}</b></li>`)}</ul>
    <div class="chips" role="group" aria-label="Filtrar por voto">
      <button class="chip" type="button" data-voto="todos" aria-pressed="true">Todos<b>${registros.length}</b></button>
      ${chaves.map(k => html`<button class="chip" type="button" data-voto="${k}" aria-pressed="false">${ROTULO_CHAVE[k]}<b>${contagem[k]}</b></button>`)}
    </div>
    <ul id="lista-votos"></ul>
    <div class="mais-itens" id="mais-votos"></div>
    <p class="nota">“Não votou” significa que não há voto registrado dele numa votação em que outros deputados votaram. Pode ser ausência, licença ou mandato ainda não iniciado.
      Nas votações secretas, a API informa quem participou, mas não como votou.
      ${falhas ? ` ${plural(falhas, 'votação nominal ficou de fora', 'votações nominais ficaram de fora')} desta contagem porque a API não trouxe a lista de votos. Por isso o total pode diferir em poucas votações do que o portal da Câmara mostra.` : ''}</p>`);

  const lista = $('#lista-votos', raiz);
  const desenhar = () => {
    raiz.querySelectorAll('[data-voto]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.voto === vista.filtro)));
    const filtrados = registros.filter(r => vista.filtro === 'todos' || r.voto.chave === vista.filtro);
    const visiveis = filtrados.slice(0, vista.limite);
    mostrar(lista, html`${visiveis.map(({ v, voto }) => {
      const m = /^(.*?)\s*(Sim:\s*\d+.*)$/s.exec(v.descricao || '');
      const texto = m ? m[1] : v.descricao;
      const placar = m ? m[2] : '';
      return html`<li class="voto-linha">
        <div>
          <div class="voto-cab"><time>${dataBR(v.data)}</time>${v.aprovacao === 1 ? html`<span>Aprovada</span>` : v.aprovacao === 0 ? html`<span>Rejeitada</span>` : ''}</div>
          <p class="voto-desc">${texto}</p>
          <p class="voto-prop" data-votacao="${v.id}"></p>
          ${placar ? html`<p class="placar">Placar geral: ${placar}</p>` : ''}
        </div>
        <span class="pill v-${voto.chave}">${voto.rotulo}</span>
      </li>`;
    })}`);
    mostrar($('#mais-votos', raiz), filtrados.length > vista.limite
      ? html`<button class="botao" type="button" data-mais>Mostrar mais (${filtrados.length - vista.limite} restantes)</button>` : html``);
    preencherProposicoes(visiveis.map(r => r.v));
  };

  raiz.addEventListener('click', e => {
    const b = e.target.closest('[data-voto]');
    if (b) { vista.filtro = b.dataset.voto; vista.limite = 25; return desenhar(); }
    if (e.target.closest('[data-mais]')) { vista.limite += 25; desenhar(); }
  });
  desenhar();
}

// Depois da lista aparecer, busca qual proposição cada votação trata.
function preencherProposicoes(votacoes) {
  emLotes(votacoes, 5, async v => {
    try {
      const det = (await carregarDetalheVotacao(v.id)).dados || {};
      const p = (det.proposicoesAfetadas || [])[0];
      document.querySelectorAll(`[data-votacao="${v.id}"]`).forEach(no => {
        if (!p || no.dataset.pronto) return;
        no.dataset.pronto = '1';
        const ementa = (p.ementa || '').length > 260 ? `${p.ementa.slice(0, 260)}…` : (p.ementa || '');
        mostrar(no, html`<strong>${nomeProposicao(p)}</strong> · ${ementa}
          <a href="${PORTAL}/propostas-legislativas/${p.id}" target="_blank" rel="noopener">tramitação</a>`);
      });
    } catch (e) { /* o detalhe é opcional; a votação continua visível */ }
  });
}
