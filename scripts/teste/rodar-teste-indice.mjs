// Teste do Índice de serviços públicos (governadores e prefeitos) e da coleta de segurança (Sinesp).
// Sem internet: planilhas .xlsx, resposta do portal de dados e arquivos de cidades montados aqui, com números inventados.
// Rodar:  node scripts/teste/rodar-teste-indice.mjs

import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { METODO } from '../nota.mjs';
import { janelaDe48Meses } from '../administracoes.mjs';
import { lerSegurancaDasAbas, juntarSeguranca, taxaPor100mil, descobrirArquivos, atualizarSeguranca, ufDe, mesDe } from '../seguranca.mjs';
import { lerPlanilhas } from '../precos.mjs';
import { notaPresidente } from '../indicadores.mjs';
import { numeroBR, decodificar, lerDespesasAlesp, ligarNomes, calcularEstaduais, lerAlesp, atualizarEstaduais, ALESP, anosDaJanelaEstadual } from '../estaduais.mjs';
import { valoresDoEnte, calcularIndices, atribuicaoDosAnos, atualizarIndices, herdarIndice } from '../indice-gestao.mjs';

let falhas = 0;
async function caso(nome, fn) { try { await fn(); console.log('ok:', nome); } catch (e) { falhas++; console.log('FALHOU:', nome, '\n   ', (process.env.DETALHE ? e.stack : e.message.split('\n')[0])); } }
const tmp = mkdtempSync(path.join(os.tmpdir(), 'placar-indice-'));
const hoje = new Date('2026-11-18T12:00:00Z');
const janela = janelaDe48Meses(hoje); // 2022-11-01 a 2026-10-31

/* ---------- xlsx de teste (várias abas) ---------- */
const tabelaCrc = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = tabelaCrc[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function fazerZip(arquivos) {
  const locais = [], centrais = [];
  let off = 0;
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const bruto = Buffer.from(conteudo, 'utf8');
    const comp = deflateRawSync(bruto);
    const n = Buffer.from(nome, 'utf8');
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc32(bruto), 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(bruto.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc32(bruto), 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(bruto.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    locais.push(lh, n, comp); centrais.push(ch, n);
    off += 30 + n.length + comp.length;
  }
  const dir = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(Object.keys(arquivos).length, 8); fim.writeUInt16LE(Object.keys(arquivos).length, 10);
  fim.writeUInt32LE(dir.length, 12); fim.writeUInt32LE(off, 16);
  return Buffer.concat([...locais, dir, fim]);
}
const colunas = 'ABCDEFGHIJKLMNOPQR';
const xml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
/** abas: [{ nome, linhas: [[...]] }]; texto -> string, número -> number. */
function fazerXlsx(abas) {
  const textos = [];
  const idx = (t) => { let i = textos.indexOf(t); if (i < 0) { textos.push(t); i = textos.length - 1; } return i; };
  const arquivos = {
    '[Content_Types].xml': '<Types/>',
    'xl/workbook.xml': `<?xml version="1.0"?><workbook><sheets>${abas.map((a, k) => `<sheet name="${xml(a.nome)}" sheetId="${k + 1}" r:id="rId${k + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0"?><Relationships>${abas.map((a, k) => `<Relationship Id="rId${k + 1}" Target="worksheets/sheet${k + 1}.xml"/>`).join('')}</Relationships>`
  };
  abas.forEach((a, k) => {
    const rows = a.linhas.map((l, i) => `<row r="${i + 1}">${l.map((v, c) => typeof v === 'number' ? `<c r="${colunas[c]}${i + 1}"><v>${v}</v></c>` : `<c r="${colunas[c]}${i + 1}" t="s"><v>${idx(v)}</v></c>`).join('')}</row>`).join('');
    arquivos[`xl/worksheets/sheet${k + 1}.xml`] = `<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`;
  });
  arquivos['xl/sharedStrings.xml'] = `<?xml version="1.0"?><sst>${textos.map((t) => `<si><t>${xml(t)}</t></si>`).join('')}</sst>`;
  return fazerZip(arquivos);
}
const UFS_TODAS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const CAB = ['UF', 'Tipo Crime', 'Ano', 'Mês', 'Total Vítima', 'Ocorrências'];
const MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** Uma aba com a UF numa coluna: homicídio (vítimas 10 e ocorrências 8 por mês), roubo de veículo (ocorrências 50) e ruídos. */
function abaDaUf(uf, anos, mesesPorAno = {}) {
  const linhas = [CAB];
  for (const ano of anos) {
    for (let m = 1; m <= (mesesPorAno[ano] ?? 12); m++) {
      linhas.push([uf, 'Homicídio doloso', ano, MESES_NOME[m - 1], 10, 8]);
      linhas.push([uf, 'Roubo de veículo', ano, MESES_NOME[m - 1], 55, 50]);
      linhas.push([uf, 'Tentativa de homicídio', ano, MESES_NOME[m - 1], 999, 999]);
      linhas.push([uf, 'Feminicídio', ano, MESES_NOME[m - 1], 999, 999]);
      linhas.push([uf, 'Furto de veículo', ano, MESES_NOME[m - 1], 999, 999]);
    }
  }
  return { nome: 'Dados', linhas };
}

/* ============================ segurança (Sinesp) ============================ */

await caso('Sinesp: reconhece UF por sigla ou nome e mês por nome, número ou data', () => {
  assert.equal(ufDe('São Paulo'), 'SP'); assert.equal(ufDe('sp'), 'SP'); assert.equal(ufDe('Distrito Federal'), 'DF'); assert.equal(ufDe('Atlantida'), null);
  assert.equal(mesDe('Março'), 3); assert.equal(mesDe('mar'), 3); assert.equal(mesDe('07'), 7); assert.equal(mesDe(12), 12); assert.equal(mesDe('2023-04-01'), 4); assert.equal(mesDe('13'), null);
});

await caso('Sinesp: lê homicídio doloso (vítimas) e roubo de veículo (ocorrências); ignora tentativa, feminicídio e furto', () => {
  const r = lerSegurancaDasAbas(lerPlanilhas(fazerXlsx([abaDaUf('SP', [2023])])));
  assert.equal(r.abasLidas, 1);
  const sp = r.dados.SP;
  assert.deepEqual(Object.keys(sp).sort(), ['homicidio', 'rouboVeiculo']);
  assert.deepEqual(Object.keys(sp.homicidio[2023]).length, 12);
  assert.equal(sp.homicidio[2023][1], 10, 'vítimas, não ocorrências');
  assert.equal(sp.rouboVeiculo[2023][5], 50, 'ocorrências, não vítimas');
});

await caso('Sinesp: UF no nome da aba; linhas do mesmo mês (por sexo, por faixa) somam; cabeçalho depois de linhas de título', () => {
  const abas = [{ nome: 'Rio de Janeiro', linhas: [['Fonte: Ministério'], [''], ['Tipo Crime', 'Ano', 'Mês', 'Total Vítima'],
    ['Homicídio doloso', 2024, 'Jan', 4], ['Homicídio doloso', 2024, 'Jan', 6], ['Homicídio doloso', 2024, 'Fev', 3]] }];
  const r = lerSegurancaDasAbas(lerPlanilhas(fazerXlsx(abas)));
  assert.deepEqual(r.dados.RJ.homicidio[2024], { 1: 10, 2: 3 });
});

await caso('Sinesp: formato irreconhecível devolve motivo e nenhuma linha (nunca inventa)', () => {
  const r = lerSegurancaDasAbas(lerPlanilhas(fazerXlsx([{ nome: 'x', linhas: [['A', 'B'], ['1', '2']] }])));
  assert.equal(r.linhasUsadas, 0); assert.match(r.motivo, /sem colunas de ano, mês e tipo de crime/);
});

await caso('Sinesp: só conta o ano com os 12 meses; taxa por 100 mil usa a média dos anos completos', () => {
  const r = lerSegurancaDasAbas(lerPlanilhas(fazerXlsx([abaDaUf('SP', [2023, 2024, 2025], { 2025: 8 })])));
  const uf = juntarSeguranca([r.dados]);
  assert.deepEqual(uf.SP.homicidio[2023], { meses: 12, total: 120 });
  assert.equal(uf.SP.homicidio[2025].meses, 8);
  const t = taxaPor100mil(uf.SP.homicidio, 1000000, 2023, 2025);
  assert.deepEqual(t.anos, [2023, 2024], '2025 tem só 8 meses e fica de fora');
  assert.equal(t.valor, 12, '120 vítimas por ano em 1 milhão de habitantes = 12 por 100 mil');
  assert.equal(taxaPor100mil(uf.SP.homicidio, null, 2023, 2025), null, 'sem população não calcula');
  assert.equal(taxaPor100mil(uf.SP.homicidio, 1e6, 2026, 2026), null, 'sem ano completo no período não calcula');
  assert.equal(taxaPor100mil(undefined, 1e6, 2023, 2025), null);
});

await caso('Sinesp: arquivo mais novo vence o mais antigo quando os dois têm o mesmo ano completo', () => {
  const velho = lerSegurancaDasAbas(lerPlanilhas(fazerXlsx([abaDaUf('SP', [2023])]))).dados;
  const novo = lerSegurancaDasAbas(lerPlanilhas(fazerXlsx([{ nome: 'Dados', linhas: [CAB, ...Array.from({ length: 12 }, (_, m) => ['SP', 'Homicídio doloso', 2023, m + 1, 20, 20])] }]))).dados;
  assert.equal(juntarSeguranca([velho, novo]).SP.homicidio[2023].total, 240);
});

const pacotesCkan = { result: { results: [
  { metadata_modified: '2024-02-01', resources: [
    { name: 'Indicadores de Segurança Pública - UF (2015 a 2023)', format: 'XLSX', url: 'https://x/uf-antigo.xlsx', last_modified: '2023-09-21' },
    { name: 'Indicadores de Segurança Pública - Município', format: 'XLSX', url: 'https://x/municipio.xlsx', last_modified: '2025-01-01' },
    { name: 'Dicionário de dados', format: 'PDF', url: 'https://x/dicionario.pdf' } ] },
  { metadata_modified: '2025-06-01', resources: [
    { name: 'Dados Nacionais de Segurança Pública - UF', format: 'XLSX', url: 'https://x/uf-novo.xlsx', last_modified: '2025-06-01' },
    { name: 'Dados Nacionais de Segurança Pública - UF', format: 'XLSX', url: 'https://x/uf-novo.xlsx', last_modified: '2025-06-01' } ] }
] } };

await caso('Sinesp: procura no portal as planilhas por UF, ignora município e PDF, sem repetir, mais novas primeiro', async () => {
  const urls = [];
  const a = await descobrirArquivos(async (u) => { urls.push(u); return pacotesCkan; });
  assert.match(urls[0], /dados\.mj\.gov\.br\/api\/3\/action\/package_search/);
  assert.deepEqual(a.map((x) => x.url), ['https://x/uf-novo.xlsx', 'https://x/uf-antigo.xlsx']);
  await assert.rejects(() => descobrirArquivos(async () => ({ result: { results: [] } })), /não devolveu nenhum conjunto/);
});

function binarioDeTeste(anosPorArquivo, ufs = UFS_TODAS) {
  return async (url) => {
    const anos = anosPorArquivo[url];
    if (!anos) throw new Error('HTTP 404 em ' + url);
    return fazerXlsx(ufs.map((uf) => abaDaUf(uf, anos)));
  };
}

await caso('Sinesp: coleta completa grava anos/seguranca.json com fonte e arquivos; arquivo novo e antigo se completam', async () => {
  const pasta = path.join(tmp, 'seg1');
  const r = await atualizarSeguranca({ json: async () => pacotesCkan, binario: binarioDeTeste({ 'https://x/uf-novo.xlsx': [2024, 2025], 'https://x/uf-antigo.xlsx': [2021, 2022, 2023] }), pasta, hoje });
  assert.equal(r.ok, true); assert.equal(r.ufs, 27); assert.equal(r.arquivos, 2);
  const j = JSON.parse(readFileSync(path.join(pasta, 'anos', 'seguranca.json'), 'utf-8'));
  assert.match(j.fonte, /Ministério da Justiça/); assert.match(j.pagina, /dados\.mj\.gov\.br/);
  assert.deepEqual(Object.keys(j.uf.SP.homicidio).sort(), ['2021', '2022', '2023', '2024', '2025']);
  assert.deepEqual(j.uf.SP.homicidio[2024], { meses: 12, total: 120 });
  assert.equal(j.arquivos.length, 2);
});

await caso('Sinesp: formato irreconhecido, poucos estados ou portal fora do ar = ok:false e o arquivo anterior fica como estava', async () => {
  const pasta = path.join(tmp, 'seg2');
  await atualizarSeguranca({ json: async () => pacotesCkan, binario: binarioDeTeste({ 'https://x/uf-novo.xlsx': [2024] }), pasta, hoje });
  const antes = readFileSync(path.join(pasta, 'anos', 'seguranca.json'), 'utf-8');
  const ruim = await atualizarSeguranca({ json: async () => pacotesCkan, binario: async () => fazerXlsx([{ nome: 'x', linhas: [['A'], ['B']] }]), pasta, hoje });
  assert.equal(ruim.ok, false); assert.match(ruim.motivo, /Nenhuma planilha do Sinesp foi reconhecida/);
  const poucos = await atualizarSeguranca({ json: async () => pacotesCkan, binario: binarioDeTeste({ 'https://x/uf-novo.xlsx': [2024] }, ['SP', 'RJ', 'MG']), pasta, hoje });
  assert.equal(poucos.ok, false); assert.match(poucos.motivo, /Só 3 estados/);
  const fora = await atualizarSeguranca({ json: async () => { throw new Error('HTTP 503'); }, binario: binarioDeTeste({}), pasta, hoje }).catch((e) => ({ ok: false, motivo: e.message }));
  assert.equal(fora.ok, false);
  assert.equal(readFileSync(path.join(pasta, 'anos', 'seguranca.json'), 'utf-8'), antes, 'o arquivo anterior não é tocado');
});

/* ============================ valores de um ente ============================ */

const cidade = (s) => ({ em: hoje.toISOString(), s });

await caso('valoresDoEnte: só anos com 6 meses ou mais dentro dos 48 meses; 2022 (2 meses) fica de fora', () => {
  const v = valoresDoEnte({ esfera: 'M', janela, populacao: 50000, reg: cidade({
    'saude.nascidos': { 2022: 400, 2023: 300, 2024: 200 }, 'saude.obitos': { 2022: 40, 2023: 6, 2024: 4 },
    'ideb.ai.municipal': { 2021: 4.0, 2023: 5.0, 2025: 6.0 }, 'ideb.af.municipal': { 2023: 4.5 },
    'saude.diarreia': { 2022: 9, 2023: 2, 2024: 4 } }), censo: { agua: 80, esgoto: 60.5, lixo: 99 } });
  assert.deepEqual(v.mortalidade.anos, [2023, 2024]);
  assert.equal(v.mortalidade.valor, (10 / 500) * 1000, '(6+4) óbitos / (300+200) nascidos x 1000');
  assert.deepEqual(v['ideb-ai-mun'], { valor: 6, anos: [2025] }, 'Ideb mais recente do período');
  assert.deepEqual(v['ideb-af-mun'], { valor: 4.5, anos: [2023] });
  assert.equal(v.diarreia.valor, 3); assert.deepEqual(v.diarreia.anos, [2023, 2024], 'média dos anos do período');
  assert.deepEqual(v.agua, { valor: 80, anos: [2022], retrato: true });
  assert.ok(!('ideb-af-est' in v) && !('homicidio' in v), 'indicadores de estado não entram para município');
});

await caso('valoresDoEnte: pouco nascimento no período = sem mortalidade, com motivo (a taxa oscila demais)', () => {
  const v = valoresDoEnte({ esfera: 'M', janela, reg: cidade({ 'saude.nascidos': { 2023: 40, 2024: 30 }, 'saude.obitos': { 2023: 1, 2024: 0 } }) });
  assert.equal(v.mortalidade.valor, null); assert.match(v.mortalidade.motivo, /só 70 nascimentos no período \(mínimo 100\)/);
  const sem = valoresDoEnte({ esfera: 'M', janela, reg: cidade({ 'saude.nascidos': { 2023: 400 } }) });
  assert.ok(!('mortalidade' in sem), 'sem óbitos o Placar não calcula a taxa');
});

await caso('valoresDoEnte: estado tem Ideb da rede estadual e segurança por 100 mil; diarreia só município; DF conta como estado', () => {
  const seg = { homicidio: { 2023: { meses: 12, total: 500 }, 2024: { meses: 12, total: 700 }, 2025: { meses: 6, total: 9999 } }, rouboVeiculo: { 2024: { meses: 12, total: 1000 } } };
  for (const esfera of ['E', 'D']) {
    const v = valoresDoEnte({ esfera, janela, populacao: 2000000, segUf: seg, reg: cidade({ 'ideb.af.estadual': { 2023: 4.2, 2025: 4.6 }, 'ideb.em.estadual': { 2023: 3.9 }, 'ideb.af.municipal': { 2025: 9 }, 'saude.diarreia': { 2023: 5 },
      'saude.nascidos': { 2023: 30000 }, 'saude.obitos': { 2023: 300 } }) });
    assert.deepEqual(v['ideb-af-est'], { valor: 4.6, anos: [2025] });
    assert.deepEqual(v['ideb-em-est'], { valor: 3.9, anos: [2023] });
    assert.deepEqual(v.homicidio, { valor: 30, anos: [2023, 2024] }, '(500+700)/2 por ano em 2 milhões de habitantes = 30 por 100 mil');
    assert.deepEqual(v['roubo-veiculo'], { valor: 50, anos: [2024] });
    assert.equal(v.mortalidade.valor, 10);
    assert.ok(!('diarreia' in v) && !('ideb-af-mun' in v));
  }
});

await caso('valoresDoEnte: sem dado nenhum devolve vazio (nunca zero)', () => {
  assert.deepEqual(valoresDoEnte({ esfera: 'M', janela, reg: null, censo: undefined }), {});
  assert.deepEqual(valoresDoEnte({ esfera: 'E', janela, reg: cidade({}), segUf: null }), {});
});

/* ============================ cálculo do índice ============================ */

const ATUAL = { id: 'g2', inicio: '2025-01-01', fim: '2028-12-31', situacao: 'em exercício' };
const ANTERIOR = { id: 'g1', inicio: '2021-01-01', fim: '2024-12-31', situacao: 'encerrada' };
const MESMO = { id: 'g1', inicio: '2021-01-01', fim: '2028-12-31', situacao: 'em exercício' };
const prefeitura = (id, uf, i, extra = {}) => ({ id: `M${id}`, uf, esfera: 'M', gestoes: [MESMO], coletado: true,
  valores: { mortalidade: { valor: 20 - i, anos: [2023, 2024] }, 'ideb-ai-mun': { valor: 4 + i * 0.1, anos: [2025] }, agua: { valor: 50 + i, anos: [2022], retrato: true }, ...extra } });

await caso('índice: conta feita à mão (12 municípios, posição entre os pares com o sentido certo, média das áreas)', () => {
  const entes = Array.from({ length: 12 }, (_, i) => prefeitura(1000 + i, 'MG', i));
  const r = calcularIndices(entes);
  // valor maior de Ideb e de água = melhor; mortalidade menor = melhor. Em todos, o município i fica na posição (i + 0,5) / 12.
  for (const i of [0, 5, 11]) {
    const esperado = Math.round(((i + 0.5) / 12) * 1000) / 10;
    const x = r.get(`M${1000 + i}`);
    assert.deepEqual(x.comp.filter((c) => c.s != null).map((c) => c.s), [esperado, esperado, esperado], `município ${i}`);
    assert.equal(x.nota, esperado);
    assert.deepEqual([x.parcial.usadas, x.parcial.aplicaveis, x.parcial.total], [3, 4, 5]);
  }
  assert.equal(r.get('M1011').nota, 95.8); assert.equal(r.get('M1000').nota, 4.2);
  const c = r.get('M1000').comp;
  assert.deepEqual(c.map((x) => x.k), ['saude', 'educacao', 'seguranca', 'infra', 'saneamento']);
  assert.match(c[0].f, /Mortalidade infantil: 20,0 .* pontuação 4,2 entre 12 municípios de MG/);
  assert.deepEqual(r.get('M1000').parcial.faltam, [{ k: 'seguranca', motivo: 'nao-se-aplica' }, { k: 'infra', motivo: 'sem-fonte' }]);
  assert.match(r.get('M1000').ressalva, /Todos os anos considerados pertencem à gestão atual\. Saneamento é um retrato do Censo 2022/);
});

await caso('índice: empate recebe a posição do meio (ninguém é punido por empatar)', () => {
  const entes = Array.from({ length: 10 }, (_, i) => prefeitura(2000 + i, 'MG', i, { 'ideb-ai-mun': { valor: 5, anos: [2025] } }));
  const r = calcularIndices(entes);
  assert.ok(r.get('M2000').comp[1].s === 50 && r.get('M2009').comp[1].s === 50);
});

await caso('índice: estado com menos de 10 municípios com o dado compara com o país; os pares são do mesmo tipo (município não é comparado com estado)', () => {
  const entes = [...Array.from({ length: 12 }, (_, i) => prefeitura(3000 + i, 'MG', i)), ...Array.from({ length: 3 }, (_, i) => prefeitura(3100 + i, 'GO', i))];
  entes.push({ id: 'E31', uf: 'MG', esfera: 'E', gestoes: [MESMO], coletado: true, valores: { mortalidade: { valor: 1, anos: [2023] } } });
  const r = calcularIndices(entes);
  assert.match(r.get('M3100').comp[0].f, /entre 15 municípios do país/, 'GO só tem 3: compara com os 15 do país');
  assert.match(r.get('M3000').comp[0].f, /entre 12 municípios de MG/, 'MG tem 12: compara com o estado');
  assert.match(r.get('M3000').comp[0].f, /pontuação 4,2/, 'o estado (mortalidade 1) não entra na comparação dos municípios');
});

await caso('índice: área sem dado fica de fora e os pesos das outras são refeitos; menos áreas que o mínimo = sem índice, com motivo', () => {
  const um = { ...prefeitura(4000, 'MG', 0), valores: { agua: { valor: 90, anos: [2022], retrato: true } } };
  const dois = { ...prefeitura(4001, 'MG', 0), valores: { agua: { valor: 90, anos: [2022], retrato: true }, 'ideb-ai-mun': { valor: 6, anos: [2025] } } };
  const resto = Array.from({ length: 10 }, (_, i) => prefeitura(4100 + i, 'MG', i));
  const r = calcularIndices([um, dois, ...resto]);
  assert.equal(r.get('M4000').nota, null);
  assert.match(r.get('M4000').motivo, /Só 1 de 4 áreas têm dado confirmado; o índice precisa de pelo menos 2/);
  assert.equal(r.get('M4001').nota != null, true, 'prefeitura com 2 áreas já tem índice (parcial)');
  assert.equal(r.get('M4001').parcial.usadas, 2);
  assert.match(r.get('M4000').comp.find((c) => c.k === 'saude').f, /Dado não encontrado ou não confirmado/);
  assert.equal(r.get('M4000').comp.find((c) => c.k === 'saude').s, null, 'nunca vira zero');
});

await caso('índice: estado precisa de 3 áreas; segurança se aplica a ele; sem coleta do IBGE aparece o motivo certo', () => {
  const est = (i, valores, extra = {}) => ({ id: `E${i}`, uf: UFS_TODAS[i], esfera: 'E', gestoes: [MESMO], coletado: true, valores, ...extra });
  const cheio = (i) => ({ mortalidade: { valor: 10 + i, anos: [2023] }, 'ideb-af-est': { valor: 4 + i / 10, anos: [2025] }, 'ideb-em-est': { valor: 3 + i / 10, anos: [2025] }, homicidio: { valor: 20 + i, anos: [2024] },
    'roubo-veiculo': { valor: 100 + i, anos: [2024] }, agua: { valor: 80 + i / 10, anos: [2022], retrato: true } });
  const entes = Array.from({ length: 12 }, (_, i) => est(i, cheio(i)));
  entes.push(est(12, { mortalidade: { valor: 12, anos: [2023] }, agua: { valor: 90, anos: [2022], retrato: true } }));          // 2 áreas: pouco
  entes.push(est(13, {}, { coletado: false }));
  entes.push({ ...prefeitura(5000, 'MG', 1, { 'ideb-ai-mun': undefined, mortalidade: undefined, agua: undefined }), valores: {}, coletado: false });
  const r = calcularIndices(entes);
  const e0 = r.get('E0');
  assert.deepEqual([e0.parcial.usadas, e0.parcial.aplicaveis], [4, 5]);
  assert.deepEqual(e0.parcial.faltam, [{ k: 'infra', motivo: 'sem-fonte' }]);
  // menor mortalidade, maior Ideb, menor homicídio e menor roubo = posição mais alta; saneamento (água) maior = melhor, mas o estado 0 tem a menor água
  assert.equal(e0.comp.find((c) => c.k === 'seguranca').s, 95.8, 'segurança do estado 0: melhor entre os 12 nas duas taxas');
  assert.equal(e0.comp.find((c) => c.k === 'saude').s > 90, true);
  assert.match(e0.comp.find((c) => c.k === 'seguranca').f, /Homicídios dolosos: 20,0 \(vítimas por 100 mil habitantes, 2024\); pontuação 95,8 entre 12 estados/);
  assert.equal(r.get('E12').nota, null); assert.match(r.get('E12').motivo, /Só 2 de 5 áreas/);
  assert.match(r.get('E13').motivo, /deste estado ainda não foram coletados/);
  assert.match(r.get('M5000').motivo, /ainda não foram coletados no IBGE Cidades/);
});

await caso('índice: gasto com pessoal e dívida não entram em lugar nenhum', () => {
  const chaves = METODO.executivos.componentes.map((c) => c.k);
  assert.deepEqual(chaves, ['saude', 'educacao', 'seguranca', 'infra', 'saneamento']);
  assert.ok(METODO.executivos.componentes.every((c) => c.peso === 20));
  assert.ok(!METODO.executivos.indicadores.some((i) => /pessoal|divida/.test(i.k)));
  assert.equal(METODO.executivos.componentes.reduce((t, c) => t + c.peso, 0), 100);
});

await caso('atribuição dos anos: gestão atual, anterior e dividida; sem gestão conhecida não inventa', () => {
  const g = [{ id: 'g1', inicio: '2021-01-01', fim: '2024-12-31', situacao: 'encerrada' }, { id: 'g2', inicio: '2025-01-01', fim: '2028-12-31', situacao: 'em exercício' }];
  assert.deepEqual(atribuicaoDosAnos(g, [2023, 2025]), { atual: [2025], misto: [], anterior: [2023], semGestao: false });
  const troca = [{ id: 'g1', inicio: '2021-01-01', fim: '2025-06-30', situacao: 'encerrada' }, { id: 'g2', inicio: '2025-07-01', fim: '2028-12-31', situacao: 'em exercício' }];
  assert.deepEqual(atribuicaoDosAnos(troca, [2024, 2025, 2026]), { atual: [2026], misto: [2025], anterior: [2024], semGestao: false });
  assert.equal(atribuicaoDosAnos(null, [2025]).semGestao, true);
  assert.equal(atribuicaoDosAnos([ANTERIOR], [2025]).semGestao, true, 'sem gestão em exercício: não há a quem atribuir');
});

await caso('índice: quem tomou posse depois dos anos com resultado fica sem índice (mandato novo); ano dividido ou anterior vira ressalva', () => {
  const todos = Array.from({ length: 12 }, (_, i) => prefeitura(6000 + i, 'MG', i));
  const novo = { ...prefeitura(6100, 'MG', 5), gestoes: [ANTERIOR, { ...ATUAL, inicio: '2026-04-04' }], valores: { mortalidade: { valor: 10, anos: [2023, 2024, 2025] }, 'ideb-ai-mun': { valor: 5, anos: [2025] }, agua: { valor: 70, anos: [2022], retrato: true } } };
  const misto = { ...prefeitura(6101, 'MG', 6), gestoes: [{ ...ANTERIOR, fim: '2025-06-30' }, { ...ATUAL, inicio: '2025-07-01' }], valores: { mortalidade: { valor: 10, anos: [2024, 2025] }, 'ideb-ai-mun': { valor: 5, anos: [2025] } } };
  const antigo = { ...prefeitura(6102, 'MG', 7), gestoes: [ANTERIOR, ATUAL] };
  const r = calcularIndices([...todos, novo, misto, antigo]);
  const n = r.get('M6100');
  assert.equal(n.nota, null); assert.equal(n.bloqueio, 'mandato-novo'); assert.deepEqual(n.comp, []);
  assert.match(n.motivo, /O mandato atual começou em 2026; os resultados disponíveis são de 2023, 2024 e 2025, anteriores à posse/);
  const m = r.get('M6101');
  assert.notEqual(m.nota, null);
  assert.match(m.ressalva, /2024 é de gestão anterior; 2025 foi dividido entre gestões/);
  assert.deepEqual(m.atribuicao, { anos: [2024, 2025], atual: [], misto: [2025], anterior: [2024] });
  const a = r.get('M6102');
  assert.notEqual(a.nota, null);
  assert.match(a.ressalva, /2023 e 2024 são de gestão anterior/);
  assert.deepEqual(a.atribuicao.atual, [2025]);
});


/* ============================ presidente ============================ */

const G_PRES = [{ id: 'g1', inicio: '2019-01-01', fim: '2022-12-31', situacao: 'encerrada' }, { id: 'g2', inicio: '2023-01-01', fim: '2026-12-31', situacao: 'em exercício', nome: 'Presidente de teste' }];
const indPres = ({ ipca = 4, desoc = 8, divida = 5, id = 'g2', meses = 46 } = {}) => ({
  'pres.ipca12': ipca == null ? { situacao: 'nao-confirmado' } : { situacao: 'ok', porGestao: { [id]: { meses, ultimo: { p: '2026-10', v: ipca }, primeiro: { p: '2023-01', v: 5 } } } },
  'pres.desocupacao': desoc == null ? { situacao: 'nao-confirmado' } : { situacao: 'ok', porGestao: { [id]: { meses: 45, media: desoc, de: '2023-01', ate: '2026-09' } } },
  'pres.divida-bruta': divida == null ? { situacao: 'nao-confirmado' } : { situacao: 'ok', porGestao: { [id]: { meses, variacao: divida, primeiro: { p: '2023-01', v: 72 }, ultimo: { p: '2026-10', v: 72 + divida } } } }
});
const pontos = (r) => Object.fromEntries(r.comp.map((c) => [c.k, c.s]));

await caso('presidente: inflação dentro da faixa da meta = 100; abaixo e acima caem de forma diferente; nunca passa de 0 a 100', () => {
  const nota = (ipca) => pontos(notaPresidente({ gestoes: G_PRES, indicadores: indPres({ ipca }), janela })).inflacao;
  assert.equal(nota(4), 100); assert.equal(nota(1.5), 100); assert.equal(nota(4.5), 100);
  assert.equal(nota(1), 83.3, '0,5 ponto abaixo do piso, de 3 pontos de queda total');
  assert.equal(nota(7.5), 50, '3 pontos acima do teto, de 6 de queda total');
  assert.equal(nota(12), 0); assert.equal(nota(-3), 0);
});

await caso('presidente: desemprego (4% ou menos = 100; 12% ou mais = 0) e dívida (sem aumento = 100; +10 pontos = 0)', () => {
  const p = (o) => pontos(notaPresidente({ gestoes: G_PRES, indicadores: indPres(o), janela }));
  assert.equal(p({ desoc: 8 }).desocupacao, 50); assert.equal(p({ desoc: 3 }).desocupacao, 100); assert.equal(p({ desoc: 14 }).desocupacao, 0);
  assert.equal(p({ divida: 5 }).divida, 50); assert.equal(p({ divida: -3 }).divida, 100); assert.equal(p({ divida: 12 }).divida, 0);
});

await caso('presidente: nota é a média ponderada 35/35/30 dos indicadores que existem; é sempre parcial e traz a ressalva de causalidade', () => {
  const r = notaPresidente({ gestoes: G_PRES, indicadores: indPres({ ipca: 4, desoc: 8, divida: 5 }), janela });
  assert.equal(r.nota, 67.5, '100 x 35% + 50 x 35% + 50 x 30%');
  assert.deepEqual(r.comp.map((c) => [c.k, c.peso]), [['inflacao', 35], ['desocupacao', 35], ['divida', 30]]);
  assert.deepEqual([r.parcial.usadas, r.parcial.total], [3, 3]); assert.match(r.parcial.escopo, /só economia e dívida/);
  assert.match(r.ressalva, /não mede, sozinho, a atuação do presidente/); assert.match(r.ressalva, /Banco Central/);
  assert.equal(r.gestao.id, 'g2'); assert.equal(r.gestao.mesesNoPeriodo, 46);
  assert.match(r.comp[0].f, /IPCA acumulado em 12 meses: 4,00% em 10\/2026/);
  assert.ok(!r.comp.some((c) => /selic/i.test(c.k)), 'a Selic não entra: quem a define é o Comitê de Política Monetária');
  const sem = notaPresidente({ gestoes: G_PRES, indicadores: indPres({ divida: null }), janela });
  assert.equal(sem.nota, 75, '(100 x 35 + 50 x 35) / 70: pesos refeitos sem a dívida');
  assert.equal(sem.parcial.usadas, 2); assert.match(sem.comp[2].f, /Dado não encontrado ou não confirmado/); assert.equal(sem.comp[2].s, null);
  const pouco = notaPresidente({ gestoes: G_PRES, indicadores: indPres({ divida: null, desoc: null }), janela });
  assert.equal(pouco.nota, null); assert.match(pouco.motivo, /Só 1 de 3 indicadores/); assert.equal(pouco.ressalva, undefined);
});

await caso('presidente: gestão com menos de 12 meses no período ou sem gestão em exercício fica sem índice, com motivo', () => {
  const curta = [{ id: 'g1', inicio: '2019-01-01', fim: '2026-03-31', situacao: 'encerrada' }, { id: 'g2', inicio: '2026-04-01', fim: '2030-12-31', situacao: 'em exercício' }];
  const r = notaPresidente({ gestoes: curta, indicadores: indPres({ meses: 7 }), janela });
  assert.equal(r.nota, null); assert.deepEqual(r.comp, []); assert.match(r.motivo, /só 7 meses dentro do período.*pelo menos 12/);
  const nenhuma = notaPresidente({ gestoes: [G_PRES[0]], indicadores: indPres(), janela });
  assert.equal(nenhuma.nota, null); assert.match(nenhuma.motivo, /Não há gestão em exercício/);
  const outra = notaPresidente({ gestoes: G_PRES, indicadores: indPres({ id: 'g1' }), janela });
  assert.equal(outra.nota, null, 'só a gestão atual é medida: números de outra gestão não entram');
});


/* ============================ deputados estaduais (Alesp) ============================ */

const CPF_FALSO = '123.456.789-09';
const registroXml = (dep, ano, mes, valor, tipo = 'B') => `<despesa><Deputado>${dep}</Deputado><Matrícula>300${dep.length}</Matrícula><Ano>${ano}</Ano><Mes>${mes}</Mes><Tipo>${tipo}</Tipo><CNPJ>${CPF_FALSO}</CNPJ><Fornecedor>FORNECEDOR &amp; CIA</Fornecedor><Valor>${valor}</Valor></despesa>`;
const xmlDespesas = (regs) => `<?xml version="1.0" encoding="UTF-8"?><despesas>${regs.join('')}</despesas>`;

await caso('estaduais: números em formato brasileiro ou com ponto decimal; texto e vazio não viram número', () => {
  assert.equal(numeroBR('1234.56'), 1234.56); assert.equal(numeroBR('1.234,56'), 1234.56); assert.equal(numeroBR('1234,5'), 1234.5);
  assert.equal(numeroBR('1.234'), 1234, 'ponto só de milhar'); assert.equal(numeroBR('0.5'), 0.5); assert.equal(numeroBR('R$ 10,00'), 10);
  assert.equal(numeroBR(''), null); assert.equal(numeroBR(null), null); assert.equal(numeroBR('abc'), null);
});

await caso('estaduais: lê o XML da Alesp sem depender do elemento que envolve o registro; ignora CNPJ/CPF; soma o mesmo mês; descarta registro quebrado', () => {
  const xml = xmlDespesas([registroXml('ANA TESTE', 2024, 3, '1000.50'), registroXml('ANA TESTE', 2024, 3, '500', 'C'), registroXml('ANA TESTE', 2024, 4, '2.000,25'),
    registroXml('JOÃO D&apos;AVILA', 2024, 3, 10), '<despesa><Deputado>SEM VALOR</Deputado><Ano>2024</Ano><Mes>3</Mes><Valor>x</Valor></despesa>', '<despesa><Deputado>MES RUIM</Deputado><Ano>2024</Ano><Mes>13</Mes><Valor>5</Valor></despesa>']);
  const r = lerDespesasAlesp(xml);
  assert.equal(r.registros, 4); assert.equal(r.ignorados, 2);
  assert.deepEqual(r.deputados['ANA TESTE'], { '2024-03': 1500.5, '2024-04': 2000.25 });
  assert.deepEqual(Object.keys(r.deputados).sort(), ["ANA TESTE", "JOÃO D'AVILA"]);
  assert.ok(!JSON.stringify(r).includes('123.456') && !JSON.stringify(r).includes('FORNECEDOR'), 'CNPJ/CPF e fornecedor não são lidos nem guardados');
  const sem = lerDespesasAlesp('<html>erro</html>');
  assert.equal(sem.registros, 0);
});

await caso('estaduais: decodifica o arquivo conforme o que ele declara (UTF-8 ou ISO-8859-1)', () => {
  assert.equal(decodificar(Buffer.from('<?xml version="1.0" encoding="UTF-8"?><a>JOÃO</a>', 'utf8')).includes('JOÃO'), true);
  assert.equal(decodificar(Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><a>JOÃO</a>', 'latin1')).includes('JOÃO'), true);
  assert.equal(decodificar('texto pronto'), 'texto pronto');
});

await caso('estaduais: ligação de nomes só quando é única e segura (urna, nome completo ou nome contido); ambíguo fica sem ligação', () => {
  const itens = [
    { id: '1', nome: 'Maria da Silva Souza', urna: 'Maria Souza' }, { id: '2', nome: 'João Pedro Alves', urna: 'Dr. Pedro' },
    { id: '3', nome: 'Carlos Henrique Lima', urna: 'Carlos Lima' }, { id: '4', nome: 'Carlos Alberto Lima', urna: 'Carlinhos' },
    { id: '5', nome: 'Rita Mendes', urna: 'Rita Mendes' }, { id: '6', nome: 'Paulo Roberto Dias', urna: 'Paulo Dias' }
  ];
  const l = ligarNomes(itens, ['MARIA SOUZA', 'DR. PEDRO', 'CARLOS LIMA', 'RITA MENDES', 'PAULO ROBERTO DIAS', 'FULANO DE TAL', 'JOAO PEDRO ALVES']);
  assert.equal(l.get('1'), 'MARIA SOUZA', 'nome de urna');
  assert.equal(l.get('5'), 'RITA MENDES');
  assert.equal(l.get('6'), 'PAULO ROBERTO DIAS', 'o nome de urna "Paulo Dias" está contido no nome do arquivo');
  assert.ok(!l.has('3') && !l.has('4'), '"CARLOS LIMA" serve para dois deputados: não liga nenhum');
  assert.equal(l.has('2'), false, 'dois nomes do arquivo servem ao mesmo deputado (urna e nome completo): ambíguo');
  assert.ok(![...l.values()].includes('FULANO DE TAL'));
});

const nomeDep = (i) => `DEPUTADO NUMERO ${String.fromCharCode(65 + i)}${String.fromCharCode(97 + i)}`;
const itensSP = (n) => Array.from({ length: n }, (_, i) => ({ id: `SP${i}`, nome: nomeDep(i), urna: nomeDep(i), partido: 'XYZ', uf: 'SP', situacao: 'Eleito' }));
/** deputado i gasta (i+1) x 1000 por mês durante `meses` meses a partir de 2024-01 */
function despesasDe(n, { meses = 18, pulo = [] } = {}) {
  const deputados = {};
  for (let i = 0; i < n; i++) {
    if (pulo.includes(i)) continue;
    const d = (deputados[nomeDep(i)] = {});
    for (let m = 0; m < meses; m++) d[`${2024 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`] = (i + 1) * 1000;
  }
  return deputados;
}
const dadosDe = (anos, deputados) => ({ anos: Object.fromEntries(anos.map((a) => [a, { deputados }])) });

await caso('estaduais: nota de verba de gabinete à mão (menos gasto = pontuação maior); parcial 1 de 4; só colegas da mesma casa', () => {
  const r = calcularEstaduais({ uf: 'SP', itens: itensSP(12), dados: dadosDe([2024, 2025], despesasDe(12)), anosJanela: [2023, 2024, 2025, 2026] });
  const x = r.resultado;
  assert.equal(x.get('SP0').nota, Math.round((1 - 0.5 / 12) * 1000) / 10, 'quem gasta menos fica com 95,8');
  assert.equal(x.get('SP11').nota, Math.round((1 - 11.5 / 12) * 1000) / 10, 'quem gasta mais fica com 4,2');
  assert.deepEqual([x.get('SP0').parcial.usadas, x.get('SP0').parcial.total], [1, 4]);
  assert.deepEqual(x.get('SP0').parcial.faltam, ['vot', 'pres', 'aprov']);
  assert.deepEqual(x.get('SP0').comp.map((c) => [c.k, c.peso]), [['cota', 30], ['vot', 20], ['pres', 20], ['aprov', 30]]);
  assert.match(x.get('SP0').comp.find((c) => c.k === 'cota').f, /média de R\$ 1\.000 por mês em 18 meses.*entre 12 colegas da mesma Assembleia/);
  assert.match(x.get('SP0').comp.find((c) => c.k === 'pres').f, /Dado não encontrado ou não confirmado/);
  assert.match(x.get('SP0').ressalva, /Índice parcial: só 1 de 4 critérios/); assert.match(x.get('SP0').ressalva, /não a qualidade do mandato/);
  assert.equal(r.ligados, 12); assert.equal(r.comDado, 12);
});

await caso('estaduais: sem ligação de nome, com menos de 12 meses ou com poucos colegas = sem índice, com motivo (nunca zero)', () => {
  const dep = despesasDe(12, { pulo: [3] });
  dep[nomeDep(4)] = { '2025-01': 5000, '2025-06': 5000 };                // 6 meses entre o primeiro e o último: pouco histórico
  const r = calcularEstaduais({ uf: 'SP', itens: itensSP(12), dados: dadosDe([2024, 2025], dep), anosJanela: [2024, 2025] }).resultado;
  assert.equal(r.get('SP3').nota, null); assert.match(r.get('SP3').motivo, /Não foi possível ligar o nome do deputado, com segurança/);
  assert.equal(r.get('SP4').nota, null); assert.match(r.get('SP4').motivo, /[Mm]enos de 12 meses de despesas registradas/); assert.match(r.get('SP4').motivo, /zero não é nota baixa/);
  assert.equal(r.get('SP4').comp.find((c) => c.k === 'cota').s, null);
  assert.notEqual(r.get('SP5').nota, null);
  const pouco = calcularEstaduais({ uf: 'SP', itens: itensSP(5), dados: dadosDe([2024, 2025], despesasDe(5)), anosJanela: [2024, 2025] }).resultado;
  assert.equal(pouco.get('SP0').nota, null); assert.match(pouco.get('SP0').motivo, /[Ss]ó 5 deputados com dados suficientes para comparar \(mínimo 10\)/);
  const nada = calcularEstaduais({ uf: 'SP', itens: itensSP(3), dados: null, anosJanela: [2024] }).resultado;
  assert.equal(nada.get('SP0').nota, null);
});

await caso('estaduais: só os anos da janela entram; 2022 e anteriores ficam de fora', () => {
  const antigo = { ...despesasDe(12) };
  for (const k of Object.keys(antigo)) antigo[k] = { '2021-05': 999999 };
  const r = calcularEstaduais({ uf: 'SP', itens: itensSP(12), dados: { anos: { 2021: { deputados: antigo }, 2024: { deputados: despesasDe(12) }, 2025: { deputados: despesasDe(12) } } }, anosJanela: [2023, 2024, 2025, 2026] }).resultado;
  assert.match(r.get('SP0').comp.find((c) => c.k === 'cota').f, /em 18 meses/);
});

const hojeEst = new Date('2026-11-18T12:00:00Z');
function binarioAlesp(porAno, chamadas = []) {
  return async (url) => {
    chamadas.push(url);
    const ano = Number((/despesas_gabinetes_(\d{4})\.xml/.exec(url) || [])[1]);
    if (!porAno[ano]) throw new Error('HTTP 404 em ' + url);
    return Buffer.from(porAno[ano], 'utf8');
  };
}
const xmlAno = (ano, n = 12) => xmlDespesas(Array.from({ length: n }, (_, i) => Array.from({ length: 12 }, (_, m) => registroXml(nomeDep(i), ano, m + 1, (i + 1) * 1000))).flat());

await caso('estaduais: anos da janela (4 civis); leitura guarda por ano, relê o ano em curso todo dia e os fechados só a cada 7 dias', async () => {
  assert.deepEqual(anosDaJanelaEstadual(hojeEst), [2023, 2024, 2025, 2026]);
  const pasta = path.join(tmp, 'alesp1');
  const chamadas = [];
  const b = binarioAlesp({ 2024: xmlAno(2024), 2025: xmlAno(2025), 2026: xmlAno(2026) }, chamadas);
  const r1 = await lerAlesp({ binario: b, pasta, hoje: hojeEst, anos: [2023, 2024, 2025, 2026] });
  assert.equal(r1.ok, true); assert.deepEqual(r1.anos, [2024, 2025, 2026]); assert.equal(r1.falhas.length, 1, '2023 não existe na fonte de teste: falha só dele');
  const j = JSON.parse(readFileSync(path.join(pasta, 'anos', 'estaduais-SP.json'), 'utf-8'));
  assert.match(j.fonte, /Alesp/); assert.ok(!JSON.stringify(j).includes('123.456'));
  chamadas.length = 0;
  await lerAlesp({ binario: b, pasta, hoje: new Date('2026-11-19T12:00:00Z'), anos: [2023, 2024, 2025, 2026] });
  assert.deepEqual(chamadas.map((u) => /(\d{4})\.xml/.exec(u)[1]).sort(), ['2023', '2026'], 'no dia seguinte: o ano em curso e o que falhou; os fechados ficam guardados');
  chamadas.length = 0;
  await lerAlesp({ binario: b, pasta, hoje: new Date('2026-11-26T12:00:00Z'), anos: [2024, 2025, 2026] });
  assert.equal(chamadas.length, 3, 'depois de 7 dias, relê tudo');
});

await caso('estaduais: arquivo irreconhecível, fora do ar ou com valor absurdo = ok:false e nada gravado', async () => {
  const pasta = path.join(tmp, 'alesp2');
  const ruim = await lerAlesp({ binario: async () => Buffer.from('<html>manutenção</html>'), pasta, hoje: hojeEst, anos: [2025] });
  assert.equal(ruim.ok, false); assert.match(ruim.motivo, /sem nenhum registro reconhecido/); assert.ok(!existsSync(path.join(pasta, 'anos', 'estaduais-SP.json')));
  const absurdo = await lerAlesp({ binario: async () => Buffer.from(xmlDespesas([registroXml('X', 2025, 1, '99999999')])), pasta, hoje: hojeEst, anos: [2025] });
  assert.equal(absurdo.ok, false); assert.match(absurdo.motivo, /fora do esperado/);
  const fora = await lerAlesp({ binario: async () => { throw new Error('HTTP 503'); }, pasta, hoje: hojeEst, anos: [2025] });
  assert.equal(fora.ok, false);
});

await caso('estaduais: rotina grava o índice de SP, deixa as outras casas sem índice com o motivo, ranking só dentro da casa, sem CPF', async () => {
  const pasta = path.join(tmp, 'alesp3');
  mkdirSync(pasta, { recursive: true });
  writeFileSync(path.join(pasta, 'estaduais-SP.json'), JSON.stringify({ uf: 'SP', ano: 2022, itens: itensSP(12) }));
  writeFileSync(path.join(pasta, 'estaduais-MG.json'), JSON.stringify({ uf: 'MG', ano: 2022, itens: [{ id: 'MG0', nome: 'Fulano Mineiro', urna: 'Fulano', partido: 'XYZ', uf: 'MG' }] }));
  const b = binarioAlesp({ 2023: xmlAno(2023), 2024: xmlAno(2024), 2025: xmlAno(2025), 2026: xmlAno(2026) });
  const r = await atualizarEstaduais({ binario: b, pasta, hoje: hojeEst });
  assert.equal(r.ok, true); assert.equal(r.total, 13); assert.equal(r.comNota, 12);
  const sp = JSON.parse(readFileSync(path.join(pasta, 'estaduais-SP.json'), 'utf-8'));
  assert.deepEqual(sp.itens.filter((i) => i.nota != null).map((i) => i.rank).sort((a, b) => a - b), Array.from({ length: 12 }, (_, k) => k + 1));
  assert.equal(sp.itens[0].rank, 1, 'quem gasta menos fica em primeiro dentro da Alesp');
  assert.match(sp.itens[0].fonteDados, /Alesp/);
  const mg = JSON.parse(readFileSync(path.join(pasta, 'estaduais-MG.json'), 'utf-8'));
  assert.equal(mg.itens[0].nota, null); assert.equal(mg.itens[0].rank, null); assert.deepEqual(mg.itens[0].comp, []);
  assert.match(mg.itens[0].motivo, /ainda não tem leitura integrada ao Placar/); assert.match(mg.itens[0].motivo, /página Fontes/);
  const todos = ['estaduais-SP.json', 'estaduais-MG.json', 'anos/estaduais-SP.json'].map((f) => readFileSync(path.join(pasta, f), 'utf-8')).join('');
  assert.ok(!todos.includes('123.456') && !todos.includes('FORNECEDOR'));
  const reg = JSON.parse(readFileSync(path.join(pasta, 'assembleias.json'), 'utf-8'));
  assert.equal(reg.itens.length, 27); assert.deepEqual(reg.itens.map((i) => i.uf).sort(), [...UFS_TODAS].sort());
  assert.equal(reg.itens.find((i) => i.uf === 'SP').statusPlacar, 'integrada-parcial');
  assert.ok(reg.itens.filter((i) => i.uf !== 'SP').every((i) => i.statusPlacar === 'pesquisada-nao-integrada' && i.portais.length && i.observacao), 'cada casa tem portal e o que se sabe sobre ela');
  const antes = readFileSync(path.join(pasta, 'estaduais-SP.json'), 'utf-8');
  await atualizarEstaduais({ binario: b, pasta, hoje: hojeEst });
  assert.equal(readFileSync(path.join(pasta, 'estaduais-SP.json'), 'utf-8'), antes, 'rodar de novo dá o mesmo resultado');
});

await caso('estaduais: se a Alesp sair do ar, a nota calculada com os dados já guardados continua; sem nada guardado, fica sem índice com o motivo', async () => {
  const pasta = path.join(tmp, 'alesp4');
  mkdirSync(pasta, { recursive: true });
  writeFileSync(path.join(pasta, 'estaduais-SP.json'), JSON.stringify({ uf: 'SP', ano: 2022, itens: itensSP(12) }));
  const fora = async () => { throw new Error('HTTP 503'); };
  const r0 = await atualizarEstaduais({ binario: fora, pasta, hoje: hojeEst });
  assert.equal(r0.ok, false); assert.equal(r0.comNota, 0);
  assert.match(JSON.parse(readFileSync(path.join(pasta, 'estaduais-SP.json'), 'utf-8')).itens[0].motivo, /Não foi possível ler as despesas da Alesp/);
  await atualizarEstaduais({ binario: binarioAlesp({ 2024: xmlAno(2024), 2025: xmlAno(2025) }), pasta, hoje: hojeEst });
  const r2 = await atualizarEstaduais({ binario: fora, pasta, hoje: new Date('2026-11-19T12:00:00Z') });
  assert.equal(r2.comNota, 12, 'dados já guardados continuam valendo');
  const vazio = await atualizarEstaduais({ binario: fora, pasta: path.join(tmp, 'vazia2'), hoje: hojeEst });
  assert.equal(vazio.ok, false); assert.match(vazio.motivo, /ainda não existe/);
});

/* ============================ rotina: lê arquivos e grava ============================ */

function montarPasta(nome, { comSeguranca = true, gestaoDe = () => [MESMO] } = {}) {
  const pasta = path.join(tmp, nome);
  mkdirSync(path.join(pasta, 'anos'), { recursive: true });
  const grava = (arq, obj) => { mkdirSync(path.dirname(path.join(pasta, arq)), { recursive: true }); writeFileSync(path.join(pasta, arq), JSON.stringify(obj)); };
  const ibge = { populacao: { ano: 2025, v: {} }, censo: { agua: { ano: 2022, v: {} }, esgoto: { ano: 2022, v: {} }, lixo: { ano: 2022, v: {} } } };
  for (const [uf, base, n] of [['MG', 3100000, 12], ['GO', 5200000, 4]]) {
    const itens = [], cidades = {}, municipios = {};
    for (let i = 0; i < n; i++) {
      const cod = String(base + i * 10 + 5);
      itens.push({ id: `${uf}${i}`, nome: `Prefeito ${uf}${i}`, partido: 'XYZ', uf, municipio: `Cidade ${uf}${i}`, cod: String(1000 + i), ibge: cod, populacao: 20000 + i });
      municipios[String(1000 + i)] = { gestoes: gestaoDe(uf, i) };
      if (!(uf === 'MG' && i === 11)) cidades[cod] = cidade({
        'saude.nascidos': { 2023: 300, 2024: 300 }, 'saude.obitos': { 2023: 3 + i, 2024: 3 + i },
        'ideb.ai.municipal': { 2025: 4 + i / 10 } });                       // MG11 sem coleta ainda
      ibge.populacao.v[cod] = 20000 + i;
      ibge.censo.agua.v[cod] = 50 + i; ibge.censo.esgoto.v[cod] = 40 + i; ibge.censo.lixo.v[cod] = 90 + i / 10;
    }
    grava(`prefeitos-${uf}.json`, { uf, ano: 2024, exercicio: 2025, itens });
    grava(`anos/cidades-${uf}.json`, { versao: 1, uf, itens: cidades });
    grava(`administracoes-${uf}.json`, { uf, municipios, estado: { gestoes: [MESMO] } });
  }
  const govs = UFS_TODAS.slice(0, 12).map((uf, i) => ({ id: `G${uf}`, nome: `Gov ${uf}`, partido: 'XYZ', uf, ibge: String(11 + i), populacao: 1000000 * (i + 1) }));
  grava('governadores.json', { ano: 2022, exercicio: 2025, total: govs.length, comNota: 0, itens: govs });
  for (const g of govs) {
    ibge.populacao.v[g.ibge] = g.populacao; ibge.censo.agua.v[g.ibge] = 80 + Number(g.ibge) / 10; ibge.censo.esgoto.v[g.ibge] = 60; ibge.censo.lixo.v[g.ibge] = 95;
    const arq = `anos/cidades-${g.uf}.json`;
    const antes = existsSync(path.join(pasta, arq)) ? JSON.parse(readFileSync(path.join(pasta, arq), 'utf-8')) : { versao: 1, uf: g.uf, itens: {} };
    antes.itens[g.ibge] = cidade({ 'saude.nascidos': { 2023: 30000 }, 'saude.obitos': { 2023: 300 + Number(g.ibge) * 10 }, 'ideb.af.estadual': { 2025: 4 + Number(g.ibge) / 100 }, 'ideb.em.estadual': { 2025: 3 + Number(g.ibge) / 100 } });
    grava(arq, antes);
  }
  for (const g of govs) { const f = path.join(pasta, `administracoes-${g.uf}.json`); if (!existsSync(f)) grava(`administracoes-${g.uf}.json`, { uf: g.uf, municipios: {}, estado: { gestoes: [MESMO] } }); }
  grava('ibge-contexto.json', { versao: 1, ...ibge });
  if (comSeguranca) {
    const uf = {};
    for (const g of govs) uf[g.uf] = { homicidio: { 2023: { meses: 12, total: g.populacao / 100000 * (10 + Number(g.ibge)) }, 2024: { meses: 12, total: g.populacao / 100000 * (10 + Number(g.ibge)) } }, rouboVeiculo: { 2024: { meses: 12, total: g.populacao / 100000 * 100 } } };
    grava('anos/seguranca.json', { versao: 1, uf });
  }
  return pasta;
}
const le = (pasta, n) => JSON.parse(readFileSync(path.join(pasta, n), 'utf-8'));

await caso('rotina do índice: grava prefeituras, governadores e ranking; quem não foi coletado fica sem índice com o motivo; posições seguidas', async () => {
  const pasta = montarPasta('rotina1');
  const r = await atualizarIndices({ pasta, hoje });
  assert.equal(r.ok, true);
  assert.equal(r.cobertura.prefeituras.total, 16); assert.equal(r.cobertura.prefeituras.semColeta, 1);
  const mg = le(pasta, 'prefeitos-MG.json');
  const p0 = mg.itens[0], p11 = mg.itens[11];
  assert.notEqual(p0.nota, null); assert.equal(p11.nota, null); assert.match(p11.motivo, /ainda não foram coletados/); assert.equal(p11.rank, null);
  assert.ok(p0.comp.length === 5 && p0.parcial && p0.ressalva);
  const rk = le(pasta, 'ranking-prefeitos.json');
  assert.equal(rk.total, 16); assert.equal(rk.comNota, 15); assert.equal(rk.ano, 2024); assert.equal(rk.exercicio, 2025);
  assert.deepEqual(rk.itens.filter((i) => i.nota != null).map((i) => i.rank).sort((a, b) => a - b), Array.from({ length: 15 }, (_, k) => k + 1));
  assert.ok(rk.itens.every((i) => !('comp' in i)), 'o ranking é enxuto');
  const g = le(pasta, 'governadores.json');
  assert.equal(g.comNota, 12);
  const gm = g.itens[0];
  assert.deepEqual(gm.comp.map((c) => [c.k, c.s != null]), [['saude', true], ['educacao', true], ['seguranca', true], ['infra', false], ['saneamento', true]]);
  assert.deepEqual([gm.parcial.usadas, gm.parcial.total], [4, 5]);
  assert.ok(r.governadores.destaques.top.length === 5 && r.prefeitos.destaques.top.length === 10);
  assert.ok(r.prefeitos.media > 0 && r.governadores.media > 0);
});

await caso('rotina do índice: sem o arquivo do Sinesp, segurança fica "sem dado" e o estado continua com índice de 3 áreas', async () => {
  const pasta = montarPasta('rotina2', { comSeguranca: false });
  await atualizarIndices({ pasta, hoje });
  const g = le(pasta, 'governadores.json');
  assert.equal(g.comNota, 12);
  const seg = g.itens[0].comp.find((c) => c.k === 'seguranca');
  assert.equal(seg.s, null); assert.match(seg.f, /Dado não encontrado ou não confirmado/);
  assert.equal(g.itens[0].parcial.usadas, 3);
});

await caso('rotina do índice: rodar de novo dá o mesmo resultado (sem acumular, sem mudar posição)', async () => {
  const pasta = montarPasta('rotina3');
  await atualizarIndices({ pasta, hoje });
  const a = readFileSync(path.join(pasta, 'ranking-prefeitos.json'), 'utf-8');
  const ga = readFileSync(path.join(pasta, 'governadores.json'), 'utf-8');
  await atualizarIndices({ pasta, hoje });
  assert.equal(readFileSync(path.join(pasta, 'ranking-prefeitos.json'), 'utf-8'), a);
  assert.equal(readFileSync(path.join(pasta, 'governadores.json'), 'utf-8'), ga);
});

await caso('rotina do índice: governador que assumiu depois dos resultados fica sem índice; pasta vazia devolve ok:false com motivo', async () => {
  const pasta = montarPasta('rotina4');
  for (const uf of ['MG', 'GO']) { const f = path.join(pasta, `administracoes-${uf}.json`); const d = le(pasta, `administracoes-${uf}.json`); d.estado.gestoes = [ANTERIOR, { ...ATUAL, inicio: '2027-01-01' }]; writeFileSync(f, JSON.stringify(d)); }
  await atualizarIndices({ pasta, hoje });
  const g = le(pasta, 'governadores.json');
  const mg = g.itens.find((x) => x.uf === 'GO');
  assert.equal(mg.nota, null); assert.equal(mg.bloqueio, 'mandato-novo'); assert.match(mg.motivo, /mandato atual começou em 2027/);
  assert.equal(g.itens.find((x) => x.uf === 'AC').nota != null, true, 'os demais continuam com índice');
  const vazio = path.join(tmp, 'vazia'); mkdirSync(vazio, { recursive: true });
  const r = await atualizarIndices({ pasta: vazio, hoje });
  assert.equal(r.ok, false); assert.match(r.motivo, /ainda não existem/);
});

await caso('herdarIndice: a lista refeita pela rotina semanal mantém a nota anterior até o índice ser recalculado', () => {
  const antigo = { id: 'a', nota: 61.5, comp: [{ k: 'saude' }], parcial: { usadas: 3 }, ressalva: 'x', rank: 7 };
  const novo = herdarIndice({ id: 'a', nota: null, comp: [], motivo: 'As contas ainda não foram consultadas.' }, antigo);
  assert.equal(novo.nota, 61.5); assert.equal(novo.rank, 7); assert.equal(novo.comp.length, 1);
  assert.equal(herdarIndice({ id: 'b', nota: null, comp: [] }, undefined).nota, null);
  assert.equal(herdarIndice({ id: 'c', nota: 10 }, { nota: 99 }).nota, 10, 'nota nova não é sobrescrita');
  assert.equal(herdarIndice({ id: 'd', nota: null }, { nota: null, motivo: 'x' }).nota, null);
});

console.log(falhas ? `\n${falhas} TESTE(S) FALHARAM` : '\nTUDO OK');
process.exit(falhas ? 1 : 0);
