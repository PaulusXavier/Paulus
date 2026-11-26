// Anotações do Paulus (lista de compras e lembretes), salvas no Firestore da própria pessoa.
// O navegador fala DIRETO com o Firebase (API REST) usando o token do login; nada passa pelo Worker nem pela IA.
// Caminho: paulus_notas/{uid}/itens/{id}. Regra de segurança: veja docs/NOTAS.md.
(function () {
  'use strict';
  var FS = 'https://firestore.googleapis.com/v1/projects/';
  var cfg = {}, itens = [], carregado = false, painel = null, aberto = false, lista = 'compras';

  // ---------------------------------------------------------------- texto
  // troca letras acentuadas por letras simples SEM mudar o tamanho do texto (os índices continuam valendo)
  function simples(t) { return String(t).toLowerCase().replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i').replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c'); }
  function maiuscula(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function separar(t) {
    return String(t).split(/\s*(?:,|;|\n|\s+e\s+)\s*/i).map(function (s) { return s.replace(/^[\s.\-–•]+|[\s.]+$/g, ''); }).filter(function (s) { return s && s.length <= 120; }).slice(0, 30).map(maiuscula);
  }
  var FIM_LISTA = /\s+(?:n[ao]|em|para a|pra|para|a)\s+(?:minha\s+|nossa\s+)?(?:lista(?:\s+de\s+compras)?|anotacoes|compras)\s*$/;
  var CONTEXTO = /\b(lista|anotac|compras|mercado|supermercado)/;

  // devolve null (não é comigo: segue para a IA) ou { acao, itens?, alvo?, todos? }
  function interpretar(texto, o) {
    var orig = String(texto || '').trim(), s = simples(orig).replace(/^(?:paulus[,:]?\s+|por favor[,:]?\s+|pode\s+|poderia\s+)+/, '');
    var corte = orig.length - s.length; // (só vale se o prefixo for de mesmo tamanho; usamos 'orig' com a mesma remoção)
    var base = orig.slice(orig.length - s.length);
    if (!s || s.length > 400) return null;
    var m;
    if (o && o.modoNota) return { acao: 'add', itens: separar(base.replace(/^(?:adicion\w+|anot\w+|coloc\w+|inclu\w+)\s+/i, '').replace(FIM_LISTA, '')) };
    if ((m = /^(?:apag\w+|limp\w+|remov\w+|exclu\w+|tir\w+)\s+(?:todas?\s+)?(?:as\s+|os\s+|todos\s+os\s+|todas\s+as\s+)?(?:\w+\s+)?(?:conclui\w+|comprad\w+|feit\w+|marcad\w+|riscad\w+)(?:\s+d[ao]\s+(?:minha\s+)?(?:lista|compras))?\s*$/.exec(s))) return { acao: 'apagar_feitos' };
    if (/^(?:limp\w+|esvazi\w+|apag\w+)\s+(?:toda\s+|tudo\s+d[ao]\s+|tudo\s*$)?(?:a\s+|minha\s+)*(?:lista|tudo|anotacoes|compras)?\s*(?:de compras)?\s*$/.test(s) && CONTEXTO.test(s + ' lista') && /lista|tudo|anotac|compras/.test(s)) return { acao: 'apagar_tudo' };
    if ((m = /^(?:apag\w+|remov\w+|exclu\w+|tir\w+)\s+(.+?)\s+d[ao]\s+(?:minha\s+)?(?:lista|compras|anotacoes)\s*$/.exec(s))) return { acao: 'apagar', alvo: base.slice(s.indexOf(m[1]), s.indexOf(m[1]) + m[1].length) };
    if ((m = /^(?:ja\s+)?(?:comprei|peguei|risquei|risca\w*)\s+(.+)$/.exec(s))) return { acao: 'feito', alvo: base.slice(s.length - m[1].length), todos: /^(?:tudo|todos|tudo isso)$/.test(m[1]) };
    if ((m = /^marc\w+\s+(.+?)\s+como\s+(?:comprad|conclui|pego)\w*\s*$/.exec(s))) return { acao: 'feito', alvo: base.slice(s.indexOf(m[1]), s.indexOf(m[1]) + m[1].length), todos: /^(?:tudo|todos|todas)$/.test(m[1]) };
    if ((m = /^(?:adicion\w+|anot\w+|coloc\w+|poe|por|inclu\w+|acrescent\w+|bot\w+)\s+(.+)$/.exec(s)) && CONTEXTO.test(s)) {
      var it = separar(base.slice(s.length - m[1].length).replace(FIM_LISTA, '').replace(/^(?:na|a|em)\s+(?:minha\s+)?lista\s*(?:de compras)?\s*[:,]?\s*/i, ''));
      return it.length ? { acao: 'add', itens: it } : null;
    }
    if ((m = /^(?:preciso comprar|tenho que comprar|nao esquecer de comprar|nao esquecer|lembrar de comprar|lembra de comprar|comprar)\s+(.+)$/.exec(s))) {
      var it2 = separar(base.slice(s.length - m[1].length).replace(FIM_LISTA, ''));
      return it2.length ? { acao: 'add', itens: it2 } : null;
    }
    if (s.length < 70 && /^(?:o que (?:ainda )?(?:falta|preciso comprar|tenho que comprar|tem na lista)|(?:ver|mostr\w+|le|ler|leia|abr\w+)\s+(?:a\s+)?(?:minha\s+)?(?:lista|anotacoes)|(?:minha\s+)?lista(?: de compras)?\s*\??$|quais (?:itens|coisas) (?:faltam|tem na lista))/.test(s)) return { acao: 'ver' };
    return null;
  }

  // ---------------------------------------------------------------- Firebase (REST)
  function jwt(token) { try { var p = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(p + '==='.slice((p.length + 3) % 4))))); } catch (e) { return null; } }
  function sessao() {
    var S = window.PaulusSessao;
    if (!S || !S.firebase || typeof S.token !== 'function') return Promise.reject(new Error('Precisa entrar com o login do Firebase para usar as anotações.'));
    return Promise.resolve(S.token()).then(function (t) {
      var c = t && jwt(t);
      if (!c || !c.aud || !(c.user_id || c.sub)) throw new Error('Sessão sem identificação do Firebase. Saia e entre de novo.');
      return { t: t, base: FS + encodeURIComponent(c.aud) + '/databases/(default)/documents/paulus_notas/' + encodeURIComponent(c.user_id || c.sub) + '/itens' };
    });
  }
  function chamar(metodo, sufixo, corpo) {
    return sessao().then(function (s) {
      return fetch(s.base + (sufixo || ''), { method: metodo, headers: { Authorization: 'Bearer ' + s.t, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }).then(function (r) {
        if (r.status === 403) throw new Error('O Firebase recusou o acesso. Falta publicar a regra das anotações (veja docs/NOTAS.md).');
        if (!r.ok) throw new Error('Não consegui falar com o Firebase agora (' + r.status + ').');
        return r.status === 204 ? {} : r.json();
      });
    }).catch(function (e) { throw e && e.message && !/Failed to fetch|NetworkError|Load failed/i.test(e.message) ? e : new Error('Sem conexão com o Firebase. Confira a internet.'); });
  }
  function doc(d) { var f = d.fields || {}; return { id: d.name.split('/').pop(), texto: (f.texto || {}).stringValue || '', lista: (f.lista || {}).stringValue || 'compras', feito: !!(f.feito || {}).booleanValue, criado: Number((f.criado || {}).integerValue || 0) }; }
  function carregar() {
    return chamar('GET', '?pageSize=300').then(function (j) { itens = (j.documents || []).map(doc).sort(function (a, b) { return a.criado - b.criado; }); carregado = true; desenhar(); return itens; });
  }
  function criar(texto) {
    var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8), agora = Date.now();
    return chamar('POST', '?documentId=' + id, { fields: { texto: { stringValue: texto }, lista: { stringValue: lista }, feito: { booleanValue: false }, criado: { integerValue: String(agora) } } })
      .then(function () { itens.push({ id: id, texto: texto, lista: lista, feito: false, criado: agora }); });
  }
  function marcar(it, feito) { return chamar('PATCH', '/' + it.id + '?updateMask.fieldPaths=feito', { fields: { feito: { booleanValue: feito } } }).then(function () { it.feito = feito; }); }
  function apagar(it) { return chamar('DELETE', '/' + it.id).then(function () { itens = itens.filter(function (x) { return x !== it; }); }); }
  function achar(alvo) { var termos = separar(alvo).map(simples); return itens.filter(function (it) { var t = simples(it.texto); return termos.some(function (x) { return x && (t.indexOf(x) >= 0 || x.indexOf(t) >= 0); }); }); }
  function todos(fn, lst) { return Promise.all(lst.map(fn)); }
  function txtLista() {
    var p = itens.filter(function (i) { return !i.feito; }), f = itens.filter(function (i) { return i.feito; });
    if (!itens.length) return 'Sua lista está vazia. Diga, por exemplo: "adicionar leite, pão e ovos na lista".';
    var t = p.length ? 'Falta comprar (' + p.length + '):\n' + p.map(function (i) { return '- ' + i.texto; }).join('\n') : 'Tudo comprado.';
    return f.length ? t + '\n\nJá comprado (' + f.length + '): ' + f.map(function (i) { return i.texto; }).join(', ') + '.' : t;
  }

  // ---------------------------------------------------------------- executar (usado por texto e por voz)
  function executar(c) {
    var pronto = carregado ? Promise.resolve() : carregar();
    return pronto.then(function () {
      if (c.acao === 'ver') return txtLista();
      if (c.acao === 'add') {
        var novos = c.itens.filter(function (t) { return !itens.some(function (i) { return !i.feito && simples(i.texto) === simples(t); }); });
        if (!novos.length) return 'Já está na lista: ' + c.itens.join(', ') + '.';
        return todos(criar, novos).then(function () { desenhar(); return 'Anotei ' + novos.join(', ') + '. Faltam ' + itens.filter(function (i) { return !i.feito; }).length + ' itens.'; });
      }
      if (c.acao === 'feito') {
        var a = c.todos ? itens.filter(function (i) { return !i.feito; }) : achar(c.alvo).filter(function (i) { return !i.feito; });
        if (!a.length) return 'Não achei "' + c.alvo + '" entre os itens pendentes.';
        return todos(function (i) { return marcar(i, true); }, a).then(function () { desenhar(); var f = itens.filter(function (i) { return !i.feito; }).length; return 'Marquei como comprado: ' + a.map(function (i) { return i.texto; }).join(', ') + '. ' + (f ? 'Faltam ' + f + '.' : 'Não falta mais nada.'); });
      }
      if (c.acao === 'apagar') {
        var b = achar(c.alvo);
        if (!b.length) return 'Não achei "' + c.alvo + '" na lista.';
        return todos(apagar, b).then(function () { desenhar(); return 'Apaguei: ' + b.map(function (i) { return i.texto; }).join(', ') + '.'; });
      }
      if (c.acao === 'apagar_feitos') {
        var d = itens.filter(function (i) { return i.feito; });
        if (!d.length) return 'Não há itens concluídos para apagar.';
        return todos(apagar, d).then(function () { desenhar(); return 'Apaguei ' + d.length + ' item(ns) concluído(s).'; });
      }
      if (c.acao === 'apagar_tudo') {
        if (!itens.length) return 'A lista já está vazia.';
        if (cfg.confirmar && !cfg.confirmar('Apagar TODAS as ' + itens.length + ' anotações?')) return 'Certo, não apaguei nada.';
        var tudo = itens.slice();
        return todos(apagar, tudo).then(function () { desenhar(); return 'Lista apagada.'; });
      }
      return '';
    });
  }

  // ---------------------------------------------------------------- painel
  function el(tag, at, filhos) { var e = document.createElement(tag); Object.keys(at || {}).forEach(function (k) { if (k === 'text') e.textContent = at[k]; else if (k === 'on') Object.keys(at.on).forEach(function (v) { e.addEventListener(v, at.on[v]); }); else e.setAttribute(k, at[k]); }); (filhos || []).forEach(function (f) { if (f) e.appendChild(f); }); return e; }
  function erro(e) { var s = painel && painel.querySelector('.ns'); if (s) { s.textContent = e.message || String(e); s.className = 'ns erro'; } }
  function ok() { var s = painel && painel.querySelector('.ns'); if (s) { s.textContent = ''; s.className = 'ns'; } }
  function criarPainel() {
    var inp = el('input', { type: 'text', class: 'ni', placeholder: 'Adicionar item (ex.: leite, pão)', maxlength: '120', 'aria-label': 'Novo item' });
    function adicionar() { var t = separar(inp.value); if (!t.length) return; inp.value = ''; executar({ acao: 'add', itens: t }).then(ok, erro); }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } });
    painel = el('div', { id: 'np', role: 'dialog', 'aria-label': 'Anotações', hidden: '' }, [
      el('h2', { text: 'Anotações · compras' }),
      el('div', { class: 'nl', 'aria-live': 'polite' }),
      el('div', { class: 'na' }, [inp, el('button', { type: 'button', class: 'nb', text: 'Adicionar', on: { click: adicionar } })]),
      el('div', { class: 'na' }, [
        el('button', { type: 'button', class: 'nd', text: 'Ditar itens', title: 'Fale os itens; eu anoto', on: { click: function () { if (cfg.ditar) cfg.ditar(); } } }),
        el('button', { type: 'button', class: 'nd', text: 'Apagar concluídos', on: { click: function () { executar({ acao: 'apagar_feitos' }).then(ok, erro); } } })
      ]),
      el('p', { class: 'ns', role: 'status' })
    ]);
    document.body.appendChild(painel);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && aberto) mostrar(false); });
  }
  function desenhar() {
    if (!painel) return;
    var l = painel.querySelector('.nl'); l.textContent = '';
    if (!itens.length) { l.appendChild(el('p', { class: 'nv', text: 'Nada anotado. Escreva abaixo ou diga: "adicionar leite e pão na lista".' })); return; }
    var ord = itens.filter(function (i) { return !i.feito; }).concat(itens.filter(function (i) { return i.feito; }));
    ord.forEach(function (it) {
      l.appendChild(el('div', { class: 'ni-l' + (it.feito ? ' feito' : '') }, [
        el('button', { type: 'button', class: 'nk', role: 'checkbox', 'aria-checked': String(it.feito), 'aria-label': (it.feito ? 'Desmarcar ' : 'Marcar como comprado: ') + it.texto, text: it.feito ? '✓' : '', on: { click: function () { marcar(it, !it.feito).then(function () { desenhar(); ok(); }, erro); } } }),
        el('span', { class: 'nt', text: it.texto }),
        el('button', { type: 'button', class: 'nx', 'aria-label': 'Apagar ' + it.texto, text: '×', on: { click: function () { apagar(it).then(function () { desenhar(); ok(); }, erro); } } })
      ]));
    });
  }
  function mostrar(v) {
    if (!painel) criarPainel();
    aberto = typeof v === 'boolean' ? v : !aberto; painel.hidden = !aberto;
    var b = document.getElementById('nt'); if (b) { b.setAttribute('aria-expanded', String(aberto)); b.classList.toggle('on', aberto); }
    if (aberto) { desenhar(); carregar().then(ok, erro); var i = painel.querySelector('.ni'); if (i && window.innerWidth > 700) i.focus(); }
  }
  function init(o) { cfg = o || {}; var b = document.getElementById('nt'); if (b) b.addEventListener('click', function () { mostrar(); }); }

  window.PaulusNotas = { init: init, interpretar: interpretar, executar: executar, abrir: mostrar, _simples: simples };
})();
