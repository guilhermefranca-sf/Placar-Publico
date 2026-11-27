// Fotos oficiais de candidatura (TSE, sistema DivulgaCandContas) de governadores e presidente.
// A foto não é copiada para o site: o endereço oficial é apenas ligado ao nome. Se a imagem não carregar,
// o site mostra as iniciais da pessoa (ver roteador.js).
//
//   https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/{código da eleição}/{SQ_CANDIDATO}/{UF ou BR}
//
// O código da eleição é o "id" da lista /eleicao/ordinarias do próprio TSE. Os três abaixo foram conferidos nessa
// lista; a rotina tenta descobrir os novos todo dia e, se a consulta falhar, fica com os conhecidos.

export const BASE_FOTOS = 'https://divulgacandcontas.tse.jus.br/divulga/rest';

const CODIGOS = { 2018: '2022802018', 2022: '2040602022', 2026: '20322002026' };

/** Junta códigos descobertos aos conhecidos (só eleições gerais, "tipoAbrangencia" F). */
export function registrarCodigos(lista) {
  let novos = 0;
  for (const e of lista || []) {
    if (e && e.tipoAbrangencia === 'F' && Number.isFinite(Number(e.ano)) && e.id != null && !CODIGOS[e.ano]) { CODIGOS[e.ano] = String(e.id); novos++; }
  }
  return novos;
}

export const codigoDaEleicao = (ano) => CODIGOS[ano] || null;

/** Tenta ler a lista de eleições do TSE; nunca derruba a rotina. */
export async function descobrirEleicoes(json, log = () => {}) {
  try {
    const lista = await json(`${BASE_FOTOS}/v1/eleicao/ordinarias`);
    const n = registrarCodigos(Array.isArray(lista) ? lista : []);
    if (n) log(`Fotos: ${n} código(s) de eleição novo(s) do TSE.`);
    return { ok: true, novos: n };
  } catch (e) {
    log(`Fotos: não consegui consultar a lista de eleições do TSE (${String(e.message).slice(0, 80)}); sigo com os códigos conhecidos.`);
    return { ok: false };
  }
}

/** Endereço da foto, ou null se faltar algum dado (nunca se inventa endereço). */
export function urlFotoTse(ano, sq, ue) {
  const cod = codigoDaEleicao(Number(ano));
  if (!cod || !sq || !ue) return null;
  if (!/^\d{6,15}$/.test(String(sq)) || !/^[A-Z]{2}$/.test(String(ue))) return null;
  return `${BASE_FOTOS}/arquivo/img/${cod}/${sq}/${ue}`;
}
