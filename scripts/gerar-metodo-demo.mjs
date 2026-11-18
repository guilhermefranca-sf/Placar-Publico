// Copia as regras de nota (scripts/nota.mjs) para site/metodo-demo.js,
// usado pelo modo demonstração do site. Rode de novo se mudar algum peso.
//   node scripts/gerar-metodo-demo.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { METODO } from './nota.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
writeFileSync(path.join(raiz, 'site', 'metodo-demo.js'),
  `'use strict';\n// Gerado por scripts/gerar-metodo-demo.mjs. Não edite à mão.\nconst METODO_DEMO = ${JSON.stringify(METODO, null, 2)};\n`);
console.log('site/metodo-demo.js atualizado.');
