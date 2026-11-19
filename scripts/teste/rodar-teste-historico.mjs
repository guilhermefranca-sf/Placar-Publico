// Teste do cálculo de mandatos com respostas REAIS da API da Câmara (capturadas em 19/11/2026).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resumirHistorico, datasDaLegislatura, legislaturaDe } from '../historico.mjs';

const real = JSON.parse(readFileSync(new URL('./historico-real.json', import.meta.url), 'utf-8'));
const comoApi = (linhas) => linhas.map(([dataHora, idLegislatura, situacao, condicaoEleitoral, descricaoStatus]) => ({ dataHora, idLegislatura, situacao, condicaoEleitoral, descricaoStatus }));
const hoje = new Date('2026-11-19T12:00:00Z');
let falhas = 0;
const caso = (nome, fn) => { try { fn(); console.log('ok:', nome); } catch (e) { falhas++; console.log('FALHOU:', nome, '\n   ', e.message.split('\n')[0]); } };

caso('legislaturas: datas e a que legislatura pertence cada data', () => {
  assert.deepEqual(datasDaLegislatura(57), { ini: '2023-02-01', fim: '2027-01-31' });
  assert.deepEqual(datasDaLegislatura(54), { ini: '2011-02-01', fim: '2015-01-31' });
  assert.equal(legislaturaDe('2023-02-01'), 57); assert.equal(legislaturaDe('2023-01-31'), 56);
  assert.equal(legislaturaDe('2019-02-01'), 56); assert.equal(legislaturaDe('2011-02-01'), 54);
});

caso('Jandira (5 mandatos, sem afastamento): conta legislaturas e tempo efetivo', () => {
  const r = resumirHistorico(comoApi(real['74848']), hoje);
  assert.deepEqual(r.mandatos.map((m) => m.leg), [52, 54, 55, 56, 57]);
  assert.equal(r.anoInicio, 2003);
  assert.equal(r.mandatos.filter((m) => m.completo === true).length, 4, 'quatro mandatos já completos');
  const atual = r.mandatos.find((m) => m.emCurso);
  assert.equal(atual.completo, null); assert.equal(atual.semAfastamento, true);
  assert.equal(r.legislaturaAtual.dias, Math.round((new Date('2026-11-19') - new Date('2023-02-01')) / 86400000));
  assert.ok(Math.abs(r.diasTotais - (4 * 1460 + 1387)) < 12, `dias totais ${r.diasTotais}`);
});

caso('Celso Sabino (várias licenças como ministro): mandato atual com afastamentos, não "sem afastamento"', () => {
  const r = resumirHistorico(comoApi(real['204496']), hoje);
  const atual = r.mandatos.find((m) => m.emCurso);
  assert.equal(atual.semAfastamento, false);
  assert.equal(r.pausas.filter((p) => /Ministro de Estado/.test(p.motivo)).length, 6);
  assert.ok(atual.dias < atual.diasLegislatura - 400, 'o tempo efetivo é bem menor que a legislatura');
  assert.ok(atual.motivos.length >= 6);
  assert.equal(r.mandatos[0].completo, true, 'o mandato de 2019 a 2023 foi completo');
  assert.ok(!r.eventos.some((e) => /Alteração de partido/.test(e.texto)));
});

caso('Fábio Macedo (licença com prazo e reassunção): dias descontam a licença', () => {
  const r = resumirHistorico(comoApi(real['220681']), hoje);
  const m = r.mandatos[0];
  assert.equal(r.pausas.length, 1);
  const licenca = Math.round((new Date('2024-10-30') - new Date('2024-07-01')) / 86400000);
  assert.equal(m.dias, m.diasLegislatura - licenca);
  assert.match(r.pausas[0].motivo, /Afastamento Conjunto Consecutivo/);
});

caso('Renúncia (vacância): mandato incompleto e sem "licença em curso"', () => {
  const r = resumirHistorico(comoApi(real['220593']), hoje);
  assert.equal(r.mandatos.length, 1);
  assert.equal(r.mandatos[0].semAfastamento, false);
  assert.ok(r.mandatos[0].motivos.some((t) => /Renúncia/.test(t)));
  assert.equal(r.pausas.length, 0);
  assert.equal(r.mandatos[0].dias, Math.round((new Date('2025-01-01') - new Date('2023-02-01')) / 86400000));
});

caso('lista vazia ou só nome/partido: sem mandatos, sem erro', () => {
  const r = resumirHistorico([{ dataHora: '2023-02-01T00:00', idLegislatura: 57, situacao: null, descricaoStatus: 'Nome no início da legislatura' }], hoje);
  assert.equal(r.mandatos.length, 0); assert.equal(r.anoInicio, null); assert.equal(r.diasTotais, 0);
});

console.log(falhas ? `\n${falhas} TESTE(S) FALHARAM` : '\nTUDO OK');
process.exit(falhas ? 1 : 0);
