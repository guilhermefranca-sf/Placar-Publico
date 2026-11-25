// Teste da aba "Preços no Brasil": leitor de PDF da cesta, leitor das planilhas da ANP, PTAX, cálculos por mandato e rotina completa.
// Sem internet: usa um PDF e planilhas .xlsx montados aqui, com números inventados só para teste.
// Rodar:  node scripts/teste/rodar-teste-precos.mjs

import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { deflateSync, deflateRawSync } from 'node:zlib';
import { textoDoPdf, lerTabelaCesta, acharLinhasDaTabela, dataDePublicacao } from '../cesta-pdf.mjs';
import {
  abrirZip, lerPlanilha, lerGasolinaSemanal, lerGasolinaMensal, lerGasolinaEstados, lerPtax, coletarCesta, mesesDaCesta,
  montarPrecos, resumirPeriodo, curvaDoPeriodo, mediaMensalDoDolar, atualizarPrecos, inflarNode, MANDATOS, URLS
} from '../precos.mjs';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'placar-precos-'));
const hoje = new Date('2026-11-24T12:00:00Z');
let falhas = 0;
async function caso(nome, fn) { try { await fn(); console.log('ok:', nome); } catch (e) { falhas++; console.log('FALHOU:', nome, '\n   ', (process.env.DETALHE ? e.message : e.message.split('\n')[0])); } }

/* ---------- montagem de PDF de teste ---------- */

function montarPdf(objetos) {
  const partes = [Buffer.from('%PDF-1.4\n', 'latin1')];
  for (const [n, corpo] of objetos) {
    partes.push(Buffer.from(`${n} 0 obj\n`, 'latin1'));
    partes.push(Buffer.isBuffer(corpo) ? corpo : Buffer.from(corpo, 'latin1'));
    partes.push(Buffer.from('\nendobj\n', 'latin1'));
  }
  return Buffer.concat(partes);
}
const fluxoFlate = (texto) => {
  const d = deflateSync(Buffer.from(texto, 'latin1'));
  return Buffer.concat([Buffer.from(`<< /Length ${d.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'), d, Buffer.from('\nendstream', 'latin1')]);
};
const fluxoPuro = (texto) => Buffer.from(`<< /Length ${texto.length} >>\nstream\n${texto}\nendstream`, 'latin1');

/** Página 1: fonte simples com texto entre parênteses (como os PDFs do Word). Página 2: fonte Type0 com ToUnicode e texto em hexadecimal. */
function pdfDeTeste({ valorSP = '75,27', pub = '11 de maio de 2026' } = {}) {
  const linha = (y, itens) => itens.map(([x, t]) => `1 0 0 1 ${x} ${y} Tm\n[(${t})] TJ`).join('\n');
  const pagina1 = `BT\n/F1 10 Tf\n${[
    linha(760, [[50, 'S\\343o Paulo'], [150, ','], [160, pub]]),
    linha(700, [[50, 'TABELA 1']]),
    linha(680, [[50, 'S\\343o Paulo'], [150, '4'], [156, valorSP], [200, '1,33'], [240, '58,70'], [280, '118h49m'], [330, '13,67']]),
    linha(660, [[50, 'Aracaju'], [150, '376,73'], [200, '-'], [210, '0,50'], [240, '46,53'], [280, '94h11m'], [330, '-'], [340, '1,00']]),
    linha(640, [[50, 'Bras\\355lia'], [100, '\\(1\\)'], [150, '719,81'], [200, '-'], [210, '2,61'], [240, '51,26'], [280, '104h19m'], [330, '-'], [340, '-']]),
    linha(620, [[50, 'Salvador 10,13 3,64 570,70 103h35m 50,91']]),
    linha(600, [[50, 'Porto Alegre'], [150, '468,78'], [200, '0,81'], [240, '57,90'], [280, '117h12m'], [330, '10,46']]),
    linha(580, [[50, 'Rio de Janeiro foi a capital onde a cesta ficou mais cara (R$ 879,03)']]),
    '/F1 10 Tf\n(Teste) Tj'
  ].join('\n')}\nET`;
  // fonte Type0: código do glifo = código do caractere - 29 (como no PDF real); acentuadas ganham códigos próprios
  const extras = { 'ó': 0x0100, 'í': 0x0101 };
  const cod = (ch) => (extras[ch] ?? ch.charCodeAt(0) - 29);
  const hex = (t) => [...t].map((ch) => cod(ch).toString(16).toUpperCase().padStart(4, '0')).join('');
  const caracteres = [...new Set('Recife Vitória 672,75 2,77 44,87 91h18m 810,45 2,56 54,05 109h59m0123456789,-. '.split(''))];
  const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CMapName /Adobe-Identity-UCS def\n1 begincodespacerange <0000> <FFFF> endcodespacerange\n${caracteres.length} beginbfchar\n${caracteres.map((ch) => `<${cod(ch).toString(16).toUpperCase().padStart(4, '0')}> <${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}>`).join('\n')}\nendbfchar\nendcmap end end`;
  const l2 = (y, itens) => itens.map(([x, t]) => `1 0 0 -1 ${x} ${y} Tm\n[<${hex(t)}>-0.5] TJ`).join('\n');
  const pagina2 = `BT\n/F1 10 Tf\n${[
    l2(100, [[50, 'Recife'], [150, '672,75'], [200, '2,77'], [240, '44,87'], [280, '91h18m'], [330, '12,86']]),
    l2(120, [[50, 'Vitória'], [150, '810,45'], [200, '2,56'], [240, '54,05'], [280, '109h59m'], [330, '11,44']])
  ].join('\n')}\nET`;
  return montarPdf([
    [1, '<< /Type /Catalog /Pages 2 0 R >>'],
    [2, '<< /Type /Pages /Kids [3 0 R 8 0 R] /Count 2 >>'],
    [3, '<< /Type /Page /Parent 2 0 R /Contents [4 0 R] /Resources 5 0 R /MediaBox [0 0 595 842] >>'],
    [4, fluxoFlate(pagina1)],
    [5, '<< /Font 6 0 R >>'],
    [6, '<< /F1 7 0 R >>'],
    [7, '<< /Type /Font /Subtype /TrueType /BaseFont /Arial /Encoding /WinAnsiEncoding >>'],
    [8, '<< /Type /Page /Parent 2 0 R /Contents [9 0 R] /Resources 10 0 R /MediaBox [0 0 595 842] >>'],
    [9, fluxoFlate(pagina2)],
    [10, '<< /Font << /F1 11 0 R >> >>'],
    [11, '<< /Type /Font /Subtype /Type0 /BaseFont /CIDFont+F1 /Encoding /Identity-H /DescendantFonts [ << /Type /Font /Subtype /CIDFontType2 >> ] /ToUnicode 12 0 R >>'],
    [12, fluxoPuro(cmap)]
  ]);
}

/* ---------- montagem de .xlsx de teste ---------- */

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
const serial = (iso) => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86400000);
const colunas = 'ABCDEFGHIJKLMNOPQR';
/** linhas: array de arrays (texto -> string; número -> number; undefined -> vazio). Começa na linha `primeira`. */
function fazerXlsx(linhas, primeira = 1) {
  const textos = [];
  const idx = (t) => { let i = textos.indexOf(t); if (i < 0) { textos.push(t); i = textos.length - 1; } return i; };
  const xml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const rows = linhas.map((l, k) => `<row r="${primeira + k}">${l.map((v, c) => v === undefined ? `<c r="${colunas[c]}${primeira + k}"/>`
    : typeof v === 'number' ? `<c r="${colunas[c]}${primeira + k}"><v>${v}</v></c>` : `<c r="${colunas[c]}${primeira + k}" t="s"><v>${idx(v)}</v></c>`).join('')}</row>`).join('');
  return fazerZip({
    '[Content_Types].xml': '<Types/>',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`,
    'xl/sharedStrings.xml': `<?xml version="1.0"?><sst>${textos.map((t) => `<si><t>${xml(t)}</t></si>`).join('')}</sst>`
  });
}
const filler = (n) => Array.from({ length: n }, (_, i) => [`LINHA DE CABEÇALHO ${i + 1} & TESTE`]);

/* ---------- séries de teste ---------- */

const ymLista = (de, ate) => { const l = []; for (let a = +de.slice(0, 4), m = +de.slice(5); `${a}-${String(m).padStart(2, '0')}` <= ate; m++) { if (m > 12) { m = 1; a++; } l.push(`${a}-${String(m).padStart(2, '0')}`); } return l; };
const gasMes = (ym) => Math.round((3.5 + 0.02 * ymLista('2013-01', ym).length) * 1000) / 1000;
function xlsxSemanal() {
  const lin = [...filler(17), ['DATA INICIAL', 'DATA FINAL', 'PRODUTO', 'NÚMERO DE POSTOS PESQUISADOS', 'UNIDADE DE MEDIDA', 'PREÇO MÉDIO REVENDA']];
  let ini = '2016-01-03';
  while (ini <= '2026-11-08') {
    const fim = new Date(Date.UTC(+ini.slice(0, 4), +ini.slice(5, 7) - 1, +ini.slice(8, 10) + 6)).toISOString().slice(0, 10);
    lin.push([serial(ini), serial(fim), 'ETANOL HIDRATADO', 100, 'R$/l', '9.99']);
    lin.push([serial(ini), serial(fim), 'GASOLINA COMUM', 100, 'R$/l', String(gasMes(ini.slice(0, 7)))]);
    ini = new Date(Date.UTC(+ini.slice(0, 4), +ini.slice(5, 7) - 1, +ini.slice(8, 10) + 7)).toISOString().slice(0, 10);
  }
  lin.push([serial('2026-11-15'), serial('2026-11-21'), 'GASOLINA COMUM', 100, 'R$/l', '-']); // semana sem dado: deve ser ignorada
  return fazerXlsx(lin);
}
const xlsxMensal = () => fazerXlsx([...filler(16), ['MÊS', 'PRODUTO', 'NÚMERO DE POSTOS PESQUISADOS', 'UNIDADE DE MEDIDA', 'PREÇO MÉDIO REVENDA'],
  ...ymLista('2013-01', '2026-10').flatMap((ym) => [[serial(ym + '-01'), 'ETANOL HIDRATADO', 100, 'R$/l', '9.99'], [serial(ym + '-01'), 'GASOLINA COMUM', 100, 'R$/l', String(gasMes(ym))]])]);
const xlsxEstados = () => fazerXlsx([...filler(15), ['MÊS', 'PRODUTO', 'REGIÃO', 'ESTADO', 'NÚMERO DE POSTOS PESQUISADOS', 'UNIDADE DE MEDIDA', 'PREÇO MÉDIO REVENDA'],
  ...ymLista('2013-01', '2026-10').flatMap((ym) => [
    [serial(ym + '-01'), 'GASOLINA COMUM', 'SUDESTE', 'SAO PAULO', 100, 'R$/l', String(gasMes(ym) + 0.1)],
    [serial(ym + '-01'), 'GASOLINA COMUM', 'NORTE', 'AMAPÁ', 100, 'R$/l', String(gasMes(ym) + 0.5)],
    [serial(ym + '-01'), 'GASOLINA COMUM', 'XX', 'ESTADO INEXISTENTE', 100, 'R$/l', '1.0']
  ])]);

const diasUteis = (de, ate) => { const l = []; for (let t = Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10)); t <= Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10)); t += 86400000) { const d = new Date(t); if (d.getUTCDay() % 6) l.push(d.toISOString().slice(0, 10)); } return l; };
const dolarDia = (d) => Math.round((3 + 0.001 * diasUteis('2016-01-01', d).length) * 10000) / 10000;
function respostaPtax(url) {
  const m = url.match(/@dataInicial='(\d\d)-(\d\d)-(\d{4})'&@dataFinalCotacao='(\d\d)-(\d\d)-(\d{4})'/);
  assert.ok(m, 'a URL do PTAX precisa ter as datas no formato MM-DD-AAAA: ' + url);
  const [de, ate] = [`${m[3]}-${m[1]}-${m[2]}`, `${m[6]}-${m[4]}-${m[5]}`];
  return { value: diasUteis(de, ate).map((d) => ({ cotacaoVenda: dolarDia(d), dataHoraCotacao: `${d} 13:06:55.123` })) };
}

/** Cache de cesta de teste: 201604 a 202610, só São Paulo e Aracaju, com a lacuna de 201708. */
function cestaDeTeste() {
  const meses = {};
  for (const ym of mesesDaCesta(hoje)) {
    if (ym === '201708') { meses[ym] = { semTexto: true, lidoEm: hoje.toISOString() }; continue; }
    const i = (+ym.slice(0, 4) - 2016) * 12 + +ym.slice(4) - 4;
    meses[ym] = { pub: `${ym.slice(0, 4)}-${ym.slice(4)}-08`, capitais: { 'São Paulo': { valor: 450 + i, pctSM: 55, horas: 110 }, Aracaju: { valor: 370 + i / 2, pctSM: 45, horas: 90 } }, lidoEm: hoje.toISOString() };
  }
  return { meses };
}

/* =============================== casos =============================== */

await caso('leitor de PDF: texto simples, número partido, sinal separado, nota de rodapé e fonte codificada', async () => {
  const pg = await textoDoPdf(new Uint8Array(pdfDeTeste()), inflarNode);
  assert.equal(pg.length, 2);
  const t = lerTabelaCesta(pg);
  assert.deepEqual(t.capitais['São Paulo'], { valor: 475.27, pctSM: 58.7, horas: 118.82 }, 'número "4 75,27" é um só: 475,27');
  assert.equal(t.capitais.Aracaju.valor, 376.73);
  assert.equal(t.capitais.Aracaju.pctSM, 46.53, 'o sinal "-" solto não vira número');
  assert.deepEqual(t.capitais['Brasília'], { valor: 719.81, pctSM: 51.26, horas: 104.32 }, 'nota "(1)" depois do nome é ignorada');
  assert.equal(t.capitais.Salvador.valor, 570.7);
  assert.equal(t.capitais.Salvador.pctSM, 50.91, 'layout de dezembro: % do salário mínimo depois do tempo');
  assert.equal(t.capitais['Porto Alegre'].valor, 468.78);
  assert.equal(t.capitais.Recife.valor, 672.75, 'texto em hexadecimal com tabela ToUnicode');
  assert.equal(t.capitais['Vitória'].valor, 810.45, 'letra acentuada vem da tabela ToUnicode');
  assert.equal(t.capitais['Rio de Janeiro'], undefined, 'frase com "R$ 879,03" não é linha da tabela');
  assert.equal(t.publicadoEm, '2026-05-11');
});

await caso('leitor de PDF: texto sem sentido ou imagem não vira dado', async () => {
  assert.deepEqual(acharLinhasDaTabela('São Paulo foi a capital mais cara (R$ 906,14), seguida por Cuiabá (R$ 880,06)'), {});
  assert.deepEqual(acharLinhasDaTabela('Recife 6,15 2,50 50,40 102h34m'), {}, 'sem valor de cesta (200 a 3.000) a linha é recusada');
  assert.deepEqual(acharLinhasDaTabela('Recife 565,09 2,50 5,40 102h34m'), {}, '% do salário mínimo fora do intervalo plausível');
  const vazio = await textoDoPdf(new Uint8Array(montarPdf([[1, '<< /Type /Catalog >>']])), inflarNode);
  assert.deepEqual(lerTabelaCesta(vazio).capitais, {});
  assert.equal(dataDePublicacao('São Paulo | , | 06 de ju | lh | o de 2016'), '2016-07-06');
  assert.equal(dataDePublicacao('São Paulo, 9 de março de 2026'), '2026-03-09');
});

await caso('planilha .xlsx: textos, números, células vazias e acentos', () => {
  const l = lerPlanilha(fazerXlsx([['A & B', 12.5, undefined, 'ç']], 3));
  assert.deepEqual(l, [{ n: 3, c: { A: 'A & B', B: '12.5', D: 'ç' } }]);
  assert.throws(() => abrirZip(Buffer.from('isto não é zip')), /xlsx/);
});

await caso('ANP: gasolina comum semanal, mensal e por estado (ignora outros produtos, "-" e estado desconhecido)', () => {
  const s = lerGasolinaSemanal(xlsxSemanal());
  assert.equal(s[0][0], '2016-01-03');
  assert.equal(s[0][1], '2016-01-09');
  const ultima = s[s.length - 1];
  assert.equal(ultima[1], '2026-11-14', 'a semana com "-" não entra');
  assert.ok(s.every((x) => x[2] < 9), 'só gasolina comum');
  const m = lerGasolinaMensal(xlsxMensal());
  assert.equal(m[0][0], '2013-01');
  assert.equal(m[m.length - 1][0], '2026-10');
  assert.equal(m.find((x) => x[0] === '2023-01')[1], gasMes('2023-01'));
  const e = lerGasolinaEstados(xlsxEstados());
  assert.deepEqual(Object.keys(e).sort(), ['AP', 'SP']);
  assert.equal(e.SP[0][0], '2016-01', 'estados só a partir de 2016');
  assert.equal(e.AP.at(-1)[1], Math.round((gasMes('2026-10') + 0.5) * 1e6) / 1e6);
  assert.throws(() => lerGasolinaMensal(fazerXlsx([['sem', 'cabeçalho']])), /títulos/);
});

await caso('PTAX: busca ano a ano com datas MM-DD-AAAA e devolve uma cotação por dia', async () => {
  const urls = [];
  const r = await lerPtax(async (u) => { urls.push(u); return respostaPtax(u); }, '2016-05-12', '2018-03-10');
  assert.equal(urls.length, 3);
  assert.equal(r[0][0], '2016-05-12');
  assert.equal(r.at(-1)[0], '2018-03-09');
  assert.equal(new Set(r.map((x) => x[0])).size, r.length, 'sem datas repetidas');
  assert.ok(urls[0].includes("'05-12-2016'") && urls[0].includes('$top=10000'));
});

await caso('cálculo por mandato: início, fim, variação, curva e janela dos 48 meses', () => {
  const mensal = ymLista('2013-01', '2026-10').map((ym) => [ym, gasMes(ym)]);
  const pts = mensal.map(([ym, v]) => ({ d: ym + '-01', v }));
  const lula = MANDATOS.find((m) => m.id === 'lula');
  const r = resumirPeriodo(pts, 'mes', lula, hoje);
  assert.equal(r.inicio.d, '2023-01-01');
  assert.equal(r.fim.d, '2026-10-01');
  assert.equal(r.emCurso, true);
  assert.equal(r.varPct, Math.round((gasMes('2026-10') / gasMes('2023-01') - 1) * 10000) / 100);
  const t = resumirPeriodo(pts, 'mes', MANDATOS[0], hoje);
  assert.equal(t.inicio.d, '2016-05-01');
  assert.equal(t.fim.d, '2018-12-01');
  assert.equal(t.emCurso, false);
  assert.equal(resumirPeriodo(pts.filter((p) => p.d < '2018-06-01'), 'mes', MANDATOS[0], hoje), null, 'sem dado perto do fim do mandato: nada é estimado');
  assert.equal(resumirPeriodo([], 'mes', lula, hoje), null);
  const c = curvaDoPeriodo(mensal, lula, hoje);
  assert.deepEqual(c[0], [0, 0]);
  assert.equal(c.length, 46, 'jan/2023 a out/2026');
  assert.equal(c.at(-1)[0], 45);
  // semanal: a semana que contém a posse
  const sem = [['2018-12-30', '2019-01-05', 4], ['2022-12-25', '2022-12-31', 5], ['2023-01-01', '2023-01-07', 6], ['2026-11-15', '2026-11-21', 7]].map(([ini, d, v]) => ({ ini, d, v }));
  assert.equal(resumirPeriodo(sem, 'semana', lula, hoje).inicio.v, 6);
  assert.equal(resumirPeriodo(sem, 'semana', MANDATOS[1], hoje).fim.v, 5, 'a semana que começa em 2022-12-25 ainda é do fim do mandato de Bolsonaro');
});

await caso('documento final: três fontes, mandatos, janela, atual e lacunas', () => {
  const diario = diasUteis('2016-01-01', '2026-11-24').map((d) => [d, dolarDia(d)]);
  const gas = { semanal: lerGasolinaSemanal(xlsxSemanal()), mensal: lerGasolinaMensal(xlsxMensal()), estados: lerGasolinaEstados(xlsxEstados()) };
  const doc = montarPrecos({ brutos: { gasolina: gas, dolar: diario, cesta: cestaDeTeste() }, hoje });
  assert.deepEqual(doc.situacao, { gasolina: true, dolar: true, cesta: true });
  assert.equal(doc.mandatos.length, 3);
  assert.equal(doc.mandatos.find((m) => m.id === 'lula').emCurso, true);
  assert.equal(doc.janela.de, '2022-11-01');
  assert.equal(doc.janela.ate, '2026-10-31');
  assert.ok(/não atribui/.test(doc.aviso));
  // gasolina
  assert.equal(doc.gasolina.atual.mes.mes, '2026-10');
  assert.equal(doc.gasolina.atual.mes.varPct, Math.round((gasMes('2026-10') / gasMes('2026-09') - 1) * 10000) / 100);
  assert.equal(doc.gasolina.atual.semana.fim <= '2026-11-14', true, 'a última semana com preço');
  assert.equal(doc.gasolina.resumos.janela.mes.inicio.d, '2022-11-01');
  assert.equal(doc.gasolina.resumos.temer.semana.inicio.d, '2016-05-14', 'semana que contém 12/05/2016 termina em 14/05');
  assert.ok(doc.gasolina.estados.SP.resumos.lula.mes.varPct > 0);
  assert.equal(doc.gasolina.estados.SP.nome, 'São Paulo');
  assert.equal(doc.gasolina.mensal[0][0], '2016-01');
  // dólar
  assert.equal(doc.dolar.atual.d, '2026-11-24');
  assert.equal(doc.dolar.atual.v, dolarDia('2026-11-24'));
  assert.equal(doc.dolar.atual.dia.d, '2026-11-23');
  assert.equal(doc.dolar.atual.mes.d, '2026-10-23', '24/10/2026 foi sábado: vale o pregão anterior');
  assert.equal(doc.dolar.resumos.bolsonaro.dia.inicio.d, '2019-01-01');
  assert.equal(doc.dolar.resumos.lula.dia.fim.d, '2026-11-24');
  assert.equal(doc.dolar.mensal.length, 131);
  // cesta
  assert.equal(doc.cesta.atual.mes, '2026-10');
  assert.ok(doc.cesta.atual.pdf.endsWith('/2026/202610cestabasica.pdf'));
  assert.deepEqual(doc.cesta.lacunas, ['2017-08']);
  assert.equal(doc.cesta.capitais['São Paulo'].v.length, doc.cesta.meses.length);
  assert.equal(doc.cesta.capitais['São Paulo'].ultimo.mes, '2026-10');
  assert.equal(doc.cesta.capitais['São Paulo'].ultimo.varMensal, Math.round((450 + 126) / (450 + 125) * 10000 - 10000) / 100);
  assert.equal(doc.cesta.capitais['São Paulo'].resumos.lula.inicio.d, '2023-01-01');
  assert.equal(doc.cesta.capitais['São Paulo'].resumos.temer.inicio.d, '2016-05-01');
  assert.equal(doc.cesta.capitais['Recife'], undefined, 'capital sem nenhum dado não aparece');
  assert.equal(doc.cesta.cobertura['2017-08'], undefined);
  assert.equal(doc.fontes.cesta.url.endsWith('analiseCestaBasica202610.html'), true);
});

await caso('documento final: fonte que falta vira nulo, nunca valor inventado', () => {
  const doc = montarPrecos({ brutos: { gasolina: null, dolar: null, cesta: null }, hoje, erros: ['gasolina: falhou'] });
  assert.deepEqual(doc.situacao, { gasolina: false, dolar: false, cesta: false });
  assert.equal(doc.gasolina, null); assert.equal(doc.dolar, null); assert.equal(doc.cesta, null);
  assert.deepEqual(doc.erros, ['gasolina: falhou']);
  assert.deepEqual(mediaMensalDoDolar([['2026-01-02', 5], ['2026-01-05', 6], ['2026-02-02', 7]]), [['2026-01', 5.5], ['2026-02', 7]]);
});

await caso('cesta: lê só o que falta, relê os 2 meses mais recentes, trata 404 e respeita o tempo', async () => {
  const chamadas = [];
  const pdf = pdfDeTeste();
  const binario = async (url) => {
    chamadas.push(url);
    if (/202610|202609/.test(url) === false && /2016(04|05)/.test(url)) throw Object.assign(new Error('HTTP 404 em ' + url), { semNovaTentativa: true });
    if (url.includes('201607')) return Buffer.from('PDF só com imagem');
    return pdf;
  };
  const todos = mesesDaCesta(hoje);
  assert.equal(todos[0], '201604');
  assert.equal(todos.at(-1), '202610', 'em 24/11/2026 o último PDF possível é o de outubro');
  const r1 = await coletarCesta({ binario, cache: { meses: {} }, hoje, orcamentoMs: 60000 });
  assert.equal(r1.meses['201606'].capitais['São Paulo'].valor, 475.27);
  assert.deepEqual(r1.meses['201604'], { ausente: true, lidoEm: hoje.toISOString() });
  assert.deepEqual(r1.meses['201607'], { semTexto: true, lidoEm: hoje.toISOString() });
  assert.equal(r1.parouPorTempo, false);
  const n1 = chamadas.length;
  assert.equal(n1, todos.length);
  chamadas.length = 0;
  const amanha = new Date('2026-11-25T12:00:00Z');
  const r2 = await coletarCesta({ binario, cache: { meses: r1.meses }, hoje: amanha, orcamentoMs: 60000 });
  assert.deepEqual(chamadas.sort(), [URLS.cestaPdf('202609'), URLS.cestaPdf('202610')], 'no dia seguinte só os dois mais recentes são baixados de novo; ausentes e sem texto só voltam depois de 30 dias');
  chamadas.length = 0;
  await coletarCesta({ binario, cache: { meses: r1.meses }, hoje, orcamentoMs: 60000 });
  assert.deepEqual(chamadas, [], 'no mesmo dia nada é baixado de novo');
  assert.equal(Object.keys(r2.meses).length, Object.keys(r1.meses).length);
  const r3 = await coletarCesta({ binario: async () => { throw new Error('HTTP 500'); }, cache: { meses: {} }, hoje, orcamentoMs: 60000 });
  assert.equal(r3.falhas, todos.length);
  const r4 = await coletarCesta({ binario, cache: { meses: {} }, hoje, orcamentoMs: -1 });
  assert.equal(r4.parouPorTempo, true);
  assert.equal(Object.keys(r4.meses).length, 0);
});

await caso('rotina completa: grava precos.json e guarda a cesta lida; fonte que cai mantém a série anterior', async () => {
  const pasta = path.join(tmp, 'dados');
  const pdf = pdfDeTeste();
  const arquivos = { [URLS.anpSemanalBrasil]: xlsxSemanal(), [URLS.anpMensalBrasil]: xlsxMensal(), [URLS.anpMensalEstados]: xlsxEstados() };
  const binario = async (url) => { if (arquivos[url]) return arquivos[url]; if (url.includes('cestabasica.pdf')) return pdf; throw new Error('HTTP 404 em ' + url); };
  const logs = [];
  const r = await atualizarPrecos({ json: async (u) => respostaPtax(u), binario, pasta, hoje, log: (m) => logs.push(m) });
  assert.equal(r.ok, true);
  assert.deepEqual(r.situacao, { gasolina: true, dolar: true, cesta: true });
  assert.equal(r.ultimo.dolar, '2026-11-24');
  const doc = JSON.parse(readFileSync(path.join(pasta, 'precos.json'), 'utf-8'));
  assert.equal(doc.cesta.capitais['São Paulo'].ultimo.v, 475.27);
  assert.ok(existsSync(path.join(pasta, 'anos/cesta-pdf.json')));
  assert.ok(!JSON.stringify(doc).includes('NaN') && !JSON.stringify(doc).includes('undefined'));
  // segundo dia: ANP e PTAX fora do ar; a gasolina e o dólar continuam os do arquivo anterior
  const r2 = await atualizarPrecos({
    json: async () => { throw new Error('HTTP 500'); },
    binario: async (url) => { if (url.includes('cestabasica.pdf')) return pdf; throw new Error('HTTP 503'); },
    pasta, hoje: new Date('2026-11-25T12:00:00Z'), log: () => {}
  });
  assert.equal(r2.ok, true);
  assert.ok(r2.erros.some((e) => /^gasolina/.test(e)) && r2.erros.some((e) => /^dólar/.test(e)));
  const doc2 = JSON.parse(readFileSync(path.join(pasta, 'precos.json'), 'utf-8'));
  assert.equal(doc2.gasolina.atual.mes.mes, '2026-10');
  assert.equal(doc2.dolar.atual.d, '2026-11-24', 'o último dólar bom continua, com a data dele');
  assert.ok(Object.keys(doc2.gasolina.estados).includes('SP'), 'estados também vêm do arquivo anterior');
  // tudo fora do ar e sem arquivo anterior: não grava arquivo vazio
  const pasta3 = path.join(tmp, 'dados3');
  const r3 = await atualizarPrecos({ json: async () => { throw new Error('x'); }, binario: async () => { throw new Error('HTTP 503'); }, pasta: pasta3, hoje, log: () => {} });
  assert.equal(r3.ok, false);
  assert.ok(!existsSync(path.join(pasta3, 'precos.json')));
});

console.log(falhas ? `\n${falhas} caso(s) falharam.` : '\nTodos os casos passaram.');
process.exit(falhas ? 1 : 0);
