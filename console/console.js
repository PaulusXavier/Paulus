// Console do Paulus: tela de conversa em tela cheia (carregada por login.js depois do login).
// Sem innerHTML: todo texto entra por textContent; Markdown é desenhado por nós, nó a nó.
(function () {
  'use strict';
  var P = window.Paulus;
  var $ = function (id) { return document.getElementById(id); };
  var st = $('st');
  if (!P) { if (st) st.textContent = 'ERRO: paulus.v1.js NÃO CARREGOU'; return; }

  var meta = document.querySelector('meta[name="paulus-endpoint"]');
  var ENDPOINT = (meta && meta.content || '').replace(/\/+$/, '');
  var reduzido = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Posição do aparelho para rotas ("saindo daqui", "como chegar ao X"). O Paulus nunca pede o GPS por conta própria:
  // quem pede é este console, só quando a pergunta fala da posição de quem pergunta, e o navegador ainda pergunta se pode.
  // A posição fica só na memória desta aba (2 min), não vai ao Worker nem à IA e não aparece na tela.
  var posicao = null, ultimoPedido = '';
  var QUER_POSICAO = /\b(daqui|aqui|onde (eu )?(estou|me encontro)|meu local|de mim|perto de mim|(minha|da minha|de minha) (posicao|localizacao)|localizacao atual|como (chegar|ir)|(rota|trajeto|caminho) (ate|para|pra))\b/;
  function semAcento(t) { return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function posicaoDoAparelho() {
    return QUER_POSICAO.test(semAcento(ultimoPedido)) ? obterPosicao() : Promise.resolve(null);
  }
  function obterPosicao() {
    if (posicao && Date.now() - posicao.t < 120000) return Promise.resolve({ lat: posicao.lat, lng: posicao.lng });
    var kp = $('kp');
    var sai = function (txt, cls) { if (kp) { kp.textContent = txt; kp.className = cls || ''; } };
    if (!navigator.geolocation || !window.isSecureContext) { sai('INDISPONÍVEL', 'er'); return Promise.resolve(null); }
    sai('OBTENDO…', 'av');
    return new Promise(function (resolve) {
      navigator.geolocation.getCurrentPosition(function (p) {
        posicao = { lat: p.coords.latitude, lng: p.coords.longitude, t: Date.now() };
        sai('OBTIDA' + (p.coords.accuracy ? ' ±' + Math.round(p.coords.accuracy) + ' m' : ''), 'ok');
        resolve({ lat: posicao.lat, lng: posicao.lng });
      }, function (e) {
        sai(e && e.code === 1 ? 'NEGADA' : 'SEM SINAL', 'er'); resolve(null);
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    });
  }

  P.init({
    app: 'paulus',
    endpoint: ENDPOINT || undefined,
    conhecimentoUrl: 'conhecimento.json',
    aparelho: posicaoDoAparelho,
    lugaresUrl: 'lugares-boa-vista.json'
  });

  var log = $('log'), q = $('q'), go = $('go'), fl = $('fl'), pi = $('pi'), sl = $('sl'), tb = $('tb'), dn = $('dn');
  var anexos = [];            // File[]
  var docAtivo = null;        // documento lido ({nome, texto}) que segue valendo nas próximas perguntas até a pessoa tirar
  var transcricao = [];       // [{papel, texto}] para exportar
  var ocupado = false, vozLigada = false, envioAtual = 0, atual = null;
  var lerLS = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var gravarLS = function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* segue */ } };

  // ------------------------------------------------------------ utilidades de DOM
  function h(tag, attrs, filhos) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k === 'class') el.className = attrs[k];
      else if (k === 'on') Object.keys(attrs.on).forEach(function (e) { el.addEventListener(e, attrs.on[e]); });
      else el.setAttribute(k, attrs[k]);
    });
    (filhos || []).forEach(function (f) { if (f) el.appendChild(typeof f === 'string' ? document.createTextNode(f) : f); });
    return el;
  }
  function btn(rotulo, fn, titulo) { return h('button', { type: 'button', text: rotulo, title: titulo || rotulo, on: { click: fn } }); }
  // Estado do núcleo: idle | busy | listen | speak | erro. Muda a cor do ponto de status, o núcleo animado e o painel lateral.
  var TEXTO_ESTADO = { idle: 'EM ESPERA', busy: 'PENSANDO…', listen: 'OUVINDO…', speak: 'FALANDO…', erro: 'FALHA' };
  var nucleo = null, estadoAtual = 'idle';
  // Sons discretos de interface (WebAudio, sem arquivo). Desligados por padrão; /som liga e desliga.
  var somLigado = false, ctxSom = null;
  var bip = function (f1, f2, dur, vol) {
    if (!somLigado) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ctxSom = ctxSom || new AC(); if (ctxSom.state === 'suspended') ctxSom.resume();
      var t0 = ctxSom.currentTime, o = ctxSom.createOscillator(), g = ctxSom.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f1, t0); o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(ctxSom.destination); o.start(t0); o.stop(t0 + dur + 0.03);
    } catch (e) { /* sem áudio: segue */ }
  };
  // Texto que "se decifra" (efeito de HUD): letras embaralhadas que se resolvem da esquerda para a direita.
  var GLIFOS = '\u2588\u2593\u2592\u2591#0123456789/<>+';
  function decod(el, final, ms) {
    if (!el) return;
    el.textContent = final;
    if (reduzido) return;
    var n = final.length, t0 = 0, dur = ms || 520;
    function f(now) {
      if (!el.isConnected) return;
      if (!t0) t0 = now;
      var p = Math.min(1, (now - t0) / dur), k = Math.floor(p * n), s = '', i, c;
      for (i = 0; i < n; i++) { c = final.charAt(i); s += (i < k || /[\s.,:·\-–—]/.test(c)) ? c : GLIFOS.charAt(Math.floor(Math.random() * GLIFOS.length)); }
      el.textContent = p < 1 ? s : final;
      if (p < 1) requestAnimationFrame(f);
    }
    requestAnimationFrame(f);
  }
  // Legenda grande do que está sendo dito (ditado e modo voz).
  var cap = $('cap');
  function legenda(t, parcial) {
    if (!cap) return;
    cap.textContent = '';
    if (!t) return;
    cap.appendChild(document.createTextNode(t));
    if (parcial) cap.appendChild(h('span', { class: 'cur' }));
  }
  function status(t) { if (st) st.textContent = t; var kn = $('kn'); if (kn) kn.textContent = t.replace('…', ''); }
  function estadoUI(e) {
    estadoAtual = e; document.body.setAttribute('data-estado', e);
    status(TEXTO_ESTADO[e] || TEXTO_ESTADO.idle);
    var kn = $('kn'); if (kn) kn.className = e === 'idle' ? 'ok' : e === 'erro' ? 'er' : 'av';
    if (nucleo) nucleo.estado(e);
  }
  function hora2() { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function perto() { return log.scrollHeight - log.scrollTop - log.clientHeight < 80; }
  function rolar(forca) { if (forca || perto()) log.scrollTop = log.scrollHeight; }
  function ajustarBarra() { document.documentElement.style.setProperty('--bar', ($('bar').offsetHeight + 24) + 'px'); }

  // ------------------------------------------------------------ Markdown seguro (v2)
  // Entende: títulos, negrito, itálico, ~~riscado~~, `código`, links, citação (>), linha (---), listas aninhadas
  // (com número inicial e tarefas [ ]/[x]), tabelas com alinhamento e blocos de código com a linguagem.
  // Enquanto a resposta ainda chega (parcial), segura o que ainda está incompleto (linha de tabela cortada,
  // ** ou ` sem fechar) para o texto não "piscar" com símbolos soltos.
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, at) { var e = document.createElementNS(SVGNS, tag); Object.keys(at || {}).forEach(function (k) { e.setAttribute(k, at[k]); }); return e; }
  // ícones de traço (24×24); cada "|" separa um caminho
  var ICO = {
    copiar: 'M9 9h11v11H9z|M5 15V6a2 2 0 0 1 2-2h9',
    certo: 'M5 12.5l4.5 4.5L19 7.5',
    util: 'M7 11v9H4v-9z|M7 11l3.6-6.6A2 2 0 0 1 14 5.4V9h5.2a1.6 1.6 0 0 1 1.6 1.9l-1.2 6.4A2 2 0 0 1 17.7 19H7',
    naoutil: 'M17 13V4h3v9z|M17 13l-3.6 6.6A2 2 0 0 1 10 18.6V15H4.8a1.6 1.6 0 0 1-1.6-1.9l1.2-6.4A2 2 0 0 1 6.3 5H17',
    refazer: 'M20 11a8 8 0 1 0-2.4 5.7|M20 4.5V11h-6.5',
    curto: 'M5 8h14|M5 16h8',
    longo: 'M5 6h14|M5 12h14|M5 18h9',
    ouvir: 'M4 9v6h4l5 4V5L8 9z|M16.5 9a4 4 0 0 1 0 6',
    fonte: 'M6 3h9l4 4v14H6z|M14 3v5h5|M9 13h7M9 17h7',
    seta: 'M9 6l6 6-6 6',
    aviso: 'M12 4l9 16H3z|M12 10v4M12 17.5v.5',
    mais: 'M5 12h.01M12 12h.01M19 12h.01'
  };
  function ico(nome) {
    var s = svgEl('svg', { viewBox: '0 0 24 24', class: 'ic', 'aria-hidden': 'true', focusable: 'false' });
    String(ICO[nome] || '').split('|').forEach(function (d) { s.appendChild(svgEl('path', { d: d })); });
    return s;
  }
  function seguro(url) { return /^(https?:\/\/|mailto:)/i.test(url); }
  var RE_INLINE = /(`[^`\n]+`)|(\*\*[^\n]+?\*\*)|(~~[^~\n]+~~)|(\*[^*\s][^*\n]*\*)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s<)]+)/g;
  function inline(pai, txt) {
    var re = new RegExp(RE_INLINE.source, 'g'), ult = 0, m;
    while ((m = re.exec(txt))) {
      if (m.index > ult) pai.appendChild(document.createTextNode(txt.slice(ult, m.index)));
      var s = m[0];
      if (m[1]) pai.appendChild(h('code', { text: s.slice(1, -1) }));
      else if (m[2]) { var st2 = h('strong'); inline(st2, s.slice(2, -2)); pai.appendChild(st2); }
      else if (m[3]) { var dl = h('del'); inline(dl, s.slice(2, -2)); pai.appendChild(dl); }
      else if (m[4]) { var em = h('em'); inline(em, s.slice(1, -1)); pai.appendChild(em); }
      else if (m[5]) {
        var mm = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(s);
        if (seguro(mm[2])) pai.appendChild(h('a', { href: mm[2], target: '_blank', rel: 'noopener noreferrer', text: mm[1] }));
        else pai.appendChild(document.createTextNode(mm[1]));
      } else {
        var fim = /[.,;:!?]+$/.exec(s), url = fim ? s.slice(0, fim.index) : s;
        pai.appendChild(h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: url }));
        if (fim) pai.appendChild(document.createTextNode(fim[0]));
      }
      ult = m.index + s.length;
    }
    if (ult < txt.length) pai.appendChild(document.createTextNode(txt.slice(ult)));
  }
  function copiar(texto, botao) {
    var lb = botao && (botao.querySelector && botao.querySelector('.bl') || botao);
    var ok = function () { if (lb) { var o = lb.textContent; lb.textContent = 'Copiado'; if (botao.classList) botao.classList.add('feito'); setTimeout(function () { lb.textContent = o; if (botao.classList) botao.classList.remove('feito'); }, 1400); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(ok, function () {});
    else { var t = h('textarea'); t.value = texto; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); ok(); } catch (e) { /* segue */ } t.remove(); }
  }
  // ------------------------------------------------------------ desenhos (SVG feito pela IA)
  // A IA escreve o SVG num bloco ```svg. Nada dele vai para a página como está: o texto é lido como XML, só formas simples e atributos conhecidos
  // passam (sem script, style, link, imagem, foreignObject nem url() para fora), é reescrito e entra em <img> (que nunca executa script).
  var NS_SVG = 'http://www.w3.org/2000/svg';
  var SVG_TAGS = { svg: 1, g: 1, defs: 1, title: 1, desc: 1, path: 1, rect: 1, circle: 1, ellipse: 1, line: 1, polyline: 1, polygon: 1, text: 1, tspan: 1, lineargradient: 1, radialgradient: 1, stop: 1, marker: 1 };
  var SVG_ATTR = {};
  ('viewbox x y cx cy r rx ry x1 y1 x2 y2 width height d points transform fill stroke stroke-width stroke-dasharray stroke-linecap stroke-linejoin opacity fill-opacity stroke-opacity fill-rule id offset stop-color stop-opacity gradientunits gradienttransform fx fy text-anchor font-size font-family font-weight font-style dominant-baseline dx dy marker-start marker-mid marker-end markerwidth markerheight refx refy orient markerunits preserveaspectratio letter-spacing text-decoration xmlns').split(' ').forEach(function (a) { SVG_ATTR[a] = 1; });
  function valorSvgOk(nome, v) {
    if (v.length > 6000 || /[<>]|&#|javascript:|data:|expression\(|@import/i.test(v)) return false;
    if (/url\s*\(/i.test(v) && !/^url\(#[\w-]+\)$/.test(v.trim())) return false;     // url(#id) só para o próprio desenho
    if (nome === 'transform' || nome === 'gradienttransform') return /^[\d\s.,()+\-a-z]*$/i.test(v);
    if (nome === 'font-family') return /^[\w\s,'"-]*$/.test(v);
    if (nome === 'id') return /^[\w-]+$/.test(v);
    return true;
  }
  function svgSeguro(src) {
    src = String(src || '').trim();
    if (src.length > 60000 || !/^<svg[\s>]/i.test(src)) return null;
    // antes de ler: tira <script>...</script> e atributos onXXX do TEXTO. A limpeza de verdade é a de baixo; isto só evita que o navegador
    // tente compilar um manipulador de evento (a política de segurança bloqueia, mas o erro polui o console).
    src = src.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    if (!/^<svg\b[^>]*\sxmlns\s*=/i.test(src)) src = src.replace(/^<svg\b/i, '<svg xmlns="' + NS_SVG + '"');
    var doc; try { doc = new DOMParser().parseFromString(src, 'image/svg+xml'); } catch (e) { return null; }
    var raiz = doc && doc.documentElement;
    if (!raiz || raiz.localName !== 'svg' || raiz.namespaceURI !== NS_SVG || doc.getElementsByTagName('parsererror').length) return null;
    var n = 0;
    function limpar(no) {
      Array.prototype.slice.call(no.childNodes).forEach(function (f) {
        if (f.nodeType === 3) return;
        if (f.nodeType !== 1) { no.removeChild(f); return; }                 // comentário, CDATA, instrução
        if (f.namespaceURI !== NS_SVG || !SVG_TAGS[f.localName.toLowerCase()] || ++n > 800) { no.removeChild(f); return; }
        Array.prototype.slice.call(f.attributes).forEach(function (a) {
          var nm = a.name.toLowerCase();
          if (nm === 'xmlns' || (a.namespaceURI && a.namespaceURI !== 'http://www.w3.org/2000/xmlns/')) { if (nm !== 'xmlns') f.removeAttributeNode(a); return; }
          if (!SVG_ATTR[nm] || !valorSvgOk(nm, a.value)) f.removeAttributeNode(a);
        });
        limpar(f);
      });
    }
    limpar(raiz);
    var vb = (raiz.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || vb.some(function (v) { return !isFinite(v); }) || vb[2] <= 0 || vb[3] <= 0) {
      var w0 = parseFloat(raiz.getAttribute('width')), h0 = parseFloat(raiz.getAttribute('height'));
      vb = [0, 0, w0 > 0 ? w0 : 800, h0 > 0 ? h0 : 600]; raiz.setAttribute('viewBox', vb.join(' '));
    }
    raiz.removeAttribute('width'); raiz.removeAttribute('height'); raiz.setAttribute('xmlns', NS_SVG);
    return { svg: new XMLSerializer().serializeToString(raiz), w: vb[2], h: vb[3] };
  }
  function baixarPng(d, uri) {
    var im = new Image();
    im.onload = function () {
      var esc = Math.min(3, 1600 / d.w), cv = document.createElement('canvas'); cv.width = Math.round(d.w * esc); cv.height = Math.round(d.h * esc);
      var c2 = cv.getContext('2d'); c2.fillStyle = '#fff'; c2.fillRect(0, 0, cv.width, cv.height); c2.drawImage(im, 0, 0, cv.width, cv.height);
      try {
        cv.toBlob(function (b) {
          if (!b) { aviso('Não consegui gerar o PNG.'); return; }
          var url = URL.createObjectURL(b), a = h('a', { href: url, download: 'desenho-paulus.png' }); document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        }, 'image/png');
      } catch (e) { aviso('Não consegui gerar o PNG.'); }
    };
    im.onerror = function () { aviso('Não consegui gerar o PNG.'); };
    im.src = uri;
  }
  function desenho(cod) {
    var d = svgSeguro(cod); if (!d) return null;
    var uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(d.svg);
    var img = h('img', { src: uri, alt: 'Desenho feito pelo Paulus' });
    var barra = h('div', { class: 'ac' }, [
      btn('⤓ SVG', function () { baixarTexto('desenho-paulus.svg', d.svg, 'image/svg+xml;charset=utf-8'); }, 'Baixar o desenho (SVG, serve para editar)'),
      btn('⤓ PNG', function () { baixarPng(d, uri); }, 'Baixar o desenho como imagem PNG'),
      btn('Copiar código', function (e) { copiar(cod, e.currentTarget); }, 'Copiar o código SVG')
    ]);
    return h('div', { class: 'dw', role: 'group', 'aria-label': 'Desenho' }, [h('div', { class: 'dwh' }, [h('span', { class: 'cl', text: 'DESENHO' })]), h('div', { class: 'dwi' }, [img]), barra]);
  }
  var emParcial = false;
  function bloco(cod, lang) {
    var pre = h('pre'); pre.textContent = cod;
    var b = h('button', { type: 'button', class: 'cp', title: 'Copiar o código' }, [ico('copiar'), h('span', { class: 'bl', text: 'Copiar' })]);
    b.addEventListener('click', function () { copiar(cod, b); });
    return h('div', { class: 'cb' }, [h('div', { class: 'cbh' }, [h('span', { class: 'cl', text: lang || 'código' }), b]), pre]);
  }
  function tabela(linhas) {
    var cel = function (l) { return l.trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); }); };
    var t = h('table'), cab = cel(linhas[0]);
    var al = cel(linhas[1]).map(function (c) { return /^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : ''; });
    var tr = h('tr'); cab.forEach(function (c, k) { var th = h('th'); if (al[k]) th.style.textAlign = al[k]; inline(th, c); tr.appendChild(th); }); t.appendChild(h('thead', {}, [tr]));
    var tbd = h('tbody');
    linhas.slice(2).forEach(function (l) { var r = h('tr'); cel(l).forEach(function (c, k) { var td = h('td'); if (al[k]) td.style.textAlign = al[k]; inline(td, c); r.appendChild(td); }); tbd.appendChild(r); });
    t.appendChild(tbd);
    return h('div', { class: 'tw', tabindex: '0', role: 'region', 'aria-label': 'Tabela' }, [t]);
  }
  var RE_ITEM = /^(\s*)([-*•+]|\d+[.)])\s+(.*)$/;
  var RE_QUEBRA = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
  function recuo(s) { return s.replace(/\t/g, '    ').length; }
  function lista(ls, i) {
    var m0 = RE_ITEM.exec(ls[i]), base = recuo(m0[1]), ord = /\d/.test(m0[2]);
    var el = h(ord ? 'ol' : 'ul'), ultimo = null;
    if (ord) { var n0 = parseInt(m0[2], 10); if (n0 > 1) el.setAttribute('start', String(n0)); }
    while (i < ls.length) {
      var m = RE_ITEM.exec(ls[i]);
      if (!m || RE_QUEBRA.test(ls[i])) break;
      var ind = recuo(m[1]);
      if (ind < base) break;
      if (ind > base + 1 && ultimo) { var sub = lista(ls, i); ultimo.appendChild(sub.el); i = sub.i; continue; }
      if (/\d/.test(m[2]) !== ord) break;
      var li = h('li'), txt = m[3], tk = /^\[( |x|X)\]\s+(.*)$/.exec(txt);
      if (tk) { li.className = 'tk'; li.appendChild(h('span', { class: 'cx' + (tk[1] !== ' ' ? ' ok' : ''), role: 'img', 'aria-label': tk[1] !== ' ' ? 'feito' : 'a fazer' })); txt = tk[2]; }
      inline(li, txt); el.appendChild(li); ultimo = li; i++;
      while (i < ls.length && ls[i].trim() && !RE_ITEM.test(ls[i]) && recuo(ls[i]) > base) { li.appendChild(h('br')); inline(li, ls[i].trim()); i++; }
      var j = i; while (j < ls.length && !ls[j].trim()) j++;
      if (j > i && j < ls.length && RE_ITEM.test(ls[j]) && !RE_QUEBRA.test(ls[j]) && recuo(RE_ITEM.exec(ls[j])[1]) >= base) i = j;
    }
    return { el: el, i: i };
  }
  function blocos(ls) {
    var raiz = document.createDocumentFragment(), i = 0;
    while (i < ls.length) {
      var l = ls[i], m;
      if ((m = /^\s{0,3}(```|~~~)\s*([\w+#.-]*)/.exec(l))) {
        var cod = [], cerca = m[1], lang = m[2]; i++;
        while (i < ls.length && ls[i].trim().indexOf(cerca) !== 0) cod.push(ls[i++]);
        var fechado = i < ls.length; i++;
        var texto = cod.join('\n'), lg = (lang || '').toLowerCase();
        if (lg === 'svg' || ((lg === '' || lg === 'xml' || lg === 'html') && /^\s*<svg[\s>]/i.test(texto))) {
          if (!fechado && emParcial) { raiz.appendChild(h('div', { class: 'dw dwp', role: 'status', text: 'Desenhando…' })); continue; }   // ainda chegando
          var dw = fechado || !emParcial ? desenho(texto) : null;
          if (dw) { raiz.appendChild(dw); continue; }
        }
        raiz.appendChild(bloco(texto, lang)); continue;
      }
      if (!l.trim()) { i++; continue; }
      if (RE_QUEBRA.test(l)) { raiz.appendChild(h('hr')); i++; continue; }
      if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) { var hh = h(m[1].length <= 2 ? 'h3' : 'h4'); inline(hh, m[2].replace(/\s+#+\s*$/, '')); raiz.appendChild(hh); i++; continue; }
      if (/^\s{0,3}>/.test(l)) {
        var q2 = [];
        while (i < ls.length && /^\s{0,3}>/.test(ls[i])) q2.push(ls[i++].replace(/^\s{0,3}>\s?/, ''));
        var bq = h('blockquote'); bq.appendChild(blocos(q2)); raiz.appendChild(bq); continue;
      }
      if (/^\s*\|.*\|?\s*$/.test(l) && /^\s*\|/.test(l) && i + 1 < ls.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(ls[i + 1])) {
        var tl = [l, ls[i + 1]]; i += 2;
        while (i < ls.length && /^\s*\|/.test(ls[i])) tl.push(ls[i++]);
        raiz.appendChild(tabela(tl)); continue;
      }
      if (RE_ITEM.test(l)) { var r = lista(ls, i); raiz.appendChild(r.el); i = r.i; continue; }
      var par = [];
      while (i < ls.length && ls[i].trim() && !/^(\s{0,3}(```|~~~)|#{1,4}\s|\s*[-*•+]\s|\s*\d+[.)]\s|\s*\||\s{0,3}>)/.test(ls[i]) && !RE_QUEBRA.test(ls[i])) par.push(ls[i++]);
      if (!par.length) { par.push(ls[i++]); }
      var p = h('p');
      par.forEach(function (x, k) { if (k) p.appendChild(h('br')); inline(p, x); });
      raiz.appendChild(p);
    }
    return raiz;
  }
  // Texto ainda chegando: tira a linha de tabela cortada e fecha ** e ` abertos só na exibição.
  function segurarParcial(ls) {
    var f = ls.slice(), dentro = false, k;
    for (k = 0; k < f.length; k++) if (/^\s{0,3}(```|~~~)/.test(f[k])) dentro = !dentro;
    if (dentro) return f;                               // dentro de um bloco de código tudo vale
    var n = f.length;
    while (n && !f[n - 1].trim()) n--;
    f.length = n;
    if (!n) return f;
    var u = f[n - 1];
    if (/^\s*\|/.test(u)) {
      var ini = n - 1; while (ini > 0 && /^\s*\|/.test(f[ini - 1])) ini--;
      if (n - ini < 2) { f.length = ini; return f; }     // só o cabeçalho, sem a linha de traços
      if (!/\|\s*$/.test(u)) f.length = n - 1;            // última linha cortada
      return f;
    }
    if (((u.match(/\*\*/g) || []).length) % 2) f[n - 1] = u + '**';
    else if (((u.replace(/\*\*/g, '').match(/`/g) || []).length) % 2) f[n - 1] = u + '`';
    return f;
  }
  function markdown(texto, parcial) {
    emParcial = !!parcial;
    var ls = String(texto || '').replace(/\r\n?/g, '\n').split('\n');
    return blocos(parcial ? segurarParcial(ls) : ls);
  }
  function pintar(el, texto, parcial) { el.textContent = ''; el.appendChild(markdown(texto, parcial)); }

  // ------------------------------------------------------------ mensagens
  function limparBoasVindas() { var o = log.querySelector('.hi'); if (o) o.remove(); document.body.classList.remove('vazio'); }
  var KIND = { ia: 'IA', norma: 'NORMA', busca: 'BUSCA', acao: 'AÇÃO', acao_desconhecida: 'AÇÃO', calculo: 'CÁLCULO', rota: 'ROTA', geo: 'GEO', pdf: 'PDF', modelo: 'MODELO 3D', revisao: 'REVISÃO', espanhol: 'IDIOMA', ingles: 'IDIOMA', crise: 'SOCORRO', bloqueio: 'PRIVACIDADE', erro: 'ERRO', sem_resposta: 'SEM RESPOSTA', pens: 'PROCESSANDO' };
  var LOCAL = { norma: 1, busca: 1, acao: 1, acao_desconhecida: 1, calculo: 1, rota: 1, geo: 1, pdf: 1, modelo: 1, revisao: 1, espanhol: 1, ingles: 1, crise: 1, bloqueio: 1, sem_resposta: 1 };
  var nResp = 0, vozPendente = false;
  function cabeca(quem, kind, id) {
    var c = h('div', { class: 'mh' }, [h('span', { class: 'q', text: quem })]);
    if (id) c.appendChild(h('span', { class: 'id', text: id }));
    if (kind) c.appendChild(h('span', { class: 'k', text: kind }));
    c.appendChild(h('span', { class: 'o', text: hora2() }));
    return c;
  }
  function msgUsuario(texto, nomes) {
    limparBoasVindas();
    var corpo = h('div', { class: 'mc', text: texto });
    var daVoz = vozPendente; vozPendente = false;
    var m = h('div', { class: 'm u' }, [cabeca('VOCÊ', daVoz ? 'COMANDO DE VOZ' : 'COMANDO'), corpo]);
    if (daVoz) m.setAttribute('data-voz', '1');
    if (nomes && nomes.length) m.appendChild(h('div', { class: 'f', text: '📎 ' + nomes.join(', ') }));
    m.appendChild(h('button', { type: 'button', class: 'ue', text: 'Editar', title: 'Editar e reenviar', on: { click: function () { q.value = texto; autoAltura(); q.focus(); } } }));
    log.appendChild(m); transcricao.push({ papel: 'Você', texto: texto }); tele.msgs++; telemetria(); rolar(true); return m;
  }
  function msgPaulus() {
    limparBoasVindas();
    var corpo = h('div', { class: 'mc' });
    nResp++;
    var m = h('div', { class: 'm p', 'data-k': 'pens' }, [cabeca('PAULUS', KIND.pens, '#' + ('00' + nResp).slice(-3)), corpo, h('i', { class: 'sw', 'aria-hidden': 'true' })]);
    log.appendChild(m); rolar(true); return { m: m, corpo: corpo };
  }
  // indicador de "pensando": barras + varredura; a segunda fase aparece se a resposta demora
  function pensando(x) {
    var rot = h('span', { text: 'ANALISANDO' });
    x.corpo.textContent = '';
    x.corpo.appendChild(h('div', { class: 'pens', role: 'status' }, [h('span', { class: 'bars', 'aria-hidden': 'true' }, [h('i'), h('i'), h('i'), h('i'), h('i')]), rot, h('span', { class: 'sc', 'aria-hidden': 'true' })]));
    x.fase = setTimeout(function () { if (rot.isConnected) rot.textContent = 'CONSULTANDO A BASE'; }, 1600);
    x.fase2 = setTimeout(function () { if (rot.isConnected) rot.textContent = 'COMPONDO A RESPOSTA'; }, 4200);
  }
  function fimPensando(x) { clearTimeout(x.fase); clearTimeout(x.fase2); }
  function dataHud() { var d = new Date(); return (d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).replace(/[.,]/g, '').toUpperCase() + ' · ' + hora2() + ' · BOA VISTA'); }
  function saudacao() { var hr = new Date().getHours(); return hr < 5 ? 'Boa madrugada' : hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite'; }
  function nomeDoUsuario() {
    var u = lerLS('paulus.usuario') || ''; u = String(u).split('@')[0];
    return /^[a-zA-ZÀ-ú]{2,20}$/.test(u.split(/[._-]/)[0]) && !/\d/.test(u) ? u.split(/[._-]/)[0].charAt(0).toUpperCase() + u.split(/[._-]/)[0].slice(1).toLowerCase() : '';
  }
  function boasVindas() {
    var sk = P.skin('paulus') || {};
    var sug = (P.sugestoesPessoais ? P.sugestoesPessoais(3) : []).concat(sk.sugestoes || []);
    var vistos = {}; sug = sug.filter(function (s) { if (!s || vistos[s]) return false; vistos[s] = 1; return true; }).slice(0, 4);
    var nome = nomeDoUsuario();
    var gSp = h('span'), nSp = nome ? h('b') : null;
    var titulo = h('h2', {}, [gSp, nSp]);
    var eySp = h('div', { class: 'ey' }), dtSp = h('div', { class: 'dt' });
    var hi = h('div', { class: 'hi' }, [
      eySp,
      dtSp,
      titulo,
      h('p', { text: sk.saudacao || 'Console do Paulus no ar. Pergunte por texto ou voz.' })
    ]);
    var grade = h('div', { class: 'sg' });
    sug.forEach(function (s, i) { grade.appendChild(h('button', { type: 'button', class: 'ch', on: { click: function () { enviar(s); } } }, [h('i', { text: '\u203A' }), h('span', { text: s })])); });
    hi.appendChild(grade);
    hi.appendChild(h('small', { text: 'Não digite nome nem documento de pessoas atendidas. Digite / para atalhos. Anexe PDF para editar no aparelho ou uma foto para eu ler (a foto vai para a IA: sem rosto, nome nem documento de pessoas).' }));
    log.appendChild(hi); document.body.classList.add('vazio');
    decod(eySp, 'TODOS OS SISTEMAS OPERACIONAIS', 700); decod(dtSp, dataHud(), 600);
    decod(gSp, saudacao() + (nome ? ', ' : '.'), 520); if (nSp) decod(nSp, nome + '.', 700);
  }

  // ------------------------------------------------------------ atalhos
  var ATALHOS = [
    { c: '/nova', d: 'Nova conversa', f: function () { nova(); } },
    { c: '/salvar', d: 'Salvar conversa em .md', f: function () { exportar(); } },
    { c: '/ajuda', d: 'O que o Paulus sabe fazer', t: 'o que você sabe fazer?' },
    { c: '/pdf', d: 'Editar PDF (anexe o arquivo)', t: 'juntar os PDFs anexados' },
    { c: '/mapa', d: 'Mapa de Boa Vista', t: 'mostrar o mapa de Boa Vista' },
    { c: '/daqui', d: 'Rota a partir da minha posição', t: 'traçar rota saindo daqui: ' },
    { c: '/rota', d: 'Traçar rota entre unidades', t: 'traçar rota saindo do CRAS: ' },
    { c: '/conta', d: 'Fazer uma conta', t: 'quanto é ' },
    { c: '/corrigir', d: 'Corrigir ortografia', t: 'corrija a ortografia e a gramática: ' },
    { c: '/espanhol', d: 'Vocabulário em espanhol', t: 'como se diz em espanhol: ' },
    { c: '/voz', d: 'Escolher a voz, a velocidade e o tom', f: function () { painelVoz(true); } },
    { c: '/som', d: 'Ligar ou desligar os sons da interface', f: function () { alternarSom(); } },
    { c: '/memoria', d: 'Ver o que o Paulus aprendeu', f: function () { memoria(); } },
    { c: '/esquecer', d: 'Apagar a memória do aparelho', f: function () { if (confirm('Apagar tudo que o Paulus aprendeu neste aparelho?')) { try { P.memoria.esquecer(); } catch (e) { /* segue */ } aviso('Memória apagada.'); } } }
  ];
  var selSl = 0, listaSl = [];
  function abrirSl() {
    var v = q.value;
    if (!/^\/\S*$/.test(v)) { sl.hidden = true; return; }
    listaSl = ATALHOS.filter(function (a) { return a.c.indexOf(v.toLowerCase()) === 0; });
    if (!listaSl.length) { sl.hidden = true; return; }
    selSl = Math.min(selSl, listaSl.length - 1);
    sl.textContent = '';
    listaSl.forEach(function (a, i) {
      var d = h('div', { class: i === selSl ? 'sel' : '', role: 'option' }, [h('b', { text: a.c }), h('span', { text: a.d })]);
      d.addEventListener('mousedown', function (e) { e.preventDefault(); rodarAtalho(a); });
      sl.appendChild(d);
    });
    sl.hidden = false;
  }
  function rodarAtalho(a) {
    sl.hidden = true; q.value = '';
    if (a.f) a.f(); else { q.value = a.t; q.focus(); }
    autoAltura();
  }
  function memoria() {
    var r = ''; try { r = P.memoria.resumo(); } catch (e) { /* segue */ }
    var corpo = typeof r === 'string' ? r : JSON.stringify(r, null, 2);
    var x = msgPaulus(); pintar(x.corpo, corpo ? '**O que o Paulus aprendeu neste aparelho**\n\n' + corpo : 'Ainda não aprendi nada neste aparelho.');
  }
  function alternarSom() {
    somLigado = !somLigado; gravarLS('paulus.som', somLigado ? '1' : '0');
    var ks = $('ksom'); if (ks) { ks.textContent = somLigado ? 'LIGADO' : 'DESLIGADO'; ks.className = somLigado ? 'ok' : ''; }
    bip(660, 990, 0.12, 0.05); aviso(somLigado ? 'Sons ligados.' : 'Sons desligados.');
  }
  function aviso(t) { pi.textContent = t; setTimeout(function () { if (pi.textContent === t) pi.textContent = ''; ajustarBarra(); }, 3500); ajustarBarra(); }

  // barra de tarefas rápidas
  [['PAIF × PAEFI', 'qual a diferença entre PAIF e PAEFI?'], ['Conta', '/conta'], ['Sistemas', '/sistemas'], ['Mapa', 'mostrar o mapa de Boa Vista'], ['Rota daqui', '/daqui'], ['Rota', '/rota'], ['PDF', '/pdf'], ['Corrigir', '/corrigir'], ['Espanhol', '/espanhol']].forEach(function (x) {
    tb.appendChild(btn(x[0], function () {
      if (x[1].charAt(0) === '/') { q.value = x[1]; var a = ATALHOS.filter(function (z) { return z.c === x[1]; })[0]; if (a) rodarAtalho(a); }
      else enviar(x[1]);
    }));
  });

  // ------------------------------------------------------------ respostas
  function rodape(r) {
    var ROTULO = { referencia: 'orientação técnica', apoio: 'material de apoio' }, fontes = [], avisos = (r.avisos || []).filter(Boolean);
    (r.fontes || []).forEach(function (f) {
      var titulo = f.documento || f.norma || '';
      if (!titulo) return;
      var sub = [f.documento ? f.norma : '', f.ano, f.referencia].filter(Boolean).join(' · ');
      fontes.push({ titulo: titulo, sub: sub, tipo: ROTULO[f.tipo] || '', aprox: f.aderencia === 'baixa', usada: f.usada !== false });
    });
    if (!fontes.length && !avisos.length) return null;
    var caixa = h('div', { class: 'rd' });
    if (fontes.length) {
      var usadas = fontes.filter(function (x) { return x.usada; }), outras = fontes.filter(function (x) { return !x.usada; });
      var det = h('details', { class: 'src' });
      var resumo = (usadas.length || fontes.length) + (usadas.length === 1 ? ' fonte' : ' fontes') + (usadas.length && outras.length ? ' · +' + outras.length + ' consultada' + (outras.length > 1 ? 's' : '') : '');
      if (!usadas.length) resumo = outras.length + (outras.length === 1 ? ' fonte consultada' : ' fontes consultadas');
      det.appendChild(h('summary', {}, [ico('fonte'), h('span', { class: 'sn', text: resumo }), h('span', { class: 'sc2', 'aria-hidden': 'true' }, [ico('seta')])]));
      var ol = h('ol', { class: 'sl' });
      usadas.concat(outras).forEach(function (f) {
        var li = h('li', { class: f.usada ? '' : 'ap' }, [h('span', { class: 'st', text: f.titulo })]);
        var tags = h('span', { class: 'sg' });
        if (f.tipo) tags.appendChild(h('span', { class: 'tg', text: f.tipo }));
        if (f.aprox) tags.appendChild(h('span', { class: 'tg av', text: 'aproximada' }));
        if (!f.usada) tags.appendChild(h('span', { class: 'tg', text: 'só consultada' }));
        if (tags.childNodes.length) li.appendChild(tags);
        if (f.sub) li.appendChild(h('span', { class: 'sr', text: f.sub }));
        ol.appendChild(li);
      });
      det.appendChild(ol); caixa.appendChild(det);
    }
    avisos.forEach(function (a) { caixa.appendChild(h('div', { class: 'av' }, [ico('aviso'), h('span', { text: a })])); });
    return caixa;
  }
  function bi(rotulo, icone, fn, titulo, soIcone) {
    var b = h('button', { type: 'button', class: 'bi' + (soIcone ? ' so' : ''), title: titulo || rotulo, 'aria-label': titulo || rotulo, on: { click: fn } }, [ico(icone), h('span', { class: 'bl', text: rotulo })]);
    return b;
  }
  function acoes(x, r) {
    var ac = h('div', { class: 'ac ar', role: 'group', 'aria-label': 'Ações da resposta' });
    ac.appendChild(bi('Copiar', 'copiar', function (e) { copiar(r.texto || '', e.currentTarget); try { P.avaliar(r, 'copiou'); } catch (er) { /* segue */ } }, 'Copiar a resposta'));
    if (ENDPOINT && window.speechSynthesis) ac.appendChild(bi('Ouvir', 'ouvir', function () { falar(r.texto || '', 'tudo'); }, 'Ouvir a resposta', true));
    if (r.tipo === 'ia' || r.tipo === 'norma') {
      var bUtil, bNao, voto = function (v, esse, outro) {
        try { P.avaliar(r, v); } catch (e) { /* segue */ }
        esse.setAttribute('aria-pressed', 'true'); esse.classList.add('voto'); esse.disabled = true; outro.disabled = true; aviso('Anotado neste aparelho.');
      };
      bUtil = bi('Útil', 'util', function () { voto('bom', bUtil, bNao); }, 'Resposta útil', true); bUtil.setAttribute('aria-pressed', 'false');
      bNao = bi('Não útil', 'naoutil', function () { voto('ruim', bNao, bUtil); }, 'Resposta não útil', true); bNao.setAttribute('aria-pressed', 'false');
      ac.appendChild(bUtil); ac.appendChild(bNao);
      ac.appendChild(h('span', { class: 'sep', 'aria-hidden': 'true' }));
      if (ultimoPedido) { var perg = ultimoPedido; ac.appendChild(bi('Refazer', 'refazer', function () { enviar(perg); }, 'Perguntar de novo')); }
      ac.appendChild(bi('Mais curto', 'curto', function () { try { P.avaliar(r, 'mais_curto'); } catch (e) { /* segue */ } enviar('responda de forma mais curta'); }, 'Pedir uma resposta mais curta'));
      ac.appendChild(bi('Mais detalhe', 'longo', function () { try { P.avaliar(r, 'mais_detalhe'); } catch (e) { /* segue */ } enviar('explique com mais detalhe'); }, 'Pedir mais detalhe'));
    }
    x.m.appendChild(ac);
  }
  function baixarTexto(nome, conteudo, tipo) {
    var url = URL.createObjectURL(new Blob([conteudo], { type: tipo || 'text/plain;charset=utf-8' }));
    var a = h('a', { href: url, download: nome }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function desenhar(x, r) {
    var corpo = x.corpo;
    fimPensando(x);
    if (!x.streamed && !reduzido) { x.corpo.classList.add('rev'); setTimeout(function () { x.corpo.classList.remove('rev'); }, 700); }
    x.m.setAttribute('data-k', r.tipo || 'ia');
    var kk = x.m.querySelector('.mh .k'); if (kk) decod(kk, (KIND[r.tipo] || 'IA') + (LOCAL[r.tipo] && r.tipo !== 'busca' && r.tipo !== 'acao' ? ' · NO APARELHO' : ''), 420);
    legenda('');
    if (r.tipo === 'crise') x.m.classList.add('alerta');
    if (r.tipo === 'ia' || r.tipo === 'norma' || r.tipo === 'revisao' || r.tipo === 'espanhol' || r.tipo === 'ingles') pintar(corpo, r.texto);
    else corpo.textContent = r.texto || '';
    if (r.tipo === 'crise') {
      var ul = h('ul'); (r.telefones || []).forEach(function (t) { ul.appendChild(h('li', {}, [h('a', { href: 'tel:' + String(t.numero).replace(/\D/g, ''), text: t.numero }), ' ' + (t.nome || '')])); });
      corpo.appendChild(ul);
    }
    if (r.tipo === 'busca') {
      var lb = h('ul');
      (r.itens || []).forEach(function (it) {
        var li = h('li'); li.appendChild(h('strong', { text: it.titulo || '' }));
        if (it.detalhe) li.appendChild(document.createTextNode(' — ' + it.detalhe));
        lb.appendChild(li);
      });
      if ((r.itens || []).length) corpo.appendChild(lb);
    }
    var calcRepete = r.tipo === 'calculo' && r.itens && r.itens.length === 1 && (function (c) { var v = String(c.texto || c.valor || '').trim(); return v && String(r.texto || r.resposta || corpo.textContent || '').indexOf(v) !== -1; })(r.itens[0]);
    if (r.tipo === 'calculo' && r.itens && r.itens.length && !calcRepete) {
      var lc = h('ul'); r.itens.forEach(function (c) { lc.appendChild(h('li', { text: c.texto || (c.expressao + ' = ' + c.valor) })); }); corpo.appendChild(lc);
    }
    if (r.tipo === 'rota') {
      var pm = pontosDoMapa(r);
      if (pm.pontos.length) mapaRota(x, { pontos: pm.pontos, linha: pm.linha, modo: r.modo || '', svg: r.svg });
      else esquemaSvg(x, r.svg);
      if (r.destino && r.destino.nome) x.m.appendChild(cartaoDestino(r));
      var ac2 = h('div', { class: 'ac' });
      (r.links || []).forEach(function (l, i) {
        var url = typeof l === 'string' ? l : l.url, rot = typeof l === 'string' ? 'Abrir no mapa ' + (i + 1) : (l.rotulo || 'Abrir no mapa');
        if (url && /^https:\/\//.test(url)) ac2.appendChild(h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: rot }));
      });
      if (r.gpx) ac2.appendChild(btn('GPX', function () { baixarTexto('rota.gpx', r.gpx, 'application/gpx+xml'); }));
      if (r.kml) ac2.appendChild(btn('KML', function () { baixarTexto('rota.kml', r.kml, 'application/vnd.google-earth.kml+xml'); }));
      if (ac2.childNodes.length) x.m.appendChild(ac2);
    }
    if (r.tipo === 'modelo') {
      var am = h('div', { class: 'ac' });
      (r.arquivos || []).forEach(function (a) {
        am.appendChild(btn('⤓ Baixar ' + (a.rotulo || a.nome), function () { P.modelos.baixar(r.modelo).then(function (ok) { aviso(ok ? 'Modelo baixado.' : 'Abri o modelo em outra aba.'); }); }));
        if (a.url && !/^[a-z]+:/i.test(a.url)) am.appendChild(h('a', { href: a.url, target: '_blank', rel: 'noopener noreferrer', text: 'Abrir agora' }));
      });
      if (am.childNodes.length) x.m.appendChild(am);
    }
    if (r.tipo === 'pdf') {
      var ap = h('div', { class: 'ac' });
      (r.arquivos || []).forEach(function (a) { ap.appendChild(btn('⤓ ' + a.nome + (a.paginas ? ' (' + a.paginas + ' pág.)' : ''), function () { P.pdf.baixar(a); })); });
      if (r.precisaArquivo) ap.appendChild(btn('📎 Anexar PDF', function () { $('fi').click(); }));
      if (ap.childNodes.length) x.m.appendChild(ap);
    }
    if (r.tipo === 'acao' && r.pedeConfirmacao) {
      x.m.appendChild(h('div', { class: 'ac' }, [btn('Confirmar', function () { r.confirmar(); aviso('Feito.'); }), btn('Cancelar', function () { aviso('Cancelado.'); })]));
    }
    if (r.tipo === 'acao_desconhecida' && r.opcoesAcoes && r.opcoesAcoes.length) {
      var ao = h('div', { class: 'ac' }); r.opcoesAcoes.forEach(function (o) { ao.appendChild(btn(o.rotulo, function () { r.aprender(o.id); aviso('Aprendi.'); })); }); x.m.appendChild(ao);
    }
    if (r.tipo !== 'bloqueio' && r.tipo !== 'erro') acoes(x, r);
    var rp = rodape(r); if (rp) x.m.appendChild(rp);
    if (r.habilidades && r.habilidades.length) x.m.appendChild(h('div', { class: 'f', text: 'Habilidades usadas: ' + r.habilidades.join(', ') }));
    if (r.sugestoes && r.sugestoes.length) {
      var sg = h('div', { class: 'sug', role: 'group', 'aria-label': 'Continuar a conversa' }, [h('span', { class: 'sgl', text: 'Continuar' })]);
      r.sugestoes.slice(0, 3).forEach(function (s) { sg.appendChild(h('button', { type: 'button', class: 'sgb', on: { click: function () { enviar(s); } } }, [ico('seta'), h('span', { text: s })])); }); x.m.appendChild(sg);
    }
  }

  // ------------------------------------------------------------ mapa (Leaflet + OpenStreetMap, carregado só quando há mapa)
  // Fundo: tiles do OpenStreetMap (a área vista é pedida ao servidor de tiles). A linha é reta (estimativa); "Pelas ruas" é opcional.
  var BV = [2.8235, -60.6758], ASK_RUAS = false;
  // Cartão de destino estilo HUD: "quero ir a X". Tudo montado com createElement (sem innerHTML); o link só abre se for https.
  function cartaoDestino(r) {
    var d = r.destino, NS = 'http://www.w3.org/2000/svg';
    var modos = { carro: 'CARRO', moto: 'MOTO', bicicleta: 'BICICLETA', pe: 'A PÉ' };
    var url = ''; (r.links || []).forEach(function (l) { var u = typeof l === 'string' ? l : l.url; if (!url && u && /^https:\/\//.test(u)) url = u; });
    var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 220 54'); svg.setAttribute('class', 'dsvg'); svg.setAttribute('aria-hidden', 'true');
    var mk = function (tag, at) { var e = document.createElementNS(NS, tag); Object.keys(at).forEach(function (k) { e.setAttribute(k, at[k]); }); svg.appendChild(e); return e; };
    mk('path', { d: 'M12 40 C 60 40, 70 12, 110 22 S 170 40, 198 18', class: 'dlinha' });
    mk('circle', { cx: 12, cy: 40, r: 4, class: 'dorig' });
    mk('circle', { cx: 198, cy: 18, r: 9, class: 'dret' }); mk('circle', { cx: 198, cy: 18, r: 3, class: 'dalvo' });
    mk('path', { d: 'M198 5v6M198 25v6M185 18h6M205 18h6', class: 'dret2' });
    var card = h('div', { class: 'destino' }, [
      h('div', { class: 'dtag', text: 'DESTINO' + (d.noDiretorio ? ' · NO DIRETÓRIO' : ' · PELO TEXTO') }),
      h('div', { class: 'dnome', text: d.nome }),
      d.endereco ? h('div', { class: 'dend', text: d.endereco }) : null,
      svg,
      h('div', { class: 'dchips' }, [h('span', { text: 'MODO ' + (modos[r.modo] || 'CARRO') }), h('span', { text: 'SAÍDA · SUA POSIÇÃO' }), h('span', { text: 'MAPA · PASSO A PASSO' })])
    ]);
    if (url) card.appendChild(h('a', { class: 'dgo', href: url, target: '_blank', rel: 'noopener noreferrer', text: '▶ INICIAR NAVEGAÇÃO' }));
    return card;
  }

  function esquemaSvg(x, svg) {
    if (!svg) return;
    var img = h('img', { alt: 'Desenho da rota', src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) });
    img.style.cssText = 'max-width:100%;background:#fff;border-radius:8px;margin-top:6px'; x.m.appendChild(img);
  }
  function pontosDoMapa(r) {
    var fs = (r.geojson && r.geojson.features) || [], pontos = [], linha = [];
    fs.forEach(function (f) {
      if (!f || !f.geometry) return;
      var c = f.geometry.coordinates;
      if (f.geometry.type === 'Point' && c && isFinite(c[0]) && isFinite(c[1])) pontos.push({ nome: String((f.properties && f.properties.nome) || ''), lat: c[1], lng: c[0] });
      else if (f.geometry.type === 'LineString' && c) c.forEach(function (p) { if (isFinite(p[0]) && isFinite(p[1])) linha.push([p[1], p[0]]); });
    });
    if (!linha.length) linha = pontos.map(function (p) { return [p.lat, p.lng]; });
    return { pontos: pontos, linha: linha };
  }
  var leafletPronto = null;
  function carregarLeaflet() {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (!leafletPronto) leafletPronto = new Promise(function (ok, no) {
      var sc = document.createElement('script'); sc.src = 'leaflet.js';
      sc.onload = function () { if (window.L && window.L.map) ok(window.L); else { leafletPronto = null; no(new Error('leaflet')); } };
      sc.onerror = function () { leafletPronto = null; no(new Error('leaflet')); };
      document.head.appendChild(sc);
    });
    return leafletPronto;
  }
  function kmTxt(m) { return (m / 1000).toFixed(1).replace('.', ',') + ' km'; }
  function mapaRota(x, o) {
    var area = h('div', { class: 'mapa', role: 'region', 'aria-label': 'Mapa' }), leg = h('div', { class: 'mleg', role: 'status' });
    var ac = h('div', { class: 'ac' });
    x.m.appendChild(area); x.m.appendChild(leg); x.m.appendChild(ac);
    leg.textContent = 'CARREGANDO MAPA…';
    carregarLeaflet().then(function (L) {
      if (!area.isConnected) return;
      var temLinha = o.linha.length > 1, linhaL = null, euL = null;
      var map = L.map(area, { scrollWheelZoom: false, zoomSnap: 0.5, attributionControl: true }).setView(BV, 13);
      var tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>' });
      var semFundo = false;
      tiles.on('tileerror', function () { if (!semFundo) { semFundo = true; leg.textContent = 'MAPA DE FUNDO INDISPONÍVEL (SEM INTERNET): MOSTRANDO SÓ AS PARADAS.'; } });
      tiles.addTo(map);
      if (temLinha) linhaL = L.polyline(o.linha, { color: '#37e6ff', weight: 3, opacity: 0.9, dashArray: '6 8' }).addTo(map);
      o.pontos.forEach(function (p, i) {
        var ic = L.divIcon({ className: '', html: h('div', { class: 'pin' + (i === 0 ? ' s' : ''), text: String(i + 1) }), iconSize: [26, 26], iconAnchor: [13, 13] });
        L.marker([p.lat, p.lng], { icon: ic, keyboard: false }).addTo(map).bindTooltip(h('span', { text: p.nome + (i === 0 ? ' (saída)' : '') }), { direction: 'top', offset: [0, -12] });
      });
      function ajustar() {
        if (o.linha.length > 1) map.fitBounds(L.latLngBounds(o.linha).pad(0.2), { maxZoom: 16 });
        else if (o.pontos.length === 1) map.setView([o.pontos[0].lat, o.pontos[0].lng], 15);
        else map.setView(BV, 13);
      }
      ajustar();
      if (typeof ResizeObserver !== 'undefined') { try { new ResizeObserver(function () { map.invalidateSize(); }).observe(area); } catch (e) { /* segue */ } }
      leg.textContent = '';
      if (temLinha) leg.appendChild(document.createTextNode('Linha reta entre as paradas (estimativa). '));
      else leg.appendChild(document.createTextNode('Boa Vista (RR). '));
      var nota = h('span', { text: '' }); leg.appendChild(nota);
      if (temLinha) ac.appendChild(btn('Ajustar', ajustar, 'Enquadrar a rota inteira'));
      if (temLinha) ac.appendChild(btn('Pelas ruas', function (e) { pelasRuas(e.target); }, 'Traçar pelas ruas (usa um servidor externo do OpenStreetMap)'));
      ac.appendChild(btn('Onde estou', function () {
        aviso('Obtendo sua posição…');
        obterPosicao().then(function (p) {
          if (!p) { aviso('Não consegui a sua posição. Permita a localização no navegador.'); return; }
          if (euL) map.removeLayer(euL);
          euL = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: h('div', { class: 'pin eu', text: 'EU' }), iconSize: [26, 26], iconAnchor: [13, 13] }), keyboard: false }).addTo(map);
          map.setView([p.lat, p.lng], Math.max(map.getZoom(), 15));
        });
      }, 'Mostrar a minha posição no mapa'));
      function pelasRuas(b) {
        if (!ASK_RUAS) {
          if (!confirm('Para traçar pelas ruas, as coordenadas das paradas (inclusive a sua posição, se for a saída) serão enviadas ao servidor de rotas do OpenStreetMap (routing.openstreetmap.de). Continuar?')) return;
          ASK_RUAS = true;
        }
        var perfil = o.modo === 'bicicleta' ? 'routed-bike' : o.modo === 'pe' ? 'routed-foot' : 'routed-car';
        if (o.linha.length > 25) { aviso('Rota longa demais para traçar pelas ruas.'); return; }
        var coords = o.linha.map(function (c) { return c[1].toFixed(5) + ',' + c[0].toFixed(5); }).join(';');
        b.disabled = true; nota.textContent = 'Traçando pelas ruas…';
        fetch('https://routing.openstreetmap.de/' + perfil + '/route/v1/driving/' + coords + '?overview=full&geometries=geojson', { credentials: 'omit' })
          .then(function (rs) { return rs.ok ? rs.json() : Promise.reject(new Error('http')); })
          .then(function (j) {
            var rt = j && j.code === 'Ok' && j.routes && j.routes[0];
            if (!rt || !rt.geometry || !rt.geometry.coordinates || !rt.geometry.coordinates.length) throw new Error('vazio');
            linhaL.setLatLngs(rt.geometry.coordinates.map(function (c) { return [c[1], c[0]]; })); linhaL.setStyle({ dashArray: null, weight: 4 });
            map.fitBounds(linhaL.getBounds().pad(0.15), { maxZoom: 17 });
            leg.textContent = ''; leg.appendChild(h('span', {}, ['Pelas ruas: ', h('b', { text: kmTxt(rt.distance) + ' · ' + Math.max(1, Math.round(rt.duration / 60)) + ' min' }), ' (rotas do OpenStreetMap, sem trânsito).']));
          })
          .catch(function () { b.disabled = false; nota.textContent = 'Não consegui traçar pelas ruas agora; mantive a linha reta.'; });
      }
    }).catch(function () {
      if (area.isConnected) { area.remove(); leg.remove(); ac.remove(); esquemaSvg(x, o.svg); }
    });
  }
  function mostrarMapaBV() {
    var x = msgPaulus(); fimPensando(x);
    x.m.setAttribute('data-k', 'geo'); var kk = x.m.querySelector('.mh .k'); if (kk) decod(kk, 'MAPA · NO APARELHO', 420);
    x.corpo.textContent = 'Mapa de Boa Vista (RR). Toque em “Onde estou” para ver a sua posição. Para uma rota, peça: traçar rota saindo daqui: CAPS II e CRAS Cauamé.';
    mapaRota(x, { pontos: [], linha: [], modo: '' });
    transcricao.push({ papel: 'Paulus', texto: '[mapa de Boa Vista]' }); rolar(true);
  }
  function pedidoDeMapa(t) {
    var a = semAcento(t);
    return /\bmapa\b/.test(a) && /boa vista/.test(a) && !/(rota|trajeto|como chegar|distancia|perto|coordenad|bairro|\bkm\b|endereco)/.test(a);
  }

  // ------------------------------------------------------------ envio
  function mudarBotao(enviando) {
    go.textContent = enviando ? 'Parar' : 'Enviar'; go.classList.toggle('stop', enviando);
    log.setAttribute('aria-busy', enviando ? 'true' : 'false');
    ocupado = enviando; estadoUI(enviando ? 'busy' : (gravando ? 'listen' : 'idle'));
  }
  // Respostas que não vieram em fluxo (norma, revisão, idioma, memória) também "são digitadas", em ~1 s.
  var TIPA = { ia: 1, norma: 1, revisao: 1, espanhol: 1, ingles: 1 };
  function digitar(x, texto, vivo) {
    return new Promise(function (resolve) {
      var i = 0, passo = Math.max(4, Math.ceil(texto.length / 50));
      x.corpo.classList.add('dig');
      (function f() {
        if (!vivo() || !x.m.isConnected) { resolve(); return; }
        i = Math.min(texto.length, i + passo);
        pintar(x.corpo, texto.slice(0, i), i < texto.length); rolar();
        if (i >= texto.length) { resolve(); return; }
        setTimeout(f, 22);
      })();
    });
  }
  // ------------------------------------------------------------ anotações (lista de compras no Firebase; não passa pela IA)
  var N = window.PaulusNotas, modoNota = false;
  function notasEnviar(texto) {
    var cmd = N && N.interpretar(texto, { modoNota: modoNota }); modoNota = false;
    if (!cmd) return false;
    var x = msgPaulus(); x.m.setAttribute('data-k', 'notas'); var kk = x.m.querySelector('.mh .k'); if (kk) kk.textContent = 'ANOTAÇÕES';
    x.corpo.textContent = '…'; estadoUI('busy');
    N.executar(cmd).then(function (t) { return t; }, function (e) { x.m.setAttribute('data-k', 'erro'); return (e && e.message) || 'Não consegui acessar as anotações.'; }).then(function (t) {
      estadoUI('idle'); pintar(x.corpo, t); transcricao.push({ papel: 'Paulus', texto: t }); if (vozLigada) falar(t, 'resumo'); rolar(true);
    });
    return true;
  }
  function enviar(texto) {
    texto = String(texto == null ? q.value : texto).trim();
    if (ocupado || (!texto && !anexos.length)) return;
    var DI = window.PaulusDocs, soFoto = !!(DI && DI.ehImagem && anexos.length && anexos.every(DI.ehImagem));
    if (!texto) texto = soFoto ? 'Descreva esta imagem e diga o que nela é útil para o meu trabalho.' : 'o que posso fazer com este arquivo?';
    var arqs = anexos.slice(), nomes = arqs.map(function (a) { return a.name; });
    anexos = []; renderAnexos(); q.value = ''; autoAltura(); sl.hidden = true; if (pv) pv.textContent = '';
    if (vozPendente) legenda(texto, false); else legenda('');
    msgUsuario(texto, nomes);
    if (!arqs.length && pedidoDeMapa(texto)) { vozPendente = false; mostrarMapaBV(); return; }
    if (!arqs.length && notasEnviar(texto)) return;
    if (!arqs.length && cota.ehPergunta(texto)) { vozPendente = false; cota.responder(); return; }
    var x = msgPaulus(); pensando(x); x.t0 = performance.now(); if (nucleo) nucleo.impulso(); bip(520, 880, 0.12, 0.045);
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* sem vibração */ }
    ultimoPedido = texto;
    var id = ++envioAtual; atual = x; mudarBotao(true);
    var vivo = function () { return id === envioAtual; };   // falso depois de Parar ou de um envio mais novo
    var D = window.PaulusDocs, fotos = (D && D.ehImagem) ? arqs.filter(D.ehImagem) : [];
    var pedidoPdf = P.pdf && P.pdf.ler && P.pdf.ler(texto, { temArquivo: arqs.length > 0 });
    // Só fotos e "leia", "resuma" ou "OCR": o editor de PDF responderia "não faço OCR", mas aqui é pedido de leitura da foto (vai para a IA).
    var soLeitura = fotos.length > 0 && fotos.length === arqs.length && !!pedidoPdf && !(pedidoPdf.operacoes || []).length && !pedidoPdf.saida && (pedidoPdf.naoSuporta || []).every(function (c) { return c === 'ocr'; });
    var querPdf = !!pedidoPdf && !soLeitura;
    var docArqs = fotos.length ? arqs.filter(function (a) { return fotos.indexOf(a) < 0; }) : arqs;
    if (!querPdf && fotos.length > 1) aviso('Leio uma foto por pergunta: usei só a primeira (' + fotos[0].name + ').');
    var leitura = (!querPdf && docArqs.length && D) ? D.ler(docArqs) : Promise.resolve(null);
    var leituraFoto = (!querPdf && fotos.length && D && D.imagem) ? D.imagem(fotos[0]) : Promise.resolve(null);
    Promise.all([leitura, leituraFoto]).then(function (par) {
      var d = par[0], foto = par[1];
      if (d && d.erro) return { tipo: 'erro', texto: d.erro, fontes: [], avisos: [] };
      if (foto && foto.erro) return { tipo: 'erro', texto: foto.erro, fontes: [], avisos: [] };
      if (d && d.texto) { docAtivo = d; renderAnexos(); }
      return P.perguntar(texto, {
      arquivos: querPdf ? arqs : docArqs, documento: querPdf ? null : docAtivo, imagem: foto && foto.dados ? foto : undefined,
      onToken: function (_p, tudo) { if (!vivo()) return; fimPensando(x); legenda(''); x.streamed = true; x.corpo.classList.add('dig'); pintar(x.corpo, tudo, true); rolar(); }
    }); }).then(function (r) {
      if (!vivo()) return;
      // Foto lida: o texto que o Paulus tirou dela fica "em uso" e as próximas perguntas seguem como documento anexado (a foto não sobe de novo).
      if (r && r.imagemLida && r.imagemLida.texto) { docAtivo = { nome: r.imagemLida.nome, texto: r.imagemLida.texto }; renderAnexos(); }
      var ms = performance.now() - x.t0, tipar = !x.streamed && !reduzido && TIPA[r.tipo] && String(r.texto || '').length > 60;
      if (tipar) { fimPensando(x); legenda(''); x.streamed = true; }
      return (tipar ? digitar(x, String(r.texto), vivo) : Promise.resolve()).then(function () {
        if (!vivo()) return;
        x.corpo.classList.remove('dig'); x.corpo.textContent = ''; desenhar(x, r);
        transcricao.push({ papel: 'Paulus', texto: r.texto || '' });
        registrar(r, ms);
        var ot = x.m.querySelector('.mh .o'); if (ot) ot.textContent = hora2() + ' · ' + tempoTxt(ms);
        if (r.tipo === 'erro') bip(320, 140, 0.26, 0.05); else { bip(880, 1320, 0.14, 0.04); setTimeout(function () { bip(1320, 1760, 0.1, 0.025); }, 110); }
        if (vozLigada) falar(r.texto || '', 'resumo');
        rolar(true);
        if (r.tipo === 'erro') { estadoUI('erro'); setTimeout(function () { if (estadoAtual === 'erro') estadoUI('idle'); }, 1400); }
      });
    }).catch(function () {
      if (vivo()) { fimPensando(x); x.corpo.classList.remove('dig'); x.m.setAttribute('data-k', 'erro'); var k2 = x.m.querySelector('.mh .k'); if (k2) k2.textContent = KIND.erro; x.corpo.textContent = 'Algo deu errado. Tente de novo.'; estadoUI('erro'); setTimeout(function () { if (estadoAtual === 'erro') estadoUI('idle'); }, 1400); }
    }).then(function () { if (vivo()) { atual = null; if (estadoAtual !== 'erro') mudarBotao(false); else { go.textContent = 'Enviar'; go.classList.remove('stop'); ocupado = false; } } });
  }
  function parar() {
    envioAtual++;                                   // a chamada em andamento passa a ser ignorada
    if (atual) { fimPensando(atual); atual.m.remove(); atual = null; }
    legenda(''); mudarBotao(false); aviso('Interrompido.');
  }

  // ------------------------------------------------------------ anexos
  function renderAnexos() {
    fl.textContent = '';
    anexos.forEach(function (a, i) {
      var foto = window.PaulusDocs && window.PaulusDocs.ehImagem && window.PaulusDocs.ehImagem(a);
      fl.appendChild(h('div', foto ? { class: 'fc', title: 'A foto é reduzida neste aparelho e enviada à IA para ser lida; não é gravada.' } : { class: 'fc' }, [h('span', { text: foto ? '🖼 ' + a.name + ' · vai para a IA' : a.name }), h('button', { type: 'button', text: '✕', 'aria-label': 'Remover ' + a.name, on: { click: function () { anexos.splice(i, 1); renderAnexos(); } } })]));
    });
    if (docAtivo) fl.appendChild(h('div', { class: 'fc doc' }, [h('span', { text: 'Em uso: ' + docAtivo.nome }), h('button', { type: 'button', text: '✕', 'aria-label': 'Parar de usar o documento ' + docAtivo.nome, on: { click: function () { docAtivo = null; renderAnexos(); } } })]));
    ajustarBarra();
  }
  function adicionar(lista) {
    Array.prototype.forEach.call(lista || [], function (f) {
      if (/pdf|png|jpe?g|webp/i.test(f.type) || /\.(pdf|png|jpe?g|webp)$/i.test(f.name) || (window.PaulusDocs && window.PaulusDocs.legivel(f))) {
        if (f.size > 30 * 1024 * 1024) { aviso(f.name + ': maior que 30 MB.'); return; }
        if (anexos.length < 10) anexos.push(f);
        if (window.PaulusDocs && window.PaulusDocs.ehImagem && window.PaulusDocs.ehImagem(f)) aviso('A foto vai para a IA ler. Não anexe imagem com rosto, nome ou documento de pessoa atendida.');
      } else aviso(f.name + ': só PDF, DOCX, TXT, MD, CSV, PNG, JPG ou WebP.');
    });
    renderAnexos();
  }

  // ------------------------------------------------------------ voz
  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition, rec = null, gravando = false;
  var mic = $('mic');
  if (!Rec) { mic.hidden = true; }
  var modoVoz = false, jv = $('jv');
  function ouvir() {
    if (!Rec || gravando || ocupado) return;
    rec = new Rec(); rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = false;
    var base = q.value ? q.value + ' ' : '', negado = false;
    rec.onresult = function (e) { var tx = ''; for (var i = 0; i < e.results.length; i++) tx += e.results[i][0].transcript; q.value = base + tx; autoAltura(); legenda(q.value, true); if (nucleo) nucleo.impulso(); };
    rec.onend = function () {
      gravando = false; mic.classList.remove('on'); if (!ocupado) estadoUI('idle'); if (!modoVoz) legenda('');
      if (!modoVoz || negado) { if (negado && modoVoz) alternarModoVoz(false); return; }
      if (q.value.trim()) { vozPendente = true; enviar(); } else { legenda(''); setTimeout(function () { if (modoVoz && !ocupado && !gravando) ouvir(); }, 700); }   // não ouviu nada: escuta de novo
    };
    rec.onerror = function (e) {
      if (e && (e.error === 'not-allowed' || e.error === 'service-not-allowed')) { negado = true; aviso('Não consegui ouvir. Confira a permissão do microfone.'); }
      else if (!modoVoz) aviso('Não consegui ouvir. Confira a permissão do microfone.');
    };
    try { rec.start(); gravando = true; mic.classList.add('on'); estadoUI('listen'); } catch (e) { /* segue */ }
  }
  mic.addEventListener('click', function () { if (!Rec) return; if (gravando && rec) { rec.stop(); return; } ouvir(); });
  // Modo voz: ouve, envia, fala a resposta e volta a ouvir, sem tocar na tela (conversa estilo Jarvis).
  function alternarModoVoz(ligar) {
    modoVoz = typeof ligar === 'boolean' ? ligar : !modoVoz;
    if (jv) { jv.classList.toggle('on', modoVoz); jv.setAttribute('aria-pressed', String(modoVoz)); }
    document.body.classList.toggle('modo-voz', modoVoz);
    if (modoVoz) {
      if (!vozLigada) vz.click();
      aviso('Modo voz ligado: fale, eu respondo.'); ouvir();
    } else {
      if (gravando && rec) { try { rec.stop(); } catch (e) { /* segue */ } }
      pararFala();
      if (vozLigada) vz.click();
      aviso('Modo voz desligado.');
    }
  }
  if (jv) { if (!Rec || !window.speechSynthesis) jv.hidden = true; else jv.addEventListener('click', function () { alternarModoVoz(); }); }
  // Fala: tenta a voz própria do Paulus (rota /voz do Worker, voz clonada); sem ela, usa a voz do navegador.
  var audioAtual = null, urlAudio = '', pulso = 0, abortaVoz = null, falaId = 0;
  function pararFala() {
    falaId++;
    if (abortaVoz) { try { abortaVoz.abort(); } catch (e) { /* segue */ } abortaVoz = null; }
    if (pulso) { clearInterval(pulso); pulso = 0; }
    if (audioAtual) { try { audioAtual.pause(); } catch (e) { /* segue */ } audioAtual = null; }
    if (urlAudio) { URL.revokeObjectURL(urlAudio); urlAudio = ''; }
    if (window.speechSynthesis) speechSynthesis.cancel();
  }
  function fimDaFala() {
    if (estadoAtual === 'speak') estadoUI(ocupado ? 'busy' : 'idle');
    if (modoVoz && !ocupado) setTimeout(function () { if (modoVoz && !ocupado && !gravando) ouvir(); }, 450);
  }
  // Fala em trechos curtos (a voz começa logo e o navegador não corta falas longas). Cada trecho só continua se a fala ainda for a mesma (id).
  function falarNoNavegador(trechos, id, desde) {
    var resto = trechos.slice(desde || 0);
    if (!window.speechSynthesis || !resto.length) { fimDaFala(); return; }
    // Um trecho por vez: cada um leva seu tom, seu ritmo e a pausa depois dele (pergunta sobe o tom, aviso vai mais devagar).
    (function proximo(k) {
      if (id !== falaId) return;
      if (k >= resto.length) { fimDaFala(); return; }
      var tr = resto[k], u = new SpeechSynthesisUtterance(tr.t); u.lang = 'pt-BR'; ajustarFala(u, tr);
      u.onboundary = function () { if (id === falaId && nucleo) nucleo.impulso(); };
      if (k === 0) u.onstart = function () { if (id === falaId && !ocupado && !gravando) estadoUI('speak'); };
      u.onend = function () { if (id !== falaId) return; if (tr.pausa && k + 1 < resto.length) setTimeout(function () { proximo(k + 1); }, tr.pausa); else proximo(k + 1); };
      u.onerror = function () { if (id === falaId) { pararFala(); fimDaFala(); } };
      speechSynthesis.speak(u);
    })(0);
  }
  // Voz própria (servidor): pede o trecho seguinte enquanto o atual toca, para não haver pausa entre eles.
  function falarDoServidor(trechos, id, i, pronto) {
    var sinal = abortaVoz ? abortaVoz.signal : undefined;
    var recuar = function () {                         // servidor ou áudio falhou: o resto sai com a voz do navegador
      if (pulso) { clearInterval(pulso); pulso = 0; }
      if (audioAtual) { try { audioAtual.pause(); } catch (e) { /* segue */ } audioAtual = null; }
      falarNoNavegador(trechos, id, i);
    };
    (pronto || P.voz(trechos[i].t, sinal)).then(function (blob) {
      if (id !== falaId) return;                       // outra fala começou (ou foi cancelada) enquanto o áudio vinha
      if (!blob) { recuar(); return; }
      var seguinte = i + 1 < trechos.length ? P.voz(trechos[i + 1].t, sinal) : null;
      if (urlAudio) URL.revokeObjectURL(urlAudio);
      urlAudio = URL.createObjectURL(blob);
      var a = new Audio(urlAudio); audioAtual = a;
      a.onplay = function () { if (id !== falaId) return; if (!ocupado && !gravando) estadoUI('speak'); if (!pulso) pulso = setInterval(function () { if (nucleo) nucleo.impulso(); }, 220); };
      a.onended = function () {
        if (id !== falaId) return;
        if (seguinte) setTimeout(function () { if (id === falaId) falarDoServidor(trechos, id, i + 1, seguinte); }, Math.min(trechos[i].pausa || 0, 250)); else { pararFala(); fimDaFala(); }
      };
      a.onerror = function () { if (id === falaId) recuar(); };
      a.play().catch(function () { if (id === falaId) recuar(); });
    });
  }
  // modo 'resumo' (leitura automática): respostas longas viram as primeiras frases + "O restante está na tela."; 'tudo' (botão Ouvir) lê inteira.
  function falar(t, modo) {
    pararFala();
    var id = falaId, F = P.fala, bruto = String(t == null ? '' : t), trechos;
    if (F && F.trechos) trechos = F.trechos(modo === 'resumo' ? F.resumir(bruto, { dicionario: vozDic }) : F.texto(bruto, { dicionario: vozDic }));
    else if (F) trechos = F.dividir(modo === 'resumo' ? F.resumir(bruto) : F.texto(bruto)).map(function (x) { return { t: x, tom: 1, taxa: 1, pausa: 0 }; });
    else { var limpo = bruto.replace(/[*_`#>|]/g, '').slice(0, 1500).trim(); trechos = limpo ? [{ t: limpo, tom: 1, taxa: 1, pausa: 0 }] : []; }
    if (!trechos.length) { fimDaFala(); return; }
    if (!ENDPOINT || typeof P.voz !== 'function') { falarNoNavegador(trechos, id); return; }
    abortaVoz = typeof AbortController === 'function' ? new AbortController() : null;
    falarDoServidor(trechos, id, 0);
  }
  // ---- Voz do navegador: escolhe sozinha a melhor voz masculina em português do Brasil e deixa trocar, com velocidade e tom.
  // O navegador não informa o gênero da voz; ele é deduzido pelo NOME (lista abaixo). Por isso há o seletor.
  var VOZ_M = /\b(antonio|ant[oô]nio|daniel|felipe|donato|jorge|ricardo|marcos|paulo|thiago|julio|j[uú]lio|eduardo|luiz|lucas|pedro|male|masculin\w*)\b/i;
  var VOZ_F = /\b(francisca|thalita|luciana|fernanda|maria|heloisa|helo[ií]sa|vit[oó]ria|camila|raquel|yara|leticia|let[ií]cia|brenda|giovanna|female|feminin\w*)\b/i;
  var vozPref = { nome: lerLS('paulus.voz.nome') || '', taxa: Number(lerLS('paulus.voz.taxa')) || 0.95, tom: Number(lerLS('paulus.voz.tom')) || 0.9 };
  function vozesPt() {
    if (!window.speechSynthesis) return [];
    var todas = speechSynthesis.getVoices() || [];
    var br = todas.filter(function (v) { return /^pt[-_]BR$/i.test(v.lang); });
    return br.length ? br : todas.filter(function (v) { return /^pt/i.test(v.lang); });
  }
  function notaDaVoz(v) {
    var n = (v.name || '') + ' ' + (v.voiceURI || ''), nota = 0;
    if (VOZ_M.test(n)) nota += 100;
    if (VOZ_F.test(n)) nota -= 100;
    if (/natural|neural|online/i.test(n)) nota += 30;
    if (/google/i.test(n)) nota += 5;
    if (/^pt[-_]BR$/i.test(v.lang)) nota += 3;
    return nota;
  }
  function melhorVoz() {
    var l = vozesPt().slice().sort(function (a, b) { return notaDaVoz(b) - notaDaVoz(a); });
    return l[0] || null;
  }
  function vozEscolhida() {
    var l = vozesPt();
    if (vozPref.nome) for (var i = 0; i < l.length; i++) if (l[i].name === vozPref.nome) return l[i];
    return melhorVoz();
  }
  function ajustarFala(u, aj) {
    var v = vozEscolhida();
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = Math.max(0.5, Math.min(2, vozPref.taxa * (aj && aj.taxa || 1)));
    u.pitch = Math.max(0, Math.min(2, vozPref.tom * (aj && aj.tom || 1)));
  }
  // Pronúncias que o Paulus aprendeu (palavra -> como se fala), guardadas só neste aparelho.
  var vozDic = {};
  try { vozDic = P.fala && P.fala.dicionario ? P.fala.dicionario(JSON.parse(lerLS('paulus.voz.dic') || '{}')) : {}; } catch (e) { vozDic = {}; }
  function salvarDic() { try { localStorage.setItem('paulus.voz.dic', JSON.stringify(vozDic)); } catch (e) { /* vale só nesta sessão */ } }
  var vp = null;
  function montarPainelVoz() {
    vp = document.createElement('div'); vp.id = 'vp'; vp.hidden = true; vp.setAttribute('role', 'dialog'); vp.setAttribute('aria-label', 'Voz do Paulus');
    function el(tag, txt, pai) { var e = document.createElement(tag); if (txt) e.textContent = txt; if (pai) pai.appendChild(e); return e; }
    el('h2', 'Voz do Paulus', vp);
    el('label', 'Voz', vp).htmlFor = 'vsel';
    var sel = el('select', '', vp); sel.id = 'vsel';
    var l1 = el('label', '', vp), t1 = el('span', 'Velocidade', l1), v1 = el('span', '', l1); l1.className = 'vl';
    var rt = el('input', '', vp); rt.type = 'range'; rt.min = '0.7'; rt.max = '1.3'; rt.step = '0.05'; rt.setAttribute('aria-label', 'Velocidade da voz');
    var l2 = el('label', '', vp), t2 = el('span', 'Tom (mais grave ou mais agudo)', l2), v2 = el('span', '', l2); l2.className = 'vl';
    var tm = el('input', '', vp); tm.type = 'range'; tm.min = '0.6'; tm.max = '1.3'; tm.step = '0.05'; tm.setAttribute('aria-label', 'Tom da voz');
    var bs = el('div', '', vp); bs.className = 'vb';
    var bt = el('button', 'TESTAR', bs), br = el('button', 'PADRÃO', bs); bt.type = br.type = 'button';
    el('h3', 'Ensinar a pronúncia', vp);
    var li = el('div', '', vp); li.className = 'vb';
    var pw = el('input', '', li); pw.type = 'text'; pw.placeholder = 'Palavra (ex.: Pacaraima)'; pw.maxLength = 40; pw.setAttribute('aria-label', 'Palavra que a voz erra');
    var pf = el('input', '', li); pf.type = 'text'; pf.placeholder = 'Como se fala (ex.: pacaraíma)'; pf.maxLength = 60; pf.setAttribute('aria-label', 'Como se fala');
    var bs2 = el('div', '', vp); bs2.className = 'vb';
    var be = el('button', 'ENSINAR E OUVIR', bs2); be.type = 'button';
    var lista = el('p', '', vp); lista.className = 'vn';
    function mostrarDic() { var k = Object.keys(vozDic); lista.textContent = k.length ? 'Aprendidas: ' + k.map(function (x) { return x + ' → ' + vozDic[x]; }).join(' · ') + '. Para esquecer, ensine a mesma palavra com o campo de fala vazio.' : 'Nenhuma pronúncia aprendida ainda.'; }
    be.addEventListener('click', function () {
      if (!P.fala || !P.fala.aprender || !pw.value.trim()) return;
      vozDic = P.fala.aprender(vozDic, pw.value, pf.value); salvarDic(); mostrarDic();
      if (pf.value.trim()) falarNoNavegadorTeste('Agora eu falo assim: ' + pw.value.trim() + '.');
      pw.value = ''; pf.value = '';
    });
    mostrarDic();
    el('p', 'O gênero da voz é deduzido pelo nome. Se a automática não soar bem, escolha outra na lista. Vozes "Natural" (Edge/Windows) são as mais realistas.', vp).className = 'vn';
    document.body.appendChild(vp);
    function preencher() {
      var l = vozesPt(), auto = melhorVoz(); sel.textContent = '';
      var o0 = el('option', 'Automática' + (auto ? ' (' + auto.name + ')' : ''), sel); o0.value = '';
      l.slice().sort(function (a, b) { return notaDaVoz(b) - notaDaVoz(a); }).forEach(function (v) { var o = el('option', v.name + ' · ' + v.lang, sel); o.value = v.name; });
      sel.value = vozPref.nome; if (sel.value !== vozPref.nome) sel.value = '';
      if (!l.length) { sel.textContent = ''; el('option', 'Nenhuma voz em português neste aparelho', sel).value = ''; }
    }
    function mostrar() { rt.value = vozPref.taxa; tm.value = vozPref.tom; v1.textContent = Number(vozPref.taxa).toFixed(2) + '×'; v2.textContent = Number(vozPref.tom).toFixed(2); }
    function salvar() { gravarLS('paulus.voz.nome', vozPref.nome); gravarLS('paulus.voz.taxa', String(vozPref.taxa)); gravarLS('paulus.voz.tom', String(vozPref.tom)); }
    sel.addEventListener('change', function () { vozPref.nome = sel.value; salvar(); });
    rt.addEventListener('input', function () { vozPref.taxa = Number(rt.value); mostrar(); salvar(); });
    tm.addEventListener('input', function () { vozPref.tom = Number(tm.value); mostrar(); salvar(); });
    bt.addEventListener('click', function () { falarNoNavegadorTeste('Olá! Eu sou o Paulus. Assim vou falar com você nas respostas.'); });
    br.addEventListener('click', function () { vozPref = { nome: '', taxa: 0.95, tom: 0.9 }; salvar(); preencher(); mostrar(); });
    if (window.speechSynthesis) speechSynthesis.addEventListener('voiceschanged', preencher);
    vp.__preencher = function () { preencher(); mostrar(); };
    vp.__preencher();
  }
  function falarNoNavegadorTeste(txt) {
    if (!window.speechSynthesis) return;
    pararFala();
    var u = new SpeechSynthesisUtterance(P.fala ? P.fala.texto(txt, { dicionario: vozDic }) : txt); u.lang = 'pt-BR'; ajustarFala(u); speechSynthesis.speak(u);
  }
  function painelVoz(abrir) {
    if (!vp) montarPainelVoz();
    var mostrar = typeof abrir === 'boolean' ? abrir : vp.hidden;
    if (mostrar) vp.__preencher();
    vp.hidden = !mostrar; var b = $('vc'); if (b) { b.setAttribute('aria-expanded', String(mostrar)); b.classList.toggle('on', mostrar); }
  }
  var vcb = $('vc');
  if (vcb) { if (!window.speechSynthesis) vcb.hidden = true; else vcb.addEventListener('click', function (e) { e.stopPropagation(); painelVoz(); }); }
  document.addEventListener('click', function (e) { if (vp && !vp.hidden && !vp.contains(e.target) && e.target !== vcb && !(vcb && vcb.contains(e.target))) painelVoz(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && vp && !vp.hidden) { painelVoz(false); if (vcb) vcb.focus(); } });

  var vz = $('vz');
  if (!window.speechSynthesis) vz.hidden = true;
  vz.addEventListener('click', function () {
    vozLigada = !vozLigada; vz.setAttribute('aria-pressed', String(vozLigada)); vz.classList.toggle('on', vozLigada);
    if (!vozLigada) pararFala();
    var kv = $('kv'); if (kv) { kv.textContent = vozLigada ? 'LIGADA' : 'DESLIGADA'; kv.className = vozLigada ? 'ok' : ''; }
  });

  // ------------------------------------------------------------ cabeçalho
  function nova() { docAtivo = null; renderAnexos();
    pararFala();
    P.limpar(); posicao = null; var kp0 = $('kp'); if (kp0) { kp0.textContent = 'NÃO USADA'; kp0.className = ''; } transcricao = []; anexos = []; nResp = 0; legenda(''); renderAnexos(); log.textContent = ''; boasVindas(); estadoUI('idle'); q.focus();
  }
  function exportar() {
    if (!transcricao.length) { aviso('Nada para salvar ainda.'); return; }
    var md = '# Conversa com o Paulus\n\n' + new Date().toLocaleString('pt-BR') + '\n\n' +
      transcricao.map(function (t) { return '**' + t.papel + ':**\n\n' + t.texto; }).join('\n\n---\n\n') + '\n';
    baixarTexto('conversa-paulus-' + new Date().toISOString().slice(0, 10) + '.md', md, 'text/markdown;charset=utf-8');
  }
  // ------------------------------------------------------------ ações do console (abrir apps, fechar, painéis)
  // "abrir o Argo", "abrir Anona e Toth", "fechar o aplicativo", "abrir as anotações" são resolvidos no aparelho, sem IA.
  (function () {
    if (!P.registrarAcao) return;
    var APPS = [
      { id: 'abrir-argo', t: 'Argo SUAS', r: ['argo', 'argo suas', 'app argo'], u: 'https://paulusxavier.github.io/Projeto-Argo-SUAS/index.html' },
      { id: 'abrir-anona', t: 'Anona', r: ['anona', 'bolsa familia app'], u: 'https://paulusxavier.github.io/Anona/index.html' },
      { id: 'abrir-toth', t: 'Caderno de Campo (Toth)', r: ['toth', 'caderno de campo', 'diario de campo'], u: 'https://paulusxavier.github.io/Toth/' },
      { id: 'abrir-umbrella', t: 'Umbrella (PAIF/PAF)', r: ['umbrella', 'umbrela', 'paif', 'paf'], u: 'https://paulusxavier.github.io/Projeto-Umbrela-PAIF/index.html' },
      { id: 'abrir-grafia', t: 'Grafia', r: ['grafia', 'bloco de notas'], u: 'https://paulusxavier.github.io/Grafia/index.html' },
      { id: 'abrir-verbus', t: 'Verbus', r: ['verbus', 'editor de texto'], u: 'https://paulusxavier.github.io/Verbus/' },
      { id: 'abrir-vita', t: 'Vita (site)', r: ['vita', 'site pessoal'], u: 'https://paulusxavier.github.io/Vita/' }
    ];
    APPS.forEach(function (a) {
      P.registrarAcao({ id: a.id, titulo: a.t, rotulos: a.r, executar: function () {
        var w = null; try { w = window.open(a.u, '_blank', 'noopener'); } catch (e) { w = null; }
        if (!w) aviso('O navegador bloqueou a nova aba. Libere pop-ups para este site e peça de novo.');
      } });
    });
    // Sistemas do trabalho: "abrir meus sistemas" abre todos de uma vez; "abrir sibec", "chama o sibec" ou "acessar cadunico e drive" abre só esses.
    // Só endereços de acesso (nenhum login ou senha passa pelo Paulus). O navegador pode bloquear várias abas de um comando: nesse caso avisa quantas.
    var SISTEMAS = [
      { id: 'sis-bvcidadao', t: 'BV Cidadão (Proton)', r: ['bv cidadao', 'bvcidadao', 'proton', 'bv'], u: 'https://bvcidadao.prefeitura.boavista.br/proton/login.asp' },
      { id: 'sis-portalcidadao', t: 'Portal do Cidadão', r: ['portal do cidadao', 'portal cidadao', 'portal da prefeitura'], u: 'https://portalcidadao.prefeitura.boavista.br/default.aspx' },
      { id: 'sis-cidadesocial', t: 'Cidade Social', r: ['cidade social', 'cidadesocial'], u: 'https://cidadesocial.pmbv.rr.gov.br/auth/login/' },
      { id: 'sis-sipweb', t: 'SIPWeb (trabalhador)', r: ['sipweb', 'sip web', 'sip'], u: 'http://sipweb.boavista.rr.gov.br:8080/sipweb/trabalhador/login/login.xhtml' },
      { id: 'sis-smt', t: 'SMT (chamados)', r: ['smt', 'chamados', 'chamado', 'suporte da prefeitura'], u: 'https://bt.pmbv.rr.gov.br/SMT73/open.do?sys=SMT' },
      { id: 'sis-cedulac', t: 'Cedulac', r: ['cedulac', 'cedula c'], u: 'http://servicos.boavista.rr.gov.br/cedulac/' },
      { id: 'sis-sibec', t: 'SIBEC (Caixa)', r: ['sibec', 'sibec caixa', 'beneficios sociais caixa', 'caixa'], u: 'https://beneficiossociais.caixa.gov.br/sibec2/sisgrSibec' },
      { id: 'sis-sigpbf', t: 'SIGPBF (MDS)', r: ['sigpbf', 'sigpbf mds', 'sistema do bolsa familia'], u: 'https://www.mds.gov.br/mds-sigpbf-web/carregarTelaLogin.jsf' },
      { id: 'sis-govbr', t: 'Acesso gov.br', r: ['gov br', 'acesso gov br', 'govbr', 'login gov'], u: 'https://sso.acesso.gov.br/login?client_id=portal-logado.estaleiro.serpro.gov.br&authorization_id=1a20df2fed9' },
      { id: 'sis-carteira-idosa', t: 'Carteira da Pessoa Idosa (Rede SUAS)', r: ['carteira da pessoa idosa', 'carteira do idoso', 'carteira idosa', 'carteira', 'rede suas', 'redesuas'], u: 'https://redesuas.mds.gov.br/carteiradapessoaidosa/' },
      { id: 'sis-cadunico', t: 'CadÚnico (Dataprev)', r: ['cadunico', 'cad unico', 'cadastro unico', 'cadunico dataprev', 'dataprev'], u: 'https://cadunico.dataprev.gov.br/portal/' },
      { id: 'sis-drive', t: 'Pasta no Google Drive', r: ['drive', 'google drive', 'minha pasta', 'pasta do drive'], u: 'https://drive.google.com/drive/folders/1nR7c8AsrhwWPyBYfmWkOmEIfyH349gXR' }
    ];
    function abrirAba(u) { var w = null; try { w = window.open(u, '_blank', 'noopener'); } catch (e) { w = null; } return !!w; }
    SISTEMAS.forEach(function (a) {
      P.registrarAcao({ id: a.id, titulo: a.t, rotulos: a.r, executar: function () {
        if (!abrirAba(a.u)) aviso('O navegador bloqueou a nova aba. Libere pop-ups para este site e peça de novo.');
      } });
    });
    P.registrarAcao({ id: 'sis-todos', titulo: 'Abrir todos os meus sistemas', rotulos: ['meus sistemas', 'todos os sistemas', 'todos os meus sistemas', 'sistemas', 'todos os sites', 'meus sites', 'sites do trabalho'], executar: function () {
      var barrados = 0;
      SISTEMAS.forEach(function (a) { if (!abrirAba(a.u)) barrados++; });
      if (barrados) aviso('O navegador bloqueou ' + barrados + ' de ' + SISTEMAS.length + ' abas. Libere pop-ups para este site (ícone na barra de endereço) e peça de novo.');
    } });
    // Painel "Meus sistemas": um botão por site (links comuns <a target=_blank>, que o navegador não bloqueia como pop-up),
    // mais "Abrir todos". Também por /sistemas, pelo botão do cabeçalho e por "lista de sistemas". Atalhos /sibec, /cadunico... abrem direto.
    var sxp = null;
    function painelSistemas(abrir) {
      var bx = $('sx');
      if (!sxp) {
        sxp = document.createElement('div'); sxp.id = 'sxp'; sxp.hidden = true; sxp.setAttribute('role', 'dialog'); sxp.setAttribute('aria-label', 'Meus sistemas');
        var t = document.createElement('h2'); t.textContent = 'Meus sistemas'; sxp.appendChild(t);
        var todos = document.createElement('button'); todos.type = 'button'; todos.className = 'sx-todos'; todos.textContent = 'Abrir todos (' + SISTEMAS.length + ')';
        todos.addEventListener('click', function () { var b = 0; SISTEMAS.forEach(function (a) { if (!abrirAba(a.u)) b++; }); if (b) aviso('O navegador bloqueou ' + b + ' de ' + SISTEMAS.length + ' abas. Libere pop-ups para este site ou use os botões um a um.'); });
        sxp.appendChild(todos);
        var lista = document.createElement('div'); lista.className = 'sx-lista'; sxp.appendChild(lista);
        SISTEMAS.forEach(function (a) {
          var l = document.createElement('a'); l.href = a.u; l.target = '_blank'; l.rel = 'noopener noreferrer'; l.textContent = a.t;
          var d = document.createElement('small'); d.textContent = 'ou diga: abrir ' + a.r[0]; l.appendChild(d);
          lista.appendChild(l);
        });
        var n = document.createElement('p'); n.className = 'vn'; n.textContent = 'Abre só a página de acesso. O login e a senha são digitados por você, no próprio site.'; sxp.appendChild(n);
        document.body.appendChild(sxp);
        document.addEventListener('click', function (e) { if (!sxp.hidden && !sxp.contains(e.target) && !(bx && bx.contains(e.target))) painelSistemas(false); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sxp.hidden) { painelSistemas(false); if (bx && bx.offsetParent) bx.focus(); } });
      }
      var mostrar = typeof abrir === 'boolean' ? abrir : sxp.hidden;
      sxp.hidden = !mostrar;
      if (bx) { bx.setAttribute('aria-expanded', String(mostrar)); bx.classList.toggle('on', mostrar); }
      if (mostrar) { var p1 = sxp.querySelector('.sx-todos'); if (p1) p1.focus(); }
    }
    (function () {
      var bx = $('sx'); if (bx) bx.addEventListener('click', function (e) { e.stopPropagation(); painelSistemas(); });
      ATALHOS.push({ c: '/sistemas', d: 'Painel com os meus sistemas (um toque abre)', f: function () { painelSistemas(true); } });
      SISTEMAS.forEach(function (a) { ATALHOS.push({ c: '/' + a.id.replace(/^sis-/, ''), d: 'Abrir ' + a.t, f: function () { if (!abrirAba(a.u)) aviso('O navegador bloqueou a nova aba. Libere pop-ups para este site e peça de novo.'); } }); });
      P.registrarAcao({ id: 'painel-sistemas', titulo: 'Painel dos meus sistemas', rotulos: ['lista de sistemas', 'painel de sistemas', 'painel dos sistemas', 'meus links', 'lista de sites', 'atalhos dos sites'], executar: function () { painelSistemas(true); } });
    })();
    P.registrarAcao({ id: 'fechar-app', fechar: true, titulo: 'Fechar o aplicativo', rotulos: ['aplicativo', 'app', 'console', 'o paulus', 'paulus', 'tudo', 'esta aba', 'essa aba', 'janela'], executar: function () {
      try { if (typeof pararFala === 'function') pararFala(); } catch (e) { /* segue */ }
      try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* segue */ }
      aviso('Fechando…');
      setTimeout(function () {
        try { window.close(); } catch (e) { /* o navegador decide */ }
        // abas comuns só fecham se foram abertas por script; o app instalado fecha
        setTimeout(function () { if (!document.hidden) aviso('O navegador não deixa fechar esta aba por comando. Feche pela aba ou pelo X da janela (no app instalado, isso funciona).'); }, 500);
      }, 350);
    } });
    function clicar(id) { return function () { var b = $(id); if (b) b.click(); }; }
    P.registrarAcao({ id: 'painel-notas', titulo: 'Anotações e compras', rotulos: ['anotacoes', 'anotações', 'notas', 'lista de compras', 'compras'], executar: clicar('nt') });
    P.registrarAcao({ id: 'painel-voz', titulo: 'Escolher a voz', rotulos: ['escolher a voz', 'voz do paulus', 'vozes'], executar: clicar('vc') });
    P.registrarAcao({ id: 'modo-voz', titulo: 'Modo voz', rotulos: ['modo voz', 'conversa por voz', 'conversa falada'], executar: clicar('jv') });
    P.registrarAcao({ id: 'modo-foco', titulo: 'Modo foco', rotulos: ['modo foco', 'foco'], executar: clicar('fo') });
    P.registrarAcao({ id: 'nova-conversa', titulo: 'Nova conversa', rotulos: ['nova conversa', 'conversa nova'], executar: clicar('nv') });
    P.registrarAcao({ id: 'salvar-conversa', titulo: 'Salvar a conversa', rotulos: ['salvar a conversa', 'exportar a conversa', 'baixar a conversa'], executar: clicar('ex') });
  })();

  // ------------------------------------------------------------ cota da IA (painel, trilho lateral e /cota)
  // Pergunta ao Worker (rota /cota) quanto da franquia diária do Workers AI já foi usada. A franquia é de 10.000 neurons por dia,
  // somados entre todos os modelos, e renova às 00:00 UTC (20:00 em Boa Vista). Vem só número agregado: nada de conversa nem de família.
  // O consumo exato depende de dois segredos no Worker (veja docs/DEPLOY.md); sem eles o painel mostra só a hora da renovação.
  var cota = (function () {
    var cqp = null, dados = null, falha = '', carregando = false, relogio = 0, ticks = 0;
    var fmt = function (n) { return Number(n || 0).toLocaleString('pt-BR'); };
    var hhmm = function (d) { return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
    function diaDe(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
    function duracao(ms) {
      var m = Math.max(0, Math.round(ms / 60000));
      if (m < 60) return m + ' min';
      var hr = Math.floor(m / 60), r = m % 60;
      return hr + ' h' + (r ? ' ' + r + ' min' : '');
    }
    // "hoje às 20:00", "amanhã às 20:00" ou "25/11 às 20:00", mais a contagem regressiva.
    function quando(iso) {
      var d = new Date(iso), agora = new Date(), dif = Math.round((diaDe(d) - diaDe(agora)) / 86400000);
      var rot = dif === 0 ? 'hoje' : dif === 1 ? 'amanhã' : ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2);
      return { txt: rot + ' às ' + hhmm(d), hora: hhmm(d), falta: 'em ' + duracao(d.getTime() - agora.getTime()) };
    }
    function classe(pct, esgotada) { return esgotada || pct >= 90 ? 'er' : pct >= 70 ? 'av' : 'ok'; }

    function token() {
      var S = window.PaulusSessao;
      if (!S || !S.token) return Promise.resolve('');
      try { return Promise.resolve(typeof S.token === 'function' ? S.token() : S.token).then(function (t) { return t || ''; }, function () { return ''; }); } catch (e) { return Promise.resolve(''); }
    }
    function buscar() {
      if (!ENDPOINT || !window.fetch) { falha = 'sem-ia'; pintarPainel(); trilho(); return Promise.resolve(); }
      if (carregando) return Promise.resolve();
      carregando = true; pintarPainel();
      return token().then(function (tk) {
        var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : 0;
        var cab = { 'Content-Type': 'application/json' }; if (tk) cab.Authorization = 'Bearer ' + tk;
        return fetch(ENDPOINT + '/cota', { method: 'POST', headers: cab, body: '{}', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctrl ? ctrl.signal : undefined })
          .then(function (r) {
            clearTimeout(timer);
            if (r.status === 401) { falha = 'sessao'; return null; }
            if (!r.ok) { falha = 'rede'; return null; }
            return r.json();
          }, function () { clearTimeout(timer); falha = 'rede'; return null; });
      }).then(function (j) {
        if (j && j.ok) { dados = j; falha = ''; } else if (!falha) falha = 'rede';
      }).catch(function () { falha = 'rede'; }).then(function () { carregando = false; pintarPainel(); trilho(); });
    }

    // Linhas do trilho lateral (tela larga): COTA IA e RENOVA.
    function trilho() {
      if (!dados) { pr('kq', falha ? 'INDISPONÍVEL' : '--', falha ? 'av' : ''); pr('kqr', '--', ''); return; }
      pr('kqr', quando(dados.renova).hora, '');
      if (!dados.leitura) { pr('kq', 'NÃO LIGADA', 'av'); return; }
      pr('kq', dados.esgotada ? 'ESGOTADA' : fmt(dados.restam) + ' RESTAM', classe(dados.percentual, dados.esgotada));
    }

    function linha(rot, valor, cls, pequeno) {
      var dd = h('dd', { class: cls || '', text: valor });
      if (pequeno) dd.appendChild(h('small', { text: pequeno }));
      return h('div', {}, [h('dt', { text: rot }), dd]);
    }
    var MOTIVOS = {
      'nao-configurado': 'A leitura do consumo ainda não está ligada no Worker. Ela precisa de dois segredos da Cloudflare (ID da conta e um token só de leitura de análises). O passo a passo está em docs/DEPLOY.md. Enquanto isso, a hora da renovação abaixo vale.',
      'sem-permissao': 'A Cloudflare recusou a leitura. Confira se o token tem a permissão "Análises da conta: leitura" (Account Analytics: Read) e se o ID da conta está certo.',
      'muitas-consultas': 'A Cloudflare pediu para esperar um pouco antes de consultar de novo. Tente em alguns minutos.',
      'sem-resposta': 'Não consegui ler o consumo agora. Tente de novo em instantes.',
      'resposta-invalida': 'A Cloudflare respondeu algo que não entendi. Tente de novo em instantes.',
      'sem-rede': 'Este ambiente não consegue consultar a Cloudflare.'
    };
    function textoDeFalha() {
      if (falha === 'sem-ia') return 'O console está sem o endereço do Worker, então não há como consultar a cota. Só a IA remota gasta cota; o que roda no aparelho não.';
      if (falha === 'sessao') return 'Sua sessão venceu. Entre de novo para ver a cota.';
      return 'Sem conexão com o Paulus agora. Confira a internet e toque em Atualizar.';
    }

    function pintarPainel() {
      if (!cqp) return;
      var c = cqp.querySelector('.cq-corpo'), at = cqp.querySelector('.cq-at');
      at.disabled = carregando; at.textContent = carregando ? 'Atualizando…' : 'Atualizar agora';
      c.textContent = '';
      if (!dados) { c.appendChild(h('p', { class: 'cq-av' + (falha ? ' er' : ''), text: falha ? textoDeFalha() : 'Consultando a cota…' })); return; }
      var ren = quando(dados.renova);
      if (!dados.leitura) {
        c.appendChild(h('p', { class: 'cq-av', text: MOTIVOS[dados.motivo] || MOTIVOS['sem-resposta'] }));
        c.appendChild(h('dl', {}, [
          linha('FRANQUIA', fmt(dados.franquia) + ' neurons por dia'),
          linha('RENOVA', ren.txt, 'ok', ren.falta)
        ]));
        return;
      }
      var cls = classe(dados.percentual, dados.esgotada);
      c.appendChild(h('div', { class: 'cq-gr' }, [h('span', { class: 'cq-n ' + cls, text: fmt(dados.restam) }), h('span', { class: 'cq-de', text: 'neurons restantes de ' + fmt(dados.franquia) + ' hoje' })]));
      var barra = h('div', { class: 'cq-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(dados.percentual)), 'aria-label': 'Franquia diária usada' }, [h('i', { class: cls })]);
      barra.firstChild.style.width = Math.max(1, Math.min(100, dados.percentual)) + '%';
      c.appendChild(barra);
      if (dados.esgotada) {
        c.appendChild(h('p', { class: 'cq-av er', text: 'A franquia gratuita de hoje acabou. No plano gratuito, a IA remota fica parada até ' + ren.txt + '; no plano pago, o que passa da franquia é cobrado' + (dados.custoExcedenteUSD ? ' (cerca de US$ ' + String(dados.custoExcedenteUSD).replace('.', ',') + ' até agora)' : '') + '. O que roda no aparelho (contas, normas, PDF, rotas, socorro) segue funcionando.' }));
      }
      var acaba;
      if (dados.esgotada) acaba = linha('ACABA', 'já acabou', 'er');
      else if (dados.esgotaEm) { var q2 = quando(dados.esgotaEm); acaba = linha('ACABA', q2.txt, 'av', 'estimativa, no ritmo das últimas horas'); }
      else if (!dados.usados) acaba = linha('ACABA', 'sem uso hoje', 'ok');
      else acaba = linha('ACABA', 'não deve acabar', 'ok', 'no ritmo atual dura até a renovação');
      c.appendChild(h('dl', {}, [
        linha('USADOS', fmt(dados.usados) + ' (' + String(dados.percentual).replace('.', ',') + '%)', cls),
        acaba,
        linha('RENOVA', ren.txt, 'ok', ren.falta),
        linha('CHAMADAS À IA HOJE', fmt(dados.chamadas))
      ]));
      if (dados.usados > 0 && Array.isArray(dados.porHora)) {
        var inicio = new Date(dados.inicioDoDia), horaAgora = Math.floor((Date.now() - inicio.getTime()) / 3600000), max = 1;
        dados.porHora.forEach(function (n) { if (n > max) max = n; });
        c.appendChild(h('h3', { text: 'Uso por hora (horário do aparelho)' }));
        var grafico = h('div', { class: 'cq-h', 'aria-hidden': 'true' });
        dados.porHora.forEach(function (n, i) {
          var b = h('i', { class: i === horaAgora ? 'agora' : '', title: hhmm(new Date(inicio.getTime() + i * 3600000)) + ' · ' + fmt(n) + ' neurons' });
          b.style.height = Math.max(2, Math.round(n / max * 46)) + 'px';
          grafico.appendChild(b);
        });
        c.appendChild(grafico);
        var h0 = inicio.getHours();
        c.appendChild(h('div', { class: 'cq-hl' }, [h('span', { text: ('0' + h0).slice(-2) + 'h' }), h('span', { text: ('0' + ((h0 + 12) % 24)).slice(-2) + 'h' }), h('span', { text: ('0' + ((h0 + 23) % 24)).slice(-2) + 'h' })]));
      }
      if (dados.modelos && dados.modelos.length) {
        c.appendChild(h('h3', { text: 'O que mais gastou' }));
        var ul = h('ul', { class: 'cq-m' });
        dados.modelos.slice(0, 4).forEach(function (m) {
          var parte = dados.usados ? Math.round(m.neurons / dados.usados * 100) : 0;
          ul.appendChild(h('li', { title: m.modelo }, [h('span', { text: m.modelo }), h('span', { text: fmt(m.neurons) + ' · ' + parte + '%' })]));
        });
        c.appendChild(ul);
      }
      if (falha) c.appendChild(h('p', { class: 'vn', text: 'Não consegui atualizar agora; estes números são da última leitura.' }));
      c.appendChild(h('p', { class: 'vn', text: 'Fonte: análises da Cloudflare, que podem atrasar alguns minutos. O painel oficial é o do Workers AI na Cloudflare. A hora em que acaba é só uma estimativa.' }));
    }

    function montar() {
      cqp = document.createElement('div'); cqp.id = 'cqp'; cqp.hidden = true; cqp.setAttribute('role', 'dialog'); cqp.setAttribute('aria-label', 'Cota da IA');
      cqp.appendChild(h('h2', { text: 'Cota da IA' }));
      cqp.appendChild(h('div', { class: 'cq-corpo', 'aria-live': 'polite' }));
      cqp.appendChild(h('button', { type: 'button', class: 'cq-at', text: 'Atualizar agora', on: { click: function () { buscar(); } } }));
      document.body.appendChild(cqp);
      var bx = $('cq');
      document.addEventListener('click', function (e) { if (!cqp.hidden && !cqp.contains(e.target) && !(bx && bx.contains(e.target))) painel(false); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !cqp.hidden) { painel(false); if (bx && bx.offsetParent) bx.focus(); } });
    }
    // Aberto: redesenha a cada 30 s (a contagem regressiva anda) e consulta o Worker a cada 60 s (ele guarda 1 minuto em cache).
    function painel(abrir) {
      if (!cqp) montar();
      var mostrar = typeof abrir === 'boolean' ? abrir : cqp.hidden, bx = $('cq');
      if (mostrar) { var outros = ['sxp', 'apn', 'vp', 'nt-p']; outros.forEach(function (id) { var o = $(id); if (o && !o.hidden) { var b = $({ sxp: 'sx', apn: 'ap', vp: 'vc', 'nt-p': 'nt' }[id]); if (b) b.click(); } }); }
      cqp.hidden = !mostrar;
      if (bx) { bx.setAttribute('aria-expanded', String(mostrar)); bx.classList.toggle('on', mostrar); }
      clearInterval(relogio); relogio = 0; ticks = 0;
      if (mostrar) {
        pintarPainel(); buscar();
        relogio = setInterval(function () { ticks++; if (ticks % 2 === 0) buscar(); else pintarPainel(); }, 30000);
        var p1 = cqp.querySelector('.cq-at'); if (p1) p1.focus();
      }
    }

    // Pergunta digitada ("quanto tenho de cota?", "quando a cota renova?"): responde aqui, sem gastar IA. Só frases claramente sobre a cota da IA,
    // para "cota de vagas para PCD" ou "cotas na universidade" irem normalmente para a IA.
    var SOBRE_COTA_IA = /\b(minha cota|sua cota|cota (da|de|do) (ia|inteligencia( artificial)?|paulus)|cota gratuita|franquia (da ia|diaria|gratuita)|neurons?|consumo da ia|tenho de cota|cota que (eu )?tenho|quanto (de )?cota|quanto (eu )?(ainda )?(tenho|resta\w*|sobr\w*|usei|gastei) (de|da) cota)\b/;
    var CONTEXTO_OUTRO = /\b(pcd|deficiencia|vagas?|concurso|racia\w*|escola\w*|cotista\w*|universidade|faculdade|condominio|leite|carne)\b/;
    function ehPergunta(texto) {
      var t = semAcento(texto).replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (t.length > 120 || CONTEXTO_OUTRO.test(t)) return false;
      if (SOBRE_COTA_IA.test(t)) return true;
      return /\bcota\b/.test(t) && /\b(renova\w*|acaba\w*|acabou|resta\w*|sobra\w*)\b/.test(t);
    }
    function responder() {
      var x = msgPaulus();
      var pronto = function () {
        var corpo;
        if (!dados) corpo = 'Não consegui consultar a cota agora. ' + textoDeFalha();
        else {
          var ren = quando(dados.renova);
          if (!dados.leitura) corpo = 'A franquia da IA é de ' + fmt(dados.franquia) + ' neurons por dia e renova **' + ren.txt + '** (' + ren.falta + '). Para eu mostrar quanto já foi usado, a leitura do consumo precisa ser ligada no Worker (docs/DEPLOY.md).';
          else if (dados.esgotada) corpo = 'A franquia de hoje **acabou** (' + fmt(dados.usados) + ' de ' + fmt(dados.franquia) + ' neurons). Renova **' + ren.txt + '** (' + ren.falta + '). Contas, normas, PDF, rotas e socorro seguem funcionando no aparelho.';
          else corpo = 'Restam **' + fmt(dados.restam) + '** de ' + fmt(dados.franquia) + ' neurons hoje (' + String(dados.percentual).replace('.', ',') + '% usado). ' +
            (dados.esgotaEm ? 'No ritmo das últimas horas, acaba por volta de **' + quando(dados.esgotaEm).txt + '**. ' : (dados.usados ? 'No ritmo atual dura até a renovação. ' : '')) +
            'Renova **' + ren.txt + '** (' + ren.falta + ').';
        }
        pintar(x.corpo, corpo + '\n\nO painel completo abre no botão de medidor do cabeçalho ou com /cota.');
        transcricao.push({ papel: 'Paulus', texto: corpo });
        rolar(true);
      };
      pintar(x.corpo, 'Consultando a cota…');
      buscar().then(pronto, pronto);
    }
    return { painel: painel, buscar: buscar, ehPergunta: ehPergunta, responder: responder, trilho: trilho };
  })();
  (function () {
    var bx = $('cq'); if (bx) bx.addEventListener('click', function (e) { e.stopPropagation(); cota.painel(); });
    ATALHOS.push({ c: '/cota', d: 'Cota da IA: quanto resta, quando acaba e quando renova', f: function () { cota.painel(true); } });
    P.registrarAcao({ id: 'painel-cota', titulo: 'Cota da IA', rotulos: ['cota', 'cota da ia', 'minha cota', 'cota do paulus', 'consumo da ia', 'franquia da ia'], executar: function () { cota.painel(true); } });
    // Primeira leitura logo depois da abertura (alimenta o trilho lateral) e, depois, a cada 5 minutos com a aba à vista.
    setTimeout(function () { cota.buscar(); }, 2500);
    setInterval(function () { if (!document.hidden) cota.buscar(); }, 300000);
  })();

  // ------------------------------------------------------------ aparência (tema e tamanho do texto) e menu do cabeçalho no celular
  // Tudo fica só neste aparelho (localStorage). "Automático" segue o tema do sistema.
  var apn = null;
  function painelAparencia(abrir) {
    if (!apn) montarAparencia();
    var mostrar = typeof abrir === 'boolean' ? abrir : apn.hidden;
    if (mostrar && vp && !vp.hidden) painelVoz(false);
    apn.hidden = !mostrar;
    var b = $('ap'); if (b) { b.setAttribute('aria-expanded', String(mostrar)); b.classList.toggle('on', mostrar); }
    if (mostrar) { var s = apn.querySelector('[aria-checked="true"]'); if (s) s.focus(); }
  }
  var TEMAS = ['auto', 'escuro', 'claro'], TAMS = ['p', 'm', 'g', 'gg'];
  var mqClaro = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : null;
  var tema = lerLS('paulus.tema'); if (TEMAS.indexOf(tema) < 0) tema = 'auto';
  var tam = lerLS('paulus.tam'); if (TAMS.indexOf(tam) < 0) tam = 'm';
  function temaEfetivo() { return tema === 'auto' ? (mqClaro && mqClaro.matches ? 'claro' : 'escuro') : tema; }
  function aplicarAparencia() {
    var e = temaEfetivo();
    document.body.classList.toggle('claro', e === 'claro');
    document.documentElement.setAttribute('data-tam', tam);
    var mt = document.querySelector('meta[name="theme-color"]'); if (mt) mt.setAttribute('content', e === 'claro' ? '#eef5f8' : '#02070c');
    if (apn) Array.prototype.forEach.call(apn.querySelectorAll('[data-g]'), function (b) { var on = (b.getAttribute('data-g') === 'tema' ? tema : tam) === b.getAttribute('data-v'); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
  }
  function montarAparencia() {
    apn = document.createElement('div'); apn.id = 'apn'; apn.hidden = true; apn.setAttribute('role', 'dialog'); apn.setAttribute('aria-label', 'Aparência');
    function el(tag, txt, pai, cls) { var e = document.createElement(tag); if (txt) e.textContent = txt; if (cls) e.className = cls; if (pai) pai.appendChild(e); return e; }
    el('h2', 'Aparência', apn);
    function grupo(titulo, id, itens, valorAtual, aoMudar) {
      el('p', titulo, apn, 'ag');
      var g = el('div', '', apn, 'seg'); g.setAttribute('role', 'radiogroup'); g.setAttribute('aria-label', titulo);
      itens.forEach(function (it) {
        var b = el('button', it[1], g); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('data-g', id); b.setAttribute('data-v', it[0]); if (it[2]) { b.setAttribute('aria-label', it[2]); b.title = it[2]; if (it[3]) b.style.fontSize = it[3]; }
        b.addEventListener('click', function () { aoMudar(it[0]); });
        b.addEventListener('keydown', function (ev) {
          var k = ev.key, ir = k === 'ArrowRight' || k === 'ArrowDown' ? 1 : k === 'ArrowLeft' || k === 'ArrowUp' ? -1 : 0; if (!ir) return;
          ev.preventDefault(); var bs = g.querySelectorAll('button'), i = Array.prototype.indexOf.call(bs, b), n = bs[(i + ir + bs.length) % bs.length]; n.focus(); n.click();
        });
      });
    }
    grupo('Tema', 'tema', [['auto', 'Automático', 'Seguir o tema do aparelho'], ['escuro', 'Escuro'], ['claro', 'Claro']], tema, function (v) { tema = v; gravarLS('paulus.tema', v); aplicarAparencia(); });
    grupo('Tamanho do texto', 'tam', [['p', 'A', 'Texto pequeno', '12px'], ['m', 'A', 'Texto médio', '15px'], ['g', 'A', 'Texto grande', '18px'], ['gg', 'A', 'Texto muito grande', '22px']], tam, function (v) { tam = v; gravarLS('paulus.tam', v); aplicarAparencia(); });
    el('p', 'Efeitos', apn, 'ag');
    var fx = el('button', '', apn, 'tg-fx'); fx.type = 'button'; fx.setAttribute('role', 'switch');
    var fxl = el('span', 'Modo foco (sem painéis nem animações de fundo)', fx), fxk = el('i', '', fx); fxk.setAttribute('aria-hidden', 'true');
    function marcarFx() { var on = document.body.classList.contains('foco'); fx.setAttribute('aria-checked', String(on)); }
    fx.addEventListener('click', function () { var b = $('fo'); if (b) b.click(); marcarFx(); });
    new MutationObserver(marcarFx).observe(document.body, { attributes: true, attributeFilter: ['class'] }); marcarFx();
    el('p', 'Fica só neste aparelho. Atalho do modo foco: Ctrl+Shift+F.', apn, 'vn');
    document.body.appendChild(apn);
    aplicarAparencia();
  }
  aplicarAparencia();
  if (mqClaro) { var mudouTema = function () { if (tema === 'auto') aplicarAparencia(); }; if (mqClaro.addEventListener) mqClaro.addEventListener('change', mudouTema); else if (mqClaro.addListener) mqClaro.addListener(mudouTema); }
  (function () {
    var bAp = $('ap'); if (bAp) bAp.addEventListener('click', function (e) { e.stopPropagation(); painelAparencia(); });
    document.addEventListener('click', function (e) { if (apn && !apn.hidden && !apn.contains(e.target) && !(bAp && bAp.contains(e.target))) painelAparencia(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && apn && !apn.hidden) { painelAparencia(false); if (bAp && bAp.offsetParent) bAp.focus(); } });
    P.registrarAcao && P.registrarAcao({ id: 'painel-aparencia', titulo: 'Aparência', rotulos: ['aparencia', 'aparência', 'tema', 'tema claro', 'tema escuro', 'tamanho do texto'], executar: function () { painelAparencia(true); } });
  })();

  // Celular: só "nova conversa", "modo voz" e "mais" ficam no cabeçalho; o resto vai para um menu (os mesmos botões, mudados de lugar).
  (function () {
    var MN = $('mn'), hrx = document.querySelector('header .hr'); if (!MN || !hrx || !window.matchMedia) return;
    var menu = document.createElement('div'); menu.id = 'mnp'; menu.hidden = true; menu.setAttribute('role', 'group'); menu.setAttribute('aria-label', 'Mais opções'); document.body.appendChild(menu);
    var ORDEM = ['ins', 'sair', 'ex', 'fo', 'nv', 'cq', 'sx', 'nt', 'jv', 'ap', 'vc', 'vz'], FICA = { nv: 1, jv: 1 }, ROT = { ins: 'Instalar o app', sair: 'Sair da conta', ex: 'Salvar a conversa', fo: 'Modo foco', cq: 'Cota da IA', sx: 'Meus sistemas', nt: 'Anotações e compras', ap: 'Aparência', vc: 'Escolher a voz', vz: 'Ler respostas em voz alta' };
    var mm = matchMedia('(max-width:640px)');
    function fecharMenu() { menu.hidden = true; MN.setAttribute('aria-expanded', 'false'); MN.classList.remove('on'); }
    function ajustar() {
      var cel = mm.matches; MN.hidden = !cel;
      ORDEM.forEach(function (id) {
        var b = $(id); if (!b) return;
        if (cel && !FICA[id]) { b.setAttribute('data-r', ROT[id]); menu.appendChild(b); } else { b.removeAttribute('data-r'); hrx.insertBefore(b, MN); }
      });
      if (!cel) fecharMenu();
    }
    MN.addEventListener('click', function (e) {
      e.stopPropagation(); var abrir = menu.hidden; menu.hidden = !abrir; MN.setAttribute('aria-expanded', String(abrir)); MN.classList.toggle('on', abrir);
      if (abrir) { var p = menu.querySelector('button:not([hidden])'); if (p) p.focus(); }
    });
    menu.addEventListener('click', function () { setTimeout(fecharMenu, 0); }, true);
    document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target) && !MN.contains(e.target)) fecharMenu(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { fecharMenu(); MN.focus(); } });
    if (mm.addEventListener) mm.addEventListener('change', ajustar); else if (mm.addListener) mm.addListener(ajustar);
    ajustar();
  })();

  // modo foco: esconde painéis e efeitos de fundo; a escolha fica neste aparelho
  (function () {
    var bt = $('fo'); if (!bt) return;
    function aplicar(on) { document.body.classList.toggle('foco', on); bt.setAttribute('aria-pressed', on ? 'true' : 'false'); gravarLS('paulus.foco', on ? '1' : '0'); }
    bt.addEventListener('click', function () { aplicar(!document.body.classList.contains('foco')); });
    document.addEventListener('keydown', function (e) { if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) { e.preventDefault(); bt.click(); } });
    if (lerLS('paulus.foco') === '1') aplicar(true);
  })();
  $('nv').addEventListener('click', nova);
  $('ex').addEventListener('click', exportar);

  var instalar = null, ins = $('ins');
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); instalar = e; ins.hidden = false; });
  ins.addEventListener('click', function () { if (!instalar) return; instalar.prompt(); instalar = null; ins.hidden = true; });
  window.addEventListener('appinstalled', function () { ins.hidden = true; });

  var rel = $('hr');
  function relogio() { var d = new Date(); rel.textContent = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  relogio(); setInterval(relogio, 30000);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) { /* segue */ }
  }

  // ------------------------------------------------------------ entrada
  function autoAltura() { q.style.height = 'auto'; q.style.height = Math.min(q.scrollHeight, 160) + 'px'; ajustarBarra(); }
  // Aviso enquanto digita: usa o mesmo detector que barra o envio à IA (nada sai do aparelho).
  var pv = $('pv'), tPii = 0;
  function dicaPessoal() {
    clearTimeout(tPii);
    tPii = setTimeout(function () {
      if (!pv) return;
      var tem = false, v = q.value;
      try { tem = v.length > 4 && !!(P.temDadoPessoal && P.temDadoPessoal(v)) && !(P.detectarCrise && P.detectarCrise(v)); } catch (e) { tem = false; }
      if (tem && !pv.firstChild) { pv.appendChild(ico('aviso')); pv.appendChild(h('span', { text: 'Parece haver nome, documento, telefone ou endereço de pessoa atendida. Para a IA, tire antes: pedidos com esses dados são barrados.' })); ajustarBarra(); }
      else if (!tem && pv.firstChild) { pv.textContent = ''; ajustarBarra(); }
    }, 220);
  }
  q.addEventListener('input', function () { autoAltura(); selSl = 0; abrirSl(); if (nucleo) nucleo.impulso(); dicaPessoal(); });
  q.addEventListener('keydown', function (e) {
    // seta para cima com o campo vazio: traz a última pergunta para editar
    if (e.key === 'ArrowUp' && !q.value && ultimoPedido && sl.hidden) { e.preventDefault(); q.value = ultimoPedido; autoAltura(); return; }
    if (!sl.hidden) {
      if (e.key === 'ArrowDown') { e.preventDefault(); selSl = (selSl + 1) % listaSl.length; abrirSl(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); selSl = (selSl - 1 + listaSl.length) % listaSl.length; abrirSl(); return; }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); rodarAtalho(listaSl[selSl]); return; }
      if (e.key === 'Escape') { sl.hidden = true; return; }
    }
    if (e.key === 'ArrowUp' && !q.value && sl.hidden) {
      for (var i = transcricao.length - 1; i >= 0; i--) if (transcricao[i].papel === 'Você') { e.preventDefault(); q.value = transcricao[i].texto; autoAltura(); break; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!ocupado) enviar(); }
  });
  go.addEventListener('click', function () { if (ocupado) parar(); else enviar(); });
  $('at').addEventListener('click', function () { $('fi').click(); });
  $('fi').addEventListener('change', function (e) { adicionar(e.target.files); e.target.value = ''; });
  q.addEventListener('paste', function (e) { var f = e.clipboardData && e.clipboardData.files; if (f && f.length) { e.preventDefault(); adicionar(f); } });

  var drop = $('drop'), nivel = 0;
  window.addEventListener('dragenter', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { nivel++; drop.style.display = 'flex'; } });
  window.addEventListener('dragleave', function () { nivel = Math.max(0, nivel - 1); if (!nivel) drop.style.display = 'none'; });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); nivel = 0; drop.style.display = 'none'; if (e.dataTransfer) adicionar(e.dataTransfer.files); });

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'N' || e.key === 'n')) { e.preventDefault(); nova(); }
    else if (e.key === 'Escape' && ocupado) parar();
    else if (e.key === '/' && document.activeElement !== q && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); q.value = '/'; abrirSl(); }
  });
  document.addEventListener('click', function (e) { if (!sl.contains(e.target) && e.target !== q) sl.hidden = true; });

  log.addEventListener('scroll', function () { dn.hidden = perto(); });
  dn.addEventListener('click', function () { log.scrollTop = log.scrollHeight; dn.hidden = true; });
  window.addEventListener('resize', function () { ajustarBarra(); if (document.activeElement && document.activeElement.id === 'q') rolar(true); });

  // ------------------------------------------------------------ telemetria (números reais da sessão, nada inventado)
  var tele = { msgs: 0, local: 0, ia: 0, lat: [], ini: Date.now(), ultima: '--' };
  function pr(id, txt, cls) { var e = $(id); if (!e) return; if (e.textContent !== String(txt)) e.textContent = txt; if (cls != null) e.className = cls; }
  function tempoTxt(ms) { return ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s'; }
  function telemetria() {
    var s = Math.floor((Date.now() - tele.ini) / 1000), z = function (n) { return ('0' + n).slice(-2); };
    pr('ts', s >= 3600 ? Math.floor(s / 3600) + ':' + z(Math.floor(s / 60) % 60) + ':' + z(s % 60) : z(Math.floor(s / 60)) + ':' + z(s % 60));
    pr('tm', tele.msgs); pr('tl', tele.local); pr('tia', tele.ia); pr('tu', tele.ultima);
  }
  function sparkline() {
    var sp = $('spk'); if (!sp) return;
    var dados = tele.lat.slice(-18), max = 1; dados.forEach(function (d) { if (d.ms > max) max = d.ms; });
    sp.textContent = '';
    for (var i = 0; i < 18 - dados.length; i++) sp.appendChild(h('i', { style: 'height:3px;opacity:.25' }));
    dados.forEach(function (d) { sp.appendChild(h('i', { class: d.local ? 'l' : '', style: 'height:' + Math.max(3, Math.round(d.ms / max * 40)) + 'px', title: tempoTxt(d.ms) })); });
    pr('tmax', dados.length ? 'MÁX ' + tempoTxt(max) : '--');
  }
  function ultimaResp(r, ms) {
    var viaIA = r.tipo === 'ia' && !r.deMemoria, fs = (r.fontes || []).filter(function (f) { return f && (f.documento || f.norma); });
    pr('ut', KIND[r.tipo] || 'IA', r.tipo === 'erro' || r.tipo === 'crise' ? 'er' : ''); pr('uo', r.tipo === 'erro' ? '--' : viaIA ? 'IA REMOTA' : 'NO APARELHO', r.tipo === 'erro' ? '' : viaIA ? 'av' : 'ok');
    pr('um', tempoTxt(ms)); pr('uf', fs.length); pr('uc', String((r.texto || '').length) + ' car.');
    var ul = $('fts'); if (!ul) return; ul.textContent = '';
    fs.slice(0, 4).forEach(function (f) { ul.appendChild(h('li', { text: [f.documento || f.norma, f.referencia].filter(Boolean).join(' · '), title: [f.documento, f.norma, f.ano, f.referencia].filter(Boolean).join(' · ') })); });
  }
  function registrar(r, ms) {
    ultimaResp(r, ms);
    tele.msgs++;
    if (r.tipo !== 'erro') {
      var viaIA = r.tipo === 'ia' && !r.deMemoria;
      if (viaIA) tele.ia++; else tele.local++;
      tele.lat.push({ ms: ms, local: !viaIA });
      tele.ultima = (KIND[r.tipo] || 'IA') + ' · ' + tempoTxt(ms);
    }
    telemetria(); sparkline();
  }
  function sistemas() {
    var on = navigator.onLine !== false;
    document.body.classList.toggle('off', !on);
    pr('kr', on ? 'ONLINE' : 'OFFLINE', on ? 'ok' : 'er');
    pr('ki', !ENDPOINT ? 'SÓ LOCAL' : on ? 'ONLINE' : 'OFFLINE', !ENDPOINT ? 'av' : on ? 'ok' : 'er');
  }
  sistemas(); window.addEventListener('online', sistemas); window.addEventListener('offline', sistemas);
  telemetria(); sparkline(); setInterval(telemetria, 1000);
  if (location.protocol !== 'file:' && window.fetch) {
    try { fetch('versao.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) { if (j && j.versao) pr('kb', 'v' + j.versao + (j.build ? ' · ' + String(j.build).slice(0, 6) : '')); }).catch(function () { pr('kb', 'LOCAL'); }); } catch (e) { pr('kb', 'LOCAL'); }
  } else pr('kb', 'LOCAL');

  // ------------------------------------------------------------ núcleo (reator em arco no cabeçalho)
  // Estados: idle (respira), busy (âmbar, gira rápido, varredura), listen (verde, barras), speak (barras de voz), erro (vermelho, treme).
  function criarNucleo(cv) {
    var ctx = cv.getContext('2d'), W = 0, H = 0, est = 'idle', estT = 0, amp = 0.05, imp = 0, px = 0, py = 0, ax = 0, ay = 0, img = new Image(), imgOk = false, i, hov = 0, hovAlvo = 0, giro = 0, giroVel = 0, ondas = [], arrasta = false, ultX = 0;
    var COR = { idle: [55, 230, 255], busy: [255, 179, 71], listen: [110, 231, 168], speak: [143, 244, 255], erro: [255, 107, 94] };
    var AMP = { idle: 0.05, busy: 0.3, listen: 0.62, speak: 0.8, erro: 0.1 }, VEL = { idle: 1, busy: 3.4, listen: 1.7, speak: 2, erro: 0.4 };
    var cur = COR.idle.slice();
    img.onload = function () { imgOk = true; if (reduzido) quadro(performance.now()); };
    img.src = 'icon-512.png';
    function tam() { var r = cv.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2); W = r.width; H = r.height; cv.width = Math.round(W * d); cv.height = Math.round(H * d); ctx.setTransform(d, 0, 0, d, 0, 0); }
    function rgb(a) { return Math.round(cur[0]) + ',' + Math.round(cur[1]) + ',' + Math.round(cur[2]) + ',' + a; }
    function arco(cx, cy, r, ini, tm, lw, al, dash, cap) {
      ctx.beginPath(); ctx.setLineDash(dash || []); ctx.lineCap = cap || 'butt'; ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(' + rgb(al) + ')'; ctx.arc(cx, cy, r, ini, ini + tm); ctx.stroke(); ctx.setLineDash([]);
    }
    function quadro(now) {
      if (!W) return;
      var t = reduzido ? 2 : now / 1000, R = Math.min(W, H) / 2 - 1, cx = W / 2, cy = H / 2, alvo = COR[est] || COR.idle, vel = VEL[est] || 1;
      for (i = 0; i < 3; i++) cur[i] += (alvo[i] - cur[i]) * 0.12;
      amp += ((AMP[est] || 0.05) - amp) * 0.1; imp *= 0.94;
      var tr = est === 'erro' ? Math.sin((now - estT) / 28) * Math.max(0, 1 - (now - estT) / 600) * R * 0.05 : 0;
      cx += tr;
      var pulso = 0.5 + 0.5 * Math.sin(t * (est === 'busy' ? 8 : 2)), Ri = R * 0.5 * (1 + 0.02 * pulso + imp * 0.06 + hov * 0.07); px += (ax - px) * 0.12; py += (ay - py) * 0.12; hov += (hovAlvo - hov) * 0.12; giro += giroVel; giroVel *= 0.96;
      ctx.clearRect(0, 0, W, H);
      var g = ctx.createRadialGradient(cx, cy, Ri * 0.5, cx, cy, R * 1.02);
      g.addColorStop(0, 'rgba(' + rgb(0.42 + 0.2 * pulso + imp * 0.3) + ')'); g.addColorStop(0.55, 'rgba(' + rgb(0.1) + ')'); g.addColorStop(1, 'rgba(' + rgb(0) + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // varredura de radar (pensando/ouvindo): cone que gira atrás dos anéis
      if (ctx.createConicGradient && (est === 'busy' || est === 'listen')) {
        var cg = ctx.createConicGradient(t * (est === 'busy' ? 5 : 2.4), cx, cy);
        cg.addColorStop(0, 'rgba(' + rgb(0) + ')'); cg.addColorStop(0.8, 'rgba(' + rgb(0) + ')'); cg.addColorStop(1, 'rgba(' + rgb(est === 'busy' ? 0.42 : 0.3) + ')');
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.88, 0, 6.2832); ctx.fillStyle = cg; ctx.fill();
      }
      // régua de marcas
      var N = 60, a, r1 = R * 0.9, longa;
      for (i = 0; i < N; i++) {
        a = i / N * 6.2832 + t * 0.14 * vel + giro * 0.6; longa = i % 5 === 0;
        ctx.beginPath(); ctx.lineWidth = longa ? 1.5 : 0.9; ctx.strokeStyle = 'rgba(' + rgb(longa ? 0.8 : 0.32) + ')';
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * (r1 + R * (longa ? 0.1 : 0.05)), cy + Math.sin(a) * (r1 + R * (longa ? 0.1 : 0.05))); ctx.stroke();
      }
      var lw = Math.max(1.4, R * 0.045);
      for (i = 0; i < 3; i++) arco(cx, cy, R * 0.8, -t * 0.8 * vel - giro + i * 2.0944, 1.2, lw, 0.85 + hov * 0.15);
      arco(cx, cy, R * 0.7, t * 0.5 * vel, 6.2832, 1, 0.4, [R * 0.12, R * 0.07]);
      if (est === 'busy') { for (i = 0; i < 6; i++) arco(cx, cy, R * 0.7, t * 4.2 - i * 0.09, 0.09, lw * 1.2, 0.9 - i * 0.14, null, 'round'); }
      // anéis finos em sentidos opostos e um satélite com rastro (o "reator" do filme)
      for (i = 0; i < 2; i++) arco(cx, cy, R * 0.95, t * 0.35 * vel + giro * 1.4 + i * 3.1416, 0.75, Math.max(1, lw * 0.5), 0.5 + hov * 0.3);
      arco(cx, cy, R * 0.62, -t * 0.9 * vel, 6.2832, 0.8, 0.3, [2, R * 0.05]);
      for (i = 0; i < 6; i++) arco(cx, cy, R * 0.86, t * 1.3 * vel - i * 0.1, 0.1, lw * 0.9, 0.95 - i * 0.15, null, 'round');
      // barras radiais (voz): amplitude do estado
      var NB = 40, barras = est === 'idle' ? 0.35 : 1;
      for (i = 0; i < NB; i++) {
        a = i / NB * 6.2832 - 1.5708;
        var ruido = 0.5 + 0.5 * Math.sin(t * (6 + vel) + i * 0.9 + Math.sin(t * 2.3 + i * 0.5) * 2), len = R * (0.025 + amp * 0.2 * ruido * barras), b0 = Ri + R * 0.05;
        ctx.beginPath(); ctx.lineWidth = Math.max(1.2, R * 0.032); ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(' + rgb(0.35 + 0.5 * ruido) + ')';
        ctx.moveTo(cx + Math.cos(a) * b0, cy + Math.sin(a) * b0); ctx.lineTo(cx + Math.cos(a) * (b0 + len), cy + Math.sin(a) * (b0 + len)); ctx.stroke();
      }
      ctx.lineCap = 'butt';
      // ondas de choque (toque/clique): anéis que se expandem e somem
      for (i = ondas.length - 1; i >= 0; i--) {
        var ag = (now - ondas[i]) / 900;
        if (ag >= 1) { ondas.splice(i, 1); continue; }
        ctx.beginPath(); ctx.arc(cx, cy, Ri + (R * 1.25 - Ri) * ag, 0, 6.2832); ctx.lineWidth = Math.max(1, 3 * (1 - ag)); ctx.strokeStyle = 'rgba(' + rgb(0.8 * (1 - ag)) + ')'; ctx.stroke();
      }
      // rosto (ícone do app) dentro do vidro
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, Ri, 0, 6.2832); ctx.clip();
      if (imgOk) {
        var ts = Ri * 2.04 * (1 + hov * 0.07 + (est === 'speak' ? amp * 0.03 * Math.sin(t * 9) : 0) + 0.008 * Math.sin(t * 1.6));
        // o rosto acompanha o ponteiro: desloca, inclina um pouco (skew) e aproxima no hover
        ctx.save(); ctx.translate(cx + px * Ri * 0.2, cy + py * Ri * 0.17); ctx.transform(1, py * 0.05, px * 0.05, 1, 0, 0);
        ctx.drawImage(img, -ts / 2, -ts / 2, ts, ts); ctx.restore();
        if (est !== 'idle') { ctx.fillStyle = 'rgba(' + rgb(est === 'erro' ? 0.28 : 0.12) + ')'; ctx.fillRect(cx - Ri, cy - Ri, Ri * 2, Ri * 2); }
        var per = est === 'busy' ? 1.1 : 3.6, ph = ((t / per) % 1.3) - 0.15, sy = cy - Ri + ph * Ri * 2;
        ctx.globalCompositeOperation = 'lighter';
        var gs = ctx.createLinearGradient(0, sy - Ri * 0.5, 0, sy + 1); gs.addColorStop(0, 'rgba(' + rgb(0) + ')'); gs.addColorStop(1, 'rgba(' + rgb(est === 'busy' ? 0.5 : 0.28) + ')');
        ctx.fillStyle = gs; ctx.fillRect(cx - Ri, sy - Ri * 0.5, Ri * 2, Ri * 0.5 + 1);
        ctx.globalCompositeOperation = 'source-over';
      } else { ctx.fillStyle = 'rgba(' + rgb(0.9) + ')'; ctx.beginPath(); ctx.arc(cx, cy, Ri * 0.3 * (1 + 0.15 * pulso), 0, 6.2832); ctx.fill(); }
      ctx.restore();
      ctx.beginPath(); ctx.arc(cx, cy, Ri, 0, 6.2832); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(' + rgb(0.85) + ')'; ctx.stroke();
    }
    function laco(now) { quadro(now); requestAnimationFrame(laco); }
    tam(); window.addEventListener('resize', function () { tam(); if (reduzido) quadro(performance.now()); });
    if (typeof ResizeObserver !== 'undefined') { try { new ResizeObserver(function () { tam(); if (reduzido) quadro(performance.now()); }).observe(cv); } catch (e) { /* segue */ } }
    if (reduzido) quadro(performance.now()); else requestAnimationFrame(laco);
    return { estado: function (e) { est = e; estT = performance.now(); if (reduzido) quadro(estT); }, impulso: function () { imp = 1; ondas.push(performance.now()); }, hover: function (v) { hovAlvo = v ? 1 : 0; }, girar: function (dv) { giroVel = Math.max(-0.5, Math.min(0.5, giroVel + dv)); }, olhar: function (x, y) { ax = Math.max(-1, Math.min(1, x)); ay = Math.max(-1, Math.min(1, y)); } };
  }
  var cvCore = $('core');
  if (cvCore && cvCore.getContext) {
    nucleo = criarNucleo(cvCore);
    var FALAS = ['Pois não.', 'Estou aqui.', 'Diga o destino ou a pergunta.', 'Todos os sistemas operacionais.', 'Quer traçar uma rota?', 'Pode falar.', 'Ouvindo.'], ifala = 0, tfala = 0, bolha = null, arrastando = false, ultX = 0;
    function falar(txt) {
      if (!bolha) { bolha = document.createElement('div'); bolha.id = 'fala'; bolha.setAttribute('role', 'status'); document.body.appendChild(bolha); }
      var r = cvCore.getBoundingClientRect();
      bolha.textContent = txt; bolha.style.left = Math.round(r.left + r.width / 2) + 'px'; bolha.style.top = Math.round(r.bottom + 6) + 'px'; bolha.classList.add('on');
      clearTimeout(tfala); tfala = setTimeout(function () { bolha.classList.remove('on'); }, 2400);
    }
    cvCore.setAttribute('role', 'button'); cvCore.setAttribute('tabindex', '0'); cvCore.setAttribute('aria-label', 'Paulus: toque para cumprimentar');
    function tocar() { nucleo.impulso(); bip(660, 990, 0.1, 0.04); falar(FALAS[ifala++ % FALAS.length]); }
    cvCore.addEventListener('pointerenter', function () { nucleo.hover(true); });
    cvCore.addEventListener('pointerleave', function () { nucleo.hover(false); arrastando = false; });
    cvCore.addEventListener('focus', function () { nucleo.hover(true); }); cvCore.addEventListener('blur', function () { nucleo.hover(false); });
    cvCore.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tocar(); } });
    cvCore.addEventListener('pointerdown', function (e) { arrastando = true; ultX = e.clientX; try { cvCore.setPointerCapture(e.pointerId); } catch (x) { /* segue */ } tocar(); });
    cvCore.addEventListener('pointerup', function () { arrastando = false; });
    // arrastar de lado gira os anéis (com inércia)
    cvCore.addEventListener('pointermove', function (e) { if (arrastando) { nucleo.girar((e.clientX - ultX) * 0.004); ultX = e.clientX; } });
    cvCore.addEventListener('dblclick', function () { nucleo.girar(0.45); nucleo.impulso(); falar('Varredura completa.'); });
    window.addEventListener('pointermove', function (e) { var r = cvCore.getBoundingClientRect(); nucleo.olhar((e.clientX - (r.left + r.width / 2)) / (window.innerWidth * 0.5), (e.clientY - (r.top + r.height / 2)) / (window.innerHeight * 0.5)); }, { passive: true });
  }

  // ------------------------------------------------------------ fundo (grade, partículas e varredura; discreto)
  function criarFundo(cv) {
    var ctx = cv.getContext('2d'), W = 0, H = 0, parts = [], ult = 0, i, j;
    function tam() {
      var d = Math.min(window.devicePixelRatio || 1, 1.5); W = window.innerWidth; H = window.innerHeight; cv.width = Math.round(W * d); cv.height = Math.round(H * d); ctx.setTransform(d, 0, 0, d, 0, 0);
      var n = Math.max(22, Math.min(64, Math.round(W * H / 26000))); parts = [];
      for (i = 0; i < n; i++) parts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18, s: 0.6 + Math.random() * 1.1 });
    }
    function quadro(now) {
      var busy = estadoAtual === 'busy', c = busy ? '255,179,71' : '55,230,255', t = now / 1000, vel = busy ? 3 : 1;
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(55,230,255,0.045)'; ctx.beginPath();
      for (i = 0; i < W; i += 56) { ctx.moveTo(i + 0.5, 0); ctx.lineTo(i + 0.5, H); }
      for (j = 0; j < H; j += 56) { ctx.moveTo(0, j + 0.5); ctx.lineTo(W, j + 0.5); }
      ctx.stroke();
      // anéis grandes e régua giratória ao centro da tela (mapa de HUD, bem discreto)
      var S = Math.min(W, H), bx = W / 2, by = H * 0.5, rot = t * 0.02 * vel, k, ang, tl;
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(' + c + ',0.06)';
      ctx.beginPath(); ctx.arc(bx, by, S * 0.34, 0, 6.2832); ctx.stroke();
      ctx.setLineDash([3, 9]); ctx.beginPath(); ctx.arc(bx, by, S * 0.46, rot * 6, rot * 6 + 6.2832); ctx.stroke(); ctx.setLineDash([]);
      for (k = 0; k < 120; k++) {
        ang = k / 120 * 6.2832 - rot * 2; tl = k % 10 === 0 ? 11 : 4;
        ctx.beginPath(); ctx.strokeStyle = 'rgba(' + c + ',' + (k % 10 === 0 ? 0.16 : 0.07) + ')';
        ctx.moveTo(bx + Math.cos(ang) * S * 0.58, by + Math.sin(ang) * S * 0.58); ctx.lineTo(bx + Math.cos(ang) * (S * 0.58 + tl), by + Math.sin(ang) * (S * 0.58 + tl)); ctx.stroke();
      }
      for (i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (!reduzido) { p.x += p.vx * vel; p.y += p.vy * vel; if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10; if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10; }
        for (j = i + 1; j < parts.length; j++) {
          var o = parts[j], dx = p.x - o.x, dy = p.y - o.y, d2 = dx * dx + dy * dy;
          if (d2 < 14000) { ctx.beginPath(); ctx.lineWidth = 0.7; ctx.strokeStyle = 'rgba(' + c + ',' + (0.16 * (1 - d2 / 14000)) + ')'; ctx.moveTo(p.x, p.y); ctx.lineTo(o.x, o.y); ctx.stroke(); }
        }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 6.2832); ctx.fillStyle = 'rgba(' + c + ',0.45)'; ctx.fill();
      }
      var sy = ((t * 0.07 * vel) % 1.3 - 0.15) * H, gs = ctx.createLinearGradient(0, sy - 90, 0, sy + 1);
      gs.addColorStop(0, 'rgba(' + c + ',0)'); gs.addColorStop(1, 'rgba(' + c + ',0.07)'); ctx.fillStyle = gs; ctx.fillRect(0, sy - 90, W, 91);
      ctx.fillStyle = 'rgba(' + c + ',0.2)'; ctx.fillRect(0, sy, W, 1);
    }
    function laco(now) { if (now - ult > 33) { ult = now; quadro(now); } requestAnimationFrame(laco); }
    tam(); window.addEventListener('resize', tam);
    if (reduzido) quadro(performance.now()); else requestAnimationFrame(laco);
  }
  var cvBg = $('bgc'); if (cvBg && cvBg.getContext && !reduzido) criarFundo(cvBg);

  // ------------------------------------------------------------ boot (uma vez por sessão do navegador)
  function iniciarBoot() {
    var el = $('boot'), visto = null;
    try { visto = sessionStorage.getItem('paulus.boot'); sessionStorage.setItem('paulus.boot', '1'); } catch (e) { /* sem armazenamento: roda de novo */ }
    if (!el || reduzido || visto) return;
    var on = navigator.onLine !== false, linhas = [
      ['NÚCLEO', 'OK'], ['FILTRO DE DADOS PESSOAIS', 'ATIVO'], ['DETECTOR DE SOCORRO', 'ATIVO'], ['IA REMOTA', !ENDPOINT ? 'SÓ LOCAL' : on ? 'ONLINE' : 'OFFLINE']
    ];
    el.textContent = '';
    var bx = h('div', { class: 'bx' }, [h('b', { text: 'PAULUS_IA' })]);
    linhas.forEach(function (l, i) { var s = h('span', { style: 'animation-delay:' + (0.15 + i * 0.22) + 's' }, [l[0] + ' ', h('i', { text: l[1] })]); bx.appendChild(s); });
    bx.appendChild(h('div', { class: 'bb', style: '--bt:1.2s' }));
    el.appendChild(bx); el.hidden = false; document.body.classList.add('boot');
    setTimeout(function () { el.classList.add('fim'); document.body.classList.remove('boot'); }, 1400);
    setTimeout(function () { el.hidden = true; el.textContent = ''; }, 2050);
  }
  if (window.innerWidth < 430) q.placeholder = 'Pergunte…';
  if (lerLS('paulus.som') === '1') { somLigado = true; var ks0 = $('ksom'); if (ks0) { ks0.textContent = 'LIGADO'; ks0.className = 'ok'; } }
  if (N) N.init({ confirmar: function (t) { return confirm(t); }, ditar: function () { modoNota = true; aviso('Fale os itens. Eu anoto.'); ouvir(); } });
  boasVindas(); ajustarBarra(); estadoUI('idle'); q.focus();
  iniciarBoot();
})();
