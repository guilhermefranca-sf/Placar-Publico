// Rotina de atualização. Roda todo dia no GitHub (veja .github/workflows/atualizar.yml)
// e grava os arquivos que o site lê, na pasta site/dados.
//
//   Todo dia:         deputados federais (Câmara)
//   A cada 7 dias:    eleitos (TSE) e contas de prefeituras e estados (Tesouro Nacional)
//
// Para forçar tudo agora:  node scripts/atualizar.mjs --forcar

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buscar, gravarJson, lerJsonSeExistir, lerDoZip, arredondar } from './util.mjs';
import { METODO, atribuirPosicoes } from './nota.mjs';
import { gerarFederais } from './federais.mjs';
import { gerarEleitos, anosVigentes, UFS } from './tse.mjs';
import { carregarEntes, indexarEntes, acharMunicipio, gerarContas, notaExecutivo } from './siconfi.mjs';

const DIAS_ENTRE_ATUALIZACOES_PESADAS = 7;

const idadeEmDias = (iso, hoje) => (iso ? (hoje - new Date(iso)) / 86400000 : Infinity);
const media = (v) => (v.length ? arredondar(v.reduce((a, b) => a + b, 0) / v.length, 1) : null);

function compacto(i) {
  const o = { id: i.id, nome: i.nome, partido: i.partido, uf: i.uf, nota: i.nota, rank: i.rank };
  if (i.municipio) o.municipio = i.municipio;
  if (i.foto) o.foto = i.foto;
  return o;
}

function destaques(itens, n = 10) {
  const ordenados = itens.filter((i) => i.nota != null).sort((a, b) => a.rank - b.rank);
  return { top: ordenados.slice(0, n).map(compacto), bottom: ordenados.slice(-n).reverse().map(compacto) };
}

/** Quem tomou posse depois do fim do ano das contas não pode ser avaliado por elas. */
function semContasDoMandato(inicio, exercicio) {
  return exercicio != null && exercicio < inicio
    ? { nota: null, comp: [], motivo: `O mandato começou em ${inicio}; o último ano fechado no Tesouro Nacional é ${exercicio}, então ainda não há relatórios fiscais desta administração.` }
    : null;
}

/** O Tesouro só tem o ano fechado: em janeiro e fevereiro muita prefeitura ainda não entregou o do ano anterior. */
export function exercicioDoTesouro(hoje) {
  return hoje.getMonth() < 2 ? hoje.getFullYear() - 2 : hoje.getFullYear() - 1;
}

export async function atualizar({ fontes, baixarZip, saida, hoje = new Date(), forcar = false, soFederais = false, log = console.log }) {
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

  // ---------- Câmara: todo dia ----------
  const anoCamara = hoje.getMonth() < 1 ? hoje.getFullYear() - 1 : hoje.getFullYear();
  try {
    log(`Câmara: calculando a nota dos deputados federais (${anoCamara})...`);
    const fed = await gerarFederais({ fontes, ano: anoCamara, hoje });
    gravarJson(arquivo('federais.json'), fed);
    dest.federais = destaques(fed.itens);
    meta.fontes.camara = { ok: true, atualizadoEm: hoje.toISOString(), ano: anoCamara, sessoes: fed.sessoes, votacoes: fed.votacoes };
    meta.cargos.federais = { total: fed.total, comNota: fed.comNota, media: fed.media };
    log(`Câmara: ${fed.comNota} de ${fed.total} deputados com nota (${fed.sessoes} sessões, ${fed.votacoes} votações nominais).`);
  } catch (e) {
    log(`Câmara: FALHOU. ${e.message}`);
    meta.fontes.camara = { ...(antigo.fontes?.camara || {}), ok: false, erro: String(e.message).slice(0, 300), tentouEm: hoje.toISOString() };
  }

  // ---------- TSE e Tesouro: a cada 7 dias ----------
  const precisaPesada = !soFederais && (forcar || !antigo.fontes?.siconfi?.ok || !antigo.fontes?.tse?.ok ||
    idadeEmDias(antigo.fontes.siconfi.atualizadoEm, hoje) >= DIAS_ENTRE_ATUALIZACOES_PESADAS ||
    !existsSync(arquivo('governadores.json')));

  if (precisaPesada) {
    let eleitos = null;
    try {
      log('TSE: baixando a lista oficial de eleitos...');
      const anos = anosVigentes(hoje);
      eleitos = await gerarEleitos({ baixarZip, anos, hoje });
      for (const w of eleitos.avisos) log('TSE aviso: ' + w);
      for (const uf of UFS) {
        if (eleitos.vereadores[uf]) gravarJson(arquivo(`vereadores-${uf}.json`), { uf, ano: anos.municipal, itens: eleitos.vereadores[uf] });
        if (eleitos.estaduais[uf]) gravarJson(arquivo(`estaduais-${uf}.json`), { uf, ano: anos.estaduais, itens: eleitos.estaduais[uf] });
      }
      const contar = (o) => Object.values(o).reduce((a, l) => a + l.length, 0);
      meta.fontes.tse = { ok: true, atualizadoEm: hoje.toISOString(), eleicoes: anos, avisos: eleitos.avisos.length };
      meta.cargos.vereadores = { total: contar(eleitos.vereadores) };
      meta.cargos.estaduais = { total: contar(eleitos.estaduais) };
      log(`TSE: ${contar(eleitos.prefeitos)} prefeitos, ${contar(eleitos.vereadores)} vereadores, ${contar(eleitos.estaduais)} deputados estaduais, ${eleitos.governadores.length} governadores.`);
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
        for (const uf of UFS) {
          for (const p of eleitos.prefeitos[uf] || []) {
            p._ente = acharMunicipio(indice, uf, p.municipio);
            if (p._ente) alvos.set(p._ente.cod_ibge, p._ente);
          }
        }
        for (const g of eleitos.governadores) {
          g._ente = indice.estados.get(g.uf) || null;
          if (g._ente) alvos.set(g._ente.cod_ibge, g._ente);
        }
        log(`Tesouro: consultando as contas de ${alvos.size} prefeituras e estados (${exercicio}). Isto leva alguns minutos...`);
        contas = await gerarContas({ json: fontes.json, entes: [...alvos.values()], exercicio, aoAndar: (f, t) => log(`  ${f} de ${t}`) });
        const comErro = Object.values(contas).filter((c) => c.erro).length;
        meta.fontes.siconfi = { ok: true, atualizadoEm: hoje.toISOString(), exercicio, entes: alvos.size, comErro };
        log(`Tesouro: pronto. ${comErro} consultas com erro.`);
      } catch (e) {
        log(`Tesouro: FALHOU. ${e.message}`);
        meta.fontes.siconfi = { ...(antigo.fontes?.siconfi || {}), ok: false, erro: String(e.message).slice(0, 300), tentouEm: hoje.toISOString() };
      }

      // Se o Tesouro falhou e já existe resultado anterior, mantém o anterior (não apaga as notas).
      const manterAnterior = !contas && existsSync(arquivo('ranking-prefeitos.json'));
      if (!manterAnterior) {
        const todosPref = [];
        for (const uf of UFS) {
          for (const p of eleitos.prefeitos[uf] || []) {
            const ente = p._ente;
            delete p._ente;
            if (ente && contas) {
              p.ibge = ente.cod_ibge;
              p.populacao = ente.populacao;
              Object.assign(p, semContasDoMandato(eleitos.anos.municipal + 1, meta.fontes.siconfi.exercicio)
                || notaExecutivo(contas[ente.cod_ibge], 'M', meta.fontes.siconfi.exercicio));
            } else {
              Object.assign(p, { nota: null, comp: [], motivo: contas ? 'Município não encontrado na base do Tesouro Nacional.' : 'As contas ainda não foram consultadas.' });
            }
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
          if (ente && contas) Object.assign(g, semContasDoMandato(eleitos.anos.governadores + 1, exerc) || notaExecutivo(contas[ente.cod_ibge], ente.esfera, exerc), { ibge: ente.cod_ibge, populacao: ente.populacao });
          else Object.assign(g, { nota: null, comp: [], motivo: 'As contas do estado ainda não foram consultadas.' });
        }
        const gComNota = atribuirPosicoes(eleitos.governadores);
        gravarJson(arquivo('governadores.json'), { ano: eleitos.anos.governadores, exercicio: exerc, total: eleitos.governadores.length, comNota: gComNota, itens: eleitos.governadores });
        dest.governadores = destaques(eleitos.governadores, 5);
        meta.cargos.governadores = { total: eleitos.governadores.length, comNota: gComNota, media: media(eleitos.governadores.filter((g) => g.nota != null).map((g) => g.nota)) };
        log(`Prefeitos com nota: ${comNota}. Governadores com nota: ${gComNota}.`);
      }
    }
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
