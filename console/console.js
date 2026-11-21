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

  // ------------------------------------------------------------ Markdown seguro
  function seguro(url) { return /^(https?:\/\/|mailto:)/i.test(url); }
  function inline(pai, txt) {
    var re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s<)]+)/g;
    var ult = 0, m;
    while ((m = re.exec(txt))) {
      if (m.index > ult) pai.appendChild(document.createTextNode(txt.slice(ult, m.index)));
      var s = m[0];
      if (m[1]) pai.appendChild(h('code', { text: s.slice(1, -1) }));
      else if (m[2]) pai.appendChild(h('strong', { text: s.slice(2, -2) }));
      else if (m[3]) pai.appendChild(h('em', { text: s.slice(1, -1) }));
      else if (m[4]) {
        var mm = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(s);
        if (seguro(mm[2])) pai.appendChild(h('a', { href: mm[2], target: '_blank', rel: 'noopener noreferrer', text: mm[1] }));
        else pai.appendChild(document.createTextNode(mm[1]));
      } else pai.appendChild(h('a', { href: s, target: '_blank', rel: 'noopener noreferrer', text: s }));
      ult = m.index + s.length;
    }
    if (ult < txt.length) pai.appendChild(document.createTextNode(txt.slice(ult)));
  }
  function bloco(cod) {
    var pre = h('pre'); pre.textContent = cod;
    var b = btn('Copiar', function () { copiar(cod, b); });
    return h('div', { class: 'cb' }, [pre, b]);
  }
  function copiar(texto, botao) {
    var ok = function () { if (botao) { var o = botao.textContent; botao.textContent = 'Copiado'; setTimeout(function () { botao.textContent = o; }, 1200); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(ok, function () {});
    else { var t = h('textarea'); t.value = texto; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); ok(); } catch (e) { /* segue */ } t.remove(); }
  }
  function tabela(linhas) {
    var cel = function (l) { return l.replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); }); };
    var t = h('table'), cab = cel(linhas[0]);
    var tr = h('tr'); cab.forEach(function (c) { var th = h('th'); inline(th, c); tr.appendChild(th); }); t.appendChild(h('thead', {}, [tr]));
    var tbd = h('tbody');
    linhas.slice(2).forEach(function (l) { var r = h('tr'); cel(l).forEach(function (c) { var td = h('td'); inline(td, c); r.appendChild(td); }); tbd.appendChild(r); });
    t.appendChild(tbd);
    return h('div', { class: 'tw' }, [t]);
  }
  function markdown(texto) {
    var raiz = document.createDocumentFragment();
    var ls = String(texto || '').replace(/\r\n?/g, '\n').split('\n'), i = 0;
    while (i < ls.length) {
      var l = ls[i], m;
      if (/^```/.test(l)) {
        var cod = []; i++;
        while (i < ls.length && !/^```/.test(ls[i])) cod.push(ls[i++]);
        i++; raiz.appendChild(bloco(cod.join('\n'))); continue;
      }
      if (!l.trim()) { i++; continue; }
      if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) { var hh = h(m[1].length <= 2 ? 'h3' : 'h4'); inline(hh, m[2]); raiz.appendChild(hh); i++; continue; }
      if (/^\|.*\|\s*$/.test(l) && i + 1 < ls.length && /^\|?\s*:?-{2,}/.test(ls[i + 1])) {
        var tl = [l, ls[i + 1]]; i += 2;
        while (i < ls.length && /^\|.*\|\s*$/.test(ls[i])) tl.push(ls[i++]);
        raiz.appendChild(tabela(tl)); continue;
      }
      if (/^\s*[-*•]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l)) {
        var ord = /^\s*\d+[.)]\s+/.test(l), lista = h(ord ? 'ol' : 'ul');
        while (i < ls.length && (ord ? /^\s*\d+[.)]\s+/ : /^\s*[-*•]\s+/).test(ls[i])) {
          var li = h('li'); inline(li, ls[i].replace(ord ? /^\s*\d+[.)]\s+/ : /^\s*[-*•]\s+/, '')); lista.appendChild(li); i++;
        }
        raiz.appendChild(lista); continue;
      }
      var par = [];
      while (i < ls.length && ls[i].trim() && !/^(```|#{1,4}\s|\s*[-*•]\s|\s*\d+[.)]\s|\|)/.test(ls[i])) par.push(ls[i++]);
      if (!par.length) { par.push(ls[i++]); }
      var p = h('p');
      par.forEach(function (x, k) { if (k) p.appendChild(h('br')); inline(p, x); });
      raiz.appendChild(p);
    }
    return raiz;
  }
  function pintar(el, texto) { el.textContent = ''; el.appendChild(markdown(texto)); }

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
    sug.forEach(function (s, i) { grade.appendChild(h('button', { type: 'button', class: 'ch', on: { click: function () { enviar(s); } } }, [h('i', { text: '0' + (i + 1) }), h('span', { text: s })])); });
    hi.appendChild(grade);
    hi.appendChild(h('small', { text: 'Não digite nome nem documento de pessoas atendidas. Digite / para atalhos. Anexe PDF para editar no aparelho.' }));
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
  [['PAIF × PAEFI', 'qual a diferença entre PAIF e PAEFI?'], ['Conta', '/conta'], ['Mapa', 'mostrar o mapa de Boa Vista'], ['Rota daqui', '/daqui'], ['Rota', '/rota'], ['PDF', '/pdf'], ['Corrigir', '/corrigir'], ['Espanhol', '/espanhol']].forEach(function (x) {
    tb.appendChild(btn(x[0], function () {
      if (x[1].charAt(0) === '/') { q.value = x[1]; var a = ATALHOS.filter(function (z) { return z.c === x[1]; })[0]; if (a) rodarAtalho(a); }
      else enviar(x[1]);
    }));
  });

  // ------------------------------------------------------------ respostas
  function rodape(r) {
    var partes = [];
    (r.fontes || []).forEach(function (f) {
      var t = [f.documento, f.norma, f.ano, f.referencia].filter(Boolean).join(' · ');
      if (t) partes.push('Fonte: ' + t);
    });
    (r.avisos || []).forEach(function (a) { partes.push(a); });
    if (!partes.length) return null;
    var f = h('div', { class: 'f' });
    partes.forEach(function (p) { f.appendChild(h('div', { text: p })); });
    return f;
  }
  function acoes(x, r, texto) {
    var ac = h('div', { class: 'ac' });
    ac.appendChild(btn('Copiar', function (e) { copiar(r.texto || '', e.target); try { P.avaliar(r, 'copiou'); } catch (er) { /* segue */ } }));
    if (r.tipo === 'ia' || r.tipo === 'norma') {
      ac.appendChild(btn('Útil', function () { try { P.avaliar(r, 'bom'); } catch (e) { /* segue */ } aviso('Anotado.'); }, 'Resposta boa'));
      ac.appendChild(btn('Não útil', function () { try { P.avaliar(r, 'ruim'); } catch (e) { /* segue */ } aviso('Anotado.'); }, 'Resposta ruim'));
      ac.appendChild(btn('Mais curto', function () { try { P.avaliar(r, 'mais_curto'); } catch (e) { /* segue */ } enviar('responda de forma mais curta'); }));
      ac.appendChild(btn('Mais detalhe', function () { try { P.avaliar(r, 'mais_detalhe'); } catch (e) { /* segue */ } enviar('explique com mais detalhe'); }));
    }
    if (ENDPOINT && window.speechSynthesis) ac.appendChild(btn('Ouvir', function () { falar(r.texto || ''); }, 'Ouvir'));
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
    if (r.tipo === 'calculo' && r.itens && r.itens.length) {
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
    var rp = rodape(r); if (rp) x.m.appendChild(rp);
    if (r.habilidades && r.habilidades.length) x.m.appendChild(h('div', { class: 'f', text: 'Habilidades usadas: ' + r.habilidades.join(', ') }));
    if (r.sugestoes && r.sugestoes.length) {
      var sg = h('div', { class: 'ac' }); r.sugestoes.slice(0, 3).forEach(function (s) { sg.appendChild(h('button', { type: 'button', class: 'ch', text: s, on: { click: function () { enviar(s); } } })); }); x.m.appendChild(sg);
    }
    if (r.tipo !== 'bloqueio' && r.tipo !== 'erro') acoes(x, r);
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
        pintar(x.corpo, texto.slice(0, i)); rolar();
        if (i >= texto.length) { resolve(); return; }
        setTimeout(f, 22);
      })();
    });
  }
  function enviar(texto) {
    texto = String(texto == null ? q.value : texto).trim();
    if (ocupado || (!texto && !anexos.length)) return;
    if (!texto) texto = 'o que posso fazer com este arquivo?';
    var arqs = anexos.slice(), nomes = arqs.map(function (a) { return a.name; });
    anexos = []; renderAnexos(); q.value = ''; autoAltura(); sl.hidden = true;
    if (vozPendente) legenda(texto, false); else legenda('');
    msgUsuario(texto, nomes);
    if (!arqs.length && pedidoDeMapa(texto)) { vozPendente = false; mostrarMapaBV(); return; }
    var x = msgPaulus(); pensando(x); x.t0 = performance.now(); if (nucleo) nucleo.impulso(); bip(520, 880, 0.12, 0.045);
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* sem vibração */ }
    ultimoPedido = texto;
    var id = ++envioAtual; atual = x; mudarBotao(true);
    var vivo = function () { return id === envioAtual; };   // falso depois de Parar ou de um envio mais novo
    P.perguntar(texto, {
      arquivos: arqs,
      onToken: function (_p, tudo) { if (!vivo()) return; fimPensando(x); legenda(''); x.streamed = true; x.corpo.classList.add('dig'); pintar(x.corpo, tudo); rolar(); }
    }).then(function (r) {
      if (!vivo()) return;
      var ms = performance.now() - x.t0, tipar = !x.streamed && !reduzido && TIPA[r.tipo] && String(r.texto || '').length > 60;
      if (tipar) { fimPensando(x); legenda(''); x.streamed = true; }
      return (tipar ? digitar(x, String(r.texto), vivo) : Promise.resolve()).then(function () {
        if (!vivo()) return;
        x.corpo.classList.remove('dig'); x.corpo.textContent = ''; desenhar(x, r);
        transcricao.push({ papel: 'Paulus', texto: r.texto || '' });
        registrar(r, ms);
        var ot = x.m.querySelector('.mh .o'); if (ot) ot.textContent = hora2() + ' · ' + tempoTxt(ms);
        if (r.tipo === 'erro') bip(320, 140, 0.26, 0.05); else { bip(880, 1320, 0.14, 0.04); setTimeout(function () { bip(1320, 1760, 0.1, 0.025); }, 110); }
        if (vozLigada) falar(r.texto || '');
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
      fl.appendChild(h('div', { class: 'fc' }, [h('span', { text: a.name }), h('button', { type: 'button', text: '✕', 'aria-label': 'Remover ' + a.name, on: { click: function () { anexos.splice(i, 1); renderAnexos(); } } })]));
    });
    ajustarBarra();
  }
  function adicionar(lista) {
    Array.prototype.forEach.call(lista || [], function (f) {
      if (/pdf|png|jpe?g/i.test(f.type) || /\.(pdf|png|jpe?g)$/i.test(f.name)) {
        if (f.size > 30 * 1024 * 1024) { aviso(f.name + ': maior que 30 MB.'); return; }
        if (anexos.length < 10) anexos.push(f);
      } else aviso(f.name + ': só PDF, PNG ou JPG.');
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
      if (window.speechSynthesis) speechSynthesis.cancel();
      if (vozLigada) vz.click();
      aviso('Modo voz desligado.');
    }
  }
  if (jv) { if (!Rec || !window.speechSynthesis) jv.hidden = true; else jv.addEventListener('click', function () { alternarModoVoz(); }); }
  function falar(t) {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(String(t).replace(/[*_`#>|]/g, '').slice(0, 1500)); u.lang = 'pt-BR';
    u.onboundary = function () { if (nucleo) nucleo.impulso(); };
    u.onstart = function () { if (!ocupado && !gravando) estadoUI('speak'); };
    u.onend = u.onerror = function () { if (estadoAtual === 'speak') estadoUI(ocupado ? 'busy' : 'idle'); if (modoVoz && !ocupado) setTimeout(function () { if (modoVoz && !ocupado && !gravando) ouvir(); }, 450); };
    speechSynthesis.speak(u);
  }
  var vz = $('vz');
  if (!window.speechSynthesis) vz.hidden = true;
  vz.addEventListener('click', function () {
    vozLigada = !vozLigada; vz.setAttribute('aria-pressed', String(vozLigada)); vz.classList.toggle('on', vozLigada);
    if (!vozLigada && window.speechSynthesis) speechSynthesis.cancel();
    var kv = $('kv'); if (kv) { kv.textContent = vozLigada ? 'LIGADA' : 'DESLIGADA'; kv.className = vozLigada ? 'ok' : ''; }
  });

  // ------------------------------------------------------------ cabeçalho
  function nova() {
    if (window.speechSynthesis) speechSynthesis.cancel();
    P.limpar(); posicao = null; var kp0 = $('kp'); if (kp0) { kp0.textContent = 'NÃO USADA'; kp0.className = ''; } transcricao = []; anexos = []; nResp = 0; legenda(''); renderAnexos(); log.textContent = ''; boasVindas(); estadoUI('idle'); q.focus();
  }
  function exportar() {
    if (!transcricao.length) { aviso('Nada para salvar ainda.'); return; }
    var md = '# Conversa com o Paulus\n\n' + new Date().toLocaleString('pt-BR') + '\n\n' +
      transcricao.map(function (t) { return '**' + t.papel + ':**\n\n' + t.texto; }).join('\n\n---\n\n') + '\n';
    baixarTexto('conversa-paulus-' + new Date().toISOString().slice(0, 10) + '.md', md, 'text/markdown;charset=utf-8');
  }
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
  q.addEventListener('input', function () { autoAltura(); selSl = 0; abrirSl(); if (nucleo) nucleo.impulso(); });
  q.addEventListener('keydown', function (e) {
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
  window.addEventListener('resize', ajustarBarra);

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
  boasVindas(); ajustarBarra(); estadoUI('idle'); q.focus();
  iniciarBoot();
})();
