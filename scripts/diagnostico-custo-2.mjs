// Diagnóstico de LEITURA nº 2: o que o Portal da Câmara publica, deputado por deputado, para somar o custo.
//
// O primeiro diagnóstico mostrou que a verba de gabinete (71% do custo) e a moradia só aparecem no Portal, sem
// arquivo para baixar, e que o arquivo anual da cota (CEAP) está incompleto (faltam tipos como "PASSAGEM AÉREA - SIGEPA").
// Este segundo diagnóstico responde às perguntas que ficaram em aberto:
//   1. Abrindo a página do Portal com UM deputado escolhido, aparecem a verba de gabinete, a remuneração e as viagens dele?
//   2. Quanto tempo leva ler os 513 deputados em 4 anos, pedido a pedido?
//   3. A lista de moradia do Portal está completa (soma igual ao total do Portal) e o que ela diz do imóvel funcional?
//   4. A página individual de remuneração do deputado existe, abre sem bloqueio e mostra ajuda de custo ou auxílios?
//   5. O CSV completo da cota do Portal explica a diferença do arquivo anual (por tipo de despesa e por estado)?
//   6. Dá para ligar o nome do Portal ao código do deputado? A API de despesas por deputado é completa?
//   7. Onde estão (se estiverem) plano de saúde, ajuda de custo e serviço gráfico por deputado?
//
// DECISÕES já tomadas e respeitadas aqui: o imóvel funcional NÃO recebe valor estimado (se o Portal não publica o valor
// em reais, o relatório só informa isso); itens sem valor por deputado ficam "não medido" (a explicação irá à Metodologia).
//
// O que NÃO faz: não calcula nota, não lê nem grava nada em site/dados, não altera o repositório, não publica.
// Dados pessoais: nunca imprime nomes de pessoas nem CPF; deputados aparecem só pelo código; remuneração de
// secretários não é lida. Só cabeçalhos, contagens, somas e faixas de valores.
//
// Uso: node scripts/diagnostico-custo-2.mjs
// Variáveis opcionais (servem só para teste ou para mudar o recorte):
//   DIAG_ANOS=2025,2026        anos da cota (padrão: o ano passado e o atual)
//   DIAG_DEPUTADOS=1,2,3       códigos dos deputados lidos um a um (padrão: 3 com gasto baixo, médio e alto)
//   DIAG_SAIDA=pasta           onde gravar o relatório (padrão: diagnostico2)
//   DIAG_PORTAL, DIAG_WWW2, DIAG_API, DIAG_CEAP   endereços-base (usados nos testes)
//   DIAG_ESPERA_MS=600         pausa entre pedidos ao Portal      DIAG_PAGINAS_MORADIA=60   limite de páginas da lista de moradia
//   DIAG_LEG=57                legislatura

import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { esperar, lerDoZip, normalizar, percorrerCsv } from './util.mjs';

const semBarra = (s) => String(s).replace(/\/+$/, '');
const PORTAL = semBarra(process.env.DIAG_PORTAL || 'https://www.camara.leg.br');
const WWW2 = semBarra(process.env.DIAG_WWW2 || 'https://www2.camara.leg.br');
const API = semBarra(process.env.DIAG_API || 'https://dadosabertos.camara.leg.br/api/v2');
const CEAP = semBarra(process.env.DIAG_CEAP || 'https://www.camara.leg.br/cotas');
const SAIDA = process.env.DIAG_SAIDA || 'diagnostico2';
const ESPERA_MS = Number(process.env.DIAG_ESPERA_MS ?? 600);
const MAX_PAG_MORADIA = Number(process.env.DIAG_PAGINAS_MORADIA || 60);
const LEG = process.env.DIAG_LEG || '57';
const anoAtual = new Date().getFullYear();
const ANOS = (process.env.DIAG_ANOS || `${anoAtual - 1},${anoAtual}`).split(',').map((s) => Number(s.trim())).filter(Boolean);
const UA = 'placar-publico/1.0 (projeto de transparencia; leitura de dados publicos)';
const MESES_PORTAL = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

// ---------- relatório ----------
const L = [];
let reNomes = null;
const nomesProibidos = new Set();
const escapar = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Rede de segurança: nomes de pessoas lidos das páginas e qualquer sequência parecida com CPF são trocados antes de entrar no relatório. */
function proibir(nomes) {
  let mudou = false;
  for (const n of nomes) {
    const t = String(n || '').trim();
    if (t.length >= 6 && !nomesProibidos.has(t)) { nomesProibidos.add(t); mudou = true; }
  }
  if (mudou) reNomes = new RegExp([...nomesProibidos].sort((a, b) => b.length - a.length).map(escapar).join('|'), 'gi');
}
const mascarar = (s) => {
  let t = String(s).replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf omitido]');
  if (reNomes) t = t.replace(reNomes, '[nome omitido]');
  return t;
};
const p = (s = '') => L.push(mascarar(s));
const secao = (t) => { p(); p('='.repeat(80)); p(t); p('='.repeat(80)); };
let N_CABECALHO = 0;
const checagens = [];
const checar = (ok, texto) => checagens.push({ ok, texto });
const fmt = (n) => Number(n).toLocaleString('pt-BR');
const reais = (n) => 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const corta = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
const pct = (x) => `${(x * 100).toFixed(1).replace('.', ',')}%`;

function quantil(v, q) {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
const faixa = (v, casas = 2) => {
  if (!v.length) return 'sem dados';
  const f = (q) => quantil(v, q).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return `mín ${f(0)} · 25% ${f(0.25)} · mediana ${f(0.5)} · 75% ${f(0.75)} · máx ${f(1)}`;
};
const soma = (v) => v.reduce((a, b) => a + b, 0);

// ---------- rede ----------
const pedidos = [];
async function pegar(url, { limiteMs = 60000, maxBytes = 80 * 1024 * 1024, tentativas = 2 } = {}) {
  let ultimo = null;
  for (let i = 0; i < tentativas; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), limiteMs);
    const inicio = Date.now();
    try {
      const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': UA, accept: '*/*' } });
      const base = { url, urlFinal: r.url || url, status: r.status, tipo: (r.headers.get('content-type') || '').toLowerCase() };
      if (r.status >= 500 && i < tentativas - 1) { await esperar(1500 * (i + 1)); continue; }
      const tamanho = Number(r.headers.get('content-length') || 0);
      if (tamanho > maxBytes) { pedidos.push({ ...base, bytes: tamanho }); return { ...base, bytes: tamanho, grande: true, buf: null, ms: Date.now() - inicio }; }
      const buf = Buffer.from(await r.arrayBuffer());
      const ms = Date.now() - inicio;
      pedidos.push({ ...base, bytes: buf.length, ms });
      return { ...base, bytes: buf.length, buf, ms };
    } catch (e) {
      ultimo = e;
      await esperar(1000 * (i + 1));
    } finally {
      clearTimeout(t);
    }
  }
  const erro = String((ultimo && ultimo.message) || ultimo);
  pedidos.push({ url, status: 0, tipo: '', bytes: 0, erro });
  return { url, erro };
}
const falhou = (r) => Boolean(r.erro) || r.status >= 400 || !r.buf;
const motivo = (r) => r.erro || (r.grande ? 'arquivo grande demais' : `HTTP ${r.status}${r.status === 403 || r.status === 429 ? ' (o site pode estar bloqueando leitura automática)' : ''}`);

function decodificar(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { /* tenta a próxima */ }
  return new TextDecoder('windows-1252').decode(buf);
}

// ---------- HTML ----------
const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
function textoLimpo(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTIDADES[m])
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}
const titulo = (html) => { const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html); return m ? textoLimpo(m[1]).slice(0, 150) : '(sem título)'; };
const resolver = (href, base) => { try { return new URL(String(href).replace(/&amp;/g, '&').trim(), base).href; } catch { return null; } };

function extrairLinks(html, base) {
  const saida = [];
  const re = /<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = (m[1] ?? m[2] ?? '').trim();
    if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) continue;
    const url = resolver(href, base);
    if (url) saida.push({ url, texto: textoLimpo(m[3]).slice(0, 100) });
  }
  return saida;
}

function parseNum(s) {
  s = String(s ?? '').trim().replace(/^R\$\s*/, '');
  if (!s) return NaN;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+,\d+$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return NaN;
}
/** Valor em reais dentro de um texto qualquer ("Recebeu: R$ 1.134,13"). */
const valorReais = (s) => { const m = /R\$\s*(-?[\d.]+,\d{2})/.exec(String(s)); return m ? parseNum(m[1]) : NaN; };

function extrairFormularios(html) {
  const saida = [];
  const re = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let m;
  while ((m = re.exec(html))) {
    const acao = /action\s*=\s*["']([^"']*)["']/i.exec(m[1]);
    const metodo = /method\s*=\s*["']([^"']*)["']/i.exec(m[1]);
    const nomes = [...m[2].matchAll(/<(?:input|select|textarea)\b[^>]*\bname\s*=\s*["']?([\w-]+)["']?/gi)].map((x) => x[1]);
    saida.push({ acao: acao ? acao[1] : '(sem action)', metodo: metodo ? metodo[1] : 'get', campos: [...new Set(nomes)].slice(0, 30) });
  }
  return saida;
}

function selects(html) {
  const saida = {};
  const re = /<select\b[^>]*\bname\s*=\s*["']?([\w-]+)["']?[^>]*>([\s\S]*?)<\/select>/gi;
  let m;
  while ((m = re.exec(html))) {
    const opcoes = [];
    const ro = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
    let o;
    while ((o = ro.exec(m[2]))) {
      const v = /value\s*=\s*["']([^"']*)["']/i.exec(o[1]);
      opcoes.push({ valor: v ? v[1] : '', texto: textoLimpo(o[2]) });
    }
    saida[m[1]] = opcoes;
  }
  return saida;
}

/** Tabelas da página, cada uma com a seção e o título que vêm antes dela. */
function tabelasHtml(html) {
  const marcas = [];
  const reM = /<(h[1-4]|span)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = reM.exec(html))) {
    const tag = m[1].toLowerCase();
    const dentro = `${m[2]} ${m[3]}`;
    const ehSecao = /g-titulo-secao__texto|titulo-secao__texto/.test(dentro);
    const ehSub = /g-titulo-subsecao__texto|card__titulo-texto/.test(dentro);
    if (tag === 'span' && !ehSecao && !ehSub) continue;
    const txt = textoLimpo(m[3]);
    if (txt) marcas.push({ pos: m.index, txt, secao: ehSecao });
  }
  const tabelas = [];
  const reT = /<table\b([^>]*)>([\s\S]*?)<\/table>/gi;
  let t;
  while ((t = reT.exec(html))) {
    const antes = marcas.filter((x) => x.pos < t.index);
    const sec = [...antes].reverse().find((x) => x.secao);
    const tit = antes[antes.length - 1];
    const id = /\bid\s*=\s*["']([^"']*)["']/i.exec(t[1]);
    let cabecalho = [];
    const linhas = [];
    const hrefs = [];
    const reR = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let r;
    while ((r = reR.exec(t[2]))) {
      const celulas = [...r[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((c) => ({ tag: c[1].toLowerCase(), txt: textoLimpo(c[2]), html: c[2] }));
      if (!celulas.length) continue;
      if (celulas.every((c) => c.tag === 'th')) { if (!cabecalho.length) cabecalho = celulas.map((c) => c.txt); continue; }
      linhas.push(celulas.map((c) => c.txt));
      const h = /href\s*=\s*["']([^"']*)["']/i.exec(r[1]);
      hrefs.push(h ? h[1] : '');
    }
    tabelas.push({ id: id ? id[1] : '', secao: sec ? sec.txt : '', titulo: tit ? tit.txt : '', cabecalho, linhas, hrefs });
  }
  return tabelas;
}
const rotuloTabela = (t) => `${t.secao || '(sem seção)'} › ${t.titulo || '(sem título)'}${t.id ? ` [#${t.id}]` : ''}`;
function imprimirTabela(t, maxLinhas = 14, recuo = '      ') {
  p(`${recuo}${rotuloTabela(t)}: ${fmt(t.linhas.length)} linha(s) · colunas: ${t.cabecalho.join(' | ') || '(sem cabeçalho)'}`);
  t.linhas.slice(0, maxLinhas).forEach((l) => p(`${recuo}   ${l.map((c) => corta(c, 38)).join(' | ')}`));
  if (t.linhas.length > maxLinhas) p(`${recuo}   … (mais ${fmt(t.linhas.length - maxLinhas)} linhas)`);
}
const colunaValor = (t) => { const j = t.cabecalho.findIndex((c) => /valor|gasto|total|recebid/i.test(c)); return j >= 0 ? j : 1; };
const somaColuna = (t, j) => soma(t.linhas.map((l) => parseNum(l[j])).filter((x) => !Number.isNaN(x)));

function trechosComReais(texto, max = 8) {
  const saida = [];
  const re = /.{0,80}R\$\s*[\d.]+,\d{2}.{0,30}/g;
  let m;
  while ((m = re.exec(texto)) && saida.length < max) { if (!/\bNome\b.{0,80}\bPartido\b/.test(m[0])) saida.push(m[0].trim()); }
  return saida;
}

/** Guarda uma cópia da página pública lida. CPF é sempre trocado; `nomes` troca nomes de pessoas (páginas de remuneração individual). */
function salvarAmostra(nome, conteudo, nomes = []) {
  try {
    const dir = path.join(SAIDA, 'amostras');
    mkdirSync(dir, { recursive: true });
    let t = String(conteudo).replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf omitido]');
    const ns = nomes.map((n) => String(n || '').trim()).filter((n) => n.length >= 4);
    if (ns.length) t = t.replace(new RegExp(ns.map(escapar).join('|'), 'gi'), '[nome omitido]');
    writeFileSync(path.join(dir, nome), t);
  } catch { /* amostra é opcional */ }
}

// ---------- estado compartilhado entre as etapas ----------
const estado = {
  deputados: [], // { id, nome, partido, uf, chave } lidos do filtro do Portal
  porChave: new Map(), // chave nome|UF -> [ids]
  anosPortal: [],
  totaisPortal: {},
  verbaGeralPorMes: null, // soma da tabela "Gasto mensal" com todos os deputados (para ver se o filtro por deputado funciona)
  escolhidos: null,
  tabelasDeputado: {}, // `${id}|${ano}` -> tabelas
  csvPortal: new Map(),
  ceap: new Map(),
  moradiaComplemento: {}, // ano -> soma do complemento (lista de moradia)
  moradiaPorId: new Map(),
  tempos: []
};
const chaveNome = (nome, uf) => `${normalizar(nome)}|${String(uf || '').toUpperCase()}`;
function lerRotulo(rotulo) {
  const m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(rotulo);
  if (!m) return { nome: rotulo.trim(), partido: '', uf: '' };
  const i = m[2].lastIndexOf('-');
  return { nome: m[1].trim(), partido: i >= 0 ? m[2].slice(0, i) : m[2], uf: i >= 0 ? m[2].slice(i + 1).trim().toUpperCase() : '' };
}
function idsDaChave(nome, uf) { return estado.porChave.get(chaveNome(nome, uf)) || []; }

function lerTotaisPortal(texto) {
  const regras = [
    ['cota', /gasto de todos os deputados com cota[^$]{0,60}\$\s*([\d.]+,\d{2})/i],
    ['verba de gabinete', /gasto de todos os deputados com verba de gabinete[^$]{0,60}\$\s*([\d.]+,\d{2})/i],
    ['moradia', /gasto de todos os deputados com aux[ií]lio-moradia[^$]{0,60}\$\s*([\d.]+,\d{2})/i],
    ['viagens', /gasto de todos os deputados com viagens oficiais[^$]{0,60}\$\s*([\d.]+,\d{2})/i]
  ];
  for (const [k, re] of regras) {
    const m = re.exec(texto);
    if (m && estado.totaisPortal[k] === undefined) estado.totaisPortal[k] = parseNum(m[1]);
  }
}

const URL_FILTRO = (ano, id, mes = '') => `${PORTAL}/transparencia/gastos-parlamentares?legislatura=${LEG}&ano=${ano}&mes=${mes}&por=deputado&deputado=${id}&uf=&partido=`;
const URL_CSV_PORTAL = (ano, mes = '') => `${PORTAL}/transparencia/api/download/tabelaComparativa.csv?legislatura=${LEG}&deputado=&ano=${ano}&por=deputado&mes=${mes}&partido=&uf=`;

// ---------- cota: CSV completo do Portal ----------
async function carregarCsvPortal(ano, mes = '') {
  const chave = `${ano}|${mes}`;
  if (estado.csvPortal.has(chave)) return estado.csvPortal.get(chave);
  const url = URL_CSV_PORTAL(ano, mes);
  const r = await pegar(url, { limiteMs: 120000 });
  let res = { ano, mes, url, erro: null };
  if (falhou(r)) {
    res.erro = motivo(r);
  } else {
    const texto = decodificar(r.buf);
    const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
    const cab = (linhas[0] || '').split(';').map((c) => normalizar(c));
    const ix = (re, padrao) => { const j = cab.findIndex((c) => re.test(c)); return j >= 0 ? j : padrao; };
    const iNome = ix(/^NOME/, 0); const iUF = ix(/^UF$/, 2); const iTipo = ix(/TIPO/, 3); const iVal = ix(/VALOR/, 4);
    res = { ano, mes, url, erro: null, bytes: r.bytes, cabecalho: linhas[0] || '', nLinhas: linhas.length - 1, total: 0, negativos: 0, porTipo: new Map(), porUF: new Map(), porChave: new Map(), porId: new Map(), semLigacao: 0, ambiguos: 0, ligados: 0, chavesDistintas: 0, amostraCabeca: linhas.slice(0, 150).join('\n') };
    for (const l of linhas.slice(1)) {
      const c = l.split(';');
      const v = parseNum(c[iVal]);
      if (Number.isNaN(v)) continue;
      res.total += v;
      if (v < 0) res.negativos++;
      const tipo = String(c[iTipo] ?? '').trim();
      const kt = normalizar(tipo);
      const dt = res.porTipo.get(kt) || { rot: tipo, valor: 0, n: 0 };
      dt.valor += v; dt.n++; res.porTipo.set(kt, dt);
      const uf = String(c[iUF] ?? '').trim().toUpperCase();
      res.porUF.set(uf, (res.porUF.get(uf) || 0) + v);
      const k = chaveNome(c[iNome], uf);
      res.porChave.set(k, (res.porChave.get(k) || 0) + v);
    }
    res.chavesDistintas = res.porChave.size;
    for (const [k, v] of res.porChave) {
      const ids = estado.porChave.get(k) || [];
      if (ids.length === 1) { res.ligados++; res.porId.set(ids[0], (res.porId.get(ids[0]) || 0) + v); } else if (ids.length > 1) res.ambiguos++; else res.semLigacao++;
    }
  }
  estado.csvPortal.set(chave, res);
  return res;
}

// ---------- cota: arquivo anual (CEAP) ----------
async function carregarCeap(ano) {
  if (estado.ceap.has(ano)) return estado.ceap.get(ano);
  const url = `${CEAP}/Ano-${ano}.csv.zip`;
  let res;
  try {
    const r = await pegar(url, { limiteMs: 300000, maxBytes: 400 * 1024 * 1024, tentativas: 3 });
    if (falhou(r)) throw new Error(motivo(r));
    const zip = path.join(tmpdir(), `diag2-ceap-${ano}.zip`);
    writeFileSync(zip, r.buf);
    const texto = lerDoZip(zip, `Ano-${ano}.csv`);
    res = { ano, url, erro: null, nLinhas: 0, total: 0, porTipo: new Map(), porUF: new Map(), porMes: new Map(), porId: new Map(), semId: 0 };
    const dec = (x) => { const v = Number(String(x ?? '').replace(',', '.')); return Number.isNaN(v) ? 0 : v; };
    percorrerCsv(texto, (l, ix) => {
      if (String(l[ix.numAno]) !== String(ano)) return;
      res.nLinhas++;
      const v = dec(l[ix.vlrDocumento]) - dec(l[ix.vlrGlosa]);
      res.total += v;
      const tipo = String(l[ix.txtDescricao] || '(sem descrição)').trim();
      const kt = normalizar(tipo);
      const dt = res.porTipo.get(kt) || { rot: tipo, valor: 0, n: 0 };
      dt.valor += v; dt.n++; res.porTipo.set(kt, dt);
      const uf = String(l[ix.sgUF] || '').trim().toUpperCase();
      res.porUF.set(uf, (res.porUF.get(uf) || 0) + v);
      const mes = Number(l[ix.numMes]) || 0;
      res.porMes.set(mes, (res.porMes.get(mes) || 0) + v);
      const id = l[ix.ideCadastro];
      if (!id) res.semId++; else res.porId.set(String(id), (res.porId.get(String(id)) || 0) + v);
    });
  } catch (e) {
    res = { ano, url, erro: String((e && e.message) || e) };
  }
  estado.ceap.set(ano, res);
  return res;
}

// ---------- ETAPA 1: página geral, lista de deputados e pistas ----------
const PISTAS = /sa[uú]de|m[eé]dic|odont|reembols|ajuda de custo|gr[aá]fic|passaporte|fundo rotativo|dados abertos|csv|\bapi\b|plano de sa/i;
function pistasDeLinks(html, base, max = 20) {
  const hosts = new Set([new URL(PORTAL).host, new URL(WWW2).host, 'dadosabertos.camara.leg.br']);
  const vistos = new Map();
  for (const lk of extrairLinks(html, base)) {
    let host;
    try { host = new URL(lk.url).host; } catch { continue; }
    if (!hosts.has(host) || /\.(png|jpe?g|gif|svg|css|js|ico|woff2?)(\?|#|$)/i.test(lk.url) || /facebook|twitter|instagram|youtube|whatsapp|linkedin|\/noticias|\/agencia/i.test(lk.url)) continue;
    if (!PISTAS.test(`${lk.url} ${lk.texto}`)) continue;
    if (!vistos.has(lk.url)) vistos.set(lk.url, lk);
  }
  return [...vistos.values()].slice(0, max);
}

async function etapaGeral() {
  secao('1. PÁGINA GERAL DO PORTAL: lista de deputados, totais e pistas de outros custos');
  const url = `${PORTAL}/transparencia/gastos-parlamentares`;
  const r = await pegar(url);
  if (falhou(r)) { p(`FALHA em ${url}: ${motivo(r)}`); checar(false, 'A página geral de gastos parlamentares do Portal não abriu.'); return; }
  const html = decodificar(r.buf);
  salvarAmostra('00-portal-geral.html', html.slice(0, 1500000));
  const texto = textoLimpo(html);
  lerTotaisPortal(texto);
  p(`${url}\n   HTTP ${r.status} · ${fmt(r.bytes)} bytes · "${titulo(html)}" · ${fmt(texto.length)} caracteres de texto`);
  const sel = selects(html);
  p(`   Filtros da página (campo: quantidade de opções): ${Object.entries(sel).map(([k, v]) => `${k}: ${v.length}`).join(' · ') || 'nenhum'}`);
  estado.anosPortal = (sel.ano || []).map((o) => Number(o.valor)).filter(Boolean);
  p(`   Anos disponíveis no filtro: ${estado.anosPortal.join(', ') || 'nenhum'} · legislaturas: ${(sel.legislatura || []).map((o) => o.valor).join(', ') || 'nenhuma'}`);
  p(`   Valores do filtro de mês (distintos, primeiros 14): ${[...new Set((sel.mes || []).map((o) => o.valor || '(todos)'))].slice(0, 14).join(', ') || 'nenhum'}`);
  for (const fm of extrairFormularios(html).filter((x) => /deputado|ano|legislatura/.test(x.campos.join(' '))).slice(0, 3)) p(`   formulário do filtro: ${fm.metodo.toUpperCase()} ${fm.acao} · campos: ${fm.campos.join(', ')}`);
  const pistasCodigo = [...new Set((html.match(/["'`][^"'`\s<>]*(?:deputado=|\/api\/|gastos-parlamentares\/)[^"'`\s<>]*["'`]/g) || []).map((x) => x.slice(1, -1)))].slice(0, 12);
  if (pistasCodigo.length) p(`   endereços com "deputado=", "/api/" ou "gastos-parlamentares/" no código da página: ${pistasCodigo.map((x) => corta(x, 90)).join(' | ')}`);
  for (const o of (sel.deputado || []).filter((x) => x.valor)) {
    const d = lerRotulo(o.texto);
    estado.deputados.push({ id: o.valor, ...d, chave: chaveNome(d.nome, d.uf) });
  }
  proibir(estado.deputados.map((d) => d.nome));
  for (const d of estado.deputados) { const a = estado.porChave.get(d.chave) || []; a.push(d.id); estado.porChave.set(d.chave, a); }
  const repetidas = [...estado.porChave.values()].filter((a) => a.length > 1).length;
  p(`   Deputados no filtro: ${fmt(estado.deputados.length)} (inclui quem saiu e os suplentes da legislatura) · chaves nome+UF repetidas (homônimos): ${repetidas}`);
  p(`   Formato do código: ${estado.deputados.slice(0, 5).map((d) => d.id).join(', ')} ...`);
  checar(estado.deputados.length >= 500, `A página geral lista ${fmt(estado.deputados.length)} deputados com código no filtro (esperado: 500 ou mais).`);
  p('');
  p('   Totais do ano lidos no texto da página:');
  for (const rb of ['cota', 'verba de gabinete', 'moradia', 'viagens']) p(`      ${rb}: ${estado.totaisPortal[rb] === undefined ? 'não encontrado no texto' : reais(estado.totaisPortal[rb])}`);
  checar(Object.keys(estado.totaisPortal).length === 4, `A página geral mostra os totais de cota, verba de gabinete, moradia e viagens (${Object.keys(estado.totaisPortal).length} de 4 achados).`);
  const tabelas = tabelasHtml(html);
  const gm = tabelas.find((t) => t.id === 'js-gasto-mensal');
  if (gm) { estado.verbaGeralPorMes = gm.linhas.map((l) => parseNum(l[1])); p(`   Verba de gabinete de TODOS os deputados, por mês (${gm.linhas.length} meses): ${gm.linhas.slice(0, 3).map((l) => `${l[0]} ${l[1]}`).join(' · ')} …`); }
  p('');
  p('   Pistas de saúde, ajuda de custo, serviço gráfico, passaportes e arquivos, nos links da página geral:');
  const pistas = pistasDeLinks(html, r.urlFinal || url, 25);
  if (!pistas.length) p('      nenhuma');
  pistas.forEach((x) => p(`      "${corta(x.texto, 45)}" → ${corta(x.url, 110)}`));

  // Outras páginas onde esses custos poderiam estar.
  const extras = [`${PORTAL}/transparencia`, `${WWW2}/transparencia/prestacao-de-contas`, `${WWW2}/transparencia/recursos-humanos/remuneracao`, `${PORTAL}/moradia`];
  let nPistas = pistas.length;
  for (const u of extras) {
    await esperar(ESPERA_MS);
    p('');
    p(`   Página de apoio: ${u}`);
    const x = await pegar(u);
    if (falhou(x)) { p(`      FALHA: ${motivo(x)}`); continue; }
    const h = decodificar(x.buf);
    if (u === `${PORTAL}/moradia`) estado.paginaMoradia = h;
    salvarAmostra(`apoio-${u.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}.html`, h.slice(0, 600000));
    p(`      HTTP ${x.status} · "${titulo(h)}" · ${fmt(textoLimpo(h).length)} caracteres`);
    const pi = pistasDeLinks(h, x.urlFinal || u, 15);
    nPistas += pi.length;
    pi.forEach((l) => p(`      "${corta(l.texto, 45)}" → ${corta(l.url, 110)}`));
  }
  p('');
  p('   Itens que a Câmara lista entre os direitos do deputado e que podem NÃO ter valor por deputado: plano de saúde/Pró-Saúde (atendimento médico e odontológico),');
  p('   serviço gráfico, ajudas de custo (início e fim do mandato) e encargos dos secretários (13º, férias, auxílio-alimentação) pagos fora da verba.');
  p('   Se nenhuma das páginas acima trouxer valor por deputado, esses itens ficam "não medido" e a Metodologia explica o porquê.');
}

// ---------- ETAPA 2: a página do Portal com um deputado escolhido ----------
async function escolherDeputados() {
  if (estado.escolhidos) return estado.escolhidos;
  let ids = (process.env.DIAG_DEPUTADOS || '').split(',').map((s) => s.trim()).filter(Boolean);
  let origem = 'definidos pela variável DIAG_DEPUTADOS';
  if (!ids.length) {
    const csv = await carregarCsvPortal(anoAtual, '');
    if (!csv.erro && csv.porId.size >= 3) {
      const ord = [...csv.porId.entries()].sort((a, b) => a[1] - b[1]);
      ids = [0.05, 0.5, 0.95].map((q) => ord[Math.min(ord.length - 1, Math.floor(q * ord.length))][0]);
      origem = 'um de gasto baixo, um médio e um alto na cota do ano (posições 5%, 50% e 95%)';
    }
  }
  if (!ids.length && estado.deputados.length >= 3) {
    ids = [0.05, 0.5, 0.95].map((q) => estado.deputados[Math.floor(q * (estado.deputados.length - 1))].id);
    origem = 'por posição na lista do filtro (não deu para usar o gasto da cota)';
  }
  estado.escolhidos = { ids: [...new Set(ids)].slice(0, 3), origem };
  return estado.escolhidos;
}

/** Separa as tabelas por assunto: primeiro pelo cabeçalho e pela seção, depois pelo título. */
function classificarTabela(t) {
  const cab = normalizar(t.cabecalho.join(' '));
  const sec = normalizar(t.secao);
  const tit = normalizar(`${t.titulo} ${t.id}`);
  const por = (s) => (/VERBA/.test(s) ? 'verba' : /REMUNERA|SUBSIDIO/.test(s) ? 'remuneração' : /VIAGE|MISSAO|DIARIA/.test(s) ? 'viagens' : /MORADIA|IMOVE/.test(s) ? 'moradia' : /\bCOTA\b/.test(s) ? 'cota' : null);
  if (/TIPO DE DESPESA/.test(cab)) return 'cota';
  if (/LIMITE DA VERBA/.test(cab)) return 'verba';
  return por(sec) || por(tit) || 'outras';
}
function resumoPaginaDeputado(tabs) {
  const mapa = {};
  for (const t of tabs) (mapa[classificarTabela(t)] = mapa[classificarTabela(t)] || []).push(t);
  return mapa;
}

async function etapaPaginaDeputado() {
  secao('2. A PÁGINA DO PORTAL COM UM DEPUTADO ESCOLHIDO (verba de gabinete, remuneração, viagens)');
  const { ids, origem } = await escolherDeputados();
  if (!ids.length) { p('Não consegui escolher deputados (lista do filtro vazia e CSV da cota indisponível).'); checar(false, 'Não deu para escolher deputados para ler a página individual.'); return; }
  p(`Deputados lidos (só pelo código): ${ids.join(', ')} · critério: ${origem}`);
  const valida = estado.anosPortal.length ? estado.anosPortal : [anoAtual, anoAtual - 1, 2023];
  const anos = [...new Set([anoAtual, anoAtual - 1, 2023])].filter((a) => valida.includes(a));
  p(`Anos lidos por deputado: ${anos.join(', ')} · endereço: ${URL_FILTRO('AAAA', 'CÓDIGO')}`);
  let primeiro = true;
  const verbaPorAno = new Map(); // ano -> assinatura da tabela mensal (para ver se o ano muda os valores)
  let algumaVerba = false; let algumaRemuneracao = false; let algumaViagem = false; let filtroFunciona = null; let moradiaNaPagina = false;
  for (const id of ids) {
    for (const ano of anos) {
      if (!primeiro) await esperar(ESPERA_MS);
      const url = URL_FILTRO(ano, id);
      const r = await pegar(url, { limiteMs: 90000 });
      p('');
      p(`[deputado ${id} · ${ano}] ${r.ms !== undefined ? `${fmt(r.ms)} ms · ` : ''}${falhou(r) ? `FALHA: ${motivo(r)}` : `HTTP ${r.status} · ${fmt(r.bytes)} bytes`}`);
      if (falhou(r)) continue;
      estado.tempos.push(r.ms);
      const html = decodificar(r.buf);
      salvarAmostra(`portal-deputado-${id}-${ano}.html`, html.slice(0, 1500000));
      const texto = textoLimpo(html);
      const tabs = tabelasHtml(html);
      estado.tabelasDeputado[`${id}|${ano}`] = tabs;
      const mapa = resumoPaginaDeputado(tabs);
      p(`   página: "${titulo(html)}" · ${fmt(texto.length)} caracteres · ${tabs.length} tabela(s) · seções por tipo: ${Object.entries(mapa).map(([k, v]) => `${k} ${v.length}`).join(' · ') || 'nenhuma'}`);
      const verba = tabs.find((t) => t.id === 'js-gasto-mensal') || (mapa.verba || []).find((t) => t.cabecalho.some((c) => /^m[eê]s$/i.test(c)) && t.linhas.length) || (mapa.verba || []).find((t) => t.linhas.length);
      if (verba && verba.linhas.length) {
        algumaVerba = true;
        const j = colunaValor(verba);
        const total = somaColuna(verba, j);
        verbaPorAno.set(`${id}|${ano}`, verba.linhas.map((l) => l[j]).join(';'));
        p(`   VERBA DE GABINETE do deputado: ${verba.linhas.length} meses, soma ${reais(total)}`);
        if (primeiro) imprimirTabela(verba, 14);
        if (estado.verbaGeralPorMes && ano === anoAtual) {
          const geral = soma(estado.verbaGeralPorMes.filter((x) => !Number.isNaN(x)));
          const mesmo = Math.abs(total - geral) < 1;
          if (filtroFunciona === null) filtroFunciona = !mesmo;
          p(`   (a verba de TODOS os deputados no ano é ${reais(geral)}; a do deputado ${mesmo ? 'é IGUAL, ou seja, o filtro por deputado foi ignorado' : `é ${pct(total / geral)} dela, o filtro funcionou`})`);
        }
      } else p('   verba de gabinete: NÃO apareceu tabela de verba nesta página.');
      const rem = (mapa['remuneração'] || []).filter((t) => t.linhas.length);
      if (rem.length) { algumaRemuneracao = true; if (primeiro) rem.slice(0, 2).forEach((t) => imprimirTabela(t, 10)); else p(`   remuneração: ${rem.length} tabela(s) com ${rem.map((t) => t.linhas.length).join(' e ')} linha(s) (conteúdo igual ao já mostrado acima? ${rem.map((t) => t.linhas.map((l) => l.join('|')).join(';')).join('##') === estado.assinaturaRem ? 'sim' : 'não'})`); if (primeiro) estado.assinaturaRem = rem.map((t) => t.linhas.map((l) => l.join('|')).join(';')).join('##'); } else p('   remuneração: não há tabela de remuneração nesta página.');
      const via = (mapa.viagens || []).filter((t) => t.linhas.length);
      if (via.length) { algumaViagem = true; if (primeiro) via.slice(0, 2).forEach((t) => imprimirTabela(t, 10)); else p(`   viagens: ${via.length} tabela(s) com ${via.map((t) => t.linhas.length).join(' e ')} linha(s)`); } else p('   viagens: não há tabela de viagens nesta página.');
      if ((mapa.moradia || []).some((t) => t.linhas.length)) moradiaNaPagina = true;
      if (primeiro) {
        p('   Todas as tabelas da página (seção › título [id]: linhas):');
        tabs.forEach((t) => p(`      ${rotuloTabela(t)}: ${t.linhas.length} linha(s)`));
        p('   Trechos com valor em reais fora das tabelas (primeiros):');
        trechosComReais(texto, 8).forEach((x) => p(`      ${corta(x, 150)}`));
      }
      // Cota do deputado: soma da tabela por tipo contra o CSV completo do Portal.
      if (ano === anoAtual) {
        const csv = estado.csvPortal.get(`${anoAtual}|`);
        const tc = (mapa.cota || []).find((t) => /tipo de despesa/i.test(t.cabecalho.join(' ')) && t.linhas.length > 1);
        if (tc && csv && !csv.erro && csv.porId.has(id)) {
          const somaPagina = somaColuna(tc, colunaValor(tc));
          p(`   Cota na página: ${reais(somaPagina)} · no CSV completo do Portal (mesmo deputado): ${reais(csv.porId.get(id))}`);
        }
      }
      primeiro = false;
    }
  }
  if (filtroFunciona === false && estado.verbaGeralPorMes) {
    p('');
    p('O filtro por deputado foi ignorado no endereço usado. Testando outras formas de endereço (primeiro deputado, ano atual):');
    const geral = soma(estado.verbaGeralPorMes.filter((x) => !Number.isNaN(x)));
    const VARIANTES = [
      ['formulário completo (com "ordem")', (a, id) => `${PORTAL}/transparencia/gastos-parlamentares?legislatura=${LEG}&ano=${a}&mes=&deputado=${id}&uf=&partido=&por=deputado&ordem=desc`],
      ['sem o campo "por"', (a, id) => `${PORTAL}/transparencia/gastos-parlamentares?legislatura=${LEG}&ano=${a}&mes=&deputado=${id}&uf=&partido=`],
      ['só deputado e ano', (a, id) => `${PORTAL}/transparencia/gastos-parlamentares?deputado=${id}&ano=${a}`]
    ];
    let acharam = null;
    for (const [nome, fn] of VARIANTES) {
      await esperar(ESPERA_MS);
      const r = await pegar(fn(anoAtual, ids[0]));
      if (falhou(r)) { p(`   ${nome}: FALHA ${motivo(r)}`); continue; }
      const tb = tabelasHtml(decodificar(r.buf));
      const v = tb.find((t) => t.id === 'js-gasto-mensal');
      const total = v ? somaColuna(v, colunaValor(v)) : null;
      const filtrou = total !== null && Math.abs(total - geral) >= 1;
      p(`   ${nome}: ${total === null ? 'sem tabela de verba' : `verba somada ${reais(total)} → ${filtrou ? 'FILTROU por deputado' : 'ainda mostra a de todos'}`}`);
      if (filtrou && !acharam) acharam = nome;
    }
    checar(Boolean(acharam), acharam ? `Uma forma de endereço que filtra por deputado funciona: ${acharam}.` : `Nenhuma das ${VARIANTES.length} formas de endereço testadas filtrou a verba por deputado; a página provavelmente depende de script no navegador (próximo passo: achar o endereço que o script chama).`);
  }
  p('');
  const medio = estado.tempos.length ? soma(estado.tempos) / estado.tempos.length : null;
  if (medio !== null) {
    const nPedidos = 513 * 4;
    const minutos = (nPedidos * (medio + ESPERA_MS)) / 60000;
    p(`Tempo médio por página de deputado: ${fmt(Math.round(medio))} ms (+ ${ESPERA_MS} ms de pausa). Ler 513 deputados × 4 anos = ${fmt(nPedidos)} pedidos ≈ ${fmt(Math.round(minutos))} minutos${minutos > 60 ? ' (mais que uma hora)' : ''}. Com 4 pedidos em paralelo ≈ ${fmt(Math.round(minutos / 4))} minutos.`);
    checar(minutos <= 180, `Ler a página de cada deputado nos 4 anos leva cerca de ${fmt(Math.round(minutos))} minutos em sequência (${fmt(Math.round(minutos / 4))} com 4 em paralelo); o limite do GitHub Actions por tarefa é 6 horas.`);
  }
  checar(algumaVerba, `A página do Portal com UM deputado escolhido ${algumaVerba ? 'mostra a verba de gabinete dele mês a mês (tabela legível pelo robô).' : 'NÃO mostra tabela de verba de gabinete; o custo de gabinete por deputado ficaria sem fonte.'}`);
  if (filtroFunciona !== null) checar(filtroFunciona, `O filtro por deputado ${filtroFunciona ? 'muda a tabela de verba (os valores são do deputado, não de todos).' : 'foi IGNORADO pela página (a verba mostrada é a de todos os deputados).'}`);
  const assinaturas = [...verbaPorAno.entries()];
  if (assinaturas.length >= 2) {
    const porDep = new Map();
    for (const [k, v] of assinaturas) { const [id] = k.split('|'); if (!porDep.has(id)) porDep.set(id, new Set()); porDep.get(id).add(v); }
    const muda = [...porDep.values()].some((s) => s.size > 1);
    checar(muda, `O parâmetro "ano" ${muda ? 'muda os valores da verba (cada ano devolve a sua tabela).' : 'NÃO mudou a tabela de verba entre os anos lidos; confira se a página respeita o ano.'}`);
  }
  p(`Resumo: verba ${algumaVerba ? 'sim' : 'NÃO'} · remuneração ${algumaRemuneracao ? 'sim' : 'NÃO'} · viagens ${algumaViagem ? 'sim' : 'NÃO'} · moradia ${moradiaNaPagina ? 'sim' : 'NÃO'} (na página individual de gastos parlamentares).`);
  checar(algumaRemuneracao, `A página de gastos com um deputado escolhido ${algumaRemuneracao ? 'traz tabela de remuneração.' : 'NÃO traz a remuneração dele (a fonte dela seria a página individual de recursos humanos, etapa 4).'}`);
  checar(algumaViagem, `A página de gastos com um deputado escolhido ${algumaViagem ? 'traz tabela de viagens.' : 'NÃO traz viagens oficiais (fonte própria em /missao-oficial, sem arquivo).'}`);
}

// ---------- ETAPA 3: moradia ----------
function lerLinhasMoradia(html, base) {
  const tabs = tabelasHtml(html);
  const t = tabs.find((x) => x.cabecalho.some((c) => /aux[ií]lio-moradia/i.test(c)) || x.cabecalho.some((c) => /ocupa[cç][aã]o/i.test(c)));
  if (!t) return { linhas: [], total: null };
  const linhas = [];
  t.linhas.forEach((l, i) => {
    const href = t.hrefs[i] || '';
    const mId = /(\d+)\s*$/.exec(href.split(/[?#]/)[0]);
    const dias = /(\d+)\s*dias?/i.exec(l[1] || '');
    const aux = valorReais(l[2]);
    const comp = valorReais(l[3]);
    linhas.push({ id: mId ? mId[1] : null, href: href ? resolver(href, base) : null, dias: dias ? Number(dias[1]) : 0, aux: Number.isNaN(aux) ? 0 : aux, comp: Number.isNaN(comp) ? 0 : comp });
  });
  const tot = /de\s+([\d.]+)\s+encontrados/i.exec(textoLimpo(html));
  return { linhas, total: tot ? parseNum(tot[1]) : null };
}

async function lerListaMoradia(ini, fim) {
  const todas = [];
  let totalInformado = null; let paginas = 0; let motivoFim = 'limite de páginas';
  let anterior = null;
  for (let pg = 1; pg <= MAX_PAG_MORADIA; pg++) {
    if (pg > 1) await esperar(ESPERA_MS);
    const url = `${PORTAL}/moradia/detalhamento?legislatura=${LEG}&deputado=Todos&situacao=todos&cargo=deputado&ordenacao=nome&dataInicial=${ini}&dataFinal=${fim}&pagina=${pg}`;
    const r = await pegar(url, { limiteMs: 90000 });
    if (falhou(r)) { motivoFim = `falha na página ${pg}: ${motivo(r)}`; break; }
    paginas++;
    const html = decodificar(r.buf);
    if (pg === 1) salvarAmostra(`moradia-lista-${ini.replace('/', '-')}-${fim.replace('/', '-')}-p1.html`, html.slice(0, 600000));
    const { linhas, total } = lerLinhasMoradia(html, r.urlFinal || url);
    if (total !== null) totalInformado = total;
    if (!linhas.length) { motivoFim = 'página sem linhas'; break; }
    const assinatura = linhas.map((x) => x.id).join(',');
    if (assinatura === anterior) { motivoFim = 'página repetida (a paginação não avança)'; break; }
    anterior = assinatura;
    todas.push(...linhas);
    if (totalInformado !== null && todas.length >= totalInformado) { motivoFim = 'todas as linhas informadas foram lidas'; break; }
  }
  return { linhas: todas, totalInformado, paginas, motivoFim };
}

function descreverPaginaMoradiaDeputado(html) {
  const tabs = tabelasHtml(html);
  const t = tabs.find((x) => x.cabecalho.some((c) => /tipo de recebimento/i.test(c)));
  const linhas = [];
  if (!t) return { linhas, achou: false };
  const reR = /<tr\b[^>]*class="[^"]*tabela-responsiva__linha[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  // percorre o HTML da tabela original para separar tipo, período e valor
  const inicio = html.search(/<table[^>]*tabela-responsiva/i);
  const bruto = inicio >= 0 ? html.slice(inicio) : html;
  let m;
  while ((m = reR.exec(bruto))) {
    const tit = /tipo-de-recebimento__titulo[^>]*>([\s\S]*?)<\/span>/i.exec(m[1]);
    const per = /De\s+(\d{2})\/(\d{2})\/(\d{4})\s+a\s+(\d{2})\/(\d{2})\/(\d{4})/i.exec(textoLimpo(m[1]));
    let dias = 0;
    if (per) dias = Math.round((Date.UTC(+per[6], +per[5] - 1, +per[4]) - Date.UTC(+per[3], +per[2] - 1, +per[1])) / 86400000) + 1;
    linhas.push({ tipo: normalizar(textoLimpo(tit ? tit[1] : '')), dias, valor: valorReais(textoLimpo(m[1])) });
  }
  return { linhas, achou: true };
}

async function etapaMoradia() {
  secao('3. MORADIA: lista do Portal (todos os deputados) e página de cada deputado');
  const periodos = [[`01/${anoAtual}`, `12/${anoAtual}`, `ano de ${anoAtual}`], ['02/2023', '01/2027', 'legislatura inteira']];
  let listaLeg = null;
  for (const [ini, fim, rotulo] of periodos) {
    p('');
    p(`Lista de moradia, ${rotulo} (${ini} a ${fim}):`);
    const res = await lerListaMoradia(ini, fim);
    const { linhas } = res;
    p(`   ${fmt(res.paginas)} página(s) lida(s) · ${fmt(linhas.length)} linhas · total informado pela página: ${res.totalInformado === null ? 'não informado' : fmt(res.totalInformado)} · parou por: ${res.motivoFim}`);
    if (!linhas.length) { checar(false, `Moradia, ${rotulo}: não consegui ler linhas da lista.`); continue; }
    const ids = new Set(linhas.map((x) => x.id).filter(Boolean));
    const comAux = linhas.filter((x) => x.aux > 0); const comImovel = linhas.filter((x) => x.dias > 0); const comComp = linhas.filter((x) => x.comp > 0);
    const somaAux = soma(linhas.map((x) => x.aux)); const somaComp = soma(linhas.map((x) => x.comp));
    p(`   deputados distintos (pelo código do link): ${fmt(ids.size)} · linhas sem código: ${linhas.filter((x) => !x.id).length}`);
    p(`   com auxílio-moradia recebido: ${fmt(comAux.length)} · com dias em imóvel funcional: ${fmt(comImovel.length)} · com complemento pela cota: ${fmt(comComp.length)}`);
    p(`   soma do auxílio-moradia: ${reais(somaAux)} · soma do complemento pela cota: ${reais(somaComp)}`);
    p(`   auxílio por deputado (os que receberam): ${faixa(comAux.map((x) => x.aux))}`);
    p(`   dias em imóvel funcional (os que ocuparam): ${faixa(comImovel.map((x) => x.dias), 0)}`);
    const noFiltro = estado.deputados.length ? [...ids].filter((i) => estado.deputados.some((d) => d.id === i)).length : null;
    if (noFiltro !== null) p(`   códigos da lista que existem no filtro da página de gastos: ${fmt(noFiltro)} de ${fmt(ids.size)}`);
    const completo = res.totalInformado !== null && linhas.length >= res.totalInformado;
    checar(completo, `Moradia, ${rotulo}: ${completo ? `li as ${fmt(linhas.length)} linhas informadas pela página (lista completa).` : `li ${fmt(linhas.length)} linhas e a página informa ${res.totalInformado === null ? 'um total que não consegui ler' : fmt(res.totalInformado)}; a lista pode estar incompleta (parou por: ${res.motivoFim}).`}`);
    if (ini === `01/${anoAtual}`) {
      estado.moradiaComplemento[anoAtual] = somaComp;
      const tp = estado.totaisPortal.moradia;
      if (tp !== undefined) {
        const d1 = (somaAux - tp) / tp; const d2 = (somaAux + somaComp - tp) / tp;
        p(`   Conferência com o total de moradia da página geral (${reais(tp)}): só o auxílio difere ${pct(d1)}; auxílio + complemento difere ${pct(d2)}`);
        const ok = Math.abs(d1) <= 0.03 || Math.abs(d2) <= 0.03;
        checar(ok, `Moradia ${anoAtual}: a soma da lista ${ok ? 'bate' : 'NÃO bate'} com o total do Portal (só auxílio ${pct(d1)}; auxílio + complemento ${pct(d2)}; aceito até 3%).`);
      }
    } else { listaLeg = linhas; for (const x of linhas) if (x.id) estado.moradiaPorId.set(x.id, x); }
  }

  // Página individual: imóvel funcional tem valor em reais?
  p('');
  p('Página individual de moradia (período da legislatura inteira):');
  if (!listaLeg) { p('   sem lista da legislatura; não deu para escolher deputados.'); checar(false, 'Moradia: não deu para abrir a página individual (lista da legislatura indisponível).'); return; }
  const comLink = listaLeg.filter((x) => x.href && x.id);
  const escolher = [comLink.find((x) => x.dias > 0 && x.aux === 0), comLink.find((x) => x.aux > 0 && x.dias === 0), comLink.find((x) => x.aux > 0 && x.dias > 0), comLink[0]].filter(Boolean);
  const unicos = [...new Map(escolher.map((x) => [x.id, x])).values()].slice(0, 3);
  let imovelLinhas = 0; let imovelComValor = 0; let auxLinhas = 0; let paginasOk = 0; let bateu = 0; let comparados = 0;
  for (const x of unicos) {
    await esperar(ESPERA_MS);
    const r = await pegar(x.href);
    p(`   [deputado ${x.id}] ${falhou(r) ? `FALHA: ${motivo(r)}` : `HTTP ${r.status} · ${fmt(r.bytes)} bytes`}`);
    if (falhou(r)) continue;
    const html = decodificar(r.buf);
    salvarAmostra(`moradia-deputado-${x.id}.html`, html.slice(0, 600000));
    const d = descreverPaginaMoradiaDeputado(html);
    if (!d.achou) { p('      sem tabela "Tipo de recebimento" reconhecível.'); continue; }
    paginasOk++;
    const por = {};
    for (const l of d.linhas) { const k = l.tipo || '(sem tipo)'; por[k] = por[k] || { n: 0, dias: 0, valores: 0, comValor: 0 }; por[k].n++; por[k].dias += l.dias; if (!Number.isNaN(l.valor)) { por[k].valores += l.valor; por[k].comValor++; } }
    p(`      períodos: ${d.linhas.length} · ${Object.entries(por).map(([k, v]) => `${k}: ${v.n} período(s), ${fmt(v.dias)} dias, ${v.comValor ? `valor em reais em ${v.comValor} (soma ${reais(v.valores)})` : 'sem valor em reais'}`).join(' · ')}`);
    for (const l of d.linhas) {
      if (/IMOVEL/.test(l.tipo)) { imovelLinhas++; if (!Number.isNaN(l.valor)) imovelComValor++; }
      if (/AUXILIO/.test(l.tipo)) auxLinhas++;
    }
    const somaAuxPagina = soma(d.linhas.filter((l) => /AUXILIO/.test(l.tipo) && !Number.isNaN(l.valor)).map((l) => l.valor));
    const naLista = estado.moradiaPorId.get(x.id);
    if (naLista) { comparados++; const ok = Math.abs(somaAuxPagina - naLista.aux) < 1; if (ok) bateu++; p(`      auxílio somado na página do deputado: ${reais(somaAuxPagina)} · na lista geral: ${reais(naLista.aux)} · ${ok ? 'iguais' : 'DIFERENTES'}`); }
  }
  checar(paginasOk > 0, `Moradia: a página individual do deputado ${paginasOk > 0 ? `abre e tem tabela legível (${paginasOk} de ${unicos.length} lidas).` : 'não abriu ou não tem tabela reconhecível.'}`);
  if (comparados) checar(bateu === comparados, `Moradia: o auxílio somado na página individual ${bateu === comparados ? 'é igual ao da lista geral' : 'DIFERE do da lista geral'} (${bateu} de ${comparados} conferidos).`);
  p('');
  if (imovelLinhas) {
    p(`   Imóvel funcional: ${imovelLinhas} período(s) lido(s); ${imovelComValor} com valor em reais. ${imovelComValor === 0 ? 'O Portal publica só o fato (dias e "Apartamento da Câmara"), sem valor em reais.' : 'HÁ valor em reais em alguns períodos; revisar a decisão.'}`);
    checar(imovelComValor === 0, `Imóvel funcional: ${imovelComValor === 0 ? 'o Portal NÃO publica valor em reais por deputado. Conforme a decisão, não será estimado; o perfil e a Metodologia informarão "uso de imóvel funcional: valor não publicado por deputado".' : 'há valor em reais para imóvel funcional em alguns períodos; é preciso revisar a decisão de não estimar.'}`);
  } else {
    p('   Nenhum período de imóvel funcional apareceu nos deputados lidos (não deu para confirmar se há valor).');
    checar(false, 'Imóvel funcional: nenhum período apareceu nas páginas lidas; não deu para confirmar se o Portal publica valor.');
  }
  const mt = estado.paginaMoradia ? textoLimpo(estado.paginaMoradia) : '';
  const citacoes = (mt.match(/[^.!?]{0,100}(im[oó]vel funcional|apartamento)[^.!?]{0,120}R\$[^.!?]{0,60}/gi) || []).slice(0, 5);
  p(`   Texto da página /moradia com valor em reais junto de "imóvel funcional" ou "apartamento": ${citacoes.length ? '' : 'nenhum'}`);
  citacoes.forEach((c) => p(`      ${corta(c.trim(), 200)}`));
}

// ---------- ETAPA 4: remuneração individual do deputado ----------
async function etapaRemuneracao() {
  secao('4. REMUNERAÇÃO INDIVIDUAL DO DEPUTADO (página pública de recursos humanos)');
  const lista = `${PORTAL}/transparencia/recursos-humanos/funcionarios?search=&categoriaFuncional=Deputado&areaDeAtuacao=&situacao=${encodeURIComponent('Em exercício')}`;
  const r = await pegar(lista);
  p(`Listagem de deputados: ${lista}\n   ${falhou(r) ? `FALHA: ${motivo(r)}` : `HTTP ${r.status} · ${fmt(r.bytes)} bytes`}`);
  if (falhou(r)) { checar(false, 'A listagem de deputados de recursos humanos não abriu.'); return; }
  const html = decodificar(r.buf);
  const tabs = tabelasHtml(html);
  const nomesRH = tabs.flatMap((t) => t.linhas.map((l) => l[0])).filter((x) => x && !/^consulta|^ver\b|^detalh/i.test(x));
  proibir(nomesRH);
  salvarAmostra('rh-lista-deputados.html', html.slice(0, 600000), nomesRH);
  const linksConsulta = extrairLinks(html, r.urlFinal || lista).filter((l) => /\/remuneracao\/[^/?#]+\/?$/i.test(new URL(l.url).pathname) && !/relatorios/i.test(l.url));
  const unicos = [...new Map(linksConsulta.map((l) => [l.url, l])).values()];
  const linhasTabela = tabs.reduce((a, t) => a + t.linhas.length, 0);
  p(`   tabelas: ${tabs.length} · linhas de tabela: ${linhasTabela} · links de consulta de remuneração: ${unicos.length}`);
  const tot = /de\s+([\d.]+)\s+(?:encontrados|resultados|registros)/i.exec(textoLimpo(html));
  p(`   total informado pela página: ${tot ? tot[1] : 'não informado'} · há link para próxima página: ${/pr[oó]xima|pagina=2|page=2/i.test(html) ? 'sim' : 'não'}`);
  checar(unicos.length >= 10, `A listagem de deputados de recursos humanos traz ${fmt(unicos.length)} links de consulta individual de remuneração (esperado: ao menos 10 por página).`);
  const alvo = unicos.slice(0, 2);
  const ACHA = /ajuda de custo|aux[ií]lio|indenizat|sa[uú]de|moradia|subs[ií]dio|13[ºo°]|f[eé]rias|vantagens|descontos|l[ií]quid/i;
  let comAuxilio = 0; let abriu = 0;
  for (const lk of alvo) {
    await esperar(ESPERA_MS);
    const x = await pegar(lk.url);
    p('');
    p(`   Consulta individual: ${corta(lk.url.replace(/\/remuneracao\/[^/?#]+/i, '/remuneracao/<código>'), 110)} · ${falhou(x) ? `FALHA: ${motivo(x)}` : `HTTP ${x.status} · ${fmt(x.bytes)} bytes`}`);
    if (falhou(x)) continue;
    const h = decodificar(x.buf);
    salvarAmostra(`rh-consulta-${abriu + 1}.html`, h.slice(0, 600000), nomesRH);
    const t = textoLimpo(h);
    if (!/deputad/i.test(t.slice(0, 6000))) { p('      A página não menciona "deputado" no começo; por precaução o conteúdo não foi impresso (pode ser outro cargo).'); continue; }
    abriu++;
    const tb = tabelasHtml(h);
    p(`      "${corta(titulo(h), 80)}" · ${fmt(t.length)} caracteres · ${tb.length} tabela(s)`);
    tb.slice(0, 6).forEach((tt) => imprimirTabela(tt, 16, '      '));
    const termos = [...new Set((t.match(new RegExp(ACHA.source, 'gi')) || []).map((s) => s.toLowerCase()))];
    p(`      termos de custo encontrados no texto: ${termos.join(', ') || 'nenhum'}`);
    if (/ajuda de custo|aux[ií]lio|indenizat/i.test(t)) comAuxilio++;
    trechosComReais(t, 6).forEach((s) => p(`      ${corta(s, 150)}`));
  }
  checar(abriu > 0, `A página individual de remuneração do deputado ${abriu > 0 ? `abre sem bloqueio (${abriu} lida(s)); ${comAuxilio ? 'cita ajuda de custo, auxílio ou verba indenizatória.' : 'não cita ajuda de custo nem auxílios no texto.'}` : 'não abriu ou não pôde ser lida.'}`);
}

// ---------- ETAPA 5: cota (CSV completo do Portal contra o arquivo anual) ----------
const ALIAS = [['ALUGUEL DE VEICULOS', 'LOCACAO OU FRETAMENTO DE VEICULOS'], ['CONSULTORIA E PESQUISAS', 'CONSULTORIAS PESQUISAS E TRABALHOS TECNICOS']];
function casarTipos(portal, ceap) {
  const kc = [...ceap.keys()];
  const usados = new Set();
  const pares = []; const soPortal = [];
  const pendentes = [];
  for (const [kp, dp] of portal) {
    if (ceap.has(kp)) { usados.add(kp); pares.push({ rot: dp.rot, p: dp.valor, c: ceap.get(kp).valor, via: 'nome igual' }); } else pendentes.push([kp, dp]);
  }
  const restantes = [];
  for (const [kp, dp] of pendentes) {
    const a = ALIAS.find(([x]) => kp.startsWith(x));
    const kc2 = a && kc.find((k) => k.startsWith(a[1]) && !usados.has(k));
    if (kc2) { usados.add(kc2); pares.push({ rot: dp.rot, p: dp.valor, c: ceap.get(kc2).valor, via: 'apelido conhecido' }); } else restantes.push([kp, dp]);
  }
  for (const [kp, dp] of restantes) {
    const cand = kc.filter((k) => (k.startsWith(kp) && kp.length >= 8) || (kp.startsWith(k) && k.length >= 8));
    if (cand.length === 1 && !usados.has(cand[0])) { usados.add(cand[0]); pares.push({ rot: dp.rot, p: dp.valor, c: ceap.get(cand[0]).valor, via: 'início do nome (único)' }); } else soPortal.push({ rot: dp.rot, v: dp.valor, n: dp.n, ambiguo: cand.length > 1 });
  }
  const soCeap = kc.filter((k) => !usados.has(k)).map((k) => ({ rot: ceap.get(k).rot, v: ceap.get(k).valor }));
  return { pares, soPortal, soCeap };
}

async function compararCota(ano) {
  p('');
  p(`--- Cota ${ano}: CSV completo do Portal × arquivo anual (CEAP) ---`);
  const csv = await carregarCsvPortal(ano, '');
  if (csv.erro) { p(`CSV do Portal ${ano}: FALHA (${csv.erro})`); checar(false, `CSV completo da cota ${ano} do Portal não baixou (${csv.erro}).`); return; }
  p(`CSV do Portal: ${csv.url}\n   ${fmt(csv.nLinhas)} linhas · ${fmt(csv.bytes)} bytes · cabeçalho: ${csv.cabecalho} · linhas negativas (estornos): ${fmt(csv.negativos)}`);
  if (ano === anoAtual && !/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(csv.amostraCabeca)) salvarAmostra(`cota-portal-${ano}-cabeca.csv`, csv.amostraCabeca);
  const ce = await carregarCeap(ano);
  if (ce.erro) { p(`Arquivo anual CEAP ${ano}: FALHA (${ce.erro})`); checar(false, `Arquivo anual da cota ${ano} não pôde ser lido (${ce.erro}).`); return; }
  p(`Arquivo anual CEAP: ${fmt(ce.nLinhas)} despesas · total (documento − glosa) ${reais(ce.total)}`);
  const dif = csv.total - ce.total;
  p(`   Total do Portal: ${reais(csv.total)} · diferença (Portal − arquivo anual): ${reais(dif)} (${pct(dif / csv.total)} do total do Portal)`);

  const { pares, soPortal, soCeap } = casarTipos(csv.porTipo, ce.porTipo);
  p('   Por tipo de despesa (Portal | arquivo anual | diferença):');
  pares.sort((a, b) => Math.abs(b.p - b.c) - Math.abs(a.p - a.c)).forEach((x) => p(`      ${reais(x.p).padStart(19)} | ${reais(x.c).padStart(19)} | ${reais(x.p - x.c).padStart(18)}  ${corta(x.rot, 46)}  [${x.via}]`));
  const sP = soma(soPortal.map((x) => x.v));
  p(`   Tipos SÓ no Portal (${soPortal.length}) — o arquivo anual não tem:`);
  soPortal.sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).forEach((x) => p(`      ${reais(x.v).padStart(19)}  ${corta(x.rot, 56)} (${fmt(x.n)} linhas)${x.ambiguo ? ' · nome ambíguo com mais de um tipo do arquivo' : ''}`));
  p(`   Soma dos tipos só no Portal: ${reais(sP)}`);
  p(`   Tipos SÓ no arquivo anual (${soCeap.length}): ${soCeap.length ? soCeap.map((x) => `${corta(x.rot, 40)} ${reais(x.v)}`).join(' · ') : 'nenhum'}`);
  const diffPares = soma(pares.map((x) => x.p - x.c));
  p(`   Diferença nos tipos que existem nos dois: ${reais(diffPares)}`);
  const explica = Math.abs(dif) > 1 ? sP / dif : 1;
  p(`   Os tipos que só existem no Portal explicam ${pct(explica)} da diferença total.`);
  checar(Math.abs(dif) / csv.total <= 0.02 || Math.abs(explica - 1) <= 0.15, `Cota ${ano}: ${Math.abs(dif) / csv.total <= 0.02 ? 'o arquivo anual está dentro de 2% do CSV do Portal.' : Math.abs(explica - 1) <= 0.15 ? `a diferença de ${reais(dif)} do arquivo anual é explicada (${pct(explica)}) pelos tipos que só existem no Portal; dá para completar a cota com o CSV do Portal.` : `a diferença de ${reais(dif)} NÃO é explicada só pelos tipos ausentes (explicam ${pct(explica)}); há outra causa.`}`);

  const compl = [...csv.porTipo.entries()].find(([k]) => /COMPLEMENTACAO DO AUXILIO MORADIA/.test(k));
  if (compl) {
    p(`   "Complementação do auxílio-moradia" no CSV do Portal: ${reais(compl[1].valor)} (${fmt(compl[1].n)} linhas)${estado.moradiaComplemento[ano] !== undefined && ano === anoAtual ? ` · complemento na lista de moradia: ${reais(estado.moradiaComplemento[ano])}` : ''}`);
    p('   Esse valor já está dentro da cota; se a moradia entrar no custo, o complemento não pode ser somado duas vezes.');
  }

  p('   Por estado (UF): Portal | arquivo anual | diferença:');
  const ufs = [...new Set([...csv.porUF.keys(), ...ce.porUF.keys()])].filter(Boolean);
  const linhasUF = ufs.map((u) => ({ u, a: csv.porUF.get(u) || 0, b: ce.porUF.get(u) || 0 })).sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b));
  linhasUF.slice(0, 27).forEach((x) => p(`      ${x.u.padEnd(3)} ${reais(x.a).padStart(19)} | ${reais(x.b).padStart(19)} | ${reais(x.a - x.b).padStart(18)}${x.a ? `  (${pct((x.a - x.b) / x.a)})` : ''}`));

  p(`   Ligação de nomes do Portal com o código do deputado (nome + UF): ${fmt(csv.chavesDistintas)} nomes distintos no CSV · ${fmt(csv.ligados)} com um único código · ${fmt(csv.ambiguos)} ambíguos · ${fmt(csv.semLigacao)} sem código${csv.semLigacao ? ' (ex.: lideranças e blocos, que não são deputados)' : ''}`);
  const taxa = csv.ligados / Math.max(1, csv.chavesDistintas);
  checar(taxa >= 0.95, `Ligação nome → código: ${pct(taxa)} dos nomes do CSV da cota do Portal (${fmt(csv.ligados)} de ${fmt(csv.chavesDistintas)}) casam com exatamente um deputado do filtro (esperado: 95% ou mais).`);
  const lacunas = [];
  for (const [id, v] of csv.porId) { const c = ce.porId.get(id) || 0; lacunas.push({ id, a: v, b: c, d: v - c }); }
  if (lacunas.length) {
    p(`   Diferença por deputado (Portal − arquivo anual), ${fmt(lacunas.length)} deputados ligados: ${faixa(lacunas.map((x) => x.d))}`);
    p(`   Deputados com diferença acima de R$ 10.000: ${fmt(lacunas.filter((x) => x.d > 10000).length)} · sem nenhuma diferença (até R$ 1): ${fmt(lacunas.filter((x) => Math.abs(x.d) <= 1).length)} · só no Portal e ausentes do arquivo anual: ${fmt(lacunas.filter((x) => x.b === 0).length)}`);
    p(`   Maiores diferenças (código · Portal · arquivo): ${lacunas.sort((x, y) => y.d - x.d).slice(0, 5).map((x) => `${x.id} · ${reais(x.a)} · ${reais(x.b)}`).join(' | ')}`);
  }
  return { csv, ce };
}

async function etapaCota() {
  secao('5. COTA: o CSV completo do Portal explica a diferença do arquivo anual?');
  for (const ano of ANOS) {
    try { await compararCota(ano); } catch (e) { p(`FALHA ao comparar a cota ${ano}: ${(e && e.stack) || e}`); checar(false, `Falha inesperada ao comparar a cota ${ano}.`); }
  }
  // O filtro por mês do CSV do Portal confere com o mês do arquivo anual?
  const ceAtual = estado.ceap.get(anoAtual);
  if (ceAtual && !ceAtual.erro) {
    p('');
    p('--- Filtro por mês do CSV do Portal (ano atual) × mês do arquivo anual ---');
    const mesFim = Math.max(1, new Date().getMonth()); // último mês fechado (getMonth é 0 em janeiro)
    for (const mes of [...new Set([1, mesFim])]) {
      await esperar(ESPERA_MS);
      const c = await carregarCsvPortal(anoAtual, MESES_PORTAL[mes - 1]);
      if (c.erro) { p(`   ${MESES_PORTAL[mes - 1]}: FALHA (${c.erro})`); continue; }
      const a = ceAtual.porMes.get(mes) || 0;
      p(`   ${MESES_PORTAL[mes - 1]}/${anoAtual}: Portal ${reais(c.total)} · arquivo anual ${reais(a)} · diferença ${reais(c.total - a)} (${pct((c.total - a) / (c.total || 1))})`);
    }
  }
}

// ---------- ETAPA 6: API de despesas por deputado ----------
async function etapaApi() {
  secao('6. API DE DADOS ABERTOS: despesas por deputado (é completa?) e códigos dos deputados');
  const { ids } = await escolherDeputados();
  const ce = estado.ceap.get(anoAtual);
  const csv = estado.csvPortal.get(`${anoAtual}|`);
  let nOk = 0; let nIgualPortal = 0;
  for (const id of ids) {
    const tipos = new Map(); let total = 0; let n = 0; let ok = true;
    for (let pg = 1; pg <= 10; pg++) {
      await esperar(ESPERA_MS);
      const url = `${API}/deputados/${id}/despesas?ano=${anoAtual}&itens=100&pagina=${pg}&ordem=ASC&ordenarPor=ano`;
      const r = await pegar(url, { limiteMs: 60000 });
      if (falhou(r)) { p(`[deputado ${id}] página ${pg}: FALHA ${motivo(r)}`); ok = false; break; }
      let j;
      try { j = JSON.parse(decodificar(r.buf)); } catch (e) { p(`[deputado ${id}] JSON inválido: ${e.message}`); ok = false; break; }
      const d = j.dados || [];
      for (const x of d) {
        const v = Number(x.valorDocumento || 0) - Number(x.valorGlosa || 0);
        total += v; n++;
        const kt = normalizar(x.tipoDespesa);
        const dt = tipos.get(kt) || { rot: String(x.tipoDespesa || ''), valor: 0 };
        dt.valor += v; tipos.set(kt, dt);
      }
      if (d.length < 100) break;
    }
    if (!ok) continue;
    nOk++;
    const dCeap = ce && !ce.erro ? ce.porId.get(String(id)) || 0 : null;
    const dPortal = csv && !csv.erro ? csv.porId.get(String(id)) : undefined;
    p(`[deputado ${id}] API: ${fmt(n)} despesas em ${anoAtual}, total ${reais(total)} · arquivo anual: ${dCeap === null ? 'n/d' : reais(dCeap)} · CSV do Portal: ${dPortal === undefined ? 'n/d' : reais(dPortal)}`);
    if (dPortal !== undefined) { const igual = Math.abs(total - dPortal) <= Math.max(1, Math.abs(dPortal) * 0.005); if (igual) nIgualPortal++; p(`   API × Portal: diferença ${reais(total - dPortal)} (${igual ? 'iguais, até 0,5%' : 'DIFERENTES'})`); }
    if (ce && !ce.erro) {
      const so = [...tipos.entries()].filter(([k]) => !ce.porTipo.has(k) && !([...ce.porTipo.keys()].some((c) => c.startsWith(k) || k.startsWith(c))));
      p(`   tipos de despesa na API que o arquivo anual não tem: ${so.length ? so.map(([, v]) => `${corta(v.rot, 40)} ${reais(v.valor)}`).join(' · ') : 'nenhum'}`);
    }
  }
  if (nOk) checar(nIgualPortal === nOk, `A API de despesas por deputado ${nIgualPortal === nOk ? 'bate com o CSV completo do Portal nos deputados lidos (dá para usar a API para completar a cota).' : `bateu com o CSV do Portal em ${nIgualPortal} de ${nOk} deputados lidos; não é completa o bastante para substituir o CSV do Portal.`}`);
  else checar(false, 'A API de despesas por deputado não pôde ser lida para nenhum dos deputados escolhidos.');
}

// ---------- execução ----------
async function principal() {
  p('DIAGNÓSTICO DE LEITURA Nº 2: o que o Portal publica por deputado, para somar o custo para os cofres públicos');
  p(`Gerado em: ${new Date().toISOString()}`);
  p(`Anos da cota: ${ANOS.join(', ')} · legislatura ${LEG} · pausa entre pedidos: ${ESPERA_MS} ms`);
  p('Este relatório só LÊ páginas e arquivos públicos. Não calcula nota, não grava em site/dados e não publica nada.');
  p('Nomes de pessoas e CPF nunca entram no relatório: deputados aparecem só pelo código; a remuneração de secretários não é lida.');
  p('DECISÕES respeitadas: imóvel funcional SEM valor estimado (só se informa que o valor não é publicado por deputado); itens sem valor por deputado ficam "não medido".');
  N_CABECALHO = L.length;
  const etapas = [etapaGeral, etapaPaginaDeputado, etapaMoradia, etapaRemuneracao, etapaCota, etapaApi];
  for (const etapa of etapas) {
    try {
      await etapa();
    } catch (e) {
      p(`FALHA INESPERADA na etapa ${etapa.name}: ${(e && e.stack) || e}`);
      checar(false, `Falha inesperada na etapa ${etapa.name}.`);
    }
  }
  secao('7. REGISTRO DE PEDIDOS (status · tipo · tempo · tamanho · endereço)');
  p(`Total de pedidos: ${pedidos.length}`);
  pedidos.slice(0, 150).forEach((x) => p(`${String(x.status || 'ERRO').padStart(4)} · ${(x.tipo || '-').split(';')[0].padEnd(26)} · ${String(fmt(x.ms || 0)).padStart(6)} ms · ${String(fmt(x.bytes || 0)).padStart(11)} · ${corta(String(x.url).replace(/^https?:\/\/[^/]+/, ''), 170)}${x.erro ? ` · ${corta(x.erro, 60)}` : ''}`));
}

function montarRelatorio() {
  const falhas = checagens.filter((c) => !c.ok).length;
  const topo = [...L.slice(0, N_CABECALHO)];
  topo.push('', '='.repeat(80), 'RESUMO: o que foi confirmado', '='.repeat(80));
  checagens.forEach((c) => topo.push(`  [${c.ok ? 'OK' : 'ATENÇÃO'}] ${mascarar(c.texto)}`));
  topo.push('', falhas === 0
    ? 'Indicativo automático: todos os pontos conferidos estão confirmados. A decisão de como usar continua sendo nossa.'
    : `Indicativo automático: ${falhas} ponto(s) em ATENÇÃO. Cada um mostra o que NÃO deu para confirmar; leia os detalhes abaixo antes de decidir.`);
  return [...topo, ...L.slice(N_CABECALHO)].join('\n') + '\n';
}

try {
  await principal();
} finally {
  const texto = montarRelatorio();
  mkdirSync(SAIDA, { recursive: true });
  const arq = path.join(SAIDA, 'diagnostico-custo-2.txt');
  writeFileSync(arq, texto);
  console.log(texto);
  console.log(`\nRelatório gravado em ${arq}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Diagnóstico de custo nº 2\n\n\`\`\`text\n${texto.slice(0, 900000)}\n\`\`\`\n`);
  }
}
