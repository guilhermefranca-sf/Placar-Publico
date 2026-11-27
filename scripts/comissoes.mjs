// Presença em comissões permanentes da Câmara (critério "Presença em comissões" do índice dos deputados federais).
//
// Regra (baseada no diagnóstico real de 26/11/2026):
//   - só comissões do tipo exato "Comissão Permanente" (API /orgaos, campo tipoOrgao);
//   - só reuniões do tipo "Reunião Deliberativa" já encerradas (fora audiências públicas e reuniões não deliberativas);
//   - só conta o deputado que era membro TITULAR da comissão na data da reunião (arquivo orgaosDeputados, com datas de início e fim);
//   - presença = linha do deputado no arquivo eventosPresencaDeputados daquele evento;
//   - reunião em que o deputado estava licenciado ou afastado e não compareceu não conta contra ele;
//   - menos de 10 reuniões esperadas: o critério fica sem dado ("Dado não encontrado ou não confirmado"), nunca zero.
//
// Limite conhecido: a Câmara não publica quem substituiu o titular numa reunião. O suplente que substituiu não aparece
// como presente e a falta do titular substituído pode contar contra ele. A Metodologia e o perfil dizem isso.

import { percorrerCsv } from './util.mjs';

export const API = 'https://dadosabertos.camara.leg.br/api/v2';
export const ARQUIVOS = 'https://dadosabertos.camara.leg.br/arquivos';
export const TIPO_PERMANENTE = 'Comissão Permanente';
export const TIPO_EVENTO = 'Reunião Deliberativa';

/** Códigos dos órgãos que são "Comissão Permanente" (a API /orgaos tem uns 1.500 órgãos, em páginas de 100). */
export async function listarPermanentes(json) {
  const ids = new Set();
  let total = 0;
  for (let pagina = 1; pagina < 40; pagina++) {
    const r = await json(`${API}/orgaos?itens=100&pagina=${pagina}`);
    const dados = r.dados || [];
    total += dados.length;
    for (const o of dados) if (String(o.tipoOrgao || '').trim() === TIPO_PERMANENTE) ids.add(String(o.id));
    if (dados.length < 100) break;
  }
  if (!ids.size) throw new Error(`A API de órgãos devolveu ${total} órgãos, mas nenhum "${TIPO_PERMANENTE}"; o formato pode ter mudado.`);
  return ids;
}

/** O código está no fim do endereço (".../deputados/204379") ou já vem como número. */
export const idDoEndereco = (v) => {
  const m = /(\d+)\s*$/.exec(String(v || ''));
  return m ? m[1] : '';
};

const dia = (s) => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(s || '').trim());
  return m ? m[1] : null;
};

/**
 * Lê as reuniões deliberativas das comissões permanentes de UM ano e a presença de cada deputado nelas.
 * Chamada de dentro de lerAnoCamara, que já percorre os arquivos de eventos; por isso as três funções abaixo são
 * pequenas e separadas: uma para cada arquivo.
 */
export function criarColetorDeEventos() {
  const reunioes = new Map(); // idEvento -> data
  return {
    reunioes,
    /** chame para cada linha de eventos-ANO.csv */
    aoLerEvento(l, ix) {
      if (String(l[ix.descricaoTipo]).trim() !== TIPO_EVENTO) return;
      if (!String(l[ix.situacao]).startsWith('Encerrada')) return;
      const data = dia(l[ix.dataHoraInicio]);
      if (data) reunioes.set(l[ix.id], data);
    }
  };
}

/** eventosOrgaos-ANO.csv: liga cada reunião aos órgãos. Devolve a lista ordenada de reuniões de comissões permanentes. */
export function ligarReunioesAosOrgaos(texto, coletor, permanentes) {
  const orgaosDe = new Map(); // idEvento -> Set(idOrgao permanente)
  percorrerCsv(texto, (l, ix) => {
    const ev = l[ix.idEvento];
    if (!coletor.reunioes.has(ev)) return;
    const org = ix.idOrgao !== undefined ? String(l[ix.idOrgao] || '') : idDoEndereco(l[ix.uriOrgao]);
    if (!org || !permanentes.has(org)) return;
    if (!orgaosDe.has(ev)) orgaosDe.set(ev, new Set());
    orgaosDe.get(ev).add(org);
  });
  const lista = [...orgaosDe.entries()]
    .map(([id, set]) => ({ id, data: coletor.reunioes.get(id), orgaos: [...set].sort() }))
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : Number(a.id) - Number(b.id)));
  return { lista, posicao: new Map(lista.map((r, k) => [r.id, k])) };
}

/** Membros de comissões (orgaosDeputados-L57.csv): só titulares, com as datas de cada período. */
export function lerMembros(texto) {
  const porDep = new Map(); // idDeputado -> [{ org, ini, fim }]
  let linhas = 0;
  let titulares = 0;
  const { ix } = percorrerCsv(texto, (l, ix) => {
    linhas++;
    const dep = idDoEndereco(l[ix.uriDeputado] ?? l[ix.idDeputado]);
    const org = idDoEndereco(l[ix.uriOrgao] ?? l[ix.idOrgao]);
    if (!dep || !org) return;
    if (/suplente/i.test(String(l[ix.cargo] || ''))) return;
    const ini = dia(l[ix.dataInicio]);
    if (!ini) return;
    titulares++;
    if (!porDep.has(dep)) porDep.set(dep, []);
    porDep.get(dep).push({ org, ini, fim: dia(l[ix.dataFim]) });
  });
  const faltam = ['cargo', 'dataInicio', 'dataFim'].filter((c) => !(c in ix));
  if (faltam.length || !('uriDeputado' in ix || 'idDeputado' in ix) || !('uriOrgao' in ix || 'idOrgao' in ix)) {
    throw new Error(`O arquivo de membros de órgãos mudou de formato (colunas que faltam: ${faltam.join(', ') || 'deputado ou órgão'}).`);
  }
  return { porDep, linhas, titulares };
}

/** Legislaturas que tocam os anos da janela (a 57ª vai de 2023 a 2027; 58ª, de 2027 a 2031). */
export function legislaturasDaJanela(anoIni, anoFim) {
  const de = (a) => 57 + Math.floor((a - 2023) / 4);
  const r = [];
  for (let l = de(anoIni); l <= de(anoFim); l++) r.push(l);
  return r;
}

export async function carregarMembros(fontes, anoIni, anoFim) {
  const porDep = new Map();
  const lidas = [];
  const legs = legislaturasDaJanela(anoIni, anoFim);
  for (const [i, leg] of legs.entries()) {
    try {
      const texto = await fontes.texto(`${ARQUIVOS}/orgaosDeputados/csv/orgaosDeputados-L${leg}.csv`);
      const m = lerMembros(texto);
      for (const [d, l] of m.porDep) porDep.set(d, [...(porDep.get(d) || []), ...l]);
      lidas.push(leg);
    } catch (e) {
      // A primeira legislatura da janela tem de existir. Uma legislatura que ainda não começou pode não ter arquivo.
      if (i === 0) throw e;
    }
  }
  return { porDep, legislaturas: lidas };
}

/**
 * Conta as reuniões esperadas e as presenças de UM deputado.
 *   reunioes = [[data, [idOrgao]]] na ordem de todos os anos da janela
 *   marcas   = string de 0 e 1 (1 = há presença registrada na reunião de mesma posição)
 *   periodos = [{ org, ini, fim }] como titular
 *   desde    = data da primeira presença no Plenário (antes disso, nada conta)
 *   emPausa  = (data) => está licenciado ou afastado?
 */
export function contarComissoes({ reunioes, marcas, periodos, desde, emPausa }) {
  let esperadas = 0, presentes = 0, licenca = 0;
  for (let k = 0; k < reunioes.length; k++) {
    const [data, orgaos] = reunioes[k];
    if (data < desde) continue;
    const titular = periodos.some((p) => orgaos.includes(p.org) && p.ini <= data && (p.fim === null || data <= p.fim));
    if (!titular) continue;
    if (marcas[k] === '1') { esperadas++; presentes++; } else if (emPausa(data)) licenca++; else esperadas++;
  }
  return { esperadas, presentes, licenca };
}
