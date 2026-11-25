// Índice dos deputados estaduais.
//
// Cada Assembleia Legislativa publica os dados de um jeito, e nem todas publicam dados abertos por deputado. Por isso o
// Placar tem um "adaptador" por Assembleia: um pequeno leitor que sabe ler os arquivos daquela casa. Só entra no índice
// o que um adaptador conseguiu ler. As demais casas ficam "sem índice", com o motivo à mostra (veja curadoria/assembleias.json,
// que registra o que foi pesquisado sobre cada uma).
//
// Hoje há um adaptador: São Paulo (Alesp), com o uso da verba de gabinete (despesas_gabinetes_AAAA.xml, layout descrito
// na documentação oficial da Alesp: Deputado, Matrícula, Ano, Mes, Tipo, CNPJ, Fornecedor, Valor).
//
// Regras:
//   - O índice usa os critérios que existem, com os pesos do método (cota 30, votações 20, presença 20, projetos aprovados 30),
//     refeitos para somar 100. É sempre PARCIAL, e o perfil diz quantos critérios entraram.
//   - O deputado é comparado só com os colegas da mesma Assembleia, e a posição (ranking) também é só dentro da casa.
//   - O nome do arquivo da Assembleia é ligado ao da lista do TSE só quando a correspondência é única e segura.
//     Na dúvida, o deputado fica sem índice (nunca se arrisca um nome).
//   - O CNPJ/CPF dos favorecidos, que vem no arquivo de despesas, é ignorado: não é lido nem guardado.
//   - Falta de dado nunca vira zero.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { METODO, mediaPonderada, atribuirPosicoes, mediaDasNotas } from './nota.mjs';
import { criarPercentil, arredondar, gravarJson, lerJsonSeExistir, normalizar } from './util.mjs';
import { UFS } from './tse.mjs';

const M = METODO.estaduais;
export const DIAS_ENTRE_LEITURAS = 7;

/* ---------------------------- leitura de XML e de números ---------------------------- */

/** Decodifica o arquivo conforme o que o próprio XML declara (UTF-8 se não declarar nada). */
export function decodificar(buf) {
  if (typeof buf === 'string') return buf;
  const cabeca = Buffer.from(buf.subarray(0, 200)).toString('latin1');
  const enc = (/encoding=["']([^"']+)["']/i.exec(cabeca) || [])[1];
  const nome = /^(iso-8859-1|latin1|windows-1252|cp1252)$/i.test(enc || '') ? 'windows-1252' : 'utf-8';
  return new TextDecoder(nome).decode(buf);
}

const desescapar = (t) => String(t).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const campo = (bloco, tag) => { const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(bloco); return m ? desescapar(m[1].replace(/<!\[CDATA\[|\]\]>/g, '')).trim() : null; };

/** "1234.56", "1.234,56", "1234,56" -> número; "1.234" (só milhar) -> 1234. Qualquer outra coisa -> null. */
export function numeroBR(v) {
  if (v == null) return null;
  const t = String(v).trim().replace(/\s|R\$/g, '');
  if (!t || !/^-?[\d.,]+$/.test(t)) return null;
  let s = t;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* ---------------------------- adaptador de São Paulo (Alesp) ---------------------------- */

export const ALESP = {
  uf: 'SP',
  casa: 'Assembleia Legislativa do Estado de São Paulo (Alesp)',
  portal: 'https://www.al.sp.gov.br/dados-abertos/',
  urlDespesas: (ano) => `https://www.al.sp.gov.br/repositorioDados/deputados/despesas_gabinetes_${ano}.xml`,
  docDespesas: 'https://www.al.sp.gov.br/repositorioDados/docs/deputados/despesas_gabinetes.pdf'
};
const MAX_MENSAL_PLAUSIVEL = 600000; // R$ por deputado por mês: acima disso o arquivo não é o que se espera

/**
 * Lê o XML de despesas de gabinete e devolve { deputados: { nome: { 'AAAA-MM': valor } }, registros, ignorados }.
 * Não depende do nome do elemento que envolve cada registro: cada <Deputado> abre um registro.
 * Só Deputado, Ano, Mes e Valor são lidos; CNPJ/CPF e fornecedor nem são tocados.
 */
export function lerDespesasAlesp(texto) {
  const partes = texto.split(/<Deputado(?:\s[^>]*)?>/i);
  const deputados = {};
  let registros = 0, ignorados = 0;
  for (const p of partes.slice(1)) {
    const nome = desescapar((p.split(/<\/Deputado>/i)[0] || '').replace(/<!\[CDATA\[|\]\]>/g, '')).trim();
    const ano = Number(campo(p, 'Ano'));
    const mes = Number(campo(p, 'M[eê]s'));
    const valor = numeroBR(campo(p, 'Valor'));
    if (!nome || !Number.isInteger(ano) || ano < 2000 || ano > 2100 || !Number.isInteger(mes) || mes < 1 || mes > 12 || valor == null) { ignorados++; continue; }
    const chave = `${ano}-${String(mes).padStart(2, '0')}`;
    const d = (deputados[nome] ||= {});
    d[chave] = Math.round(((d[chave] || 0) + valor) * 100) / 100;
    registros++;
  }
  return { deputados, registros, ignorados };
}

/**
 * Lê e guarda as despesas dos anos da janela. Anos fechados são relidos a cada 7 dias; o ano em curso, todo dia.
 * Grava anos/estaduais-SP.json: { versao, anos: { 2023: { lidoEm, deputados: { nome: { 'AAAA-MM': valor } } } } }
 */
export async function lerAlesp({ binario, pasta, hoje, anos, log = () => {} }) {
  const arq = path.join(pasta, 'anos', 'estaduais-SP.json');
  const guardado = lerJsonSeExistir(arq) || { versao: 1, anos: {} };
  const falhas = [];
  for (const ano of anos) {
    const g = guardado.anos[ano];
    const idade = g?.lidoEm ? (hoje - new Date(g.lidoEm)) / 86400000 : Infinity;
    if (g && ano < hoje.getUTCFullYear() && idade < DIAS_ENTRE_LEITURAS) continue;
    try {
      const r = lerDespesasAlesp(decodificar(await binario(ALESP.urlDespesas(ano))));
      if (!r.registros) throw new Error('arquivo sem nenhum registro reconhecido (o formato pode ter mudado)');
      const maior = Math.max(...Object.values(r.deputados).flatMap((d) => Object.values(d)));
      if (!(maior < MAX_MENSAL_PLAUSIVEL)) throw new Error('valor mensal fora do esperado; o arquivo não parece ser o de despesas de gabinete');
      for (const d of Object.values(r.deputados)) for (const [m, v] of Object.entries(d)) if (v < 0) delete d[m]; // estorno sem a despesa original: não conta
      guardado.anos[ano] = { lidoEm: hoje.toISOString(), registros: r.registros, ignorados: r.ignorados, deputados: r.deputados };
      log(`Alesp ${ano}: ${r.registros} despesas de ${Object.keys(r.deputados).length} nomes.`);
    } catch (e) { falhas.push(`${ano}: ${String(e.message).slice(0, 100)}`); }
  }
  if (Object.keys(guardado.anos).length) gravarJson(arq, { ...guardado, geradoEm: hoje.toISOString(), fonte: ALESP.casa, docs: ALESP.docDespesas });
  const lidos = anos.filter((a) => guardado.anos[a]);
  if (!lidos.length) return { ok: false, motivo: `Não foi possível ler as despesas da Alesp (${falhas.slice(0, 2).join('; ') || 'sem detalhes'}).` };
  return { ok: true, anos: lidos, falhas };
}

/* ---------------------------- ligação de nomes ---------------------------- */

const tokens = (s) => normalizar(s).split(' ').filter((t) => t && !['DE', 'DA', 'DO', 'DAS', 'DOS', 'E'].includes(t));

/**
 * Liga nomes do arquivo da Assembleia aos deputados da lista do TSE. Devolve Map(id do TSE -> nome do arquivo).
 * Só liga quando é único dos dois lados: nome de urna ou nome completo iguais; ou, na falta, um nome contido no outro
 * (todas as palavras de um aparecem no outro, com pelo menos duas palavras).
 */
export function ligarNomes(itens, nomesDoArquivo) {
  const arq = nomesDoArquivo.map((n) => ({ n, norm: normalizar(n), tk: tokens(n) }));
  const candidatos = new Map(); // id -> Set(nome)
  const add = (id, n) => { if (!candidatos.has(id)) candidatos.set(id, new Set()); candidatos.get(id).add(n); };
  for (const it of itens) {
    const chaves = [normalizar(it.urna), normalizar(it.nome)].filter(Boolean);
    for (const a of arq) if (chaves.includes(a.norm)) add(it.id, a.n);
    if (candidatos.has(it.id)) continue;
    const tkIt = [tokens(it.nome), tokens(it.urna)].filter((t) => t.length);
    for (const a of arq) {
      if (a.tk.length < 2) continue;
      if (tkIt.some((t) => a.tk.every((x) => t.includes(x)) || (t.length >= 2 && t.every((x) => a.tk.includes(x))))) add(it.id, a.n);
    }
  }
  // unicidade nos dois sentidos
  const usos = new Map();
  for (const [id, s] of candidatos) if (s.size === 1) { const n = [...s][0]; usos.set(n, [...(usos.get(n) || []), id]); }
  const ligados = new Map();
  for (const [n, ids] of usos) if (ids.length === 1) ligados.set(ids[0], n);
  return ligados;
}

/* ---------------------------- o índice ---------------------------- */

/** Meses entre o primeiro e o último mês com despesa registrada (contando os meses sem despesa no meio). */
function mesesDeExercicio(porMes) {
  const ks = Object.keys(porMes).sort();
  if (!ks.length) return 0;
  const [a, b] = [ks[0], ks[ks.length - 1]].map((k) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5)) - 1);
  return b - a + 1;
}

/**
 * itens: deputados do TSE ({ id, nome, urna, ... }); dados: { anos: { ano: { deputados: { nome: { 'AAAA-MM': valor } } } } }
 * Devolve Map(id -> { nota, comp, parcial, motivo, ressalva, rank (depois), cotaMensal, meses }) e a lista de nomes não ligados.
 */
export function calcularEstaduais({ uf, itens, dados, anosJanela }) {
  const nomesArquivo = new Set();
  const somados = {}; // nome -> { 'AAAA-MM': valor } só dos anos da janela
  for (const ano of anosJanela) {
    for (const [nome, meses] of Object.entries(dados?.anos?.[ano]?.deputados || {})) {
      nomesArquivo.add(nome);
      Object.assign((somados[nome] ||= {}), meses);
    }
  }
  const ligados = ligarNomes(itens, [...nomesArquivo]);
  const saida = new Map();
  const cotas = [];
  for (const it of itens) {
    const nome = ligados.get(it.id);
    const meses = nome ? mesesDeExercicio(somados[nome]) : 0;
    if (nome && meses >= M.minMeses) {
      const total = Object.values(somados[nome]).reduce((a, b) => a + b, 0);
      cotas.push({ id: it.id, mensal: total / meses, meses, total });
    }
  }
  const pct = criarPercentil(cotas.map((c) => c.mensal));
  const cotaDe = new Map(cotas.map((c) => [c.id, c]));
  const comparar = cotas.length >= M.minColegas;
  for (const it of itens) {
    const c = cotaDe.get(it.id);
    const nome = ligados.get(it.id);
    const comp = M.componentes.map((x) => ({ k: x.k, peso: x.peso, s: null, f: 'Dado não encontrado ou não confirmado.' }));
    const porK = (k) => comp.find((x) => x.k === k);
    let motivoCota = null;
    if (!nome) motivoCota = 'não foi possível ligar o nome do deputado, com segurança, aos nomes do arquivo da Assembleia';
    else if (!c) motivoCota = `menos de ${M.minMeses} meses de despesas registradas no período; com tão pouco histórico a comparação não é justa (zero não é nota baixa)`;
    else if (!comparar) motivoCota = `só ${cotas.length} deputados com dados suficientes para comparar (mínimo ${M.minColegas})`;
    if (motivoCota) porK('cota').f = `Uso da verba de gabinete: ${motivoCota}.`;
    else {
      const s = arredondar((1 - pct(c.mensal)) * 100, 1);
      Object.assign(porK('cota'), { s, f: `Verba de gabinete: média de R$ ${Math.round(c.mensal).toLocaleString('pt-BR')} por mês em ${c.meses} meses (R$ ${Math.round(c.total).toLocaleString('pt-BR')} no total); pontuação ${s.toFixed(1).replace('.', ',')} entre ${cotas.length} colegas da mesma Assembleia (menos gasto = pontuação maior).` });
    }
    const usadas = comp.filter((x) => x.s != null).length;
    const nota = mediaPonderada(comp.map((x) => ({ peso: x.peso, s: x.s })), M.minCriterios);
    const parcial = { usadas, total: M.componentes.length, faltam: comp.filter((x) => x.s == null).map((x) => x.k) };
    saida.set(it.id, {
      nota, comp, parcial,
      motivo: nota == null ? `${motivoCota ? motivoCota.charAt(0).toUpperCase() + motivoCota.slice(1) : 'Dados insuficientes'}. Os demais critérios (votações, presença e projetos aprovados) ainda não têm leitura integrada para esta Assembleia.` : undefined,
      ressalva: nota != null ? `Índice parcial: só ${usadas} de ${M.componentes.length} critérios (uso da verba de gabinete). Votações, presença e projetos aprovados ainda não entram, porque a leitura desses dados da Assembleia não foi integrada. Mede só quanto o deputado gasta em relação aos colegas, não a qualidade do mandato. O deputado é comparado apenas com os colegas da mesma Assembleia.` : undefined
    });
  }
  return { resultado: saida, naoLigados: [...nomesArquivo].filter((n) => ![...ligados.values()].includes(n)), ligados: ligados.size, comDado: cotas.length };
}

/** Anos civis da janela (os 4 anos mais recentes, contando o atual). */
export const anosDaJanelaEstadual = (hoje) => Array.from({ length: M.janelaAnos }, (_, i) => hoje.getUTCFullYear() - M.janelaAnos + 1 + i);

const ADAPTADORES = { SP: { ler: lerAlesp, chave: 'cota' } };
export const UFS_COM_ADAPTADOR = Object.keys(ADAPTADORES);

/** Motivo mostrado nas casas que ainda não têm leitor. */
export const motivoSemAdaptador = (uf) => `A Assembleia Legislativa ${uf === 'DF' ? 'do Distrito Federal (CLDF)' : `de ${uf}`} ainda não tem leitura integrada ao Placar: o Placar só calcula o índice quando consegue ler, de fonte oficial, dados por deputado (verba, presença, votações ou projetos). O que foi pesquisado sobre esta casa está na página Fontes.`;

/**
 * Rotina diária: lê as Assembleias que têm adaptador, calcula o índice e regrava estaduais-{UF}.json.
 * Todas as outras ficam com nota nula e o motivo.
 */
/** Copia para a pasta de dados o registro, escrito à mão, do que foi pesquisado sobre cada Assembleia (a página Fontes mostra). */
export function publicarRegistroDeAssembleias(pasta) {
  try {
    const doc = JSON.parse(readFileSync(fileURLToPath(new URL('./curadoria/assembleias.json', import.meta.url)), 'utf-8'));
    gravarJson(path.join(pasta, 'assembleias.json'), doc);
    return true;
  } catch { return false; }
}

export async function atualizarEstaduais({ binario, pasta, hoje, log = () => {} }) {
  const anos = anosDaJanelaEstadual(hoje);
  const arq = (n) => path.join(pasta, n);
  publicarRegistroDeAssembleias(pasta);
  const docs = {};
  for (const uf of UFS) { const d = lerJsonSeExistir(arq(`estaduais-${uf}.json`)); if (d?.itens) docs[uf] = d; }
  if (!Object.keys(docs).length) return { ok: false, motivo: 'A lista de deputados estaduais do TSE ainda não existe (a rotina semanal ainda não terminou).' };
  const lidas = {}, erros = {};
  for (const [uf, ad] of Object.entries(ADAPTADORES)) {
    if (!docs[uf]) continue;
    try {
      const r = binario ? await ad.ler({ binario, pasta, hoje, anos, log }) : { ok: false, motivo: 'sem acesso à internet nesta rodada' };
      if (r.ok) lidas[uf] = r; else erros[uf] = r.motivo;
    } catch (e) { erros[uf] = String(e.message).slice(0, 150); }
  }
  const resumo = {};
  const todos = [];
  for (const [uf, doc] of Object.entries(docs)) {
    const dados = ADAPTADORES[uf] ? lerJsonSeExistir(arq(`anos/estaduais-${uf}.json`)) : null;
    if (ADAPTADORES[uf] && dados && (lidas[uf] || dados.anos)) {
      const r = calcularEstaduais({ uf, itens: doc.itens, dados, anosJanela: anos });
      for (const it of doc.itens) { const x = r.resultado.get(it.id); Object.assign(it, { nota: x.nota, comp: x.comp, parcial: x.parcial, motivo: x.motivo, ressalva: x.ressalva, fonteDados: ALESP.casa }); }
      atribuirPosicoes(doc.itens); // posição só entre os colegas da mesma Assembleia
      resumo[uf] = { ligados: r.ligados, comDado: r.comDado, naoLigados: r.naoLigados.length, ok: !!lidas[uf], erro: erros[uf] };
    } else {
      const motivo = ADAPTADORES[uf] ? `${erros[uf] || 'Os dados da Assembleia ainda não foram lidos.'} O índice aparece quando a leitura funcionar.` : motivoSemAdaptador(uf);
      for (const it of doc.itens) Object.assign(it, { nota: null, comp: [], parcial: undefined, ressalva: undefined, rank: null, motivo });
      if (ADAPTADORES[uf]) resumo[uf] = { ok: false, erro: erros[uf] };
    }
    gravarJson(arq(`estaduais-${uf}.json`), { ...doc, uf });
    todos.push(...doc.itens);
  }
  const comNota = todos.filter((i) => i.nota != null).length;
  log(`Deputados estaduais: ${comNota} de ${todos.length} com índice (${Object.keys(lidas).length} Assembleia(s) lida(s) de ${UFS_COM_ADAPTADOR.length} com leitor).`);
  return { ok: Object.keys(lidas).length > 0 || comNota > 0, total: todos.length, comNota, media: mediaDasNotas(todos.filter((i) => i.nota != null).map((i) => i.nota)), assembleias: resumo, motivo: Object.keys(lidas).length ? undefined : `Nenhuma Assembleia pôde ser lida: ${Object.values(erros).join('; ') || 'sem adaptador disponível'}` };
}

