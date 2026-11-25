// Contas de prefeituras e estados, a partir da API aberta do Tesouro Nacional (SICONFI).
// Usa o último ano fechado. Para cada prefeitura/estado:
//   - gasto com pessoal sobre a receita corrente líquida (Relatório de Gestão Fiscal, Anexo 1)
//   - dívida consolidada líquida sobre a receita corrente líquida (RGF, Anexo 2)
//   - quantos relatórios fiscais obrigatórios foram entregues (extrato de entregas)

import { normalizar, emLotes, esperar, arredondar, limitar } from './util.mjs';
import { METODO } from './nota.mjs';

export const BASE = 'https://apidatalake.tesouro.gov.br/ords/siconfi/tt';

/** Os dois primeiros dígitos do código do IBGE identificam o estado. */
export const SIGLA_DO_CODIGO_IBGE = {
  11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO',
  21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA',
  31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC', 43: 'RS',
  50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF'
};

export async function carregarEntes(json) {
  const r = await json(`${BASE}/entes`);
  const itens = r.items || [];
  if (itens.length < 5000) throw new Error(`O Tesouro devolveu só ${itens.length} entes; parece falha da API.`);
  return itens;
}

/** Índices para ligar o nome do município (TSE) ao código do ente (Tesouro/IBGE). */
export function indexarEntes(entes) {
  const municipios = new Map();
  const porUf = new Map();
  const estados = new Map();
  for (const e of entes) {
    if (e.esfera === 'M') {
      municipios.set(`${e.uf}|${normalizar(e.ente)}`, e);
      if (!porUf.has(e.uf)) porUf.set(e.uf, []);
      porUf.get(e.uf).push(e);
    } else if (e.esfera === 'E' || e.esfera === 'D') {
      // No Tesouro, o campo "uf" dos estados vem como "BR". A sigla certa sai do código do IBGE.
      const sigla = SIGLA_DO_CODIGO_IBGE[Math.floor(Number(e.cod_ibge))] || (e.uf && e.uf !== 'BR' ? e.uf : null);
      if (sigla) estados.set(sigla, e);
    }
  }
  return { municipios, porUf, estados };
}

export function acharMunicipio(indice, uf, nomeTse) {
  return indice.municipios.get(`${uf}|${normalizar(nomeTse)}`) || null;
}

/** Número de letras diferentes entre duas palavras (troca, falta ou sobra). */
export function distancia(a, b) {
  if (a === b) return 0;
  let antes = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(antes[j] + 1, atual[j - 1] + 1, antes[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    antes = atual;
  }
  return antes[b.length];
}

/**
 * Para nomes que o TSE e o Tesouro escrevem diferente ("Assú"/"Açu", "Camacã"/"Camacan"):
 * só olha as prefeituras do mesmo estado que ainda não foram ligadas a ninguém e só aceita
 * se UMA delas for claramente a mais parecida (até 2 letras de diferença).
 */
export function acharMunicipioParecido(indice, uf, nomeTse, usados) {
  const alvo = normalizar(nomeTse);
  const candidatos = (indice.porUf.get(uf) || [])
    .filter((e) => !usados.has(e.cod_ibge))
    .map((e) => ({ e, d: distancia(alvo, normalizar(e.ente)) }))
    .filter((c) => c.d <= 2)
    .sort((x, y) => x.d - y.d);
  if (!candidatos.length) return null;
  if (candidatos.length > 1 && candidatos[1].d === candidatos[0].d) return null; // empate: não arrisca
  return candidatos[0].e;
}

// Maneiras de o Tesouro guardar o Relatório de Gestão Fiscal. Cidades pequenas (menos de 50 mil
// habitantes) entregam a versão "Simplificada", por semestre; as demais, a completa, por quadrimestre.
const MODELOS_RGF = [
  { tipo: 'RGF', periodicidade: 'Q', numero: 3, id: 'Q3' },
  { tipo: 'RGF Simplificado', periodicidade: 'S', numero: 2, id: 'S2' },
  { tipo: 'RGF', periodicidade: 'S', numero: 2, id: 'S2' }
];

// A lista de entes chama o Distrito Federal de esfera "D", mas as consultas de relatórios só respondem com "E".
const esferaDaConsulta = (ente) => (ente.esfera === 'D' ? 'E' : ente.esfera);

const urlRgf = (ente, exercicio, m, anexo) =>
  `${BASE}/rgf?an_exercicio=${exercicio}&in_periodicidade=${m.periodicidade}&nr_periodo=${m.numero}` +
  `&co_tipo_demonstrativo=${encodeURIComponent(m.tipo)}` +
  `&no_anexo=${encodeURIComponent(anexo)}&co_esfera=${esferaDaConsulta(ente)}&co_poder=E&id_ente=${ente.cod_ibge}`;

export async function itensOuVazio(json, url) {
  try { return (await json(url)).items || []; } catch (e) { if (/HTTP (400|404)/.test(e.message)) return []; throw e; }
}

export function escolherPessoal(itens) {
  const c = itens.filter((i) => i.cod_conta === 'DespesaComPessoalTotal' && /% sobre a RCL/i.test(i.coluna));
  const alvo = c.find((i) => /Ajustada/i.test(i.coluna)) || c[0];
  return alvo && Number.isFinite(alvo.valor) ? alvo.valor : null;
}

export function escolherDivida(itens, periodoRgf) {
  const c = itens.filter((i) => i.cod_conta === 'PercentualDaDCLSobreARCL');
  const fim = periodoRgf === 'S2' ? /2º Semestre/i : /3º Quadrimestre/i;
  const alvo = c.find((i) => fim.test(i.coluna)) || c[c.length - 1];
  return alvo && Number.isFinite(alvo.valor) ? alvo.valor : null;
}

const ENTREGUE = new Set(['HO', 'RE']); // homologado ou retificado

export function contarEntregas(itens) {
  const rreo = itens.filter((i) => /^Relatório Resumido/i.test(i.entregavel) && ENTREGUE.has(i.status_relatorio));
  const dca = itens.filter((i) => /DCA/i.test(i.entregavel) && ENTREGUE.has(i.status_relatorio));
  // Quem entrega o resumido (RREO) é só o Poder Executivo: é assim que achamos "a prefeitura" ou "o governo".
  const executivo = new Set([...rreo, ...dca].map((i) => i.instituicao));
  const rgfDoExecutivo = itens.filter((i) => /Gestão Fiscal/i.test(i.entregavel) && executivo.has(i.instituicao));
  const semestral = rgfDoExecutivo.some((i) => i.periodicidade === 'S');
  const rgfEsperado = semestral ? 2 : 3;
  const periodos = (lista) => new Set(lista.map((i) => i.periodo)).size;
  const feitasRgf = periodos(rgfDoExecutivo.filter((i) => ENTREGUE.has(i.status_relatorio)));
  const nRreo = Math.min(6, periodos(rreo));
  const nRgf = Math.min(rgfEsperado, feitasRgf);
  const nDca = Math.min(1, dca.length);
  return { feitas: nRreo + nRgf + nDca, esperado: 6 + rgfEsperado + 1, rreo: nRreo, rgf: nRgf, dca: nDca };
}

/** Pessoal e dívida (RGF) de um ano. Lança erro se a rede falhar. */
export async function contasFiscais(json, ente, exercicio) {
  let modelo = null;
  let a1 = [];
  for (const m of MODELOS_RGF) {
    a1 = await itensOuVazio(json, urlRgf(ente, exercicio, m, 'RGF-Anexo 01'));
    if (a1.length) { modelo = m; break; }
  }
  let divida = null;
  if (modelo) divida = escolherDivida(await itensOuVazio(json, urlRgf(ente, exercicio, modelo, 'RGF-Anexo 02')), modelo.id);
  return { rgf: modelo ? modelo.id : null, pessoal: a1.length ? escolherPessoal(a1) : null, divida };
}

/** Busca os três dados de uma prefeitura ou estado. Nunca lança erro: devolve { erro } se falhar. */
export async function contasDoEnte(json, ente, exercicio) {
  try {
    const fiscais = await contasFiscais(json, ente, exercicio);
    const extrato = await itensOuVazio(json, `${BASE}/extrato_entregas?id_ente=${ente.cod_ibge}&an_referencia=${exercicio}`);
    return { ...fiscais, entregas: contarEntregas(extrato) };
  } catch (e) {
    return { erro: String(e.message || e).slice(0, 160) };
  }
}

/** Busca as contas de todos os entes pedidos, com `paralelo` consultas ao mesmo tempo. */
export async function gerarContas({ json, entes, exercicio, paralelo = 6, aoAndar = () => {}, repassadas = 2, esperaMs = Number(process.env.PLACAR_ESPERA_MS ?? 20000) }) {
  const contas = {};
  let feitos = 0;
  await emLotes(entes, paralelo, async (ente) => {
    contas[ente.cod_ibge] = await contasDoEnte(json, ente, exercicio);
    feitos++;
    if (feitos % 250 === 0) aoAndar(feitos, entes.length);
  });
  // Falhas de rede costumam ser passageiras: tenta de novo, mais devagar, só quem falhou.
  for (let r = 1; r <= repassadas; r++) {
    const falhos = entes.filter((e) => contas[e.cod_ibge]?.erro);
    if (!falhos.length) break;
    aoAndar(`repassando ${falhos.length} consultas que falharam (tentativa ${r})`, entes.length);
    await esperar(esperaMs * r);
    await emLotes(falhos, 2, async (ente) => { contas[ente.cod_ibge] = await contasDoEnte(json, ente, exercicio); });
  }
  return contas;
}

/**
 * Organiza as contas fiscais de um ente (gasto com pessoal, dívida e relatórios entregues) para o perfil.
 * Elas NÃO entram mais na nota: o Índice de serviços públicos é calculado depois, em indice-gestao.mjs,
 * com os resultados de saúde, educação, segurança e saneamento. Aqui a nota fica vazia até lá.
 */
export function notaExecutivo(contas, esfera) {
  if (!contas || contas.erro) return { nota: null, comp: [], motivo: 'Não foi possível consultar as contas no Tesouro Nacional. O índice de serviços públicos não depende delas, e é calculado à parte.' };
  const lim = METODO.executivos.limites[esfera];
  const e = contas.entregas;
  const contasPublicas = {
    pessoal: contas.pessoal ?? null, divida: contas.divida ?? null,
    limitePessoal: lim.pessoal, limiteDivida: lim.divida, rgf: contas.rgf ?? null,
    entregas: e && e.esperado ? { feitas: e.feitas, esperado: e.esperado, rreo: e.rreo, rgf: e.rgf, dca: e.dca } : null
  };
  return { nota: null, comp: [], contas: contasPublicas, motivo: 'O índice de serviços públicos ainda não foi calculado para este ente.' };
}
