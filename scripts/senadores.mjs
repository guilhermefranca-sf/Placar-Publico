// Senadores (versão 8): lista dos senadores em exercício (nome, partido, UF, foto oficial) e o critério
// "custo para os cofres públicos", a partir da cota para o exercício da atividade parlamentar (CEAPS).
//
// COMO ESTE MÓDULO TRATA O QUE NÃO FOI CONFERIDO
//   Os formatos das respostas do Senado abaixo seguem a documentação pública, mas não foram conferidos contra a
//   resposta real do Senado antes desta versão. Por isso a leitura é rígida: se a resposta não tiver a forma esperada,
//   o critério fica "Dado não encontrado ou não confirmado" (com o motivo e as chaves que vieram, para diagnóstico) e
//   NADA é preenchido por estimativa. Ausência de dado nunca vira zero.
//
// O QUE É LIDO
//   - Lista de senadores em exercício:   {BASE}/senador/lista/atual
//   - Períodos de exercício de cada um:  {BASE}/senador/{código}/mandatos
//   - CEAPS, ano a ano:                  adm.senado.leg.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/{ano}
//
// O QUE AINDA NÃO É LIDO (aparece como "Dado não encontrado ou não confirmado"; sai da conta, não vira nota zero)
//   projetos aprovados, votações nominais, presença no Plenário, presença em comissões, auxílio-moradia.
//
// PRIVACIDADE
//   A planilha da CEAPS traz CPF/CNPJ e nome de fornecedores. Eles são descartados no momento da leitura de cada
//   linha: só ano, mês, código do senador e valor são guardados. Nenhum CPF é lido, guardado ou publicado.

import { emLotes, criarPercentil, arredondar, dataBR, reais } from './util.mjs';
import { METODO, mediaPonderada, atribuirPosicoes, pesoDe } from './nota.mjs';
import { anosDaJanela } from './federais.mjs';

export const BASE_SENADO = 'https://legis.senado.leg.br/dadosabertos';
export const URLS_LISTA = [`${BASE_SENADO}/senador/lista/atual`, `${BASE_SENADO}/senador/lista/atual.json`];
export const urlMandatos = (cod) => `${BASE_SENADO}/senador/${encodeURIComponent(cod)}/mandatos`;
export const urlsCeaps = (ano) => [
  `https://adm.senado.leg.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${ano}`,
  `https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${ano}`
];
/** Endereços só para sondagem do formato (ver sondarSenado): nada daqui entra no índice. */
export const urlsSondagem = (cod) => ({
  autorias: `${BASE_SENADO}/senador/${encodeURIComponent(cod)}/autorias`,
  votacoes: `${BASE_SENADO}/senador/${encodeURIComponent(cod)}/votacoes`,
  comissoes: `${BASE_SENADO}/senador/${encodeURIComponent(cod)}/comissoes`
});

export const MIN_SENADORES = 70;       // o Senado tem 81 cadeiras; menos de 70 na lista indica falha
export const VERSAO_CEAPS = 1;         // muda quando o formato do arquivo guardado de cada ano muda
export const MAX_INVALIDAS = 0.05;     // acima de 5% de linhas ilegíveis, o ano inteiro é recusado
export const MIN_LINHAS = { fechado: 2000, atual: 200 }; // um ano de CEAPS tem dezenas de milhares de linhas
const DIAS_FALLBACK = 7;               // a leitura guardada do ano em curso só serve se tiver até 7 dias
const DIA = 86400000;
const MSG = 'Dado não encontrado ou não confirmado';

export const NAO_MEDIDOS_SENADO = [
  'auxílio-moradia (o Placar ainda não lê um valor por senador de fonte conferida)',
  'remuneração do pessoal do gabinete (valor por senador ainda não lido)',
  'missões e viagens oficiais pagas diretamente pelo Senado (valor por senador ainda não lido)',
  'assistência à saúde (o Senado publica só o total mensal, sem separar por senador)',
  'uso de apartamento funcional (valor não publicado por senador)'
];

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const brl = (v) => reais(v);
const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
const dataOk = (d) => (/^\d{4}-\d{2}-\d{2}/.test(String(d || '')) ? String(d).slice(0, 10) : null);

/** Erro de formato com as chaves que vieram, para o diagnóstico no log (só nomes de chaves, nunca valores). */
export function erroFormato(o, r) {
  const topo = r && typeof r === 'object' ? (Array.isArray(r) ? `lista com ${r.length} itens` : `chaves: ${Object.keys(r).slice(0, 10).join(', ') || '(nenhuma)'}`) : `tipo ${typeof r}`;
  return new Error(`Formato inesperado em ${o} (${topo}).`);
}

/** Só endereços do próprio Senado, sempre com https. */
export function urlDoSenado(u) {
  try {
    const x = new URL(String(u));
    if (!/(^|\.)senado\.(leg|gov)\.br$/i.test(x.hostname)) return null;
    x.protocol = 'https:';
    return x.toString();
  } catch { return null; }
}

/** Lista de senadores em exercício. Recusa respostas com menos de MIN_SENADORES nomes. */
export function lerLista(r, minimo = MIN_SENADORES) {
  const base = r?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar;
  if (!base) throw erroFormato('lista de senadores', r);
  const itens = [];
  const vistos = new Set();
  for (const p of arr(base)) {
    const idp = p?.IdentificacaoParlamentar || {};
    const id = String(idp.CodigoParlamentar ?? '').trim();
    const nome = String(idp.NomeParlamentar ?? '').trim();
    if (!/^\d{1,8}$/.test(id) || !nome || vistos.has(id)) continue;
    vistos.add(id);
    const uf = String(idp.UfParlamentar ?? '').trim().toUpperCase();
    itens.push({
      id, nome,
      partido: String(idp.SiglaPartidoParlamentar ?? '').trim() || null,
      uf: /^[A-Z]{2}$/.test(uf) ? uf : null,
      foto: urlDoSenado(idp.UrlFotoParlamentar),
      pagina: urlDoSenado(idp.UrlPaginaParlamentar)
    });
  }
  if (itens.length < minimo) throw new Error(`O Senado devolveu só ${itens.length} senadores em exercício (o esperado é pelo menos ${minimo}); parece falha ou mudança de formato.`);
  return itens;
}

/** Junta intervalos que se tocam. fim null = ainda em exercício. */
export function unirIntervalos(lista) {
  const ord = lista.map((x) => ({ ini: x.ini, fim: x.fim || null })).sort((a, b) => (a.ini < b.ini ? -1 : a.ini > b.ini ? 1 : 0));
  const out = [];
  for (const x of ord) {
    const ult = out[out.length - 1];
    if (ult && (ult.fim === null || x.ini <= ult.fim)) {
      if (ult.fim !== null && (x.fim === null || x.fim > ult.fim)) ult.fim = x.fim;
    } else out.push({ ...x });
  }
  return out;
}

/**
 * Períodos em que o senador esteve em exercício, a partir de /senador/{cod}/mandatos.
 *   base 'exercicios': a lista de exercícios publicada pelo Senado (considera licenças e suplentes);
 *   base 'mandato'   : só as datas da legislatura, e só para titulares; não enxerga licença (o perfil avisa).
 * Devolve null se não houver nenhuma data legível: o custo do senador fica "não confirmado".
 */
export function lerMandatos(r) {
  const mandatos = arr(r?.MandatoParlamentar?.Parlamentar?.Mandatos?.Mandato);
  const exerc = [];
  for (const m of mandatos) {
    for (const e of arr(m?.Exercicios?.Exercicio)) {
      const ini = dataOk(e?.DataInicio);
      const fim = dataOk(e?.DataFim);
      if (ini && (!fim || fim >= ini)) exerc.push({ ini, fim });
    }
  }
  if (exerc.length) return { base: 'exercicios', intervalos: unirIntervalos(exerc) };
  const leg = [];
  for (const m of mandatos) {
    if (!/^titular/i.test(String(m?.DescricaoParticipacao || ''))) continue;
    const ini = dataOk(m?.PrimeiraLegislaturaDoMandato?.DataInicio);
    const fim = dataOk(m?.SegundaLegislaturaDoMandato?.DataFim);
    if (ini && fim && fim >= ini) leg.push({ ini, fim });
  }
  if (leg.length) return { base: 'mandato', intervalos: unirIntervalos(leg) };
  return null;
}

/** Dias em exercício dentro de [ini, fim] (datas ISO, fim inclusive). */
export function diasEmExercicio(intervalos, ini, fim) {
  let dias = 0;
  for (const x of intervalos) {
    const a = x.ini > ini ? x.ini : ini;
    const b = x.fim && x.fim < fim ? x.fim : fim;
    if (b >= a) dias += Math.round((new Date(b) - new Date(a)) / DIA) + 1;
  }
  return dias;
}

/** Primeiro dia de exercício dentro de [ini, fim], ou null. */
export function inicioNoPeriodo(intervalos, ini, fim) {
  let melhor = null;
  for (const x of intervalos) {
    const a = x.ini > ini ? x.ini : ini;
    const b = x.fim && x.fim < fim ? x.fim : fim;
    if (b >= a && (melhor === null || a < melhor)) melhor = a;
  }
  return melhor;
}

/** "1.234,56" | "1234,56" | "1234.56" | 1234.56 -> número; qualquer outra coisa -> NaN. */
export function valorNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string') return NaN;
  let s = v.trim().replace(/^R\$\s*/, '');
  if (!/^-?[\d.,]+$/.test(s)) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Lê as despesas da CEAPS de um ano e soma por senador e mês. Só ano, mês, código e valor são guardados:
 * CPF/CNPJ, fornecedor, documento e detalhamento são descartados aqui, linha a linha.
 * Devolve { ano, linhas, invalidas, itens: { codigo: { mes: valor } } }.
 */
export function lerCeaps(r, ano, { minLinhas = MIN_LINHAS.fechado } = {}) {
  let linhas = r;
  if (!Array.isArray(linhas) && r && typeof r === 'object') {
    linhas = Object.values(r).find((v) => Array.isArray(v) && v.length) || null;
  }
  if (!Array.isArray(linhas)) throw erroFormato(`despesas da CEAPS de ${ano}`, r);
  const itens = {};
  let validas = 0, invalidas = 0;
  for (const l of linhas) {
    const a = Number(l?.ano ?? l?.ANO);
    const m = Number(l?.mes ?? l?.MES);
    const cod = String(l?.codSenador ?? l?.cod_senador ?? l?.COD_SENADOR ?? '').trim();
    const v = valorNum(l?.valorReembolsado ?? l?.valor_reembolsado ?? l?.VALOR_REEMBOLSADO);
    if (a !== ano || !Number.isInteger(m) || m < 1 || m > 12 || !/^\d{1,8}$/.test(cod) || Number.isNaN(v)) { invalidas++; continue; }
    validas++;
    const s = (itens[cod] ||= {});
    s[m] = (s[m] || 0) + v;
  }
  const total = validas + invalidas;
  if (!total) throw new Error(`A CEAPS de ${ano} veio vazia.`);
  if (invalidas / total > MAX_INVALIDAS) throw new Error(`Formato inesperado na CEAPS de ${ano}: ${invalidas} de ${total} linhas ilegíveis (o limite é ${Math.round(MAX_INVALIDAS * 100)}%).`);
  if (validas < minLinhas) throw new Error(`A CEAPS de ${ano} veio com só ${validas} linhas legíveis (o mínimo esperado é ${minLinhas}); parece leitura incompleta.`);
  for (const s of Object.values(itens)) for (const m of Object.keys(s)) s[m] = arredondar(s[m], 2);
  return { ano, linhas: validas, invalidas, itens };
}

async function primeiroQueFunciona(urls, json, ler) {
  let ultimo;
  for (const url of urls) {
    try { return { url, dado: ler(await json(url)) }; } catch (e) { ultimo = e; }
  }
  throw ultimo;
}

/** Nomes das chaves de uma resposta (até 3 níveis), sem nenhum valor. Serve só para conferir o formato depois. */
export function formaDaResposta(x, nivel = 0) {
  if (Array.isArray(x)) return { lista: x.length, item: x.length && nivel < 3 ? formaDaResposta(x[0], nivel + 1) : undefined };
  if (x && typeof x === 'object') {
    const o = {};
    for (const k of Object.keys(x).slice(0, 25)) o[k] = nivel < 3 ? formaDaResposta(x[k], nivel + 1) : typeof x[k];
    return o;
  }
  return typeof x;
}

/** Olha como o Senado responde às consultas que ainda não entram no índice (autorias, votações, comissões). Só nomes de chaves. */
export async function sondarSenado({ json, cod, hoje }) {
  const resultado = { geradoEm: hoje.toISOString(), aviso: 'Só nomes de campos das respostas do Senado, sem nenhum valor. Serve para conferir o formato antes de usar estas consultas em novos critérios.', consultas: {} };
  for (const [nome, url] of Object.entries(urlsSondagem(cod))) {
    try { resultado.consultas[nome] = { url, ok: true, forma: formaDaResposta(await json(url)) }; } catch (e) { resultado.consultas[nome] = { url, ok: false, erro: String(e.message).slice(0, 160) }; }
  }
  return resultado;
}

/** Frases que explicam cada critério ainda não lido. */
const NAO_LIDO = {
  pres: 'a presença em sessões do Plenário do Senado por senador',
  vot: 'as votações nominais do Plenário do Senado por senador',
  aprov: 'as matérias de autoria de cada senador e a situação delas',
  comis: 'a presença em reuniões das comissões do Senado por senador'
};
const fraseNaoLido = (k) => `${MSG}: nesta versão o Placar ainda não lê ${NAO_LIDO[k]} de uma fonte conferida. Isso não significa nota baixa nem zero: o critério fica de fora da conta.`;

/** Frase que explica o critério "custo para os cofres públicos" de um senador. */
export function fraseCustoSenador(e, pCusto, nComparados, desde) {
  const c = e.custo;
  if (!c) return `${MSG}. ${e.custoMotivo || 'A CEAPS não foi lida para este senador.'} Isso não significa custo zero.`;
  if (c.poucosMeses) return `Só ${arredondar(c.meses, 1).toLocaleString('pt-BR')} meses de exercício no período; o custo por mês só é comparado a partir de ${METODO.senadores.minMesesCusto} meses. Até agora, em CEAPS: ${brl(c.total)}.`;
  const menos = Math.floor((1 - pCusto) * 100);
  const base = e.exercicioBase === 'mandato' ? ' Os meses de exercício foram contados pelas datas do mandato, pois a lista de exercícios não foi lida: uma licença não é descontada.' : '';
  return `Custou ${brl(c.total)} em cota para o exercício da atividade parlamentar (CEAPS) desde ${desde} (${brl(c.porMes)} por mês de exercício), sem contar o subsídio. Custou menos por mês do que ${menos}% dos ${nComparados.toLocaleString('pt-BR')} senadores comparados.${base} Só a CEAPS é medida nesta versão. Não medidos: ${NAO_MEDIDOS_SENADO.join('; ')}.`;
}

/**
 * fontes = { json(url) }
 * ano    = ano em curso (último da janela). janela = anos civis avaliados (4).
 * cache  = { ler(ano), gravar(ano, objeto) } guarda a CEAPS de cada ano. usarCache=false refaz os anos fechados.
 */
export async function gerarSenadores({ fontes, ano, janela = METODO.senadores.janelaAnos, hoje = new Date(), cache = null, usarCache = true, minLinhas = MIN_LINHAS, minSenadores = MIN_SENADORES, aoAndar = () => {} }) {
  const hojeISO = hoje.toISOString().slice(0, 10);
  const anos = anosDaJanela(ano, janela);
  const inicioJanela = `${anos[0]}-01-01`;
  const diagnostico = { avisos: [], ceapsUrl: null, anosLidos: [], anosDoCache: [], anosNaoConfirmados: {}, mandatosFalhas: 0, mandatosSemData: 0 };

  // 1. Lista de senadores em exercício (obrigatória: sem ela não há o que mostrar).
  const lista = (await primeiroQueFunciona(URLS_LISTA, fontes.json, (r) => lerLista(r, minSenadores))).dado;
  aoAndar(`senado: ${lista.length} senadores em exercício`);

  // 2. Períodos de exercício de cada senador.
  const exercicio = new Map();
  await emLotes(lista, 4, async (s) => {
    try {
      const m = lerMandatos(await fontes.json(urlMandatos(s.id)));
      if (m) exercicio.set(s.id, m); else diagnostico.mandatosSemData++;
    } catch (e) { diagnostico.mandatosFalhas++; }
  });
  if (diagnostico.mandatosFalhas || diagnostico.mandatosSemData) {
    diagnostico.avisos.push(`períodos de exercício: ${diagnostico.mandatosFalhas} consultas com falha e ${diagnostico.mandatosSemData} respostas sem data legível; esses senadores ficam sem o critério de custo`);
  }

  // 3. CEAPS, ano a ano. Anos fechados vêm do arquivo guardado; o ano em curso é sempre lido de novo
  //    (se falhar, vale a leitura guardada de até 7 dias).
  const ceaps = {};
  for (const a of anos) {
    const emCurso = a === ano;
    const guardado = cache ? cache.ler(a) : null;
    const valido = guardado && guardado.versao === VERSAO_CEAPS && guardado.ano === a && guardado.itens && typeof guardado.itens === 'object';
    if (!emCurso && usarCache && valido && String(guardado.geradoEm || '').slice(0, 4) > String(a) && guardado.parcial !== true) {
      ceaps[a] = guardado; diagnostico.anosDoCache.push(a); continue;
    }
    try {
      const r = await primeiroQueFunciona(urlsCeaps(a), fontes.json, (x) => lerCeaps(x, a, { minLinhas: emCurso ? minLinhas.atual : minLinhas.fechado }));
      diagnostico.ceapsUrl = r.url;
      const obj = { versao: VERSAO_CEAPS, ano: a, geradoEm: hoje.toISOString(), parcial: emCurso || undefined, linhas: r.dado.linhas, itens: r.dado.itens };
      if (cache) cache.gravar(a, obj);
      ceaps[a] = obj; diagnostico.anosLidos.push(a);
    } catch (e) {
      const dias = valido ? (hoje - new Date(guardado.geradoEm)) / DIA : Infinity;
      if (emCurso && valido && guardado.parcial === true && dias <= DIAS_FALLBACK) {
        ceaps[a] = guardado; diagnostico.anosDoCache.push(a);
        diagnostico.avisos.push(`CEAPS de ${a}: leitura de hoje falhou (${String(e.message).slice(0, 120)}); usada a leitura de ${dataBR(guardado.geradoEm)}`);
      } else if (!emCurso && valido && guardado.parcial !== true && String(guardado.geradoEm || '').slice(0, 4) > String(a)) {
        ceaps[a] = guardado; diagnostico.anosDoCache.push(a);
        diagnostico.avisos.push(`CEAPS de ${a}: nova leitura falhou (${String(e.message).slice(0, 120)}); usada a leitura guardada`);
      } else {
        diagnostico.anosNaoConfirmados[a] = String(e.message).slice(0, 200);
      }
    }
  }
  const anosSemCeaps = anos.filter((a) => !ceaps[a]);
  const custoAtivo = anosSemCeaps.length === 0;
  const custoMotivoGeral = custoAtivo ? null : `A CEAPS de ${anosSemCeaps.join(', ')} não pôde ser lida nesta atualização (${anosSemCeaps.map((a) => diagnostico.anosNaoConfirmados[a]).filter(Boolean)[0] || 'sem detalhe'}).`;
  if (!custoAtivo) aoAndar(`senado: ${custoMotivoGeral}`);

  // Conferência dos códigos: a CEAPS só vale se os códigos dela batem com os da lista de senadores.
  let codigosConferem = true;
  if (custoAtivo) {
    const ultimo = ceaps[anos[anos.length - 1]];
    const casam = lista.filter((s) => ultimo.itens[s.id]).length;
    if (casam < lista.length * 0.5) {
      codigosConferem = false;
      diagnostico.avisos.push(`CEAPS: só ${casam} de ${lista.length} senadores da lista aparecem na CEAPS de ${ano}; os códigos podem não ser os mesmos, então o custo não foi atribuído a ninguém`);
    }
  }

  // 4. Monta cada senador.
  const itens = lista.map((s) => {
    const ex = exercicio.get(s.id) || null;
    const base = { id: s.id, nome: s.nome, partido: s.partido, uf: s.uf, foto: s.foto, pagina: s.pagina };
    const diasJanela = ex ? diasEmExercicio(ex.intervalos, inicioJanela, hojeISO) : 0;
    const meses = ex ? Math.max(0, diasJanela / 30.44) : null;
    const desde = ex ? inicioNoPeriodo(ex.intervalos, inicioJanela, hojeISO) : null;
    let custo = null, custoMotivo;
    if (!custoAtivo) custoMotivo = custoMotivoGeral;
    else if (!codigosConferem) custoMotivo = 'Os códigos da CEAPS não puderam ser conferidos com os da lista de senadores.';
    else if (!ex) custoMotivo = 'O período de exercício deste senador não pôde ser lido no Senado.';
    else if (!diasJanela) custoMotivo = 'Este senador não esteve em exercício nos últimos 4 anos.';
    else {
      const porAno = {};
      let total = 0;
      for (const a of anos) {
        const meses12 = ceaps[a].itens[s.id];
        const v = meses12 ? Object.values(meses12).reduce((x, y) => x + y, 0) : 0;
        const noAno = diasEmExercicio(ex.intervalos, `${a}-01-01`, `${a}-12-31` < hojeISO ? `${a}-12-31` : hojeISO);
        porAno[a] = { ceaps: Math.round(v), ...(!meses12 && noAno > 0 ? { semLancamento: true } : {}) };
        total += v;
      }
      custo = { total: Math.max(0, total), porAno };
    }
    const poucos = custo && meses < METODO.senadores.minMesesCusto;
    return {
      ...base,
      desde: desde || undefined,
      _custoMes: custo && !poucos ? custo.total / meses : null,
      extra: {
        meses: meses == null ? null : arredondar(meses, 1),
        ...(ex ? { exercicioBase: ex.base } : {}),
        custo: custo ? {
          total: Math.round(custo.total), porMes: Math.round(custo.total / meses),
          componentes: { ceaps: Math.round(custo.total) },
          anos: Object.fromEntries(Object.entries(custo.porAno).map(([a, v]) => [a, { ceaps: v.ceaps, ...(v.semLancamento ? { semLancamento: ['ceaps'] } : {}) }])),
          meses: arredondar(meses, 1), ...(poucos ? { poucosMeses: true } : {})
        } : null,
        ...(custoMotivo ? { custoMotivo } : {})
      }
    };
  });

  // 5. Comparação do custo entre TODOS os senadores em exercício e índice (parcial).
  const comCusto = itens.filter((i) => i._custoMes != null);
  const pctCusto = criarPercentil(comCusto.map((i) => i._custoMes));
  for (const i of itens) {
    const pCusto = i._custoMes != null ? pctCusto(i._custoMes) : null;
    const sCusto = pCusto == null ? null : arredondar((1 - pCusto) * 100, 1);
    const desde = i.desde ? dataBR(i.desde) : null;
    i.comp = [
      { k: 'pres', s: null, f: fraseNaoLido('pres') },
      { k: 'vot', s: null, f: fraseNaoLido('vot') },
      { k: 'aprov', s: null, f: fraseNaoLido('aprov') },
      { k: 'comis', s: null, f: fraseNaoLido('comis') },
      { k: 'custo', s: sCusto, f: fraseCustoSenador(i.extra, pCusto, comCusto.length, desde) }
    ];
    i.nota = mediaPonderada(i.comp.map((c) => ({ peso: pesoDe('senadores', c.k), s: c.s })), METODO.senadores.minCriterios);
    if (i.nota == null) {
      const n = i.comp.filter((c) => c.s != null).length;
      i.motivo = `Índice ainda não calculado: o do senador só sai com pelo menos ${METODO.senadores.minCriterios} critérios confirmados e hoje o Placar confirma ${n} de ${i.comp.length}. Os critérios sem fonte conferida aparecem como "${MSG}" e não viram nota zero.`;
    }
    delete i._custoMes;
    if (i.desde === undefined) delete i.desde;
  }
  const comNota = atribuirPosicoes(itens);
  const notas = itens.filter((i) => i.nota != null).map((i) => i.nota);
  return {
    ano,
    janela: { anos: janela, de: anos[0], ate: anos[anos.length - 1] },
    geradoEm: hoje.toISOString(),
    total: itens.length,
    comNota,
    comCusto: comCusto.length,
    media: notas.length ? arredondar(notas.reduce((a, b) => a + b, 0) / notas.length, 1) : null,
    criteriosLidos: ['custo'],
    itens: itens.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')),
    diagnostico
  };
}
