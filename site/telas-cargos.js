'use strict';

/* =====================================================================
   Placar Público — Início
   Menus, faixas de aviso, escolha do cargo, destaques e lista de pessoas
   com o anel do índice. Cargos: deputados federais, senadores e governadores
   (o presidente tem tela própria). A lista de deputados estaduais está
   arquivada em arquivo/telas-deputados-estaduais.js.txt.
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
    const nomes = { camara: 'Câmara dos Deputados', tse: 'TSE (lista de eleitos)', siconfi: 'Tesouro Nacional (contas públicas)', historico: 'Câmara (histórico de mandatos)', administracoes: 'TSE (gestões dos últimos 48 meses)', ibge: 'IBGE (população, PIB e Censo)', presidente: 'Presidente (IBGE e Banco Central)', precos: 'Preços no Brasil (ANP, Banco Central e DIEESE)', series: 'Tesouro Nacional (contas por ano)', custo: 'Portal da Transparência da Câmara (custo dos deputados)', mundo: 'Banco Mundial (Brasil no mundo)', senado: 'Senado Federal' };
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

const linkItem = (cargo, it) => (cargo === 'federais' || cargo === 'senadores' ? `#/${cargo}/${it.id}` : `#/${cargo}/${it.uf}/${it.id}`);
const cmpNome = (a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR');

function avatarHtml(it) {
  const foto = urlSegura(it.foto);
  if (foto) return html`<img class="foto" loading="lazy" alt="" src="${foto}" data-ini="${iniciais(it.nome)}">`;
  return html`<span class="avatar" aria-hidden="true">${iniciais(it.nome)}</span>`;
}

const metaPessoa = it => `${it.partido || 'Sem partido'} · ${it.municipio ? it.municipio + '/' : ''}${it.uf}`;

/* Senadores sem índice (só o custo foi confirmado): mostra o custo por mês no lugar do anel vazio. */
const custoPorMes = it => { const c = it.extra && it.extra.custo; return c && !c.poucosMeses && c.porMes != null ? c.porMes : null; };
const chipCusto = it => { const v = custoPorMes(it); return v == null ? html`<span class="pessoa-custo sem">sem custo<small>${MSG_INDISPONIVEL}</small></span>` : html`<span class="pessoa-custo">${reaisCurto(v)}<small>por mês em CEAPS</small></span>`; };

function linhaPessoa(cargo, it) {
  return html`<li><a class="pessoa" href="${linkItem(cargo, it)}">
    ${avatarHtml(it)}
    <span class="pessoa-info">
      <span class="pessoa-nome">${it.nome}</span>
      <span class="pessoa-meta">${metaPessoa(it)}</span>
    </span>
    ${cargo === 'senadores' && it.nota == null ? chipCusto(it) : anel(it.nota, { tam: 48, esp: 5 })}
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

const CARGOS_EM_BREVE = [['Presidentes da Câmara e do Senado', 'Aba de gestão da Casa: sessões, pauta e resultados.']];

/* Senadores só aparecem como aba quando o arquivo de dados deles existe (ou no modo demonstração). */
const cargoDisponivel = k => k !== 'senadores' || DADOS.demo || !!((DADOS.meta && DADOS.meta.cargos) || {}).senadores;

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
      ${ORDEM_CARGOS.filter(cargoDisponivel).map(k => html`<a class="chip" href="#/${k}" aria-current="${k === cargo ? 'true' : 'false'}">${CARGOS[k].rotulo.replace('Deputados ', 'Dep. ')}${metaCargos[k] && metaCargos[k].total != null ? html`<b>${fmtNum.format(metaCargos[k].total)}</b>` : ''}</a>`)}
      <a class="chip" href="#/presidente" aria-current="${cargo === 'presidente' ? 'true' : 'false'}">Presidente</a>
      ${cargoDisponivel('senadores') ? '' : html`<span class="chip chip-bloq" title="Em preparação">${icone('cadeado', 15)}Senadores<b>em breve</b></span>`}
    </nav>`;
}

/* Endereço antigo de um cargo que saiu do Placar (prefeitos, vereadores, deputados estaduais). */
function viewCargoRetirado(cargo) {
  document.title = 'Placar Público';
  mostrar(app, html`${cabecalhoInicio('federais')}
    <section class="cartao cartao-aviso">
      <h2>${CARGOS_RETIRADOS[cargo]} saíram do Placar Público</h2>
      <p>A partir da versão 8, o Placar acompanha deputados federais, senadores, governadores e o presidente da República. Prefeitos, vereadores e deputados estaduais ficaram de fora para o índice de cada um ser feito com dados que o Placar consegue conferir. É possível que uma página própria para eles volte mais adiante.</p>
      <p><a class="botao" href="#/federais">Ver deputados federais</a></p>
    </section>`);
  ligarBuscaTopo('federais');
}

/* ---------- Tela de um cargo ---------- */

async function viewCargo(cargo, token, inicio) {
  const c = CARGOS[cargo];
  document.title = inicio ? 'Placar Público' : `${c.rotulo} · Placar Público`;
  mostrar(app, html`${cabecalhoInicio(cargo)}
    <div class="resumo">${Array.from({ length: 3 }, () => html`<div class="esq esq-card"></div>`)}</div>
    ${esqueletoLinhas(6)}`);
  ligarBuscaTopo(cargo);

  const arquivo = { federais: 'federais.json', senadores: 'senadores.json', governadores: 'governadores.json' }[cargo];
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

  montarCargoComNota(cargo, dados);
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
  const fonte = cargo === 'federais' ? f.camara : cargo === 'senadores' ? f.senado : f.siconfi;
  const total = dados.total ?? m.total;
  const comNota = dados.comNota ?? m.comNota;
  const dia = fonte && fonte.atualizadoEm ? new Date(fonte.atualizadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—';
  const legislador = cargo === 'federais' || cargo === 'senadores';
  const base = cargo === 'federais' ? `Câmara, ${periodoAvaliado(dados, true)}` : cargo === 'senadores' ? `Senado, ${periodoAvaliado(dados, true)}` : `Indicadores públicos dos últimos 48 meses`;
  return html`<section class="resumo" aria-label="Resumo">
    <div class="resumo-item"><span>${legislador ? 'Em exercício' : 'Eleitos'}</span><strong>${fmtNum.format(total)}</strong><small>${total - comNota ? `${fmtNum.format(comNota)} com índice` : 'todos com índice'}</small></div>
    <div class="resumo-item"><span>${legislador ? 'Índice médio' : 'Índice de serviços públicos médio'}</span><strong>${fmtNota(m.media)}</strong><small>${cargo === 'senadores' && !comNota ? 'ainda não calculado' : legislador ? 'de 0 a 100' : 'parcial, de 0 a 100 (média de quem tem índice)'}</small></div>
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
    ${cargo === 'senadores' && !dados.comNota ? html`<section class="cartao cartao-aviso"><h2>O índice dos senadores ainda não foi calculado</h2>
      <p>Hoje o Placar confirma ${dados.comCusto != null ? `o custo de ${fmtNum.format(dados.comCusto)} de ${fmtNum.format(dados.total)} senadores` : 'só o custo para os cofres públicos'} (cota CEAPS). Presença, votações, projetos e comissões do Senado ainda não têm leitura conferida e aparecem como "${MSG_INDISPONIVEL}". Um índice feito com um único critério seria só um ranking de custo, e o Placar não o chama de índice. Veja a lista abaixo, ordenada pelo nome, ou ordene pelo menor custo por mês. <a href="#/metodologia">O que falta e por quê</a>.</p></section>` : ''}
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
        <label class="campo"><span>Nome</span>
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
            ${cargo === 'senadores' ? html`<option value="custo">Menor custo por mês primeiro</option><option value="custo-maior">Maior custo por mês primeiro</option>` : ''}
          </select></label>
      </div>
      <ul class="lista-pessoas" id="r-lista"></ul>
      <div class="mais-linha" id="r-mais"></div>
      <p class="nota">${cargo === 'federais' || cargo === 'senadores'
        ? 'Quem aparece sem índice não tem dados suficientes no período avaliado (por exemplo, assumiu o mandato há poucas semanas). Abra o perfil para ver o motivo.'
        : 'Quem aparece sem índice não tem dados suficientes das áreas avaliadas (os dados do IBGE chegam aos poucos), ou o mandato atual começou há pouco e ainda não há dado dele. Abra o perfil para ver o motivo exato. Quem tem índice parcial mostra, no perfil, de quantas das cinco áreas ele é feito. A lista de eleitos vem do TSE e não registra substituições depois da eleição, mas o perfil avisa quando o Placar registra uma troca.'} <a href="#/metodologia">Como o ${nomeIndice(cargo)} é calculado</a>.</p>
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
  if (cargo === 'senadores' && !dados.comNota && f.ordem === 'maior') f.ordem = 'nome'; // sem índice, a lista começa pelo nome
  $('#r-busca').value = f.busca;
  $('#busca-topo').value = f.busca;
  $('#r-uf').value = f.uf;
  $('#r-partido').value = f.partido;
  $('#r-ordem').value = f.ordem;

  const ORDENS = {
    maior: (a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || cmpNome(a, b),
    menor: (a, b) => ((a.nota == null) - (b.nota == null)) || (b.rank ?? 0) - (a.rank ?? 0) || cmpNome(a, b),
    nome: cmpNome,
    custo: (a, b) => (custoPorMes(a) ?? 1e15) - (custoPorMes(b) ?? 1e15) || cmpNome(a, b),
    'custo-maior': (a, b) => ((custoPorMes(a) == null) - (custoPorMes(b) == null)) || (custoPorMes(b) ?? 0) - (custoPorMes(a) ?? 0) || cmpNome(a, b)
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
