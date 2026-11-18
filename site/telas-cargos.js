'use strict';

/* =====================================================================
   Placar Público — telas dos cargos
   Faixas de aviso, abas de cargo, ranking (maiores e menores notas,
   lista completa com filtros) e a lista dos cargos que ainda não têm nota.
   ===================================================================== */

/* ---------- Faixas de aviso (modo demonstração, falha de atualização) ---------- */

function montarFaixas() {
  const el = $('#faixas');
  if (!el) return;
  const partes = [];
  if (DADOS.demo) {
    const porque = DADOS.motivoDemo === 'arquivo-local'
      ? 'Você abriu o site direto do computador, e assim os arquivos de dados reais não podem ser lidos.'
      : 'Os arquivos de dados reais ainda não foram gerados neste endereço.';
    partes.push(html`<div class="faixa faixa-demo" role="status"><div class="cx">
      <strong>Modo demonstração:</strong> nomes, notas e números inventados, só para mostrar como o site funciona. ${porque}
      <a href="#/fontes">Como ver os dados reais</a>.</div></div>`);
  } else {
    const f = (DADOS.meta && DADOS.meta.fontes) || {};
    const nomes = { camara: 'Câmara dos Deputados', tse: 'TSE (lista de eleitos)', siconfi: 'Tesouro Nacional (contas públicas)' };
    const falhas = Object.entries(nomes).filter(([k]) => f[k] && f[k].ok === false);
    if (falhas.length) {
      partes.push(html`<div class="faixa" role="status"><div class="cx">
        <strong>Atenção:</strong> a última atualização falhou para ${falhas.map(([k, n], i) => html`${i ? ', ' : ''}${n}${f[k].atualizadoEm ? ` (últimos dados bons: ${dataHoraBR(f[k].atualizadoEm)})` : ''}`)}.
        O site continua mostrando os dados anteriores. <a href="#/fontes">Detalhes</a></div></div>`);
    }
    const camara = f.camara && f.camara.atualizadoEm;
    if (camara && Date.now() - new Date(camara).getTime() > 3 * 86400000 && !falhas.some(([k]) => k === 'camara')) {
      partes.push(html`<div class="faixa" role="status"><div class="cx"><strong>Atenção:</strong> os dados da Câmara não são atualizados desde ${dataHoraBR(camara)}.</div></div>`);
    }
  }
  mostrar(el, html`${partes}`);
}

/* ---------- Abas de cargo ---------- */

function abasCargos(atual) {
  const metaCargos = (DADOS.meta && DADOS.meta.cargos) || {};
  return html`<nav class="cargos" aria-label="Cargos">${ORDEM_CARGOS.map(k => {
    const c = CARGOS[k];
    const total = metaCargos[k] && metaCargos[k].total;
    return html`<a class="cargo-aba" href="#/${k}" aria-current="${k === atual ? 'page' : 'false'}">
      <span class="cargo-nome">${c.rotulo}</span>
      <span class="cargo-info">${total != null ? fmtNum.format(total) : '—'} · ${c.nota ? 'com nota' : 'sem nota ainda'}</span>
    </a>`;
  })}</nav>`;
}

function cabecalhoCargo(cargo, inicio) {
  const c = CARGOS[cargo];
  return html`
    <section class="hero">
      <h1>${inicio ? 'Placar Público' : c.rotulo}</h1>
      <p>${inicio
        ? 'A nota de quem legisla e governa o Brasil, calculada só com dados oficiais abertos. Escolha o cargo.'
        : c.lead}</p>
    </section>
    ${abasCargos(cargo)}`;
}

/* ---------- Pessoas nas listas ---------- */

const linkItem = (cargo, it) => (cargo === 'federais' ? `#/federais/${it.id}` : `#/${cargo}/${it.uf}/${it.id}`);
const cmpNome = (a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR');

function avatarHtml(it) {
  const foto = urlSegura(it.foto);
  if (foto) return html`<img class="foto" loading="lazy" alt="" src="${foto}" data-ini="${iniciais(it.nome)}">`;
  return html`<span class="avatar" aria-hidden="true">${iniciais(it.nome)}</span>`;
}

const metaPessoa = it => `${it.partido || 'Sem partido'} · ${it.municipio ? it.municipio + '/' : ''}${it.uf}`;

function linhaRank(cargo, it) {
  return html`<li><a class="linha-rank ${it.nota == null ? 'sem-nota' : ''}" href="${linkItem(cargo, it)}">
    <span class="pos">${it.rank != null ? fmtNum.format(it.rank) : '–'}</span>
    ${avatarHtml(it)}
    <span><span class="rank-nome">${it.nome}</span><br><span class="rank-meta">${metaPessoa(it)}</span></span>
    ${notaHtml(it.nota)}
  </a></li>`;
}

/* ---------- Tela de um cargo ---------- */

async function viewCargo(cargo, token, inicio) {
  const c = CARGOS[cargo];
  document.title = inicio ? 'Placar Público' : `${c.rotulo} · Placar Público`;
  mostrar(app, html`${cabecalhoCargo(cargo, inicio)}
    <div class="resumo-cargo">${Array.from({ length: 4 }, () => html`<div class="esq esq-card"></div>`)}</div>
    ${esqueletoLinhas(6)}`);

  const arquivo = { federais: 'federais.json', governadores: 'governadores.json', prefeitos: 'ranking-prefeitos.json' }[cargo];
  let dados = null;
  if (arquivo) {
    try { dados = await lerArquivo(arquivo); } catch (e) {
      console.error(e);
      if (token === rotaToken) mostrar(app, html`${cabecalhoCargo(cargo, inicio)}<div id="erro"></div>`);
      if (token === rotaToken) mostrarErro($('#erro'), 'Ainda não há dados deste cargo.', () => viewCargo(cargo, token, inicio));
      return;
    }
  }
  if (token !== rotaToken) return;

  if (c.nota) montarCargoComNota(cargo, dados, inicio);
  else montarCargoSemNota(cargo, inicio, token);
}

function resumoCargo(cargo, dados) {
  const m = ((DADOS.meta.cargos || {})[cargo]) || {};
  const f = DADOS.meta.fontes || {};
  const fonte = cargo === 'federais' ? f.camara : f.siconfi;
  const quando = fonte && fonte.atualizadoEm ? dataHoraBR(fonte.atualizadoEm) : '—';
  const total = dados.total ?? m.total;
  const comNota = dados.comNota ?? m.comNota;
  const base = cargo === 'federais'
    ? { rotulo: `Dados de ${dados.ano}`, legenda: `Câmara dos Deputados · atualizado ${quando}` }
    : { rotulo: `Contas de ${dados.exercicio ?? '—'}`, legenda: `Tesouro Nacional · atualizado ${quando}` };
  return html`<section class="resumo-cargo" aria-label="Resumo">
    <div class="stat"><span class="stat-rotulo">${cargo === 'federais' ? 'Deputados' : 'Eleitos'}</span><span class="stat-valor">${fmtNum.format(total)}</span><span class="stat-legenda">${cargo === 'federais' ? 'em exercício hoje' : `eleitos em ${dados.ano ?? '—'}`}</span></div>
    <div class="stat"><span class="stat-rotulo">Com nota</span><span class="stat-valor">${fmtNum.format(comNota)}</span><span class="stat-legenda">${total - comNota ? `${fmtNum.format(total - comNota)} sem dados suficientes` : 'todos'}</span></div>
    <div class="stat"><span class="stat-rotulo">Nota média</span><span class="stat-valor">${fmtNota(m.media)}</span><span class="stat-legenda">de 0 a 100</span></div>
    <div class="stat"><span class="stat-rotulo">${base.rotulo}</span><span class="stat-valor">${quando.split(/[ ,]/)[0] || '—'}</span><span class="stat-legenda">${base.legenda}</span></div>
  </section>`;
}

function montarCargoComNota(cargo, dados, inicio) {
  const itens = dados.itens;
  const rankeados = itens.filter(i => i.nota != null).sort((a, b) => a.rank - b.rank);
  const n = Math.min(10, Math.floor(rankeados.length / 2));
  const top = rankeados.slice(0, n);
  const fundo = rankeados.slice(rankeados.length - n).reverse();
  const c = CARGOS[cargo];

  mostrar(app, html`${cabecalhoCargo(cargo, inicio)}
    ${resumoCargo(cargo, dados)}
    ${n ? html`<section class="destaques" aria-label="Maiores e menores notas">
      <div class="quadro quadro-alta">
        <h2>Maiores notas</h2>
        <p>As ${n} primeiras posições entre ${fmtNum.format(rankeados.length)} com nota.</p>
        <ul class="lista-rank">${top.map(i => linhaRank(cargo, i))}</ul>
      </div>
      <div class="quadro quadro-baixa">
        <h2>Menores notas</h2>
        <p>As ${n} últimas posições. Nota baixa não é acusação: <a href="#/metodologia">veja o que ela mede</a>.</p>
        <ul class="lista-rank">${fundo.map(i => linhaRank(cargo, i))}</ul>
      </div>
    </section>` : ''}
    <section aria-label="Ranking completo">
      <div class="ranking-topo"><h2>Ranking completo</h2><span class="contagem" id="r-contagem" aria-live="polite"></span></div>
      <div class="filtros filtros-rank">
        <label class="campo"><span>${cargo === 'prefeitos' ? 'Nome ou município' : 'Nome'}</span>
          <input id="r-busca" type="search" placeholder="Digite parte do nome" autocomplete="off"></label>
        <label class="campo"><span>Estado</span>
          <select id="r-uf"><option value="">Todos</option>${UFS.map(u => html`<option value="${u}">${u}</option>`)}</select></label>
        <label class="campo"><span>Partido</span>
          <select id="r-partido"><option value="">Todos</option>${[...new Set(itens.map(i => i.partido).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(p => html`<option value="${p}">${p}</option>`)}</select></label>
        <label class="campo"><span>Ordem</span>
          <select id="r-ordem">
            <option value="maior">Maior nota primeiro</option>
            <option value="menor">Menor nota primeiro</option>
            <option value="nome">Nome (A a Z)</option>
          </select></label>
      </div>
      <ul class="lista-rank" id="r-lista"></ul>
      <div class="mais-linha" id="r-mais"></div>
      <p class="nota">${c.singular === 'Deputado federal'
        ? 'Quem aparece sem nota não tem dados suficientes no ano (por exemplo, assumiu o mandato há poucas semanas). Abra o perfil para ver o motivo.'
        : 'Quem aparece sem nota não tem relatórios fiscais do último ano fechado no Tesouro Nacional, ou o município não foi encontrado na base. Abra o perfil para ver o motivo.'}
        A lista de eleitos vem do TSE e não registra substituições depois da eleição. <a href="#/metodologia">Como a nota é calculada</a>.</p>
    </section>`);

  const f = estado.filtros[cargo] || (estado.filtros[cargo] = { busca: '', uf: '', partido: '', ordem: 'maior', limite: 50 });
  $('#r-busca').value = f.busca;
  $('#r-uf').value = f.uf;
  $('#r-partido').value = f.partido;
  $('#r-ordem').value = f.ordem;

  const ORDENS = {
    maior: (a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || cmpNome(a, b),
    menor: (a, b) => ((a.nota == null) - (b.nota == null)) || (b.rank ?? 0) - (a.rank ?? 0) || cmpNome(a, b),
    nome: cmpNome
  };
  const desenhar = () => {
    const q = semAcento(f.busca.trim());
    const lista = itens.filter(i =>
      (!q || semAcento(i.nome).includes(q) || semAcento(i.municipio || '').includes(q)) &&
      (!f.uf || i.uf === f.uf) && (!f.partido || i.partido === f.partido)).sort(ORDENS[f.ordem]);
    const visiveis = lista.slice(0, f.limite);
    $('#r-contagem').textContent = lista.length === itens.length
      ? `${fmtNum.format(lista.length)} no total`
      : plural(lista.length, 'resultado', 'resultados');
    mostrar($('#r-lista'), visiveis.length ? html`${visiveis.map(i => linhaRank(cargo, i))}` : html`<li class="vazio">Ninguém encontrado com esses filtros.</li>`);
    mostrar($('#r-mais'), lista.length > f.limite
      ? html`<button class="botao" type="button" data-mais>Mostrar mais (${fmtNum.format(lista.length - f.limite)} restantes)</button>` : html``);
  };
  $('#r-busca').addEventListener('input', e => { f.busca = e.target.value; f.limite = 50; desenhar(); });
  $('#r-uf').addEventListener('change', e => { f.uf = e.target.value; f.limite = 50; desenhar(); });
  $('#r-partido').addEventListener('change', e => { f.partido = e.target.value; f.limite = 50; desenhar(); });
  $('#r-ordem').addEventListener('change', e => { f.ordem = e.target.value; f.limite = 50; desenhar(); });
  $('#r-mais').addEventListener('click', e => { if (e.target.closest('[data-mais]')) { f.limite += 100; desenhar(); } });
  desenhar();
}

/* ---------- Cargos sem nota: lista oficial de eleitos ---------- */

const POR_QUE_SEM_NOTA = {
  estaduais: 'Ainda não existe uma fonte única e padronizada com presença, votos e projetos dos parlamentos dos 27 estados. Cada assembleia publica seus dados de um jeito, e algumas quase não publicam. Uma nota só é justa se o critério for o mesmo para todos, então por enquanto o Placar Público mostra apenas a lista oficial de eleitos.',
  vereadores: 'São mais de cinco mil câmaras municipais, cada uma com seu sistema e seu jeito de publicar presença, votos e projetos. Não há uma fonte nacional padronizada. Uma nota só é justa se o critério for o mesmo para todos, então por enquanto o Placar Público mostra apenas a lista oficial de eleitos.'
};

async function montarCargoSemNota(cargo, inicio, token) {
  const c = CARGOS[cargo];
  const ehVereador = cargo === 'vereadores';
  mostrar(app, html`${cabecalhoCargo(cargo, inicio)}
    <section class="cartao" aria-label="Por que ainda não há nota">
      <h2>Por que ainda não há nota <span class="em-breve">em estudo</span></h2>
      <p>${POR_QUE_SEM_NOTA[cargo]}</p>
      <p>Quando houver dados oficiais comparáveis, a nota entra com o mesmo método descrito em <a href="#/metodologia">Metodologia</a>.</p>
    </section>
    <section class="secao" aria-label="Lista de eleitos">
      <h2 class="painel-titulo">${ehVereador ? 'Vereadores eleitos' : 'Deputados estaduais eleitos'}</h2>
      <div class="filtros filtros-auto">
        <label class="campo"><span>Estado</span>
          <select id="s-uf">${UFS.filter(u => !(ehVereador && u === 'DF')).map(u => html`<option value="${u}" ${u === estado.uf ? 'selected' : ''}>${u} · ${NOMES_UF[u]}</option>`)}</select></label>
        ${ehVereador ? html`<label class="campo"><span>Município</span><select id="s-mun"><option value="">Escolha um município</option></select></label>` : ''}
        <label class="campo"><span>Nome</span><input id="s-busca" type="search" placeholder="Digite parte do nome" autocomplete="off"></label>
        <label class="campo"><span>Partido</span><select id="s-partido"><option value="">Todos</option></select></label>
      </div>
      <p class="contagem" id="s-contagem" aria-live="polite"></p>
      <div id="s-corpo">${esqueletoLinhas(4)}</div>
      <div class="mais-linha" id="s-mais"></div>
      <p class="nota" id="s-nota"></p>
    </section>`);

  const vista = { uf: ehVereador && estado.uf === 'DF' ? 'SP' : estado.uf, mun: '', busca: '', partido: '', limite: 60, dado: null };
  const vivo = () => token === rotaToken;

  async function carregarUf() {
    mostrar($('#s-corpo'), esqueletoLinhas(4));
    $('#s-contagem').textContent = '';
    try {
      vista.dado = await lerArquivo(`${cargo}-${vista.uf}.json`);
    } catch (e) {
      if (!vivo()) return;
      vista.dado = null;
      mostrar($('#s-corpo'), html`<p class="vazio">Ainda não há a lista deste estado. Ela aparece depois da próxima atualização diária.</p>`);
      return;
    }
    if (!vivo()) return;
    const itens = vista.dado.itens;
    const partidos = [...new Set(itens.map(i => i.partido).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    mostrar($('#s-partido'), html`<option value="">Todos</option>${partidos.map(p => html`<option value="${p}">${p}</option>`)}`);
    vista.partido = '';
    if (ehVereador) {
      const muns = [...new Set(itens.map(i => i.municipio))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      mostrar($('#s-mun'), html`<option value="">Escolha um município (${fmtNum.format(muns.length)})</option>${muns.map(m => html`<option value="${m}">${m}</option>`)}`);
      vista.mun = '';
    }
    mostrar($('#s-nota'), html`A lista vem do TSE e mostra quem foi eleito em ${vista.dado.ano}. Substituições depois da eleição (suplentes que assumiram, renúncias, cassações) não aparecem.`);
    desenhar();
  }

  function desenhar() {
    if (!vista.dado) return;
    const q = semAcento(vista.busca.trim());
    const exigeFiltro = ehVereador && !vista.mun && q.length < 3;
    if (exigeFiltro) {
      $('#s-contagem').textContent = '';
      mostrar($('#s-corpo'), html`<p class="vazio">Escolha um município ou digite pelo menos 3 letras do nome.</p>`);
      mostrar($('#s-mais'), html``);
      return;
    }
    const lista = vista.dado.itens.filter(i =>
      (!vista.mun || i.municipio === vista.mun) && (!vista.partido || i.partido === vista.partido) &&
      (!q || semAcento(i.nome).includes(q) || semAcento(i.urna || '').includes(q)));
    const visiveis = lista.slice(0, vista.limite);
    $('#s-contagem').textContent = plural(lista.length, 'eleito', 'eleitos');
    mostrar($('#s-corpo'), visiveis.length ? html`<ul class="eleitos">${visiveis.map(i => html`<li>
        <a class="eleito" href="#/${cargo}/${i.uf}/${i.id}">
          <span class="avatar" aria-hidden="true">${iniciais(i.nome)}</span>
          <span class="rank-nome">${i.nome}</span>
          <span class="rank-meta">${i.partido || 'Sem partido'}${i.municipio ? ' · ' + i.municipio : ''}</span>
        </a></li>`)}</ul>` : html`<p class="vazio">Ninguém encontrado com esses filtros.</p>`);
    mostrar($('#s-mais'), lista.length > vista.limite
      ? html`<button class="botao" type="button" data-mais>Mostrar mais (${fmtNum.format(lista.length - vista.limite)} restantes)</button>` : html``);
  }

  $('#s-uf').addEventListener('change', e => { vista.uf = e.target.value; estado.uf = vista.uf; salvarPref('uf', vista.uf); vista.limite = 60; carregarUf(); });
  if (ehVereador) $('#s-mun').addEventListener('change', e => { vista.mun = e.target.value; vista.limite = 60; desenhar(); });
  $('#s-busca').addEventListener('input', e => { vista.busca = e.target.value; vista.limite = 60; desenhar(); });
  $('#s-partido').addEventListener('change', e => { vista.partido = e.target.value; vista.limite = 60; desenhar(); });
  $('#s-mais').addEventListener('click', e => { if (e.target.closest('[data-mais]')) { vista.limite += 120; desenhar(); } });
  $('#s-uf').value = vista.uf;
  carregarUf();
}
