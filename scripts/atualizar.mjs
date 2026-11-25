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
import { buscar, gravarJson, lerJsonSeExistir, lerDoZip, arredondar } from './util.mjs';
import { METODO, atribuirPosicoes, compacto, destaques, mediaDasNotas } from './nota.mjs';
import { gerarFederais, enriquecerVotos, listarDeputados, JANELA_ANOS } from './federais.mjs';
import { gerarHistoricos } from './historico.mjs';
import { gerarEleitos, anosVigentes, UFS } from './tse.mjs';
import { carregarEntes, indexarEntes, acharMunicipio, acharMunicipioParecido, gerarContas, notaExecutivo } from './siconfi.mjs';
import { atualizarAdministracoes, atualizarIbge, atualizarPresidente, atualizarExecutivos } from './executivos.mjs';
import { atualizarPrecos } from './precos.mjs';
import { atualizarCidades } from './ibge-cidades.mjs';
import { atualizarSeguranca } from './seguranca.mjs';
import { atualizarIndices, herdarIndice } from './indice-gestao.mjs';
import { atualizarEstaduais } from './estaduais.mjs';

const DIAS_ENTRE_ATUALIZACOES_PESADAS = 7;
// O GitHub corta a rotina em 180 minutos. A coleta dos anos de contas usa só o tempo que sobrar até este limite.
const LIMITE_TOTAL_MIN = Number(process.env.PLACAR_LIMITE_MIN ?? 150);
const ORCAMENTO_SERIES_MIN = Number(process.env.PLACAR_ORCAMENTO_MIN ?? 100);

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

export async function atualizar({ fontes, baixarZip, saida, hoje = new Date(), forcar = false, soFederais = false, log = console.log, trocas = lerTrocasDeGestao(), limiteTotalMs = LIMITE_TOTAL_MIN * 60000, orcamentoSeriesMs = ORCAMENTO_SERIES_MIN * 60000 }) {
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

  // Vereadores foram retirados do aplicativo: apaga o que uma versão anterior tenha deixado na pasta de dados.
  delete meta.cargos.vereadores;
  for (const nome of readdirSync(saida)) if (/^vereadores-[A-Z]{2}\.json$/.test(nome)) rmSync(path.join(saida, nome), { force: true });

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
    const { votos, ...fed } = await gerarFederais({ fontes, ano: anoCamara, janela: JANELA_ANOS, hoje, cache, usarCache: !forcar, pausasDe, aoAndar: (m) => log('  ' + m) });
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
    let eleitos = null;
    try {
      log('TSE: baixando a lista oficial de eleitos...');
      const anos = anosVigentes(hoje);
      eleitos = await gerarEleitos({ baixarZip, anos, hoje });
      for (const w of eleitos.avisos) log('TSE aviso: ' + w);
      for (const uf of UFS) {
        if (eleitos.estaduais[uf]) {
          // A nota (calculada todo dia, mais adiante) é preservada até ser recalculada.
          const antes = new Map((lerJsonSeExistir(arquivo(`estaduais-${uf}.json`))?.itens || []).map((x) => [x.id, x]));
          gravarJson(arquivo(`estaduais-${uf}.json`), { uf, ano: anos.estaduais, itens: eleitos.estaduais[uf].map((x) => herdarIndice(x, antes.get(x.id))) });
        }
      }
      const contar = (o) => Object.values(o).reduce((a, l) => a + l.length, 0);
      meta.fontes.tse = { ok: true, atualizadoEm: hoje.toISOString(), eleicoes: anos, avisos: eleitos.avisos.length };
      meta.cargos.estaduais = { total: contar(eleitos.estaduais) };
      log(`TSE: ${contar(eleitos.prefeitos)} prefeitos, ${contar(eleitos.estaduais)} deputados estaduais, ${eleitos.governadores.length} governadores.`);
    } catch (e) {
      log(`TSE: FALHOU. ${e.message}`);
      meta.fontes.tse = { ...(antigo.fontes?.tse || {}), ok: false, erro: String(e.message).slice(0, 300), tentouEm: hoje.toISOString() };
    }

    if (eleitos) {
      const exercicio = exercicioDoTesouro(hoje);
      let contas = null;
      let indice = null;
      try {
        log(`Tesouro: lendo a lista de prefeituras e estados...`);
        const entes = await carregarEntes(fontes.json);
        indice = indexarEntes(entes);
        const alvos = new Map();
        let pelaSemelhanca = 0;
        for (const uf of UFS) {
          const lista = eleitos.prefeitos[uf] || [];
          const usados = new Set();
          for (const p of lista) {
            p._ente = acharMunicipio(indice, uf, p.municipio);
            if (p._ente) usados.add(p._ente.cod_ibge);
          }
          // Nomes escritos diferente no TSE e no Tesouro: só aceita um parecido sem empate.
          for (const p of lista) {
            if (p._ente) continue;
            p._ente = acharMunicipioParecido(indice, uf, p.municipio, usados);
            if (p._ente) { usados.add(p._ente.cod_ibge); pelaSemelhanca++; }
          }
          for (const p of lista) if (p._ente) alvos.set(p._ente.cod_ibge, p._ente);
        }
        if (pelaSemelhanca) log(`Tesouro: ${pelaSemelhanca} prefeituras ligadas por nome parecido.`);
        for (const g of eleitos.governadores) {
          g._ente = indice.estados.get(g.uf) || null;
          if (g._ente) alvos.set(g._ente.cod_ibge, g._ente);
          else log(`Tesouro: não achei o estado ${g.uf} na lista de entes.`);
        }
        log(`Tesouro: consultando as contas de ${alvos.size} prefeituras e estados (${exercicio}). Isto leva alguns minutos...`);
        contas = await gerarContas({ json: fontes.json, entes: [...alvos.values()], exercicio,
          aoAndar: (f, t) => log(typeof f === 'string' ? `  ${f}` : `  ${f} de ${t}`) });
        contasDoExercicio = contas;
        const falhas = Object.values(contas).filter((c) => c.erro);
        const comErro = falhas.length;
        const tiposDeErro = {};
        for (const c of falhas) { const k = c.erro.replace(/https?:\/\/\S+/g, '').replace(/\d+/g, '#').slice(0, 60); tiposDeErro[k] = (tiposDeErro[k] || 0) + 1; }
        meta.fontes.siconfi = { ok: true, atualizadoEm: hoje.toISOString(), exercicio, entes: alvos.size, comErro, pelaSemelhanca };
        log(`Tesouro: pronto. ${comErro} consultas com erro.${comErro ? ' Tipos: ' + JSON.stringify(tiposDeErro) : ''}`);
      } catch (e) {
        log(`Tesouro: FALHOU. ${e.message}`);
        meta.fontes.siconfi = { ...(antigo.fontes?.siconfi || {}), ok: false, erro: String(e.message).slice(0, 300), tentouEm: hoje.toISOString() };
      }

      // Se o Tesouro falhou e já existe resultado anterior, mantém o anterior (não apaga as notas).
      const manterAnterior = !contas && existsSync(arquivo('ranking-prefeitos.json'));
      if (!manterAnterior) {
        // A rotina semanal refaz as listas; a nota (calculada todo dia, mais adiante) é preservada até ser recalculada.
        const indiceAnterior = new Map();
        for (const uf of UFS) for (const x of lerJsonSeExistir(arquivo(`prefeitos-${uf}.json`))?.itens || []) indiceAnterior.set(x.id, x);
        for (const x of lerJsonSeExistir(arquivo('governadores.json'))?.itens || []) indiceAnterior.set(x.id, x);
        const todosPref = [];
        for (const uf of UFS) {
          for (const p of eleitos.prefeitos[uf] || []) {
            const ente = p._ente;
            delete p._ente;
            if (ente && contas) {
              p.ibge = ente.cod_ibge;
              p.populacao = ente.populacao;
              // As contas do Tesouro (gasto com pessoal, dívida) ficam só como informação; a nota vem do índice de serviços públicos.
              Object.assign(p, notaExecutivo(contas[ente.cod_ibge], 'M'));
            } else {
              Object.assign(p, { nota: null, comp: [], motivo: contas ? 'Município não encontrado na base do Tesouro Nacional.' : 'As contas ainda não foram consultadas.' });
            }
            herdarIndice(p, indiceAnterior.get(p.id));
            todosPref.push(p);
          }
        }
        const comNota = atribuirPosicoes(todosPref);
        const exerc = meta.fontes.siconfi.exercicio ?? null;
        for (const uf of UFS) {
          if (eleitos.prefeitos[uf]) gravarJson(arquivo(`prefeitos-${uf}.json`), { uf, ano: eleitos.anos.municipal, exercicio: exerc, itens: eleitos.prefeitos[uf] });
        }
        gravarJson(arquivo('ranking-prefeitos.json'), { ano: eleitos.anos.municipal, exercicio: exerc, total: todosPref.length, comNota, itens: todosPref.map(compacto) });
        dest.prefeitos = destaques(todosPref);
        meta.cargos.prefeitos = { total: todosPref.length, comNota, media: media(todosPref.filter((p) => p.nota != null).map((p) => p.nota)) };

        for (const g of eleitos.governadores) {
          const ente = g._ente;
          delete g._ente;
          if (ente && contas) Object.assign(g, notaExecutivo(contas[ente.cod_ibge], ente.esfera), { ibge: ente.cod_ibge, populacao: ente.populacao });
          else Object.assign(g, { nota: null, comp: [], motivo: 'As contas do estado ainda não foram consultadas.' });
          herdarIndice(g, indiceAnterior.get(g.id));
        }
        const gComNota = atribuirPosicoes(eleitos.governadores);
        gravarJson(arquivo('governadores.json'), { ano: eleitos.anos.governadores, exercicio: exerc, total: eleitos.governadores.length, comNota: gComNota, itens: eleitos.governadores });
        dest.governadores = destaques(eleitos.governadores, 5);
        meta.cargos.governadores = { total: eleitos.governadores.length, comNota: gComNota, media: media(eleitos.governadores.filter((g) => g.nota != null).map((g) => g.nota)) };
        log(`Prefeitos com nota: ${comNota}. Governadores com nota: ${gComNota}.`);
      }
    }
  }

  // ---------- Perfil ampliado de prefeitos, governadores e presidente ----------
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
    // Índice de serviços públicos (saúde, educação, segurança, infraestrutura e saneamento): recalculado todo dia.
    await passo('indice', 'Índice de serviços públicos', async () => {
      const r = await atualizarIndices({ pasta: saida, hoje, log });
      if (r.ok) {
        dest.prefeitos = r.prefeitos.destaques;
        dest.governadores = r.governadores.destaques;
        meta.cargos.prefeitos = { total: r.prefeitos.total, comNota: r.prefeitos.comNota, media: r.prefeitos.media };
        meta.cargos.governadores = { total: r.governadores.total, comNota: r.governadores.comNota, media: r.governadores.media };
      }
      return r.ok ? { ok: true, ...r.cobertura } : r;
    });
    // Deputados estaduais: lê as Assembleias que têm leitor (hoje, a de São Paulo) e calcula o índice parcial; as demais ficam sem índice, com o motivo.
    await passo('estaduais', 'Deputados estaduais', async () => {
      const r = await atualizarEstaduais({ binario: fontes.binario, pasta: saida, hoje, log });
      if (r.total != null) meta.cargos.estaduais = { total: r.total, comNota: r.comNota, media: r.media };
      return r;
    });
  }

  gravarJson(arquivo('destaques.json'), dest);
  gravarJson(arquivo('metodo.json'), METODO);
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
  cotas: async (ano) => lerDoZip(await baixarParaDisco(`https://www.camara.leg.br/cotas/Ano-${ano}.csv.zip`), `Ano-${ano}.csv`)
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
