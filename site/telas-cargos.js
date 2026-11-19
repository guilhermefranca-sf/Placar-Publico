'use strict';

/* =====================================================================
   Placar Público — Início
   Menus, faixas de aviso, escolha do cargo, destaques e lista de pessoas
   com o anel do índice. Cargos sem índice (deputados estaduais e
   vereadores) mostram a lista oficial de eleitos.
   ===================================================================== */

/* ---------- Menus (topo no computador, embaixo no celular) ---------- */

const MENU_TOPO = [['inicio', '#/', 'Início'], ['comparar', '#/comparar', 'Comparar'], ['noticias', '#/noticias', 'Notícias'], ['metodologia', '#/metodologia', 'Metodologia'], ['fontes', '#/fontes', 'Fontes']];
const MENU_BAIXO = [['inicio', '#/', 'Início', 'inicio'], ['comparar', '#/comparar', 'Comparar', 'comparar'], ['noticias', '#/noticias', 'Notícias', 'noticias'], ['mais', '#/mais', 'Mais', 'mais']];

function montarMenus() {
  mostrar($('#menu-topo'), html`${MENU_TOPO.map(([k, href, rot]) => html`<a href="${href}" data-menu="${k}" aria-current="false">${rot}</a>`)}`);
  mostrar($('#menu-baixo'), html`${MENU_BAIXO.map(([k, href, rot, ic]) => html`<a href="${href}" data-menu="${k}" aria-current="false">${icone(ic, 24)}<span>${rot}</span></a>`)}`);
}

function marcarMenu(chave) {
  const baixo = ['metodologia', 'fontes'].includes(chave) ? 'mais' : chave;
  $$('#menu-topo a').forEach(a => a.setAttribute('aria-current', a.dataset.menu === chave ? 'page' : 'false'));
  $$('#menu-baixo a').forEach(a => a.setAttribute('aria-current', a.dataset.menu === baixo ? 'page' : 'false'));
}

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
      <strong>Modo demonstração:</strong> nomes, índices e números inventados, só para mostrar como o site funciona. ${porque}
      <a href="#/fontes">Como ver os dados reais</a>.</div></div>`);
  } else {
    const f = (DADOS.meta && DADOS.meta.fontes) || {};
    const nomes = { camara: 'Câmara dos Deputados', tse: 'TSE (lista de eleitos)', siconfi: 'Tesouro Nacional (contas públicas)', historico: 'Câmara (histórico de mandatos)' };
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

/* ---------- Pessoas nas listas ---------- */

const linkItem = (cargo, it) => (cargo === 'federais' ? `#/federais/${it.id}` : `#/${cargo}/${it.uf}/${it.id}`);
const cmpNome = (a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR');

function avatarHtml(it) {
  const foto = urlSegura(it.foto);
  if (foto) return html`<img class="foto" loading="lazy" alt="" src="${foto}" data-ini="${iniciais(it.nome)}">`;
  return html`<span class="avatar" aria-hidden="true">${iniciais(it.nome)}</span>`;
}

const metaPessoa = it => `${it.partido || 'Sem partido'} · ${it.municipio ? it.municipio + '/' : ''}${it.uf}`;

function linhaPessoa(cargo, it) {
  return html`<li><a class="pessoa" href="${linkItem(cargo, it)}">
    ${avatarHtml(it)}
    <span class="pessoa-info">
      <span class="pessoa-nome">${it.nome}</span>
      <span class="pessoa-meta">${metaPessoa(it)}</span>
    </span>
    ${anel(it.nota, { tam: 48, esp: 5 })}
    <span class="ico-seta">${icone('seta', 18)}</span>
  </a></li>`;
}

function cartaoDestaque(cargo, it) {
  return html`<li><a class="destaque" href="${linkItem(cargo, it)}">
    <span class="destaque-pos">${it.rank != null ? fmtNum.format(it.rank) + 'º' : ''}</span>
    ${avatarHtml(it)}
    ${anel(it.nota, { tam: 58, esp: 6 })}
    <span class="destaque-nome">${it.nome}</span>
    <span class="destaque-meta">${metaPessoa(it)}</span>
  </a></li>`;
}

/* ---------- Cabeçalho do Início: título e escolha do cargo ---------- */

const CARGOS_EM_BREVE = [['Presidente da República', 'Painel com economia, saúde, educação e segurança do mandato.'], ['Senadores', 'Mesmo painel dos deputados federais, com dados abertos do Senado.'], ['Presidentes da Câmara e do Senado', 'Aba de gestão da Casa: sessões, pauta e resultados.']];

function cabecalhoInicio(cargo) {
  const metaCargos = (DADOS.meta && DADOS.meta.cargos) || {};
  return html`
    <section class="inicio-topo">
      <div>
        <h1>Como estão atuando?</h1>
        <p>Quem foi eleito, o que fez e como votou, com dados oficiais abertos e atualizados todo dia.</p>
      </div>
      <label class="busca-grande" aria-label="Buscar pelo nome">${icone('busca', 20)}<input id="busca-topo" type="search" placeholder="Buscar pelo nome" autocomplete="off" aria-controls="r-lista"></label>
    </section>
    <nav class="cargos-linha chips chips-rolagem" aria-label="Cargos">
      ${ORDEM_CARGOS.map(k => html`<a class="chip" href="#/${k}" aria-current="${k === cargo ? 'true' : 'false'}">${CARGOS[k].rotulo.replace('Deputados ', 'Dep. ')}${metaCargos[k] && metaCargos[k].total != null ? html`<b>${fmtNum.format(metaCargos[k].total)}</b>` : ''}</a>`)}
      <span class="chip chip-bloq" title="Em preparação">${icone('cadeado', 15)}Presidente<b>em breve</b></span>
      <span class="chip chip-bloq" title="Em preparação">${icone('cadeado', 15)}Senadores<b>em breve</b></span>
    </nav>`;
}

/* ---------- Tela de um cargo ---------- */

async function viewCargo(cargo, token, inicio) {
  const c = CARGOS[cargo];
  document.title = inicio ? 'Placar Público' : `${c.rotulo} · Placar Público`;
  mostrar(app, html`${cabecalhoInicio(cargo)}
    <div class="resumo">${Array.from({ length: 3 }, () => html`<div class="esq esq-card"></div>`)}</div>
    ${esqueletoLinhas(6)}`);
  ligarBuscaTopo(cargo);

  const arquivo = { federais: 'federais.json', governadores: 'governadores.json', prefeitos: 'ranking-prefeitos.json' }[cargo];
  let dados = null;
  if (arquivo) {
    try { dados = await lerArquivo(arquivo); } catch (e) {
      console.error(e);
      if (token === rotaToken) { mostrar(app, html`${cabecalhoInicio(cargo)}<div id="erro"></div>`); ligarBuscaTopo(cargo); }
      if (token === rotaToken) mostrarErro($('#erro'), 'Ainda não há dados deste cargo.', () => viewCargo(cargo, token, inicio));
      return;
    }
  }
  if (token !== rotaToken) return;

  if (c.nota) montarCargoComNota(cargo, dados);
  else montarCargoSemNota(cargo, token);
}

// A busca do topo leva para a lista do cargo escolhido, filtrando pelo que foi digitado.
function ligarBuscaTopo(cargo) {
  const campo = $('#busca-topo');
  if (!campo) return;
  const f = estado.filtros[cargo] || (estado.filtros[cargo] = { busca: '', uf: '', partido: '', ordem: 'maior', limite: 50 });
  campo.value = f.busca || '';
}

function resumoCargo(cargo, dados) {
  const m = ((DADOS.meta.cargos || {})[cargo]) || {};
  const f = DADOS.meta.fontes || {};
  const fonte = cargo === 'federais' ? f.camara : f.siconfi;
  const total = dados.total ?? m.total;
  const comNota = dados.comNota ?? m.comNota;
  const dia = fonte && fonte.atualizadoEm ? new Date(fonte.atualizadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—';
  const base = cargo === 'federais' ? `Câmara, dados de ${dados.ano}` : `Tesouro, contas de ${dados.exercicio ?? '—'}`;
  return html`<section class="resumo" aria-label="Resumo">
    <div class="resumo-item"><span>${cargo === 'federais' ? 'Em exercício' : 'Eleitos'}</span><strong>${fmtNum.format(total)}</strong><small>${total - comNota ? `${fmtNum.format(comNota)} com índice` : 'todos com índice'}</small></div>
    <div class="resumo-item"><span>Índice médio</span><strong>${fmtNota(m.media)}</strong><small>de 0 a 100</small></div>
    <div class="resumo-item"><span>Atualizado em</span><strong>${dia}</strong><small>${base}</small></div>
  </section>`;
}

function montarCargoComNota(cargo, dados) {
  const itens = dados.itens;
  const rankeados = itens.filter(i => i.nota != null).sort((a, b) => a.rank - b.rank);
  const n = Math.min(8, Math.floor(rankeados.length / 2));
  const top = rankeados.slice(0, n);
  const fundo = rankeados.slice(rankeados.length - n).reverse();
  const c = CARGOS[cargo];
  const lado = { v: estado.destaque || 'top' };

  mostrar(app, html`${cabecalhoInicio(cargo)}
    ${resumoCargo(cargo, dados)}
    <p class="nota">${c.lead}</p>
    ${n ? html`<section aria-label="Destaques">
      <div class="destaques-topo">
        <h2>Destaques</h2>
        <div class="seg" role="group" aria-label="Escolha o grupo">
          <button type="button" data-lado="top" aria-pressed="${lado.v === 'top'}">Maiores índices</button>
          <button type="button" data-lado="fundo" aria-pressed="${lado.v === 'fundo'}">Menores índices</button>
        </div>
      </div>
      <ul class="destaques" id="dest-lista"></ul>
      <p class="nota" id="dest-nota"></p>
    </section>` : ''}
    <section aria-label="Lista completa">
      <div class="lista-topo"><h2>Lista completa</h2><span class="contagem" id="r-contagem" aria-live="polite"></span></div>
      <div class="filtros">
        <label class="campo"><span>${cargo === 'prefeitos' ? 'Nome ou município' : 'Nome'}</span>
          <input id="r-busca" type="search" placeholder="Digite parte do nome" autocomplete="off"></label>
        <label class="campo"><span>Estado</span>
          <select id="r-uf"><option value="">Todos</option>${UFS.map(u => html`<option value="${u}">${u}</option>`)}</select></label>
        <label class="campo"><span>Partido</span>
          <select id="r-partido"><option value="">Todos</option>${[...new Set(itens.map(i => i.partido).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(p => html`<option value="${p}">${p}</option>`)}</select></label>
        <label class="campo"><span>Ordem</span>
          <select id="r-ordem">
            <option value="maior">Maior índice primeiro</option>
            <option value="menor">Menor índice primeiro</option>
            <option value="nome">Nome (A a Z)</option>
          </select></label>
      </div>
      <ul class="lista-pessoas" id="r-lista"></ul>
      <div class="mais-linha" id="r-mais"></div>
      <p class="nota">${c.singular === 'Deputado federal'
        ? 'Quem aparece sem índice não tem dados suficientes no ano (por exemplo, assumiu o mandato há poucas semanas). Abra o perfil para ver o motivo.'
        : 'Quem aparece sem índice não tem relatórios fiscais do último ano fechado no Tesouro Nacional, ou o município não foi encontrado na base. Abra o perfil para ver o motivo.'}
        A lista de eleitos vem do TSE e não registra substituições depois da eleição. <a href="#/metodologia">Como o índice é calculado</a>.</p>
    </section>`);

  const desenharDestaques = () => {
    if (!n) return;
    $$('[data-lado]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lado === lado.v)));
    mostrar($('#dest-lista'), html`${(lado.v === 'top' ? top : fundo).map(i => cartaoDestaque(cargo, i))}`);
    mostrar($('#dest-nota'), lado.v === 'top'
      ? html`As ${n} primeiras posições entre ${fmtNum.format(rankeados.length)} com índice.`
      : html`As ${n} últimas posições. Índice baixo não é acusação: <a href="#/metodologia">veja o que ele mede</a>.`);
  };
  $$('[data-lado]').forEach(b => b.addEventListener('click', () => { lado.v = b.dataset.lado; estado.destaque = lado.v; desenharDestaques(); }));
  desenharDestaques();

  const f = estado.filtros[cargo] || (estado.filtros[cargo] = { busca: '', uf: '', partido: '', ordem: 'maior', limite: 50 });
  $('#r-busca').value = f.busca;
  $('#busca-topo').value = f.busca;
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
    mostrar($('#r-lista'), visiveis.length ? html`${visiveis.map(i => linhaPessoa(cargo, i))}` : html`<li class="vazio">Ninguém encontrado com esses filtros.</li>`);
    mostrar($('#r-mais'), lista.length > f.limite
      ? html`<button class="botao" type="button" data-mais>Mostrar mais (${fmtNum.format(lista.length - f.limite)} restantes)</button>` : html``);
  };
  const aoDigitar = e => { f.busca = e.target.value; $('#r-busca').value = f.busca; $('#busca-topo').value = f.busca; f.limite = 50; desenhar(); };
  $('#r-busca').addEventListener('input', aoDigitar);
  $('#busca-topo').addEventListener('input', aoDigitar);
  $('#r-uf').addEventListener('change', e => { f.uf = e.target.value; f.limite = 50; desenhar(); });
  $('#r-partido').addEventListener('change', e => { f.partido = e.target.value; f.limite = 50; desenhar(); });
  $('#r-ordem').addEventListener('change', e => { f.ordem = e.target.value; f.limite = 50; desenhar(); });
  $('#r-mais').addEventListener('click', e => { if (e.target.closest('[data-mais]')) { f.limite += 100; desenhar(); } });
  desenhar();
}

/* ---------- Cargos sem índice: lista oficial de eleitos ---------- */

const POR_QUE_SEM_NOTA = {
  estaduais: 'Ainda não existe uma fonte única e padronizada com presença, votos e projetos dos parlamentos dos 27 estados. Cada assembleia publica seus dados de um jeito, e algumas quase não publicam. Um índice só é justo se o critério for o mesmo para todos, então por enquanto o Placar Público mostra apenas a lista oficial de eleitos.',
  vereadores: 'São mais de cinco mil câmaras municipais, cada uma com seu sistema e seu jeito de publicar presença, votos e projetos. Não há uma fonte nacional padronizada. Um índice só é justo se o critério for o mesmo para todos, então por enquanto o Placar Público mostra apenas a lista oficial de eleitos.'
};

async function montarCargoSemNota(cargo, token) {
  const c = CARGOS[cargo];
  const ehVereador = cargo === 'vereadores';
  mostrar(app, html`${cabecalhoInicio(cargo)}
    <section class="cartao" aria-label="Por que ainda não há índice">
      <h2>${c.rotulo}: lista oficial <span class="em-breve">sem índice por enquanto</span></h2>
      <p class="painel-sub" style="margin:8px 0 0">${POR_QUE_SEM_NOTA[cargo]}</p>
    </section>
    <section class="secao" aria-label="Lista de eleitos">
      <div class="filtros filtros-auto">
        <label class="campo"><span>Estado</span>
          <select id="s-uf">${UFS.filter(u => !(ehVereador && u === 'DF')).map(u => html`<option value="${u}" ${u === estado.uf ? 'selected' : ''}>${u} · ${NOMES_UF[u]}</option>`)}</select></label>
        ${ehVereador ? html`<label class="campo"><span>Município</span><select id="s-mun"><option value="">Escolha um município</option></select></label>` : ''}
        <label class="campo"><span>Nome</span><input id="s-busca" type="search" placeholder="Digite parte do nome" autocomplete="off"></label>
        <label class="campo"><span>Partido</span><select id="s-partido"><option value="">Todos</option></select></label>
      </div>
      <p class="contagem" id="s-contagem" aria-live="polite" style="margin-top:12px"></p>
      <div id="s-corpo">${esqueletoLinhas(4)}</div>
      <div class="mais-linha" id="s-mais"></div>
      <p class="nota" id="s-nota"></p>
    </section>`);
  $('#busca-topo').closest('label').hidden = true;

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
    mostrar($('#s-nota'), html`${selo('oficial')} A lista vem do TSE e mostra quem foi eleito em ${vista.dado.ano}. Substituições depois da eleição (suplentes que assumiram, renúncias, cassações) não aparecem.`);
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
    mostrar($('#s-corpo'), visiveis.length ? html`<ul class="lista-pessoas">${visiveis.map(i => html`<li>
        <a class="pessoa pessoa-sem" href="#/${cargo}/${i.uf}/${i.id}">
          <span class="avatar" aria-hidden="true">${iniciais(i.nome)}</span>
          <span class="pessoa-info"><span class="pessoa-nome">${i.nome}</span>
          <span class="pessoa-meta">${i.partido || 'Sem partido'}${i.municipio ? ' · ' + i.municipio : ''}</span></span>
          <span class="ico-seta">${icone('seta', 18)}</span>
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
