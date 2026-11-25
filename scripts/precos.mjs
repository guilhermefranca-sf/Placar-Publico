// Preços no Brasil: gasolina (ANP), dólar (Banco Central) e cesta básica (DIEESE/Conab).
// Alimenta a aba "Preços no Brasil" do perfil do presidente. Arquivo gerado: site/dados/precos.json
//
//   Gasolina: planilhas oficiais da ANP (semanal e mensal do Brasil; mensal por estado), preço médio de revenda da gasolina comum.
//   Dólar:    PTAX de venda, serviço Olinda do Banco Central (uma cotação por dia útil).
//   Cesta:    PDF mensal do DIEESE (tabela "Custo e variação da cesta básica"), lido como texto (scripts/cesta-pdf.mjs).
//             O que já foi lido fica guardado em dados/anos/cesta-pdf.json; cada dia só se baixa o que falta.
//
// Regras: nenhum valor é estimado ou completado; mês sem dado fica como lacuna. As variações são contas do Placar
// sobre os números da fonte (selo "Calculado"). Nada aqui atribui o preço ao presidente: a aba mostra o que
// aconteceu em cada período e avisa que preço depende de muitos fatores.

import path from 'node:path';
import { inflateRawSync, inflateSync, constants as zc } from 'node:zlib';
import { gravarJson, lerJsonSeExistir, normalizar, emLotes, arredondar } from './util.mjs';
import { janelaDe48Meses } from './administracoes.mjs';
import { textoDoPdf, lerTabelaCesta, CAPITAIS } from './cesta-pdf.mjs';

/* ----------------------------- constantes ----------------------------- */

const ANP = 'https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/precos-revenda-e-de-distribuicao-combustiveis/shlp/';
export const URLS = {
  anpSemanalBrasil: ANP + 'semanal/semanal-brasil-desde-2013.xlsx',
  anpMensalBrasil: ANP + 'mensal/mensal-brasil-desde-jan2013.xlsx',
  anpMensalEstados: ANP + 'mensal/mensal-estados-desde-jan2013.xlsx',
  ptax: 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/',
  ptaxDocumentacao: 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/aplicacao#!/recursos/CotacaoDolarPeriodo',
  cestaPdf: (ym) => `https://www.dieese.org.br/analisecestabasica/${ym.slice(0, 4)}/${ym}cestabasica.pdf`,
  cestaPagina: (ym) => `https://www.dieese.org.br/analisecestabasica/analiseCestaBasica${ym}.html`
};

/** Os três presidentes mais recentes (registro público). O fim vazio significa mandato em curso. */
export const MANDATOS = [
  { id: 'temer', nome: 'Michel Temer', inicio: '2016-05-12', fim: '2018-12-31', nota: 'Assumiu a Presidência de forma interina em 12/05/2016 e em definitivo em 31/08/2016. O mês de maio de 2016 é o primeiro mês de governo.' },
  { id: 'bolsonaro', nome: 'Jair Bolsonaro', inicio: '2019-01-01', fim: '2022-12-31', nota: '' },
  { id: 'lula', nome: 'Luiz Inácio Lula da Silva', inicio: '2023-01-01', fim: null, nota: 'Mandato em curso.' }
];

export const AVISO_PRECOS = 'Preço de combustível, câmbio e alimentos depende de petróleo, câmbio, safras, clima, impostos, decisões de empresas, do Banco Central, do Congresso e do cenário internacional. As séries mostram o que aconteceu em cada período; o Placar não atribui a variação ao presidente, e estes dados não entram em nenhum índice ou avaliação política.';

const NOME_UF = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' };
const UF_POR_NOME = Object.fromEntries(Object.entries(NOME_UF).map(([uf, n]) => [normalizar(n), uf]));
export const PRIMEIRO_MES = '2016-04'; // um mês antes da posse de Temer, para ter a variação do primeiro mês

/* ----------------------------- datas e contas ----------------------------- */

const mesIdx = (ym) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const idxMes = (i) => `${String(Math.floor(i / 12)).padStart(4, '0')}-${String(i % 12 + 1).padStart(2, '0')}`;
const addMeses = (ym, n) => idxMes(mesIdx(ym) + n);
const diasEntre = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
const serialParaISO = (n) => new Date(Date.UTC(1899, 11, 30) + Math.round(Number(n)) * 86400000).toISOString().slice(0, 10);
const varPct = (de, para) => (de > 0 && para != null ? arredondar((para / de - 1) * 100, 2) : null);

/* ----------------------------- zip e planilha (.xlsx) ----------------------------- */

/** Abre um .zip (um .xlsx é um .zip) na memória. Devolve uma função: nome do arquivo interno -> Buffer. */
export function abrirZip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('O arquivo não é uma planilha .xlsx válida (sem diretório de zip).');
  const n = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const entradas = new Map();
  for (let i = 0; i < n; i++) {
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    entradas.set(buf.toString('utf8', p + 46, p + 46 + nl), { metodo: buf.readUInt16LE(p + 10), tam: buf.readUInt32LE(p + 20), off: buf.readUInt32LE(p + 42) });
    p += 46 + nl + el + cl;
  }
  return (nome) => {
    const m = entradas.get(nome);
    if (!m) return null;
    const ini = m.off + 30 + buf.readUInt16LE(m.off + 26) + buf.readUInt16LE(m.off + 28);
    const dados = buf.subarray(ini, ini + m.tam);
    return m.metodo === 0 ? dados : inflateRawSync(dados);
  };
}

const desescapar = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Textos compartilhados de uma planilha (as células de texto apontam para esta lista). */
function textosDaPlanilha(ler) {
  const textos = [];
  const ss = ler('xl/sharedStrings.xml')?.toString('utf8');
  if (ss) for (const si of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) textos.push(desescapar([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  return textos;
}

/** Linhas de uma aba (xml da aba): [{ n: número da linha, c: { A: 'texto', B: '41275', ... } }]. */
function linhasDaAba(planilha, textos) {
  const linhas = [];
  for (const r of planilha.matchAll(/<row\b[^>]*?\br="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    if (!r[2]) continue; // linha vazia, escrita como <row ... />
    const c = {};
    for (const cel of r[2].matchAll(/<c\b[^>]*?\br="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const corpo = cel[3];
      if (!corpo) continue;
      const tipo = (cel[2].match(/\bt="(\w+)"/) || [])[1];
      let valor;
      if (tipo === 'inlineStr') valor = desescapar([...corpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
      else {
        const v = corpo.match(/<v>([\s\S]*?)<\/v>/);
        if (!v) continue;
        valor = tipo === 's' ? textos[Number(v[1])] : desescapar(v[1]);
      }
      if (valor != null && valor !== '') c[cel[1]] = valor;
    }
    if (Object.keys(c).length) linhas.push({ n: Number(r[1]), c });
  }
  return linhas;
}

/**
 * Lê a primeira aba de uma planilha .xlsx. Devolve [{ n: numero da linha, c: { A: 'texto', B: '41275', ... } }].
 * Textos vêm do arquivo de textos compartilhados; números e datas (que no Excel são números) vêm como texto.
 */
export function lerPlanilha(buf) {
  const ler = abrirZip(buf);
  const planilha = (ler('xl/worksheets/sheet1.xml') || ler('xl/worksheets/sheet.xml'))?.toString('utf8');
  if (!planilha) throw new Error('Planilha sem aba de dados.');
  return linhasDaAba(planilha, textosDaPlanilha(ler));
}

/**
 * Lê TODAS as abas de uma planilha .xlsx. Devolve [{ nome, linhas }], na ordem do arquivo.
 * Se o arquivo não declarar os nomes das abas, usa "Aba 1", "Aba 2"...
 */
export function lerPlanilhas(buf) {
  const ler = abrirZip(buf);
  const textos = textosDaPlanilha(ler);
  const wb = ler('xl/workbook.xml')?.toString('utf8') || '';
  const rels = ler('xl/_rels/workbook.xml.rels')?.toString('utf8') || '';
  const alvoDe = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [(m[0].match(/\bId="([^"]+)"/) || [])[1], (m[0].match(/\bTarget="([^"]+)"/) || [])[1]]));
  const abas = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const nome = desescapar((m[0].match(/\bname="([^"]*)"/) || [])[1] || '');
    const rid = (m[0].match(/\br:id="([^"]+)"/) || [])[1];
    const alvo = alvoDe.get(rid);
    if (!alvo) continue;
    const caminho = alvo.startsWith('/') ? alvo.slice(1) : 'xl/' + alvo.replace(/^\.\//, '');
    const xml = ler(caminho)?.toString('utf8');
    if (xml) abas.push({ nome, linhas: linhasDaAba(xml, textos) });
  }
  if (abas.length) return abas;
  // Sem workbook.xml legível: tenta sheet1, sheet2... em ordem.
  for (let k = 1; k < 60; k++) {
    const xml = ler(`xl/worksheets/sheet${k}.xml`)?.toString('utf8');
    if (!xml) break;
    abas.push({ nome: `Aba ${k}`, linhas: linhasDaAba(xml, textos) });
  }
  return abas;
}

/** Acha a linha de títulos (a que tem "PRODUTO" e "PREÇO MÉDIO REVENDA") e devolve as linhas de dados como objetos pelo título. */
export function tabelaAnp(buf) {
  const linhas = lerPlanilha(buf);
  const iCab = linhas.findIndex((l) => Object.values(l.c).some((v) => normalizar(v) === 'PRODUTO') && Object.values(l.c).some((v) => normalizar(v) === 'PRECO MEDIO REVENDA'));
  if (iCab < 0) throw new Error('Não achei a linha de títulos (PRODUTO / PREÇO MÉDIO REVENDA) na planilha da ANP.');
  const nomes = Object.fromEntries(Object.entries(linhas[iCab].c).map(([col, v]) => [col, normalizar(v)]));
  return linhas.slice(iCab + 1).map((l) => Object.fromEntries(Object.entries(l.c).filter(([col]) => nomes[col]).map(([col, v]) => [nomes[col], v])));
}

const ehGasolinaComum = (p) => normalizar(p) === 'GASOLINA COMUM';
const numeroOuNulo = (v) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) && n > 0 && n < 50 ? n : null; };

/** Semanal do Brasil: [[inicio, fim, preço]] da gasolina comum, em ordem. */
export function lerGasolinaSemanal(buf) {
  const saida = [];
  for (const r of tabelaAnp(buf)) {
    if (!ehGasolinaComum(r.PRODUTO)) continue;
    const v = numeroOuNulo(r['PRECO MEDIO REVENDA']);
    const ini = r['DATA INICIAL'], fim = r['DATA FINAL'];
    if (v == null || !/^\d+$/.test(ini || '') || !/^\d+$/.test(fim || '')) continue;
    saida.push([serialParaISO(ini), serialParaISO(fim), v]);
  }
  return saida.sort((a, b) => (a[1] < b[1] ? -1 : 1));
}

/** Mensal do Brasil: [[AAAA-MM, preço]] da gasolina comum. */
export function lerGasolinaMensal(buf) {
  const saida = [];
  for (const r of tabelaAnp(buf)) {
    if (!ehGasolinaComum(r.PRODUTO)) continue;
    const v = numeroOuNulo(r['PRECO MEDIO REVENDA']);
    if (v == null || !/^\d+$/.test(r.MES || '')) continue;
    saida.push([serialParaISO(r.MES).slice(0, 7), v]);
  }
  return saida.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** Mensal por estado: { UF: [[AAAA-MM, preço]] } da gasolina comum, a partir de `desde` (AAAA-MM). */
export function lerGasolinaEstados(buf, desde = '2016-01') {
  const saida = {};
  for (const r of tabelaAnp(buf)) {
    if (!ehGasolinaComum(r.PRODUTO)) continue;
    const uf = UF_POR_NOME[normalizar(r.ESTADO)];
    const v = numeroOuNulo(r['PRECO MEDIO REVENDA']);
    if (!uf || v == null || !/^\d+$/.test(r.MES || '')) continue;
    const ym = serialParaISO(r.MES).slice(0, 7);
    if (ym < desde) continue;
    (saida[uf] = saida[uf] || []).push([ym, v]);
  }
  for (const uf of Object.keys(saida)) saida[uf].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return saida;
}

/* ----------------------------- dólar (PTAX) ----------------------------- */

const mdy = (iso) => `${iso.slice(5, 7)}-${iso.slice(8, 10)}-${iso.slice(0, 4)}`;

/** PTAX de venda, por dia útil, de `desde` até `ate` (AAAA-MM-DD): [[data, valor]]. Busca ano a ano. */
export async function lerPtax(json, desde, ate) {
  const saida = new Map();
  for (let ano = Number(desde.slice(0, 4)); ano <= Number(ate.slice(0, 4)); ano++) {
    const ini = ano === Number(desde.slice(0, 4)) ? desde : `${ano}-01-01`;
    const fim = ano === Number(ate.slice(0, 4)) ? ate : `${ano}-12-31`;
    const url = `${URLS.ptax}CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial='${mdy(ini)}'&@dataFinalCotacao='${mdy(fim)}'&$format=json&$select=cotacaoVenda,dataHoraCotacao&$orderby=dataHoraCotacao%20asc&$top=10000`;
    const r = await json(url);
    for (const x of r.value || []) {
      const v = Number(x.cotacaoVenda);
      const d = String(x.dataHoraCotacao || '').slice(0, 10);
      if (Number.isFinite(v) && v > 0 && /^\d{4}-\d{2}-\d{2}$/.test(d)) saida.set(d, v); // se houver mais de uma por dia, vale a última
    }
  }
  return [...saida.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/* ----------------------------- cesta básica (PDF do DIEESE) ----------------------------- */

export const inflarNode = async (bytes) => {
  try { return inflateSync(bytes, { finishFlush: zc.Z_SYNC_FLUSH }); } catch { return null; }
};

export function mesesDaCesta(hoje) {
  const fim = addMeses(hoje.toISOString().slice(0, 7), -1); // o PDF de um mês sai no mês seguinte
  const lista = [];
  for (let m = PRIMEIRO_MES; m <= fim; m = addMeses(m, 1)) lista.push(m.replace('-', ''));
  return lista;
}

/**
 * Lê os PDFs mensais que ainda faltam (e relê os dois mais recentes, que podem ser corrigidos).
 * cache: { meses: { AAAAMM: { pub, capitais } | { semTexto: true } | { ausente: true } } }
 */
export async function coletarCesta({ binario, cache, hoje, orcamentoMs = 600000, simultaneos = 3, log = () => {}, inflar = inflarNode }) {
  const inicio = Date.now();
  const meses = cache?.meses ? { ...cache.meses } : {};
  const todos = mesesDaCesta(hoje);
  const recentes = new Set(todos.slice(-2));
  const dias = (iso) => (iso ? (hoje - new Date(iso)) / 86400000 : Infinity);
  const pendentes = todos.filter((ym) => {
    const m = meses[ym];
    if (!m) return true;
    if (recentes.has(ym)) return dias(m.lidoEm) >= 1;
    if (m.ausente || m.semTexto) return dias(m.lidoEm) >= 30;
    return false;
  });
  let feitos = 0, falhas = 0, parouPorTempo = false;
  await emLotes(pendentes, simultaneos, async (ym) => {
    if (Date.now() - inicio > orcamentoMs) { parouPorTempo = true; return; }
    try {
      const bin = await binario(URLS.cestaPdf(ym));
      const paginas = await textoDoPdf(new Uint8Array(bin.buffer, bin.byteOffset, bin.byteLength), inflar);
      const t = lerTabelaCesta(paginas);
      meses[ym] = Object.keys(t.capitais).length
        ? { pub: t.publicadoEm, capitais: t.capitais, lidoEm: hoje.toISOString() }
        : { semTexto: true, lidoEm: hoje.toISOString() };
      feitos++;
    } catch (e) {
      if (/HTTP 404/.test(e.message)) {
        // Mês ainda não publicado: tenta de novo nos próximos dias; mês antigo sem arquivo é anotado.
        if (!recentes.has(ym)) meses[ym] = { ausente: true, lidoEm: hoje.toISOString() };
      } else { falhas++; log(`  cesta ${ym}: ${e.message}`); }
    }
  });
  return { meses, feitos, falhas, pendentes: pendentes.length, parouPorTempo };
}

/* ----------------------------- cálculos por mandato ----------------------------- */

/** Período para resumir: um mandato ou a janela dos últimos 48 meses. fim nulo = em curso. */
const periodos = (janela) => [
  ...MANDATOS.map((m) => ({ id: m.id, nome: m.nome, inicio: m.inicio, fim: m.fim })),
  { id: 'janela', nome: 'Últimos 48 meses', inicio: janela.de, fim: janela.ate }
];

/**
 * Resume uma série em um período. pontos: [{ d, ini?, v }] em ordem (d = data do ponto; na semanal, o último dia da semana).
 * tipo: 'dia' | 'semana' | 'mes'. Devolve null se a série não tem dado perto do início ou do fim do período.
 */
export function resumirPeriodo(pontos, tipo, p, hoje) {
  if (!pontos.length) return null;
  const fimRef = p.fim ?? hoje.toISOString().slice(0, 10);
  let a = null;
  if (tipo === 'mes') a = pontos.find((x) => x.d.slice(0, 7) === p.inicio.slice(0, 7)) || null;
  else a = pontos.find((x) => x.d >= p.inicio && diasEntre(p.inicio, x.d) <= (tipo === 'semana' ? 14 : 10)) || null;
  let b = null;
  if (tipo === 'mes') {
    const lim = fimRef.slice(0, 7);
    const cand = pontos.filter((x) => x.d.slice(0, 7) <= lim);
    b = cand.length ? cand[cand.length - 1] : null;
    if (b && mesIdx(lim) - mesIdx(b.d.slice(0, 7)) > (p.fim ? 2 : 3)) b = null;
  } else {
    const cand = pontos.filter((x) => (tipo === 'semana' ? x.ini <= fimRef : x.d <= fimRef));
    b = cand.length ? cand[cand.length - 1] : null;
    if (b && p.fim && diasEntre(b.d, p.fim) > 45) b = null;
  }
  if (!a || !b || b.d < a.d) return null;
  const ponto = (x) => ({ d: x.d, v: x.v });
  return { inicio: ponto(a), fim: ponto(b), varAbs: arredondar(b.v - a.v, 4), varPct: varPct(a.v, b.v), emCurso: !p.fim };
}

/** Curva mensal: variação % acumulada desde o mês de início do período: [[meses desde o início, %]]. */
export function curvaDoPeriodo(mensal, p, hoje) {
  const m0 = p.inicio.slice(0, 7);
  const base = mensal.find((x) => x[0] === m0);
  if (!base) return [];
  const fim = (p.fim ?? hoje.toISOString().slice(0, 10)).slice(0, 7);
  return mensal.filter((x) => x[0] >= m0 && x[0] <= fim).map((x) => [mesIdx(x[0]) - mesIdx(m0), varPct(base[1], x[1])]);
}

const ptsMensais = (mensal) => mensal.map(([ym, v]) => ({ d: ym + '-01', v }));

function resumosDe(mensal, hoje, janela, { diario = null, semanal = null } = {}) {
  const resumos = {}, curvas = {};
  for (const p of periodos(janela)) {
    resumos[p.id] = { mes: resumirPeriodo(ptsMensais(mensal), 'mes', p, hoje) };
    if (diario) resumos[p.id].dia = resumirPeriodo(diario.map(([d, v]) => ({ d, v })), 'dia', p, hoje);
    if (semanal) resumos[p.id].semana = resumirPeriodo(semanal.map(([ini, d, v]) => ({ ini, d, v })), 'semana', p, hoje);
    curvas[p.id] = curvaDoPeriodo(mensal, p, hoje);
  }
  return { resumos, curvas };
}

const ultimoEAnterior = (lista) => {
  const u = lista[lista.length - 1], a = lista[lista.length - 2];
  return u ? { ultimo: u, anterior: a || null } : null;
};

export function mediaMensalDoDolar(diario) {
  const por = new Map();
  for (const [d, v] of diario) { const k = d.slice(0, 7); const o = por.get(k) || { s: 0, n: 0 }; o.s += v; o.n++; por.set(k, o); }
  return [...por.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, o]) => [k, arredondar(o.s / o.n, 4)]);
}

function montarGasolina(g, hoje, janela) {
  const { semanal, mensal, estados } = g;
  const nacional = resumosDe(mensal, hoje, janela, { semanal });
  const us = ultimoEAnterior(semanal.map(([ini, fim, v]) => ({ ini, fim, v })));
  const um = ultimoEAnterior(mensal);
  const doc = {
    atual: {
      semana: us ? { ini: us.ultimo.ini, fim: us.ultimo.fim, v: us.ultimo.v, anterior: us.anterior ? us.anterior.v : null, varPct: us.anterior ? varPct(us.anterior.v, us.ultimo.v) : null } : null,
      mes: um ? { mes: um.ultimo[0], v: um.ultimo[1], anterior: um.anterior ? um.anterior[1] : null, anteriorMes: um.anterior ? um.anterior[0] : null, varPct: um.anterior && mesIdx(um.ultimo[0]) - mesIdx(um.anterior[0]) === 1 ? varPct(um.anterior[1], um.ultimo[1]) : null } : null
    },
    semanal: semanal.filter((x) => x[1] >= '2016-01-01'),
    mensal: mensal.filter((x) => x[0] >= '2016-01'),
    resumos: nacional.resumos, curvas: nacional.curvas, estados: {}
  };
  for (const [uf, lista] of Object.entries(estados || {})) {
    const r = resumosDe(lista, hoje, janela);
    const e = ultimoEAnterior(lista);
    doc.estados[uf] = {
      nome: NOME_UF[uf], mensal: lista,
      atual: e ? { mes: e.ultimo[0], v: e.ultimo[1], anterior: e.anterior ? e.anterior[1] : null, varPct: e.anterior && mesIdx(e.ultimo[0]) - mesIdx(e.anterior[0]) === 1 ? varPct(e.anterior[1], e.ultimo[1]) : null } : null,
      resumos: r.resumos, curvas: r.curvas
    };
  }
  return doc;
}

function montarDolar(diario, hoje, janela) {
  const mensal = mediaMensalDoDolar(diario);
  const r = resumosDe(mensal, hoje, janela, { diario });
  const u = diario[diario.length - 1];
  const a = diario[diario.length - 2] || null;
  let mesAnt = null;
  if (u) {
    const alvo = idxMes(mesIdx(u[0].slice(0, 7)) - 1) + u[0].slice(7); // mesmo dia do mês anterior (ou o último pregão antes dele)
    const antes = diario.filter((x) => x[0] <= alvo);
    mesAnt = antes.length && diasEntre(antes[antes.length - 1][0], alvo) <= 7 ? antes[antes.length - 1] : null;
  }
  return {
    atual: u ? {
      d: u[0], v: u[1],
      dia: a ? { d: a[0], v: a[1], varPct: varPct(a[1], u[1]) } : null,
      mes: mesAnt ? { d: mesAnt[0], v: mesAnt[1], varPct: varPct(mesAnt[1], u[1]) } : null
    } : null,
    diario, mensal, resumos: r.resumos, curvas: r.curvas
  };
}

function montarCesta(cache, hoje, janela) {
  const todos = Object.entries(cache?.meses || {}).filter(([, m]) => m.capitais).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (!todos.length) return null;
  const meses = todos.map(([ym]) => ym.slice(0, 4) + '-' + ym.slice(4));
  const capitais = {};
  for (const nome of CAPITAIS) {
    const v = todos.map(([, m]) => m.capitais[nome]?.valor ?? null);
    if (v.every((x) => x == null)) continue;
    const mensal = meses.map((ym, i) => (v[i] != null ? [ym, v[i]] : null)).filter(Boolean);
    const r = resumosDe(mensal, hoje, janela);
    const u = mensal[mensal.length - 1], a = mensal[mensal.length - 2];
    const iu = meses.indexOf(u[0]);
    const m = todos[iu][1].capitais[nome];
    capitais[nome] = {
      v, pct: todos.map(([, mm]) => mm.capitais[nome]?.pctSM ?? null), h: todos.map(([, mm]) => mm.capitais[nome]?.horas ?? null),
      ultimo: { mes: u[0], v: u[1], pctSM: m.pctSM, horas: m.horas, varMensal: a && mesIdx(u[0]) - mesIdx(a[0]) === 1 ? varPct(a[1], u[1]) : null },
      resumos: Object.fromEntries(Object.entries(r.resumos).map(([id, x]) => [id, x.mes])), curvas: r.curvas
    };
  }
  const cobertura = Object.fromEntries(todos.map(([ym, m]) => [ym.slice(0, 4) + '-' + ym.slice(4), Object.keys(m.capitais).length]));
  const ultimoMes = meses[meses.length - 1];
  const ultimo = todos[todos.length - 1][1];
  const lacunas = mesesDaCesta(hoje).map((ym) => ym.slice(0, 4) + '-' + ym.slice(4)).filter((ym) => !meses.includes(ym) && ym >= '2016-05');
  return {
    meses, capitais, cobertura, lacunas,
    atual: { mes: ultimoMes, publicadoEm: ultimo.pub || null, capitais: Object.keys(todos[todos.length - 1][1].capitais).length, pdf: URLS.cestaPdf(ultimoMes.replace('-', '')), pagina: URLS.cestaPagina(ultimoMes.replace('-', '')) }
  };
}

/**
 * Monta o documento final a partir das séries brutas. Função pura (sem internet): é a que os testes exercitam.
 * brutos: { gasolina: { semanal, mensal, estados } | null, dolar: [[data, valor]] | null, cesta: cache | null }
 */
export function montarPrecos({ brutos, hoje, erros = [] }) {
  const janela = janelaDe48Meses(hoje);
  const doc = {
    versao: 1, geradoEm: hoje.toISOString(), aviso: AVISO_PRECOS,
    mandatos: MANDATOS.map((m) => ({ ...m, emCurso: !m.fim })),
    janela: { de: janela.de, ate: janela.ate, meses: janela.meses },
    fontes: {
      gasolina: { nome: 'Gasolina comum, preço médio de revenda (R$/litro)', fonte: 'ANP — Levantamento de Preços de Combustíveis', orgao: 'Agência Nacional do Petróleo, Gás Natural e Biocombustíveis', url: URLS.anpSemanalBrasil, urls: { semanal: URLS.anpSemanalBrasil, mensal: URLS.anpMensalBrasil, estados: URLS.anpMensalEstados }, limitacoes: 'Média de postos pesquisados; a semana vai de domingo a sábado. Por estado, o Placar usa a série mensal (a semanal por estado não é lida).' },
      dolar: { nome: 'Dólar comercial, PTAX de venda (R$)', fonte: 'Banco Central do Brasil — PTAX (serviço Olinda)', orgao: 'Banco Central do Brasil', url: URLS.ptaxDocumentacao, limitacoes: 'Uma cotação por dia útil. A variação mensal compara com o mesmo dia do mês anterior (ou o pregão anterior a ele). Licença do serviço: ODbL.' },
      cesta: { nome: 'Cesta básica de alimentos, valor por capital (R$)', fonte: 'DIEESE / Conab — Pesquisa Nacional da Cesta Básica de Alimentos', orgao: 'DIEESE, em parceria com a Conab', url: 'https://www.dieese.org.br/', limitacoes: 'O DIEESE publica a tabela só em PDF; o Placar lê o texto do PDF. O número de capitais pesquisadas mudou ao longo dos anos (segundo o DIEESE, passou de 17 para 27 com divulgação a partir de agosto de 2025): cada mês mostra só as capitais cujo valor foi lido naquele PDF. Mês cujo PDF só tem imagem fica como lacuna. A composição da cesta é diferente no Norte e no Nordeste, então valores de capitais dessas regiões não são comparáveis ponto a ponto com as demais.' }
    },
    erros
  };
  doc.gasolina = brutos.gasolina?.mensal?.length ? montarGasolina(brutos.gasolina, hoje, janela) : null;
  doc.dolar = brutos.dolar?.length ? montarDolar(brutos.dolar, hoje, janela) : null;
  doc.cesta = brutos.cesta ? montarCesta(brutos.cesta, hoje, janela) : null;
  if (doc.cesta) doc.fontes.cesta.url = doc.cesta.atual.pagina;
  doc.situacao = { gasolina: !!doc.gasolina, dolar: !!doc.dolar, cesta: !!doc.cesta };
  return doc;
}

/* ----------------------------- passo da rotina diária ----------------------------- */

/**
 * Busca as três fontes e grava site/dados/precos.json. Cada fonte é isolada: se uma falhar, as outras seguem e
 * a série daquela fonte continua a do último arquivo bom (sem inventar nada). Na planilha por estado,
 * se falhar, os estados somem até a próxima coleta bem-sucedida.
 */
export async function atualizarPrecos({ json, binario, pasta, hoje, orcamentoMs = 600000, log = () => {}, inflar = inflarNode }) {
  const arq = (n) => path.join(pasta, n);
  const anterior = lerJsonSeExistir(arq('precos.json'));
  const erros = [];
  const brutos = { gasolina: null, dolar: null, cesta: null };

  try {
    log('Preços: baixando as planilhas da gasolina (ANP)...');
    const [sem, mens, est] = await Promise.all([binario(URLS.anpSemanalBrasil), binario(URLS.anpMensalBrasil), binario(URLS.anpMensalEstados).catch((e) => { erros.push('gasolina por estado: ' + e.message); return null; })]);
    brutos.gasolina = { semanal: lerGasolinaSemanal(sem), mensal: lerGasolinaMensal(mens), estados: est ? lerGasolinaEstados(est) : {} };
    if (!brutos.gasolina.mensal.length || !brutos.gasolina.semanal.length) throw new Error('planilha da ANP sem linhas de gasolina comum');
  } catch (e) {
    erros.push('gasolina: ' + e.message);
    log('Preços: gasolina FALHOU. ' + e.message);
    const g = anterior?.gasolina;
    brutos.gasolina = g ? { semanal: g.semanal, mensal: g.mensal, estados: Object.fromEntries(Object.entries(g.estados || {}).map(([uf, x]) => [uf, x.mensal])) } : null;
  }
  if (brutos.gasolina && !Object.keys(brutos.gasolina.estados || {}).length && anterior?.gasolina?.estados) {
    brutos.gasolina.estados = Object.fromEntries(Object.entries(anterior.gasolina.estados).map(([uf, x]) => [uf, x.mensal]));
  }

  try {
    log('Preços: baixando o dólar (PTAX, Banco Central)...');
    brutos.dolar = await lerPtax(json, '2016-01-01', hoje.toISOString().slice(0, 10));
    if (!brutos.dolar.length) throw new Error('PTAX sem cotações');
  } catch (e) {
    erros.push('dólar: ' + e.message);
    log('Preços: dólar FALHOU. ' + e.message);
    brutos.dolar = anterior?.dolar?.diario || null;
  }

  let cesta = lerJsonSeExistir(arq('anos/cesta-pdf.json')) || { meses: {} };
  try {
    log('Preços: lendo os PDFs mensais da cesta básica (DIEESE) que faltam...');
    const r = await coletarCesta({ binario, cache: cesta, hoje, orcamentoMs, log, inflar });
    cesta = { aviso: 'Valores lidos do texto dos PDFs mensais do DIEESE. Guardado para não baixar de novo.', meses: r.meses };
    gravarJson(arq('anos/cesta-pdf.json'), cesta);
    log(`Preços: cesta — ${r.feitos} PDFs lidos, ${r.falhas} falhas${r.parouPorTempo ? ' (parou por tempo; continua amanhã)' : ''}.`);
    if (r.falhas) erros.push(`cesta: ${r.falhas} PDFs com erro`);
  } catch (e) {
    erros.push('cesta: ' + e.message);
    log('Preços: cesta FALHOU. ' + e.message);
  }
  brutos.cesta = cesta;

  const doc = montarPrecos({ brutos, hoje, erros });
  const ok = doc.situacao.gasolina || doc.situacao.dolar || doc.situacao.cesta;
  if (ok) gravarJson(arq('precos.json'), doc);
  return { ok, situacao: doc.situacao, erros, ultimo: { gasolina: doc.gasolina?.atual?.semana?.fim || null, dolar: doc.dolar?.atual?.d || null, cesta: doc.cesta?.atual?.mes || null } };
}
