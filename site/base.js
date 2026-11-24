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
    lead: 'O índice olha as contas do governo estadual: gasto com pessoal e dívida, comparados aos limites da Lei de Responsabilidade Fiscal.'
  },
  prefeitos: {
    rotulo: 'Prefeitos', singular: 'Prefeito(a)', nota: true,
    lead: 'O índice olha as contas da prefeitura: gasto com pessoal e dívida, comparados aos limites da Lei de Responsabilidade Fiscal.'
  },
  estaduais: {
    rotulo: 'Deputados estaduais', singular: 'Deputado(a) estadual', nota: false,
    lead: 'Lista dos eleitos de cada estado (e do Distrito Federal). O índice ainda não existe: veja o motivo abaixo.'
  },
  vereadores: {
    rotulo: 'Vereadores', singular: 'Vereador(a)', nota: false,
    lead: 'Lista dos vereadores eleitos em cada município. O índice ainda não existe: veja o motivo abaixo.'
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

/* Período que o índice dos deputados federais cobre: "últimos 4 anos (2023 a 2026)". Arquivo antigo, sem janela: só o ano. */
function periodoAvaliado(dado, curto = false) {
  const j = dado && dado.janela;
  if (!j || j.de === j.ate) return String((dado && dado.ano) || '');
  return curto ? `${j.de} a ${j.ate}` : `últimos ${j.anos} anos (${j.de} a ${j.ate})`;
}

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
const rotuloFaixa = n => ({ alta: 'índice alto', media: 'índice médio', baixa: 'índice baixo', sem: 'sem índice' })[faixaNota(n)];

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

/* ---------- Ícones (traços simples, herdam a cor do texto) ---------- */
const ICONES = {
  inicio: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  comparar: 'M12 3v18M8 21h8M7 7h10M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z',
  noticias: 'M4 5h13a1 1 0 0 1 1 1v13H6a2 2 0 0 1-2-2zM18 9h2v8a2 2 0 0 1-2 2M7 9h8M7 13h8M7 16h5',
  mais: 'M5 12h.01M12 12h.01M19 12h.01',
  busca: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
  seta: 'M9 6l6 6-6 6',
  voltar: 'M15 6l-6 6 6 6',
  ok: 'M5 12l5 5 9-10',
  coracao: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  capelo: 'M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5',
  escudo: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  grafico: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  lampada: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z',
  moedas: 'M4 6c0 1.7 3.6 3 8 3s8-1.3 8-3-3.6-3-8-3-8 1.3-8 3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  pessoas: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-7 7-7s7 3 7 7M17 4a4 4 0 0 1 0 7M22 21c0-3-2-5.5-5-6.5',
  relogio: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  predio: 'M4 21V8l8-5 8 5v13M9 21v-6h6v6M4 21h16',
  chave: 'M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z',
  arquivo: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  externo: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01',
  cadeado: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
  olho: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  calendario: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  urna: 'M4 13h16v7H4zM8 13l-1-4h10l-1 4M9 5l3 4 3-4',
  cifrao: 'M12 3v18M16 7.5C16 6 14.2 5 12 5S8 6 8 8s1.8 2.7 4 3 4 1 4 3-1.8 3-4 3-4-1-4-2.5'
};
const icone = (nome, tam = 22) => html`<svg class="ico" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONES[nome] || ''}"/></svg>`;

/* ---------- Mensagens padrão (regra de verificação) ---------- */
const MSG_INDISPONIVEL = 'Dado não encontrado ou não confirmado';
const MSG_SEM_VOTACAO = 'Não há votação nominal registrada para esta matéria nesta etapa.';

const indisponivel = (extra = '') => html`<div class="indisp" role="note">${icone('info', 20)}<div><strong>${MSG_INDISPONIVEL}</strong>${extra ? html`<p>${extra}</p>` : ''}</div></div>`;

/* ---------- Selos: de onde vem cada número ----------
   oficial   = valor que a fonte oficial publica, sem conta nossa
   calculado = conta feita pelo Placar Público sobre dados oficiais (proporção, soma, média)
   indice    = o índice de 0 a 100, que é uma regra nossa, explicada na Metodologia   */
const NOMES_SELO = { oficial: 'Dado oficial', calculado: 'Calculado', indice: 'Índice do Placar' };
const selo = (origem, natureza = '') => html`<span class="selo selo-${origem}" title="${origem === 'oficial' ? 'Valor publicado pela fonte oficial, sem conta nossa.' : origem === 'calculado' ? 'Conta feita pelo Placar Público com dados oficiais. A regra está na Metodologia.' : 'Índice criado pelo Placar Público. Não é um dado oficial.'}">${NOMES_SELO[origem]}${natureza ? ' · ' + natureza : ''}</span>`;

const fonteLinha = (fonte, atualizadoEm, url = '') => html`<p class="fonte-linha">${icone('arquivo', 14)}<span>Fonte: ${url ? html`<a href="${url}" target="_blank" rel="noopener">${fonte}</a>` : fonte}${atualizadoEm ? ` · atualizado em ${dataHoraBR(atualizadoEm)}` : ''}</span></p>`;

/* ---------- Anel de nota ---------- */
function anel(nota, { tam = 56, esp = 6, rotulo = false, escuro = false } = {}) {
  const f = faixaNota(nota);
  const r = (tam - esp) / 2, c = 2 * Math.PI * r;
  const pct = nota == null ? 0 : Math.max(0, Math.min(100, nota));
  const num = nota == null ? '—' : fmtNota(nota);
  const fonteNum = Math.round(tam * (nota == null ? 0.3 : (num.length > 3 ? 0.27 : 0.3)));
  return html`<span class="anel anel-${f} ${escuro ? 'anel-escuro' : ''}" style="width:${tam}px;height:${tam}px" role="img" aria-label="${nota == null ? 'Sem índice' : `Índice ${fmtNota(nota)} de 100, ${rotuloFaixa(nota)}`}">
    <svg width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}" aria-hidden="true">
      <circle class="anel-trilho" cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke-width="${esp}"/>
      <circle class="anel-valor" cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke-width="${esp}" stroke-linecap="round" stroke-dasharray="${(c * pct / 100).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${tam / 2} ${tam / 2})"/>
    </svg>
    <span class="anel-num" style="font-size:${fonteNum}px">${num}${rotulo && nota != null ? html`<small>/100</small>` : ''}</span>
  </span>`;
}
const notaHtml = (n, grande = false) => anel(n, { tam: grande ? 96 : 48, esp: grande ? 8 : 5, rotulo: grande });

/* Abas de cada tipo de perfil. [chave, rótulo]. Endereços antigos continuam funcionando. */
const ABAS_FEDERAL = [['visao', 'Visão geral'], ['historico', 'Histórico de mandatos'], ['projetos', 'Projetos'], ['votos', 'Como votou?'], ['emendas', 'Emendas'], ['gastos', 'Gastos'], ['fiscalizacao', 'Fiscalização'], ['noticias', 'Notícias'], ['fontes', 'Fontes']];
const ABAS_EXECUTIVO = [['visao', 'Visão geral'], ['servicos', 'Serviços básicos'], ['saneamento', 'Saneamento'], ['saude', 'Saúde'], ['educacao', 'Educação'], ['seguranca', 'Segurança'], ['infraestrutura', 'Infraestrutura'], ['obras', 'Obras'], ['economia', 'Economia'], ['orcamento', 'Orçamento'], ['transparencia', 'Transparência'], ['fontes', 'Fontes']];
const ABAS_ANTIGAS = { nota: 'visao', votacoes: 'votos', presenca: 'visao' };
const ABAS_ANTIGAS_EXECUTIVO = { gastos: 'orcamento', contas: 'transparencia', planejamento: 'orcamento' };
