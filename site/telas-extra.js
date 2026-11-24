'use strict';

/* =====================================================================
   Placar Público — telas Comparar, Notícias e Mais
   ===================================================================== */

/* =====================================================================
   Comparar: duas pessoas do mesmo cargo, lado a lado
   Endereço: #/comparar/{cargo}/{A}/{B}   (A e B: id; fora dos federais, UF.id; "-" = vazio)
   ===================================================================== */

const CARGOS_COMPARAR = [['federais', 'Deputado federal'], ['governadores', 'Governador'], ['prefeitos', 'Prefeito']];
const chaveDe = (cargo, it) => (cargo === 'federais' ? String(it.id) : `${it.uf}.${it.id}`);
const ARQUIVO_LISTA = { federais: 'federais.json', governadores: 'governadores.json', prefeitos: 'ranking-prefeitos.json' };

/* O que se compara em cada cargo. valor() devolve número ou null; max fixa a escala da barra (senão, o maior dos dois). */
const LINHAS_COMPARAR = {
  federais: [
    { rot: 'Índice do Placar', ic: 'grafico', origem: 'indice', valor: i => i.nota, fmt: v => dec(v), max: 100 },
    { rot: 'Presença nas sessões', ic: 'pessoas', origem: 'calculado', natureza: 'proporcional', valor: i => (i.comp.find(c => c.k === 'pres') || {}).s, fmt: v => dec(v) + '%', max: 100 },
    { rot: 'Votações em que registrou voto', ic: 'urna', origem: 'calculado', natureza: 'proporcional', valor: i => (i.comp.find(c => c.k === 'vot') || {}).s, fmt: v => dec(v) + '%', max: 100 },
    { rot: 'Projetos apresentados (4 anos)', ic: 'arquivo', origem: 'calculado', natureza: 'quantitativo', valor: i => (i.extra ? i.extra.projetos : null), fmt: v => fmtNum.format(v) },
    { rot: 'Cota parlamentar gasta (4 anos)', ic: 'moedas', origem: 'calculado', natureza: 'quantitativo', valor: i => (i.extra ? i.extra.gasto : null), fmt: v => reaisCurto(v) },
    { rot: 'Anos de exercício efetivo na Câmara', ic: 'relogio', origem: 'calculado', natureza: 'quantitativo', valor: (i, x) => (x.hist ? x.hist.anosEfetivos : null), fmt: v => dec(v, 1) }
  ],
  executivos: [
    { rot: 'Índice do Placar', ic: 'grafico', origem: 'indice', valor: i => i.nota, fmt: v => dec(v), max: 100 },
    { rot: 'Gasto com pessoal (% da receita)', ic: 'pessoas', origem: 'oficial', natureza: 'proporcional', valor: i => (i.contas ? i.contas.pessoal : null), fmt: v => dec(v) + '%' },
    { rot: 'Dívida líquida (% da receita)', ic: 'cifrao', origem: 'oficial', natureza: 'proporcional', valor: i => (i.contas ? i.contas.divida : null), fmt: v => dec(v) + '%' },
    { rot: 'Relatórios entregues ao Tesouro', ic: 'arquivo', origem: 'calculado', natureza: 'quantitativo', valor: i => (i.contas && i.contas.entregas ? i.contas.entregas.feitas : null), fmt: (v, i) => `${v} de ${i.contas.entregas.esperado}` },
    { rot: 'População', ic: 'predio', origem: 'oficial', natureza: 'contexto', valor: i => i.populacao || null, fmt: v => fmtNum.format(v) }
  ]
};

async function carregarDetalheComparar(cargo, it) {
  let item = it, hist = null;
  if (cargo === 'federais') hist = await lerArquivo(`deputados/${it.id}.json`).catch(() => null);
  if (cargo === 'prefeitos') {
    const d = await lerArquivo(`prefeitos-${it.uf}.json`).catch(() => null);
    item = (d && d.itens.find(x => x.id === it.id)) || it;
  }
  return { item, hist };
}

async function viewComparar(partes, token) {
  document.title = 'Comparar · Placar Público';
  const cargo = CARGOS_COMPARAR.some(([k]) => k === partes[0]) ? partes[0] : 'federais';
  const [ka, kb] = [partes[1], partes[2]].map(x => (x && x !== '-' ? x : null));
  mostrar(app, html`<h1 class="painel-titulo" style="font-size:1.6rem">Comparativo de desempenho</h1><div class="esq" style="height:120px;margin-top:14px"></div>`);

  let lista;
  try { lista = (await lerArquivo(ARQUIVO_LISTA[cargo])).itens; } catch (e) {
    console.error(e);
    if (token === rotaToken) { mostrar(app, html`<div id="erro"></div>`); mostrarErro($('#erro'), 'Ainda não há dados deste cargo.', () => viewComparar(partes, token)); }
    return;
  }
  if (token !== rotaToken) return;
  const porChave = new Map(lista.map(i => [chaveDe(cargo, i), i]));
  const pa = ka && porChave.get(ka), pb = kb && porChave.get(kb);
  const [da, db] = await Promise.all([pa ? carregarDetalheComparar(cargo, pa) : null, pb ? carregarDetalheComparar(cargo, pb) : null]);
  if (token !== rotaToken) return;
  const hrefCom = (a, b) => `#/comparar/${cargo}/${a || '-'}/${b || '-'}`;
  const linhas = LINHAS_COMPARAR[cargo === 'federais' ? 'federais' : 'executivos'];
  let escolhendo = !pa ? 'a' : !pb ? 'b' : null;
  let consulta = '';

  const cabeca = (d, lado) => d
    ? html`<div class="comp-pessoa">${avatarHtml(d.item)}<h3>${d.item.nome}</h3><small>${metaPessoa(d.item)}</small>${anel(d.item.nota, { tam: 72, esp: 7, rotulo: true })}
        <button class="link-botao" type="button" data-escolher="${lado}">Trocar</button></div>`
    : html`<div class="comp-pessoa comp-escolher"><span class="avatar" aria-hidden="true">${lado.toUpperCase()}</span><h3>Pessoa ${lado.toUpperCase()}</h3><small>Escolha quem comparar</small>
        <button class="botao botao-claro" type="button" data-escolher="${lado}">Escolher</button></div>`;

  const desenhar = () => {
    mostrar(app, html`
      <h1 class="painel-titulo" style="font-size:1.6rem">Comparativo de desempenho</h1>
      <p class="painel-sub">Veja como duas pessoas do mesmo cargo se comparam nos mesmos critérios. Comparar cargos diferentes não faz sentido, porque as regras e os dados são outros.</p>
      <nav class="chips chips-rolagem" aria-label="Cargo a comparar">${CARGOS_COMPARAR.map(([k, rot]) => html`<a class="chip" href="#/comparar/${k}" aria-current="${k === cargo}">${rot}</a>`)}</nav>
      <div class="comp-cab">${cabeca(da, 'a')}${cabeca(db, 'b')}</div>
      ${escolhendo ? html`<section class="cartao">
        <h2 class="painel-titulo">Escolher a pessoa ${escolhendo.toUpperCase()}</h2>
        <div class="busca-grande" style="margin-top:8px">${icone('busca', 20)}<input id="c-busca" type="search" placeholder="Digite parte do nome" value="${consulta}" autocomplete="off" aria-label="Buscar pelo nome"></div>
        <div class="resultados" id="c-res"></div>
      </section>` : ''}
      ${da && db ? tabelaComparar() : html`<p class="nota">Escolha duas pessoas para ver a comparação.</p>`}`);
    const campo = $('#c-busca');
    if (campo) {
      const lista2 = () => {
        const q = semAcento(consulta.trim());
        const outra = escolhendo === 'a' ? kb : ka;
        const ach = q.length < 2 ? [] : lista.filter(i => chaveDe(cargo, i) !== outra && (semAcento(i.nome).includes(q) || semAcento(i.municipio || '').includes(q))).slice(0, 8);
        mostrar($('#c-res'), ach.length ? html`${ach.map(i => html`<button type="button" class="resultado" data-chave="${chaveDe(cargo, i)}">${avatarHtml(i)}<span><strong>${i.nome}</strong><small>${metaPessoa(i)}</small></span></button>`)}` : html`<p class="nota" style="margin:4px 0 0">${q.length < 2 ? 'Digite pelo menos 2 letras.' : 'Ninguém encontrado.'}</p>`);
      };
      campo.addEventListener('input', e => { consulta = e.target.value; lista2(); });
      lista2();
      campo.focus({ preventScroll: true });
    }
  };

  function tabelaComparar() {
    return html`
      <div class="legenda-ab"><span><i style="background:var(--acento)"></i>${da.item.nome}</span><span><i style="background:var(--media-anel)"></i>${db.item.nome}</span></div>
      ${linhas.map(l => {
        const va = l.valor(da.item, da), vb = l.valor(db.item, db);
        const max = l.max || Math.max(va || 0, vb || 0, 1);
        const barra = (v, lado, item) => html`<div class="dupla-item ${lado}"><span class="dupla-barra" role="img" aria-label="${v == null ? 'sem dado' : l.fmt(v, item)}"><span style="width:${v == null ? 0 : Math.max(1.5, Math.min(100, v / max * 100))}%"></span></span><span class="dupla-val">${v == null ? '—' : l.fmt(v, item)}</span></div>`;
        return html`<section class="cartao comp-linha"><h3>${icone(l.ic, 20)} ${l.rot} ${selo(l.origem, l.natureza)}</h3>
          <div class="dupla">${barra(va, 'a', da.item)}${barra(vb, 'b', db.item)}</div></section>`;
      })}
      <p class="nota">Valores iguais ou próximos não significam que as duas pessoas atuam do mesmo jeito. Quem é mais novo no cargo, quem esteve afastado e quem pertence a estados e cidades de tamanhos diferentes tem números diferentes por motivos que o Placar Público não mede. O índice é uma regra do Placar Público (<a href="#/metodologia">veja a Metodologia</a>) e não aponta irregularidade.</p>`;
  }

  app.onclick = e => {
    const b = e.target.closest('[data-escolher]');
    if (b) { escolhendo = b.dataset.escolher; consulta = ''; desenhar(); return; }
    const r = e.target.closest('[data-chave]');
    if (r) {
      const nova = r.dataset.chave;
      location.hash = escolhendo === 'a' ? hrefCom(nova, kb) : hrefCom(ka, nova);
    }
  };
  desenhar();
}

/* =====================================================================
   Notícias automáticas: últimas votações, atualizações e correções
   ===================================================================== */

async function viewNoticias(token) {
  document.title = 'Notícias · Placar Público';
  mostrar(app, html`<h1 class="painel-titulo" style="font-size:1.6rem">Notícias</h1>${esqueletoLinhas(4)}`);
  let votos = null, correcoes = null;
  try { votos = await lerArquivo('votos.json'); } catch (e) { /* sem votos: a página mostra o aviso */ }
  try { correcoes = await lerArquivo('correcoes.json'); } catch (e) { /* ainda não há registro */ }
  if (token !== rotaToken) return;
  const f = (DADOS.meta && DADOS.meta.fontes) || {};
  const recentes = votos ? votos.votacoes.slice(0, 12) : [];

  mostrar(app, html`
    <h1 class="painel-titulo" style="font-size:1.6rem">Notícias</h1>
    <p class="painel-sub">Resumos gerados por regra a partir de dados oficiais. Não são reportagens e não têm opinião: cada item traz o dado, a data e o link da fonte para você conferir. Se a fonte oficial corrigir algo, a correção aparece no histórico abaixo, e nada é apagado.</p>

    <h2 class="painel-titulo" style="margin-top:22px">Últimas votações nominais da Câmara</h2>
    ${recentes.length ? html`${recentes.map(vt => html`<article class="noticia">
      <div class="noticia-topo"><time>${dataBR(vt.data)}</time><span class="tipo-voto ${vt.tipo === 'principal' ? '' : 'secundaria'}">${ROTULO_TIPO_VOTACAO[vt.tipo] || 'Votação'}</span>${selo('oficial')}</div>
      <h3>${vt.materia ? vt.materia + ': ' : ''}${vt.aprovacao === 1 ? 'aprovada' : vt.aprovacao === 0 ? 'rejeitada' : 'resultado não informado'}</h3>
      <p>${vt.resumo ? (vt.resumo.length > 260 ? vt.resumo.slice(0, 260) + '…' : vt.resumo) : vt.titulo}</p>
      <p>Placar oficial: ${fmtNum.format(vt.sim)} Sim · ${fmtNum.format(vt.nao)} Não · ${fmtNum.format(vt.outros)} outros.</p>
      <div class="noticia-fonte"><a href="${urlSegura(vt.fonte)}" target="_blank" rel="noopener">Fonte: API da Câmara</a>${vt.portal ? html`<a href="${urlSegura(vt.portal)}" target="_blank" rel="noopener">Ver a matéria no portal</a>` : ''}</div>
    </article>`)}` : html`<div class="cartao">${indisponivel('O arquivo de votações ainda não foi gerado. Ele aparece depois da próxima atualização diária.')}</div>`}

    <h2 class="painel-titulo" style="margin-top:28px">Histórico de correções</h2>
    <p class="painel-sub">Quando a Câmara muda o resultado, o placar, o texto ou o voto registrado de alguém numa votação já publicada, o Placar Público anota aqui.</p>
    ${correcoes && correcoes.itens && correcoes.itens.length ? html`${correcoes.itens.slice(0, 30).map(c => html`<article class="noticia">
      <div class="noticia-topo"><time>${dataBR(c.em)}</time>${selo('oficial')}</div>
      <h3>${c.titulo || 'Votação ' + c.votacao}</h3>
      <ul class="pontos" style="font-size:.9rem">${(c.mudancas || []).map(m => html`<li>${m.campo}: de “${String(m.antes)}” para “${String(m.depois)}”</li>`)}${c.votosIndividuaisAlterados ? html`<li>${plural(c.votosIndividuaisAlterados, 'voto individual alterado', 'votos individuais alterados')}</li>` : ''}</ul>
      <div class="noticia-fonte"><a href="${API}/votacoes/${encodeURIComponent(c.votacao)}" target="_blank" rel="noopener">Fonte: API da Câmara</a></div>
    </article>`)}`
    : html`<div class="cartao"><p class="painel-sub" style="margin:0">${correcoes ? 'Nenhuma correção registrada até agora.' : MSG_INDISPONIVEL}</p></div>`}

    <h2 class="painel-titulo" style="margin-top:28px">Atualizações dos dados</h2>
    <div class="cartao"><ul class="pontos" style="list-style:none;padding:0">
      <li><strong>Câmara dos Deputados</strong>: ${f.camara && f.camara.atualizadoEm ? dataHoraBR(f.camara.atualizadoEm) : MSG_INDISPONIVEL}</li>
      <li><strong>Histórico de mandatos</strong>: ${f.historico && f.historico.atualizadoEm ? dataHoraBR(f.historico.atualizadoEm) : MSG_INDISPONIVEL}</li>
      <li><strong>TSE (eleitos)</strong>: ${f.tse && f.tse.atualizadoEm ? dataHoraBR(f.tse.atualizadoEm) : MSG_INDISPONIVEL}</li>
      <li><strong>Tesouro Nacional (contas)</strong>: ${f.siconfi && f.siconfi.atualizadoEm ? dataHoraBR(f.siconfi.atualizadoEm) : MSG_INDISPONIVEL}</li>
    </ul></div>`);
}

/* =====================================================================
   Mais
   ===================================================================== */

function viewMais() {
  document.title = 'Mais · Placar Público';
  mostrar(app, html`
    <h1 class="painel-titulo" style="font-size:1.6rem">Mais</h1>
    <div class="menu-lista">
      <a class="menu-item" href="#/metodologia"><span class="mi-ico">${icone('grafico', 22)}</span><span><strong>Metodologia</strong><span>Como o índice é calculado e o que ele não mede.</span></span><span class="ico-seta">${icone('seta', 18)}</span></a>
      <a class="menu-item" href="#/fontes"><span class="mi-ico">${icone('arquivo', 22)}</span><span><strong>Fontes dos dados</strong><span>De onde vem cada número e quando foi atualizado.</span></span><span class="ico-seta">${icone('seta', 18)}</span></a>
      <a class="menu-item" href="#/verificacao"><span class="mi-ico">${icone('escudo', 22)}</span><span><strong>Como verificamos</strong><span>Regras para nada falso aparecer como se fosse oficial.</span></span><span class="ico-seta">${icone('seta', 18)}</span></a>
    </div>
    <h2 class="painel-titulo" style="margin-top:28px">Em preparação</h2>
    <p class="painel-sub">O que ainda não está no ar, e por quê. Nada disso é mostrado com número inventado enquanto não houver fonte oficial integrada.</p>
    <div class="cartoes-breve">${CARGOS_EM_BREVE.map(([t, d]) => html`<div class="breve">${icone('cadeado', 22)}<div><strong>${t}</strong>${d}</div></div>`)}
      <div class="breve">${icone('cadeado', 22)}<div><strong>Emendas parlamentares</strong>Ligação com o Portal da Transparência.</div></div>
      <div class="breve">${icone('cadeado', 22)}<div><strong>Saúde, educação, segurança e obras</strong>Indicadores por estado e município.</div></div>
      <div class="breve">${icone('cadeado', 22)}<div><strong>Deputados estaduais e vereadores</strong>Hoje só a lista oficial de eleitos.</div></div>
    </div>
    <p class="nota">Aplicativo independente, sem vínculo com governos, partidos ou órgãos públicos.</p>`);
}
