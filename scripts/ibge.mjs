// Dados do IBGE (API de agregados) e do Banco Central (SGS), todos abertos e sem chave.
//
// Por município (uma consulta para os 5.570):
//   - População estimada (tabela 6579, variável 9324)
//   - PIB a preços correntes (tabela 5938, variável 37): mais recente publicado
//   - Censo 2022: % de domicílios com água da rede geral (6803), com esgoto na rede ou fossa ligada à rede (6805) e com lixo coletado (6892)
// Nacionais, para o presidente (séries mensais):
//   - IPCA mensal (IBGE 1737/63) e acumulado em 12 meses (1737/2265)
//   - Taxa de desocupação, trimestre móvel (IBGE 6381/4099)
//   - Selic acumulada no mês, anualizada (BCB SGS 4189)
//   - Dívida bruta do governo geral, % do PIB (BCB SGS 13762) e dívida líquida do setor público, % do PIB (BCB SGS 4513)
//
// Cada indicador leva fonte, órgão, link para conferir e limitações (veja CATALOGO em indicadores.mjs).

const AGREGADOS = 'https://servicodados.ibge.gov.br/api/v3/agregados';
export const SGS = (n) => `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${n}/dados`;

const numero = (v) => {
  if (v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && !/^[-.]+$/.test(String(v).trim()) ? n : null; // "-", "..", "..." = sem dado
};

/** Resposta da API de agregados -> Map(id da localidade -> { período: número }). */
export function lerAgregado(resposta) {
  const saida = new Map();
  const variavel = Array.isArray(resposta) ? resposta[0] : null;
  for (const res of variavel?.resultados || []) {
    for (const s of res.series || []) {
      const serie = {};
      for (const [p, v] of Object.entries(s.serie || {})) { const n = numero(v); if (n != null) serie[p] = n; }
      saida.set(String(s.localidade.id), { ...(saida.get(String(s.localidade.id)) || {}), ...serie });
    }
  }
  return saida;
}

const ultimoPeriodo = async (json, tabela) => {
  const p = await json(`${AGREGADOS}/${tabela}/periodos`);
  const ids = (p || []).map((x) => String(x.id)).sort();
  if (!ids.length) throw new Error(`IBGE: tabela ${tabela} sem períodos`);
  return ids[ids.length - 1];
};

/** { id: valor } de um período, a partir do resultado de lerAgregado. */
const doPeriodo = (mapa, periodo) => {
  const o = {};
  for (const [id, serie] of mapa) if (periodo in serie) o[id] = serie[periodo];
  return o;
};

/**
 * População, PIB e Censo 2022 de todos os municípios (nível N6) e de todos os estados (N3), em formato compacto:
 *   { populacao: {ano, v:{id: valor}}, popPib: {ano, v}, pib: {ano, v}, censo: {agua:{ano, v}, esgoto, lixo}, erros: [] }
 * Cada parte pode falhar sem derrubar as outras: o que falhar fica de fora (null), nunca vira zero.
 */
export async function lerIbge(json, { aoAvisar = () => {} } = {}) {
  const r = { populacao: null, popPib: null, pib: null, censo: { agua: null, esgoto: null, lixo: null }, erros: [] };
  const tentar = async (nome, fn) => { try { return await fn(); } catch (e) { r.erros.push(`${nome}: ${String(e.message).slice(0, 100)}`); aoAvisar(`IBGE ${nome}: ${e.message}`); return null; } };
  const niveis = ['N6', 'N3'];
  const buscar = async (tabela, variavel, periodo, classificacao) => {
    const todos = new Map();
    for (const n of niveis) {
      const url = `${AGREGADOS}/${tabela}/periodos/${periodo}/variaveis/${variavel}?localidades=${n}[all]${classificacao ? `&classificacao=${classificacao}` : ''}`;
      for (const [id, serie] of lerAgregado(await json(url))) todos.set(id, serie);
    }
    return doPeriodo(todos, periodo);
  };
  r.populacao = await tentar('população', async () => { const ano = await ultimoPeriodo(json, 6579); return { ano: Number(ano), v: await buscar(6579, 9324, ano) }; });
  r.pib = await tentar('PIB', async () => { const ano = await ultimoPeriodo(json, 5938); return { ano: Number(ano), v: await buscar(5938, 37, ano) }; });
  if (r.pib && r.populacao && r.pib.ano !== r.populacao.ano) {
    r.popPib = await tentar('população do ano do PIB', async () => ({ ano: r.pib.ano, v: await buscar(6579, 9324, r.pib.ano) }));
  } else if (r.pib && r.populacao) r.popPib = r.populacao;
  const censo = (tabela, classificacao) => async () => ({ ano: 2022, v: await buscar(tabela, 1000381, 2022, classificacao) });
  r.censo.agua = await tentar('Censo água', censo(6803, '1821[72144]'));
  r.censo.esgoto = await tentar('Censo esgoto', censo(6805, '11558[46290]'));
  r.censo.lixo = await tentar('Censo lixo', censo(6892, '67[2520]'));
  return r;
}

/* ---------------------------- séries nacionais (presidente) ---------------------------- */

/** 'dd/mm/aaaa' do Banco Central -> 'aaaa-mm' */
const mesBcb = (d) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d); return m ? `${m[3]}-${m[2]}` : null; };
/** '202611' do IBGE -> 'aaaa-mm' */
const mesIbge = (p) => (/^\d{6}$/.test(p) ? `${p.slice(0, 4)}-${p.slice(4)}` : null);

export function lerSgs(itens) {
  const m = new Map();
  for (const i of itens || []) { const p = mesBcb(i.data); const v = numero(i.valor); if (p && v != null) m.set(p, v); }
  return m;
}
export function lerAgregadoMensal(resposta) {
  const m = new Map();
  const nac = lerAgregado(resposta).get('1') || {};
  for (const [p, v] of Object.entries(nac)) { const mes = mesIbge(p); if (mes) m.set(mes, v); }
  return m;
}

const brData = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Séries mensais dos 48 meses da janela. Cada uma pode falhar sem derrubar as outras. */
export async function lerSeriesNacionais(json, janela, { aoAvisar = () => {} } = {}) {
  const saida = {};
  const erros = [];
  const de = brData(janela.de);
  const ate = brData(janela.ate);
  const periodosIbge = `${janela.de.slice(0, 4)}${janela.de.slice(5, 7)}-${janela.ate.slice(0, 4)}${janela.ate.slice(5, 7)}`;
  const ibge = (id, tabela, variavel) => async () => lerAgregadoMensal(await json(`${AGREGADOS}/${tabela}/periodos/${periodosIbge}/variaveis/${variavel}?localidades=N1[all]`));
  const bcb = (n) => async () => lerSgs(await json(`${SGS(n)}?formato=json&dataInicial=${de}&dataFinal=${ate}`));
  const fontes = {
    ipca_mensal: ibge('ipca_mensal', 1737, 63),
    ipca_12m: ibge('ipca_12m', 1737, 2265),
    desocupacao: ibge('desocupacao', 6381, 4099),
    selic: bcb(4189),
    divida_bruta: bcb(13762),
    divida_liquida: bcb(4513)
  };
  for (const [id, fn] of Object.entries(fontes)) {
    try { saida[id] = await fn(); if (!saida[id].size) throw new Error('resposta vazia'); } catch (e) { erros.push(`${id}: ${String(e.message).slice(0, 100)}`); aoAvisar(`Série ${id}: ${e.message}`); saida[id] = null; }
  }
  return { series: saida, erros };
}
