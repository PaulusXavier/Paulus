/* Paulus — Relatórios locais: mostra uma etapa por vez (abas), lembra a última e oferece "Voltar / Próxima etapa".
 * Só organiza a tela: nenhum id, campo ou botão das etapas muda. Sem este script, todas as etapas continuam visíveis. */
(function () {
  'use strict';
  var dlg = document.getElementById('bf-report'), nav = document.getElementById('bf-nav');
  if (!dlg || !nav) return;
  var secs = Array.prototype.slice.call(dlg.querySelectorAll('.bf-report-section'));
  if (secs.length < 2) return;
  var CH = 'paulusRelatoriosEtapa', atual = 0, abas = [];
  function lembrar(v) { try { localStorage.setItem(CH, String(v)); } catch (e) { /* sem armazenamento: tudo bem */ } }
  function lido() { try { return +localStorage.getItem(CH) || 0; } catch (e) { return 0; } }
  function numero(sec) { var m = /Etapa\s+(\d+)/.exec((sec.querySelector('h3') || {}).textContent || ''); return m ? m[1] : String(secs.indexOf(sec) + 1); }
  function mostrar(i, foco) {
    atual = Math.max(0, Math.min(secs.length - 1, i));
    secs.forEach(function (s, k) { s.hidden = k !== atual; });
    abas.forEach(function (b, k) { b.setAttribute('aria-selected', k === atual ? 'true' : 'false'); b.tabIndex = k === atual ? 0 : -1; });
    lembrar(atual);
    if (foco) abas[atual].focus();
    try { abas[atual].scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) { /* ok */ }
    try { dlg.scrollTo({ top: 0 }); } catch (e) { dlg.scrollTop = 0; }
  }
  nav.setAttribute('role', 'tablist');
  secs.forEach(function (sec, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'tab'); b.id = 'bf-aba-' + i; b.setAttribute('aria-controls', sec.id || (sec.id = 'bf-sec-' + i));
    var n = document.createElement('span'); n.className = 'n'; n.textContent = numero(sec);
    var t = document.createElement('span'); t.className = 't'; t.textContent = sec.getAttribute('data-curto') || 'Etapa ' + numero(sec);
    b.appendChild(n); b.appendChild(t);
    b.addEventListener('click', function () { mostrar(i); });
    b.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); mostrar((atual + d + secs.length) % secs.length, true); }
    });
    nav.appendChild(b); abas.push(b);
    sec.setAttribute('role', 'tabpanel'); sec.setAttribute('aria-labelledby', b.id);
    var rod = document.createElement('div'); rod.className = 'bf-passo';
    if (i > 0) { var v = document.createElement('button'); v.type = 'button'; v.textContent = '← ' + (secs[i - 1].getAttribute('data-curto') || 'Voltar'); v.addEventListener('click', function () { mostrar(i - 1); }); rod.appendChild(v); }
    if (i < secs.length - 1) { var p = document.createElement('button'); p.type = 'button'; p.className = 'prox'; p.textContent = (secs[i + 1].getAttribute('data-curto') || 'Próxima etapa') + ' →'; p.addEventListener('click', function () { mostrar(i + 1); }); rod.appendChild(p); }
    sec.appendChild(rod);
  });
  mostrar(lido());
})();
