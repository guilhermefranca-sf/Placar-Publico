// Funções de apoio usadas pela rotina de atualização.
// Sem dependências externas: só o que já vem com o Node 20 ou mais novo.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Busca uma URL com novas tentativas. formato: 'json' | 'texto' | 'binario'. */
export async function buscar(url, { formato = 'json', tentativas = 4, espera = 1500, limiteMs = 90000 } = {}) {
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), limiteMs);
    try {
      const r = await fetch(url, {
        signal: ctl.signal,
        headers: { 'user-agent': 'placar-publico/1.0 (projeto de transparencia)', accept: formato === 'json' ? 'application/json' : '*/*' }
      });
      if (r.status === 404 || r.status === 400) {
        const e = new Error(`HTTP ${r.status} em ${url}`);
        e.semNovaTentativa = true;
        throw e;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
      if (formato === 'json') return await r.json();
      if (formato === 'texto') return await r.text();
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      ultimo = e;
      if (e.semNovaTentativa) break;
      await esperar(espera * (i + 1));
    } finally {
      clearTimeout(t);
    }
  }
  throw ultimo;
}

/** Executa fn(item) para todos os itens, no máximo `n` ao mesmo tempo. */
export async function emLotes(itens, n, fn) {
  const resultados = new Array(itens.length);
  let proximo = 0;
  async function trabalhador() {
    while (true) {
      const i = proximo++;
      if (i >= itens.length) return;
      resultados[i] = await fn(itens[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhador));
  return resultados;
}

/**
 * Percorre um CSV do tipo usado pela Câmara e pelo TSE (separador ";" e textos entre aspas) linha a linha,
 * sem guardar todas as linhas na memória. Importante para os arquivos grandes (cota, votos, proposições).
 * Devolve { ix } com a posição de cada coluna; aoLer(linha, ix) é chamado para cada linha de dados.
 */
export function percorrerCsv(texto, aoLer) {
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  let ix = null;
  let campo = '';
  let linha = [];
  let aspas = false;
  const fechar = () => {
    if (campo.endsWith('\r')) campo = campo.slice(0, -1);
    linha.push(campo);
    if (!ix) ix = Object.fromEntries(linha.map((c, i) => [c, i]));
    else if (linha.length > 1) aoLer(linha, ix);
    linha = [];
    campo = '';
  };
  const n = texto.length;
  for (let i = 0; i < n; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false;
      } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ';') { linha.push(campo); campo = ''; }
    else if (c === '\n') fechar();
    else campo += c;
  }
  if (campo !== '' || linha.length) fechar();
  return { ix: ix || {} };
}

/**
 * Lê um CSV inteiro para a memória. Devolve { ix, linhas }, onde ix[nomeDaColuna] é a posição da coluna.
 * Para arquivos grandes, prefira percorrerCsv.
 */
export function lerCsv(texto) {
  const linhas = [];
  const { ix } = percorrerCsv(texto, (l) => linhas.push(l));
  return { ix, linhas };
}

/** Lê um arquivo de dentro de um .zip usando o programa "unzip" (já vem no GitHub Actions). */
export function lerDoZip(arquivoZip, interno, codificacao = 'utf-8') {
  const r = spawnSync('unzip', ['-p', arquivoZip, interno], { maxBuffer: 1024 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`Não consegui abrir ${interno} em ${arquivoZip}: ${String(r.stderr || '').slice(0, 200)}`);
  return new TextDecoder(codificacao).decode(r.stdout);
}

export function gravarJson(caminho, objeto) {
  mkdirSync(path.dirname(caminho), { recursive: true });
  writeFileSync(caminho, JSON.stringify(objeto));
}

export function lerJsonSeExistir(caminho) {
  if (!existsSync(caminho)) return null;
  try { return JSON.parse(readFileSync(caminho, 'utf-8')); } catch { return null; }
}

/** Tira acento, passa para maiúsculas e troca símbolos por espaço: serve para comparar nomes. */
export function normalizar(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o']);
/** "MARIA DA SILVA" -> "Maria da Silva" */
export function nomeProprio(s) {
  return String(s || '').toLowerCase().split(/\s+/).filter(Boolean)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ').replace(/(["'(-])([a-zà-ú])/g, (_, a, b) => a + b.toUpperCase());
}

/** Posição de um valor entre os demais, de 0 (menor) a 1 (maior). Empates dividem a posição. */
export function criarPercentil(valores) {
  const ord = [...valores].sort((a, b) => a - b);
  const n = ord.length;
  const limite = (v, incluir) => {
    let lo = 0, hi = n;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (incluir ? ord[m] <= v : ord[m] < v) lo = m + 1; else hi = m;
    }
    return lo;
  };
  return (v) => {
    if (!n) return 0.5;
    const abaixo = limite(v, false);
    const ate = limite(v, true);
    return (abaixo + (ate - abaixo) / 2) / n;
  };
}

export const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
export const arredondar = (v, casas = 1) => Math.round(v * 10 ** casas) / 10 ** casas;

export function dataBR(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export const reais = (v) => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
