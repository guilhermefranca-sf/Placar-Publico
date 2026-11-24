// Deputados federais: calcula o índice de cada um a partir dos arquivos abertos da Câmara.
// Em vez de milhares de consultas, usa os arquivos por ano que a Câmara atualiza todo dia.
//
// O índice olha os últimos 4 anos civis (hoje, 2023 a 2026; o ano em curso conta até a data da atualização).
// Os anos já fechados são guardados em arquivos próprios (dados/anos/federais-AAAA.json) e não precisam ser
// baixados de novo todo dia. Só o ano em curso é lido da Câmara em cada atualização.

import { percorrerCsv, criarPercentil, arredondar, dataBR, reais, emLotes } from './util.mjs';
import { METODO, mediaPonderada, atribuirPosicoes, pesoDe } from './nota.mjs';

export const API = 'https://dadosabertos.camara.leg.br/api/v2';
export const ARQUIVOS = 'https://dadosabertos.camara.leg.br/arquivos';
export const SIGLAS_PROJETO = new Set(['PL', 'PLP', 'PEC', 'PDL', 'PRC', 'MPV', 'PLV', 'PLN', 'PFC']);
export const JANELA_ANOS = METODO.federais.janelaAnos;
const MIN_VOTANTES_NOMINAL = 100; // uma votação nominal do Plenário tem centenas de votos
const VERSAO_ANO = 1;             // muda quando o formato do arquivo de cada ano muda
const DIA = 86400000;

export async function listarDeputados(json) {
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

/** Os anos civis avaliados: o ano em curso e os 3 anteriores. */
export const anosDaJanela = (ano, janela = JANELA_ANOS) => Array.from({ length: janela }, (_, k) => ano - janela + 1 + k);

/** Um arquivo de ano fechado só vale se foi gerado depois que o ano terminou e no formato de hoje. */
const anoFechadoValido = (ag, a) => ag && ag.versao === VERSAO_ANO && ag.ano === a && String(ag.geradoEm || '').slice(0, 4) > String(a);

/**
 * Lê da Câmara os arquivos de UM ano e resume o que importa, de forma compacta:
 *   sessoes   datas das sessões deliberativas encerradas do Plenário (em ordem)
 *   presencas { idDeputado: "0101..." }  1 = presente na sessão de mesma posição
 *   nominais  datas das votações nominais do Plenário (em ordem)
 *   votou     { idDeputado: "0101..." }  1 = registrou voto
 *   projetos  { idDeputado: [datas] }    projetos e propostas de autoria (não conta requerimento, indicação, emenda)
 *   gasto     { idDeputado: reais }      cota parlamentar (valor do documento menos glosa)
 * `completo` guarda também o que o "Como votou?" precisa (ids, placar, voto de cada um). Só vale para o ano em curso.
 */
export async function lerAnoCamara({ fontes, ano, hoje = new Date(), completo = false }) {
  // 1. Sessões deliberativas do Plenário já encerradas
  const sessoes = new Map(); // idEvento -> data (AAAA-MM-DD)
  {
    const texto = await fontes.texto(`${ARQUIVOS}/eventos/csv/eventos-${ano}.csv`);
    percorrerCsv(texto, (l, ix) => {
      if (l[ix.descricaoTipo] !== 'Sessão Deliberativa') return;
      if (!String(l[ix.situacao]).startsWith('Encerrada')) return;
      if (!/Plen/i.test(l[ix['localCamara.nome']] || '')) return;
      sessoes.set(l[ix.id], String(l[ix.dataHoraInicio]).slice(0, 10));
    });
  }
  const ordemSessoes = [...sessoes.entries()].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] < b[0] ? -1 : 1));
  const posSessao = new Map(ordemSessoes.map(([id], k) => [id, k]));

  // 2. Presença de cada deputado nessas sessões
  const presencas = new Map(); // idDeputado -> Set(posição)
  {
    const texto = await fontes.texto(`${ARQUIVOS}/eventosPresencaDeputados/csv/eventosPresencaDeputados-${ano}.csv`);
    percorrerCsv(texto, (l, ix) => {
      const k = posSessao.get(l[ix.idEvento]);
      if (k === undefined) return;
      const d = l[ix.idDeputado];
      if (!presencas.has(d)) presencas.set(d, new Set());
      presencas.get(d).add(k);
    });
  }

  // 3. Votações nominais do Plenário e voto de cada deputado
  const plenario = new Map(); // idVotacao -> data
  const detalhesVot = new Map(); // idVotacao -> dados oficiais da votação
  {
    const texto = await fontes.texto(`${ARQUIVOS}/votacoes/csv/votacoes-${ano}.csv`);
    percorrerCsv(texto, (l, ix) => {
      if (l[ix.siglaOrgao] !== 'PLEN') return;
      const campo = (nome) => (nome in ix ? l[ix[nome]] : '');
      plenario.set(l[ix.id], String(l[ix.data]).slice(0, 10));
      if (completo) {
        detalhesVot.set(l[ix.id], {
          id: l[ix.id],
          data: String(l[ix.data]).slice(0, 10),
          hora: String(campo('dataHoraRegistro') || ''),
          descricao: String(l[ix.descricao] || '').trim(),
          aprovacao: campo('aprovacao') === '' ? null : Number(campo('aprovacao')),
          sim: Number(campo('votosSim')) || 0,
          nao: Number(campo('votosNao')) || 0,
          outros: Number(campo('votosOutros')) || 0
        });
      }
    });
  }
  const votantes = new Map(); // idVotacao -> Set(idDeputado)
  const tipoDoVoto = new Map(); // idVotacao -> Map(idDeputado -> texto do voto)  (só no ano em curso)
  {
    const texto = await fontes.texto(`${ARQUIVOS}/votacoesVotos/csv/votacoesVotos-${ano}.csv`);
    percorrerCsv(texto, (l, ix) => {
      const v = l[ix.idVotacao];
      if (!plenario.has(v)) return;
      if (!votantes.has(v)) { votantes.set(v, new Set()); if (completo) tipoDoVoto.set(v, new Map()); }
      votantes.get(v).add(l[ix.deputado_id]);
      if (completo) tipoDoVoto.get(v).set(l[ix.deputado_id], l[ix.voto]);
    });
  }
  const nominais = [...votantes.entries()]
    .filter(([, s]) => s.size >= MIN_VOTANTES_NOMINAL)
    .map(([id]) => ({ id, data: plenario.get(id) }))
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id < b.id ? -1 : 1));

  // 4. Projetos e propostas de autoria
  const dadosProp = new Map(); // idProposicao -> data
  {
    const texto = await fontes.texto(`${ARQUIVOS}/proposicoes/csv/proposicoes-${ano}.csv`);
    percorrerCsv(texto, (l, ix) => {
      if (!SIGLAS_PROJETO.has(l[ix.siglaTipo])) return;
      const data = String(l[ix.dataApresentacao]).slice(0, 10);
      if (data.slice(0, 4) !== String(ano)) return;
      dadosProp.set(l[ix.id], data);
    });
  }
  const projetos = new Map(); // idDeputado -> lista de datas
  {
    const jaContou = new Set();
    const texto = await fontes.texto(`${ARQUIVOS}/proposicoesAutores/csv/proposicoesAutores-${ano}.csv`);
    percorrerCsv(texto, (l, ix) => {
      const p = l[ix.idProposicao];
      const d = l[ix.idDeputadoAutor];
      if (!d || !dadosProp.has(p)) return;
      const chave = p + '|' + d;
      if (jaContou.has(chave)) return;
      jaContou.add(chave);
      if (!projetos.has(d)) projetos.set(d, []);
      projetos.get(d).push(dadosProp.get(p));
    });
  }

  // 5. Cota parlamentar (valor do documento menos a glosa)
  const gastos = new Map(); // idDeputado -> total
  {
    const texto = await fontes.cotas(ano);
    percorrerCsv(texto, (l, ix) => {
      if (String(l[ix.numAno]) !== String(ano)) return;
      const d = l[ix.ideCadastro];
      if (!d) return;
      gastos.set(d, (gastos.get(d) || 0) + decimal(l[ix.vlrDocumento]) - decimal(l[ix.vlrGlosa]));
    });
  }

  const bits = (conjunto, n) => {
    const v = new Array(n).fill('0');
    for (const k of conjunto) v[k] = '1';
    return v.join('');
  };
  const posNominal = new Map(nominais.map((n, k) => [n.id, k]));
  const presencasBits = {};
  for (const [d, set] of presencas) presencasBits[d] = bits(set, ordemSessoes.length);
  const votouBits = {};
  {
    const porDep = new Map();
    for (const [v, set] of votantes) {
      const k = posNominal.get(v);
      if (k === undefined) continue;
      for (const d of set) { if (!porDep.has(d)) porDep.set(d, new Set()); porDep.get(d).add(k); }
    }
    for (const [d, set] of porDep) votouBits[d] = bits(set, nominais.length);
  }
  const agregado = {
    versao: VERSAO_ANO, ano, geradoEm: hoje.toISOString(),
    sessoes: ordemSessoes.map(([, data]) => data),
    presencas: presencasBits,
    nominais: nominais.map((n) => n.data),
    votou: votouBits,
    projetos: Object.fromEntries(projetos),
    gasto: Object.fromEntries([...gastos].map(([d, v]) => [d, Math.round(v * 100) / 100]))
  };
  return { agregado, extras: completo ? { nominais, detalhesVot, tipoDoVoto } : null };
}

/** Quantos dias do intervalo [de, ate] caem dentro de alguma pausa (licença ou afastamento). */
function diasEmPausas(pausas, de, ate) {
  let dias = 0;
  for (const p of pausas) {
    const ini = p.ini > de ? p.ini : de;
    const fim = (p.fim && p.fim < ate ? p.fim : ate);
    if (fim > ini) dias += Math.round((new Date(fim) - new Date(ini)) / DIA);
  }
  return dias;
}

/**
 * fontes = { json(url), texto(url), cotas(ano) }  (assim dá para testar sem internet)
 * ano    = último ano da janela (o ano em curso). janela = quantos anos civis avaliar (4).
 * cache  = { ler(ano), gravar(ano, objeto) }  guarda o resumo dos anos fechados. usarCache=false refaz todos.
 * pausasDe(id) = [{ ini, fim }] licenças e afastamentos registrados no histórico da Câmara. Esses períodos
 *                não contam contra o deputado (nem sessões, nem votações, nem meses de gasto).
 */
export async function gerarFederais({ fontes, ano, janela = JANELA_ANOS, hoje = new Date(), cache = null, usarCache = true, pausasDe = () => [], aoAndar = () => {} }) {
  const deputados = await listarDeputados(fontes.json);
  if (deputados.length < 100) throw new Error(`A Câmara devolveu só ${deputados.length} deputados; parece falha da API.`);

  // Um resumo por ano. Os fechados vêm do arquivo guardado; o ano em curso é sempre lido de novo.
  const anos = anosDaJanela(ano, janela);
  const porAno = [];
  let atual = null;
  for (const a of anos) {
    let ag = a < ano && usarCache && cache ? cache.ler(a) : null;
    if (!anoFechadoValido(ag, a)) ag = null;
    if (ag) aoAndar(`${a}: usando o resumo guardado`);
    else {
      aoAndar(`${a}: lendo os arquivos da Câmara`);
      const r = await lerAnoCamara({ fontes, ano: a, hoje, completo: a === ano });
      ag = r.agregado;
      if (a === ano) atual = r.extras;
      if (a < ano && cache) cache.gravar(a, ag);
    }
    porAno.push(ag);
  }
  const sessoes = porAno.flatMap((a) => a.sessoes);          // datas, em ordem
  const nomDatas = porAno.flatMap((a) => a.nominais);        // datas, em ordem
  // Marca de presença e de voto de um deputado ao longo de toda a janela (uma string de 0 e 1 por ano, juntadas).
  const marcas = (id, campo, tamanho) => porAno.map((a) => (a[campo][id] || '0'.repeat(tamanho(a)))).join('');
  const presencaDe = (id) => marcas(id, 'presencas', (a) => a.sessoes.length);
  const votoDe = (id) => marcas(id, 'votou', (a) => a.nominais.length);

  const hojeISO = hoje.toISOString().slice(0, 10);
  const decimoDia = sessoes[9] || sessoes[sessoes.length - 1] || hojeISO;

  // 6. Monta cada deputado
  const itens = deputados.map((d) => {
    const id = String(d.id);
    const base = { id, nome: d.nome, partido: d.siglaPartido, uf: d.siglaUf, foto: d.urlFoto };
    const pres = presencaDe(id);
    const primeira = pres.indexOf('1');
    if (primeira < 0) {
      return { ...base, nota: null, comp: [], motivo: `Sem presença registrada em sessões deliberativas do Plenário nos últimos ${janela} anos (${anos[0]} a ${anos[anos.length - 1]}).` };
    }
    const desde = sessoes[primeira];
    const pausas = (pausasDe(id) || []).filter((p) => p && p.ini).map((p) => ({ ini: String(p.ini).slice(0, 10), fim: p.fim ? String(p.fim).slice(0, 10) : null }));
    const emPausa = (data) => pausas.some((p) => data >= p.ini && (p.fim === null || data < p.fim));
    // Sessões e votações em que estava licenciado e não compareceu não contam contra ele.
    let sessoesDesde = 0, presentes = 0, descSessoes = 0;
    for (let k = primeira; k < sessoes.length; k++) {
      if (pres[k] === '1') { presentes++; sessoesDesde++; } else if (emPausa(sessoes[k])) descSessoes++; else sessoesDesde++;
    }
    if (sessoesDesde < METODO.federais.minSessoes) {
      return { ...base, nota: null, comp: [], desde, motivo: `Só ${sessoesDesde} sessões deliberativas desde a primeira presença (${dataBR(desde)}); o mínimo é ${METODO.federais.minSessoes}.` };
    }
    const vot = votoDe(id);
    let votacoesDesde = 0, votei = 0, descVotos = 0;
    for (let k = 0; k < nomDatas.length; k++) {
      if (nomDatas[k] < desde) continue;
      if (vot[k] === '1') { votei++; votacoesDesde++; } else if (emPausa(nomDatas[k])) descVotos++; else votacoesDesde++;
    }
    const diasPausa = diasEmPausas(pausas, desde, hojeISO);
    const meses = Math.max(1, ((new Date(hojeISO) - new Date(desde)) / DIA - diasPausa) / 30.44);
    const nProj = porAno.reduce((n, a) => n + (a.projetos[id] || []).filter((x) => x >= desde).length, 0);
    const gasto = Math.max(0, porAno.reduce((n, a) => n + (a.gasto[id] || 0), 0));
    return {
      ...base,
      desde,
      obs: desde > decimoDia ? `Primeira presença registrada em ${dataBR(desde)}; os números contam a partir daí.` : undefined,
      _pres: presentes / sessoesDesde,
      _vot: votacoesDesde ? votei / votacoesDesde : null,
      _projMes: nProj / meses,
      _cotaMes: gasto / meses,
      extra: {
        sessoes: [presentes, sessoesDesde], votos: [votei, votacoesDesde], projetos: nProj, gasto: Math.round(gasto), meses: arredondar(meses, 1),
        ...(descSessoes || descVotos || diasPausa ? { licenca: { sessoes: descSessoes, votacoes: descVotos, dias: diasPausa } } : {})
      }
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
    const desde = dataBR(i.desde);
    const lic = e.licenca;
    const notaLic = (n, o) => (n ? ` Não conta ${n} ${n === 1 ? o[0] : o[1]} em que estava licenciado(a) ou afastado(a), segundo o histórico da Câmara.` : '');
    i.comp = [
      { k: 'pres', s: sPres, f: `Presente em ${e.sessoes[0]} de ${e.sessoes[1]} sessões deliberativas do Plenário desde ${desde} (${Math.round(i._pres * 100)}%).${notaLic(lic && lic.sessoes, ['sessão', 'sessões'])}` },
      { k: 'vot', s: sVot, f: e.votos[1] ? `Registrou voto em ${e.votos[0]} de ${e.votos[1]} votações nominais do Plenário desde ${desde}.${notaLic(lic && lic.votacoes, ['votação', 'votações'])}` : 'Ainda não houve votação nominal no período.' },
      { k: 'proj', s: sProj, f: `Apresentou ${e.projetos} projetos e propostas desde ${desde} (${arredondar(i._projMes, 1).toLocaleString('pt-BR')} por mês de exercício), mais do que ${Math.floor(pProj * 100)}% dos deputados.` },
      { k: 'cota', s: sCota, f: `Gastou ${reais(e.gasto)} da cota desde ${desde} (${reais(e.gasto / e.meses)} por mês de exercício), menos do que ${Math.floor((1 - pCota) * 100)}% dos colegas de ${i.uf}.` }
    ];
    i.nota = mediaPonderada(i.comp.map((c) => ({ peso: pesoDe('federais', c.k), s: c.s })), 3);
    if (i.nota == null) i.motivo = 'Dados insuficientes para calcular o índice.';
  }
  for (const i of itens) { delete i._pres; delete i._vot; delete i._projMes; delete i._cotaMes; if (i.obs === undefined) delete i.obs; }

  const comNota = atribuirPosicoes(itens);
  const notas = itens.filter((i) => i.nota != null).map((i) => i.nota);
  const votos = montarVotos({ ano, hoje, nominais: atual.nominais, detalhesVot: atual.detalhesVot, tipoDoVoto: atual.tipoDoVoto, itens });
  const ultimo = porAno[porAno.length - 1];
  return {
    votos,
    ano,
    janela: { anos: janela, de: anos[0], ate: anos[anos.length - 1] },
    geradoEm: hoje.toISOString(),
    sessoes: sessoes.length,
    votacoes: nomDatas.length,
    sessoesAno: ultimo.sessoes.length,
    votacoesAno: ultimo.nominais.length,
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
  X: 'Voto secreto ou sem tipo informado', '-': 'Sem voto registrado', _: 'Antes da primeira presença registrada no período avaliado'
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
