// Lista oficial de eleitos, a partir dos arquivos abertos do TSE (Tribunal Superior Eleitoral).
//   Eleições municipais (2024): prefeitos. (Vereadores foram retirados do aplicativo.)
//   Eleições gerais (2022): governadores e deputados estaduais/distritais.
// Atenção: o TSE informa quem foi ELEITO, não quem está no cargo hoje. Substituições
// (renúncia, cassação, suplente que assumiu) não aparecem. O site avisa isso.

import { lerCsv, lerDoZip, nomeProprio } from './util.mjs';

export const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export const URL_ZIP = (ano) => `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${ano}.zip`;

const CARGOS = {
  PREFEITO: 'prefeitos',
  GOVERNADOR: 'governadores',
  'DEPUTADO ESTADUAL': 'estaduais',
  'DEPUTADO DISTRITAL': 'estaduais'
};

const SITUACAO = {
  ELEITO: 'Eleito',
  'ELEITO POR QP': 'Eleito por quociente partidário',
  'ELEITO POR MÉDIA': 'Eleito por média'
};

function idade(nascimento, hoje) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(nascimento || '');
  if (!m) return null;
  let anos = hoje.getFullYear() - Number(m[3]);
  if (hoje.getMonth() + 1 < Number(m[2]) || (hoje.getMonth() + 1 === Number(m[2]) && hoje.getDate() < Number(m[1]))) anos--;
  return anos > 15 && anos < 110 ? anos : null;
}

/** Lê o CSV de uma UF e devolve só os eleitos, separados por cargo. */
export function lerEleitos(textoCsv, hoje = new Date()) {
  const { ix, linhas } = lerCsv(textoCsv);
  const necessarias = ['DS_CARGO', 'DS_SIT_TOT_TURNO', 'SQ_CANDIDATO', 'NM_CANDIDATO', 'SG_PARTIDO', 'SG_UF'];
  for (const c of necessarias) if (!(c in ix)) throw new Error(`Coluna ${c} não existe no arquivo do TSE; o formato mudou.`);
  const saida = { prefeitos: [], governadores: [], estaduais: [] };
  const vistos = new Set();
  for (const l of linhas) {
    const grupo = CARGOS[l[ix.DS_CARGO]];
    if (!grupo) continue;
    const sit = l[ix.DS_SIT_TOT_TURNO];
    if (!(sit in SITUACAO)) continue; // fica só quem foi eleito (ignora suplente, não eleito e 2º turno)
    const id = l[ix.SQ_CANDIDATO];
    if (vistos.has(id)) continue;
    vistos.add(id);
    const r = {
      id,
      nome: nomeProprio(l[ix.NM_CANDIDATO]),
      urna: nomeProprio(l[ix.NM_URNA_CANDIDATO]),
      partido: l[ix.SG_PARTIDO],
      uf: l[ix.SG_UF],
      situacao: SITUACAO[sit],
      idade: idade(l[ix.DT_NASCIMENTO], hoje),
      instrucao: nomeProprio(l[ix.DS_GRAU_INSTRUCAO]),
      ocupacao: nomeProprio(l[ix.DS_OCUPACAO])
    };
    if (grupo === 'prefeitos') {
      r.municipio = nomeProprio(l[ix.NM_UE]);
      r.cod = l[ix.SG_UE];
    }
    saida[grupo].push(r);
  }
  for (const g of Object.keys(saida)) saida[g].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return saida;
}

/**
 * Quais eleições valem hoje. Eleições municipais: anos múltiplos de 4 (2024, 2028...), posse em 1º de janeiro do ano seguinte.
 * Eleições gerais: 2022, 2026...  Governadores tomam posse em 1º de janeiro; deputados estaduais, em 1º de fevereiro.
 */
export function anosVigentes(hoje) {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth(); // 0 = janeiro
  const ultimo = (resto, passo, ok) => { for (let e = ano; e > ano - 8; e--) if (e % passo === resto && ok(e)) return e; };
  return {
    municipal: ultimo(0, 4, (e) => e + 1 <= ano),
    governadores: ultimo(2, 4, (e) => e + 1 <= ano),
    estaduais: ultimo(2, 4, (e) => e + 1 < ano || (e + 1 === ano && mes >= 1))
  };
}

/**
 * baixarZip(url) devolve o caminho local do .zip (assim dá para testar sem internet).
 * anos = { municipal, governadores, estaduais }  (veja anosVigentes)
 * Devolve { prefeitos:{UF:[]}, estaduais:{UF:[]}, governadores:[], avisos:[] }
 */
export async function gerarEleitos({ baixarZip, anos, hoje = new Date(), incluir = { prefeitos: true, estaduais: true } }) {
  const resultado = { prefeitos: {}, estaduais: {}, governadores: [], avisos: [], anos };

  // incluir.prefeitos / incluir.estaduais = false: não baixa nem lê o que o Placar não mostra mais (versão 8).
  const zipMunicipal = incluir.prefeitos === false ? null : await baixarZip(URL_ZIP(anos.municipal));
  for (const uf of zipMunicipal ? UFS : []) {
    try {
      const e = lerEleitos(lerDoZip(zipMunicipal, `consulta_cand_${anos.municipal}_${uf}.csv`, 'windows-1252'), hoje);
      resultado.prefeitos[uf] = e.prefeitos;
    } catch (erro) {
      if (uf !== 'DF') resultado.avisos.push(`Municipais ${anos.municipal} ${uf}: ${erro.message}`); // o DF não tem eleição municipal
    }
  }

  const lerGerais = async (ano, guardar) => {
    const zip = await baixarZip(URL_ZIP(ano));
    for (const uf of UFS) {
      try {
        guardar(uf, lerEleitos(lerDoZip(zip, `consulta_cand_${ano}_${uf}.csv`, 'windows-1252'), hoje));
      } catch (erro) {
        resultado.avisos.push(`Gerais ${ano} ${uf}: ${erro.message}`);
      }
    }
  };
  const guardarGov = (uf, e) => resultado.governadores.push(...e.governadores);
  const guardarEst = (uf, e) => { resultado.estaduais[uf] = e.estaduais; };
  const comEstaduais = incluir.estaduais !== false;
  if (anos.governadores === anos.estaduais || !comEstaduais) {
    await lerGerais(anos.governadores, (uf, e) => { guardarGov(uf, e); if (comEstaduais) guardarEst(uf, e); });
  } else {
    await lerGerais(anos.governadores, guardarGov);
    await lerGerais(anos.estaduais, guardarEst);
  }
  return resultado;
}
