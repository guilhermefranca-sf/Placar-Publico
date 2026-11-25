// Leitor mínimo de PDF, feito só para a tabela mensal da Cesta Básica (DIEESE/Conab).
// O DIEESE publica a tabela apenas em PDF. Este arquivo lê o TEXTO do PDF (não faz leitura de imagem) e
// devolve, por capital: valor da cesta, % do salário mínimo líquido e horas de trabalho.
// Não tem dependências: quem chama informa como descomprimir (no Node, zlib; no navegador, DecompressionStream).
// Se o PDF vier em formato que não dá para ler com segurança, a função devolve menos capitais (ou nenhuma),
// e o resto do sistema mostra "Dado não encontrado ou não confirmado". Nunca se completa nada por estimativa.

const latin1 = (u8) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(u8.length, i + 8192)));
  return s;
};

export const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Converte o conteúdo de um texto entre parênteses do PDF (com \n, \(, \123 etc.) em texto comum. */
export function textoLiteral(s) {
  let o = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\') { o += c; continue; }
    const n = s[i + 1];
    if (/[0-7]/.test(n)) {
      let j = i + 1, oct = '';
      while (j < s.length && oct.length < 3 && /[0-7]/.test(s[j])) { oct += s[j]; j++; }
      o += String.fromCharCode(parseInt(oct, 8));
      i = j - 1;
    } else {
      o += n === 'n' ? '\n' : n === undefined ? '' : n;
      i++;
    }
  }
  return o;
}

/** Lê a tabela "ToUnicode" (bfchar/bfrange) de uma fonte: código do glifo -> caractere. */
export function lerCMap(txt) {
  const mapa = new Map();
  const letras = (hex) => (hex.match(/.{4}/g) || []).map((h) => String.fromCharCode(parseInt(h, 16))).join('');
  let m;
  const reChar = /beginbfchar([\s\S]*?)endbfchar/g;
  while ((m = reChar.exec(txt))) {
    for (const q of m[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      mapa.set(parseInt(q[1], 16), letras(q[2].padStart(4, '0')));
    }
  }
  const reRange = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = reRange.exec(txt))) {
    for (const q of m[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])/g)) {
      const a = parseInt(q[1], 16), b = parseInt(q[2], 16);
      if (q[3][0] === '<') {
        const base = parseInt(q[3].slice(1, -1), 16);
        for (let c = a; c <= b && c - a < 65536; c++) mapa.set(c, String.fromCharCode(base + (c - a)));
      } else {
        const lista = [...q[3].matchAll(/<([0-9A-Fa-f]+)>/g)].map((x) => letras(x[1].padStart(4, '0')));
        for (let c = a; c <= b && c - a < lista.length; c++) mapa.set(c, lista[c - a]);
      }
    }
  }
  return mapa;
}

const TOKENS = new RegExp([
  String.raw`\[(?:[^\]\\]|\\.)*\]\s*TJ`,
  String.raw`\((?:[^()\\]|\\.)*\)\s*(?:Tj|')`,
  String.raw`<[0-9A-Fa-f\s]*>\s*(?:Tj|')`,
  String.raw`\/[^\s\/\[\]()<>]+\s+-?[\d.]+\s+Tf`,
  String.raw`(?:-?[\d.]+\s+){6}Tm`,
  String.raw`(?:-?[\d.]+\s+){2}T[dD]`,
  String.raw`-?[\d.]+\s+TL`,
  String.raw`T\*`,
  String.raw`\bBT\b`
].join('|'), 'g');

/** Percorre o conteúdo de uma página e devolve os pedaços de texto com a posição (x, y). */
export function extrairItens(conteudo, fontesDaPagina = {}) {
  const itens = [];
  let x = 0, y = 0, tl = 0, fonte = null;
  const decodificarHex = (hex) => {
    const f = fontesDaPagina[fonte];
    hex = hex.replace(/\s+/g, '');
    let s = '';
    const passo = f && f.doisBytes ? 4 : 2;
    for (let i = 0; i + passo <= hex.length; i += passo) {
      const cod = parseInt(hex.slice(i, i + passo), 16);
      if (f && f.mapa) s += f.mapa.get(cod) ?? '';
      else if (!f || !f.doisBytes) s += String.fromCharCode(cod);
    }
    return s;
  };
  const decodificarLiteral = (lit) => {
    const f = fontesDaPagina[fonte];
    const s = textoLiteral(lit);
    if (!f || !f.mapa || f.doisBytes) return s;
    return [...s].map((c) => f.mapa.get(c.charCodeAt(0)) ?? c).join('');
  };
  for (const t of conteudo.match(TOKENS) || []) {
    if (t === 'BT') { x = 0; y = 0; }
    else if (t === 'T*') y -= tl;
    else if (/Tf$/.test(t)) fonte = t.trim().split(/\s+/)[0].slice(1);
    else if (/TL$/.test(t)) tl = Number(t.trim().split(/\s+/)[0]);
    else if (/Tm$/.test(t)) { const a = t.trim().split(/\s+/); x = Number(a[4]); y = Number(a[5]); }
    else if (/T[dD]$/.test(t)) {
      const a = t.trim().split(/\s+/);
      x += Number(a[0]); y += Number(a[1]);
      if (/TD$/.test(t)) tl = -Number(a[1]);
    } else if (/TJ$/.test(t)) {
      const dentro = t.replace(/\]\s*TJ$/, '').slice(1);
      let s = '';
      for (const q of dentro.matchAll(/\(((?:[^()\\]|\\.)*)\)|<([0-9A-Fa-f\s]*)>/g)) {
        s += q[1] !== undefined ? decodificarLiteral(q[1]) : decodificarHex(q[2]);
      }
      itens.push({ x, y, s });
    } else {
      if (/'$/.test(t)) y -= tl;
      const p = t.replace(/\s*(?:Tj|')$/, '');
      itens.push({ x, y, s: p[0] === '<' ? decodificarHex(p.slice(1, -1)) : decodificarLiteral(p.slice(1, -1)) });
    }
  }
  return itens;
}

/** Junta os pedaços de texto que estão na mesma altura em linhas; também devolve o texto na ordem do arquivo. */
export function montarLinhas(itens) {
  const grupos = new Map();
  for (const it of itens) {
    const k = Math.round(it.y);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(it);
  }
  const linhas = [...grupos.keys()].sort((a, b) => a - b)
    .map((k) => grupos.get(k).sort((a, b) => a.x - b.x).map((i) => i.s.trim()).filter(Boolean).join(' '))
    .filter(Boolean);
  const sequencial = itens.map((i) => i.s.trim()).filter(Boolean).join(' ');
  return { linhas, sequencial };
}

/**
 * Lê o texto de todas as páginas de um PDF.
 * `inflar(bytes)` deve devolver os bytes descomprimidos (zlib/deflate) ou null se não der.
 * Devolve [{ linhas, sequencial }] — uma entrada por página.
 */
export async function textoDoPdf(bytes, inflar) {
  const txt = latin1(bytes);
  const objs = new Map();
  const marcas = [];
  for (const m of txt.matchAll(/(\d+)\s+\d+\s+obj\b/g)) marcas.push([Number(m[1]), m.index + m[0].length]);
  for (const [n, ini] of marcas) {
    const fim = txt.indexOf('endobj', ini);
    objs.set(n, [ini, fim < 0 ? txt.length : fim]);
  }
  const corpo = (n) => { const o = objs.get(n); return o ? txt.slice(o[0], o[1]) : ''; };
  const fluxo = async (n) => {
    const o = objs.get(n);
    if (!o) return null;
    const c = txt.slice(o[0], o[1]);
    const i = c.search(/stream\r?\n/);
    if (i < 0) return null;
    const ini = o[0] + i + c.slice(i).match(/^stream\r?\n/)[0].length;
    const fim = txt.indexOf('endstream', ini);
    const dados = bytes.subarray(ini, fim < 0 ? o[1] : fim);
    if (/FlateDecode/.test(c.slice(0, i))) {
      const d = await inflar(dados);
      return d ? latin1(d) : null;
    }
    return latin1(dados);
  };

  const cacheFontes = new Map();
  const dadosDaFonte = async (n) => {
    if (cacheFontes.has(n)) return cacheFontes.get(n);
    const c = corpo(n);
    const tu = c.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
    const f = { doisBytes: /\/Subtype\s*\/Type0/.test(c), mapa: null };
    if (tu) { const t = await fluxo(Number(tu[1])); if (t) f.mapa = lerCMap(t); }
    cacheFontes.set(n, f);
    return f;
  };
  const fontesDaPagina = async (corpoPag) => {
    const rec = corpoPag.match(/\/Resources\s+(\d+)\s+\d+\s+R/);
    const rtxt = rec ? corpo(Number(rec[1])) : corpoPag;
    let ftxt = '';
    const fr = rtxt.match(/\/Font\s+(\d+)\s+\d+\s+R/);
    if (fr) ftxt = corpo(Number(fr[1]));
    else { const fi = rtxt.match(/\/Font\s*<<([\s\S]*?)>>/); if (fi) ftxt = fi[1]; }
    const mapa = {};
    for (const q of ftxt.matchAll(/\/([A-Za-z0-9_+\-.]+)\s+(\d+)\s+\d+\s+R/g)) mapa[q[1]] = await dadosDaFonte(Number(q[2]));
    return mapa;
  };

  const paginas = [];
  for (const [n, [ini, fim]] of objs) {
    if (fim - ini > 4000) continue; // objeto de página é pequeno; evita examinar fluxos grandes
    const c = txt.slice(ini, fim);
    if (!/\/Type\s*\/Page\b(?!s)/.test(c)) continue;
    const ct = c.match(/\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/);
    if (!ct) continue;
    let conteudo = '';
    for (const r of ct[1].matchAll(/(\d+)\s+\d+\s+R/g)) conteudo += (await fluxo(Number(r[1])) || '') + '\n';
    if (!/\bT[jJ]\b/.test(conteudo)) { paginas.push({ n, linhas: [], sequencial: '' }); continue; }
    const itens = extrairItens(conteudo, await fontesDaPagina(c));
    paginas.push({ n, ...montarLinhas(itens) });
  }
  paginas.sort((a, b) => a.n - b.n);
  return paginas;
}

export const CAPITAIS = ['Aracaju', 'Belém', 'Belo Horizonte', 'Boa Vista', 'Brasília', 'Campo Grande', 'Cuiabá', 'Curitiba',
  'Florianópolis', 'Fortaleza', 'Goiânia', 'João Pessoa', 'Macapá', 'Maceió', 'Manaus', 'Natal', 'Palmas', 'Porto Alegre',
  'Porto Velho', 'Recife', 'Rio Branco', 'Rio de Janeiro', 'Salvador', 'São Luís', 'São Paulo', 'Teresina', 'Vitória'];

const NUMERO = String.raw`-?\d{1,3}(?:\.\d{3})*,\d{2}`;
const REGEX_CAPITAIS = CAPITAIS.map((nome) => ({
  nome,
  re: new RegExp(
    String.raw`(?<![A-Za-z])` +
    semAcento(nome).split('').map((ch) => (ch === ' ' ? String.raw`[ \t]*` : ch)).join(String.raw`[ \t]*`) +
    // depois do nome pode haver uma nota de rodapé, como "(1)"; depois do tempo, às vezes vem o % do salário mínimo
    String.raw`[ \t]*(?:\(\d\)[ \t]*)?((?:` + NUMERO + String.raw`[ \t]+){2,5})(\d{1,3})h[ \t]*(\d{2})m(?:[ \t]+(` + NUMERO + String.raw`))?`,
    'gi')
}));

const paraNumero = (s) => Number(s.replace(/\./g, '').replace(',', '.'));

/** Procura, num texto, linhas "Capital  valor  variação  %SM  tempo". Só aceita linhas que passam nas conferências. */
export function normalizarTabela(texto) {
  return semAcento(texto.replace(/[ \t]*\|[ \t]*/g, ' '))
    .replace(/-[ \t]+(?=\d)/g, '-')
    // alguns PDFs quebram um número em dois pedaços ("4 75,27", "437,4 2", "10 4h19m"): junta quando só pode ser um número
    .replace(/(\d,\d) (\d)(?![\d,.h])/g, '$1$2')
    .replace(/(?<![\d,.])(\d) (?=\d{1,2},\d{2}(?![\d,]))/g, '$1')
    .replace(/(?<![\d,.])(\d{1,2}) (?=\d{1,2}h[ \t]*\d{2}m)/g, '$1');
}

export function acharLinhasDaTabela(texto) {
  const t = normalizarTabela(texto);
  const achados = {};
  for (const { nome, re } of REGEX_CAPITAIS) {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      const nums = (m[1].match(new RegExp(NUMERO, 'g')) || []).map(paraNumero);
      const candidatos = nums.filter((n) => n >= 200 && n <= 3000);
      if (candidatos.length !== 1) continue;
      const valor = candidatos[0];
      // na maioria dos arquivos o % do salário mínimo vem logo antes do tempo; em alguns (notas de dezembro) vem logo depois
      let pctSM = nums[nums.length - 1];
      if ((pctSM === valor || !(pctSM >= 10 && pctSM <= 150)) && m[4]) pctSM = paraNumero(m[4]);
      if (!(pctSM >= 10 && pctSM <= 150) || pctSM === valor) continue;
      const horas = Number(m[2]) + Number(m[3]) / 60;
      if (!(horas >= 20 && horas <= 400)) continue;
      if (!achados[nome]) achados[nome] = { valor, pctSM, horas: Math.round(horas * 100) / 100 };
    }
  }
  return achados;
}

const MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };

/** Data de publicação ("São Paulo, 11 de maio de 2026"), em AAAA-MM-DD, ou null. */
export function dataDePublicacao(texto) {
  const t = semAcento(texto).replace(/[\s|]+/g, '');
  const m = t.match(/SaoPaulo,?(\d{1,2})de([a-z]+?)de(\d{4})/i);
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase()];
  if (!mes) return null;
  return `${m[3]}-${String(mes).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

/**
 * Lê a tabela da cesta de um PDF já convertido em páginas (textoDoPdf).
 * Devolve { capitais: { nome: { valor, pctSM, horas } }, publicadoEm }.
 */
export function lerTabelaCesta(paginas) {
  const capitais = {};
  let publicadoEm = null;
  for (const p of paginas) {
    const a = acharLinhasDaTabela(p.linhas.join('\n'));
    const b = acharLinhasDaTabela(p.sequencial);
    const melhor = Object.keys(b).length > Object.keys(a).length ? b : a;
    for (const [nome, v] of Object.entries(melhor)) if (!capitais[nome]) capitais[nome] = v;
    if (!publicadoEm) publicadoEm = dataDePublicacao(p.sequencial) || dataDePublicacao(p.linhas.join(' '));
  }
  return { capitais, publicadoEm };
}
