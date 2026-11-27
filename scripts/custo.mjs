// Custo de cada deputado federal para os cofres públicos, a partir do Portal da Transparência da Câmara.
//
// A página de gastos do Portal, aberta para UM deputado e UM ano, traz em frases os totais dele:
//   "Em 2026 , na legislatura 57 , gasto da deputada X com cota: R$ 382.794,01"
//   "... gasto da deputada X com verba de gabinete: R$ 1.064.948,40"
//   "... gasto da deputada X com auxílio-moradia: R$ 7.253,00"        (só quando há dado)
//   "... gasto da deputada X com viagens oficiais: R$ 26.057,99"       (ou "Ainda não há dados disponíveis")
// O código do deputado no filtro do Portal é o mesmo da API de dados abertos.
//
// Por que não o arquivo anual da cota (Ano-AAAA.csv.zip)? Porque ele não traz tipos de despesa que o Portal soma, como
// "PASSAGEM AÉREA - SIGEPA": em 2026 faltavam cerca de 19% do total oficial (diagnóstico de 26/11/2026). Esta leitura
// bate com o total do Portal.
//
// Regras:
//   - o subsídio fica de fora (igual para todos);
//   - "Ainda não há dados disponíveis" significa que o Portal não publicou lançamento: entra como R$ 0 só nesta soma e
//     o perfil mostra que não há lançamento. Página que não abre ou sem as frases-âncora (cota e verba) NÃO vira zero:
//     o ano fica "não confirmado" e o deputado fica sem este critério até a próxima leitura;
//   - não medidos (sem valor por deputado): ajuda de custo, plano de saúde, serviço gráfico, encargos dos secretários,
//     uso de imóvel funcional (só dias, sem valor em reais).

import { esperar } from './util.mjs';

export const PORTAL = 'https://www.camara.leg.br/transparencia/gastos-parlamentares';
export const VERSAO_CUSTO = 1;
export const NAO_MEDIDOS = [
  'ajuda de custo (paga no início e no fim do mandato)',
  'plano de saúde e atendimento médico (Pró-Saúde)',
  'serviço gráfico',
  'encargos dos secretários parlamentares (13º, férias, auxílio-alimentação)',
  'uso de imóvel funcional: valor não publicado por deputado (a Câmara publica só os dias de ocupação)'
];

export const legislaturaDoAno = (ano) => 57 + Math.floor((ano - 2023) / 4);
export const urlGastos = (id, ano) =>
  `${PORTAL}?legislatura=${legislaturaDoAno(ano)}&ano=${ano}&mes=&por=deputado&deputado=${encodeURIComponent(id)}&uf=&partido=`;

const ENTIDADES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ccedil: 'ç', Ccedil: 'Ç', atilde: 'ã', otilde: 'õ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', acirc: 'â', ecirc: 'ê', ocirc: 'ô', agrave: 'à' };

/** HTML -> texto corrido, sem scripts e sem estilos. */
export function textoDaPagina(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENTIDADES[n] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

// Troca letras acentuadas por letras simples SEM mudar o tamanho do texto (para casar frases sem se preocupar com acento).
const DE = 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ';
const PARA = 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN';
const semAcento = (t) => t.replace(/[áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ]/g, (c) => PARA[DE.indexOf(c)]);

const ROTULOS = { cota: 'cota', verba: 'verba de gabinete', moradia: 'auxilio-moradia', viagens: 'viagens oficiais' };

/** "R$ 1.064.948,40" -> 1064948.4 (aceita sinal negativo). */
export function valorBR(s) {
  const m = /(-?)\s*([\d.]+,\d{2})/.exec(String(s || ''));
  if (!m) return null;
  const n = Number(m[2].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? (m[1] ? -n : n) : null;
}

/**
 * Lê a página do Portal de UM deputado e UM ano.
 * Devolve { ok: true, cota, verba, moradia, viagens, sr: [rubricas sem lançamento] }
 *      ou { ok: false, motivo }.
 * Só aceita a página se as duas frases-âncora (cota e verba de gabinete) existirem: sem elas, a estrutura mudou ou a
 * página é de outro tipo, e o Placar não chuta valor.
 */
export function lerPaginaDeGastos(html, ano) {
  const texto = textoDaPagina(html);
  if (texto.length < 500) return { ok: false, motivo: 'página vazia ou curta demais' };
  const plano = semAcento(texto);
  const achados = {};
  const re = /gasto d[ao]s? deputad[ao]s?\b.{1,140}? com (cota|verba de gabinete|auxilio-moradia|viagens oficiais)\s*:\s*(R\$\s*-?[\d.]+,\d{2}|Ainda nao ha dados disponiveis)/gi;
  let m;
  while ((m = re.exec(plano))) {
    const k = Object.keys(ROTULOS).find((c) => ROTULOS[c] === m[1].toLowerCase());
    if (!k || k in achados) continue; // vale a primeira frase de cada tipo
    achados[k] = /^R\$/i.test(m[2]) ? valorBR(texto.slice(m.index + m[0].length - m[2].length, m.index + m[0].length)) : 'sem';
  }
  // O ano da página tem de ser o pedido (o Portal devolve o ano corrente quando o parâmetro é ignorado).
  const anos = [...plano.matchAll(/Em (\d{4})\s*,\s*na legislatura/g)].map((x) => x[1]);
  if (anos.length && !anos.every((a) => a === String(ano))) return { ok: false, motivo: `a página trouxe o ano ${[...new Set(anos)].join(', ')} em vez de ${ano}` };
  if (!('cota' in achados) || !('verba' in achados)) {
    return { ok: false, motivo: `faltam as frases de ${['cota', 'verba'].filter((k) => !(k in achados)).join(' e ')} (o formato da página pode ter mudado)` };
  }
  const sr = [];
  const out = { ok: true };
  for (const k of Object.keys(ROTULOS)) {
    const v = achados[k];
    if (v === undefined || v === 'sem' || v === null) { out[k] = 0; sr.push(k); } else out[k] = Math.round(v * 100) / 100;
  }
  out.sr = sr;
  return out;
}

/** Precisa ler de novo? Ano em curso: a cada ~20 horas; anos fechados: a cada 7 dias. */
export function precisaLer(entrada, ano, anoAtual, hoje) {
  if (!entrada || !entrada.em) return true;
  const idadeH = (hoje - new Date(entrada.em)) / 3600000;
  if (entrada.erro) return idadeH >= 20; // erro de uma leitura: tenta de novo no dia seguinte
  return ano >= anoAtual ? idadeH >= 20 : idadeH >= 24 * 7;
}

/**
 * Lê (ou relê) as páginas do Portal dentro do tempo disponível. Os anos já lidos ficam guardados.
 *   fontes.texto(url) -> texto da página
 *   cache = { ler(ano) -> { versao, ano, itens } | null, gravar(ano, doc) }
 * Prioridade: o que nunca foi lido, depois o mais antigo. O que não deu tempo fica para a próxima rodada.
 */
export async function atualizarCusto({ fontes, ids, anos, anoAtual, cache, hoje = new Date(), orcamentoMs = 25 * 60000, paralelo = 4, pausaMs = Number(process.env.PLACAR_PAUSA_MS ?? 150), aoAndar = () => {} }) {
  const docs = {};
  for (const a of anos) {
    const g = cache.ler(a);
    docs[a] = g && g.versao === VERSAO_CUSTO && g.ano === a ? g : { versao: VERSAO_CUSTO, ano: a, itens: {} };
  }
  const tarefas = [];
  for (const a of anos) for (const id of ids) if (precisaLer(docs[a].itens[id], a, anoAtual, hoje)) tarefas.push({ a, id, em: docs[a].itens[id]?.em || '' });
  // Nunca lidos primeiro (em vazio), depois os mais antigos.
  tarefas.sort((x, y) => (x.em < y.em ? -1 : x.em > y.em ? 1 : x.a - y.a || Number(x.id) - Number(y.id)));
  const inicio = Date.now();
  let proximo = 0, feitos = 0, falhas = 0, estouro = false;
  const motivos = new Map();
  async function trabalhador() {
    while (true) {
      if (Date.now() - inicio > orcamentoMs) { estouro = true; return; }
      const k = proximo++;
      if (k >= tarefas.length) return;
      const { a, id } = tarefas[k];
      try {
        const r = lerPaginaDeGastos(await fontes.texto(urlGastos(id, a)), a);
        if (r.ok) {
          const { ok, ...v } = r;
          docs[a].itens[id] = { ...v, em: hoje.toISOString() };
          feitos++;
        } else {
          falhas++;
          motivos.set(r.motivo, (motivos.get(r.motivo) || 0) + 1);
          // Mantém a leitura boa anterior, se existir; senão guarda só o erro (para não tentar de novo a cada minuto).
          if (!docs[a].itens[id] || docs[a].itens[id].erro) docs[a].itens[id] = { erro: r.motivo, em: hoje.toISOString() };
        }
      } catch (e) {
        falhas++;
        const motivo = String(e.message).replace(/https?:\/\/\S+/g, '').slice(0, 80);
        motivos.set(motivo, (motivos.get(motivo) || 0) + 1);
        if (!docs[a].itens[id] || docs[a].itens[id].erro) docs[a].itens[id] = { erro: motivo, em: hoje.toISOString() };
      }
      if ((feitos + falhas) % 200 === 0) aoAndar(`custo: ${feitos + falhas} de ${tarefas.length} páginas`);
      if (pausaMs) await esperar(pausaMs);
    }
  }
  await Promise.all(Array.from({ length: Math.min(paralelo, Math.max(1, tarefas.length)) }, trabalhador));
  for (const a of anos) cache.gravar(a, { ...docs[a], geradoEm: hoje.toISOString() });
  return { docs, tentativas: feitos + falhas, feitos, falhas, pendentes: Math.max(0, tarefas.length - proximo + (estouro ? 1 : 0)), parouPorTempo: estouro, motivos: Object.fromEntries(motivos) };
}

/**
 * Soma o custo de UM deputado nos anos em que ele esteve em exercício (do ano da primeira presença até o ano atual).
 * Devolve { total, anos: {ano: {cota, verba, moradia, viagens, sr}}, componentes: {cota, verba, moradia, viagens} }
 *      ou { erro } quando algum ano necessário não foi lido com sucesso (nada de somar o que falta como zero).
 */
export function somarCusto(docs, id, anoDe, anoAte) {
  const anos = {};
  const comp = { cota: 0, verba: 0, moradia: 0, viagens: 0 };
  const faltam = [];
  for (let a = anoDe; a <= anoAte; a++) {
    const e = docs[a]?.itens?.[id];
    if (!e || e.erro) { faltam.push(a); continue; }
    anos[a] = { cota: e.cota, verba: e.verba, moradia: e.moradia, viagens: e.viagens, sr: e.sr || [] };
    for (const k of Object.keys(comp)) comp[k] += e[k] || 0;
  }
  if (faltam.length) return { erro: `a leitura do Portal de ${faltam.join(', ')} ainda não foi concluída para este deputado`, faltam };
  const componentes = Object.fromEntries(Object.entries(comp).map(([k, v]) => [k, Math.round(v * 100) / 100]));
  return { total: Math.round(Object.values(comp).reduce((a, b) => a + b, 0) * 100) / 100, anos, componentes };
}

/** Lê do disco o que já foi guardado (usado quando a leitura do Portal falha por inteiro). */
export function docsDoCache(cache, anos) {
  const docs = {};
  for (const a of anos) {
    const g = cache.ler(a);
    docs[a] = g && g.versao === VERSAO_CUSTO && g.ano === a ? g : { versao: VERSAO_CUSTO, ano: a, itens: {} };
  }
  return docs;
}
