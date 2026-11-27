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
  const FED_MESES = 45.5;
  const MSG = 'Dado não encontrado ou não confirmado';
  const ANOS_JAN = [2023, 2024, 2025, 2026];
  const PARTE_ANO = [0.27, 0.27, 0.27, 0.19];
  for (const uf of UFS) {
    for (let i = 0; i < DEMO_BANCADA[uf]; i++) {
      const p = demoPessoa(r, { id: String(++contador), uf });
      const pres = demoRound(100 - Math.pow(r(), 1.7) * 85);
      const vot = demoRound(100 - Math.pow(r(), 1.8) * 80);
      const aprov = demoRound(r() * 100);
      const nProj = Math.round(10 + r() * 140);
      const nAprov = Math.round(aprov / 100 * Math.min(nProj, 24));
      const nLeis = Math.min(nAprov, Math.round(nAprov * 0.35));
      // Presença em comissões permanentes: poucos deputados têm menos de 10 reuniões esperadas ("Dado não encontrado ou não confirmado")
      const comisEsp = contador % 23 === 3 ? 4 : 40 + Math.floor(r() * 200);
      const comisPres = Math.round(comisEsp * (0.35 + r() * 0.65));
      const comisSuf = comisEsp >= 10;
      const comis = comisSuf ? demoRound(comisPres / comisEsp * 100) : null;
      // Custo para os cofres públicos: pontuação maior = custou menos. Alguns deputados ficam sem custo (leitura que falhou).
      const semCusto = contador % 97 === 5;
      const custo = semCusto ? null : demoRound(r() * 100);
      const porMes = Math.round(190000 - (custo ?? 50) / 100 * 80000 + r() * 5000);
      const total = Math.round(porMes * FED_MESES);
      const semMoradia = r() < 0.35;
      const cotaT = Math.round(total * 0.28), moradiaT = semMoradia ? 0 : Math.round(total * 0.04), viagensT = Math.round(total * 0.02);
      const comps = { cota: cotaT, verba: total - cotaT - moradiaT - viagensT, moradia: moradiaT, viagens: viagensT };
      const anosCusto = Object.fromEntries(ANOS_JAN.map((a, k) => [a, {
        cota: Math.round(comps.cota * PARTE_ANO[k]), verba: Math.round(comps.verba * PARTE_ANO[k]), moradia: Math.round(comps.moradia * PARTE_ANO[k]), viagens: Math.round(comps.viagens * PARTE_ANO[k]),
        semLancamento: semMoradia ? ['moradia'] : []
      }]));
      const real = v => `R$ ${demoPct(v)}`;
      const item = {
        id: p.id, nome: p.nome, partido: p.partido, uf,
        desde: '2023-02-01',
        comp: [
          { k: 'pres', s: pres, f: `Presente em ${Math.round(pres / 100 * SESSOES)} de ${SESSOES} sessões deliberativas do Plenário desde 01/02/2023 (${Math.round(pres)}%).` },
          { k: 'vot', s: vot, f: `Registrou voto em ${Math.round(vot / 100 * VOTACOES)} de ${VOTACOES} votações nominais do Plenário desde 01/02/2023.` },
          { k: 'aprov', s: aprov, f: `${nAprov} projetos de autoria aprovados pelo Plenário da Câmara de ${nProj} apresentados desde 01/02/2023 (${nLeis} viraram lei), mais do que ${Math.floor(aprov)}% dos deputados com histórico suficiente.` },
          { k: 'comis', s: comis, f: comisSuf
            ? `Presente em ${comisPres} de ${comisEsp} reuniões deliberativas de comissões permanentes em que era titular, desde 01/02/2023 (${Math.round(comis)}%). A Câmara não publica quem substituiu o titular numa reunião: a falta do titular substituído pode contar contra ele.`
            : `Só ${comisEsp} reuniões deliberativas esperadas em comissões permanentes desde 01/02/2023; o mínimo é 10. ${MSG}: poucas reuniões não são nota baixa. Até agora: presente em ${Math.min(comisPres, comisEsp)}.` },
          { k: 'custo', s: custo, f: semCusto
            ? `${MSG}. O Portal da Transparência da Câmara não pôde ser lido para este deputado nesta atualização (exemplo inventado). Isso não significa custo zero.`
            : `Custou ${real(total)} aos cofres públicos desde 01/02/2023 (${real(porMes)} por mês de exercício), sem contar o subsídio: cota parlamentar ${real(comps.cota)}; verba de gabinete ${real(comps.verba)}; auxílio-moradia ${real(comps.moradia)}; viagens oficiais ${real(comps.viagens)}. Custou menos por mês do que ${Math.floor(custo)}% dos 513 deputados comparados em todo o país. (Exemplo inventado.)` }
        ]
      };
      item.nota = demoNota(item.comp.filter(c => c.s != null), { pres: 20, vot: 15, aprov: 30, comis: 10, custo: 25 });
      item.extra = {
        sessoes: [Math.round(pres / 100 * SESSOES), SESSOES], votos: [Math.round(vot / 100 * VOTACOES), VOTACOES], projetos: nProj, meses: FED_MESES,
        comissoes: { esperadas: comisEsp, presentes: Math.min(comisPres, comisEsp), suficiente: comisSuf },
        custo: semCusto ? null : { total, porMes, componentes: comps, anos: anosCusto, meses: FED_MESES },
        ...(semCusto ? { custoMotivo: 'O Portal da Transparência da Câmara não pôde ser lido para este deputado nesta atualização (exemplo inventado).' } : {}),
        proj: { apresentados: nProj, aprovadosCasa: nAprov, leis: nLeis, comissao: Math.round((nProj - nAprov) * 0.1), arquivados: Math.round((nProj - nAprov) * 0.3), tramitacao: Math.round((nProj - nAprov) * 0.55), outros: 0, semSituacao: 0, sozinho: Math.round(nProj * 0.6), coautoria: nProj - Math.round(nProj * 0.6), situacaoLida: true, aprovadosPorAno: demoRound(nAprov / 3.79), leisPorAno: demoRound(nLeis / 3.79), historicoSuficiente: true }
      };
      federais.push(item);
    }
  }
  [4, 120, 301].forEach((k, n) => {
    federais[k].nota = null; federais[k].comp = []; delete federais[k].extra;
    federais[k].motivo = n === 0 ? 'Só 12 sessões deliberativas desde a primeira presença (03/09/2026); o mínimo é 20.' : 'Sem presença registrada em sessões deliberativas do Plenário nos últimos 4 anos (2023 a 2026).';
  });

  /* Senadores (v8): lista com custo (CEAPS). Presença, votações, projetos e comissões ainda não têm leitura conferida:
     aparecem como "Dado não encontrado ou não confirmado" e o índice só sai com pelo menos 2 critérios, então nenhum senador tem índice. */
  const senadores = [];
  const rs = aleatorio(5150);
  UFS.forEach(uf => {
    for (let k = 0; k < 3; k++) {
      const n = senadores.length;
      const p = demoPessoa(rs, { id: String(5000 + n), uf });
      const suplente = n % 20 === 7;        // entrou em 2026: poucos meses de exercício
      const novo = n === 41;                 // 1,6 mês: não entra na comparação
      const semCusto = n === 64;             // período de exercício não lido
      const meses = novo ? 1.6 : suplente ? 8.4 : FED_MESES;
      const desde = novo ? '2026-10-01' : suplente ? '2026-03-01' : '2023-02-01';
      const porMes = Math.round(24000 + rs() * 22000);
      const total = Math.round(porMes * meses);
      const anos = novo ? { 2026: total } : suplente ? { 2026: total } : Object.fromEntries(ANOS_JAN.map((a, j) => [a, Math.round(total * PARTE_ANO[j])]));
      senadores.push({
        id: p.id, nome: p.nome, partido: p.partido, uf, desde: semCusto ? undefined : desde, nota: null, rank: null,
        motivo: 'Índice ainda não calculado: o do senador só sai com pelo menos 2 critérios confirmados e hoje o Placar confirma ' + (semCusto || novo ? '0' : '1') + ' de 5. Os critérios sem fonte conferida aparecem como "Dado não encontrado ou não confirmado" e não viram nota zero.',
        _porMes: semCusto || novo ? null : porMes, _meses: meses, _total: total, _anos: anos, _semCusto: semCusto, _novo: novo,
        extra: {}
      });
    }
  });
  const ordenadosCusto = senadores.filter(x => x._porMes != null).map(x => x._porMes).sort((a, b) => a - b);
  const pctSen = v => (ordenadosCusto.filter(x => x < v).length + ordenadosCusto.filter(x => x === v).length / 2) / ordenadosCusto.length;
  const NAO_LIDO = { pres: 'a presença em sessões do Plenário do Senado por senador', vot: 'as votações nominais do Plenário do Senado por senador', aprov: 'as matérias de autoria de cada senador e a situação delas', comis: 'a presença em reuniões das comissões do Senado por senador' };
  for (const x of senadores) {
    const sCusto = x._porMes == null ? null : demoRound((1 - pctSen(x._porMes)) * 100);
    const realS = v => `R$ ${demoPct(v)}`;
    const motivoCusto = x._semCusto ? 'O período de exercício deste senador não pôde ser lido no Senado (exemplo inventado).' : null;
    x.comp = ['pres', 'vot', 'aprov', 'comis'].map(k => ({ k, s: null, f: `${MSG}: nesta versão o Placar ainda não lê ${NAO_LIDO[k]} de uma fonte conferida. Isso não significa nota baixa nem zero: o critério fica de fora da conta.` }));
    x.comp.push({ k: 'custo', s: sCusto, f: x._semCusto ? `${MSG}. ${motivoCusto} Isso não significa custo zero.`
      : x._novo ? `Só ${demoPct(x._meses)} meses de exercício no período; o custo por mês só é comparado a partir de 3 meses. Até agora, em CEAPS: ${realS(x._total)}.`
      : `Custou ${realS(x._total)} em cota para o exercício da atividade parlamentar (CEAPS) desde ${dataBR(x.desde)} (${realS(x._porMes)} por mês de exercício), sem contar o subsídio. Custou menos por mês do que ${Math.floor(sCusto)}% dos ${ordenadosCusto.length} senadores comparados. Só a CEAPS é medida nesta versão. (Exemplo inventado.)` });
    x.extra = {
      meses: x._semCusto ? null : x._meses, ...(x._semCusto ? {} : { exercicioBase: 'exercicios' }),
      custo: x._semCusto ? null : { total: x._total, porMes: Math.round(x._total / x._meses), componentes: { ceaps: x._total }, anos: Object.fromEntries(Object.entries(x._anos).map(([a, v]) => [a, { ceaps: v }])), meses: x._meses, ...(x._novo ? { poucosMeses: true } : {}) },
      ...(motivoCusto ? { custoMotivo: motivoCusto } : {})
    };
    for (const k of ['_porMes', '_meses', '_total', '_anos', '_semCusto', '_novo']) delete x[k];
    if (x.desde === undefined) delete x.desde;
  }
  const fedCom = demoPosicoes(federais);

  /* Governadores (prefeitos e deputados estaduais saíram do Placar na v8) */
  const executivo = (r2, esfera) => {
    const limP = esfera === 'M' ? 54 : 49, limD = esfera === 'M' ? 120 : 200;
    const pessoal = demoRound(limP * (0.55 + r2() * 0.6));
    const divida = demoRound(limD * (r2() * 0.9) - (r2() < 0.2 ? limD * 0.2 : 0));
    const feitas = r2() < 0.8 ? 10 : 6 + Math.floor(r2() * 4);
    const contas = { pessoal, divida, limitePessoal: limP, limiteDivida: limD, rgf: 'Q3', entregas: { feitas, esperado: 10, rreo: Math.min(6, feitas), rgf: Math.max(0, Math.min(3, feitas - 6)), dca: feitas >= 10 ? 1 : 0 } };
    const E = esfera !== 'M';
    const pares = E ? 'estados' : 'municípios do mesmo estado';
    const nPares = E ? 27 : 15;
    const sorteio = () => demoRound(8 + r2() * 90);
    const area = (k, s, texto) => (s == null ? { k, peso: 20, s: null, f: 'Sem dado confiável para esta área (exemplo inventado).' } : { k, peso: 20, s, f: `${texto}; pontuação ${demoPct(s)} entre ${nPares} ${pares} (exemplo inventado).` });
    const faltaSaude = !E && r2() < 0.2, faltaEdu = !E && r2() < 0.2;
    const comp = [
      area('saude', faltaSaude ? null : sorteio(), `Mortalidade infantil de ${demoPct(demoRound(8 + r2() * 12))} por mil nascidos vivos (2022 a 2025)`),
      area('educacao', faltaEdu ? null : sorteio(), `Ideb de ${demoPct(demoRound(3.5 + r2() * 3))} (nota de 0 a 10)`),
      E ? area('seguranca', sorteio(), `Homicídios dolosos: ${demoPct(demoRound(8 + r2() * 30))} vítimas por 100 mil habitantes`)
        : { k: 'seguranca', peso: 20, s: null, na: true, f: 'Não se aplica a prefeitos: a segurança pública é responsabilidade principalmente estadual.' },
      { k: 'infra', peso: 20, s: null, sem: 'fonte', f: 'Ainda sem indicador de resultado com fonte aberta confirmada. O Placar não usa gasto como se fosse resultado.' },
      area('saneamento', sorteio(), `Água da rede geral em ${demoPct(demoRound(60 + r2() * 39))}% dos domicílios (Censo 2022)`)
    ];
    const validas = comp.filter(c => c.s != null);
    const minimo = E ? 3 : 2;
    const parcial = { usadas: validas.length, aplicaveis: E ? 4 : 3, total: 5, faltam: comp.filter(c => c.s == null).map(c => c.k) };
    const nota = validas.length >= minimo ? demoNota(validas, { saude: 20, educacao: 20, seguranca: 20, infra: 20, saneamento: 20 }) : null;
    const base = { comp, contas, parcial };
    if (nota == null) return { ...base, nota: null, motivo: `Só ${validas.length} de ${E ? 4 : 3} áreas aplicáveis têm dado confiável; o mínimo é ${minimo}.` };
    return { ...base, nota, ressalva: 'Saneamento é um retrato do Censo 2022, não resultado da gestão atual. Resultados de serviços públicos dependem de vários níveis de governo: o índice não prova mérito nem culpa de quem governa. (Exemplo inventado.)' };
  };


  const governadores = UFS.map(uf => {
    const g = demoPessoa(r, { id: String(700000 + UFS.indexOf(uf)), uf, ibge: 10 + UFS.indexOf(uf), populacao: Math.round(500000 + r() * 40000000) });
    return Object.assign(g, executivo(r, uf === 'DF' ? 'D' : 'E'));
  });
  const govCom = demoPosicoes(governadores);

  const compacto = i => ({ id: i.id, nome: i.nome, partido: i.partido, uf: i.uf, nota: i.nota, rank: i.rank, ...(i.municipio ? { municipio: i.municipio } : {}) });
  const agora = new Date().toISOString();

  DEMO.federais = { ano: 2026, janela: { anos: 4, de: 2023, ate: 2026 }, geradoEm: agora, sessoes: SESSOES, votacoes: VOTACOES, sessoesAno: SESS_ANO, votacoesAno: VOT_ANO, total: federais.length, comNota: fedCom, media: demoMedia(federais), itens: federais };
  const senComCusto = senadores.filter(x => x.extra.custo && !x.extra.custo.poucosMeses).length;
  DEMO.senadores = { ano: 2026, janela: { anos: 4, de: 2023, ate: 2026 }, geradoEm: agora, total: senadores.length, comNota: 0, comCusto: senComCusto, media: null, criteriosLidos: ['custo'], itens: senadores };
  DEMO.governadores = { ano: 2022, exercicio: 2025, total: governadores.length, comNota: govCom, itens: governadores };
  DEMO.meta = {
    versao: 1, geradoEm: agora, demo: true,
    fontes: {
      camara: { ok: true, atualizadoEm: agora, ano: 2026, janela: { anos: 4, de: 2023, ate: 2026 }, sessoes: SESSOES, votacoes: VOTACOES, sessoesAno: SESS_ANO, votacoesAno: VOT_ANO },
      custo: { ok: true, atualizadoEm: agora, deputadosCompletos: federais.length },
      senado: { ok: true, atualizadoEm: agora, ano: 2026, total: senadores.length, comCusto: senComCusto, comNota: 0 },
      tse: { ok: true, atualizadoEm: agora, eleicoes: { governadores: 2022 }, avisos: 0 },
      siconfi: { ok: true, atualizadoEm: agora, exercicio: 2025, entes: governadores.length, comErro: 0 },
      historico: { ok: true, atualizadoEm: agora, total: federais.length, falhas: 0, semHistorico: 0 },
      administracoes: { ok: true, atualizadoEm: agora }, ibge: { ok: true, atualizadoEm: agora }, presidente: { ok: true, atualizadoEm: agora }, series: { ok: true, atualizadoEm: agora }, precos: { ok: true, atualizadoEm: agora }, seguranca: { ok: true, atualizadoEm: agora }, indice: { ok: true, atualizadoEm: agora },
      mundo: { ok: true, atualizadoEm: agora }, vigilancia: { ok: true, atualizadoEm: agora }, independentes: { ok: true, atualizadoEm: agora }
    },
    cargos: {
      federais: { total: federais.length, comNota: fedCom, media: demoMedia(federais) },
      senadores: { total: senadores.length, comNota: 0, media: null, comCusto: senComCusto },
      governadores: { total: governadores.length, comNota: govCom, media: demoMedia(governadores) }
    }
  };

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

/* Resultados do IBGE Cidades (números inventados, como o resto da demonstração). */
function demoResultados(r, { janela, gestoes, hojeAno, esfera, pop, idx }) {
  if (idx % 9 === 4) return null; // simula "ainda não coletado"
  const anoDe = +janela.de.slice(0, 4), anoAte = +janela.ate.slice(0, 4);
  const anosIdeb = [], anosAnuais = [];
  for (let a = anoDe - 4; a <= hojeAno - 1; a++) { if (a % 2 === 1) anosIdeb.push(a); if (a <= hojeAno - 2) anosAnuais.push(a); }
  const caminho = (anos, ini, passo, min, max, casas) => { let v = ini; const o = {}; for (const a of anos) { v = Math.max(min, Math.min(max, v + (r() - 0.45) * passo)); o[a] = casas ? +v.toFixed(casas) : Math.round(v); } return o; };
  const series = {};
  const base = 3.8 + r() * 1.6;
  for (const [et, desl] of [['ai', 0.9], ['af', 0], ['em', -0.5]]) {
    for (const rede of ['publica', 'municipal', 'estadual']) {
      if (rede === 'municipal' && et === 'em') continue;       // rede municipal quase não tem ensino médio
      if (rede === 'municipal' && idx % 7 === 3 && et === 'af') continue; // simula município sem nota
      series[`ideb.${et}.${rede}`] = caminho(anosIdeb, base + desl + (rede === 'estadual' ? -0.2 : 0), 0.5, 2.5, 8, 1);
    }
  }
  const matr = esfera === 'M' ? Math.round(pop * 0.17) : Math.round(pop * 0.17);
  series['mat.pre'] = caminho(anosAnuais, matr * 0.2, matr * 0.02, 10, 1e9, 0);
  series['mat.ef'] = caminho(anosAnuais, matr * 0.65, matr * 0.02, 10, 1e9, 0);
  series['mat.em'] = caminho(anosAnuais, matr * 0.25, matr * 0.02, 10, 1e9, 0);
  series[esfera === 'M' ? 'mat.creche.municipal' : 'mat.creche.estadual'] = caminho(anosAnuais, matr * 0.06, matr * 0.01, 1, 1e9, 0);
  const nasc = caminho(anosAnuais, Math.max(30, pop * 0.012), Math.max(3, pop * 0.0004), 10, 1e9, 0);
  const obit = Object.fromEntries(Object.entries(nasc).map(([a, n]) => [a, Math.max(0, Math.round(n * (0.008 + r() * 0.012)))]));
  series['saude.nascidos'] = nasc;
  series['saude.obitos'] = obit;
  series['saude.mortalidade'] = Object.fromEntries(Object.entries(nasc).map(([a, n]) => [a, +((obit[a] / n) * 1000).toFixed(2)]));
  if (esfera === 'M') series['saude.diarreia'] = caminho(anosAnuais.filter(a => a !== hojeAno - 2), 2.1, 0.8, 0.1, 9, 2);
  const anos = {};
  for (const lista of Object.values(series)) for (const a of Object.keys(lista)) {
    if (anos[a]) continue;
    const n = +a;
    if (n < anoDe || n > anoAte) { anos[a] = { noRecorte: false, mesesNaJanela: 0, atribuicao: null }; continue; }
    const a0 = demoMax(`${a}-01-01`, janela.de), b0 = demoMin(`${a}-12-31`, janela.ate);
    anos[a] = { noRecorte: true, mesesNaJanela: (+b0.slice(0, 4) - +a0.slice(0, 4)) * 12 + (+b0.slice(5, 7) - +a0.slice(5, 7)) + 1, atribuicao: demoAtribuir(gestoes, `${a}-01-01`, `${a}-12-31`) };
  }
  return { coletadoEm: janela.referencia, series, anos };
}

function demoExecutivo(cargo, item, idx) {
  demoConstruir();
  const hoje = new Date();
  const hojeISO = demoIso(hoje);
  const hojeAno = hoje.getFullYear();
  const janela = demoJanela();
  const r = aleatorio(Number(item.ibge) * 31 + 7);
  const gestoes = demoGestoesGovernador(item, idx, r, hojeISO);
  const esfera = 'E';
  const pop = item.populacao || 10000;
  const ctx = { janela, gestoes, hojeAno, pop, esfera, contas: item.contas || { pessoal: 45, divida: 30 }, pc0: 4500 + r() * 4500, semBalanco: !item.contas, naoColetado: false };
  const anos = {};
  for (let a = +janela.de.slice(0, 4); a <= +janela.ate.slice(0, 4); a++) anos[a] = demoAno(r, a, ctx);
  const pibpc = 22000 + r() * 48000;
  const contexto = { populacao: { ano: hojeAno - 1, valor: pop }, pib: { ano: hojeAno - 3, valor: Math.round(pop * pibpc / 1000), porHabitante: Math.round(pibpc) } };
  if (idx % 10 !== 5) contexto.censo = { ano: 2022, referencia: '2022-08-01', agua: demoRound(72 + r() * 27), esgoto: demoRound(38 + r() * 57), lixo: demoRound(86 + r() * 13) };
  return {
    versao: 1, geradoEm: new Date().toISOString(), cargo: 'governador',
    ente: { ibge: item.ibge, nome: NOMES_UF[item.uf], uf: item.uf, esfera, populacao: pop },
    janela, aviso: DEMO_AVISO,
    gestoes: gestoes.filter(g => (g.inicio <= janela.ate && g.fim >= janela.de) || g.situacao !== 'encerrada'),
    anos, contexto, entregas: item.contas ? item.contas.entregas : null,
    resultados: demoResultados(aleatorio(Number(item.ibge) * 17 + 3), { janela, gestoes, hojeAno, esfera, pop, idx })
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
  const clamp = x => demoRound(Math.max(0, Math.min(100, x)));
  const serieDe = id => indicadores[id].serie.map(p => p.v);
  const infl = serieDe('pres.ipca12').slice(-1)[0];
  const desoc = serieDe('pres.desocupacao');
  const desocMedia = demoRound2(desoc.reduce((a, b) => a + b, 0) / desoc.length);
  const dv = serieDe('pres.divida-bruta');
  const dDivida = demoRound2(dv[dv.length - 1] - dv[0]);
  const sInfl = clamp(infl > 4.5 ? 100 * (1 - (infl - 4.5) / 6) : infl < 1.5 ? 100 * (1 - (1.5 - infl) / 3) : 100);
  const sDes = clamp(100 * (12 - desocMedia) / 8);
  const sDiv = clamp(100 * (1 - Math.max(0, dDivida) / 10));
  const compInd = [
    { k: 'inflacao', peso: 35, s: sInfl, f: `IPCA em 12 meses de ${demoPct(infl)}% no último mês disponível (meta de 3%, com tolerância de 1,5 ponto). Exemplo inventado.` },
    { k: 'desocupacao', peso: 35, s: sDes, f: `Desocupação média de ${demoPct(desocMedia)}% nos meses da gestão no período. Exemplo inventado.` },
    { k: 'divida', peso: 30, s: sDiv, f: `Dívida bruta variou ${demoPct(dDivida)} ponto percentual do PIB entre o primeiro e o último mês da gestão no período. Exemplo inventado.` }
  ];
  const indice = {
    versao: 1, nome: 'Índice econômico', gestao: 'Presidente Atual Exemplo',
    parcial: { usadas: 3, total: 3, escopo: 'só inflação, desemprego e dívida; saúde, educação e segurança aparecem na comparação do Brasil com o mundo, sem nota' },
    nota: demoNota(compInd, { inflacao: 35, desocupacao: 35, divida: 30 }), comp: compInd,
    ressalva: 'A economia depende de muitos fatores, internos e externos (Banco Central, Congresso, câmbio, clima, cenário internacional). O índice não atribui o resultado só à pessoa do presidente e não mede as demais áreas do governo federal. Exemplo inventado.'
  };
  return { versao: 1, geradoEm: new Date().toISOString(), cargo: 'presidente', ente: { nome: 'Brasil', esfera: 'F' }, indice, janela, aviso: DEMO_AVISO, gestoes: todas.filter(g => (g.inicio <= janela.ate && g.fim >= janela.de) || g.situacao !== 'encerrada'), indicadores, erros: [] };
}

function demoExecutivoPorIbge(ibge) {
  demoConstruir();
  const id = Number(ibge);
  const gi = DEMO.governadores.itens.findIndex(g => g.ibge === id);
  if (gi >= 0) return demoExecutivo('governadores', DEMO.governadores.itens[gi], gi);
  throw new Error(`HTTP 404 em executivos/${ibge}.json`);
}

/* O Brasil no mundo (inventado): só mostra o formato dos cartões da aba do presidente. As posições não são reais. */
function demoMundo() {
  const agora = new Date().toISOString();
  const defs = [
    ['SP.DYN.LE00.IN', 'saude', 'Expectativa de vida ao nascer', 'anos', 'maior', 1, 74.5, 2023, 107, 190, 85.1, 'Japão', 71.8],
    ['SP.DYN.IMRT.IN', 'saude', 'Mortalidade infantil (até 1 ano)', 'por mil nascidos vivos', 'menor', 1, 13.3, 2023, 91, 192, 1.4, 'Finlândia', 19.6],
    ['SH.STA.MMRT', 'saude', 'Mortalidade materna', 'por 100 mil nascidos vivos', 'menor', 0, 72, 2020, 88, 180, 2, 'Grécia', 100],
    ['HD.HCI.OVRL', 'educacao', 'Índice de Capital Humano (0 a 1)', 'índice', 'maior', 2, 0.6, 2020, 80, 174, 0.88, 'Singapura', 0.55],
    ['SE.ADT.LITR.ZS', 'educacao', 'Adultos alfabetizados', '%', 'maior', 1, 94.2, 2022, 120, 160, 99.9, 'Finlândia', 92.1],
    ['VC.IHR.PSRC.P5', 'seguranca', 'Homicídios intencionais', 'por 100 mil habitantes', 'menor', 1, 21.2, 2022, 151, 185, 0.3, 'Singapura', 4.8],
    ['NY.GDP.PCAP.PP.CD', 'economia', 'PIB por pessoa (poder de compra, US$ atuais)', 'US$', 'maior', 0, 20000, 2023, 90, 189, 140000, 'Luxemburgo', 15500],
    ['SL.UEM.TOTL.ZS', 'economia', 'Desemprego (estimativa da OIT)', '% da força de trabalho', 'menor', 1, 7.4, 2023, 98, 180, 0.1, 'Catar', 6.2],
    ['CC.EST', 'transparencia', 'Controle da corrupção (índice de governança, -2,5 a 2,5)', 'índice', 'maior', 2, -0.45, 2023, 118, 200, 2.1, 'Dinamarca', -0.3]
  ];
  return {
    geradoEm: agora, demo: true,
    fonte: { nome: 'Banco Mundial (números inventados no modo demonstração)', url: 'https://data.worldbank.org/' },
    regra: 'Posição do Brasil entre os países com dado (1 = melhor). Cada país entra com o valor mais recente, de até 5 anos antes do ano do dado do Brasil. Agrupamentos de países não entram. (No modo demonstração, todos os valores e posições são inventados.)',
    indicadores: [
      ...defs.map(([id, tema, nome, unidade, melhor, casas, valor, ano, posicao, de, melhorValor, melhorPais, mediana]) => ({
        id, tema, nome, unidade, melhor, url: `https://data.worldbank.org/indicator/${id}?locations=BR`, posicao, de,
        brasil: { valor, ano }, melhorPais: { pais: melhorPais, valor: melhorValor, ano }, mediana, mesmoAno: Math.round(de * 0.7), anosDosPaises: { de: ano - 4, ate: ano }, lidoEm: agora
      })),
      { id: 'HD.HCI.LAYS', tema: 'educacao', nome: 'Anos de escola ajustados pela aprendizagem', unidade: 'anos', melhor: 'maior', url: 'https://data.worldbank.org/indicator/HD.HCI.LAYS?locations=BR', posicao: null, motivo: 'Dado não encontrado ou não confirmado: poucos países com dado recente (exemplo inventado); a comparação não é confiável.', lidoEm: agora }
    ]
  };
}

/* Ranking entre os estados (inventado): mostra o formato das abas do governador sem nota. */
function demoRankingEstados() {
  const r = aleatorio(31415);
  const metricas = [
    ['eco.pib-pc', 'economia', 'PIB por habitante', 'R$ por habitante', 'neutro', 0, () => 20000 + r() * 70000, 'O PIB é a riqueza produzida no território, não a renda das pessoas nem o desempenho da gestão.'],
    ['servicos.pc-15', 'servicos', 'Despesa paga com urbanismo por habitante', 'R$ por habitante', 'neutro', 0, () => 20 + r() * 400, 'Gasto não é resultado: gastar mais ou menos com urbanismo não diz se o serviço é bom.'],
    ['orc.pc-total', 'orcamento', 'Despesa paga total por habitante', 'R$ por habitante', 'neutro', 0, () => 3500 + r() * 6500, 'Gasto não é resultado: o ranking só ordena do maior valor ao menor e não diz quem administra melhor.'],
    ['orc.pessoal', 'orcamento', 'Despesa com pessoal sobre a receita corrente líquida', '% da RCL', 'menor-melhor', 1, () => 32 + r() * 20, 'O limite da Lei de Responsabilidade Fiscal para o Poder Executivo estadual é 49%.'],
    ['orc.divida', 'orcamento', 'Dívida consolidada líquida sobre a receita corrente líquida', '% da RCL', 'menor-melhor', 1, () => -10 + r() * 150, 'O limite do Senado para os estados é 200%. Pode ser negativa quando o estado tem mais caixa do que dívida.'],
    ['transp.entregas', 'transparencia', 'Relatórios fiscais entregues ao Tesouro', '% dos relatórios esperados', 'maior-melhor', 0, () => (r() < 0.6 ? 100 : 60 + Math.floor(r() * 4) * 10), 'Mede se o estado entregou os relatórios, não se o conteúdo está correto.']
  ].map(([id, secao, nome, unidade, sentido, casas, gerar, aviso]) => {
    const valores = Object.fromEntries(UFS.map(uf => [uf, demoRound2(gerar())]).map(([uf, v]) => [uf, casas ? demoRound(v) : Math.round(v)]));
    const lista = Object.entries(valores).sort((a, b) => (sentido === 'menor-melhor' ? a[1] - b[1] : b[1] - a[1]));
    const pos = {};
    lista.forEach(([uf, v], i) => { pos[uf] = i > 0 && lista[i - 1][1] === v ? pos[lista[i - 1][0]] : i + 1; });
    const todos = Object.values(valores);
    const melhor = sentido === 'menor-melhor' ? Math.min(...todos) : Math.max(...todos);
    const pior = sentido === 'menor-melhor' ? Math.max(...todos) : Math.min(...todos);
    return { id, secao, nome, unidade, sentido, casas, aviso, ano: id === 'transp.entregas' ? null : 2025, de: UFS.length, itens: Object.fromEntries(UFS.map(uf => [uf, { valor: valores[uf], posicao: pos[uf] }])), extremos: { primeiro: melhor, ultimo: pior } };
  });
  return { versao: 1, geradoEm: new Date().toISOString(), demo: true, estados: UFS.length, regra: 'Cada métrica é comparada entre os estados que têm o dado no mesmo ano (mínimo de 20 estados). Posição 1 = melhor, quando há sentido; nas métricas neutras (gasto e PIB por habitante), 1 = maior valor, sem juízo de qualidade. (No modo demonstração, todos os valores são inventados.)', metricas };
}

function gerarDemo(nome) {
  demoConstruir();
  if (nome === 'meta.json') return DEMO.meta;
  if (nome === 'metodo.json') return METODO_DEMO;
  if (nome === 'federais.json') return DEMO.federais;
  if (nome === 'senadores.json') return DEMO.senadores;
  if (nome === 'mundo.json') return demoMundo();
  if (nome === 'ranking-estados.json') return demoRankingEstados();
  if (nome === 'independentes.json') return INDEPENDENTES_DEMO;
  if (nome === 'vigilancia.json') return VIGILANCIA_DEMO;
  if (nome === 'governadores.json') return DEMO.governadores;
  if (nome === 'votos.json') return DEMO.votos;
  if (nome === 'correcoes.json') return DEMO.correcoes;
  if (nome === 'indicadores.json') return INDICADORES_DEMO;
  if (nome === 'executivos/presidente.json') return demoPresidente();
  if (nome === 'precos.json') return PRECOS_DEMO; // números fictícios (site/precos-demo.js)
  const ex = /^executivos\/(\d+)\.json$/.exec(nome);
  if (ex) return demoExecutivoPorIbge(ex[1]);
  const h = /^deputados\/(\d+)\.json$/.exec(nome);
  if (h) return demoHistorico(h[1]);
  throw new Error(`HTTP 404 em ${nome}`);
}
