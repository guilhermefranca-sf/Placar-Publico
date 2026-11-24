// Teste da linha do tempo de gestões (quem governou em cada período dos 48 meses). Sem internet.
// Rodar:  node scripts/teste/rodar-teste-administracoes.mjs
// Os nomes abaixo são inventados (só para teste). Usa as mesmas colunas dos arquivos do TSE.

import { mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  janelaDe48Meses, eleicoesRelevantes, lerExecutivos, montarGestoes, aplicarTrocas, atribuirAno, atribuirMes,
  atribuirPeriodo, mesesNaJanela, recortarGestoes, gerarAdministracoes, addDias
} from '../administracoes.mjs';
import { UFS, URL_ZIP } from '../tse.mjs';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'placar-adm-'));
const hoje = new Date('2026-11-23T12:00:00Z');
let falhas = 0;
async function caso(nome, fn) { try { await fn(); console.log('ok:', nome); } catch (e) { falhas++; console.log('FALHOU:', nome, '\n   ', e.message.split('\n')[0]); } }

const csv = (cab, linhas) => [cab, ...linhas].map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n') + '\r\n';
const CAB = ['ANO_ELEICAO', 'NR_TURNO', 'SG_UF', 'SG_UE', 'NM_UE', 'DS_CARGO', 'SQ_CANDIDATO', 'NM_CANDIDATO', 'NM_URNA_CANDIDATO', 'SG_PARTIDO', 'DT_NASCIMENTO', 'DT_ELEICAO', 'DS_ELEICAO', 'NR_CPF_CANDIDATO', 'DS_SIT_TOT_TURNO'];
const CPF_FALSO = '99988877766';
let sq = 1;
/** [ano, uf, ue, municipio, cargo, nome, partido, nascimento, dataEleicao, descricao, situacao] */
const linha = (ano, uf, ue, mun, cargo, nome, partido, nasc, data, desc, sit = 'ELEITO') =>
  [ano, 1, uf, ue, mun, cargo, 1000 + sq++, nome, nome.split(' ')[0], partido, nasc, data, desc, CPF_FALSO, sit];

const MUN = 'Eleições Municipais 2020';
const MUN24 = 'Eleições Municipais 2024';
const GER22 = 'Eleições Gerais 2022';
const GER18 = 'Eleições Gerais 2018';
const GER26 = 'Eleições Gerais 2026';

// Município 1: a mesma pessoa reeleita. Município 2: troca de prefeito pela eleição de 2024.
// Município 3: eleição suplementar em 2024 entre as duas eleições comuns.
const SP20 = [
  linha(2020, 'SP', '1', 'CIDADE UM', 'PREFEITO', 'MARIA DA SILVA SOUZA', 'AAA', '01/01/1970', '15/11/2020', MUN),
  linha(2020, 'SP', '2', 'CIDADE DOIS', 'PREFEITO', 'JOAO PEREIRA LIMA', 'BBB', '02/02/1960', '15/11/2020', MUN),
  linha(2020, 'SP', '3', 'CIDADE TRES', 'PREFEITO', 'CARLOS ANDRADE', 'CCC', '03/03/1965', '15/11/2020', MUN),
  linha(2020, 'SP', '2', 'CIDADE DOIS', 'VICE-PREFEITO', 'VICE DOIS', 'BBB', '02/02/1961', '15/11/2020', MUN),
  linha(2020, 'SP', '4', 'CIDADE QUATRO', 'PREFEITO', 'PERDEDOR QUATRO', 'AAA', '04/04/1964', '15/11/2020', MUN, 'NÃO ELEITO')
];
const SP24 = [
  linha(2024, 'SP', '1', 'CIDADE UM', 'PREFEITO', 'MARIA DA SILVA SOUZA', 'AAA', '01/01/1970', '06/10/2024', MUN24),
  linha(2024, 'SP', '2', 'CIDADE DOIS', 'PREFEITO', 'PEDRO ALVES COSTA', 'DDD', '05/05/1975', '06/10/2024', MUN24),
  linha(2024, 'SP', '3', 'CIDADE TRES', 'PREFEITO', 'EVA MARTINS', 'EEE', '06/06/1980', '06/10/2024', MUN24),
  linha(2024, 'SP', '3', 'CIDADE TRES', 'PREFEITO', 'DORA CAMPOS', 'FFF', '07/07/1978', '10/03/2024', 'Eleição Supl. Cidade Tres'),
  linha(2024, 'SP', '5', 'CIDADE CINCO', 'PREFEITO', 'MESMO NOME', 'AAA', '08/08/1970', '06/10/2024', MUN24)
];
const MG18 = [linha(2018, 'MG', 'MG', 'MINAS', 'GOVERNADOR', 'GOV UM DE MINAS', 'GGG', '09/09/1960', '07/10/2018', GER18)];
const MG22 = [linha(2022, 'MG', 'MG', 'MINAS', 'GOVERNADOR', 'GOV DOIS DE MINAS', 'HHH', '10/10/1970', '02/10/2022', GER22)];
const MG26 = [linha(2026, 'MG', 'MG', 'MINAS', 'GOVERNADOR', 'GOV QUATRO DE MINAS', 'III', '11/11/1971', '04/10/2026', GER26)];
const RJ22 = [linha(2022, 'RJ', 'RJ', 'RIO', 'GOVERNADOR', 'GOV DO RIO DE TESTE', 'JJJ', '12/12/1972', '02/10/2022', GER22)];
const PRES = (ano, nome, data, desc, nasc) => [linha(ano, 'BR', 'BR', 'BRASIL', 'PRESIDENTE', nome, 'PPP', nasc, data, desc)];

function fazerZip(nome, arquivos) {
  const pasta = mkdtempSync(path.join(tmp, 'zip-'));
  for (const [n, t] of Object.entries(arquivos)) writeFileSync(path.join(pasta, n), Buffer.from(t, 'latin1'));
  const zip = path.join(tmp, nome);
  const r = spawnSync('python3', ['-c', 'import sys,zipfile,os;z=zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED);[z.write(os.path.join(sys.argv[2],f),f) for f in os.listdir(sys.argv[2])]', zip, pasta]);
  assert.equal(r.status, 0, 'não consegui criar o zip de teste');
  return zip;
}
const cabecalho = (linhas) => csv(CAB, linhas);
const zips = {
  2018: fazerZip('c2018.zip', { 'consulta_cand_2018_MG.csv': cabecalho(MG18), 'consulta_cand_2018_BRASIL.csv': cabecalho(PRES(2018, 'PRES A DE TESTE', '07/10/2018', GER18, '01/01/1955')) }),
  2020: fazerZip('c2020.zip', { 'consulta_cand_2020_SP.csv': cabecalho(SP20) }),
  2022: fazerZip('c2022.zip', { 'consulta_cand_2022_MG.csv': cabecalho(MG22), 'consulta_cand_2022_RJ.csv': cabecalho(RJ22), 'consulta_cand_2022_BR.csv': cabecalho(PRES(2022, 'PRES B DE TESTE', '02/10/2022', GER22, '02/02/1956')) }),
  2024: fazerZip('c2024.zip', { 'consulta_cand_2024_SP.csv': cabecalho(SP24) }),
  2026: fazerZip('c2026.zip', { 'consulta_cand_2026_MG.csv': cabecalho(MG26), 'consulta_cand_2026_BRASIL.csv': cabecalho(PRES(2026, 'PRES C DE TESTE', '25/10/2026', GER26, '03/03/1957')) })
};
const baixarZip = async (url) => {
  const ano = /consulta_cand_(\d{4})\.zip/.exec(url)[1];
  if (!zips[ano]) throw new Error('sem arquivo ' + ano);
  return zips[ano];
};

const TROCAS = [
  { id: 't-mg', cargo: 'governador', uf: 'MG', saiu: { nome: 'Gov Dois' }, entrou: { nome: 'Vice Tres', partido: 'HHH', vinculo: 'vice-governador' }, tipo: 'renúncia', motivo: 'teste', data: null, dataAprox: '2026-04-04', dataTexto: 'até 4 de abril', confirmacao: 'imprensa', fontes: [{ titulo: 'x', url: 'https://x' }], divergencias: [] },
  { id: 't-rj', cargo: 'governador', uf: 'RJ', saiu: { nome: 'Outra Pessoa Qualquer' }, entrou: { nome: 'Interino', partido: null, vinculo: 'presidente do TJ' }, tipo: 'renúncia', situacao: 'interino', data: '2026-03-23', dataAprox: null, fontes: [], divergencias: [] },
  { id: 't-c3', cargo: 'prefeito', uf: 'SP', municipio: 'Cidade Tres', saiu: null, entrou: { nome: 'Vice Cidade Tres', partido: 'EEE', vinculo: 'vice' }, tipo: 'renúncia', data: '2026-04-02', dataAprox: null, fontes: [], divergencias: [] },
  { id: 't-sem-gestao', cargo: 'governador', uf: 'AC', saiu: null, entrou: { nome: 'Ninguém', partido: null }, tipo: 'renúncia', data: '2026-04-02', dataAprox: null, fontes: [] }
];

let adm;

await caso('janela: 48 meses fechados antes do mês atual', () => {
  const j = janelaDe48Meses(hoje);
  assert.deepEqual([j.de, j.ate, j.meses], ['2022-11-01', '2026-10-31', 48]);
});

await caso('eleições relevantes em novembro de 2026', () => {
  const e = eleicoesRelevantes('2022-11-01', '2026-10-31');
  assert.deepEqual(e.municipais, [2020, 2024]);
  assert.deepEqual(e.gerais, [2018, 2022, 2026]);
  assert.deepEqual(e.futuras, [2026]);
});

await caso('eleições relevantes: em fevereiro de 2027 a de 2026 já é mandato em curso, e 2018 saiu', () => {
  const e = eleicoesRelevantes('2023-02-01', '2027-01-31');
  assert.deepEqual(e.gerais, [2022, 2026]);
  assert.deepEqual(e.futuras, []);
});

await caso('lerExecutivos: só titulares eleitos, sem CPF', () => {
  const r = lerExecutivos(cabecalho(SP20), { anoArquivo: 2020 });
  assert.equal(r.length, 3);
  assert.ok(r.every((x) => x.cargo === 'prefeito'));
  assert.ok(!JSON.stringify(r).includes(CPF_FALSO), 'o CPF não pode aparecer');
  assert.equal(r[0].dataEleicao, '2020-11-15');
});

await caso('gerarAdministracoes roda sobre os zips', async () => {
  adm = await gerarAdministracoes({ baixarZip, hoje, trocas: TROCAS });
  assert.ok(adm.prefeitos.SP['1']);
  assert.ok(adm.governadores.MG && adm.governadores.RJ);
  assert.ok(adm.presidente);
});

await caso('CPF não vai para o resultado publicado', () => {
  assert.ok(!JSON.stringify(adm).includes(CPF_FALSO));
  assert.ok(!JSON.stringify(adm).includes('pessoa'), 'a chave interna de reconhecimento não pode sair');
});

await caso('reeleição é UMA gestão (não é troca de gestor)', () => {
  const g = adm.prefeitos.SP['1'].gestoes;
  assert.equal(g.length, 1);
  assert.deepEqual([g[0].inicio, g[0].fim, g[0].reeleito, g[0].mandatos.length], ['2021-01-01', '2028-12-31', true, 2]);
});

await caso('mesmo nome com data de nascimento diferente NÃO é reeleição', () => {
  const g = adm.prefeitos.SP['5'].gestoes;
  assert.equal(g.length, 1); // só a de 2024 (a de 2020 não existe no teste)
  const regs = [
    { cargo: 'prefeito', nome: 'Mesmo Nome', partido: 'AAA', pessoa: 'MESMO NOME|01/01/1970', anoEleicao: 2020, suplementar: false },
    { cargo: 'prefeito', nome: 'Mesmo Nome', partido: 'AAA', pessoa: 'MESMO NOME|08/08/1970', anoEleicao: 2024, suplementar: false }
  ];
  const m = montarGestoes(regs, { hoje });
  assert.equal(m.gestoes.length, 2);
});

await caso('troca de prefeito pela eleição de 2024: duas gestões, ano 2024 é de um e 2025 de outro', () => {
  const g = adm.prefeitos.SP['2'].gestoes;
  assert.equal(g.length, 2);
  assert.equal(g[0].nome, 'Joao Pereira Lima');
  assert.equal(g[1].nome, 'Pedro Alves Costa');
  assert.deepEqual(atribuirAno(g, 2022), { tipo: 'unica', gestoes: ['g1'], cobertura: 1 });
  assert.deepEqual(atribuirAno(g, 2024).gestoes, ['g1']);
  assert.deepEqual(atribuirAno(g, 2025).gestoes, ['g2']);
  assert.equal(atribuirAno(g, 2025).tipo, 'unica');
});

await caso('recorte de 48 meses: a gestão antiga entra só com a parte de nov/2022 a dez/2024', () => {
  const j = janelaDe48Meses(hoje);
  const r = recortarGestoes(adm.prefeitos.SP['2'].gestoes, j);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0].noRecorte, { de: '2022-11-01', ate: '2024-12-31' });
  assert.deepEqual(r[1].noRecorte, { de: '2025-01-01', ate: '2026-10-31' });
});

await caso('eleição suplementar encerra a gestão anterior e o ano dela fica DIVIDIDO', () => {
  const g = adm.prefeitos.SP['3'].gestoes.filter((x) => x.origem === 'tse');
  assert.equal(g.length, 3);
  assert.equal(g[0].fim, '2024-03-09');
  assert.equal(g[0].fimAprox, true);
  assert.equal(g[0].encerradaPor, 'eleição suplementar');
  assert.equal(g[1].inicio, '2024-03-10');
  assert.equal(g[1].inicioAprox, true);
  assert.equal(g[1].fim, '2024-12-31');
  const a = atribuirAno(g, 2024);
  assert.equal(a.tipo, 'dividida');
  assert.deepEqual(a.gestoes, ['g1', 'g2']);
  assert.equal(atribuirAno(g, 2023).tipo, 'unica');
});

await caso('troca da curadoria em prefeitura (capital): 2026 fica dividido e o titular do TSE não é apagado', () => {
  const g = adm.prefeitos.SP['3'].gestoes;
  assert.equal(g.length, 4);
  const eva = g.find((x) => x.nome === 'Eva Martins');
  assert.equal(eva.fim, '2026-04-01');
  assert.equal(eva.encerradaPor, 'renúncia');
  const nova = g.find((x) => x.origem === 'curadoria');
  assert.equal(nova.inicio, '2026-04-02');
  assert.equal(nova.fim, '2028-12-31');
  assert.equal(nova.situacao, 'em exercício');
  assert.equal(atribuirAno(g, 2026).tipo, 'dividida');
  assert.equal(atribuirAno(g, 2025).tipo, 'unica');
});

await caso('governador que renunciou em 2026: ano 2025 é do titular; 2026 é dividido; quem toma posse em 2027 aparece como futura', () => {
  const g = adm.governadores.MG.gestoes;
  assert.deepEqual(g.map((x) => x.nome), ['Gov Um de Minas', 'Gov Dois de Minas', 'Vice Tres', 'Gov Quatro de Minas']);
  assert.deepEqual(g.map((x) => x.situacao), ['encerrada', 'encerrada', 'em exercício', 'futura']);
  assert.equal(atribuirAno(g, 2025).gestoes[0], 'g2');
  assert.equal(atribuirAno(g, 2026).tipo, 'dividida');
  assert.equal(atribuirAno(g, 2022).gestoes[0], 'g1'); // 2022 é do governador eleito em 2018
  assert.equal(g[2].origem, 'curadoria');
  assert.equal(g[2].fim, '2026-12-31');
  assert.equal(g[3].inicio, '2027-01-01');
});

await caso('fonte que cita outro nome para quem saiu gera divergência registrada', () => {
  const g = adm.governadores.RJ.gestoes;
  const interino = g.find((x) => x.origem === 'curadoria');
  assert.ok(interino.divergencias.some((d) => /Outra Pessoa Qualquer/.test(d)));
  assert.equal(interino.interina, true);
});

await caso('nome que bate (com sobrenomes a mais no TSE) não gera divergência', () => {
  const g = adm.governadores.MG.gestoes;
  assert.deepEqual(g[2].divergencias, []);
});

await caso('troca sem gestão correspondente no TSE não é aplicada e é avisada', () => {
  assert.ok(adm.avisos.some((a) => /t-sem-gestao/.test(a)));
  assert.equal(adm.governadores.AC, undefined);
});

await caso('presidente: gestão de 2018 cobre nov-dez/2022, a de 2022 começa em 2023, a de 2026 é futura', () => {
  const g = adm.presidente.gestoes;
  assert.deepEqual(g.map((x) => x.inicio), ['2019-01-01', '2023-01-01', '2027-01-01']);
  assert.deepEqual(g.map((x) => x.situacao), ['encerrada', 'em exercício', 'futura']);
  assert.equal(atribuirMes(g, '2022-12').gestoes[0], 'g1');
  assert.equal(atribuirMes(g, '2023-01').gestoes[0], 'g2');
  assert.equal(atribuirMes(g, '2022-12').tipo, 'unica');
});

await caso('atribuirPeriodo: lacuna (sem gestão conhecida) não vira "única"', () => {
  const g = [{ id: 'g1', inicio: '2023-01-01', fim: '2023-12-31' }];
  assert.equal(atribuirPeriodo(g, '2022-01-01', '2022-12-31').tipo, 'desconhecida');
  assert.equal(atribuirPeriodo(g, '2022-07-01', '2023-06-30').tipo, 'parcial');
  assert.equal(atribuirPeriodo(g, '2022-07-01', '2023-06-30').cobertura, 0.496);
});

await caso('mesesNaJanela: 2022 tem 2 meses dentro do recorte, 2026 tem 10', () => {
  const j = janelaDe48Meses(hoje);
  assert.equal(mesesNaJanela(j, '2022-01-01', '2022-12-31'), 2);
  assert.equal(mesesNaJanela(j, '2023-01-01', '2023-12-31'), 12);
  assert.equal(mesesNaJanela(j, '2026-01-01', '2026-12-31'), 10);
  assert.equal(mesesNaJanela(j, '2021-01-01', '2021-12-31'), 0);
});

await caso('addDias atravessa virada de ano', () => {
  assert.equal(addDias('2024-12-31', 1), '2025-01-01');
  assert.equal(addDias('2025-01-01', -1), '2024-12-31');
});

await caso('arquivo do TSE com formato mudado: erro claro, não silêncio', () => {
  assert.throws(() => lerExecutivos('"A";"B"\r\n"1";"2"\r\n'), /formato mudou/);
});

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
process.exit(falhas ? 1 : 0);
