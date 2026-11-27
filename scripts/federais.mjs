// Deputados federais: calcula o índice de cada um a partir dos arquivos abertos da Câmara.
// Em vez de milhares de consultas, usa os arquivos por ano que a Câmara atualiza todo dia.
//
// O índice olha os últimos 4 anos civis (hoje, 2023 a 2026; o ano em curso conta até a data da atualização).
// Os anos já fechados são guardados em arquivos próprios (dados/anos/federais-AAAA.json) e não precisam ser
// baixados de novo todo dia. Só o ano em curso é lido da Câmara em cada atualização.

import { percorrerCsv, criarPercentil, arredondar, dataBR, reais, emLotes, normalizar } from './util.mjs';
import { METODO, mediaPonderada, atribuirPosicoes, pesoDe } from './nota.mjs';
import { listarPermanentes, criarColetorDeEventos, ligarReunioesAosOrgaos, carregarMembros, contarComissoes } from './comissoes.mjs';
import { somarCusto, NAO_MEDIDOS } from './custo.mjs';

export const API = 'https://dadosabertos.camara.leg.br/api/v2';
export const ARQUIVOS = 'https://dadosabertos.camara.leg.br/arquivos';
export const SIGLAS_PROJETO = new Set(['PL', 'PLP', 'PEC', 'PDL', 'PRC', 'MPV', 'PLV', 'PLN', 'PFC']);
export const JANELA_ANOS = METODO.federais.janelaAnos;
const MIN_VOTANTES_NOMINAL = 100; // uma votação nominal do Plenário tem centenas de votos
const VERSAO_ANO = 3;             // muda quando o formato do arquivo de cada ano muda (2: projetos com situação e número de autores; 3: presença em comissões, sem a cota do arquivo anual)
const DIAS_ENTRE_LEITURAS_DA_SITUACAO = 7; // a situação de um projeto muda com o tempo: os anos fechados são relidos a cada 7 dias
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

/** Os anos civis avaliados: o ano em curso e os 3 anteriores. */
export const anosDaJanela = (ano, janela = JANELA_ANOS) => Array.from({ length: janela }, (_, k) => ano - janela + 1 + k);

/** Um arquivo de ano fechado só vale se foi gerado depois que o ano terminou e no formato de hoje. */
const anoFechadoValido = (ag, a, comissoesDisponiveis = true) => ag && ag.versao === VERSAO_ANO && ag.ano === a && String(ag.geradoEm || '').slice(0, 4) > String(a)
  && (!comissoesDisponiveis || ag.comisOk === true); // um ano guardado sem as comissões é refeito assim que a lista de comissões estiver disponível

/**
 * Situação atual de um projeto, vista pelo texto que a Câmara publica em "ultimoStatus_descricaoSituacao".
 *   L  transformado em norma jurídica (virou lei, emenda constitucional, decreto legislativo etc.)
 *   C  aprovado pela Câmara e a caminho (Senado, sanção, promulgação, veto, autógrafos)
 *   M  aprovado em comissão em caráter conclusivo e aguardando prazo de recurso
 *   A  arquivado, rejeitado, retirado ou prejudicado
 *   O  transformado em nova proposição (o texto seguiu em outro projeto)
 *   T  em tramitação (qualquer outra situação)
 *   null  a Câmara não informou a situação
 * Só L e C contam como "aprovado pela Casa". M aparece à parte e não conta: o Placar não tem o histórico de
 * pareceres de cada comissão, então só enxerga quem ainda está nessa situação.
 */
export function classificarSituacao(descricao) {
  const t = normalizar(descricao);
  if (!t) return null;
  if (/TRANSFORMAD[OA] EM NORMA JURIDICA|PROMULGAD/.test(t)) return 'L';
  if (/TRANSFORMAD[OA] EM NOVA PROPOSICAO/.test(t)) return 'O';
  if (/ARQUIVAD|REJEITAD|RETIRAD[OA] PELO AUTOR|PREJUDICAD|DEVOLVID|PERDEU A EFICACIA/.test(t)) return 'A';
  if (/AGUARDANDO (ENVIO AO SENADO|APRECIACAO PELO SENADO|SANCAO|AUTOGRAFOS|PROMULGACAO|APRECIACAO DO VETO)|VETAD|VAI A (SANCAO|PROMULGACAO)|REMETID[OA] (AO SENADO|A SANCAO)/.test(t)) return 'C';
  if (/AGUARDANDO RECURSO/.test(t)) return 'M';
  return 'T';
}

/**
 * Lê as proposições e os autores de UM ano e devolve, por deputado, a lista [data, situação, nº de deputados autores]
 * dos projetos e propostas de autoria dele (não conta requerimento, indicação, emenda).
 * statusOk = false quando o arquivo não traz a situação dos projetos (formato mudou): nesse caso nenhum projeto
 * é tratado como "não aprovado"; o critério de projetos aprovados simplesmente fica sem dado.
 */
export async function lerProjetosDoAno({ fontes, ano }) {
  const dadosProp = new Map(); // idProposicao -> [data, situação]
  let temColuna = false;
  let comSituacao = 0;
  {
    const texto = await fontes.texto(`${ARQUIVOS}/proposicoes/csv/proposicoes-${ano}.csv`);
    percorrerCsv(texto, (l, ix) => {
      temColuna = 'ultimoStatus_descricaoSituacao' in ix;
      if (!SIGLAS_PROJETO.has(l[ix.siglaTipo])) return;
      const data = String(l[ix.dataApresentacao]).slice(0, 10);
      if (data.slice(0, 4) !== String(ano)) return;
      const classe = temColuna ? classificarSituacao(l[ix.ultimoStatus_descricaoSituacao]) : null;
      if (classe) comSituacao++;
      dadosProp.set(l[ix.id], [data, classe]);
    });
  }
  const autoresDe = new Map(); // idProposicao -> Set(idDeputado)
  {
    const texto = await fontes.texto(`${ARQUIVOS}/proposicoesAutores/csv/proposicoesAutores-${ano}.csv`);
    percorrerCsv(texto, (l, ix) => {
      const p = l[ix.idProposicao];
      const d = l[ix.idDeputadoAutor];
      if (!d || !dadosProp.has(p)) return;
      if (!autoresDe.has(p)) autoresDe.set(p, new Set());
      autoresDe.get(p).add(d);
    });
  }
  const projetos = new Map(); // idDeputado -> [[data, situação, nº de autores]]
  for (const [p, deps] of autoresDe) {
    const [data, classe] = dadosProp.get(p);
    for (const d of deps) {
      if (!projetos.has(d)) projetos.set(d, []);
      projetos.get(d).push([data, classe, deps.size]);
    }
  }
  return { projetos: Object.fromEntries(projetos), statusOk: temColuna && comSituacao > 0 };
}

/** Conta os projetos de um deputado, a partir de uma data, por situação e por tipo de autoria. */
export function resumirProjetos(porAno, id, desde) {
  const r = { apresentados: 0, aprovadosCasa: 0, leis: 0, comissao: 0, arquivados: 0, tramitacao: 0, outros: 0, semSituacao: 0, sozinho: 0, coautoria: 0 };
  for (const a of porAno) {
    for (const [data, classe, nAut] of a.projetos[id] || []) {
      if (data < desde) continue;
      r.apresentados++;
      if (nAut > 1) r.coautoria++; else r.sozinho++;
      if (classe === 'L') { r.leis++; r.aprovadosCasa++; }
      else if (classe === 'C') r.aprovadosCasa++;
      else if (classe === 'M') r.comissao++;
      else if (classe === 'A') r.arquivados++;
      else if (classe === 'T') r.tramitacao++;
      else if (classe === 'O') r.outros++;
      else r.semSituacao++;
    }
  }
  r.statusOk = porAno.every((a) => a.statusOk);
  return r;
}

/**
 * Lê da Câmara os arquivos de UM ano e resume o que importa, de forma compacta:
 *   sessoes   datas das sessões deliberativas encerradas do Plenário (em ordem)
 *   presencas { idDeputado: "0101..." }  1 = presente na sessão de mesma posição
 *   nominais  datas das votações nominais do Plenário (em ordem)
 *   votou     { idDeputado: "0101..." }  1 = registrou voto
 *   projetos  { idDeputado: [[data, situação, nº de autores]] }  projetos e propostas de autoria (não conta requerimento, indicação, emenda)
 *   comis     { reunioes: [[data, [idOrgao]]], presencas: { idDeputado: "0101..." } }  reuniões deliberativas de comissões permanentes
 * `completo` guarda também o que o "Como votou?" precisa (ids, placar, voto de cada um). Só vale para o ano em curso.
 */
export async function lerAnoCamara({ fontes, ano, hoje = new Date(), completo = false, permanentes = null }) {
  // 1. Sessões deliberativas do Plenário já encerradas (e, de passagem, as reuniões deliberativas das comissões)
  const sessoes = new Map(); // idEvento -> data (AAAA-MM-DD)
  const coletor = criarColetorDeEventos();
  {
    const texto = await fontes.texto(`${ARQUIVOS}/eventos/csv/eventos-${ano}.csv`);
    percorrerCsv(texto, (l, ix) => {
      if (permanentes) coletor.aoLerEvento(l, ix);
      if (l[ix.descricaoTipo] !== 'Sessão Deliberativa') return;
      if (!String(l[ix.situacao]).startsWith('Encerrada')) return;
      if (!/Plen/i.test(l[ix['localCamara.nome']] || '')) return;
      sessoes.set(l[ix.id], String(l[ix.dataHoraInicio]).slice(0, 10));
    });
  }
  const ordemSessoes = [...sessoes.entries()].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] < b[0] ? -1 : 1));
  const posSessao = new Map(ordemSessoes.map(([id], k) => [id, k]));

  // 1b. Quais dessas reuniões de comissão são de comissões permanentes
  let reunioesCom = null;
  if (permanentes) reunioesCom = ligarReunioesAosOrgaos(await fontes.texto(`${ARQUIVOS}/eventosOrgaos/csv/eventosOrgaos-${ano}.csv`), coletor, permanentes);

  // 2. Presença de cada deputado nessas sessões (e nas reuniões de comissão)
  const presencas = new Map(); // idDeputado -> Set(posição)
  const presencasCom = new Map(); // idDeputado -> Set(posição da reunião de comissão)
  {
    const texto = await fontes.texto(`${ARQUIVOS}/eventosPresencaDeputados/csv/eventosPresencaDeputados-${ano}.csv`);
    percorrerCsv(texto, (l, ix) => {
      const d = l[ix.idDeputado];
      const k = posSessao.get(l[ix.idEvento]);
      if (k !== undefined) {
        if (!presencas.has(d)) presencas.set(d, new Set());
        presencas.get(d).add(k);
        return;
      }
      const c = reunioesCom ? reunioesCom.posicao.get(l[ix.idEvento]) : undefined;
      if (c !== undefined) {
        if (!presencasCom.has(d)) presencasCom.set(d, new Set());
        presencasCom.get(d).add(c);
      }
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

  // 4. Projetos e propostas de autoria, com a situação atual de cada um
  const { projetos, statusOk } = await lerProjetosDoAno({ fontes, ano });

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
    projetos,
    statusOk,
    statusEm: hoje.toISOString(),
    comisOk: !!reunioesCom,
    comis: reunioesCom ? {
      reunioes: reunioesCom.lista.map((r) => [r.data, r.orgaos]),
      presencas: Object.fromEntries([...presencasCom].map(([d, set]) => [d, bits(set, reunioesCom.lista.length)]))
    } : null
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

const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

/** Frase que explica o critério "projetos aprovados" de um deputado. */
function fraseAprovados(e, pAprov, desde) {
  const p = e.proj;
  if (!p.situacaoLida) return 'A Câmara não informou a situação atual dos projetos nos arquivos lidos, então este critério ficou sem dado. Isso não significa zero projetos aprovados.';
  if (!p.historicoSuficiente) return `Histórico insuficiente: ${arredondar(e.meses, 1).toLocaleString('pt-BR')} meses de exercício no período, e este critério pede pelo menos ${METODO.federais.minMesesAprovados}. Zero projetos aprovados no início do mandato não é desempenho negativo; o índice usa os outros critérios. Até agora: ${plural(p.aprovadosCasa, 'projeto aprovado', 'projetos aprovados')} de ${plural(p.apresentados, 'apresentado', 'apresentados')}.`;
  return `${plural(p.aprovadosCasa, 'projeto aprovado', 'projetos aprovados')} pelo Plenário da Câmara de ${plural(p.apresentados, 'apresentado', 'apresentados')} desde ${desde} (${p.aprovadosPorAno.toLocaleString('pt-BR')} por ano de exercício; ${plural(p.leis, 'virou lei', 'viraram lei')}), mais do que ${Math.floor(pAprov * 100)}% dos deputados com histórico suficiente.`;
}

/** Frase que explica o critério "presença em comissões" de um deputado. */
export function fraseComissoes(e, desde, motivoGeral = null) {
  const c = e.comissoes;
  if (!c) return `${motivoGeral ? 'A lista de comissões permanentes e de seus membros não pôde ser lida nesta atualização' : 'Este critério ainda não foi calculado'}; ficou sem dado. Isso não significa falta de presença.`;
  if (!c.suficiente) return `Só ${plural(c.esperadas, 'reunião deliberativa esperada', 'reuniões deliberativas esperadas')} em comissões permanentes desde ${desde}; o mínimo é ${METODO.federais.minReunioesComissao}. Dado não encontrado ou não confirmado: poucas reuniões não são nota baixa. Até agora: presente em ${c.presentes}.`;
  const lic = c.licenca ? ` Não conta ${plural(c.licenca, 'reunião', 'reuniões')} em que estava licenciado(a) ou afastado(a).` : '';
  return `Presente em ${c.presentes} de ${plural(c.esperadas, 'reunião deliberativa', 'reuniões deliberativas')} de comissões permanentes em que era titular, desde ${desde} (${Math.round((c.presentes / c.esperadas) * 100)}%).${lic} A Câmara não publica quem substituiu o titular numa reunião: a falta do titular substituído pode contar contra ele.`;
}

const brl = (v) => reais(v);

/** Frase que explica o critério "custo para os cofres públicos" de um deputado. */
export function fraseCusto(e, pCusto, nComparados, desde, MSG) {
  const c = e.custo;
  if (!c) return `${MSG}. ${e.custoMotivo || 'O Portal da Transparência da Câmara não foi lido para este deputado.'} Isso não significa custo zero.`;
  if (c.poucosMeses) return `Só ${arredondar(c.meses, 1).toLocaleString('pt-BR')} meses de exercício no período; o custo por mês só é comparado a partir de ${METODO.federais.minMesesCusto} meses. Até agora: ${brl(c.total)}.`;
  const k = c.componentes;
  const partes = [`cota parlamentar ${brl(k.cota)}`, `verba de gabinete ${brl(k.verba)}`, `auxílio-moradia ${brl(k.moradia)}`, `viagens oficiais ${brl(k.viagens)}`];
  const menos = Math.floor((1 - pCusto) * 100);
  return `Custou ${brl(c.total)} aos cofres públicos desde ${desde} (${brl(c.porMes)} por mês de exercício), sem contar o subsídio: ${partes.join('; ')}. Custou menos por mês do que ${menos}% dos ${nComparados.toLocaleString('pt-BR')} deputados comparados em todo o país. Não medidos: ${NAO_MEDIDOS.join('; ')}.`;
}

/**
 * fontes = { json(url), texto(url) }  (assim dá para testar sem internet)
 * ano    = último ano da janela (o ano em curso). janela = quantos anos civis avaliar (4).
 * cache  = { ler(ano), gravar(ano, objeto) }  guarda o resumo dos anos fechados. usarCache=false refaz todos.
 * pausasDe(id) = [{ ini, fim }] licenças e afastamentos registrados no histórico da Câmara. Esses períodos
 *                não contam contra o deputado (nem sessões, nem votações, nem meses de gasto).
 */
export async function gerarFederais({ fontes, ano, janela = JANELA_ANOS, hoje = new Date(), cache = null, usarCache = true, pausasDe = () => [], custoDocs = null, aoAndar = () => {} }) {
  const deputados = await listarDeputados(fontes.json);
  if (deputados.length < 100) throw new Error(`A Câmara devolveu só ${deputados.length} deputados; parece falha da API.`);

  const anos = anosDaJanela(ano, janela);

  // Comissões permanentes e membros titulares. Se qualquer uma das duas leituras falhar, o critério "presença em comissões"
  // fica sem dado para todos (e o resto do índice segue normalmente). Nada é preenchido por estimativa.
  let permanentes = null, membros = null, motivoComissoes = null;
  try {
    permanentes = await listarPermanentes(fontes.json);
    membros = await carregarMembros(fontes, anos[0], anos[anos.length - 1]);
    aoAndar(`comissões: ${permanentes.size} comissões permanentes; titulares de ${membros.porDep.size} deputados`);
  } catch (e) {
    permanentes = null; membros = null;
    motivoComissoes = String(e.message).slice(0, 200);
    aoAndar(`comissões: não consegui montar a lista (${motivoComissoes}); o critério fica sem dado nesta rodada`);
  }

  // Um resumo por ano. Os fechados vêm do arquivo guardado; o ano em curso é sempre lido de novo.
  const porAno = [];
  let atual = null;
  for (const a of anos) {
    let ag = a < ano && usarCache && cache ? cache.ler(a) : null;
    if (!anoFechadoValido(ag, a, !!permanentes)) ag = null;
    if (ag) {
      aoAndar(`${a}: usando o resumo guardado`);
      // Presença, votos e cota de um ano fechado não mudam, mas a situação dos projetos sim (um projeto de 2023 pode ser aprovado hoje).
      const idade = (hoje - new Date(ag.statusEm)) / DIA;
      if (!(idade < DIAS_ENTRE_LEITURAS_DA_SITUACAO)) {
        try {
          aoAndar(`${a}: relendo a situação dos projetos`);
          const r = await lerProjetosDoAno({ fontes, ano: a });
          ag = { ...ag, projetos: r.projetos, statusOk: r.statusOk, statusEm: hoje.toISOString() };
          if (cache) cache.gravar(a, ag);
        } catch (e) { aoAndar(`${a}: não consegui reler a situação dos projetos (${String(e.message).slice(0, 80)}); mantendo a leitura anterior`); }
      }
    } else {
      aoAndar(`${a}: lendo os arquivos da Câmara`);
      const r = await lerAnoCamara({ fontes, ano: a, hoje, completo: a === ano, permanentes });
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
  // Comissões: só há dado se a lista de comissões e os membros foram lidos e todos os anos têm as reuniões.
  const comisAtivo = !!(permanentes && membros && porAno.every((a) => a.comisOk && a.comis));
  const reunioesCom = comisAtivo ? porAno.flatMap((a) => a.comis.reunioes) : [];
  const comisDe = (id) => porAno.map((a) => (a.comis && a.comis.presencas[id]) || '0'.repeat(a.comis ? a.comis.reunioes.length : 0)).join('');

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
    const proj = resumirProjetos(porAno, id, desde);
    const nProj = proj.apresentados;
    // Presença em comissões permanentes (só reuniões em que era titular da comissão; licença não conta contra).
    let comis = null;
    if (comisAtivo) {
      const c = contarComissoes({ reunioes: reunioesCom, marcas: comisDe(id), periodos: membros.porDep.get(id) || [], desde, emPausa });
      comis = { ...c, suficiente: c.esperadas >= METODO.federais.minReunioesComissao };
    }
    // Custo para os cofres públicos: cota + verba de gabinete + auxílio-moradia + viagens oficiais, do Portal da Câmara.
    let custo = null;
    if (custoDocs) {
      const r = somarCusto(custoDocs, id, Number(desde.slice(0, 4)), ano);
      custo = r.erro ? { erro: r.erro } : { ...r, total: Math.max(0, r.total) };
    }
    return {
      ...base,
      desde,
      obs: desde > decimoDia ? `Primeira presença registrada em ${dataBR(desde)}; os números contam a partir daí.` : undefined,
      _pres: presentes / sessoesDesde,
      _vot: votacoesDesde ? votei / votacoesDesde : null,
      // Critério "projetos aprovados": só com situação conhecida e pelo menos 12 meses de exercício (histórico suficiente).
      _aprovAno: proj.statusOk && meses >= METODO.federais.minMesesAprovados ? proj.aprovadosCasa / (meses / 12) : null,
      _comis: comis && comis.suficiente ? comis.presentes / comis.esperadas : null,
      _custoMes: custo && !custo.erro && meses >= METODO.federais.minMesesCusto ? custo.total / meses : null,
      extra: {
        sessoes: [presentes, sessoesDesde], votos: [votei, votacoesDesde], projetos: nProj, meses: arredondar(meses, 1),
        comissoes: comis ? { esperadas: comis.esperadas, presentes: comis.presentes, suficiente: comis.suficiente, ...(comis.licenca ? { licenca: comis.licenca } : {}) } : null,
        custo: custo && !custo.erro ? {
          total: Math.round(custo.total), porMes: Math.round(custo.total / meses),
          componentes: Object.fromEntries(Object.entries(custo.componentes).map(([k, v]) => [k, Math.round(v)])),
          anos: Object.fromEntries(Object.entries(custo.anos).map(([a, v]) => [a, { cota: Math.round(v.cota), verba: Math.round(v.verba), moradia: Math.round(v.moradia), viagens: Math.round(v.viagens), semLancamento: v.sr }])),
          meses: arredondar(meses, 1), ...(meses < METODO.federais.minMesesCusto ? { poucosMeses: true } : {})
        } : null,
        custoMotivo: custo && custo.erro ? custo.erro : (!custoDocs ? 'A leitura do Portal da Transparência da Câmara ainda não foi feita.' : undefined),
        proj: {
          apresentados: proj.apresentados, aprovadosCasa: proj.aprovadosCasa, leis: proj.leis, comissao: proj.comissao,
          arquivados: proj.arquivados, tramitacao: proj.tramitacao, outros: proj.outros, semSituacao: proj.semSituacao,
          sozinho: proj.sozinho, coautoria: proj.coautoria, situacaoLida: proj.statusOk,
          aprovadosPorAno: proj.statusOk ? arredondar(proj.aprovadosCasa / (meses / 12), 2) : null,
          leisPorAno: proj.statusOk ? arredondar(proj.leis / (meses / 12), 2) : null,
          historicoSuficiente: meses >= METODO.federais.minMesesAprovados
        },
        ...(descSessoes || descVotos || diasPausa ? { licenca: { sessoes: descSessoes, votacoes: descVotos, dias: diasPausa } } : {})
      }
    };
  });

  // 7. Comparações: projetos aprovados e custo entre TODOS os deputados do país (o custo não é comparado só dentro do estado)
  const elegiveis = itens.filter((i) => i._pres != null);
  const pctAprov = criarPercentil(elegiveis.filter((i) => i._aprovAno != null).map((i) => i._aprovAno));
  const comCusto = elegiveis.filter((i) => i._custoMes != null);
  const pctCusto = criarPercentil(comCusto.map((i) => i._custoMes));
  const MSG = 'Dado não encontrado ou não confirmado';

  for (const i of elegiveis) {
    const pAprov = i._aprovAno != null ? pctAprov(i._aprovAno) : null;
    const pCusto = i._custoMes != null ? pctCusto(i._custoMes) : null;
    const sPres = arredondar(i._pres * 100, 1);
    const sVot = i._vot == null ? null : arredondar(i._vot * 100, 1);
    const sAprov = pAprov == null ? null : arredondar(pAprov * 100, 1);
    const sComis = i._comis == null ? null : arredondar(i._comis * 100, 1);
    const sCusto = pCusto == null ? null : arredondar((1 - pCusto) * 100, 1);
    const e = i.extra;
    const desde = dataBR(i.desde);
    const lic = e.licenca;
    const notaLic = (n, o) => (n ? ` Não conta ${n} ${n === 1 ? o[0] : o[1]} em que estava licenciado(a) ou afastado(a), segundo o histórico da Câmara.` : '');
    i.comp = [
      { k: 'pres', s: sPres, f: `Presente em ${e.sessoes[0]} de ${e.sessoes[1]} sessões deliberativas do Plenário desde ${desde} (${Math.round(i._pres * 100)}%).${notaLic(lic && lic.sessoes, ['sessão', 'sessões'])}` },
      { k: 'vot', s: sVot, f: e.votos[1] ? `Registrou voto em ${e.votos[0]} de ${e.votos[1]} votações nominais do Plenário desde ${desde}.${notaLic(lic && lic.votacoes, ['votação', 'votações'])}` : 'Ainda não houve votação nominal no período.' },
      { k: 'aprov', s: sAprov, f: fraseAprovados(e, pAprov, desde) },
      { k: 'comis', s: sComis, f: fraseComissoes(e, desde, motivoComissoes) },
      { k: 'custo', s: sCusto, f: fraseCusto(e, pCusto, comCusto.length, desde, MSG) }
    ];
    i.nota = mediaPonderada(i.comp.map((c) => ({ peso: pesoDe('federais', c.k), s: c.s })), METODO.federais.minCriterios);
    if (i.nota == null) i.motivo = 'Dados insuficientes para calcular o índice.';
  }
  for (const i of itens) { delete i._pres; delete i._vot; delete i._aprovAno; delete i._comis; delete i._custoMes; if (i.obs === undefined) delete i.obs; }

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
