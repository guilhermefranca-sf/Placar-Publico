// Índice de serviços públicos de governadores e prefeitos (cinco áreas: saúde, educação, segurança, infraestrutura e saneamento).
//
// Substitui o antigo índice fiscal (gasto com pessoal e dívida), que saiu da nota e continua só como informação no perfil.
//
// Como funciona:
//   1. Para cada ente, juntam-se os resultados que existem nos arquivos já coletados (IBGE Cidades, Censo 2022, Sinesp).
//   2. Cada indicador é comparado com os pares (estados com estados; municípios com os do mesmo estado, ou do país
//      quando o estado tem poucos municípios com o dado) e vira uma posição de 0 a 100, no sentido certo.
//   3. A área é a média dos indicadores dela; o índice é a média das áreas, com pesos iguais (20% cada).
//   4. Área sem dado, sem fonte ou que não se aplica fica de fora e os pesos das outras são refeitos. O índice é
//      sempre marcado como parcial ("N de 5 áreas") e só aparece com o mínimo de áreas definido em nota.mjs.
//
// Nada é preenchido com zero nem inventado: o que falta aparece como "Dado não encontrado ou não confirmado".
// Os resultados medem o território nos anos do recorte, que podem incluir anos de gestões anteriores; o texto do
// perfil diz quais anos entraram e quais pertencem a outra gestão.

import path from 'node:path';
import { METODO, mediaPonderada, atribuirPosicoes, compacto, destaques, mediaDasNotas } from './nota.mjs';
import { criarPercentil, arredondar, gravarJson, lerJsonSeExistir } from './util.mjs';
import { UFS } from './tse.mjs';
import { janelaDe48Meses, atribuirAno, mesesNaJanela } from './administracoes.mjs';
import { contextoDoEnte } from './indicadores.mjs';
import { taxaPor100mil, lerSegurancaGuardada } from './seguranca.mjs';

const M = METODO.executivos;
const TOTAL_AREAS = M.componentes.length;
export const MSG_SEM_DADO = 'Dado não encontrado ou não confirmado';

const IDEB = { 'ideb-af-est': 'ideb.af.estadual', 'ideb-em-est': 'ideb.em.estadual', 'ideb-ai-mun': 'ideb.ai.municipal', 'ideb-af-mun': 'ideb.af.municipal' };
const ANO_CENSO = 2022;

const fmt = (v, casas = 1) => Number(v).toFixed(casas).replace('.', ',');
const lista = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} e ${a[a.length - 1]}`);
const periodo = (anos) => (anos.length === 1 ? String(anos[0]) : `${anos[0]} a ${anos[anos.length - 1]}`);
const grupoDe = (esfera) => (esfera === 'M' ? 'M' : 'E'); // o Distrito Federal (D) é comparado com os estados

/* ---------------------------- valores de um ente ---------------------------- */

/**
 * Juntando o que foi coletado, devolve { chaveDoIndicador: { valor, anos, retrato? } }.
 *   reg:    { em, s: { 'ideb.af.estadual': { ano: valor }, ... } }  (anos/cidades-{UF}.json)
 *   censo:  { agua, esgoto, lixo }  (contextoDoEnte(...).censo)
 *   segUf:  { homicidio: { ano: { meses, total } }, rouboVeiculo: {...} }  (anos/seguranca.json)
 * Um indicador sem dado nem aparece. Um indicador que existe mas não pode ser usado leva { valor: null, motivo }.
 */
export function valoresDoEnte({ esfera, reg, censo, segUf, populacao, janela }) {
  const g = grupoDe(esfera);
  const s = reg?.s || {};
  // Só entram anos com pelo menos 6 meses dentro dos últimos 48 meses.
  const validos = new Set();
  for (let a = Number(janela.de.slice(0, 4)); a <= Number(janela.ate.slice(0, 4)); a++) if (mesesNaJanela(janela, `${a}-01-01`, `${a}-12-31`) >= M.minMesesDoAno) validos.add(a);
  const de = Math.min(...validos);
  const ate = Math.max(...validos);
  const anosNaJanela = (serie) => Object.keys(serie || {}).map(Number).filter((a) => validos.has(a) && Number.isFinite(serie[a])).sort((a, b) => a - b);
  const v = {};

  // Mortalidade infantil: soma de óbitos / soma de nascidos vivos nos anos em que os dois existem (evita a oscilação de um ano só).
  const nasc = s['saude.nascidos'];
  const obit = s['saude.obitos'];
  const anosM = anosNaJanela(nasc).filter((a) => Number.isFinite(obit?.[a]));
  if (anosM.length) {
    const n = anosM.reduce((t, a) => t + nasc[a], 0);
    const o = anosM.reduce((t, a) => t + obit[a], 0);
    if (n >= M.minNascidos) v.mortalidade = { valor: (o / n) * 1000, anos: anosM };
    else v.mortalidade = { valor: null, motivo: `não calculada: só ${Math.round(n)} nascimentos no período (mínimo ${M.minNascidos}); com tão poucos nascimentos a taxa oscila demais` };
  }

  for (const ind of M.indicadores.filter((i) => IDEB[i.k] && i.esferas.includes(g))) {
    const serie = s[IDEB[ind.k]];
    const anos = anosNaJanela(serie);
    if (anos.length) v[ind.k] = { valor: serie[anos[anos.length - 1]], anos: [anos[anos.length - 1]] };
  }

  if (g === 'M') {
    const anos = anosNaJanela(s['saude.diarreia']);
    if (anos.length) v.diarreia = { valor: anos.reduce((t, a) => t + s['saude.diarreia'][a], 0) / anos.length, anos };
  }

  // Censo 2022: é um retrato do território em agosto de 2022, não um resultado da gestão.
  for (const k of ['agua', 'esgoto', 'lixo']) if (Number.isFinite(censo?.[k])) v[k] = { valor: censo[k], anos: [ANO_CENSO], retrato: true };

  if (g === 'E' && segUf) {
    const h = taxaPor100mil(segUf.homicidio, populacao, de, ate);
    if (h) v.homicidio = { valor: h.valor, anos: h.anos };
    const r = taxaPor100mil(segUf.rouboVeiculo, populacao, de, ate);
    if (r) v['roubo-veiculo'] = { valor: r.valor, anos: r.anos };
  }
  return v;
}

/* ---------------------------- comparação com os pares ---------------------------- */

/** Pontua cada indicador de cada ente. Devolve Map(id do ente -> { chave: { s, n, grupo } }). */
function pontuarIndicadores(entes) {
  const saida = new Map(entes.map((e) => [e.id, {}]));
  for (const ind of M.indicadores) {
    // Estados só são comparados com estados e municípios só com municípios, mesmo quando o indicador vale para os dois.
    for (const g of ind.esferas) {
      const tem = entes.filter((e) => grupoDe(e.esfera) === g && Number.isFinite(e.valores?.[ind.k]?.valor));
      if (!tem.length) continue;
      const grupos = new Map();
      const dar = (chave, rotulo, membros) => {
        if (!grupos.has(chave)) grupos.set(chave, { rotulo, n: membros.length, pct: criarPercentil(membros.map((e) => e.valores[ind.k].valor)) });
        return grupos.get(chave);
      };
      const porUf = new Map();
      for (const e of tem) porUf.set(e.uf, [...(porUf.get(e.uf) || []), e]);
      for (const e of tem) {
        let alvo = null;
        if (g === 'E') {
          if (tem.length >= M.minPares) alvo = dar('E', 'estados', tem);
        } else if (porUf.get(e.uf).length >= M.minPares) alvo = dar(`M-${e.uf}`, `municípios de ${e.uf}`, porUf.get(e.uf));
        else if (tem.length >= M.minPares) alvo = dar('M-BR', 'municípios do país', tem);
        if (!alvo) continue;
        const p = alvo.pct(e.valores[ind.k].valor);
        saida.get(e.id)[ind.k] = { s: arredondar((ind.sentido === 'maior' ? p : 1 - p) * 100, 1), n: alvo.n, grupo: alvo.rotulo };
      }
    }
  }
  return saida;
}

/* ---------------------------- a que gestão cada ano pertence ---------------------------- */

/** Quais anos entraram e a quem pertencem. Só olha anos de resultado (o retrato do Censo não é de gestão alguma). */
export function atribuicaoDosAnos(gestoes, anos) {
  const atual = (gestoes || []).find((g) => g.situacao === 'em exercício') || null;
  const r = { atual: [], misto: [], anterior: [], semGestao: !atual };
  if (!atual) return r;
  for (const a of anos) {
    const at = atribuirAno(gestoes, a);
    if (at.tipo === 'unica' && at.gestoes[0] === atual.id) r.atual.push(a);
    else if (at.gestoes.includes(atual.id)) r.misto.push(a);
    else r.anterior.push(a);
  }
  return r;
}

function textoRessalva(atrib, anos, temRetrato) {
  const partes = [];
  if (anos.length && !atrib.semGestao) {
    const base = `Os resultados descrevem o território em ${lista(anos.map(String))}, não só a gestão atual.`;
    const outros = [];
    if (atrib.anterior.length) outros.push(`${lista(atrib.anterior.map(String))} ${atrib.anterior.length > 1 ? 'são' : 'é'} de gestão anterior`);
    if (atrib.misto.length) outros.push(`${lista(atrib.misto.map(String))} ${atrib.misto.length > 1 ? 'foram divididos' : 'foi dividido'} entre gestões`);
    partes.push(outros.length ? `${base} Destes, ${outros.join('; ')}.` : 'Todos os anos considerados pertencem à gestão atual.');
  }
  if (temRetrato) partes.push('Saneamento é um retrato do Censo 2022 (agosto de 2022), não resultado da gestão atual.');
  return partes.join(' ');
}

/* ---------------------------- o índice ---------------------------- */

/**
 * entes: [{ id, uf, esfera: 'E'|'D'|'M', gestoes, coletado, valores }]  (valores vem de valoresDoEnte)
 * Devolve Map(id -> { nota, comp, parcial, motivo, ressalva, atribuicao, bloqueio }).
 */
export function calcularIndices(entes) {
  const pontos = pontuarIndicadores(entes);
  const saida = new Map();
  for (const e of entes) {
    const g = grupoDe(e.esfera);
    const meus = pontos.get(e.id);
    const comp = [];
    const anosDeResultado = new Set();
    let temRetrato = false;

    for (const area of M.componentes) {
      const definidos = M.indicadores.filter((i) => i.area === area.k);
      const inds = definidos.filter((i) => i.esferas.includes(g));
      const base = { k: area.k, peso: area.peso };
      if (!definidos.length) { comp.push({ ...base, s: null, sem: 'fonte', f: 'Ainda sem indicador de resultado com fonte aberta confirmada. O Placar não usa gasto como se fosse resultado.' }); continue; }
      if (!inds.length) { comp.push({ ...base, s: null, na: true, f: 'Não se aplica a prefeitos: a segurança pública é responsabilidade principalmente estadual.' }); continue; }

      const det = [];
      const frases = [];
      for (const ind of inds) {
        const val = e.valores?.[ind.k];
        const p = meus[ind.k];
        if (val && Number.isFinite(val.valor) && p) {
          det.push({ k: ind.k, s: p.s });
          for (const a of val.anos) if (!val.retrato) anosDeResultado.add(a);
          if (val.retrato) temRetrato = true;
          frases.push(`${ind.nome}: ${fmt(val.valor, ind.casas)} (${ind.unidade}, ${val.retrato ? 'Censo 2022' : periodo(val.anos)}); pontuação ${fmt(p.s)} entre ${p.n} ${p.grupo}.`);
        } else if (val && val.motivo) frases.push(`${ind.nome}: ${val.motivo}.`);
        else if (val && Number.isFinite(val.valor)) frases.push(`${ind.nome}: ${fmt(val.valor, ind.casas)} (${ind.unidade}), mas não há pares suficientes para comparar.`);
        else frases.push(`${ind.nome}: ${MSG_SEM_DADO}.`);
      }
      const s = det.length ? arredondar(det.reduce((t, d) => t + d.s, 0) / det.length, 1) : null;
      comp.push({ ...base, s, f: frases.join(' '), ...(det.length ? { n: det.length } : {}) });
    }

    const usadas = comp.filter((c) => c.s != null).length;
    const aplicaveis = comp.filter((c) => !c.na).length;
    const faltam = comp.filter((c) => c.s == null).map((c) => ({ k: c.k, motivo: c.na ? 'nao-se-aplica' : c.sem === 'fonte' ? 'sem-fonte' : 'sem-dado' }));
    const parcial = { usadas, aplicaveis, total: TOTAL_AREAS, faltam };
    const minimo = M.minAreas[g];
    const anos = [...anosDeResultado].sort((a, b) => a - b);
    const atrib = atribuicaoDosAnos(e.gestoes, anos);
    const atribuicao = { anos, atual: atrib.atual, misto: atrib.misto, anterior: atrib.anterior };

    // Quem tomou posse depois dos anos com resultado não pode ser avaliado por eles.
    if (anos.length && !atrib.semGestao && !atrib.atual.length && !atrib.misto.length) {
      const atual = e.gestoes.find((x) => x.situacao === 'em exercício');
      saida.set(e.id, { nota: null, comp: [], parcial: undefined, bloqueio: 'mandato-novo', atribuicao,
        motivo: `O mandato atual começou em ${atual.inicio.slice(0, 4)}; os resultados disponíveis são de ${lista(anos.map(String))}, anteriores à posse, e não podem ser atribuídos a esta gestão.` });
      continue;
    }

    const nota = mediaPonderada(comp.map((c) => ({ peso: c.peso, s: c.s })), minimo);
    let motivo;
    if (nota == null) {
      motivo = !e.coletado
        ? `Os resultados de saúde e educação ${g === 'M' ? 'deste município' : 'deste estado'} ainda não foram coletados no IBGE Cidades. A coleta avança alguns entes por dia e o índice aparece quando houver dados suficientes.`
        : `Só ${usadas} de ${aplicaveis} áreas têm dado confirmado; o índice precisa de pelo menos ${minimo}.`;
    }
    saida.set(e.id, { nota, comp, parcial, motivo, atribuicao, ressalva: nota != null ? textoRessalva(atrib, anos, temRetrato) : undefined });
  }
  return saida;
}

/* ---------------------------- rotina: lê os arquivos, calcula e grava ---------------------------- */

/** Copia a nota anterior para o item novo quando a rotina semanal reconstrói a lista e o índice ainda não foi refeito. */
export function herdarIndice(novo, antigo) {
  if (novo?.nota != null || antigo?.nota == null) return novo;
  for (const k of ['nota', 'comp', 'motivo', 'parcial', 'ressalva', 'atribuicao', 'rank']) if (antigo[k] !== undefined) novo[k] = antigo[k];
  return novo;
}

const aplicar = (item, r) => Object.assign(item, {
  nota: r.nota, comp: r.comp, motivo: r.motivo ?? undefined, parcial: r.parcial ?? undefined,
  ressalva: r.ressalva ?? undefined, atribuicao: r.atribuicao ?? undefined, bloqueio: r.bloqueio ?? undefined
});

/**
 * Todo dia, depois da coleta do IBGE Cidades: recalcula o índice de todos os governadores e prefeitos e regrava
 * governadores.json, prefeitos-{UF}.json e ranking-prefeitos.json. Não acessa a internet.
 */
export async function atualizarIndices({ pasta, hoje, log = () => {} }) {
  const arq = (n) => path.join(pasta, n);
  const janela = janelaDe48Meses(hoje);
  const gov = lerJsonSeExistir(arq('governadores.json'));
  const rankAntigo = lerJsonSeExistir(arq('ranking-prefeitos.json'));
  if (!gov?.itens?.length && !rankAntigo) return { ok: false, motivo: 'As listas de governadores e prefeitos ainda não existem (a rotina semanal do TSE e do Tesouro ainda não terminou).' };
  const ibge = lerJsonSeExistir(arq('ibge-contexto.json')) || {};
  const seg = lerSegurancaGuardada(pasta);
  const entes = [];
  const arquivosPref = {};

  for (const uf of UFS) {
    const doc = lerJsonSeExistir(arq(`prefeitos-${uf}.json`));
    if (!doc?.itens) continue;
    arquivosPref[uf] = doc;
    const cidades = lerJsonSeExistir(arq(`anos/cidades-${uf}.json`))?.itens || {};
    const adm = lerJsonSeExistir(arq(`administracoes-${uf}.json`));
    for (const p of doc.itens) {
      if (!p.ibge) continue;
      const ctx = contextoDoEnte(p.ibge, ibge);
      entes.push({ ref: p, id: `M${p.ibge}`, uf, esfera: 'M', gestoes: adm?.municipios?.[p.cod]?.gestoes || null, coletado: !!cidades[p.ibge]?.em,
        valores: valoresDoEnte({ esfera: 'M', reg: cidades[p.ibge], censo: ctx.censo, populacao: ctx.populacao?.valor ?? p.populacao, janela }) });
    }
  }
  for (const g of gov?.itens || []) {
    if (!g.ibge) continue;
    const cidades = lerJsonSeExistir(arq(`anos/cidades-${g.uf}.json`))?.itens || {};
    const adm = lerJsonSeExistir(arq(`administracoes-${g.uf}.json`));
    const ctx = contextoDoEnte(g.ibge, ibge);
    const esfera = g.uf === 'DF' ? 'D' : 'E';
    entes.push({ ref: g, id: `E${g.ibge}`, uf: g.uf, esfera, gestoes: adm?.estado?.gestoes || null, coletado: !!cidades[g.ibge]?.em,
      valores: valoresDoEnte({ esfera, reg: cidades[g.ibge], censo: ctx.censo, segUf: seg?.uf?.[g.uf], populacao: ctx.populacao?.valor ?? g.populacao, janela }) });
  }
  const calculado = calcularIndices(entes);
  for (const e of entes) aplicar(e.ref, calculado.get(e.id));

  // Quem não tem código do IBGE (não ligado ao Tesouro) fica sem índice, com o motivo.
  for (const doc of Object.values(arquivosPref)) for (const p of doc.itens) if (!p.ibge && p.nota == null && !p.motivo) p.motivo = 'Município não encontrado na base do Tesouro Nacional.';

  const todosPref = Object.values(arquivosPref).flatMap((d) => d.itens);
  const comNotaPref = atribuirPosicoes(todosPref);
  const exercicio = rankAntigo?.exercicio ?? Object.values(arquivosPref)[0]?.exercicio ?? null;
  const ano = rankAntigo?.ano ?? Object.values(arquivosPref)[0]?.ano ?? null;
  for (const [uf, doc] of Object.entries(arquivosPref)) gravarJson(arq(`prefeitos-${uf}.json`), { ...doc, uf });
  if (todosPref.length) gravarJson(arq('ranking-prefeitos.json'), { ano, exercicio, total: todosPref.length, comNota: comNotaPref, itens: todosPref.map(compacto) });

  let comNotaGov = 0;
  if (gov?.itens?.length) {
    comNotaGov = atribuirPosicoes(gov.itens);
    gravarJson(arq('governadores.json'), { ...gov, comNota: comNotaGov });
  }

  const cobertura = { prefeituras: { total: todosPref.length, comNota: comNotaPref, semColeta: entes.filter((e) => e.esfera === 'M' && !e.coletado).length,
    bloqueadas: entes.filter((e) => e.esfera === 'M' && calculado.get(e.id).bloqueio).length },
    estados: { total: gov?.itens?.length || 0, comNota: comNotaGov, semColeta: entes.filter((e) => e.esfera !== 'M' && !e.coletado).length,
      bloqueados: entes.filter((e) => e.esfera !== 'M' && calculado.get(e.id).bloqueio).length },
    segurancaDisponivel: !!seg };
  log(`Índice de serviços públicos: ${comNotaPref} de ${todosPref.length} prefeituras e ${comNotaGov} de ${gov?.itens?.length || 0} estados com índice (${cobertura.prefeituras.semColeta} prefeituras e ${cobertura.estados.semColeta} estados ainda sem coleta do IBGE Cidades).`);
  return {
    ok: true, cobertura,
    prefeitos: { total: todosPref.length, comNota: comNotaPref, media: mediaDasNotas(todosPref.filter((p) => p.nota != null).map((p) => p.nota)), destaques: destaques(todosPref) },
    governadores: { total: gov?.itens?.length || 0, comNota: comNotaGov, media: mediaDasNotas((gov?.itens || []).filter((g) => g.nota != null).map((g) => g.nota)), destaques: gov?.itens ? destaques(gov.itens, 5) : null }
  };
}
