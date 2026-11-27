'use strict';

/* =====================================================================
   Placar Público — roteador
   Troca de tela pelo endereço depois do "#":
     #/                              início (deputados federais)
     #/federais  #/senadores  #/governadores
     #/federais/{id}[/{aba}]         perfil de deputado federal
     #/senadores/{id}[/{aba}]        perfil de senador
     #/governadores/{UF}/{id}[/{aba}]   perfil de governador
     #/presidente[/{aba}]            perfil do Presidente da República
     #/prefeitos  #/vereadores  #/estaduais   saíram do Placar na v8: mostram um aviso
     #/comparar[/{cargo}/{A}/{B}]    comparar duas pessoas
     #/noticias   #/mais   #/metodologia   #/fontes   #/fontes-independentes   #/verificacao
   ===================================================================== */

// Foto que não carrega vira um círculo com as iniciais, sem ícone quebrado.
document.addEventListener('error', e => {
  const img = e.target;
  if (!img || !img.classList || !img.classList.contains('foto') || img.tagName !== 'IMG') return;
  const span = document.createElement('span');
  span.className = 'avatar';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = img.dataset.ini || '?';
  img.replaceWith(span);
}, true);

function rota() {
  const partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b, c, d] = partes;

  // Trocar só a aba do mesmo perfil não conta como tela nova: o token continua o mesmo.
  let chave = null, aba = null;
  if (a === 'federais' && /^\d+$/.test(b || '')) { chave = `federais/${b}`; aba = c; }
  else if (a === 'senadores' && /^\d+$/.test(b || '')) { chave = `senadores/${b}`; aba = c; }
  else if (a === 'governadores' && b && c && UFS.includes(b)) { chave = `${a}/${b}/${c}`; aba = d; }
  else if (a === 'presidente') { chave = 'presidente'; aba = b; }
  if (chave && perfilAtual && perfilAtual.chave === chave) { perfilAtual.trocarAba(aba); return; }

  const token = ++rotaToken;
  perfilAtual = null;
  app.onclick = null;
  window.scrollTo(0, 0);

  if (a === 'metodologia') { marcarMenu('metodologia'); return viewMetodologia(); }
  if (a === 'fontes') { marcarMenu('fontes'); return viewFontes(); }
  if (a === 'fontes-independentes') { marcarMenu('fontes'); return viewFontesIndependentes(token); }
  if (a === 'verificacao') { marcarMenu('mais'); return viewVerificacao(); }
  if (a === 'mais') { marcarMenu('mais'); return viewMais(); }
  if (a === 'noticias') { marcarMenu('noticias'); return viewNoticias(token); }
  if (a === 'comparar') { marcarMenu('comparar'); return viewComparar(partes.slice(1), token); }

  marcarMenu('inicio');
  if (a === 'presidente') return viewPresidente(b, token);
  if (a && CARGOS_RETIRADOS[a]) return viewCargoRetirado(a);
  if (!a || !CARGOS[a]) return viewCargo('federais', token, true);
  if (a === 'federais' || a === 'senadores') {
    if (/^\d+$/.test(b || '')) return viewPerfil(a, '', b, c, token);
    return viewCargo(a, token, false);
  }
  if (b && c && UFS.includes(b)) return viewPerfil(a, b, c, d, token);
  return viewCargo(a, token, false);
}

(async function iniciar() {
  try {
    await iniciarDados();
  } catch (e) {
    console.error(e);
    mostrar(app, html`<div class="erro" role="alert"><strong>Não foi possível iniciar o aplicativo.</strong><p>Recarregue a página. Se o problema continuar, tente de novo mais tarde.</p></div>`);
    return;
  }
  montarMenus();
  montarFaixas();
  window.addEventListener('hashchange', rota);
  rota();
})();
