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

  P.init({
    app: 'paulus',
    endpoint: ENDPOINT || undefined,
    conhecimentoUrl: 'conhecimento.json'
  });

  var log = $('log'), q = $('q'), go = $('go'), fl = $('fl'), pi = $('pi'), sl = $('sl'), tb = $('tb'), dn = $('dn');
  var anexos = [];            // File[]
  var transcricao = [];       // [{papel, texto}] para exportar
  var ocupado = false, descartar = false, vozLigada = false;
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
  function status(t) { if (st) st.textContent = t; }
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
  function limparBoasVindas() { var o = log.querySelector('.hi'); if (o) o.remove(); }
  function msgUsuario(texto, nomes) {
    limparBoasVindas();
    var corpo = h('div', { text: texto });
    var m = h('div', { class: 'm u' }, [corpo]);
    if (nomes && nomes.length) m.appendChild(h('div', { class: 'f', text: '📎 ' + nomes.join(', ') }));
    m.appendChild(h('button', { type: 'button', class: 'ue', text: 'Editar', title: 'Editar e reenviar', on: { click: function () { q.value = texto; autoAltura(); q.focus(); } } }));
    log.appendChild(m); transcricao.push({ papel: 'Você', texto: texto }); rolar(true); return m;
  }
  function msgPaulus() {
    limparBoasVindas();
    var corpo = h('div', { class: 'mc' });
    var m = h('div', { class: 'm p' }, [corpo]);
    log.appendChild(m); rolar(true); return { m: m, corpo: corpo };
  }
  function boasVindas() {
    var sk = P.skin('paulus') || {};
    var sug = (P.sugestoesPessoais ? P.sugestoesPessoais(3) : []).concat(sk.sugestoes || []);
    var vistos = {}; sug = sug.filter(function (s) { if (!s || vistos[s]) return false; vistos[s] = 1; return true; }).slice(0, 4);
    var hi = h('div', { class: 'hi' }, [
      h('h2', { text: 'Paulus' }),
      h('p', { text: sk.saudacao || 'Console do Paulus no ar. Pergunte por texto ou voz.' })
    ]);
    sug.forEach(function (s) { hi.appendChild(h('button', { type: 'button', class: 'ch', text: s, on: { click: function () { enviar(s); } } })); });
    hi.appendChild(h('small', { text: 'Não digite nome nem documento de pessoas atendidas. Digite / para atalhos. Anexe PDF para editar no aparelho.' }));
    log.appendChild(hi);
  }

  // ------------------------------------------------------------ atalhos
  var ATALHOS = [
    { c: '/nova', d: 'Nova conversa', f: function () { nova(); } },
    { c: '/salvar', d: 'Salvar conversa em .md', f: function () { exportar(); } },
    { c: '/ajuda', d: 'O que o Paulus sabe fazer', t: 'o que você sabe fazer?' },
    { c: '/pdf', d: 'Editar PDF (anexe o arquivo)', t: 'juntar os PDFs anexados' },
    { c: '/rota', d: 'Traçar rota entre unidades', t: 'traçar rota saindo do CRAS: ' },
    { c: '/conta', d: 'Fazer uma conta', t: 'quanto é ' },
    { c: '/corrigir', d: 'Corrigir ortografia', t: 'corrija a ortografia e a gramática: ' },
    { c: '/espanhol', d: 'Vocabulário em espanhol', t: 'como se diz em espanhol: ' },
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
  function aviso(t) { pi.textContent = t; setTimeout(function () { if (pi.textContent === t) pi.textContent = ''; ajustarBarra(); }, 3500); ajustarBarra(); }

  // barra de tarefas rápidas
  [['PAIF × PAEFI', 'qual a diferença entre PAIF e PAEFI?'], ['Conta', '/conta'], ['Rota', '/rota'], ['PDF', '/pdf'], ['Corrigir', '/corrigir'], ['Espanhol', '/espanhol']].forEach(function (x) {
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
      ac.appendChild(btn('👍', function () { try { P.avaliar(r, 'bom'); } catch (e) { /* segue */ } aviso('Anotado.'); }, 'Resposta boa'));
      ac.appendChild(btn('👎', function () { try { P.avaliar(r, 'ruim'); } catch (e) { /* segue */ } aviso('Anotado.'); }, 'Resposta ruim'));
      ac.appendChild(btn('Mais curto', function () { try { P.avaliar(r, 'mais_curto'); } catch (e) { /* segue */ } enviar('responda de forma mais curta'); }));
      ac.appendChild(btn('Mais detalhe', function () { try { P.avaliar(r, 'mais_detalhe'); } catch (e) { /* segue */ } enviar('explique com mais detalhe'); }));
    }
    if (ENDPOINT && window.speechSynthesis) ac.appendChild(btn('🔊', function () { falar(r.texto || ''); }, 'Ouvir'));
    x.m.appendChild(ac);
  }
  function baixarTexto(nome, conteudo, tipo) {
    var url = URL.createObjectURL(new Blob([conteudo], { type: tipo || 'text/plain;charset=utf-8' }));
    var a = h('a', { href: url, download: nome }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function desenhar(x, r) {
    var corpo = x.corpo;
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
      if (r.svg) { var img = h('img', { alt: 'Desenho da rota', src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.svg) }); img.style.cssText = 'max-width:100%;background:#fff;border-radius:8px;margin-top:6px'; x.m.appendChild(img); }
      var ac2 = h('div', { class: 'ac' });
      (r.links || []).forEach(function (l, i) {
        var url = typeof l === 'string' ? l : l.url, rot = typeof l === 'string' ? 'Abrir no mapa ' + (i + 1) : (l.rotulo || 'Abrir no mapa');
        if (url && /^https:\/\//.test(url)) ac2.appendChild(h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: rot }));
      });
      if (r.gpx) ac2.appendChild(btn('GPX', function () { baixarTexto('rota.gpx', r.gpx, 'application/gpx+xml'); }));
      if (r.kml) ac2.appendChild(btn('KML', function () { baixarTexto('rota.kml', r.kml, 'application/vnd.google-earth.kml+xml'); }));
      if (ac2.childNodes.length) x.m.appendChild(ac2);
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

  // ------------------------------------------------------------ envio
  function mudarBotao(enviando) {
    go.textContent = enviando ? 'Parar' : 'Enviar'; go.classList.toggle('stop', enviando);
    status(enviando ? 'PENSANDO…' : 'EM ESPERA'); ocupado = enviando;
  }
  function enviar(texto) {
    texto = String(texto == null ? q.value : texto).trim();
    if (ocupado || (!texto && !anexos.length)) return;
    if (!texto) texto = 'o que posso fazer com este arquivo?';
    var arqs = anexos.slice(), nomes = arqs.map(function (a) { return a.name; });
    anexos = []; renderAnexos(); q.value = ''; autoAltura(); sl.hidden = true;
    msgUsuario(texto, nomes);
    var x = msgPaulus(); x.corpo.textContent = '…';
    descartar = false; mudarBotao(true);
    var recebeu = false;
    P.perguntar(texto, {
      arquivos: arqs,
      onToken: function (_p, tudo) { if (descartar) return; recebeu = true; pintar(x.corpo, tudo); rolar(); }
    }).then(function (r) {
      if (descartar) { x.m.remove(); return; }
      if (r.tipo === 'ia' && recebeu) { x.corpo.textContent = ''; }
      x.corpo.textContent = ''; desenhar(x, r);
      transcricao.push({ papel: 'Paulus', texto: r.texto || '' });
      if (vozLigada) falar(r.texto || '');
      rolar(true);
    }).catch(function () {
      if (!descartar) { x.corpo.textContent = 'Algo deu errado. Tente de novo.'; }
    }).then(function () { mudarBotao(false); });
  }
  function parar() { descartar = true; mudarBotao(false); aviso('Interrompido.'); }

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
  mic.addEventListener('click', function () {
    if (!Rec) return;
    if (gravando && rec) { rec.stop(); return; }
    rec = new Rec(); rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = false;
    var base = q.value ? q.value + ' ' : '';
    rec.onresult = function (e) { var t = ''; for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; q.value = base + t; autoAltura(); };
    rec.onend = function () { gravando = false; mic.classList.remove('on'); status('EM ESPERA'); };
    rec.onerror = function () { gravando = false; mic.classList.remove('on'); aviso('Não consegui ouvir. Confira a permissão do microfone.'); };
    try { rec.start(); gravando = true; mic.classList.add('on'); status('OUVINDO…'); } catch (e) { /* segue */ }
  });
  function falar(t) {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(String(t).replace(/[*_`#>|]/g, '').slice(0, 1500)); u.lang = 'pt-BR'; speechSynthesis.speak(u);
  }
  var vz = $('vz');
  if (!window.speechSynthesis) vz.hidden = true;
  vz.addEventListener('click', function () {
    vozLigada = !vozLigada; vz.setAttribute('aria-pressed', String(vozLigada)); vz.classList.toggle('on', vozLigada);
    if (!vozLigada && window.speechSynthesis) speechSynthesis.cancel();
  });

  // ------------------------------------------------------------ cabeçalho
  function nova() {
    if (window.speechSynthesis) speechSynthesis.cancel();
    P.limpar(); transcricao = []; anexos = []; renderAnexos(); log.textContent = ''; boasVindas(); status('EM ESPERA'); q.focus();
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
  q.addEventListener('input', function () { autoAltura(); selSl = 0; abrirSl(); });
  q.addEventListener('keydown', function (e) {
    if (!sl.hidden) {
      if (e.key === 'ArrowDown') { e.preventDefault(); selSl = (selSl + 1) % listaSl.length; abrirSl(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); selSl = (selSl - 1 + listaSl.length) % listaSl.length; abrirSl(); return; }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); rodarAtalho(listaSl[selSl]); return; }
      if (e.key === 'Escape') { sl.hidden = true; return; }
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

  // ------------------------------------------------------------ esfera do topo
  var cv = $('orb');
  if (cv && cv.getContext && !reduzido) {
    var cx = cv.getContext('2d'), t0 = 0;
    var quadro = function (t) {
      var w = cv.width = cv.clientWidth * (window.devicePixelRatio || 1), hh = cv.height = cv.clientHeight * (window.devicePixelRatio || 1);
      cx.clearRect(0, 0, w, hh);
      var amp = ocupado ? 14 : gravando ? 10 : 4;
      for (var k = 0; k < 3; k++) {
        cx.beginPath(); cx.strokeStyle = 'rgba(55,230,255,' + (0.5 - k * 0.15) + ')'; cx.lineWidth = 1.5;
        for (var xx = 0; xx <= w; xx += 6) {
          var yy = hh * 0.55 + Math.sin(xx / 70 + t / 600 * (1 + k * 0.4)) * amp * Math.sin(xx / w * Math.PI) * (1 - k * 0.25);
          if (xx) cx.lineTo(xx, yy); else cx.moveTo(xx, yy);
        }
        cx.stroke();
      }
      requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);
  }

  boasVindas(); ajustarBarra(); status('EM ESPERA'); q.focus();
})();
