// Catálogo de indicadores do perfil de prefeitos, governadores e presidente, e a montagem dos dados de cada perfil.
//
// Regras que este arquivo cumpre (pedido do projeto):
//   - Nada é inventado ou estimado. Indicador sem fonte confirmada aparece como "Dado não encontrado ou não confirmado",
//     com o nome da fonte oficial e o link onde a pessoa pode conferir.
//   - Cada número carrega o ano (ou mês) a que se refere e QUEM governava naquele período (atribuição por gestão).
//     Um ano em que houve troca de gestor é marcado como dividido: o número anual não é atribuído a uma só pessoa.
//   - Indicador oficial (copiado da fonte) e indicador calculado pelo Placar ficam separados e identificados.
//   - Previsto, empenhado e contratado não são tratados como pago ou concluído: a despesa mostra empenhada, liquidada e paga.
//   - Ausência de dado nunca vira zero.

import { atribuirAno, atribuirMes, mesesNaJanela, AVISO_COBERTURA } from './administracoes.mjs';
import { FUNCOES } from './series-fiscais.mjs';
import { DEFS_CIDADES, PAGINA_CIDADES } from './ibge-cidades.mjs';

export const MSG_NAO_CONFIRMADO = 'Dado não encontrado ou não confirmado';

export const SECOES = [
  { id: 'visao', titulo: 'Visão geral' },
  { id: 'servicos', titulo: 'Serviços básicos' },
  { id: 'saneamento', titulo: 'Saneamento' },
  { id: 'saude', titulo: 'Saúde' },
  { id: 'educacao', titulo: 'Educação' },
  { id: 'seguranca', titulo: 'Segurança' },
  { id: 'infraestrutura', titulo: 'Infraestrutura' },
  { id: 'obras', titulo: 'Obras' },
  { id: 'economia', titulo: 'Economia' },
  { id: 'orcamento', titulo: 'Orçamento' },
  { id: 'transparencia', titulo: 'Transparência' },
  { id: 'fontes', titulo: 'Fontes' }
];

const STN = { fonte: 'Tesouro Nacional — SICONFI, Balanço Anual (DCA), Anexo I-E (despesa por função)', orgao: 'Secretaria do Tesouro Nacional (STN)', url: 'https://apidatalake.tesouro.gov.br/docs/siconfi/' };
const STN_RGF = { fonte: 'Tesouro Nacional — SICONFI, Relatório de Gestão Fiscal (RGF)', orgao: 'Secretaria do Tesouro Nacional (STN)', url: 'https://apidatalake.tesouro.gov.br/docs/siconfi/' };
const LIM_DCA = 'Valor anual declarado pelo próprio ente ao Tesouro, sem auditoria do Placar. Despesa por função não mede qualidade nem resultado do serviço. Entes com balanço não entregue ficam sem o dado (não é zero).';
const LIM_DCA_RESTOS = 'Despesa empenhada é compromisso assumido; só a despesa paga é dinheiro que saiu do caixa no exercício. Parte do empenhado vira restos a pagar.';

const bloco = (secao, prefixo, esferas, codigo, nome) => [
  { id: `${prefixo}.paga-${codigo}`, secao, esferas, tipo: 'oficial', nome: `Despesa paga com ${nome}`, unidade: 'R$', campo: { k: 'funcao', codigo, col: 2 }, periodicidade: 'anual', ...STN, limitacoes: `${LIM_DCA} ${LIM_DCA_RESTOS}` },
  { id: `${prefixo}.empenhada-${codigo}`, secao, esferas, tipo: 'oficial', nome: `Despesa empenhada com ${nome}`, unidade: 'R$', campo: { k: 'funcao', codigo, col: 0 }, periodicidade: 'anual', ...STN, limitacoes: `${LIM_DCA} ${LIM_DCA_RESTOS}` },
  { id: `${prefixo}.pc-${codigo}`, secao, esferas, tipo: 'calculado', nome: `Despesa paga com ${nome} por habitante`, unidade: 'R$ por habitante', campo: { k: 'funcaoPc', codigo }, periodicidade: 'anual',
    metodo: 'Despesa paga na função dividida pela população que o Tesouro informa para o mesmo ano.', fonte: 'Cálculo do Placar sobre dados do Tesouro Nacional (SICONFI/DCA)', orgao: 'Placar Público', url: STN.url, limitacoes: `${LIM_DCA} Cidades de tamanhos muito diferentes não são comparáveis só por este número.` },
  { id: `${prefixo}.pct-${codigo}`, secao, esferas, tipo: 'calculado', nome: `Parte da despesa paga total que foi para ${nome}`, unidade: '% da despesa paga', campo: { k: 'funcaoPct', codigo }, periodicidade: 'anual',
    metodo: 'Despesa paga na função dividida pela despesa paga total (exceto intraorçamentárias) do mesmo ano.', fonte: 'Cálculo do Placar sobre dados do Tesouro Nacional (SICONFI/DCA)', orgao: 'Placar Público', url: STN.url, limitacoes: LIM_DCA }
];

const pendente = (id, secao, esferas, nome, unidade, fonte, orgao, url, extra = '') => ({
  id, secao, esferas, tipo: 'pendente', nome, unidade, fonte, orgao, url, periodicidade: null,
  limitacoes: `Ainda não integrado ao Placar: não conseguimos confirmar uma forma aberta, estável e com licença clara de buscar este dado automaticamente. ${extra}`.trim()
});

const AMBOS = ['M', 'E'];
const CENSO = (secao, id, nome, tabela, chave) => ({
  id: `${secao}.censo-${id}`, secao, esferas: AMBOS, tipo: 'oficial', nome, unidade: '% dos domicílios', campo: { k: 'censo', chave },
  fonte: `IBGE — Censo Demográfico 2022 (SIDRA, tabela ${tabela})`, orgao: 'Instituto Brasileiro de Geografia e Estatística (IBGE)', url: `https://sidra.ibge.gov.br/tabela/${tabela}`,
  periodicidade: 'única (Censo 2022, referência em 1º de agosto de 2022)', referencia: '2022-08-01',
  limitacoes: 'Retrato do Censo de 2022: não é uma série de 48 meses e a data de referência fica ANTES do início do recorte. Mostra a situação em que a gestão encontrou o município, não um resultado dela. O serviço pode ser de concessionária ou do estado, não só da prefeitura.'
});

/** Resultados do IBGE Cidades (Ideb, matrículas, mortalidade infantil, diarreia): um indicador do catálogo por série coletada. */
const INDICADORES_CIDADES = DEFS_CIDADES.map((d) => ({
  id: `cid.${d.chave}`,
  secao: d.secao, esferas: d.esferas, tipo: 'oficial', nome: d.nome, unidade: d.unidade,
  campo: { k: 'cidades', chave: d.chave, grupo: d.grupo, casas: d.casas, responsavel: d.responsavel },
  periodicidade: d.periodicidade, fonte: d.fonte, orgao: d.orgao, url: PAGINA_CIDADES, apiId: d.id, limitacoes: d.limitacoes
}));

export const CATALOGO = [
  // ---- Serviços básicos e infraestrutura urbana (gasto) ----
  ...bloco('servicos', 'servicos', AMBOS, '15', 'urbanismo'),
  pendente('servicos.iluminacao', 'servicos', ['M'], 'Cobertura e consumo de iluminação pública', 'a definir', 'ANEEL / distribuidoras (dados abertos)', 'Agência Nacional de Energia Elétrica (ANEEL)', 'https://dadosabertos.aneel.gov.br/'),
  pendente('servicos.drenagem', 'servicos', ['M'], 'Drenagem e manejo de águas pluviais', 'a definir', 'SINISA — Sistema Nacional de Informações em Saneamento Básico', 'Ministério das Cidades', 'https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/saneamento/sinisa'),
  pendente('servicos.transporte-coletivo', 'servicos', ['M'], 'Transporte coletivo urbano', 'a definir', 'IBGE — Pesquisa de Informações Básicas Municipais (MUNIC)', 'IBGE', 'https://www.ibge.gov.br/estatisticas/sociais/saude/10586-pesquisa-de-informacoes-basicas-municipais.html'),

  // ---- Saneamento ----
  CENSO('saneamento', 'agua', 'Domicílios com água da rede geral como principal forma de abastecimento', 6803, 'agua'),
  CENSO('saneamento', 'esgoto', 'Domicílios com esgoto na rede geral, na rede pluvial ou em fossa ligada à rede', 6805, 'esgoto'),
  CENSO('saneamento', 'lixo', 'Domicílios com lixo coletado', 6892, 'lixo'),
  ...bloco('saneamento', 'sanea', AMBOS, '17', 'saneamento'),
  pendente('sanea.perdas', 'saneamento', ['M'], 'Perdas de água na distribuição', '%', 'SINISA / SNIS — Ministério das Cidades', 'Ministério das Cidades', 'https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/saneamento/sinisa', 'Muitas vezes o serviço é de concessionária ou companhia estadual: o resultado não deve ser atribuído só ao prefeito.'),
  pendente('sanea.tratamento', 'saneamento', ['M'], 'Esgoto coletado que é tratado', '%', 'SINISA / SNIS e Instituto Trata Brasil (ranking do saneamento)', 'Ministério das Cidades; Instituto Trata Brasil', 'https://tratabrasil.org.br/'),

  // ---- Saúde ----
  ...bloco('saude', 'saude', AMBOS, '10', 'saúde'),
  pendente('saude.minimo', 'saude', AMBOS, 'Receita própria aplicada em ações e serviços públicos de saúde (mínimo legal: 15% nos municípios, 12% nos estados)', '% da receita', 'SIOPS — Sistema de Informações sobre Orçamentos Públicos em Saúde', 'Ministério da Saúde', 'https://www.gov.br/saude/pt-br/composicao/seidigi/siops'),
  ...INDICADORES_CIDADES.filter((i) => i.secao === 'saude'),
  pendente('saude.cobertura', 'saude', AMBOS, 'Cobertura vacinal, leitos e cobertura da atenção básica', 'vários', 'DATASUS / CNES / SI-PNI', 'Ministério da Saúde', 'https://datasus.saude.gov.br/', 'Indicadores de saúde dependem também do estado, da União e de fatores sociais. Mortalidade infantil e internações por diarreia já estão integradas (acima).'),

  // ---- Educação ----
  ...bloco('educacao', 'educ', AMBOS, '12', 'educação'),
  pendente('educ.minimo', 'educacao', AMBOS, 'Receita de impostos aplicada na manutenção e desenvolvimento do ensino (mínimo legal: 25%)', '% da receita', 'SIOPE — Sistema de Informações sobre Orçamentos Públicos em Educação', 'FNDE / Ministério da Educação', 'https://www.fnde.gov.br/index.php/financiamento/siope'),
  ...INDICADORES_CIDADES.filter((i) => i.secao === 'educacao'),

  // ---- Segurança ----
  ...bloco('seguranca', 'seg', AMBOS, '06', 'segurança pública'),
  pendente('seg.crimes', 'seguranca', AMBOS, 'Homicídios, roubos e outros crimes (ocorrências registradas)', 'ocorrências por 100 mil habitantes', 'Ministério da Justiça (SINESP) e Fórum Brasileiro de Segurança Pública', 'Ministério da Justiça e Segurança Pública; FBSP', 'https://forumseguranca.org.br/anuario-brasileiro-seguranca-publica/', 'Segurança pública é competência principalmente estadual: não atribuir o resultado ao prefeito.'),

  // ---- Infraestrutura ----
  ...bloco('infraestrutura', 'infra', AMBOS, '26', 'transporte'),
  ...bloco('infraestrutura', 'infra', AMBOS, '16', 'habitação'),
  pendente('infra.pavimentacao', 'infraestrutura', ['M'], 'Ruas pavimentadas', '% das vias', 'IBGE (Censo 2022, entorno dos domicílios) e Prefeituras', 'IBGE', 'https://sidra.ibge.gov.br/', 'O Censo 2022 só pesquisou o entorno em setores selecionados; não há cobertura de todo o município.'),

  // ---- Obras ----
  pendente('obras.federais', 'obras', AMBOS, 'Obras com dinheiro federal: situação, valor contratado e valor pago', 'situação / R$', 'Obrasgov.br e Transferegov.br', 'Ministério da Gestão e da Inovação; Ministério das Cidades', 'https://obrasgov.gov.br/', 'Contratada não é concluída e anunciada não é paga: o Placar só mostrará obra com situação e valor pago confirmados na fonte.'),
  pendente('obras.proprias', 'obras', AMBOS, 'Obras com recursos próprios e de tribunais de contas', 'situação / R$', 'Portais de transparência locais e Tribunais de Contas', 'Tribunais de Contas estaduais', 'https://www.atricon.org.br/'),

  // ---- Economia ----
  { id: 'eco.pib', secao: 'economia', esferas: AMBOS, tipo: 'oficial', nome: 'Produto Interno Bruto (PIB) a preços correntes', unidade: 'R$ mil', campo: { k: 'pib' },
    fonte: 'IBGE — Produto Interno Bruto dos Municípios (SIDRA, tabela 5938)', orgao: 'IBGE', url: 'https://sidra.ibge.gov.br/tabela/5938', periodicidade: 'anual (divulgado com cerca de dois anos de atraso)',
    limitacoes: 'O ano mais recente do PIB municipal costuma ter quase dois anos de defasagem: ele pode ser anterior ao fim do recorte. Valor a preços correntes, sem descontar a inflação.' },
  { id: 'eco.pib-pc', secao: 'economia', esferas: AMBOS, tipo: 'calculado', nome: 'PIB por habitante', unidade: 'R$ por habitante', campo: { k: 'pibPc' },
    metodo: 'PIB do ano dividido pela população estimada pelo IBGE para o mesmo ano.', fonte: 'Cálculo do Placar sobre dados do IBGE (tabelas 5938 e 6579)', orgao: 'Placar Público', url: 'https://sidra.ibge.gov.br/tabela/5938',
    limitacoes: 'Reflete a riqueza produzida no território, não a renda das pessoas nem o desempenho da gestão.' },
  { id: 'eco.populacao', secao: 'economia', esferas: AMBOS, tipo: 'oficial', nome: 'População estimada', unidade: 'pessoas', campo: { k: 'populacao' },
    fonte: 'IBGE — Estimativas de População (SIDRA, tabela 6579)', orgao: 'IBGE', url: 'https://sidra.ibge.gov.br/tabela/6579', periodicidade: 'anual',
    limitacoes: 'Estimativa, não contagem. Pode ser revista pelo IBGE.' },
  pendente('eco.emprego', 'economia', AMBOS, 'Empregos formais criados e fechados', 'vagas', 'Novo Caged — Ministério do Trabalho e Emprego', 'Ministério do Trabalho e Emprego', 'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/estatisticas-trabalho/novo-caged'),

  // ---- Orçamento e administração ----
  { id: 'orc.paga-total', secao: 'orcamento', esferas: AMBOS, tipo: 'oficial', nome: 'Despesa paga total (exceto intraorçamentárias)', unidade: 'R$', campo: { k: 'total', col: 2 }, periodicidade: 'anual', ...STN, limitacoes: `${LIM_DCA} ${LIM_DCA_RESTOS}` },
  { id: 'orc.empenhada-total', secao: 'orcamento', esferas: AMBOS, tipo: 'oficial', nome: 'Despesa empenhada total (exceto intraorçamentárias)', unidade: 'R$', campo: { k: 'total', col: 0 }, periodicidade: 'anual', ...STN, limitacoes: `${LIM_DCA} ${LIM_DCA_RESTOS}` },
  { id: 'orc.pc-total', secao: 'orcamento', esferas: AMBOS, tipo: 'calculado', nome: 'Despesa paga total por habitante', unidade: 'R$ por habitante', campo: { k: 'totalPc' }, periodicidade: 'anual',
    metodo: 'Despesa paga total dividida pela população informada pelo Tesouro para o mesmo ano.', fonte: 'Cálculo do Placar sobre dados do Tesouro Nacional (SICONFI/DCA)', orgao: 'Placar Público', url: STN.url, limitacoes: LIM_DCA },
  { id: 'orc.pessoal', secao: 'orcamento', esferas: AMBOS, tipo: 'oficial', nome: 'Despesa com pessoal sobre a receita corrente líquida', unidade: '% da RCL', campo: { k: 'pessoal' }, periodicidade: 'anual (fim do exercício)', ...STN_RGF,
    limitacoes: 'Limite da Lei de Responsabilidade Fiscal para o Poder Executivo: 54% nas prefeituras e 49% nos estados. Valor do relatório mais recente do exercício, entregue pelo Executivo; pode ser alterado por retificação.' },
  { id: 'orc.divida', secao: 'orcamento', esferas: AMBOS, tipo: 'oficial', nome: 'Dívida consolidada líquida sobre a receita corrente líquida', unidade: '% da RCL', campo: { k: 'divida' }, periodicidade: 'anual (fim do exercício)', ...STN_RGF,
    limitacoes: 'Limite do Senado: 120% nos municípios e 200% nos estados. Pode ser negativa quando o ente tem mais caixa do que dívida.' },

  // ---- Transparência ----
  { id: 'transp.entregas', secao: 'transparencia', esferas: AMBOS, tipo: 'oficial', nome: 'Relatórios fiscais obrigatórios entregues ao Tesouro', unidade: 'relatórios entregues / esperados', campo: { k: 'entregas' }, periodicidade: 'anual',
    fonte: 'Tesouro Nacional — SICONFI, extrato de entregas', orgao: 'Secretaria do Tesouro Nacional (STN)', url: STN.url,
    limitacoes: 'Mede se o ente entregou os relatórios, não se o conteúdo está correto. Só o último ano fechado é consultado.' },
  pendente('transp.portal', 'transparencia', AMBOS, 'Portal da transparência, resposta a pedidos de informação e diários oficiais', 'a definir', 'Querido Diário (Open Knowledge Brasil) e Portal da Transparência', 'Open Knowledge Brasil; Controladoria-Geral da União', 'https://queridodiario.ok.org.br/')
];

/** Indicadores do presidente: séries mensais nacionais. */
export const CATALOGO_PRESIDENTE = [
  { id: 'pres.ipca', secao: 'economia', esferas: ['F'], tipo: 'oficial', nome: 'Inflação oficial (IPCA), variação mensal', unidade: '% ao mês', serie: 'ipca_mensal', resumo: ['acumulado', 'media'],
    fonte: 'IBGE — IPCA (SIDRA, tabela 1737, variável 63)', orgao: 'IBGE', url: 'https://sidra.ibge.gov.br/tabela/1737', periodicidade: 'mensal',
    limitacoes: 'A inflação depende de política monetária (Banco Central), câmbio, clima, preços internacionais e outros fatores; o número sozinho não mede a atuação do presidente. O acumulado é cálculo do Placar (composição dos meses).' },
  { id: 'pres.ipca12', secao: 'economia', esferas: ['F'], tipo: 'oficial', nome: 'Inflação oficial (IPCA) acumulada em 12 meses', unidade: '%', serie: 'ipca_12m', resumo: ['primeiro', 'ultimo', 'variacao'],
    fonte: 'IBGE — IPCA (SIDRA, tabela 1737, variável 2265)', orgao: 'IBGE', url: 'https://sidra.ibge.gov.br/tabela/1737', periodicidade: 'mensal',
    limitacoes: 'Cada ponto resume os 12 meses anteriores, inclusive meses de gestões anteriores quando perto do início de um mandato.' },
  { id: 'pres.desocupacao', secao: 'economia', esferas: ['F'], tipo: 'oficial', nome: 'Taxa de desocupação (PNAD Contínua)', unidade: '% da força de trabalho', serie: 'desocupacao', resumo: ['primeiro', 'ultimo', 'variacao', 'media'],
    fonte: 'IBGE — PNAD Contínua mensal (SIDRA, tabela 6381, variável 4099)', orgao: 'IBGE', url: 'https://sidra.ibge.gov.br/tabela/6381', periodicidade: 'mensal (trimestre móvel)',
    limitacoes: 'Cada valor é a média do trimestre móvel que termina no mês indicado. A divulgação tem cerca de um mês e meio de atraso: os últimos meses do recorte podem faltar.' },
  { id: 'pres.selic', secao: 'economia', esferas: ['F'], tipo: 'oficial', nome: 'Taxa Selic acumulada no mês, anualizada', unidade: '% ao ano', serie: 'selic', resumo: ['primeiro', 'ultimo', 'variacao', 'media'],
    fonte: 'Banco Central do Brasil — SGS, série 4189', orgao: 'Banco Central do Brasil', url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.4189/dados?formato=json', periodicidade: 'mensal',
    limitacoes: 'A Selic é definida pelo Comitê de Política Monetária do Banco Central, não diretamente pelo presidente da República.' },
  { id: 'pres.divida-bruta', secao: 'orcamento', esferas: ['F'], tipo: 'oficial', nome: 'Dívida bruta do governo geral', unidade: '% do PIB', serie: 'divida_bruta', resumo: ['primeiro', 'ultimo', 'variacao'],
    fonte: 'Banco Central do Brasil — SGS, série 13762', orgao: 'Banco Central do Brasil', url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.13762/dados?formato=json', periodicidade: 'mensal',
    limitacoes: 'Inclui governo federal, estados e municípios, não só a União. Depende também do crescimento do PIB e dos juros.' },
  { id: 'pres.divida-liquida', secao: 'orcamento', esferas: ['F'], tipo: 'oficial', nome: 'Dívida líquida do setor público', unidade: '% do PIB', serie: 'divida_liquida', resumo: ['primeiro', 'ultimo', 'variacao'],
    fonte: 'Banco Central do Brasil — SGS, série 4513', orgao: 'Banco Central do Brasil', url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.4513/dados?formato=json', periodicidade: 'mensal',
    limitacoes: 'Inclui União, estados, municípios e estatais (exceto Petrobras e Eletrobras). Depende também do crescimento do PIB e dos juros.' },
  pendente('pres.pib', 'economia', ['F'], 'Crescimento do PIB', '% por trimestre', 'IBGE — Contas Nacionais Trimestrais', 'IBGE', 'https://sidra.ibge.gov.br/tabela/5932'),
  pendente('pres.divida-federal', 'orcamento', ['F'], 'Dívida Pública Federal (estoque e composição)', 'R$', 'Tesouro Nacional — Relatório Mensal da Dívida', 'Secretaria do Tesouro Nacional', 'https://www.tesourotransparente.gov.br/'),
  pendente('pres.investimento', 'infraestrutura', ['F'], 'Investimentos federais (valor pago por função)', 'R$', 'Portal da Transparência e SIOP', 'Controladoria-Geral da União; Ministério do Planejamento', 'https://portaldatransparencia.gov.br/', 'A API do Portal da Transparência exige cadastro e chave pessoal.'),
  pendente('pres.obras', 'obras', ['F'], 'Obras federais: situação, valor contratado e valor pago', 'situação / R$', 'Obrasgov.br', 'Ministério da Gestão e da Inovação', 'https://obrasgov.gov.br/'),
  pendente('pres.saude-educacao', 'saude', ['F'], 'Saúde, educação, segurança e saneamento no âmbito nacional', 'vários', 'DATASUS, Inep, SINESP e SINISA', 'Ministérios correspondentes', 'https://datasus.saude.gov.br/', 'Muitos resultados dependem de estados e municípios.')
];

export const catalogoPublico = () => ({
  versao: 1,
  msgNaoConfirmado: MSG_NAO_CONFIRMADO,
  aviso: AVISO_COBERTURA,
  secoes: SECOES,
  funcoes: FUNCOES,
  indicadores: [...CATALOGO, ...CATALOGO_PRESIDENTE]
});

/* ---------------------------- montagem dos dados de cada perfil ---------------------------- */

const r0 = (v) => Math.round(v);
const r1 = (v) => Math.round(v * 10) / 10;

/** Despesa por habitante e parte da despesa total, por função. Só calcula quando os dois números existem. */
export function derivados(reg) {
  if (!reg || !reg.f) return null;
  const pop = Number.isFinite(reg.pop) && reg.pop > 0 ? reg.pop : null;
  const totalPago = reg.total && Number.isFinite(reg.total[2]) && reg.total[2] > 0 ? reg.total[2] : null;
  const d = {};
  for (const [cod, v] of Object.entries(reg.f)) {
    if (!Number.isFinite(v[2])) continue;
    d[cod] = [pop ? r0(v[2] / pop) : null, totalPago ? r1((v[2] / totalPago) * 100) : null];
  }
  if (pop && totalPago) d.total = [r0(totalPago / pop), 100];
  return d;
}

/** Os dados de um ano de contas. Ano ainda não fechado, ano não coletado e ano sem balanço são situações diferentes — nenhuma vira zero. */
export function registroDoAno(reg, ano, { gestoes, janela, hoje, exercicio = hoje.getUTCFullYear() - 1 }) {
  const base = {
    mesesNaJanela: mesesNaJanela(janela, `${ano}-01-01`, `${ano}-12-31`),
    atribuicao: atribuirAno(gestoes, ano)
  };
  if (ano >= hoje.getUTCFullYear()) return { ...base, situacao: 'em-curso' };
  if (ano > exercicio) return { ...base, situacao: 'aguardando-balanco' }; // o ano acabou, mas o prazo de entrega ao Tesouro ainda não
  if (!reg) return { ...base, situacao: 'nao-coletado' };
  if (reg.erro) return { ...base, situacao: 'erro-de-consulta' };
  const o = { ...base, situacao: reg.dca ? 'fechado' : 'sem-balanco', coletadoEm: reg.em };
  if (reg.dca) { o.pop = reg.pop ?? null; o.total = reg.total ?? null; o.f = reg.f ?? {}; o.d = derivados(reg); }
  if (reg.rgfOk) { o.rgf = reg.rgf; o.pessoal = reg.pessoal ?? null; o.divida = reg.divida ?? null; } else o.rgfSituacao = 'sem-relatorio';
  return o;
}

/** Anos de contas que encostam na janela, do mais antigo ao mais novo (ex.: 2022 a 2026). */
export const anosDaJanela = (janela) => {
  const a = [];
  for (let y = Number(janela.de.slice(0, 4)); y <= Number(janela.ate.slice(0, 4)); y++) a.push(y);
  return a;
};

/** Dados do IBGE de um ente (município: id de 7 dígitos; estado: código de 2). Tudo que faltar fica fora (nunca zero). */
export function contextoDoEnte(id, ibge) {
  const c = {};
  const chave = String(id);
  const tem = (bloco) => bloco?.v && Number.isFinite(bloco.v[chave]);
  if (tem(ibge?.populacao)) c.populacao = { ano: ibge.populacao.ano, valor: ibge.populacao.v[chave] };
  if (tem(ibge?.pib)) {
    c.pib = { ano: ibge.pib.ano, valor: ibge.pib.v[chave] };
    if (tem(ibge.popPib) && ibge.popPib.ano === ibge.pib.ano) c.pib.porHabitante = r0((ibge.pib.v[chave] * 1000) / ibge.popPib.v[chave]);
  }
  const censo = {};
  for (const k of ['agua', 'esgoto', 'lixo']) if (tem(ibge?.censo?.[k])) censo[k] = r1(ibge.censo[k].v[chave]);
  if (Object.keys(censo).length) c.censo = { ano: 2022, referencia: '2022-08-01', ...censo };
  return c;
}

/**
 * Resultados do IBGE Cidades de um ente, ligados à gestão de cada ano.
 *   reg: { em, s: { chave: { ano: valor } } } (arquivo anos/cidades-{UF}.json), ou nada se ainda não foi coletado.
 * Anos até 4 anos antes do recorte entram só como "linha de base" (sem atribuir a gestão); os anos do recorte ficam
 * ligados à gestão da época, e um ano com troca de gestor é marcado como dividido, como nas contas anuais.
 */
export function resultadosDoEnte(reg, { gestoes, janela }) {
  if (!reg || !reg.s) return null;
  const anoDe = Number(janela.de.slice(0, 4));
  const anoAte = Number(janela.ate.slice(0, 4));
  const series = {};
  const anos = {};
  for (const [chave, serie] of Object.entries(reg.s)) {
    const o = {};
    for (const [a, v] of Object.entries(serie)) {
      const n = Number(a);
      if (n < anoDe - 4 || !Number.isFinite(v)) continue;
      o[a] = v;
      if (!anos[a]) anos[a] = n >= anoDe && n <= anoAte
        ? { noRecorte: true, mesesNaJanela: mesesNaJanela(janela, `${a}-01-01`, `${a}-12-31`), atribuicao: atribuirAno(gestoes, n) }
        : { noRecorte: false, mesesNaJanela: 0, atribuicao: null };
    }
    if (Object.keys(o).length) series[chave] = o;
  }
  return { coletadoEm: reg.em ?? null, series, anos };
}

/** Entra no perfil quem encosta na janela e quem está em exercício ou toma posse depois dela. */
const noPerfil = (g, janela) => (g.inicio <= janela.ate && g.fim >= janela.de) || g.situacao !== 'encerrada';

export function montarExecutivoEnte({ cargo, ente, nome, uf, gestoes, registros, janela, hoje, contexto, entregas, exercicio, cidades = null }) {
  const anos = {};
  for (const ano of anosDaJanela(janela)) anos[ano] = registroDoAno(registros?.[ano], ano, { gestoes, janela, hoje, exercicio });
  const recorte = gestoes.filter((g) => noPerfil(g, janela));
  return {
    versao: 1, geradoEm: hoje.toISOString(), cargo,
    ente: { ibge: ente.cod_ibge, nome, uf, esfera: ente.esfera, populacao: ente.populacao ?? null },
    janela, aviso: AVISO_COBERTURA,
    gestoes: recorte, anos, contexto: contexto || {}, entregas: entregas || null,
    resultados: resultadosDoEnte(cidades, { gestoes, janela })
  };
}

/* ---------------------------- presidente: séries mensais por gestão ---------------------------- */

/** Resumo de uma série mensal dentro de uma gestão (só os meses que ficam na janela e na gestão). */
export function resumirSerie(pontos, gestao, janela, { ehTaxaMensal = false } = {}) {
  const de = gestao.inicio > janela.de ? gestao.inicio : janela.de;
  const ate = gestao.fim < janela.ate ? gestao.fim : janela.ate;
  const meses = pontos.filter((p) => `${p.p}-01` >= `${de.slice(0, 7)}-01` && `${p.p}-01` <= `${ate.slice(0, 7)}-01`);
  if (!meses.length) return null;
  const valores = meses.map((p) => p.v);
  const r = {
    meses: meses.length, de: meses[0].p, ate: meses[meses.length - 1].p,
    primeiro: { p: meses[0].p, v: valores[0] }, ultimo: { p: meses[meses.length - 1].p, v: valores[valores.length - 1] },
    media: Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100,
    variacao: Math.round((valores[valores.length - 1] - valores[0]) * 100) / 100
  };
  if (ehTaxaMensal) r.acumulado = Math.round((valores.reduce((a, v) => a * (1 + v / 100), 1) - 1) * 10000) / 100;
  return r;
}

export function montarPresidente({ gestoes, series, janela, hoje, erros = [] }) {
  const indicadores = {};
  for (const ind of CATALOGO_PRESIDENTE.filter((i) => i.serie)) {
    const mapa = series?.[ind.serie];
    if (!mapa) { indicadores[ind.id] = { situacao: 'nao-confirmado' }; continue; }
    const pontos = [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([p, v]) => ({ p, v, atribuicao: atribuirMes(gestoes, p) }));
    const porGestao = {};
    for (const g of gestoes) {
      const r = resumirSerie(pontos, g, janela, { ehTaxaMensal: ind.serie === 'ipca_mensal' });
      if (r) porGestao[g.id] = r;
    }
    indicadores[ind.id] = { situacao: 'ok', ultimoMes: pontos[pontos.length - 1]?.p ?? null, serie: pontos, porGestao };
  }
  return {
    versao: 1, geradoEm: hoje.toISOString(), cargo: 'presidente', ente: { nome: 'Brasil', esfera: 'F' }, janela, aviso: AVISO_COBERTURA,
    gestoes: gestoes.filter((g) => noPerfil(g, janela)),
    indicadores, erros
  };
}
