'use strict';

/* =====================================================================
   Placar Público — roteador
   Troca de tela pelo endereço depois do "#":
     #/                         início (deputados federais)
     #/federais  #/governadores  #/prefeitos  #/estaduais  #/vereadores
     #/federais/{id}[/{aba}]    perfil de deputado federal
     #/{cargo}/{UF}/{id}        perfil dos demais cargos
     #/metodologia   #/fontes
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

function marcarMenu(chave) {
  $$('.menu a').forEach(a => a.setAttribute('aria-current', a.dataset.menu === chave ? 'page' : 'false'));
}

function rota() {
  const partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [a, b, c, d] = partes;
  // Trocar só a aba do mesmo deputado não conta como tela nova: o token continua o mesmo.
  const mesmoPerfil = perfilAtual && a === 'federais' && /^\d+$/.test(b || '') && perfilAtual.chave === `federais/${b}`;
  if (mesmoPerfil) { perfilAtual.trocarAba(c); return; }
  const token = ++rotaToken;
  perfilAtual = null;
  window.scrollTo(0, 0);

  if (a === 'metodologia') { marcarMenu('metodologia'); return viewMetodologia(); }
  if (a === 'fontes') { marcarMenu('fontes'); return viewFontes(); }

  marcarMenu('inicio');
  if (!a) return viewCargo('federais', token, true);
  if (!CARGOS[a]) return viewCargo('federais', token, true);
  if (a === 'federais') {
    if (/^\d+$/.test(b || '')) return viewPerfil('federais', '', b, c, token);
    return viewCargo('federais', token, false);
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
  montarFaixas();
  window.addEventListener('hashchange', rota);
  rota();
})();
