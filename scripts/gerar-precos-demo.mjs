// Gera site/precos-demo.js: a aba "Preços no Brasil" com números FICTÍCIOS, só para o modo demonstração.
// Usa a mesma função que a rotina real (montarPrecos), então o formato é idêntico ao de site/dados/precos.json.
//   node scripts/gerar-precos-demo.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { montarPrecos, mesesDaCesta } from './precos.mjs';
import { CAPITAIS } from './cesta-pdf.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hoje = new Date('2026-11-24T12:00:00Z');
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const ymLista = (de, ate) => { const l = []; for (let a = +de.slice(0, 4), m = +de.slice(5); `${a}-${String(m).padStart(2, '0')}` <= ate; m++) { if (m > 12) { m = 1; a++; } l.push(`${a}-${String(m).padStart(2, '0')}`); } return l; };
const arred = (v, c) => Math.round(v * 10 ** c) / 10 ** c;

// Gasolina: tendência suave com ondas (inventada).
const idxMes = (ym) => ymLista('2013-01', ym).length - 1;
const gasMes = (ym) => { const i = idxMes(ym); return arred(3.1 + 0.021 * i + 0.35 * Math.sin(i / 7) + 0.2 * Math.sin(i / 2.3), 3); };
const mensal = ymLista('2013-01', '2026-10').map((ym) => [ym, gasMes(ym)]);
const semanal = [];
for (let t = Date.UTC(2016, 0, 3); t <= Date.UTC(2026, 10, 8); t += 7 * 86400000) {
  const ini = iso(t), fim = iso(t + 6 * 86400000);
  semanal.push([ini, fim, arred(gasMes(ini.slice(0, 7)) + 0.04 * Math.sin(t / 8e8), 3)]);
}
const FATOR_UF = { SP: 0.97, RJ: 1.04, MG: 1.02, BA: 1.05, AM: 1.14, RS: 1.0, DF: 1.03, PR: 0.99, PE: 1.06, CE: 1.05, GO: 1.0, AC: 1.2, SC: 0.98, PA: 1.07 };
const estados = Object.fromEntries(Object.entries(FATOR_UF).map(([uf, f]) => [uf, mensal.filter((x) => x[0] >= '2016-01').map(([ym, v]) => [ym, arred(v * f, 3)])]));

// Dólar: um valor por dia útil.
const dolar = [];
for (let t = Date.UTC(2016, 0, 1), k = 0; t <= Date.UTC(2026, 10, 24); t += 86400000) {
  const d = new Date(t);
  if (!(d.getUTCDay() % 6)) continue;
  k++;
  dolar.push([iso(t), arred(4.1 + 0.9 * Math.sin(k / 420) + 0.5 * Math.sin(k / 95) + 0.0004 * k, 4)]);
}

// Cesta: 17 capitais até jun/2025 e 27 depois, com um mês sem leitura.
const BASE = Object.fromEntries(CAPITAIS.map((c, i) => [c, 380 + (i * 37) % 160]));
const meses = {};
for (const ym of mesesDaCesta(hoje)) {
  if (ym === '201708') { meses[ym] = { semTexto: true, lidoEm: hoje.toISOString() }; continue; }
  const i = (+ym.slice(0, 4) - 2016) * 12 + +ym.slice(4) - 4;
  const lista = ym >= '202507' ? CAPITAIS : CAPITAIS.filter((_, k) => k % 5 !== 0 || ym < '201709');
  const capitais = {};
  for (const [k, nome] of lista.entries()) {
    const v = arred(BASE[nome] * (1 + 0.0055 * i) * (1 + 0.04 * Math.sin(i / 6 + k)), 2);
    capitais[nome] = { valor: v, pctSM: arred(v / 16.2, 2), horas: arred(v / 7.4, 2) };
  }
  meses[ym] = { pub: `${ym.slice(0, 4)}-${ym.slice(4)}-08`, capitais, lidoEm: hoje.toISOString() };
}

const doc = montarPrecos({ brutos: { gasolina: { semanal, mensal, estados }, dolar, cesta: { meses } }, hoje });
doc.demonstracao = true;
writeFileSync(path.join(raiz, 'site', 'precos-demo.js'),
  `'use strict';\n// Gerado por scripts/gerar-precos-demo.mjs. NÚMEROS FICTÍCIOS, só para o modo demonstração. Não edite à mão.\nconst PRECOS_DEMO = ${JSON.stringify(doc)};\n`);
console.log('site/precos-demo.js atualizado (dados fictícios).');
