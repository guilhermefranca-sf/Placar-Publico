// Testes dos senadores (sem internet): leitura rígida da lista, dos exercícios e da CEAPS, custo, privacidade e falhas.
// Rodar:  node scripts/teste/rodar-teste-senadores.mjs
// Os "senadores" daqui são inventados só para o teste. O formato das respostas segue a documentação do Senado;
// a conferência contra a resposta real acontece na primeira rodada do pipeline (veja o diagnóstico no log).

import assert from 'node:assert/strict';
import {
  lerLista, lerMandatos, lerCeaps, valorNum, unirIntervalos, diasEmExercicio, inicioNoPeriodo, urlDoSenado, formaDaResposta,
  gerarSenadores, sondarSenado, fraseCustoSenador, urlsCeaps, urlMandatos, URLS_LISTA, NAO_MEDIDOS_SENADO
} from '../senadores.mjs';
import { METODO } from '../nota.mjs';

let falhas = 0;
const ok = (m) => console.log('ok:', m);
async function caso(nome, fn) { try { await fn(); ok(nome); } catch (e) { falhas++; console.log('FALHOU:', nome, '\n   ', (e.stack || e.message).split('\n').slice(0, 3).join('\n    ')); } }

const HOJE = new Date('2026-11-18T12:00:00Z');
const ANO = 2026;
const CPF_FALSO = '123.456.789-09';
const FORNECEDOR_FALSO = 'PADARIA DO ZE LTDA';

// ----- dados inventados -----
const NOMES = Array.from({ length: 81 }, (_, k) => `Senador Teste ${String(k + 1).padStart(2, '0')}`);
const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
const lista81 = (extra = (p) => p) => ({
  ListaParlamentarEmExercicio: { Parlamentares: { Parlamentar: NOMES.map((n, k) => extra({
    IdentificacaoParlamentar: {
      CodigoParlamentar: String(5000 + k), NomeParlamentar: n, NomeCompletoParlamentar: n + ' da Silva',
      UrlFotoParlamentar: `http://www.senado.leg.br/senadores/img/fotos-oficiais/senador${5000 + k}.jpg`,
      UrlPaginaParlamentar: `http://www25.senado.leg.br/web/senadores/senador/-/perfil/${5000 + k}`,
      SiglaPartidoParlamentar: k % 2 ? 'PXX' : 'PYY', UfParlamentar: UFS[k % 27]
    }
  }, k)) } }
});
const mandatoTitular = (k) => ({ MandatoParlamentar: { Parlamentar: { Mandatos: { Mandato: {
  DescricaoParticipacao: 'Titular',
  PrimeiraLegislaturaDoMandato: { DataInicio: '2023-02-01', DataFim: '2027-01-31' },
  SegundaLegislaturaDoMandato: { DataInicio: '2027-02-01', DataFim: '2031-01-31' },
  Exercicios: { Exercicio: [{ DataInicio: '2023-02-01' }] }
} } } } });

/** Linhas de CEAPS de um ano: 12 meses (ou até o mês de hoje) por senador, 3 linhas por mês; valor cresce com o número do senador. */
const linhasCeaps = (ano, { ate = 12, so = null } = {}) => {
  const out = [];
  for (let k = 0; k < 81; k++) {
    if (so && !so(k)) continue;
    for (let m = 1; m <= ate; m++) for (let n = 0; n < 3; n++) {
      out.push({ id: out.length, ano, mes: m, codSenador: 5000 + k, nomeSenador: NOMES[k], tipoDespesa: 'Aluguel', cpfCnpj: CPF_FALSO, fornecedor: FORNECEDOR_FALSO, documento: '1', data: `${ano}-${String(m).padStart(2, '0')}-10`, detalhamento: 'x', valorReembolsado: 1000 + k * 10 + n });
    }
  }
  return out;
};
const MIN = { fechado: 100, atual: 50 };

const fontesBoas = (sobrescrever = {}) => {
  const chamadas = [];
  const json = async (url) => {
    chamadas.push(url);
    for (const [padrao, fn] of Object.entries(sobrescrever)) if (url.includes(padrao)) return fn(url);
    if (URLS_LISTA.includes(url)) return lista81();
    const m = url.match(/\/senador\/(\d+)\/mandatos$/);
    if (m) return mandatoTitular(Number(m[1]) - 5000);
    const c = url.match(/despesas_ceaps\/(\d{4})$/);
    if (c) { const a = Number(c[1]); return linhasCeaps(a, { ate: a === ANO ? 10 : 12 }); }
    throw new Error('HTTP 404 em ' + url);
  };
  return { json, chamadas };
};
const gerar = (fontes, extra = {}) => gerarSenadores({ fontes, ano: ANO, hoje: HOJE, minLinhas: MIN, ...extra });

/* ===================== leitores ===================== */
await caso('lista: lê 81 senadores, troca http por https e só aceita endereços do Senado', () => {
  const l = lerLista(lista81());
  assert.equal(l.length, 81);
  assert.equal(l[0].id, '5000');
  assert.match(l[0].foto, /^https:\/\/www\.senado\.leg\.br\//);
  assert.match(l[0].pagina, /^https:\/\/www25\.senado\.leg\.br\//);
  assert.equal(urlDoSenado('https://exemplo.com/foto.jpg'), null);
  assert.equal(urlDoSenado('javascript:alert(1)'), null);
  assert.equal(urlDoSenado('http://evil.com/senado.leg.br/x.jpg'), null);
  const sem = lerLista(lista81((p) => { p.IdentificacaoParlamentar.UrlFotoParlamentar = 'https://exemplo.com/x.jpg'; return p; }));
  assert.equal(sem[0].foto, null);
});
await caso('lista: recusa formato estranho ou lista curta, dizendo as chaves que vieram', () => {
  assert.throws(() => lerLista({ OutraCoisa: {} }), /Formato inesperado em lista de senadores \(chaves: OutraCoisa\)/);
  assert.throws(() => lerLista([]), /Formato inesperado/);
  const curta = lista81(); curta.ListaParlamentarEmExercicio.Parlamentares.Parlamentar.length = 40;
  assert.throws(() => lerLista(curta), /só 40 senadores/);
});
await caso('lista: ignora repetidos e sem código ou nome (e não deixa objeto único quebrar)', () => {
  const l = lista81();
  const todos = l.ListaParlamentarEmExercicio.Parlamentares.Parlamentar;
  todos.push(JSON.parse(JSON.stringify(todos[0])));
  todos.push({ IdentificacaoParlamentar: { CodigoParlamentar: 'abc', NomeParlamentar: 'X' } });
  assert.equal(lerLista(l).length, 81);
  const um = { ListaParlamentarEmExercicio: { Parlamentares: { Parlamentar: todos[0] } } };
  assert.throws(() => lerLista(um), /só 1 senadores/);
  assert.equal(lerLista(um, 1).length, 1);
});
await caso('exercícios: junta intervalos, aceita fim ausente e ignora datas ruins', () => {
  assert.deepEqual(unirIntervalos([{ ini: '2023-02-01', fim: '2024-01-31' }, { ini: '2024-01-15', fim: '2025-01-31' }, { ini: '2026-03-01', fim: null }]),
    [{ ini: '2023-02-01', fim: '2025-01-31' }, { ini: '2026-03-01', fim: null }]);
  const m = lerMandatos({ MandatoParlamentar: { Parlamentar: { Mandatos: { Mandato: [{ Exercicios: { Exercicio: [
    { DataInicio: '2023-02-01', DataFim: '2024-06-30' }, { DataInicio: 'lixo' }, { DataInicio: '2024-09-01', DataFim: '' }] } }] } } } });
  assert.equal(m.base, 'exercicios');
  assert.deepEqual(m.intervalos, [{ ini: '2023-02-01', fim: '2024-06-30' }, { ini: '2024-09-01', fim: null }]);
});
await caso('exercícios: sem lista de exercícios, usa as datas do mandato SÓ para titular; suplente fica sem dado', () => {
  const sem = (participacao) => ({ MandatoParlamentar: { Parlamentar: { Mandatos: { Mandato: { DescricaoParticipacao: participacao,
    PrimeiraLegislaturaDoMandato: { DataInicio: '2023-02-01', DataFim: '2027-01-31' }, SegundaLegislaturaDoMandato: { DataInicio: '2027-02-01', DataFim: '2031-01-31' } } } } } });
  const t = lerMandatos(sem('Titular'));
  assert.equal(t.base, 'mandato');
  assert.deepEqual(t.intervalos, [{ ini: '2023-02-01', fim: '2031-01-31' }]);
  assert.equal(lerMandatos(sem('1º Suplente')), null);
  assert.equal(lerMandatos({}), null);
  assert.equal(lerMandatos({ MandatoParlamentar: { Parlamentar: { Mandatos: { Mandato: [] } } } }), null);
});
await caso('dias em exercício e início dentro da janela', () => {
  const iv = [{ ini: '2023-02-01', fim: null }];
  assert.equal(inicioNoPeriodo(iv, '2023-01-01', '2026-11-18'), '2023-02-01');
  assert.equal(inicioNoPeriodo([{ ini: '2020-02-01', fim: null }], '2023-01-01', '2026-11-18'), '2023-01-01');
  assert.equal(inicioNoPeriodo([{ ini: '2019-02-01', fim: '2022-12-31' }], '2023-01-01', '2026-11-18'), null);
  assert.equal(diasEmExercicio([{ ini: '2026-01-01', fim: '2026-01-31' }], '2026-01-01', '2026-12-31'), 31);
  assert.equal(diasEmExercicio([{ ini: '2026-01-01', fim: null }], '2026-01-01', '2026-01-10'), 10);
});
await caso('valores: aceita número, "1.234,56", "1234,56", "1234.56" e recusa o resto', () => {
  assert.equal(valorNum(12.5), 12.5);
  assert.equal(valorNum('1.234,56'), 1234.56);
  assert.equal(valorNum('1234,56'), 1234.56);
  assert.equal(valorNum('1234.56'), 1234.56);
  assert.equal(valorNum('-50,00'), -50);
  assert.equal(valorNum('R$ 10,00'), 10);
  assert.ok(Number.isNaN(valorNum('abc')));
  assert.ok(Number.isNaN(valorNum(null)));
  assert.ok(Number.isNaN(valorNum(undefined)));
});
await caso('CEAPS: soma por senador e mês e DESCARTA CPF, fornecedor e documento na leitura', () => {
  const r = lerCeaps(linhasCeaps(2025), 2025, { minLinhas: 100 });
  assert.equal(r.linhas, 81 * 36);
  assert.equal(r.itens['5000']['1'], 3003); // 1000 + 1001 + 1002
  const texto = JSON.stringify(r);
  assert.ok(!texto.includes(CPF_FALSO) && !texto.includes(FORNECEDOR_FALSO) && !/cpf|fornecedor|documento/i.test(texto));
});
await caso('CEAPS: aceita nomes de campo alternativos, valor em texto e resposta embrulhada num objeto', () => {
  const linhas = linhasCeaps(2025).map((l) => ({ ANO: l.ano, MES: l.mes, COD_SENADOR: l.codSenador, VALOR_REEMBOLSADO: String(l.valorReembolsado).replace('.', ',') }));
  const r = lerCeaps({ dados: linhas }, 2025, { minLinhas: 100 });
  assert.equal(r.itens['5000']['1'], 3003);
});
await caso('CEAPS: recusa o ano inteiro com mais de 5% de linhas ilegíveis, vazio, curto ou sem lista', () => {
  const ruim = linhasCeaps(2025); for (let k = 0; k < Math.ceil(ruim.length * 0.06); k++) ruim[k].valorReembolsado = 'sem valor';
  assert.throws(() => lerCeaps(ruim, 2025, { minLinhas: 100 }), /linhas ilegíveis/);
  const pouco = linhasCeaps(2025); pouco[0].mes = 13;
  assert.equal(lerCeaps(pouco, 2025, { minLinhas: 100 }).invalidas, 1); // 1 em milhares passa e é contada
  assert.throws(() => lerCeaps([], 2025), /veio vazia/);
  assert.throws(() => lerCeaps(linhasCeaps(2025, { so: (k) => k < 1 }), 2025, { minLinhas: 2000 }), /parece leitura incompleta/);
  assert.throws(() => lerCeaps({ erro: 'x' }, 2025), /Formato inesperado em despesas da CEAPS de 2025 \(chaves: erro\)/);
  assert.throws(() => lerCeaps(linhasCeaps(2024), 2025, { minLinhas: 100 }), /linhas ilegíveis/); // ano diferente do pedido
});
await caso('forma da resposta: só nomes de campos, nunca valores', () => {
  const f = formaDaResposta({ A: { B: [{ Cpf: '12345678909', Nome: 'Fulano' }] }, C: 'valor secreto' });
  const t = JSON.stringify(f);
  assert.ok(t.includes('Cpf') && t.includes('Nome'));
  assert.ok(!t.includes('12345678909') && !t.includes('Fulano') && !t.includes('valor secreto'));
});

/* ===================== geração ===================== */
await caso('geração: custo por mês, ranking de custo, índice AINDA NÃO calculado (só 1 critério), outros critérios "não confirmado"', async () => {
  const { json } = fontesBoas();
  const r = await gerar({ json });
  assert.equal(r.total, 81);
  assert.equal(r.comCusto, 81);
  assert.equal(r.comNota, 0, 'com um só critério confirmado não pode haver índice');
  assert.equal(r.media, null);
  assert.deepEqual(r.criteriosLidos, ['custo']);
  const a = r.itens.find((i) => i.id === '5000'), z = r.itens.find((i) => i.id === '5080');
  assert.equal(a.nota, null);
  assert.match(a.motivo, /pelo menos 2 critérios confirmados e hoje o Placar confirma 1 de 5/);
  const custo = (i) => i.comp.find((c) => c.k === 'custo');
  assert.ok(custo(a).s > custo(z).s, 'quem custou menos pontua mais');
  assert.equal(custo(a).s, 99.4); // o mais barato dos 81: percentil 0,5/81
  for (const k of ['pres', 'vot', 'aprov', 'comis']) {
    const c = a.comp.find((x) => x.k === k);
    assert.equal(c.s, null);
    assert.match(c.f, /Dado não encontrado ou não confirmado/);
    assert.match(c.f, /não significa nota baixa nem zero/);
  }
  assert.match(custo(a).f, /Custou R\$ [\d.]+ em cota para o exercício da atividade parlamentar \(CEAPS\) desde 01\/02\/2023/);
  assert.match(custo(a).f, /Só a CEAPS é medida nesta versão/);
  assert.match(custo(a).f, /auxílio-moradia/);
  // CEAPS: 2023 = 11 meses de exercício mas 12 meses de lançamento no arquivo inventado; só conferimos o total somado
  const soma = Object.values(a.extra.custo.anos).reduce((x, y) => x + y.ceaps, 0);
  assert.equal(soma, a.extra.custo.total);
  assert.deepEqual(Object.keys(a.extra.custo.componentes), ['ceaps']);
  assert.ok(a.extra.meses > 45 && a.extra.meses < 46.5, 'meses de exercício: 01/02/2023 a 18/11/2026 = ' + a.extra.meses);
  assert.equal(a.extra.exercicioBase, 'exercicios');
  assert.equal(a.foto.startsWith('https://'), true);
  assert.equal(a.uf, 'AC');
});
await caso('geração: o texto dos pesos continua somando 100 e sem o nome de nenhum campo pessoal', () => {
  assert.equal(METODO.senadores.componentes.reduce((s, c) => s + c.peso, 0), 100);
  assert.ok(NAO_MEDIDOS_SENADO.some((x) => /auxílio-moradia/.test(x)) && NAO_MEDIDOS_SENADO.some((x) => /saúde/.test(x)));
});
await caso('privacidade: nenhum CPF nem nome de fornecedor chega ao arquivo, ao cache ou ao diagnóstico', async () => {
  const { json } = fontesBoas();
  const guardados = {};
  const r = await gerar({ json }, { cache: { ler: (a) => guardados[a] || null, gravar: (a, o) => { guardados[a] = JSON.parse(JSON.stringify(o)); } } });
  const tudo = JSON.stringify(r) + JSON.stringify(guardados);
  assert.ok(!tudo.includes(CPF_FALSO) && !tudo.includes(FORNECEDOR_FALSO) && !tudo.includes('123.456'));
  assert.ok(!/cpf|cnpj|fornecedor/i.test(tudo.replace(/Formato inesperado/g, '')));
});
await caso('cache: anos fechados vêm do arquivo guardado e só o ano em curso é lido de novo', async () => {
  const guardados = {};
  const cache = { ler: (a) => guardados[a] || null, gravar: (a, o) => { guardados[a] = JSON.parse(JSON.stringify(o)); } };
  const um = fontesBoas();
  await gerar({ json: um.json }, { cache });
  assert.equal(um.chamadas.filter((u) => /despesas_ceaps/.test(u)).length, 4);
  const dois = fontesBoas();
  const r = await gerar({ json: dois.json }, { cache });
  const lidas = dois.chamadas.filter((u) => /despesas_ceaps/.test(u));
  assert.deepEqual(lidas.map((u) => u.match(/(\d{4})$/)[1]), ['2026'], 'só o ano em curso');
  assert.equal(r.comCusto, 81);
  assert.deepEqual(r.diagnostico.anosDoCache, [2023, 2024, 2025]);
  const tres = fontesBoas();
  await gerar({ json: tres.json }, { cache, usarCache: false });
  assert.equal(tres.chamadas.filter((u) => /despesas_ceaps/.test(u)).length, 4, 'refazer tudo lê todos de novo');
});
await caso('cache: ano em curso guardado nunca vale como ano fechado (marcado como parcial)', async () => {
  const guardados = {};
  const cache = { ler: (a) => guardados[a] || null, gravar: (a, o) => { guardados[a] = JSON.parse(JSON.stringify(o)); } };
  await gerar({ json: fontesBoas().json }, { cache });
  assert.equal(guardados[2026].parcial, true);
  assert.equal(guardados[2025].parcial, undefined);
  // no ano seguinte, o arquivo de 2026 (guardado em novembro de 2026) NÃO vale como ano fechado
  const prox = new Date('2027-01-20T12:00:00Z');
  const j = fontesBoas().json;
  const chamadas = [];
  const r = await gerarSenadores({ fontes: { json: async (u) => { chamadas.push(u); return j(u); } }, ano: 2027, hoje: prox, minLinhas: MIN, cache });
  assert.ok(chamadas.some((u) => /despesas_ceaps\/2026$/.test(u)), '2026 foi relido porque o guardado era parcial');
  assert.ok(r.diagnostico.anosLidos.includes(2026));
});
await caso('falha só do ano em curso: usa a leitura guardada de até 7 dias e avisa; mais velha que isso, o custo some', async () => {
  const guardados = {};
  const cache = { ler: (a) => guardados[a] || null, gravar: (a, o) => { guardados[a] = JSON.parse(JSON.stringify(o)); } };
  await gerar({ json: fontesBoas().json }, { cache });
  const quebrada = fontesBoas({ 'despesas_ceaps/2026': () => { throw new Error('HTTP 503'); } });
  const r = await gerar({ json: quebrada.json }, { cache, hoje: new Date('2026-11-20T12:00:00Z') });
  assert.equal(r.comCusto, 81);
  assert.match(r.diagnostico.avisos.join(' '), /leitura de hoje falhou.*usada a leitura de 18\/11\/2026/);
  const velha = await gerar({ json: quebrada.json }, { cache, hoje: new Date('2026-12-05T12:00:00Z') });
  assert.equal(velha.comCusto, 0);
  const a = velha.itens[0];
  assert.equal(a.extra.custo, null);
  assert.match(a.extra.custoMotivo, /A CEAPS de 2026 não pôde ser lida/);
  assert.match(a.comp.find((c) => c.k === 'custo').f, /Dado não encontrado ou não confirmado\. A CEAPS de 2026.*Isso não significa custo zero/);
  assert.equal(a.comp.find((c) => c.k === 'custo').s, null);
  assert.equal(velha.total, 81, 'a lista de senadores, com foto, continua');
});
await caso('CEAPS fora do ar: a lista com foto, partido e UF sai do mesmo jeito, sem custo e sem nota zero', async () => {
  const { json } = fontesBoas({ despesas_ceaps: () => { throw new Error('HTTP 500'); } });
  const r = await gerar({ json });
  assert.equal(r.total, 81);
  assert.equal(r.comCusto, 0);
  assert.equal(r.comNota, 0);
  assert.ok(r.itens.every((i) => i.nota == null && i.comp.every((c) => c.s == null) && i.foto && i.partido && i.uf));
  assert.deepEqual(Object.keys(r.diagnostico.anosNaoConfirmados).map(Number), [2023, 2024, 2025, 2026]);
});
await caso('CEAPS: o segundo endereço é tentado quando o primeiro falha', async () => {
  const f = fontesBoas();
  const json = async (u) => { if (u.includes('adm.senado.leg.br')) throw new Error('HTTP 502'); return f.json(u); };
  const r = await gerar({ json });
  assert.equal(r.comCusto, 81);
  assert.match(r.diagnostico.ceapsUrl, /adm\.senado\.gov\.br/);
  assert.ok(urlsCeaps(2026).length === 2);
});
await caso('códigos que não batem: o custo não é atribuído a ninguém (nada de nota por engano)', async () => {
  const { json } = fontesBoas({ despesas_ceaps: (u) => { const a = Number(u.match(/(\d{4})$/)[1]); return linhasCeaps(a).map((l) => ({ ...l, codSenador: l.codSenador + 900000 })); } });
  const r = await gerar({ json });
  assert.equal(r.comCusto, 0);
  assert.match(r.diagnostico.avisos.join(' '), /os códigos podem não ser os mesmos/);
  assert.match(r.itens[0].extra.custoMotivo, /códigos da CEAPS não puderam ser conferidos/);
});
await caso('exercício: suplente que entrou em 2026 é comparado pelos meses dele; sem exercício lido fica sem custo; poucos meses não são comparados', async () => {
  const { json } = fontesBoas({
    '/5001/mandatos': () => ({ MandatoParlamentar: { Parlamentar: { Mandatos: { Mandato: { Exercicios: { Exercicio: [{ DataInicio: '2026-03-01' }] } } } } } }),
    '/5002/mandatos': () => { throw new Error('HTTP 500'); },
    '/5003/mandatos': () => ({ MandatoParlamentar: { Parlamentar: { Mandatos: { Mandato: { Exercicios: { Exercicio: [{ DataInicio: '2026-10-01' }] } } } } } }),
    '/5004/mandatos': () => ({ MandatoParlamentar: { Parlamentar: { Mandatos: { Mandato: { Exercicios: { Exercicio: [{ DataInicio: '2019-02-01', DataFim: '2022-12-31' }] } } } } } })
  });
  const r = await gerar({ json });
  const i1 = r.itens.find((i) => i.id === '5001'), i2 = r.itens.find((i) => i.id === '5002'), i3 = r.itens.find((i) => i.id === '5003'), i4 = r.itens.find((i) => i.id === '5004');
  assert.equal(i1.desde, '2026-03-01');
  assert.ok(i1.extra.meses > 8 && i1.extra.meses < 9, "meses " + i1.extra.meses);
  assert.equal(i1.extra.custo.anos[2023].semLancamento, undefined);
  assert.equal(i2.extra.custo, null);
  assert.match(i2.extra.custoMotivo, /período de exercício deste senador não pôde ser lido/);
  assert.equal(r.diagnostico.mandatosFalhas, 1);
  assert.equal(i3.extra.custo.poucosMeses, true);
  assert.equal(i3.comp.find((c) => c.k === 'custo').s, null);
  assert.match(i3.comp.find((c) => c.k === 'custo').f, /Só 1,6 meses de exercício/);
  assert.equal(i4.extra.custo, null);
  assert.match(i4.extra.custoMotivo, /não esteve em exercício nos últimos 4 anos/);
  assert.equal(r.comCusto, 81 - 3);
});
await caso('ano sem nenhuma linha para um senador em exercício: marcado "sem lançamento" (não é erro) e soma zero só desse ano', async () => {
  const { json } = fontesBoas({ 'despesas_ceaps/2024': () => linhasCeaps(2024, { so: (k) => k !== 7 }) });
  const r = await gerar({ json });
  const s = r.itens.find((i) => i.id === '5007');
  assert.deepEqual(s.extra.custo.anos[2024].semLancamento, ['ceaps']);
  assert.equal(s.extra.custo.anos[2024].ceaps, 0);
  assert.equal(r.comCusto, 81);
});
await caso('exercício só pelas datas do mandato: a frase avisa que licença não foi descontada', async () => {
  const { json } = fontesBoas({ '/5010/mandatos': () => ({ MandatoParlamentar: { Parlamentar: { Mandatos: { Mandato: { DescricaoParticipacao: 'Titular',
    PrimeiraLegislaturaDoMandato: { DataInicio: '2023-02-01', DataFim: '2027-01-31' }, SegundaLegislaturaDoMandato: { DataInicio: '2027-02-01', DataFim: '2031-01-31' } } } } } }) });
  const r = await gerar({ json });
  const s = r.itens.find((i) => i.id === '5010');
  assert.equal(s.extra.exercicioBase, 'mandato');
  assert.match(s.comp.find((c) => c.k === 'custo').f, /uma licença não é descontada/);
  const o = r.itens.find((i) => i.id === '5011');
  assert.doesNotMatch(o.comp.find((c) => c.k === 'custo').f, /licença não é descontada/);
});
await caso('lista fora do ar ou curta: a geração falha inteira (o arquivo anterior continua no ar)', async () => {
  await assert.rejects(() => gerar({ json: async () => { throw new Error('HTTP 503'); } }), /HTTP 503/);
  const curta = fontesBoas({ 'lista/atual': () => { const l = lista81(); l.ListaParlamentarEmExercicio.Parlamentares.Parlamentar.length = 10; return l; } });
  await assert.rejects(() => gerar({ json: curta.json }), /só 10 senadores/);
  const estranha = fontesBoas({ 'lista/atual': () => ({ foo: 1 }) });
  await assert.rejects(() => gerar({ json: estranha.json }), /Formato inesperado em lista de senadores/);
});
await caso('lista: se o primeiro endereço falha, o segundo (.json) é tentado', async () => {
  const f = fontesBoas();
  const json = async (u) => { if (u === URLS_LISTA[0]) throw new Error('HTTP 406'); return f.json(u); };
  const r = await gerar({ json });
  assert.equal(r.total, 81);
});
await caso('a frase do custo avisa quando só há poucos meses e nunca inventa percentil', () => {
  const f = fraseCustoSenador({ custo: { poucosMeses: true, meses: 1.5, total: 12345 } }, null, 80, '01/10/2026');
  assert.match(f, /Só 1,5 meses de exercício no período; o custo por mês só é comparado a partir de 3 meses\. Até agora, em CEAPS: R\$ 12\.345/);
  assert.match(fraseCustoSenador({ custo: null, custoMotivo: 'Motivo X.' }, null, 0, null), /^Dado não encontrado ou não confirmado\. Motivo X\. Isso não significa custo zero\.$/);
});
await caso('sondagem: grava só nomes de campos, e uma consulta que falha não derruba as outras', async () => {
  const json = async (u) => { if (u.endsWith('/votacoes')) throw new Error('HTTP 404 em ' + u); return { Raiz: { Lista: [{ Campo: 'valor 1', Outro: { Dentro: 2 } }] } }; };
  const r = await sondarSenado({ json, cod: '5000', hoje: HOJE });
  assert.equal(r.consultas.autorias.ok, true);
  assert.equal(r.consultas.votacoes.ok, false);
  assert.match(r.consultas.votacoes.erro, /HTTP 404/);
  const t = JSON.stringify(r);
  assert.ok(t.includes('Campo') && !t.includes('valor 1'));
  assert.ok(urlMandatos('5000').endsWith('/senador/5000/mandatos'));
});

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes dos senadores passaram.');
process.exit(falhas ? 1 : 0);
