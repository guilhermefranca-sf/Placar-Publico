// Histórico de mandatos de cada deputado federal, a partir da API de Dados Abertos da Câmara:
//   /deputados/{id}/historico  -> posse, licenças, reassunções e fim de mandato, de todas as legislaturas
//   /deputados/{id}            -> ficha (nome civil, nascimento, gabinete, situação atual)
//   /legislaturas/{n}/mesa     -> quem ocupou a Mesa Diretora (presidente, vice-presidentes, secretários)
//
// REGRA DESTE ARQUIVO: mandato não é o mesmo que tempo de exercício. Um mandato (legislatura) pode ter
// períodos de licença ou de substituição. Por isso o tempo é somado só nos dias em que a Câmara registra
// o deputado "em exercício", e cada mandato diz se foi completo ou incompleto, e por quê.

import { emLotes, gravarJson } from './util.mjs';

export const API = 'https://dadosabertos.camara.leg.br/api/v2';
const DIA = 86400000;

/** Datas oficiais de cada legislatura: a 57ª vai de 01/02/2023 a 31/01/2027; cada uma dura 4 anos. */
export function datasDaLegislatura(n) {
  const ano = 1995 + 4 * (n - 50);
  return { ini: `${ano}-02-01`, fim: `${ano + 4}-01-31` };
}
export const legislaturaDe = (isoData) => Math.floor((Number(String(isoData).slice(0, 4)) - (String(isoData).slice(5, 7) === '01' ? 1 : 0) - 1995) / 4) + 50;

// Saídas definitivas do cargo (fim da legislatura, renúncia, cassação...). Todo o resto é afastamento temporário.
const SAIDA_DEFINITIVA = new Set(['FIM_MANDATO', 'VACANCIA']);
const diasEntre = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / DIA));
const dia = (iso) => String(iso).slice(0, 10);

/** "Saída - Afastamento com prazo determinado - Licença para Tratar de Interesse Particular" -> texto sem o prefixo. */
function limparTexto(t) {
  return String(t || '').replace(/^(Entrada|Saída)\s*-\s*/i, '').replace(/\s+/g, ' ').trim();
}

/**
 * Transforma a lista de eventos da API em períodos de exercício, mandatos e afastamentos.
 * eventos: itens de /deputados/{id}/historico. hoje: Date.
 */
export function resumirHistorico(eventos, hoje = new Date()) {
  const hojeISO = hoje.toISOString().slice(0, 10);
  // Eventos sem "situacao" são só o nome e o partido no início da legislatura: não dizem se estava no cargo.
  const ev = (eventos || []).filter((e) => e.situacao).map((e) => ({
    data: String(e.dataHora).slice(0, 16),
    leg: e.idLegislatura,
    situacao: e.situacao,
    condicao: e.condicaoEleitoral || null,
    texto: limparTexto(e.descricaoStatus)
  })).sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : (a.situacao === 'Exercício') - (b.situacao === 'Exercício')));

  const periodos = []; // períodos em exercício
  const pausas = [];   // períodos fora do exercício (licença, afastamento...)
  let aberto = null;
  let ultimaSaida = null;
  for (const e of ev) {
    if (e.situacao === 'Exercício') {
      if (!aberto) {
        aberto = { ini: dia(e.data), entrada: e.texto, condicao: e.condicao };
        if (ultimaSaida && legislaturaDe(ultimaSaida.data) === legislaturaDe(e.data)) {
          pausas.push({ ini: dia(ultimaSaida.data), fim: dia(e.data), motivo: ultimaSaida.texto, tipo: ultimaSaida.situacao });
        }
        ultimaSaida = null;
      } else if (e.condicao) aberto.condicao = e.condicao;
    } else if (aberto) {
      periodos.push({ ...aberto, fim: dia(e.data), saida: e.texto, tipoSaida: e.situacao });
      aberto = null;
      ultimaSaida = e;
    } else if (!ultimaSaida) ultimaSaida = e;
  }
  if (aberto) periodos.push({ ...aberto, fim: null, saida: null, tipoSaida: null });
  // Licença que ainda não terminou (última coisa registrada não é exercício)
  const licencaAtual = !aberto && ultimaSaida && !SAIDA_DEFINITIVA.has(ultimaSaida.situacao) ? { ini: dia(ultimaSaida.data), fim: null, motivo: ultimaSaida.texto, tipo: ultimaSaida.situacao } : null;
  if (licencaAtual) pausas.push(licencaAtual);

  // Um mandato por legislatura em que houve exercício.
  const porLeg = new Map();
  for (const p of periodos) {
    const leg = legislaturaDe(p.ini);
    if (!porLeg.has(leg)) porLeg.set(leg, []);
    porLeg.get(leg).push(p);
  }
  const mandatos = [...porLeg.entries()].sort((a, b) => a[0] - b[0]).map(([leg, ps]) => {
    const { ini: iniLeg, fim: fimLeg } = datasDaLegislatura(leg);
    const emCurso = hojeISO <= fimLeg && hojeISO >= iniLeg;
    const limite = emCurso ? hojeISO : fimLeg;
    const dias = ps.reduce((a, p) => a + diasEntre(p.ini, p.fim && p.fim < limite ? p.fim : limite), 0);
    const diasLeg = Math.max(1, diasEntre(iniLeg, limite));
    const pausasLeg = pausas.filter((x) => legislaturaDe(x.ini) === leg);
    const saidasAntecipadas = ps.filter((p) => p.fim && SAIDA_DEFINITIVA.has(p.tipoSaida) && !/término da legislatura/i.test(p.saida || ''));
    const comecouNoInicio = diasEntre(iniLeg, ps[0].ini) <= 7;
    const completo = !pausasLeg.length && !saidasAntecipadas.length && comecouNoInicio && dias >= diasLeg * 0.99;
    const motivos = [];
    if (!comecouNoInicio) motivos.push(`Assumiu em ${dia(ps[0].ini)}, depois do início da legislatura${ps[0].entrada ? ` (${ps[0].entrada})` : ''}.`);
    pausasLeg.forEach((x) => motivos.push(`${x.motivo || 'Afastamento'}: de ${x.ini} ${x.fim ? 'a ' + x.fim : 'até hoje'}.`));
    saidasAntecipadas.forEach((p) => motivos.push(`Saiu em ${p.fim}: ${p.saida}.`));
    return {
      leg, ini: iniLeg, fim: fimLeg, emCurso,
      inicioExercicio: ps[0].ini, condicao: ps.map((p) => p.condicao).filter(Boolean).pop() || null,
      dias, diasLegislatura: diasLeg, completo: emCurso ? null : completo,
      semAfastamento: !pausasLeg.length && !saidasAntecipadas.length,
      motivos
    };
  });

  const dias = mandatos.reduce((a, m) => a + m.dias, 0);
  const atual = mandatos.find((m) => m.emCurso) || null;
  return {
    anoInicio: mandatos.length ? Number(mandatos[0].inicioExercicio.slice(0, 4)) : null,
    mandatos,
    pausas,
    diasTotais: dias,
    anosEfetivos: Math.round((dias / 365.25) * 100) / 100,
    legislaturaAtual: atual ? { leg: atual.leg, ini: atual.ini, fim: atual.fim, dias: atual.dias, anos: Math.round((atual.dias / 365.25) * 100) / 100 } : null,
    // Linha do tempo: só as mudanças de situação (posse, licença, retorno, fim).
    eventos: ev.filter((e) => !/Alteração de partido/i.test(e.texto)).map((e) => ({ data: dia(e.data), leg: e.leg, situacao: e.situacao, texto: e.texto }))
  };
}

/** Quem ocupou a Mesa Diretora: devolve { idDeputado: [{ leg, cargo, ini, fim }] }. */
export async function carregarMesas(json, legislaturas) {
  const porDeputado = {};
  for (const leg of legislaturas) {
    try {
      const r = await json(`${API}/legislaturas/${leg}/mesa?itens=100`);
      for (const m of r.dados || []) {
        const id = String(m.id);
        (porDeputado[id] ||= []).push({ leg, cargo: m.titulo, ini: m.dataInicio ? dia(m.dataInicio) : null, fim: m.dataFim ? dia(m.dataFim) : null });
      }
    } catch (e) { /* legislatura sem mesa publicada: segue */ }
  }
  return porDeputado;
}

function enderecosSeguros(lista) {
  return (lista || []).filter((u) => /^https?:\/\//i.test(u || '')).slice(0, 8);
}

/** Ficha pública do deputado. Não guarda CPF nem outros dados que não sejam necessários ao perfil. */
export function resumirFicha(f) {
  if (!f) return null;
  const st = f.ultimoStatus || {};
  const g = st.gabinete || {};
  return {
    nomeCivil: f.nomeCivil || null,
    nascimento: f.dataNascimento || null,
    naturalidade: f.municipioNascimento ? `${f.municipioNascimento}/${f.ufNascimento || ''}` : null,
    escolaridade: f.escolaridade || null,
    situacao: st.situacao || null,
    condicao: st.condicaoEleitoral || null,
    desde: st.data || null,
    gabinete: g.sala ? { sala: g.sala, predio: g.predio || null, telefone: g.telefone || null, email: g.email || st.email || null } : (st.email ? { email: st.email } : null),
    redes: enderecosSeguros([...(f.redeSocial || []), f.urlWebsite])
  };
}

/**
 * Gera um arquivo por deputado em <pasta>/deputados/{id}.json.
 * Um deputado que falhar não apaga o arquivo que já existia.
 */
export async function gerarHistoricos({ json, ids, pasta, hoje = new Date(), paralelo = 6, aoAndar = () => {} }) {
  const legislaturas = [50, 51, 52, 53, 54, 55, 56, 57];
  const mesas = await carregarMesas(json, legislaturas);
  let feitos = 0, falhas = 0, semHistorico = 0;
  await emLotes(ids, paralelo, async (id) => {
    try {
      const [h, f] = await Promise.all([
        json(`${API}/deputados/${id}/historico`),
        json(`${API}/deputados/${id}`).catch(() => null)
      ]);
      if (!h || !Array.isArray(h.dados)) throw new Error('resposta sem histórico');
      const resumo = resumirHistorico(h.dados, hoje);
      if (!resumo.mandatos.length) semHistorico++;
      const direcao = (mesas[id] || []).sort((a, b) => (a.ini || '').localeCompare(b.ini || ''));
      gravarJson(`${pasta}/deputados/${id}.json`, {
        id: String(id), geradoEm: hoje.toISOString(),
        ficha: resumirFicha(f && f.dados), ...resumo, direcao
      });
    } catch (e) { falhas++; }
    feitos++;
    if (feitos % 100 === 0) aoAndar(feitos, ids.length);
  });
  return { total: ids.length, falhas, semHistorico, mesas: Object.keys(mesas).length };
}
