// Teste da rotina de atualização com um "Brasil de mentira" (sem internet).
// Rodar:  node scripts/teste/rodar-teste.mjs
// Usa os mesmos nomes de colunas e formatos que conferi nas fontes reais.

import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { atualizar, exercicioDoTesouro, registrarCorrecoes } from '../atualizar.mjs';
import { UFS } from '../tse.mjs';
import { scorePessoal, scoreDivida } from '../nota.mjs';
import { indexarEntes, acharMunicipioParecido, distancia } from '../siconfi.mjs';

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
const zip2024 = fazerZip('consulta_cand_2024.zip', Object.fromEntries(UFS.filter((u) => u !== 'DF').map((u) => [`consulta_cand_2024_${u}.csv`, csvMunicipal(u)])));
const zip2022 = fazerZip('consulta_cand_2022.zip', Object.fromEntries(UFS.map((u) => [`consulta_cand_2022_${u}.csv`, csvGeral(u)])));
const zip2026 = fazerZip('consulta_cand_2026.zip', Object.fromEntries(UFS.map((u) => [`consulta_cand_2026_${u}.csv`, csvGeral(u).replace(/GOVERNADOR /g, 'GOVERNADOR NOVO ')])));

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
    if (url.includes('apidatalake')) return respostaSiconfi(url);
    throw new Error('HTTP 404 em ' + url);
  },
  texto: async (url) => { if (!(url in arquivosTexto)) throw new Error('HTTP 404 em ' + url); return arquivosTexto[url]; },
  cotas: async () => cotas
};
const baixarZip = async (url) => (url.includes('_2024') ? zip2024 : url.includes('_2026') ? zip2026 : zip2022);
const lerSaida = (n) => JSON.parse(readFileSync(path.join(saida, n), 'utf-8'));
const logs = [];
const log = (m) => { logs.push(m); if (process.env.VERBOSO) console.log("  [log]", m); };

/* ---------- 1ª rodada: tudo ---------- */
console.log('Rodando a atualização completa com dados de mentira...');
const meta1 = await atualizar({ fontes, baixarZip, saida, hoje, log });

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
  assert.equal(f.sessoes, SESSOES, 'conta só sessão deliberativa de Plenário encerrada');
  assert.equal(f.votacoes, VOT_PLEN, 'conta só votação nominal do Plenário (ignora comissão e simbólica)');
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
  assert.ok(por(501).nota != null && por(501).obs && /Primeira presença/.test(por(501).obs));
  assert.equal(por(502).nota, null); assert.match(por(502).motivo, /Sem presença/);
});

await caso('federais: presença e votos batem com a conta feita à mão', () => {
  const f = lerSaida('federais.json');
  const i = 40;
  const d = f.itens.find((x) => x.id === String(100000 + i));
  let feitas = 0; for (let s = 0; s < SESSOES; s++) if (presente(i, s)) feitas++;
  const primeira = [...Array(SESSOES).keys()].find((s) => presente(i, s));
  const total = SESSOES - primeira;
  assert.equal(d.comp[0].s, Math.round(feitas / total * 1000) / 10);
  const desdeVot = [...Array(VOT_PLEN).keys()].filter((v) => dataVot(v) >= dataSessao(primeira));
  const votei = desdeVot.filter((v) => ((i * 13 + v * 7) % 100) < perfil(i).vot).length;
  assert.equal(d.comp[1].s, Math.round(votei / desdeVot.length * 1000) / 10);
  assert.equal(d.extra.gasto, Math.round(10 * (perfil(i).gasto + 100 - 100)) );
});

await caso('federais: requerimento não conta como projeto; cota usa valor menos glosa e ignora outro ano', () => {
  const f = lerSaida('federais.json');
  const c = COAUTOR - 100000;
  const dc = f.itens.find((x) => x.id === String(COAUTOR));
  const dataPL = (k) => `2026-0${1 + (k % 9)}-10`;
  const meus = Array.from({ length: perfil(c).proj }, (_, k) => dataPL(k)).filter((d) => d >= dc.desde).length;
  const dataDoPLcoautoria = String(propRows.find((r) => r[0] === primeiroPL[0])[2]).slice(0, 10);
  assert.equal(dc.extra.projetos, meus + (dataDoPLcoautoria >= dc.desde ? 1 : 0), 'conta os projetos próprios (a partir da primeira presença) mais o PL em coautoria, uma vez só');
  assert.equal(dc.extra.gasto, 10 * perfil(c).gasto, 'o gasto de 2025 não entra');
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

/* ---------- 2ª rodada: só a Câmara (as fontes pesadas estão frescas) ---------- */
const antesRgf = chamadasSiconfi.rgf;
const metaB = await atualizar({ fontes, baixarZip: async () => { throw new Error('não devia baixar o TSE'); }, saida, hoje: new Date('2026-11-19T12:00:00Z'), log });
await caso('2ª rodada no dia seguinte: atualiza só a Câmara e mantém o resto', () => {
  assert.equal(chamadasSiconfi.rgf, antesRgf, 'não consultou o Tesouro de novo');
  assert.equal(metaB.fontes.tse.atualizadoEm, meta1.fontes.tse.atualizadoEm);
  assert.notEqual(metaB.fontes.camara.atualizadoEm, meta1.fontes.camara.atualizadoEm);
  assert.ok(metaB.cargos.prefeitos.comNota > 0, 'mantém as notas de prefeitos');
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
