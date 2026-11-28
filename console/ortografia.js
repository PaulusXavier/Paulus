// Ortografia por dicionário de português no console (o corretor do Verbus, agora no Paulus).
// O dicionário (Hunspell + pt-BR do LibreOffice/VERO) roda num Web Worker em spell/ (vendor/spell/): tudo no aparelho, sem rede depois da
// primeira carga, e o texto nunca sai daqui. Este arquivo guarda o Worker, as palavras que a pessoa adicionou e desenha o painel de resultado.
// A parte sem tela (escolher palavras, juntar resultado, aplicar trocas) está em shared/ortografia.mjs, exposta como Paulus.ortografia.
//
// window.PaulusOrtografia = { painel(textoBase) -> elemento, adicionar(palavra) -> Promise, disponivel() -> boolean }
(function () {
  'use strict';
  var CHAVE = 'paulus.ortografia.usuario';
  var memo = null;
  var fila = Promise.resolve();

  function usuario() {
    try {
      var v = JSON.parse(localStorage.getItem(CHAVE) || '[]');
      return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string' && x; }).slice(0, 2000) : [];
    } catch (e) { return []; }
  }
  function guardar(palavra) {
    try {
      var lista = usuario();
      if (lista.indexOf(palavra) === -1) lista.push(palavra);
      localStorage.setItem(CHAVE, JSON.stringify(lista));
    } catch (e) { /* vale só até fechar a página */ }
  }

  function carregar() {
    if (memo) return memo;
    memo = new Promise(function (ok, no) {
      if (!window.Worker || !window.Paulus || !window.Paulus.ortografia) { no(new Error('sem Worker')); return; }
      var w;
      try { w = new Worker('spell/spell-worker.js', { type: 'module' }); } catch (e) { no(e); return; }
      var fim = setTimeout(function () { try { w.terminate(); } catch (e) { /* já parou */ } no(new Error('o dicionário demorou')); }, 60000);
      w.onerror = function () { clearTimeout(fim); try { w.terminate(); } catch (e) { /* já parou */ } no(new Error('worker')); };
      w.onmessage = function (ev) {
        var m = ev.data || {};
        if (m.t === 'ready') { clearTimeout(fim); ok(w); }
        else if (m.t === 'fail') { clearTimeout(fim); try { w.terminate(); } catch (e) { /* já parou */ } no(new Error(String(m.e))); }
      };
      w.postMessage({ t: 'init', extra: window.Paulus.ortografia.extra.split(' ').concat(usuario()) });
    }).catch(function (e) { memo = null; throw e; });
    return memo;
  }

  // Uma conferência por vez (o Worker responde em lote, na ordem).
  function conferir(palavras) {
    var passo = fila.then(carregar).then(function (w) {
      return new Promise(function (ok, no) {
        var tempo = setTimeout(function () { w.onmessage = null; no(new Error('a conferência demorou')); }, 60000);
        w.onmessage = function (ev) {
          var m = ev.data || {};
          if (m.t === 'res') {
            clearTimeout(tempo);
            var r = {};
            (m.out || []).forEach(function (x) { r[x[0]] = { ok: !!x[1], sug: x[2] || null }; });
            ok(r);
          } else if (m.t === 'fail') { clearTimeout(tempo); no(new Error(String(m.e))); }
        };
        w.postMessage({ t: 'check', words: palavras, sug: true });
      });
    });
    fila = passo.then(function () {}, function () {});
    return passo;
  }

  function adicionar(palavra) {
    guardar(palavra);
    return carregar().then(function (w) { w.postMessage({ t: 'add', w: palavra }); });
  }

  function copiar(texto, botao) {
    var rotulo = botao.textContent;
    var ok = function () { botao.textContent = 'Copiado'; setTimeout(function () { botao.textContent = rotulo; }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(ok, function () {});
    else {
      var t = document.createElement('textarea');
      t.value = texto; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); ok(); } catch (e) { /* segue */ }
      t.remove();
    }
  }

  function el(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    return e;
  }

  var estilo = null;
  function css() {
    if (estilo || !document.head) return;
    estilo = document.createElement('style');
    estilo.textContent =
      '.ort{margin-top:14px;padding-top:12px;border-top:1px solid var(--bd2)}' +
      '.ort-estado{margin:0 0 8px;color:var(--mut);font:500 13px var(--hud)}' +
      '.ort ul{list-style:none;margin:0 0 10px;padding:0;display:flex;flex-direction:column;gap:6px}' +
      '.ort li{display:flex;flex-wrap:wrap;gap:6px;align-items:center}' +
      '.ort li strong{color:var(--t);font:600 14px var(--hud);margin-right:4px}' +
      '.ort li em{color:var(--mut);font:italic 12px var(--hud)}' +
      '.ort button{font:600 12px var(--hud);min-height:30px;padding:0 11px;border-radius:15px;background:transparent;border:1px solid var(--bd2);color:var(--c2);cursor:pointer}' +
      '.ort button:hover{background:var(--panel2);border-color:var(--c)}' +
      '.ort button.on{background:var(--c);color:#02121a;border-color:var(--c)}' +
      '.ort button.fraco{color:var(--mut);border-color:var(--bd)}' +
      '.ort textarea{width:100%;box-sizing:border-box;min-height:120px;resize:vertical;background:var(--panel);color:var(--t);border:1px solid var(--bd2);border-radius:8px;padding:10px;font:400 14px/1.5 var(--hud)}' +
      '.ort .ort-rot{margin:10px 0 4px;color:var(--mut);font:600 12px var(--hud)}';
    document.head.appendChild(estilo);
  }

  // Painel de resultado do dicionário para o texto-base (o texto já com as correções por regra). Devolve um elemento que se completa sozinho.
  function painel(base) {
    css();
    var O = window.Paulus && window.Paulus.ortografia;
    var raiz = el('div', 'ort');
    raiz.setAttribute('role', 'region');
    raiz.setAttribute('aria-label', 'Ortografia conferida no dicionário de português');
    var estado = el('p', 'ort-estado', 'Conferindo no dicionário de português, neste aparelho…');
    estado.setAttribute('aria-live', 'polite');
    raiz.appendChild(estado);
    if (!O) { estado.textContent = 'O dicionário de português não está disponível nesta versão.'; return raiz; }

    var palavras = O.palavras(base, usuario());
    var unicas = [], vistas = {};
    palavras.forEach(function (p) { if (!vistas[p.palavra]) { vistas[p.palavra] = true; unicas.push(p.palavra); } });
    if (!unicas.length) { estado.textContent = 'Não há palavras para conferir no dicionário.'; return raiz; }

    conferir(unicas).then(function (res) {
      var grupos = O.agrupar(base, palavras, res);
      var escolhas = O.escolhasSeguras(grupos);
      estado.textContent = O.resumo(grupos, unicas.length);
      if (!grupos.length) return;

      var lista = el('ul');
      var rotulo = el('p', 'ort-rot', 'Texto com as trocas marcadas');
      var caixa = el('textarea');
      caixa.readOnly = true;
      caixa.setAttribute('aria-label', 'Texto com as trocas marcadas');
      var barra = el('div');
      var bCopiar = el('button', '', 'Copiar texto');
      bCopiar.type = 'button';
      bCopiar.addEventListener('click', function () { copiar(caixa.value, bCopiar); });
      barra.appendChild(bCopiar);

      function atualizar() {
        caixa.value = O.aplicar(base, grupos, escolhas);
        estado.textContent = grupos.length ? O.resumo(grupos, unicas.length) : 'Nenhuma palavra fora do dicionário.';
        Array.prototype.forEach.call(lista.querySelectorAll('button[data-s]'), function (b) {
          var g = grupos[+b.getAttribute('data-g')];
          b.className = g && escolhas[g.palavra] === b.getAttribute('data-s') ? 'on' : '';
        });
      }

      function linha(g, i) {
        var li = el('li');
        li.appendChild(el('strong', '', g.palavra));
        if (g.inicios.length > 1) li.appendChild(el('em', '', '×' + g.inicios.length));
        if (!g.sugestoes.length) li.appendChild(el('em', '', 'sem sugestão'));
        g.sugestoes.forEach(function (s) {
          var b = el('button', '', s);
          b.type = 'button';
          b.setAttribute('data-s', s);
          b.setAttribute('data-g', String(i));
          b.title = 'Trocar “' + g.palavra + '” por “' + s + '” (clique de novo para desfazer)';
          b.addEventListener('click', function () {
            if (escolhas[g.palavra] === s) delete escolhas[g.palavra]; else escolhas[g.palavra] = s;
            atualizar();
          });
          li.appendChild(b);
        });
        var certa = el('button', 'fraco', 'Está certa');
        certa.type = 'button';
        certa.title = 'Adicionar “' + g.palavra + '” ao dicionário deste aparelho';
        certa.addEventListener('click', function () {
          adicionar(g.palavra).then(function () {}, function () {});
          delete escolhas[g.palavra];
          grupos.splice(grupos.indexOf(g), 1);
          desenhar();
        });
        li.appendChild(certa);
        return li;
      }

      function desenhar() {
        lista.textContent = '';
        grupos.forEach(function (g, i) { lista.appendChild(linha(g, i)); });
        atualizar();
      }

      raiz.appendChild(lista);
      raiz.appendChild(rotulo);
      raiz.appendChild(caixa);
      raiz.appendChild(barra);
      desenhar();
    }).catch(function () {
      estado.textContent = 'Não consegui abrir o dicionário de português neste aparelho. Na primeira vez ele precisa ser baixado (cerca de 6 MB) e depois funciona sem internet. Atualize a página e tente de novo; a correção por regras, acima, continua valendo.';
    });
    return raiz;
  }

  window.PaulusOrtografia = {
    painel: painel,
    adicionar: adicionar,
    disponivel: function () { return !!(window.Worker && window.Paulus && window.Paulus.ortografia); }
  };
})();
