// Diagnóstico de LEITURA: quanto cada deputado federal custa aos cofres públicos, segundo o que a Câmara publica.
//
// O que faz: abre as páginas públicas do Portal da Transparência da Câmara (gastos parlamentares, moradia,
// remuneração, viagens), procura links de download, baixa o que encontrar e descreve cada arquivo (colunas,
// tamanho, tipo de dado, cobertura). Também lê o arquivo de funcionários (secretários parlamentares), os
// relatórios consolidados de remuneração e a cota parlamentar (CEAP), e confere se os totais batem com o Portal.
// O que NÃO faz: não calcula nota, não lê nem grava nada em site/dados, não altera o repositório, não publica.
// Dados pessoais: nunca imprime nomes de pessoas nem CPF; só cabeçalhos, contagens e faixas de valores.
//
// Uso: node scripts/diagnostico-custo.mjs
// Variáveis opcionais (servem só para teste ou para mudar o recorte):
//   DIAG_ANOS=2025,2026   anos da cota e da remuneração (padrão: o ano passado e o atual)
//   DIAG_SAIDA=pasta      onde gravar o relatório (padrão: diagnostico)
//   DIAG_PORTAL, DIAG_WWW2, DIAG_ARQ, DIAG_API, DIAG_CEAP   endereços-base (usados nos testes)
//   DIAG_ESPERA_MS=600    pausa entre pedidos ao Portal    DIAG_MAX_PEDIDOS=40   limite de páginas do Portal

import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buscar, esperar, lerDoZip, normalizar, percorrerCsv } from './util.mjs';

const semBarra = (s) => String(s).replace(/\/+$/, '');
const PORTAL = semBarra(process.env.DIAG_PORTAL || 'https://www.camara.leg.br');
const WWW2 = semBarra(process.env.DIAG_WWW2 || 'https://www2.camara.leg.br');
const ARQ = semBarra(process.env.DIAG_ARQ || 'https://dadosabertos.camara.leg.br/arquivos');
const API = semBarra(process.env.DIAG_API || 'https://dadosabertos.camara.leg.br/api/v2');
const CEAP = semBarra(process.env.DIAG_CEAP || 'https://www.camara.leg.br/cotas');
const SAIDA = process.env.DIAG_SAIDA || 'diagnostico';
const ESPERA_MS = Number(process.env.DIAG_ESPERA_MS ?? 600);
const MAX_PEDIDOS = Number(process.env.DIAG_MAX_PEDIDOS || 40);
const anoAtual = new Date().getFullYear();
const ANOS = (process.env.DIAG_ANOS || `${anoAtual - 1},${anoAtual}`).split(',').map((s) => Number(s.trim())).filter(Boolean);
const UA = 'placar-publico/1.0 (projeto de transparencia; leitura de dados publicos)';

// ---------- relatório ----------
const L = [];
// Rede de segurança: qualquer sequência parecida com CPF é trocada antes de entrar no relatório.
const mascarar = (s) => String(s).replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf omitido]');
const p = (s = '') => L.push(mascarar(s));
const secao = (t) => { p(); p('='.repeat(80)); p(t); p('='.repeat(80)); };
let N_CABECALHO = 0;
const checagens = [];
const checar = (ok, texto) => checagens.push({ ok, texto });
const fmt = (n) => Number(n).toLocaleString('pt-BR');
const reais = (n) => 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const corta = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));

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

// ---------- rede ----------
const pedidos = []; // registro de tudo que foi pedido
async function pegar(url, { limiteMs = 60000, maxBytes = 60 * 1024 * 1024, tentativas = 2 } = {}) {
  let ultimo = null;
  for (let i = 0; i < tentativas; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), limiteMs);
    try {
      const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': UA, accept: '*/*' } });
      const tamanho = Number(r.headers.get('content-length') || 0);
      const base = {
        url,
        urlFinal: r.url || url,
        status: r.status,
        tipo: (r.headers.get('content-type') || '').toLowerCase(),
        disposicao: r.headers.get('content-disposition') || ''
      };
      if (r.status >= 500 && i < tentativas - 1) { await esperar(1500 * (i + 1)); continue; }
      if (tamanho > maxBytes) {
        pedidos.push({ ...base, bytes: tamanho });
        return { ...base, bytes: tamanho, grande: true, buf: null };
      }
      const buf = Buffer.from(await r.arrayBuffer());
      pedidos.push({ ...base, bytes: buf.length });
      return { ...base, bytes: buf.length, buf };
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

function decodificar(buf) {
  try { return { texto: new TextDecoder('utf-8', { fatal: true }).decode(buf), codificacao: 'UTF-8' }; } catch { /* tenta a próxima */ }
  try { return { texto: new TextDecoder('windows-1252').decode(buf), codificacao: 'Windows-1252 (não era UTF-8)' }; } catch { /* última opção */ }
  return { texto: buf.toString('latin1'), codificacao: 'Latin-1 (não era UTF-8)' };
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

function resolver(href, base) {
  try { return new URL(String(href).replace(/&amp;/g, '&').trim(), base).href; } catch { return null; }
}

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

/** Botões e links com cara de "baixar": mostra os atributos, onde costuma estar o endereço do arquivo. */
function extrairControles(html) {
  const saida = [];
  const re = /<(a|button|input)\b([^>]*)>([^<]{0,80})/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[2].replace(/\s+/g, ' ').trim();
    const txt = m[3].trim();
    if (/baix|download|exporta|csv|xlsx|planilha/i.test(`${attrs} ${txt}`)) saida.push({ tag: m[1].toLowerCase(), texto: txt, attrs: corta(attrs, 300), bruto: attrs });
  }
  return saida;
}

/** Endereços escondidos nos atributos de botões ("Baixar" feito com data-url, onclick, formaction...). */
function urlsDosControles(controles, base) {
  const saida = [];
  for (const c of controles) {
    const re = /\b(href|formaction|onclick|data-[\w-]*(?:url|href|file|link|src)[\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
    let m;
    while ((m = re.exec(c.bruto))) {
      const valor = (m[2] ?? m[3] ?? '').trim();
      const candidatos = /^onclick$/i.test(m[1]) ? [...valor.matchAll(/['"]([^'"]*\/[^'"]*)['"]/g)].map((x) => x[1]) : [valor];
      for (const v of candidatos) {
        if (!/^(\/|https?:)/i.test(v) && !/\.(csv|xlsx?|json)(\?|$)/i.test(v)) continue;
        const url = resolver(v, base);
        if (url) saida.push({ url, texto: c.texto });
      }
    }
  }
  return saida;
}

function extrairForms(html) {
  const saida = [];
  const re = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let m;
  while ((m = re.exec(html))) {
    const acao = /action\s*=\s*["']([^"']*)["']/i.exec(m[1]);
    const metodo = /method\s*=\s*["']([^"']*)["']/i.exec(m[1]);
    const nomes = [...m[2].matchAll(/<(?:input|select|textarea)\b[^>]*\bname\s*=\s*["']([^"']+)["']/gi)].map((x) => x[1]);
    saida.push({ acao: acao ? acao[1] : '(sem action)', metodo: metodo ? metodo[1] : 'get', campos: [...new Set(nomes)].slice(0, 30) });
  }
  return saida;
}

/** Endereços que parecem de API ou de arquivo escondidos no código da página (onde o site busca os dados). */
function extrairPistas(html) {
  const achados = new Set();
  const re = /["'`]((?:https?:)?\/?[^"'`\s<>\\]*(?:\/api\/|\.json|\.csv|\.xlsx|exportar|download|tabelaComparativa)[^"'`\s<>\\]*)["'`]/gi;
  let m;
  while ((m = re.exec(html)) && achados.size < 40) achados.add(m[1]);
  return [...achados];
}

// ---------- tabelas (CSV) ----------
function parseNum(s) {
  s = String(s).trim().replace(/^R\$\s*/, '');
  if (!s) return NaN;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+,\d+$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return NaN;
}

const SENSIVEL = /cpf|matric|e-?mail|telefone|document|\brg\b|endereco|endereço|nascimento|^nome|nome$|\bnome\b/i;
const MONETARIA = /valor|remuner|subsid|sal[aá]rio|vencim|bruto|l[ií]quid|total|provent|vantag|aux[ií]l|di[aá]ria|gasto|custo|r\$|montante|glosa|complemento/i;

function lerTabela(texto, maxLinhas = 600000) {
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  const primeiras = texto.slice(0, 30000).split(/\r?\n/).filter((l) => l.trim()).slice(0, 15);
  const conta = (l, c) => l.split(c).length - 1;
  const [sep] = [';', '\t', ','].map((c) => [c, Math.max(0, ...primeiras.map((l) => conta(l, c)))]).sort((a, b) => b[1] - a[1] || (a[0] === ';' ? -1 : 1))[0];
  const linhas = [];
  let campo = '';
  let linha = [];
  let aspas = false;
  const fechar = () => {
    if (campo.endsWith('\r')) campo = campo.slice(0, -1);
    linha.push(campo);
    if (linha.length > 1 || linha[0].trim() !== '') linhas.push(linha);
    linha = [];
    campo = '';
  };
  const n = texto.length;
  for (let i = 0; i < n && linhas.length < maxLinhas; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; } else if (c === '\n') fechar();
    else campo += c;
  }
  if (campo !== '' || linha.length) fechar();
  // O cabeçalho é a primeira linha larga e sem cara de número (alguns relatórios têm título antes).
  const amostra = linhas.slice(0, 40);
  const max = Math.max(1, ...amostra.map((l) => l.length));
  let h = 0;
  for (let i = 0; i < amostra.length; i++) {
    const l = amostra[i];
    const cheios = l.filter((c) => c.trim() !== '');
    if (l.length >= Math.max(2, Math.ceil(max * 0.8)) && cheios.length >= Math.ceil(l.length * 0.6) && cheios.filter((c) => !Number.isNaN(parseNum(c))).length <= cheios.length * 0.4) { h = i; break; }
  }
  const vistos = new Map();
  const colunas = (linhas[h] || []).map((c, j) => {
    let nome = c.trim() || `(coluna ${j + 1})`;
    const k = vistos.get(nome) || 0;
    vistos.set(nome, k + 1);
    if (k) nome = `${nome} (${k + 1})`;
    return nome;
  });
  return { sep, colunas, dados: linhas.slice(h + 1), antesDoCabecalho: h };
}

function perfilColuna(dados, j) {
  let n = 0; let num = 0; let data = 0; let amostrados = 0; let estouro = false;
  const distintos = new Map();
  for (const l of dados) {
    const v = String(l[j] ?? '').trim();
    if (v === '') continue;
    n++;
    if (amostrados < 1000) {
      amostrados++;
      if (!Number.isNaN(parseNum(v))) num++;
      else if (/^\d{2}\/\d{2}\/\d{4}|^\d{4}-\d{2}-\d{2}/.test(v)) data++;
    }
    if (!estouro) {
      distintos.set(v, (distintos.get(v) || 0) + 1);
      if (distintos.size > 20000) estouro = true;
    }
  }
  const tipo = amostrados && num / amostrados >= 0.9 ? 'número' : amostrados && data / amostrados >= 0.9 ? 'data' : 'texto';
  return { n, tipo, distintos, estouro };
}

/** Descreve uma tabela sem imprimir valores pessoais. Devolve a estrutura para quem for usá-la depois. */
function descreverTabela(rotulo, texto, { maxValores = 25 } = {}) {
  const tab = lerTabela(texto);
  tab.perfis = tab.colunas.map((_, j) => perfilColuna(tab.dados, j));
  p(`${rotulo}: ${fmt(tab.dados.length)} linhas de dados, ${tab.colunas.length} colunas (separador ${tab.sep === '\t' ? 'tabulação' : `"${tab.sep}"`})${tab.antesDoCabecalho ? `, ${tab.antesDoCabecalho} linha(s) de título antes do cabeçalho` : ''}.`);
  p('  Colunas (preenchimento · tipo · valores distintos):');
  tab.colunas.forEach((c, j) => {
    const f = tab.perfis[j];
    const sens = SENSIVEL.test(c);
    p(`   ${String(j + 1).padStart(2)}. ${corta(c, 46).padEnd(46)} ${String(Math.round((100 * f.n) / Math.max(1, tab.dados.length))).padStart(3)}% · ${f.tipo} · ${f.estouro ? '>20.000' : fmt(f.distintos.size)}${sens ? '  [possível dado pessoal: valores não listados]' : ''}`);
  });
  tab.colunas.forEach((c, j) => {
    const f = tab.perfis[j];
    if (SENSIVEL.test(c) || f.tipo !== 'texto' || f.estouro || f.distintos.size < 2 || f.distintos.size > maxValores) return;
    const lista = [...f.distintos.entries()].sort((a, b) => b[1] - a[1]).map(([v, k]) => `${corta(v, 40)} (${fmt(k)})`);
    p(`  Valores de "${c}": ${lista.join(' · ')}`);
  });
  tab.colunas.forEach((c, j) => {
    const f = tab.perfis[j];
    if (f.tipo !== 'número' || !MONETARIA.test(c) || SENSIVEL.test(c)) return;
    const v = tab.dados.map((l) => parseNum(l[j] ?? '')).filter((x) => !Number.isNaN(x));
    p(`  Valores de "${c}": ${faixa(v)}`);
  });
  return tab;
}

const colunasQue = (tab, re, excluir = null) => tab.colunas.map((c, j) => [c, j]).filter(([c]) => re.test(c) && !(excluir && excluir.test(c))).map(([, j]) => j);

// ---------- pessoas (funcionários e remuneração) ----------
const CARGO = /cargo|categoria|funcao|função|grupo|natureza|vinculo|vínculo|situacao|situação|tipo|nivel|nível/i;
const LOTACAO = /lota|unidade|orgao|órgão|local/i;
const ehSP = (v) => /secret[aá]rio\s+parlamentar|secretariado\s+parlamentar|^SP[\s-]?\d+/i.test(String(v));
const ehDeputado = (v) => /^\s*deputad[oa]/i.test(String(v)) || /\bdeputad[oa]\b.*federal/i.test(String(v));

function analisarPessoas(rotulo, tab, deputadosApi) {
  const idxCargo = colunasQue(tab, CARGO, LOTACAO);
  const idxLot = colunasQue(tab, LOTACAO)[0] ?? null;
  const idxNome = colunasQue(tab, /^nome|nome$|\bnome\b|servidor|pessoa/i)[0] ?? null;
  const achar = (teste) => {
    for (const j of idxCargo) {
      const linhas = tab.dados.filter((l) => teste(l[j] ?? ''));
      if (linhas.length) return { j, linhas };
    }
    // Plano B: procura em qualquer coluna que não seja nome nem lotação.
    for (let j = 0; j < tab.colunas.length; j++) {
      if (j === idxNome || j === idxLot || SENSIVEL.test(tab.colunas[j])) continue;
      const linhas = tab.dados.filter((l) => teste(l[j] ?? ''));
      if (linhas.length) return { j, linhas, planoB: true };
    }
    return { j: null, linhas: [] };
  };
  const sp = achar(ehSP);
  const dep = achar(ehDeputado);
  p('');
  p(`  Leitura de pessoas em "${rotulo}":`);
  p(`   • Coluna de nome de pessoa: ${idxNome === null ? 'não encontrada' : `"${tab.colunas[idxNome]}" (${fmt(tab.perfis[idxNome].distintos.size)} nomes distintos; a tabela ${tab.perfis[idxNome].distintos.size >= tab.dados.length * 0.5 ? 'parece NOMINAL' : 'não parece nominal'})`}.`);
  p(`   • Colunas de cargo/categoria encontradas: ${idxCargo.length ? idxCargo.map((j) => `"${tab.colunas[j]}"`).join(', ') : 'nenhuma'}.`);
  p(`   • Secretários parlamentares: ${sp.linhas.length ? `${fmt(sp.linhas.length)} linhas (coluna "${tab.colunas[sp.j]}"${sp.planoB ? ', achada por busca geral' : ''})` : 'nenhuma linha encontrada'}.`);
  p(`   • Deputados: ${dep.linhas.length ? `${fmt(dep.linhas.length)} linhas (coluna "${tab.colunas[dep.j]}"${dep.planoB ? ', achada por busca geral' : ''})` : 'nenhuma linha encontrada'}.`);
  const dinheiro = colunasQue(tab, MONETARIA, SENSIVEL).filter((j) => tab.perfis[j].tipo === 'número');
  for (const [nome, grupo] of [['deputados', dep], ['secretários parlamentares', sp]]) {
    if (!grupo.linhas.length) continue;
    dinheiro.forEach((j) => {
      const v = grupo.linhas.map((l) => parseNum(l[j] ?? '')).filter((x) => !Number.isNaN(x));
      if (v.length) p(`   • ${nome}, "${tab.colunas[j]}": ${faixa(v)}`);
    });
  }
  const datas = tab.colunas.map((c, j) => [c, j]).filter(([, j]) => tab.perfis[j].tipo === 'data');
  if (datas.length) p(`   • Colunas de data: ${datas.map(([c, j]) => `"${c}" (${Math.round((100 * tab.perfis[j].n) / Math.max(1, tab.dados.length))}% preenchida)`).join(', ')}.`);
  const saida = { nominal: idxNome !== null && tab.perfis[idxNome].distintos.size >= tab.dados.length * 0.5, nSP: sp.linhas.length, nDep: dep.linhas.length, ligacao: null };
  // Os secretários dá para ligar a cada deputado? Pela coluna de lotação (nome do gabinete).
  if (sp.linhas.length && idxLot !== null) {
    const porLot = new Map();
    for (const l of sp.linhas) { const k = String(l[idxLot] ?? '').trim(); if (k) porLot.set(k, (porLot.get(k) || 0) + 1); }
    const contagens = [...porLot.values()];
    p(`   • Lotação dos secretários: coluna "${tab.colunas[idxLot]}", ${fmt(porLot.size)} lotações distintas; secretários por lotação: ${faixa(contagens, 0)}.`);
    p(`     Exemplos de lotação (nomes de unidades, não de pessoas): ${[...porLot.keys()].slice(0, 6).map((k) => corta(k, 50)).join(' | ')}`);
    if (deputadosApi && deputadosApi.length) {
      const lots = [...porLot.entries()].map(([k, n]) => ({ norm: normalizar(k), n }));
      let comUma = 0; let comVarias = 0; let semNenhuma = 0;
      const seguros = [];
      for (const d of deputadosApi) {
        const nm = normalizar(d.nome);
        if (nm.length < 4) continue;
        const achados = lots.filter((x) => x.norm.includes(nm));
        if (achados.length === 1) { comUma++; seguros.push(achados[0].n); } else if (achados.length > 1) comVarias++; else semNenhuma++;
      }
      p(`   • Ligação gabinete → deputado pelo nome (testada com ${fmt(deputadosApi.length)} deputados em exercício): ${fmt(comUma)} com exatamente uma lotação, ${fmt(comVarias)} ambíguos (várias), ${fmt(semNenhuma)} sem lotação encontrada.`);
      if (seguros.length) p(`     Secretários por gabinete (só os ligados sem ambiguidade): ${faixa(seguros, 0)}`);
      saida.ligacao = { comUma, comVarias, semNenhuma, total: deputadosApi.length };
    }
  }
  return saida;
}

// ---------- classificação do que foi baixado ----------
function classificar(r) {
  const b = r.buf;
  if (!b || !b.length) return 'vazio';
  const ini = b.subarray(0, 8).toString('latin1');
  if (ini.startsWith('PK')) return /\.xlsx|spreadsheet|\.ods/i.test(`${r.tipo} ${r.disposicao} ${r.url}`) ? 'planilha' : 'zip';
  if (ini.startsWith('%PDF')) return 'pdf';
  const t = r.tipo;
  const comeco = b.subarray(0, 2000).toString('utf8').trimStart();
  if (/json/.test(t) || (/^[{[]/.test(comeco) && /\.json(\?|$)/i.test(r.url))) return 'json';
  if (/html/.test(t) || /^<(!doctype|html|\?xml)/i.test(comeco)) return 'html';
  const primeira = comeco.split(/\r?\n/)[0] || '';
  const colunas = Math.max(primeira.split(';').length, primeira.split('\t').length, primeira.split(',').length);
  if (/csv/.test(t) || /\.csv/i.test(`${r.disposicao} ${r.url}`) || ((/text\/plain|octet-stream/.test(t) || !t) && colunas >= 3)) return 'csv';
  return 'outro';
}

const ehArquivo = (url, texto) => /\.(csv|xlsx?|json|ods|zip)(\?|#|$)/i.test(url) || /exporta|download|baixar|baixe/i.test(`${url} ${texto}`);
function rubricaDe(s) {
  const t = normalizar(s);
  if (/GABINETE|VERBA|SECRETARIO/.test(t)) return 'verba de gabinete';
  if (/MORADIA|IMOVEL|IMOVEIS|APARTAMENTO/.test(t)) return 'moradia';
  if (/VIAGE|DIARIA/.test(t)) return 'viagens';
  if (/REMUNERA|SUBSIDIO|SALARIO/.test(t)) return 'remuneração';
  if (/COTA|CEAP|TABELACOMPARATIVA/.test(t.replace(/ /g, ''))) return 'cota';
  return null;
}

// ---------- varredura do Portal ----------
const descobertas = []; // { rubrica, texto, url, arquivo, origem }
const tabelasBaixadas = []; // { rubrica, url, linhas, porDeputado, porMes, colunas }
const totaisPortal = {}; // rubrica -> reais
let nPagina = 0;

function salvarAmostra(nome, conteudo) {
  try {
    const dir = path.join(SAIDA, 'amostras');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, nome), conteudo);
  } catch { /* amostra é opcional */ }
}
const slug = (u) => String(u).replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').slice(0, 70);

function lerTotaisPortal(texto) {
  const regras = [
    ['cota', /gasto de todos os deputados com cota[^$]{0,60}\$\s*([\d.]+,\d{2})/i],
    ['verba de gabinete', /gasto de todos os deputados com verba de gabinete[^$]{0,60}\$\s*([\d.]+,\d{2})/i],
    ['moradia', /gasto de todos os deputados com aux[ií]lio-moradia[^$]{0,60}\$\s*([\d.]+,\d{2})/i],
    ['viagens', /gasto de todos os deputados com viagens oficiais[^$]{0,60}\$\s*([\d.]+,\d{2})/i]
  ];
  for (const [k, re] of regras) {
    const m = re.exec(texto);
    if (m && totaisPortal[k] === undefined) totaisPortal[k] = parseNum(m[1]);
  }
}

async function analisarResposta(r, { rubrica, nivel }) {
  const tipo = classificar(r);
  p(`   tipo detectado: ${tipo} · HTTP ${r.status} · ${r.tipo || 'sem content-type'} · ${fmt(r.bytes)} bytes${r.urlFinal && r.urlFinal !== r.url ? ` · redirecionou para ${r.urlFinal}` : ''}`);
  if (tipo === 'html') {
    const html = decodificar(r.buf).texto;
    nPagina++;
    salvarAmostra(`${String(nPagina).padStart(2, '0')}-${slug(r.url)}.html`, html.slice(0, 400000));
    const texto = textoLimpo(html);
    lerTotaisPortal(texto);
    p(`   página: "${titulo(html)}" · ${fmt(texto.length)} caracteres de texto · ${(html.match(/<table\b/gi) || []).length} tabela(s) · ${(html.match(/<tr\b/gi) || []).length} linhas de tabela`);
    if (texto.length < 1500) p(`   ATENÇÃO: página com pouco texto (parece montada por script no navegador). Início: ${corta(texto, 300)}`);
    for (const c of extrairControles(html).slice(0, 12)) p(`   controle de download: <${c.tag}> "${c.texto}" ${c.attrs}`);
    for (const f of extrairForms(html).slice(0, 5)) p(`   formulário: ${f.metodo.toUpperCase()} ${f.acao} · campos: ${f.campos.join(', ') || '(nenhum)'}`);
    const pistas = extrairPistas(html);
    if (pistas.length) p(`   pistas de arquivo/API no código da página: ${pistas.slice(0, 12).map((x) => corta(x, 90)).join(' | ')}`);
    return { tipo, html, links: [...extrairLinks(html, r.urlFinal || r.url), ...urlsDosControles(extrairControles(html), r.urlFinal || r.url)] };
  }
  if (tipo === 'csv') {
    const { texto, codificacao } = decodificar(r.buf);
    p(`   codificação: ${codificacao}`);
    const tab = descreverTabela('   Tabela baixada', texto);
    const nomes = tab.colunas.join(' ');
    const dinheiro = tab.colunas.some((c, j) => MONETARIA.test(c) && tab.perfis[j].tipo === 'número');
    const porDeputado = /deputad|parlamentar|nome/i.test(nomes) && dinheiro;
    const porMes = /\bmes\b|mês|periodo|período|competencia|competência|data|ano/i.test(nomes);
    tabelasBaixadas.push({ rubrica, url: r.url, linhas: tab.dados.length, porDeputado, porMes, colunas: tab.colunas.length });
    const cabeca = texto.split(/\r?\n/).slice(0, 150).join('\n');
    if (!/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(cabeca)) salvarAmostra(`${String(++nPagina).padStart(2, '0')}-${slug(r.url)}.csv`, cabeca);
    return { tipo };
  }
  if (tipo === 'json') {
    try {
      const j = JSON.parse(decodificar(r.buf).texto);
      const lista = Array.isArray(j) ? j : Array.isArray(j.dados) ? j.dados : null;
      p(`   JSON: ${Array.isArray(j) ? 'lista' : `objeto com chaves ${Object.keys(j).slice(0, 8).join(', ')}`}${lista ? `, ${fmt(lista.length)} itens; chaves do primeiro: ${Object.keys(lista[0] || {}).slice(0, 15).join(', ')}` : ''}`);
      tabelasBaixadas.push({ rubrica, url: r.url, linhas: lista ? lista.length : 0, porDeputado: false, porMes: false, colunas: lista && lista[0] ? Object.keys(lista[0]).length : 0 });
    } catch (e) { p(`   JSON inválido: ${e.message}`); }
    return { tipo };
  }
  if (tipo === 'planilha' || tipo === 'zip') p(`   arquivo ${tipo} (formato binário): existe e baixa, mas precisaria de leitor próprio (não aberto neste diagnóstico).`);
  return { tipo };
}

async function varrerPortal() {
  secao('1. PORTAL DA TRANSPARÊNCIA: páginas de gastos, moradia, remuneração e viagens');
  const fila = [
    { url: `${PORTAL}/transparencia/gastos-parlamentares`, nivel: 0, rubrica: null, origem: '(página inicial)' },
    { url: `${PORTAL}/moradia/detalhamento`, nivel: 0, rubrica: 'moradia', origem: '(endereço conhecido)' }
  ];
  const vistas = new Set();
  let feitos = 0;
  while (fila.length && feitos < MAX_PEDIDOS) {
    const item = fila.shift();
    const chave = item.url.replace(/#.*$/, '');
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    feitos++;
    if (feitos > 1) await esperar(ESPERA_MS);
    p('');
    p(`[${feitos}] ${item.url}  (nível ${item.nivel}${item.rubrica ? `, rubrica: ${item.rubrica}` : ''}; achado em: ${item.origem})`);
    const r = await pegar(item.url);
    if (r.erro) { p(`   FALHA: ${r.erro}`); continue; }
    if (r.status >= 400) { p(`   HTTP ${r.status}. ${r.status === 403 || r.status === 429 ? 'O site pode estar bloqueando leitura automática.' : ''}`); continue; }
    if (r.grande) { p(`   arquivo grande (${fmt(r.bytes)} bytes), não baixado.`); continue; }
    const res = await analisarResposta(r, { rubrica: item.rubrica, nivel: item.nivel });
    if (res.tipo !== 'html' || item.nivel >= 2) continue;
    // Links promissores: mesmo conjunto de sites da Câmara e com cara de busca/baixar/rubrica de custo.
    const hostsOk = new Set([new URL(PORTAL).host, new URL(WWW2).host, new URL(ARQ).host]);
    const novos = [];
    for (const lk of res.links) {
      let host;
      try { host = new URL(lk.url).host; } catch { continue; }
      if (!hostsOk.has(host)) continue;
      if (/\.(png|jpe?g|gif|svg|css|js|ico|woff2?)(\?|#|$)/i.test(lk.url)) continue;
      if (/facebook|twitter|instagram|youtube|whatsapp|linkedin|\/noticias|\/agencia/i.test(lk.url)) continue;
      const alvo = `${lk.url} ${lk.texto}`;
      if (!/detalh|busca|baix|csv|xlsx|json|download|export|moradia|verba|gabinete|viage|remunera|cota|tabela/i.test(alvo)) continue;
      const rubrica = rubricaDe(alvo) || item.rubrica;
      const arquivo = ehArquivo(lk.url, lk.texto);
      descobertas.push({ rubrica, texto: lk.texto, url: lk.url, arquivo, origem: item.url });
      const pontos = (arquivo ? 3 : 0) + (/detalh/i.test(alvo) ? 2 : 0) + (/baix/i.test(alvo) ? 3 : 0) + (rubrica ? 1 : 0);
      novos.push({ url: lk.url, nivel: item.nivel + 1, rubrica, origem: item.url, pontos });
    }
    novos.sort((a, b) => b.pontos - a.pontos);
    const unicos = [];
    for (const n of novos) if (!unicos.some((u) => u.url.replace(/#.*$/, '') === n.url.replace(/#.*$/, ''))) unicos.push(n);
    fila.push(...unicos.slice(0, 12));
    if (unicos.length) p(`   links promissores encontrados: ${unicos.length} (serão visitados até o limite de ${MAX_PEDIDOS} páginas)`);
  }
  if (fila.length) p(`\n(Limite de ${MAX_PEDIDOS} páginas atingido; ${fila.length} link(s) ficaram sem visita.)`);

  secao('1b. LINKS E ARQUIVOS DE CUSTO ENCONTRADOS, POR RUBRICA');
  const rubricas = ['cota', 'verba de gabinete', 'moradia', 'viagens', 'remuneração'];
  for (const rb of [...rubricas, null]) {
    const lista = descobertas.filter((d) => d.rubrica === rb);
    const unicos = [...new Map(lista.map((d) => [d.url, d])).values()];
    p(`${rb || '(sem rubrica identificada)'}: ${unicos.length} link(s), ${unicos.filter((d) => d.arquivo).length} com cara de arquivo para baixar`);
    unicos.slice(0, 8).forEach((d) => p(`   ${d.arquivo ? '[arquivo]' : '[página] '} "${corta(d.texto, 40)}" → ${corta(d.url, 110)}`));
  }
  p('');
  p('Totais do ano lidos no texto da página inicial do Portal (para conferir depois):');
  for (const rb of ['cota', 'verba de gabinete', 'moradia', 'viagens']) p(`   ${rb}: ${totaisPortal[rb] === undefined ? 'não encontrado no texto' : reais(totaisPortal[rb])}`);
  checar(Object.keys(totaisPortal).length === 4, `A página inicial do Portal mostra os totais de cota, verba de gabinete, moradia e viagens no texto (${Object.keys(totaisPortal).length} de 4 achados).`);

  for (const rb of ['verba de gabinete', 'moradia', 'viagens']) {
    const tabelas = tabelasBaixadas.filter((t) => t.rubrica === rb);
    const bom = tabelas.find((t) => t.porDeputado && t.linhas >= 100);
    checar(Boolean(bom), `${rb[0].toUpperCase()}${rb.slice(1)}: ${bom ? `achei uma tabela baixável por deputado (${fmt(bom.linhas)} linhas, ${bom.colunas} colunas${bom.porMes ? ', com coluna de período' : ', sem coluna de período clara'}).` : `não achei tabela baixável por deputado (${tabelas.length} arquivo(s) lido(s) para esta rubrica).`}`);
  }
}

// ---------- cota parlamentar (CEAP) ----------
async function etapaCota() {
  secao('2. COTA PARLAMENTAR (CEAP): arquivo anual usado hoje pelo aplicativo');
  for (const ano of ANOS) {
    p('');
    const url = `${CEAP}/Ano-${ano}.csv.zip`;
    let texto;
    try {
      const buf = await buscar(url, { formato: 'binario', limiteMs: 240000, tentativas: 3 });
      const zip = path.join(tmpdir(), `diag-ceap-${ano}.zip`);
      writeFileSync(zip, buf);
      texto = lerDoZip(zip, `Ano-${ano}.csv`);
    } catch (e) {
      p(`CEAP ${ano}: FALHA ao baixar ou abrir (${(e && e.message) || e})`);
      checar(false, `CEAP ${ano} não pôde ser lida.`);
      continue;
    }
    let linhas = 0; let semDeputado = 0; let valorSemDeputado = 0; let somaDoc = 0; let somaLiq = 0; let temLiq = false;
    const porDep = new Map(); const meses = new Set(); const tipos = new Map();
    const dec = (x) => { const v = Number(String(x ?? '').replace(',', '.')); return Number.isNaN(v) ? 0 : v; };
    const { ix } = percorrerCsv(texto, (l, ix) => {
      if (String(l[ix.numAno]) !== String(ano)) return;
      linhas++;
      const liq = dec(l[ix.vlrLiquido]);
      const valor = dec(l[ix.vlrDocumento]) - dec(l[ix.vlrGlosa]);
      somaDoc += valor;
      if (ix.vlrLiquido !== undefined) { temLiq = true; somaLiq += liq; }
      const d = l[ix.ideCadastro];
      if (!d) { semDeputado++; valorSemDeputado += valor; } else porDep.set(d, (porDep.get(d) || 0) + valor);
      if (l[ix.numMes]) meses.add(Number(l[ix.numMes]));
      const t = l[ix.txtDescricao] || '(sem descrição)';
      tipos.set(t, (tipos.get(t) || 0) + valor);
    });
    p(`CEAP ${ano}: ${fmt(linhas)} despesas · ${fmt(porDep.size)} deputados com despesa · meses presentes: ${[...meses].sort((a, b) => a - b).join(', ') || 'nenhum'}`);
    p(`   colunas usadas pelo app: ${['numAno', 'ideCadastro', 'vlrDocumento', 'vlrGlosa', 'numMes', 'txtDescricao'].map((c) => `${c}${ix[c] === undefined ? ' (AUSENTE)' : ''}`).join(', ')}`);
    p(`   total (documento − glosa): ${reais(somaDoc)}${temLiq ? ` · total pela coluna vlrLiquido: ${reais(somaLiq)}` : ''}`);
    p(`   despesas sem deputado identificado: ${fmt(semDeputado)} linhas, ${reais(valorSemDeputado)}`);
    p(`   total por deputado no ano: ${faixa([...porDep.values()])}`);
    p('   Tipos de despesa (maiores totais):');
    [...tipos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([t, v]) => p(`      ${reais(v).padStart(20)}  ${corta(t, 70)}`));
    if (ano === anoAtual && totaisPortal.cota !== undefined && somaDoc > 0) {
      const dif = (somaDoc - totaisPortal.cota) / totaisPortal.cota;
      const ok = Math.abs(dif) <= 0.03;
      p(`   Conferência com o Portal (${reais(totaisPortal.cota)}): diferença de ${(dif * 100).toFixed(1).replace('.', ',')}%`);
      checar(ok, `O total da cota ${ano} pelo arquivo bate com o total mostrado no Portal (diferença ${(dif * 100).toFixed(1).replace('.', ',')}%; aceito até 3%; o Portal muda ao longo do dia).`);
    }
    checar(porDep.size >= 400, `CEAP ${ano}: ${fmt(porDep.size)} deputados com despesa (esperado: 400 ou mais).`);
  }
  p('');
  p('Observação para o futuro: o "complemento do auxílio-moradia pela cota" já é despesa da CEAP. Se a moradia for somada ao custo, esse complemento não pode ser contado duas vezes.');
}

// ---------- funcionários (secretários parlamentares) ----------
async function listarDeputadosApi() {
  const lista = [];
  for (let pg = 1; pg <= 10; pg++) {
    try {
      const j = await buscar(`${API}/deputados?itens=100&pagina=${pg}&ordem=ASC&ordenarPor=nome`, { formato: 'json', tentativas: 3 });
      const d = j.dados || [];
      lista.push(...d);
      if (d.length < 100) break;
    } catch (e) { p(`API de deputados, página ${pg}: ${(e && e.message) || e}`); break; }
  }
  return lista;
}

async function etapaFuncionarios() {
  secao('3. ARQUIVO "funcionarios" (dados abertos): secretários parlamentares por gabinete');
  const url = `${ARQ}/funcionarios/csv/funcionarios.csv`;
  const r = await pegar(url, { limiteMs: 180000 });
  if (r.erro || r.status >= 400 || !r.buf) {
    p(`FALHA: ${r.erro || `HTTP ${r.status}`} em ${url}`);
    checar(false, 'O arquivo de funcionários não pôde ser lido.');
    return;
  }
  const { texto, codificacao } = decodificar(r.buf);
  p(`${url}\n   HTTP ${r.status} · ${fmt(r.bytes)} bytes · codificação ${codificacao}`);
  const tab = descreverTabela('Funcionários', texto);
  const deputados = await listarDeputadosApi();
  p(`Deputados em exercício lidos da API (para testar a ligação): ${fmt(deputados.length)}`);
  const res = analisarPessoas('funcionarios', tab, deputados);
  checar(res.nSP > 1000, `Funcionários: ${fmt(res.nSP)} secretários parlamentares identificados (esperado: milhares).`);
  const lig = res.ligacao;
  checar(Boolean(lig) && lig.comUma / Math.max(1, lig.total) >= 0.85, `Funcionários: ${lig ? `${fmt(lig.comUma)} de ${fmt(lig.total)} deputados ligados a exatamente um gabinete pelo nome (esperado: 85% ou mais).` : 'não deu para ligar os secretários aos deputados pelo nome.'}`);
  const temSalario = tab.colunas.some((c, j) => MONETARIA.test(c) && tab.perfis[j].tipo === 'número');
  checar(temSalario, `Funcionários: ${temSalario ? 'há coluna de valor em reais.' : 'o arquivo NÃO tem salário nem outro valor em reais (só cargo, lotação e datas); serve para contar equipe, não para somar custo.'}`);
}

// ---------- remuneração consolidada ----------
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

async function etapaRemuneracao() {
  secao('4. RELATÓRIOS CONSOLIDADOS DE REMUNERAÇÃO (Recursos humanos, CSV mensal)');
  let escolhido = null;
  for (const ano of [...ANOS].sort((a, b) => b - a)) {
    const url = `${WWW2}/transparencia/recursos-humanos/remuneracao/relatorios-consolidados-por-ano-e-mes/${ano}`;
    p('');
    p(`Página de ${ano}: ${url}`);
    const r = await pegar(url);
    if (r.erro || r.status >= 400 || !r.buf) { p(`   FALHA: ${r.erro || `HTTP ${r.status}`}`); continue; }
    const html = decodificar(r.buf).texto;
    salvarAmostra(`remuneracao-lista-${ano}.html`, html.slice(0, 400000));
    const candidatos = [];
    for (const lk of extrairLinks(html, r.urlFinal || url)) {
      const m = /([a-zç]+)-de-(\d{4})-csv/i.exec(lk.url);
      if (!m) continue;
      const mes = MESES.indexOf(normalizar(m[1]).toLowerCase());
      if (mes < 0) continue;
      candidatos.push({ ano: Number(m[2]), mes, url: lk.url });
    }
    candidatos.sort((a, b) => b.ano - a.ano || b.mes - a.mes);
    p(`   meses com CSV listados na primeira página: ${candidatos.length}${candidatos.length ? ` (mais recente: ${MESES[candidatos[0].mes]}/${candidatos[0].ano})` : ''}`);
    if (candidatos.length && !escolhido) escolhido = candidatos[0];
  }
  checar(Boolean(escolhido), `Remuneração consolidada: ${escolhido ? `achei o CSV mais recente (${MESES[escolhido.mes]}/${escolhido.ano}).` : 'não achei links de CSV mensal nas páginas de listagem.'}`);
  if (!escolhido) return;

  p('');
  p(`Abrindo o mais recente: ${escolhido.url}`);
  await esperar(ESPERA_MS);
  let r = await pegar(escolhido.url, { limiteMs: 120000 });
  if (r.erro || r.status >= 400 || !r.buf) { p(`   FALHA: ${r.erro || `HTTP ${r.status}`}`); checar(false, 'A página do CSV de remuneração mais recente não abriu.'); return; }
  let tipo = classificar(r);
  if (tipo === 'html') {
    const html = decodificar(r.buf).texto;
    salvarAmostra(`remuneracao-arquivo-${escolhido.ano}-${escolhido.mes + 1}.html`, html.slice(0, 400000));
    const links = extrairLinks(html, r.urlFinal || escolhido.url).filter((lk) => /at_download|@@download|\.csv(\?|#|$)|download/i.test(lk.url));
    p(`   página de visualização: "${titulo(html)}"; links de download encontrados: ${links.length}`);
    links.slice(0, 5).forEach((lk) => p(`      → ${corta(lk.url, 120)}`));
    if (!links.length) { checar(false, 'Remuneração consolidada: a página do arquivo não mostra link de download.'); return; }
    await esperar(ESPERA_MS);
    r = await pegar(links[0].url, { limiteMs: 180000 });
    if (r.erro || r.status >= 400 || !r.buf) { p(`   FALHA no download: ${r.erro || `HTTP ${r.status}`}`); checar(false, 'O download do CSV de remuneração falhou.'); return; }
    tipo = classificar(r);
  }
  p(`   arquivo: tipo ${tipo} · HTTP ${r.status} · ${r.tipo || 'sem content-type'} · ${fmt(r.bytes)} bytes`);
  if (tipo !== 'csv') { checar(false, `Remuneração consolidada: o arquivo baixado não é CSV legível (tipo ${tipo}).`); return; }
  const { texto, codificacao } = decodificar(r.buf);
  p(`   codificação: ${codificacao}`);
  const tab = descreverTabela('Remuneração consolidada', texto);
  const res = analisarPessoas('remuneração consolidada', tab, null);
  checar(res.nominal, `Remuneração consolidada: ${res.nominal ? 'a tabela é nominal (uma linha por pessoa).' : 'a tabela NÃO parece nominal (parece resumo por cargo ou categoria); não dá para somar custo por deputado com ela.'}`);
  checar(res.nDep >= 400, `Remuneração consolidada: ${fmt(res.nDep)} linhas de deputados (esperado: cerca de 513).`);
}

// ---------- execução ----------
async function principal() {
  p('DIAGNÓSTICO DE LEITURA: custo de cada deputado federal para os cofres públicos');
  p(`Gerado em: ${new Date().toISOString()}`);
  p(`Anos lidos: ${ANOS.join(', ')} · limite de páginas do Portal: ${MAX_PEDIDOS}`);
  p('Este relatório só LÊ páginas e arquivos públicos. Não calcula nota, não grava em site/dados e não publica nada.');
  p('Nomes de pessoas e CPF nunca entram no relatório; só cabeçalhos, contagens e faixas de valores.');
  N_CABECALHO = L.length;
  const etapas = [varrerPortal, etapaCota, etapaFuncionarios, etapaRemuneracao];
  for (const etapa of etapas) {
    try {
      await etapa();
    } catch (e) {
      p(`FALHA INESPERADA na etapa ${etapa.name}: ${(e && e.stack) || e}`);
      checar(false, `Falha inesperada na etapa ${etapa.name}.`);
    }
  }
  secao('5. REGISTRO DE PEDIDOS (status · tipo · tamanho · endereço)');
  pedidos.slice(0, 120).forEach((x) => p(`${String(x.status || 'ERRO').padStart(4)} · ${(x.tipo || '-').split(';')[0].padEnd(28)} · ${String(fmt(x.bytes || 0)).padStart(11)} · ${corta(x.url, 100)}${x.erro ? ` · ${corta(x.erro, 60)}` : ''}`));
}

function montarRelatorio() {
  const falhas = checagens.filter((c) => !c.ok).length;
  const topo = [...L.slice(0, N_CABECALHO)];
  topo.push('', '='.repeat(80), 'RESUMO: o que foi confirmado', '='.repeat(80));
  checagens.forEach((c) => topo.push(`  [${c.ok ? 'OK' : 'ATENÇÃO'}] ${c.texto}`));
  topo.push('', falhas === 0
    ? 'Indicativo automático: todas as rubricas conferidas têm arquivo legível por robô. A decisão de como usar continua sendo nossa.'
    : `Indicativo automático: ${falhas} ponto(s) em ATENÇÃO. Cada um mostra o que NÃO deu para confirmar; leia os detalhes abaixo antes de decidir.`);
  return [...topo, ...L.slice(N_CABECALHO)].join('\n') + '\n';
}

try {
  await principal();
} finally {
  const texto = montarRelatorio();
  mkdirSync(SAIDA, { recursive: true });
  const arq = path.join(SAIDA, 'diagnostico-custo.txt');
  writeFileSync(arq, texto);
  console.log(texto);
  console.log(`\nRelatório gravado em ${arq}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Diagnóstico de custo dos deputados\n\n\`\`\`text\n${texto.slice(0, 900000)}\n\`\`\`\n`);
  }
}
