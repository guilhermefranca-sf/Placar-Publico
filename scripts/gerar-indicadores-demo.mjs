// Copia o catálogo de indicadores (scripts/indicadores.mjs) para site/indicadores-demo.js,
// usado pelo modo demonstração do site. Rode de novo se mudar o catálogo.
//   node scripts/gerar-indicadores-demo.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogoPublico } from './indicadores.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
writeFileSync(path.join(raiz, 'site', 'indicadores-demo.js'),
  `'use strict';\n// Gerado por scripts/gerar-indicadores-demo.mjs. Não edite à mão.\nconst INDICADORES_DEMO = ${JSON.stringify(catalogoPublico())};\n`);
console.log('site/indicadores-demo.js atualizado.');
