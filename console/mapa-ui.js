/* Paulus — abre e fecha o "Mapa e rotas" (tela cheia do console). Toda a lógica do mapa está em mapa-rotas.js. */
(function () {
  'use strict';
  var abrir = document.getElementById('mr'), dlg = document.getElementById('mp-dialog'), fechar = document.getElementById('mp-fechar');
  if (!abrir || !dlg) return;
  function mostrar() {
    if (!dlg.open) { try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); } }
    // o mapa só mede o tamanho com a tela já visível
    setTimeout(function () { try { window.dispatchEvent(new Event('resize')); } catch (e) { /* ok */ } }, 120);
  }
  abrir.addEventListener('click', mostrar);
  if (fechar) fechar.addEventListener('click', function () { try { dlg.close(); } catch (e) { dlg.removeAttribute('open'); } });
  // ao abrir o link de rota (#paulus-rota=...) o mapa já abre sozinho
  if (/paulus-rota=/.test(location.hash || '')) setTimeout(mostrar, 400);
  window.PaulusMapaAbrir = mostrar;
})();
