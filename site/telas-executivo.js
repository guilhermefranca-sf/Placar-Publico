'use strict';

/* =====================================================================
   Placar Público — perfis de gestores: presidente, governadores e prefeitos
   Abas por tema (serviços básicos, saneamento, saúde, educação, segurança,
   infraestrutura, obras, economia, orçamento, transparência, fontes).

   Regras que esta tela cumpre:
   - O recorte é de 48 meses fechados. Cada ano de contas mostra QUEM governava
     naquele ano. Ano com troca de gestor aparece como "dividido": o número anual
     não pode ser separado por pessoa e nunca é entregue a uma só.
   - Dado oficial (copiado da fonte) e cálculo do Placar têm selos diferentes.
   - Sem fonte confirmada, aparece "Dado não encontrado ou não confirmado", com
     o órgão e o link onde conferir. Nada é inventado e ausência nunca vira zero.
   - Empenhada, liquidada e paga são colunas diferentes: anunciado não é pago.
   - Não há índice automático quando a base de indicadores está incompleta.
   ===================================================================== */

const MSG_NAO_CONFIRMADO = MSG_INDISPONIVEL; // "Dado não encontrado ou não confirmado"
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ESTADOS_SEM_VALOR = ['em-curso', 'aguardando-balanco', 'nao-coletado', 'erro-de-consulta'];

const mesAnoBR = iso => { const m = /^(\d{4})-(\d{2})/.exec(iso || ''); return m ? `${MESES_ABREV[Number(m[2]) - 1]}/${m[1]}` : ''; };
const diasEntreISO = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
const mesesEntreAM = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
const maiorISO = (a, b) => (a > b ? a : b);
const menorISO = (a, b) => (a < b ? a : b);
const corGestao = id => `g${(Math.max(1, Number(String(id).replace(/\D/g, '')) || 1) - 1) % 5}`;
const decN = (n, c = 1) => (n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));

function reaisAbrev(v) {
  if (v == null || !Number.isFinite(v)) return null;
  const a = Math.abs(v), sinal = v < 0 ? '-' : '';
  const f = (x, c = 1) => x.toLocaleString('pt-BR', { maximumFractionDigits: c });
  if (a >= 1e9) return `${sinal}R$ ${f(a / 1e9, 2)} bi`;
  if (a >= 1e6) return `${sinal}R$ ${f(a / 1e6)} mi`;
  if (a >= 1e3) return `${sinal}R$ ${f(a / 1e3)} mil`;
  return `${sinal}R$ ${Math.round(a)}`;
}

const normNome = s => semAcento(String(s || '')).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const gestaoPorId = (extra, id) => (extra.gestoes || []).find(g => g.id === id);
const gestaoAtual = extra => (extra.gestoes || []).find(g => g.situacao === 'em exercício') || null;
const nomesIguais = (a, b) => { const x = normNome(a), y = normNome(b); return x === y || (x && y && (x.includes(y) || y.includes(x))); };
const mesesDeDias = dias => Math.max(1, Math.round(dias / 30.4375));

/* ---------- Linha do tempo das gestões ---------- */

function faixaDasGestoes(gestoes, j) {
  const total = diasEntreISO(j.de, j.ate) + 1;
  const segs = gestoes.map(g => {
    const a = maiorISO(g.inicio, j.de), b = menorISO(g.fim, j.ate);
    return a > b ? null : { g, a, b, dias: diasEntreISO(a, b) + 1 };
  }).filter(Boolean);
  const marcas = [];
  for (let y = Number(j.de.slice(0, 4)) + 1; y <= Number(j.ate.slice(0, 4)); y++) { const pos = diasEntreISO(j.de, `${y}-01-01`) / total * 100; if (pos > 12 && pos < 88) marcas.push({ y, pos }); }
  const resumo = segs.map(s => `${s.g.nome}, de ${mesAnoBR(s.a)} a ${mesAnoBR(s.b)}`).join('; ');
  return html`<div class="faixa-gestoes">
    <div class="fg-barra" role="img" aria-label="Quem governou entre ${mesAnoBR(j.de)} e ${mesAnoBR(j.ate)}: ${resumo}">
      ${segs.map(s => html`<span class="fg-seg ${corGestao(s.g.id)}" style="flex:${s.dias} 1 0" title="${s.g.nome}: ${mesAnoBR(s.a)} a ${mesAnoBR(s.b)}"><b>${s.g.nome}</b><small>${mesAnoBR(s.a)} a ${mesAnoBR(s.b)}</small></span>`)}
    </div>
    <div class="fg-eixo" aria-hidden="true"><span style="left:0">${mesAnoBR(j.de)}</span>${marcas.map(m => html`<span style="left:${m.pos.toFixed(2)}%">${m.y}</span>`)}<span style="right:0">${mesAnoBR(j.ate)}</span></div>
  </div>`;
}

const ROT_SITUACAO = { 'encerrada': 'Gestão encerrada', 'em exercício': 'Em exercício', 'futura': 'Ainda não assumiu' };

function cartaoGestao(g, j) {
  const a = maiorISO(g.inicio, j.de), b = menorISO(g.fim, j.ate);
  const noRecorte = a <= b ? mesesDeDias(diasEntreISO(a, b) + 1) : 0;
  const aprox = f => (f ? ' (data aproximada)' : '');
  const periodo = g.situacao === 'futura'
    ? `Assume em ${dataBR(g.inicio)}${aprox(g.inicioAprox)}`
    : g.situacao === 'em exercício'
      ? `Desde ${dataBR(g.inicio)}${aprox(g.inicioAprox)} · o mandato vai até ${dataBR(g.fim)}`
      : `${dataBR(g.inicio)}${aprox(g.inicioAprox)} a ${dataBR(g.fim)}${aprox(g.fimAprox)}`;
  const anosEleicao = (g.mandatos || []).map(m => m.ano + (m.suplementar ? ' (suplementar)' : ''));
  const confirmacao = g.confirmacao === 'imprensa'
    ? 'Troca noticiada pela imprensa; ainda sem diário oficial confirmado pelo Placar. Confirme no site oficial do governo ou da prefeitura.'
    : g.confirmacao ? `Registro baseado em: ${g.confirmacao}. Confirme no site oficial.` : '';
  const fontes = (g.fontes || []).filter(f => urlSegura(f.url));
  return html`<li class="gestao ${corGestao(g.id)}">
    <div class="gestao-topo">
      <span class="gestao-ponto" aria-hidden="true"></span>
      <strong class="gestao-nome">${g.nome}</strong>
      <span class="etq ${g.situacao === 'em exercício' ? 'etq-ok' : g.situacao === 'futura' ? 'etq-parcial' : 'etq-neutra'}">${ROT_SITUACAO[g.situacao] || g.situacao}</span>
      ${g.interina ? html`<span class="etq etq-parcial">Interino(a)</span>` : ''}
    </div>
    <p class="gestao-meta">${g.partido || 'Partido não informado'}${g.origem === 'curadoria' ? '' : anosEleicao.length ? ` · eleito(a) em ${anosEleicao.join(' e ')}` : ''}</p>
    <p class="gestao-periodo">${periodo}${noRecorte ? html` <span class="gestao-recorte">· ${plural(noRecorte, 'mês', 'meses')} dentro do recorte</span>` : html` <span class="gestao-recorte">· fora do recorte de 48 meses</span>`}</p>
    ${g.reeleito ? html`<p class="gestao-nota">Reeleito(a): ocupou o cargo em ${g.mandatos.length} mandatos seguidos. O Placar conta como uma só gestão, porque não houve troca de gestor.</p>` : ''}
    ${g.encerradaPor ? html`<p class="gestao-nota">Gestão encerrada por: ${g.encerradaPor}.</p>` : ''}
    ${g.origem === 'curadoria' ? html`<p class="gestao-nota">Assumiu no meio do mandato${g.vinculo ? `: ${g.vinculo}` : ''}${g.motivo ? ` (${g.motivo})` : ''}.${g.dataTexto ? ` Data: ${g.dataTexto}.` : ''}</p>` : ''}
    ${confirmacao ? html`<p class="gestao-nota gestao-alerta">${confirmacao}</p>` : ''}
    ${g.nota ? html`<p class="gestao-nota">${g.nota}</p>` : ''}
    ${(g.divergencias || []).length ? html`<div class="gestao-diverg"><strong>Fontes divergem</strong><ul>${g.divergencias.map(d => html`<li>${d}</li>`)}</ul></div>` : ''}
    ${fontes.length ? html`<p class="gestao-fontes">Fontes: ${fontes.map((f, i) => html`${i ? ' · ' : ''}<a href="${urlSegura(f.url)}" target="_blank" rel="noopener">${f.titulo || f.url}</a>`)}</p>` : ''}
  </li>`;
}

function secaoGestoes(extra, titulo) {
  const j = extra.janela;
  const lista = extra.gestoes || [];
  const dividida = lista.filter(g => g.inicio <= j.ate && g.fim >= j.de).length > 1;
  return html`<section class="cartao" style="margin-top:0">
    <h2 class="painel-titulo">${titulo || 'Quem governou nos últimos 48 meses'}</h2>
    <p class="painel-sub">Recorte de 48 meses fechados: de ${mesAnoBR(j.de)} a ${mesAnoBR(j.ate)}. ${dividida ? 'Houve mais de uma gestão no período, e cada número do Placar fica ligado à gestão da época, nunca à atual por inteiro.' : 'Uma única gestão cobre o período.'}</p>
    ${faixaDasGestoes(lista, j)}
    <ol class="gestoes">${lista.map(g => cartaoGestao(g, j))}</ol>
    <p class="nota">Origem: eleitos do TSE (Dados Abertos) e, nas trocas no meio do mandato, reportagens com fonte indicada. ${extra.aviso || ''}</p>
  </section>`;
}

/* Quem governava em cada ano de contas: nome, ou "dividido" quando houve troca. */
function rotuloAno(a, extra) {
  const at = a.atribuicao || {};
  const gs = (at.gestoes || []).map(id => gestaoPorId(extra, id)).filter(Boolean);
  if (at.tipo === 'unica' && gs[0]) return { txt: gs[0].nome, cls: corGestao(gs[0].id), tipo: 'unica' };
  if (at.tipo === 'parcial' && gs[0]) return { txt: gs[0].nome, cls: corGestao(gs[0].id), tipo: 'parcial', aviso: `Só ${Math.round((at.cobertura || 0) * 100)}% do ano tem gestão conhecida` };
  if (at.tipo === 'dividida') return { txt: gs.map(g => g.nome).join(' → '), cls: 'dividida', tipo: 'dividida', aviso: 'Troca de gestor no ano: o número anual não é atribuído a uma só pessoa' };
  return { txt: 'Gestor não identificado', cls: 'sem', tipo: 'desconhecida' };
}

function cabecalhoAnos(extra) {
  const anos = Object.keys(extra.anos).sort();
  return anos.map(ano => {
    const a = extra.anos[ano];
    const r = rotuloAno(a, extra);
    const meses = a.mesesNaJanela;
    return html`<th class="ano-cab ${r.cls}" scope="col" ${r.aviso ? html`title="${r.aviso}"` : ''}>
      <span class="ano-n">${ano}</span>
      <span class="ano-g">${r.tipo === 'dividida' ? 'Gestão dividida' : r.txt}</span>
      ${r.tipo === 'dividida' ? html`<span class="ano-m">${r.txt}</span>` : ''}
      ${r.tipo === 'parcial' ? html`<span class="ano-m">${r.aviso}</span>` : ''}
      ${meses < 12 ? html`<span class="ano-m">${meses} de 12 meses no recorte</span>` : ''}
    </th>`;
  });
}

/* ---------- Valor de uma célula (nunca zero quando não há dado) ---------- */

function estadoCelula(situacao) {
  const m = {
    'em-curso': ['Ano em curso', 'O ano ainda não terminou: o Tesouro só recebe o balanço depois.'],
    'aguardando-balanco': ['Balanço a entregar', 'O ano acabou, mas o prazo de entrega do balanço ao Tesouro ainda não venceu.'],
    'nao-coletado': ['Ainda não coletado', 'O Placar coleta os anos mais antigos aos poucos, um pouco por dia. Este ainda não foi buscado.'],
    'erro-de-consulta': ['Falha na consulta', 'A consulta ao Tesouro falhou. Será tentada de novo na próxima rotina.'],
    'nc': ['Não confirmado', MSG_NAO_CONFIRMADO]
  }[situacao] || ['—', ''];
  return html`<span class="cel-estado" title="${m[1]}">${m[0]}</span>`;
}

function valorDoCampo(campo, a, fmtPct = false) {
  const k = campo.k;
  const f = a.f || {};
  const d = a.d || {};
  if (k === 'funcao') { const v = (f[campo.codigo] || [])[campo.col]; return Number.isFinite(v) ? reaisAbrev(v) : null; }
  if (k === 'funcaoPc') { const v = (d[campo.codigo] || [])[0]; return Number.isFinite(v) ? `R$ ${fmtNum.format(v)}` : null; }
  if (k === 'funcaoPct') { const v = (d[campo.codigo] || [])[1]; return Number.isFinite(v) ? `${decN(v)}%` : null; }
  if (k === 'total') { const v = (a.total || [])[campo.col]; return Number.isFinite(v) ? reaisAbrev(v) : null; }
  if (k === 'totalPc') { const v = (d.total || [])[0]; return Number.isFinite(v) ? `R$ ${fmtNum.format(v)}` : null; }
  if (k === 'pessoal') return Number.isFinite(a.pessoal) ? `${decN(a.pessoal, 2)}%` : null;
  if (k === 'divida') return Number.isFinite(a.divida) ? `${decN(a.divida, 2)}%` : null;
  return null;
}

function celula(ind, a) {
  if (ESTADOS_SEM_VALOR.includes(a.situacao)) return html`<td class="cel">${estadoCelula(a.situacao)}</td>`;
  const v = valorDoCampo(ind.campo, a);
  if (v == null) return html`<td class="cel">${a.rgfSituacao === 'sem-relatorio' && ['pessoal', 'divida'].includes(ind.campo.k) ? html`<span class="cel-estado" title="O Tesouro não tem o relatório de gestão fiscal deste ano.">Sem relatório</span>` : estadoCelula('nc')}</td>`;
  const exato = ['funcao', 'total'].includes(ind.campo.k) ? ((ind.campo.k === 'funcao' ? (a.f[ind.campo.codigo] || [])[ind.campo.col] : (a.total || [])[ind.campo.col])) : null;
  return html`<td class="cel cel-valor" ${exato != null ? html`title="${fmtBRL.format(exato)}"` : ''}>${v}</td>`;
}

/* ---------- Blocos de uma aba ---------- */

const NOME_FUNCAO_PADRAO = { '15': 'Urbanismo', '17': 'Saneamento', '10': 'Saúde', '12': 'Educação', '06': 'Segurança pública', '26': 'Transporte', '16': 'Habitação' };

function agruparIndicadores(lista) {
  const grupos = [];
  const pega = chave => { let g = grupos.find(x => x.chave === chave); if (!g) { g = { chave, itens: [] }; grupos.push(g); } return g; };
  for (const i of lista) {
    if (i.tipo === 'pendente') { pega('pendentes').itens.push(i); continue; }
    const k = i.campo && i.campo.k;
    if (['funcao', 'funcaoPc', 'funcaoPct'].includes(k)) pega(`funcao:${i.campo.codigo}`).itens.push(i);
    else if (k === 'censo') pega('censo').itens.push(i);
    else if (['pib', 'pibPc', 'populacao'].includes(k)) pega('ibge').itens.push(i);
    else if (['total', 'totalPc'].includes(k)) pega('total').itens.push(i);
    else if (['pessoal', 'divida'].includes(k)) pega('rgf').itens.push(i);
    else if (k === 'entregas') pega('entregas').itens.push(i);
    else pega(`outro:${i.id}`).itens.push(i);
  }
  const ordem = g => (g.chave === 'pendentes' ? 2 : g.chave.startsWith('funcao') || g.chave === 'total' || g.chave === 'rgf' ? 0 : 1);
  return grupos.sort((a, b) => ordem(a) - ordem(b));
}

function seloIndicador(i) {
  return i.tipo === 'oficial' ? selo('oficial') : i.tipo === 'calculado' ? selo('calculado') : html`<span class="selo selo-nc">Não confirmado</span>`;
}

const fonteColeta = (fonte, iso, url) => html`<p class="fonte-linha">${icone('arquivo', 14)}<span>Fonte: ${url ? html`<a href="${url}" target="_blank" rel="noopener">${fonte}</a>` : fonte}${iso ? ` · coletado em ${dataBR(iso)}` : ''}</span></p>`;

/* "Sobre estes indicadores": unidade, período, origem, responsável, limitações e link para conferir. */
function sobreIndicadores(itens) {
  return html`<details class="sobre"><summary>Sobre estes indicadores: fonte, responsável e limitações</summary>
    ${itens.map(i => html`<div class="sobre-item">
      <h4>${i.nome} ${seloIndicador(i)}</h4>
      <dl>
        ${i.unidade ? html`<div><dt>Unidade</dt><dd>${i.unidade}</dd></div>` : ''}
        ${i.periodicidade ? html`<div><dt>Período</dt><dd>${i.periodicidade}</dd></div>` : ''}
        <div><dt>Origem</dt><dd>${i.fonte}</dd></div>
        <div><dt>Responsável pela informação</dt><dd>${i.orgao}</dd></div>
        ${i.metodo ? html`<div><dt>Como o Placar calcula</dt><dd>${i.metodo}</dd></div>` : ''}
        ${i.limitacoes ? html`<div><dt>Limitações</dt><dd>${i.limitacoes}</dd></div>` : ''}
        ${urlSegura(i.url) ? html`<div><dt>Conferir</dt><dd><a href="${urlSegura(i.url)}" target="_blank" rel="noopener">${icone('externo', 13)} Abrir a fonte oficial</a></dd></div>` : ''}
      </dl></div>`)}
  </details>`;
}

function tabelaAnual(ctx, itens, titulo, subtitulo) {
  const extra = ctx.extra;
  const anos = Object.keys(extra.anos).sort();
  const ultimaColeta = anos.map(a => extra.anos[a].coletadoEm).filter(Boolean).sort().pop();
  return html`<section class="cartao">
    <h2 class="painel-titulo">${titulo}</h2>
    ${subtitulo ? html`<p class="painel-sub">${subtitulo}</p>` : ''}
    <p class="dica-rolagem">Deslize a tabela para o lado para ver os outros anos.</p>
    <div class="rolagem"><table class="tabela tabela-anos">
      <thead><tr><th scope="col" class="ind-cab">Indicador</th>${cabecalhoAnos(extra)}</tr></thead>
      <tbody>${itens.map(i => html`<tr><th scope="row" class="ind-nome">${i.nome}<span class="ind-un">${i.unidade} ${seloIndicador(i)}</span></th>${anos.map(ano => celula(i, extra.anos[ano]))}</tr>`)}</tbody>
    </table></div>
    <p class="nota">Cada coluna é um ano de contas e mostra quem governava naquele ano. O Tesouro publica um número por ano, e por isso um ano com troca de gestor aparece como “gestão dividida”, sem atribuir o valor a uma só pessoa.${anos.some(a => extra.anos[a].mesesNaJanela < 12) ? ' Anos que só em parte cabem nos 48 meses mostram o balanço do ano inteiro.' : ''}</p>
    ${sobreIndicadores(itens)}
    ${fonteColeta(itens[0].fonte.replace(/^Cálculo do Placar sobre dados do /, ''), ultimaColeta, urlSegura((itens.find(i => i.tipo === 'oficial') || itens[0]).url))}
  </section>`;
}

function blocoCenso(ctx, itens) {
  const c = (ctx.extra.contexto || {}).censo;
  return html`<section class="cartao">
    <h2 class="painel-titulo">Retrato do Censo 2022 ${selo('oficial')}</h2>
    <p class="painel-sub">Situação dos domicílios em 1º de agosto de 2022. Essa data é <strong>anterior ao início do recorte</strong> de 48 meses: mostra o que cada gestão encontrou, não um resultado dela.</p>
    <div class="rolagem"><table class="tabela"><thead><tr><th>Indicador</th><th class="num">Valor</th><th class="curto">Referência</th></tr></thead><tbody>
      ${itens.map(i => { const v = c && c[i.campo.chave]; return html`<tr><td>${i.nome}</td><td class="num">${v != null ? html`<strong>${decN(v)}%</strong>` : html`<span class="cel-estado" title="${MSG_NAO_CONFIRMADO}">Não confirmado</span>`}</td><td class="curto">${dataBR(i.referencia || '2022-08-01')}</td></tr>`; })}
    </tbody></table></div>
    <p class="nota">Em muitos lugares água e esgoto são prestados por companhia estadual ou concessionária: o resultado não deve ser atribuído só ao prefeito.</p>
    ${sobreIndicadores(itens)}
  </section>`;
}

function blocoIbge(ctx, itens) {
  const c = ctx.extra.contexto || {};
  const valor = i => {
    const k = i.campo.k;
    if (k === 'populacao' && c.populacao) return [`${fmtNum.format(c.populacao.valor)} pessoas`, c.populacao.ano];
    if (k === 'pib' && c.pib) return [`R$ ${fmtNum.format(c.pib.valor)} mil`, c.pib.ano];
    if (k === 'pibPc' && c.pib && c.pib.porHabitante != null) return [`R$ ${fmtNum.format(c.pib.porHabitante)}`, c.pib.ano];
    return null;
  };
  return html`<section class="cartao">
    <h2 class="painel-titulo">População e riqueza produzida</h2>
    <p class="painel-sub">Dados do IBGE. O PIB municipal e estadual sai com cerca de dois anos de atraso, e por isso o ano mais recente pode ser anterior ao fim do recorte.</p>
    <div class="rolagem"><table class="tabela"><thead><tr><th>Indicador</th><th class="num">Valor</th><th class="curto">Ano</th></tr></thead><tbody>
      ${itens.map(i => { const v = valor(i); return html`<tr><td>${i.nome} ${seloIndicador(i)}</td><td class="num">${v ? html`<strong>${v[0]}</strong>` : html`<span class="cel-estado" title="${MSG_NAO_CONFIRMADO}">Não confirmado</span>`}</td><td class="curto">${v ? v[1] : '—'}</td></tr>`; })}
    </tbody></table></div>
    <p class="nota">Cada número é de um único ano; não há série de 48 meses para estes indicadores. O PIB por habitante reflete a riqueza produzida no território, não a renda das pessoas nem o desempenho da gestão.</p>
    ${sobreIndicadores(itens)}
  </section>`;
}

function blocoRgf(ctx, itens) {
  const { item, ehPref, extra } = ctx;
  const k = item.contas || {};
  const limP = k.limitePessoal ?? (ehPref ? 54 : 49);
  const limD = k.limiteDivida ?? (ehPref ? 120 : 200);
  const anos = Object.keys(extra.anos).sort();
  const ultimo = [...anos].reverse().find(a => Number.isFinite(extra.anos[a].pessoal));
  const aUlt = ultimo ? extra.anos[ultimo] : null;
  const r = aUlt ? rotuloAno(aUlt, extra) : null;
  return html`${tabelaAnual(ctx, itens, 'Gasto com pessoal e dívida', `Os dois limites vêm da Lei de Responsabilidade Fiscal e de resolução do Senado: pessoal ${limP}% e dívida líquida ${limD}% da receita corrente líquida.`)}
    ${aUlt ? html`<section class="cartao"><h2 class="painel-titulo">Gasto com pessoal em ${ultimo} ${selo('oficial', 'proporcional')}</h2>
      <p class="painel-sub">Gestão naquele ano: ${r.tipo === 'dividida' ? `dividida (${r.txt})` : r.txt}.</p>
      ${medidor({ valor: aUlt.pessoal, limite: limP, marcas: [{ v: +(limP * 0.9).toFixed(2) }, { v: +(limP * 0.95).toFixed(2) }], legenda: `Limite de alerta: ${decN(limP * 0.9, 2)}% · prudencial: ${decN(limP * 0.95, 2)}% · máximo: ${limP}%.` })}</section>` : ''}`;
}

function blocoEntregas(ctx, itens) {
  const e = (ctx.item.contas && ctx.item.contas.entregas) || ctx.extra.entregas;
  const modelo = ctx.item.contas && ctx.item.contas.rgf;
  const ex = ctx.dado.exercicio ?? '—';
  return html`<section class="cartao">
    <h2 class="painel-titulo">Prestação de contas ao Tesouro Nacional ${e ? selo('oficial') : ''}</h2>
    <p class="painel-sub">Relatórios que a lei obriga ${ctx.ehPref ? 'a prefeitura' : 'o governo estadual'} a entregar a cada ano. É uma informação de transparência: <strong>não entra no índice</strong>.</p>
    ${e ? html`<p><strong style="font-size:1.6rem">${e.feitas}</strong> de ${e.esperado} relatórios entregues em ${ex}</p>
      <div class="barra" role="img" aria-label="${e.feitas} de ${e.esperado}"><span style="width:${e.esperado ? e.feitas / e.esperado * 100 : 0}%"></span></div>
      <div class="rolagem"><table class="tabela" style="margin-top:12px"><thead><tr><th>Relatório</th><th class="num">Entregues</th><th>O que é</th></tr></thead><tbody>
        <tr><td>RREO</td><td class="num">${e.rreo} de 6</td><td>Resumido da Execução Orçamentária: um por bimestre.</td></tr>
        <tr><td>RGF</td><td class="num">${e.rgf} de ${e.esperado - 7}</td><td>Gestão Fiscal: ${modelo === 'S2' ? 'versão semestral (municípios pequenos)' : 'um por quadrimestre'}.</td></tr>
        <tr><td>DCA</td><td class="num">${e.dca} de 1</td><td>Declaração de Contas Anuais, o balanço do ano.</td></tr>
      </tbody></table></div>
      <p class="nota">Só conta relatório homologado ou retificado no Siconfi. Um atraso pode ser problema técnico; o número não aponta irregularidade. Só o último ano fechado é consultado.</p>`
      : indisponivel(ctx.item.motivo || 'Não há o extrato de entregas desta administração no Tesouro Nacional.')}
    ${sobreIndicadores(itens)}
  </section>`;
}

function blocoPendentes(ctx, itens) {
  return html`<section class="cartao">
    <h2 class="painel-titulo">Sem dado confirmado <span class="selo selo-nc">${itens.length}</span></h2>
    <p class="painel-sub">${MSG_NAO_CONFIRMADO}. Para cada um, a fonte oficial prevista está abaixo, para você conferir direto nela. O Placar só mostra números que conseguiu ler de uma fonte aberta, estável e com licença clara.</p>
    <ul class="pend">${itens.map(i => html`<li>
      <div class="pend-topo"><strong>${i.nome}</strong>${i.unidade && i.unidade !== 'a definir' ? html`<span class="pend-un">${i.unidade}</span>` : ''}</div>
      <p class="pend-msg">${icone('info', 15)} ${MSG_NAO_CONFIRMADO}</p>
      <p class="pend-fonte">Fonte oficial prevista: ${i.fonte}. Responsável: ${i.orgao}. ${urlSegura(i.url) ? html`<a href="${urlSegura(i.url)}" target="_blank" rel="noopener">Conferir na fonte ${icone('externo', 13)}</a>` : ''}</p>
      ${i.limitacoes ? html`<details class="sobre sobre-mini"><summary>Por que ainda não está aqui</summary><p>${i.limitacoes}</p></details>` : ''}
    </li>`)}</ul>
  </section>`;
}

function renderGrupo(ctx, g) {
  if (g.chave === 'pendentes') return blocoPendentes(ctx, g.itens);
  if (g.chave === 'censo') return blocoCenso(ctx, g.itens);
  if (g.chave === 'ibge') return blocoIbge(ctx, g.itens);
  if (g.chave === 'rgf') return blocoRgf(ctx, g.itens);
  if (g.chave === 'entregas') return blocoEntregas(ctx, g.itens);
  if (g.chave === 'total') return tabelaAnual(ctx, g.itens, 'Quanto foi gasto no total', 'Despesa do ano inteiro, sem as operações entre órgãos da própria administração. Empenhada é compromisso assumido; só a despesa paga é dinheiro que saiu do caixa.');
  if (g.chave.startsWith('funcao:')) {
    const cod = g.chave.slice(7);
    const nome = (ctx.catalogo.funcoes || {})[cod] || NOME_FUNCAO_PADRAO[cod] || `Função ${cod}`;
    return tabelaAnual(ctx, g.itens, `${nome}: despesa por função`, 'O que foi empenhado (compromisso assumido) e o que foi pago no ano, de acordo com o balanço enviado ao Tesouro. Gasto não é o mesmo que resultado: este número não mede a qualidade do serviço.');
  }
  return tabelaAnual(ctx, g.itens, g.itens[0].nome, '');
}

const NOTA_SECAO = {
  servicos: { M: 'Limpeza urbana, iluminação, conservação de vias e transporte coletivo são, em geral, serviços da prefeitura, mas parte pode ser prestada por concessionária ou pelo estado.', E: 'Os serviços urbanos de rotina são principalmente municipais. Aqui aparece o que o governo estadual gasta em urbanismo.' },
  saneamento: { M: 'Água e esgoto costumam ser prestados por companhia estadual ou concessionária privada. O Placar mostra o retrato do serviço e o gasto da prefeitura, sem atribuir o resultado ao prefeito.', E: 'Em vários estados a companhia de saneamento é estadual; em outros, o serviço é municipal ou privado.' },
  saude: { M: 'A saúde é financiada por União, estados e municípios. Resultados como vacinação e mortalidade dependem dos três níveis e de fatores sociais.', E: 'A saúde é financiada por União, estados e municípios. Resultados como mortalidade dependem dos três níveis.' },
  educacao: { M: 'Os municípios cuidam principalmente de creche e ensino fundamental; o ensino médio é, em geral, estadual.', E: 'Os estados cuidam principalmente do ensino médio; creche e ensino fundamental são, em geral, municipais.' },
  seguranca: { M: 'Segurança pública é competência principalmente dos estados (polícias civil e militar). A prefeitura tem papel limitado, como a guarda municipal: não atribua ao prefeito os índices de crime.', E: 'Segurança pública é competência principalmente dos governos estaduais.' },
  infraestrutura: { M: 'Estradas federais e estaduais não são da prefeitura. Aqui aparece o gasto da prefeitura com transporte e habitação.', E: 'Parte das obras de infraestrutura é federal ou municipal. Aqui aparece o gasto do governo estadual com transporte e habitação.' },
  obras: { M: 'Obra contratada não é obra concluída, e valor anunciado não é valor pago.', E: 'Obra contratada não é obra concluída, e valor anunciado não é valor pago.' },
  economia: { M: 'Economia local depende de fatores que a prefeitura não controla. Estes números dão contexto; não medem a gestão.', E: 'Economia estadual depende de fatores nacionais e globais. Estes números dão contexto; não medem a gestão.' },
  orcamento: { M: 'As contas são entregues pelo próprio Executivo ao Tesouro Nacional.', E: 'As contas são entregues pelo próprio Executivo ao Tesouro Nacional.' },
  transparencia: { M: 'Mede se os relatórios obrigatórios foram entregues, não o que eles contêm.', E: 'Mede se os relatórios obrigatórios foram entregues, não o que eles contêm.' }
};

function semPerfilAmpliado(ctx, aba) {
  return html`<section class="cartao" style="margin-top:0">
    <h2 class="painel-titulo">${(ABAS_EXECUTIVO.find(a => a[0] === aba) || [, 'Esta aba'])[1]}</h2>
    ${indisponivel('O perfil ampliado deste gestor ainda não foi gerado. Ele é criado pela rotina de atualização depois de baixar as eleições do TSE e os dados do IBGE e do Tesouro; na primeira vez pode levar alguns dias.')}
    <p class="nota">Enquanto isso, as contas do último ano fechado estão na Visão geral.</p>
  </section>`;
}

function painelSecaoExec(el, ctx, secao) {
  if (!ctx.extra || !ctx.catalogo) return mostrar(el, semPerfilAmpliado(ctx, secao));
  const lista = ctx.catalogo.indicadores.filter(i => i.secao === secao && i.esferas.includes(ctx.esfera));
  const grupos = agruparIndicadores(lista);
  const nota = (NOTA_SECAO[secao] || {})[ctx.esfera];
  mostrar(el, html`
    ${nota ? html`<section class="cartao cartao-contexto" style="margin-top:0"><p>${icone('info', 18)} <span>${nota}</span></p></section>` : ''}
    ${grupos.length ? grupos.map(g => renderGrupo(ctx, g)) : html`<section class="cartao">${indisponivel('Nenhum indicador desta área foi integrado ao Placar.')}</section>`}`);
}

/* ---------- Visão geral ---------- */

function resumoUltimoAno(ctx, campoFn) {
  const anos = Object.keys(ctx.extra.anos).sort().reverse();
  for (const ano of anos) { const v = campoFn(ctx.extra.anos[ano]); if (v != null) return { ano, v, a: ctx.extra.anos[ano] }; }
  return null;
}

const legendaGestao = (ctx, a) => { const r = rotuloAno(a, ctx.extra); return r.tipo === 'dividida' ? 'gestão dividida no ano' : `gestão de ${r.txt}`; };

function tilesVisao(ctx) {
  const { extra, item, ehPref } = ctx;
  const base = `#/${ctx.cargo}/${ctx.uf}/${ctx.id}`;
  const k = item.contas || {};
  const pc = resumoUltimoAno(ctx, a => (a.d && a.d.total ? a.d.total[0] : null));
  const pes = resumoUltimoAno(ctx, a => (Number.isFinite(a.pessoal) ? a.pessoal : null));
  const div = resumoUltimoAno(ctx, a => (Number.isFinite(a.divida) ? a.divida : null));
  const c = extra.contexto || {};
  return html`<div class="tiles">
    ${tile({ icone: 'moedas', cor: 'azul', rotulo: 'Despesa paga por habitante', valor: pc ? `R$ ${fmtNum.format(pc.v)}` : '—', legenda: pc ? `em ${pc.ano} · ${legendaGestao(ctx, pc.a)}` : MSG_NAO_CONFIRMADO, origem: pc ? 'calculado' : '', natureza: 'por habitante', href: `${base}/orcamento` })}
    ${tile({ icone: 'pessoas', cor: 'laranja', rotulo: 'Gasto com pessoal', valor: pes ? `${decN(pes.v)}%` : '—', legenda: pes ? `da receita corrente líquida em ${pes.ano} · limite ${k.limitePessoal ?? (ehPref ? 54 : 49)}% · ${legendaGestao(ctx, pes.a)}` : MSG_NAO_CONFIRMADO, origem: pes ? 'oficial' : '', natureza: 'proporcional', href: `${base}/orcamento` })}
    ${tile({ icone: 'cifrao', cor: 'roxo', rotulo: 'Dívida líquida', valor: div ? `${decN(div.v)}%` : '—', legenda: div ? `da receita corrente líquida em ${div.ano} · limite ${k.limiteDivida ?? (ehPref ? 120 : 200)}% · ${legendaGestao(ctx, div.a)}` : MSG_NAO_CONFIRMADO, origem: div ? 'oficial' : '', natureza: 'proporcional', href: `${base}/orcamento` })}
    ${tile({ icone: 'predio', cor: 'verde', rotulo: 'População', valor: c.populacao ? popCurta(c.populacao.valor) : '—', legenda: c.populacao ? `estimativa do IBGE para ${c.populacao.ano}` : MSG_NAO_CONFIRMADO, origem: c.populacao ? 'oficial' : '', natureza: 'contexto', href: `${base}/economia` })}
  </div>`;
}

function cartaoCobertura(ctx) {
  const lista = ctx.catalogo.indicadores.filter(i => i.esferas.includes(ctx.esfera));
  const n = t => lista.filter(i => i.tipo === t).length;
  const anosFechados = Object.keys(ctx.extra.anos).filter(a => ['fechado', 'sem-balanco', 'nao-coletado', 'erro-de-consulta'].includes(ctx.extra.anos[a].situacao));
  const coletados = anosFechados.filter(a => ['fechado', 'sem-balanco'].includes(ctx.extra.anos[a].situacao));
  const base = `#/${ctx.cargo}/${ctx.uf}/${ctx.id}`;
  return html`<section class="cartao">
    <h2 class="painel-titulo">O que já está no Placar e o que falta</h2>
    <p class="painel-sub">São ${lista.length} indicadores previstos para ${ctx.ehPref ? 'prefeituras' : 'governos estaduais'}. Os que não têm fonte confirmada ficam marcados como “${MSG_NAO_CONFIRMADO.toLowerCase()}”, nunca preenchidos com estimativa.</p>
    <div class="numeros">
      <div class="numero"><span>Dado oficial</span><strong>${n('oficial')}</strong><small>copiado da fonte, sem conta nossa</small></div>
      <div class="numero"><span>Calculado pelo Placar</span><strong>${n('calculado')}</strong><small>contas simples sobre dados oficiais</small></div>
      <div class="numero"><span>Sem confirmação</span><strong>${n('pendente')}</strong><small>fonte oficial indicada em cada aba</small></div>
    </div>
    ${coletados.length < anosFechados.length ? html`<p class="nota">A coleta das contas dos anos mais antigos é feita aos poucos, um pouco a cada dia: ${coletados.length} de ${anosFechados.length} anos de contas já estão aqui.</p>` : ''}
    <p class="nota">Veja as abas <a href="${base}/saneamento">Saneamento</a>, <a href="${base}/saude">Saúde</a>, <a href="${base}/educacao">Educação</a> e <a href="${base}/obras">Obras</a> para a fonte oficial de cada indicador ainda sem dado.</p>
  </section>`;
}

function avisoTrocaDeGestor(ctx) {
  const atual = gestaoAtual(ctx.extra);
  if (!atual || nomesIguais(atual.nome, ctx.item.nome) || (atual.urna && nomesIguais(atual.urna, ctx.item.nome))) return html``;
  return html`<section class="cartao cartao-aviso" style="margin-top:0">
    <h3>Houve troca de gestor depois da eleição</h3>
    <p>A lista do TSE mostra ${ctx.item.nome}, eleito(a) para o mandato, mas há registro de que ${atual.nome} está no cargo desde ${atual.inicioAprox ? 'cerca de ' : ''}${dataBR(atual.inicio)}${atual.interina ? ' (interino)' : ''}. As contas e os indicadores abaixo são ligados à gestão de cada período. ${atual.confirmacao === 'imprensa' ? 'A troca foi noticiada pela imprensa; confirme no site oficial.' : ''}</p>
  </section>`;
}

function painelVisaoExec(el, ctx) {
  const { item, dado, ehPref, extra } = ctx;
  const k = item.contas;
  const exerc = dado.exercicio ?? '—';
  if (!extra) {
    // Perfil ampliado ainda não gerado: mantém a visão antiga (contas do último ano fechado) e avisa.
    mostrar(el, html`
      <section class="cartao cartao-aviso" style="margin-top:0"><h3>Perfil ampliado em preparação</h3>
        <p>Ainda não há o arquivo com as gestões dos últimos 48 meses e as contas por ano deste ${ehPref ? 'município' : 'estado'}. Ele é gerado pela rotina de atualização e pode levar alguns dias na primeira vez.</p></section>
      ${k ? html`<h2 class="painel-titulo">Destaques das contas de ${exerc}</h2>
        <div class="tiles">
          ${tile({ icone: 'pessoas', cor: 'azul', rotulo: 'Gasto com pessoal', valor: k.pessoal != null ? dec(k.pessoal) + '%' : '—', legenda: k.pessoal != null ? `da receita corrente líquida · limite legal ${k.limitePessoal}%` : MSG_NAO_CONFIRMADO, origem: k.pessoal != null ? 'oficial' : '', natureza: 'proporcional' })}
          ${tile({ icone: 'cifrao', cor: 'laranja', rotulo: 'Dívida líquida', valor: k.divida != null ? dec(k.divida) + '%' : '—', legenda: k.divida != null ? `da receita corrente líquida · limite ${k.limiteDivida}%` : MSG_NAO_CONFIRMADO, origem: k.divida != null ? 'oficial' : '', natureza: 'proporcional' })}
        </div>` : ''}
      ${cartaoIndice(item, 'executivos')}
      ${avisoEleitos(dado.ano ?? '')}`);
    return;
  }
  mostrar(el, html`
    ${avisoTrocaDeGestor(ctx)}
    ${secaoGestoes(extra)}
    <h2 class="painel-titulo" style="margin-top:22px">Em números</h2>
    <p class="painel-sub">O último ano fechado de cada conta, com a gestão da época. A comparação por ano, de 2022 até hoje, está nas abas.</p>
    ${tilesVisao(ctx)}
    ${cartaoCobertura(ctx)}
    ${cartaoIndice(item, 'executivos')}
    ${fichaCartao(item)}
    ${avisoEleitos(dado.ano ?? '', 'Os dados deste perfil ligam cada número à gestão do período; o aviso acima, quando existe, aponta trocas conhecidas.')}`);
}

/* ---------- Fontes ---------- */

function painelFontesExec(el, ctx) {
  if (!ctx.extra || !ctx.catalogo) return mostrar(el, semPerfilAmpliado(ctx, 'fontes'));
  const { extra, catalogo } = ctx;
  const f = (DADOS.meta && DADOS.meta.fontes) || {};
  const quando = x => (x && x.atualizadoEm ? dataHoraBR(x.atualizadoEm) : '—');
  const lista = catalogo.indicadores.filter(i => i.esferas.includes(ctx.esfera));
  const porFonte = new Map();
  for (const i of lista) {
    const e = porFonte.get(i.fonte) || { fonte: i.fonte, orgao: i.orgao, url: i.url, oficial: 0, calculado: 0, pendente: 0 };
    e[i.tipo]++;
    porFonte.set(i.fonte, e);
  }
  const anos = Object.keys(extra.anos).sort();
  const diverg = (extra.gestoes || []).flatMap(g => (g.divergencias || []).map(d => `${g.nome}: ${d}`));
  mostrar(el, html`
    <section class="cartao" style="margin-top:0">
      <h2 class="painel-titulo">Fontes de cada indicador</h2>
      <p class="painel-sub">Cada fonte, quem é responsável por ela e quantos indicadores deste perfil dependem dela. Os links levam à fonte oficial, para você conferir.</p>
      <div class="rolagem"><table class="tabela"><thead><tr><th>Fonte</th><th>Responsável</th><th class="num">Oficial</th><th class="num">Calculado</th><th class="num">Sem confirmação</th></tr></thead><tbody>
        ${[...porFonte.values()].map(e => html`<tr><td>${urlSegura(e.url) ? html`<a href="${urlSegura(e.url)}" target="_blank" rel="noopener">${e.fonte}</a>` : e.fonte}</td><td>${e.orgao}</td><td class="num">${e.oficial || '—'}</td><td class="num">${e.calculado || '—'}</td><td class="num">${e.pendente || '—'}</td></tr>`)}
      </tbody></table></div>
    </section>
    <section class="cartao">
      <h2 class="painel-titulo">Contas por ano: o que foi coletado</h2>
      <div class="rolagem"><table class="tabela"><thead><tr><th>Ano</th><th>Situação</th><th>Gestão</th><th class="curto">Meses no recorte</th><th class="curto">Coletado em</th></tr></thead><tbody>
        ${anos.map(ano => { const a = extra.anos[ano]; const r = rotuloAno(a, extra); return html`<tr><td><strong>${ano}</strong></td><td>${({ 'fechado': 'Balanço coletado', 'sem-balanco': 'Sem balanço no Tesouro', 'em-curso': 'Ano em curso', 'aguardando-balanco': 'Balanço a entregar', 'nao-coletado': 'Ainda não coletado', 'erro-de-consulta': 'Falha na consulta' })[a.situacao] || a.situacao}</td><td>${r.tipo === 'dividida' ? `Dividida: ${r.txt}` : r.txt}</td><td class="curto">${a.mesesNaJanela} de 12</td><td class="curto">${a.coletadoEm ? dataBR(a.coletadoEm) : '—'}</td></tr>`; })}
      </tbody></table></div>
      <p class="nota">Quando o Tesouro retifica um balanço, a rotina semanal reescreve o número e a data de coleta muda. O Placar ainda não guarda as versões anteriores de cada balanço.</p>
    </section>
    <section class="cartao">
      <h2 class="painel-titulo">Como o Placar atualiza</h2>
      <div class="rolagem"><table class="tabela"><thead><tr><th>O quê</th><th>Fonte</th><th class="curto">Última vez</th></tr></thead><tbody>
        <tr><td>Quem foi eleito e quando cada gestão começa e termina</td><td><a href="https://dadosabertos.tse.jus.br" target="_blank" rel="noopener">Dados Abertos do TSE</a>, mais o registro de trocas de gestor com fontes</td><td class="curto">${quando(f.administracoes || f.tse)}</td></tr>
        <tr><td>Despesa por função, pessoal, dívida e entregas</td><td><a href="https://siconfi.tesouro.gov.br" target="_blank" rel="noopener">Siconfi, Tesouro Nacional</a></td><td class="curto">${quando(f.series || f.siconfi)}</td></tr>
        <tr><td>População, PIB e Censo 2022</td><td><a href="https://sidra.ibge.gov.br" target="_blank" rel="noopener">IBGE (SIDRA)</a></td><td class="curto">${quando(f.ibge)}</td></tr>
      </tbody></table></div>
      <p class="nota">${extra.aviso || ''} Licença: TSE, Tesouro e IBGE publicam estes dados como dados abertos; os termos estão em cada fonte. Dados de organizações independentes só entram depois de conferida a licença de uso e a citação da fonte.</p>
    </section>
    ${diverg.length ? html`<section class="cartao cartao-aviso"><h3>Divergências entre fontes</h3><ul class="limites">${diverg.map(d => html`<li>${d}</li>`)}</ul><p class="nota">As divergências ficam à mostra; o Placar não escolhe uma versão por conta própria.</p></section>` : ''}`);
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

  // O perfil ampliado é opcional: se o arquivo ainda não existe, a tela continua funcionando.
  const [extra, catalogo] = await Promise.all([
    item.ibge != null ? lerArquivo(`executivos/${item.ibge}.json`).catch(() => null) : null,
    lerArquivo('indicadores.json').catch(() => null)
  ]);
  if (token !== rotaToken) return;

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
  const atual = extra ? gestaoAtual(extra) : null;
  if (atual && !nomesIguais(atual.nome, item.nome) && !(atual.urna && nomesIguais(atual.urna, item.nome))) selos.push(html`<span class="distintivo distintivo-aviso">Troca de gestor registrada</span>`);

  mostrar(app, html`
    <a class="voltar" href="${voltar[0]}">${icone('voltar', 16)}${voltar[1]}</a>
    ${heroPerfil({ item, cargoTxt: `${c.singular} de ${lugar}`, meta: `${item.partido || 'Sem partido'}${item.urna && item.urna !== item.nome ? ' · nome de urna: ' + item.urna : ''}`, selos })}
    ${barraAbas(ABAS_EXECUTIVO, `#/${cargo}/${uf}/${id}`)}
    <section class="painel" id="painel" role="tabpanel" aria-live="polite"></section>`);

  const ctx = { item, dado, cargo, uf, id, ehPref, lugar, c, extra, catalogo, esfera: ehPref ? 'M' : 'E' };
  ligarAbas({
    chave: `${cargo}/${uf}/${id}`, abas: ABAS_EXECUTIVO, abaInicial, token, antigas: ABAS_ANTIGAS_EXECUTIVO,
    desenharPainel: (aba, painel) => {
      mostrar(painel, html``);
      if (aba === 'visao') painelVisaoExec(painel, ctx);
      else if (aba === 'fontes') painelFontesExec(painel, ctx);
      else painelSecaoExec(painel, ctx, aba);
    }
  });
}

/* =====================================================================
   Presidente da República
   ===================================================================== */

const fmtSerie = (ind, v) => (v == null ? '—' : /%/.test(ind.unidade || '') ? `${decN(v, 2)}%` : decN(v, 2));

function graficoSerie({ ind, serie, janela, gestoes }) {
  const W = 520, H = 230, M = { e: 50, d: 12, t: 12, b: 30 };
  const am0 = janela.de.slice(0, 7), am1 = janela.ate.slice(0, 7);
  const nMes = mesesEntreAM(am0, am1) + 1;
  const largura = W - M.e - M.d;
  const xBanda = i => M.e + largura * i / nMes;
  const xPonto = i => M.e + largura * (i + 0.5) / nMes;
  const vals = serie.map(p => p.v);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.12;
  const yMin = min - pad, yMax = max + pad;
  const y = v => M.t + (H - M.t - M.b) * (1 - (v - yMin) / (yMax - yMin));
  const bandas = gestoes.map(g => {
    const a = maiorISO(g.inicio.slice(0, 7), am0), b = menorISO(g.fim.slice(0, 7), am1);
    if (a > b) return null;
    const i0 = mesesEntreAM(am0, a), i1 = mesesEntreAM(am0, b) + 1;
    return { g, x: xBanda(i0), w: xBanda(i1) - xBanda(i0) };
  }).filter(Boolean);
  // Meses sem dado (atraso de divulgação) quebram a linha: nada é ligado por cima do buraco.
  const trechos = [];
  let atual = [];
  let anterior = null;
  for (const p of serie) {
    const i = mesesEntreAM(am0, p.p);
    if (i < 0 || i >= nMes) continue;
    if (anterior != null && i !== anterior + 1) { trechos.push(atual); atual = []; }
    atual.push([xPonto(i), y(p.v)]);
    anterior = i;
  }
  if (atual.length) trechos.push(atual);
  const ticksY = [0, 1, 2, 3].map(k => yMin + (yMax - yMin) * k / 3);
  const ticksX = [];
  for (let k = 0; k < nMes; k++) {
    const ano = Number(am0.slice(0, 4)) + Math.floor((Number(am0.slice(5, 7)) - 1 + k) / 12);
    const mes = ((Number(am0.slice(5, 7)) - 1 + k) % 12) + 1;
    if (mes === 1 && k >= 4) ticksX.push({ x: xBanda(k), r: String(ano) });
  }
  ticksX.unshift({ x: xBanda(0), r: mesAnoBR(am0) });
  const ultimo = serie[serie.length - 1];
  const iUlt = mesesEntreAM(am0, ultimo.p);
  const resumoAria = `${ind.nome}, de ${mesAnoBR(am0)} a ${mesAnoBR(ultimo.p)}. Mínimo ${fmtSerie(ind, min)}, máximo ${fmtSerie(ind, max)}, último valor ${fmtSerie(ind, ultimo.v)}.`;
  return html`<figure class="grafico">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${resumoAria}" preserveAspectRatio="xMidYMid meet">
      ${bandas.map(b => html`<rect class="banda ${corGestao(b.g.id)}" x="${b.x.toFixed(1)}" y="${M.t}" width="${b.w.toFixed(1)}" height="${H - M.t - M.b}"><title>${b.g.nome}</title></rect>`)}
      ${ticksY.map(v => html`<line class="gr-grade" x1="${M.e}" x2="${W - M.d}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="gr-txt" x="${M.e - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${fmtSerie(ind, v)}</text>`)}
      ${ticksX.map(t => html`<text class="gr-txt" x="${(t.x + 3).toFixed(1)}" y="${H - 8}">${t.r}</text>`)}
      ${trechos.map(t => html`<polyline class="gr-linha" fill="none" points="${t.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')}"/>`)}
      <circle class="gr-ponto" cx="${xPonto(iUlt).toFixed(1)}" cy="${y(ultimo.v).toFixed(1)}" r="4"/>
    </svg>
    <figcaption>${ind.nome} · último mês disponível: ${mesAnoBR(ultimo.p)} (${fmtSerie(ind, ultimo.v)}). Faixas coloridas: gestão em cada mês (limites ao mês).</figcaption>
  </figure>`;
}

function legendaGestoes(gestoes, j) {
  return html`<ul class="leg-gestoes">${gestoes.filter(g => g.inicio <= j.ate && g.fim >= j.de).map(g => html`<li class="${corGestao(g.id)}"><i></i>${g.nome}</li>`)}</ul>`;
}

function tabelaPorGestao(ind, dados, gestoes, j) {
  const cols = ind.resumo || ['primeiro', 'ultimo', 'variacao', 'media'];
  const ROT = { primeiro: 'Início do período', ultimo: 'Fim do período', variacao: 'Variação', media: 'Média', acumulado: 'Acumulado na gestão' };
  const celulaR = (k, r) => {
    if (k === 'primeiro' || k === 'ultimo') return `${fmtSerie(ind, r[k].v)} (${mesAnoBR(r[k].p)})`;
    if (k === 'variacao') return `${r.variacao > 0 ? '+' : ''}${decN(r.variacao, 2)}${/%/.test(ind.unidade || '') ? ' p.p.' : ''}`;
    if (k === 'media') return fmtSerie(ind, r.media);
    if (k === 'acumulado') return r.acumulado != null ? `${decN(r.acumulado, 2)}%` : '—';
    return '—';
  };
  return html`<div class="rolagem"><table class="tabela"><thead><tr><th>Gestão</th><th class="curto">Meses no recorte</th>${cols.map(k => html`<th>${ROT[k]}</th>`)}</tr></thead><tbody>
    ${gestoes.filter(g => g.inicio <= j.ate && g.fim >= j.de).map(g => { const r = dados.porGestao[g.id]; return html`<tr class="lin-gestao ${corGestao(g.id)}"><th scope="row"><i class="ponto-g"></i>${g.nome}</th>${r ? html`<td class="curto">${r.meses} (${mesAnoBR(r.de)} a ${mesAnoBR(r.ate)})</td>${cols.map(k => html`<td>${celulaR(k, r)}</td>`)}` : html`<td colspan="${cols.length + 1}"><span class="cel-estado">Sem mês desta gestão com dado no recorte</span></td>`}</tr>`; })}
  </tbody></table></div>`;
}

function cartaoSerie(ctx, ind) {
  const d = ctx.pres.indicadores[ind.id];
  if (!d || d.situacao !== 'ok' || !d.serie || !d.serie.length) {
    return html`<section class="cartao"><h2 class="painel-titulo">${ind.nome} ${selo('oficial')}</h2>${indisponivel(MSG_NAO_CONFIRMADO + '. A consulta a esta série não funcionou na última atualização; o Placar não preenche com estimativa.')}${sobreIndicadores([ind])}</section>`;
  }
  const j = ctx.pres.janela;
  const gestoes = ctx.pres.gestoes;
  return html`<section class="cartao">
    <h2 class="painel-titulo">${ind.nome} ${selo('oficial')}</h2>
    <p class="painel-sub">${d.serie.length} meses com dado, de ${mesAnoBR(d.serie[0].p)} a ${mesAnoBR(d.ultimoMes)}. ${d.ultimoMes < j.ate.slice(0, 7) ? 'O mês mais recente ainda não foi divulgado pela fonte; o gráfico não completa o que falta.' : ''}</p>
    ${graficoSerie({ ind, serie: d.serie, janela: j, gestoes })}
    ${legendaGestoes(gestoes, j)}
    <h3 class="sub-titulo">Resumo por gestão ${selo('calculado')}</h3>
    ${tabelaPorGestao(ind, d, gestoes, j)}
    <details class="sobre"><summary>Ver os valores mês a mês</summary>
      <div class="rolagem rolagem-alta"><table class="tabela"><thead><tr><th>Mês</th><th class="num">Valor</th><th>Gestão no mês</th></tr></thead><tbody>
        ${d.serie.map(p => { const r = rotuloAno({ atribuicao: p.atribuicao }, { gestoes }); return html`<tr><td>${mesAnoBR(p.p)}</td><td class="num">${fmtSerie(ind, p.v)}</td><td>${r.tipo === 'dividida' ? `Troca no mês: ${r.txt}` : r.txt}</td></tr>`; })}
      </tbody></table></div></details>
    ${sobreIndicadores([ind])}
    ${fonteLinha(ind.fonte, ctx.pres.geradoEm, urlSegura(ind.url))}
  </section>`;
}

function painelSecaoPresidente(el, ctx, secao) {
  if (!ctx.pres || !ctx.catalogo) return mostrar(el, semPerfilAmpliado({}, secao));
  const lista = ctx.catalogo.indicadores.filter(i => i.secao === secao && i.esferas.includes('F'));
  const series = lista.filter(i => i.serie);
  const pend = lista.filter(i => i.tipo === 'pendente');
  const nota = secao === 'economia' ? 'Inflação, emprego e juros dependem também do Banco Central, do Congresso, do cenário internacional e do clima. Cada série mostra a gestão em cada mês e o resumo por gestão; nenhum número é atribuído à gestão atual por inteiro.'
    : secao === 'orcamento' ? 'A dívida pública depende do crescimento da economia, dos juros e das decisões de Congresso, estados e municípios.' : '';
  mostrar(el, html`
    ${nota ? html`<section class="cartao cartao-contexto" style="margin-top:0"><p>${icone('info', 18)} <span>${nota}</span></p></section>` : ''}
    ${series.map(i => cartaoSerie(ctx, i))}
    ${pend.length ? blocoPendentes(ctx, pend) : ''}
    ${!series.length && !pend.length ? html`<section class="cartao">${indisponivel('Nenhum indicador nacional desta área foi integrado ao Placar. Os serviços de saneamento, segurança e educação básica são, em grande parte, de estados e municípios: veja o perfil de cada governador e prefeito.')}</section>` : ''}`);
}

function painelVisaoPresidente(el, ctx) {
  const { pres, catalogo } = ctx;
  if (!pres) return mostrar(el, semPerfilAmpliado({}, 'visao'));
  const j = pres.janela;
  const ult = id => { const d = pres.indicadores[id]; if (!d || d.situacao !== 'ok') return null; const p = d.serie[d.serie.length - 1]; return { p, d }; };
  const t = (ic, cor, rot, id, nome) => {
    const u = ult(id);
    const ind = catalogo ? catalogo.indicadores.find(i => i.id === id) : { unidade: '%' };
    const g = u ? rotuloAno({ atribuicao: u.p.atribuicao }, { gestoes: pres.gestoes }) : null;
    return tile({ icone: ic, cor, rotulo: rot, valor: u ? fmtSerie(ind, u.p.v) : '—', legenda: u ? `${mesAnoBR(u.p.p)} · ${g.tipo === 'dividida' ? 'mês com troca de gestão' : `gestão de ${g.txt}`}` : MSG_NAO_CONFIRMADO, origem: u ? 'oficial' : '', natureza: nome, href: `#/presidente/${id.startsWith('pres.divida') ? 'orcamento' : 'economia'}` });
  };
  mostrar(el, html`
    ${secaoGestoes(pres, 'Quem governou nos últimos 48 meses')}
    <h2 class="painel-titulo" style="margin-top:22px">Último mês disponível</h2>
    <p class="painel-sub">Cada número é de um mês e aparece com a gestão daquele mês. A evolução, por gestão, está nas abas Economia e Orçamento.</p>
    <div class="tiles">
      ${t('moedas', 'azul', 'Inflação em 12 meses', 'pres.ipca12', 'IBGE')}
      ${t('pessoas', 'laranja', 'Desocupação', 'pres.desocupacao', 'IBGE')}
      ${t('grafico', 'roxo', 'Selic ao ano', 'pres.selic', 'Banco Central')}
      ${t('cifrao', 'verde', 'Dívida bruta do governo geral', 'pres.divida-bruta', 'Banco Central')}
    </div>
    <section class="cartao cartao-aviso">
      <h3>Por que não há índice para o presidente</h3>
      <p>O índice de 0 a 100 só existe quando há base completa de dados e regra clara. Para a Presidência, só economia e dívida estão integradas; saúde, educação, segurança, saneamento e obras federais ainda estão sem fonte confirmada, e muitos resultados dependem também de estados e municípios. O Placar prefere mostrar os dados por gestão a resumir tudo em uma nota.</p>
    </section>`);
}

async function viewPresidente(abaInicial, token) {
  const voltar = ['#/', 'Início'];
  mostrar(app, esqueletoPerfil(...voltar));
  const [pres, catalogo] = await Promise.all([lerArquivo('executivos/presidente.json').catch(() => null), lerArquivo('indicadores.json').catch(() => null)]);
  if (token !== rotaToken) return;
  document.title = 'Presidente da República · Placar Público';
  const atual = pres ? gestaoAtual(pres) : null;
  const item = { nome: atual ? atual.nome : 'Presidente da República', partido: atual ? atual.partido : '' };
  mostrar(app, html`
    <a class="voltar" href="${voltar[0]}">${icone('voltar', 16)}${voltar[1]}</a>
    ${heroPerfil({ item, cargoTxt: 'Presidente da República', meta: atual ? `${atual.partido || 'Sem partido'} · no cargo desde ${dataBR(atual.inicio)}` : 'Quem está no cargo: veja a linha do tempo na Visão geral', selos: [html`<span class="distintivo distintivo-neutro">Sem índice: base de dados incompleta</span>`], anelNota: false })}
    ${barraAbas(ABAS_EXECUTIVO, '#/presidente')}
    <section class="painel" id="painel" role="tabpanel" aria-live="polite"></section>`);
  const ctx = { pres, catalogo };
  ligarAbas({
    chave: 'presidente', abas: ABAS_EXECUTIVO, abaInicial, token, antigas: ABAS_ANTIGAS_EXECUTIVO,
    desenharPainel: (aba, painel) => {
      mostrar(painel, html``);
      if (aba === 'visao') painelVisaoPresidente(painel, ctx);
      else if (aba === 'fontes') painelFontesPresidente(painel, ctx);
      else painelSecaoPresidente(painel, ctx, aba);
    }
  });
}

function painelFontesPresidente(el, ctx) {
  if (!ctx.catalogo) return mostrar(el, semPerfilAmpliado({}, 'fontes'));
  const lista = ctx.catalogo.indicadores.filter(i => i.esferas.includes('F'));
  mostrar(el, html`<section class="cartao" style="margin-top:0">
    <h2 class="painel-titulo">Fontes de cada indicador</h2>
    <div class="rolagem"><table class="tabela"><thead><tr><th>Indicador</th><th>Fonte</th><th>Responsável</th><th>Situação</th></tr></thead><tbody>
      ${lista.map(i => html`<tr><td>${i.nome}</td><td>${urlSegura(i.url) ? html`<a href="${urlSegura(i.url)}" target="_blank" rel="noopener">${i.fonte}</a>` : i.fonte}</td><td>${i.orgao}</td><td>${seloIndicador(i)}</td></tr>`)}
    </tbody></table></div>
    <p class="nota">${(ctx.pres && ctx.pres.aviso) || ''} Cada série é buscada diretamente do IBGE (SIDRA) e do Banco Central (SGS), sem alteração. Os resumos por gestão (média, variação e acumulado) são contas do Placar sobre esses números.</p>
    ${ctx.pres && (ctx.pres.erros || []).length ? html`<p class="nota">Séries que falharam na última atualização: ${ctx.pres.erros.join('; ')}.</p>` : ''}
  </section>`);
}
