// Teste do diagnóstico de custo nº 2, contra um "Portal da Câmara" FALSO rodando na própria máquina (sem internet).
// Quatro situações: tudo certo, site bloqueando a leitura, páginas com outra estrutura e filtros ignorados.
// As expectativas (totais, diferenças, contagens, deputados escolhidos) são calculadas aqui, à parte, a partir dos
// mesmos dados simulados; o teste confere o que o relatório diz contra elas e que nenhum nome nem CPF vaza.
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const SCRIPT = new URL('../diagnostico-custo-2.mjs', import.meta.url).pathname;
const ANO = new Date().getFullYear();
let falhas = 0;
const caso = (nome, fn) => { try { fn(); console.log('ok:', nome); } catch (e) { falhas++; console.log('FALHOU:', nome, '\n   ', String(e.message).split('\n').slice(0, 4).join(' | ')); } };

const pad = (n, t) => String(n).padStart(t, '0');
const pt = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (v) => `R$ ${pt(v)}`;
const pct = (x) => `${(x * 100).toFixed(1).replace('.', ',')}%`;
const soma = (v) => v.reduce((a, b) => a + b, 0);

// ---------- dados simulados ----------
const NDEP = 513;
const UFS = ['MT', 'SP', 'BA', 'RS', 'AM'];
const HOMONIMOS = new Set([10, 11]); // dois deputados com o mesmo nome e UF
const deputados = Array.from({ length: NDEP }, (_, k) => ({ k, id: String(1000 + k + 1), nome: HOMONIMOS.has(k) ? 'Dep Homonimo' : `Dep Alfa ${pad(k + 1, 3)}`, partido: 'PX', uf: HOMONIMOS.has(k) ? 'MT' : UFS[k % 5] }));
const extras = Array.from({ length: 20 }, (_, j) => ({ k: -1, id: String(5000 + j), nome: `Ex Beta ${pad(j + 1, 3)}`, partido: 'PY', uf: 'SP' }));
const todos = [...deputados, ...extras];
const porId = new Map(deputados.map((d) => [d.id, d]));

// Tipos de despesa: nome no Portal, nome no arquivo anual (null = o arquivo anual não tem).
const T = [
  { p: 'PASSAGEM AÉREA - SIGEPA', c: null },
  { p: 'PASSAGEM AÉREA - REEMBOLSO', c: 'PASSAGEM AÉREA - REEMBOLSO' },
  { p: 'Passagem aérea', c: null },
  { p: 'Combustíveis', c: 'COMBUSTÍVEIS E LUBRIFICANTES.' },
  { p: 'Aluguel de veículos', c: 'LOCAÇÃO OU FRETAMENTO DE VEÍCULOS AUTOMOTORES' },
  { p: 'Divulgação da atividade parlamentar', c: 'DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR.' },
  { p: 'TELEFONIA', c: 'TELEFONIA' },
  { p: 'Consultoria e pesquisas', c: 'CONSULTORIAS, PESQUISAS E TRABALHOS TÉCNICOS.' },
  { p: 'COMPLEMENTAÇÃO DO AUXÍLIO-MORADIA', c: null },
  { p: 'PASSAGEM AÉREA - RPA', c: 'PASSAGEM AÉREA - RPA' }
];
const ANOS_DADOS = [ANO, ANO - 1];
const items = []; // { k, ano, mes, t, doc, glosa, nome, uf, id }
for (const ano of ANOS_DADOS) {
  for (const d of deputados) {
    for (let mes = 1; mes <= 12; mes++) {
      for (let t = 0; t < T.length; t++) {
        if ((d.k + t + mes) % 7 === 0) continue;
        let doc = 100 + ((d.k * 37 + mes * 11 + t * 53 + ano) % 900) + 0.5;
        if (t === 0 && mes === 5 && d.k % 50 === 0) doc = -50;
        const glosa = mes === 3 && t === 3 ? 10 : 0;
        items.push({ ano, mes, t, doc, glosa, nome: d.nome, uf: d.uf, id: d.id, k: d.k });
      }
    }
  }
  for (let mes = 1; mes <= 12; mes++) items.push({ ano, mes, t: 5, doc: 250, glosa: 0, nome: 'Liderança do Partido X', uf: 'DF', id: '', k: -1 });
}
const liq = (it) => it.doc - it.glosa;
const totalPortal = (ano, mes = 0) => soma(items.filter((i) => i.ano === ano && (!mes || i.mes === mes)).map(liq));
const totalCeap = (ano, mes = 0) => soma(items.filter((i) => i.ano === ano && (!mes || i.mes === mes) && T[i.t].c).map(liq));
const somaDep = (id, ano) => soma(items.filter((i) => i.id === id && i.ano === ano).map(liq));
const onlyPortal = (ano) => soma(items.filter((i) => i.ano === ano && !T[i.t].c).map(liq));

const csvPortal = (ano, mes = 0) => {
  const mapa = new Map();
  for (const i of items) {
    if (i.ano !== ano || (mes && i.mes !== mes)) continue;
    const k = `${i.nome}|${i.uf}|${i.t}`;
    const x = mapa.get(k) || { i, v: 0 };
    x.v += liq(i); mapa.set(k, x);
  }
  return ['Nome;Partido;UF;Tipo_de_Despesa;Valor', ...[...mapa.values()].map((x) => `${x.i.nome};PX;${x.i.uf};${T[x.i.t].p};R$ ${pt(x.v)}`)].join('\n') + '\n';
};
const cabCeap = 'txNomeParlamentar;cpf;ideCadastro;sgUF;txtDescricao;txtCNPJCPF;vlrDocumento;vlrGlosa;vlrLiquido;numMes;numAno';
const csvCeap = (ano) => {
  const linhas = items.filter((i) => i.ano === ano && T[i.t].c).map((i) => [i.nome, '111.222.333-44', i.id, i.uf, T[i.t].c, '12.345.678/0001-90', i.doc.toFixed(2), i.glosa.toFixed(2), liq(i).toFixed(2), i.mes, i.ano].join(';'));
  for (let j = 0; j < 5; j++) linhas.push([deputados[0].nome, '', deputados[0].id, 'MT', T[1].c, '', '999.00', '0.00', '999.00', 12, ano - 1].join(';')); // outro ano: deve ser ignorado
  return [cabCeap, ...linhas].join('\n') + '\n';
};

// Moradia: 300 linhas; padrão por deputado: 0 = só imóvel funcional, 1 = só auxílio, 2 = os dois.
const NMOR = 300;
const moradia = (i, leg) => {
  const m = i % 3;
  return {
    i,
    dias: m === 1 ? 0 : m === 0 ? (leg ? 900 : 300) : (leg ? 400 : 100),
    aux: m === 0 ? 0 : m === 1 ? (leg ? 51036 : 17012) : (leg ? 20000 : 6000),
    comp: i % 7 === 0 ? (leg ? 4500 : 1500) : 0
  };
};
const somaAuxAno = soma(Array.from({ length: NMOR }, (_, i) => moradia(i, false).aux));
const somaCompAno = soma(Array.from({ length: NMOR }, (_, i) => moradia(i, false).comp));
const comImovelLeg = Array.from({ length: NMOR }, (_, i) => moradia(i, true)).filter((x) => x.dias > 0).length;

// Totais mostrados na página geral.
const TOTAIS = { cota: totalPortal(ANO) * 1.005, verba: 528813556.47, moradia: somaAuxAno * 1.01, viagens: 3202247.33 };

// Deputados que o script deve escolher (5%, 50% e 95% do gasto da cota entre os que têm código único).
const unicos = deputados.filter((d) => !HOMONIMOS.has(d.k)).map((d) => [d.id, somaDep(d.id, ANO)]).sort((a, b) => a[1] - b[1]);
const ESCOLHIDOS = [0.05, 0.5, 0.95].map((q) => unicos[Math.floor(q * unicos.length)][0]);

// ---------- páginas simuladas ----------
const filler = 'Cada deputado tem direito a verbas e recursos para o exercício do mandato, com regras próprias de comprovação e de limite mensal. '.repeat(15);
const hSecao = (t) => `<h2 class="g-titulo-secao"><a href="#" class="g-titulo-secao__link"><span class="g-titulo-secao__texto">${t}</span></a></h2>`;
const hSub = (t) => `<h3 class="g-titulo-subsecao card__titulo"><span class="g-titulo-subsecao__texto">${t}</span></h3>`;
const tabela = (id, cab, linhas) => `<table id="${id}" class="js-chart table"><thead><tr>${cab.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas.map((l) => `<tr>${l.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const verbaDep = (d, ano) => MESES.slice(0, 10).map((m, j) => [m, pt(80000 + ((d.k * 31 + (j + 1) * 17 + ano) % 60000)), '50,00%', '165.806,07']);
const verbaGeral = MESES.slice(0, 10).map((m, j) => [m, pt(40000000 + j * 1234567.89), '70,00%', '83.631.099,12']);

function paginaGastos({ ano, id, modo }) {
  const dep = id ? porId.get(String(id)) : null;
  const opcoes = (arr) => arr.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  const filtros = `<form method="get" action="/transparencia/gastos-parlamentares">
<select name="legislatura">${opcoes([['57', '57 (atual)'], ['56', '56']])}</select>
<select name="ano">${opcoes([...new Set([ANO, ANO - 1, 2023])].map((a) => [a, a]))}</select>
<select name="mes">${opcoes([['', 'Todos os meses'], ...MESES.map((m, i) => [m, NOMES_MES[i]])])}</select>
<select name="deputado"><option value="">Todos os deputados</option>${todos.map((d) => `<option value="${d.id}">${d.nome.toUpperCase()} (${d.partido}-${d.uf})</option>`).join('')}</select>
<select name="uf">${opcoes([['', 'Todas as UFs'], ['MT', 'MT - Mato Grosso']])}</select>
<select name="partido">${opcoes([['', 'Todos os partidos'], ['PX', 'PX']])}</select></form>`;
  let corpo = `<h1>Gastos Parlamentares</h1><p>${filler}</p>${filtros}`;
  const filtroAtivo = dep && modo !== 'ignorafiltro';
  if (!filtroAtivo) {
    corpo += `${hSecao('Cota')}<p>Em ${ANO}, na legislatura 57, gasto de todos os deputados com cota:</p><p>${rs(TOTAIS.cota)}</p>`;
    corpo += `${hSecao('Verba de Gabinete')}<p>Em ${ANO}, na legislatura 57, gasto de todos os deputados com verba de gabinete: ${rs(TOTAIS.verba)}</p>${hSub('Gasto mensal')}${tabela('js-gasto-mensal', ['Mês', 'Valor (R$)', 'Percentual', 'Limite da verba'], verbaGeral)}`;
    corpo += `${hSecao('Imóveis funcionais e auxílio-moradia')}<p>Em ${ANO}, na legislatura 57, gasto de todos os deputados com auxílio-moradia: ${rs(TOTAIS.moradia)}</p><p>OCUPAM IMÓVEL - 417</p>`;
    corpo += `<p>Em ${ANO}, na legislatura 57, gasto de todos os deputados com viagens oficiais: ${rs(TOTAIS.viagens)}</p>`;
    corpo += '<a href="/dados-abertos/despesas">Dados abertos de despesas</a> <a href="/saude/plano">Plano de saúde dos deputados</a><a href="https://www.facebook.com/camara">Facebook</a>';
  } else {
    const porTipo = new Map();
    for (const i of items) if (i.id === dep.id && i.ano === Number(ano)) porTipo.set(T[i.t].p, (porTipo.get(T[i.t].p) || 0) + liq(i));
    corpo += `${hSecao('Cota')}${hSub('Em que tipo de despesa a cota foi gasta?')}${tabela('js-tipo-despesa', ['Tipo de despesa', 'Valor (R$)', 'Percentual'], [...porTipo.entries()].map(([t, v]) => [t, pt(v), '10,00%']))}`;
    corpo += `${hSecao('Verba de Gabinete')}${hSub('Gasto mensal')}${tabela('js-gasto-mensal', ['Mês', 'Valor (R$)', 'Percentual', 'Limite da verba'], verbaDep(dep, Number(ano)))}`;
    if (modo === 'completo') {
      corpo += `${hSecao('Remuneração')}${tabela('js-remuneracao', ['Rubrica', 'Valor (R$)'], [['Subsídio', '46.366,19'], ['Auxílio-moradia', pt(4253)]])}`;
      corpo += `${hSecao('Viagens oficiais')}${tabela('js-viagens', ['Viagem', 'Valor (R$)'], [['Missão oficial 1', pt(8200)], ['Missão oficial 2', pt(3100)]])}`;
    }
    corpo += `${hSecao('Imóveis funcionais e auxílio-moradia')}<p>Situação do deputado: consulte a busca de moradia.</p>`;
  }
  return `<html><head><title>Gastos parlamentares</title></head><body>${corpo}</body></html>`;
}

const NAV = '<nav class="pagination"><ul><li><a href="?pagina=1">Anterior</a></li></ul></nav>';
function paginaMoradia({ ini, pagina, modo }) {
  const leg = ini === '02/2023';
  const pg = modo === 'ignorafiltro' ? 1 : pagina;
  const fatia = Array.from({ length: NMOR }, (_, i) => i).slice((pg - 1) * 20, pg * 20);
  const linhas = fatia.map((i) => {
    const m = moradia(i, leg);
    return `<tr class="tabela-responsiva__linha"><td data-th="Nome"><a class="deputado-nome" href="57/2023/2027/02/01/${deputados[i].id}"> ${deputados[i].nome} (PX-${deputados[i].uf}) </a></td><td data-th="Ocupação de imóvel no período"> ${m.dias} dias</td><td data-th="Auxílio-moradia recebido no período"> ${rs(m.aux)}</td><td data-th="Complemento com a cota parlamentar no período"> ${rs(m.comp)}</td></tr>`;
  }).join('');
  const topo = modo === 'ignorafiltro' ? '' : `<span class="exibindo-resultados">Exibindo resultados de ${(pg - 1) * 20 + 1} a ${(pg - 1) * 20 + fatia.length} de ${NMOR} encontrados</span>`;
  return `<html><head><title>Busca de Imóveis Funcionais e Auxílio-moradia</title></head><body><table class="tabela-responsiva"><thead class="tabela-responsiva__cabecalho"><tr><th>Nome</th><th>Ocupação de imóvel no período</th><th>Auxílio-moradia recebido no período</th><th>Complemento com a cota parlamentar no período</th></tr></thead><div class="acao"><a href="javascript:void(0)" id="link-download">Baixar</a></div>${topo}<tbody>${linhas}</tbody></table>${NAV}</body></html>`;
}
function paginaMoradiaDeputado(id) {
  const i = deputados.findIndex((d) => d.id === id);
  const m = moradia(i, true);
  const linhas = [];
  const imovel = (de, a) => `<tr class="tabela-responsiva__linha"><td data-th="Período"> De ${de} a ${a} </td><td data-th="Tipo de recebimento"><span class="tipo-de-recebimento__titulo">IMÓVEL FUNCIONAL</span><ul class="dados-detalhados__tipo-de-recebimento"><li><span class="tipo-de-recebimento__descricao">Apartamento da Câmara</span></li></ul></td></tr>`;
  const auxilio = (de, a, v) => `<tr class="tabela-responsiva__linha"><td data-th="Período"> De ${de} a ${a} </td><td data-th="Tipo de recebimento"><span class="tipo-de-recebimento__titulo">AUXÍLIO-MORADIA</span><ul class="dados-detalhados__tipo-de-recebimento"><li><span class="tipo-de-recebimento__subtitulo">Recebeu:</span> <span class="tipo-de-recebimento__valor">${rs(v)}</span></li></ul></td></tr>`;
  if (m.dias > 0) { linhas.push(imovel('09/02/2023', '10/04/2024')); }
  if (m.aux > 0) { linhas.push(auxilio('01/04/2024', '31/08/2024', m.aux / 2)); linhas.push(auxilio('01/09/2024', '31/12/2026', m.aux / 2)); }
  return `<html><head><title>Moradia</title></head><body><table class="tabela-responsiva tabela-responsiva--ocupou-imovel"><thead><tr><th>Período</th><th>Tipo de recebimento</th></tr></thead><tbody>${linhas.join('')}</tbody></table></body></html>`;
}

const NRH = 20;
const paginaRH = (modo) => {
  const linhas = deputados.slice(0, NRH).map((d, j) => `<tr><td>${d.nome}</td><td>Deputado</td><td>${modo === 'estrutura' ? '' : `<a href="/transparencia/recursos-humanos/remuneracao/tok${pad(j + 1, 3)}">Consulta</a>`}</td></tr>`).join('');
  return `<html><head><title>Funcionários</title></head><body><table><thead><tr><th>Nome</th><th>Cargo</th><th>Remuneração</th></tr></thead><tbody>${linhas}</tbody></table><a href="/transparencia/recursos-humanos/remuneracao/relatorios-consolidados-por-ano-e-mes">Relatórios consolidados</a></body></html>`;
};
const paginaConsulta = (j) => `<html><head><title>Remuneração de ${deputados[j].nome}</title></head><body><h1>Remuneração de ${deputados[j].nome}</h1><p>Cargo: Deputado Federal. CPF 111.222.333-44</p>
<table><tr><th>Rubrica</th><th>Valor (R$)</th></tr><tr><td>Subsídio</td><td>46.366,19</td></tr><tr><td>Auxílio-moradia</td><td>4.253,00</td></tr><tr><td>Ajuda de custo</td><td>46.366,19</td></tr></table>
<p>Total líquido: R$ 38.000,00</p></body></html>`;

// ---------- servidor falso ----------
function criarServidor(modo) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      const pth = u.pathname;
      const enviar = (status, corpo, tipo = 'text/html; charset=utf-8') => { res.writeHead(status, { 'content-type': tipo }); res.end(corpo); };
      if (modo === 'bloqueado') {
        if (pth.startsWith('/transparencia') || pth.startsWith('/moradia')) return enviar(403, '<html><title>Acesso negado</title></html>');
        return enviar(404, 'nao encontrado');
      }
      if (pth === '/transparencia/gastos-parlamentares') {
        if (modo === 'estrutura') return enviar(200, '<html><head><title>Gastos</title><script src="/app.js"></script></head><body><div id="app"></div><script>fetch("/api/gastos?ano=2026")</script></body></html>');
        return enviar(200, paginaGastos({ ano: u.searchParams.get('ano') || ANO, id: u.searchParams.get('deputado') || '', modo }));
      }
      if (pth === '/transparencia/api/download/tabelaComparativa.csv') {
        if (modo === 'estrutura') return enviar(404, 'nao encontrado');
        const ano = Number(u.searchParams.get('ano'));
        const mes = MESES.indexOf(u.searchParams.get('mes') || '') + 1;
        return enviar(200, csvPortal(ano, mes), 'text/csv; charset=utf-8');
      }
      if (pth === '/moradia/detalhamento') {
        if (modo === 'estrutura') return enviar(200, '<html><title>Moradia</title><body><div id="app"></div></body></html>');
        return enviar(200, paginaMoradia({ ini: u.searchParams.get('dataInicial'), pagina: Number(u.searchParams.get('pagina') || 1), modo }));
      }
      let m = /^\/moradia\/57\/2023\/2027\/02\/01\/(\d+)$/.exec(pth);
      if (m) return enviar(200, paginaMoradiaDeputado(m[1]));
      if (pth === '/moradia') return enviar(200, '<html><title>Moradia</title><body><h1>Moradia</h1><p>O deputado pode ocupar apartamento funcional ou receber auxílio-moradia. O apartamento funcional é cedido pela Câmara.</p></body></html>');
      if (pth === '/transparencia') return enviar(200, '<html><title>Transparência</title><body><a href="/transparencia/fundo-rotativo">Fundo rotativo: reembolso médico</a></body></html>');
      if (pth === '/transparencia/recursos-humanos/funcionarios') return enviar(200, paginaRH(modo));
      m = /^\/transparencia\/recursos-humanos\/remuneracao\/tok(\d+)$/.exec(pth);
      if (m) return enviar(200, paginaConsulta(Number(m[1]) - 1));
      if (pth === '/w2/transparencia/recursos-humanos/remuneracao') return enviar(200, '<html><title>Remuneração</title><body><a href="/w2/ajuda-de-custo">Ajuda de custo dos deputados</a></body></html>');
      m = /^\/api\/deputados\/(\d+)\/despesas$/.exec(pth);
      if (m) {
        if (modo === 'estrutura') return enviar(500, 'erro');
        const ano = Number(u.searchParams.get('ano'));
        const pg = Number(u.searchParams.get('pagina') || 1);
        const lista = items.filter((i) => i.id === m[1] && i.ano === ano).map((i) => ({ ano: i.ano, mes: i.mes, tipoDespesa: T[i.t].c || T[i.t].p, valorDocumento: i.doc, valorGlosa: i.glosa, valorLiquido: liq(i) }));
        return enviar(200, JSON.stringify({ dados: lista.slice((pg - 1) * 100, pg * 100) }), 'application/json');
      }
      m = /^\/cotas\/Ano-(\d+)\.csv\.zip$/.exec(pth);
      if (m && zips[m[1]]) return enviar(200, zips[m[1]], 'application/zip');
      return enviar(404, 'nao encontrado');
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

const zips = {};
const dirCeap = mkdtempSync(path.join(tmpdir(), 'ceap2-sim-'));
for (const ano of ANOS_DADOS) {
  writeFileSync(path.join(dirCeap, `Ano-${ano}.csv`), csvCeap(ano));
  const z = spawnSync('zip', ['-j', '-q', path.join(dirCeap, `Ano-${ano}.csv.zip`), path.join(dirCeap, `Ano-${ano}.csv`)]);
  assert.equal(z.status, 0, 'não consegui montar o zip simulado');
  zips[ano] = readFileSync(path.join(dirCeap, `Ano-${ano}.csv.zip`));
}

async function rodar(modo) {
  const srv = await criarServidor(modo);
  const base = `http://127.0.0.1:${srv.address().port}`;
  const saida = mkdtempSync(path.join(tmpdir(), 'diag2-saida-'));
  const cwd = mkdtempSync(path.join(tmpdir(), 'diag2-cwd-'));
  const env = { ...process.env, DIAG_PORTAL: base, DIAG_WWW2: `${base}/w2`, DIAG_API: `${base}/api`, DIAG_CEAP: `${base}/cotas`, DIAG_SAIDA: saida, DIAG_ANOS: `${ANO - 1},${ANO}`, DIAG_ESPERA_MS: '0', GITHUB_STEP_SUMMARY: '' };
  const filho = spawn(process.execPath, [SCRIPT], { env, cwd });
  let out = ''; let err = '';
  filho.stdout.on('data', (d) => { out += d; });
  filho.stderr.on('data', (d) => { err += d; });
  const code = await new Promise((r) => filho.on('close', r));
  srv.close();
  const arq = path.join(saida, 'diagnostico-custo-2.txt');
  const relatorio = existsSync(arq) ? readFileSync(arq, 'utf8') : '';
  const dirA = path.join(saida, 'amostras');
  const amostras = existsSync(dirA) ? readdirSync(dirA).map((f) => ({ f, t: readFileSync(path.join(dirA, f), 'latin1') })) : [];
  return { code, relatorio, out, err, amostras, cwdVazio: readdirSync(cwd).length === 0 };
}
const resumo = (rel, trecho) => rel.split('\n').find((l) => /^\s+\[(OK|ATENÇÃO)\]/.test(l) && l.includes(trecho)) || '';
const NOMES_OU_CPF = /Dep Alfa \d{3}|Dep Homonimo|Ex Beta \d{3}|DEP ALFA|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/i;

// ---------- cenário A: tudo certo ----------
const A = await rodar('completo');
caso('A: roda sem erro, grava o relatório e não escreve fora da pasta de saída', () => {
  assert.equal(A.code, 0, A.err);
  assert.ok(A.relatorio.length > 5000, `relatório curto (${A.relatorio.length})`);
  assert.ok(!A.relatorio.includes('FALHA INESPERADA'), (A.relatorio.match(/FALHA INESPERADA[^\n]*\n[^\n]*/) || [''])[0]);
  assert.ok(A.cwdVazio);
});
caso('A: não testa variantes de endereço quando o filtro funciona, e mostra o formulário do filtro', () => {
  assert.ok(!A.relatorio.includes('Testando outras formas de endereço'));
  assert.ok(A.relatorio.includes('formulário do filtro: GET /transparencia/gastos-parlamentares · campos: legislatura, ano, mes, deputado, uf, partido'), (A.relatorio.match(/formulário do filtro[^\n]*/) || ['(sem formulário)'])[0]);
});
caso('A: lê o filtro de deputados (inclui os que saíram) e acha os homônimos', () => {
  assert.ok(A.relatorio.includes(`Deputados no filtro: ${(NDEP + extras.length).toLocaleString('pt-BR')}`), 'contagem');
  assert.ok(A.relatorio.includes('homônimos): 1'), 'homônimos');
  assert.ok(resumo(A.relatorio, 'A página geral lista').includes('[OK]'));
  assert.ok(A.relatorio.includes('Anos disponíveis no filtro:'));
});
caso('A: lê os 4 totais do Portal e as pistas de saúde e dados abertos', () => {
  for (const k of ['cota', 'verba', 'moradia', 'viagens']) assert.ok(A.relatorio.includes(rs(TOTAIS[k])), k);
  assert.ok(resumo(A.relatorio, 'mostra os totais').includes('4 de 4'));
  assert.ok(A.relatorio.includes('Plano de saúde dos deputados') && A.relatorio.includes('Dados abertos de despesas'), 'pistas da página geral');
  assert.ok(A.relatorio.includes('Fundo rotativo: reembolso médico'), 'pista da página de apoio');
  assert.ok(A.relatorio.includes('Ajuda de custo dos deputados'), 'pista da página de remuneração');
  assert.ok(!A.relatorio.includes('facebook.com'));
});
caso('A: escolhe os deputados certos (gasto baixo, médio e alto) e lê verba, remuneração e viagens', () => {
  assert.ok(A.relatorio.includes(`Deputados lidos (só pelo código): ${ESCOLHIDOS.join(', ')}`), `esperado ${ESCOLHIDOS.join(', ')}`);
  assert.ok(resumo(A.relatorio, 'mostra a verba de gabinete dele mês a mês').includes('[OK]'));
  assert.ok(resumo(A.relatorio, 'O filtro por deputado').includes('[OK]') && resumo(A.relatorio, 'O filtro por deputado').includes('muda a tabela'));
  assert.ok(resumo(A.relatorio, 'O parâmetro "ano"').includes('[OK]'));
  assert.ok(resumo(A.relatorio, 'traz tabela de remuneração').includes('[OK]'));
  assert.ok(resumo(A.relatorio, 'traz tabela de viagens').includes('[OK]'));
  const d = porId.get(ESCOLHIDOS[0]);
  const total = soma(verbaDep(d, ANO).map((l) => Number(l[1].replace(/\./g, '').replace(',', '.'))));
  assert.ok(A.relatorio.includes(`VERBA DE GABINETE do deputado: 10 meses, soma ${rs(total)}`), 'soma da verba do primeiro deputado');
  assert.ok(A.relatorio.includes('Subsídio | 46.366,19'), 'tabela de remuneração impressa');
});
caso('A: cota da página do deputado confere com o CSV do Portal', () => {
  const id = ESCOLHIDOS[0];
  assert.ok(A.relatorio.includes(`Cota na página: ${rs(somaDep(id, ANO))} · no CSV completo do Portal (mesmo deputado): ${rs(somaDep(id, ANO))}`));
});
caso('A: estima o tempo de ler 513 deputados em 4 anos', () => {
  assert.ok(A.relatorio.includes('Tempo médio por página de deputado:') && A.relatorio.includes('2.052 pedidos'));
  assert.ok(resumo(A.relatorio, 'Ler a página de cada deputado').includes('[OK]'));
});
caso('A: moradia: listas completas, soma bate com o Portal, páginas individuais batem com a lista', () => {
  assert.ok(A.relatorio.includes(`${NMOR} linhas · total informado pela página: ${NMOR}`), 'linhas');
  assert.ok(A.relatorio.includes('15 página(s) lida(s)'), 'páginas');
  assert.ok(A.relatorio.includes(`soma do auxílio-moradia: ${rs(somaAuxAno)} · soma do complemento pela cota: ${rs(somaCompAno)}`), 'somas do ano');
  assert.ok(A.relatorio.includes(`com dias em imóvel funcional: ${comImovelLeg}`), 'imóvel funcional na legislatura');
  assert.ok(resumo(A.relatorio, `Moradia, ano de ${ANO}`).includes('[OK]') && resumo(A.relatorio, `Moradia, legislatura inteira`).includes('[OK]'));
  const l = resumo(A.relatorio, `Moradia ${ANO}: a soma da lista`);
  assert.ok(l.includes('[OK]') && l.includes('-1,0%'), l);
  assert.ok(resumo(A.relatorio, 'Moradia: o auxílio somado na página individual').includes('[OK]'));
  assert.ok(A.relatorio.includes('IMOVEL FUNCIONAL:') && A.relatorio.includes('AUXILIO MORADIA: 2 período(s)'), 'tipos na página individual');
});
caso('A: imóvel funcional sem valor em reais é confirmado e NÃO é estimado', () => {
  const l = resumo(A.relatorio, 'Imóvel funcional:');
  assert.ok(l.includes('[OK]') && l.includes('NÃO publica valor em reais') && l.includes('não será estimado') && l.includes('uso de imóvel funcional: valor não publicado por deputado'), l);
  assert.ok(A.relatorio.includes('sem sem valor em reais') === false);
  assert.ok(A.relatorio.includes('IMOVEL FUNCIONAL: 1 período(s)') && A.relatorio.includes('sem valor em reais'));
  assert.ok(A.relatorio.includes('DECISÕES respeitadas: imóvel funcional SEM valor estimado'));
});
caso('A: remuneração individual: links de consulta, páginas abrem e citam ajuda de custo', () => {
  assert.ok(resumo(A.relatorio, 'links de consulta individual').includes('[OK]') && resumo(A.relatorio, 'links de consulta individual').includes('traz 20 links'), resumo(A.relatorio, 'links de consulta individual'));
  const l = resumo(A.relatorio, 'A página individual de remuneração do deputado');
  assert.ok(l.includes('[OK]') && l.includes('2 lida(s)') && l.includes('cita ajuda de custo'), l);
  assert.ok(/termos de custo encontrados no texto: [^\n]*subsídio[^\n]*ajuda de custo/.test(A.relatorio), 'termos');
  assert.ok(!A.relatorio.includes('relatorios-consolidados'), 'não deveria tratar o relatório consolidado como consulta individual');
});
caso('A: cota: total, diferença e tipos só no Portal batem com o cálculo independente (os dois anos)', () => {
  for (const ano of ANOS_DADOS) {
    assert.ok(A.relatorio.includes(`Arquivo anual CEAP: ${items.filter((i) => i.ano === ano && T[i.t].c).length.toLocaleString('pt-BR')} despesas · total (documento − glosa) ${rs(totalCeap(ano))}`), `CEAP ${ano}`);
    const dif = totalPortal(ano) - totalCeap(ano);
    assert.ok(A.relatorio.includes(`Total do Portal: ${rs(totalPortal(ano))} · diferença (Portal − arquivo anual): ${rs(dif)}`), `diferença ${ano}`);
    assert.ok(A.relatorio.includes(`Soma dos tipos só no Portal: ${rs(onlyPortal(ano))}`), `só no Portal ${ano}`);
    const l = resumo(A.relatorio, `Cota ${ano}:`);
    assert.ok(l.includes('[OK]') && l.includes('é explicada (100,0%)'), l);
  }
  assert.ok(A.relatorio.includes('Tipos SÓ no Portal (3)'), 'três tipos só no Portal');
  assert.ok(A.relatorio.includes('Tipos SÓ no arquivo anual (0): nenhum'));
  assert.ok(A.relatorio.includes('nome ambíguo com mais de um tipo do arquivo'), 'Passagem aérea ambígua');
  assert.ok(A.relatorio.includes('[apelido conhecido]') && A.relatorio.includes('[início do nome (único)]') && A.relatorio.includes('[nome igual]'), 'formas de casar tipos');
  assert.ok(/Aluguel de veículos.*\[apelido conhecido\]/.test(A.relatorio) && /Consultoria e pesquisas.*\[apelido conhecido\]/.test(A.relatorio) && /Combustíveis.*\[início do nome/.test(A.relatorio));
  assert.ok(A.relatorio.includes('"Complementação do auxílio-moradia" no CSV do Portal') && A.relatorio.includes('já está dentro da cota'));
});
caso('A: cota: por estado, por mês e ligação de nomes', () => {
  assert.ok(/\bDF\s+R\$/.test(A.relatorio) && /\bMT\s+R\$/.test(A.relatorio), 'tabela por UF');
  const m1 = `JAN/${ANO}: Portal ${rs(totalPortal(ANO, 1))} · arquivo anual ${rs(totalCeap(ANO, 1))}`;
  assert.ok(A.relatorio.includes(m1), `mês de janeiro: ${m1}`);
  const ligados = deputados.length - 2 + 0; // 513 deputados, os 2 homônimos formam 1 chave ambígua
  assert.ok(A.relatorio.includes('513 nomes distintos no CSV · 511 com um único código · 1 ambíguos · 1 sem código'), (A.relatorio.match(/nomes distintos no CSV[^\n]*/) || ['(não achou)'])[0]);
  assert.ok(resumo(A.relatorio, 'Ligação nome → código').includes('[OK]') && resumo(A.relatorio, 'Ligação nome → código').includes(pct(511 / 513)));
  assert.ok(ligados > 0);
  assert.ok(A.relatorio.includes('só no Portal e ausentes do arquivo anual: 0'));
});
caso('A: API de despesas por deputado bate com o CSV do Portal e mostra os tipos que o arquivo anual não tem', () => {
  assert.ok(resumo(A.relatorio, 'A API de despesas por deputado').includes('[OK]'), resumo(A.relatorio, 'A API de despesas por deputado'));
  const id = ESCOLHIDOS[1];
  const n = items.filter((i) => i.id === id && i.ano === ANO).length;
  assert.ok(A.relatorio.includes(`[deputado ${id}] API: ${n.toLocaleString('pt-BR')} despesas em ${ANO}, total ${rs(somaDep(id, ANO))}`), 'total da API');
  const linha = (A.relatorio.match(/tipos de despesa na API que o arquivo anual não tem: [^\n]*/) || [''])[0];
  assert.ok(linha.includes('PASSAGEM AÉREA - SIGEPA') && linha.includes('COMPLEMENTAÇÃO DO AUXÍLIO-MORADIA'), linha);
});
caso('A: nenhum nome de pessoa nem CPF no relatório, e CPF nunca nas amostras', () => {
  assert.ok(!NOMES_OU_CPF.test(A.relatorio), `vazou: ${(NOMES_OU_CPF.exec(A.relatorio) || [])[0]}`);
  assert.ok(A.amostras.length >= 8, `poucas amostras: ${A.amostras.length}`);
  assert.ok(A.amostras.every((a) => !/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(a.t)), 'CPF numa amostra');
  assert.ok(A.amostras.filter((a) => a.f.startsWith('rh-')).every((a) => !/Dep Alfa/i.test(a.t)), 'nome numa amostra de remuneração');
  assert.ok(A.amostras.some((a) => a.f.startsWith('rh-consulta')), 'deveria ter guardado a consulta individual');
});
caso('A: o resumo fica no alto e o relatório lista os pedidos', () => {
  assert.ok(A.relatorio.indexOf('RESUMO: o que foi confirmado') < A.relatorio.indexOf('1. PÁGINA GERAL'));
  assert.ok(A.relatorio.includes('7. REGISTRO DE PEDIDOS') && A.relatorio.includes('Indicativo automático:'));
});

// ---------- cenário B: site bloqueando ----------
const B = await rodar('bloqueado');
caso('B: bloqueio não derruba nada, fica claro e nenhum ponto sai OK', () => {
  assert.equal(B.code, 0, B.err);
  assert.ok(!B.relatorio.includes('FALHA INESPERADA'), (B.relatorio.match(/FALHA INESPERADA[^\n]*\n[^\n]*/) || [''])[0]);
  assert.ok(B.relatorio.includes('HTTP 403') && B.relatorio.includes('bloqueando leitura automática'));
  assert.ok(!/\[OK\]/.test(B.relatorio.split('\n').filter((l) => /^\s+\[/.test(l)).join('\n')), 'nenhum item deveria estar OK');
  assert.ok(B.relatorio.includes('Indicativo automático:') && !B.relatorio.includes('Indicativo automático: todos'));
  assert.ok(B.cwdVazio);
});

// ---------- cenário C: páginas com outra estrutura ----------
const C = await rodar('estrutura');
caso('C: estrutura diferente (sem filtro, sem tabelas, CSV 404, sem links, API 500) é apontada sem travar', () => {
  assert.equal(C.code, 0, C.err);
  assert.ok(!C.relatorio.includes('FALHA INESPERADA'), (C.relatorio.match(/FALHA INESPERADA[^\n]*\n[^\n]*/) || [''])[0]);
  assert.ok(resumo(C.relatorio, 'A página geral lista').includes('[ATENÇÃO]') && resumo(C.relatorio, 'A página geral lista').includes(' 0 deputados'));
  assert.ok(resumo(C.relatorio, 'mostra os totais').includes('[ATENÇÃO]') && resumo(C.relatorio, 'mostra os totais').includes('0 de 4'));
  assert.ok(resumo(C.relatorio, 'Não deu para escolher deputados').includes('[ATENÇÃO]'));
  assert.ok(resumo(C.relatorio, `Moradia, ano de ${ANO}`).includes('[ATENÇÃO]'), 'moradia sem tabela');
  assert.ok(resumo(C.relatorio, 'links de consulta individual').includes('[ATENÇÃO]') && resumo(C.relatorio, 'links de consulta individual').includes('traz 0 links'));
  assert.ok(C.relatorio.includes('CSV do Portal') && C.relatorio.includes('HTTP 404'), 'CSV 404');
  assert.ok(resumo(C.relatorio, 'CSV completo da cota').includes('[ATENÇÃO]'));
  assert.ok(resumo(C.relatorio, 'A API de despesas por deputado').includes('[ATENÇÃO]'));
});

// ---------- cenário D: filtros ignorados e paginação que não avança ----------
const D = await rodar('ignorafiltro');
caso('D: filtro por deputado ignorado, ano ignorado e paginação repetida são apontados', () => {
  assert.equal(D.code, 0, D.err);
  assert.ok(!D.relatorio.includes('FALHA INESPERADA'), (D.relatorio.match(/FALHA INESPERADA[^\n]*\n[^\n]*/) || [''])[0]);
  const f = resumo(D.relatorio, 'O filtro por deputado');
  assert.ok(f.includes('[ATENÇÃO]') && f.includes('IGNORADO'), f);
  const a = resumo(D.relatorio, 'O parâmetro "ano"');
  assert.ok(a.includes('[ATENÇÃO]') && a.includes('NÃO mudou'), a);
  assert.ok(D.relatorio.includes('página repetida (a paginação não avança)'), 'paginação repetida');
  assert.ok(D.relatorio.includes('Testando outras formas de endereço'), 'variantes de endereço');
  assert.ok(resumo(D.relatorio, 'Nenhuma das 3 formas de endereço').includes('[ATENÇÃO]'), resumo(D.relatorio, 'formas de endereço'));
  const m = resumo(D.relatorio, `Moradia, ano de ${ANO}`);
  assert.ok(m.includes('[ATENÇÃO]') && m.includes('pode estar incompleta'), m);
  assert.ok(resumo(D.relatorio, 'NÃO traz a remuneração dele').includes('[ATENÇÃO]'));
  assert.ok(!NOMES_OU_CPF.test(D.relatorio));
});

if (process.env.DIAG_DUMP) for (const [k, v] of Object.entries({ A, B, C, D })) writeFileSync(path.join(process.env.DIAG_DUMP, `relatorio2-${k}.txt`), v.relatorio);
console.log(falhas === 0 ? '\nTodos os testes passaram.' : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
