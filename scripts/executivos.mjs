// Liga as peças do perfil ampliado de prefeitos, governadores e presidente:
//   administrações (TSE + curadoria)  +  séries por ano do Tesouro  +  IBGE  +  séries nacionais  ->  arquivos que o site lê.
//
// Arquivos gerados em site/dados:
//   administracoes-{UF}.json, administracoes-BR.json   linha do tempo de gestões (semanal)
//   ibge-contexto.json                                  população, PIB e Censo 2022 (semanal)
//   anos/siconfi-{ano}.json                             cache por ano do Tesouro (continua de onde parou)
//   anos/cidades-{UF}.json                              cache dos resultados do IBGE Cidades (Ideb, matrículas, saúde)
//   executivos/{codigo do IBGE}.json                    perfil de cada prefeitura (7 dígitos) e de cada estado (2 dígitos)
//   executivos/presidente.json                          séries mensais do presidente, por gestão
//   indicadores.json                                    catálogo: fonte, órgão, link, limitações de cada indicador

import path from 'node:path';
import { gravarJson, lerJsonSeExistir } from './util.mjs';
import { UFS } from './tse.mjs';
import { gerarAdministracoes, janelaDe48Meses } from './administracoes.mjs';
import { lerIbge, lerSeriesNacionais } from './ibge.mjs';
import { coletarSeries } from './series-fiscais.mjs';
import { carregarEntes } from './siconfi.mjs';
import { montarExecutivoEnte, montarPresidente, contextoDoEnte, catalogoPublico, anosDaJanela } from './indicadores.mjs';
import { montarRankingEstados } from './ranking-estados.mjs';

const arq = (pasta, n) => path.join(pasta, n);

/** Semanal: lê os arquivos do TSE, aplica a curadoria e guarda as gestões por UF. */
export async function atualizarAdministracoes({ baixarZip, pasta, hoje, trocas, log }) {
  const janela = janelaDe48Meses(hoje);
  log(`Gestões: montando a linha do tempo de governadores e presidente (${janela.de} a ${janela.ate})...`);
  const adm = await gerarAdministracoes({ baixarZip, hoje, trocas, janela, incluirPrefeitos: false });
  for (const w of adm.avisos.slice(0, 20)) log('Gestões aviso: ' + w);
  for (const uf of UFS) {
    const municipios = adm.prefeitos[uf] || {};
    const estado = adm.governadores[uf] || null;
    if (!Object.keys(municipios).length && !estado) continue;
    gravarJson(arq(pasta, `administracoes-${uf}.json`), { uf, geradoEm: hoje.toISOString(), janela, municipios, estado });
  }
  if (adm.presidente) gravarJson(arq(pasta, 'administracoes-BR.json'), { geradoEm: hoje.toISOString(), janela, presidente: adm.presidente });
  const nMun = Object.values(adm.prefeitos).reduce((a, m) => a + Object.keys(m).length, 0);
  return { ok: Object.keys(adm.governadores).length > 0, municipios: nMun, governadores: Object.keys(adm.governadores).length,
    presidente: !!adm.presidente, trocas: adm.trocasAplicadas.length, avisos: adm.avisos.length, anos: adm.anos };
}

/** Semanal: população, PIB e Censo 2022 do IBGE. Se tudo falhar, mantém o arquivo anterior. */
export async function atualizarIbge({ json, pasta, hoje, log }) {
  const r = await lerIbge(json, { aoAvisar: (m) => log(m) });
  const partes = [r.populacao, r.pib, r.censo.agua, r.censo.esgoto, r.censo.lixo].filter(Boolean).length;
  if (!partes) return { ok: false, erros: r.erros };
  const { erros, ...dados } = r;
  gravarJson(arq(pasta, 'ibge-contexto.json'), { versao: 1, geradoEm: hoje.toISOString(), ...dados });
  return { ok: true, partes, erros };
}

/** Todo dia: séries mensais nacionais e perfil do presidente. */
export async function atualizarPresidente({ json, pasta, hoje, log }) {
  const janela = janelaDe48Meses(hoje);
  const adm = lerJsonSeExistir(arq(pasta, 'administracoes-BR.json'));
  if (!adm?.presidente?.gestoes?.length) return { ok: false, motivo: 'sem as gestões do presidente' };
  const { series, erros } = await lerSeriesNacionais(json, janela, { aoAvisar: (m) => log(m) });
  const doc = montarPresidente({ gestoes: adm.presidente.gestoes, series, janela, hoje, erros });
  gravarJson(arq(pasta, 'executivos/presidente.json'), doc);
  const ok = Object.values(doc.indicadores).filter((i) => i.situacao === 'ok').length;
  return { ok: ok > 0, series: ok, erros };
}

/**
 * Todo dia: continua a coleta dos anos de contas dentro do orçamento de tempo e remonta o perfil de cada ente.
 * entes: lista do Tesouro; prefill: contas de RGF que a rotina semanal já buscou ({ano: {cod_ibge: {...}}}).
 */
export async function atualizarExecutivos({ json, pasta, hoje, exercicio, orcamentoMs, prefill = {}, log }) {
  const janela = janelaDe48Meses(hoje);
  const anos = anosDaJanela(janela).filter((a) => a <= exercicio).sort((a, b) => b - a); // do mais novo ao mais antigo
  const resumo = { coleta: null, ente: 0, semGestao: 0 };

  if (orcamentoMs > 0) {
    try {
      const entes = (await carregarEntes(json)).filter((e) => e.esfera === 'E' || e.esfera === 'D'); // só estados e DF: prefeituras saíram na versão 8
      const cache = { ler: (a) => lerJsonSeExistir(arq(pasta, `anos/siconfi-${a}.json`)), gravar: (a, o) => gravarJson(arq(pasta, `anos/siconfi-${a}.json`), o) };
      const r = await coletarSeries({ json, entes, anos, cache, hoje, orcamentoMs, prefill, aoAndar: (m) => log('  ' + m) });
      resumo.coleta = { feitos: r.feitos, pendentes: r.pendentes, parouPorTempo: r.parouPorTempo };
      log(`Séries por ano: ${r.feitos} consultas feitas${r.parouPorTempo ? ' (parou por tempo; continua amanhã)' : ''}. Pendentes: ${JSON.stringify(r.pendentes)}.`);
    } catch (e) {
      log(`Séries por ano: FALHOU. ${e.message}`);
      resumo.erro = String(e.message).slice(0, 200);
    }
  }

  const registros = {};
  for (const a of anosDaJanela(janela)) registros[a] = lerJsonSeExistir(arq(pasta, `anos/siconfi-${a}.json`))?.itens || {};
  const ibge = lerJsonSeExistir(arq(pasta, 'ibge-contexto.json')) || {};
  const doEnte = (cod) => Object.fromEntries(Object.entries(registros).map(([a, itens]) => [a, itens[cod]]).filter(([, v]) => v));

  for (const uf of UFS) {
    const prefs = lerJsonSeExistir(arq(pasta, `prefeitos-${uf}.json`));
    const admUf = lerJsonSeExistir(arq(pasta, `administracoes-${uf}.json`));
    const cidadesUf = lerJsonSeExistir(arq(pasta, `anos/cidades-${uf}.json`))?.itens || {};
    if (!admUf) continue;
    for (const p of prefs?.itens || []) {
      const gestoes = admUf.municipios?.[p.cod]?.gestoes;
      if (!p.ibge || !gestoes?.length) { if (p.ibge) resumo.semGestao++; continue; }
      gravarJson(arq(pasta, `executivos/${p.ibge}.json`), montarExecutivoEnte({
        cargo: 'prefeito', ente: { cod_ibge: p.ibge, esfera: 'M', populacao: p.populacao }, nome: p.municipio, uf, gestoes,
        registros: doEnte(p.ibge), janela, hoje, exercicio, contexto: contextoDoEnte(p.ibge, ibge), entregas: p.contas?.entregas ?? null,
        cidades: cidadesUf[p.ibge] || null
      }));
      resumo.ente++;
    }
  }
  const govs = lerJsonSeExistir(arq(pasta, 'governadores.json'));
  const perfisGov = [];
  for (const g of govs?.itens || []) {
    const cidadesG = lerJsonSeExistir(arq(pasta, `anos/cidades-${g.uf}.json`))?.itens?.[g.ibge] || null;
    const gestoes = lerJsonSeExistir(arq(pasta, `administracoes-${g.uf}.json`))?.estado?.gestoes;
    if (!g.ibge || !gestoes?.length) { if (g.ibge) resumo.semGestao++; continue; }
    const perfil = montarExecutivoEnte({
      cargo: 'governador', ente: { cod_ibge: g.ibge, esfera: g.uf === 'DF' ? 'D' : 'E', populacao: g.populacao }, nome: `Estado ${g.uf}`, uf: g.uf, gestoes,
      registros: doEnte(g.ibge), janela, hoje, exercicio, contexto: contextoDoEnte(g.ibge, ibge), entregas: g.contas?.entregas ?? null,
      cidades: cidadesG
    });
    gravarJson(arq(pasta, `executivos/${g.ibge}.json`), perfil);
    perfisGov.push({ uf: g.uf, perfil });
    resumo.ente++;
  }
  // Ranking entre os estados nos temas sem nota (serviços básicos, economia, orçamento e transparência).
  if (perfisGov.length) {
    try {
      const rk = montarRankingEstados(perfisGov, hoje);
      gravarJson(arq(pasta, 'ranking-estados.json'), rk);
      log(`Ranking entre os estados: ${rk.metricas.filter((m) => m.de > 0).length} de ${rk.metricas.length} métricas comparadas entre ${rk.estados} estados.`);
    } catch (e) { log(`Ranking entre os estados: FALHOU. ${e.message}`); }
  }
  gravarJson(arq(pasta, 'indicadores.json'), catalogoPublico());
  return resumo;
}
