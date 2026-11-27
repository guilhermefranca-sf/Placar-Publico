// Gera site/fontes-demo.js: dados INVENTADOS das fontes independentes para o modo demonstração.
//   - o catálogo de fontes é o verdadeiro (nomes, endereços e metodologias são fatos públicos);
//   - os valores e a vigilância são inventados e marcados como tais; nenhum número real da v8 é copiado.
// Uso:  node scripts/gerar-fontes-demo.mjs
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerCatalogo, vigiarFontes, atualizarIndependentes } from './fontes-externas.mjs';
import { lerJsonSeExistir } from './util.mjs';

const hoje = new Date();
const dia = (n) => new Date(hoje.getTime() + n * 86400000);
const isoDia = (d) => d.toISOString().slice(0, 10);
const pasta = mkdtempSync(path.join(os.tmpdir(), 'placar-fontes-demo-'));

// Catálogo = o verdadeiro + uma fonte inventada, só para os valores de exemplo não serem atribuídos a nenhuma organização real.
const catalogo = JSON.parse(JSON.stringify(lerCatalogo()));
const molde = JSON.parse(JSON.stringify(catalogo.fontes.find((f) => f.id === 'dieese')));
Object.assign(molde, {
  id: 'instituto-exemplo', nome: 'Instituto Exemplo (inventado)', organizacao: 'Instituto Exemplo (inventado para a demonstração)', url: 'https://exemplo.invalid/',
  metodologia: 'https://exemplo.invalid/metodologia', fatos: molde.fatos.map((f) => ({ ...f, url: 'https://exemplo.invalid/fato', texto: 'Fonte inventada: existe só para mostrar como os cartões aparecem.' })),
  verificadoEm: isoDia(dia(-1)), vigia: { tipo: 'pagina', url: 'https://exemplo.invalid/' }
});
catalogo.fontes.unshift(molde);

const curados = {
  versao: 1, aviso: 'Valores inventados do modo demonstração.',
  indicadores: [
    { id: 'exemplo-seguranca', fonteId: 'instituto-exemplo', cargo: 'presidente', secao: 'seguranca', nome: 'Mortes violentas (exemplo inventado)', unidade: 'por 100 mil habitantes', melhor: 'menor', casas: 1,
      pontos: [{ rotulo: '2022', valor: 24.3 }, { rotulo: '2023', valor: 22.8 }, { rotulo: '2024', valor: 21.0 }],
      destaque: 'Valor inventado: a taxa do exemplo caiu nos três anos mostrados.', edicao: 'Anuário de exemplo 2025 (inventado)', leitura: 'publicação original (inventada)',
      urls: ['https://exemplo.invalid/anuario'], aviso: 'Número inventado do modo demonstração. Na versão real, cada valor traz a edição, o endereço onde foi lido e a data de conferência.', conferidoEm: isoDia(dia(-1)) },
    { id: 'exemplo-economia', fonteId: 'instituto-exemplo', cargo: 'presidente', secao: 'economia', nome: 'Custo da cesta de exemplo (inventado)', unidade: 'R$ por mês', melhor: 'neutro', casas: 2,
      pontos: [{ rotulo: 'out/2025', valor: 710.5 }, { rotulo: 'out/2026', valor: 745.9 }],
      destaque: 'Valor inventado, só para mostrar o formato do cartão.', edicao: 'Pesquisa de exemplo, outubro de 2026 (inventada)', leitura: 'publicação original (inventada)',
      urls: ['https://exemplo.invalid/cesta'], aviso: 'Número inventado do modo demonstração.', conferidoEm: isoDia(dia(-1)) },
    { id: 'exemplo-visao', fonteId: 'instituto-exemplo', cargo: 'presidente', secao: 'visao', nome: 'Índice de progresso social de exemplo (inventado)', unidade: 'pontos de 0 a 100', melhor: 'maior', casas: 2,
      pontos: [{ rotulo: '2023', valor: 61.2 }, { rotulo: '2024', valor: 61.9 }, { rotulo: '2025', valor: 62.4 }],
      destaque: 'Valor inventado.', edicao: 'Edição de exemplo 2025 (inventada)', leitura: 'publicação original (inventada)',
      urls: ['https://exemplo.invalid/ips'], aviso: 'Número inventado do modo demonstração.', conferidoEm: isoDia(dia(-1)) }
  ]
};

// Duas rodadas de vigilância com páginas de mentira: a 1ª só registra; a 2ª mostra uma página que mudou e uma edição nova.
const textoBase = (ano, extra = '') => `<html><body><h1>Edição ${ano}</h1><p>${'Texto de apresentação da edição, com metodologia e resultados. '.repeat(8)}${extra}</p></body></html>`;
const ids = catalogo.fontes.filter((f) => f.vigia?.tipo === 'pagina').map((f) => f.id);
const alvoMudou = ids[1], alvoNova = ids[2];
const urlDe = (id) => catalogo.fontes.find((f) => f.id === id).vigia.url;
const rodada = (n) => ({
  texto: async (url) => (url === urlDe(alvoNova) && n === 2 ? textoBase(2027, 'Nova edição publicada.') : url === urlDe(alvoMudou) && n === 2 ? textoBase(2026, 'Texto atualizado na página.') : textoBase(2026)),
  sondar: async () => ({ ok: true, status: 200 }),
  json: async () => [{ page: 1 }, [{ lastupdated: isoDia(dia(-30)) }]]
});
for (const n of [1, 2]) await vigiarFontes({ catalogo, pasta, ...rodada(n), hoje: dia(n === 1 ? -2 : -1), pausaMs: 0 });
atualizarIndependentes({ catalogo, curados, pasta, hoje });

const indep = lerJsonSeExistir(path.join(pasta, 'independentes.json'));
const vigia = lerJsonSeExistir(path.join(pasta, 'vigilancia.json'));
indep.demo = true; vigia.demo = true;
const corpo = `'use strict';
// Gerado por scripts/gerar-fontes-demo.mjs. Não edite à mão.
// Modo demonstração: o catálogo de fontes é o verdadeiro; os valores e a vigilância são INVENTADOS.
const INDEPENDENTES_DEMO = ${JSON.stringify(indep, null, 1)};
const VIGILANCIA_DEMO = ${JSON.stringify(vigia, null, 1)};
`;
const destino = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site', 'fontes-demo.js');
writeFileSync(destino, corpo);
console.log(`fontes-demo.js gravado: ${indep.fontes.length} fontes, ${indep.indicadores.length} valores inventados, ${Object.keys(vigia.fontes).length} fontes vigiadas.`);
