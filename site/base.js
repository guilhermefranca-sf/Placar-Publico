'use strict';

/* =====================================================================
   Placar Público — base
   Configuração, utilitários, leitura dos arquivos de dados e o modo
   demonstração (dados fictícios, para quando o site é aberto sem os
   arquivos reais).

   Ordem dos arquivos no index.html:
     base.js → demo.js → ao-vivo.js → telas.js → roteador.js
   ===================================================================== */

/* ---------- 1. Configuração ---------- */

const API = 'https://dadosabertos.camara.leg.br/api/v2';
const PORTAL = 'https://www.camara.leg.br';
const ID_PLENARIO = 180;        // código do Plenário na API
const ANO_ATUAL = new Date().getFullYear();
const PRIMEIRO_ANO = 2023;      // início da legislatura atual
const JANELAS_VOTACOES = 4;     // 4 janelas de ~3 meses = últimos 12 meses
const DIAS_JANELA = 89;         // a API recusa intervalos maiores que 3 meses

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const NOMES_UF = { AC:'Acre', AL:'Alagoas', AP:'Amapá', AM:'Amazonas', BA:'Bahia', CE:'Ceará', DF:'Distrito Federal', ES:'Espírito Santo', GO:'Goiás', MA:'Maranhão', MT:'Mato Grosso', MS:'Mato Grosso do Sul', MG:'Minas Gerais', PA:'Pará', PB:'Paraíba', PR:'Paraná', PE:'Pernambuco', PI:'Piauí', RJ:'Rio de Janeiro', RN:'Rio Grande do Norte', RS:'Rio Grande do Sul', RO:'Rondônia', RR:'Roraima', SC:'Santa Catarina', SP:'São Paulo', SE:'Sergipe', TO:'Tocantins' };

/* Os cinco cargos. "nota: true" = existe nota calculada com dados oficiais. */
const CARGOS = {
  federais: {
    rotulo: 'Deputados federais', singular: 'Deputado federal', nota: true,
    lead: 'Presença no Plenário, votos, projetos e uso da cota parlamentar. Os números vêm dos dados abertos da Câmara e são recalculados todo dia.'
  },
  governadores: {
    rotulo: 'Governadores', singular: 'Governador(a)', nota: true,
    lead: 'A nota olha as contas do governo estadual: gasto com pessoal, dívida e relatórios fiscais entregues ao Tesouro Nacional.'
  },
  prefeitos: {
    rotulo: 'Prefeitos', singular: 'Prefeito(a)', nota: true,
    lead: 'A nota olha as contas da prefeitura: gasto com pessoal, dívida e relatórios fiscais entregues ao Tesouro Nacional.'
  },
  estaduais: {
    rotulo: 'Deputados estaduais', singular: 'Deputado(a) estadual', nota: false,
    lead: 'Lista dos eleitos de cada estado (e do Distrito Federal). A nota ainda não existe: veja o motivo abaixo.'
  },
  vereadores: {
    rotulo: 'Vereadores', singular: 'Vereador(a)', nota: false,
    lead: 'Lista dos vereadores eleitos em cada município. A nota ainda não existe: veja o motivo abaixo.'
  }
};
// Tipos de proposição: PL, PEC etc. As siglas fora desta lista aparecem como vieram da API.
const NOMES_TIPO = {
  PL: 'Projeto de Lei', PLP: 'Projeto de Lei Complementar', PEC: 'Proposta de Emenda à Constituição',
  PDL: 'Projeto de Decreto Legislativo', PRC: 'Projeto de Resolução', MPV: 'Medida Provisória',
  PLV: 'Projeto de Lei de Conversão', PLN: 'Projeto de Lei do Congresso', PFC: 'Proposta de Fiscalização e Controle',
  REQ: 'Requerimento', RIC: 'Requerimento de Informação', INC: 'Indicação', RCP: 'Requerimento de CPI',
  EMC: 'Emenda', EMP: 'Emenda de Plenário', EMD: 'Emenda', SBT: 'Substitutivo', PRL: 'Parecer de Relator',
  PAR: 'Parecer', DTQ: 'Destaque', REL: 'Relatório', MSC: 'Mensagem', OFI: 'Ofício'
};
const SIGLAS_PROJETO = new Set(['PL', 'PLP', 'PEC', 'PDL', 'PRC', 'MPV', 'PLV', 'PLN', 'PFC']);
const SIGLAS_REQUERIMENTO = new Set(['REQ', 'RIC', 'INC', 'RCP']);

const ORDEM_CARGOS = ['federais', 'governadores', 'prefeitos', 'estaduais', 'vereadores'];

/* ---------- 2. Utilitários ---------- */

const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];
const esperar = ms => new Promise(r => setTimeout(r, ms));
const app = $('#app');

// Todo texto vindo da API passa por esc() antes de entrar no HTML.
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = v => (v === false || v == null ? '' : String(v)).replace(/[&<>"']/g, c => ESCAPES[c]);
class Html { constructor(s) { this.s = s; } }
function html(partes, ...valores) {
  let saida = '';
  partes.forEach((p, i) => {
    saida += p;
    if (i < valores.length) {
      const lista = Array.isArray(valores[i]) ? valores[i] : [valores[i]];
      saida += lista.map(x => (x instanceof Html ? x.s : esc(x))).join('');
    }
  });
  return new Html(saida);
}
const mostrar = (el, conteudo) => { el.innerHTML = conteudo.s; };

const urlSegura = u => (/^https?:\/\//i.test(u || '') ? u : '');
const semAcento = s => (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = new Intl.NumberFormat('pt-BR');
const plural = (n, um, varios) => `${fmtNum.format(n)} ${n === 1 ? um : varios}`;

function dataBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
const doisDigitos = n => String(n).padStart(2, '0');
const isoDia = d => `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
const somarDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

function reaisCurto(v) {
  const a = Math.abs(v), sinal = v < 0 ? '-' : '';
  const f = x => x.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (a >= 1e6) return `${sinal}R$ ${f(a / 1e6)} mi`;
  if (a >= 1e3) return `${sinal}R$ ${f(a / 1e3)} mil`;
  return `${sinal}R$ ${Math.round(a)}`;
}

// "PASSAGEM AÉREA - SIGEPA." -> "Passagem aérea - SIGEPA"
const SIGLAS_DESPESA = new Set(['SIGEPA', 'RPA', 'DF', 'CEAP', 'TV']);
function frase(s) {
  const t = (s || '').trim().replace(/\.+$/, '').toLowerCase()
    .replace(/[a-z]+/g, p => (SIGLAS_DESPESA.has(p.toUpperCase()) ? p.toUpperCase() : p));
  return t.charAt(0).toUpperCase() + t.slice(1);
}


/* Requisições: com repetição automática e memória (a mesma URL não é buscada duas vezes). */
const memoria = new Map();
function getJSON(caminho, { vazioSe404 = false, repetir = true } = {}) {
  const url = caminho.startsWith('http') ? caminho : API + caminho;
  const maxRepeticoes = repetir ? 3 : 0;   // a API às vezes derruba uma conexão; tentar de novo resolve
  if (memoria.has(url)) return memoria.get(url);
  const promessa = (async () => {
    for (let tentativa = 0; ; tentativa++) {
      try {
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        if (r.status === 404 && vazioSe404) return { dados: [], links: [] };
        if (r.status >= 500 && tentativa < maxRepeticoes) { await esperar(700 * (tentativa + 1)); continue; }
        if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
        return await r.json();
      } catch (e) {
        if (tentativa < maxRepeticoes && !/^HTTP /.test(e.message)) { await esperar(700 * (tentativa + 1)); continue; }
        throw e;
      }
    }
  })();
  memoria.set(url, promessa);
  promessa.catch(() => memoria.delete(url));
  return promessa;
}

// Executa fn em todos os itens, no máximo `limite` ao mesmo tempo, mantendo a ordem.
async function emLotes(itens, limite, fn) {
  const resultados = new Array(itens.length);
  let proximo = 0;
  async function trabalhador() {
    while (proximo < itens.length) {
      const k = proximo++;
      resultados[k] = await fn(itens[k], k);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return resultados;
}

// Busca todas as páginas de uma lista (100 itens por página).
async function buscarTudo(caminho, maxPaginas = 15) {
  const sep = caminho.includes('?') ? '&' : '?';
  const url = p => `${caminho}${sep}itens=100&pagina=${p}`;
  const primeira = await getJSON(url(1));
  const ultima = (primeira.links || []).find(l => l.rel === 'last');
  const total = ultima ? Number((/[?&]pagina=(\d+)/.exec(ultima.href) || [])[1]) || 1 : 1;
  const n = Math.min(total, maxPaginas);
  const outras = await emLotes(Array.from({ length: n - 1 }, (_, i) => i + 2), 4, p => getJSON(url(p)));
  return { itens: [primeira, ...outras].flatMap(r => r.dados || []), truncado: total > maxPaginas };
}

const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtNota = n => (n == null ? '—' : nf1.format(n));
const faixaNota = n => (n == null ? 'sem' : n >= 70 ? 'alta' : n >= 40 ? 'media' : 'baixa');
const rotuloFaixa = n => ({ alta: 'nota alta', media: 'nota média', baixa: 'nota baixa', sem: 'sem nota' })[faixaNota(n)];

function dataHoraBR(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
}

const iniciais = nome => {
  const p = String(nome || '?').trim().split(/\s+/).filter(x => x.length > 2 || /^[A-ZÀ-Ý]/.test(x));
  return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};

// Escolhas pequenas guardadas no navegador (se ele permitir): ano e estado.
function lerPref(chave, padrao) {
  try { const v = localStorage.getItem('placar-' + chave); return v == null ? padrao : v; } catch (e) { return padrao; }
}
function salvarPref(chave, valor) { try { localStorage.setItem('placar-' + chave, String(valor)); } catch (e) { /* sem armazenamento: ignora */ } }
function lerAno() {
  const a = Number(lerPref('ano', ANO_ATUAL));
  return a >= PRIMEIRO_ANO && a <= ANO_ATUAL ? a : ANO_ATUAL;
}
function salvarAno(a) { salvarPref('ano', a); }

/* ---------- 3. Arquivos de dados ---------- */

/* Os dados reais ficam na pasta "dados", gerados todo dia pela rotina do GitHub.
   Se a pasta não existir (site aberto direto do computador, ou primeira rotina
   ainda não terminou), o site entra em modo demonstração, com dados inventados. */
const DADOS = { base: 'dados/', demo: false, motivoDemo: '', cache: new Map(), meta: null, metodo: null };

function lerArquivo(nome) {
  if (DADOS.cache.has(nome)) return DADOS.cache.get(nome);
  const promessa = (async () => {
    if (DADOS.demo) return gerarDemo(nome);
    const r = await fetch(DADOS.base + nome, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status} em ${nome}`);
    return r.json();
  })();
  DADOS.cache.set(nome, promessa);
  promessa.catch(() => DADOS.cache.delete(nome));
  return promessa;
}

async function iniciarDados() {
  try {
    // Abrindo o arquivo direto do computador (file://), o navegador não deixa ler a pasta "dados".
    if (location.protocol === 'file:') throw new Error('arquivo local');
    DADOS.meta = await lerArquivo('meta.json');
  } catch (e) {
    DADOS.demo = true;
    DADOS.motivoDemo = location.protocol === 'file:' ? 'arquivo-local' : 'sem-dados';
    DADOS.cache.clear();
    DADOS.meta = await lerArquivo('meta.json');
  }
  try { DADOS.metodo = await lerArquivo('metodo.json'); } catch (e) { DADOS.metodo = null; }
}

/* ---------- 4. Peças de tela comuns ---------- */

const estado = { ano: lerAno(), filtros: {}, uf: lerPref('uf', 'SP') };
let rotaToken = 0;
let perfilAtual = null;

const esqueletoLinhas = n => html`${Array.from({ length: n }, () => html`<div class="esq esq-linha"></div>`)}`;

function mostrarErro(el, mensagem, aoTentar) {
  mostrar(el, html`
    <div class="erro" role="alert">
      <strong>${mensagem}</strong>
      <p>Confira a conexão com a internet. Se estiver tudo certo, a fonte dos dados pode estar fora do ar no momento.</p>
      <button class="botao" type="button" data-tentar>Tentar de novo</button>
    </div>`);
  $('[data-tentar]', el).addEventListener('click', aoTentar);
}

function notaHtml(n, grande = false) {
  const f = faixaNota(n);
  if (n == null) return html`<span class="nota-num n-sem ${grande ? 'nota-grande' : ''}" title="Sem nota"><small>sem nota</small></span>`;
  return html`<span class="nota-num n-${f} ${grande ? 'nota-grande' : ''}" title="${rotuloFaixa(n)}: ${fmtNota(n)} de 100">${fmtNota(n)}</span>`;
}
