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
  const SESSOES = 118, VOTACOES = 64;

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
      const nProj = Math.round(proj / 100 * 40);
      const gasto = Math.round(60000 + (100 - cota) / 100 * 700000);
      const item = {
        id: p.id, nome: p.nome, partido: p.partido, uf,
        desde: '2026-02-03',
        comp: [
          { k: 'pres', s: pres, f: `Presente em ${Math.round(pres / 100 * SESSOES)} de ${SESSOES} sessões deliberativas do Plenário em 2026 (${Math.round(pres)}%).` },
          { k: 'vot', s: vot, f: `Registrou voto em ${Math.round(vot / 100 * VOTACOES)} de ${VOTACOES} votações nominais do Plenário em 2026.` },
          { k: 'proj', s: proj, f: `Apresentou ${nProj} projetos e propostas, mais do que ${Math.floor(proj)}% dos deputados.` },
          { k: 'cota', s: cota, f: `Gastou R$ ${demoPct(gasto)} da cota em 2026, menos do que ${Math.floor(100 - cota)}% dos colegas de ${uf}.` }
        ]
      };
      item.nota = demoNota(item.comp, { pres: 30, vot: 25, proj: 20, cota: 25 });
      federais.push(item);
    }
  }
  [4, 120, 301].forEach((k, n) => {
    federais[k].nota = null; federais[k].comp = [];
    federais[k].motivo = n === 0 ? 'Só 12 sessões deliberativas desde a primeira presença (03/09/2026); o mínimo é 20.' : 'Sem presença registrada em sessões deliberativas do Plenário em 2026.';
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
    const sE = demoRound(feitas / 10 * 100);
    const comp = [
      { k: 'pessoal', s: sP, f: `Gastou ${pessoal.toLocaleString('pt-BR')}% da receita corrente líquida com pessoal em 2025. O limite da Lei de Responsabilidade Fiscal é ${limP}%.` },
      { k: 'divida', s: sD, f: `Dívida consolidada líquida de ${divida.toLocaleString('pt-BR')}% da receita corrente líquida. O limite é ${limD}%.` },
      { k: 'entregas', s: sE, f: `Entregou ${feitas} dos 10 relatórios fiscais obrigatórios de 2025 ao Tesouro Nacional.` }
    ];
    return { comp, nota: demoNota(comp, { pessoal: 40, divida: 30, entregas: 30 }) };
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

  DEMO.federais = { ano: 2026, geradoEm: agora, sessoes: SESSOES, votacoes: VOTACOES, total: federais.length, comNota: fedCom, media: demoMedia(federais), itens: federais };
  DEMO.prefeitos = prefeitos;
  DEMO.ranking = { ano: 2024, exercicio: 2025, total: todosPref.length, comNota: prefCom, itens: todosPref.map(compacto) };
  DEMO.governadores = { ano: 2022, exercicio: 2025, total: governadores.length, comNota: govCom, itens: governadores };
  DEMO.estaduais = {};
  DEMO.vereadores = {};
  DEMO.meta = {
    versao: 1, geradoEm: agora, demo: true,
    fontes: {
      camara: { ok: true, atualizadoEm: agora, ano: 2026, sessoes: SESSOES, votacoes: VOTACOES },
      tse: { ok: true, atualizadoEm: agora, eleicoes: { municipal: 2024, governadores: 2022, estaduais: 2022 }, avisos: 0 },
      siconfi: { ok: true, atualizadoEm: agora, exercicio: 2025, entes: todosPref.length + governadores.length, comErro: 0 }
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
  DEMO.pronto = true;
}

function gerarDemo(nome) {
  demoConstruir();
  if (nome === 'meta.json') return DEMO.meta;
  if (nome === 'metodo.json') return METODO_DEMO;
  if (nome === 'federais.json') return DEMO.federais;
  if (nome === 'ranking-prefeitos.json') return DEMO.ranking;
  if (nome === 'governadores.json') return DEMO.governadores;
  const m = /^(prefeitos|estaduais|vereadores)-([A-Z]{2})\.json$/.exec(nome);
  if (m) {
    const [, tipo, uf] = m;
    const dado = tipo === 'prefeitos' ? (DEMO.prefeitos[uf] ? { uf, ano: 2024, exercicio: 2025, itens: DEMO.prefeitos[uf] } : null) : DEMO[tipo][uf];
    if (dado) return dado;
  }
  throw new Error(`HTTP 404 em ${nome}`);
}
