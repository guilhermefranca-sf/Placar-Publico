// Teste do diagnóstico de presença em comissões, com arquivos SIMULADOS (modo local, sem internet).
// Confere: leitura dos 4 arquivos, cruzamento titular x presença (contra uma conta independente),
// variações de nome de coluna, falhas de download e que nada é gravado fora da pasta de saída.
import { mkdirSync, writeFileSync, readFileSync, existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const SCRIPT = new URL('../diagnostico-comissoes.mjs', import.meta.url).pathname;
let falhas = 0;
const caso = (nome, fn) => { try { fn(); console.log('ok:', nome); } catch (e) { falhas++; console.log('FALHOU:', nome, '\n   ', e.message.split('\n')[0]); } };

const csv = (cab, linhas) => [cab.join(';'), ...linhas.map((l) => l.join(';'))].join('\n') + '\n';
const dia = (iso, soma = 0) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + soma)).toISOString().slice(0, 10);

// ---------- dados simulados ----------
const orgaos = [
  { id: 'O1', sigla: 'CCJ', nome: 'Comissão de Constituição e Justiça', tipo: 'Comissão Permanente' },
  { id: 'O2', sigla: 'CSAUDE', nome: 'Comissão de Saúde', tipo: 'Comissão Permanente' },
  { id: 'O3', sigla: 'CEESP', nome: 'Comissão Especial X', tipo: 'Comissão Especial' }
];
const membros = []; // { org, dep, cargo, ini, fim }
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
for (const d of range(1, 20)) membros.push({ org: 'O1', dep: d, cargo: 'Titular', ini: '2023-02-01', fim: d === 1 ? '2025-04-15' : '' });
for (const d of range(21, 25)) membros.push({ org: 'O1', dep: d, cargo: 'Suplente', ini: '2023-02-01', fim: '' });
membros.push({ org: 'O1', dep: 36, cargo: 'Titular', ini: '2026-03-01', fim: '' });
for (const d of range(11, 30)) membros.push({ org: 'O2', dep: d, cargo: d === 11 ? 'Presidente' : 'Titular', ini: '2023-02-01', fim: '' });
for (const d of range(31, 35)) membros.push({ org: 'O3', dep: d, cargo: 'Titular', ini: '2023-02-01', fim: '' });

const eventos = []; // { id, data, tipo, situacao, local, orgs, ano }
let n = 0;
const novo = (data, tipo, situacao, orgs, local = 'Anexo II, Plenário 10') => { const e = { id: `E${++n}`, data, tipo, situacao, local, orgs, ano: +data.slice(0, 4) }; eventos.push(e); return e; };
range(0, 4).forEach((k) => novo(dia('2025-02-10', k * 7), 'Sessão Deliberativa', 'Encerrada (Final)', [], 'Plenário da Câmara dos Deputados'));
range(0, 13).forEach((k) => novo(dia('2025-03-03', k * 7), 'Reunião Deliberativa', 'Encerrada (Final)', k === 0 ? ['O1', 'O2'] : ['O1']));
range(0, 11).forEach((k) => novo(dia('2025-03-05', k * 7), 'Reunião Deliberativa', 'Encerrada (Final)', ['O2']));
range(0, 7).forEach((k) => novo(dia('2026-03-02', k * 7), 'Reunião Deliberativa', 'Encerrada (Final)', ['O1']));
novo('2025-05-05', 'Reunião Deliberativa', 'Encerrada (Final)', ['O3']);
novo('2025-05-06', 'Audiência Pública', 'Encerrada (Final)', ['O1']);
novo('2025-05-07', 'Reunião Não Deliberativa', 'Encerrada (Final)', ['O1']);
novo('2025-05-08', 'Reunião Deliberativa', 'Encerrada (Final)', []); // sem órgão ligado
const futuro = novo('2026-12-01', 'Reunião Deliberativa', 'Convocada', ['O1']);

const ativo = (m, data) => (!m.ini || m.ini <= data) && (!m.fim || m.fim >= data);
const titularesAtivos = (org, data) => membros.filter((m) => m.org === org && m.cargo !== 'Suplente' && ativo(m, data)).map((m) => m.dep);
const encerrada = (e) => /^Encerrada/.test(e.situacao);

const presencas = []; // [idEvento, idDeputado]
eventos.forEach((e, idx) => {
  if (e.tipo === 'Sessão Deliberativa') { range(1, 40).forEach((d) => presencas.push([e.id, d])); return; }
  const esperados = new Set(e.orgs.flatMap((o) => titularesAtivos(o, e.data)));
  [...esperados].forEach((d) => { if (e === futuro || (d + idx) % 4 !== 0) presencas.push([e.id, d]); });
  if (e.tipo === 'Reunião Deliberativa' && encerrada(e) && e.orgs.includes('O1')) { presencas.push([e.id, 38]); presencas.push([e.id, 21]); }
});
presencas.push(['GHOST', 1]);

// Conta independente do que o diagnóstico deve achar.
function esperado(filtro) {
  const porDep = new Map();
  let reunioes = 0;
  for (const e of eventos) {
    if (e.tipo !== 'Reunião Deliberativa' || !encerrada(e)) continue;
    const orgs = e.orgs.filter(filtro);
    const esp = new Set(orgs.flatMap((o) => titularesAtivos(o, e.data)));
    if (!esp.size) continue;
    reunioes++;
    esp.forEach((d) => porDep.set(d, (porDep.get(d) || 0) + 1));
  }
  return { reunioes, deps: porDep.size, comMin: [...porDep.values()].filter((v) => v >= 10).length };
}
const permanentes = new Set(['O1', 'O2']);
const ESP_TODAS = esperado(() => true);
const ESP_PERM = esperado((o) => permanentes.has(o));

function gerar(pasta, { variante = 1, semMembros = false, apiMembros = false } = {}) {
  const porAno = (ano) => eventos.filter((e) => e.ano === ano);
  for (const ano of [2025, 2026]) {
    writeFileSync(path.join(pasta, `eventos-${ano}.csv`), csv(['id', 'uri', 'dataHoraInicio', 'dataHoraFim', 'situacao', 'descricao', 'descricaoTipo', 'localExterno', 'localCamara.nome'],
      porAno(ano).map((e) => [e.id, '', `${e.data}T10:00`, '', e.situacao, 'texto; com ponto e vírgula'.replace(';', ','), e.tipo, '', e.local])));
    const U = 'https://dadosabertos.camara.leg.br/api/v2';
    const cabOrg = variante === 4 ? ['idEvento', 'uriEvento', 'idOrgao', 'uriOrgao', 'siglaOrgao'] : variante === 1 ? ['idEvento', 'uriEvento', 'idOrgao', 'uriOrgao', 'nomeOrgao', 'siglaOrgao'] : variante === 3 ? ['evento_id', 'uri', 'orgao_id', 'uri', 'nome', 'sigla'] : ['id_evento', 'uri', 'id_orgao', 'uri', 'nome', 'sigla'];
    writeFileSync(path.join(pasta, `eventosOrgaos-${ano}.csv`), csv(cabOrg,
      porAno(ano).flatMap((e) => e.orgs.map((o) => { const g = orgaos.find((x) => x.id === o); return variante === 4 ? [e.id, `${U}/eventos/${e.id}`, o, `${U}/orgaos/${o}`, g.sigla] : [e.id, '', o, '', g.nome, g.sigla]; }))));
    const idsAno = new Set(porAno(ano).map((e) => e.id));
    writeFileSync(path.join(pasta, `eventosPresencaDeputados-${ano}.csv`), csv(['idEvento', 'uriEvento', 'dataHoraInicio', 'idDeputado', 'uriDeputado'],
      presencas.filter(([ev]) => idsAno.has(ev) || (ano === 2025 && ev === 'GHOST')).map(([ev, d]) => [ev, '', '', d, ''])));
  }
  if (!semMembros && variante === 4) {
    const U = 'https://dadosabertos.camara.leg.br/api/v2';
    writeFileSync(path.join(pasta, 'orgaosDeputados-L57.csv'), csv(['uriOrgao', 'siglaOrgao', 'nomeOrgao', 'nomePublicacaoOrgao', 'uriDeputado', 'nomeDeputado', 'siglaPartido', 'siglaUF', 'cargo', 'dataInicio', 'dataFim'],
      membros.map((m) => { const g = orgaos.find((x) => x.id === m.org); return [`${U}/orgaos/${m.org}`, g.sigla, g.nome, g.nome, `${U}/deputados/${m.dep}`, `Dep ${m.dep}`, 'AAA', 'MT', m.cargo, m.ini, m.fim]; })));
  } else if (!semMembros) {
    const cab = variante === 1
      ? ['idOrgao', 'uriOrgao', 'siglaOrgao', 'nomeOrgao', 'idDeputado', 'uriDeputado', 'nomeDeputado', 'cargo', 'dataInicio', 'dataFim']
      : ['idOrgao', 'uriOrgao', 'siglaOrgao', 'nomeOrgao', 'idDeputado', 'uriDeputado', 'nomeDeputado', 'titulo', 'dataInicio', 'dataFim'];
    writeFileSync(path.join(pasta, 'orgaosDeputados-57.csv'), csv(cab,
      membros.map((m) => { const g = orgaos.find((x) => x.id === m.org); return [m.org, '', g.sigla, g.nome, m.dep, '', `Dep ${m.dep}`, m.cargo, m.ini ? `${m.ini}T00:00` : '', m.fim ? `${m.fim}T00:00` : '']; })));
  }
  if (apiMembros) writeFileSync(path.join(pasta, 'api-membros.json'), JSON.stringify({ dados: [{ id: 5, nome: 'Dep X', siglaPartido: 'AAA', titulo: 'Titular', codTitulo: '1', dataInicio: '2023-02-01T00:00', dataFim: null }] }));
  writeFileSync(path.join(pasta, 'api-orgaos.json'), JSON.stringify({ dados: orgaos.map((o) => ({ id: o.id, sigla: o.sigla, nome: o.nome, tipoOrgao: o.tipo })) }));
}

function rodar(opcoes) {
  const raiz = mkdtempSync(path.join(tmpdir(), 'diag-'));
  const dados = path.join(raiz, 'csv'); const saida = path.join(raiz, 'saida'); const cwd = path.join(raiz, 'cwd');
  mkdirSync(dados); mkdirSync(cwd);
  gerar(dados, opcoes);
  const r = spawnSync('node', [SCRIPT], { cwd, encoding: 'utf8', env: { ...process.env, DIAG_LOCAL: dados, DIAG_SAIDA: saida, DIAG_ANOS: '2025,2026', DIAG_LEGISLATURA: '57' } });
  const arq = path.join(saida, 'diagnostico-comissoes.txt');
  return { status: r.status, stderr: r.stderr, texto: existsSync(arq) ? readFileSync(arq, 'utf8') : '', cwdArquivos: readdirSync(cwd) };
}

const linhaCom = (texto, trecho) => texto.split('\n').find((l) => l.includes(trecho)) || '';
const numeroApos = (texto, trecho) => Number((linhaCom(texto, trecho).split(trecho)[1] || '').trim().split(/[ ·]/)[0].replace(/\./g, ''));

// ---------- casos ----------
const base = rodar({ variante: 1 });

caso('roda sem erro e grava só a pasta de saída (nada no diretório de trabalho)', () => {
  assert.equal(base.status, 0, base.stderr);
  assert.ok(base.texto.includes('RESUMO: o que foi confirmado'));
  assert.deepEqual(base.cwdArquivos, [], 'não deve criar arquivos no diretório de trabalho');
});

caso('lê eventos, órgãos por evento, presença e membros e mostra as colunas', () => {
  for (const t of ['Arquivo de eventos de 2025 baixou', 'Arquivo de eventos de 2026 baixou', 'Arquivo de órgãos por evento de 2025 baixou', 'Arquivo de presença de 2026 baixou']) assert.ok(base.texto.includes(t), t);
  assert.ok(base.texto.includes('Colunas: id | uri | dataHoraInicio'), 'colunas de eventos');
  assert.ok(base.texto.includes('Valores da coluna de cargo'), 'cargos');
  assert.ok(base.texto.includes('Titular'), 'valor Titular');
});

caso('classifica presença por tipo de evento, inclusive evento fantasma e evento futuro', () => {
  assert.ok(/evento-nao-encontrado/.test(base.texto), 'evento não encontrado');
  assert.ok(/reuniao-deliberativa \(nao encerrado\)/.test(base.texto), 'reunião futura');
  assert.ok(/sessao-plenario/.test(base.texto) && /\d reuniao-deliberativa|reuniao-deliberativa\n/.test(base.texto + '\n'));
  const totalDelib = eventos.filter((e) => e.tipo === 'Reunião Deliberativa' && encerrada(e)).length;
  assert.ok(base.texto.includes(`encerradas (tipo contém "Deliberativa", sem "Não Deliberativa" e que não é sessão): ${totalDelib}`), 'total de deliberativas');
});

caso('cruzamento (todas as comissões) bate com a conta independente', () => {
  const sec = base.texto.split('--- Todas as comissões e órgãos ---')[1].split('---')[0];
  assert.equal(numeroApos(sec, 'Reuniões analisadas (com órgão e com titulares ativos na data):'), ESP_TODAS.reunioes);
  assert.equal(numeroApos(sec, 'Deputados com pelo menos 1 reunião esperada como titular:'), ESP_TODAS.deps);
  assert.equal(numeroApos(sec, 'Deputados com pelo menos 10 reuniões esperadas:'), ESP_TODAS.comMin);
});

caso('cruzamento só com órgãos permanentes (via API) bate e exclui a comissão especial', () => {
  const sec = base.texto.split('Somente Comissões Permanentes (tipo exato "Comissão Permanente") ---')[1];
  assert.equal(numeroApos(sec, 'Reuniões analisadas (com órgão e com titulares ativos na data):'), ESP_PERM.reunioes);
  assert.equal(numeroApos(sec, 'Deputados com pelo menos 1 reunião esperada como titular:'), ESP_PERM.deps);
  assert.equal(numeroApos(sec, 'Deputados com pelo menos 10 reuniões esperadas:'), ESP_PERM.comMin);
  assert.ok(ESP_TODAS.reunioes === ESP_PERM.reunioes + 1, 'a comissão especial tem 1 reunião a mais');
});

caso('data de saída do titular é respeitada e suplente/visitante não contam como titular', () => {
  // dep 1 (fim 2025-04-15) só deveria ter as reuniões da CCJ até essa data; dep 21 é suplente; dep 38 não é membro.
  const reunioesCCJ = eventos.filter((e) => e.tipo === 'Reunião Deliberativa' && encerrada(e) && e.orgs.includes('O1') && e.data <= '2025-04-15').length;
  assert.ok(reunioesCCJ > 0 && reunioesCCJ < 14);
  assert.ok(base.texto.includes('Presentes que não eram titulares do órgão da reunião'), 'linha de não titulares');
  assert.ok(numeroApos(base.texto.split('Somente Comissões Permanentes')[1], 'Presentes que não eram titulares do órgão da reunião (suplentes ou visitantes):') > 0);
});

caso('resumo automático: tudo OK no cenário completo (só 1 reunião sem órgão, abaixo de 5%)', () => {
  const resumo = base.texto.split('RESUMO: o que foi confirmado')[1].split('Indicativo automático')[0];
  assert.ok(!resumo.includes('[ATENÇÃO]'), resumo);
  assert.ok(base.texto.includes('parece VIÁVEL'));
});

caso('variação de nomes de coluna (id_evento, id_orgao, titulo) também é entendida', () => {
  const v2 = rodar({ variante: 2 });
  assert.equal(v2.status, 0, v2.stderr);
  const resumo = v2.texto.split('RESUMO: o que foi confirmado')[1].split('Indicativo automático')[0];
  assert.ok(!resumo.includes('[ATENÇÃO]'), resumo);
  assert.ok(v2.texto.includes('cargo=titulo'), 'usou a coluna titulo');
  const sec = v2.texto.split('--- Todas as comissões e órgãos ---')[1].split('---')[0];
  assert.equal(numeroApos(sec, 'Reuniões analisadas (com órgão e com titulares ativos na data):'), ESP_TODAS.reunioes);
});

caso('sem o arquivo de membros: relatório sai mesmo assim, aponta ATENÇÃO e não inventa cruzamento', () => {
  const sm = rodar({ semMembros: true });
  assert.equal(sm.status, 0, sm.stderr);
  assert.ok(sm.texto.includes('FALHOU'), 'mostra a falha de download');
  assert.ok(sm.texto.includes('orgaosDeputados-L57.csv') && sm.texto.includes('orgaosDeputados.csv'), 'mostra os endereços tentados');
  assert.ok(sm.texto.includes('[ATENÇÃO] Arquivo de membros de órgãos não baixou'));
  assert.ok(sm.texto.includes('O cruzamento titular x presença não pôde ser feito'));
  assert.ok(!sm.texto.includes('--- Todas as comissões'), 'não pode mostrar cruzamento sem membros');
  assert.ok(sm.texto.includes('Indicativo automático:') && !sm.texto.includes('parece VIÁVEL'));
});

caso('formato REAL do arquivo de membros (só endereços uri..., datas AAAA-MM-DD) é entendido', () => {
  const v4 = rodar({ variante: 4 });
  assert.equal(v4.status, 0, v4.stderr);
  const resumo = v4.texto.split('RESUMO: o que foi confirmado')[1].split('Indicativo automático')[0];
  assert.ok(!resumo.includes('[ATENÇÃO]'), resumo);
  assert.ok(v4.texto.includes('deputado=uriDeputado · órgão=uriOrgao'), 'usou as colunas uri');
  const sec = v4.texto.split('--- Todas as comissões e órgãos ---')[1].split('---')[0];
  assert.equal(numeroApos(sec, 'Reuniões analisadas (com órgão e com titulares ativos na data):'), ESP_TODAS.reunioes);
  assert.equal(numeroApos(sec, 'Deputados com pelo menos 10 reuniões esperadas:'), ESP_TODAS.comMin);
  assert.ok(sec.includes('Comparecimento dos titulares por reunião'), 'distribuição por reunião');
  assert.ok(sec.includes('Reuniões com menos de 10% dos titulares presentes'), 'reuniões vazias');
});

caso('nomes de coluna fora da lista (evento_id, orgao_id) são achados pelo padrão do nome', () => {
  const v3 = rodar({ variante: 3 });
  assert.equal(v3.status, 0, v3.stderr);
  const resumo = v3.texto.split('RESUMO: o que foi confirmado')[1].split('Indicativo automático')[0];
  assert.ok(!resumo.includes('[ATENÇÃO]'), resumo);
  const sec = v3.texto.split('--- Todas as comissões e órgãos ---')[1].split('---')[0];
  assert.equal(numeroApos(sec, 'Reuniões analisadas (com órgão e com titulares ativos na data):'), ESP_TODAS.reunioes);
});

caso('sem o arquivo de membros, a sonda da API mostra a estrutura dos membros', () => {
  const sm = rodar({ semMembros: true, apiMembros: true });
  assert.equal(sm.status, 0, sm.stderr);
  assert.ok(sm.texto.includes('Sonda alternativa'), 'sonda');
  assert.ok(sm.texto.includes('Campos de cada membro: id | nome | siglaPartido | titulo | codTitulo | dataInicio | dataFim'), 'campos');
  assert.ok(sm.texto.includes('swagger/api.html?tab=staticfile'), 'orienta onde achar o endereço certo');
});

caso('arquivos de eventos ausentes: não quebra e relata', () => {
  const raiz = mkdtempSync(path.join(tmpdir(), 'diag-vazio-'));
  const r = spawnSync('node', [SCRIPT], { cwd: raiz, encoding: 'utf8', env: { ...process.env, DIAG_LOCAL: raiz, DIAG_SAIDA: path.join(raiz, 'saida'), DIAG_ANOS: '2025' } });
  assert.equal(r.status, 0, r.stderr);
  const texto = readFileSync(path.join(raiz, 'saida', 'diagnostico-comissoes.txt'), 'utf8');
  assert.ok(texto.includes('[ATENÇÃO] Arquivo de eventos de 2025 não baixou'));
  assert.ok(texto.includes('Sem dados suficientes para o cruzamento'));
});

console.log(falhas ? `\n${falhas} teste(s) falharam.` : '\nTodos os testes do diagnóstico passaram.');
process.exit(falhas ? 1 : 0);
