'use strict';

/* =====================================================================
   Placar Público — perfis
   Deputado federal: nota + abas ao vivo da Câmara (do De Olho na Câmara).
   Governador e prefeito: nota calculada com as contas do Tesouro Nacional.
   Deputado estadual e vereador: ficha da lista oficial de eleitos (sem nota).
   ===================================================================== */

const ABAS_FED = ['nota', 'projetos', 'votacoes', 'presenca', 'gastos'];
const ROTULO_ABA = { nota: 'Nota', projetos: 'Projetos', votacoes: 'Votações', presenca: 'Presença', gastos: 'Gastos' };

function esqueletoPerfil(voltarHref, voltarTexto) {
  return html`
    <a class="voltar" href="${voltarHref}">${voltarTexto}</a>
    <div class="perfil-topo"><div class="esq" style="width:112px;height:149px"></div><div>${esqueletoLinhas(3)}</div></div>
    ${esqueletoLinhas(4)}`;
}

function naoEncontrado(voltarHref, voltarTexto, quem) {
  mostrar(app, html`<a class="voltar" href="${voltarHref}">${voltarTexto}</a>
    <div class="cartao"><h1>${quem} não encontrado(a)</h1>
      <p>Esta pessoa não está na lista de hoje. Ela pode ter deixado o cargo, ou o endereço pode estar errado.</p></div>`);
}

function fichaHtml(linhas) {
  const validas = linhas.filter(([, v]) => v);
  return validas.length ? html`${validas.map(([r, v]) => html`<div><dt>${r}</dt><dd>${v}</dd></div>`)}` : html``;
}

function cartaoNota(item, totalComNota, textoExtra = '') {
  return html`<section class="nota-perfil" aria-label="Nota">
    ${notaHtml(item.nota, true)}
    <div>
      <h2>${item.nota == null ? 'Sem nota por enquanto' : 'Nota de 0 a 100'}</h2>
      ${item.rank != null ? html`<p><strong class="posicao">${fmtNum.format(item.rank)}º lugar</strong> entre ${fmtNum.format(totalComNota)} com nota${textoExtra}.</p>` : ''}
      ${item.nota == null
        ? html`<p>${item.motivo || 'Não há dados suficientes para calcular a nota.'}</p>`
        : html`<p>A nota resume os critérios abaixo. Ela não mede a qualidade do trabalho e não aponta irregularidade. <a href="#/metodologia">Como é calculada</a>.</p>`}
      ${item.obs ? html`<p>${item.obs}</p>` : ''}
    </div>
  </section>`;
}

/* Lista dos critérios da nota, com a barra, o peso e a frase que explica o número. */
function montarNota(el, item, grupo) {
  const defs = ((DADOS.metodo && DADOS.metodo[grupo] && DADOS.metodo[grupo].componentes) || []);
  const comp = item.comp || [];
  const porK = new Map(comp.map(c => [c.k, c]));
  const linhas = defs.length ? defs : comp.map(c => ({ k: c.k, rotulo: c.k, peso: null }));
  if (!comp.length) {
    return mostrar(el, html`<h2 class="painel-titulo">Como a nota é formada</h2>
      <p class="painel-sub">${item.motivo || 'Não há dados suficientes para mostrar os critérios.'}</p>
      <p class="nota">Veja em <a href="#/metodologia">Metodologia</a> quais critérios entram na nota.</p>`);
  }
  const faltam = linhas.some(d => !porK.has(d.k) || porK.get(d.k).s == null);
  mostrar(el, html`
    <h2 class="painel-titulo">Como a nota é formada</h2>
    <p class="painel-sub">Cada critério vai de 0 a 100. A nota final é a média deles, com os pesos abaixo.</p>
    <ul class="comp-lista">${linhas.map(d => {
      const c = porK.get(d.k);
      const s = c ? c.s : null;
      return html`<li class="comp ${s == null ? 'sem' : ''}">
        <span class="comp-nome">${d.rotulo}${d.peso != null ? html`<span class="comp-peso">peso ${d.peso}%</span>` : ''}</span>
        <span class="comp-nota">${s == null ? 'sem dado' : fmtNota(s)}</span>
        <span class="comp-barra" role="img" aria-label="${s == null ? 'sem dado' : fmtNota(s) + ' de 100'}"><span style="width:${s == null ? 0 : Math.max(0, Math.min(100, s))}%"></span></span>
        <span class="comp-fato">${c && c.f ? c.f : 'Não há este dado para esta pessoa neste período.'}</span>
      </li>`;
    })}</ul>
    ${faltam ? html`<p class="nota">Quando um critério não tem dado, a nota usa só os que existem, mantendo os pesos proporcionais.</p>` : ''}
    <p class="nota">${grupo === 'federais'
      ? 'A nota compara o que o deputado fez no ano com as regras do método. Mede quantidade e cumprimento de deveres, não a qualidade do mandato. Quem assumiu durante o ano é avaliado só pelo período em que esteve no cargo.'
      : 'A nota olha as contas do último ano fechado, que pertencem à administração daquele ano. Não mede saúde, educação, obras ou serviços, e não aponta irregularidade.'}
      Os números vêm de fontes oficiais; veja de onde em <a href="#/fontes">Fontes</a>.</p>`);
}

function avisoEleitos(ano, extra = '') {
  return html`<section class="cartao cartao-aviso">
    <h3>Quem está no cargo hoje?</h3>
    <p>Esta lista vem do TSE e mostra quem foi eleito em ${ano}. Se houve renúncia, cassação, afastamento ou morte depois da eleição, o cargo pode estar com outra pessoa, e isso não aparece aqui. ${extra}</p>
  </section>`;
}

/* ---------- Roteamento dos perfis ---------- */

function viewPerfil(cargo, uf, id, aba, token) {
  if (cargo === 'federais') return viewFederal(id, aba, token);
  if (cargo === 'governadores' || cargo === 'prefeitos') return viewExecutivo(cargo, uf, id, token);
  return viewEleito(cargo, uf, id, token);
}

/* ---------- Governador e prefeito ---------- */

async function viewExecutivo(cargo, uf, id, token) {
  const c = CARGOS[cargo];
  const voltar = [`#/${cargo}`, `← ${c.rotulo}`];
  mostrar(app, esqueletoPerfil(...voltar));
  let dado;
  try {
    dado = await lerArquivo(cargo === 'governadores' ? 'governadores.json' : `prefeitos-${uf}.json`);
  } catch (e) {
    console.error(e);
    if (token === rotaToken) { mostrar(app, html`<div id="erro"></div>`); mostrarErro($('#erro'), 'Não foi possível carregar esta página.', () => viewExecutivo(cargo, uf, id, token)); }
    return;
  }
  if (token !== rotaToken) return;
  const item = dado.itens.find(i => i.id === String(id));
  if (!item) return naoEncontrado(...voltar, c.singular);

  const ehPref = cargo === 'prefeitos';
  document.title = `${item.nome} · Placar Público`;
  const totalNacional = ehPref ? ((DADOS.meta.cargos || {}).prefeitos || {}).comNota : dado.comNota;
  let extra = '';
  if (ehPref && item.rank != null) {
    const doEstado = dado.itens.filter(i => i.nota != null);
    extra = `, e ${fmtNum.format(doEstado.filter(i => i.rank < item.rank).length + 1)}º entre ${fmtNum.format(doEstado.length)} em ${uf}`;
  }
  const lugar = ehPref ? `${item.municipio}/${uf}` : NOMES_UF[uf] || uf;

  mostrar(app, html`
    <a class="voltar" href="${voltar[0]}">${voltar[1]}</a>
    <header class="perfil-topo">
      ${avatarHtml(item)}
      <div>
        <h1 class="perfil-nome">${item.nome}</h1>
        ${item.urna && item.urna !== item.nome ? html`<p class="perfil-civil">Nome de urna: ${item.urna}</p>` : ''}
        <div class="etiquetas">
          <span class="etq">${item.partido || 'Sem partido'}</span>
          <span class="etq">${c.singular} de ${lugar}</span>
          ${item.situacao ? html`<span class="etq neutra">${item.situacao} em ${dado.ano ?? ''}</span>` : ''}
        </div>
      </div>
    </header>
    <dl class="ficha">${fichaHtml([
      ['Idade', item.idade ? `${item.idade} anos` : ''],
      ['Escolaridade', item.instrucao],
      ['Ocupação declarada', item.ocupacao],
      ['População', item.populacao ? fmtNum.format(item.populacao) + ' habitantes' : '']
    ])}</dl>
    ${cartaoNota(item, totalNacional, extra)}
    <section class="painel" id="painel"></section>
    ${avisoEleitos(dado.ano ?? '', dado.exercicio ? `As contas usadas na nota são do exercício de ${dado.exercicio}, o último ano fechado no Tesouro Nacional.` : '')}`);
  montarNota($('#painel'), item, 'executivos');
}

/* ---------- Deputado estadual e vereador (sem nota) ---------- */

async function viewEleito(cargo, uf, id, token) {
  const c = CARGOS[cargo];
  const voltar = [`#/${cargo}`, `← ${c.rotulo}`];
  mostrar(app, esqueletoPerfil(...voltar));
  let dado;
  try { dado = await lerArquivo(`${cargo}-${uf}.json`); } catch (e) {
    console.error(e);
    if (token === rotaToken) { mostrar(app, html`<div id="erro"></div>`); mostrarErro($('#erro'), 'Não foi possível carregar esta página.', () => viewEleito(cargo, uf, id, token)); }
    return;
  }
  if (token !== rotaToken) return;
  const item = dado.itens.find(i => i.id === String(id));
  if (!item) return naoEncontrado(...voltar, c.singular);
  document.title = `${item.nome} · Placar Público`;
  const lugar = item.municipio ? `${item.municipio}/${uf}` : (NOMES_UF[uf] || uf);

  mostrar(app, html`
    <a class="voltar" href="${voltar[0]}">${voltar[1]}</a>
    <header class="perfil-topo">
      ${avatarHtml(item)}
      <div>
        <h1 class="perfil-nome">${item.nome}</h1>
        ${item.urna && item.urna !== item.nome ? html`<p class="perfil-civil">Nome de urna: ${item.urna}</p>` : ''}
        <div class="etiquetas">
          <span class="etq">${item.partido || 'Sem partido'}</span>
          <span class="etq">${c.singular} · ${lugar}</span>
          ${item.situacao ? html`<span class="etq neutra">${item.situacao} em ${dado.ano}</span>` : ''}
        </div>
      </div>
    </header>
    <dl class="ficha">${fichaHtml([
      ['Idade', item.idade ? `${item.idade} anos` : ''],
      ['Escolaridade', item.instrucao],
      ['Ocupação declarada', item.ocupacao]
    ])}</dl>
    <section class="nota-perfil" aria-label="Nota">
      ${notaHtml(null, true)}
      <div>
        <h2>Sem nota por enquanto</h2>
        <p>${POR_QUE_SEM_NOTA[cargo]}</p>
      </div>
    </section>
    ${avisoEleitos(dado.ano)}`);
}

/* ---------- Deputado federal ---------- */

async function viewFederal(id, abaInicial, token) {
  const voltar = ['#/federais', '← Deputados federais'];
  document.title = 'Placar Público';
  mostrar(app, esqueletoPerfil(...voltar));
  let dado;
  try { dado = await lerArquivo('federais.json'); } catch (e) {
    console.error(e);
    if (token === rotaToken) { mostrar(app, html`<div id="erro"></div>`); mostrarErro($('#erro'), 'Não foi possível carregar os dados.', () => viewFederal(id, abaInicial, token)); }
    return;
  }
  if (token !== rotaToken) return;
  const item = dado.itens.find(i => i.id === String(id));
  if (!item) return naoEncontrado(...voltar, 'Deputado(a)');

  const demo = DADOS.demo;
  const abas = demo ? ['nota'] : ABAS_FED;
  document.title = `${item.nome} · Placar Público`;

  mostrar(app, html`
    <a class="voltar" href="${voltar[0]}">${voltar[1]}</a>
    <header class="perfil-topo">
      ${avatarHtml(item)}
      <div>
        <h1 class="perfil-nome">${item.nome}</h1>
        <div class="etiquetas">
          <span class="etq">${item.partido || 'Sem partido'}</span>
          <span class="etq">${item.uf}</span>
          <span class="etq neutra">Deputado(a) federal</span>
        </div>
        ${demo ? '' : html`<p class="perfil-link"><a href="${PORTAL}/deputados/${id}" target="_blank" rel="noopener">Perfil completo no portal da Câmara</a></p>`}
      </div>
    </header>
    <dl class="ficha" id="ficha" hidden></dl>
    ${cartaoNota(item, dado.comNota)}
    ${demo ? html`<section class="cartao cartao-aviso"><h3>Abas ao vivo desligadas</h3>
      <p>Na versão real, este perfil também tem as abas Projetos, Votações, Presença e Gastos, consultadas na hora à Câmara dos Deputados. No modo demonstração elas ficam desligadas porque os deputados são inventados.</p></section>` : html`
    <section class="numeros" aria-label="Resumo ao vivo">
      <a class="stat" href="#/federais/${id}/projetos" data-stat="projetos"><span class="stat-rotulo">Projetos</span><span class="stat-valor">…</span><span class="stat-legenda"></span></a>
      <a class="stat" href="#/federais/${id}/votacoes" data-stat="votacoes"><span class="stat-rotulo">Votações nominais</span><span class="stat-valor">Ver</span><span class="stat-legenda">como votou nos últimos 12 meses</span></a>
      <a class="stat" href="#/federais/${id}/presenca" data-stat="presenca"><span class="stat-rotulo">Presença no Plenário</span><span class="stat-valor">…</span><span class="stat-legenda"></span></a>
      <a class="stat" href="#/federais/${id}/gastos" data-stat="gastos"><span class="stat-rotulo">Cota parlamentar</span><span class="stat-valor">…</span><span class="stat-legenda"></span></a>
    </section>`}
    <div class="barra-abas">
      <nav class="abas" role="tablist" aria-label="Seções do perfil">
        ${abas.map(a => html`<a class="aba" role="tab" href="#/federais/${id}/${a}" data-aba="${a}">${ROTULO_ABA[a]}</a>`)}
      </nav>
      <label class="seletor-ano" id="seletor-ano"><span>Ano</span>
        <select id="ano">${Array.from({ length: ANO_ATUAL - PRIMEIRO_ANO + 1 }, (_, i) => ANO_ATUAL - i).map(a =>
          html`<option value="${a}" ${a === estado.ano ? 'selected' : ''}>${a}</option>`)}</select>
      </label>
    </div>
    <section class="painel" id="painel" role="tabpanel" aria-live="polite"></section>`);

  /* Dados de cadastro, só na versão real. A ficha completa (/deputados/{id}) a Câmara às vezes
     não libera para páginas de outros endereços (CORS), então ela é um extra: se falhar, o perfil
     continua inteiro. */
  if (!demo) {
    Promise.allSettled([
      getJSON(`/deputados?id=${id}`).then(r => (r.dados || [])[0]),
      getJSON(`/deputados/${id}`, { repetir: false }).then(r => r.dados)
    ]).then(([rb, rf]) => {
      if (token !== rotaToken) return;
      const base = rb.status === 'fulfilled' ? rb.value : null;
      const ficha = rf.status === 'fulfilled' ? rf.value : null;
      const st = (ficha && ficha.ultimoStatus) || {};
      const gab = st.gabinete || {};
      const email = gab.email || st.email || (base && base.email) || '';
      const redes = [...((ficha && ficha.redeSocial) || []), ficha && ficha.urlWebsite].filter(u => urlSegura(u));
      const nasc = ficha ? dataBR(ficha.dataNascimento) : '';
      const el = $('#ficha');
      if (!el) return;
      const conteudo = html`${fichaHtml([
        ['Nome civil', ficha && ficha.nomeCivil],
        ['Nascimento', nasc ? `${nasc}${ficha.municipioNascimento ? ` · ${ficha.municipioNascimento}/${ficha.ufNascimento}` : ''}` : ''],
        ['Escolaridade', ficha && ficha.escolaridade],
        ['Gabinete', gab.sala ? `Sala ${gab.sala}, prédio ${gab.predio || '-'}${gab.telefone ? ` · tel. (61) ${gab.telefone}` : ''}` : ''],
        ['E-mail', email]
      ])}${redes.length ? html`<div><dt>Redes e site</dt><dd class="redes">${redes.map(u => html`<a href="${u}" target="_blank" rel="noopener">${rotuloRede(u)}</a>`)}</dd></div>` : ''}`;
      mostrar(el, conteudo);
      el.hidden = !el.children.length;
    });
  }

  const vivo = () => token === rotaToken;
  let aba = abas.includes(abaInicial) ? abaInicial : 'nota';
  let tokenPainel = 0;
  const dados = {};

  const marcarAba = () => {
    $$('.aba').forEach(el => el.setAttribute('aria-selected', String(el.dataset.aba === aba)));
    $$('.stat[data-stat]').forEach(el => el.setAttribute('aria-current', String(el.dataset.stat === aba)));
    $('#seletor-ano').hidden = demo || aba === 'votacoes' || aba === 'nota';
  };

  const iniciarAno = () => {
    if (demo) return;
    const ano = estado.ano;
    const ainda = () => vivo() && ano === estado.ano;
    tile('projetos', '…', `proposições em ${ano}`);
    tile('presenca', '…', 'sessões deliberativas');
    tile('gastos', '…', `gasto em ${ano}`);

    dados.projetos = carregarProjetos(id, ano);
    dados.presenca = carregarPresenca(id, ano);
    dados.gastos = carregarGastos(id, ano);

    dados.projetos.then(d => {
      if (!ainda()) return;
      const n = d.itens.filter(p => SIGLAS_PROJETO.has(p.siglaTipo)).length;
      tile('projetos', fmtNum.format(d.itens.length) + (d.truncado ? '+' : ''), `em ${ano} · ${plural(n, 'projeto ou proposta', 'projetos e propostas')}`);
    }).catch(() => ainda() && tile('projetos', '—', 'não foi possível carregar'));

    dados.presenca.then(d => {
      if (!ainda()) return;
      if (!d.total) return tile('presenca', '—', `sem sessões deliberativas em ${ano}`);
      tile('presenca', `${d.presente} de ${d.total}`, `${d.pct}% · ${plural(d.ausentes.length, 'sessão sem presença', 'sessões sem presença')}`);
    }).catch(() => ainda() && tile('presenca', '—', 'não foi possível carregar'));

    dados.gastos.then(d => {
      if (!ainda()) return;
      tile('gastos', fmtBRL.format(d.total), `gasto em ${ano}`);
    }).catch(() => ainda() && tile('gastos', '—', 'não foi possível carregar'));
  };

  const mostrarAba = async () => {
    const meu = ++tokenPainel;
    const ano = estado.ano;
    const painel = $('#painel');
    const vale = () => vivo() && meu === tokenPainel && (aba === 'votacoes' || aba === 'nota' || ano === estado.ano);
    marcarAba();

    if (aba === 'nota') return montarNota(painel, item, 'federais');
    if (aba === 'votacoes') return painelVotacoes(painel, id, vale);

    mostrar(painel, esqueletoLinhas(6));
    try {
      const d = await dados[aba];
      if (!vale()) return;
      ({ projetos: montarProjetos, presenca: montarPresenca, gastos: montarGastos })[aba](painel, d, { id, ano });
    } catch (e) {
      console.error(e);
      if (vale()) mostrarErro(painel, 'Não foi possível carregar esta seção.', () => { iniciarAno(); mostrarAba(); });
    }
  };

  $('#ano').addEventListener('change', e => {
    estado.ano = Number(e.target.value);
    salvarAno(estado.ano);
    iniciarAno();
    mostrarAba();
  });

  perfilAtual = {
    chave: `federais/${id}`,
    trocarAba(nova) { aba = abas.includes(nova) ? nova : 'nota'; mostrarAba(); }
  };
  iniciarAno();
  mostrarAba();
}
