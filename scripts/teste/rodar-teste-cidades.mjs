// Teste dos resultados do IBGE Cidades (Ideb, matrículas, mortalidade infantil, diarreia).
// Sem internet: respostas inventadas no formato da API do IBGE. Rodar:  node scripts/teste/rodar-teste-cidades.mjs

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DEFS_CIDADES, lerResultados, seriesDoEnte, coletarCidades, atualizarCidades, BASE_API } from '../ibge-cidades.mjs';
import { resultadosDoEnte, CATALOGO } from '../indicadores.mjs';
import { janelaDe48Meses } from '../administracoes.mjs';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'placar-cidades-'));
let falhas = 0;
async function caso(nome, fn) { try { await fn(); console.log('ok:', nome); } catch (e) { falhas++; console.log('FALHOU:', nome, '\n   ', (process.env.DETALHE ? e.stack : e.message.split('\n')[0])); } }
const pasta = (n) => { const p = path.join(tmp, n); mkdirSync(path.join(p, 'anos'), { recursive: true }); return p; };
const lerArq = (p, n) => JSON.parse(readFileSync(path.join(p, n), 'utf-8'));
const hoje = new Date('2026-11-24T12:00:00Z');
const dia = (n) => new Date(hoje.getTime() + n * 86400000);

const IDS_IDEB = new Set(DEFS_CIDADES.filter((d) => d.grupo === 'ideb').map((d) => d.id));
/** API de mentira: devolve { id, res:[{localidade, res:{ano:valor}}] } para cada indicador e localidade pedidos. */
function apiFalsa({ falhaEm = () => false, sem = () => false, consultas = [] } = {}) {
  return async (url) => {
    const m = /\/indicadores\/([\d|]+)\/resultados\/([\d|]+)$/.exec(new URL(url).pathname);
    if (!m) throw new Error('HTTP 404');
    const ids = m[1].split('|').map(Number);
    const locs = m[2].split('|');
    consultas.push({ ids, locs, url });
    if (locs.some(falhaEm)) throw new Error('HTTP 400 localidade inválida');
    return ids.map((id) => ({ id, res: locs.filter((l) => !sem(l, id)).map((l) => ({ localidade: l, res: IDS_IDEB.has(id) ? { 2019: '5.1', 2021: '-', 2023: '5.8' } : { 2022: '10', 2023: '12' } })) }));
  };
}

function montarPasta(nome, { municipios = {}, estados = {} } = {}) {
  const p = pasta(nome);
  for (const [uf, cods] of Object.entries(municipios)) writeFileSync(path.join(p, `prefeitos-${uf}.json`), JSON.stringify({ uf, itens: cods.map((c) => ({ ibge: c, municipio: `M${c}` })) }));
  writeFileSync(path.join(p, 'governadores.json'), JSON.stringify({ itens: Object.entries(estados).map(([uf, ibge]) => ({ uf, ibge })) }));
  return p;
}

await caso('leitura: formatos do IBGE ("-", "...", vírgula decimal, ano inválido) e variações de chave', () => {
  const m = lerResultados([
    { id: 78187, res: [{ localidade: '355030', res: { 2019: '5,3', 2021: '-', 2023: '...', abc: '9', 2025: '' } }] },
    { id: 30279, resultados: [{ localidade: { id: '35' }, serie: { 2022: 9.5, 2023: null } }] },
    { id: 'x', res: [] }, null, { id: 1 }
  ]);
  assert.deepEqual(m.get('355030').get(78187), { 2019: 5.3 });
  assert.deepEqual(m.get('35').get(30279), { 2022: 9.5 });
  assert.equal(lerResultados('lixo').size, 0);
  assert.equal(lerResultados(null).size, 0);
});

await caso('valores fora da faixa plausível são descartados e contados; zero verdadeiro é mantido', () => {
  const contagem = { descartados: 0 };
  const defs = DEFS_CIDADES.filter((d) => ['ideb.ai.publica', 'saude.mortalidade', 'saude.obitos'].includes(d.chave));
  const mapa = new Map([[78187, { 2019: 11.2, 2021: 5.55, 2023: -1 }], [30279, { 2022: 0, 2023: 5000 }], [78160, { 2022: 0 }]]);
  const s = seriesDoEnte(mapa, defs, contagem);
  assert.deepEqual(s['ideb.ai.publica'], { 2021: 5.55 });
  assert.deepEqual(s['saude.mortalidade'], { 2022: 0 }, 'zero real da fonte é mantido; 5000 por mil é impossível');
  assert.deepEqual(s['saude.obitos'], { 2022: 0 });
  assert.equal(contagem.descartados, 3);
});

await caso('catálogo: cada série coletada tem indicador oficial com fonte, órgão, limitações e esfera coerente', () => {
  const doCat = CATALOGO.filter((i) => i.campo?.k === 'cidades');
  assert.equal(doCat.length, DEFS_CIDADES.length);
  for (const i of doCat) {
    assert.equal(i.tipo, 'oficial');
    assert.ok(i.fonte && i.orgao && i.url && i.limitacoes && i.periodicidade && i.unidade, i.id);
    assert.ok(/zero|não audita/i.test(i.limitacoes), `${i.id}: limitações dizem que ausência não é zero`);
    assert.ok(['municipal', 'estadual', 'varios'].includes(i.campo.responsavel), i.id);
  }
  assert.ok(!CATALOGO.some((i) => ['educ.ideb', 'educ.matriculas', 'saude.resultados'].includes(i.id)), 'os pendentes substituídos saíram');
  assert.ok(CATALOGO.some((i) => i.id === 'saude.cobertura' && i.tipo === 'pendente'), 'o que continua sem fonte segue como pendente');
  assert.ok(!doCat.find((i) => i.campo.chave === 'saude.diarreia').esferas.includes('E'), 'diarreia só para município');
});

await caso('coleta: lotes de 40 localidades, 6 dígitos para município, 2 para estado, arquivo por UF', async () => {
  const cods = Array.from({ length: 95 }, (_, k) => 3500000 + k * 10 + 5); // 7 dígitos
  const p = montarPasta('lotes', { municipios: { SP: cods, RJ: [3300100, 3300209] }, estados: { SP: '35', RJ: '33' } });
  const consultas = [];
  const r = await coletarCidades({ json: apiFalsa({ consultas }), alvos: { municipios: { SP: cods.map(String), RJ: ['3300100', '3300209'] }, estados: { SP: '35', RJ: '33' } }, pasta: p, hoje, orcamentoMs: 1e9 });
  assert.equal(r.municipios, 97);
  assert.equal(r.estados, 2);
  const deMun = consultas.filter((c) => c.locs[0].length === 6);
  assert.ok(deMun.every((c) => c.locs.length <= 40));
  assert.equal(deMun.filter((c) => c.locs.some((l) => l.startsWith('35'))).length, 3, '95 municípios de SP em 3 lotes');
  assert.ok(consultas.filter((c) => c.locs[0].length === 2).every((c) => !c.ids.includes(60032)));
  assert.ok(consultas.every((c) => c.url.startsWith(BASE_API)));
  const sp = lerArq(p, 'anos/cidades-SP.json');
  assert.equal(Object.keys(sp.itens).length, 96);
  assert.equal(sp.itens['3500005'].s['ideb.ai.publica']['2019'], 5.1);
  assert.ok(!('2021' in sp.itens['3500005'].s['ideb.ai.publica']), '"-" some, nunca vira zero');
  assert.equal(sp.itens['35'].em, hoje.toISOString());
});

await caso('lote com localidade ruim: divide ao meio e só a ruim fica sem dado (as outras são lidas)', async () => {
  const cods = ['3500105', '3500204', '3500303', '3500402', '3500501'];
  const p = montarPasta('ruim', { municipios: { SP: cods } });
  const consultas = [];
  const r = await coletarCidades({ json: apiFalsa({ falhaEm: (l) => l === '350030', consultas }), alvos: { municipios: { SP: cods }, estados: {} }, pasta: p, hoje, orcamentoMs: 1e9 });
  assert.equal(r.municipios, 4);
  assert.equal(r.falhas, 1);
  assert.ok(r.consultasComErro >= 2, 'tentou o lote inteiro e as metades');
  const sp = lerArq(p, 'anos/cidades-SP.json');
  assert.ok(!('3500303' in sp.itens), 'a ruim não ganha dado nem data de leitura (tenta de novo amanhã)');
  assert.ok(sp.itens['3500105'] && sp.itens['3500501']);
});

await caso('releitura: quem foi lido há menos de 7 dias é pulado; depois de 7 dias é lido de novo; localidade sem resposta não vira zero', async () => {
  const cods = ['3500105', '3500204'];
  const p = montarPasta('semana', { municipios: { SP: cods } });
  const alvos = { municipios: { SP: cods }, estados: {} };
  const c1 = []; await coletarCidades({ json: apiFalsa({ consultas: c1, sem: (l) => l === '350020' }), alvos, pasta: p, hoje, orcamentoMs: 1e9 });
  assert.equal(c1.length, 1);
  assert.deepEqual(lerArq(p, 'anos/cidades-SP.json').itens['3500204'].s, {}, 'sem resposta = sem série (não zero)');
  const c2 = []; const r2 = await coletarCidades({ json: apiFalsa({ consultas: c2 }), alvos, pasta: p, hoje: dia(3), orcamentoMs: 1e9 });
  assert.equal(c2.length, 0, 'dentro dos 7 dias não consulta');
  assert.equal(r2.municipios, 0);
  const c3 = []; await coletarCidades({ json: apiFalsa({ consultas: c3 }), alvos, pasta: p, hoje: dia(8), orcamentoMs: 1e9 });
  assert.equal(c3.length, 1, 'passou de 7 dias: relê');
  assert.ok(lerArq(p, 'anos/cidades-SP.json').itens['3500204'].s['ideb.ai.publica'], 'agora a localidade tem dado');
});

await caso('falha da fonte depois de uma leitura boa: o valor anterior continua no arquivo', async () => {
  const cods = ['3500105'];
  const p = montarPasta('antigo', { municipios: { SP: cods } });
  const alvos = { municipios: { SP: cods }, estados: {} };
  await coletarCidades({ json: apiFalsa(), alvos, pasta: p, hoje, orcamentoMs: 1e9 });
  const antes = lerArq(p, 'anos/cidades-SP.json').itens['3500105'];
  const r = await coletarCidades({ json: async () => { throw new Error('HTTP 503'); }, alvos, pasta: p, hoje: dia(10), orcamentoMs: 1e9 });
  assert.equal(r.falhas, 1);
  assert.deepEqual(lerArq(p, 'anos/cidades-SP.json').itens['3500105'], antes, 'nada foi apagado');
});

await caso('releitura sem valores novos não apaga o que já foi lido (série que o IBGE não trouxe desta vez é mantida)', async () => {
  const p = montarPasta('merge', { municipios: { SP: ['3500105'] } });
  const alvos = { municipios: { SP: ['3500105'] }, estados: {} };
  await coletarCidades({ json: apiFalsa(), alvos, pasta: p, hoje, orcamentoMs: 1e9 });
  const so = (ids) => async () => [{ id: 78187, res: [{ localidade: '350010', res: { 2019: '5.1', 2021: '5.3', 2023: '5.9' } }] }];
  await coletarCidades({ json: so(), alvos, pasta: p, hoje: dia(8), orcamentoMs: 1e9 });
  const item = lerArq(p, 'anos/cidades-SP.json').itens['3500105'];
  assert.deepEqual(item.s['ideb.ai.publica'], { 2019: 5.1, 2021: 5.3, 2023: 5.9 }, 'a série trazida substitui');
  assert.ok(item.s['saude.mortalidade'], 'a série que não veio continua guardada');
});

await caso('orçamento de tempo: para quando acaba, guarda o que leu e conta o que ficou para o dia seguinte', async () => {
  const cods = Array.from({ length: 200 }, (_, k) => 3500000 + k * 10 + 5).map(String);
  const p = montarPasta('tempo', { municipios: { SP: cods } });
  let t = 0;
  const json = async (url) => { t += 1000; return apiFalsa()(url); };
  const r = await coletarCidades({ json, alvos: { municipios: { SP: cods }, estados: {} }, pasta: p, hoje, orcamentoMs: 2500, relogio: () => t });
  assert.equal(r.paradoPorTempo, true);
  assert.ok(r.municipios > 0 && r.municipios < 200);
  assert.equal(r.municipios + r.pendentes, 200);
  const r2 = await coletarCidades({ json, alvos: { municipios: { SP: cods }, estados: {} }, pasta: p, hoje, orcamentoMs: 1e9, relogio: () => t });
  assert.equal(r2.municipios, r.pendentes, 'no dia seguinte lê só os que faltaram');
  assert.equal(Object.keys(lerArq(p, 'anos/cidades-SP.json').itens).length, 200);
});

await caso('rotina: sem lista de prefeitos e governadores não há o que coletar', async () => {
  const p = montarPasta('vazio');
  const r = await atualizarCidades({ json: apiFalsa(), pasta: p, hoje, orcamentoMs: 1e9 });
  assert.equal(r.ok, false);
});

await caso('rotina: fonte fora do ar = passo sem resultado (ok:false), sem apagar nada; formato mudado também é denunciado', async () => {
  const p = montarPasta('fora', { municipios: { SP: ['3500105'] }, estados: { SP: '35' } });
  const r1 = await atualizarCidades({ json: async () => { throw new Error('HTTP 503'); }, pasta: p, hoje, orcamentoMs: 1e9 });
  assert.equal(r1.ok, false);
  assert.match(r1.motivo, /não foi possível ler/);
  const r2 = await atualizarCidades({ json: async () => [{ novo: 'formato' }], pasta: p, hoje, orcamentoMs: 1e9 });
  assert.equal(r2.ok, false);
  assert.match(r2.motivo, /sem localidades reconhecidas/);
  assert.ok(!existsSync(path.join(p, 'anos', 'cidades-SP.json')) || Object.keys(lerArq(p, 'anos/cidades-SP.json').itens).length === 0, 'resposta irreconhecível não marca ninguém como lido');
  const r2b = await atualizarCidades({ json: async () => [{ id: 78187, res: [{ localidade: '350010', res: {} }] }], pasta: p, hoje, orcamentoMs: 1e9 });
  assert.equal(r2b.ok, false);
  assert.match(r2b.motivo, /sem nenhum valor/);
  const r3 = await atualizarCidades({ json: apiFalsa(), pasta: p, hoje: dia(8), orcamentoMs: 1e9 });
  assert.equal(r3.ok, true);
  assert.equal(r3.estados, 1);
});

await caso('atribuição por gestão: ano do recorte vai para a gestão da época; troca no ano = dividido; anos antes do recorte são só linha de base', () => {
  const janela = janelaDe48Meses(hoje); // 2022-11 a 2026-10
  const gestoes = [
    { id: 'g1', nome: 'Antigo', inicio: '2021-01-01', fim: '2024-12-31', situacao: 'encerrada' },
    { id: 'g2', nome: 'Atual', inicio: '2025-01-01', fim: '2028-12-31', situacao: 'em exercício' }
  ];
  const reg = { em: hoje.toISOString(), s: { 'ideb.af.municipal': { 2013: 3.9, 2017: 4.5, 2019: 4.8, 2021: 4.6, 2023: 5.0, 2025: 5.2 }, 'saude.mortalidade': { 2024: 9, 2025: 8.5 } } };
  const r = resultadosDoEnte(reg, { gestoes, janela });
  assert.ok(!('2013' in r.series['ideb.af.municipal']) && !('2017' in r.series['ideb.af.municipal']), 'anos antigos ficam de fora');
  assert.deepEqual(Object.keys(r.series['ideb.af.municipal']), ['2019', '2021', '2023', '2025'], 'até 4 anos antes do recorte (2022): de 2018 em diante');
  assert.equal(r.anos['2019'].noRecorte, false);
  assert.equal(r.anos['2019'].atribuicao, null);
  assert.equal(r.anos['2023'].atribuicao.gestoes[0], 'g1');
  assert.equal(r.anos['2025'].atribuicao.gestoes[0], 'g2');
  assert.equal(r.anos['2025'].mesesNaJanela, 12);
  assert.equal(resultadosDoEnte({ s: { x: { 2022: 1, 2026: 2 } } }, { gestoes, janela }).anos['2022'].mesesNaJanela, 2, 'nov e dez de 2022 estão no recorte');
  const dividido = resultadosDoEnte({ s: { x: { 2025: 1 } } }, { gestoes: [{ id: 'a', inicio: '2021-01-01', fim: '2025-06-30' }, { id: 'b', inicio: '2025-07-01', fim: '2028-12-31' }], janela });
  assert.equal(dividido.anos['2025'].atribuicao.tipo, 'dividida');
  assert.deepEqual(dividido.anos['2025'].atribuicao.gestoes, ['a', 'b']);
  assert.equal(resultadosDoEnte(null, { gestoes, janela }), null, 'sem coleta = sem bloco (a tela diz que não foi coletado)');
});

console.log(falhas ? `\n${falhas} TESTE(S) FALHARAM` : '\nTodos os casos passaram.');
if (falhas) process.exit(1);
