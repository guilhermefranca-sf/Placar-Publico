// Junta o site inteiro em UM arquivo (placar-publico-demonstracao.html), com dados inventados.
// Serve para mostrar o aplicativo a alguém dando dois cliques, sem publicar nada.
//   node scripts/empacotar.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = (n) => readFileSync(path.join(raiz, 'site', n), 'utf-8');

let html = site('index.html');
html = html.replace('<link rel="stylesheet" href="estilo.css">', () => `<style>\n${site('estilo.css')}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, arq) => {
  const js = site(arq);
  if (/<\/script/i.test(js)) throw new Error(`${arq} contém </script>`);
  return `<script>\n${js}\n</script>`;
});
html = html.replace('<title>Placar Público</title>', '<title>Placar Público (demonstração)</title>');
const saida = path.join(raiz, 'placar-publico-demonstracao.html');
writeFileSync(saida, html);
console.log('Gerado:', saida, `(${Math.round(html.length / 1024)} KB)`);
