// Contas de prefeituras e estados, a partir da API aberta do Tesouro Nacional (SICONFI).
// Usa o último ano fechado. Para cada prefeitura/estado:
//   - gasto com pessoal sobre a receita corrente líquida (Relatório de Gestão Fiscal, Anexo 1)
//   - dívida consolidada líquida sobre a receita corrente líquida (RGF, Anexo 2)
//   - quantos relatórios fiscais obrigatórios foram entregues (extrato de entregas)

import { normalizar, emLotes, arredondar, limitar } from './util.mjs';
import { METODO, mediaPonderada, pesoDe, scorePessoal, scoreDivida, scoreEntregas } from './nota.mjs';

export const BASE = 'https://apidatalake.tesouro.gov.br/ords/siconfi/tt';

export async function carregarEntes(json) {
  const r = await json(`${BASE}/entes`);
  const itens = r.items || [];
  if (itens.length < 5000) throw new Error(`O Tesouro devolveu só ${itens.length} entes; parece falha da API.`);
  return itens;
}

/** Índices para ligar o nome do município (TSE) ao código do ente (Tesouro/IBGE). */
export function indexarEntes(entes) {
  const municipios = new Map();
  const porNome = new Map();
  const estados = new Map();
  for (const e of entes) {
    if (e.esfera === 'M') {
      municipios.set(`${e.uf}|${normalizar(e.ente)}`, e);
      const k = normalizar(e.ente);
      porNome.set(k, porNome.has(k) ? null : e); // null = nome repetido em mais de um estado
    } else if (e.esfera === 'E' || e.esfera === 'D') {
      estados.set(e.uf, e);
    }
  }
  return { municipios, porNome, estados };
}

export function acharMunicipio(indice, uf, nomeTse) {
  return indice.municipios.get(`${uf}|${normalizar(nomeTse)}`) || null;
}

const urlRgf = (ente, exercicio, per, nr, anexo) =>
  `${BASE}/rgf?an_exercicio=${exercicio}&in_periodicidade=${per}&nr_periodo=${nr}&co_tipo_demonstrativo=RGF` +
  `&no_anexo=${encodeURIComponent(anexo)}&co_esfera=${ente.esfera}&co_poder=E&id_ente=${ente.cod_ibge}`;

async function itensOuVazio(json, url) {
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

/** Busca os três dados de uma prefeitura ou estado. Nunca lança erro: devolve { erro } se falhar. */
export async function contasDoEnte(json, ente, exercicio) {
  try {
    let periodoRgf = 'Q3';
    let a1 = await itensOuVazio(json, urlRgf(ente, exercicio, 'Q', 3, 'RGF-Anexo 01'));
    if (!a1.length) {
      periodoRgf = 'S2'; // cidades pequenas podem entregar o RGF por semestre
      a1 = await itensOuVazio(json, urlRgf(ente, exercicio, 'S', 2, 'RGF-Anexo 01'));
    }
    let divida = null;
    if (a1.length) {
      const [per, nr] = periodoRgf === 'Q3' ? ['Q', 3] : ['S', 2];
      divida = escolherDivida(await itensOuVazio(json, urlRgf(ente, exercicio, per, nr, 'RGF-Anexo 02')), periodoRgf);
    } else periodoRgf = null;
    const extrato = await itensOuVazio(json, `${BASE}/extrato_entregas?id_ente=${ente.cod_ibge}&an_referencia=${exercicio}`);
    return {
      rgf: periodoRgf,
      pessoal: a1.length ? escolherPessoal(a1) : null,
      divida,
      entregas: contarEntregas(extrato)
    };
  } catch (e) {
    return { erro: String(e.message || e).slice(0, 160) };
  }
}

/** Busca as contas de todos os entes pedidos, com `paralelo` consultas ao mesmo tempo. */
export async function gerarContas({ json, entes, exercicio, paralelo = 6, aoAndar = () => {} }) {
  const contas = {};
  let feitos = 0;
  await emLotes(entes, paralelo, async (ente) => {
    contas[ente.cod_ibge] = await contasDoEnte(json, ente, exercicio);
    feitos++;
    if (feitos % 250 === 0) aoAndar(feitos, entes.length);
  });
  return contas;
}

/** Transforma as contas em nota e frases explicativas. */
export function notaExecutivo(contas, esfera, exercicio) {
  if (!contas || contas.erro) return { nota: null, comp: [], motivo: 'Não foi possível consultar as contas no Tesouro Nacional.' };
  const lim = METODO.executivos.limites[esfera];
  const comp = [];
  const e = contas.entregas;
  if (contas.pessoal != null) {
    comp.push({ k: 'pessoal', s: scorePessoal(contas.pessoal, lim.pessoal),
      f: `Gastou ${contas.pessoal.toLocaleString('pt-BR')}% da receita corrente líquida com pessoal em ${exercicio}. O limite da Lei de Responsabilidade Fiscal é ${lim.pessoal}%.` });
  }
  if (contas.divida != null) {
    comp.push({ k: 'divida', s: scoreDivida(contas.divida, lim.divida),
      f: `Dívida consolidada líquida de ${contas.divida.toLocaleString('pt-BR')}% da receita corrente líquida. O limite é ${lim.divida}%.` });
  }
  if (e && e.esperado) {
    comp.push({ k: 'entregas', s: scoreEntregas(e.feitas, e.esperado),
      f: `Entregou ${e.feitas} dos ${e.esperado} relatórios fiscais obrigatórios de ${exercicio} ao Tesouro Nacional.` });
  }
  const nota = mediaPonderada(comp.map((c) => ({ peso: pesoDe('executivos', c.k), s: c.s })), METODO.executivos.minComponentes);
  return nota == null
    ? { nota: null, comp, motivo: `O Tesouro Nacional não tem os relatórios fiscais de ${exercicio} desta administração.` }
    : { nota, comp };
}
