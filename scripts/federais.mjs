// Deputados federais: calcula a nota de cada um a partir dos arquivos abertos da Câmara.
// Em vez de milhares de consultas, usa os arquivos do ano que a Câmara atualiza todo dia.

import { lerCsv, criarPercentil, arredondar, dataBR, reais, emLotes } from './util.mjs';
import { METODO, mediaPonderada, atribuirPosicoes, pesoDe } from './nota.mjs';

export const API = 'https://dadosabertos.camara.leg.br/api/v2';
export const ARQUIVOS = 'https://dadosabertos.camara.leg.br/arquivos';
export const SIGLAS_PROJETO = new Set(['PL', 'PLP', 'PEC', 'PDL', 'PRC', 'MPV', 'PLV', 'PLN', 'PFC']);
const MIN_VOTANTES_NOMINAL = 100; // uma votação nominal do Plenário tem centenas de votos

async function listarDeputados(json) {
  const todos = [];
  for (let pagina = 1; pagina < 30; pagina++) {
    const r = await json(`${API}/deputados?itens=100&pagina=${pagina}&ordem=ASC&ordenarPor=nome`);
    const dados = r.dados || [];
    todos.push(...dados);
    if (dados.length < 100) break;
  }
  return todos;
}

const decimal = (s) => {
  const n = parseFloat(String(s || '0').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/**
 * fontes = { json(url), texto(url), cotas(ano) }  (assim dá para testar sem internet)
 */
export async function gerarFederais({ fontes, ano, hoje = new Date() }) {
  const deputados = await listarDeputados(fontes.json);
  if (deputados.length < 100) throw new Error(`A Câmara devolveu só ${deputados.length} deputados; parece falha da API.`);

  // 1. Sessões deliberativas do Plenário já encerradas
  const ev = lerCsv(await fontes.texto(`${ARQUIVOS}/eventos/csv/eventos-${ano}.csv`));
  const sessoes = new Map(); // idEvento -> data (AAAA-MM-DD)
  for (const l of ev.linhas) {
    if (l[ev.ix.descricaoTipo] !== 'Sessão Deliberativa') continue;
    if (!String(l[ev.ix.situacao]).startsWith('Encerrada')) continue;
    if (!/Plen/i.test(l[ev.ix['localCamara.nome']] || '')) continue;
    sessoes.set(l[ev.ix.id], String(l[ev.ix.dataHoraInicio]).slice(0, 10));
  }
  const datasSessoes = [...sessoes.values()].sort();

  // 2. Presença de cada deputado nessas sessões
  const pr = lerCsv(await fontes.texto(`${ARQUIVOS}/eventosPresencaDeputados/csv/eventosPresencaDeputados-${ano}.csv`));
  const presencas = new Map(); // idDeputado -> Set(idEvento)
  for (const l of pr.linhas) {
    const e = l[pr.ix.idEvento];
    if (!sessoes.has(e)) continue;
    const d = l[pr.ix.idDeputado];
    if (!presencas.has(d)) presencas.set(d, new Set());
    presencas.get(d).add(e);
  }

  // 3. Votações nominais do Plenário e voto de cada deputado
  const vt = lerCsv(await fontes.texto(`${ARQUIVOS}/votacoes/csv/votacoes-${ano}.csv`));
  const plenario = new Map(); // idVotacao -> data
  const detalhesVot = new Map(); // idVotacao -> dados oficiais da votação
  const campo = (tab, l, nome) => (nome in tab.ix ? l[tab.ix[nome]] : '');
  for (const l of vt.linhas) {
    if (l[vt.ix.siglaOrgao] !== 'PLEN') continue;
    plenario.set(l[vt.ix.id], String(l[vt.ix.data]).slice(0, 10));
    detalhesVot.set(l[vt.ix.id], {
      id: l[vt.ix.id],
      data: String(l[vt.ix.data]).slice(0, 10),
      hora: String(campo(vt, l, 'dataHoraRegistro') || ''),
      descricao: String(l[vt.ix.descricao] || '').trim(),
      aprovacao: campo(vt, l, 'aprovacao') === '' ? null : Number(campo(vt, l, 'aprovacao')),
      sim: Number(campo(vt, l, 'votosSim')) || 0,
      nao: Number(campo(vt, l, 'votosNao')) || 0,
      outros: Number(campo(vt, l, 'votosOutros')) || 0
    });
  }
  const vv = lerCsv(await fontes.texto(`${ARQUIVOS}/votacoesVotos/csv/votacoesVotos-${ano}.csv`));
  const votantes = new Map(); // idVotacao -> Set(idDeputado)
  const tipoDoVoto = new Map(); // idVotacao -> Map(idDeputado -> texto do voto)
  for (const l of vv.linhas) {
    const v = l[vv.ix.idVotacao];
    if (!plenario.has(v)) continue;
    if (!votantes.has(v)) { votantes.set(v, new Set()); tipoDoVoto.set(v, new Map()); }
    votantes.get(v).add(l[vv.ix.deputado_id]);
    tipoDoVoto.get(v).set(l[vv.ix.deputado_id], l[vv.ix.voto]);
  }
  const nominais = [...votantes.entries()]
    .filter(([, s]) => s.size >= MIN_VOTANTES_NOMINAL)
    .map(([id]) => ({ id, data: plenario.get(id) }));

  // 4. Projetos e propostas de autoria
  const pp = lerCsv(await fontes.texto(`${ARQUIVOS}/proposicoes/csv/proposicoes-${ano}.csv`));
  const dadosProp = new Map(); // idProposicao -> data
  for (const l of pp.linhas) {
    if (!SIGLAS_PROJETO.has(l[pp.ix.siglaTipo])) continue;
    const data = String(l[pp.ix.dataApresentacao]).slice(0, 10);
    if (data.slice(0, 4) !== String(ano)) continue;
    dadosProp.set(l[pp.ix.id], data);
  }
  const au = lerCsv(await fontes.texto(`${ARQUIVOS}/proposicoesAutores/csv/proposicoesAutores-${ano}.csv`));
  const projetos = new Map(); // idDeputado -> lista de datas
  const jaContou = new Set();
  for (const l of au.linhas) {
    const p = l[au.ix.idProposicao];
    const d = l[au.ix.idDeputadoAutor];
    if (!d || !dadosProp.has(p)) continue;
    const chave = p + '|' + d;
    if (jaContou.has(chave)) continue;
    jaContou.add(chave);
    if (!projetos.has(d)) projetos.set(d, []);
    projetos.get(d).push(dadosProp.get(p));
  }

  // 5. Cota parlamentar (valor do documento menos a glosa)
  const ct = lerCsv(await fontes.cotas(ano));
  const gastos = new Map(); // idDeputado -> {total, desde}
  for (const l of ct.linhas) {
    if (String(l[ct.ix.numAno]) !== String(ano)) continue;
    const d = l[ct.ix.ideCadastro];
    if (!d) continue;
    gastos.set(d, (gastos.get(d) || 0) + decimal(l[ct.ix.vlrDocumento]) - decimal(l[ct.ix.vlrGlosa]));
  }

  // 6. Monta cada deputado
  const hojeISO = hoje.toISOString().slice(0, 10);
  const decimoDia = datasSessoes[9] || datasSessoes[datasSessoes.length - 1] || hojeISO;
  const itens = deputados.map((d) => {
    const id = String(d.id);
    const base = { id, nome: d.nome, partido: d.siglaPartido, uf: d.siglaUf, foto: d.urlFoto };
    const meus = presencas.get(id);
    if (!meus || meus.size === 0) {
      return { ...base, nota: null, comp: [], motivo: `Sem presença registrada em sessões deliberativas do Plenário em ${ano}.` };
    }
    const desde = [...meus].map((e) => sessoes.get(e)).sort()[0];
    const sessoesDesde = datasSessoes.filter((x) => x >= desde).length;
    if (sessoesDesde < METODO.federais.minSessoes) {
      return { ...base, nota: null, comp: [], desde, motivo: `Só ${sessoesDesde} sessões deliberativas desde a primeira presença (${dataBR(desde)}); o mínimo é ${METODO.federais.minSessoes}.` };
    }
    const nomVotacoesDesde = nominais.filter((v) => v.data >= desde);
    const votei = nomVotacoesDesde.filter((v) => votantes.get(v.id).has(id)).length;
    const meses = Math.max(1, (new Date(hojeISO) - new Date(desde)) / (30.44 * 86400000));
    const nProj = (projetos.get(id) || []).filter((x) => x >= desde).length;
    const gasto = Math.max(0, gastos.get(id) || 0);
    return {
      ...base,
      desde,
      obs: desde > decimoDia ? `Primeira presença do ano em ${dataBR(desde)}; os números contam a partir daí.` : undefined,
      _pres: meus.size / sessoesDesde,
      _vot: nomVotacoesDesde.length ? votei / nomVotacoesDesde.length : null,
      _projMes: nProj / meses,
      _cotaMes: gasto / meses,
      extra: { sessoes: [meus.size, sessoesDesde], votos: [votei, nomVotacoesDesde.length], projetos: nProj, gasto: Math.round(gasto), meses: arredondar(meses, 1) }
    };
  });

  // 7. Comparações (projetos entre todos; cota entre colegas do mesmo estado)
  const elegiveis = itens.filter((i) => i._pres != null);
  const pctProj = criarPercentil(elegiveis.map((i) => i._projMes));
  const porUf = new Map();
  for (const i of elegiveis) {
    if (!porUf.has(i.uf)) porUf.set(i.uf, []);
    porUf.get(i.uf).push(i._cotaMes);
  }
  const pctCota = new Map([...porUf].map(([uf, v]) => [uf, criarPercentil(v)]));

  for (const i of elegiveis) {
    const pProj = pctProj(i._projMes);
    const pCota = pctCota.get(i.uf)(i._cotaMes);
    const sPres = arredondar(i._pres * 100, 1);
    const sVot = i._vot == null ? null : arredondar(i._vot * 100, 1);
    const sProj = arredondar(pProj * 100, 1);
    const sCota = arredondar((1 - pCota) * 100, 1);
    const e = i.extra;
    i.comp = [
      { k: 'pres', s: sPres, f: `Presente em ${e.sessoes[0]} de ${e.sessoes[1]} sessões deliberativas do Plenário em ${ano} (${Math.round(i._pres * 100)}%).` },
      { k: 'vot', s: sVot, f: e.votos[1] ? `Registrou voto em ${e.votos[0]} de ${e.votos[1]} votações nominais do Plenário em ${ano}.` : 'Ainda não houve votação nominal no período.' },
      { k: 'proj', s: sProj, f: `Apresentou ${e.projetos} projetos e propostas (${arredondar(i._projMes, 1).toLocaleString('pt-BR')} por mês), mais do que ${Math.floor(pProj * 100)}% dos deputados.` },
      { k: 'cota', s: sCota, f: `Gastou ${reais(e.gasto)} da cota (${reais(e.gasto / e.meses)} por mês), menos do que ${Math.floor((1 - pCota) * 100)}% dos colegas de ${i.uf}.` }
    ];
    i.nota = mediaPonderada(i.comp.map((c) => ({ peso: pesoDe('federais', c.k), s: c.s })), 3);
    if (i.nota == null) i.motivo = 'Dados insuficientes para calcular o índice.';
  }
  for (const i of itens) { delete i._pres; delete i._vot; delete i._projMes; delete i._cotaMes; if (i.obs === undefined) delete i.obs; }

  const comNota = atribuirPosicoes(itens);
  const notas = itens.filter((i) => i.nota != null).map((i) => i.nota);
  const votos = montarVotos({ ano, hoje, nominais, detalhesVot, tipoDoVoto, itens });
  return {
    votos,
    ano,
    geradoEm: hoje.toISOString(),
    sessoes: sessoes.size,
    votacoes: nominais.length,
    total: itens.length,
    comNota,
    media: notas.length ? arredondar(notas.reduce((a, b) => a + b, 0) / notas.length, 1) : null,
    itens
  };
}


/* ---------- Como votou? ---------- */

// Código de uma letra para cada tipo de registro. O texto de cada código vai junto no arquivo.
export const CODIGOS_VOTO = {
  S: 'Sim', N: 'Não', A: 'Abstenção', O: 'Obstrução', P: 'Presidindo a sessão (art. 17)',
  X: 'Voto secreto ou sem tipo informado', '-': 'Sem voto registrado', _: 'Antes da primeira presença registrada no ano'
};
const LETRA_DO_VOTO = { 'Sim': 'S', 'Não': 'N', 'Abstenção': 'A', 'Obstrução': 'O', 'Artigo 17': 'P' };

/**
 * Classifica a votação pelo texto oficial dela (não atribui valor político a nenhuma):
 * principal, emenda, substitutivo, destaque, requerimento ou outro.
 */
export function classificarVotacao(descricao, siglaTipo = '') {
  const d = String(descricao || '');
  if (/requerimento/i.test(d) || /^(REQ|RIC|INC|RCP)$/.test(siglaTipo)) return 'requerimento';
  if (/destaque/i.test(d)) return 'destaque';
  if (/substitutivo/i.test(d)) return 'substitutivo';
  if (/emenda/i.test(d) && !/proposta de emenda (à|a) constitui/i.test(d)) return 'emenda';
  if (/medida provisória|projeto de lei|proposta de emenda (à|a) constitui|projeto de decreto|projeto de resolução|\bPL\b|\bPEC\b/i.test(d) || SIGLAS_PROJETO.has(siglaTipo)) return 'principal';
  return 'outro';
}

/** Monta o arquivo votos.json (sem os resumos, que vêm da API na etapa seguinte). */
export function montarVotos({ ano, hoje, nominais, detalhesVot, tipoDoVoto, itens }) {
  const ordenadas = nominais.map((n) => detalhesVot.get(n.id)).filter(Boolean)
    .sort((a, b) => (a.hora < b.hora ? 1 : a.hora > b.hora ? -1 : a.id < b.id ? 1 : -1));
  const votacoes = ordenadas.map((v) => ({
    id: v.id, data: v.data, titulo: v.descricao || 'Votação nominal do Plenário', tipo: classificarVotacao(v.descricao),
    aprovacao: v.aprovacao, sim: v.sim, nao: v.nao, outros: v.outros,
    fonte: `${API}/votacoes/${v.id}`
  }));
  const deputados = {};
  for (const i of itens) {
    let linha = '';
    for (const v of ordenadas) {
      const reg = tipoDoVoto.get(v.id);
      if (reg && reg.has(i.id)) {
        const t = reg.get(i.id);
        linha += t ? (LETRA_DO_VOTO[t] || 'X') : 'X';
      } else linha += i.desde && v.data < i.desde ? '_' : '-';
    }
    deputados[i.id] = linha;
  }
  return { ano, geradoEm: hoje.toISOString(), codigos: CODIGOS_VOTO, votacoes, deputados };
}

/** Busca na API a matéria (sigla, número, ementa) de cada votação. Se falhar, a votação segue só com o texto oficial. */
export async function enriquecerVotos(json, votos, paralelo = 6) {
  let falhas = 0;
  await emLotes(votos.votacoes, paralelo, async (v) => {
    try {
      const det = (await json(`${API}/votacoes/${encodeURIComponent(v.id)}`)).dados || {};
      const p = (det.proposicoesAfetadas || [])[0];
      if (p) {
        v.materia = `${p.siglaTipo} ${p.numero}${p.ano ? '/' + p.ano : ''}`;
        if (p.ementa) v.resumo = String(p.ementa).trim();
        v.portal = `https://www.camara.leg.br/propostas-legislativas/${p.id}`;
        const t = classificarVotacao(v.titulo, p.siglaTipo);
        v.tipo = t;
      }
    } catch (e) { falhas++; }
  });
  return falhas;
}
