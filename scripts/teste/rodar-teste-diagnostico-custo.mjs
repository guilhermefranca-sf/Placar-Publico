// Teste do diagnóstico de custo dos deputados, contra um "Portal da Câmara" FALSO rodando na própria máquina
// (sem internet). Três situações: tudo certo, site bloqueando a leitura e dados só resumidos.
// Confere: leitura de totais, links e botões de download, tabelas de moradia e verba, cota contra o Portal,
// secretários ligados aos deputados, remuneração com título antes do cabeçalho em Latin-1, falhas sem travar,
// e que nenhum nome de pessoa nem CPF vaza para o relatório ou para as amostras.
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const SCRIPT = new URL('../diagnostico-custo.mjs', import.meta.url).pathname;
const ANO = new Date().getFullYear();
let falhas = 0;
const caso = (nome, fn) => { try { fn(); console.log('ok:', nome); } catch (e) { falhas++; console.log('FALHOU:', nome, '\n   ', String(e.message).split('\n').slice(0, 3).join(' | ')); } };

const pad = (n, t) => String(n).padStart(t, '0');
const pt = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (v) => `R$ ${pt(v)}`;

// ---------- dados simulados ----------
const NDEP = 513;
const deputados = Array.from({ length: NDEP }, (_, k) => ({ id: 1000 + k + 1, nome: `Dep Alfa ${pad(k + 1, 3)}` }));
const SEM_GABINETE = new Set([1, 2, 3]); // sem lotação encontrada
const AMBIGUOS = new Set([10, 11]); // duas lotações com o nome
let seq = 0;
const cpfFalso = () => { const n = ++seq; return `${pad(n % 1000, 3)}.${pad((n * 7) % 1000, 3)}.${pad((n * 13) % 1000, 3)}-${pad(n % 100, 2)}`; };
const nomeFalso = (n) => `Pessoa ${pad(n, 5)}`;

const funcionarios = []; // { nome, cpf, cargo, lotacao, data }
let pessoa = 0;
let spEsperado = 0;
deputados.forEach((d, k) => {
  const i = k + 1;
  if (SEM_GABINETE.has(i)) return;
  const n = 5 + (i % 6);
  for (let j = 0; j < n; j++) { funcionarios.push({ nome: nomeFalso(++pessoa), cpf: cpfFalso(), cargo: 'Secretário Parlamentar', lotacao: `Gabinete do Deputado ${d.nome}`, data: '2023-02-01' }); spEsperado++; }
  if (AMBIGUOS.has(i)) for (let j = 0; j < 2; j++) { funcionarios.push({ nome: nomeFalso(++pessoa), cpf: cpfFalso(), cargo: 'Secretário Parlamentar', lotacao: `Gabinete Apoio ${d.nome}`, data: '2024-03-01' }); spEsperado++; }
});
for (let j = 0; j < 300; j++) funcionarios.push({ nome: nomeFalso(++pessoa), cpf: cpfFalso(), cargo: 'Analista Legislativo', lotacao: 'Comissão de Saúde', data: '2010-05-10' });
for (let j = 0; j < 20; j++) funcionarios.push({ nome: nomeFalso(++pessoa), cpf: cpfFalso(), cargo: 'Cargo de Natureza Especial', lotacao: 'Liderança do Partido X', data: '2023-03-01' });
const csvFuncionarios = ['Nome;CPF;Cargo;Lotação;Data de nomeação', ...funcionarios.map((f) => [f.nome, f.cpf, f.cargo, f.lotacao, f.data].join(';'))].join('\n') + '\n';
const csvSemSecretarios = ['Nome;CPF;Cargo;Lotação;Data de nomeação', ...funcionarios.filter((f) => f.cargo !== 'Secretário Parlamentar').map((f) => [f.nome, f.cpf, f.cargo, f.lotacao, f.data].join(';'))].join('\n') + '\n';

// Cota (CEAP): 6 meses por deputado, mais despesas sem deputado e de outro ano (que devem ficar de fora).
const TIPOS = ['PASSAGEM AÉREA - SIGEPA', 'DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR.', 'LOCAÇÃO OU FRETAMENTO DE VEÍCULOS AUTOMOTORES', 'TELEFONIA'];
const cabCeap = 'txNomeParlamentar;cpf;ideCadastro;sgUF;txtDescricao;txtCNPJCPF;vlrDocumento;vlrGlosa;vlrLiquido;numMes;numAno';
const linhasCeap = [];
let somaCeap = 0;
deputados.forEach((d, k) => {
  for (let m = 1; m <= 6; m++) {
    const doc = 1000 + ((k * 37 + m * 11) % 900) + 0.5;
    const glosa = m === 3 ? 10 : 0;
    somaCeap += doc - glosa;
    linhasCeap.push([d.nome, '111.222.333-44', d.id, 'MT', TIPOS[(k + m) % 4], '12.345.678/0001-90', doc.toFixed(2), glosa.toFixed(2), (doc - glosa).toFixed(2), m, ANO].join(';'));
  }
});
for (let j = 0; j < 40; j++) { somaCeap += 250; linhasCeap.push(['LIDERANÇA DO PARTIDO X', '', '', 'DF', TIPOS[1], '', '250.00', '0.00', '250.00', 2, ANO].join(';')); }
for (let j = 0; j < 5; j++) linhasCeap.push([deputados[0].nome, '', deputados[0].id, 'MT', TIPOS[0], '', '999.00', '0.00', '999.00', 12, ANO - 1].join(';'));
const csvCeap = [cabCeap, ...linhasCeap].join('\n') + '\n';

// Moradia (baixável) e verba de gabinete (botão com data-url).
const csvMoradia = ['Nome do parlamentar;Partido;UF;Ocupação de imóvel no período (dias);Auxílio-moradia recebido (R$);Complemento pela cota (R$)',
  ...Array.from({ length: 717 }, (_, k) => [`Dep Alfa ${pad((k % NDEP) + 1, 3)}`, 'PX', 'MT', k % 3 === 0 ? 900 : 0, k % 3 === 0 ? '0,00' : pt(4253 * ((k % 5) + 1)), k % 7 === 0 ? pt(1500) : '0,00'].join(';'))].join('\n') + '\n';
const csvVerba = ['Deputado;Mês/Ano;Valor gasto (R$);Limite mensal (R$)',
  ...deputados.flatMap((d, k) => Array.from({ length: 10 }, (_, m) => [d.nome, `${pad(m + 1, 2)}/${ANO}`, pt(90000 + ((k * 31 + m * 17) % 60000)), pt(165806.07)].join(';')))].join('\n') + '\n';
const csvTabelaComparativa = ['Deputado;UF;Partido;Cota (R$)', ...deputados.map((d, k) => [d.nome, 'MT', 'PX', pt(100000 + k)].join(';'))].join('\n') + '\n';

// Remuneração: título antes do cabeçalho, Latin-1, uma linha por pessoa.
const linhasRem = ['Relatório consolidado de remunerações - outubro de 2026;;;;;;', 'Nome;Categoria;Lotação;Remuneração fixa;Auxílios;Descontos;Remuneração após descontos'];
deputados.forEach((d, k) => linhasRem.push([d.nome, 'Deputado', 'Câmara dos Deputados', '46.366,19', k % 4 === 0 ? '4.253,00' : '0,00', '-13.000,00', pt(46366.19 + (k % 4 === 0 ? 4253 : 0) - 13000)].join(';')));
for (let j = 0; j < 4000; j++) linhasRem.push([nomeFalso(90000 + j), 'Secretário Parlamentar', `Gabinete do Deputado ${deputados[j % NDEP].nome}`, pt(1800 + ((j * 53) % 7200)), '1.200,00', '-400,00', pt(2600 + ((j * 53) % 7200))].join(';'));
const csvRemuneracao = linhasRem.join('\n') + '\n';
const csvRemuneracaoResumo = ['Categoria;Quantidade;Remuneração total (R$)', 'Deputado;513;28.000.000,00', 'Secretário Parlamentar;9800;55.000.000,00', 'Servidor efetivo;9000;180.000.000,00'].join('\n') + '\n';

// Totais mostrados na página inicial do Portal.
const TOTAIS = { cota: somaCeap * 1.01, verba: 528813556.47, moradia: 4040334.19, viagens: 3202247.33 };

// ---------- servidor falso ----------
const filler = 'Cada deputado tem direito a verbas e recursos para o exercício do mandato, com regras próprias de comprovação e de limite mensal. '.repeat(20);
const paginaInicial = () => `<html><head><title>Gastos parlamentares</title></head><body><h1>Conheça as verbas e recursos</h1><p>${filler}</p>
<h2>Cota</h2><p>Em ${ANO}, na legislatura 57, gasto de todos os deputados com cota:</p><p>${rs(TOTAIS.cota)}</p>
<a href="/transparencia/cota/detalhamento">Busca detalhada</a> <a href="/transparencia/gastos-parlamentares/tabelaComparativa.csv">Baixe dados</a>
<h2>Verba de Gabinete</h2><p>Limite mensal de R$ 165.806,07. Em ${ANO}, na legislatura 57, gasto de todos os deputados com verba de gabinete: ${rs(TOTAIS.verba)}</p>
<a href="/transparencia/verba-gabinete/detalhamento">Busca detalhada de verba de gabinete</a>
<h2>Imóveis funcionais e auxílio-moradia</h2><p>Em ${ANO}, na legislatura 57, gasto de todos os deputados com auxílio-moradia: ${rs(TOTAIS.moradia)}</p><a href="/moradia/detalhamento">Busca detalhada</a>
<h2>Remuneração</h2><a href="/transparencia/recursos-humanos/consulta?categoria=Deputado&amp;situacao=Em+exercicio">Busca detalhada de remuneração</a>
<h2>Viagens Oficiais</h2><p>Em ${ANO}, na legislatura 57, gasto de todos os deputados com viagens oficiais: ${rs(TOTAIS.viagens)}</p><a href="/transparencia/viagens/detalhamento">Busca detalhada de viagens oficiais</a>
<a href="https://www.facebook.com/camara">Facebook</a><a href="/noticias/algo">Notícias</a></body></html>`;
const paginaCasca = () => '<html><head><title>Gastos</title><script src="/static/app.js"></script></head><body><div id="app"></div><script>fetch("/api/gastos?ano=2026").then(r=>r.json())</script></body></html>';

function criarServidor(modo) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      const pth = u.pathname;
      const enviar = (status, corpo, tipo = 'text/html; charset=utf-8', extra = {}) => { res.writeHead(status, { 'content-type': tipo, ...extra }); res.end(corpo); };
      const csv = (texto, nome, latin1 = false) => enviar(200, latin1 ? Buffer.from(texto, 'latin1') : texto, 'text/csv; charset=utf-8', { 'content-disposition': `attachment; filename="${nome}"` });
      if (modo === 'bloqueado') {
        if (pth.startsWith('/transparencia') || pth.startsWith('/moradia')) return enviar(403, '<html><title>Acesso negado</title></html>');
        return enviar(404, 'nao encontrado');
      }
      if (pth === '/transparencia/gastos-parlamentares') return enviar(200, modo === 'agregado' ? paginaCasca() : paginaInicial());
      if (pth === '/transparencia/gastos-parlamentares/tabelaComparativa.csv') return csv(csvTabelaComparativa, 'tabelaComparativa.csv');
      if (pth === '/transparencia/cota/detalhamento') return enviar(200, '<html><title>Cota</title><body><table><tr><td>x</td></tr></table></body></html>');
      if (pth === '/transparencia/verba-gabinete/detalhamento') return enviar(200, '<html><title>Verba de gabinete</title><body><table><tr><td>x</td></tr></table><button type="button" class="btn btn-download" data-url="/transparencia/verba-gabinete/exportar.csv">Baixar dados</button></body></html>');
      if (pth === '/transparencia/verba-gabinete/exportar.csv') return csv(csvVerba, 'verba.csv');
      if (pth === '/moradia/detalhamento') return enviar(200, '<html><title>Busca de Imóveis Funcionais e Auxílio-moradia</title><body><form method="get" action="/moradia/detalhamento"><select name="legislatura"></select><input name="nome"></form><table><tr><td>x</td></tr></table><a class="botao" href="/moradia/detalhamento/baixar?formato=csv">Baixar</a></body></html>');
      if (pth === '/moradia/detalhamento/baixar') return csv(csvMoradia, 'moradia.csv');
      if (pth === '/transparencia/recursos-humanos/consulta') return enviar(200, '<html><title>Consulta</title><body><form action="/transparencia/recursos-humanos/consulta"><input name="categoria"></form></body></html>');
      if (pth === '/transparencia/viagens/detalhamento') return enviar(200, '<html><title>Viagens oficiais</title><body><table><tr><td>diária</td></tr></table></body></html>');
      if (pth === '/api/deputados') {
        const pg = Number(u.searchParams.get('pagina') || 1);
        return enviar(200, JSON.stringify({ dados: deputados.slice((pg - 1) * 100, pg * 100) }), 'application/json');
      }
      if (pth === '/arq/funcionarios/csv/funcionarios.csv') return csv(modo === 'agregado' ? csvSemSecretarios : csvFuncionarios, 'funcionarios.csv');
      if (pth === `/cotas/Ano-${ANO}.csv.zip`) return enviar(200, zipCeap, 'application/zip');
      const base = `/w2/transparencia/recursos-humanos/remuneracao/relatorios-consolidados-por-ano-e-mes/${ANO}`;
      if (pth === base) return enviar(200, `<html><title>${ANO}</title><body>
<a href="${base}/setembro-de-${ANO}-csv/view">Setembro de ${ANO} CSV</a><a href="${base}/setembro-de-${ANO}-pdf/view">Setembro PDF</a>
<a href="${base}/outubro-de-${ANO}-csv/view">Outubro de ${ANO} CSV</a><a href="${base}/novembro-de-${ANO}-pdf/view">Novembro PDF</a>
<a href="${base}/agosto-de-${ANO}-csv/view">Agosto de ${ANO} CSV</a></body></html>`);
      if (pth === `${base}/outubro-de-${ANO}-csv/view`) return enviar(200, `<html><title>Outubro</title><body><a href="${base}/outubro-de-${ANO}-csv/at_download/file">Baixar</a></body></html>`);
      if (pth === `${base}/outubro-de-${ANO}-csv/at_download/file`) return csv(modo === 'agregado' ? csvRemuneracaoResumo : csvRemuneracao, 'outubro.csv', true);
      return enviar(404, 'nao encontrado');
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

const dirCeap = mkdtempSync(path.join(tmpdir(), 'ceap-sim-'));
writeFileSync(path.join(dirCeap, `Ano-${ANO}.csv`), csvCeap);
const z = spawnSync('zip', ['-j', '-q', path.join(dirCeap, `Ano-${ANO}.csv.zip`), path.join(dirCeap, `Ano-${ANO}.csv`)]);
assert.equal(z.status, 0, 'não consegui montar o zip simulado');
const zipCeap = readFileSync(path.join(dirCeap, `Ano-${ANO}.csv.zip`));

async function rodar(modo) {
  const srv = await criarServidor(modo);
  const base = `http://127.0.0.1:${srv.address().port}`;
  const saida = mkdtempSync(path.join(tmpdir(), 'diag-saida-'));
  const cwd = mkdtempSync(path.join(tmpdir(), 'diag-cwd-'));
  const env = { ...process.env, DIAG_PORTAL: base, DIAG_WWW2: `${base}/w2`, DIAG_ARQ: `${base}/arq`, DIAG_API: `${base}/api`, DIAG_CEAP: `${base}/cotas`, DIAG_SAIDA: saida, DIAG_ANOS: String(ANO), DIAG_ESPERA_MS: '0', GITHUB_STEP_SUMMARY: '' };
  const filho = spawn(process.execPath, [SCRIPT], { env, cwd });
  let out = ''; let err = '';
  filho.stdout.on('data', (d) => { out += d; });
  filho.stderr.on('data', (d) => { err += d; });
  const code = await new Promise((r) => filho.on('close', r));
  srv.close();
  const arq = path.join(saida, 'diagnostico-custo.txt');
  const relatorio = existsSync(arq) ? readFileSync(arq, 'utf8') : '';
  const amostras = existsSync(path.join(saida, 'amostras')) ? readdirSync(path.join(saida, 'amostras')).map((f) => readFileSync(path.join(saida, 'amostras', f), 'latin1')) : [];
  return { code, relatorio, out, err, amostras, cwdVazio: readdirSync(cwd).length === 0 };
}
const resumo = (rel, trecho) => rel.split('\n').find((l) => /^\s+\[(OK|ATENÇÃO)\]/.test(l) && l.includes(trecho)) || '';
const NOMES_OU_CPF = /Pessoa \d{5}|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;

// ---------- cenário A: tudo certo ----------
const A = await rodar('completo');
caso('A: roda sem erro e grava o relatório', () => { assert.equal(A.code, 0, A.err); assert.ok(A.relatorio.length > 2000); assert.ok(!A.relatorio.includes('FALHA INESPERADA'), 'houve falha inesperada'); });
caso('A: não escreve nada fora da pasta de saída', () => assert.ok(A.cwdVazio));
caso('A: lê os 4 totais do Portal', () => {
  assert.ok(A.relatorio.includes(rs(TOTAIS.verba)), 'verba');
  assert.ok(A.relatorio.includes(rs(TOTAIS.moradia)), 'moradia');
  assert.ok(A.relatorio.includes(rs(TOTAIS.viagens)), 'viagens');
  assert.ok(A.relatorio.includes(rs(TOTAIS.cota)), 'cota');
  assert.ok(resumo(A.relatorio, 'mostra os totais').includes('[OK]') && resumo(A.relatorio, 'mostra os totais').includes('4 de 4'));
});
caso('A: acha a tabela de moradia pelo botão "Baixar" e vê as colunas', () => {
  assert.ok(resumo(A.relatorio, 'Moradia').includes('[OK]'), resumo(A.relatorio, 'Moradia'));
  assert.ok(resumo(A.relatorio, 'Moradia').includes('717 linhas'));
  assert.ok(A.relatorio.includes('Auxílio-moradia recebido (R$)'));
});
caso('A: acha a verba de gabinete pelo botão com data-url (e ignora a classe btn-download)', () => {
  assert.ok(resumo(A.relatorio, 'Verba de gabinete').includes('[OK]'), resumo(A.relatorio, 'Verba de gabinete'));
  assert.ok(resumo(A.relatorio, 'Verba de gabinete').includes('5.130 linhas'));
  assert.ok(!A.relatorio.includes('btn%20btn-download'), 'seguiu a classe do botão como se fosse endereço');
});
caso('A: viagens sem arquivo aparece como ATENÇÃO', () => {
  const l = resumo(A.relatorio, 'Viagens');
  assert.ok(l.includes('[ATENÇÃO]') && l.includes('não achei tabela baixável'), l);
});
caso('A: ignora Facebook e notícias ao varrer', () => assert.ok(!A.relatorio.includes('facebook.com') && !A.relatorio.includes('/noticias/algo')));
caso('A: cota bate com o Portal dentro de 3%', () => {
  const l = resumo(A.relatorio, 'total da cota');
  assert.ok(l.includes('[OK]'), l);
  assert.ok(A.relatorio.includes(`total (documento − glosa): ${rs(somaCeap)}`), 'soma da cota');
  assert.ok(A.relatorio.includes('-1,0%'), 'diferença');
});
caso('A: cota ignora outro ano e conta despesas sem deputado', () => {
  assert.ok(A.relatorio.includes(`CEAP ${ANO}: ${(NDEP * 6 + 40).toLocaleString('pt-BR')} despesas`), 'linhas do ano');
  assert.ok(A.relatorio.includes('despesas sem deputado identificado: 40 linhas'));
});
caso('A: secretários contados e ligados aos deputados (expectativa feita à parte)', () => {
  assert.ok(resumo(A.relatorio, 'secretários parlamentares identificados').includes(spEsperado.toLocaleString('pt-BR')), resumo(A.relatorio, 'secretários parlamentares identificados'));
  const comUma = NDEP - SEM_GABINETE.size - AMBIGUOS.size;
  assert.ok(A.relatorio.includes(`${comUma} com exatamente uma lotação, ${AMBIGUOS.size} ambíguos (várias), ${SEM_GABINETE.size} sem lotação encontrada`), 'ligação');
  assert.ok(resumo(A.relatorio, 'ligados a exatamente um gabinete').includes('[OK]'));
});
caso('A: avisa que o arquivo de funcionários não tem salário', () => {
  const l = resumo(A.relatorio, 'Funcionários: o arquivo NÃO tem salário');
  assert.ok(l.includes('[ATENÇÃO]'), l);
});
caso('A: remuneração: acha o mês certo, Latin-1, título antes do cabeçalho, nominal e 513 deputados', () => {
  assert.ok(resumo(A.relatorio, 'achei o CSV mais recente').includes('outubro'), resumo(A.relatorio, 'achei o CSV mais recente'));
  assert.ok(A.relatorio.includes('Windows-1252'), 'codificação');
  assert.ok(A.relatorio.includes('1 linha(s) de título antes do cabeçalho'));
  assert.ok(resumo(A.relatorio, 'a tabela é nominal').includes('[OK]'));
  assert.ok(resumo(A.relatorio, 'linhas de deputados').includes('[OK]') && resumo(A.relatorio, 'linhas de deputados').includes('513'));
  assert.ok(A.relatorio.includes('deputados, "Remuneração fixa": mín 46.366,19'));
});
caso('A: não vaza nomes de pessoas nem CPF (relatório e amostras)', () => {
  assert.ok(!NOMES_OU_CPF.test(A.relatorio), `vazou: ${(NOMES_OU_CPF.exec(A.relatorio) || [])[0]}`);
  assert.ok(A.amostras.length >= 3, 'deveria guardar páginas e tabelas públicas como amostra');
  assert.ok(A.amostras.every((a) => !NOMES_OU_CPF.test(a)), 'amostra com dado pessoal');
});

// ---------- cenário B: site bloqueando ----------
const B = await rodar('bloqueado');
caso('B: bloqueio não derruba nada e fica claro no relatório', () => {
  assert.equal(B.code, 0, B.err);
  assert.ok(!B.relatorio.includes('FALHA INESPERADA'));
  assert.ok(B.relatorio.includes('HTTP 403') && B.relatorio.includes('bloqueando leitura automática'));
  assert.ok(B.relatorio.includes('0 de 4'));
  assert.ok(B.relatorio.includes('O arquivo de funcionários não pôde ser lido'));
  assert.ok(B.relatorio.includes('CEAP') && B.relatorio.includes('FALHA ao baixar ou abrir'));
  assert.ok(B.relatorio.includes('não achei links de CSV mensal'));
  assert.ok(!/\[OK\]/.test(B.relatorio.split('\n').filter((l) => /^\s+\[/.test(l)).join('\n')), 'nenhum item deveria estar OK');
  assert.ok(B.relatorio.includes('Indicativo automático:') && !B.relatorio.includes('Indicativo automático: todas'));
});

// ---------- cenário C: página montada por script e dados só resumidos ----------
const C = await rodar('agregado');
caso('C: página-casca avisa e mostra a pista da API', () => {
  assert.equal(C.code, 0, C.err);
  assert.ok(C.relatorio.includes('ATENÇÃO: página com pouco texto'));
  assert.ok(C.relatorio.includes('/api/gastos?ano=2026'), 'pista da API');
  assert.ok(C.relatorio.includes('0 de 4'));
});
caso('C: sem secretários no arquivo e remuneração só resumida são apontados', () => {
  assert.ok(resumo(C.relatorio, 'secretários parlamentares identificados').includes('[ATENÇÃO]') && resumo(C.relatorio, 'secretários parlamentares identificados').includes(' 0 '), resumo(C.relatorio, 'secretários parlamentares identificados'));
  assert.ok(C.relatorio.includes('Secretários parlamentares: nenhuma linha encontrada'));
  assert.ok(resumo(C.relatorio, 'NÃO parece nominal').includes('[ATENÇÃO]'), resumo(C.relatorio, 'NÃO parece nominal'));
  assert.ok(!NOMES_OU_CPF.test(C.relatorio));
});

if (process.env.DIAG_DUMP) for (const [k, v] of Object.entries({ A, B, C })) writeFileSync(path.join(process.env.DIAG_DUMP, `relatorio-${k}.txt`), v.relatorio);
console.log(falhas === 0 ? '\nTodos os testes passaram.' : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
