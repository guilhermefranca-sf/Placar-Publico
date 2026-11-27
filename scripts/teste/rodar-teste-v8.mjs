// Testes das peças novas da versão 8 (sem internet): Brasil no mundo, fotos, comissões e custo dos deputados.
// Rodar:  node scripts/teste/rodar-teste-v8.mjs

import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ranquear, atualizarMundo, listarPaises, INDICADORES_MUNDO } from '../mundo.mjs';
import { urlFotoTse, registrarCodigos, descobrirEleicoes, codigoDaEleicao } from '../fotos.mjs';
import { lerExecutivos, montarGestoes } from '../administracoes.mjs';
import { listarPermanentes, criarColetorDeEventos, ligarReunioesAosOrgaos, lerMembros, legislaturasDaJanela, contarComissoes } from '../comissoes.mjs';
import { lerPaginaDeGastos, somarCusto, atualizarCusto, precisaLer, urlGastos, valorBR } from '../custo.mjs';
import { percorrerCsv } from '../util.mjs';
import { montarRankingEstados, posicionar, MIN_ESTADOS } from '../ranking-estados.mjs';

let falhas = 0;
const ok = (m) => console.log('ok:', m);
async function caso(nome, fn) { try { await fn(); ok(nome); } catch (e) { falhas++; console.log('FALHOU:', nome, '\n   ', e.message.split('\n')[0]); } }
const csv = (cab, linhas) => [cab, ...linhas].map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n') + '\r\n';

/* ===================== Brasil no mundo ===================== */
const paisesFalsos = new Set(['BRA', ...Array.from({ length: 199 }, (_, i) => `P${String(i).padStart(2, '0')}`)]);
const mapaDe = (brasil, outros) => new Map([['BRA', { valor: brasil.v, ano: brasil.ano, pais: 'Brasil' }], ...outros.map((o, i) => [`P${String(i).padStart(2, '0')}`, { valor: o.v, ano: o.ano, pais: `País ${i}` }])]);

await caso('mundo: posição do Brasil, 1 = melhor, nos dois sentidos', () => {
  const outros = Array.from({ length: 100 }, (_, i) => ({ v: 60.05 + i * 0.2, ano: 2023 })); // 60,05 ... 79,85 (nenhum igual a 70)
  const maior = ranquear(mapaDe({ v: 70, ano: 2023 }, outros), paisesFalsos, { melhor: 'maior', casas: 1 });
  assert.equal(maior.posicao, 1 + outros.filter((o) => o.v > 70).length);
  assert.equal(maior.de, 101);
  const menor = ranquear(mapaDe({ v: 70, ano: 2023 }, outros), paisesFalsos, { melhor: 'menor', casas: 1 });
  assert.equal(menor.posicao, 1 + outros.filter((o) => o.v < 70).length);
  assert.equal(maior.posicao + menor.posicao, 102, 'sem empate, as posições nos dois sentidos somam n+2 (n países mais o Brasil)');
});

await caso('mundo: empate divide a mesma posição; agrupamentos e anos antigos ficam de fora', () => {
  const outros = [
    ...Array.from({ length: 60 }, () => ({ v: 80, ano: 2023 })),   // todos melhores que o Brasil (maior = melhor)
    { v: 50, ano: 2023 }, { v: 70, ano: 2023 },                    // piores
    { v: 99, ano: 2012 }                                           // valor velho demais: não entra
  ];
  const m = mapaDe({ v: 70, ano: 2023 }, outros);
  m.set('WLD', { valor: 99, ano: 2023, pais: 'Mundo (agrupamento)' }); // não está na lista de países: ignora
  const r = ranquear(m, paisesFalsos, { melhor: 'maior' });
  assert.equal(r.posicao, 61, '60 melhores + 1 (empate com 70 não conta contra)');
  assert.equal(r.de, 1 + 62, 'Brasil + 62 países de 2018 em diante');
  assert.equal(r.anosDosPaises.de, 2023);
  assert.equal(r.melhorPais.valor, 80);
});

await caso('mundo: sem dado do Brasil ou poucos países = sem posição (nunca chute)', () => {
  const m = mapaDe({ v: 1, ano: 2023 }, Array.from({ length: 80 }, () => ({ v: 2, ano: 2023 })));
  m.delete('BRA');
  const a = ranquear(m, paisesFalsos, { melhor: 'maior' });
  assert.equal(a.posicao, null); assert.match(a.motivo, /não publica/);
  const b = ranquear(mapaDe({ v: 1, ano: 2023 }, Array.from({ length: 10 }, () => ({ v: 2, ano: 2023 }))), paisesFalsos, { melhor: 'maior' });
  assert.equal(b.posicao, null); assert.match(b.motivo, /Poucos países/);
});

function bancoMundialFalso({ quebrar = new Set(), semBrasil = new Set() } = {}) {
  const paises = [
    ...Array.from({ length: 200 }, (_, i) => ({ id: i === 0 ? 'BRA' : `P${String(i).padStart(3, '0')}`, region: { id: 'LCN', value: 'Latin America' } })),
    { id: 'WLD', region: { id: 'NA', value: 'Aggregates' } }, { id: 'LAC', region: { id: 'NA', value: 'Aggregates' } }
  ];
  return async (url) => {
    if (/\/country\?format=json/.test(url)) return [{ page: 1, pages: 1 }, paises];
    const id = /indicator\/([A-Z0-9.]+)\?/.exec(url)[1];
    if (quebrar.has(id)) throw new Error('HTTP 500');
    const itens = paises.filter((p) => p.region.value !== 'Aggregates' || true).map((p, i) => ({
      countryiso3code: p.id, country: { value: p.id === 'BRA' ? 'Brasil' : p.id }, date: p.region.value === 'Aggregates' ? '2023' : '2022', value: p.id === 'BRA' ? (semBrasil.has(id) ? null : 50) : i
    }));
    return [{ page: 1, pages: 1 }, itens];
  };
}

await caso('mundo: atualizarMundo grava, tira agrupamentos e mantém o valor antigo se a consulta falhar', async () => {
  const pasta = mkdtempSync(path.join(os.tmpdir(), 'placar-mundo-'));
  const hoje = new Date('2026-11-26T12:00:00Z');
  const r1 = await atualizarMundo({ json: bancoMundialFalso(), pasta, hoje });
  assert.equal(r1.ok, true); assert.equal(r1.falhas, 0);
  const d1 = JSON.parse(readFileSync(path.join(pasta, 'mundo.json'), 'utf-8'));
  assert.equal(d1.indicadores.length, INDICADORES_MUNDO.length);
  const vida = d1.indicadores.find((i) => i.id === 'SP.DYN.LE00.IN');
  assert.equal(vida.de, 200, '200 países, sem os 2 agrupamentos');
  assert.ok(vida.url.includes('SP.DYN.LE00.IN'));
  // segunda rodada: um indicador falha -> fica o anterior, marcado
  const r2 = await atualizarMundo({ json: bancoMundialFalso({ quebrar: new Set(['SP.DYN.LE00.IN']) }), pasta, hoje: new Date('2026-11-27T12:00:00Z') });
  assert.equal(r2.falhas, 1);
  const d2 = JSON.parse(readFileSync(path.join(pasta, 'mundo.json'), 'utf-8'));
  const vida2 = d2.indicadores.find((i) => i.id === 'SP.DYN.LE00.IN');
  assert.equal(vida2.desatualizado, true); assert.equal(vida2.posicao, vida.posicao);
  // terceira: indicador novo que falha e nunca foi lido -> sem posição, com a frase padrão
  const pasta3 = mkdtempSync(path.join(os.tmpdir(), 'placar-mundo-'));
  await atualizarMundo({ json: bancoMundialFalso({ quebrar: new Set(['HD.HCI.OVRL']) }), pasta: pasta3, hoje });
  const d3 = JSON.parse(readFileSync(path.join(pasta3, 'mundo.json'), 'utf-8'));
  const hci = d3.indicadores.find((i) => i.id === 'HD.HCI.OVRL');
  assert.equal(hci.posicao, null); assert.match(hci.motivo, /Dado não encontrado ou não confirmado/);
});

await caso('mundo: lista de países incompleta derruba só este passo', async () => {
  const pasta = mkdtempSync(path.join(os.tmpdir(), 'placar-mundo-'));
  const json = async () => [{ page: 1, pages: 1 }, [{ id: 'BRA', region: { id: 'LCN', value: 'x' } }]];
  await assert.rejects(() => listarPaises(json), /incompleta/);
  const r = await atualizarMundo({ json, pasta });
  assert.equal(r.ok, false);
});

/* ===================== Fotos ===================== */
await caso('fotos: endereço oficial só com dados completos', () => {
  assert.equal(urlFotoTse(2022, '280001607829', 'BR'), 'https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2040602022/280001607829/BR');
  assert.equal(urlFotoTse(2022, '190001234567', 'SP'), 'https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2040602022/190001234567/SP');
  assert.equal(urlFotoTse(2022, '', 'SP'), null);
  assert.equal(urlFotoTse(2022, '123', 'SP'), null, 'sequencial curto demais');
  assert.equal(urlFotoTse(2022, '190001234567', 'sp'), null);
  assert.equal(urlFotoTse(2030, '190001234567', 'SP'), null, 'código de eleição desconhecido: sem foto, nunca endereço inventado');
  assert.equal(urlFotoTse(2022, "1900012345'><script>", 'SP'), null);
});

await caso('fotos: descobre códigos novos e não derruba se o TSE estiver fora', async () => {
  assert.equal(registrarCodigos([{ ano: 2030, id: 2099902030, tipoAbrangencia: 'F' }, { ano: 2028, id: 1, tipoAbrangencia: 'M' }, { ano: 2022, id: 999, tipoAbrangencia: 'F' }]), 1);
  assert.equal(codigoDaEleicao(2030), '2099902030');
  assert.equal(codigoDaEleicao(2022), '2040602022', 'um código conhecido não é trocado');
  assert.equal(codigoDaEleicao(2028), null, 'municipal não entra');
  const r = await descobrirEleicoes(async () => { throw new Error('HTTP 403'); });
  assert.equal(r.ok, false);
});

/* ===================== Gestões com foto (TSE) ===================== */
const cabTse = ['DS_CARGO', 'DS_SIT_TOT_TURNO', 'SQ_CANDIDATO', 'NM_CANDIDATO', 'NM_URNA_CANDIDATO', 'SG_PARTIDO', 'SG_UF', 'SG_UE', 'DT_NASCIMENTO', 'DT_ELEICAO', 'DS_ELEICAO'];
await caso('gestões: foto da candidatura eleita; reeleição fica com a mais nova; suplementar fica sem', () => {
  const csv22 = csv(cabTse, [
    ['PRESIDENTE', 'ELEITO', '280001607829', 'LUIZ TESTE DA SILVA', 'LULA', 'PT', 'BR', 'BR', '27/10/1945', '30/10/2022', 'Eleição Ordinária'],
    ['GOVERNADOR', 'ELEITO', '250001111111', 'ANA GOVERNADORA', 'ANA', 'AAA', 'SP', '25', '01/01/1970', '30/10/2022', 'Eleição Ordinária']
  ]);
  const regs = lerExecutivos(csv22, { anoArquivo: 2022 });
  assert.equal(regs.find((r) => r.cargo === 'presidente').sq, '280001607829');
  const pres = montarGestoes(regs.filter((r) => r.cargo === 'presidente'), { hoje: new Date('2026-11-26') }).gestoes;
  assert.equal(pres[0].foto, 'https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2040602022/280001607829/BR');
  assert.ok(!('pessoa' in pres[0]) && !('sq' in pres[0]), 'nada de CPF, nem chave interna, no resultado');
  // reeleição: duas eleições da mesma pessoa viram uma gestão com a foto da última
  const csv18 = csv(cabTse, [['GOVERNADOR', 'ELEITO', '250001000001', 'ANA GOVERNADORA', 'ANA', 'AAA', 'SP', '25', '01/01/1970', '28/10/2018', 'Eleição Ordinária']]);
  const regs2 = [...lerExecutivos(csv18, { anoArquivo: 2018 }), ...regs.filter((r) => r.cargo === 'governador')];
  const gov = montarGestoes(regs2, { hoje: new Date('2026-11-26') }).gestoes;
  assert.equal(gov.length, 1); assert.equal(gov[0].reeleito, true);
  assert.match(gov[0].foto, /2040602022\/250001111111\/SP$/);
  // suplementar: sem foto
  const sup = csv(cabTse, [['GOVERNADOR', 'ELEITO', '250001222222', 'BETO SUPLENTE', 'BETO', 'BBB', 'TO', '27', '01/01/1960', '04/07/2021', 'Eleição Suplementar 2021']]);
  const gs = montarGestoes(lerExecutivos(sup, { anoArquivo: 2021 }), { hoje: new Date('2026-11-26') }).gestoes;
  assert.equal(gs[0].foto, null);
});

/* ===================== Comissões ===================== */
await caso('comissões: só "Comissão Permanente", com várias páginas', async () => {
  const paginas = [
    Array.from({ length: 100 }, (_, i) => ({ id: i + 1, tipoOrgao: i < 30 ? 'Comissão Permanente' : 'Comissão Especial' })),
    [{ id: 500, tipoOrgao: 'Comissão Permanente' }, { id: 501, tipoOrgao: 'Comissão Parlamentar de Inquérito' }, { id: 502, tipoOrgao: ' Comissão Permanente ' }]
  ];
  const json = async (url) => ({ dados: paginas[Number(/pagina=(\d+)/.exec(url)[1]) - 1] || [] });
  const ids = await listarPermanentes(json);
  assert.equal(ids.size, 32); assert.ok(ids.has('500') && ids.has('502') && !ids.has('501') && !ids.has('40'));
  await assert.rejects(() => listarPermanentes(async () => ({ dados: [{ id: 1, tipoOrgao: 'Plenário' }] })), /nenhum "Comissão Permanente"/);
});

await caso('comissões: reuniões deliberativas encerradas, ligadas a órgãos permanentes', () => {
  const eventos = csv(['id', 'dataHoraInicio', 'situacao', 'descricaoTipo'], [
    ['1', '2026-03-03T10:00:00', 'Encerrada (Final)', 'Reunião Deliberativa'],
    ['2', '2026-03-03T11:00:00', 'Cancelada', 'Reunião Deliberativa'],
    ['3', '2026-03-04T10:00:00', 'Encerrada (Final)', 'Audiência Pública'],
    ['4', '2026-03-05T10:00:00', 'Encerrada (Final)', 'Reunião Deliberativa'],
    ['5', '2026-03-06T10:00:00', 'Encerrada (Final)', 'Reunião Deliberativa']
  ]);
  const col = criarColetorDeEventos();
  percorrerCsv(eventos, (l, ix) => col.aoLerEvento(l, ix));
  assert.deepEqual([...col.reunioes.keys()].sort(), ['1', '4', '5']);
  const orgaos = csv(['idEvento', 'uriEvento', 'idOrgao', 'uriOrgao'], [['1', '', '10', ''], ['4', '', '99', ''], ['5', '', '10', ''], ['5', '', '11', ''], ['2', '', '10', '']]);
  const r = ligarReunioesAosOrgaos(orgaos, col, new Set(['10', '11']));
  assert.deepEqual(r.lista.map((x) => x.id), ['1', '5'], 'a reunião 4 é de órgão que não é permanente; a 2 foi cancelada');
  assert.deepEqual(r.lista[1].orgaos, ['10', '11']);
});

await caso('comissões: só titular, com datas; formato novo é recusado', () => {
  const t = csv(['uriOrgao', 'siglaOrgao', 'nomeOrgao', 'nomePublicacaoOrgao', 'uriDeputado', 'nomeDeputado', 'siglaPartido', 'siglaUF', 'cargo', 'dataInicio', 'dataFim'], [
    ['https://x/orgaos/10', 'CCJC', '', '', 'https://x/deputados/777', 'A', 'AAA', 'SP', 'Titular', '2023-03-01T00:00:00', ''],
    ['https://x/orgaos/10', 'CCJC', '', '', 'https://x/deputados/778', 'B', 'AAA', 'SP', 'Suplente', '2023-03-01T00:00:00', ''],
    ['https://x/orgaos/11', 'CFT', '', '', 'https://x/deputados/777', 'A', 'AAA', 'SP', 'Presidente', '2024-01-10T00:00:00', '2024-06-30T00:00:00']
  ]);
  const m = lerMembros(t);
  assert.equal(m.titulares, 2);
  assert.deepEqual(m.porDep.get('777'), [{ org: '10', ini: '2023-03-01', fim: null }, { org: '11', ini: '2024-01-10', fim: '2024-06-30' }]);
  assert.ok(!m.porDep.has('778'));
  assert.throws(() => lerMembros(csv(['uriOrgao', 'uriDeputado'], [['a/1', 'b/2']])), /mudou de formato/);
  assert.deepEqual(legislaturasDaJanela(2023, 2026), [57]);
  assert.deepEqual(legislaturasDaJanela(2026, 2027), [57, 58]);
});

await caso('comissões: esperadas, presentes e licença', () => {
  const reunioes = [['2026-03-01', ['10']], ['2026-03-08', ['10']], ['2026-03-15', ['11']], ['2026-03-22', ['10']], ['2026-03-29', ['10']], ['2025-01-01', ['10']]].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  // ordem: 2025-01-01, 03-01, 03-08, 03-15, 03-22, 03-29
  const marcas = '011000';
  const periodos = [{ org: '10', ini: '2023-03-01', fim: null }];
  const r = contarComissoes({ reunioes, marcas, periodos, desde: '2026-01-01', emPausa: () => false });
  // contam (órgão 10, de 2026): 03-01 (presente), 03-08 (presente), 03-22 (falta), 03-29 (falta); 03-15 é de outra comissão; 2025 é antes de "desde"
  assert.deepEqual(r, { esperadas: 4, presentes: 2, licenca: 0 });
  const comLicenca = contarComissoes({ reunioes, marcas, periodos, desde: '2026-01-01', emPausa: (d) => d >= '2026-03-20' });
  assert.deepEqual(comLicenca, { esperadas: 2, presentes: 2, licenca: 2 }, 'licenciado que não foi não é cobrado');
  const saiu = contarComissoes({ reunioes, marcas, periodos: [{ org: '10', ini: '2023-03-01', fim: '2026-03-10' }], desde: '2026-01-01', emPausa: () => false });
  assert.deepEqual(saiu, { esperadas: 2, presentes: 2, licenca: 0 }, 'depois de deixar a comissão, a reunião não conta');
  const presenteEmLicenca = contarComissoes({ reunioes, marcas: '011111', periodos, desde: '2026-01-01', emPausa: () => true });
  assert.equal(presenteEmLicenca.presentes, 4, 'quem foi mesmo licenciado tem a presença contada');
});

/* ===================== Custo para os cofres públicos ===================== */
const paginaPortal = (ano, { cota = 'R$ 100.000,00', verba = 'R$ 200.000,00', moradia = 'Ainda não há dados disponíveis', viagens = 'R$ 5.000,50', nome = 'Fulana' } = {}) => `<html><body>
  <h1>Gastos parlamentares</h1>${' '.repeat(10)}<p>${'Texto de apoio do portal. '.repeat(30)}</p>
  <p>Em ${ano} , na legislatura 57 , gasto da deputada ${nome} com cota: ${cota}</p>
  <p>Em ${ano} , na legislatura 57 , gasto da deputada ${nome} com verba de gabinete: ${verba}</p>
  <p>Em ${ano} , na legislatura 57 , gasto da deputada ${nome} com auxílio-moradia: ${moradia}</p>
  <p>Em ${ano} , na legislatura 57 , gasto da deputada ${nome} com viagens oficiais: ${viagens}</p></body></html>`;

await caso('custo: lê as quatro frases e trata "Ainda não há dados" como R$ 0 só na soma, sinalizado', () => {
  const r = lerPaginaDeGastos(paginaPortal(2025), 2025);
  assert.deepEqual(r, { ok: true, cota: 100000, verba: 200000, moradia: 0, viagens: 5000.5, sr: ['moradia'] });
  assert.equal(valorBR('R$ 1.064.948,40'), 1064948.4);
  assert.equal(valorBR('R$ -1.200,10'), -1200.1);
});

await caso('custo: página sem as frases-âncora, de outro ano ou curta NÃO vira zero', () => {
  assert.equal(lerPaginaDeGastos('<html><body>' + 'sem nada util '.repeat(60) + '</body></html>', 2025).ok, false);
  assert.match(lerPaginaDeGastos(paginaPortal(2026), 2025).motivo, /ano 2026 em vez de 2025/);
  assert.match(lerPaginaDeGastos('<p>oi</p>', 2025).motivo, /curta/);
  const soCota = paginaPortal(2025).replace(/<p>Em 2025[^<]*verba de gabinete[^<]*<\/p>/, '');
  assert.match(lerPaginaDeGastos(soCota, 2025).motivo, /faltam as frases de verba/);
});

await caso('custo: somarCusto soma tudo e recusa ano que falta', () => {
  const docs = {
    2025: { itens: { 7: { cota: 10, verba: 20, moradia: 0, viagens: 1, sr: ['moradia'] }, 8: { erro: 'falhou', em: 'x' } } },
    2026: { itens: { 7: { cota: 1, verba: 2, moradia: 3, viagens: 0, sr: ['viagens'] } } }
  };
  const s = somarCusto(docs, '7', 2025, 2026);
  assert.equal(s.total, 37); assert.deepEqual(s.componentes, { cota: 11, verba: 22, moradia: 3, viagens: 1 });
  assert.match(somarCusto(docs, '8', 2025, 2026).erro, /2025, 2026/);
  assert.match(somarCusto(docs, '7', 2024, 2026).erro, /2024/);
});

await caso('custo: atualizarCusto guarda, tenta de novo erros no dia seguinte e respeita o tempo', async () => {
  const guardado = {};
  const cache = { ler: (a) => guardado[a] || null, gravar: (a, o) => { guardado[a] = JSON.parse(JSON.stringify(o)); } };
  const hoje = new Date('2026-11-26T12:00:00Z');
  const chamadas = [];
  const fontes = { texto: async (url) => {
    chamadas.push(url);
    if (url.includes('deputado=3&')) return '<html>' + 'x '.repeat(400) + '</html>'; // estrutura mudou
    if (url.includes('deputado=4&')) throw new Error('HTTP 500 em ' + url);
    const ano = /ano=(\d{4})/.exec(url)[1];
    return paginaPortal(ano, { cota: 'R$ 1.000,00', verba: 'R$ 2.000,00', viagens: 'R$ 0,00' });
  } };
  const r = await atualizarCusto({ fontes, ids: ['1', '2', '3', '4'], anos: [2025, 2026], anoAtual: 2026, cache, hoje, pausaMs: 0 });
  assert.equal(r.feitos, 4); assert.equal(r.falhas, 4);
  assert.equal(guardado[2026].itens['1'].cota, 1000);
  assert.ok(guardado[2026].itens['3'].erro && guardado[2026].itens['4'].erro);
  assert.match(somarCusto(r.docs, '3', 2025, 2026).erro, /ainda não foi concluída/);
  // mesma hora: nada para ler (erros só repetem depois de 20 h)
  const n0 = chamadas.length;
  const r2 = await atualizarCusto({ fontes, ids: ['1', '2', '3', '4'], anos: [2025, 2026], anoAtual: 2026, cache, hoje: new Date(hoje.getTime() + 3600000), pausaMs: 0 });
  assert.equal(chamadas.length, n0); assert.equal(r2.tentativas, 0);
  // no dia seguinte: ano em curso e erros voltam; ano fechado (2025) com leitura boa não
  const r3 = await atualizarCusto({ fontes, ids: ['1', '2', '3', '4'], anos: [2025, 2026], anoAtual: 2026, cache, hoje: new Date(hoje.getTime() + 24 * 3600000), pausaMs: 0 });
  assert.equal(r3.tentativas, 2 + 2 + 2, 'ano em curso (4 deputados) + 2025 só dos 2 que deram erro');
  // orçamento de tempo curto: para e deixa pendente
  const guardado2 = {};
  const r4 = await atualizarCusto({ fontes: { texto: async (u) => { await new Promise((s) => setTimeout(s, 20)); return paginaPortal(/ano=(\d{4})/.exec(u)[1]); } },
    ids: Array.from({ length: 40 }, (_, i) => String(100 + i)), anos: [2026], anoAtual: 2026, cache: { ler: () => null, gravar: (a, o) => { guardado2[a] = o; } }, hoje, orcamentoMs: 60, paralelo: 2, pausaMs: 0 });
  assert.equal(r4.parouPorTempo, true); assert.ok(r4.pendentes > 0 && r4.feitos > 0);
  assert.equal(precisaLer({ em: hoje.toISOString(), cota: 1 }, 2025, 2026, new Date(hoje.getTime() + 6 * 86400000)), false);
  assert.equal(precisaLer({ em: hoje.toISOString(), cota: 1 }, 2025, 2026, new Date(hoje.getTime() + 8 * 86400000)), true);
  assert.ok(urlGastos('204379', 2026).includes('legislatura=57&ano=2026&mes=&por=deputado&deputado=204379'));
});

/* ===================== Ranking entre os estados ===================== */
const UFS27 = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const perfilFalso = (i, { anos = [2024, 2025], semDivida = false } = {}) => ({
  contexto: { pib: { ano: 2023, valor: 1000 * (i + 1), porHabitante: 20000 + i * 1000 } },
  entregas: { feitas: 6 - (i % 3), esperado: 6 },
  anos: Object.fromEntries(anos.map((a) => [a, { situacao: 'fechado', d: { total: [4000 + i * 10 + (a - 2024) * 5, 100], 15: [50 + i, 1] }, pessoal: 30 + i * 0.5, divida: semDivida && a === 2025 ? null : 10 + i }])),
  ...{}
});
await caso('ranking dos estados: posições, sentido e empate', () => {
  assert.deepEqual(posicionar({ A: 10, B: 20, C: 20, D: 5 }, 'maior-melhor'), { B: 1, C: 1, A: 3, D: 4 });
  assert.deepEqual(posicionar({ A: 10, B: 20, C: 20, D: 5 }, 'menor-melhor'), { D: 1, A: 2, B: 3, C: 3 });
  const perfis = UFS27.map((uf, i) => ({ uf, perfil: perfilFalso(i) }));
  const rk = montarRankingEstados(perfis, new Date('2026-11-26T12:00:00Z'));
  assert.equal(rk.estados, 27);
  const m = Object.fromEntries(rk.metricas.map((x) => [x.id, x]));
  assert.equal(m['eco.pib-pc'].de, 27); assert.equal(m['eco.pib-pc'].ano, 2023);
  assert.equal(m['eco.pib-pc'].itens.TO.posicao, 1, 'neutro: 1 = maior valor');
  assert.equal(m['orc.pessoal'].itens.AC.posicao, 1, 'menos pessoal = melhor');
  assert.equal(m['orc.pessoal'].ano, 2025, 'usa o ano mais recente com dado em pelo menos 20 estados');
  assert.equal(m['orc.divida'].itens.AC.posicao, 1);
  assert.equal(m['transp.entregas'].itens.AC.posicao, 1, 'entrega completa = melhor (empate divide a posição)');
  assert.equal(m['transp.entregas'].itens.AL.posicao, 10, '9 estados com entrega completa ficam na frente');
});
await caso('ranking dos estados: ano sem estados suficientes não é usado, e quem não tem o dado fica sem posição', () => {
  // dívida de 2025 só em 15 estados: o ranking volta para 2024, que tem todos
  const perfis = UFS27.map((uf, i) => ({ uf, perfil: perfilFalso(i, { semDivida: i >= 15 }) }));
  const rk = montarRankingEstados(perfis);
  const div = rk.metricas.find((x) => x.id === 'orc.divida');
  assert.equal(div.ano, 2024); assert.equal(div.de, 27);
  // um estado sem nenhum valor de pessoal: sem posição, e não conta em "de"
  const p2 = UFS27.map((uf, i) => ({ uf, perfil: i === 3 ? { ...perfilFalso(i), anos: {} } : perfilFalso(i) }));
  const rk2 = montarRankingEstados(p2);
  const pes = rk2.metricas.find((x) => x.id === 'orc.pessoal');
  assert.equal(pes.de, 26); assert.equal(pes.itens[UFS27[3]].posicao, null); assert.equal(pes.itens[UFS27[3]].valor, null);
  // menos de MIN_ESTADOS: sem ranking e com o motivo padrão
  const p3 = UFS27.slice(0, MIN_ESTADOS - 1).map((uf, i) => ({ uf, perfil: perfilFalso(i) }));
  const rk3 = montarRankingEstados(p3);
  assert.ok(rk3.metricas.every((x) => x.de === 0 && /Dado não encontrado ou não confirmado/.test(x.motivo)));
});

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes da v8 passaram.');
process.exit(falhas ? 1 : 0);
