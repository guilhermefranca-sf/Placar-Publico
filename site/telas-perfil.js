'use strict';

/* =====================================================================
   Placar Público — perfis
   Deputado federal: cabeçalho com índice, abas (Visão geral, Histórico de
   mandatos, Projetos, Como votou?, Emendas, Gastos, Fiscalização,
   Notícias, Fontes) e, para o presidente da Câmara, Gestão da Presidência.
   Governador e prefeito: abas de economia, áreas de governo, gastos,
   prestação de contas e fontes.
   Deputado estadual e vereador: ficha da lista oficial de eleitos.
   Regra de todas as abas: nada é inventado. Sem dado oficial, aparece a
   mensagem padrão e, quando se sabe, a fonte prevista.
   ===================================================================== */

function esqueletoPerfil(voltarHref, voltarTexto) {
  return html`
    <a class="voltar" href="${voltarHref}">${icone('voltar', 16)}${voltarTexto}</a>
    <div class="esq" style="height:170px;border-radius:16px"></div>
    <div class="esq" style="height:50px;margin-top:14px;border-radius:16px"></div>
    ${esqueletoLinhas(3)}`;
}

function naoEncontrado(voltarHref, voltarTexto, quem) {
  mostrar(app, html`<a class="voltar" href="${voltarHref}">${icone('voltar', 16)}${voltarTexto}</a>
    <div class="cartao"><h1>${quem} não encontrado(a)</h1>
      <p class="painel-sub" style="margin-top:8px">Esta pessoa não está na lista de hoje. Ela pode ter deixado o cargo, ou o endereço pode estar errado.</p></div>`);
}

function fichaHtml(linhas) {
  const validas = linhas.filter(([, v]) => v);
  return validas.length ? html`<dl class="ficha">${validas.map(([r, v]) => html`<div><dt>${r}</dt><dd>${v}</dd></div>`)}</dl>` : html``;
}

function heroPerfil({ item, cargoTxt, meta, selos = [], anelNota = true }) {
  return html`<header class="hero">
    ${avatarHtml(item)}
    <div class="hero-info">
      <div class="hero-cargo">${cargoTxt}</div>
      <h1 class="hero-nome">${item.nome}</h1>
      <div class="hero-meta">${meta}</div>
    </div>
    <div class="hero-rodape">
      <div class="hero-selos">${selos}</div>
      ${anelNota ? html`<div class="hero-anel">${anel(item.nota, { tam: 96, esp: 8, rotulo: true, escuro: true })}</div>` : ''}
    </div>
  </header>`;
}

function barraAbas(abas, hrefBase) {
  return html`<div class="abas-barra"><nav class="abas" role="tablist" aria-label="Seções do perfil">
    ${abas.map(([k, rot]) => html`<a class="aba" role="tab" href="${hrefBase}/${k}" data-aba="${k}" aria-selected="false">${rot}</a>`)}
  </nav></div>`;
}

function seletorAno(rotulo = 'Ano') {
  return html`<label class="campo" style="max-width:160px;margin-bottom:12px"><span>${rotulo}</span>
    <select id="ano">${Array.from({ length: ANO_ATUAL - PRIMEIRO_ANO + 1 }, (_, i) => ANO_ATUAL - i).map(a => html`<option value="${a}" ${a === estado.ano ? 'selected' : ''}>${a}</option>`)}</select></label>`;
}

/* Lista dos critérios do índice, com a barra, o peso e a frase que explica o número. */
function cartaoIndice(item, grupo) {
  const defs = ((DADOS.metodo && DADOS.metodo[grupo] && DADOS.metodo[grupo].componentes) || []);
  const comp = item.comp || [];
  const porK = new Map(comp.map(c => [c.k, c]));
  const linhas = defs.length ? defs : comp.map(c => ({ k: c.k, rotulo: c.k, peso: null }));
  if (!comp.length) {
    return html`<section class="cartao"><h2 class="painel-titulo">Como o índice é formado ${selo('indice')}</h2>
      <p class="painel-sub">${item.motivo || 'Não há dados suficientes para mostrar os critérios.'}</p>
      <p class="nota" style="margin-top:0">Veja em <a href="#/metodologia">Metodologia</a> quais critérios entram no índice.</p></section>`;
  }
  const faltam = linhas.some(d => !porK.has(d.k) || porK.get(d.k).s == null);
  return html`<section class="cartao">
    <h2 class="painel-titulo">Como o índice é formado ${selo('indice')}</h2>
    <p class="painel-sub">Cada critério vai de 0 a 100. O índice é a média deles, com os pesos abaixo. Ele é uma regra do Placar Público, não um dado oficial.</p>
    <ul class="comp-lista">${linhas.map(d => {
      const c = porK.get(d.k);
      const s = c ? c.s : null;
      return html`<li class="comp ${s == null ? 'sem' : ''}">
        <span class="comp-nome">${d.rotulo}${d.peso != null ? html`<span class="comp-peso">peso ${d.peso}%</span>` : ''}</span>
        <span class="comp-nota">${s == null ? 'sem dado' : fmtNota(s)}</span>
        <span class="comp-barra" role="img" aria-label="${s == null ? 'sem dado' : fmtNota(s) + ' de 100'}"><span style="width:${s == null ? 0 : Math.max(0, Math.min(100, s))}%"></span></span>
        <span class="comp-fato">${c && c.f ? c.f : MSG_INDISPONIVEL}</span>
      </li>`;
    })}</ul>
    ${faltam ? html`<p class="nota">Quando um critério não tem dado, o índice usa só os que existem, mantendo os pesos proporcionais.</p>` : ''}
    <p class="nota">${grupo === 'federais'
      ? 'O índice compara o que o deputado fez no ano com as regras do método. Mede quantidade e cumprimento de deveres, não a qualidade do mandato. Quem assumiu durante o ano é avaliado só pelo período em que esteve no cargo.'
      : 'O índice olha as contas do último ano fechado, que pertencem à administração daquele ano. Não mede saúde, educação, obras ou serviços, e não aponta irregularidade.'}
      <a href="#/metodologia">Como é calculado</a>.</p>
  </section>`;
}

function avisoEleitos(ano, extra = '') {
  return html`<section class="cartao cartao-aviso">
    <h3>Quem está no cargo hoje?</h3>
    <p>Esta lista vem do TSE e mostra quem foi eleito em ${ano}. Se houve renúncia, cassação, afastamento ou morte depois da eleição, o cargo pode estar com outra pessoa, e isso não aparece aqui. ${extra}</p>
  </section>`;
}

function tile({ icone: ic, cor, rotulo, valor, legenda, origem, natureza, href }) {
  const corpo = html`<span class="tile-ico">${icone(ic, 22)}</span><span class="tile-rot">${rotulo}</span><span class="tile-val">${valor}</span><span class="tile-leg">${legenda}</span>${origem ? selo(origem, natureza) : ''}`;
  return href ? html`<a class="tile tile-${cor}" href="${href}">${corpo}</a>` : html`<div class="tile tile-${cor}">${corpo}</div>`;
}

/* Painel de uma área ainda sem dado oficial integrado (saúde, educação, segurança...). */
function painelEmDesenvolvimento({ titulo, ic, oQue, fontes }) {
  return html`<section class="cartao">
    <h2 class="painel-titulo">${icone(ic, 22)} ${titulo} <span class="em-breve">em desenvolvimento</span></h2>
    <p class="painel-sub">${oQue}</p>
    ${indisponivel('O Placar Público só mostra números que conseguiu ler de uma fonte oficial. Esta área ainda não tem fonte integrada, e por isso nenhum valor aparece aqui.')}
    ${fontes ? html`<p class="nota"><strong>Fontes oficiais em estudo:</strong> ${fontes}</p>` : ''}
  </section>`;
}

/* Medidor: valor atual contra o limite legal. */
function medidor({ valor, limite, marcas = [], legenda }) {
  const max = Math.max(limite * 1.3, valor * 1.05);
  const pos = v => Math.max(0, Math.min(100, v / max * 100));
  const razao = valor / limite;
  const f = razao < 0.9 ? 'alta' : razao < 1 ? 'media' : 'baixa';
  return html`<div class="medidor">
    <div class="medidor-topo"><strong>${valor.toLocaleString('pt-BR')}%</strong><span class="painel-sub" style="margin:0">limite legal: ${limite}%</span></div>
    <div class="medidor-pista" role="img" aria-label="${valor}% contra o limite de ${limite}%">
      <span class="medidor-preenche ${f === 'alta' ? '' : f}" style="width:${pos(valor)}%"></span>
      ${marcas.map(m => html`<span class="medidor-marca medidor-marca-fina" style="left:${pos(m.v)}%"></span>`)}
      <span class="medidor-marca" style="left:${pos(limite)}%" data-rot="limite ${limite}%"></span>
    </div>
    <p class="medidor-legenda">${legenda}</p>
  </div>`;
}

/* ---------- Roteamento dos perfis ---------- */

function viewPerfil(cargo, uf, id, aba, token) {
  if (cargo === 'federais') return viewFederal(id, aba, token);
  if (cargo === 'governadores' || cargo === 'prefeitos') return viewExecutivo(cargo, uf, id, aba, token);
  return viewEleito(cargo, uf, id, token);
}

/* Liga as abas de um perfil: troca de painel sem recarregar a página. */
function ligarAbas({ chave, abas, abaInicial, desenharPainel, token }) {
  const validas = abas.map(([k]) => k);
  let aba = validas.includes(ABAS_ANTIGAS[abaInicial] || abaInicial) ? (ABAS_ANTIGAS[abaInicial] || abaInicial) : 'visao';
  let contador = 0;
  const mostrarAba = () => {
    const meu = ++contador;
    $$('.aba').forEach(el => {
      const ativa = el.dataset.aba === aba;
      el.setAttribute('aria-selected', String(ativa));
      if (ativa) { const nav = el.parentElement; if (nav && nav.scrollTo) nav.scrollTo({ left: el.offsetLeft - 16, behavior: 'smooth' }); }
    });
    const vale = () => token === rotaToken && meu === contador;
    desenharPainel(aba, $('#painel'), vale);
  };
  perfilAtual = {
    chave,
    trocarAba(nova) {
      aba = validas.includes(ABAS_ANTIGAS[nova] || nova) ? (ABAS_ANTIGAS[nova] || nova) : 'visao';
      mostrarAba();
      const barra = $('.abas-barra');
      if (barra) { const t = barra.getBoundingClientRect().top; if (t < 70) window.scrollTo(0, window.scrollY + t - 68); }
    },
    redesenhar: mostrarAba
  };
  mostrarAba();
}

/* =====================================================================
   Deputado federal
   ===================================================================== */

const legislaturaDoDia = (d = new Date()) => Math.floor((d.getFullYear() - (d.getMonth() === 0 ? 1 : 0) - 1995) / 4) + 50;
const periodoLegislatura = n => ({ ini: 1995 + 4 * (n - 50), fim: 1999 + 4 * (n - 50) });
const ROTULO_TIPO_VOTACAO = { principal: 'Proposta principal', emenda: 'Emenda', destaque: 'Destaque', substitutivo: 'Substitutivo', requerimento: 'Requerimento', outro: 'Outra votação' };
const CHAVE_LETRA = { S: 'sim', N: 'nao', A: 'abst', O: 'obstr', P: 'art17', X: 'secreto', '-': 'ausente', _: 'ausente' };
const ROTULO_LETRA = { S: 'Sim', N: 'Não', A: 'Abstenção', O: 'Obstrução', P: 'Presidindo a sessão', X: 'Voto secreto', '-': 'Sem voto registrado', _: 'Antes da 1ª presença no ano' };

const popCurta = n => (n >= 1e6 ? `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : n >= 1e4 ? `${Math.round(n / 1e3).toLocaleString('pt-BR')} mil` : fmtNum.format(n));
const dec = (n, c = 1) => (n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));

async function viewFederal(id, abaInicial, token) {
  const voltar = ['#/federais', 'Deputados federais'];
  document.title = 'Placar Público';
  mostrar(app, esqueletoPerfil(...voltar));
  let dado, hist;
  try {
    [dado, hist] = await Promise.all([lerArquivo('federais.json'), lerArquivo(`deputados/${id}.json`).catch(() => null)]);
  } catch (e) {
    console.error(e);
    if (token === rotaToken) { mostrar(app, html`<div id="erro"></div>`); mostrarErro($('#erro'), 'Não foi possível carregar os dados.', () => viewFederal(id, abaInicial, token)); }
    return;
  }
  if (token !== rotaToken) return;
  const item = dado.itens.find(i => i.id === String(id));
  if (!item) return naoEncontrado(...voltar, 'Deputado(a)');

  const demo = DADOS.demo;
  const legAtual = legislaturaDoDia();
  const per = periodoLegislatura(legAtual);
  const presidencia = hist && (hist.direcao || []).find(d => /^presidente$/i.test(String(d.cargo || '').trim()) && d.leg === legAtual && !d.fim);
  const licenca = hist && (hist.pausas || []).find(p => !p.fim);
  const abas = presidencia ? [ABAS_FEDERAL[0], ['presidencia', 'Gestão da Presidência'], ...ABAS_FEDERAL.slice(1)] : ABAS_FEDERAL;
  document.title = `${item.nome} · Placar Público`;

  const selos = [html`<span class="distintivo">Mandato atual · ${legAtual}ª legislatura (${per.ini}–${per.fim})</span>`];
  if (presidencia) selos.push(html`<span class="distintivo distintivo-neutro">Presidente da Câmara dos Deputados</span>`);
  if (licenca) selos.push(html`<span class="distintivo distintivo-aviso">Afastado(a) desde ${dataBR(licenca.ini)}</span>`);
  if (item.rank != null) selos.push(html`<span class="distintivo distintivo-neutro">${fmtNum.format(item.rank)}º entre ${fmtNum.format(dado.comNota)}</span>`);

  mostrar(app, html`
    <a class="voltar" href="${voltar[0]}">${icone('voltar', 16)}${voltar[1]}</a>
    ${heroPerfil({ item, cargoTxt: 'Deputado(a) federal', meta: `${item.partido || 'Sem partido'} · ${NOMES_UF[item.uf] || item.uf}`, selos })}
    ${barraAbas(abas, `#/federais/${id}`)}
    <section class="painel" id="painel" role="tabpanel" aria-live="polite"></section>`);

  const cache = new Map();
  const pronto = (chave, fn) => { if (!cache.has(chave)) { const p = fn(); cache.set(chave, p); p.catch(() => cache.delete(chave)); } return cache.get(chave); };
  const ctx = {
    id, item, dado, hist, presidencia, demo, abas,
    ano: () => estado.ano,
    projetos: ano => pronto(`proj${ano}`, () => carregarProjetos(id, ano)),
    presenca: ano => pronto(`pres${ano}`, () => carregarPresenca(id, ano)),
    gastos: ano => pronto(`gast${ano}`, () => carregarGastos(id, ano)),
    orgaos: () => pronto('org', () => carregarOrgaos(id)),
    porAno: () => pronto('porano', () => carregarProjetosPorAno(id, (hist && hist.anoInicio) || PRIMEIRO_ANO, ANO_ATUAL)),
    votos: () => lerArquivo('votos.json'),
    correcoes: () => lerArquivo('correcoes.json')
  };

  const PAINEIS = {
    visao: painelVisaoFederal, historico: painelHistorico, projetos: painelProjetos, votos: painelComoVotou,
    emendas: painelEmendas, gastos: painelGastosFed, fiscalizacao: painelFiscalizacao, noticias: painelNoticiasFed,
    fontes: painelFontesFed, presidencia: painelPresidencia
  };
  ligarAbas({
    chave: `federais/${id}`, abas, abaInicial, token,
    desenharPainel: (aba, painel, vale) => {
      mostrar(painel, esqueletoLinhas(3));
      Promise.resolve(PAINEIS[aba](painel, ctx, vale)).catch(e => {
        console.error(e);
        if (vale()) mostrarErro(painel, 'Não foi possível carregar esta seção.', () => perfilAtual && perfilAtual.redesenhar());
      });
    }
  });
}

/* ---------- Visão geral ---------- */

function painelVisaoFederal(el, ctx) {
  const { item, dado, hist, id, demo } = ctx;
  const e = item.extra;
  const comp = Object.fromEntries((item.comp || []).map(c => [c.k, c]));
  const licenca = hist && (hist.pausas || []).find(p => !p.fim);

  mostrar(el, html`
    ${licenca ? html`<section class="cartao cartao-aviso" style="margin-top:0"><h3>Afastado(a) do exercício</h3>
      <p>${licenca.motivo || 'Afastamento'} desde ${dataBR(licenca.ini)}, segundo o histórico oficial da Câmara. Enquanto está afastado(a), quem ocupa a vaga é o suplente, e o índice mostrado vale para o período em que houve presença registrada.</p></section>` : ''}
    ${e ? html`<h2 class="painel-titulo">Destaques do mandato</h2>
    <p class="painel-sub">Números de ${dado.ano}, calculados com os dados abertos da Câmara. O selo diz se o valor é oficial ou calculado.</p>
    <div class="tiles">
      ${tile({ icone: 'pessoas', cor: 'verde', rotulo: 'Presença', valor: comp.pres ? dec(comp.pres.s) + '%' : '—', legenda: `${e.sessoes[0]} de ${e.sessoes[1]} sessões deliberativas do Plenário desde ${dataBR(item.desde)}`, origem: 'calculado', natureza: 'proporcional' })}
      ${tile({ icone: 'urna', cor: 'azul', rotulo: 'Votações nominais', valor: `${e.votos[0]} de ${e.votos[1]}`, legenda: 'votações do Plenário em que registrou voto no período', origem: 'calculado', natureza: 'proporcional', href: `#/federais/${id}/votos` })}
      ${tile({ icone: 'arquivo', cor: 'laranja', rotulo: 'Projetos', valor: fmtNum.format(e.projetos), legenda: `projetos e propostas apresentados em ${dado.ano}, como autor ou coautor`, origem: 'calculado', natureza: 'quantitativo', href: `#/federais/${id}/projetos` })}
      ${tile({ icone: 'moedas', cor: 'roxo', rotulo: 'Cota parlamentar', valor: reaisCurto(e.gasto), legenda: `gasto em ${dado.ano} (${fmtBRL.format(e.gasto)}, valor dos documentos menos glosas)`, origem: 'calculado', natureza: 'quantitativo', href: `#/federais/${id}/gastos` })}
    </div>` : html`<section class="cartao" style="margin-top:0"><h2 class="painel-titulo">Destaques do mandato</h2>
      <p class="painel-sub">${item.motivo || MSG_INDISPONIVEL}</p></section>`}

    <a class="cta" href="#/federais/${id}/votos">
      <span class="ico-grande">${icone('lampada', 34)}</span>
      <span><strong>Como votou?</strong><span>Veja o voto de ${item.nome} em cada votação nominal do Plenário, matéria por matéria.</span></span>
      <span class="ico-seta">${icone('seta', 22)}</span>
    </a>

    <div class="dois-cols">
      <section class="cartao" id="v-tempo"></section>
      <section class="cartao" id="v-producao"></section>
    </div>
    ${cartaoIndice(item, 'federais')}
    <section class="cartao">
      <h2 class="painel-titulo">Presença no Plenário</h2>
      <p class="painel-sub">Detalhe consultado na Câmara na hora em que você abre.</p>
      <div id="v-presenca">${demo ? indisponivel('No modo demonstração a consulta à Câmara fica desligada.') : html`<button class="botao botao-claro" type="button" id="v-pres-botao">Ver as sessões sem presença em ${estado.ano}</button>`}</div>
    </section>`);

  /* Tempo de exercício (do histórico oficial) */
  const tempo = $('#v-tempo');
  if (hist && hist.mandatos && hist.mandatos.length) {
    const atual = hist.legislaturaAtual;
    mostrar(tempo, html`<h2 class="painel-titulo">Tempo de exercício efetivo</h2>
      <p class="painel-sub">Mandato e tempo no cargo não são a mesma coisa: licenças e substituições ficam de fora da conta.</p>
      <div class="numeros">
        <div class="numero"><span>Mandato atual</span><strong>${atual ? dec(atual.anos, 1) : '—'} anos</strong><small>${atual ? `desde ${dataBR(hist.mandatos.find(m => m.emCurso).inicioExercicio)}` : 'sem exercício no mandato atual'}</small></div>
        <div class="numero"><span>Em todo o histórico</span><strong>${dec(hist.anosEfetivos, 1)} anos</strong><small>${hist.mandatos.length} ${hist.mandatos.length === 1 ? 'mandato' : 'mandatos'} desde ${hist.anoInicio}</small></div>
      </div>
      <p class="nota" style="margin-top:10px"><a href="#/federais/${id}/historico">Ver o histórico de mandatos</a></p>
      ${selo('calculado', 'quantitativo')}`);
  } else {
    mostrar(tempo, html`<h2 class="painel-titulo">Tempo de exercício efetivo</h2>${indisponivel(demo ? 'No modo demonstração não há histórico.' : 'O histórico de mandatos deste deputado ainda não foi gerado pela atualização semanal.')}`);
  }

  /* Produção anualizada (consulta ao vivo, ano a ano) */
  const prod = $('#v-producao');
  mostrar(prod, html`<h2 class="painel-titulo">Produção legislativa por ano de exercício</h2>
    <p class="painel-sub">Projetos e propostas apresentados, divididos pelos anos de exercício efetivo.</p>
    <div id="v-prod-corpo">${demo || !hist || !hist.mandatos.length ? indisponivel(demo ? 'No modo demonstração a consulta à Câmara fica desligada.' : 'Sem o histórico de mandatos não dá para dividir pelos anos de exercício.') : html`<div class="esq" style="height:90px"></div>`}</div>`);
  if (!demo && hist && hist.mandatos.length) {
    ctx.porAno().then(r => {
      const corpo = $('#v-prod-corpo');
      if (!corpo) return;
      const ok = r.anos.filter(a => a.n != null);
      const total = ok.reduce((a, x) => a + x.n, 0);
      const legIni = hist.legislaturaAtual ? Number(hist.legislaturaAtual.ini.slice(0, 4)) : null;
      const noMandato = legIni ? ok.filter(a => a.ano >= legIni).reduce((a, x) => a + x.n, 0) : null;
      const anosMandato = hist.legislaturaAtual ? hist.legislaturaAtual.anos : 0;
      mostrar(corpo, html`<div class="numeros">
          <div class="numero"><span>Mandato atual</span><strong>${anosMandato ? dec(noMandato / anosMandato, 1) : '—'}</strong><small>projetos por ano · ${fmtNum.format(noMandato || 0)} em ${dec(anosMandato, 1)} anos</small></div>
          <div class="numero"><span>Todo o histórico</span><strong>${hist.anosEfetivos ? dec(total / hist.anosEfetivos, 1) : '—'}</strong><small>projetos por ano · ${fmtNum.format(total)} em ${dec(hist.anosEfetivos, 1)} anos</small></div>
        </div>
        ${r.falhas.length ? html`<p class="nota">Não foi possível ler ${r.falhas.length === 1 ? 'o ano' : 'os anos'} ${r.falhas.join(', ')}; o resultado pode estar subestimado.</p>` : ''}
        <p class="nota" style="margin-top:10px"><a href="#/federais/${id}/projetos">Ver ano a ano</a></p>
        ${selo('calculado', 'proporcional')}`);
    }).catch(() => { const c = $('#v-prod-corpo'); if (c) mostrar(c, indisponivel('Não foi possível consultar a Câmara agora.')); });
  }

  const botao = $('#v-pres-botao');
  if (botao) botao.addEventListener('click', async () => {
    const alvo = $('#v-presenca');
    mostrar(alvo, esqueletoLinhas(2));
    try { const d = await ctx.presenca(estado.ano); montarPresenca(alvo, d, { id, ano: estado.ano }); } catch (err) { console.error(err); mostrarErro(alvo, 'Não foi possível carregar a presença.', () => botao.click()); }
  });
}

/* ---------- Histórico de mandatos ---------- */

function painelHistorico(el, ctx) {
  const { hist, id, demo } = ctx;
  if (!hist) {
    return mostrar(el, html`<section class="cartao" style="margin-top:0"><h2 class="painel-titulo">Histórico de mandatos</h2>
      ${indisponivel(demo ? 'No modo demonstração não há histórico.' : 'O histórico oficial deste deputado ainda não foi gerado. Ele é atualizado uma vez por semana.')}</section>`);
  }
  const f = hist.ficha || {};
  const g = f.gabinete || {};
  const mandatos = [...hist.mandatos].reverse();
  const eventos = [...(hist.eventos || [])].reverse();
  const classe = ev => (/Licença|Afastamento|Suplência/i.test(ev.situacao + ' ' + ev.texto) ? 'aviso' : ev.situacao === 'Exercício' ? 'ativo' : '');

  mostrar(el, html`
    <section class="cartao" style="margin-top:0">
      <h2 class="painel-titulo">Tempo de exercício efetivo ${selo('calculado', 'quantitativo')}</h2>
      <p class="painel-sub">Soma só dos dias em que a Câmara registra o deputado “em exercício”. Licenças, afastamentos e períodos de suplente em que outra pessoa ocupou a vaga não entram. Mandato e tempo de exercício não são a mesma coisa.</p>
      <div class="numeros">
        <div class="numero"><span>Em todo o histórico</span><strong>${dec(hist.anosEfetivos, 2)} anos</strong><small>${fmtNum.format(hist.diasTotais)} dias</small></div>
        <div class="numero"><span>Mandato atual</span><strong>${hist.legislaturaAtual ? dec(hist.legislaturaAtual.anos, 2) + ' anos' : '—'}</strong><small>${hist.legislaturaAtual ? `${fmtNum.format(hist.legislaturaAtual.dias)} dias` : 'sem exercício no mandato atual'}</small></div>
        <div class="numero"><span>Mandatos na Câmara</span><strong>${hist.mandatos.length}</strong><small>${hist.anoInicio ? `o primeiro com posse em ${hist.anoInicio}` : ''}</small></div>
      </div>
    </section>

    <section class="cartao">
      <h2 class="painel-titulo">Mandatos ${selo('oficial')}</h2>
      <p class="painel-sub">Um mandato por legislatura (4 anos) em que houve exercício na Câmara.</p>
      ${mandatos.length ? mandatos.map(m => html`<div class="mandato">
        <div class="mandato-topo"><strong>${m.leg}ª legislatura · ${m.ini.slice(0, 4)}–${m.fim.slice(0, 4)}</strong>
          <span>${m.emCurso ? html`<span class="etq etq-neutra">Em curso</span>` : m.completo ? html`<span class="etq etq-ok">Mandato completo</span>` : html`<span class="etq etq-parcial">Mandato incompleto</span>`}
          ${m.condicao ? html` <span class="etq etq-neutra">${m.condicao}</span>` : ''}</span></div>
        <p class="painel-sub" style="margin:6px 0 0">${fmtNum.format(m.dias)} dias de exercício efetivo (${dec(m.dias / 365.25, 2)} anos) em ${fmtNum.format(m.diasLegislatura)} dias ${m.emCurso ? 'decorridos da legislatura' : 'de legislatura'}.</p>
        ${m.motivos && m.motivos.length ? html`<ul class="motivos">${m.motivos.map(t => html`<li>${t}</li>`)}</ul>` : ''}
      </div>`) : html`<p class="vazio">Nenhum mandato com exercício registrado na Câmara.</p>`}
      <p class="nota">A API da Câmara registra a partir da 50ª legislatura (1995). Mandatos anteriores, e cargos em outras Casas (Senado, Assembleias, prefeituras, governos), não aparecem aqui.</p>
    </section>

    ${eventos.length ? html`<section class="cartao">
      <h2 class="painel-titulo">Linha do tempo ${selo('oficial')}</h2>
      <p class="painel-sub">Posse, licenças, retornos e fim de mandato, do mais recente para o mais antigo.</p>
      <ul class="tempo">${eventos.slice(0, 8).map(ev => html`<li class="${classe(ev)}"><div class="tempo-data">${dataBR(ev.data)}</div><div class="tempo-texto">${ev.texto || ev.situacao}</div><div class="tempo-fonte">${ev.leg}ª legislatura · situação: ${ev.situacao}</div></li>`)}</ul>
      ${eventos.length > 8 ? html`<details class="datas" style="margin-top:12px"><summary>Ver os outros ${eventos.length - 8} eventos</summary>
        <ul class="tempo" style="margin-top:14px">${eventos.slice(8).map(ev => html`<li class="${classe(ev)}"><div class="tempo-data">${dataBR(ev.data)}</div><div class="tempo-texto">${ev.texto || ev.situacao}</div><div class="tempo-fonte">${ev.leg}ª legislatura · situação: ${ev.situacao}</div></li>`)}</ul></details>` : ''}
    </section>` : ''}

    ${(hist.direcao || []).length ? html`<section class="cartao">
      <h2 class="painel-titulo">Mesa Diretora ${selo('oficial')}</h2>
      <ul class="pontos" style="list-style:none;padding:0">${hist.direcao.map(d => html`<li><strong>${d.cargo}</strong> · ${d.leg}ª legislatura${d.ini ? `, desde ${dataBR(d.ini)}` : ''}${d.fim ? ` até ${dataBR(d.fim)}` : ''}</li>`)}</ul>
    </section>` : ''}

    ${(f.nomeCivil || f.nascimento || f.gabinete) ? html`<section class="cartao">
      <h2 class="painel-titulo">Dados cadastrais ${selo('oficial')}</h2>
      ${fichaHtml([
        ['Nome civil', f.nomeCivil],
        ['Nascimento', f.nascimento ? `${dataBR(f.nascimento)}${f.naturalidade ? ' · ' + f.naturalidade : ''}` : ''],
        ['Escolaridade', f.escolaridade],
        ['Gabinete', g.sala ? `Sala ${g.sala}, prédio ${g.predio || '-'}${g.telefone ? ` · tel. (61) ${g.telefone}` : ''}` : ''],
        ['E-mail', g.email]
      ])}
      ${(f.redes || []).length ? html`<p class="nota">${f.redes.map((u, i) => html`${i ? ' · ' : ''}<a href="${urlSegura(u)}" target="_blank" rel="noopener">${new URL(u).hostname.replace(/^www\./, '')}</a>`)}</p>` : ''}
    </section>` : ''}
    ${fonteLinha('Dados Abertos da Câmara dos Deputados (histórico do deputado)', hist.geradoEm, `${API}/deputados/${id}/historico`)}`);
}

/* ---------- Projetos ---------- */

async function painelProjetos(el, ctx, vale) {
  const { hist, id, demo } = ctx;
  if (demo) return mostrar(el, html`<section class="cartao" style="margin-top:0"><h2 class="painel-titulo">Projetos</h2>${indisponivel('No modo demonstração a consulta à Câmara fica desligada.')}</section>`);

  mostrar(el, html`
    <section class="cartao" style="margin-top:0">
      <h2 class="painel-titulo">Produção legislativa ${selo('calculado', 'quantitativo')}</h2>
      <p class="painel-sub">Projetos e propostas (PL, PLP, PEC, PDL, PRC, MPV e semelhantes) em que o deputado consta como autor ou coautor, por ano. Não inclui requerimentos, emendas nem pareceres.</p>
      <div id="p-graf">${esqueletoLinhas(2)}</div>
    </section>
    <section class="cartao">
      <h2 class="painel-titulo">Projetos aprovados e transformados em lei</h2>
      ${indisponivel('A API da Câmara não permite contar, de forma confiável, quantos projetos de cada deputado foram aprovados ou viraram lei. Por isso o Placar Público não mostra esse número, em vez de arriscar um valor errado.')}
    </section>
    <section class="cartao">
      ${seletorAno('Ano da lista')}
      <div id="p-lista">${esqueletoLinhas(4)}</div>
    </section>`);

  $('#ano').addEventListener('change', e => { estado.ano = Number(e.target.value); salvarAno(estado.ano); perfilAtual.redesenhar(); });

  ctx.porAno().then(r => {
    if (!vale()) return;
    const ok = r.anos.filter(a => a.n != null);
    const total = ok.reduce((a, x) => a + x.n, 0);
    const maximo = Math.max(1, ...ok.map(a => a.n));
    const legIni = hist && hist.legislaturaAtual ? Number(hist.legislaturaAtual.ini.slice(0, 4)) : null;
    const noMandato = legIni ? ok.filter(a => a.ano >= legIni).reduce((a, x) => a + x.n, 0) : null;
    const anosMandato = hist && hist.legislaturaAtual ? hist.legislaturaAtual.anos : 0;
    mostrar($('#p-graf'), html`
      <div class="numeros">
        <div class="numero"><span>Total desde ${r.anos[0].ano}</span><strong>${fmtNum.format(total)}</strong><small>projetos e propostas</small></div>
        <div class="numero"><span>Por ano de exercício, no mandato atual</span><strong>${anosMandato ? dec(noMandato / anosMandato, 1) : '—'}</strong><small>${anosMandato ? `${fmtNum.format(noMandato)} em ${dec(anosMandato, 1)} anos efetivos` : MSG_INDISPONIVEL}</small></div>
        <div class="numero"><span>Por ano de exercício, em todo o histórico</span><strong>${hist && hist.anosEfetivos ? dec(total / hist.anosEfetivos, 1) : '—'}</strong><small>${hist && hist.anosEfetivos ? `${fmtNum.format(total)} em ${dec(hist.anosEfetivos, 1)} anos efetivos` : MSG_INDISPONIVEL}</small></div>
      </div>
      <div class="graf" role="img" aria-label="Projetos apresentados por ano">${r.anos.map(a => html`<div class="graf-col">
        <span class="graf-val">${a.n == null ? '?' : a.n}</span>
        <span class="graf-barra ${a.ano === ANO_ATUAL ? 'atual' : ''} ${a.n === 0 ? 'zero' : ''}" style="height:${a.n == null ? 2 : Math.max(2, a.n / maximo * 100)}%"></span>
        <span class="graf-ano" title="${a.ano}">${r.anos.length > 9 ? "'" + String(a.ano).slice(2) : a.ano}</span></div>`)}</div>
      <p class="nota">${ANO_ATUAL} está em andamento (barra verde). A produção por ano de exercício divide o total pelos anos em que o deputado esteve efetivamente em exercício, e não pelo tempo de mandato.${r.falhas.length ? ` Não foi possível ler: ${r.falhas.join(', ')}.` : ''}</p>`);
  }).catch(() => { if (vale()) mostrar($('#p-graf'), indisponivel('Não foi possível consultar a Câmara agora.')); });

  try {
    const d = await ctx.projetos(estado.ano);
    if (!vale()) return;
    montarProjetos($('#p-lista'), d, { ano: estado.ano });
  } catch (e) {
    console.error(e);
    if (vale()) mostrarErro($('#p-lista'), 'Não foi possível carregar a lista de proposições.', () => perfilAtual.redesenhar());
  }
}

/* ---------- Como votou? ---------- */

const normalizarBusca = s => semAcento(String(s || '')).replace(/\s+/g, ' ').trim();

async function painelComoVotou(el, ctx, vale) {
  const { item, id } = ctx;
  let v;
  try { v = await ctx.votos(); } catch (e) {
    if (!vale()) return;
    return mostrar(el, html`<section class="cartao" style="margin-top:0"><h2 class="painel-titulo">Como votou?</h2>
      ${indisponivel('O arquivo de votações ainda não foi gerado. Ele aparece depois da próxima atualização diária.')}</section>`);
  }
  if (!vale()) return;
  const linha = v.deputados[String(id)];
  if (!linha) {
    return mostrar(el, html`<section class="cartao" style="margin-top:0"><h2 class="painel-titulo">Como votou?</h2>${indisponivel('Este deputado não consta na lista de votações do ano.')}</section>`);
  }
  const registros = v.votacoes.map((vt, k) => ({ vt, letra: linha[k] || '-' }));
  const cont = {};
  registros.forEach(r => { cont[r.letra] = (cont[r.letra] || 0) + 1; });
  const fora = cont._ || 0;
  const votou = registros.filter(r => 'SNAOPX'.includes(r.letra)).length;
  const noPeriodo = registros.length - fora;
  const chaves = ['S', 'N', 'A', 'O', 'P', 'X', '-'].filter(k => cont[k]);
  const vista = { tipo: 'todos', voto: 'todos', busca: '', limite: 15 };
  const tipos = ['principal', 'emenda', 'destaque', 'substitutivo', 'requerimento', 'outro'].filter(t => registros.some(r => r.vt.tipo === t));

  mostrar(el, html`
    <section class="cartao" style="margin-top:0">
      <h2 class="painel-titulo">Como votou? ${selo('oficial')}</h2>
      <p class="painel-sub">${plural(registros.length, 'votação nominal', 'votações nominais')} do Plenário em ${v.ano}. Votações simbólicas, em que ninguém registra voto individual, não entram. O voto é o que a Câmara registrou; o Placar Público não interpreta nem dá valor ao voto.</p>
      <p><strong style="font-size:1.4rem">${votou}</strong> de ${noPeriodo} <span class="painel-sub">votações do período em que registrou voto ${selo('calculado', 'proporcional')}</span></p>
      <div class="pilha" role="img" aria-label="Distribuição dos votos">${chaves.map(k => html`<span class="cor-${CHAVE_LETRA[k]}" style="flex:${cont[k]}" title="${ROTULO_LETRA[k]}: ${cont[k]}"></span>`)}</div>
      <ul class="legenda">${chaves.map(k => html`<li><i class="cor-${CHAVE_LETRA[k]}"></i>${ROTULO_LETRA[k]} <b>${cont[k]}</b></li>`)}${fora ? html`<li><i class="cor-ausente"></i>Antes da 1ª presença <b>${fora}</b></li>` : ''}</ul>
    </section>

    <section class="cartao">
      <div class="campo" style="margin-bottom:8px"><span>Buscar uma matéria</span></div>
      <div class="busca-grande">${icone('busca', 20)}<input id="v-busca" type="search" placeholder="Ex.: PL 1632/2023, escala 6x1, reforma" autocomplete="off" aria-label="Buscar uma matéria"></div>
      <p class="nota" style="margin-top:10px">Procura no número da matéria, no texto oficial da votação e na ementa.</p>
      <div class="chips" role="group" aria-label="Tipo de votação" style="margin-top:12px">
        <button class="chip" type="button" data-tipo="todos" aria-pressed="true">Todas<b>${registros.length}</b></button>
        ${tipos.map(t => html`<button class="chip" type="button" data-tipo="${t}" aria-pressed="false">${ROTULO_TIPO_VOTACAO[t]}<b>${registros.filter(r => r.vt.tipo === t).length}</b></button>`)}
      </div>
      <div class="chips" role="group" aria-label="Filtrar por voto" style="margin-top:8px">
        <button class="chip" type="button" data-voto="todos" aria-pressed="true">Qualquer voto</button>
        ${chaves.map(k => html`<button class="chip" type="button" data-voto="${k}" aria-pressed="false">${ROTULO_LETRA[k]}<b>${cont[k]}</b></button>`)}
      </div>
    </section>
    <p class="contagem" id="v-contagem" aria-live="polite" style="margin-top:14px"></p>
    <ul id="v-lista"></ul>
    <div class="mais-itens" id="v-mais"></div>
    <p class="nota">As votações são separadas pelo texto oficial: proposta principal, emenda, substitutivo, destaque e requerimento são coisas diferentes, e o resultado de uma não vale para a outra.
      Uma ausência de voto pode ser falta, licença ou mandato ainda não iniciado. Nas votações secretas, a Câmara informa quem participou, mas não como votou.
      Se a Câmara corrigir uma votação, a mudança fica registrada em <a href="#/noticias">Notícias</a>.</p>
    ${fonteLinha('Dados Abertos da Câmara dos Deputados (votações e votos)', v.geradoEm, `${API}/votacoes`)}`);

  const lista = $('#v-lista');
  const desenhar = () => {
    $$('[data-tipo]', el).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tipo === vista.tipo)));
    $$('[data-voto]', el).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.voto === vista.voto)));
    const q = normalizarBusca(vista.busca);
    const filtrados = registros.filter(r => (vista.tipo === 'todos' || r.vt.tipo === vista.tipo)
      && (vista.voto === 'todos' || r.letra === vista.voto)
      && (!q || normalizarBusca(`${r.vt.materia || ''} ${r.vt.titulo} ${r.vt.resumo || ''}`).includes(q)));
    const visiveis = filtrados.slice(0, vista.limite);
    $('#v-contagem').textContent = plural(filtrados.length, 'votação', 'votações');
    mostrar(lista, filtrados.length ? html`${visiveis.map(({ vt, letra }) => cartaoVotacao(vt, letra))}` : html`<li class="voto-card"><strong>${q ? MSG_SEM_VOTACAO : 'Nenhuma votação com esses filtros.'}</strong>
      ${q ? html`<p class="voto-ementa">Isso pode significar que a matéria não foi votada nominalmente no Plenário em ${v.ano}, ou que foi votada de forma simbólica (sem voto individual). O Placar Público não preenche essa lacuna.</p>` : ''}</li>`);
    mostrar($('#v-mais'), filtrados.length > vista.limite ? html`<button class="botao" type="button" data-mais>Mostrar mais (${filtrados.length - vista.limite} restantes)</button>` : html``);
  };
  el.addEventListener('click', e => {
    const t = e.target.closest('[data-tipo]'); if (t) { vista.tipo = t.dataset.tipo; vista.limite = 15; return desenhar(); }
    const b = e.target.closest('[data-voto]'); if (b) { vista.voto = b.dataset.voto; vista.limite = 15; return desenhar(); }
    if (e.target.closest('[data-mais]')) { vista.limite += 15; desenhar(); }
  });
  $('#v-busca').addEventListener('input', e => { vista.busca = e.target.value; vista.limite = 15; desenhar(); });
  desenhar();
}

function cartaoVotacao(vt, letra) {
  const aprov = vt.aprovacao === 1 ? html`<span class="resultado-ofi aprov">Aprovada</span>` : vt.aprovacao === 0 ? html`<span class="resultado-ofi rejeit">Rejeitada</span>` : html`<span class="resultado-ofi">Resultado não informado</span>`;
  const principal = vt.tipo === 'principal';
  return html`<li class="voto-card">
    <div class="voto-topo"><time>${dataBR(vt.data)}</time><span class="tipo-voto ${principal ? '' : 'secundaria'}">${ROTULO_TIPO_VOTACAO[vt.tipo] || 'Votação'}</span>${aprov}</div>
    ${vt.materia ? html`<div class="voto-materia">${vt.materia}</div>` : ''}
    <div class="voto-texto">${vt.titulo}</div>
    ${vt.resumo ? html`<div class="voto-ementa">${vt.resumo.length > 300 ? vt.resumo.slice(0, 300) + '…' : vt.resumo}</div>` : ''}
    <div class="voto-rodape">
      <span class="voto-placar">Placar: ${fmtNum.format(vt.sim)} Sim · ${fmtNum.format(vt.nao)} Não · ${fmtNum.format(vt.outros)} outros</span>
      <span class="pill v-${CHAVE_LETRA[letra]}">${ROTULO_LETRA[letra] || letra}</span>
    </div>
    <div class="voto-fonte"><a href="${urlSegura(vt.fonte)}" target="_blank" rel="noopener">Fonte: API da Câmara</a>${vt.portal ? html`<a href="${urlSegura(vt.portal)}" target="_blank" rel="noopener">Ver a matéria no portal da Câmara</a>` : ''}</div>
  </li>`;
}

/* ---------- Emendas ---------- */

function painelEmendas(el) {
  mostrar(el, html`<section class="cartao" style="margin-top:0">
    <h2 class="painel-titulo">Emendas parlamentares <span class="em-breve">em desenvolvimento</span></h2>
    <p class="painel-sub">Valores indicados e pagos por emendas ao orçamento.</p>
    ${indisponivel('Esse dado não vem da API de Dados Abertos da Câmara. A fonte oficial é o Portal da Transparência do Governo Federal, e a ligação com ele é uma das próximas etapas. Até lá, nenhum valor de emenda é mostrado.')}
    <p class="nota"><a href="https://portaldatransparencia.gov.br/emendas" target="_blank" rel="noopener">Consultar emendas no Portal da Transparência</a></p>
  </section>`);
}

/* ---------- Gastos ---------- */

async function painelGastosFed(el, ctx, vale) {
  if (ctx.demo) return mostrar(el, html`<section class="cartao" style="margin-top:0"><h2 class="painel-titulo">Gastos</h2>${indisponivel('No modo demonstração a consulta à Câmara fica desligada.')}</section>`);
  mostrar(el, html`<section class="cartao" style="margin-top:0">${seletorAno()}<div id="g-corpo">${esqueletoLinhas(4)}</div></section>`);
  $('#ano').addEventListener('change', e => { estado.ano = Number(e.target.value); salvarAno(estado.ano); perfilAtual.redesenhar(); });
  try {
    const d = await ctx.gastos(estado.ano);
    if (!vale()) return;
    montarGastos($('#g-corpo'), d, { id: ctx.id, ano: estado.ano });
    $('#g-corpo').insertAdjacentHTML('beforeend', `<p class="fonte-linha">${selo('calculado', 'quantitativo').s}</p>`);
  } catch (e) {
    console.error(e);
    if (vale()) mostrarErro($('#g-corpo'), 'Não foi possível carregar os gastos.', () => perfilAtual.redesenhar());
  }
}

/* ---------- Fiscalização ---------- */

const INSTRUMENTOS_FISCALIZACAO = [
  ['RIC', 'Requerimentos de informação', 'Pedem informações por escrito a ministros e órgãos do governo.'],
  ['PFC', 'Propostas de fiscalização e controle', 'Pedem que a Câmara fiscalize um ato ou uma política do Executivo.'],
  ['RCP', 'Requerimentos de CPI', 'Pedem a criação de uma Comissão Parlamentar de Inquérito.']
];

async function painelFiscalizacao(el, ctx, vale) {
  if (ctx.demo) return mostrar(el, html`<section class="cartao" style="margin-top:0"><h2 class="painel-titulo">Fiscalização</h2>${indisponivel('No modo demonstração a consulta à Câmara fica desligada.')}</section>`);
  mostrar(el, html`
    <section class="cartao" style="margin-top:0">
      <h2 class="painel-titulo">Instrumentos de fiscalização apresentados ${selo('calculado', 'quantitativo')}</h2>
      <p class="painel-sub">Quantos pedidos de fiscalização o deputado apresentou no ano. Quantidade não mede resultado nem qualidade.</p>
      ${seletorAno()}
      <div id="f-instr">${esqueletoLinhas(2)}</div>
    </section>
    <section class="cartao">
      <h2 class="painel-titulo">Comissões e órgãos ${selo('oficial')}</h2>
      <div id="f-orgaos">${esqueletoLinhas(3)}</div>
    </section>`);
  $('#ano').addEventListener('change', e => { estado.ano = Number(e.target.value); salvarAno(estado.ano); perfilAtual.redesenhar(); });

  ctx.projetos(estado.ano).then(d => {
    if (!vale()) return;
    const cont = s => d.itens.filter(p => p.siglaTipo === s).length;
    mostrar($('#f-instr'), html`<div class="numeros">${INSTRUMENTOS_FISCALIZACAO.map(([s, nome, texto]) => html`<div class="numero"><span>${nome}</span><strong>${fmtNum.format(cont(s))}</strong><small>${texto}</small></div>`)}</div>
      <p class="nota">Em ${estado.ano}${d.truncado ? ' (lista limitada)' : ''}. Como autor ou coautor.</p>`);
  }).catch(() => { if (vale()) mostrar($('#f-instr'), indisponivel('Não foi possível consultar a Câmara agora.')); });

  ctx.orgaos().then(os => {
    if (!vale()) return;
    const atuais = os.filter(o => !o.fim);
    const antigos = os.filter(o => o.fim);
    const linha = o => html`<li><strong>${o.sigla}</strong> · ${o.nome}<br><span class="painel-sub" style="margin:0">${o.papel || 'Membro'} · desde ${dataBR(o.ini)}${o.fim ? ` até ${dataBR(o.fim)}` : ''}</span></li>`;
    mostrar($('#f-orgaos'), os.length ? html`
      <p class="painel-sub">${plural(atuais.length, 'órgão em que participa hoje', 'órgãos em que participa hoje')}.</p>
      <ul class="pontos" style="list-style:none;padding:0">${atuais.map(linha)}</ul>
      ${antigos.length ? html`<details class="datas" style="margin-top:12px"><summary>Ver os ${antigos.length} em que já participou</summary><ul class="pontos" style="list-style:none;padding:0;margin-top:10px">${antigos.map(linha)}</ul></details>` : ''}`
      : indisponivel('A Câmara não informa comissões para este deputado.'));
  }).catch(() => { if (vale()) mostrar($('#f-orgaos'), indisponivel('Não foi possível consultar a Câmara agora.')); });
}

/* ---------- Notícias do deputado (geradas dos dados oficiais) ---------- */

async function painelNoticiasFed(el, ctx, vale) {
  const { id, hist, item, demo } = ctx;
  const itens = [];
  try {
    const v = await ctx.votos();
    const linha = v.deputados[String(id)] || '';
    v.votacoes.forEach((vt, k) => {
      const l = linha[k];
      if (!l || l === '-' || l === '_' || itens.filter(i => i.tipo === 'voto').length >= 6) return;
      itens.push({ tipo: 'voto', data: vt.data, titulo: `Voto registrado: ${ROTULO_LETRA[l]}${vt.materia ? ' · ' + vt.materia : ''}`,
        texto: vt.resumo || vt.titulo, resultado: vt.aprovacao === 1 ? 'aprovada' : vt.aprovacao === 0 ? 'rejeitada' : '', fonte: vt.fonte, portal: vt.portal });
    });
  } catch (e) { /* sem o arquivo de votos, o resto continua */ }
  if (hist) (hist.eventos || []).slice(-5).forEach(ev => itens.push({ tipo: 'mandato', data: ev.data, titulo: ev.texto || ev.situacao, texto: `${ev.leg}ª legislatura · situação registrada: ${ev.situacao}.`, fonte: `${API}/deputados/${id}/historico` }));
  if (!demo) {
    try {
      const d = await ctx.projetos(estado.ano);
      d.itens.filter(p => SIGLAS_PROJETO.has(p.siglaTipo)).slice(0, 4).forEach(p => itens.push({ tipo: 'projeto', data: (p.dataApresentacao || '').slice(0, 10), titulo: `Apresentou ${nomeProposicao(p)}`, texto: p.ementa || 'Sem ementa informada.', fonte: `${API}/proposicoes/${p.id}`, portal: `${PORTAL}/propostas-legislativas/${p.id}` }));
    } catch (e) { /* sem rede: segue sem projetos */ }
  }
  if (!vale()) return;
  itens.sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const rotuloTipo = { voto: 'Votação', mandato: 'Mandato', projeto: 'Projeto' };
  mostrar(el, html`
    <section class="cartao" style="margin-top:0">
      <h2 class="painel-titulo">Notícias automáticas</h2>
      <p class="painel-sub">Pequenos resumos gerados por regra a partir de dados oficiais (votos, histórico de mandato, projetos). Não são reportagens: cada item mostra o dado, a data e a fonte para você conferir. Se a fonte oficial corrigir algo, a mudança aparece em <a href="#/noticias">Notícias</a>, no histórico de correções.</p>
    </section>
    ${itens.length ? html`${itens.map(n => html`<article class="noticia">
      <div class="noticia-topo"><time>${dataBR(n.data)}</time><span class="tipo-voto secundaria">${rotuloTipo[n.tipo]}</span>${n.resultado ? html`<span>Matéria ${n.resultado}</span>` : ''}${selo('oficial')}</div>
      <h3>${n.titulo}</h3>
      ${n.texto ? html`<p>${n.texto.length > 280 ? n.texto.slice(0, 280) + '…' : n.texto}</p>` : ''}
      <div class="noticia-fonte">${n.fonte ? html`<a href="${urlSegura(n.fonte)}" target="_blank" rel="noopener">Fonte: API da Câmara</a>` : ''}${n.portal ? html`<a href="${urlSegura(n.portal)}" target="_blank" rel="noopener">Portal da Câmara</a>` : ''}</div>
    </article>`)}` : html`<div class="cartao">${indisponivel('Ainda não há itens para mostrar.')}</div>`}`);
}

/* ---------- Fontes do perfil ---------- */

function painelFontesFed(el, ctx) {
  const f = (DADOS.meta && DADOS.meta.fontes) || {};
  const quando = x => (x && x.atualizadoEm ? dataHoraBR(x.atualizadoEm) : '—');
  const linhas = [
    ['Índice, presença, votos no ano, projetos do ano, cota', 'Arquivos abertos da Câmara (eventos, presenças, votações, proposições, cota parlamentar)', 'https://dadosabertos.camara.leg.br/swagger/api.html', 'Todo dia', quando(f.camara)],
    ['Como votou?', 'Dados Abertos da Câmara (votações e votos)', `${API}/votacoes`, 'Todo dia', quando(f.camara)],
    ['Histórico de mandatos, Mesa Diretora, dados cadastrais', 'Dados Abertos da Câmara (histórico do deputado, legislaturas)', `${API}/deputados/${ctx.id}/historico`, 'Toda semana', quando(f.historico)],
    ['Projetos por ano, lista de proposições, presença detalhada, gastos, comissões', 'Dados Abertos da Câmara, consultados na hora em que a aba é aberta', `${API}/deputados/${ctx.id}`, 'Ao vivo', 'na hora'],
    ['Emendas parlamentares', 'Portal da Transparência (ainda não integrado)', 'https://portaldatransparencia.gov.br/emendas', '—', '—']
  ];
  mostrar(el, html`<section class="cartao" style="margin-top:0">
    <h2 class="painel-titulo">De onde vem cada informação</h2>
    <p class="painel-sub">Tudo vem de fontes oficiais abertas. O índice de 0 a 100 é uma regra do Placar Público aplicada a esses dados; as regras estão na <a href="#/metodologia">Metodologia</a>.</p>
    <div class="rolagem"><table class="tabela"><thead><tr><th>O quê</th><th>Fonte</th><th class="curto">Atualização</th><th class="curto">Última vez</th></tr></thead>
      <tbody>${linhas.map(([o, fo, url, atu, ult]) => html`<tr><td>${o}</td><td><a href="${url}" target="_blank" rel="noopener">${fo}</a></td><td class="curto">${atu}</td><td class="curto">${ult}</td></tr>`)}</tbody></table></div>
    <p class="nota">${ctx.demo ? 'No modo demonstração nada disto é real.' : html`Perfil oficial deste deputado: <a href="${PORTAL}/deputados/${ctx.id}" target="_blank" rel="noopener">portal da Câmara</a>.`}</p>
  </section>`);
}

/* ---------- Gestão da Presidência da Câmara ---------- */

async function painelPresidencia(el, ctx, vale) {
  const { presidencia, dado, id } = ctx;
  let v = null;
  try { v = await ctx.votos(); } catch (e) { /* o painel funciona sem o arquivo de votos */ }
  if (!vale()) return;
  const aprov = v ? v.votacoes.filter(x => x.aprovacao === 1).length : null;
  const rejeit = v ? v.votacoes.filter(x => x.aprovacao === 0).length : null;
  mostrar(el, html`
    <section class="cartao" style="margin-top:0">
      <h2 class="painel-titulo">Gestão da Presidência da Câmara ${selo('oficial')}</h2>
      <p class="painel-sub">Presidente da Câmara dos Deputados${presidencia.ini ? ` desde ${dataBR(presidencia.ini)}` : ''}, na Mesa Diretora da ${presidencia.leg}ª legislatura. Este painel mostra o que a Câmara toda fez no ano, o que é o campo de atuação do cargo.</p>
      <div class="numeros">
        <div class="numero"><span>Sessões deliberativas do Plenário</span><strong>${fmtNum.format(dado.sessoes || 0)}</strong><small>encerradas em ${dado.ano}</small>${selo('calculado', 'quantitativo')}</div>
        <div class="numero"><span>Votações nominais</span><strong>${fmtNum.format(dado.votacoes || 0)}</strong><small>do Plenário em ${dado.ano}</small></div>
        <div class="numero"><span>Aprovadas / rejeitadas</span><strong>${aprov == null ? '—' : `${aprov} / ${rejeit}`}</strong><small>entre as votações nominais, pelo resultado oficial</small></div>
      </div>
    </section>
    <section class="cartao">
      <h2 class="painel-titulo">Pauta, tempo de tramitação e resultados de gestão</h2>
      ${indisponivel('Pauta (o que foi colocado em votação e o que ficou de fora), tempo médio de tramitação e comparações entre presidências exigem séries históricas que ainda não estão integradas. Nenhum desses números é mostrado até que haja fonte oficial.')}
    </section>
    <section class="cartao cartao-aviso"><h3>Atenção</h3><p>Os números acima descrevem a Casa, não são uma nota da pessoa que a preside. O índice dela, na Visão geral, mede só a atuação como deputado(a). <a href="#/federais/${id}">Voltar à Visão geral</a>.</p></section>`);
}

/* =====================================================================
   Governador e prefeito
   ===================================================================== */

async function viewExecutivo(cargo, uf, id, abaInicial, token) {
  const c = CARGOS[cargo];
  const voltar = [`#/${cargo}`, c.rotulo];
  mostrar(app, esqueletoPerfil(...voltar));
  let dado;
  try {
    dado = await lerArquivo(cargo === 'governadores' ? 'governadores.json' : `prefeitos-${uf}.json`);
  } catch (e) {
    console.error(e);
    if (token === rotaToken) { mostrar(app, html`<div id="erro"></div>`); mostrarErro($('#erro'), 'Não foi possível carregar esta página.', () => viewExecutivo(cargo, uf, id, abaInicial, token)); }
    return;
  }
  if (token !== rotaToken) return;
  const item = dado.itens.find(i => i.id === String(id));
  if (!item) return naoEncontrado(...voltar, c.singular);

  const ehPref = cargo === 'prefeitos';
  document.title = `${item.nome} · Placar Público`;
  const totalNacional = ehPref ? ((DADOS.meta.cargos || {}).prefeitos || {}).comNota : dado.comNota;
  const lugar = ehPref ? `${item.municipio}/${uf}` : NOMES_UF[uf] || uf;
  const selos = [html`<span class="distintivo">Eleito(a) em ${dado.ano ?? ''}</span>`];
  if (item.rank != null) selos.push(html`<span class="distintivo distintivo-neutro">${fmtNum.format(item.rank)}º entre ${fmtNum.format(totalNacional)}${ehPref ? ' no país' : ''}</span>`);
  if (ehPref && item.rank != null) {
    const doEstado = dado.itens.filter(i => i.nota != null);
    selos.push(html`<span class="distintivo distintivo-neutro">${fmtNum.format(doEstado.filter(i => i.rank < item.rank).length + 1)}º entre ${fmtNum.format(doEstado.length)} em ${uf}</span>`);
  }

  mostrar(app, html`
    <a class="voltar" href="${voltar[0]}">${icone('voltar', 16)}${voltar[1]}</a>
    ${heroPerfil({ item, cargoTxt: `${c.singular} de ${lugar}`, meta: `${item.partido || 'Sem partido'}${item.urna && item.urna !== item.nome ? ' · nome de urna: ' + item.urna : ''}`, selos })}
    ${barraAbas(ABAS_EXECUTIVO, `#/${cargo}/${uf}/${id}`)}
    <section class="painel" id="painel" role="tabpanel" aria-live="polite"></section>`);

  const ctx = { item, dado, cargo, uf, id, ehPref, lugar, c };
  const PAINEIS = {
    visao: painelVisaoExec, economia: painelEconomia, gastos: painelGastosExec, contas: painelContas, fontes: painelFontesExec,
    saude: el => mostrar(el, painelEmDesenvolvimento({ titulo: 'Saúde', ic: 'coracao', oQue: `Quanto ${ehPref ? 'a prefeitura' : 'o governo estadual'} aplica em saúde e como isso se compara ao mínimo exigido pela Constituição.`, fontes: 'Siconfi (Relatório Resumido da Execução Orçamentária, anexo de saúde), SIOPS do Ministério da Saúde.' })),
    educacao: el => mostrar(el, painelEmDesenvolvimento({ titulo: 'Educação', ic: 'capelo', oQue: `Quanto ${ehPref ? 'a prefeitura' : 'o governo estadual'} aplica em educação e como isso se compara ao mínimo exigido pela Constituição.`, fontes: 'Siconfi (Relatório Resumido da Execução Orçamentária, anexo de manutenção e desenvolvimento do ensino), SIOPE do FNDE.' })),
    seguranca: el => mostrar(el, painelEmDesenvolvimento({ titulo: 'Segurança', ic: 'escudo', oQue: 'Indicadores de criminalidade e gasto em segurança pública.', fontes: 'Sinesp do Ministério da Justiça, secretarias estaduais de segurança.' })),
    obras: el => mostrar(el, painelEmDesenvolvimento({ titulo: 'Obras', ic: 'chave', oQue: 'Obras em andamento e concluídas, com valor e prazo.', fontes: 'ObrasGov.br e portais de transparência dos entes.' })),
    planejamento: el => mostrar(el, painelEmDesenvolvimento({ titulo: 'Planejamento', ic: 'calendario', oQue: 'Metas do plano plurianual, da lei de diretrizes e da lei orçamentária, e o quanto foi executado.', fontes: 'PPA, LDO e LOA publicados pelo próprio ente e pelo Siconfi.' }))
  };
  ligarAbas({
    chave: `${cargo}/${uf}/${id}`, abas: ABAS_EXECUTIVO, abaInicial, token,
    desenharPainel: (aba, painel, vale) => { mostrar(painel, html``); (PAINEIS[aba] || PAINEIS.visao)(painel, ctx, vale); }
  });
}

function painelVisaoExec(el, ctx) {
  const { item, dado, ehPref } = ctx;
  const k = item.contas;
  const exerc = dado.exercicio ?? '—';
  mostrar(el, html`
    ${k ? html`<h2 class="painel-titulo">Destaques das contas</h2>
    <p class="painel-sub">Contas de ${exerc}, o último ano fechado no Tesouro Nacional. Pertencem à administração daquele ano.</p>
    <div class="tiles">
      ${tile({ icone: 'pessoas', cor: 'azul', rotulo: 'Gasto com pessoal', valor: k.pessoal != null ? dec(k.pessoal) + '%' : '—', legenda: k.pessoal != null ? `da receita corrente líquida · limite legal ${k.limitePessoal}%` : MSG_INDISPONIVEL, origem: k.pessoal != null ? 'oficial' : '', natureza: 'proporcional', href: `#/${ctx.cargo}/${ctx.uf}/${ctx.id}/gastos` })}
      ${tile({ icone: 'cifrao', cor: 'laranja', rotulo: 'Dívida líquida', valor: k.divida != null ? dec(k.divida) + '%' : '—', legenda: k.divida != null ? `da receita corrente líquida · limite ${k.limiteDivida}%` : MSG_INDISPONIVEL, origem: k.divida != null ? 'oficial' : '', natureza: 'proporcional', href: `#/${ctx.cargo}/${ctx.uf}/${ctx.id}/economia` })}
      ${tile({ icone: 'predio', cor: 'verde', rotulo: 'População', valor: item.populacao ? popCurta(item.populacao) : '—', legenda: item.populacao ? `${fmtNum.format(item.populacao)} habitantes (Tesouro Nacional)` : MSG_INDISPONIVEL, origem: item.populacao ? 'oficial' : '', natureza: 'contexto' })}
      ${tile({ icone: 'arquivo', cor: 'roxo', rotulo: 'Prestação de contas', valor: k.entregas ? `${k.entregas.feitas} de ${k.entregas.esperado}` : '—', legenda: k.entregas ? 'relatórios obrigatórios entregues ao Tesouro' : MSG_INDISPONIVEL, origem: k.entregas ? 'calculado' : '', natureza: 'quantitativo', href: `#/${ctx.cargo}/${ctx.uf}/${ctx.id}/contas` })}
    </div>` : html`<section class="cartao" style="margin-top:0"><h2 class="painel-titulo">Destaques das contas</h2>
      <p class="painel-sub">${item.motivo || MSG_INDISPONIVEL}</p></section>`}
    ${fichaCartao(item)}
    ${cartaoIndice(item, 'executivos')}
    ${avisoEleitos(dado.ano ?? '', dado.exercicio ? `As contas usadas no índice são do exercício de ${dado.exercicio}, o último ano fechado no Tesouro Nacional.` : '')}`);
}

function fichaCartao(item) {
  const ficha = fichaHtml([
    ['Idade', item.idade ? `${item.idade} anos` : ''],
    ['Escolaridade', item.instrucao],
    ['Ocupação declarada', item.ocupacao]
  ]);
  return ficha.s ? html`<section class="cartao"><h2 class="painel-titulo">Quem é ${selo('oficial')}</h2>${ficha}<p class="nota" style="margin-top:8px">Dados declarados ao TSE na candidatura.</p></section>` : html``;
}

function painelEconomia(el, ctx) {
  const { item, dado, ehPref } = ctx;
  const k = item.contas;
  mostrar(el, html`<section class="cartao" style="margin-top:0">
    <h2 class="painel-titulo">Dívida consolidada líquida ${k && k.divida != null ? selo('oficial', 'proporcional') : ''}</h2>
    <p class="painel-sub">O que ${ehPref ? 'a prefeitura' : 'o estado'} deve, descontado o que tem em caixa e aplicações, comparado com a receita corrente líquida (a receita que entra todo ano, sem contar o que é repassado a outros entes). O limite vem de resolução do Senado Federal.</p>
    ${k && k.divida != null ? medidor({ valor: k.divida, limite: k.limiteDivida, legenda: `Contas de ${dado.exercicio ?? '—'}. Um valor negativo significa que há mais dinheiro em caixa do que dívida.` }) : indisponivel(item.motivo || 'Não há o relatório de dívida desta administração no Tesouro Nacional.')}
    ${fonteLinha('Tesouro Nacional, Siconfi (Relatório de Gestão Fiscal, anexo 2)', DADOS.meta && DADOS.meta.fontes && DADOS.meta.fontes.siconfi && DADOS.meta.fontes.siconfi.atualizadoEm, 'https://siconfi.tesouro.gov.br')}
  </section>
  <section class="cartao">
    <h2 class="painel-titulo">Receitas, despesas e orçamento</h2>
    ${indisponivel('Valores de arrecadação, despesa por função e execução do orçamento ainda não estão integrados. O Placar Público só mostra o que leu de uma fonte oficial.')}
    <p class="nota"><strong>Fonte oficial em estudo:</strong> Siconfi (Relatório Resumido da Execução Orçamentária).</p>
  </section>`);
}

function painelGastosExec(el, ctx) {
  const { item, dado, ehPref } = ctx;
  const k = item.contas;
  const lim = k ? k.limitePessoal : null;
  mostrar(el, html`<section class="cartao" style="margin-top:0">
    <h2 class="painel-titulo">Gasto com pessoal ${k && k.pessoal != null ? selo('oficial', 'proporcional') : ''}</h2>
    <p class="painel-sub">Quanto da receita corrente líquida ${ehPref ? 'a prefeitura' : 'o governo estadual'} gastou com salários, aposentadorias e encargos do Poder Executivo. A Lei de Responsabilidade Fiscal fixa um teto, e marca dois pontos de atenção antes dele: o limite de alerta (90% do teto) e o prudencial (95%).</p>
    ${k && k.pessoal != null ? medidor({ valor: k.pessoal, limite: lim, marcas: [{ v: +(lim * 0.9).toFixed(2), rot: '' }, { v: +(lim * 0.95).toFixed(2), rot: '' }], legenda: `Contas de ${dado.exercicio ?? '—'}. Limite de alerta: ${dec(lim * 0.9, 2)}% · prudencial: ${dec(lim * 0.95, 2)}% · máximo: ${lim}%.` }) : indisponivel(item.motivo || 'Não há o relatório de gestão fiscal desta administração no Tesouro Nacional.')}
    ${fonteLinha('Tesouro Nacional, Siconfi (Relatório de Gestão Fiscal, anexo 1)', DADOS.meta && DADOS.meta.fontes && DADOS.meta.fontes.siconfi && DADOS.meta.fontes.siconfi.atualizadoEm, 'https://siconfi.tesouro.gov.br')}
  </section>
  <section class="cartao">
    <h2 class="painel-titulo">Outros gastos</h2>
    ${indisponivel('A despesa por área (saúde, educação, obras...) e os maiores contratos ainda não estão integrados.')}
  </section>`);
}

function painelContas(el, ctx) {
  const { item, dado } = ctx;
  const e = item.contas && item.contas.entregas;
  const modelo = item.contas && item.contas.rgf;
  mostrar(el, html`<section class="cartao" style="margin-top:0">
    <h2 class="painel-titulo">Prestação de contas ao Tesouro Nacional ${e ? selo('calculado', 'quantitativo') : ''}</h2>
    <p class="painel-sub">Relatórios que a lei obriga ${ctx.ehPref ? 'a prefeitura' : 'o governo estadual'} a entregar a cada ano. Esta é uma informação de transparência: ela <strong>não entra no índice</strong>.</p>
    ${e ? html`<p><strong style="font-size:1.6rem">${e.feitas}</strong> de ${e.esperado} relatórios entregues em ${dado.exercicio ?? '—'}</p>
      <div class="barra" role="img" aria-label="${e.feitas} de ${e.esperado}"><span style="width:${e.esperado ? e.feitas / e.esperado * 100 : 0}%"></span></div>
      <div class="rolagem"><table class="tabela" style="margin-top:12px"><thead><tr><th>Relatório</th><th class="num">Entregues</th><th>O que é</th></tr></thead><tbody>
        <tr><td>RREO</td><td class="num">${e.rreo} de 6</td><td>Resumido da Execução Orçamentária: um por bimestre.</td></tr>
        <tr><td>RGF</td><td class="num">${e.rgf} de ${e.esperado - 7}</td><td>Gestão Fiscal: ${modelo === 'S2' ? 'versão semestral (municípios pequenos)' : 'um por quadrimestre'}.</td></tr>
        <tr><td>DCA</td><td class="num">${e.dca} de 1</td><td>Declaração de Contas Anuais, o balanço do ano.</td></tr>
      </tbody></table></div>
      <p class="nota">Só conta relatório homologado ou retificado no Siconfi. Um relatório pode estar atrasado por problema técnico; o número não aponta irregularidade.</p>`
      : indisponivel(item.motivo || 'Não há o extrato de entregas desta administração no Tesouro Nacional.')}
    ${fonteLinha('Tesouro Nacional, Siconfi (extrato de entregas)', DADOS.meta && DADOS.meta.fontes && DADOS.meta.fontes.siconfi && DADOS.meta.fontes.siconfi.atualizadoEm, 'https://siconfi.tesouro.gov.br')}
  </section>`);
}

function painelFontesExec(el, ctx) {
  const f = (DADOS.meta && DADOS.meta.fontes) || {};
  const quando = x => (x && x.atualizadoEm ? dataHoraBR(x.atualizadoEm) : '—');
  mostrar(el, html`<section class="cartao" style="margin-top:0">
    <h2 class="painel-titulo">De onde vem cada informação</h2>
    <div class="rolagem"><table class="tabela"><thead><tr><th>O quê</th><th>Fonte</th><th class="curto">Atualização</th><th class="curto">Última vez</th></tr></thead><tbody>
      <tr><td>Quem foi eleito, partido, idade, escolaridade, ocupação</td><td><a href="https://dadosabertos.tse.jus.br" target="_blank" rel="noopener">Dados Abertos do TSE</a></td><td class="curto">Toda semana</td><td class="curto">${quando(f.tse)}</td></tr>
      <tr><td>Gasto com pessoal, dívida, relatórios entregues, população</td><td><a href="https://siconfi.tesouro.gov.br" target="_blank" rel="noopener">Siconfi, Tesouro Nacional</a></td><td class="curto">Toda semana</td><td class="curto">${quando(f.siconfi)}</td></tr>
      <tr><td>Saúde, educação, segurança, obras, planejamento</td><td>Ainda sem fonte integrada</td><td class="curto">—</td><td class="curto">—</td></tr>
    </tbody></table></div>
    <p class="nota">O índice é uma regra do Placar Público aplicada às contas; veja a <a href="#/metodologia">Metodologia</a>. ${ctx.dado.exercicio ? `As contas são do exercício de ${ctx.dado.exercicio}.` : ''}</p>
  </section>`);
}

/* =====================================================================
   Deputado estadual e vereador (sem índice)
   ===================================================================== */

async function viewEleito(cargo, uf, id, token) {
  const c = CARGOS[cargo];
  const voltar = [`#/${cargo}`, c.rotulo];
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
    <a class="voltar" href="${voltar[0]}">${icone('voltar', 16)}${voltar[1]}</a>
    ${heroPerfil({ item, cargoTxt: `${c.singular} · ${lugar}`, meta: `${item.partido || 'Sem partido'}${item.urna && item.urna !== item.nome ? ' · nome de urna: ' + item.urna : ''}`, selos: [html`<span class="distintivo">${item.situacao || 'Eleito(a)'} em ${dado.ano}</span>`], anelNota: false })}
    <section class="cartao">
      <h2 class="painel-titulo">Sem índice por enquanto</h2>
      <p class="painel-sub" style="margin:0">${POR_QUE_SEM_NOTA[cargo]}</p>
    </section>
    ${fichaCartao(item)}
    ${avisoEleitos(dado.ano)}`);
}
