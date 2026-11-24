// Séries por ANO de cada prefeitura e estado, do Tesouro Nacional (SICONFI):
//   - Despesa por função (Balanço Anual, DCA Anexo I-E): empenhada, liquidada e paga em saúde, educação, saneamento,
//     segurança, urbanismo, habitação, transporte etc. "Empenhado" é compromisso assumido; "pago" é dinheiro que saiu.
//   - Gasto com pessoal e dívida, sobre a receita corrente líquida (Relatório de Gestão Fiscal).
//
// Por que tem cache e orçamento de tempo: são 5.570 prefeituras + 27 estados, 4 a 5 consultas cada, para cada ano.
// Isso não cabe numa execução só. A cada execução o programa continua de onde parou (maiores cidades primeiro),
// grava o que conseguiu e para quando o tempo acaba. Um ano já fechado e completo nunca é buscado de novo.

import { emLotes, esperar } from './util.mjs';
import { BASE, contasFiscais, itensOuVazio } from './siconfi.mjs';

export const VERSAO_SERIES = 1;

// Funções de governo (Portaria MOG 42/1999), na ordem em que aparecem no site.
export const FUNCOES = {
  '01': 'Legislativa', '02': 'Judiciária', '03': 'Essencial à justiça', '04': 'Administração', '05': 'Defesa nacional',
  '06': 'Segurança pública', '07': 'Relações exteriores', '08': 'Assistência social', '09': 'Previdência social',
  '10': 'Saúde', '11': 'Trabalho', '12': 'Educação', '13': 'Cultura', '14': 'Direitos da cidadania', '15': 'Urbanismo',
  '16': 'Habitação', '17': 'Saneamento', '18': 'Gestão ambiental', '19': 'Ciência e tecnologia', '20': 'Agricultura',
  '21': 'Organização agrária', '22': 'Indústria', '23': 'Comércio e serviços', '24': 'Comunicações', '25': 'Energia',
  '26': 'Transporte', '27': 'Desporto e lazer', '28': 'Encargos especiais'
};

const COLUNA = { 'Despesas Empenhadas': 0, 'Despesas Liquidadas': 1, 'Despesas Pagas': 2 };
export const urlDca = (ente, ano) => `${BASE}/dca?an_exercicio=${ano}&no_anexo=${encodeURIComponent('DCA-Anexo I-E')}&id_ente=${ente.cod_ibge}`;

/**
 * Do Balanço Anual (DCA Anexo I-E) guarda só o nível de FUNÇÃO (2 dígitos) e o total.
 * Cada valor é [empenhada, liquidada, paga] em reais inteiros. Devolve null se o Tesouro não tem o balanço do ano.
 */
export function extrairDca(itens) {
  if (!itens || !itens.length) return null;
  const f = {};
  let total = null;
  let pop = null;
  for (const i of itens) {
    const col = COLUNA[i.coluna];
    if (col == null || !Number.isFinite(i.valor)) continue;
    if (pop == null && Number.isFinite(i.populacao)) pop = i.populacao;
    const m = /^(\d{2}) - /.exec(i.conta || '');
    if (m) { (f[m[1]] ||= [null, null, null])[col] = Math.round(i.valor); continue; }
    if (/^Despesas Exceto Intraor/i.test(i.conta || '')) { total ||= [null, null, null]; total[col] = Math.round(i.valor); }
  }
  if (!total && !Object.keys(f).length) return null;
  return { pop, total, f };
}

/** Busca o balanço do ano (1 consulta) e, se pedido, pessoal e dívida (2 consultas). Nunca lança erro. */
export async function coletarEnteAno(json, ente, ano, { rgf = true, rgfPronto = null, agora = new Date() } = {}) {
  const em = agora.toISOString().slice(0, 10);
  try {
    const dca = extrairDca(await itensOuVazio(json, urlDca(ente, ano)));
    const reg = { em, dca: dca ? 1 : 0 };
    if (dca) { reg.pop = dca.pop; reg.total = dca.total; reg.f = dca.f; }
    if (rgfPronto && !rgfPronto.erro) {
      Object.assign(reg, { rgf: rgfPronto.rgf ?? null, pessoal: rgfPronto.pessoal ?? null, divida: rgfPronto.divida ?? null, rgfOk: rgfPronto.rgf ? 1 : 0 });
    } else if (rgf) {
      const c = await contasFiscais(json, ente, ano);
      Object.assign(reg, { rgf: c.rgf, pessoal: c.pessoal, divida: c.divida, rgfOk: c.rgf ? 1 : 0 });
    }
    return reg;
  } catch (e) {
    return { em, erro: String(e.message || e).slice(0, 120) };
  }
}

/** O registro está completo, ou precisa ser buscado de novo? Anos recentes são revistos de tempos em tempos (entrega atrasada). */
export function precisaBuscar(reg, ano, hoje, { revisarDias = 7, anosRecentes = 2 } = {}) {
  if (!reg || reg.erro) return true;
  const incompleto = reg.dca === 0 || reg.rgfOk === 0 || reg.rgfOk === undefined;
  if (!incompleto) return false;
  const recente = ano >= hoje.getUTCFullYear() - anosRecentes;
  if (!recente) return false; // ano antigo sem balanço: o Tesouro não tem, e não vai passar a ter
  const idade = (hoje - new Date(`${reg.em}T00:00:00Z`)) / 86400000;
  return idade >= revisarDias;
}

/**
 * Coleta o que falta, dentro do orçamento de tempo.
 *   anos       - exercícios a cobrir (ex.: [2025, 2024, 2023, 2022]); o mais recente primeiro.
 *   cache      - { ler(ano) -> {itens}|null, gravar(ano, obj) }
 *   prefill    - { [ano]: { [cod_ibge]: {rgf, pessoal, divida} } } contas que a rotina semanal já buscou
 *   orcamentoMs- quando passa disso, para de pegar novas consultas e grava
 * Devolve { porAno: {ano: {itens}}, feitos, pendentes, parouPorTempo }.
 */
export async function coletarSeries({ json, entes, anos, cache, hoje = new Date(), orcamentoMs = 90 * 60 * 1000, paralelo = 6, prefill = {}, aoAndar = () => {}, relogio = () => Date.now(), gravarACada = 400 }) {
  const inicio = relogio();
  const ordenados = [...entes].sort((a, b) => (b.populacao || 0) - (a.populacao || 0));
  const porAno = {};
  for (const ano of anos) {
    const c = cache.ler(ano);
    porAno[ano] = c && c.versao === VERSAO_SERIES && c.ano === ano ? c : { versao: VERSAO_SERIES, ano, itens: {} };
  }
  let feitos = 0;
  let parouPorTempo = false;
  let desdeGravar = 0;
  const gravar = () => { for (const ano of anos) { porAno[ano].atualizadoEm = hoje.toISOString(); cache.gravar(ano, porAno[ano]); } desdeGravar = 0; };

  for (const ano of anos) {
    const fila = ordenados.filter((e) => precisaBuscar(porAno[ano].itens[e.cod_ibge], ano, hoje));
    if (!fila.length) continue;
    aoAndar(`séries ${ano}: ${fila.length} prefeituras e estados a buscar`);
    await emLotes(fila, paralelo, async (ente) => {
      if (parouPorTempo || relogio() - inicio > orcamentoMs) { parouPorTempo = true; return; }
      const pronto = prefill[ano]?.[ente.cod_ibge] || null;
      const reg = await coletarEnteAno(json, ente, ano, { rgf: true, rgfPronto: pronto, agora: hoje });
      porAno[ano].itens[ente.cod_ibge] = reg;
      feitos++;
      desdeGravar++;
      if (feitos % 250 === 0) aoAndar(`séries ${ano}: ${feitos} consultas feitas`);
      if (desdeGravar >= gravarACada) gravar();
    });
    if (parouPorTempo) break;
  }
  // Falhas de rede costumam ser passageiras: uma segunda passada, mais devagar, só nos que falharam e só se sobrou tempo.
  if (!parouPorTempo) {
    for (const ano of anos) {
      const falhos = ordenados.filter((e) => porAno[ano].itens[e.cod_ibge]?.erro);
      if (!falhos.length || relogio() - inicio > orcamentoMs) continue;
      aoAndar(`séries ${ano}: repassando ${falhos.length} consultas que falharam`);
      await esperar(Number(process.env.PLACAR_ESPERA_MS ?? 20000));
      await emLotes(falhos, 2, async (ente) => {
        if (relogio() - inicio > orcamentoMs) return;
        porAno[ano].itens[ente.cod_ibge] = await coletarEnteAno(json, ente, ano, { rgf: true, rgfPronto: prefill[ano]?.[ente.cod_ibge] || null, agora: hoje });
      });
    }
  }
  gravar();
  const pendentes = {};
  for (const ano of anos) pendentes[ano] = ordenados.filter((e) => precisaBuscar(porAno[ano].itens[e.cod_ibge], ano, hoje)).length;
  return { porAno, feitos, pendentes, parouPorTempo };
}
