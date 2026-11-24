// Teste da rotina de atualização com um "Brasil de mentira" (sem internet).
// Rodar:  node scripts/teste/rodar-teste.mjs
// Usa os mesmos nomes de colunas e formatos que conferi nas fontes reais.

import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { atualizar, exercicioDoTesouro, registrarCorrecoes } from '../atualizar.mjs';
import { gerarFederais } from '../federais.mjs';
import { UFS } from '../tse.mjs';
import { scorePessoal, scoreDivida } from '../nota.mjs';
import { indexarEntes, acharMunicipioParecido, distancia } from '../siconfi.mjs';
import { coletarSeries, precisaBuscar, extrairDca } from '../series-fiscais.mjs';

process.env.PLACAR_ESPERA_MS = '0'; // no teste, a segunda tentativa das consultas que falharam não precisa esperar

const tmp = mkdtempSync(path.join(os.tmpdir(), 'placar-teste-'));
const saida = path.join(tmp, 'dados');
const hoje = new Date('2026-11-18T12:00:00Z');
let falhas = 0;
const ok = (msg) => console.log('ok:', msg);
async function caso(nome, fn) { try { await fn(); ok(nome); } catch (e) { falhas++; console.log('FALHOU:', nome, '\n   ', e.message.split('\n')[0]); } }

/* ---------- CSV ---------- */
const csv = (cab, linhas) => [cab, ...linhas].map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n') + '\r\n';

/* ---------- Câmara de mentira ---------- */
const N_DEP = 513;
const dep = (i) => ({
  id: 100000 + i, nome: `Deputado Teste ${i}`, siglaPartido: ['AAA', 'BBB', 'CCC'][i % 3], siglaUf: UFS[i % 27],
  urlFoto: `https://exemplo/${100000 + i}.jpg`
});
const perfil = (i) => ({ pres: 100 - ((i * 7) % 60), vot: 100 - ((i * 11) % 70), proj: (i * 5) % 9, gasto: 4000 + ((i * 937) % 30000) });
const SESSOES = 60;
const dataSessao = (s) => new Date(Date.UTC(2026, 1, 3 + s * 5)).toISOString().slice(0, 10);

const eventos = csv(['id', 'uri', 'urlDocumentoPauta', 'dataHoraInicio', 'dataHoraFim', 'situacao', 'descricao', 'descricaoTipo', 'localExterno', 'localCamara.nome'],
  [
    ...Array.from({ length: SESSOES }, (_, s) => [`S${s}`, '', '', dataSessao(s) + 'T14:00:00', '', 'Encerrada', 'sessão', 'Sessão Deliberativa', '', 'Plenário da Câmara dos Deputados']),
    ['SX1', '', '', '2026-03-03T10:00:00', '', 'Cancelada', 'sessão', 'Sessão Deliberativa', '', 'Plenário da Câmara dos Deputados'],
    ['SX2', '', '', '2026-03-04T10:00:00', '', 'Encerrada', 'sessão', 'Sessão Não Deliberativa Solene', '', 'Plenário da Câmara dos Deputados'],
    ['CX1', '', '', '2026-03-05T10:00:00', '', 'Encerrada (Final)', 'comissão', 'Reunião Deliberativa', '', 'Anexo II, Plenário 10']
  ]);

// i=500: assumiu tarde (só as últimas 15 sessões -> sem nota). i=501: primeira presença na sessão 12. i=502: nunca apareceu.
function presente(i, s) {
  if (i === 502) return false;
  if (i === 500) return s >= SESSOES - 15;
  if (i === 501 && s < 12) return false;
  return ((i * 31 + s * 17) % 100) < perfil(i).pres;
}
const presencaRows = [];
for (let i = 0; i < N_DEP; i++) for (let s = 0; s < SESSOES; s++) if (presente(i, s)) presencaRows.push([`S${s}`, '', dataSessao(s) + 'T14:05:00', 100000 + i, '']);
presencaRows.push(['CX1', '', '2026-03-05T10:00:00', 100003, '']); // presença em comissão não conta
const presenca = csv(['idEvento', 'uriEvento', 'dataHoraInicio', 'idDeputado', 'uriDeputado'], presencaRows);

const VOT_PLEN = 40;
const dataVot = (v) => dataSessao(Math.floor(v * SESSOES / VOT_PLEN));
const tituloVot = (v) => (v % 4 === 0 ? 'Aprovado o requerimento de urgência.' : v % 4 === 1 ? 'Rejeitada a emenda nº 3.' : 'Aprovado o projeto de lei.');
const votacoes = csv(['id', 'uri', 'data', 'dataHoraRegistro', 'siglaOrgao', 'aprovacao', 'votosSim', 'votosNao', 'votosOutros', 'descricao'], [
  ...Array.from({ length: VOT_PLEN }, (_, v) => [`P${v}`, '', dataVot(v), dataVot(v) + 'T' + String(10 + (v % 8)).padStart(2, '0') + ':00:00', 'PLEN', v % 4 === 1 ? 0 : 1, 300 + v, 100, 5, tituloVot(v)]),
  ...Array.from({ length: 5 }, (_, v) => [`C${v}`, '', '2026-04-01', '2026-04-01T10:00:00', 'CCJC', 1, 20, 0, 0, 'Votação de comissão']),
  ...Array.from({ length: 3 }, (_, v) => [`Z${v}`, '', '2026-05-01', '2026-05-01T10:00:00', 'PLEN', 1, 0, 0, 0, 'Votação simbólica'])
]);
const votoRows = [];
for (let v = 0; v < VOT_PLEN; v++) for (let i = 0; i < N_DEP; i++) {
  if (i === 502) continue;
  if (((i * 13 + v * 7) % 100) < perfil(i).vot) votoRows.push([`P${v}`, '', '', ['Sim', 'Não', 'Abstenção'][(i + v) % 3], 100000 + i]);
}
for (let v = 0; v < 5; v++) for (let i = 0; i < 20; i++) votoRows.push([`C${v}`, '', '', 'Sim', 100000 + i]); // comissão: poucos votos
const votos = csv(['idVotacao', 'uriVotacao', 'dataHoraVoto', 'voto', 'deputado_id'], votoRows);

const propRows = [], autRows = [];
let idp = 5000;
for (let i = 0; i < N_DEP; i++) {
  for (let k = 0; k < perfil(i).proj; k++) { propRows.push([idp, 'PL', '2026-0' + (1 + (k % 9)) + '-10']); autRows.push([idp, 100000 + i]); idp++; }
  propRows.push([idp, 'REQ', '2026-05-10']); autRows.push([idp, 100000 + i]); idp++; // requerimento não conta
}
const proposicoes = csv(['id', 'siglaTipo', 'dataApresentacao'], propRows.map(([id, s, d]) => [id, s, d + 'T10:00:00']));
const primeiroPL = propRows.find((r) => r[1] === 'PL');
const donoDoPL = autRows.find((a) => a[0] === primeiroPL[0])[1];
const COAUTOR = donoDoPL === 100001 ? 100002 : 100001;
const autores = csv(['idProposicao', 'idDeputadoAutor'], [...autRows, [primeiroPL[0], COAUTOR], [primeiroPL[0], COAUTOR], ['999999', '']]);

const cotaRows = [];
for (let i = 0; i < N_DEP; i++) for (let m = 1; m <= 10; m++) cotaRows.push([100000 + i, 2026, m, perfil(i).gasto + 100, 100]);
cotaRows.push(['', 2026, 1, 99999, 0]); // liderança, sem deputado
cotaRows.push([100001, 2025, 1, 999999, 0]); // outro ano
const cotas = csv(['ideCadastro', 'numAno', 'numMes', 'vlrDocumento', 'vlrGlosa'], cotaRows);

/* ---------- TSE de mentira (zips de verdade, em windows-1252) ---------- */
const CAB_TSE = ['ANO_ELEICAO', 'NR_TURNO', 'SG_UF', 'SG_UE', 'NM_UE', 'DS_CARGO', 'SQ_CANDIDATO', 'NM_CANDIDATO', 'NM_URNA_CANDIDATO', 'SG_PARTIDO', 'DT_NASCIMENTO', 'DS_GRAU_INSTRUCAO', 'DS_OCUPACAO', 'DS_SIT_TOT_TURNO'];
const NOMES_MUN = ['SÃO LUÍS DO TESTE', "SANTA BÁRBARA D'OESTE", 'BIRITIBA-MIRIM', 'VILA NOVA', 'PORTO ALEGRE DO NORTE'];
let seq = 0;
const mundoMunicipal = {};
function csvMunicipal(uf) {
  const linhas = [];
  NOMES_MUN.forEach((m, k) => {
    const cod = String(1000 + k).padStart(5, '0');
    const base = (cargo, nome, sit, turno = 1) => [2024, turno, uf, cod, m, cargo, 230000000 + (++seq), nome, nome.split(' ')[0], 'ABC', '07/12/1972', 'ENSINO MÉDIO COMPLETO', 'EMPRESÁRIA/EMPRESÁRIO', sit];
    const pref = `PREFEITO ${uf}${k}`;
    if (k === 3) { // segundo turno: a mesma pessoa aparece com duas situações
      const s1 = base('PREFEITO', pref, '2º TURNO', 1); const s2 = [...s1]; s2[1] = 2; s2[13] = 'ELEITO'; s2[6] = s1[6];
      linhas.push(s1, s2, base('PREFEITO', `OUTRO ${uf}${k}`, 'NÃO ELEITO'));
    } else linhas.push(base('PREFEITO', pref, 'ELEITO'), base('PREFEITO', `PERDEU ${uf}${k}`, 'NÃO ELEITO'));
    linhas.push(base('VICE-PREFEITO', `VICE ${uf}${k}`, 'ELEITO'));
    for (let v = 0; v < 9; v++) linhas.push(base('VEREADOR', `VEREADOR ${uf}${k} ${v}`, v < 6 ? 'ELEITO POR QP' : 'ELEITO POR MÉDIA'));
    for (let v = 0; v < 4; v++) linhas.push(base('VEREADOR', `SUPLENTE ${uf}${k} ${v}`, 'SUPLENTE'));
  });
  return csv(CAB_TSE, linhas);
}
function csvGeral(uf) {
  const linhas = [];
  const base = (cargo, nome, sit) => [2022, 1, uf, uf, uf, cargo, 240000000 + (++seq), nome, nome, 'XYZ', '01/02/1970', 'SUPERIOR COMPLETO', 'ADVOGADO', sit];
  linhas.push(base('GOVERNADOR', `GOVERNADOR ${uf}`, 'ELEITO'), base('GOVERNADOR', `PERDEU GOV ${uf}`, 'NÃO ELEITO'), base('VICE-GOVERNADOR', `VICE GOV ${uf}`, 'ELEITO'));
  const cargo = uf === 'DF' ? 'DEPUTADO DISTRITAL' : 'DEPUTADO ESTADUAL';
  for (let d = 0; d < 8; d++) linhas.push(base(cargo, `ESTADUAL ${uf} ${d}`, 'ELEITO POR QP'));
  linhas.push(base(cargo, `SUPLENTE EST ${uf}`, 'SUPLENTE'));
  return csv(CAB_TSE, linhas);
}
function fazerZip(nome, arquivos) {
  const pasta = mkdtempSync(path.join(tmp, 'zip-'));
  for (const [n, t] of Object.entries(arquivos)) writeFileSync(path.join(pasta, n), Buffer.from(t, 'latin1'));
  const zip = path.join(tmp, nome);
  const r = spawnSync('python3', ['-c', 'import sys,zipfile,os;z=zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED);[z.write(os.path.join(sys.argv[2],f),f) for f in os.listdir(sys.argv[2])]', zip, pasta]);
  assert.equal(r.status, 0, 'não consegui criar o zip de teste');
  return zip;
}
const CAB_TSE2 = [...CAB_TSE, 'DT_ELEICAO', 'DS_ELEICAO', 'NR_CPF_CANDIDATO'];
const CPF_DE_TESTE = '12345678909';
function csvMunicipal2020(uf) {
  const linhas = [];
  NOMES_MUN.forEach((m, k) => {
    const cod = String(1000 + k).padStart(5, '0');
    // k = 0: o mesmo prefeito de 2024 (reeleito). Nos outros, outro nome: houve troca de gestor.
    const nome = k === 0 ? `PREFEITO ${uf}0` : `PREFEITO ANTIGO ${uf}${k}`;
    linhas.push([2020, 1, uf, cod, m, 'PREFEITO', 210000000 + (++seq), nome, nome.split(' ')[0], 'ABC', '07/12/1972', 'ENSINO MÉDIO COMPLETO', 'EMPRESÁRIA/EMPRESÁRIO', 'ELEITO', '15/11/2020', 'Eleições Municipais 2020', CPF_DE_TESTE]);
  });
  return csv(CAB_TSE2, linhas);
}
function csvGeralComData(uf, ano, nome, data, desc) {
  return csv(CAB_TSE2, [[ano, 1, uf, uf, uf, 'GOVERNADOR', 220000000 + (++seq), nome, nome, 'XYZ', '01/02/1960', 'SUPERIOR COMPLETO', 'ADVOGADO', 'ELEITO', data, desc, CPF_DE_TESTE]]);
}
const csvPres = (ano, nome, data) => csv(CAB_TSE2, [[ano, 1, 'BR', 'BR', 'BRASIL', 'PRESIDENTE', 250000000 + (++seq), nome, nome, 'PPP', '01/01/1950', 'SUPERIOR COMPLETO', 'ADVOGADO', 'ELEITO', data, `Eleições Gerais ${ano}`, CPF_DE_TESTE]]);
const zip2024 = fazerZip('consulta_cand_2024.zip', Object.fromEntries(UFS.filter((u) => u !== 'DF').map((u) => [`consulta_cand_2024_${u}.csv`, csvMunicipal(u)])));
const zip2022 = fazerZip('consulta_cand_2022.zip', { ...Object.fromEntries(UFS.map((u) => [`consulta_cand_2022_${u}.csv`, csvGeral(u)])), 'consulta_cand_2022_BRASIL.csv': csvPres(2022, 'PRESIDENTE DE 2022', '02/10/2022') });
const zip2026 = fazerZip('consulta_cand_2026.zip', { ...Object.fromEntries(UFS.map((u) => [`consulta_cand_2026_${u}.csv`, csvGeral(u).replace(/GOVERNADOR /g, 'GOVERNADOR NOVO ')])), 'consulta_cand_2026_BR.csv': csvPres(2026, 'PRESIDENTE DE 2026', '25/10/2026') });
const zip2020 = fazerZip('consulta_cand_2020.zip', Object.fromEntries(UFS.filter((u) => u !== 'DF').map((u) => [`consulta_cand_2020_${u}.csv`, csvMunicipal2020(u)])));
const zip2018 = fazerZip('consulta_cand_2018.zip', { ...Object.fromEntries(UFS.map((u) => [`consulta_cand_2018_${u}.csv`, csvGeralComData(u, 2018, `GOVERNADOR ANTIGO ${u}`, '28/10/2018', 'Eleições Gerais 2018')])), 'consulta_cand_2018_BRASIL.csv': csvPres(2018, 'PRESIDENTE DE 2018', '28/10/2018') });

/* ---------- Tesouro de mentira ---------- */
const entes = [];
let codIbge = 1100000;
const codPorMun = {};
// Mesmo formato do Tesouro de verdade: o "uf" dos estados vem como "BR"; o estado se reconhece pelo código do IBGE.
const CODIGO_IBGE_DO_ESTADO = { RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29, MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53 };
// Em alguns municípios o Tesouro escreve o nome diferente do TSE (como "Assú"/"Açu" na vida real).
const NOME_DIFERENTE_NO_TESOURO = { 'RN|0': 'São Luiz do Teste', 'PB|4': 'Porto Alegre de Norte' };
for (const uf of UFS.filter((u) => u !== 'DF')) {
  NOMES_MUN.forEach((m, k) => {
    const nomeEnte = m.toLowerCase().replace(/(^|[\s-])\S/g, (x) => x.toUpperCase()).replace(' Do ', ' do ').replace(' D’', ' d’');
    const e = { cod_ibge: ++codIbge, ente: NOME_DIFERENTE_NO_TESOURO[`${uf}|${k}`] || nomeEnte.replace("D'oeste", "d'Oeste"), esfera: 'M', uf, populacao: 1000 * (k + 1) };
    entes.push(e); codPorMun[`${uf}${k}`] = e.cod_ibge;
  });
}
UFS.forEach((uf) => entes.push({ cod_ibge: CODIGO_IBGE_DO_ESTADO[uf], ente: 'Estado ' + uf, esfera: uf === 'DF' ? 'D' : 'E', uf: 'BR', populacao: 1e6 }));
for (let k = 0; k < 5000; k++) entes.push({ cod_ibge: 9000000 + k, ente: 'Enchimento ' + k, esfera: 'M', uf: UFS[k % 26], populacao: 500 });
entes.push({ cod_ibge: 1, ente: 'União', esfera: 'U', uf: null, populacao: 2e8 });
// No Tesouro de verdade, o DF é esfera "D" na lista de entes, mas as consultas de relatórios só respondem com "E".
const esferaDoCodigo = new Map(entes.map((e) => [e.cod_ibge, e.esfera]));
const chamadasSiconfi = { rgf: 0, extrato: 0 };
const jaFalhou = new Set();
const situacao = (id) => ({ semDados: id % 23 === 0, semestral: id > 100 && id % 7 === 0 && id % 23 !== 0, falhaUmaVez: id > 100 && id % 13 === 0 });
const pessoalDe = (id) => 40 + (id % 20) + 0.5;
const dividaDe = (id) => (id % 5) * 20 + 0.25;
function respostaSiconfi(url) {
  const u = new URL(url);
  const p = u.searchParams;
  const rota = u.pathname.split('/').pop();
  if (rota === 'entes') return { items: entes, hasMore: false };
  const id = Number(p.get('id_ente'));
  const s = situacao(id);
  if (rota === 'rgf') {
    chamadasSiconfi.rgf++;
    if (s.falhaUmaVez && !jaFalhou.has(id)) { jaFalhou.add(id); throw new Error('HTTP 503 em ' + url); } // falha passageira da API
    if (s.semDados) return { items: [] };
    const per = p.get('in_periodicidade');
    // Como no Tesouro de verdade: cidade pequena entrega o RGF Simplificado, por semestre; as outras, o RGF completo, por quadrimestre.
    const certo = s.semestral
      ? p.get('co_tipo_demonstrativo') === 'RGF Simplificado' && per === 'S' && p.get('nr_periodo') === '2'
      : p.get('co_tipo_demonstrativo') === 'RGF' && per === 'Q' && p.get('nr_periodo') === '3';
    if (!certo || p.get('co_poder') !== 'E' || p.get('co_esfera') !== (esferaDoCodigo.get(id) === 'D' ? 'E' : esferaDoCodigo.get(id))) return { items: [] };
    if (p.get('no_anexo') === 'RGF-Anexo 01') {
      return { items: [
        { cod_conta: 'DespesaComPessoalTotal', coluna: 'VALOR', valor: 123456 },
        { cod_conta: 'DespesaComPessoalTotal', coluna: '% sobre a RCL Ajustada', valor: pessoalDe(id) },
        { cod_conta: 'DespesaComPessoalTotal', coluna: '% sobre a RCL', valor: 1 }
      ] };
    }
    const fim = per === 'S' ? 'Até o 2º Semestre' : 'Até o 3º Quadrimestre';
    return { items: [
      { cod_conta: 'PercentualDaDCLSobreARCL', coluna: 'SALDO DO EXERCÍCIO ANTERIOR', valor: 99 },
      { cod_conta: 'PercentualDaDCLSobreARCL', coluna: fim, valor: dividaDe(id) }
    ] };
  }
  if (rota === 'extrato_entregas') {
    chamadasSiconfi.extrato++;
    const inst = id < 100 ? `Governo do Estado ${id}` : `Prefeitura Municipal de Teste ${id} - XX`;
    const camara = `Câmara de Vereadores ${id}`;
    const itens = [{ instituicao: inst, entregavel: 'MSC Agregada', periodicidade: 'M', periodo: 1, status_relatorio: null }];
    if (s.semDados) return { items: itens };
    for (let b = 1; b <= 6; b++) itens.push({ instituicao: inst, entregavel: 'Relatório Resumido de Execução Orçamentária', periodicidade: 'B', periodo: b, status_relatorio: b === 6 ? 'RE' : 'HO' });
    const simpl = s.semestral ? ' Simplificado' : '';
    for (const it of itens.splice(1)) itens.push({ ...it, entregavel: it.entregavel + simpl });
    const nRgf = s.semestral ? 2 : 3;
    for (let q = 1; q <= nRgf; q++) {
      itens.push({ instituicao: inst, entregavel: 'Relatório de Gestão Fiscal' + simpl, periodicidade: s.semestral ? 'S' : 'Q', periodo: q, status_relatorio: 'HO' });
      itens.push({ instituicao: camara, entregavel: 'Relatório de Gestão Fiscal', periodicidade: 'Q', periodo: q, status_relatorio: 'HO' });
    }
    if (id % 11 !== 0) itens.push({ instituicao: inst, entregavel: 'Balanço Anual (DCA)', periodicidade: 'A', periodo: 1, status_relatorio: 'HO' });
    return { items: itens };
  }
  throw new Error('HTTP 404 em ' + url);
}


/* ---------- DCA (balanço anual), IBGE e Banco Central de mentira ---------- */
const chamadasDca = { n: 0, porAno: {} };
const dcaFalhou = new Set();
const SHARES = { '10': 0.25, '12': 0.2, '17': 0.05, '06': 0.02, '15': 0.1, '16': 0.01, '26': 0.07 };
const MULT = { 'Despesas Empenhadas': 1.0, 'Despesas Liquidadas': 0.9, 'Despesas Pagas': 0.8 };
const baseDca = (id, ano) => 1000000 * (1 + (id % 7)) * (ano - 2020);
const popDca = (id, ano) => (entes.find((e) => e.cod_ibge === id)?.populacao || 1) + (ano - 2020) * 10;
function respostaDca(url) {
  const p = new URL(url).searchParams;
  const id = Number(p.get('id_ente'));
  const ano = Number(p.get('an_exercicio'));
  chamadasDca.n++; chamadasDca.porAno[ano] = (chamadasDca.porAno[ano] || 0) + 1;
  if (p.get('no_anexo') !== 'DCA-Anexo I-E') return { items: [] };
  if (id % 17 === 0 && !dcaFalhou.has(`${id}|${ano}`)) { dcaFalhou.add(`${id}|${ano}`); throw new Error('HTTP 503 em ' + url); }
  if (id % 11 === 0) return { items: [] }; // este ente não entregou o balanço
  const pop = popDca(id, ano);
  const base = baseDca(id, ano);
  const linha = (conta, coluna, valor) => ({ anexo: 'DCA-Anexo I-E', cod_conta: 'TotalDespesas', cod_ibge: id, coluna, conta, exercicio: ano, instituicao: 'X', populacao: pop, rotulo: 'Total Geral da Despesa por Função', valor });
  const itens = [];
  for (const [col, m] of Object.entries(MULT)) {
    itens.push(linha('Despesas Exceto Intraorçamentárias', col, base * m));
    for (const [f, share] of Object.entries(SHARES)) {
      itens.push(linha(`${f} - Função ${f}`, col, base * share * m));
      itens.push(linha(`${f}.301 - Subfunção`, col, base * share * m * 0.5)); // subfunção: não pode ser somada de novo
      itens.push(linha(`FU${f} - Demais Subfunções`, col, 1));
    }
  }
  itens.push(linha('10 - Função 10', 'Inscrição de Restos a Pagar Não Processados', 12345)); // coluna que não usamos
  return { items: itens };
}
const mesesDe = (de, ate) => { const m = []; let [a, b] = de.split('-').map(Number); const [fa, fb] = ate.split('-').map(Number); while (a < fa || (a === fa && b <= fb)) { m.push(`${a}-${String(b).padStart(2, '0')}`); b++; if (b > 12) { a++; b = 1; } } return m; };
const ibgeDe = (e, periodo, extra = 0) => e.populacao + Number(periodo) + extra;
function respostaIbge(url) {
  const u = new URL(url);
  const m = /agregados\/(\d+)\/periodos(?:\/([^/]+)\/variaveis\/(\d+))?$/.exec(u.pathname);
  if (!m) throw new Error('HTTP 404 em ' + url);
  const [, tabela, periodo, variavel] = m;
  if (!periodo) return { 6579: [{ id: '2023' }, { id: '2024' }, { id: '2025' }], 5938: [{ id: '2022' }, { id: '2023' }] }[tabela].map((x) => ({ ...x, literals: [x.id] }));
  const loc = u.searchParams.get('localidades');
  if (loc === 'N1[all]') {
    const [de, ate] = periodo.split('-').map((x) => `${x.slice(0, 4)}-${x.slice(4)}`);
    const meses = mesesDe(de, ate).filter((x) => !(tabela === '6381' && x > '2026-09')); // PNAD tem atraso: falta o último mês
    return [{ id: variavel, variavel: 'x', unidade: '%', resultados: [{ classificacoes: [], series: [{ localidade: { id: '1' }, serie: Object.fromEntries(meses.map((x, k) => [x.replace('-', ''), String(variavel === '2265' ? 5 + (k % 3) : variavel === '4099' ? 8 - k * 0.05 : 0.5)])) }] }] }];
  }
  const nivel = loc.slice(0, 2);
  const lista = entes.filter((e) => (nivel === 'N6' ? e.esfera === 'M' : e.esfera === 'E' || e.esfera === 'D') && e.cod_ibge !== 1);
  const valor = (e) => (tabela === '6579' ? ibgeDe(e, periodo) : tabela === '5938' ? e.populacao * 1000 + Number(periodo) : 50 + (e.cod_ibge % 40) + 0.5);
  return [{ id: variavel, variavel: 'x', unidade: 'x', resultados: [{ classificacoes: [], series: lista.map((e) => ({ localidade: { id: String(e.cod_ibge) }, serie: { [periodo]: e.cod_ibge % 97 === 0 ? '-' : String(valor(e)) } })) }] }];
}
function respostaBcb(url) {
  const n = /bcdata\.sgs\.(\d+)\/dados/.exec(url)[1];
  const q = new URL(url).searchParams;
  const dd = (t) => t.split('/').reverse().join('-').slice(0, 7);
  return mesesDe(dd(q.get('dataInicial')), dd(q.get('dataFinal'))).map((x, k) => ({ data: `01/${x.slice(5)}/${x.slice(0, 4)}`, valor: String((n === '13762' ? 70 : 10) + k / 10) }));
}

const API = 'https://dadosabertos.camara.leg.br/api/v2';
const ARQ = 'https://dadosabertos.camara.leg.br/arquivos';
const arquivosTexto = {
  [`${ARQ}/eventos/csv/eventos-2026.csv`]: eventos,
  [`${ARQ}/eventosPresencaDeputados/csv/eventosPresencaDeputados-2026.csv`]: presenca,
  [`${ARQ}/votacoes/csv/votacoes-2026.csv`]: votacoes,
  [`${ARQ}/votacoesVotos/csv/votacoesVotos-2026.csv`]: votos,
  [`${ARQ}/proposicoes/csv/proposicoes-2026.csv`]: proposicoes,
  [`${ARQ}/proposicoesAutores/csv/proposicoesAutores-2026.csv`]: autores
};
// Anos anteriores: mesmo desenho, com o ano trocado. Os deputados 500, 501 e 502 (que assumiram tarde ou nunca
// apareceram) não existiam nesses anos. Os ids de sessão e de votação se repetem de propósito: cada ano é lido separado.
const doAno = (texto, a) => texto.replaceAll('2026', String(a)).split('\r\n').filter((l) => !/"10050[0-2]"/.test(l)).join('\r\n');
const lidos = [];
for (const a of [2023, 2024, 2025]) {
  for (const [url, texto] of Object.entries({ ...arquivosTexto })) arquivosTexto[url.replace('2026', a)] = doAno(texto, a);
}
// Histórico no mesmo formato da API real: eventos de posse, licença, retorno e fim.
const historicoDe = (id) => {
  const i = id - 100000;
  const ev = (dataHora, situacao, descricaoStatus, extra = {}) => ({ id, nome: `Deputado Teste ${i}`, siglaPartido: 'AAA', siglaUf: 'SP', idLegislatura: 57, dataHora, situacao, condicaoEleitoral: 'Titular', descricaoStatus, ...extra });
  if (i === 7) return [ev('2023-02-01T00:00', 'Exercício', 'Entrada - Posse - Início de mandato'), ev('2023-08-01T00:00', 'Licença', 'Saída - Afastamento com prazo determinado - Licença para Tratar de Interesse Particular'), ev('2023-12-01T00:00', 'Exercício', 'Entrada - Reassunção - Término de licença')];
  if (i === 8) return []; // sem histórico publicado
  if (i === 9) throw new Error('HTTP 500 em histórico'); // falha: não pode apagar nem derrubar o resto
  const antigo = i % 3 === 0 ? [{ ...ev('2015-02-01T00:00', 'Exercício', 'Entrada - Posse - Início de mandato'), idLegislatura: 55 }, { ...ev('2019-01-31T00:00', 'Fim de Mandato', 'Saída - Término da legislatura'), idLegislatura: 55 }] : [];
  return [...antigo, ev('2023-02-01T00:00', 'Exercício', 'Entrada - Posse - Início de mandato')];
};
const fontes = {
  json: async (url) => {
    let m;
    if ((m = url.match(/\/deputados\/(\d+)\/historico$/))) return { dados: historicoDe(Number(m[1])) };
    if ((m = url.match(/\/deputados\/(\d+)$/))) return { dados: { id: Number(m[1]), nomeCivil: `NOME CIVIL ${m[1]}`, dataNascimento: '1970-01-01', municipioNascimento: 'Teste', ufNascimento: 'SP', ultimoStatus: { situacao: 'Exercício', condicaoEleitoral: 'Titular', data: '2023-02-01', gabinete: { sala: '300', predio: '4', telefone: '3215-0000', email: 'dep@camara.leg.br' } } } };
    if ((m = url.match(/\/legislaturas\/(\d+)\/mesa/))) return { dados: m[1] === '57' ? [{ id: 100003, titulo: 'Presidente', dataInicio: '2025-02-01', dataFim: null }, { id: 100004, titulo: '1º Vice-Presidente', dataInicio: '2025-02-01', dataFim: null }] : [] };
    if ((m = url.match(/\/votacoes\/(P\d+)$/))) return { dados: { id: m[1], proposicoesAfetadas: [{ id: 777000 + Number(m[1].slice(1)), siglaTipo: 'PL', numero: 100 + Number(m[1].slice(1)), ano: 2026, ementa: 'Ementa da matéria ' + m[1] }] } };
    if (url.startsWith(API + '/deputados')) {
      const pagina = Number(new URL(url).searchParams.get('pagina') || 1);
      return { dados: Array.from({ length: N_DEP }, (_, i) => dep(i)).slice((pagina - 1) * 100, pagina * 100) };
    }
    if (url.includes('apidatalake') && url.includes('/dca?')) return respostaDca(url);
    if (url.includes('apidatalake')) return respostaSiconfi(url);
    if (url.includes('servicodados.ibge.gov.br')) return respostaIbge(url);
    if (url.includes('api.bcb.gov.br')) return respostaBcb(url);
    throw new Error('HTTP 404 em ' + url);
  },
  texto: async (url) => { if (!(url in arquivosTexto)) throw new Error('HTTP 404 em ' + url); lidos.push(url); return arquivosTexto[url]; },
  cotas: async (a) => (a === 2026 ? cotas : doAno(cotas, a).replace(/"2025";"1";"999999"/, '"2025";"1";"0"'))
};
const zipsPorAno = { 2018: zip2018, 2020: zip2020, 2022: zip2022, 2024: zip2024, 2026: zip2026 };
const baixarZip = async (url) => { const z = zipsPorAno[/consulta_cand_(\d{4})\.zip/.exec(url)[1]]; if (!z) throw new Error('HTTP 404 em ' + url); return z; };
const lerSaida = (n) => JSON.parse(readFileSync(path.join(saida, n), 'utf-8'));
const logs = [];
const log = (m) => { logs.push(m); if (process.env.VERBOSO) console.log("  [log]", m); };

/* ---------- 1ª rodada: tudo ---------- */
console.log('Rodando a atualização completa com dados de mentira...');
const TROCAS_TESTE = [
  { id: 't-sp', cargo: 'governador', uf: 'SP', saiu: { nome: 'Governador Sp' }, entrou: { nome: 'Vice Sp', partido: 'XYZ', vinculo: 'vice-governador' }, tipo: 'renúncia', data: null, dataAprox: '2026-04-04', fontes: [], divergencias: [] },
  { id: 't-mun', cargo: 'prefeito', uf: 'SP', municipio: 'Biritiba-Mirim', saiu: null, entrou: { nome: 'Vice Biritiba', partido: 'ABC', vinculo: 'vice-prefeito' }, tipo: 'renúncia', data: '2026-04-02', dataAprox: null, fontes: [], divergencias: [] }
];
const meta1 = await atualizar({ fontes, baixarZip, saida, hoje, log, trocas: TROCAS_TESTE });

await caso('todas as fontes terminam bem', () => {
  assert.equal(meta1.fontes.camara.ok, true);
  assert.equal(meta1.fontes.tse.ok, true);
  assert.equal(meta1.fontes.siconfi.ok, true);
  assert.equal(meta1.fontes.siconfi.exercicio, 2025);
  assert.equal(exercicioDoTesouro(new Date('2026-01-15')), 2024);
});

await caso('federais: 513 deputados, posições 1..N sem buracos, notas de 0 a 100', () => {
  const f = lerSaida('federais.json');
  assert.equal(f.total, 513);
  assert.deepEqual(f.janela, { anos: 4, de: 2023, ate: 2026 }, 'o índice olha os últimos 4 anos civis');
  assert.equal(f.sessoes, 4 * SESSOES, 'conta só sessão deliberativa de Plenário encerrada, nos 4 anos');
  assert.equal(f.votacoes, 4 * VOT_PLEN, 'conta só votação nominal do Plenário (ignora comissão e simbólica), nos 4 anos');
  assert.equal(f.sessoesAno, SESSOES); assert.equal(f.votacoesAno, VOT_PLEN);
  const com = f.itens.filter((i) => i.nota != null);
  assert.equal(f.comNota, com.length);
  assert.deepEqual(com.map((i) => i.rank).sort((a, b) => a - b), com.map((_, k) => k + 1));
  assert.ok(com.every((i) => i.nota >= 0 && i.nota <= 100));
  assert.ok(com.every((i) => i.comp.length === 4 && i.comp.every((c) => c.s >= 0 && c.s <= 100)));
});

await caso('federais: casos especiais (assumiu tarde, primeira presença tardia, nunca apareceu)', () => {
  const f = lerSaida('federais.json');
  const por = (i) => f.itens.find((x) => x.id === String(100000 + i));
  assert.equal(por(500).nota, null); assert.match(por(500).motivo, /15 sessões/);
  assert.ok(por(501).nota != null && por(501).obs && /Primeira presença registrada em/.test(por(501).obs));
  assert.equal(por(501).desde.slice(0, 4), '2026', 'quem só aparece em 2026 é avaliado a partir daí, não pelos anos em que nem era deputado');
  assert.equal(por(501).extra.sessoes[1], SESSOES - 12);
  assert.equal(por(502).nota, null); assert.match(por(502).motivo, /Sem presença/);
});

const ANOS = [2023, 2024, 2025, 2026];
const dSessao = (s, a) => dataSessao(s).replace('2026', String(a));
const dVot = (v, a) => dataVot(v).replace('2026', String(a));

await caso('federais: presença, votos e cota nos 4 anos batem com a conta feita à mão', () => {
  const f = lerSaida('federais.json');
  const i = 40;
  const d = f.itens.find((x) => x.id === String(100000 + i));
  let feitas = 0; for (let s = 0; s < SESSOES; s++) if (presente(i, s)) feitas++;
  const primeira = [...Array(SESSOES).keys()].find((s) => presente(i, s));
  assert.equal(d.desde, dSessao(primeira, 2023), 'a contagem começa na primeira presença da janela (2023)');
  const total = 4 * SESSOES - primeira;
  assert.equal(d.extra.sessoes[0], 4 * feitas); assert.equal(d.extra.sessoes[1], total);
  assert.equal(d.comp[0].s, Math.round(4 * feitas / total * 1000) / 10);
  const doVoto = (v) => ((i * 13 + v * 7) % 100) < perfil(i).vot;
  const desdeVot = [...Array(VOT_PLEN).keys()].filter((v) => dVot(v, 2023) >= dSessao(primeira, 2023));
  const votei = desdeVot.filter(doVoto).length + 3 * [...Array(VOT_PLEN).keys()].filter(doVoto).length;
  assert.equal(d.extra.votos[0], votei); assert.equal(d.extra.votos[1], desdeVot.length + 3 * VOT_PLEN);
  assert.equal(d.comp[1].s, Math.round(votei / (desdeVot.length + 3 * VOT_PLEN) * 1000) / 10);
  assert.equal(d.extra.gasto, 4 * 10 * perfil(i).gasto, 'soma da cota dos 4 anos');
  assert.match(d.comp[0].f, /desde \d\d\/\d\d\/2023/);
});

await caso('federais: requerimento não conta como projeto; cota usa valor menos glosa e ignora outro ano', () => {
  const f = lerSaida('federais.json');
  const c = COAUTOR - 100000;
  const dc = f.itens.find((x) => x.id === String(COAUTOR));
  const dataPL = (k, a) => `${a}-0${1 + (k % 9)}-10`;
  const dataDoPLcoautoria = (a) => String(propRows.find((r) => r[0] === primeiroPL[0])[2]).slice(0, 10).replace('2026', String(a));
  let esperado = 0;
  for (const a of ANOS) {
    esperado += Array.from({ length: perfil(c).proj }, (_, k) => dataPL(k, a)).filter((d) => d >= dc.desde).length;
    esperado += dataDoPLcoautoria(a) >= dc.desde ? 1 : 0;
  }
  assert.equal(dc.extra.projetos, esperado, 'conta os projetos próprios (a partir da primeira presença) mais o PL em coautoria, uma vez só por ano');
  assert.equal(dc.extra.gasto, 4 * 10 * perfil(c).gasto, 'o gasto lançado em outro ano não entra');
});

await caso('federais: licença e afastamento não contam contra o deputado (histórico oficial da Câmara)', () => {
  const f = lerSaida('federais.json');
  const i = 7;
  const d = f.itens.find((x) => x.id === String(100000 + i));
  const primeira = [...Array(SESSOES).keys()].find((s) => presente(i, s));
  // licença de 01/08/2023 até 01/12/2023: as sessões em que ele não compareceu nesse período saem da conta
  const fora = [...Array(SESSOES).keys()].filter((s) => dSessao(s, 2023) >= '2023-08-01' && dSessao(s, 2023) < '2023-12-01' && !presente(i, s)).length;
  assert.ok(fora > 0, 'o teste precisa ter faltas durante a licença');
  assert.equal(d.extra.licenca.sessoes, fora);
  assert.equal(d.extra.licenca.dias, 122);
  assert.equal(d.extra.sessoes[1], 4 * SESSOES - primeira - fora);
  assert.match(d.comp[0].f, /licenciado/);
  const outro = f.itens.find((x) => x.id === String(100000 + 40));
  assert.ok(!outro.extra.licenca, 'quem não se licenciou não tem a marca de licença');
});

await caso('TSE: só eleitos; 2º turno conta uma vez; DF sem municipais; estaduais e distritais', () => {
  const pr = lerSaida('prefeitos-SP.json');
  assert.equal(pr.itens.length, 5);
  assert.equal(pr.itens.filter((p) => p.nome === 'Prefeito Sp3').length, 1);
  assert.ok(pr.itens.every((p) => p.cod && p.municipio && p.partido));
  assert.ok(!existsSync(path.join(saida, 'prefeitos-DF.json')));
  const ve = lerSaida('vereadores-MG.json');
  assert.equal(ve.itens.length, 5 * 9);
  assert.ok(ve.itens.every((v) => /^Eleito/.test(v.situacao)));
  assert.equal(lerSaida('estaduais-DF.json').itens.length, 8);
  const g = lerSaida('governadores.json');
  assert.equal(g.total, 27);
  assert.equal(pr.itens[0].idade, 53);
});

await caso('TSE: acento e nome próprio', () => {
  const pr = lerSaida('prefeitos-RJ.json');
  const nomes = pr.itens.map((p) => p.municipio);
  assert.ok(nomes.includes('São Luís do Teste'), nomes.join(' | '));
  assert.ok(nomes.includes('Biritiba-Mirim'));
});

await caso('Tesouro: ligação município-ente (acento, apóstrofo, hífen) e nota igual à conta à mão', () => {
  const pr = lerSaida('prefeitos-SP.json');
  const mirim = pr.itens.find((p) => /Biritiba/.test(p.municipio));
  assert.ok(mirim.ibge, 'achou o ente do Tesouro');
  const id = mirim.ibge;
  if (!situacao(id).semDados) {
    const sp = scorePessoal(pessoalDe(id), 54), sd = scoreDivida(dividaDe(id), 120);
    const comp = Object.fromEntries(mirim.comp.map((c) => [c.k, c.s]));
    assert.equal(comp.pessoal, sp); assert.equal(comp.divida, sd);
    assert.equal(mirim.comp.length, 2, 'a nota usa só gasto com pessoal e dívida');
    assert.ok(!('entregas' in comp), 'relatórios entregues não entram mais na nota');
    assert.equal(mirim.nota, Math.round((sp * 60 + sd * 40) / 100 * 10) / 10);
    // os relatórios entregues continuam disponíveis, só como informação (aba Prestação de contas)
    const esp = situacao(id).semestral ? 9 : 10;
    assert.equal(mirim.contas.entregas.esperado, esp);
    assert.equal(mirim.contas.entregas.feitas, esp - (id % 11 === 0 ? 1 : 0));
    assert.equal(mirim.contas.pessoal, pessoalDe(id)); assert.equal(mirim.contas.limitePessoal, 54);
  }
});

await caso('Tesouro: cidade pequena com relatório semestral; RGF da Câmara de Vereadores não conta; sem dados = sem nota', () => {
  const todos = [];
  for (const uf of UFS) if (existsSync(path.join(saida, `prefeitos-${uf}.json`))) todos.push(...lerSaida(`prefeitos-${uf}.json`).itens);
  const semestral = todos.find((p) => p.ibge && situacao(p.ibge).semestral && p.contas && p.contas.entregas);
  assert.ok(semestral, 'existe município semestral no teste');
  assert.equal(semestral.contas.entregas.esperado, 9, 'cidade semestral deve 2 RGF, não 3; a Câmara de Vereadores não conta');
  assert.equal(semestral.contas.rgf, 'S2');
  const vazio = todos.find((p) => p.ibge && situacao(p.ibge).semDados);
  assert.ok(vazio && vazio.nota === null && vazio.rank === null && vazio.motivo, 'sem relatórios = sem nota, com motivo');
  assert.ok(todos.every((p) => p.nota == null || (p.nota >= 0 && p.nota <= 100)));
  const rk = lerSaida('ranking-prefeitos.json');
  assert.equal(rk.total, 130);
  assert.deepEqual(rk.itens.filter((i) => i.nota != null).map((i) => i.rank).sort((a, b) => a - b), rk.itens.filter((i) => i.nota != null).map((_, k) => k + 1));
});

await caso('governadores: estados achados pelo código do IBGE (no Tesouro o "uf" deles é BR); DF usa esfera D; limites de estado', () => {
  const g = lerSaida('governadores.json');
  assert.equal(g.comNota, g.itens.filter((x) => x.nota != null).length);
  assert.ok(g.itens.every((x) => x.ibge === CODIGO_IBGE_DO_ESTADO[x.uf]), 'cada governador ligado ao seu estado');
  assert.equal(g.comNota, 26, 'só o estado de teste sem relatórios (código 23) fica sem nota');
  const df = g.itens.find((x) => x.uf === 'DF');
  assert.ok(df && df.ibge === 53);
  const comp = df.comp.find((c) => c.k === 'pessoal');
  assert.ok(comp, 'DF com gasto de pessoal');
  assert.equal(comp.s, scorePessoal(pessoalDe(df.ibge), 49));
});

await caso('Tesouro: cidade pequena entrega o RGF Simplificado e ainda assim recebe nota', () => {
  const todos = [];
  for (const uf of UFS) if (existsSync(path.join(saida, `prefeitos-${uf}.json`))) todos.push(...lerSaida(`prefeitos-${uf}.json`).itens);
  const pequenas = todos.filter((p) => p.ibge && situacao(p.ibge).semestral && !situacao(p.ibge).semDados);
  assert.ok(pequenas.length > 5, 'há várias cidades semestrais no teste');
  assert.ok(pequenas.every((p) => p.nota != null && p.comp.length === 2), 'todas com nota e dois componentes');
  const p = pequenas[0];
  assert.equal(p.comp.find((c) => c.k === 'pessoal').s, scorePessoal(pessoalDe(p.ibge), 54));
});

await caso('Tesouro: nomes escritos diferente são ligados por semelhança; falhas passageiras são repassadas', () => {
  assert.equal(meta1.fontes.siconfi.pelaSemelhanca, 2);
  const rn = lerSaida('prefeitos-RN.json').itens.find((p) => p.cod === '01000');
  const pb = lerSaida('prefeitos-PB.json').itens.find((p) => p.cod === '01004');
  assert.equal(rn.ibge, codPorMun['RN0']); assert.equal(pb.ibge, codPorMun['PB4']);
  assert.equal(meta1.fontes.siconfi.comErro, 0, 'depois da segunda tentativa, nenhuma consulta ficou com erro');
  assert.ok(jaFalhou.size > 5, 'o teste simulou falhas passageiras');
  const todos = [];
  for (const uf of UFS) if (existsSync(path.join(saida, `prefeitos-${uf}.json`))) todos.push(...lerSaida(`prefeitos-${uf}.json`).itens);
  assert.ok(!todos.some((p) => /Não foi possível consultar/.test(p.motivo || '')));
});

await caso('ligação por nome parecido: não arrisca em empate, em nomes muito diferentes ou em prefeitura já ligada', () => {
  const idx = indexarEntes([
    { cod_ibge: 1, ente: 'Santa Teresinha', esfera: 'M', uf: 'BA' }, { cod_ibge: 2, ente: 'Santa Terezina', esfera: 'M', uf: 'BA' },
    { cod_ibge: 3, ente: 'Camacan', esfera: 'M', uf: 'BA' }, { cod_ibge: 4, ente: 'Açu', esfera: 'M', uf: 'RN' },
    { cod_ibge: 35, ente: 'São Paulo', esfera: 'E', uf: 'BR' }, { cod_ibge: 53, ente: 'Distrito Federal', esfera: 'D', uf: 'BR' }
  ]);
  assert.equal(idx.estados.get('SP').cod_ibge, 35); assert.equal(idx.estados.get('DF').cod_ibge, 53);
  assert.equal(idx.estados.has('BR'), false);
  assert.equal(acharMunicipioParecido(idx, 'BA', 'Camacã', new Set())?.cod_ibge, 3);
  assert.equal(acharMunicipioParecido(idx, 'RN', 'Assú', new Set())?.cod_ibge, 4);
  assert.equal(acharMunicipioParecido(idx, 'BA', 'Santa Terezinha', new Set()), null, 'dois candidatos a 1 letra: empate, não escolhe');
  assert.equal(acharMunicipioParecido(idx, 'BA', 'Camacã', new Set([3])), null, 'a prefeitura já está ligada a outro nome');
  assert.equal(acharMunicipioParecido(idx, 'BA', 'Pindorama', new Set()), null);
  assert.equal(acharMunicipioParecido(idx, 'SP', 'Camacã', new Set()), null, 'só procura no mesmo estado');
  assert.equal(distancia('ASSU', 'ACU'), 2);
});

await caso('destaques: maiores e menores de cada cargo', () => {
  const d = lerSaida('destaques.json');
  for (const c of ['federais', 'prefeitos', 'governadores']) {
    assert.ok(d[c].top.length > 0 && d[c].bottom.length > 0, c);
    assert.ok(d[c].top[0].nota >= d[c].bottom[0].nota);
    assert.ok(d[c].top.every((x, k, a) => k === 0 || a[k - 1].nota >= x.nota));
    assert.ok(d[c].bottom.every((x, k, a) => k === 0 || a[k - 1].nota <= x.nota));
  }
  assert.equal(d.federais.top[0].rank, 1);
  const m = lerSaida('metodo.json'); assert.equal(m.federais.componentes.length, 4);
});

await caso('Como votou?: votos.json com a lista de votações e uma linha de votos por deputado', () => {
  const f = lerSaida('federais.json');
  assert.ok(!('votos' in f), 'o federais.json (lido em toda abertura do site) não carrega os votos');
  const v = lerSaida('votos.json');
  assert.equal(v.votacoes.length, VOT_PLEN, 'só votações nominais do Plenário');
  assert.ok(v.votacoes.every((x, k, a) => k === 0 || a[k - 1].data >= x.data), 'mais recentes primeiro');
  const por = (id) => v.votacoes.findIndex((x) => x.id === id);
  assert.equal(v.votacoes[por('P0')].tipo, 'requerimento');
  assert.equal(v.votacoes[por('P1')].tipo, 'emenda');
  assert.equal(v.votacoes[por('P2')].tipo, 'principal');
  assert.equal(v.votacoes[por('P2')].aprovacao, 1); assert.equal(v.votacoes[por('P1')].aprovacao, 0);
  assert.equal(v.votacoes[por('P2')].materia, 'PL 102/2026');
  assert.match(v.votacoes[por('P2')].resumo, /Ementa/);
  assert.match(v.votacoes[por('P2')].fonte, /^https:\/\/dadosabertos\.camara\.leg\.br\//);
  // cada deputado tem uma letra por votação, na mesma ordem da lista
  assert.ok(Object.values(v.deputados).every((l) => l.length === VOT_PLEN));
  const i = 40;
  const linha = v.deputados[String(100000 + i)];
  for (let n = 0; n < VOT_PLEN; n++) {
    const idx = por('P' + n);
    const votou = ((i * 13 + n * 7) % 100) < perfil(i).vot;
    const letra = linha[idx];
    if (votou) assert.equal(letra, ['S', 'N', 'A'][(i + n) % 3], 'letra do voto registrado em P' + n);
    else assert.ok(letra === '-' || letra === '_', 'sem voto registrado: nunca inventa um voto (P' + n + ')');
  }
  assert.ok(/^-+$/.test(v.deputados['100502']), 'quem nunca apareceu não ganha nenhum voto');
  assert.ok(v.codigos.S === 'Sim' && v.codigos['-']);
});

await caso('histórico de mandatos: um arquivo por deputado; licença não conta como exercício; falha de um não derruba o resto', () => {
  assert.equal(meta1.fontes.historico.ok, true);
  assert.equal(meta1.fontes.historico.total, 513); assert.equal(meta1.fontes.historico.falhas, 1);
  assert.equal(readdirSync(path.join(saida, 'deputados')).length, 512, 'o deputado que falhou (id 100009) não ganha arquivo vazio');
  const d = (i) => JSON.parse(readFileSync(path.join(saida, 'deputados', `${100000 + i}.json`), 'utf-8'));
  const lic = d(7);
  assert.equal(lic.mandatos.length, 1); assert.equal(lic.mandatos[0].semAfastamento, false);
  assert.ok(lic.pausas.length === 1 && /Licença/.test(lic.pausas[0].motivo));
  const diasCorridos = Math.round((new Date('2026-11-18') - new Date('2023-02-01')) / 86400000);
  assert.equal(lic.diasTotais, diasCorridos - 122, 'dias de licença (01/08 a 01/12/2023) ficam de fora');
  const dois = d(3);
  assert.deepEqual(dois.mandatos.map((m) => m.leg), [55, 57], 'dois mandatos, de legislaturas diferentes');
  assert.equal(dois.mandatos[0].completo, true);
  assert.ok(dois.anosEfetivos > 3.9 + 3.5);
  assert.equal(dois.legislaturaAtual.leg, 57);
  assert.ok(d(3).direcao.some((x) => x.cargo === 'Presidente' && x.leg === 57), 'a Mesa Diretora vem da API');
  assert.equal(d(8).mandatos.length, 0, 'sem histórico publicado: arquivo vazio, não inventa mandato');
  assert.equal(d(5).ficha.gabinete.sala, '300');
  assert.ok(!JSON.stringify(d(5)).includes('cpf'));
});

await caso('correções: mudança de resultado, placar, texto ou voto de um deputado fica registrada, sem apagar nada', () => {
  const v = lerSaida('votos.json');
  const c1 = lerSaida('correcoes.json');
  assert.deepEqual(c1.itens, [], 'sem mudanças entre a primeira e a segunda leitura');
  const depois = JSON.parse(JSON.stringify(v));
  const k = depois.votacoes.findIndex((x) => x.id === 'P2');
  depois.votacoes[k].aprovacao = 0; depois.votacoes[k].nao = 999; depois.votacoes[k].titulo = 'Texto corrigido pela Câmara';
  const dep = Object.keys(depois.deputados)[10];
  const letras = depois.deputados[dep].split(''); letras[k] = letras[k] === 'S' ? 'N' : 'S'; depois.deputados[dep] = letras.join('');
  const velha = [{ em: '2026-01-01T00:00:00.000Z', votacao: 'ANTIGA', titulo: 'x', mudancas: [], votosIndividuaisAlterados: 1 }];
  const novas = registrarCorrecoes(v, depois, new Date('2026-12-01T00:00:00Z'), velha);
  assert.equal(novas.length, 2, 'o registro novo entra na frente e o antigo continua');
  assert.equal(novas[1].votacao, 'ANTIGA');
  assert.equal(novas[0].votacao, 'P2');
  assert.deepEqual(novas[0].mudancas.map((m) => m.campo).sort(), ['resultado oficial', 'texto oficial', 'votos Não'].sort());
  assert.equal(novas[0].votosIndividuaisAlterados, 1);
  // nova votação no topo da lista desloca os índices e NÃO pode ser confundida com mudança de voto
  const comNova = JSON.parse(JSON.stringify(v));
  comNova.votacoes.unshift({ id: 'NOVA', data: '2026-12-02', titulo: 'x', tipo: 'principal', aprovacao: 1, sim: 1, nao: 1, outros: 0 });
  for (const id of Object.keys(comNova.deputados)) comNova.deputados[id] = 'S' + comNova.deputados[id];
  assert.deepEqual(registrarCorrecoes(v, comNova, new Date('2026-12-02T00:00:00Z'), []), []);
});

if (process.env.COPIAR_DADOS) { cpSync(saida, process.env.COPIAR_DADOS, { recursive: true }); console.log('dados copiados para', process.env.COPIAR_DADOS); }


/* ---------- Gestões, séries por ano, IBGE e presidente ---------- */
const exec = (cod) => lerSaida(`executivos/${cod}.json`);
const escolherMun = (k) => { for (const uf of UFS.filter((u) => u !== 'DF')) { const id = codPorMun[`${uf}${k}`]; if (id % 11 !== 0) return { uf, id }; } };

await caso('perfil ampliado: as novas etapas terminam bem e gravam os arquivos', () => {
  for (const f of ['administracoes', 'ibge', 'presidente', 'series']) assert.equal(meta1.fontes[f].ok, true, f);
  assert.equal(meta1.fontes.administracoes.municipios, 130);
  assert.equal(meta1.fontes.administracoes.governadores, 27);
  assert.equal(meta1.fontes.administracoes.presidente, true);
  for (const f of ['administracoes-SP.json', 'administracoes-BR.json', 'indicadores.json', 'ibge-contexto.json', 'executivos/presidente.json', 'executivos/35.json']) assert.ok(existsSync(path.join(saida, f)), f);
  for (const a of [2022, 2023, 2024, 2025]) assert.ok(existsSync(path.join(saida, 'anos', `siconfi-${a}.json`)), `cache do Tesouro de ${a}`);
  assert.ok(!existsSync(path.join(saida, 'anos', 'siconfi-2026.json')), 'o ano em curso não é coletado');
});

await caso('CPF dos arquivos do TSE não aparece em nenhum arquivo publicado', () => {
  const todos = [];
  const andar = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) andar(f); else todos.push(f); } };
  andar(saida);
  const achou = todos.filter((f) => readFileSync(f, 'utf-8').includes(CPF_DE_TESTE));
  assert.deepEqual(achou, []);
});

await caso('prefeito: troca de gestor em 2024/2025 separa os anos por gestão', () => {
  const { id } = escolherMun(1);
  const d = exec(id);
  assert.deepEqual(d.gestoes.map((g) => g.nome), ['Prefeito Antigo Sp1', 'Prefeito Sp1'].map((n, i) => (d.gestoes[i].nome.startsWith('Prefeito Antigo') ? 'Prefeito Antigo ' + d.gestoes[i].nome.slice(-3) : 'Prefeito ' + d.gestoes[i].nome.slice(-3))));
  assert.deepEqual(d.gestoes.map((g) => [g.inicio, g.fim, g.situacao]), [['2021-01-01', '2024-12-31', 'encerrada'], ['2025-01-01', '2028-12-31', 'em exercício']]);
  assert.deepEqual(Object.keys(d.anos), ['2022', '2023', '2024', '2025', '2026']);
  for (const a of [2022, 2023, 2024]) assert.deepEqual([d.anos[a].atribuicao.tipo, d.anos[a].atribuicao.gestoes[0]], ['unica', 'g1'], String(a));
  assert.deepEqual([d.anos[2025].atribuicao.tipo, d.anos[2025].atribuicao.gestoes[0]], ['unica', 'g2']);
  assert.equal(d.anos[2022].mesesNaJanela, 2, 'de 2022 só novembro e dezembro estão no recorte de 48 meses');
  assert.equal(d.anos[2023].mesesNaJanela, 12);
  assert.equal(d.anos[2026].mesesNaJanela, 10);
  assert.equal(d.anos[2026].situacao, 'em-curso');
  assert.equal(d.janela.de, '2022-11-01');
  assert.match(d.aviso, /Trocas que não estejam/);
});

await caso('prefeito reeleito é uma gestão só (não é troca de gestor)', () => {
  const { id } = escolherMun(0);
  const d = exec(id);
  assert.equal(d.gestoes.length, 1);
  assert.deepEqual([d.gestoes[0].reeleito, d.gestoes[0].mandatos.length], [true, 2]);
  assert.ok([2022, 2023, 2024, 2025].every((a) => d.anos[a].atribuicao.gestoes[0] === 'g1'));
});

await caso('prefeito com troca no meio de 2026 (curadoria): 2026 fica dividido e o titular do TSE continua listado', () => {
  const id = codPorMun.SP2;
  if (id % 11 === 0) return;
  const d = exec(id);
  assert.equal(d.gestoes.length, 3);
  assert.deepEqual([d.gestoes[1].fim, d.gestoes[1].encerradaPor, d.gestoes[2].inicio, d.gestoes[2].origem], ['2026-04-01', 'renúncia', '2026-04-02', 'curadoria']);
  assert.equal(d.anos[2026].atribuicao.tipo, 'dividida');
  assert.equal(d.anos[2025].atribuicao.tipo, 'unica');
});

await caso('despesa por função: valores do Tesouro, só nível de função, empenhada ≠ paga, e calculados conferem', () => {
  const { id } = escolherMun(1);
  const a = exec(id).anos[2024];
  const base = baseDca(id, 2024);
  assert.equal(a.situacao, 'fechado');
  assert.deepEqual(Object.keys(a.f).sort(), Object.keys(SHARES).sort(), 'só as 7 funções do teste (subfunção e "FU.." ficam de fora)');
  assert.deepEqual(a.f['10'], [Math.round(base * 0.25 * 1.0), Math.round(base * 0.25 * 0.9), Math.round(base * 0.25 * 0.8)]);
  assert.deepEqual(a.total, [Math.round(base), Math.round(base * 0.9), Math.round(base * 0.8)]);
  assert.equal(a.pop, popDca(id, 2024));
  assert.deepEqual(a.d['10'], [Math.round(a.f['10'][2] / a.pop), 25]);
  assert.deepEqual(a.d.total, [Math.round(a.total[2] / a.pop), 100]);
  assert.equal(a.pessoal, pessoalDe(id));
  assert.equal(a.divida, dividaDe(id));
  assert.equal(exec(id).anos[2025].pessoal, pessoalDe(id), '2025 vem das contas que a rotina semanal já buscou');
});

await caso('ente sem balanço no Tesouro: "sem balanço", sem número inventado (nunca zero)', () => {
  const sem = [...entes.filter((e) => e.esfera === 'M' && e.cod_ibge % 11 === 0 && e.cod_ibge < 9000000)][0];
  const uf = sem.uf;
  const prefs = lerSaida(`prefeitos-${uf}.json`).itens.find((p) => p.ibge === sem.cod_ibge);
  assert.ok(prefs, 'município de teste achado');
  const a = exec(sem.cod_ibge).anos[2024];
  assert.equal(a.situacao, 'sem-balanco');
  assert.ok(!('f' in a) && !('total' in a) && !('d' in a));
});

await caso('IBGE: população, PIB e Censo 2022 entram no contexto; valor "-" do IBGE fica de fora', () => {
  const { id } = escolherMun(1);
  const c = exec(id).contexto;
  const e = entes.find((x) => x.cod_ibge === id);
  assert.deepEqual(c.populacao, { ano: 2025, valor: e.populacao + 2025 });
  assert.equal(c.pib.ano, 2023);
  assert.equal(c.pib.valor, e.populacao * 1000 + 2023);
  assert.equal(c.pib.porHabitante, Math.round((c.pib.valor * 1000) / (e.populacao + 2023)));
  assert.equal(c.censo.ano, 2022);
  assert.equal(c.censo.referencia, '2022-08-01');
  assert.equal(c.censo.agua, 50 + (id % 40) + 0.5);
  const semIbge = entes.find((x) => x.esfera === 'M' && x.cod_ibge % 97 === 0 && x.cod_ibge < 9000000 && x.cod_ibge % 11 !== 0);
  if (semIbge && existsSync(path.join(saida, `executivos/${semIbge.cod_ibge}.json`))) assert.ok(!('populacao' in exec(semIbge.cod_ibge).contexto));
});

await caso('governador: gestão de 2018, 2022, renúncia de 2026 (curadoria) e eleito de 2026 como futura', () => {
  const d = exec(35);
  assert.deepEqual(d.gestoes.map((g) => [g.nome, g.situacao]), [['Governador Antigo Sp', 'encerrada'], ['Governador Sp', 'encerrada'], ['Vice Sp', 'em exercício'], ['Governador Novo Sp', 'futura']]);
  assert.deepEqual(d.gestoes.map((g) => g.inicio), ['2019-01-01', '2023-01-01', '2026-04-04', '2027-01-01']);
  assert.equal(d.anos[2022].atribuicao.gestoes[0], 'g1', '2022 foi do governador eleito em 2018');
  assert.equal(d.anos[2025].atribuicao.gestoes[0], 'g2');
  assert.equal(d.anos[2026].atribuicao.tipo, 'dividida');
  assert.deepEqual(d.gestoes[2].divergencias, []);
  assert.equal(d.ente.esfera, 'E');
  assert.equal(exec(53).ente.esfera, 'D');
});

await caso('presidente: séries mensais por gestão (Nov-Dez/2022 são da gestão anterior)', () => {
  const d = exec('presidente');
  assert.deepEqual(d.gestoes.map((g) => [g.nome, g.inicio, g.situacao]), [['Presidente de 2018', '2019-01-01', 'encerrada'], ['Presidente de 2022', '2023-01-01', 'em exercício'], ['Presidente de 2026', '2027-01-01', 'futura']]);
  const ipca = d.indicadores['pres.ipca'];
  assert.equal(ipca.serie.length, 48);
  assert.equal(ipca.serie[0].p, '2022-11');
  assert.equal(ipca.serie[0].atribuicao.gestoes[0], 'g1');
  assert.equal(ipca.serie[2].p, '2023-01');
  assert.equal(ipca.serie[2].atribuicao.gestoes[0], 'g2');
  assert.equal(ipca.porGestao.g1.meses, 2);
  assert.equal(ipca.porGestao.g2.meses, 46);
  assert.equal(ipca.porGestao.g2.acumulado, Math.round((1.005 ** 46 - 1) * 10000) / 100);
  assert.ok(!ipca.porGestao.g3, 'gestão que ainda não começou não recebe número');
  const des = d.indicadores['pres.desocupacao'];
  assert.equal(des.ultimoMes, '2026-09', 'PNAD tem atraso: o último mês não é inventado');
  assert.equal(des.porGestao.g2.meses, 45);
  assert.equal(d.indicadores['pres.pib'], undefined, 'indicador pendente não vira série');
});

await caso('catálogo: cada indicador tem fonte, órgão, link e limitações; os não validados são "pendente" com a mensagem padrão', () => {
  const c = lerSaida('indicadores.json');
  assert.equal(c.msgNaoConfirmado, 'Dado não encontrado ou não confirmado');
  assert.ok(c.indicadores.length > 40);
  for (const i of c.indicadores) {
    assert.ok(i.fonte && i.orgao && i.url && i.limitacoes, `${i.id} sem fonte, órgão, link ou limitações`);
    assert.ok(['oficial', 'calculado', 'pendente'].includes(i.tipo), i.id);
    if (i.tipo === 'calculado') assert.ok(i.metodo, `${i.id} calculado sem método`);
    if (i.tipo === 'oficial' && i.id.startsWith('sanea.censo')) assert.equal(i.referencia, '2022-08-01');
  }
  assert.ok(c.indicadores.some((i) => i.tipo === 'pendente' && i.id === 'obras.federais'));
  const secoes = new Set(c.secoes.map((x) => x.id));
  assert.deepEqual(c.indicadores.filter((i) => !secoes.has(i.secao)).map((i) => i.id), [], 'toda aba usada pelo catálogo existe');
  assert.equal(new Set(c.indicadores.map((i) => i.id)).size, c.indicadores.length, 'sem indicador repetido');
  for (const sec of ['saneamento', 'saude', 'educacao', 'seguranca', 'infraestrutura', 'servicos']) assert.ok(c.indicadores.some((i) => i.secao === sec && i.tipo === 'oficial'), `a aba ${sec} tem ao menos um indicador oficial`);
  assert.ok(c.secoes.map((x) => x.titulo).join('|').startsWith('Visão geral|Serviços básicos|Saneamento|Saúde|Educação|Segurança|Infraestrutura|Obras|Economia|Orçamento|Transparência|Fontes'));
});

await caso('coleta com orçamento de tempo: para quando acaba, começa pelas maiores cidades e continua de onde parou', async () => {
  const guardado = {};
  const cache = { ler: (a) => guardado[a] || null, gravar: (a, o) => { guardado[a] = JSON.parse(JSON.stringify(o)); } };
  let t = 0;
  const json = async (url) => { t += 1000; return url.includes('/dca?') ? { items: [{ coluna: 'Despesas Pagas', conta: 'Despesas Exceto Intraorçamentárias', valor: 10, populacao: 5 }] } : { items: [] }; };
  const pequenas = [{ cod_ibge: 1, esfera: 'M', populacao: 10 }, { cod_ibge: 2, esfera: 'M', populacao: 900 }, { cod_ibge: 3, esfera: 'M', populacao: 50 }];
  const base = { json, entes: pequenas, anos: [2025], cache, hoje: new Date('2026-11-18T12:00:00Z'), paralelo: 1, relogio: () => t };
  const r1 = await coletarSeries({ ...base, orcamentoMs: 2500 });
  assert.equal(r1.parouPorTempo, true);
  assert.deepEqual(Object.keys(guardado[2025].itens), ['2'], 'a maior cidade vem primeiro e o progresso é gravado');
  const r2 = await coletarSeries({ ...base, orcamentoMs: 1e9 });
  assert.equal(r2.parouPorTempo, false);
  assert.deepEqual(Object.keys(guardado[2025].itens).sort(), ['1', '2', '3']);
  assert.equal(r2.feitos, 2, 'não refez a que já estava pronta');
  assert.equal(r2.pendentes[2025], 0, 'sem relatório fiscal (RGF), mas visto hoje: só volta a ser revisto depois de 7 dias');
  const r3 = await coletarSeries({ ...base, hoje: new Date('2026-11-26T12:00:00Z'), orcamentoMs: 1e9 });
  assert.equal(r3.feitos, 3, 'uma semana depois, a entrega atrasada de um ano recente é procurada de novo');
});

await caso('quando buscar de novo: erro sempre, ano recente incompleto só depois de 7 dias, ano antigo sem balanço nunca', () => {
  const h = new Date('2026-11-18T12:00:00Z');
  const ok = { em: '2026-11-17', dca: 1, rgfOk: 1 };
  assert.equal(precisaBuscar(undefined, 2025, h), true);
  assert.equal(precisaBuscar({ erro: 'x', em: '2026-11-17' }, 2022, h), true);
  assert.equal(precisaBuscar(ok, 2025, h), false);
  assert.equal(precisaBuscar({ ...ok, dca: 0 }, 2025, h), false, 'viu ontem: espera');
  assert.equal(precisaBuscar({ ...ok, dca: 0, em: '2026-11-01' }, 2025, h), true, 'entrega atrasada pode ter chegado');
  assert.equal(precisaBuscar({ ...ok, dca: 0, em: '2026-01-01' }, 2022, h), false, 'ano antigo sem balanço não passa a ter');
  assert.equal(extrairDca([]), null);
});

/* ---------- 2ª rodada: só a Câmara (as fontes pesadas estão frescas) ---------- */
const dcaAntes = { ...chamadasDca.porAno };
const errosAntes = Object.values(JSON.parse(readFileSync(path.join(saida, 'anos', 'siconfi-2025.json'), 'utf-8')).itens).filter((r) => r.erro).length;
const antesRgf = chamadasSiconfi.rgf;
const lidosAntes = lidos.length;
const metaB = await atualizar({ fontes, baixarZip: async () => { throw new Error('não devia baixar o TSE'); }, saida, hoje: new Date('2026-11-19T12:00:00Z'), log });
await caso('2ª rodada no dia seguinte: atualiza só a Câmara e mantém o resto', () => {
  assert.ok(chamadasSiconfi.rgf - antesRgf <= errosAntes * 4, 'só as prefeituras que deram erro na véspera foram consultadas de novo no Tesouro');
  assert.equal(metaB.fontes.tse.atualizadoEm, meta1.fontes.tse.atualizadoEm);
  assert.notEqual(metaB.fontes.camara.atualizadoEm, meta1.fontes.camara.atualizadoEm);
  assert.ok(metaB.cargos.prefeitos.comNota > 0, 'mantém as notas de prefeitos');
});

await caso('2ª rodada: anos de contas já completos não são buscados de novo no Tesouro', () => {
  for (const a of [2022, 2023, 2024]) assert.equal(chamadasDca.porAno[a], dcaAntes[a], `${a}: nenhuma consulta nova de balanço anual`);
  assert.equal(chamadasDca.porAno[2025] - dcaAntes[2025], errosAntes, '2025: só as consultas que haviam falhado são refeitas');
  assert.ok(errosAntes > 0 && errosAntes < 50, 'o teste tem falhas permanentes de propósito');
  assert.equal(metaB.fontes.administracoes.atualizadoEm, meta1.fontes.administracoes.atualizadoEm, 'gestões só mudam na rotina semanal');
  assert.equal(metaB.fontes.series.ok, true);
});

await caso('anos fechados ficam guardados: no dia seguinte só o ano em curso é lido da Câmara', () => {
  for (const a of [2023, 2024, 2025]) assert.ok(existsSync(path.join(saida, 'anos', `federais-${a}.json`)), `resumo de ${a} guardado`);
  assert.ok(!existsSync(path.join(saida, 'anos', 'federais-2026.json')), 'o ano em curso nunca é guardado como fechado');
  const novos = lidos.slice(lidosAntes);
  assert.ok(novos.length > 0 && novos.every((u) => u.includes('-2026.csv')), 'leu só os arquivos de 2026: ' + novos.filter((u) => !u.includes('-2026.csv')).join(', '));
  const f = lerSaida('federais.json');
  assert.equal(f.sessoes, 4 * SESSOES);
  assert.equal(metaB.fontes.camara.janela.de, 2023);
});

await caso('cache de ano fechado: resumo gerado antes do fim do ano ou em formato antigo é refeito', async () => {
  const guardados = {};
  const cache = { ler: (a) => guardados[a] || null, gravar: (a, o) => { guardados[a] = o; } };
  const base = { fontes, ano: 2026, hoje: new Date('2026-11-18T12:00:00Z'), cache };
  await gerarFederais(base);
  assert.deepEqual(Object.keys(guardados).sort(), ['2023', '2024', '2025']);
  assert.equal(guardados[2025].sessoes.length, SESSOES);
  let n = lidos.length;
  await gerarFederais(base);
  assert.equal(lidos.slice(n).filter((u) => !u.includes('-2026.csv')).length, 0, 'segunda vez não lê os anos fechados');
  guardados[2025] = { ...guardados[2025], geradoEm: '2025-12-30T10:00:00Z' }; // gerado ainda em 2025: o ano podia não estar fechado
  guardados[2024] = { ...guardados[2024], versao: 0 };
  n = lidos.length;
  await gerarFederais(base);
  const refeitos = new Set(lidos.slice(n).filter((u) => !u.includes('-2026.csv')).map((u) => u.match(/-(\d{4})\.csv/)[1]));
  assert.deepEqual([...refeitos].sort(), ['2024', '2025']);
  n = lidos.length;
  await gerarFederais({ ...base, usarCache: false });
  assert.equal(new Set(lidos.slice(n).map((u) => u.match(/-(\d{4})\.csv/)[1])).size, 4, '"refazer tudo" lê os 4 anos de novo');
});

/* ---------- 3ª rodada: Câmara falha, sete dias depois o Tesouro falha ---------- */
const fontesRuins = { ...fontes, texto: async () => { throw new Error('API fora do ar'); } };
const metaC = await atualizar({ fontes: fontesRuins, baixarZip, saida, hoje: new Date('2026-11-20T12:00:00Z'), log });
await caso('falha da Câmara: marca o erro e mantém o arquivo anterior', () => {
  assert.equal(metaC.fontes.camara.ok, false);
  assert.match(metaC.fontes.camara.erro, /fora do ar/);
  assert.ok(existsSync(path.join(saida, 'federais.json')));
  assert.equal(lerSaida('federais.json').total, 513);
});

const fontesSemTesouro = { ...fontes, json: async (url) => { if (url.includes('apidatalake')) throw new Error('Tesouro fora do ar'); return fontes.json(url); } };
const metaD = await atualizar({ fontes: fontesSemTesouro, baixarZip, saida, hoje: new Date('2026-12-01T12:00:00Z'), log });
await caso('falha do Tesouro depois de 7 dias: mantém as notas de prefeitos que já existiam', () => {
  assert.equal(metaD.fontes.siconfi.ok, false);
  const rk = lerSaida('ranking-prefeitos.json');
  assert.ok(rk.comNota > 0, 'as notas anteriores continuam lá');
});

/* ---------- 5ª rodada: janeiro de 2027, governadores novos tomam posse ---------- */
console.log('Simulando janeiro de 2027 (governadores eleitos em 2026 tomam posse)...');
const metaE = await atualizar({ fontes, baixarZip, saida, hoje: new Date('2027-01-10T12:00:00Z'), log });
await caso('2027: governadores vêm da eleição de 2026 e ficam sem nota (contas são do governo anterior)', () => {
  assert.equal(metaE.fontes.tse.ok, true);
  assert.deepEqual(metaE.fontes.tse.eleicoes, { municipal: 2024, governadores: 2026, estaduais: 2022 });
  const g = lerSaida('governadores.json');
  assert.equal(g.ano, 2026);
  assert.ok(g.itens.every((x) => /Novo/.test(x.nome)), 'lista nova');
  assert.equal(g.comNota, 0);
  assert.match(g.itens[0].motivo, /mandato começou em 2027/);
  assert.equal(lerSaida('estaduais-SP.json').ano, 2022, 'deputados estaduais só trocam em fevereiro');
  const pr = lerSaida('prefeitos-SP.json');
  assert.equal(pr.ano, 2024);
  assert.equal(pr.exercicio, 2025, 'em janeiro usa o ano anterior ao último');
  assert.ok(pr.itens.some((p) => p.nota != null), 'prefeitos eleitos em 2024 já têm contas de 2025');
});

console.log(falhas ? `\n${falhas} TESTE(S) FALHARAM` : '\nTUDO OK');
console.log('arquivos gerados:', readdirSync(saida).length);
process.exit(falhas ? 1 : 0);
