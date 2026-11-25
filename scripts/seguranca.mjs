// Segurança pública por estado: homicídio doloso e roubo de veículos, do Sinesp (Ministério da Justiça e Segurança Pública).
//
// Os dados vêm dos boletins de ocorrência das Polícias Civis estaduais e do Distrito Federal, enviados ao Sinesp.
// O Placar procura, no portal de dados abertos do Ministério (CKAN), as planilhas .xlsx por Unidade da Federação,
// lê todas as abas e soma por estado, ano e mês. Só entram no índice os anos com os 12 meses informados.
//
// Atenção: o desenho exato da planilha não pôde ser conferido na hora de escrever este arquivo. O leitor procura as
// colunas pelo nome (UF, tipo do crime/evento, ano, mês, vítimas, ocorrências) e aceita a UF vir numa coluna ou no nome
// da aba. Se não reconhecer o formato, a coleta falha com uma mensagem clara, o dado anterior é mantido e a área de
// segurança fica "sem dado" no índice. Nunca preenche com zero.

import path from 'node:path';
import { gravarJson, lerJsonSeExistir, normalizar } from './util.mjs';
import { UFS } from './tse.mjs';
import { lerPlanilhas } from './precos.mjs';

export const CKAN = 'https://dados.mj.gov.br/api/3/action';
export const PAGINA_DADOS = 'https://dados.mj.gov.br/dataset/sistema-nacional-de-estatisticas-de-seguranca-publica';
export const FONTE_SEGURANCA = 'Ministério da Justiça e Segurança Pública — Sinesp, Dados Nacionais de Segurança Pública (UF)';
const MIN_UFS = 20;       // menos estados que isso = formato não reconhecido ou arquivo incompleto
const MAX_ARQUIVOS = 3;

const NOME_UF = {
  ACRE: 'AC', ALAGOAS: 'AL', AMAPA: 'AP', AMAZONAS: 'AM', BAHIA: 'BA', CEARA: 'CE', 'DISTRITO FEDERAL': 'DF', 'ESPIRITO SANTO': 'ES', GOIAS: 'GO',
  MARANHAO: 'MA', 'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS', 'MINAS GERAIS': 'MG', PARA: 'PA', PARAIBA: 'PB', PARANA: 'PR', PERNAMBUCO: 'PE',
  PIAUI: 'PI', 'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS', RONDONIA: 'RO', RORAIMA: 'RR', 'SANTA CATARINA': 'SC',
  'SAO PAULO': 'SP', SERGIPE: 'SE', TOCANTINS: 'TO'
};
const MESES = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

/** "São Paulo", "SP" ou "Sao Paulo " -> "SP". Qualquer outra coisa -> null. */
export function ufDe(texto) {
  const t = normalizar(texto);
  if (UFS.includes(t)) return t;
  return NOME_UF[t] || null;
}

/** "Janeiro", "jan", 1, "01" ou "2023-01-01" -> 1..12. */
export function mesDe(valor) {
  const t = normalizar(valor);
  if (/^\d{1,2}$/.test(t)) { const n = Number(t); return n >= 1 && n <= 12 ? n : null; }
  const iso = /^(\d{4}) (\d{2}) \d{2}$/.exec(t);
  if (iso) return Number(iso[2]);
  const k = MESES.findIndex((m) => m === t || (t.length >= 3 && m.startsWith(t)));
  return k >= 0 ? k + 1 : null;
}

/** Quais indicadores o Placar usa, e como reconhecê-los pelo nome do evento. */
export const INDICADORES_SEG = [
  { k: 'homicidio', nome: 'Homicídio doloso', unidade: 'vítimas', reconhece: (t) => /HOMICIDIO DOLOSO/.test(t) && !/TENTATIV|FEMINICIDIO/.test(t), preferir: 'vitimas' },
  { k: 'rouboVeiculo', nome: 'Roubo de veículos', unidade: 'ocorrências', reconhece: (t) => /ROUBO (DE|A) VEICULO/.test(t), preferir: 'ocorrencias' }
];

const numero = (v) => {
  if (v == null) return null;
  const t = String(v).trim().replace(/\s/g, '');
  if (!/^-?\d+([.,]\d+)?$/.test(t)) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Lê as abas de uma planilha e soma por estado, indicador, ano e mês.
 * Devolve { dados: { UF: { indicador: { ano: { mes: valor } } } }, abasLidas, linhasUsadas, motivo }.
 */
export function lerSegurancaDasAbas(abas) {
  const dados = {};
  let abasLidas = 0, linhasUsadas = 0;
  const motivos = [];
  for (const aba of abas) {
    // linha de títulos: a primeira das 40 primeiras que tem ano, mês e algum tipo de evento
    let cab = null;
    for (const l of aba.linhas.slice(0, 40)) {
      const nomes = Object.fromEntries(Object.entries(l.c).map(([col, v]) => [col, normalizar(v)]));
      const acha = (re) => Object.keys(nomes).find((col) => re.test(nomes[col]));
      const ano = acha(/^ANO$/), mes = acha(/^(MES|MES REFERENCIA)$/), evento = acha(/^(TIPO CRIME|TIPO DE CRIME|EVENTO|INDICADOR|NATUREZA|TIPO)$/);
      if (ano && mes && evento) {
        cab = {
          n: l.n, ano, mes, evento,
          uf: acha(/^(UF|SIGLA UF|UNIDADE DA FEDERACAO|ESTADO)$/),
          vitimas: acha(/^(TOTAL VITIMA|TOTAL DE VITIMAS|VITIMAS|NUMERO DE VITIMAS)$/),
          ocorrencias: acha(/^(OCORRENCIAS|TOTAL OCORRENCIAS|TOTAL DE OCORRENCIAS|NUMERO DE OCORRENCIAS|TOTAL)$/)
        };
        break;
      }
    }
    if (!cab) { motivos.push(`aba "${aba.nome}": sem colunas de ano, mês e tipo de crime`); continue; }
    if (!cab.vitimas && !cab.ocorrencias) { motivos.push(`aba "${aba.nome}": sem coluna de vítimas ou ocorrências`); continue; }
    const ufDaAba = ufDe(aba.nome);
    let usou = false;
    for (const l of aba.linhas) {
      if (l.n <= cab.n) continue;
      const uf = cab.uf ? ufDe(l.c[cab.uf]) : ufDaAba;
      if (!uf) continue;
      const ev = normalizar(l.c[cab.evento]);
      const ind = INDICADORES_SEG.find((i) => i.reconhece(ev));
      if (!ind) continue;
      const ano = Number(String(l.c[cab.ano]).trim());
      const mes = mesDe(l.c[cab.mes]);
      if (!Number.isInteger(ano) || ano < 2000 || ano > 2100 || !mes) continue;
      const v = numero(l.c[cab[ind.preferir]]) ?? numero(l.c[cab.vitimas]) ?? numero(l.c[cab.ocorrencias]);
      if (v == null) continue;
      const mapa = ((dados[uf] ||= {})[ind.k] ||= {});
      const porMes = (mapa[ano] ||= {});
      porMes[mes] = (porMes[mes] || 0) + v; // linhas do mesmo mês (por sexo, por faixa etária...) somam
      linhasUsadas++; usou = true;
    }
    if (usou) abasLidas++;
  }
  return { dados, abasLidas, linhasUsadas, motivo: motivos.slice(0, 3).join('; ') };
}

/** Transforma { mes: valor } em { meses, total }. */
const somar = (porMes) => ({ meses: Object.keys(porMes).length, total: Math.round(Object.values(porMes).reduce((a, b) => a + b, 0)) });

/** Junta o resultado de vários arquivos: para o mesmo estado, indicador e ano, fica o que tem mais meses (empate: o mais novo). */
export function juntarSeguranca(lotes) {
  const uf = {};
  for (const dados of lotes) { // do mais antigo ao mais novo
    for (const [u, inds] of Object.entries(dados)) {
      for (const [k, anos] of Object.entries(inds)) {
        for (const [ano, porMes] of Object.entries(anos)) {
          const s = somar(porMes);
          const atual = (((uf[u] ||= {})[k] ||= {})[ano]);
          if (!atual || s.meses >= atual.meses) uf[u][k][ano] = s;
        }
      }
    }
  }
  return uf;
}

const ehXlsx = (r) => /xlsx/i.test(r.format || '') || /\.xlsx(\?|$)/i.test(r.url || '');

/** Procura no CKAN do Ministério as planilhas por UF e devolve as mais recentes primeiro. */
export async function descobrirArquivos(json) {
  const r = await json(`${CKAN}/package_search?q=sinesp&rows=30`);
  const pacotes = r?.result?.results || [];
  if (!pacotes.length) throw new Error('O portal de dados do Ministério da Justiça não devolveu nenhum conjunto de dados sobre o Sinesp');
  const achados = [];
  for (const p of pacotes) {
    for (const rec of p.resources || []) {
      if (!ehXlsx(rec) || !rec.url) continue;
      const texto = normalizar(`${rec.name || ''} ${rec.description || ''} ${rec.url}`);
      if (/MUNICIPIO|MUNIC/.test(texto)) continue;
      if (!/(^| )UF( |$)|UNIDADE DA FEDERACAO|UNIDADES DA FEDERACAO|DADOS NACIONAIS|SEGURANCA PUBLICA UF/.test(texto)) continue;
      achados.push({ url: rec.url, nome: rec.name || '', atualizadoEm: rec.last_modified || rec.metadata_modified || p.metadata_modified || null });
    }
  }
  achados.sort((a, b) => String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)));
  const vistos = new Set();
  return achados.filter((a) => (vistos.has(a.url) ? false : vistos.add(a.url))).slice(0, MAX_ARQUIVOS);
}

/**
 * Rotina semanal. Escreve anos/seguranca.json:
 *   { versao, geradoEm, arquivos: [{ url, nome, atualizadoEm }], uf: { SP: { homicidio: { 2023: { meses, total } }, rouboVeiculo: {...} } } }
 * Se falhar, devolve ok:false e NÃO mexe no arquivo anterior.
 */
export async function atualizarSeguranca({ json, binario, pasta, hoje, log = () => {} }) {
  const arquivos = await descobrirArquivos(json);
  if (!arquivos.length) return { ok: false, motivo: 'Não encontrei, no portal do Ministério da Justiça, a planilha de indicadores por UF do Sinesp.' };
  const lotes = [];
  const usados = [];
  const avisos = [];
  for (const a of [...arquivos].reverse()) { // do mais antigo ao mais novo, para o mais novo vencer o empate
    try {
      const buf = await binario(a.url);
      const r = lerSegurancaDasAbas(lerPlanilhas(buf));
      if (!r.linhasUsadas) { avisos.push(`${a.nome || a.url}: ${r.motivo || 'nenhuma linha reconhecida'}`); continue; }
      lotes.push(r.dados);
      usados.push(a);
      log(`Segurança: ${a.nome || a.url} (${r.abasLidas} abas, ${r.linhasUsadas} linhas).`);
    } catch (e) { avisos.push(`${a.nome || a.url}: ${String(e.message).slice(0, 100)}`); }
  }
  if (!lotes.length) return { ok: false, motivo: `Nenhuma planilha do Sinesp foi reconhecida. ${avisos.slice(0, 2).join(' | ')}`.trim() };
  const uf = juntarSeguranca(lotes);
  const comHomicidio = Object.keys(uf).filter((u) => uf[u].homicidio && Object.keys(uf[u].homicidio).length).length;
  if (comHomicidio < MIN_UFS) return { ok: false, motivo: `Só ${comHomicidio} estados com homicídio doloso na planilha (esperado pelo menos ${MIN_UFS}); parece formato diferente ou arquivo incompleto.` };
  gravarJson(path.join(pasta, 'anos', 'seguranca.json'), { versao: 1, geradoEm: hoje.toISOString(), fonte: FONTE_SEGURANCA, pagina: PAGINA_DADOS, arquivos: usados.reverse(), uf });
  const anos = [...new Set(Object.values(uf).flatMap((i) => Object.values(i).flatMap((a) => Object.keys(a))))].sort();
  return { ok: true, ufs: comHomicidio, anos, arquivos: usados.length, avisos: avisos.length };
}

/** Lê o arquivo guardado (ou null). */
export const lerSegurancaGuardada = (pasta) => lerJsonSeExistir(path.join(pasta, 'anos', 'seguranca.json'));

/** Taxa por 100 mil habitantes de um indicador, só nos anos com os 12 meses informados dentro de [de, ate]. */
export function taxaPor100mil(serie, populacao, de, ate) {
  if (!serie || !Number.isFinite(populacao) || populacao <= 0) return null;
  const anos = Object.keys(serie).map(Number).filter((a) => a >= de && a <= ate && serie[a].meses === 12).sort();
  if (!anos.length) return null;
  const taxas = anos.map((a) => (serie[a].total / populacao) * 100000);
  return { valor: Math.round((taxas.reduce((x, y) => x + y, 0) / taxas.length) * 10) / 10, anos };
}
