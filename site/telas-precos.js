'use strict';

/* =====================================================================
   Placar Público — aba "Preços no Brasil" do perfil do presidente
   Gasolina (ANP), dólar (Banco Central) e cesta básica (DIEESE/Conab).

   Regras que esta aba cumpre:
   - Só dado objetivo de fonte oficial, separado de qualquer nota ou avaliação política.
   - Nenhuma variação é atribuída ao presidente: o aviso fica no topo, e as séries
     mostram o que aconteceu em cada período, com as faixas de cada mandato.
   - Início e fim de cada período, data da última publicação de cada fonte e a
     cobertura da pesquisa (capitais) ficam à vista.
   - Mês ou capital sem dado aparece como lacuna ou como "Dado não encontrado ou
     não confirmado". Nada é completado com estimativa.
   - Os números do arquivo precos.json são lidos da fonte; variações são contas do
     Placar (selo "Calculado").
   ===================================================================== */

const COR_MANDATO = { temer: 'g3', bolsonaro: 'g1', lula: 'g0', janela: 'g4' };
const diaNum = iso => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
const diaMesNum = ym => diaNum(`${ym}-15`);
const fmtR = (v, c = 2) => (v == null ? '—' : `R$ ${decN(v, c)}`);
const fmtPct = (v, c = 2) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${decN(Math.abs(v), c)}%`);
const fmtDifR = (v, c = 2) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}R$ ${decN(Math.abs(v), c)}`);
const fmtHoras = h => { if (h == null) return '—'; const m = Math.round(h * 60); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}min`; };
const nomeCurtoMandato = id => ({ temer: 'Temer', bolsonaro: 'Bolsonaro', lula: 'Lula' }[id] || id);

/** Gráfico de linhas (SVG). series: [{ nome, cls, pts: [[x, y]] }]; bandas: [{ x0, x1, cls, nome }]. */
function graficoLinhas({ series, bandas = [], xmin, xmax, fmtY, ticksX, quebra = 0, janelaX = null, aria, zero = false, altura = 250, ultimo = true }) {
  const W = 560, H = altura, M = { e: 58, d: 14, t: 14, b: 30 };
  const valores = series.flatMap(s => s.pts.map(p => p[1])).filter(v => v != null);
  if (!valores.length) return html``;
  let min = Math.min(...valores), max = Math.max(...valores);
  if (zero) { min = Math.min(min, 0); max = Math.max(max, 0); }
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.1;
  const y0 = min - pad, y1 = max + pad;
  const X = x => M.e + (W - M.e - M.d) * (x - xmin) / ((xmax - xmin) || 1);
  const Y = v => M.t + (H - M.t - M.b) * (1 - (v - y0) / (y1 - y0));
  const trechos = s => {
    const lista = [];
    let atual = [];
    let ant = null;
    for (const [x, v] of s.pts) {
      if (v == null || x < xmin || x > xmax) continue;
      if (ant != null && quebra && x - ant > quebra) { lista.push(atual); atual = []; }
      atual.push([X(x), Y(v)]);
      ant = x;
    }
    if (atual.length) lista.push(atual);
    return lista;
  };
  // Marcas "redondas" no eixo vertical (por exemplo 4,00 / 5,00 / 6,00), dentro da faixa desenhada.
  const ticksY = (() => {
    const bruto = (y1 - y0) / 4;
    const exp = Math.pow(10, Math.floor(Math.log10(bruto)));
    const passo = [1, 2, 5, 10].map(m => m * exp).find(v => v >= bruto) || bruto;
    const lista = [];
    for (let v = Math.ceil(y0 / passo) * passo; v <= y1 + passo * 1e-9; v += passo) lista.push(Math.abs(v) < passo * 1e-9 ? 0 : v);
    return lista.length ? lista : [y0, y1];
  })();
  return html`<figure class="grafico">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${aria}" preserveAspectRatio="xMidYMid meet">
      ${bandas.map(b => html`<rect class="banda ${b.cls}" x="${X(b.x0).toFixed(1)}" y="${M.t}" width="${Math.max(0, X(b.x1) - X(b.x0)).toFixed(1)}" height="${H - M.t - M.b}"><title>${b.nome}</title></rect>`)}
      ${ticksY.map(v => html`<line class="gr-grade" x1="${M.e}" x2="${W - M.d}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="gr-txt" x="${M.e - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${fmtY(v)}</text>`)}
      ${zero ? html`<line class="gr-zero" x1="${M.e}" x2="${W - M.d}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>` : ''}
      ${ticksX.map(t => { const perto = X(t.x) > W - 46; return html`<text class="gr-txt" x="${(X(t.x) + (perto ? 0 : 3)).toFixed(1)}" y="${H - 8}" text-anchor="${perto ? 'end' : 'start'}">${t.r}</text>`; })}
      ${janelaX ? html`<rect class="gr-janela" x="${X(Math.max(xmin, janelaX[0])).toFixed(1)}" y="${H - M.b - 6}" width="${Math.max(0, X(Math.min(xmax, janelaX[1])) - X(Math.max(xmin, janelaX[0]))).toFixed(1)}" height="6"><title>Últimos 48 meses</title></rect>` : ''}
      ${series.map(s => html`<g class="${s.cls || ''}">${trechos(s).map(t => html`<polyline class="${s.cls ? 'curva' : 'gr-linha'}" fill="none" points="${t.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')}"/>`)}</g>`)}
      ${ultimo ? series.map(s => { const p = [...s.pts].reverse().find(q => q[1] != null && q[0] >= xmin && q[0] <= xmax); return p ? html`<g class="${s.cls || ''}"><circle class="${s.cls ? 'curva-ponto' : 'gr-ponto'}" cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3.6"><title>${s.nome}: ${fmtY(p[1])}</title></circle></g>` : ''; }) : ''}
    </svg>
  </figure>`;
}

const ticksAnos = (xmin, xmax) => {
  const lista = [];
  for (let a = new Date(xmin * 86400000).getUTCFullYear(); a <= new Date(xmax * 86400000).getUTCFullYear() + 1; a++) {
    const x = diaNum(`${a}-01-01`);
    if (x >= xmin && x <= xmax) lista.push({ x, r: String(a) });
  }
  return lista;
};

function bandasMandatos(p, xmin, xmax) {
  return p.mandatos.map(m => ({ x0: Math.max(xmin, diaNum(m.inicio)), x1: Math.min(xmax, m.fim ? diaNum(m.fim) : xmax), cls: COR_MANDATO[m.id], nome: `${m.nome}: ${dataBR(m.inicio)} a ${m.fim ? dataBR(m.fim) : 'em curso'}` })).filter(b => b.x1 > b.x0);
}

const legendaMandatos = (p, extra = '') => html`<ul class="leg-gestoes">${p.mandatos.map(m => html`<li class="${COR_MANDATO[m.id]}"><i></i>${m.nome} (${mesAnoBR(m.inicio)} a ${m.fim ? mesAnoBR(m.fim) : 'em curso'})</li>`)}${extra ? html`<li class="leg-janela"><i></i>${extra}</li>` : ''}</ul>`;

/** Curvas: variação % acumulada desde o início de cada mandato (x = meses desde o início). */
function graficoCurvas(p, curvas, { aria }) {
  const ids = ['temer', 'bolsonaro', 'lula'];
  const series = ids.map(id => ({ nome: nomeCurtoMandato(id), cls: COR_MANDATO[id], pts: (curvas[id] || []).map(([k, v]) => [k, v]) })).filter(s => s.pts.length);
  if (!series.length) return indisponivel('Sem dado confirmado no início de nenhum dos mandatos para esta série.');
  const xmax = Math.max(48, ...series.map(s => s.pts[s.pts.length - 1][0]));
  const ticks = [];
  for (let k = 0; k <= xmax; k += 12) ticks.push({ x: k, r: k === 0 ? 'início' : `${k / 12} ano${k > 12 ? 's' : ''}` });
  return html`${graficoLinhas({ series, xmin: 0, xmax, fmtY: v => `${decN(v, 0)}%`, ticksX: ticks, quebra: 1.5, zero: true, aria })}
    <ul class="leg-gestoes">${series.map(s => html`<li class="${s.cls}"><i></i>${s.nome}: ${s.pts.length} meses com dado${s.pts.length ? `, acumulado de ${fmtPct(s.pts[s.pts.length - 1][1], 1)}` : ''}</li>`)}</ul>`;
}

const rotuloPeriodo = (p, id) => {
  if (id === 'janela') return `Últimos 48 meses (${mesAnoBR(p.janela.de)} a ${mesAnoBR(p.janela.ate)}), abrange duas gestões`;
  const m = p.mandatos.find(x => x.id === id);
  return `${m.nome} (${mesAnoBR(m.inicio)} a ${m.fim ? mesAnoBR(m.fim) : 'em curso'})`;
};
const rotuloDataPonto = (tipo, d) => (tipo === 'semana' ? `semana até ${dataBR(d)}` : tipo === 'dia' ? dataBR(d) : mesAnoBR(d));

/** Tabela início x fim por mandato. get(id) devolve o resumo { inicio, fim, varAbs, varPct, emCurso } ou null. */
function tabelaMandatos(p, { tipo, get, fmt, dec = 2, rotuloFim = 'Último valor' }) {
  const ordem = ['lula', 'bolsonaro', 'temer', 'janela'];
  return html`<div class="rolagem"><table class="tabela"><thead><tr><th>Período</th><th>No início</th><th>${rotuloFim} / no fim</th><th class="num">Variação (R$)</th><th class="num">Variação (%)</th></tr></thead><tbody>
    ${ordem.map(id => {
      const r = get(id);
      const cls = id === 'janela' ? 'lin-destaque' : `lin-gestao ${COR_MANDATO[id]}`;
      return html`<tr class="${cls}"><th scope="row">${id === 'janela' ? '' : html`<i class="ponto-g"></i>`}${rotuloPeriodo(p, id)}</th>${r
        ? html`<td>${fmt(r.inicio.v)}<small class="cel-sub">${rotuloDataPonto(tipo, r.inicio.d)}</small></td><td>${fmt(r.fim.v)}<small class="cel-sub">${rotuloDataPonto(tipo, r.fim.d)}${r.emCurso ? ' · mandato em curso' : ''}</small></td><td class="num">${fmtDifR(r.varAbs, dec)}</td><td class="num">${fmtPct(r.varPct)}</td>`
        : html`<td colspan="4"><span class="cel-estado">${MSG_NAO_CONFIRMADO}: a série não tem valor no início ou no fim deste período.</span></td>`}</tr>`;
    })}
  </tbody></table></div>`;
}

const tilePreco = (ic, cor, rotulo, valor, legenda, origem = 'oficial') => tile({ icone: ic, cor, rotulo, valor, legenda, origem });
const linkFonte = (txt, url) => (urlSegura(url) ? html`<a href="${url}" target="_blank" rel="noopener">${txt}</a>` : txt);

function semFontePreco(titulo, fonte, url) {
  return html`<section class="cartao"><h2 class="painel-titulo">${titulo}</h2>${indisponivel(`A coleta desta série não funcionou na última atualização. O Placar não preenche com estimativa; a próxima atualização diária tenta de novo. Para conferir direto na fonte: ${fonte}.`)}${url ? html`<p class="nota">${linkFonte(fonte, url)}</p>` : ''}</section>`;
}

/* ------------------------------- gasolina ------------------------------- */

function cartaoGasolina(p, est) {
  const g = p.gasolina;
  if (!g) return semFontePreco('Gasolina', 'ANP, Levantamento de Preços de Combustíveis', p.fontes.gasolina.url);
  const ufs = Object.keys(g.estados || {}).sort((a, b) => g.estados[a].nome.localeCompare(g.estados[b].nome, 'pt-BR'));
  const uf = est.uf !== 'BR' && g.estados[est.uf] ? est.uf : 'BR';
  const atual = p.mandatos.find(m => m.emCurso) || p.mandatos[p.mandatos.length - 1];
  const no = uf === 'BR' ? g : g.estados[uf];
  const escala = uf === 'BR' && est.escala === 'semanal' ? 'semanal' : 'mensal';
  const j = [diaNum(p.janela.de), diaNum(p.janela.ate)];
  const xmin = diaNum('2016-01-01');
  const xmax = Math.max(escala === 'semanal' ? diaNum(g.semanal[g.semanal.length - 1][1]) : diaMesNum(no.mensal[no.mensal.length - 1][0]), j[1]);
  const pts = escala === 'semanal' ? g.semanal.map(([, fim, v]) => [diaNum(fim), v]) : no.mensal.map(([ym, v]) => [diaMesNum(ym), v]);
  const ultimoPonto = pts[pts.length - 1];
  const resMes = no.resumos[atual.id] && no.resumos[atual.id].mes;
  const resSem = uf === 'BR' ? g.resumos[atual.id].semana : null;
  const resAtual = escala === 'semanal' ? resSem : resMes;
  const tipoRes = escala === 'semanal' ? 'semana' : 'mes';
  const cur = uf === 'BR' ? g.atual : { semana: null, mes: no.atual };
  const nomeLocal = uf === 'BR' ? 'Brasil' : no.nome;
  const tiles = html`<div class="tiles tiles-precos">
    ${uf === 'BR' && cur.semana ? tilePreco('grafico', 'azul', 'Preço na última semana', `${fmtR(cur.semana.v, 3)}`, `por litro · semana de ${dataBR(cur.semana.ini)} a ${dataBR(cur.semana.fim)} · em relação à semana anterior: ${fmtPct(cur.semana.varPct)}`) : ''}
    ${cur.mes ? tilePreco('calendario', 'laranja', `Preço médio em ${mesAnoBR(cur.mes.mes)}`, `${fmtR(cur.mes.v, 3)}`, `por litro · ${nomeLocal} · em relação ao mês anterior: ${fmtPct(cur.mes.varPct)}`) : ''}
    ${resAtual ? tilePreco('relogio', 'verde', `No início do mandato (${nomeCurtoMandato(atual.id)})`, `${fmtR(resAtual.inicio.v, 3)}`, `por litro · ${rotuloDataPonto(tipoRes, resAtual.inicio.d)} · ${nomeLocal}`, 'calculado') : ''}
    ${resAtual ? tilePreco('moedas', 'roxo', 'Variação acumulada no mandato', fmtPct(resAtual.varPct), `${fmtDifR(resAtual.varAbs, 3)} por litro desde o início do mandato atual, ${rotuloDataPonto(tipoRes, resAtual.fim.d)}`, 'calculado') : ''}
  </div>`;
  const tabela = tabelaMandatos(p, { tipo: tipoRes, get: id => (escala === 'semanal' ? g.resumos[id].semana : no.resumos[id].mes), fmt: v => `${fmtR(v, 3)}`, dec: 3 });
  return html`<section class="cartao" id="precos-gasolina">
    <h2 class="painel-titulo">${icone('grafico', 22)} Gasolina comum ${selo('oficial')}</h2>
    <p class="painel-sub">Preço médio de revenda ao consumidor, em R$ por litro, nos postos pesquisados pela ANP.</p>
    <div class="preco-ctl">
      <label class="campo"><span>Onde</span><select id="precos-uf"><option value="BR" ${uf === 'BR' ? 'selected' : ''}>Brasil</option>${ufs.map(u => html`<option value="${u}" ${u === uf ? 'selected' : ''}>${g.estados[u].nome}</option>`)}</select></label>
      <fieldset class="seg"><legend>Escala</legend>
        <label><input type="radio" name="precos-escala" value="semanal" ${escala === 'semanal' ? 'checked' : ''} ${uf !== 'BR' ? 'disabled' : ''}> Semanal</label>
        <label><input type="radio" name="precos-escala" value="mensal" ${escala === 'mensal' ? 'checked' : ''}> Mensal</label>
      </fieldset>
    </div>
    ${uf !== 'BR' ? html`<p class="nota">Por estado, o Placar usa a série mensal da ANP; a série semanal é só do Brasil.</p>` : ''}
    ${tiles}
    <h3 class="sub-titulo">Evolução ${escala === 'semanal' ? 'semanal' : 'mensal'} · ${nomeLocal}</h3>
    ${graficoLinhas({ series: [{ nome: nomeLocal, pts }], bandas: bandasMandatos(p, xmin, xmax), xmin, xmax, fmtY: v => decN(v, 2), ticksX: ticksAnos(xmin, xmax), quebra: escala === 'semanal' ? 20 : 70, janelaX: j,
      aria: `Preço da gasolina comum, ${nomeLocal}, de ${mesAnoBR(new Date(pts[0][0] * 86400000).toISOString())} até o último dado (${decN(ultimoPonto[1], 3)} reais por litro).` })}
    ${legendaMandatos(p, 'Barra na base: últimos 48 meses')}
    <h3 class="sub-titulo">Início e fim de cada período ${selo('calculado')}</h3>
    ${tabela}
    <h3 class="sub-titulo">Comparação entre os mandatos: variação acumulada desde o início de cada um ${selo('calculado')}</h3>
    ${graficoCurvas(p, no.curvas, { aria: `Variação acumulada do preço da gasolina desde o início de cada mandato, ${nomeLocal}.` })}
    <p class="nota">Início do mandato = primeira ${escala === 'semanal' ? 'semana' : 'média mensal'} em que o mandato já valia (a série mensal usa o mês da posse). As curvas usam a média mensal da ANP.</p>
    <details class="sobre"><summary>Ver os valores mês a mês · ${nomeLocal}</summary>
      <div class="rolagem rolagem-alta"><table class="tabela"><thead><tr><th>Mês</th><th class="num">R$ por litro</th></tr></thead><tbody>${[...no.mensal].reverse().map(([ym, v]) => html`<tr><td>${mesAnoBR(ym)}</td><td class="num">${decN(v, 3)}</td></tr>`)}</tbody></table></div></details>
    <p class="fonte-linha">${icone('arquivo', 14)}<span>Fonte: ${linkFonte('ANP, arquivo semanal', p.fontes.gasolina.urls.semanal)} e ${linkFonte('arquivo mensal', p.fontes.gasolina.urls.mensal)}${uf !== 'BR' ? html` (${linkFonte('mensal por estado', p.fontes.gasolina.urls.estados)})` : ''} · última semana publicada: ${g.atual.semana ? dataBR(g.atual.semana.fim) : '—'} · último mês: ${g.atual.mes ? mesAnoBR(g.atual.mes.mes) : '—'}</span></p>
    <p class="nota">${p.fontes.gasolina.limitacoes}</p>
  </section>`;
}

/* --------------------------------- dólar --------------------------------- */

function cartaoDolar(p) {
  const d = p.dolar;
  if (!d) return semFontePreco('Dólar', 'Banco Central do Brasil, PTAX', p.fontes.dolar.url);
  const atual = p.mandatos.find(m => m.emCurso) || p.mandatos[p.mandatos.length - 1];
  const r = d.resumos[atual.id].dia;
  const xmin = diaNum('2016-01-01');
  const xmax = Math.max(diaNum(d.diario[d.diario.length - 1][0]), diaNum(p.janela.ate));
  const j = [diaNum(p.janela.de), diaNum(p.janela.ate)];
  const pts = d.diario.map(([dia, v]) => [diaNum(dia), v]);
  const a = d.atual;
  return html`<section class="cartao" id="precos-dolar">
    <h2 class="painel-titulo">${icone('cifrao', 22)} Dólar (PTAX de venda) ${selo('oficial')}</h2>
    <p class="painel-sub">Cotação de venda do dólar comercial divulgada pelo Banco Central, em reais.</p>
    <div class="tiles tiles-precos">
      ${tilePreco('cifrao', 'azul', 'Última cotação', fmtR(a.v, 4), `em ${dataBR(a.d)}`)}
      ${tilePreco('relogio', 'laranja', 'Variação no dia', a.dia ? fmtPct(a.dia.varPct) : '—', a.dia ? `em relação a ${dataBR(a.dia.d)} (${fmtR(a.dia.v, 4)})` : MSG_NAO_CONFIRMADO, 'calculado')}
      ${tilePreco('calendario', 'verde', 'Variação no mês', a.mes ? fmtPct(a.mes.varPct) : '—', a.mes ? `em relação a ${dataBR(a.mes.d)} (${fmtR(a.mes.v, 4)}), mesmo dia do mês anterior ou o pregão anterior a ele` : MSG_NAO_CONFIRMADO, 'calculado')}
      ${r ? tilePreco('moedas', 'roxo', `Acumulada no mandato (${nomeCurtoMandato(atual.id)})`, fmtPct(r.varPct), `de ${fmtR(r.inicio.v, 4)} em ${dataBR(r.inicio.d)} até ${fmtR(r.fim.v, 4)} em ${dataBR(r.fim.d)}`, 'calculado') : ''}
    </div>
    <h3 class="sub-titulo">Evolução diária</h3>
    ${graficoLinhas({ series: [{ nome: 'PTAX venda', pts }], bandas: bandasMandatos(p, xmin, xmax), xmin, xmax, fmtY: v => decN(v, 2), ticksX: ticksAnos(xmin, xmax), quebra: 12, janelaX: j,
      aria: `Dólar PTAX de venda, dia a dia, de 2016 até ${dataBR(d.diario[d.diario.length - 1][0])}: último valor ${decN(a.v, 4)} reais.` })}
    ${legendaMandatos(p, 'Barra na base: últimos 48 meses')}
    <h3 class="sub-titulo">Início e fim de cada período ${selo('calculado')}</h3>
    ${tabelaMandatos(p, { tipo: 'dia', get: id => d.resumos[id].dia, fmt: v => fmtR(v, 4), dec: 4 })}
    <h3 class="sub-titulo">Comparação entre os mandatos: variação acumulada desde o início de cada um ${selo('calculado')}</h3>
    ${graficoCurvas(p, d.curvas, { aria: 'Variação acumulada do dólar desde o início de cada mandato, pela média mensal da PTAX.' })}
    <p class="nota">As curvas usam a média mensal da PTAX de venda (conta do Placar sobre as cotações diárias). Início do mandato = primeiro dia útil com cotação a partir da posse.</p>
    <p class="fonte-linha">${icone('arquivo', 14)}<span>Fonte: ${linkFonte('Banco Central do Brasil, PTAX (serviço Olinda)', p.fontes.dolar.url)} · última cotação publicada: ${dataBR(a.d)}</span></p>
    <p class="nota">${p.fontes.dolar.limitacoes}</p>
  </section>`;
}

/* ------------------------------ cesta básica ------------------------------ */

function cartaoCesta(p, est) {
  const c = p.cesta;
  if (!c) return semFontePreco('Cesta básica', 'DIEESE/Conab, Pesquisa Nacional da Cesta Básica', p.fontes.cesta.url);
  const nomes = Object.keys(c.capitais).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const cap = c.capitais[est.cap] ? est.cap : (c.capitais['São Paulo'] ? 'São Paulo' : nomes[0]);
  const x = c.capitais[cap];
  const atual = p.mandatos.find(m => m.emCurso) || p.mandatos[p.mandatos.length - 1];
  const per = ['lula', 'bolsonaro', 'temer', 'janela'].includes(est.perCesta) ? est.perCesta : atual.id;
  const r = x.resumos[atual.id];
  const xmin = diaNum('2016-01-01');
  const xmax = Math.max(diaMesNum(x.ultimo.mes), diaNum(p.janela.ate));
  const pts = c.meses.map((ym, i) => [diaMesNum(ym), x.v[i]]);
  const j = [diaNum(p.janela.de), diaNum(p.janela.ate)];
  const u = x.ultimo;
  const linhas = nomes.map(n => ({ n, r: c.capitais[n].resumos[per], u: c.capitais[n].ultimo }));
  const comDado = linhas.filter(l => l.r);
  const maisAntigo = linhas.length - comDado.length;
  return html`<section class="cartao" id="precos-cesta">
    <h2 class="painel-titulo">${icone('moedas', 22)} Cesta básica de alimentos ${selo('oficial')}</h2>
    <p class="painel-sub">Custo mensal da cesta básica em cada capital pesquisada pelo DIEESE, em parceria com a Conab, e quanto ela pesa no salário mínimo líquido.</p>
    <div class="preco-ctl">
      <label class="campo"><span>Capital</span><select id="precos-cap">${nomes.map(n => html`<option value="${n}" ${n === cap ? 'selected' : ''}>${n}</option>`)}</select></label>
    </div>
    <div class="tiles tiles-precos">
      ${tilePreco('moedas', 'azul', `Valor da cesta em ${cap}`, fmtR(u.v), `${mesAnoBR(u.mes)} · em relação ao mês anterior: ${u.varMensal != null ? fmtPct(u.varMensal) : MSG_NAO_CONFIRMADO}`)}
      ${tilePreco('pessoas', 'laranja', 'Peso no salário mínimo líquido', u.pctSM != null ? `${decN(u.pctSM)}%` : '—', `${mesAnoBR(u.mes)} · tempo de trabalho para comprar a cesta: ${fmtHoras(u.horas)}`)}
      ${r ? tilePreco('relogio', 'verde', `No início do mandato (${nomeCurtoMandato(atual.id)})`, fmtR(r.inicio.v), `${mesAnoBR(r.inicio.d)} · ${cap}`, 'calculado') : tilePreco('relogio', 'verde', `No início do mandato (${nomeCurtoMandato(atual.id)})`, '—', `${MSG_NAO_CONFIRMADO} para ${cap} neste período`, 'calculado')}
      ${r ? tilePreco('grafico', 'roxo', 'Variação acumulada no mandato', fmtPct(r.varPct), `${fmtDifR(r.varAbs)} até ${mesAnoBR(r.fim.d)}`, 'calculado') : ''}
    </div>
    <h3 class="sub-titulo">Evolução mensal · ${cap}</h3>
    ${graficoLinhas({ series: [{ nome: cap, pts }], bandas: bandasMandatos(p, xmin, xmax), xmin, xmax, fmtY: v => decN(v, 0), ticksX: ticksAnos(xmin, xmax), quebra: 50, janelaX: j,
      aria: `Valor mensal da cesta básica em ${cap}, de 2016 até ${mesAnoBR(u.mes)}: último valor ${decN(u.v)} reais.` })}
    ${legendaMandatos(p, 'Barra na base: últimos 48 meses')}
    ${c.lacunas.length ? html`<p class="nota">Meses sem valor no gráfico (o PDF do DIEESE daquele mês só tem imagem, ou não foi lido): ${c.lacunas.map(mesAnoBR).join(', ')}. A linha é interrompida nesses meses, sem completar.</p>` : ''}
    <h3 class="sub-titulo">Início e fim de cada período · ${cap} ${selo('calculado')}</h3>
    ${tabelaMandatos(p, { tipo: 'mes', get: id => x.resumos[id], fmt: v => fmtR(v), dec: 2 })}
    <h3 class="sub-titulo">Comparação entre os mandatos: variação acumulada desde o início de cada um · ${cap} ${selo('calculado')}</h3>
    ${graficoCurvas(p, x.curvas, { aria: `Variação acumulada do valor da cesta básica em ${cap} desde o início de cada mandato.` })}
    <h3 class="sub-titulo">Todas as capitais pesquisadas ${selo('calculado')}</h3>
    <div class="preco-ctl"><label class="campo"><span>Período</span><select id="precos-per">${['lula', 'bolsonaro', 'temer', 'janela'].map(id => html`<option value="${id}" ${id === per ? 'selected' : ''}>${nomeCurtoMandato(id) === id ? 'Últimos 48 meses' : nomeCurtoMandato(id)}</option>`)}</select></label></div>
    <p class="painel-sub">${rotuloPeriodo(p, per)}. Só entram variações de capitais que têm valor no mês do início e no mês do fim do período; as demais ficam com "—", porque a pesquisa não cobria todas as capitais o tempo todo.</p>
    <div class="rolagem rolagem-alta"><table class="tabela"><thead><tr><th>Capital</th><th class="num">Início (mês)</th><th class="num">Fim (mês)</th><th class="num">Variação (R$)</th><th class="num">Variação (%)</th><th class="num">Peso no salário mínimo líquido hoje</th><th class="num">Última variação mensal</th></tr></thead><tbody>
      ${linhas.map(l => html`<tr><th scope="row">${l.n}</th>${l.r
        ? html`<td class="num">${fmtR(l.r.inicio.v)}<small class="cel-sub">${mesAnoBR(l.r.inicio.d)}</small></td><td class="num">${fmtR(l.r.fim.v)}<small class="cel-sub">${mesAnoBR(l.r.fim.d)}</small></td><td class="num">${fmtDifR(l.r.varAbs)}</td><td class="num">${fmtPct(l.r.varPct)}</td>`
        : html`<td colspan="4" class="num"><span class="cel-estado">Sem valor no início ou no fim do período</span></td>`}<td class="num">${l.u.pctSM != null ? `${decN(l.u.pctSM)}% (${mesAnoBR(l.u.mes)})` : '—'}</td><td class="num">${l.u.varMensal != null ? fmtPct(l.u.varMensal) : '—'}</td></tr>`)}
    </tbody></table></div>
    ${maisAntigo ? html`<p class="nota">${maisAntigo} de ${linhas.length} capitais sem comparação neste período.</p>` : ''}
    <p class="nota">Cobertura no último mês (${mesAnoBR(c.atual.mes)}): ${c.atual.capitais} capitais. O DIEESE ampliou a pesquisa de 17 para 27 capitais, com divulgação a partir de agosto de 2025; antes disso o número variou. Valores de capitais do Norte e do Nordeste vêm de uma cesta com composição diferente.</p>
    <p class="fonte-linha">${icone('arquivo', 14)}<span>Fonte: ${linkFonte('DIEESE/Conab, PDF de ' + mesAnoBR(c.atual.mes), c.atual.pdf)} (${linkFonte('página da análise', c.atual.pagina)}) · publicado em ${c.atual.publicadoEm ? dataBR(c.atual.publicadoEm) : '—'}</span></p>
    <p class="nota">${p.fontes.cesta.limitacoes}</p>
  </section>`;
}

/* ------------------------------ a aba inteira ------------------------------ */

function painelPrecos(el, ctx) {
  const p = ctx.precos;
  if (!p) {
    return mostrar(el, html`<section class="cartao" style="margin-top:0"><h2 class="painel-titulo">Preços no Brasil</h2>
      ${indisponivel('O arquivo de preços ainda não foi gerado. Ele é criado na atualização diária, que lê a ANP (gasolina), o Banco Central (dólar) e o DIEESE/Conab (cesta básica).')}
      <p class="nota">Para conferir direto nas fontes: ${linkFonte('ANP', 'https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/precos-revenda-e-de-distribuicao-combustiveis/shlp/semanal/semanal-brasil-desde-2013.xlsx')}, ${linkFonte('Banco Central (PTAX)', 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/aplicacao#!/recursos/CotacaoDolarPeriodo')}, ${linkFonte('DIEESE', 'https://www.dieese.org.br/')}.</p></section>`);
  }
  const est = { uf: 'BR', escala: 'semanal', cap: 'São Paulo', perCesta: (p.mandatos.find(m => m.emCurso) || p.mandatos[0]).id };
  const desenhar = () => {
    const rolagem = window.scrollY;
    mostrar(el, html`
      ${p.demonstracao ? html`<section class="cartao cartao-aviso" style="margin-top:0"><p>${icone('info', 18)} <span><strong>Dados fictícios.</strong> Esta é a versão de demonstração: os preços abaixo foram inventados só para mostrar o layout. Os dados reais aparecem quando o site publicado lê os arquivos da atualização diária.</span></p></section>` : ''}
      <section class="cartao cartao-contexto" style="margin-top:0"><p>${icone('info', 18)} <span>${p.aviso}</span></p></section>
      ${cartaoGasolina(p, est)}
      ${cartaoDolar(p)}
      ${cartaoCesta(p, est)}
      <section class="cartao"><h2 class="painel-titulo">Como ler esta aba</h2>
        <ul class="lista-simples">
          <li><strong>Mandatos comparados:</strong> ${p.mandatos.map(m => `${m.nome} (${dataBR(m.inicio)} a ${m.fim ? dataBR(m.fim) : 'em curso'})`).join('; ')}. ${p.mandatos.filter(m => m.nota).map(m => m.nota).join(' ')}</li>
          <li><strong>Últimos 48 meses:</strong> de ${dataBR(p.janela.de)} a ${dataBR(p.janela.ate)}. Esse recorte atravessa duas gestões, e por isso aparece à parte, nunca como se fosse de um presidente só.</li>
          <li><strong>Selos:</strong> "Dado oficial" é o número publicado pela fonte; "Calculado" é conta do Placar (variações, médias mensais e curvas).</li>
          <li><strong>Atualização:</strong> todo dia o Placar confere as três fontes. Cada fonte tem a sua própria periodicidade (a ANP é semanal, o Banco Central é diário e o DIEESE é mensal), e a data da última publicação aparece embaixo de cada bloco.</li>
        </ul>
        ${(p.erros || []).length ? html`<p class="nota">Avisos da última atualização: ${p.erros.join('; ')}.</p>` : ''}
      </section>`);
    window.scrollTo(0, rolagem);
  };
  desenhar();
  el.onchange = e => {
    const t = e.target;
    if (!t || !t.id && t.name !== 'precos-escala') return;
    if (t.id === 'precos-uf') { est.uf = t.value; if (est.uf !== 'BR') est.escala = 'mensal'; }
    else if (t.name === 'precos-escala') est.escala = t.value;
    else if (t.id === 'precos-cap') est.cap = t.value;
    else if (t.id === 'precos-per') est.perCesta = t.value;
    else return;
    desenhar();
  };
}
