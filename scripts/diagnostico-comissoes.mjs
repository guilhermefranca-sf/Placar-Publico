// Diagnóstico de LEITURA: presença em reuniões de comissões da Câmara dos Deputados.
//
// O que faz: baixa arquivos públicos da Câmara (eventos, órgãos de cada evento, presença dos deputados e
// membros de órgãos), conta o que existe neles, testa se dá para cruzá-los e escreve um relatório em texto.
// O que NÃO faz: não calcula nota, não lê nem grava nada em site/dados, não altera o repositório, não publica.
//
// Uso: node scripts/diagnostico-comissoes.mjs
// Variáveis opcionais (todas servem só para teste ou para mudar o recorte):
//   DIAG_ANOS=2025,2026   anos a ler (padrão: o ano passado e o atual)
//   DIAG_LEGISLATURA=57   legislatura do arquivo de membros de órgãos (padrão: calculada pela data)
//   DIAG_LOCAL=pasta      lê os CSV de uma pasta em vez de baixar (usado nos testes)
//   DIAG_SAIDA=pasta      onde gravar o relatório (padrão: diagnostico)

import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { buscar, percorrerCsv } from './util.mjs';

const ARQ = 'https://dadosabertos.camara.leg.br/arquivos';
const API = 'https://dadosabertos.camara.leg.br/api/v2';
const LOCAL = process.env.DIAG_LOCAL || '';
const SAIDA = process.env.DIAG_SAIDA || 'diagnostico';
const anoAtual = new Date().getFullYear();
const ANOS = (process.env.DIAG_ANOS || `${anoAtual - 1},${anoAtual}`).split(',').map((s) => Number(s.trim())).filter(Boolean);
const LEGISLATURA = Number(process.env.DIAG_LEGISLATURA || 57 + Math.floor((anoAtual - 2023) / 4));
const MIN_REUNIOES = 10; // referência só para o relatório: deputados com pelo menos tantas reuniões esperadas

// ---------- relatório ----------
const L = [];
const p = (s = '') => L.push(s);
const secao = (t) => { p(); p('='.repeat(80)); p(t); p('='.repeat(80)); };
let N_CABECALHO = 0;
const checagens = [];
const checar = (ok, texto) => checagens.push({ ok, texto });
const fmt = (n) => Number(n).toLocaleString('pt-BR');
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1).replace('.', ',')}%` : 'n/d');
const num1 = (n) => (n == null ? 'n/d' : Number(n).toFixed(1).replace('.', ','));
const somar = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
const topo = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

function quantil(v, q) {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
const resumoDistribuicao = (v, fator = 1, casas = 1) => {
  if (!v.length) return 'sem dados';
  const f = (q) => (quantil(v, q) * fator).toFixed(casas).replace('.', ',');
  return `mín ${f(0)} · 10% ${f(0.1)} · 25% ${f(0.25)} · mediana ${f(0.5)} · 75% ${f(0.75)} · 90% ${f(0.9)} · máx ${f(1)}`;
};

// ---------- leitura ----------
async function baixar(url) {
  try {
    if (LOCAL) {
      const f = path.join(LOCAL, path.basename(url));
      if (!existsSync(f)) throw new Error(`HTTP 404 (arquivo local ausente) em ${url}`);
      return { texto: readFileSync(f, 'utf8') };
    }
    return { texto: await buscar(url, { formato: 'texto', limiteMs: 300000, tentativas: 3 }) };
  } catch (e) {
    return { erro: String((e && e.message) || e) };
  }
}

/**
 * Acha uma coluna pelo nome, sem se importar com maiúsculas, acentos, ponto ou underline.
 * Se nenhum nome da lista existir, tenta o padrão de texto `alternativa` (expressão regular sobre o nome limpo).
 */
function achar(ix, candidatos, alternativa = null) {
  const limpo = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const mapa = new Map(Object.keys(ix).map((k) => [limpo(k), k]));
  for (const c of candidatos) {
    const k = mapa.get(limpo(c));
    if (k) return k;
  }
  if (alternativa) for (const [l, k] of mapa) if (alternativa.test(l)) return k;
  return null;
}

/** Baixa um CSV, imprime o resumo do arquivo e chama aoLer(linha, ix) para cada linha de dados. */
async function lerArquivo(rotulo, urls, aoLer) {
  p(`Arquivo: ${rotulo}`);
  for (const url of [].concat(urls)) {
    p(`  Endereço: ${url}`);
    const r = await baixar(url);
    if (r.erro) {
      p(`  FALHOU: ${r.erro}`);
      continue;
    }
    let linhas = 0;
    const exemplos = [];
    const { ix } = percorrerCsv(r.texto, (l, ix) => {
      linhas++;
      if (linhas <= 2) exemplos.push(l.map((v) => (v.length > 90 ? `${v.slice(0, 90)}…` : v)).join(' ; '));
      aoLer(l, ix);
    });
    p(`  Tamanho: ${(r.texto.length / 1048576).toFixed(1).replace('.', ',')} MB · linhas de dados: ${fmt(linhas)}`);
    p(`  Colunas: ${Object.keys(ix).join(' | ') || '(nenhuma)'}`);
    exemplos.forEach((e, i) => p(`  Exemplo ${i + 1}: ${e}`));
    return { ix, linhas };
  }
  return null;
}

/** Identificador a partir de um número ou de um endereço (.../orgaos/4 -> 4). */
const idDe = (v) => String(v ?? '').trim().replace(/\/+$/, '').split('/').pop();
const diaISO = (s) => {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
};
/** Data de membro: devolve número (dia), null (vazia) ou NaN (não entendi o formato). */
function diaMembro(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  const iso = diaISO(t);
  if (iso != null) return iso;
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : NaN;
}

function classeEvento(ev) {
  if (!ev) return 'evento-nao-encontrado';
  const t = ev.tipo || '';
  const deliberativa = /Deliberativa/i.test(t) && !/N[ãa]o\s+Deliberativa/i.test(t);
  const base = /^Sess[ãa]o/i.test(t) ? 'sessao-plenario' : deliberativa ? 'reuniao-deliberativa' : /Audi[êe]ncia/i.test(t) ? 'audiencia' : 'outro-tipo';
  return base + (/^Encerrada/i.test(ev.situacao || '') ? '' : ' (nao encerrado)');
}

// ---------- etapas ----------
const eventos = new Map(); // idEvento -> { data, tipo, situacao, local, ano }
const orgaosDoEvento = new Map(); // idEvento -> [{ id, sigla, nome }]
const presencaDelib = new Map(); // idEvento (reunião deliberativa encerrada) -> Set(idDeputado)
const deputadosComPresenca = new Set();
const membros = new Map(); // idOrgao -> [{ dep, cargo, tit, ini, fim }]
const tipoDoOrgao = new Map(); // idOrgao -> tipo (API)

async function etapaEventos() {
  secao('1. EVENTOS (reuniões, sessões, audiências...)');
  const porTipo = new Map();
  for (const ano of ANOS) {
    let c = null;
    const r = await lerArquivo(`eventos ${ano}`, `${ARQ}/eventos/csv/eventos-${ano}.csv`, (l, ix) => {
      c ||= { id: achar(ix, ['id', 'idEvento']), ini: achar(ix, ['dataHoraInicio']), tipo: achar(ix, ['descricaoTipo', 'tipo']), sit: achar(ix, ['situacao']), loc: achar(ix, ['localCamara.nome', 'localCamaraNome']) };
      if (!c.id) return;
      const tipo = c.tipo ? l[ix[c.tipo]] : '';
      const situacao = c.sit ? l[ix[c.sit]] : '';
      eventos.set(String(l[ix[c.id]]).trim(), { data: diaISO(c.ini ? l[ix[c.ini]] : ''), tipo, situacao, local: c.loc ? l[ix[c.loc]] : '', ano });
      const t = porTipo.get(tipo) || { total: 0, encerrados: 0 };
      t.total++;
      if (/^Encerrada/i.test(situacao)) t.encerrados++;
      porTipo.set(tipo, t);
    });
    if (!r) checar(false, `Arquivo de eventos de ${ano} não baixou.`);
    else if (!c || !c.id) checar(false, `Arquivo de eventos de ${ano}: não achei a coluna do identificador do evento.`);
    else checar(true, `Arquivo de eventos de ${ano} baixou e foi lido (${fmt(r.linhas)} linhas).`);
    p();
  }
  p('Tipos de evento (todos os anos lidos): total · encerrados');
  [...porTipo.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 30).forEach(([t, v]) => p(`  ${fmt(v.total).padStart(7)} · ${fmt(v.encerrados).padStart(7)}   ${t || '(vazio)'}`));
  const delib = [...eventos.values()].filter((e) => classeEvento(e) === 'reuniao-deliberativa').length;
  p(`Reuniões deliberativas encerradas (tipo contém "Deliberativa", sem "Não Deliberativa" e que não é sessão): ${fmt(delib)}`);
  checar(delib > 0, `Existem reuniões deliberativas encerradas fora do Plenário nos arquivos de eventos (${fmt(delib)}).`);
}

async function etapaEventosOrgaos() {
  secao('2. ÓRGÃO QUE SEDIOU CADA EVENTO');
  for (const ano of ANOS) {
    let c = null;
    const r = await lerArquivo(`eventosOrgaos ${ano}`, `${ARQ}/eventosOrgaos/csv/eventosOrgaos-${ano}.csv`, (l, ix) => {
      c ||= { ev: achar(ix, ['idEvento', 'id_evento'], /^id.*evento|evento.*id$/), org: achar(ix, ['idOrgao', 'id_orgao'], /^id.*orgao|orgao.*id$/), sigla: achar(ix, ['siglaOrgao', 'sigla']), nome: achar(ix, ['nomeOrgao', 'nome']) };
      if (!c.ev || !c.org) return;
      const ev = String(l[ix[c.ev]]).trim();
      const lista = orgaosDoEvento.get(ev) || [];
      lista.push({ id: String(l[ix[c.org]]).trim(), sigla: c.sigla ? l[ix[c.sigla]] : '', nome: c.nome ? l[ix[c.nome]] : '' });
      orgaosDoEvento.set(ev, lista);
    });
    if (!r) checar(false, `Arquivo de órgãos por evento de ${ano} não baixou.`);
    else if (!c || !c.ev || !c.org) checar(false, `Arquivo de órgãos por evento de ${ano}: não achei as colunas de evento e de órgão (veja "Colunas" acima).`);
    else checar(true, `Arquivo de órgãos por evento de ${ano} baixou e foi lido (${fmt(r.linhas)} linhas).`);
    p();
  }
  const delib = [...eventos.entries()].filter(([, e]) => classeEvento(e) === 'reuniao-deliberativa');
  const comOrgao = delib.filter(([id]) => orgaosDoEvento.has(id)).length;
  p(`Reuniões deliberativas encerradas com pelo menos um órgão ligado: ${fmt(comOrgao)} de ${fmt(delib.length)} (${pct(comOrgao, delib.length)})`);
  if (delib.length) checar(comOrgao / delib.length >= 0.95, `Cada reunião deliberativa se liga a um órgão (${pct(comOrgao, delib.length)} ligadas; o esperado é 95% ou mais).`);
}

async function etapaPresenca() {
  secao('3. PRESENÇA DOS DEPUTADOS EM EVENTOS');
  const porClasse = new Map();
  const eventosPorClasse = new Map();
  const vistos = new Set();
  for (const ano of ANOS) {
    let c = null;
    const r = await lerArquivo(`eventosPresencaDeputados ${ano}`, `${ARQ}/eventosPresencaDeputados/csv/eventosPresencaDeputados-${ano}.csv`, (l, ix) => {
      c ||= { ev: achar(ix, ['idEvento'], /^id.*evento|evento.*id$/), dep: achar(ix, ['idDeputado'], /^id.*deputado|deputado.*id$/) };
      if (!c.ev || !c.dep) return;
      const ev = String(l[ix[c.ev]]).trim();
      const dep = String(l[ix[c.dep]]).trim();
      const classe = classeEvento(eventos.get(ev));
      somar(porClasse, classe);
      deputadosComPresenca.add(dep);
      const chave = `${classe}|${ev}`;
      if (!vistos.has(chave)) { vistos.add(chave); somar(eventosPorClasse, classe); }
      if (classe === 'reuniao-deliberativa') {
        if (!presencaDelib.has(ev)) presencaDelib.set(ev, new Set());
        presencaDelib.get(ev).add(dep);
      }
    });
    if (!r) checar(false, `Arquivo de presença de ${ano} não baixou.`);
    else if (!c || !c.ev || !c.dep) checar(false, `Arquivo de presença de ${ano}: não achei as colunas de evento e de deputado.`);
    else checar(true, `Arquivo de presença de ${ano} baixou e foi lido (${fmt(r.linhas)} linhas).`);
    p();
  }
  p('Linhas de presença por tipo de evento (cruzando com o arquivo de eventos): linhas · eventos distintos');
  [...porClasse.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => p(`  ${fmt(v).padStart(9)} · ${fmt(eventosPorClasse.get(k) || 0).padStart(6)}   ${k}`));
  p(`Deputados distintos com alguma presença registrada: ${fmt(deputadosComPresenca.size)}`);
  const linhasComissao = porClasse.get('reuniao-deliberativa') || 0;
  checar(linhasComissao > 0, `O arquivo de presença traz presença em reuniões deliberativas de comissão (${fmt(linhasComissao)} linhas).`);
  const semEvento = porClasse.get('evento-nao-encontrado') || 0;
  const total = [...porClasse.values()].reduce((a, b) => a + b, 0);
  p(`Linhas de presença cujo evento não está no arquivo de eventos: ${fmt(semEvento)} (${pct(semEvento, total)})`);
  const naoEnc = [...porClasse.entries()].filter(([k]) => k.includes('(nao encerrado)')).reduce((a, [, v]) => a + v, 0);
  p(`Linhas de presença em eventos ainda não encerrados (a documentação diz que trazem os membros esperados, não presença real): ${fmt(naoEnc)} (${pct(naoEnc, total)})`);
}

/** Se o arquivo de membros não baixou, olha a estrutura de uma consulta da API só para sabermos como seguir. */
async function sondarMembrosPelaApi() {
  p();
  p('  Sonda alternativa: consulta da API com os membros de um órgão (só para ver a estrutura)');
  try {
    const idOrgao = [...orgaosDoEvento.values()].flat().map((o) => o.id).find(Boolean);
    if (!idOrgao) { p('  Sem órgão conhecido para testar.'); return; }
    let r;
    if (LOCAL) {
      const f = path.join(LOCAL, 'api-membros.json');
      if (!existsSync(f)) { p('  (modo de teste: sem arquivo api-membros.json, sonda pulada)'); return; }
      r = JSON.parse(readFileSync(f, 'utf8'));
    } else {
      r = await buscar(`${API}/orgaos/${encodeURIComponent(idOrgao)}/membros?itens=5`, { formato: 'json', tentativas: 3 });
    }
    const dados = r.dados || [];
    p(`  Órgão testado: ${idOrgao} · membros devolvidos: ${dados.length}`);
    if (dados[0]) p(`  Campos de cada membro: ${Object.keys(dados[0]).join(' | ')}`);
    dados.slice(0, 2).forEach((m, i) => p(`  Exemplo ${i + 1}: ${JSON.stringify(m).slice(0, 300)}`));
  } catch (e) {
    p(`  Sonda FALHOU: ${(e && e.message) || e}`);
  }
}

async function etapaMembros() {
  secao('4. MEMBROS DE ÓRGÃOS (cargo e datas)');
  const base = `${ARQ}/orgaosDeputados/csv`;
  let c = null;
  const valoresCargo = new Map();
  const cont = { linhas: 0, semIni: 0, iniRuim: 0, semFim: 0, fimRuim: 0 };
  const r = await lerArquivo(`orgaosDeputados (legislatura ${LEGISLATURA})`, [`${base}/orgaosDeputados-L${LEGISLATURA}.csv`, `${base}/orgaosDeputados-${LEGISLATURA}.csv`, `${base}/orgaosDeputados.csv`], (l, ix) => {
    c ||= {
      dep: achar(ix, ['idDeputado', 'uriDeputado'], /^id.*deputado|deputado.*id$/), org: achar(ix, ['idOrgao', 'uriOrgao'], /^id.*orgao|orgao.*id$/),
      cargo: achar(ix, ['titulo', 'cargo', 'nomeCargo', 'nomeTitulo', 'siglaTitulo', 'descricaoTitulo', 'codTitulo', 'codCargo']),
      ini: achar(ix, ['dataInicio', 'dataInicial', 'inicio']), fim: achar(ix, ['dataFim', 'dataFinal', 'fim'])
    };
    if (!c.dep || !c.org) return;
    const cargo = c.cargo ? String(l[ix[c.cargo]]).trim() : '';
    somar(valoresCargo, cargo || '(vazio)');
    const ini = c.ini ? diaMembro(l[ix[c.ini]]) : null;
    const fim = c.fim ? diaMembro(l[ix[c.fim]]) : null;
    cont.linhas++;
    if (ini === null) cont.semIni++; else if (Number.isNaN(ini)) cont.iniRuim++;
    if (fim === null) cont.semFim++; else if (Number.isNaN(fim)) cont.fimRuim++;
    const org = idDe(l[ix[c.org]]);
    const lista = membros.get(org) || [];
    lista.push({ dep: idDe(l[ix[c.dep]]), cargo, tit: c.cargo ? !/suplente/i.test(cargo) : null, ini: Number.isNaN(ini) ? null : ini, fim: Number.isNaN(fim) ? null : fim });
    membros.set(org, lista);
  });
  if (!r) {
    checar(false, 'Arquivo de membros de órgãos não baixou (veja os endereços tentados acima). Me mande o endereço certo em https://dadosabertos.camara.leg.br/swagger/api.html?tab=staticfile (arquivo "orgaosDeputados").');
    await sondarMembrosPelaApi();
    return;
  }
  if (!c || !c.dep || !c.org) { checar(false, 'Arquivo de membros: não achei as colunas de deputado e de órgão.'); return; }
  p(`  Colunas usadas (o id é tirado do endereço quando a coluna é uri...): deputado=${c.dep} · órgão=${c.org} · cargo=${c.cargo || '(não achei)'} · início=${c.ini || '(não achei)'} · fim=${c.fim || '(não achei)'}`);
  p('  Valores da coluna de cargo (mais comuns):');
  topo(valoresCargo, 15).forEach(([k, v]) => p(`    ${fmt(v).padStart(7)}   ${k}`));
  p(`  Datas: início vazio ${fmt(cont.semIni)} · início em formato desconhecido ${fmt(cont.iniRuim)} · fim vazio (cargo em aberto) ${fmt(cont.semFim)} · fim em formato desconhecido ${fmt(cont.fimRuim)}`);
  const temTitular = [...valoresCargo.keys()].some((k) => /titular/i.test(k));
  checar(!!c.cargo && temTitular, `O arquivo de membros identifica titulares e suplentes pela coluna de cargo (${c.cargo ? (temTitular ? 'sim' : 'não vi o valor "Titular"; veja a lista de cargos') : 'não achei coluna de cargo'}).`);
  checar(!!c.ini && cont.iniRuim === 0 && cont.semIni < cont.linhas * 0.1, 'As datas de início dos cargos existem e estão em formato legível.');
}

async function etapaApiOrgaos() {
  secao('5. TIPO DE CADA ÓRGÃO (API da Câmara, só para separar comissões permanentes)');
  try {
    let paginas = [];
    if (LOCAL) {
      const f = path.join(LOCAL, 'api-orgaos.json');
      if (existsSync(f)) paginas = [JSON.parse(readFileSync(f, 'utf8'))];
      else { p('  (modo de teste: sem arquivo api-orgaos.json, etapa pulada)'); return; }
    } else {
      for (let pg = 1; pg <= 25; pg++) {
        const r = await buscar(`${API}/orgaos?itens=100&pagina=${pg}&ordem=ASC&ordenarPor=id`, { formato: 'json', tentativas: 3 });
        paginas.push(r);
        if ((r.dados || []).length < 100) break;
      }
    }
    const todos = paginas.flatMap((r) => r.dados || []);
    p(`  Órgãos listados: ${fmt(todos.length)}`);
    if (todos[0]) p(`  Campos de cada órgão: ${Object.keys(todos[0]).join(' | ')}`);
    const porTipo = new Map();
    for (const o of todos) {
      const tipo = String(o.tipoOrgao ?? o.tipo ?? o.codTipoOrgao ?? '(sem tipo)');
      tipoDoOrgao.set(String(o.id), tipo);
      somar(porTipo, tipo);
    }
    p('  Tipos de órgão: quantidade');
    topo(porTipo, 20).forEach(([k, v]) => p(`    ${fmt(v).padStart(6)}   ${k}`));
  } catch (e) {
    p(`  FALHOU: ${(e && e.message) || e}. O cruzamento seguirá sem separar comissões permanentes.`);
  }
}

function cruzar(rotulo, filtroOrgao, maxOrgaos = 12) {
  p(`--- ${rotulo} ---`);
  const porDep = new Map(); // dep -> { esp, pres }
  const porOrgao = new Map(); // sigla -> { reunioes, esp, pres }
  let reunioes = 0;
  let semMembros = 0;
  let presentesNaoTitulares = 0;
  let presentesTotal = 0;
  const razoesPorReuniao = []; // fração dos titulares esperados que compareceu, reunião a reunião
  for (const [id, ev] of eventos) {
    if (classeEvento(ev) !== 'reuniao-deliberativa' || ev.data == null) continue;
    const orgs = (orgaosDoEvento.get(id) || []).filter((o) => filtroOrgao(o));
    if (!orgs.length) continue;
    const presentes = presencaDelib.get(id) || new Set();
    const esperados = new Set();
    for (const o of orgs) {
      let esp = 0;
      let pres = 0;
      for (const m of membros.get(o.id) || []) {
        if (m.tit !== true) continue;
        if ((m.ini != null && m.ini > ev.data) || (m.fim != null && m.fim < ev.data)) continue;
        esperados.add(m.dep);
        esp++;
        if (presentes.has(m.dep)) pres++;
      }
      const chave = o.sigla || o.id;
      const a = porOrgao.get(chave) || { reunioes: 0, esp: 0, pres: 0 };
      a.reunioes++; a.esp += esp; a.pres += pres;
      porOrgao.set(chave, a);
    }
    if (!esperados.size) { semMembros++; continue; }
    reunioes++;
    for (const dep of esperados) {
      const a = porDep.get(dep) || { esp: 0, pres: 0 };
      a.esp++;
      if (presentes.has(dep)) a.pres++;
      porDep.set(dep, a);
    }
    razoesPorReuniao.push([...esperados].filter((d) => presentes.has(d)).length / esperados.size);
    presentesTotal += presentes.size;
    for (const dep of presentes) if (!esperados.has(dep)) presentesNaoTitulares++;
  }
  const deps = [...porDep.values()];
  const comMin = deps.filter((d) => d.esp >= MIN_REUNIOES);
  p(`  Reuniões analisadas (com órgão e com titulares ativos na data): ${fmt(reunioes)} · sem nenhum titular ativo achado: ${fmt(semMembros)}`);
  p(`  Presentes que não eram titulares do órgão da reunião (suplentes ou visitantes): ${fmt(presentesNaoTitulares)} de ${fmt(presentesTotal)} presenças (${pct(presentesNaoTitulares, presentesTotal)})`);
  p(`  Deputados com pelo menos 1 reunião esperada como titular: ${fmt(deps.length)}`);
  p(`  Deputados com pelo menos ${MIN_REUNIOES} reuniões esperadas: ${fmt(comMin.length)} (${pct(comMin.length, deps.length)})`);
  p(`  Reuniões esperadas por deputado: ${resumoDistribuicao(deps.map((d) => d.esp), 1, 0)}`);
  p(`  Comparecimento (% das reuniões esperadas) entre os com ${MIN_REUNIOES}+ reuniões: ${resumoDistribuicao(comMin.map((d) => d.pres / d.esp), 100, 0)}`);
  p(`  Com 100% de comparecimento: ${fmt(comMin.filter((d) => d.pres === d.esp).length)} · abaixo de 50%: ${fmt(comMin.filter((d) => d.pres / d.esp < 0.5).length)}`);
  p(`  Comparecimento dos titulares por reunião (% dos esperados): ${resumoDistribuicao(razoesPorReuniao, 100, 0)}`);
  p(`  Reuniões com menos de 10% dos titulares presentes: ${fmt(razoesPorReuniao.filter((r) => r < 0.1).length)} de ${fmt(razoesPorReuniao.length)} (${pct(razoesPorReuniao.filter((r) => r < 0.1).length, razoesPorReuniao.length)})`);
  p('  Órgãos com mais reuniões deliberativas: reuniões · comparecimento dos titulares');
  [...porOrgao.entries()].sort((a, b) => b[1].reunioes - a[1].reunioes).slice(0, maxOrgaos).forEach(([k, v]) => p(`    ${fmt(v.reunioes).padStart(5)} · ${pct(v.pres, v.esp).padStart(6)}   ${k}`));
  return { deps: deps.length, comMin: comMin.length, reunioes };
}

async function etapaCruzamento() {
  secao('6. CRUZAMENTO: quem era titular em cada reunião e quem compareceu');
  const nMembros = [...membros.values()].reduce((a, l) => a + l.length, 0);
  if (!nMembros || !eventos.size || !presencaDelib.size) {
    p('Sem dados suficientes para o cruzamento (veja as falhas acima).');
    checar(false, 'O cruzamento titular x presença não pôde ser feito.');
    return;
  }
  const todos = cruzar('Todas as comissões e órgãos', () => true);
  let perm = null;
  if (tipoDoOrgao.size) {
    p();
    perm = cruzar('Somente Comissões Permanentes (tipo exato "Comissão Permanente")', (o) => tipoDoOrgao.get(o.id) === 'Comissão Permanente', 40);
  }
  const alvo = perm && perm.deps ? perm : todos;
  const ok = alvo.deps > 0 && alvo.comMin / alvo.deps >= 0.6;
  checar(ok, `O cruzamento dá base de reuniões para a maioria dos deputados titulares (${fmt(alvo.comMin)} de ${fmt(alvo.deps)} têm ${MIN_REUNIOES}+ reuniões esperadas; o esperado é 60% ou mais).`);
}

// ---------- execução ----------
async function principal() {
  p('DIAGNÓSTICO DE LEITURA: presença em comissões da Câmara dos Deputados');
  p(`Gerado em: ${new Date().toISOString()}`);
  p(`Anos lidos: ${ANOS.join(', ')} · legislatura dos membros: ${LEGISLATURA}${LOCAL ? ' · MODO DE TESTE (arquivos locais)' : ''}`);
  p('Este relatório só LÊ arquivos públicos. Não calcula nota, não grava em site/dados e não publica nada.');
  N_CABECALHO = L.length;
  const etapas = [etapaEventos, etapaEventosOrgaos, etapaPresenca, etapaMembros, etapaApiOrgaos, etapaCruzamento];
  for (const etapa of etapas) {
    try {
      await etapa();
    } catch (e) {
      p(`FALHA INESPERADA na etapa ${etapa.name}: ${(e && e.stack) || e}`);
      checar(false, `Falha inesperada na etapa ${etapa.name}.`);
    }
  }
}

function montarRelatorio() {
  const falhas = checagens.filter((c) => !c.ok).length;
  const topoRel = [];
  topoRel.push(...L.slice(0, N_CABECALHO));
  topoRel.push('', '='.repeat(80), 'RESUMO: o que foi confirmado', '='.repeat(80));
  checagens.forEach((c) => topoRel.push(`  [${c.ok ? 'OK' : 'ATENÇÃO'}] ${c.texto}`));
  topoRel.push('', falhas === 0
    ? 'Indicativo automático: a presença em comissões parece VIÁVEL com estes arquivos. A decisão do peso continua sendo nossa.'
    : `Indicativo automático: ${falhas} ponto(s) em ATENÇÃO. Leia os detalhes abaixo antes de decidir; pode ser preciso ajustar o método.`);
  return [...topoRel, ...L.slice(N_CABECALHO)].join('\n') + '\n';
}

try {
  await principal();
} finally {
  const texto = montarRelatorio();
  mkdirSync(SAIDA, { recursive: true });
  const arq = path.join(SAIDA, 'diagnostico-comissoes.txt');
  writeFileSync(arq, texto);
  console.log(texto);
  console.log(`\nRelatório gravado em ${arq}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Diagnóstico de presença em comissões\n\n\`\`\`text\n${texto.slice(0, 900000)}\n\`\`\`\n`);
  }
}
