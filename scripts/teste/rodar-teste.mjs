// Teste da rotina de atualização com um "Brasil de mentira" (sem internet).
// Rodar:  node scripts/teste/rodar-teste.mjs
// Usa os mesmos nomes de colunas e formatos que conferi nas fontes reais.

import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { atualizar, exercicioDoTesouro } from '../atualizar.mjs';
import { UFS } from '../tse.mjs';
import { scorePessoal, scoreDivida } from '../nota.mjs';

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
const votacoes = csv(['id', 'uri', 'data', 'siglaOrgao', 'descricao'], [
  ...Array.from({ length: VOT_PLEN }, (_, v) => [`P${v}`, '', dataVot(v), 'PLEN', 'Sim: 300; Não: 100']),
  ...Array.from({ length: 5 }, (_, v) => [`C${v}`, '', '2026-04-01', 'CCJC', 'Votação de comissão']),
  ...Array.from({ length: 3 }, (_, v) => [`Z${v}`, '', '2026-05-01', 'PLEN', 'Votação simbólica'])
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
for (const uf of UFS.filter((u) => u !== 'DF')) {
  NOMES_MUN.forEach((m, k) => {
    const nomeEnte = m.toLowerCase().replace(/(^|[\s-])\S/g, (x) => x.toUpperCase()).replace(' Do ', ' do ').replace(' D’', ' d’');
    const e = { cod_ibge: ++codIbge, ente: nomeEnte.replace("D'oeste", "d'Oeste"), esfera: 'M', uf, populacao: 1000 * (k + 1) };
    entes.push(e); codPorMun[`${uf}${k}`] = e.cod_ibge;
  });
}
UFS.forEach((uf, k) => entes.push({ cod_ibge: 10 + k, ente: 'Estado ' + uf, esfera: uf === 'DF' ? 'D' : 'E', uf, populacao: 1e6 }));
for (let k = 0; k < 5000; k++) entes.push({ cod_ibge: 9000000 + k, ente: 'Enchimento ' + k, esfera: 'M', uf: UFS[k % 26], populacao: 500 });
entes.push({ cod_ibge: 1, ente: 'União', esfera: 'U', uf: 'BR', populacao: 2e8 });
const chamadasSiconfi = { rgf: 0, extrato: 0 };
const situacao = (id) => ({ semDados: id % 23 === 0, semestral: id % 7 === 0 && id % 23 !== 0 });
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
    if (s.semDados) return { items: [] };
    const per = p.get('in_periodicidade');
    if (s.semestral !== (per === 'S')) return { items: [] };
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
    const nRgf = s.semestral ? 2 : 3;
    for (let q = 1; q <= nRgf; q++) {
      itens.push({ instituicao: inst, entregavel: 'Relatório de Gestão Fiscal', periodicidade: s.semestral ? 'S' : 'Q', periodo: q, status_relatorio: 'HO' });
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
const fontes = {
  json: async (url) => {
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
    const esp = situacao(id).semestral ? 9 : 10;
    const feitas = esp - (id % 11 === 0 ? 1 : 0);
    assert.equal(comp.entregas, Math.round(feitas / esp * 1000) / 10);
    assert.equal(mirim.nota, Math.round((sp * 40 + sd * 30 + comp.entregas * 30) / 100 * 10) / 10);
  }
});

await caso('Tesouro: cidade pequena com relatório semestral; RGF da Câmara de Vereadores não conta; sem dados = sem nota', () => {
  const todos = [];
  for (const uf of UFS) if (existsSync(path.join(saida, `prefeitos-${uf}.json`))) todos.push(...lerSaida(`prefeitos-${uf}.json`).itens);
  const semestral = todos.find((p) => p.ibge && situacao(p.ibge).semestral && p.comp.some((c) => c.k === 'entregas'));
  assert.ok(semestral, 'existe município semestral no teste');
  assert.match(semestral.comp.find((c) => c.k === 'entregas').f, /de 9 relatórios|dos 9 relatórios/);
  const vazio = todos.find((p) => p.ibge && situacao(p.ibge).semDados);
  assert.ok(vazio && vazio.nota === null && vazio.rank === null && vazio.motivo, 'sem relatórios = sem nota, com motivo');
  assert.ok(todos.every((p) => p.nota == null || (p.nota >= 0 && p.nota <= 100)));
  const rk = lerSaida('ranking-prefeitos.json');
  assert.equal(rk.total, 130);
  assert.deepEqual(rk.itens.filter((i) => i.nota != null).map((i) => i.rank).sort((a, b) => a - b), rk.itens.filter((i) => i.nota != null).map((_, k) => k + 1));
});

await caso('governadores: 27 com nota; DF usa esfera D; limites de estado', () => {
  const g = lerSaida('governadores.json');
  assert.equal(g.comNota, g.itens.filter((x) => x.nota != null).length);
  const df = g.itens.find((x) => x.uf === 'DF');
  assert.ok(df && df.ibge);
  const comp = df.comp.find((c) => c.k === 'pessoal');
  if (comp) assert.equal(comp.s, scorePessoal(pessoalDe(df.ibge), 49));
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
