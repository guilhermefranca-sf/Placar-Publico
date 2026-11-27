// Fontes independentes: catálogo, vigilância diária e valores conferidos à mão.
//
// O que este arquivo faz:
//  1. Lê e valida o catálogo (scripts/curadoria/fontes-independentes.json).
//  2. Vigia, todo dia, se cada fonte publicou algo novo (edição, mês ou atualização). A vigilância SÓ AVISA:
//     nada é copiado sozinho para o site. Um número novo só entra depois de conferido na fonte e escrito em
//     scripts/curadoria/indicadores-independentes.json.
//  3. Valida esses valores conferidos e grava site/dados/independentes.json (catálogo + valores).
//
// Regras do Placar: não inventar; ausência de dado nunca vira zero ("Dado não encontrado ou não confirmado");
// o que falhar na leitura mantém a última leitura boa e aparece como "falhou", sem apagar nada.

import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gravarJson, lerJsonSeExistir, esperar } from './util.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const CAMINHO_CATALOGO = path.join(AQUI, 'curadoria', 'fontes-independentes.json');
export const CAMINHO_CURADOS = path.join(AQUI, 'curadoria', 'indicadores-independentes.json');

export const STATUS_VALIDOS = ['em-uso', 'monitorada', 'catalogada'];
export const TIPOS_DE_VIGIA = ['pagina', 'url-mensal', 'banco-mundial'];
export const CARGOS_COM_USO = ['presidente', 'senadores', 'federais', 'governadores'];
export const MIN_TEXTO_PAGINA = 200;
export const NAO_CONFIRMADO = 'Dado não encontrado ou não confirmado';
export const REGRA_VIGILANCIA = 'A vigilância só avisa que há edição ou atualização nova. Nenhum número é copiado sozinho: ele só entra no Placar depois de conferido na fonte e registrado, com link e data.';

const ehHttps = (u) => typeof u === 'string' && /^https:\/\/\S+$/.test(u);
const ehData = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const texto = (v) => typeof v === 'string' && v.trim().length > 0;

export function lerCatalogo(caminho = CAMINHO_CATALOGO) {
  return JSON.parse(readFileSync(caminho, 'utf8'));
}
export function lerCurados(caminho = CAMINHO_CURADOS) {
  return JSON.parse(readFileSync(caminho, 'utf8'));
}

/** Confere o catálogo. Devolve a lista de problemas (vazia = tudo certo). */
export function validarCatalogo(cat) {
  const erros = [];
  if (!cat || !Array.isArray(cat.fontes) || !cat.fontes.length) return ['O catálogo não tem fontes.'];
  const ids = new Set();
  for (const f of cat.fontes) {
    const rot = f?.id || '(sem id)';
    if (!texto(f.id) || !/^[a-z0-9-]+$/.test(f.id)) erros.push(`${rot}: id inválido.`);
    else if (ids.has(f.id)) erros.push(`${rot}: id repetido.`);
    ids.add(f.id);
    if (!texto(f.nome)) erros.push(`${rot}: falta o nome.`);
    if (!ehHttps(f.url)) erros.push(`${rot}: a URL precisa começar com https://.`);
    if (f.metodologia != null && !ehHttps(f.metodologia)) erros.push(`${rot}: a URL da metodologia é inválida.`);
    if (!STATUS_VALIDOS.includes(f.status)) erros.push(`${rot}: status inválido (${f.status}).`);
    if (!ehData(f.verificadoEm)) erros.push(`${rot}: falta a data de verificação (AAAA-MM-DD).`);
    if (!f.usoNoPlacar || CARGOS_COM_USO.some((c) => !texto(f.usoNoPlacar[c]))) erros.push(`${rot}: "usoNoPlacar" precisa dizer o uso para ${CARGOS_COM_USO.join(', ')}.`);
    if (!Array.isArray(f.fatos)) erros.push(`${rot}: "fatos" precisa ser uma lista.`);
    else for (const [i, fato] of f.fatos.entries()) {
      if (!texto(fato.texto) || !ehHttps(fato.url) || !texto(fato.tipoDeLeitura)) erros.push(`${rot}: o fato ${i + 1} precisa de texto, URL https e tipo de leitura.`);
    }
    const v = f.vigia;
    if (v) {
      if (!TIPOS_DE_VIGIA.includes(v.tipo)) erros.push(`${rot}: tipo de vigilância inválido (${v.tipo}).`);
      else if (v.tipo === 'pagina' && !ehHttps(v.url)) erros.push(`${rot}: a página vigiada precisa de URL https.`);
      else if (v.tipo === 'url-mensal' && !(ehHttps(v.modelo) && v.modelo.includes('{AAAAMM}') && v.modelo.includes('{AAAA}'))) erros.push(`${rot}: o modelo mensal precisa de {AAAA} e {AAAAMM}.`);
      else if (v.tipo === 'banco-mundial' && !(Array.isArray(v.fontes) && v.fontes.length)) erros.push(`${rot}: faltam os números das bases do Banco Mundial.`);
    }
    if (f.status === 'em-uso' && !(f.fatos.length || f.id === 'banco-mundial')) erros.push(`${rot}: fonte em uso precisa de ao menos um fato conferido.`);
  }
  return erros;
}

/**
 * Separa os valores conferidos que podem ser publicados dos que ficam de fora.
 * Fica de fora o que estiver incompleto ou que aponte para uma fonte que não está "em uso" no catálogo.
 */
export function validarIndicadores(curados, catalogo, hoje = new Date()) {
  const fontes = new Map((catalogo?.fontes || []).map((f) => [f.id, f]));
  const validos = [];
  const descartados = [];
  const hojeIso = hoje.toISOString().slice(0, 10);
  for (const ind of curados?.indicadores || []) {
    const motivos = [];
    if (!texto(ind.id)) motivos.push('sem id');
    const fonte = fontes.get(ind.fonteId);
    if (!fonte) motivos.push('fonte fora do catálogo');
    else if (fonte.status !== 'em-uso') motivos.push('a fonte não está marcada como "em uso" no catálogo');
    if (!CARGOS_COM_USO.includes(ind.cargo)) motivos.push('cargo inválido');
    if (!texto(ind.secao)) motivos.push('sem seção');
    if (!texto(ind.nome) || !texto(ind.unidade)) motivos.push('sem nome ou unidade');
    if (!['maior', 'menor', 'neutro'].includes(ind.melhor)) motivos.push('sentido ("melhor") inválido');
    if (!Array.isArray(ind.pontos) || !ind.pontos.length || ind.pontos.some((p) => !texto(p.rotulo) || typeof p.valor !== 'number' || !Number.isFinite(p.valor))) motivos.push('pontos inválidos');
    if (!texto(ind.edicao)) motivos.push('sem edição');
    if (!Array.isArray(ind.urls) || !ind.urls.length || ind.urls.some((u) => !ehHttps(u))) motivos.push('sem endereços (https) da publicação');
    if (!texto(ind.aviso)) motivos.push('sem aviso de leitura');
    if (!ehData(ind.conferidoEm)) motivos.push('sem data de conferência');
    else if (ind.conferidoEm > hojeIso) motivos.push('data de conferência no futuro');
    if (motivos.length) { descartados.push({ id: ind.id || '(sem id)', motivos }); continue; }
    validos.push({
      id: ind.id, cargo: ind.cargo, secao: ind.secao, nome: ind.nome, unidade: ind.unidade, melhor: ind.melhor, casas: Number.isInteger(ind.casas) ? ind.casas : 1,
      pontos: ind.pontos.map((p) => ({ ...p })), destaque: ind.destaque || null, edicao: ind.edicao, leitura: ind.leitura || null, urls: [...ind.urls], aviso: ind.aviso,
      conferidoEm: ind.conferidoEm, fonte: { id: fonte.id, nome: fonte.nome, organizacao: fonte.organizacao, url: fonte.url, tipo: fonte.tipo }
    });
  }
  return { validos, descartados };
}

/** Monta o arquivo público (catálogo sem os detalhes técnicos da vigilância + valores conferidos). */
export function montarIndependentes({ catalogo, curados, hoje = new Date() }) {
  const erros = validarCatalogo(catalogo);
  if (erros.length) throw new Error('Catálogo de fontes inválido: ' + erros.slice(0, 3).join(' | '));
  const { validos, descartados } = validarIndicadores(curados, catalogo, hoje);
  return {
    versao: 1,
    geradoEm: hoje.toISOString(),
    aviso: catalogo.aviso,
    regras: catalogo.regras,
    status: catalogo.status,
    fontes: catalogo.fontes.map(({ vigia, ...publica }) => ({ ...publica, vigiada: Boolean(vigia) })),
    indicadores: validos,
    descartados: descartados.length
  };
}

/* ----------------------------- vigilância diária ----------------------------- */

export function textoDaPagina(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Marca de uma página: resumo (hash) do texto e o ano mais recente que ela cita. */
export function marcaDaPagina(html, hoje = new Date()) {
  const t = textoDaPagina(html).slice(0, 300000);
  if (t.length < MIN_TEXTO_PAGINA) return null; // página vazia ou montada por JavaScript: a leitura não serve de base
  const limite = hoje.getUTCFullYear() + 1;
  const anos = [...t.matchAll(/\b(20[1-4]\d)\b/g)].map((m) => Number(m[1])).filter((a) => a <= limite);
  return { hash: createHash('sha256').update(t).digest('hex').slice(0, 16), anoMaisRecente: anos.length ? Math.max(...anos) : null, tamanho: t.length };
}

/** AAAAMM do mês de `hoje` e dos n-1 anteriores, do mais novo para o mais antigo. */
export function mesesRecentes(hoje, n = 4) {
  const r = [];
  let a = hoje.getUTCFullYear(); let m = hoje.getUTCMonth() + 1;
  for (let i = 0; i < n; i++) {
    r.push(`${a}${String(m).padStart(2, '0')}`);
    m -= 1; if (m === 0) { m = 12; a -= 1; }
  }
  return r;
}

/** Procura uma chave em qualquer lugar de um JSON (a API do Banco Mundial devolve uma lista com metadados e dados). */
export function acharChave(obj, chave, achados = []) {
  if (Array.isArray(obj)) obj.forEach((x) => acharChave(x, chave, achados));
  else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) { if (k === chave && typeof v === 'string') achados.push(v); else acharChave(v, chave, achados); }
  }
  return achados;
}

/** Resposta real de "a URL existe?": usa HEAD e, se o servidor recusar, pede só o primeiro byte. */
export async function sondarReal(url, { tipo } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 30000);
  const cab = { 'user-agent': 'placar-publico/1.0 (projeto de transparencia)' };
  try {
    let r = await fetch(url, { method: 'HEAD', signal: ctl.signal, headers: cab });
    if ([403, 405, 501].includes(r.status)) r = await fetch(url, { method: 'GET', signal: ctl.signal, headers: { ...cab, range: 'bytes=0-0' } });
    const tp = r.headers.get('content-type') || '';
    return { ok: r.ok && (!tipo || new RegExp(tipo, 'i').test(tp)), status: r.status };
  } finally { clearTimeout(t); }
}

const dia = (hoje) => hoje.toISOString().slice(0, 10);

/** Lê a marca atual de uma fonte. Lança erro se não conseguir; quem chama trata. */
async function lerMarca(fonte, { texto: baixar, sondar, json }, hoje) {
  const v = fonte.vigia;
  if (v.tipo === 'pagina') {
    const marca = marcaDaPagina(await baixar(v.url), hoje);
    if (!marca) throw new Error('A página não trouxe texto legível (pode ser montada por JavaScript).');
    return marca;
  }
  if (v.tipo === 'url-mensal') {
    if (typeof sondar !== 'function') throw new Error('Sem como sondar endereços nesta execução.');
    let achou = null; let ultimoErro = null;
    for (const ym of mesesRecentes(hoje, v.meses || 4)) {
      const url = v.modelo.replace('{AAAAMM}', ym).replace('{AAAA}', ym.slice(0, 4));
      try {
        const r = await sondar(url, { tipo: 'pdf' });
        if (r?.ok) { achou = ym; break; }
      } catch (e) { ultimoErro = e; }
    }
    if (!achou) throw (ultimoErro || new Error(`Nenhum arquivo encontrado nos últimos ${v.meses || 4} meses.`));
    return { ultimoMes: achou };
  }
  if (v.tipo === 'banco-mundial') {
    const datas = [];
    for (const id of v.fontes) {
      const r = await json(`https://api.worldbank.org/v2/sources/${id}?format=json`);
      datas.push(...acharChave(r, 'lastupdated'));
    }
    const validas = datas.filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d)).map((d) => d.slice(0, 10)).sort();
    if (!validas.length) throw new Error('A resposta do Banco Mundial não trouxe a data de atualização.');
    return { atualizadoEm: validas[validas.length - 1] };
  }
  throw new Error(`Tipo de vigilância desconhecido: ${v.tipo}`);
}

/** Compara a marca nova com a anterior e diz o que mudou. */
export function compararMarcas(tipo, antes, agora) {
  if (!antes) return { status: 'primeira-leitura' };
  if (tipo === 'pagina') {
    if (antes.anoMaisRecente != null && agora.anoMaisRecente != null && agora.anoMaisRecente > antes.anoMaisRecente) return { status: 'nova-edicao', de: String(antes.anoMaisRecente), para: String(agora.anoMaisRecente) };
    return { status: antes.hash === agora.hash ? 'sem-mudanca' : 'mudou' };
  }
  if (tipo === 'url-mensal') return agora.ultimoMes > (antes.ultimoMes || '') ? { status: 'nova-edicao', de: antes.ultimoMes || null, para: agora.ultimoMes } : { status: 'sem-mudanca' };
  if (tipo === 'banco-mundial') return agora.atualizadoEm > (antes.atualizadoEm || '') ? { status: 'nova-edicao', de: antes.atualizadoEm || null, para: agora.atualizadoEm } : { status: 'sem-mudanca' };
  return { status: 'sem-mudanca' };
}

/** Vigia uma fonte e devolve o registro dela no arquivo de vigilância. */
export async function vigiarFonte(fonte, anterior, deps, hoje) {
  const base = { id: fonte.id, nome: fonte.nome, url: fonte.url, tipo: fonte.vigia.tipo, lidoEm: hoje.toISOString() };
  try {
    const marca = await lerMarca(fonte, deps, hoje);
    const r = compararMarcas(fonte.vigia.tipo, anterior?.marcador, marca);
    const novidade = r.status === 'nova-edicao' ? { em: dia(hoje), de: r.de ?? null, para: r.para ?? null } : (anterior?.novidade || null);
    return { ...base, status: r.status, marcador: marca, ultimoSucesso: hoje.toISOString(), falhasSeguidas: 0, ...(novidade ? { novidade } : {}) };
  } catch (e) {
    return {
      ...base, status: 'falhou', motivo: String(e.message).slice(0, 200),
      marcador: anterior?.marcador || null, ultimoSucesso: anterior?.ultimoSucesso || null,
      falhasSeguidas: (anterior?.falhasSeguidas || 0) + 1, ...(anterior?.novidade ? { novidade: anterior.novidade } : {})
    };
  }
}

/** Uma novidade só está "pendente" enquanto for mais nova que a última conferência registrada no catálogo. */
export const pendenteDeConferencia = (registro, fonte) => Boolean(registro?.novidade?.em && fonte?.verificadoEm && registro.novidade.em > fonte.verificadoEm);

/** Vigia todas as fontes do catálogo e grava vigilancia.json. */
export async function vigiarFontes({ catalogo, pasta, texto: baixar, sondar, json, hoje = new Date(), log = () => {}, pausaMs = 0 }) {
  const erros = validarCatalogo(catalogo);
  if (erros.length) return { ok: false, motivo: 'Catálogo inválido: ' + erros.slice(0, 2).join(' | ') };
  const arquivo = path.join(pasta, 'vigilancia.json');
  const antes = lerJsonSeExistir(arquivo)?.fontes || {};
  const registros = {};
  const novidades = []; const mudou = []; let lidas = 0; let falhas = 0;
  for (const fonte of catalogo.fontes.filter((f) => f.vigia)) {
    const r = await vigiarFonte(fonte, antes[fonte.id], { texto: baixar, sondar, json }, hoje);
    registros[fonte.id] = { ...r, pendente: pendenteDeConferencia(r, fonte) };
    if (r.status === 'falhou') { falhas++; log(`  vigilância: ${fonte.id} falhou (${r.motivo}).`); }
    else { lidas++; if (r.status === 'nova-edicao') { novidades.push(fonte.id); log(`  vigilância: ${fonte.id} tem edição nova (${r.novidade?.de ?? '?'} → ${r.novidade?.para ?? '?'}). Falta conferir os valores.`); } else if (r.status === 'mudou') mudou.push(fonte.id); }
    if (pausaMs) await esperar(pausaMs);
  }
  gravarJson(arquivo, { versao: 1, geradoEm: hoje.toISOString(), regra: REGRA_VIGILANCIA, fontes: registros });
  return { ok: lidas > 0, vigiadas: lidas + falhas, lidas, falhas, novidades, mudou, pendentes: Object.values(registros).filter((x) => x.pendente).map((x) => x.id) };
}

/** Valida o que foi conferido à mão e grava independentes.json. */
export function atualizarIndependentes({ catalogo = lerCatalogo(), curados = lerCurados(), pasta, hoje = new Date(), log = () => {} }) {
  const pub = montarIndependentes({ catalogo, curados, hoje });
  const { descartados } = validarIndicadores(curados, catalogo, hoje);
  for (const d of descartados) log(`  independentes: "${d.id}" não foi publicado (${d.motivos.join('; ')}).`);
  gravarJson(path.join(pasta, 'independentes.json'), pub);
  return { ok: true, fontes: pub.fontes.length, indicadores: pub.indicadores.length, descartados: pub.descartados };
}
