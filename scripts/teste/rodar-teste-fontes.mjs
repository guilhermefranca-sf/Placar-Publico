// Testes das fontes independentes (sem internet): catálogo, valores conferidos, vigilância diária.
// Rodar:  node scripts/teste/rodar-teste-fontes.mjs

import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  lerCatalogo, lerCurados, validarCatalogo, validarIndicadores, montarIndependentes, textoDaPagina, marcaDaPagina,
  mesesRecentes, acharChave, compararMarcas, vigiarFontes, atualizarIndependentes, pendenteDeConferencia
} from '../fontes-externas.mjs';

let falhas = 0;
const ok = (m) => console.log('ok:', m);
async function caso(nome, fn) { try { await fn(); ok(nome); } catch (e) { falhas++; console.log('FALHOU:', nome, '\n   ', e.message.split('\n')[0]); } }
const temp = () => mkdtempSync(path.join(os.tmpdir(), 'placar-fontes-'));
const copia = (o) => JSON.parse(JSON.stringify(o));
const HOJE = new Date('2026-11-26T12:00:00Z');
const dia = (n) => new Date(HOJE.getTime() + n * 86400000);

const catalogo = lerCatalogo();
const curados = lerCurados();

const pagina = (ano, extra = '') => `<html><head><script>var x=2031;</script><style>.a{}</style></head><body><h1>Ranking ${ano}</h1><p>${'Texto de apresentação da edição, com metodologia e resultados. '.repeat(8)}${extra}</p></body></html>`;

/* ===================== catálogo e valores conferidos ===================== */
await caso('catálogo real: sem problemas, 13 fontes, nenhuma "em uso" sem lastro', () => {
  assert.deepEqual(validarCatalogo(catalogo), []);
  assert.equal(catalogo.fontes.length, 13);
  for (const nome of ['CLP', 'IPS', 'Trata', 'Firjan', 'Fórum', 'Transparência', 'Banco Mundial', 'QEdu', 'IEPS', 'Base dos Dados', 'DIEESE', 'Social Progress']) {
    assert.ok(catalogo.fontes.some((f) => f.nome.includes(nome) || f.organizacao.includes(nome) || f.id.includes(nome.toLowerCase().replace(/ /g, '-'))), `falta ${nome}`);
  }
});
await caso('catálogo: aponta URL sem https, id repetido, status inválido e uso sem cargo', () => {
  const c = copia(catalogo);
  c.fontes[1].url = 'http://exemplo.org';
  c.fontes[2].id = c.fontes[3].id;
  c.fontes[4].status = 'ativa';
  delete c.fontes[5].usoNoPlacar.federais;
  c.fontes[6].fatos[0].url = 'ftp://x';
  c.fontes[7].vigia = { tipo: 'url-mensal', modelo: 'https://x.org/{AAAA}.pdf' };
  const e = validarCatalogo(c).join('\n');
  for (const trecho of ['URL precisa começar', 'id repetido', 'status inválido', 'usoNoPlacar', 'fato 1', 'modelo mensal']) assert.match(e, new RegExp(trecho));
  assert.deepEqual(validarCatalogo({ fontes: [] }), ['O catálogo não tem fontes.']);
});
await caso('valores conferidos reais: os 3 do presidente são publicados', () => {
  const { validos, descartados } = validarIndicadores(curados, catalogo, HOJE);
  assert.deepEqual(descartados, []);
  assert.deepEqual(validos.map((v) => v.id).sort(), ['dieese-salario-minimo-necessario', 'fbsp-mvi-brasil', 'ips-brasil-media-nacional']);
  assert.ok(validos.every((v) => v.cargo === 'presidente' && v.fonte.url.startsWith('https://') && v.urls.length && v.conferidoEm));
});
await caso('valores conferidos: o que está incompleto não é publicado', () => {
  const c = copia(curados);
  const base = c.indicadores[0];
  c.indicadores = [
    { ...base, id: 'sem-url', urls: [] },
    { ...base, id: 'valor-ruim', pontos: [{ rotulo: '2025', valor: 'abc' }] },
    { ...base, id: 'fonte-desconhecida', fonteId: 'nao-existe' },
    { ...base, id: 'fonte-catalogada', fonteId: 'clp' },
    { ...base, id: 'data-futura', conferidoEm: '2027-01-01' },
    { ...base, id: 'sem-aviso', aviso: '' },
    { ...base, id: 'sentido-ruim', melhor: 'talvez' },
    { ...base, id: 'bom' }
  ];
  const { validos, descartados } = validarIndicadores(c, catalogo, HOJE);
  assert.deepEqual(validos.map((v) => v.id), ['bom']);
  assert.equal(descartados.length, 7);
  assert.match(descartados.find((d) => d.id === 'fonte-catalogada').motivos.join(), /em uso/);
});

/* ===================== leitura de páginas ===================== */
await caso('página: ignora script, estilo e comentário; acha o ano mais recente (ignorando anos distantes no futuro)', () => {
  const t = textoDaPagina('<style>a{}</style><script>var y=2099</script><!-- 2040 --><p>Edição&nbsp;2026 &amp; 2025</p>');
  assert.equal(t, 'Edição 2026 & 2025');
  const m = marcaDaPagina(pagina(2026, ' Também cita 2045 e 2027.'), HOJE);
  assert.equal(m.anoMaisRecente, 2027); // 2027 = ano que vem (permitido); 2045 e 2031 (script) não contam
  assert.match(m.hash, /^[0-9a-f]{16}$/);
});
await caso('página montada por JavaScript (quase sem texto) não vira marca', () => {
  assert.equal(marcaDaPagina('<html><body><div id="root"></div><script src="app.js"></script></body></html>', HOJE), null);
});
await caso('meses recentes: virada de ano', () => {
  assert.deepEqual(mesesRecentes(new Date('2026-01-15T00:00:00Z'), 3), ['202601', '202512', '202511']);
});
await caso('acharChave: encontra lastupdated em qualquer nível', () => {
  assert.deepEqual(acharChave([{ page: 1 }, [{ id: '2', lastupdated: '2026-07-01' }]], 'lastupdated'), ['2026-07-01']);
  assert.deepEqual(acharChave({ a: { b: 3 } }, 'lastupdated'), []);
});
await caso('comparar marcas: primeira leitura, sem mudança, mudou, edição nova', () => {
  const a = { hash: 'aaa', anoMaisRecente: 2025 };
  assert.equal(compararMarcas('pagina', null, a).status, 'primeira-leitura');
  assert.equal(compararMarcas('pagina', a, { ...a }).status, 'sem-mudanca');
  assert.equal(compararMarcas('pagina', a, { hash: 'bbb', anoMaisRecente: 2025 }).status, 'mudou');
  assert.deepEqual(compararMarcas('pagina', a, { hash: 'bbb', anoMaisRecente: 2026 }), { status: 'nova-edicao', de: '2025', para: '2026' });
  assert.equal(compararMarcas('pagina', a, { hash: 'bbb', anoMaisRecente: 2024 }).status, 'mudou'); // ano que volta atrás não é edição nova
  assert.equal(compararMarcas('url-mensal', { ultimoMes: '202610' }, { ultimoMes: '202611' }).status, 'nova-edicao');
  assert.equal(compararMarcas('banco-mundial', { atualizadoEm: '2026-07-01' }, { atualizadoEm: '2026-07-01' }).status, 'sem-mudanca');
});

/* ===================== vigilância diária ===================== */
// Catálogo pequeno: uma página, um PDF mensal e o Banco Mundial.
const mini = {
  ...copia(catalogo),
  fontes: [
    { ...copia(catalogo.fontes.find((f) => f.id === 'clp')), vigia: { tipo: 'pagina', url: 'https://clp.exemplo.org/' }, verificadoEm: '2026-11-01' },
    { ...copia(catalogo.fontes.find((f) => f.id === 'dieese')), vigia: { tipo: 'url-mensal', modelo: 'https://dieese.exemplo.org/{AAAA}/{AAAAMM}cesta.pdf', meses: 3 } },
    { ...copia(catalogo.fontes.find((f) => f.id === 'banco-mundial')), vigia: { tipo: 'banco-mundial', fontes: ['2', '3'] } }
  ]
};
await caso('vigilância: 1ª leitura, depois sem mudança, depois edição nova; novidade fica pendente até nova conferência', async () => {
  const pasta = temp();
  let ano = 2025; let ultimoPdf = '202610'; let bm = '2026-07-01';
  const deps = () => ({
    catalogo: mini, pasta, log: () => {},
    texto: async () => pagina(ano),
    sondar: async (url) => ({ ok: url.includes(ultimoPdf) || (ultimoPdf >= '202611' && url.includes('202610')) }),
    json: async (url) => [{ page: 1 }, [{ id: url.includes('/2?') ? '2' : '3', lastupdated: bm }]]
  });
  const r1 = await vigiarFontes({ ...deps(), hoje: HOJE });
  assert.equal(r1.ok, true); assert.deepEqual(r1.novidades, []); assert.equal(r1.lidas, 3);
  const v1 = JSON.parse(readFileSync(path.join(pasta, 'vigilancia.json'), 'utf8'));
  assert.ok(Object.values(v1.fontes).every((x) => x.status === 'primeira-leitura'));
  assert.equal(v1.fontes.dieese.marcador.ultimoMes, '202610'); assert.equal(v1.fontes['banco-mundial'].marcador.atualizadoEm, '2026-07-01');
  assert.match(v1.regra, /só avisa/);

  const r2 = await vigiarFontes({ ...deps(), hoje: dia(1) });
  assert.deepEqual(r2.novidades, []);
  assert.ok(Object.values(JSON.parse(readFileSync(path.join(pasta, 'vigilancia.json'), 'utf8')).fontes).every((x) => x.status === 'sem-mudanca'));

  ano = 2026; ultimoPdf = '202611'; bm = '2026-11-10';
  const r3 = await vigiarFontes({ ...deps(), hoje: dia(2) });
  assert.deepEqual(r3.novidades.sort(), ['banco-mundial', 'clp', 'dieese']);
  const v3 = JSON.parse(readFileSync(path.join(pasta, 'vigilancia.json'), 'utf8'));
  assert.deepEqual(v3.fontes.clp.novidade, { em: '2026-11-28', de: '2025', para: '2026' });
  assert.equal(v3.fontes.clp.pendente, true); // verificadoEm do clp é 2026-11-01, anterior à novidade
  assert.equal(v3.fontes.dieese.novidade.para, '202611');
  assert.equal(pendenteDeConferencia(v3.fontes.clp, { verificadoEm: '2026-11-30' }), false); // depois de conferir, deixa de estar pendente

  const r4 = await vigiarFontes({ ...deps(), hoje: dia(3) }); // sem novidade nova, mas a anterior continua registrada
  assert.deepEqual(r4.novidades, []);
  assert.equal(JSON.parse(readFileSync(path.join(pasta, 'vigilancia.json'), 'utf8')).fontes.clp.novidade.para, '2026');
});
await caso('vigilância: falha mantém a última leitura boa e conta as falhas seguidas', async () => {
  const pasta = temp();
  const base = { catalogo: mini, pasta, log: () => {}, sondar: async () => ({ ok: true }), json: async () => [{}, [{ lastupdated: '2026-07-01' }]] };
  await vigiarFontes({ ...base, texto: async () => pagina(2025), hoje: HOJE });
  const r = await vigiarFontes({ ...base, texto: async () => { throw new Error('HTTP 503'); }, hoje: dia(1) });
  assert.equal(r.falhas, 1); assert.equal(r.lidas, 2);
  let v = JSON.parse(readFileSync(path.join(pasta, 'vigilancia.json'), 'utf8')).fontes.clp;
  assert.equal(v.status, 'falhou'); assert.match(v.motivo, /503/); assert.equal(v.falhasSeguidas, 1);
  assert.ok(v.marcador.hash && v.ultimoSucesso, 'guarda a leitura anterior');
  await vigiarFontes({ ...base, texto: async () => { throw new Error('HTTP 503'); }, hoje: dia(2) });
  v = JSON.parse(readFileSync(path.join(pasta, 'vigilancia.json'), 'utf8')).fontes.clp;
  assert.equal(v.falhasSeguidas, 2);
  await vigiarFontes({ ...base, texto: async () => pagina(2025), hoje: dia(3) });
  v = JSON.parse(readFileSync(path.join(pasta, 'vigilancia.json'), 'utf8')).fontes.clp;
  assert.equal(v.status, 'sem-mudanca'); assert.equal(v.falhasSeguidas, 0);
});
await caso('vigilância: página vazia, PDF que não existe e resposta sem data do Banco Mundial viram "falhou", nunca "novidade"', async () => {
  const pasta = temp();
  const r = await vigiarFontes({
    catalogo: mini, pasta, log: () => {}, hoje: HOJE,
    texto: async () => '<html><body><div id="root"></div></body></html>',
    sondar: async () => ({ ok: false, status: 404 }),
    json: async () => [{ page: 1 }, []]
  });
  assert.equal(r.ok, false); assert.equal(r.falhas, 3); assert.deepEqual(r.novidades, []);
  const v = JSON.parse(readFileSync(path.join(pasta, 'vigilancia.json'), 'utf8')).fontes;
  assert.match(v.clp.motivo, /JavaScript/); assert.match(v.dieese.motivo, /Nenhum arquivo/); assert.match(v['banco-mundial'].motivo, /data de atualização/);
});
await caso('vigilância: sem função de sondagem, a fonte mensal falha com motivo claro e as outras seguem', async () => {
  const pasta = temp();
  const r = await vigiarFontes({ catalogo: mini, pasta, log: () => {}, hoje: HOJE, texto: async () => pagina(2025), json: async () => [{}, [{ lastupdated: '2026-07-01' }]] });
  assert.equal(r.lidas, 2); assert.equal(r.falhas, 1);
  assert.match(JSON.parse(readFileSync(path.join(pasta, 'vigilancia.json'), 'utf8')).fontes.dieese.motivo, /sondar/);
});
await caso('vigilância: catálogo inválido não roda e não grava nada', async () => {
  const pasta = temp();
  const ruim = copia(mini); ruim.fontes[0].url = 'http://x';
  const r = await vigiarFontes({ catalogo: ruim, pasta, log: () => {}, hoje: HOJE, texto: async () => pagina(2025) });
  assert.equal(r.ok, false); assert.match(r.motivo, /inválido/);
  assert.throws(() => readFileSync(path.join(pasta, 'vigilancia.json')));
});

/* ===================== arquivo público ===================== */
await caso('independentes.json: catálogo sem detalhes da vigilância, com os valores conferidos e aviso de leitura', () => {
  const pasta = temp();
  const logs = [];
  const r = atualizarIndependentes({ catalogo, curados, pasta, hoje: HOJE, log: (m) => logs.push(m) });
  assert.deepEqual(r, { ok: true, fontes: 13, indicadores: 3, descartados: 0 });
  const pub = JSON.parse(readFileSync(path.join(pasta, 'independentes.json'), 'utf8'));
  assert.ok(pub.fontes.every((f) => !('vigia' in f) && typeof f.vigiada === 'boolean'));
  assert.equal(pub.regras.length, 6);
  const dieese = pub.indicadores.find((i) => i.id === 'dieese-salario-minimo-necessario');
  assert.equal(dieese.pontos.at(-1).valor, 7750.01); assert.equal(dieese.pontos.at(-1).vezesOPiso, 4.78);
  assert.match(dieese.aviso, /Não é dado oficial/);
  const fbsp = pub.indicadores.find((i) => i.id === 'fbsp-mvi-brasil');
  assert.match(fbsp.aviso, /confira no Anuário/);
  // a fonte do Placar para cada cargo nunca promete o que não faz: só fontes "em uso" têm valor publicado
  assert.ok(pub.indicadores.every((i) => pub.fontes.find((f) => f.id === i.fonte.id).status === 'em-uso'));
});
await caso('independentes.json: catálogo inválido derruba a montagem (nada é publicado pela metade)', () => {
  const c = copia(catalogo); c.fontes[0].status = 'ativa';
  assert.throws(() => montarIndependentes({ catalogo: c, curados, hoje: HOJE }), /Catálogo de fontes inválido/);
});
await caso('o catálogo diz, para cada cargo, que nada é atribuído fora da competência', () => {
  for (const f of catalogo.fontes) for (const c of ['presidente', 'senadores', 'federais', 'governadores']) assert.ok(f.usoNoPlacar[c].length > 5, `${f.id}/${c}`);
  const clp = catalogo.fontes.find((f) => f.id === 'clp');
  assert.match(clp.usoNoPlacar.federais, /não atribuído ao parlamentar/);
  assert.equal(clp.status, 'catalogada');
});

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes das fontes independentes passaram.');
process.exit(falhas ? 1 : 0);
