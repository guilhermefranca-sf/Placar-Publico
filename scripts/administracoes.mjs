// Administrações (gestões) de prefeitos, governadores e presidente.
//
// Por que isto existe: o recorte de avaliação é de 48 meses. Em novembro de 2026 esse recorte começa em
// novembro de 2022, e em muitos municípios quem governava em 2022 não é quem governa hoje. Cada número
// que o site mostra precisa saber de QUAL gestão ele é, em vez de atribuir tudo a quem está no cargo agora.
//
// De onde vem cada informação:
//   - Arquivos de candidatos do TSE (eleitos de 2018, 2020, 2022, 2024 e 2026, incluindo as eleições
//     SUPLEMENTARES que aparecem nesses arquivos). Dão quem foi eleito e quando o mandato regular começa.
//   - Arquivo de curadoria (scripts/curadoria/trocas-de-gestao.json): trocas no meio do mandato que o TSE
//     não registra (renúncia, vice que assume, interino), cada uma com as fontes consultadas.
//
// O que NÃO é detectado: trocas no meio do mandato que não estejam em nenhuma das duas fontes (por exemplo,
// vice que assumiu por afastamento temporário em prefeitura pequena). O site avisa isso em todo perfil.
//
// CPF: os arquivos do TSE trazem o CPF dos candidatos. Ele NUNCA é lido, guardado nem publicado aqui.
// Para saber se a mesma pessoa foi reeleita, comparamos nome completo + data de nascimento, só na memória.

import { percorrerCsv, lerDoZip, normalizar, nomeProprio } from './util.mjs';
import { UFS, URL_ZIP } from './tse.mjs';

export const AVISO_COBERTURA =
  'As datas de início e fim vêm dos arquivos de eleitos do TSE (mandato regular, posse em 1º de janeiro) e, quando houve troca de gestor no meio do mandato, de um registro com fontes. ' +
  'Trocas que não estejam nessas duas fontes (por exemplo, vice que assumiu temporariamente) não são detectadas. Confirme sempre no site oficial do governo ou da prefeitura.';

/* ---------------------------- datas (texto AAAA-MM-DD) ---------------------------- */

const iso = (a, m, d) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export const addDias = (s, n) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Quantidade de dias de a até b, contando os dois extremos. */
export const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;
const maior = (a, b) => (a > b ? a : b);
const menor = (a, b) => (a < b ? a : b);

export function paraISO(dataBr) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(dataBr || '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Os 48 meses fechados antes do mês atual. Em 23/11/2026: de 01/11/2022 a 31/10/2026. */
export function janelaDe48Meses(hoje) {
  const a = hoje.getUTCFullYear();
  const m = hoje.getUTCMonth() + 1;
  return { de: iso(a - 4, m, 1), ate: addDias(iso(a, m, 1), -1), meses: 48, referencia: hoje.toISOString().slice(0, 10) };
}

/**
 * Quais eleições interessam para a janela: as que têm mandato que encosta na janela, mais a eleição já
 * realizada cujo mandato ainda não começou (para mostrar "eleito, toma posse em 1º de janeiro").
 */
export function eleicoesRelevantes(de, ate) {
  const anoDe = Number(de.slice(0, 4));
  const anoAte = Number(ate.slice(0, 4));
  const r = { municipais: [], gerais: [], futuras: [] };
  for (let y = anoDe - 5; y <= anoAte; y++) {
    const tipo = y % 4 === 0 ? 'municipais' : y % 4 === 2 ? 'gerais' : null;
    if (!tipo) continue;
    const inicio = `${y + 1}-01-01`;
    const fim = `${y + 4}-12-31`;
    const futura = inicio > ate;
    if ((inicio <= ate && fim >= de) || futura) {
      r[tipo].push(y);
      if (futura) r.futuras.push(y);
    }
  }
  return r;
}

/* ---------------------------- leitura dos arquivos do TSE ---------------------------- */

const CARGOS_EXEC = { PREFEITO: 'prefeito', GOVERNADOR: 'governador', PRESIDENTE: 'presidente' };
const ELEITO = new Set(['ELEITO', 'ELEITO POR QP', 'ELEITO POR MÉDIA']);
const COLUNAS = ['DS_CARGO', 'DS_SIT_TOT_TURNO', 'SQ_CANDIDATO', 'NM_CANDIDATO', 'SG_PARTIDO', 'SG_UF'];

/** Lê um CSV de candidatos do TSE e devolve só os titulares ELEITOS de prefeito, governador e presidente. */
export function lerExecutivos(textoCsv, { anoArquivo = null } = {}) {
  const saida = [];
  const vistos = new Set();
  let conferido = false;
  percorrerCsv(textoCsv, (l, ix) => {
    if (!conferido) {
      for (const c of COLUNAS) if (!(c in ix)) throw new Error(`Coluna ${c} não existe no arquivo do TSE; o formato mudou.`);
      conferido = true;
    }
    const cargo = CARGOS_EXEC[l[ix.DS_CARGO]];
    if (!cargo || !ELEITO.has(l[ix.DS_SIT_TOT_TURNO])) return;
    const sq = l[ix.SQ_CANDIDATO];
    if (vistos.has(sq)) return;
    vistos.add(sq);
    const dataEleicao = ix.DT_ELEICAO != null ? paraISO(l[ix.DT_ELEICAO]) : null;
    const descricao = ix.DS_ELEICAO != null ? l[ix.DS_ELEICAO] : '';
    saida.push({
      cargo,
      uf: l[ix.SG_UF],
      cod: ix.SG_UE != null ? l[ix.SG_UE] : null,
      municipio: ix.NM_UE != null && cargo === 'prefeito' ? nomeProprio(l[ix.NM_UE]) : null,
      nome: nomeProprio(l[ix.NM_CANDIDATO]),
      urna: ix.NM_URNA_CANDIDATO != null ? nomeProprio(l[ix.NM_URNA_CANDIDATO]) : null,
      partido: l[ix.SG_PARTIDO],
      // só na memória, para reconhecer a mesma pessoa em duas eleições (nunca é gravado nem publicado)
      pessoa: `${normalizar(l[ix.NM_CANDIDATO])}|${ix.DT_NASCIMENTO != null ? l[ix.DT_NASCIMENTO] : ''}`,
      dataEleicao,
      anoEleicao: dataEleicao ? Number(dataEleicao.slice(0, 4)) : anoArquivo,
      suplementar: /supl/i.test(descricao)
    });
  });
  return saida;
}

/* ---------------------------- montagem da linha do tempo ---------------------------- */

/** Fim do mandato que uma eleição suplementar completa: 31/12 do próximo ano do ciclo (prefeitos: 2020, 2024...; demais: 2018, 2022...). */
function fimSuplementar(cargo, ano) {
  const resto = cargo === 'prefeito' ? 0 : 2;
  let y = ano;
  while (y % 4 !== resto) y++;
  return `${y}-12-31`;
}

export function situacaoDaGestao(g, hojeISO) {
  if (g.inicio > hojeISO) return 'futura';
  return g.fim >= hojeISO ? 'em exercício' : 'encerrada';
}

/**
 * Monta a lista de gestões de UM cargo em UM lugar a partir dos eleitos (qualquer ano).
 * Eleição comum: mandato de 1º/1 do ano seguinte até 31/12 do quarto ano.
 * Eleição suplementar: começa na data da eleição (a posse real não consta no arquivo) e vai até o fim do mandato.
 * A mesma pessoa em mandatos seguidos vira UMA gestão (reeleição não é troca de gestor).
 */
export function montarGestoes(registros, { hoje }) {
  const hojeISO = hoje.toISOString().slice(0, 10);
  const itens = registros
    .map((r) => (r.suplementar
      ? { r, inicio: r.dataEleicao || `${r.anoEleicao}-12-31`, fim: fimSuplementar(r.cargo, r.anoEleicao), inicioAprox: true }
      : { r, inicio: `${r.anoEleicao + 1}-01-01`, fim: `${r.anoEleicao + 4}-12-31`, inicioAprox: false }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));

  const gestoes = [];
  const avisos = [];
  for (const it of itens) {
    const anterior = gestoes[gestoes.length - 1];
    if (anterior && anterior.inicio === it.inicio) { avisos.push(`Dois eleitos para o mesmo início (${it.inicio}): ficou o primeiro.`); continue; }
    // A eleição suplementar encerra a gestão que estava em andamento.
    if (anterior && it.r.suplementar && anterior.fim >= it.inicio) {
      anterior.fim = addDias(it.inicio, -1);
      anterior.fimAprox = true;
      anterior.encerradaPor = 'eleição suplementar';
    }
    const reeleicao = anterior && anterior.pessoa === it.r.pessoa && addDias(anterior.fim, 1) >= it.inicio;
    if (reeleicao) {
      anterior.fim = it.fim;
      anterior.mandatos.push({ ano: it.r.anoEleicao, suplementar: it.r.suplementar });
      anterior.reeleito = true;
      continue;
    }
    gestoes.push({
      nome: it.r.nome, urna: it.r.urna, partido: it.r.partido, pessoa: it.r.pessoa,
      inicio: it.inicio, fim: it.fim, inicioAprox: it.inicioAprox, fimAprox: false,
      mandatos: [{ ano: it.r.anoEleicao, suplementar: it.r.suplementar }], reeleito: false, origem: 'tse'
    });
  }
  return { gestoes: finalizar(gestoes, hojeISO), avisos };
}

/** Dá número a cada gestão, informa se está em exercício e tira o que não pode ser publicado. */
function finalizar(gestoes, hojeISO) {
  gestoes.sort((a, b) => a.inicio.localeCompare(b.inicio));
  return gestoes.map((g, i) => {
    const { pessoa, ...resto } = g; // eslint-disable-line no-unused-vars
    const o = { id: `g${i + 1}`, ...resto };
    o.situacao = situacaoDaGestao(o, hojeISO);
    return o;
  });
}

function nomesParecidos(a, b) {
  const ta = new Set(normalizar(a).replace(/\bJHC\b/g, '').split(' ').filter((t) => t.length > 2));
  const tb = new Set(normalizar(b).split(' ').filter((t) => t.length > 2));
  let comuns = 0;
  for (const t of ta) if (tb.has(t)) comuns++;
  return comuns >= 2 || (comuns >= 1 && Math.min(ta.size, tb.size) === 1);
}

/**
 * Aplica as trocas da curadoria sobre a linha do tempo do TSE: a gestão em exercício na data da troca
 * termina na véspera e entra a nova. Se a fonte da troca citar o nome de quem saiu e ele não bater com o do TSE,
 * isso é registrado como divergência (nunca é escondido).
 */
export function aplicarTrocas(gestoesBase, trocas, hoje) {
  const hojeISO = hoje.toISOString().slice(0, 10);
  const gestoes = gestoesBase.map((g) => ({ ...g }));
  const avisos = [];
  const aplicadas = [];
  for (const t of [...trocas].sort((a, b) => (a.data || a.dataAprox).localeCompare(b.data || b.dataAprox))) {
    const quando = t.data || t.dataAprox;
    const alvo = gestoes.find((g) => g.inicio <= quando && g.fim >= quando && g.origem === 'tse')
      || gestoes.find((g) => g.inicio <= quando && g.fim >= quando);
    if (!alvo) { avisos.push(`Troca ${t.id}: nenhuma gestão do TSE cobre ${quando}; não aplicada.`); continue; }
    const divergencias = [...(t.divergencias || [])];
    if (t.saiu && !nomesParecidos(t.saiu.nome, alvo.nome) && !(alvo.urna && nomesParecidos(t.saiu.nome, alvo.urna))) {
      divergencias.push(`A fonte diz que saiu ${t.saiu.nome}, mas o TSE aponta ${alvo.nome} como eleito para este mandato.`);
    }
    const fimOriginal = alvo.fim;
    alvo.fim = addDias(quando, -1);
    alvo.fimAprox = !t.data;
    alvo.encerradaPor = t.tipo;
    alvo.situacao = situacaoDaGestao(alvo, hojeISO);
    const nova = {
      nome: t.entrou.nome, urna: null, partido: t.entrou.partido ?? null,
      inicio: quando, fim: fimOriginal, inicioAprox: !t.data, fimAprox: false,
      mandatos: [], reeleito: false, origem: 'curadoria',
      vinculo: t.entrou.vinculo || null,
      motivo: t.motivo || null,
      interina: t.situacao === 'interino' || undefined,
      dataTexto: t.dataTexto || null,
      confirmacao: t.confirmacao || null,
      fontes: t.fontes || [],
      divergencias,
      nota: t.nota || null,
      saiuSegundoFonte: t.saiu ? t.saiu.nome : null
    };
    nova.situacao = situacaoDaGestao(nova, hojeISO);
    gestoes.splice(gestoes.indexOf(alvo) + 1, 0, nova);
    aplicadas.push(t.id);
  }
  gestoes.forEach((g, i) => { g.id = `g${i + 1}`; });
  gestoes.sort((a, b) => a.inicio.localeCompare(b.inicio));
  gestoes.forEach((g, i) => { g.id = `g${i + 1}`; });
  return { gestoes, avisos, aplicadas };
}

/* ---------------------------- recorte e atribuição de períodos ---------------------------- */

/** Em quais gestões cai o período [de, ate] e por quantos dias cada uma. */
export function fatias(gestoes, de, ate) {
  const f = [];
  for (const g of gestoes) {
    const a = maior(g.inicio, de);
    const b = menor(g.fim, ate);
    if (a <= b) f.push({ id: g.id, de: a, ate: b, dias: diasEntre(a, b) });
  }
  return f;
}

/**
 * Responde: este período (um ano de contas, um mês de inflação...) pertence a quem?
 *   unica       -> uma só gestão cobre o período inteiro
 *   dividida    -> mais de uma gestão no período: o número não pode ser atribuído a uma só
 *   parcial     -> uma gestão cobre só parte e não temos informação do resto
 *   desconhecida-> nenhuma gestão conhecida
 */
export function atribuirPeriodo(gestoes, de, ate) {
  const f = fatias(gestoes, de, ate);
  const total = diasEntre(de, ate);
  const cobertos = f.reduce((s, x) => s + x.dias, 0);
  if (!f.length) return { tipo: 'desconhecida', gestoes: [], cobertura: 0 };
  if (f.length === 1 && cobertos >= total) return { tipo: 'unica', gestoes: [f[0].id], cobertura: 1 };
  if (f.length === 1) return { tipo: 'parcial', gestoes: [f[0].id], cobertura: Number((cobertos / total).toFixed(3)), fatias: f };
  return { tipo: 'dividida', gestoes: f.map((x) => x.id), cobertura: Number((cobertos / total).toFixed(3)), fatias: f };
}

export const atribuirAno = (gestoes, ano) => atribuirPeriodo(gestoes, `${ano}-01-01`, `${ano}-12-31`);
export const atribuirMes = (gestoes, aaaamm) => {
  const [a, m] = aaaamm.split('-').map(Number);
  const proximo = m === 12 ? iso(a + 1, 1, 1) : iso(a, m + 1, 1);
  return atribuirPeriodo(gestoes, iso(a, m, 1), addDias(proximo, -1));
};

/** Meses (de 48) que o período [de, ate] ocupa dentro da janela. Usado para dizer "só 2 meses deste ano estão no recorte". */
export function mesesNaJanela(janela, de, ate) {
  const a = maior(de, janela.de);
  const b = menor(ate, janela.ate);
  if (a > b) return 0;
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma) + 1;
}

/** Só as gestões que encostam na janela, com os dias que ficam dentro dela. */
export function recortarGestoes(gestoes, janela) {
  return gestoes
    .filter((g) => g.inicio <= janela.ate && g.fim >= janela.de)
    .map((g) => ({ ...g, noRecorte: { de: maior(g.inicio, janela.de), ate: menor(g.fim, janela.ate) } }));
}

/* ---------------------------- geração a partir dos arquivos do TSE ---------------------------- */

const NOMES_PRESIDENTE = (ano) => [`consulta_cand_${ano}_BRASIL.csv`, `consulta_cand_${ano}_BR.csv`];

function trocasDoEnte(trocas, cargo, uf, municipio) {
  return (trocas || []).filter((t) => t.cargo === cargo && t.uf === uf
    && (cargo !== 'prefeito' || normalizar(t.municipio) === normalizar(municipio)));
}

/**
 * Lê os arquivos do TSE e devolve as gestões de todos os prefeitos (por UF e código do município no TSE),
 * governadores (por UF) e do presidente.
 *   baixarZip(url) devolve o caminho local do .zip (assim dá para testar sem internet).
 */
export async function gerarAdministracoes({ baixarZip, hoje = new Date(), trocas = [], janela = janelaDe48Meses(hoje), ufs = UFS }) {
  const elei = eleicoesRelevantes(janela.de, janela.ate);
  const anos = [...new Set([...elei.municipais, ...elei.gerais])].sort();
  const registros = { prefeito: new Map(), governador: new Map(), presidente: [] };
  const avisos = [];
  const guardar = (r) => {
    if (r.cargo === 'presidente') { registros.presidente.push(r); return; }
    const chave = r.cargo === 'prefeito' ? `${r.uf}|${r.cod}` : r.uf;
    const lista = registros[r.cargo].get(chave) || [];
    lista.push(r);
    registros[r.cargo].set(chave, lista);
  };

  for (const ano of anos) {
    let zip;
    try { zip = await baixarZip(URL_ZIP(ano)); } catch (e) { avisos.push(`TSE ${ano}: arquivo não obtido (${String(e.message).slice(0, 120)}).`); continue; }
    for (const uf of ufs) {
      try {
        for (const r of lerExecutivos(lerDoZip(zip, `consulta_cand_${ano}_${uf}.csv`, 'windows-1252'), { anoArquivo: ano })) guardar(r);
      } catch (e) {
        if (!(uf === 'DF' && elei.municipais.includes(ano) && !elei.gerais.includes(ano))) avisos.push(`TSE ${ano} ${uf}: ${String(e.message).slice(0, 120)}`);
      }
    }
    if (elei.gerais.includes(ano)) {
      let achou = false;
      for (const nome of NOMES_PRESIDENTE(ano)) {
        try { for (const r of lerExecutivos(lerDoZip(zip, nome, 'windows-1252'), { anoArquivo: ano })) guardar(r); achou = true; break; } catch { /* tenta o outro nome */ }
      }
      if (!achou) avisos.push(`TSE ${ano}: não achei o arquivo dos candidatos a presidente.`);
    }
  }

  const resultado = { janela, anos, prefeitos: {}, governadores: {}, presidente: null, avisos, trocasAplicadas: [] };
  const unir = (regs, cargo, uf, municipio) => {
    const base = montarGestoes(regs, { hoje });
    avisos.push(...base.avisos.map((a) => `${cargo} ${uf}${municipio ? ' ' + municipio : ''}: ${a}`));
    const t = trocasDoEnte(trocas, cargo, uf, municipio);
    if (!t.length) return base.gestoes;
    const ap = aplicarTrocas(base.gestoes, t, hoje);
    avisos.push(...ap.avisos);
    resultado.trocasAplicadas.push(...ap.aplicadas);
    return ap.gestoes;
  };

  for (const [chave, regs] of registros.prefeito) {
    const [uf, cod] = chave.split('|');
    const maisRecente = [...regs].sort((a, b) => b.anoEleicao - a.anoEleicao)[0];
    (resultado.prefeitos[uf] ||= {})[cod] = { municipio: maisRecente.municipio, gestoes: unir(regs, 'prefeito', uf, maisRecente.municipio) };
  }
  for (const [uf, regs] of registros.governador) resultado.governadores[uf] = { gestoes: unir(regs, 'governador', uf, null) };
  if (registros.presidente.length) resultado.presidente = { gestoes: unir(registros.presidente, 'presidente', 'BR', null) };
  // Troca da curadoria que não encontrou o lugar nos arquivos do TSE: avisa em vez de sumir em silêncio.
  for (const t of trocas) {
    if (!resultado.trocasAplicadas.includes(t.id) && !avisos.some((a) => a.includes(t.id))) {
      avisos.push(`Troca ${t.id}: não encontrei ${t.cargo} ${t.uf}${t.municipio ? ' ' + t.municipio : ''} nos arquivos do TSE; não aplicada.`);
    }
  }
  return resultado;
}
