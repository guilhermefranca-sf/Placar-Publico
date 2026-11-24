'use strict';

/* =====================================================================
   Placar Público — modo demonstração
   TUDO AQUI É INVENTADO. Serve só para mostrar como o site fica quando
   alguém abre os arquivos sem a pasta "dados" (por exemplo, dando dois
   cliques no index.html). Nenhum nome, partido, município ou número
   deste arquivo corresponde a uma pessoa ou a uma conta real.
   O formato dos dados é igual ao que a rotina de atualização gera.
   ===================================================================== */

const DEMO = { pronto: false };

function aleatorio(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO_PRIMEIROS = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabriela', 'Hugo', 'Iara', 'João', 'Karina', 'Luís', 'Marta', 'Nelson', 'Olívia', 'Paulo', 'Rita', 'Sérgio', 'Tânia', 'Ulisses', 'Vera', 'Wagner', 'Yara', 'Zeca'];
const DEMO_SOBRENOMES = ['Exemplo', 'Amostra', 'Modelo', 'Teste', 'Ilustrativo', 'Fictício', 'Simulado', 'Demonstrativo'];
const DEMO_PARTIDOS = ['ALFA', 'BETA', 'GAMA', 'DELTA', 'SIGMA', 'ZETA', 'TETA'];
const DEMO_PREFIXOS = ['São', 'Santa', 'Vila', 'Nova', 'Porto', 'Alto', 'Bela', 'Campo'];
const DEMO_BASES = ['Exemplo', 'Amostra', 'Modelo', 'Teste', 'Ficção', 'Demo', 'Simula', 'Mostra', 'Ilustra', 'Esboço'];
const DEMO_INSTRUCAO = ['Superior completo', 'Ensino médio completo', 'Ensino fundamental completo', 'Superior incompleto'];
const DEMO_OCUPACAO = ['Advogado', 'Empresário', 'Professor', 'Servidor público', 'Comerciante', 'Médico', 'Agricultor', 'Engenheiro'];
const DEMO_BANCADA = { SP: 70, MG: 53, RJ: 46, BA: 39, RS: 31, PR: 30, PE: 25, CE: 22, MA: 18, PA: 17, GO: 17, SC: 16, PB: 12, ES: 10, PI: 10, AL: 9, AM: 8, MT: 8, RN: 8, DF: 8, MS: 8, SE: 8, RO: 8, TO: 8, AC: 8, AP: 8, RR: 8 };

function demoPessoa(r, extra = {}) {
  const pick = lista => lista[Math.floor(r() * lista.length)];
  const nome = `${pick(DEMO_PRIMEIROS)} ${String.fromCharCode(65 + Math.floor(r() * 26))}. ${pick(DEMO_SOBRENOMES)}`;
  return {
    nome, urna: nome.split(' ')[0], partido: pick(DEMO_PARTIDOS), situacao: 'Eleito',
    idade: 28 + Math.floor(r() * 45), instrucao: pick(DEMO_INSTRUCAO), ocupacao: pick(DEMO_OCUPACAO), ...extra
  };
}

function demoPosicoes(itens) {
  const com = itens.filter(i => i.nota != null).sort((a, b) => b.nota - a.nota || a.nome.localeCompare(b.nome, 'pt-BR'));
  com.forEach((i, k) => { i.rank = k + 1; });
  itens.filter(i => i.nota == null).forEach(i => { i.rank = null; });
  return com.length;
}

const demoMedia = itens => {
  const v = itens.filter(i => i.nota != null).map(i => i.nota);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null;
};
const demoNota = (comp, pesos) => {
  const soma = comp.reduce((a, c) => a + pesos[c.k], 0);
  return Math.round(comp.reduce((a, c) => a + c.s * pesos[c.k], 0) / soma * 10) / 10;
};
const demoRound = x => Math.round(x * 10) / 10;
const demoPct = n => n.toLocaleString('pt-BR');

function demoConstruir() {
  if (DEMO.pronto) return;
  const r = aleatorio(20261118);
  const SESS_ANO = 118, VOT_ANO = 64;                 // o ano em curso
  const SESSOES = 430, VOTACOES = 232;               // os últimos 4 anos (2023 a 2026)

  /* Deputados federais */
  const federais = [];
  let contador = 900000;
  for (const uf of UFS) {
    for (let i = 0; i < DEMO_BANCADA[uf]; i++) {
      const p = demoPessoa(r, { id: String(++contador), uf });
      const pres = demoRound(100 - Math.pow(r(), 1.7) * 85);
      const vot = demoRound(100 - Math.pow(r(), 1.8) * 80);
      const proj = demoRound(r() * 100);
      const cota = demoRound(r() * 100);
      const nProj = Math.round(proj / 100 * 150);
      const gasto = Math.round(240000 + (100 - cota) / 100 * 2600000);
      const item = {
        id: p.id, nome: p.nome, partido: p.partido, uf,
        desde: '2023-02-01',
        comp: [
          { k: 'pres', s: pres, f: `Presente em ${Math.round(pres / 100 * SESSOES)} de ${SESSOES} sessões deliberativas do Plenário desde 01/02/2023 (${Math.round(pres)}%).` },
          { k: 'vot', s: vot, f: `Registrou voto em ${Math.round(vot / 100 * VOTACOES)} de ${VOTACOES} votações nominais do Plenário desde 01/02/2023.` },
          { k: 'proj', s: proj, f: `Apresentou ${nProj} projetos e propostas desde 01/02/2023, mais do que ${Math.floor(proj)}% dos deputados.` },
          { k: 'cota', s: cota, f: `Gastou R$ ${demoPct(gasto)} da cota desde 01/02/2023, menos do que ${Math.floor(100 - cota)}% dos colegas de ${uf}.` }
        ]
      };
      item.nota = demoNota(item.comp, { pres: 30, vot: 25, proj: 20, cota: 25 });
      item.extra = { sessoes: [Math.round(pres / 100 * SESSOES), SESSOES], votos: [Math.round(vot / 100 * VOTACOES), VOTACOES], projetos: nProj, gasto, meses: 45.5 };
      federais.push(item);
    }
  }
  [4, 120, 301].forEach((k, n) => {
    federais[k].nota = null; federais[k].comp = []; delete federais[k].extra;
    federais[k].motivo = n === 0 ? 'Só 12 sessões deliberativas desde a primeira presença (03/09/2026); o mínimo é 20.' : 'Sem presença registrada em sessões deliberativas do Plenário nos últimos 4 anos (2023 a 2026).';
  });
  const fedCom = demoPosicoes(federais);

  /* Prefeitos e governadores */
  const executivo = (r2, esfera) => {
    const limP = esfera === 'M' ? 54 : 49, limD = esfera === 'M' ? 120 : 200;
    const pessoal = demoRound(limP * (0.55 + r2() * 0.6));
    const divida = demoRound(limD * (r2() * 0.9) - (r2() < 0.2 ? limD * 0.2 : 0));
    const feitas = r2() < 0.8 ? 10 : 6 + Math.floor(r2() * 4);
    const sP = demoRound(Math.max(0, Math.min(100, 100 * (1.1 - pessoal / limP) / 0.3)));
    const sD = demoRound(Math.max(0, Math.min(100, 100 * (1 - Math.max(0, divida) / limD) / 0.5)));
    const comp = [
      { k: 'pessoal', s: sP, f: `Gastou ${pessoal.toLocaleString('pt-BR')}% da receita corrente líquida com pessoal em 2025. O limite da Lei de Responsabilidade Fiscal é ${limP}%.` },
      { k: 'divida', s: sD, f: `Dívida consolidada líquida de ${divida.toLocaleString('pt-BR')}% da receita corrente líquida. O limite é ${limD}%.` }
    ];
    const contas = { pessoal, divida, limitePessoal: limP, limiteDivida: limD, rgf: 'Q3', entregas: { feitas, esperado: 10, rreo: Math.min(6, feitas), rgf: Math.max(0, Math.min(3, feitas - 6)), dca: feitas >= 10 ? 1 : 0 } };
    return { comp, contas, nota: demoNota(comp, { pessoal: 60, divida: 40 }) };
  };

  const prefeitos = {};
  const todosPref = [];
  let cp = 800000000;
  for (const uf of UFS) {
    if (uf === 'DF') continue;
    prefeitos[uf] = [];
    for (let k = 0; k < 15; k++) {
      const municipio = `${DEMO_PREFIXOS[(k + uf.charCodeAt(0)) % DEMO_PREFIXOS.length]} ${DEMO_BASES[k % DEMO_BASES.length]}${k >= DEMO_BASES.length ? ' ' + (k - DEMO_BASES.length + 2) : ''}`;
      const p = demoPessoa(r, { id: String(++cp), uf, municipio, cod: String(10000 + k), ibge: 1000000 + cp % 100000, populacao: Math.round(2000 + r() * r() * 900000) });
      if (r() < 0.1) Object.assign(p, { nota: null, comp: [], motivo: 'O Tesouro Nacional não tem os relatórios fiscais de 2025 desta administração.' });
      else Object.assign(p, executivo(r, 'M'));
      prefeitos[uf].push(p);
      todosPref.push(p);
    }
  }
  const prefCom = demoPosicoes(todosPref);

  const governadores = UFS.map(uf => {
    const g = demoPessoa(r, { id: String(700000 + UFS.indexOf(uf)), uf, ibge: 10 + UFS.indexOf(uf), populacao: Math.round(500000 + r() * 40000000) });
    return Object.assign(g, executivo(r, uf === 'DF' ? 'D' : 'E'));
  });
  const govCom = demoPosicoes(governadores);

  const compacto = i => ({ id: i.id, nome: i.nome, partido: i.partido, uf: i.uf, nota: i.nota, rank: i.rank, ...(i.municipio ? { municipio: i.municipio } : {}) });
  const agora = new Date().toISOString();

  DEMO.federais = { ano: 2026, janela: { anos: 4, de: 2023, ate: 2026 }, geradoEm: agora, sessoes: SESSOES, votacoes: VOTACOES, sessoesAno: SESS_ANO, votacoesAno: VOT_ANO, total: federais.length, comNota: fedCom, media: demoMedia(federais), itens: federais };
  DEMO.prefeitos = prefeitos;
  DEMO.ranking = { ano: 2024, exercicio: 2025, total: todosPref.length, comNota: prefCom, itens: todosPref.map(compacto) };
  DEMO.governadores = { ano: 2022, exercicio: 2025, total: governadores.length, comNota: govCom, itens: governadores };
  DEMO.estaduais = {};
  DEMO.vereadores = {};
  DEMO.meta = {
    versao: 1, geradoEm: agora, demo: true,
    fontes: {
      camara: { ok: true, atualizadoEm: agora, ano: 2026, janela: { anos: 4, de: 2023, ate: 2026 }, sessoes: SESSOES, votacoes: VOTACOES, sessoesAno: SESS_ANO, votacoesAno: VOT_ANO },
      tse: { ok: true, atualizadoEm: agora, eleicoes: { municipal: 2024, governadores: 2022, estaduais: 2022 }, avisos: 0 },
      siconfi: { ok: true, atualizadoEm: agora, exercicio: 2025, entes: todosPref.length + governadores.length, comErro: 0 },
      historico: { ok: true, atualizadoEm: agora, total: federais.length, falhas: 0, semHistorico: 0 },
      administracoes: { ok: true, atualizadoEm: agora }, ibge: { ok: true, atualizadoEm: agora }, presidente: { ok: true, atualizadoEm: agora }, series: { ok: true, atualizadoEm: agora }
    },
    cargos: {
      federais: { total: federais.length, comNota: fedCom, media: demoMedia(federais) },
      governadores: { total: governadores.length, comNota: govCom, media: demoMedia(governadores) },
      prefeitos: { total: todosPref.length, comNota: prefCom, media: demoMedia(todosPref) },
      estaduais: { total: 0 }, vereadores: { total: 0 }
    }
  };
  let totE = 0, totV = 0;
  for (const uf of UFS) {
    const nE = Math.min(94, DEMO_BANCADA[uf] * 2);
    const rE = aleatorio(1000 + UFS.indexOf(uf));
    DEMO.estaduais[uf] = { uf, ano: 2022, itens: Array.from({ length: nE }, (_, k) => demoPessoa(rE, { id: String(600000 + UFS.indexOf(uf) * 100 + k), uf, situacao: k % 3 ? 'Eleito por quociente partidário' : 'Eleito por média' })) };
    totE += nE;
    if (uf === 'DF') { DEMO.vereadores[uf] = null; continue; }
    const rV = aleatorio(5000 + UFS.indexOf(uf));
    const itens = [];
    prefeitos[uf].forEach((p, k) => {
      const n = 9 + (k % 5);
      for (let v = 0; v < n; v++) itens.push(demoPessoa(rV, { id: String(500000000 + UFS.indexOf(uf) * 10000 + k * 20 + v), uf, municipio: p.municipio, cod: p.cod }));
    });
    DEMO.vereadores[uf] = { uf, ano: 2024, itens };
    totV += itens.length;
  }
  DEMO.meta.cargos.estaduais.total = totE;
  DEMO.meta.cargos.vereadores.total = totV;

  /* Como votou? (votações fictícias, com matérias que não existem) */
  const rv = aleatorio(777);
  const TIPOS_DEMO = ['principal', 'emenda', 'destaque', 'requerimento', 'principal', 'substitutivo'];
  const votacoes = Array.from({ length: VOT_ANO }, (_, k) => {
    const tipo = TIPOS_DEMO[k % TIPOS_DEMO.length];
    const sim = 180 + Math.floor(rv() * 260), nao = 20 + Math.floor(rv() * 220);
    const d = new Date(Date.UTC(2026, 10, 12 - k * 2)).toISOString().slice(0, 10);
    const materia = `${tipo === 'requerimento' ? 'REQ' : 'PL'} ${9000 + k}/2026`;
    return {
      id: `DEMO${k}`, data: d, tipo, materia,
      titulo: tipo === 'principal' ? 'Aprovado o projeto fictício de demonstração.' : tipo === 'emenda' ? 'Rejeitada a emenda fictícia nº 2.' : tipo === 'destaque' ? 'Rejeitado o destaque fictício da bancada de exemplo.' : tipo === 'requerimento' ? 'Aprovado o requerimento fictício de urgência.' : 'Aprovado o substitutivo fictício.',
      aprovacao: sim > nao ? 1 : 0, sim, nao, outros: Math.floor(rv() * 12),
      resumo: `Ementa inventada ${k + 1}: dispõe sobre assunto de demonstração, sem relação com nenhuma lei real.`,
      fonte: 'https://dadosabertos.camara.leg.br/api/v2/votacoes/DEMO', portal: 'https://www.camara.leg.br/'
    };
  });
  const letras = {};
  federais.forEach(f => {
    const taxa = f.comp.length ? f.comp.find(c => c.k === 'vot').s / 100 : 0;
    letras[f.id] = votacoes.map((v, k) => {
      if (!f.comp.length) return '-';
      if (rv() > taxa) return '-';
      const x = rv();
      return x < 0.55 ? 'S' : x < 0.88 ? 'N' : x < 0.95 ? 'A' : 'O';
    }).join('');
  });
  DEMO.votos = { ano: 2026, geradoEm: agora, codigos: { S: 'Sim', N: 'Não', A: 'Abstenção', O: 'Obstrução', P: 'Presidindo a sessão (art. 17)', X: 'Voto secreto ou sem tipo informado', '-': 'Sem voto registrado', _: 'Antes da primeira presença registrada no período avaliado' }, votacoes, deputados: letras };
  DEMO.correcoes = { itens: [{ em: agora, votacao: 'DEMO3', titulo: 'Rejeitado o destaque fictício da bancada de exemplo.', mudancas: [{ campo: 'votos Não', antes: 150, depois: 151 }], votosIndividuaisAlterados: 1 }] };
  DEMO.presidenteId = federais[100].id;
  DEMO.pronto = true;
}

/* Histórico de mandatos fictício de um deputado (o mesmo formato que a rotina de atualização gera). */
function demoHistorico(id) {
  demoConstruir();
  const item = DEMO.federais.itens.find(i => i.id === String(id));
  if (!item) throw new Error(`HTTP 404 em deputados/${id}.json`);
  const n = Number(id);
  const r = aleatorio(n * 7919);
  const antes = n % 4 === 0 ? 3 : n % 3 === 0 ? 2 : n % 5 === 0 ? 1 : 0; // quantos mandatos anteriores
  const mandatos = [];
  const eventos = [];
  const pausas = [];
  for (let k = antes; k >= 0; k--) {
    const leg = 57 - k;
    const ini = `${1995 + 4 * (leg - 50)}-02-01`, fim = `${1999 + 4 * (leg - 50)}-01-31`;
    const emCurso = k === 0;
    const licenca = emCurso && n % 7 === 0;
    const dias = emCurso ? 1388 - (licenca ? 120 : 0) : 1460 - (n % 9 === 0 ? 200 : 0);
    const completo = !emCurso && n % 9 !== 0;
    const motivos = [];
    if (licenca) { motivos.push('Afastamento com prazo determinado - Licença para Tratar de Interesse Particular: de 2025-03-01 a 2025-06-29.'); pausas.push({ ini: '2025-03-01', fim: '2025-06-29', motivo: 'Afastamento com prazo determinado - Licença para Tratar de Interesse Particular', tipo: 'Licença' }); eventos.push({ data: '2025-03-01', leg, situacao: 'Licença', texto: 'Afastamento com prazo determinado - Licença para Tratar de Interesse Particular' }, { data: '2025-06-29', leg, situacao: 'Exercício', texto: 'Reassunção - Término de licença' }); }
    if (!emCurso && !completo) motivos.push(`Saiu em ${fim.slice(0, 4) - 1}-08-10: Afastamento definitivo (exemplo fictício).`);
    eventos.unshift({ data: ini, leg, situacao: 'Exercício', texto: 'Posse - Início de mandato' });
    if (!emCurso) eventos.push({ data: fim, leg, situacao: 'Fim de Mandato', texto: 'Término da legislatura' });
    mandatos.push({ leg, ini, fim, emCurso, inicioExercicio: ini, condicao: r() < 0.15 ? 'Suplente' : 'Titular', dias, diasLegislatura: emCurso ? 1388 : 1460, completo: emCurso ? null : completo, semAfastamento: !licenca && (emCurso || completo), motivos });
  }
  eventos.sort((a, b) => a.data.localeCompare(b.data));
  const total = mandatos.reduce((a, m) => a + m.dias, 0);
  const atual = mandatos[mandatos.length - 1];
  const direcao = String(id) === DEMO.presidenteId ? [{ leg: 57, cargo: 'Presidente', ini: '2025-02-01', fim: null }] : [];
  return {
    id: String(id), geradoEm: new Date().toISOString(),
    ficha: { nomeCivil: item.nome.toUpperCase(), nascimento: '1975-05-17', naturalidade: 'Cidade Exemplo/' + item.uf, escolaridade: 'Superior', situacao: 'Exercício', condicao: 'Titular', desde: '2023-02-01', gabinete: { sala: String(200 + n % 400), predio: '4', telefone: '3215-0000', email: 'dep.exemplo@exemplo.invalid' }, redes: [] },
    anoInicio: Number(mandatos[0].ini.slice(0, 4)), mandatos, pausas, diasTotais: total, anosEfetivos: Math.round(total / 365.25 * 100) / 100,
    legislaturaAtual: { leg: 57, ini: atual.ini, fim: atual.fim, dias: atual.dias, anos: Math.round(atual.dias / 365.25 * 100) / 100 },
    eventos, direcao
  };
}


/* =====================================================================
   Perfis ampliados fictícios: gestões dos últimos 48 meses, contas por ano,
   IBGE e presidente. O formato é o mesmo dos arquivos que a rotina gera
   (executivos/{código}.json e executivos/presidente.json).
   ===================================================================== */

const DEMO_AVISO = 'As datas de início e fim vêm dos arquivos de eleitos do TSE (mandato regular, posse em 1º de janeiro) e, quando houve troca de gestor no meio do mandato, de um registro com fontes. Trocas que não estejam nessas duas fontes (por exemplo, vice que assumiu temporariamente) não são detectadas. Confirme sempre no site oficial do governo ou da prefeitura.';
const demoIso = d => d.toISOString().slice(0, 10);
const demoDias = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
const demoMax = (a, b) => (a > b ? a : b);
const demoMin = (a, b) => (a < b ? a : b);

function demoJanela() {
  const h = new Date();
  const y = h.getFullYear(), m = h.getMonth();
  return { de: demoIso(new Date(Date.UTC(y, m - 48, 1))), ate: demoIso(new Date(Date.UTC(y, m, 0))), meses: 48, referencia: demoIso(h) };
}

function demoAtribuir(gestoes, de, ate) {
  const total = demoDias(de, ate) + 1;
  const f = gestoes.map(g => ({ id: g.id, a: demoMax(g.inicio, de), b: demoMin(g.fim, ate) })).filter(x => x.a <= x.b).map(x => ({ ...x, dias: demoDias(x.a, x.b) + 1 }));
  const cob = f.reduce((s, x) => s + x.dias, 0);
  if (!f.length) return { tipo: 'desconhecida', gestoes: [], cobertura: 0 };
  if (f.length === 1) return cob >= total ? { tipo: 'unica', gestoes: [f[0].id], cobertura: 1 } : { tipo: 'parcial', gestoes: [f[0].id], cobertura: +(cob / total).toFixed(3) };
  return { tipo: 'dividida', gestoes: f.map(x => x.id), cobertura: +(cob / total).toFixed(3) };
}

function demoSituacao(g, hojeISO) { return g.fim < hojeISO ? 'encerrada' : g.inicio > hojeISO ? 'futura' : 'em exercício'; }
function demoNumerar(gestoes, hojeISO) {
  gestoes.sort((a, b) => a.inicio.localeCompare(b.inicio));
  gestoes.forEach((g, i) => { g.id = `g${i + 1}`; g.situacao = demoSituacao(g, hojeISO); });
  return gestoes;
}

function demoGestoesPrefeito(item, k, r, hojeISO) {
  const anoAtual = Number(hojeISO.slice(0, 4));
  const tse = (nome, urna, partido, inicio, fim, anos, reeleito) => ({ nome, urna, partido, inicio, fim, inicioAprox: false, fimAprox: false, mandatos: anos.map(ano => ({ ano, suplementar: false })), reeleito, origem: 'tse' });
  const gs = [];
  if (k % 3 === 0) gs.push(tse(item.nome, item.urna, item.partido, '2021-01-01', '2028-12-31', [2020, 2024], true));
  else {
    const antigo = demoPessoa(r);
    gs.push(tse(antigo.nome, antigo.urna, antigo.partido, '2021-01-01', '2024-12-31', [2020], false));
    gs.push(tse(item.nome, item.urna, item.partido, '2025-01-01', '2028-12-31', [2024], false));
  }
  if (k % 7 === 2 && anoAtual === 2026) {
    const alvo = gs[gs.length - 1];
    alvo.fim = '2026-04-01'; alvo.fimAprox = true; alvo.encerradaPor = 'renúncia';
    gs.push({
      nome: `Vice de ${item.municipio}`, urna: null, partido: item.partido, inicio: '2026-04-02', fim: '2028-12-31', inicioAprox: true, fimAprox: false, mandatos: [], reeleito: false, origem: 'curadoria',
      vinculo: 'vice-prefeito', motivo: 'renúncia para disputar outro cargo nas eleições de 2026', interina: undefined, dataTexto: 'até 4 de abril de 2026 (prazo legal de desincompatibilização)', confirmacao: 'imprensa',
      fontes: [{ titulo: 'Reportagem fictícia de demonstração', url: 'https://exemplo.invalid/materia-de-demonstracao' }],
      divergencias: k % 14 === 2 ? ['Uma fonte fictícia cita outro vice; a outra cita este nome. O Placar não escolhe por conta própria.'] : [], nota: null, saiuSegundoFonte: null
    });
  }
  return demoNumerar(gs, hojeISO);
}

function demoGestoesGovernador(item, idx, r, hojeISO) {
  const tse = (nome, urna, partido, inicio, fim, ano) => ({ nome, urna, partido, inicio, fim, inicioAprox: false, fimAprox: false, mandatos: [{ ano, suplementar: false }], reeleito: false, origem: 'tse' });
  const ant = demoPessoa(r), prox = demoPessoa(r);
  const gs = [tse(ant.nome, ant.urna, ant.partido, '2019-01-01', '2022-12-31', 2018), tse(item.nome, item.urna, item.partido, '2023-01-01', '2026-12-31', 2022), tse(prox.nome, prox.urna, prox.partido, '2027-01-01', '2030-12-31', 2026)];
  if (idx % 4 === 0 && hojeISO.slice(0, 4) === '2026') {
    gs[1].fim = '2026-04-03'; gs[1].fimAprox = true; gs[1].encerradaPor = 'renúncia';
    gs.push({
      nome: `Vice-governador(a) de ${NOMES_UF[item.uf]}`, urna: null, partido: item.partido, inicio: '2026-04-04', fim: '2026-12-31', inicioAprox: true, fimAprox: false, mandatos: [], reeleito: false, origem: 'curadoria',
      vinculo: 'vice-governador(a)', motivo: 'renúncia do titular para disputar outro cargo', dataTexto: 'até 4 de abril de 2026 (prazo legal de desincompatibilização)', confirmacao: 'imprensa',
      fontes: [{ titulo: 'Reportagem fictícia de demonstração', url: 'https://exemplo.invalid/materia-de-demonstracao' }], divergencias: [], nota: null, saiuSegundoFonte: null
    });
  }
  return demoNumerar(gs, hojeISO);
}

const DEMO_PARTES = { M: { '10': 0.26, '12': 0.24, '17': 0.03, '06': 0.015, '15': 0.08, '16': 0.01, '26': 0.06 }, E: { '10': 0.12, '12': 0.14, '17': 0.006, '06': 0.09, '15': 0.004, '16': 0.004, '26': 0.03 } };

function demoAno(r, ano, ctx) {
  const { janela, gestoes, hojeAno, pop, esfera, contas, pc0, nCol } = ctx;
  const base = { mesesNaJanela: 0, atribuicao: demoAtribuir(gestoes, `${ano}-01-01`, `${ano}-12-31`) };
  const a0 = demoMax(`${ano}-01-01`, janela.de), b0 = demoMin(`${ano}-12-31`, janela.ate);
  if (a0 <= b0) base.mesesNaJanela = (+b0.slice(0, 4) - +a0.slice(0, 4)) * 12 + (+b0.slice(5, 7) - +a0.slice(5, 7)) + 1;
  if (ano >= hojeAno) return { ...base, situacao: 'em-curso' };
  if (ctx.semBalanco && ano === hojeAno - 1) return { ...base, situacao: 'sem-balanco', coletadoEm: janela.referencia, rgfSituacao: 'sem-relatorio' };
  if (ctx.naoColetado && ano === janela.de.slice(0, 4) * 1) return { ...base, situacao: 'nao-coletado' };
  const popAno = Math.round(pop * (1 + 0.004 * (ano - (hojeAno - 1))));
  const pago = Math.round(pc0 * (1 + 0.07 * (ano - 2022)) * popAno);
  const reg = { ...base, situacao: 'fechado', coletadoEm: janela.referencia, pop: popAno, total: [Math.round(pago * 1.08), Math.round(pago * 1.03), pago], f: {} };
  for (const [cod, parte] of Object.entries(DEMO_PARTES[esfera])) {
    const v = Math.round(pago * parte * (0.8 + r() * 0.4));
    reg.f[cod] = [Math.round(v * 1.1), Math.round(v * 1.04), v];
  }
  reg.d = {};
  for (const [cod, v] of Object.entries(reg.f)) reg.d[cod] = [Math.round(v[2] / popAno), demoRound(v[2] / pago * 100)];
  reg.d.total = [Math.round(pago / popAno), 100];
  reg.rgf = 'Q3';
  reg.pessoal = ano === hojeAno - 1 ? contas.pessoal : demoRound(contas.pessoal * (0.94 + r() * 0.12));
  reg.divida = ano === hojeAno - 1 ? contas.divida : demoRound(contas.divida * (0.85 + r() * 0.3));
  return reg;
}

function demoExecutivo(cargo, item, idx) {
  demoConstruir();
  const hoje = new Date();
  const hojeISO = demoIso(hoje);
  const hojeAno = hoje.getFullYear();
  const janela = demoJanela();
  const r = aleatorio(Number(item.ibge) * 31 + 7);
  const ehPref = cargo === 'prefeitos';
  const gestoes = ehPref ? demoGestoesPrefeito(item, idx, r, hojeISO) : demoGestoesGovernador(item, idx, r, hojeISO);
  const esfera = ehPref ? 'M' : 'E';
  const pop = item.populacao || 10000;
  const ctx = { janela, gestoes, hojeAno, pop, esfera, contas: item.contas || { pessoal: 45, divida: 30 }, pc0: ehPref ? 3200 + r() * 3000 : 4500 + r() * 4500, semBalanco: !item.contas, naoColetado: ehPref && idx % 9 === 4 };
  const anos = {};
  for (let a = +janela.de.slice(0, 4); a <= +janela.ate.slice(0, 4); a++) anos[a] = demoAno(r, a, ctx);
  const pibpc = 22000 + r() * 48000;
  const contexto = { populacao: { ano: hojeAno - 1, valor: pop }, pib: { ano: hojeAno - 3, valor: Math.round(pop * pibpc / 1000), porHabitante: Math.round(pibpc) } };
  if (idx % 10 !== 5) contexto.censo = { ano: 2022, referencia: '2022-08-01', agua: demoRound(72 + r() * 27), esgoto: demoRound(38 + r() * 57), lixo: demoRound(86 + r() * 13) };
  return {
    versao: 1, geradoEm: new Date().toISOString(), cargo: ehPref ? 'prefeito' : 'governador',
    ente: { ibge: item.ibge, nome: ehPref ? item.municipio : NOMES_UF[item.uf], uf: item.uf, esfera, populacao: pop },
    janela, aviso: DEMO_AVISO,
    gestoes: gestoes.filter(g => (g.inicio <= janela.ate && g.fim >= janela.de) || g.situacao !== 'encerrada'),
    anos, contexto, entregas: item.contas ? item.contas.entregas : null
  };
}

function demoResumoSerie(pontos, g, j, taxa) {
  const de = demoMax(g.inicio.slice(0, 7), j.de.slice(0, 7)), ate = demoMin(g.fim.slice(0, 7), j.ate.slice(0, 7));
  const m = pontos.filter(p => p.p >= de && p.p <= ate);
  if (!m.length) return null;
  const v = m.map(p => p.v);
  const o = { meses: m.length, de: m[0].p, ate: m[m.length - 1].p, primeiro: { p: m[0].p, v: v[0] }, ultimo: { p: m[m.length - 1].p, v: v[v.length - 1] }, media: demoRound2(v.reduce((a, b) => a + b, 0) / v.length), variacao: demoRound2(v[v.length - 1] - v[0]) };
  if (taxa) o.acumulado = demoRound2((v.reduce((a, x) => a * (1 + x / 100), 1) - 1) * 100);
  return o;
}
const demoRound2 = x => Math.round(x * 100) / 100;

function demoPresidente() {
  demoConstruir();
  const hojeISO = demoIso(new Date());
  const janela = demoJanela();
  const r = aleatorio(4242);
  const mk = (nome, partido, inicio, fim, ano) => ({ nome, urna: nome.split(' ')[0], partido, inicio, fim, inicioAprox: false, fimAprox: false, mandatos: [{ ano, suplementar: false }], reeleito: false, origem: 'tse' });
  const todas = demoNumerar([mk('Presidente Anterior Exemplo', 'ALFA', '2019-01-01', '2022-12-31', 2018), mk('Presidente Atual Exemplo', 'BETA', '2023-01-01', '2026-12-31', 2022), mk('Presidente Eleito Exemplo', 'GAMA', '2027-01-01', '2030-12-31', 2026)], hojeISO);
  const meses = [];
  for (let a = +janela.de.slice(0, 4), m = +janela.de.slice(5, 7); `${a}-${String(m).padStart(2, '0')}` <= janela.ate.slice(0, 7); m++) { if (m > 12) { a++; m = 1; } meses.push(`${a}-${String(m).padStart(2, '0')}`); }
  const caminhada = (ini, passo, min, max, atraso = 0) => { let v = ini; return meses.slice(0, meses.length - atraso).map(p => { v = Math.max(min, Math.min(max, v + (r() - 0.5) * passo)); return { p, v: demoRound2(v) }; }); };
  const brutas = {
    'pres.ipca': caminhada(0.45, 0.4, 0.05, 0.9),
    'pres.ipca12': caminhada(5.5, 0.5, 3.5, 8),
    'pres.desocupacao': caminhada(8.5, 0.5, 5.5, 10, 1),
    'pres.selic': caminhada(12, 0.4, 9, 14),
    'pres.divida-bruta': caminhada(74, 0.8, 68, 82),
    'pres.divida-liquida': caminhada(58, 0.8, 50, 66)
  };
  const indicadores = {};
  for (const [id, pontos] of Object.entries(brutas)) {
    const serie = pontos.map(p => ({ ...p, atribuicao: demoAtribuir(todas, `${p.p}-01`, `${p.p}-28`) }));
    const porGestao = {};
    for (const g of todas) { const x = demoResumoSerie(serie, g, janela, id === 'pres.ipca'); if (x) porGestao[g.id] = x; }
    indicadores[id] = { situacao: 'ok', ultimoMes: serie[serie.length - 1].p, serie, porGestao };
  }
  return { versao: 1, geradoEm: new Date().toISOString(), cargo: 'presidente', ente: { nome: 'Brasil', esfera: 'F' }, janela, aviso: DEMO_AVISO, gestoes: todas.filter(g => (g.inicio <= janela.ate && g.fim >= janela.de) || g.situacao !== 'encerrada'), indicadores, erros: [] };
}

function demoExecutivoPorIbge(ibge) {
  demoConstruir();
  const id = Number(ibge);
  const gi = DEMO.governadores.itens.findIndex(g => g.ibge === id);
  if (gi >= 0) return demoExecutivo('governadores', DEMO.governadores.itens[gi], gi);
  for (const uf of Object.keys(DEMO.prefeitos)) {
    const k = DEMO.prefeitos[uf].findIndex(p => p.ibge === id);
    if (k >= 0) return demoExecutivo('prefeitos', DEMO.prefeitos[uf][k], k);
  }
  throw new Error(`HTTP 404 em executivos/${ibge}.json`);
}

function gerarDemo(nome) {
  demoConstruir();
  if (nome === 'meta.json') return DEMO.meta;
  if (nome === 'metodo.json') return METODO_DEMO;
  if (nome === 'federais.json') return DEMO.federais;
  if (nome === 'ranking-prefeitos.json') return DEMO.ranking;
  if (nome === 'governadores.json') return DEMO.governadores;
  if (nome === 'votos.json') return DEMO.votos;
  if (nome === 'correcoes.json') return DEMO.correcoes;
  if (nome === 'indicadores.json') return INDICADORES_DEMO;
  if (nome === 'executivos/presidente.json') return demoPresidente();
  const ex = /^executivos\/(\d+)\.json$/.exec(nome);
  if (ex) return demoExecutivoPorIbge(ex[1]);
  const h = /^deputados\/(\d+)\.json$/.exec(nome);
  if (h) return demoHistorico(h[1]);
  const m = /^(prefeitos|estaduais|vereadores)-([A-Z]{2})\.json$/.exec(nome);
  if (m) {
    const [, tipo, uf] = m;
    const dado = tipo === 'prefeitos' ? (DEMO.prefeitos[uf] ? { uf, ano: 2024, exercicio: 2025, itens: DEMO.prefeitos[uf] } : null) : DEMO[tipo][uf];
    if (dado) return dado;
  }
  throw new Error(`HTTP 404 em ${nome}`);
}
