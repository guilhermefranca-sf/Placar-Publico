// O Brasil no cenário mundial (Banco Mundial). Usado nas abas do presidente que não têm nota:
// em cada indicador, mostra a posição do Brasil entre os países com dado, o valor, o ano e a fonte.
//
// Regras:
//  - Só entram países de verdade (os agrupamentos do Banco Mundial, como "América Latina", ficam de fora).
//  - Cada país entra com o seu valor mais recente. Para a comparação ser justa, só valem valores de até 5 anos
//    antes do ano do dado do Brasil (ou mais novos). O ano de cada lado aparece no resultado.
//  - Se o Brasil não tem o dado, ou poucos países têm, o indicador fica como "Dado não encontrado ou não confirmado".
//  - Nada é inventado: se a consulta falhar, o valor anterior é mantido e marcado como desatualizado.

import path from 'node:path';
import { gravarJson, lerJsonSeExistir, arredondar } from './util.mjs';

export const API_MUNDO = 'https://api.worldbank.org/v2';
export const PAIS = 'BRA';
export const JANELA_ANOS_MUNDO = 5;
export const MIN_PAISES = 50;

/** melhor: 'maior' (quanto maior, melhor) ou 'menor' (quanto menor, melhor). */
export const INDICADORES_MUNDO = [
  { id: 'SP.DYN.LE00.IN', tema: 'saude', nome: 'Expectativa de vida ao nascer', unidade: 'anos', melhor: 'maior', casas: 1 },
  { id: 'SP.DYN.IMRT.IN', tema: 'saude', nome: 'Mortalidade infantil (até 1 ano)', unidade: 'por mil nascidos vivos', melhor: 'menor', casas: 1 },
  { id: 'SH.STA.MMRT', tema: 'saude', nome: 'Mortalidade materna', unidade: 'por 100 mil nascidos vivos', melhor: 'menor', casas: 0 },
  { id: 'HD.HCI.OVRL', tema: 'educacao', nome: 'Índice de Capital Humano (0 a 1)', unidade: 'índice', melhor: 'maior', casas: 2 },
  { id: 'HD.HCI.LAYS', tema: 'educacao', nome: 'Anos de escola ajustados pela aprendizagem', unidade: 'anos', melhor: 'maior', casas: 1 },
  { id: 'SE.ADT.LITR.ZS', tema: 'educacao', nome: 'Adultos alfabetizados', unidade: '%', melhor: 'maior', casas: 1 },
  { id: 'VC.IHR.PSRC.P5', tema: 'seguranca', nome: 'Homicídios intencionais', unidade: 'por 100 mil habitantes', melhor: 'menor', casas: 1 },
  { id: 'NY.GDP.PCAP.PP.CD', tema: 'economia', nome: 'PIB por pessoa (poder de compra, US$ atuais)', unidade: 'US$', melhor: 'maior', casas: 0 },
  { id: 'NY.GDP.MKTP.KD.ZG', tema: 'economia', nome: 'Crescimento do PIB', unidade: '% ao ano', melhor: 'maior', casas: 1 },
  { id: 'SL.UEM.TOTL.ZS', tema: 'economia', nome: 'Desemprego (estimativa da OIT)', unidade: '% da força de trabalho', melhor: 'menor', casas: 1 },
  { id: 'CC.EST', tema: 'transparencia', nome: 'Controle da corrupção (índice de governança, -2,5 a 2,5)', unidade: 'índice', melhor: 'maior', casas: 2 }
];

const urlIndicador = (id) => `https://data.worldbank.org/indicator/${id}?locations=BR`;

/** Lista de países de verdade (sem os agrupamentos). */
export async function listarPaises(json) {
  const paises = new Set();
  for (let pagina = 1; pagina <= 5; pagina++) {
    const r = await json(`${API_MUNDO}/country?format=json&per_page=400&page=${pagina}`);
    if (!Array.isArray(r) || !Array.isArray(r[1])) throw new Error('O Banco Mundial não devolveu a lista de países.');
    for (const p of r[1]) if (p.region && p.region.id !== 'NA' && p.region.value !== 'Aggregates') paises.add(p.id);
    if (pagina >= (r[0]?.pages || 1)) break;
  }
  if (paises.size < 150) throw new Error(`Lista de países incompleta (${paises.size}).`);
  return paises;
}

/** Valor mais recente de cada país para um indicador: Map(iso3 -> {valor, ano, pais}). */
export async function lerIndicador(json, id) {
  const mapa = new Map();
  for (let pagina = 1; pagina <= 10; pagina++) {
    const r = await json(`${API_MUNDO}/country/all/indicator/${id}?format=json&mrnev=1&per_page=1000&page=${pagina}`);
    if (!Array.isArray(r) || !Array.isArray(r[1])) throw new Error(`Sem dados para ${id}.`);
    for (const x of r[1]) {
      const iso = x.countryiso3code || x.country?.id;
      const ano = Number(x.date);
      if (!iso || x.value == null || !Number.isFinite(Number(x.value)) || !Number.isFinite(ano)) continue;
      mapa.set(iso, { valor: Number(x.value), ano, pais: x.country?.value || iso });
    }
    if (pagina >= (r[0]?.pages || 1)) break;
  }
  return mapa;
}

/**
 * Posição do Brasil. 1 = melhor. Empates dividem a mesma posição (conta só quem é estritamente melhor).
 * Devolve null (com motivo) se não houver base para comparar.
 */
export function ranquear(mapa, paises, { melhor, casas = 1, pais = PAIS, janela = JANELA_ANOS_MUNDO, minimo = MIN_PAISES }) {
  const br = mapa.get(pais);
  if (!br) return { posicao: null, motivo: 'O Banco Mundial não publica este indicador para o Brasil.' };
  const universo = [...mapa.entries()].filter(([iso, v]) => paises.has(iso) && v.ano >= br.ano - janela);
  if (universo.length < minimo) return { posicao: null, motivo: `Poucos países com dado recente (${universo.length}); a comparação não é confiável.` };
  const melhorQue = (a, b) => (melhor === 'maior' ? a > b : a < b);
  const posicao = 1 + universo.filter(([, v]) => melhorQue(v.valor, br.valor)).length;
  const ordenado = universo.map(([, v]) => v).sort((a, b) => (melhor === 'maior' ? b.valor - a.valor : a.valor - b.valor));
  const mediana = [...universo.map(([, v]) => v.valor)].sort((a, b) => a - b);
  const meio = mediana.length % 2 ? mediana[(mediana.length - 1) / 2] : (mediana[mediana.length / 2 - 1] + mediana[mediana.length / 2]) / 2;
  const anos = universo.map(([, v]) => v.ano);
  return {
    posicao,
    de: universo.length,
    brasil: { valor: arredondar(br.valor, casas), ano: br.ano },
    melhorPais: { pais: ordenado[0].pais, valor: arredondar(ordenado[0].valor, casas), ano: ordenado[0].ano },
    mediana: arredondar(meio, casas),
    mesmoAno: universo.filter(([, v]) => v.ano === br.ano).length,
    anosDosPaises: { de: Math.min(...anos), ate: Math.max(...anos) }
  };
}

/** Lê todos os indicadores. Se um falhar, mantém o valor anterior marcado como desatualizado. */
export async function atualizarMundo({ json, pasta, hoje = new Date(), log = () => {} }) {
  const arquivo = path.join(pasta, 'mundo.json');
  const antigo = lerJsonSeExistir(arquivo) || { indicadores: [] };
  const anteriores = new Map(antigo.indicadores.map((i) => [i.id, i]));
  let paises;
  try { paises = await listarPaises(json); } catch (e) { return { ok: false, motivo: `Lista de países: ${e.message}` }; }

  const indicadores = [];
  const erros = [];
  for (const def of INDICADORES_MUNDO) {
    try {
      const mapa = await lerIndicador(json, def.id);
      const r = ranquear(mapa, paises, def);
      indicadores.push({ id: def.id, tema: def.tema, nome: def.nome, unidade: def.unidade, melhor: def.melhor, url: urlIndicador(def.id), ...r, lidoEm: hoje.toISOString() });
    } catch (e) {
      erros.push(`${def.id}: ${String(e.message).slice(0, 120)}`);
      const velho = anteriores.get(def.id);
      if (velho) indicadores.push({ ...velho, desatualizado: true });
      else indicadores.push({ id: def.id, tema: def.tema, nome: def.nome, unidade: def.unidade, melhor: def.melhor, url: urlIndicador(def.id), posicao: null, motivo: 'Dado não encontrado ou não confirmado: a consulta ao Banco Mundial falhou.' });
    }
  }
  const comPosicao = indicadores.filter((i) => i.posicao != null).length;
  gravarJson(arquivo, {
    geradoEm: hoje.toISOString(),
    fonte: { nome: 'Banco Mundial — Indicadores de Desenvolvimento Mundial e Indicadores de Governança', url: 'https://data.worldbank.org/' },
    regra: `Posição do Brasil entre os países com dado (1 = melhor). Cada país entra com o valor mais recente, de até ${JANELA_ANOS_MUNDO} anos antes do ano do dado do Brasil. Agrupamentos de países não entram.`,
    indicadores
  });
  log(`Banco Mundial: ${comPosicao} de ${indicadores.length} indicadores com posição${erros.length ? `; ${erros.length} falharam` : ''}.`);
  return { ok: comPosicao > 0, indicadores: indicadores.length, comPosicao, falhas: erros.length, ...(erros.length ? { erros } : {}) };
}
