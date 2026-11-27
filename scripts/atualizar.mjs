// Rotina de atualização. Roda todo dia no GitHub (veja .github/workflows/atualizar.yml)
// e grava os arquivos que o site lê, na pasta site/dados.
//
//   Todo dia:         deputados federais (Câmara): índice dos últimos 4 anos; só o ano em curso é lido de novo
//                     preços no Brasil (ANP, Banco Central, DIEESE) para a aba do presidente
//                     resultados do IBGE Cidades (Ideb, matrículas, saúde): cada município é relido a cada 7 dias
//   A cada 7 dias:    eleitos (TSE) e contas de prefeituras e estados (Tesouro Nacional)
//
// Para forçar tudo agora:  node scripts/atualizar.mjs --forcar

import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buscar, gravarJson, lerJsonSeExistir, arredondar } from './util.mjs';
import { metodoPublicado, atribuirPosicoes, compacto, destaques, mediaDasNotas } from './nota.mjs';
import { gerarFederais, enriquecerVotos, listarDeputados, anosDaJanela, JANELA_ANOS } from './federais.mjs';
import { atualizarCusto, docsDoCache, NAO_MEDIDOS } from './custo.mjs';
import { gerarSenadores, sondarSenado, NAO_MEDIDOS_SENADO } from './senadores.mjs';
import { gerarHistoricos } from './historico.mjs';
import { gerarEleitos, anosVigentes, UFS } from './tse.mjs';
import { carregarEntes, indexarEntes, acharMunicipio, acharMunicipioParecido, gerarContas, notaExecutivo } from './siconfi.mjs';
import { atualizarAdministracoes, atualizarIbge, atualizarPresidente, atualizarExecutivos } from './executivos.mjs';
import { atualizarPrecos } from './precos.mjs';
import { atualizarCidades } from './ibge-cidades.mjs';
import { atualizarSeguranca } from './seguranca.mjs';
import { atualizarIndices, herdarIndice } from './indice-gestao.mjs';
import { descobrirEleicoes, urlFotoTse } from './fotos.mjs';
import { atualizarMundo } from './mundo.mjs';
import { vigiarFontes, atualizarIndependentes, lerCatalogo, sondarReal } from './fontes-externas.mjs';

const DIAS_ENTRE_ATUALIZACOES_PESADAS = 7;
// O GitHub corta a rotina em 180 minutos. A coleta dos anos de contas usa só o tempo que sobrar até este limite.
const LIMITE_TOTAL_MIN = Number(process.env.PLACAR_LIMITE_MIN ?? 150);
const ORCAMENTO_SERIES_MIN = Number(process.env.PLACAR_ORCAMENTO_MIN ?? 100);
// Tempo máximo, por rodada, para ler o Portal da Transparência da Câmara (custo dos deputados). A primeira leitura completa leva ~20 min.
const ORCAMENTO_CUSTO_MIN = Number(process.env.PLACAR_CUSTO_MIN ?? 30);

/** Trocas de gestor no meio do mandato, com fontes (arquivo escrito à mão em scripts/curadoria). */
export function lerTrocasDeGestao() {
  try { return JSON.parse(readFileSync(fileURLToPath(new URL('./curadoria/trocas-de-gestao.json', import.meta.url)), 'utf-8')).trocas || []; } catch { return []; }
}

const idadeEmDias = (iso, hoje) => (iso ? (hoje - new Date(iso)) / 86400000 : Infinity);
const media = mediaDasNotas;

/**
 * Compara a lista de votações de hoje com a de ontem. Se a Câmara corrigiu algo (resultado, placar,
 * texto, ou o voto registrado de algum deputado), anota no histórico de correções, sem apagar o que existia.
 */
export function registrarCorrecoes(antes, depois, hoje, anteriores = []) {
  if (!antes || !depois) return anteriores;
  const novas = [];
  const velho = new Map(antes.votacoes.map((v, i) => [v.id, { v, i }]));
  const nomes = { titulo: 'texto oficial', aprovacao: 'resultado oficial', sim: 'votos Sim', nao: 'votos Não', outros: 'outros votos' };
  for (const [i, v] of depois.votacoes.entries()) {
    const o = velho.get(v.id);
    if (!o) continue;
    const mudou = Object.keys(nomes).filter((k) => o.v[k] !== v[k]).map((k) => ({ campo: nomes[k], antes: o.v[k], depois: v[k] }));
    let votosMudados = 0;
    for (const [dep, linha] of Object.entries(depois.deputados)) {
      const antiga = antes.deputados[dep];
      if (antiga && antiga[o.i] !== undefined && antiga[o.i] !== linha[i] && antiga[o.i] !== '-' && antiga[o.i] !== '_') votosMudados++;
    }
    if (mudou.length || votosMudados) novas.push({ em: hoje.toISOString(), votacao: v.id, titulo: v.titulo, mudancas: mudou, votosIndividuaisAlterados: votosMudados });
  }
  return [...novas, ...anteriores].slice(0, 300);
}

/** O Tesouro só tem o ano fechado: em janeiro e fevereiro muita prefeitura ainda não entregou o do ano anterior. */
export function exercicioDoTesouro(hoje) {
  return hoje.getMonth() < 2 ? hoje.getFullYear() - 2 : hoje.getFullYear() - 1;
}

export async function atualizar({ fontes, baixarZip, saida, hoje = new Date(), forcar = false, soFederais = false, log = console.log, trocas = lerTrocasDeGestao(), limiteTotalMs = LIMITE_TOTAL_MIN * 60000, orcamentoSeriesMs = ORCAMENTO_SERIES_MIN * 60000, orcamentoCustoMs = ORCAMENTO_CUSTO_MIN * 60000 }) {
  const inicioDaRotina = Date.now();
  mkdirSync(saida, { recursive: true });
  const antigo = lerJsonSeExistir(path.join(saida, 'meta.json')) || {};
  const meta = {
    versao: 1,
    geradoEm: hoje.toISOString(),
    fontes: { ...(antigo.fontes || {}) },
    cargos: { ...(antigo.cargos || {}) }
  };
  const dest = lerJsonSeExistir(path.join(saida, 'destaques.json')) || {};
  const arquivo = (n) => path.join(saida, n);

  // Vereadores (versão 6), prefeitos e deputados estaduais (versão 8) foram retirados do Placar: apaga o que uma versão
  // anterior tenha deixado na pasta de dados, para que nada disso continue sendo servido. (O código de leitura de prefeitos
  // e estaduais continua no repositório, desligado, para a futura página própria.)
  for (const c of ['vereadores', 'prefeitos', 'estaduais']) delete meta.cargos[c];
  delete meta.fontes.estaduais;
  delete dest.prefeitos;
  delete dest.estaduais;
  for (const nome of readdirSync(saida)) if (/^(vereadores|prefeitos|estaduais)-[A-Z]{2}\.json$/.test(nome)) rmSync(path.join(saida, nome), { force: true });
  for (const nome of ['ranking-prefeitos.json', 'estaduais-registro.json', 'assembleias.json']) rmSync(path.join(saida, nome), { force: true });
  if (existsSync(path.join(saida, 'executivos'))) for (const nome of readdirSync(path.join(saida, 'executivos'))) if (/^\d{7}\.json$/.test(nome)) rmSync(path.join(saida, 'executivos', nome), { force: true });
  if (existsSync(path.join(saida, 'anos'))) for (const nome of readdirSync(path.join(saida, 'anos'))) if (/^estaduais-/.test(nome)) rmSync(path.join(saida, 'anos', nome), { force: true });

  // ---------- TSE e Tesouro: a cada 7 dias ----------
  const precisaPesada = !soFederais && (forcar || !antigo.fontes?.siconfi?.ok || !antigo.fontes?.tse?.ok || !antigo.fontes?.historico?.ok ||
    idadeEmDias(antigo.fontes.siconfi.atualizadoEm, hoje) >= DIAS_ENTRE_ATUALIZACOES_PESADAS ||
    !existsSync(arquivo('governadores.json')));

  // ---------- Câmara: histórico de mandatos (semanal) ----------
  // Vem ANTES do índice porque o índice usa as licenças e afastamentos de cada deputado.
  if (precisaPesada) {
    try {
      const ids = (lerJsonSeExistir(arquivo('federais.json'))?.itens || await listarDeputados(fontes.json)).map((i) => String(i.id));
      log('Câmara: lendo o histórico de mandatos de cada deputado...');
      const r = await gerarHistoricos({ json: fontes.json, ids, pasta: saida, hoje, aoAndar: (f, t) => log(`  histórico ${f} de ${t}`) });
      meta.fontes.historico = { ok: r.falhas < r.total, atualizadoEm: hoje.toISOString(), total: r.total, falhas: r.falhas, semHistorico: r.semHistorico };
      log(`Câmara: histórico gravado (${r.total - r.falhas} de ${r.total}).`);
    } catch (e) {
      log(`Câmara (histórico): FALHOU. ${e.message}`);
      meta.fontes.historico = { ...(antigo.fontes?.historico || {}), ok: false, erro: String(e.message).slice(0, 300), tentouEm: hoje.toISOString() };
    }
  }

  // ---------- Câmara: todo dia ----------
  let fedHoje = null;
  const anoCamara = hoje.getMonth() < 1 ? hoje.getFullYear() - 1 : hoje.getFullYear();
  try {
    log(`Câmara: calculando o índice dos deputados federais (${anoCamara - JANELA_ANOS + 1} a ${anoCamara})...`);
    // Anos fechados ficam guardados em dados/anos/ e só são lidos de novo quando se pede "refazer tudo".
    const cache = {
      ler: (a) => lerJsonSeExistir(arquivo(`anos/federais-${a}.json`)),
      gravar: (a, obj) => gravarJson(arquivo(`anos/federais-${a}.json`), obj)
    };
    // Licenças e afastamentos (histórico oficial da Câmara) não contam contra o deputado.
    const pausasDe = (id) => (lerJsonSeExistir(arquivo(`deputados/${id}.json`)) || {}).pausas || [];
    // Custo para os cofres públicos: lê o Portal da Transparência da Câmara (uma página por deputado e ano) dentro do tempo
    // disponível; o que não der tempo continua na rodada seguinte. Se a leitura falhar, usa o que já estava guardado.
    const anosCusto = anosDaJanela(anoCamara, JANELA_ANOS);
    const cacheCusto = { ler: (a) => lerJsonSeExistir(arquivo(`anos/custo-${a}.json`)), gravar: (a, o) => gravarJson(arquivo(`anos/custo-${a}.json`), o) };
    let custoDocs = docsDoCache(cacheCusto, anosCusto);
    try {
      const ids = (await listarDeputados(fontes.json)).map((d) => String(d.id));
      log(`Custo: lendo o Portal da Transparência da Câmara (${ids.length} deputados, ${anosCusto[0]} a ${anosCusto[anosCusto.length - 1]})...`);
      const r = await atualizarCusto({ fontes, ids, anos: anosCusto, anoAtual: anoCamara, cache: cacheCusto, hoje, orcamentoMs: orcamentoCustoMs, aoAndar: (m) => log('  ' + m) });
      custoDocs = r.docs;
      const lidos = ids.filter((id) => anosCusto.every((a) => custoDocs[a].itens[id] && !custoDocs[a].itens[id].erro)).length;
      meta.fontes.custo = { ok: r.falhas < Math.max(5, r.tentativas * 0.5), atualizadoEm: hoje.toISOString(), lidosAgora: r.feitos, falhas: r.falhas, pendentes: r.pendentes, deputadosCompletos: lidos, ...(r.falhas ? { motivos: r.motivos } : {}) };
      log(`Custo: ${r.feitos} páginas lidas, ${r.falhas} com falha, ${r.pendentes} pendentes; ${lidos} de ${ids.length} deputados com todos os anos.`);
    } catch (e) {
      log(`Custo: FALHOU. ${e.message}`);
      meta.fontes.custo = { ...(antigo.fontes?.custo || {}), ok: false, erro: String(e.message).slice(0, 300), tentouEm: hoje.toISOString() };
    }
    const { votos, ...fed } = await gerarFederais({ fontes, ano: anoCamara, janela: JANELA_ANOS, hoje, cache, usarCache: !forcar, pausasDe, custoDocs, aoAndar: (m) => log('  ' + m) });
    fedHoje = fed;
    gravarJson(arquivo('federais.json'), fed);
    try {
      const falhasResumo = await enriquecerVotos(fontes.json, votos);
      const antes = lerJsonSeExistir(arquivo('votos.json'));
      const anteriores = (lerJsonSeExistir(arquivo('correcoes.json')) || {}).itens || [];
      const itens = antes && antes.ano === votos.ano ? registrarCorrecoes(antes, votos, hoje, anteriores) : anteriores;
      gravarJson(arquivo('correcoes.json'), { aviso: 'Registro de mudanças que a Câmara fez em votações já publicadas (resultado, placar, texto ou voto de algum deputado). Nada é apagado.', itens });
      gravarJson(arquivo('votos.json'), votos);
      log(`Câmara: ${votos.votacoes.length} votações nominais gravadas${falhasResumo ? ` (${falhasResumo} sem resumo da matéria)` : ''}.`);
    } catch (e) { log(`Câmara: votos não gravados. ${e.message}`); }
    dest.federais = destaques(fed.itens);
    meta.fontes.camara = { ok: true, atualizadoEm: hoje.toISOString(), ano: anoCamara, janela: fed.janela, sessoes: fed.sessoes, votacoes: fed.votacoes, sessoesAno: fed.sessoesAno, votacoesAno: fed.votacoesAno };
    meta.cargos.federais = { total: fed.total, comNota: fed.comNota, media: fed.media };
    log(`Câmara: ${fed.comNota} de ${fed.total} deputados com índice (${fed.sessoes} sessões e ${fed.votacoes} votações nominais em ${fed.janela.de} a ${fed.janela.ate}).`);
  } catch (e) {
    log(`Câmara: FALHOU. ${e.message}`);
    meta.fontes.camara = { ...(antigo.fontes?.camara || {}), ok: false, erro: String(e.message).slice(0, 300), tentouEm: hoje.toISOString() };
  }

  let contasDoExercicio = null;
  if (precisaPesada) {
    // Versão 8: o Placar acompanha deputados federais, senadores, governadores e presidente. Prefeitos e deputados estaduais
    // saíram (uma página própria será feita mais adiante); aqui só se lê a lista de governadores.
    let eleitos = null;
    try {
      log('TSE: baixando a lista oficial de governadores eleitos...');
      const anos = anosVigentes(hoje);
      eleitos = await gerarEleitos({ baixarZip, anos, hoje, incluir: { prefeitos: false, estaduais: false } });
      for (const w of eleitos.avisos) log('TSE aviso: ' + w);
      meta.fontes.tse = { ok: eleitos.governadores.length > 0, atualizadoEm: hoje.toISOString(), eleicoes: anos, avisos: eleitos.avisos.length };
      if (!eleitos.governadores.length) throw new Error('O arquivo do TSE não trouxe nenhum governador eleito.');
      log(`TSE: ${eleitos.governadores.length} governadores.`);
      // Foto oficial de candidatura (TSE): só o endereço; a imagem não é copiada.
      await descobrirEleicoes(fontes.json, log);
      for (const g of eleitos.governadores) { const f = urlFotoTse(eleitos.anos.governadores, g.id, g.uf); if (f) g.foto = f; }
    } catch (e) {
      log(`TSE: FALHOU. ${e.message}`);
      meta.fontes.tse = { ...(antigo.fontes?.tse || {}), ok: false, erro: String(e.message).slice(0, 300), tentouEm: hoje.toISOString() };
      eleitos = null;
    }

    if (eleitos) {
      const exercicio = exercicioDoTesouro(hoje);
      let contas = null;
      try {
        log(`Tesouro: lendo a lista de estados...`);
        const entes = await carregarEntes(fontes.json);
        const indice = indexarEntes(entes);
        const alvos = new Map();
        for (const g of eleitos.governadores) {
          g._ente = indice.estados.get(g.uf) || null;
          if (g._ente) alvos.set(g._ente.cod_ibge, g._ente);
          else log(`Tesouro: não achei o estado ${g.uf} na lista de entes.`);
        }
        log(`Tesouro: consultando as contas de ${alvos.size} estados (${exercicio})...`);
        contas = await gerarContas({ json: fontes.json, entes: [...alvos.values()], exercicio,
          aoAndar: (f, t) => log(typeof f === 'string' ? `  ${f}` : `  ${f} de ${t}`) });
        contasDoExercicio = contas;
        const comErro = Object.values(contas).filter((c) => c.erro).length;
        meta.fontes.siconfi = { ok: true, atualizadoEm: hoje.toISOString(), exercicio, entes: alvos.size, comErro };
        log(`Tesouro: pronto. ${comErro} consultas com erro.`);
      } catch (e) {
        log(`Tesouro: FALHOU. ${e.message}`);
        meta.fontes.siconfi = { ...(antigo.fontes?.siconfi || {}), ok: false, erro: String(e.message).slice(0, 300), tentouEm: hoje.toISOString() };
      }

      // Se o Tesouro falhou e já existe resultado anterior, mantém o anterior (não apaga as notas).
      if (!(!contas && existsSync(arquivo('governadores.json')))) {
        // A rotina semanal refaz a lista; a nota (calculada todo dia, mais adiante) é preservada até ser recalculada.
        const anteriores = new Map((lerJsonSeExistir(arquivo('governadores.json'))?.itens || []).map((x) => [x.id, x]));
        const exerc = meta.fontes.siconfi.exercicio ?? null;
        for (const g of eleitos.governadores) {
          const ente = g._ente;
          delete g._ente;
          if (ente && contas) Object.assign(g, notaExecutivo(contas[ente.cod_ibge], ente.esfera), { ibge: ente.cod_ibge, populacao: ente.populacao });
          else Object.assign(g, { nota: null, comp: [], motivo: 'As contas do estado ainda não foram consultadas.' });
          herdarIndice(g, anteriores.get(g.id));
        }
        const gComNota = atribuirPosicoes(eleitos.governadores);
        gravarJson(arquivo('governadores.json'), { ano: eleitos.anos.governadores, exercicio: exerc, total: eleitos.governadores.length, comNota: gComNota, itens: eleitos.governadores });
        dest.governadores = destaques(eleitos.governadores, 5);
        meta.cargos.governadores = { total: eleitos.governadores.length, comNota: gComNota, media: media(eleitos.governadores.filter((g) => g.nota != null).map((g) => g.nota)) };
        log(`Governadores com nota: ${gComNota}.`);
      }
    }
  }

  // Governadores que já estavam na lista antes da foto existir ganham o endereço da foto sem esperar a rotina semanal.
  {
    const gov = lerJsonSeExistir(arquivo('governadores.json'));
    if (gov?.itens?.some((g) => !g.foto && g.id)) {
      let n = 0;
      for (const g of gov.itens) if (!g.foto && g.id) { const f = urlFotoTse(gov.ano, g.id, g.uf); if (f) { g.foto = f; n++; } }
      if (n) { gravarJson(arquivo('governadores.json'), gov); log(`Fotos: ${n} governadores ganharam o endereço da foto oficial (TSE).`); }
    }
  }

  // ---------- Perfil ampliado de governadores e presidente ----------
  // Cada passo é isolado: se um falhar, o índice e os perfis que já existiam continuam no ar.
  if (!soFederais) {
    const velha = (nome) => forcar || !antigo.fontes?.[nome]?.ok || idadeEmDias(antigo.fontes[nome].atualizadoEm, hoje) >= DIAS_ENTRE_ATUALIZACOES_PESADAS;
    const passo = async (nome, rotulo, fn) => {
      try {
        const r = await fn();
        meta.fontes[nome] = { ...(r.ok ? {} : { erro: r.motivo || (r.erros || []).join('; ').slice(0, 300) }), ...r, atualizadoEm: hoje.toISOString() };
        if (!r.ok) meta.fontes[nome].ok = false;
        log(`${rotulo}: ${r.ok ? 'pronto' : 'sem resultado'}.`);
      } catch (e) {
        log(`${rotulo}: FALHOU. ${e.message}`);
        meta.fontes[nome] = { ...(antigo.fontes?.[nome] || {}), ok: false, erro: String(e.message).slice(0, 300), tentouEm: hoje.toISOString() };
      }
    };
    if (velha('administracoes')) await passo('administracoes', 'Gestões', () => atualizarAdministracoes({ baixarZip, pasta: saida, hoje, trocas, log }));
    if (velha('ibge')) await passo('ibge', 'IBGE', () => atualizarIbge({ json: fontes.json, pasta: saida, hoje, log }));
    await passo('presidente', 'Presidente', () => atualizarPresidente({ json: fontes.json, pasta: saida, hoje, log }));
    // Senadores (versão 8): lista com foto oficial e custo (CEAPS). Se a lista do Senado falhar, o arquivo anterior continua no ar.
    // Os critérios sem fonte conferida ficam "Dado não encontrado ou não confirmado" (ver scripts/senadores.mjs).
    await passo('senado', 'Senadores', async () => {
      const anoSenado = hoje.getMonth() < 1 ? hoje.getFullYear() - 1 : hoje.getFullYear();
      const cacheSenado = { ler: (a) => lerJsonSeExistir(arquivo(`anos/senado-ceaps-${a}.json`)), gravar: (a, o) => gravarJson(arquivo(`anos/senado-ceaps-${a}.json`), o) };
      const { diagnostico, ...sen } = await gerarSenadores({ fontes, ano: anoSenado, hoje, cache: cacheSenado, usarCache: !forcar, aoAndar: (m) => log('  ' + m) });
      gravarJson(arquivo('senadores.json'), sen);
      dest.senadores = destaques(sen.itens);
      meta.cargos.senadores = { total: sen.total, comNota: sen.comNota, media: sen.media, comCusto: sen.comCusto };
      for (const w of diagnostico.avisos) log('Senado aviso: ' + w);
      // Como o Senado responde às consultas que ainda não entram no índice: só nomes de campos, uma vez por semana.
      try {
        const antes = lerJsonSeExistir(arquivo('senado-sondagem.json'));
        if (forcar || !antes || idadeEmDias(antes.geradoEm, hoje) >= DIAS_ENTRE_ATUALIZACOES_PESADAS) {
          const cod = sen.itens[0]?.id;
          if (cod) gravarJson(arquivo('senado-sondagem.json'), await sondarSenado({ json: fontes.json, cod, hoje }));
        }
      } catch (e) { log(`Senado: sondagem não gravada. ${e.message}`); }
      const ok = sen.total >= 70;
      return { ok, ano: anoSenado, total: sen.total, comCusto: sen.comCusto, comNota: sen.comNota, ceapsUrl: diagnostico.ceapsUrl, anosLidos: diagnostico.anosLidos, anosDoCache: diagnostico.anosDoCache,
        ...(Object.keys(diagnostico.anosNaoConfirmados).length ? { anosNaoConfirmados: diagnostico.anosNaoConfirmados } : {}),
        ...(diagnostico.mandatosFalhas || diagnostico.mandatosSemData ? { mandatosFalhas: diagnostico.mandatosFalhas, mandatosSemData: diagnostico.mandatosSemData } : {}),
        ...(diagnostico.avisos.length ? { avisos: diagnostico.avisos.map((a) => a.slice(0, 240)) } : {}) };
    });
    // Fontes independentes. (1) Vigilância diária: confere se cada fonte do catálogo publicou algo novo. Só avisa; nada é copiado sozinho.
    // (2) Valores conferidos à mão (scripts/curadoria/indicadores-independentes.json): validados e gravados em independentes.json.
    let vigia = null;
    await passo('vigilancia', 'Fontes independentes (vigilância diária)', async () => {
      vigia = await vigiarFontes({ catalogo: lerCatalogo(), pasta: saida, texto: fontes.texto, json: fontes.json, sondar: fontes.sondar, hoje, log, pausaMs: fontes.pausaVigiaMs || 0 });
      return vigia;
    });
    await passo('independentes', 'Fontes independentes (valores conferidos)', async () => atualizarIndependentes({ pasta: saida, hoje, log }));
    // O Brasil no mundo (Banco Mundial): posição do Brasil nos indicadores de saúde, educação, segurança, economia e transparência.
    // Semanal, ou antes disso se a vigilância viu que o Banco Mundial atualizou as bases.
    if (velha('mundo') || vigia?.novidades?.includes('banco-mundial')) await passo('mundo', 'Brasil no mundo (Banco Mundial)', () => atualizarMundo({ json: fontes.json, pasta: saida, hoje, log }));
    // Preços no Brasil (gasolina, dólar, cesta básica): todo dia; usa no máximo 10 minutos.
    if (fontes.binario) await passo('precos', 'Preços', () => atualizarPrecos({ json: fontes.json, binario: fontes.binario, pasta: saida, hoje, orcamentoMs: 10 * 60000, log }));
    // Resultados do IBGE Cidades (Ideb, matrículas, mortalidade infantil, diarreia): cada município é relido a cada 7 dias,
    // e a coleta continua no dia seguinte de onde parou. Usa no máximo 12 minutos por rodada.
    await passo('cidades', 'IBGE Cidades', () => atualizarCidades({ json: fontes.json, pasta: saida, hoje, orcamentoMs: 12 * 60000, log }));
    // Segurança pública por estado (Sinesp): semanal. Se falhar, a área de segurança fica "sem dado" no índice.
    if (fontes.binario && velha('seguranca')) await passo('seguranca', 'Segurança (Sinesp)', () => atualizarSeguranca({ json: fontes.json, binario: fontes.binario, pasta: saida, hoje, log }));
    const exercicio = exercicioDoTesouro(hoje);
    const sobra = Math.min(orcamentoSeriesMs, limiteTotalMs - (Date.now() - inicioDaRotina));
    const prefill = contasDoExercicio ? { [exercicio]: Object.fromEntries(Object.entries(contasDoExercicio).map(([k, c]) => [k, c.erro ? { erro: c.erro } : { rgf: c.rgf, pessoal: c.pessoal, divida: c.divida }])) } : {};
    await passo('series', 'Séries por ano', async () => {
      const r = await atualizarExecutivos({ json: fontes.json, pasta: saida, hoje, exercicio, orcamentoMs: sobra, prefill, log });
      return { ok: !r.erro, ...r };
    });
    // Índice de serviços públicos dos governadores (saúde, educação, segurança, infraestrutura e saneamento): recalculado todo dia.
    await passo('indice', 'Índice de serviços públicos', async () => {
      const r = await atualizarIndices({ pasta: saida, hoje, log });
      if (r.ok) {
        dest.governadores = r.governadores.destaques;
        meta.cargos.governadores = { total: r.governadores.total, comNota: r.governadores.comNota, media: r.governadores.media };
      }
      return r.ok ? { ok: true, ...r.cobertura } : r;
    });
  }

  gravarJson(arquivo('destaques.json'), dest);
  gravarJson(arquivo('metodo.json'), metodoPublicado({ custoNaoMedidos: NAO_MEDIDOS, custoNaoMedidosSenadores: NAO_MEDIDOS_SENADO }));
  gravarJson(arquivo('meta.json'), meta);
  return meta;
}

/* ----------------------- execução pela linha de comando ----------------------- */

async function baixarParaDisco(url) {
  const destino = path.join(os.tmpdir(), 'placar-' + path.basename(url));
  if (!existsSync(destino)) {
    const bin = await buscar(url, { formato: 'binario', limiteMs: 900000 });
    writeFileSync(destino, bin);
  }
  return destino;
}

const fontesReais = {
  json: (url) => buscar(url, { formato: 'json' }),
  texto: (url) => buscar(url, { formato: 'texto' }),
  binario: (url) => buscar(url, { formato: 'binario', limiteMs: 180000 }),
  sondar: sondarReal,
  pausaVigiaMs: 700 // pausa educada entre os sites das fontes independentes
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const args = new Set(process.argv.slice(2));
  const meta = await atualizar({
    fontes: fontesReais,
    baixarZip: baixarParaDisco,
    saida: path.join(raiz, 'site', 'dados'),
    forcar: args.has('--forcar'),
    soFederais: args.has('--so-federais')
  });
  const algumaOk = Object.values(meta.fontes).some((f) => f.ok);
  console.log('\nResumo:', JSON.stringify(meta.fontes, null, 1));
  if (!algumaOk) { console.error('Nenhuma fonte funcionou.'); process.exit(1); }
}
