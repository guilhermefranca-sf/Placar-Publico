// Resultados de serviços públicos por município e por estado, vindos do IBGE "Cidades e Estados" (API de indicadores).
// O IBGE reproduz dados de outros órgãos (Inep, Ministério da Saúde); o Placar copia o número como o IBGE o publica.
//
//   Educação: Ideb (anos iniciais, anos finais e ensino médio; rede pública, municipal e estadual) e matrículas
//   Saúde:    mortalidade infantil (com nascidos vivos e óbitos), internações por diarreia (só municípios)
//
// API (aberta, sem chave):
//   https://servicodados.ibge.gov.br/api/v1/pesquisas/indicadores/{id|id|...}/resultados/{localidade|localidade|...}
//   localidade = código de 6 dígitos do município (o código do IBGE de 7 dígitos sem o último) ou código de 2 dígitos do estado.
//   Resposta: [{ id, res: [{ localidade, res: { "2019": "6.3", "2021": "-" } }] }]
//
// Regras: valor que o IBGE não traz ("-", "...", vazio) fica de fora, nunca vira zero. Valor fora da faixa plausível
// do indicador é descartado (e contado), em vez de aparecer no perfil. Cada município é relido no máximo uma vez
// por semana, e a coleta continua no dia seguinte de onde parou, dentro de um orçamento de tempo.

import path from 'node:path';
import { gravarJson, lerJsonSeExistir } from './util.mjs';
import { UFS } from './tse.mjs';

export const BASE_API = 'https://servicodados.ibge.gov.br/api/v1/pesquisas/indicadores';
export const PAGINA_CIDADES = 'https://cidades.ibge.gov.br/';
export const LOTE = 40;               // localidades por consulta
export const DIAS_ENTRE_LEITURAS = 7;

const AMBOS = ['M', 'E'];
const ORGAO_EDUC = 'Inep, com dados reproduzidos pelo IBGE (Cidades e Estados)';
const ORGAO_SAUDE = 'Ministério da Saúde, com dados reproduzidos pelo IBGE (Cidades e Estados)';

const LIM_BASE = 'O Placar copia o número como o IBGE o publica e não o audita. Valor que o IBGE não traz fica como "Dado não encontrado ou não confirmado", nunca como zero.';
const LIM_EDUC = 'Resultado escolar depende também de renda, família, rede de ensino anterior e fatores sociais; reflete anos de trabalho, não só o do ano mostrado. O Placar liga o ano à gestão da época, sem concluir que o resultado é mérito ou culpa de quem governava.';

/** Etapas do Ideb. Para cada uma o IBGE publica 5 indicadores seguidos: pública, municipal, estadual, federal, privada. */
const ETAPAS_IDEB = [
  { k: 'ai', nome: 'anos iniciais do ensino fundamental (1º ao 5º ano)', primeiroId: 78187 },
  { k: 'af', nome: 'anos finais do ensino fundamental (6º ao 9º ano)', primeiroId: 78192 },
  { k: 'em', nome: 'ensino médio', primeiroId: 78197 }
];
const REDES_IDEB = [
  { k: 'publica', nome: 'rede pública (todas as redes públicas)', desloc: 0, responsavel: 'varios', esferas: AMBOS },
  { k: 'municipal', nome: 'rede municipal', desloc: 1, responsavel: 'municipal', esferas: AMBOS },
  { k: 'estadual', nome: 'rede estadual', desloc: 2, responsavel: 'estadual', esferas: AMBOS }
];

const ideb = ETAPAS_IDEB.flatMap((e) => REDES_IDEB.map((r) => ({
  chave: `ideb.${e.k}.${r.k}`, id: e.primeiroId + r.desloc, grupo: 'ideb', secao: 'educacao', esferas: r.esferas, responsavel: r.responsavel,
  nome: `Ideb, ${e.nome}: ${r.nome}`, unidade: 'nota de 0 a 10', casas: 1, faixa: [0, 10],
  periodicidade: 'a cada 2 anos (anos ímpares)',
  fonte: `IBGE — Cidades e Estados, indicador ${e.primeiroId + r.desloc} (Ideb, dados do Inep)`, orgao: ORGAO_EDUC,
  limitacoes: `${LIM_BASE} ${LIM_EDUC} O Ideb sai de dois em dois anos e só existe onde há alunos e participação suficientes na avaliação; a rede municipal ou estadual pode não existir numa etapa.`
})));

const mat = (chave, id, nome, esferas, responsavel, extra = '') => ({
  chave, id, grupo: 'matriculas', secao: 'educacao', esferas, responsavel, nome, unidade: 'alunos matriculados', casas: 0, faixa: [0, 50e6],
  periodicidade: 'anual (Censo Escolar)',
  fonte: `IBGE — Cidades e Estados, indicador ${id} (Censo Escolar, dados do Inep)`, orgao: ORGAO_EDUC,
  limitacoes: `${LIM_BASE} Matrícula mede o tamanho do atendimento, não a qualidade. Confira no link do IBGE quais redes (pública e privada) entram na contagem de cada indicador; o Placar não separa nem soma redes. ${extra}`.trim()
});

const matriculas = [
  mat('mat.creche.municipal', 77883, 'Matrículas na creche, rede municipal', ['M'], 'municipal'),
  mat('mat.creche.estadual', 77884, 'Matrículas na creche, rede estadual', ['E'], 'estadual'),
  mat('mat.pre', 5903, 'Matrículas na pré-escola', AMBOS, 'varios'),
  mat('mat.ef', 5908, 'Matrículas no ensino fundamental', AMBOS, 'varios'),
  mat('mat.em', 5913, 'Matrículas no ensino médio', AMBOS, 'varios')
];

const LIM_SAUDE = 'A saúde é financiada e executada por União, estados e municípios, e o resultado depende também de saneamento, renda e fatores sociais: o Placar não atribui o número só a quem governava.';
const saude = [
  { chave: 'saude.mortalidade', id: 30279, grupo: 'mortalidade', nome: 'Mortalidade infantil', unidade: 'óbitos de menores de 1 ano por mil nascidos vivos', casas: 2, faixa: [0, 1000],
    limitacoes: `${LIM_BASE} ${LIM_SAUDE} Em município pequeno há poucos nascimentos, e um único óbito muda muito a taxa: veja ao lado os nascidos vivos e os óbitos.` },
  { chave: 'saude.nascidos', id: 78159, grupo: 'mortalidade', nome: 'Nascidos vivos', unidade: 'nascimentos', casas: 0, faixa: [0, 1e6],
    limitacoes: `${LIM_BASE} Nascimentos registrados no ano; é o denominador da mortalidade infantil.` },
  { chave: 'saude.obitos', id: 78160, grupo: 'mortalidade', nome: 'Óbitos de menores de 1 ano', unidade: 'óbitos', casas: 0, faixa: [0, 1e5],
    limitacoes: `${LIM_BASE} ${LIM_SAUDE}` }
].map((d) => ({ ...d, secao: 'saude', esferas: AMBOS, responsavel: 'varios', periodicidade: 'anual',
  fonte: `IBGE — Cidades e Estados, indicador ${d.id} (Ministério da Saúde: SIM e Sinasc)`, orgao: ORGAO_SAUDE }));
const diarreia = { chave: 'saude.diarreia', id: 60032, grupo: 'diarreia', secao: 'saude', esferas: ['M'], responsavel: 'varios', nome: 'Internações por diarreia', unidade: 'internações pelo SUS por mil habitantes', casas: 2, faixa: [0, 1000],
  periodicidade: 'anual (a série do IBGE nem sempre tem todos os anos)',
  fonte: 'IBGE — Cidades e Estados, indicador 60032 (Ministério da Saúde: SIH/SUS)', orgao: ORGAO_SAUDE,
  limitacoes: `${LIM_BASE} ${LIM_SAUDE} Depende muito de água tratada e esgoto, muitas vezes prestados por companhia estadual ou concessionária. Só município: o IBGE não traz este indicador por estado.` };

/** Tudo o que se coleta. Cada item vira um indicador do catálogo (veja indicadores.mjs). */
export const DEFS_CIDADES = [...ideb, ...matriculas, ...saude, diarreia];

export const urlConferir = (id, localidade) => `${BASE_API}/${id}/resultados/${localidade}`;

/* ---------------------------- leitura da resposta ---------------------------- */

const numero = (v) => {
  if (v == null) return null;
  const t = String(v).trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null; // "-", "..", "...", "X", vazio = sem dado
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Resposta da API -> Map(localidade -> Map(id do indicador -> { ano: valor })). Tolera pequenas variações de formato. */
export function lerResultados(resposta) {
  const saida = new Map();
  for (const ind of Array.isArray(resposta) ? resposta : []) {
    const id = Number(ind?.id);
    if (!Number.isFinite(id)) continue;
    for (const r of ind?.res || ind?.resultados || []) {
      const loc = String(r?.localidade?.id ?? r?.localidade ?? '').trim();
      if (!loc) continue;
      const serie = {};
      for (const [ano, v] of Object.entries(r?.res ?? r?.serie ?? {})) {
        if (!/^\d{4}$/.test(ano)) continue;
        const n = numero(v);
        if (n != null) serie[ano] = n;
      }
      if (!saida.has(loc)) saida.set(loc, new Map());
      saida.get(loc).set(id, { ...(saida.get(loc).get(id) || {}), ...serie });
    }
  }
  return saida;
}

/** Séries de um ente no formato do arquivo: { chave: { ano: valor } }; valor fora da faixa plausível é descartado. */
export function seriesDoEnte(mapaPorId, defs, contagem = { descartados: 0 }) {
  const s = {};
  for (const d of defs) {
    const bruto = mapaPorId?.get(d.id);
    if (!bruto) continue;
    const o = {};
    for (const [ano, v] of Object.entries(bruto)) {
      if (v < d.faixa[0] || v > d.faixa[1]) { contagem.descartados++; continue; }
      o[ano] = Math.round(v * 10 ** (d.casas + 2)) / 10 ** (d.casas + 2);
    }
    if (Object.keys(o).length) s[d.chave] = o;
  }
  return s;
}

/* ---------------------------- coleta ---------------------------- */

const idadeEmDias = (iso, hoje) => (hoje.getTime() - new Date(iso).getTime()) / 86400000;

/**
 * Lê os indicadores de uma lista de localidades, dividindo o lote em dois quando a consulta falha
 * (assim uma localidade com problema não derruba as outras). Devolve { lidas: Map(loc -> series), falhas: [loc] }.
 */
async function lerLote({ json, defs, locs, relogio, limiteEm, contagem }) {
  const ids = [...new Set(defs.map((d) => d.id))];
  const lidas = new Map();
  const falhas = [];
  const rec = async (lista) => {
    if (!lista.length) return;
    if (relogio() > limiteEm) { falhas.push(...lista.map((l) => ({ loc: l, motivo: 'tempo' }))); return; }
    try {
      const mapa = lerResultados(await json(`${BASE_API}/${ids.join('|')}/resultados/${lista.join('|')}`));
      contagem.consultas++;
      // Resposta sem nenhuma localidade reconhecida = formato mudado ou fonte com problema: não é "sem dado", é falha.
      if (!mapa.size) throw new Error('resposta sem localidades reconhecidas');
      for (const l of lista) lidas.set(l, seriesDoEnte(mapa.get(l), defs, contagem));
    } catch (e) {
      contagem.consultasComErro++;
      if (lista.length === 1) { falhas.push({ loc: lista[0], motivo: String(e.message).slice(0, 80) }); return; }
      const meio = Math.ceil(lista.length / 2);
      await rec(lista.slice(0, meio));
      await rec(lista.slice(meio));
    }
  };
  await rec(locs);
  return { lidas, falhas };
}

/**
 * alvos: { municipios: { UF: [ibge de 7 dígitos] }, estados: { UF: ibge de 2 dígitos } }
 * Guarda em anos/cidades-{UF}.json: { versao, itens: { ibge: { em, s: { chave: { ano: valor } } } } }
 */
export async function coletarCidades({ json, alvos, pasta, hoje, orcamentoMs, relogio = Date.now, lote = LOTE, log = () => {} }) {
  const inicio = relogio();
  const limiteEm = inicio + orcamentoMs;
  const contagem = { consultas: 0, consultasComErro: 0, descartados: 0 };
  const defsM = DEFS_CIDADES.filter((d) => d.esferas.includes('M'));
  const defsE = DEFS_CIDADES.filter((d) => d.esferas.includes('E'));
  const arq = (uf) => path.join(pasta, 'anos', `cidades-${uf}.json`);
  const lido = { municipios: 0, estados: 0, comDado: 0, semDado: 0 };
  const falhas = [];
  let pendentes = 0;
  let paradoPorTempo = false;

  const ufs = UFS.filter((uf) => (alvos.municipios[uf] || []).length || alvos.estados[uf]);
  // Primeiro o que nunca foi lido ou está mais velho; quem foi lido há menos de 7 dias é pulado.
  const arquivos = Object.fromEntries(ufs.map((uf) => [uf, lerJsonSeExistir(arq(uf)) || { versao: 1, itens: {} }]));
  const fila = [];
  for (const uf of ufs) {
    const itens = arquivos[uf].itens;
    const precisa = (cod) => !itens[cod]?.em || idadeEmDias(itens[cod].em, hoje) >= DIAS_ENTRE_LEITURAS;
    const est = alvos.estados[uf];
    if (est && precisa(est)) fila.push({ uf, tipo: 'E', cods: [est], nuncaLido: !itens[est]?.em });
    const mun = (alvos.municipios[uf] || []).filter(precisa);
    for (let i = 0; i < mun.length; i += lote) fila.push({ uf, tipo: 'M', cods: mun.slice(i, i + lote), nuncaLido: mun.slice(i, i + lote).some((c) => !itens[c]?.em) });
  }
  fila.sort((a, b) => Number(b.nuncaLido) - Number(a.nuncaLido));

  for (const parte of fila) {
    if (relogio() > limiteEm) { paradoPorTempo = true; pendentes += parte.cods.length; continue; }
    const defs = parte.tipo === 'M' ? defsM : defsE;
    const cod6 = (c) => (parte.tipo === 'M' ? String(c).slice(0, 6) : String(c));
    // Código de 6 dígitos -> códigos de 7 (no IBGE o 7º dígito é de controle, então não há repetição; a lista só evita perder dado se houver).
    const por6 = new Map();
    for (const c of parte.cods) por6.set(cod6(c), [...(por6.get(cod6(c)) || []), c]);
    const { lidas, falhas: f } = await lerLote({ json, defs, locs: [...por6.keys()], relogio, limiteEm, contagem });
    for (const [l, s] of lidas) {
      for (const cod of por6.get(l)) {
        // Série nova substitui a de mesmo nome; o que o IBGE não trouxe desta vez não apaga o que já se leu antes.
        const antes = arquivos[parte.uf].itens[cod]?.s || {};
        arquivos[parte.uf].itens[cod] = { em: hoje.toISOString(), s: { ...antes, ...s } };
        lido[parte.tipo === 'M' ? 'municipios' : 'estados']++;
        Object.keys(arquivos[parte.uf].itens[cod].s).length ? lido.comDado++ : lido.semDado++;
      }
    }
    for (const x of f) { if (x.motivo === 'tempo') { pendentes += por6.get(x.loc).length; paradoPorTempo = true; } else falhas.push(`${por6.get(x.loc).join(',')}: ${x.motivo}`); }
    gravarJson(arq(parte.uf), { versao: 1, geradoEm: hoje.toISOString(), uf: parte.uf, itens: arquivos[parte.uf].itens });
  }
  if (falhas.length) log(`IBGE Cidades: ${falhas.length} localidades falharam (ficam com os valores anteriores, se houver). Exemplos: ${falhas.slice(0, 3).join('; ')}`);
  return { ...lido, ...contagem, falhas: falhas.length, pendentes, paradoPorTempo, exemplosDeFalha: falhas.slice(0, 5), totalNaFila: fila.reduce((a, p) => a + p.cods.length, 0) };
}

/** Rotina diária: monta a lista de alvos a partir dos arquivos de prefeitos e governadores e coleta o que estiver velho. */
export async function atualizarCidades({ json, pasta, hoje, orcamentoMs, relogio, lote, log }) {
  const alvos = { municipios: {}, estados: {} };
  for (const uf of UFS) {
    const prefs = lerJsonSeExistir(path.join(pasta, `prefeitos-${uf}.json`));
    const cods = (prefs?.itens || []).map((p) => p.ibge).filter((c) => /^\d{7}$/.test(String(c))).map(String);
    if (cods.length) alvos.municipios[uf] = [...new Set(cods)];
  }
  for (const g of lerJsonSeExistir(path.join(pasta, 'governadores.json'))?.itens || []) if (g.ibge && g.uf) alvos.estados[g.uf] = String(g.ibge);
  const total = Object.values(alvos.municipios).reduce((a, l) => a + l.length, 0) + Object.keys(alvos.estados).length;
  if (!total) return { ok: false, motivo: 'sem a lista de prefeitos e governadores' };
  const r = await coletarCidades({ json, alvos, pasta, hoje, orcamentoMs, relogio, lote, log });
  const lidos = r.municipios + r.estados;
  // Sem nenhuma leitura bem-sucedida e com consultas tentadas: a fonte está fora do ar ou mudou de formato.
  if (!lidos && r.consultas + r.consultasComErro > 0) return { ok: false, motivo: `não foi possível ler o IBGE Cidades (${r.exemplosDeFalha.join('; ') || 'sem detalhes'})`, ...r };
  // Se leu mas nada veio com dado, o formato da resposta provavelmente mudou: avisa em vez de fingir que está tudo certo.
  if (lidos && !r.comDado) return { ok: false, motivo: 'o IBGE respondeu, mas sem nenhum valor reconhecido; o formato da resposta pode ter mudado', ...r };
  return { ok: true, ...r };
}
