/* Agenda do Paulus — mesma agenda do Argo SUAS (feriados, pagamentos, datas do MDS, anotações com hora, tipo,
   repetição e conclusão) num visual de painel tecnológico.

   SINCRONIZAÇÃO: usa o MESMO projeto Firebase do Argo ("agenda-boa-vista") e o MESMO caminho
   agendas/{código}/notes/{AAAA-MM-DD}, com o mesmo formato de documento ({ entries: [...] }) e a mesma cifragem das
   anotações (enc1, chave derivada da senha da equipe do Argo). Com o mesmo código e a mesma senha, o que se anota aqui
   aparece no Argo e vice-versa. A senha nunca é gravada em disco; só a chave fica na memória (e na sessão da aba). */
(function () {
  'use strict';

  /* ---------- configuração ---------- */
  // Config pública do app web do Firebase (a mesma que está no js/app.js do Argo). Não é segredo: quem protege os
  // dados são as regras do Firestore, o código de sincronização e a cifragem das anotações.
  var FIREBASE_CONFIG = {
    apiKey: 'AIzaSyDiqeeApAASF0GUPv940EpITwIPtkZ65jA',
    authDomain: 'agenda-boa-vista.firebaseapp.com',
    projectId: 'agenda-boa-vista',
    storageBucket: 'agenda-boa-vista.firebasestorage.app',
    messagingSenderId: '1008550278960',
    appId: '1:1008550278960:web:59f247b9dfe549f3babaf5'
  };
  var CDN = ['https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'];
  var STORE = 'paulus.agenda.v1', CODE = 'paulus.agenda.codigo', VIEW = 'paulus.agenda.visao', DIRTY = 'paulus.agenda.pendentes', SKEY = 'paulus.agenda.chave';
  var KEY_TTL = 12 * 3600 * 1000;
  var MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  var WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  var CATS = {
    atendimento: { label: 'Atendimento', color: '#37e6ff' },
    visita: { label: 'Visita', color: '#ffb347' },
    grupo: { label: 'Grupo', color: '#b48cff' },
    reuniao: { label: 'Reunião', color: '#6ee7a8' },
    prazo: { label: 'Prazo', color: '#ff6b5e' }
  };
  var WD = { dom: 0, domingo: 0, seg: 1, segunda: 1, ter: 2, terca: 2, 'terça': 2, qua: 3, quarta: 3, qui: 4, quinta: 4, sex: 5, sexta: 5, sab: 6, sabado: 6, 'sábado': 6, 'sáb': 6 };

  /* ---------- estado ---------- */
  var state = { days: {}, locked: {}, dirty: {}, code: '', key: null, db: null, unsub: null, sync: 'off', lastSync: null, connecting: '' };
  var ui = null, month = new Date(), chosen = new Date(), tab = 'month', editing = null, armed = null, armTimer = null, alerted = {};
  var view = { week: false, hideDone: false };

  /* ---------- utilidades ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function day(k) { var p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dlabel(d, o) { return d.toLocaleDateString('pt-BR', o || { day: '2-digit', month: '2-digit' }); }
  function rows(k) { return state.days[k] || []; }
  function q(s) { return ui.querySelector(s); }
  function cleanCat(c) { return typeof c === 'string' && Object.prototype.hasOwnProperty.call(CATS, c) ? c : ''; }
  function cleanTime(t) { return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : ''; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) { /* sem armazenamento */ } }
  function order(entries) {
    return entries.map(function (e, i) { return i; }).sort(function (a, b) {
      var ta = cleanTime(entries[a].time), tb = cleanTime(entries[b].time);
      if (ta && tb) return ta < tb ? -1 : ta > tb ? 1 : a - b;
      if (ta) return -1; if (tb) return 1; return a - b;
    });
  }

  /* ---------- datas oficiais (feriados, pagamentos) e datas do MDS ---------- */
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mo - 1, da, 12);
  }
  // Ano sem cadastro oficial: só o que é previsível (feriados fixos e os que dependem da Páscoa). Pagamentos e pontes NÃO são inventados.
  function computeYear(y) {
    var out = {}, F = 'feriado', Q = 'facultativo';
    [[1, 1, 'CONF.'], [1, 20, 'S. SEB.'], [4, 21, 'TIR.'], [5, 1, 'TRAB.'], [6, 29, 'S. PED.'], [7, 9, 'B. VIST.'], [9, 7, 'IND.'], [10, 5, 'ROR.'], [10, 12, 'APAR.'], [10, 28, 'SERV.'],
      [11, 2, 'FIN.'], [11, 15, 'REP.'], [11, 20, 'C. NEG.'], [12, 8, 'CONC.'], [12, 25, 'NATAL']].forEach(function (r) { out[y + '-' + pad(r[0]) + '-' + pad(r[1])] = [r[2], F]; });
    var e = easter(y);
    function rel(n, l, t) { var d = new Date(e); d.setDate(d.getDate() + n); out[key(d)] = [l, t]; }
    rel(-48, 'CAR.', Q); rel(-47, 'CAR.', Q); rel(-46, 'CIN.', Q); rel(-2, 'PAIX.', F); rel(60, 'CORP.', F);
    return out;
  }
  var yearCache = {};
  function yearData(y) {
    if (!yearCache[y]) {
      var A = window.PaulusAgendaDatas || {}, reg = (A.anos || {})[y];
      yearCache[y] = { map: reg || computeYear(y), estimated: !reg };
    }
    return yearCache[y];
  }
  function official(k) { return yearData(+k.slice(0, 4)).map[k] || null; }
  function officialName(k) { var o = official(k), n = (window.PaulusAgendaDatas || {}).nomes || {}; return o ? (n[o[0]] || o[0]) : ''; }
  var mdsByDay = null;
  function mds() {
    if (mdsByDay) return mdsByDay;
    mdsByDay = {};
    var M = window.ARGO_MDS || {};
    (Array.isArray(M.datas) ? M.datas : []).forEach(function (it) {
      if (!it || typeof it.d !== 'string' || typeof it.t !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(it.d)) return;
      (mdsByDay[it.d] = mdsByDay[it.d] || []).push(it);
    });
    return mdsByDay;
  }
  function mdsCat(it) { var M = window.ARGO_MDS || {}; return (M.categorias && M.categorias[it.cat]) || 'MDS'; }
  function mdsSource(it) { var M = window.ARGO_MDS || {}; return it.f && M.fontes ? M.fontes[it.f] : null; }
  function mdsText(it) { return (it.prev ? '~ ' : '') + it.t; }

  /* ---------- cifragem (idêntica à do Argo: enc1) ---------- */
  function toB64(b) { var s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function fromB64(s) { var x = atob(s), b = new Uint8Array(x.length); for (var i = 0; i < x.length; i++) b[i] = x.charCodeAt(i); return b; }
  function stream(bytes, keyBytes, nonce) {
    var mix = new Uint8Array(keyBytes.length + nonce.length); mix.set(keyBytes); mix.set(nonce, keyBytes.length);
    var h = 2166136261 >>> 0, i;
    for (i = 0; i < mix.length; i++) { h ^= mix[i]; h = Math.imul(h, 16777619); }
    var a = h >>> 0, out = new Uint8Array(bytes.length);
    for (i = 0; i < bytes.length; i++) {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      out[i] = bytes[i] ^ ((t ^ (t >>> 14)) >>> 24);
    }
    return out;
  }
  function enc(text, k) {
    k = k || state.key; if (!k) throw new Error('trancada');
    var nonce = crypto.getRandomValues(new Uint8Array(16));
    return 'enc1:' + toB64(nonce) + ':' + toB64(stream(new TextEncoder().encode(String(text)), k, nonce));
  }
  // Devolve o texto, ou null quando não dá para ler (outra senha, formato enc2 ou lixo). Texto sem prefixo é texto antigo em claro.
  function dec(text, k) {
    k = k || state.key;
    if (typeof text !== 'string') return null;
    if (text.indexOf('enc') !== 0) return text;
    if (text.indexOf('enc1:') !== 0 || !k) return null;
    var p = text.split(':');
    if (p.length !== 3) return null;
    try {
      var s = new TextDecoder('utf-8', { fatal: true }).decode(stream(fromB64(p[2]), k, fromB64(p[1])));
      return /[\u0000-\u0008\u000e-\u001f\ufffd]/.test(s) ? null : s;   // senha errada vira lixo: recusa em vez de mostrar
    } catch (_) { return null; }
  }
  function derive(pass) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode('argo-suas-enc-v1:' + pass)).then(function (x) { return new Uint8Array(x); });
  }
  function keyRemember() { try { sessionStorage.setItem(SKEY, JSON.stringify({ k: toB64(state.key), exp: Date.now() + KEY_TTL })); } catch (_) { /* sem sessionStorage */ } }
  function keyRestore() {
    try {
      var r = JSON.parse(sessionStorage.getItem(SKEY) || 'null');
      if (r && r.k && Date.now() < r.exp) { state.key = fromB64(r.k); return true; }
      sessionStorage.removeItem(SKEY);
    } catch (_) { /* ignora */ }
    return false;
  }

  /* ---------- armazenamento local (cifrado) ---------- */
  function saveLocal() {
    if (!state.key) return;
    var out = {};
    Object.keys(state.days).forEach(function (k) { if (state.days[k].length) out[k] = state.days[k].map(function (e) { return Object.assign({}, e, { text: enc(e.text) }); }); });
    lsSet(STORE, JSON.stringify({ days: out }));
    lsSet(DIRTY, JSON.stringify(state.dirty));
  }
  function loadLocal() {
    try {
      var x = JSON.parse(lsGet(STORE) || '{}'), out = {}, bad = false;
      Object.keys(x.days || {}).forEach(function (k) {
        out[k] = (x.days[k] || []).map(function (e) { var t = dec(e.text); if (t === null) { bad = true; return null; } return Object.assign({}, e, { text: t }); }).filter(Boolean);
      });
      if (bad) return false;
      state.days = out;
      try { state.dirty = JSON.parse(lsGet(DIRTY) || '{}') || {}; } catch (_) { state.dirty = {}; }
      return true;
    } catch (_) { return false; }
  }
  function loadView() { try { var v = JSON.parse(lsGet(VIEW) || '{}'); view.week = !!v.week; view.hideDone = !!v.hideDone; } catch (_) { /* padrão */ } }
  function saveView() { lsSet(VIEW, JSON.stringify(view)); }

  /* ---------- nuvem (Firestore do Argo) ---------- */
  var loading = null;
  function loadScript(u) {
    return new Promise(function (ok, no) {
      var s = document.createElement('script'); s.src = u; s.onload = ok;
      s.onerror = function () { no(new Error('Não foi possível carregar a sincronização (verifique a internet).')); };
      document.head.appendChild(s);
    });
  }
  function ensureFirebase() {
    if (window.firebase && window.firebase.firestore) return Promise.resolve(window.firebase);
    if (!loading) loading = loadScript(CDN[0]).then(function () { return loadScript(CDN[1]); }).then(function () { return window.firebase; }, function (e) { loading = null; throw e; });
    return loading;
  }
  function cloudCol() { return state.db.collection('agendas').doc(state.code).collection('notes'); }
  function errText(e) {
    var c = e && e.code ? String(e.code) : '';
    if (c === 'permission-denied') return 'o Firebase recusou o acesso (regras do Firestore)';
    if (c === 'unauthenticated') return 'o Firebase exige login (regras do Firestore)';
    if (c === 'resource-exhausted') return 'cota do Firebase esgotada hoje';
    if (c === 'unavailable') return 'sem conexão com o Firebase';
    if (e && e.message === 'trancada') return 'a agenda está trancada; informe a senha';
    if (e && e.message === 'outra-senha') return 'este dia tem notas feitas com outra senha; nada foi alterado';
    return c || (e && e.message) || 'erro desconhecido';
  }
  function setSync(s, msg) { state.sync = s; if (msg !== undefined) { state.msg = msg; status(msg, s === 'error'); } paintSync(); refreshGreeting(); }
  function connect(force) {
    var code = state.code;
    if (!code || !state.key) return Promise.resolve();
    if (!force && state.connecting === code && (state.unsub || state.sync === 'connecting')) return Promise.resolve();
    if (navigator.onLine === false) { state.connecting = ''; setSync('error', 'Sem internet: a agenda sincroniza quando a conexão voltar.'); return Promise.resolve(); }
    state.connecting = code;
    setSync('connecting', 'Conectando ao Firebase do Argo…');
    return ensureFirebase().then(function (fb) {
      var app = fb.apps.filter(function (a) { return a.name === 'agenda'; })[0] || fb.initializeApp(FIREBASE_CONFIG, 'agenda');
      state.db = app.firestore();
      if (state.unsub) { try { state.unsub(); } catch (_) { /* já encerrada */ } }
      state.unsub = cloudCol().onSnapshot(onSnap, function (e) {
        try { if (state.unsub) state.unsub(); } catch (_) { /* já encerrada */ }
        state.unsub = null; state.connecting = '';
        setSync('error', 'Erro de sincronização: ' + errText(e));
      });
    }).catch(function (e) { state.connecting = ''; setSync('error', e.message); });
  }
  function onSnap(snap) {
    if (!state.key) return;
    var cloud = {}, locked = {}, docs = 0, unread = 0;
    snap.forEach(function (d) {
      var data = d.data() || {}, raw = [];
      if (Array.isArray(data.entries)) raw = data.entries.filter(function (e) { return e && e.text; });
      else if (data.text) raw = [{ text: data.text, createdAt: data.updatedAt && data.updatedAt.toMillis ? data.updatedAt.toMillis() : Date.now() }];
      var out = [];
      raw.forEach(function (e) { var t = dec(e.text); if (t) out.push(Object.assign({}, e, { text: t })); });
      docs++;
      if (out.length < raw.length) { locked[d.id] = 1; unread++; }
      if (out.length) cloud[d.id] = out;
    });
    if (docs && unread === docs) { setSync('error', 'A senha não confere com as notas do Argo. Nada foi substituído. Confira a senha.'); state.locked = locked; return; }
    // Dias alterados aqui e ainda não confirmados pela nuvem: a versão local vence e é reenviada.
    var resend = [];
    Object.keys(state.dirty).forEach(function (k) {
      if (locked[k]) { delete state.dirty[k]; return; }
      var l = state.days[k] || [];
      if (l.length) cloud[k] = l; else delete cloud[k];
      resend.push({ k: k, entries: l });
    });
    state.days = cloud; state.locked = locked; state.lastSync = new Date();
    saveLocal(); render();
    setSync('ok', !docs ? 'Conectado, mas não há anotações com o código "' + state.code + '". Confira o código no Argo (Agenda → sincronização).' : 'Conectado ao Firebase do Argo' + (unread ? ' · ' + unread + ' dia(s) de outra senha ignorado(s)' : ''));
    if (resend.length) cloudWrite(resend).catch(function () { /* continua pendente */ });
  }
  function forCloud(e) { var o = Object.assign({}, e, { text: enc(e.text) }); if (typeof o.createdAt !== 'number') o.createdAt = Date.now(); return o; }
  // Grava vários dias numa operação só (tudo ou nada). Lista vazia apaga o dia. Resolve 'ok', 'slow' (sem resposta a tempo) ou 'local'.
  function cloudWrite(updates) {
    if (!state.db || !state.code || state.sync === 'error' && !state.unsub) return Promise.resolve('local');
    var bad = updates.filter(function (u) { return state.locked[u.k]; })[0];
    if (bad) return Promise.reject(new Error('outra-senha'));
    var b = state.db.batch(), col = cloudCol();
    updates.forEach(function (u) { var ref = col.doc(u.k); if (u.entries.length) b.set(ref, { entries: u.entries.map(forCloud) }); else b.delete(ref); });
    var op = b.commit();
    op.then(function () { updates.forEach(function (u) { delete state.dirty[u.k]; }); saveLocal(); }, function () { /* continua pendente */ });
    return Promise.race([op.then(function () { return 'ok'; }), new Promise(function (r) { setTimeout(function () { r('slow'); }, 8000); })]);
  }
  // Grava local na hora e depois na nuvem. updates: [{k, entries}]
  function commit(updates, okMsg) {
    for (var i = 0; i < updates.length; i++) if (state.locked[updates[i].k]) { status(errText(new Error('outra-senha')), true); return Promise.resolve(false); }
    updates.forEach(function (u) { if (u.entries.length) state.days[u.k] = u.entries; else delete state.days[u.k]; state.dirty[u.k] = 1; });
    saveLocal(); render();
    return cloudWrite(updates).then(function (r) {
      status(okMsg + (r === 'local' ? ' (neste aparelho)' : r === 'slow' ? ' · sincronização pendente' : ''), false);
      return true;
    }, function (e) { status('Salvo neste aparelho; nuvem: ' + errText(e), true); return true; });
  }

  /* ---------- entrada rápida: "amanhã 14h #visita reunião CRAS" ---------- */
  function parseQuick(raw) {
    var text = String(raw || '').replace(/\s+/g, ' ').trim(), cat = '', m;
    text = text.replace(/(^|\s)#([\p{L}]+)(?=\s|$)/gu, function (all, sp, tag) {
      var t = norm(tag), k = t.length >= 2 ? Object.keys(CATS).filter(function (c) { return c.indexOf(t) === 0; })[0] : '';
      if (!k) return all; if (!cat) cat = k; return sp;
    }).replace(/\s+/g, ' ').trim();
    var now = new Date(), base = new Date(chosen.getFullYear(), chosen.getMonth(), chosen.getDate(), 12), today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    var date = new Date(base), time = '', rec = null, bad = false, dateWord = false;
    function sinceBase(wd, allowSame) { var add = (wd - today.getDay() + 7) % 7; if (!add && !allowSame) add = 7; var d = new Date(today); d.setDate(today.getDate() + add); return d; }
    for (var g = 0; g < 4; g++) {
      if (!rec && (m = /^(?:toda|todas as|todo|todos os)\s+(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)s?(?:-feiras?)?(?=\s|$)/i.exec(text))) {
        date = sinceBase(WD[m[1].toLowerCase()], true); rec = { type: 'weekly', step: 7 }; dateWord = true; text = text.slice(m[0].length).trim(); continue;
      }
      if (!rec && (m = /^(?:toda semana|todas as semanas)(?=\s|$)/i.exec(text))) { rec = { type: 'weekly', step: 7 }; dateWord = true; date = new Date(base); text = text.slice(m[0].length).trim(); continue; }
      if (!rec && (m = /^(?:quinzenal(?:mente)?|a cada (?:2|duas) semanas|a cada quinze dias)(?=\s|$)/i.exec(text))) { rec = { type: 'weekly', step: 14 }; dateWord = true; date = new Date(base); text = text.slice(m[0].length).trim(); continue; }
      if (!rec && (m = /^todo m[eê]s(?=\s|$)/i.exec(text))) { rec = { type: 'monthly', day: 0 }; dateWord = true; date = new Date(base); text = text.slice(m[0].length).trim(); continue; }
      if (!rec && (m = /^todo dia (\d{1,2})(?=\s|$)/i.exec(text)) && +m[1] >= 1 && +m[1] <= 31) {
        var n = +m[1], c = new Date(today.getFullYear(), today.getMonth(), Math.min(n, new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()), 12);
        if (c < today) c = new Date(today.getFullYear(), today.getMonth() + 1, Math.min(n, new Date(today.getFullYear(), today.getMonth() + 2, 0).getDate()), 12);
        date = c; rec = { type: 'monthly', day: n }; dateWord = true; text = text.slice(m[0].length).trim(); continue;
      }
      if ((m = /^(depois de amanh[ãa]|amanh[ãa]|hoje)(?=\s|$)/i.exec(text))) {
        var w = m[1].toLowerCase(), add = /^depois/.test(w) ? 2 : /^amanh/.test(w) ? 1 : 0;
        date = new Date(today); date.setDate(today.getDate() + add); dateWord = true; text = text.slice(m[0].length).trim(); continue;
      }
      if ((m = /^(segunda|seg|ter[çc]a|ter|quarta|qua|quinta|qui|sexta|sex|s[áa]bado|s[áa]b|domingo|dom)(?:-feira)?(?=\s|$)/i.exec(text))) {
        date = sinceBase(WD[m[1].toLowerCase()], false); dateWord = true; text = text.slice(m[0].length).trim(); continue;
      }
      if ((m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?=\s|$)/.exec(text))) {
        var d1 = +m[1], mo = +m[2], yy = m[3] ? +m[3] : base.getFullYear(), cand = new Date(yy, mo - 1, d1, 12);
        if (mo >= 1 && mo <= 12 && cand.getMonth() === mo - 1 && cand.getDate() === d1) { date = cand; dateWord = true; text = text.slice(m[0].length).trim(); continue; }
        bad = true; break;
      }
      if (!time && (m = /^([01]?\d|2[0-3])(?::([0-5]\d)|h([0-5]\d)?)(?=\s|$)/i.exec(text))) { time = pad(+m[1]) + ':' + (m[2] || m[3] || '00'); text = text.slice(m[0].length).trim(); continue; }
      break;
    }
    var recOut = null;
    if (rec && !bad) {
      var dates = recurDates(rec, date);
      if (dates.length > 1) recOut = { type: rec.type, dates: dates };
    }
    return { text: text, cat: cat, time: cleanTime(time), date: bad ? null : date, dateWord: dateWord, rec: recOut, bad: bad };
  }
  // Datas de uma repetição: até 31/12 do ano da primeira data (no máximo 60 semanais ou 12 mensais).
  function recurDates(rec, start) {
    var out = [], y = start.getFullYear(), end = new Date(y, 11, 31, 12), s = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12);
    if (rec.type === 'weekly') {
      for (var d = s; d <= end && out.length < 60; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + rec.step, 12)) out.push(d);
    } else {
      var dn = rec.day || s.getDate();
      for (var mo = s.getMonth(); mo < 12 && out.length < 12; mo++) {
        var d2 = new Date(y, mo, Math.min(dn, new Date(y, mo + 1, 0).getDate()), 12);
        if (d2 >= s) out.push(d2);
      }
    }
    return out;
  }

  /* ---------- ações sobre anotações ---------- */
  function needKey() { if (state.key) return false; showSetup(); status('Informe a senha para abrir as anotações.', true); return true; }
  function addEntry() {
    if (needKey()) return;
    var input = q('[data-entry]'), p = parseQuick(input.value);
    if (!p.text) { status('Escreva o texto da anotação.', true); return; }
    if (p.bad || !p.date) { status('Não entendi a data. Use hoje, amanhã, sexta, 15/12…', true); return; }
    var ed = editing, createdAt = Date.now();
    if (ed) {
      var list = rows(ed.k).slice(), cur = list[ed.i];
      if (!cur) { cancelEdit(); return; }
      var nk = key(p.date), upd = Object.assign({}, cur, { text: p.text.slice(0, 500), time: p.time || '', cat: p.cat || '' });
      var ups = [];
      if (nk === ed.k) { list[ed.i] = upd; ups.push({ k: ed.k, entries: list }); }
      else { list.splice(ed.i, 1); ups.push({ k: ed.k, entries: list }, { k: nk, entries: rows(nk).concat([upd]) }); }
      cancelEdit(); input.value = '';
      commit(ups, 'Anotação atualizada.'); return;
    }
    var entry = { text: p.text.slice(0, 500), time: p.time || '', cat: p.cat || '', done: false, createdAt: createdAt };
    var updates;
    if (p.rec) {
      var series = 's' + createdAt.toString(36);
      updates = p.rec.dates.map(function (d) { var k = key(d); return { k: k, entries: rows(k).concat([Object.assign({}, entry, { series: series, createdAt: createdAt })]) }; });
      updates = updates.filter(function (u) { return !state.locked[u.k]; });
    } else updates = [{ k: key(p.date), entries: rows(key(p.date)).concat([entry]) }];
    input.value = ''; hint();
    if (!p.rec) { chosen = p.date; month = new Date(chosen.getFullYear(), chosen.getMonth(), 1, 12); }
    commit(updates, p.rec ? updates.length + ' anotações criadas.' : 'Anotação salva para ' + dlabel(p.date) + '.');
  }
  function startEdit(k, i) {
    var e = rows(k)[i]; if (!e) return;
    editing = { k: k, i: i }; chosen = day(k);
    var input = q('[data-entry]');
    input.value = (k !== key(new Date()) ? dlabel(day(k), { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' : '') + (e.time ? e.time + ' ' : '') + (e.cat ? '#' + e.cat + ' ' : '') + e.text;
    q('[data-add]').textContent = '✓'; q('[data-cancel-edit]').hidden = false; input.focus(); hint(); render();
  }
  function cancelEdit() { editing = null; q('[data-add]').textContent = '＋'; q('[data-cancel-edit]').hidden = true; q('[data-entry]').value = ''; hint(); }
  function toggleDone(k, i, v) { var l = rows(k).slice(); if (!l[i]) return; l[i] = Object.assign({}, l[i], { done: !!v }); commit([{ k: k, entries: l }], v ? 'Concluída.' : 'Reaberta.'); }
  function removeEntry(k, i, scope) {
    var l = rows(k), e = l[i]; if (!e) return;
    var ups = [];
    if (scope === 'series' && e.series) {
      Object.keys(state.days).forEach(function (dk) {
        if (dk < k) return;
        var keep = state.days[dk].filter(function (x) { return x.series !== e.series; });
        if (keep.length !== state.days[dk].length) ups.push({ k: dk, entries: keep });
      });
    } else ups.push({ k: k, entries: l.filter(function (x, j) { return j !== i; }) });
    armed = null; if (editing && editing.k === k) cancelEdit();
    commit(ups, ups.length > 1 ? ups.length + ' anotações apagadas.' : 'Anotação apagada.');
  }
  function lateList() {
    var t = key(new Date()), out = [];
    Object.keys(state.days).sort().forEach(function (k) { if (k < t) state.days[k].forEach(function (e, i) { if (!e.done) out.push({ k: k, i: i, e: e }); }); });
    return out;
  }
  function rescheduleLate() {
    var late = lateList(); if (!late.length) return;
    if (!window.confirm('Mover ' + late.length + ' anotação(ões) atrasada(s) para hoje?')) return;
    var today = key(new Date()), byDay = {}, moved = [];
    late.forEach(function (x) { (byDay[x.k] = byDay[x.k] || []).push(x.i); moved.push(x.e); });
    var ups = Object.keys(byDay).map(function (k) { return { k: k, entries: rows(k).filter(function (e, i) { return byDay[k].indexOf(i) < 0; }) }; });
    ups.push({ k: today, entries: rows(today).concat(moved) });
    commit(ups, late.length + ' anotação(ões) movida(s) para hoje.');
  }

  /* ---------- sincronização: janela ---------- */
  function showSetup() {
    q('[data-code]').value = state.code || '';
    q('[data-pass]').value = ''; setupMsg('');
    q('[data-setup]').hidden = false; paintSetup();
    (state.code ? q('[data-pass]') : q('[data-code]')).focus();
  }
  function hideSetup() { q('[data-setup]').hidden = true; }
  function validCode(v) { return v && !/[\/\\]/.test(v) && v !== '.' && v !== '..' && v.length <= 80; }
  function genCode() {
    var b = new Uint8Array(10); crypto.getRandomValues(b);
    return 'agenda-' + Array.prototype.map.call(b, function (x) { return 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]; }).join('');
  }
  function unlock() {
    var pass = q('[data-pass]').value.trim(), code = q('[data-code]').value.trim().toLowerCase().replace(/\s+/g, '-');
    if (code && !validCode(code)) { setupMsg('O código não pode ter barras nem ser só pontos.'); return; }
    if (!pass && !state.key) { setupMsg('Digite a senha da equipe (a mesma do Argo).'); return; }
    var go = pass ? derive(pass) : Promise.resolve(state.key);
    setupMsg('Abrindo…');
    go.then(function (k) {
      var prev = state.key; state.key = k;
      if (!loadLocal()) { state.key = prev; throw new Error('A senha não confere com as anotações guardadas neste aparelho. Nada foi alterado.'); }
      keyRemember();
      state.code = code; lsSet(CODE, code || null);
      if (state.unsub && code !== state.connecting) { try { state.unsub(); } catch (_) { /* ok */ } state.unsub = null; }
      render(); hideSetup();
      if (code) { status('Conectando…', false); return connect(true); }
      setSync('off', 'Agenda só neste aparelho'); status('Agenda desbloqueada neste aparelho.', false);
    }).catch(function (e) { setupMsg(e.message); });
  }
  function lock() {
    state.key = null; state.days = {}; state.locked = {};
    if (state.unsub) { try { state.unsub(); } catch (_) { /* ok */ } state.unsub = null; }
    state.connecting = ''; try { sessionStorage.removeItem(SKEY); } catch (_) { /* ok */ }
    setSync('off', 'Agenda trancada'); render(); showSetup();
  }
  function disconnect() {
    if (state.unsub) { try { state.unsub(); } catch (_) { /* ok */ } state.unsub = null; }
    state.code = ''; state.connecting = ''; state.db = null; lsSet(CODE, null);
    q('[data-code]').value = ''; setSync('off', 'Agenda só neste aparelho'); paintSetup();
  }
  function setupMsg(t) { var e = q('[data-setup-msg]'); if (e) e.textContent = t; }
  function paintSetup() {
    var s = state.sync, el = q('[data-setup-state]'); if (!el) return;
    el.textContent = state.code ? ({ ok: '● conectado', connecting: '● conectando…', error: '● erro', off: '● desconectado' }[s]) + ' · código ' + state.code : '● sem código: só neste aparelho';
    el.className = 'ag-st ag-st-' + (state.code ? s : 'off');
    q('[data-copy]').hidden = !(q('[data-code]').value.trim());
  }
  function paintSync() {
    if (!ui) return;
    var led = q('[data-led]'), chip = q('[data-sync-chip]');
    led.className = 'ag-led ag-led-' + state.sync;
    var t = state.sync === 'ok' ? 'Sincronizado' + (state.lastSync ? ' · ' + state.lastSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '') : state.sync === 'connecting' ? 'Conectando…' : state.sync === 'error' ? 'Erro de sincronização' : state.code ? 'Desconectado' : 'Só neste aparelho';
    chip.textContent = t; led.title = state.msg || t;
    paintSetup();
  }
  function status(t, bad) { if (!ui) return; var e = q('[data-status]'); e.textContent = t; e.classList.toggle('ag-bad', !!bad); e.setAttribute('role', bad ? 'alert' : 'status'); }

  /* ---------- exportar .ics (feriados, pagamentos e datas do MDS) ---------- */
  function exportIcs() {
    var y = month.getFullYear(), info = yearData(y), keys = Object.keys(info.map).sort(), md = Object.keys(mds()).filter(function (k) { return k.slice(0, 4) === String(y); }).sort();
    var ic = function (t) { return String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); };
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Paulus//Agenda//PT-BR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Agenda ' + y + (info.estimated ? ' (feriados calculados)' : '')];
    function ev(uid, k, sum, desc) {
      var n = day(k); n.setDate(n.getDate() + 1);
      L.push('BEGIN:VEVENT', 'UID:' + uid + '@paulus', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + k.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + key(n).replace(/-/g, ''), 'SUMMARY:' + ic(sum));
      if (desc) L.push('DESCRIPTION:' + ic(desc));
      L.push('TRANSP:TRANSPARENT', 'END:VEVENT');
    }
    keys.forEach(function (k) { ev(k, k, officialName(k)); });
    md.forEach(function (k) { mds()[k].forEach(function (it, i) { ev('mds-' + k + '-' + i, k, 'MDS: ' + mdsText(it), mdsCat(it) + (it.prev ? ' (data prevista, sujeita a alteração)' : '') + (it.obs ? '. ' + it.obs : '')); }); });
    L.push('END:VCALENDAR');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([L.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' })); a.download = 'agenda-paulus-' + y + '.ics';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    status((keys.length + md.length) + ' datas de ' + y + ' baixadas' + (info.estimated ? ' (só feriados calculados; pagamentos não cadastrados)' : '') + '.', false);
  }

  /* ---------- estatísticas ---------- */
  function stats(scope) {
    var y = month.getFullYear(), pre = scope === 'month' ? y + '-' + pad(month.getMonth() + 1) + '-' : y + '-', t = key(new Date());
    var st = { total: 0, done: 0, late: 0, pend: 0, byCat: { sem: 0 }, series: [] };
    Object.keys(CATS).forEach(function (c) { st.byCat[c] = 0; });
    var n = scope === 'month' ? new Date(y, month.getMonth() + 1, 0).getDate() : 12;
    for (var i = 0; i < n; i++) st.series.push({ done: 0, pend: 0, late: 0 });
    Object.keys(state.days).forEach(function (k) {
      if (k.indexOf(pre) !== 0) return;
      var b = st.series[scope === 'month' ? +k.slice(8) - 1 : +k.slice(5, 7) - 1];
      state.days[k].forEach(function (e) {
        st.total++; st.byCat[cleanCat(e.cat) || 'sem']++;
        if (e.done) { st.done++; if (b) b.done++; } else if (k < t) { st.late++; if (b) b.late++; } else { st.pend++; if (b) b.pend++; }
      });
    });
    return st;
  }
  var statScope = 'year';
  function renderStats() {
    var st = stats(statScope), max = Math.max(1, Math.max.apply(null, st.series.map(function (s) { return s.done + s.pend + s.late; }))), rate = st.total ? Math.round(st.done / st.total * 100) : 0;
    var labels = statScope === 'month' ? st.series.map(function (s, i) { return i + 1; }) : MONTHS.map(function (m) { return m.slice(0, 3); });
    var cmax = Math.max(1, Math.max.apply(null, Object.keys(st.byCat).map(function (c) { return st.byCat[c]; })));
    q('[data-stats-body]').innerHTML =
      '<div class="ag-kpis"><div><b>' + st.total + '</b><span>anotações</span></div><div><b>' + st.done + '</b><span>concluídas</span></div><div><b>' + st.pend + '</b><span>pendentes</span></div><div class="ag-kpi-late"><b>' + st.late + '</b><span>atrasadas</span></div><div><b>' + rate + '%</b><span>concluído</span></div></div>' +
      '<div class="ag-bars" role="img" aria-label="Anotações por período">' + st.series.map(function (s, i) {
        var tot = s.done + s.pend + s.late;
        return '<div class="ag-bar" title="' + esc(labels[i]) + ': ' + tot + '"><div class="ag-bar-col" style="height:' + Math.round(tot / max * 100) + '%"><i class="d" style="flex:' + s.done + '"></i><i class="p" style="flex:' + s.pend + '"></i><i class="l" style="flex:' + s.late + '"></i></div><span>' + esc(labels[i]) + '</span></div>';
      }).join('') + '</div><div class="ag-leg"><span><i class="d"></i>concluídas</span><span><i class="p"></i>pendentes</span><span><i class="l"></i>atrasadas</span></div>' +
      '<div class="ag-hb">' + Object.keys(st.byCat).map(function (c) {
        var meta = CATS[c] || { label: 'Sem tipo', color: '#7fb7c4' };
        return '<div><span>' + esc(meta.label) + '</span><div class="ag-hb-t"><i style="width:' + Math.round(st.byCat[c] / cmax * 100) + '%;background:' + meta.color + '"></i></div><b>' + st.byCat[c] + '</b></div>';
      }).join('') + '</div>';
    q('[data-stats-title]').textContent = 'Estatísticas · ' + (statScope === 'month' ? MONTHS[month.getMonth()] + ' ' + month.getFullYear() : month.getFullYear());
    q('[data-scope]').querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.s === statScope); });
  }

  /* ---------- desenho ---------- */
  function catBadge(c) { c = cleanCat(c); return c ? '<span class="ag-cat" style="--cat:' + CATS[c].color + '">' + CATS[c].label + '</span>' : ''; }
  function kindText(k) { var o = official(k), n = officialName(k); return !o ? '' : norm(n) === norm(o[1]) ? n : n + ' · ' + o[1]; }
  function hint() {
    var el = q('[data-hint]'), v = q('[data-entry]').value.trim();
    if (!v) { el.textContent = 'Ex.: amanhã 14h #visita Família Silva · toda segunda 9h #grupo · 15/12 #prazo'; return; }
    var p = parseQuick(v);
    if (p.bad) { el.textContent = 'Data não reconhecida.'; return; }
    el.textContent = (editing ? 'Editando: ' : '→ ') + dlabel(p.date, { weekday: 'short', day: '2-digit', month: 'short' }) + (p.time ? ' às ' + p.time : '') + (p.cat ? ' · ' + CATS[p.cat].label : '') + (p.rec ? ' · repete (' + p.rec.dates.length + 'x)' : '') + (p.text ? '' : ' · falta o texto');
  }
  function weekDates(d) { var s = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay(), 12); return Array.apply(null, Array(7)).map(function (_, i) { return new Date(s.getFullYear(), s.getMonth(), s.getDate() + i, 12); }); }
  function cellHtml(d, m, today, sel, wide) {
    var k = key(d), o = official(k), md = mds()[k] || [], all = rows(k), vis = all.filter(function (e) { return !(view.hideDone && e.done); }), ord = order(vis), lim = wide ? 99 : 2, late = k < today && all.some(function (e) { return !e.done; });
    var pend = all.filter(function (e) { return !e.done; }).length;
    var notes = ord.slice(0, lim).map(function (i) {
      var e = vis[i], c = cleanCat(e.cat);
      return '<span class="ag-note' + (e.done ? ' done' : '') + '"' + (c ? ' style="--cat:' + CATS[c].color + '"' : '') + '>' + (e.time ? '<b>' + esc(e.time) + '</b> ' : '') + esc(e.text) + '</span>';
    }).join('') + (ord.length > lim ? '<span class="ag-more">+' + (ord.length - lim) + '</span>' : '');
    return '<div class="ag-cell' + (d.getMonth() !== m ? ' out' : '') + (d.getDay() % 6 === 0 ? ' weekend' : '') + (k === today ? ' today' : '') + (k === sel ? ' sel' : '') + (late ? ' late' : '') + '" data-day="' + k + '" role="gridcell" tabindex="' + (k === sel ? 0 : -1) + '" aria-selected="' + (k === sel) + '" aria-label="' +
      esc(dlabel(d, { weekday: 'long', day: 'numeric', month: 'long' }) + (o ? ', ' + officialName(k) : '') + (pend ? ', ' + pend + ' pendente(s)' : '')) + '"><span class="ag-n">' + d.getDate() + '</span>' +
      (o ? '<span class="ag-tag ag-' + esc(o[1]) + '">' + esc(officialName(k)) + '</span>' : '') +
      (md.length ? '<span class="ag-tag ag-mds">MDS' + (md.length > 1 ? ' ×' + md.length : '') + '</span>' : '') + notes + '</div>';
  }
  function render() {
    if (!ui) return;
    var y = month.getFullYear(), m = month.getMonth(), today = key(new Date()), sel = key(chosen), info = yearData(y);
    q('[data-label]').textContent = MONTHS[m]; q('[data-year]').textContent = y; q('[data-select]').value = m;
    q('[data-months]').innerHTML = MONTHS.map(function (n, i) { return '<button type="button" data-m="' + i + '" class="' + (i === m ? 'on' : '') + '" aria-pressed="' + (i === m) + '">' + n.slice(0, 3) + '</button>'; }).join('');
    var html = '', cells;
    if (view.week) { cells = weekDates(chosen); cells.forEach(function (d) { html += cellHtml(d, d.getMonth(), today, sel, true); }); }
    else { var start = new Date(y, m, 1 - new Date(y, m, 1).getDay(), 12); for (var i = 0; i < 42; i++) html += cellHtml(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12), m, today, sel, false); }
    var grid = q('[data-grid]'); grid.innerHTML = html; grid.classList.toggle('wk', view.week);
    q('[data-view-week]').setAttribute('aria-pressed', view.week); q('[data-view-month]').setAttribute('aria-pressed', !view.week);
    q('[data-done-btn]').setAttribute('aria-pressed', !view.hideDone);
    q('[data-locked]').hidden = !!state.key;
    // faixa de informações
    var o = official(sel), pend = rows(sel).filter(function (e) { return !e.done; }).length, late = lateList().length;
    q('[data-date-head]').textContent = dlabel(chosen, { weekday: 'long', day: '2-digit', month: 'long' });
    q('[data-date-kind]').textContent = o ? kindText(sel) : (chosen.getDay() % 6 === 0 ? 'Fim de semana' : 'Dia útil');
    q('[data-date-notes]').textContent = pend + ' pendente' + (pend === 1 ? '' : 's');
    var lateEl = q('[data-late]'); lateEl.hidden = !late; lateEl.textContent = late + ' atrasada' + (late === 1 ? '' : 's');
    var soon = nextMds(); q('[data-mds-next]').hidden = !soon; if (soon) q('[data-mds-next]').textContent = 'MDS ' + soon.when + ': ' + soon.text;
    // legenda e rodapé
    var cnt = { feriado: 0, facultativo: 0, pagamento: 0, extra: 0 }; Object.keys(info.map).forEach(function (k) { var t = info.map[k][1]; cnt[t] = (cnt[t] || 0) + 1; });
    var mk = y + '-' + pad(m + 1), notes = 0, mdsN = 0; Object.keys(state.days).forEach(function (k) { if (k.slice(0, 7) === mk) notes += state.days[k].length; }); Object.keys(mds()).forEach(function (k) { if (k.slice(0, 7) === mk) mdsN += mds()[k].length; });
    q('[data-legend]').innerHTML = ['feriado:Feriado', 'facultativo:Facultativo', 'pagamento:Pagamento', 'extra:13º salário'].map(function (s) { var p = s.split(':'); return cnt[p[0]] ? '<span class="ag-lg ag-' + p[0] + '">' + p[1] + ' ' + cnt[p[0]] + '</span>' : ''; }).join('') + '<span class="ag-lg ag-mds">MDS ' + mdsN + '</span>';
    q('[data-footer]').textContent = (info.estimated ? 'Atenção: ' + y + ' ainda não tem datas oficiais cadastradas — mostrando só feriados calculados (sem pagamentos nem pontos facultativos). ' : '') + 'Anotações em ' + MONTHS[m].toLowerCase() + ': ' + notes + ' · dias úteis: ' + businessDays(y, m);
    renderDay(); renderList(); paintSync();
  }
  function businessDays(y, m) {
    var n = 0, last = new Date(y, m + 1, 0).getDate(), info = yearData(y).map;
    for (var d = 1; d <= last; d++) { var dt = new Date(y, m, d, 12), o = info[key(dt)]; if (dt.getDay() % 6 !== 0 && !(o && o[1] === 'feriado')) n++; }
    return n;
  }
  function nextMds() {
    var t = new Date(), t0 = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12), best = null;
    Object.keys(mds()).sort().forEach(function (k) {
      if (best) return; var n = Math.round((day(k) - t0) / 86400000);
      if (n >= 0 && n <= 30) best = { when: n === 0 ? 'hoje' : n === 1 ? 'amanhã' : 'em ' + n + ' dias', text: mdsText(mds()[k][0]) };
    });
    return best;
  }
  function entryHtml(k, i, e, showDate) {
    var d = day(k), isArm = armed && armed.k === k && armed.i === i;
    return '<li class="ag-entry' + (e.done ? ' done' : '') + '"><label class="ag-chk"><input type="checkbox" data-done="' + i + '" data-day="' + k + '"' + (e.done ? ' checked' : '') + ' aria-label="Concluída"><span></span></label>' +
      '<div class="ag-etext" data-jump="' + k + '">' + (showDate ? '<em class="ag-ed">' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + '</em>' : '') + (e.time ? '<b class="ag-et">' + esc(e.time) + '</b>' : '') + catBadge(e.cat) + '<span>' + esc(e.text) + '</span></div>' +
      '<div class="ag-eact">' + (isArm
        ? (e.series ? '<button type="button" class="ag-danger" data-del="' + i + '" data-day="' + k + '" data-scope="one">Só esta</button><button type="button" class="ag-danger" data-del="' + i + '" data-day="' + k + '" data-scope="series">Esta e as próximas</button>' : '<button type="button" class="ag-danger" data-del="' + i + '" data-day="' + k + '" data-scope="one">Apagar mesmo?</button>')
        : '<button type="button" data-edit="' + i + '" data-day="' + k + '" aria-label="Editar anotação">✎</button><button type="button" data-arm="' + i + '" data-day="' + k + '" aria-label="Apagar anotação">×</button>') + '</div></li>';
  }
  function renderDay() {
    var k = key(chosen), o = official(k), md = mds()[k] || [], all = rows(k), ord = order(all);
    var src = md.map(function (it) {
      var s = mdsSource(it);
      return '<div class="ag-mdsbox"><b>MDS · ' + esc(mdsCat(it)) + '</b> ' + esc(mdsText(it)) + (it.obs ? '<small>' + esc(it.obs) + '</small>' : '') + (s && /^https:\/\//.test(s.url || '') ? '<small><a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.nome) + '</a></small>' : '') + '</div>';
    }).join('');
    q('[data-day-card]').innerHTML = '<h3>' + esc(dlabel(chosen, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })) + '</h3>' + (o ? '<span class="ag-tag ag-' + esc(o[1]) + '">' + esc(kindText(k)) + '</span>' : '') + src +
      (ord.length ? '<ul class="ag-list">' + ord.map(function (i) { return entryHtml(k, i, all[i], false); }).join('') + '</ul>' : '<p class="ag-small">' + (state.key ? 'Sem anotações neste dia.' : 'Agenda trancada.') + '</p>');
  }
  function renderList() {
    var search = norm(q('[data-search]').value), mk = month.getFullYear() + '-' + pad(month.getMonth() + 1), t = key(new Date()), ev = [];
    Object.keys(state.days).sort().forEach(function (k) {
      state.days[k].forEach(function (e, i) {
        var dt = dlabel(day(k), { day: '2-digit', month: '2-digit', year: 'numeric' });
        if (search) { if (norm(e.text).indexOf(search) < 0 && dt.indexOf(search) < 0 && (!cleanCat(e.cat) || CATS[cleanCat(e.cat) || 'atendimento'].label.toLowerCase().indexOf(search) < 0)) return; }
        else if (tab === 'month' && k.slice(0, 7) !== mk) return;
        else if (tab === 'pending' && e.done) return;
        else if (tab === 'next' && (k < t || e.done)) return;
        ev.push({ k: k, i: i, e: e });
      });
    });
    if (tab === 'next') ev.sort(function (a, b) { return a.k < b.k ? -1 : a.k > b.k ? 1 : 0; });
    q('[data-tabs]').querySelectorAll('[data-tab]').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === tab && !search); b.setAttribute('aria-selected', b.dataset.tab === tab && !search); });
    q('[data-summary]').textContent = search ? ev.length + ' resultado(s) para a busca' : tab === 'month' ? ev.length + ' anotação(ões) · ' + MONTHS[month.getMonth()] + ' ' + month.getFullYear() : tab === 'pending' ? ev.length + ' pendência(s)' : ev.length + ' compromisso(s) futuro(s)';
    q('[data-events]').innerHTML = ev.length ? '<ul class="ag-list">' + ev.slice(0, 120).map(function (x) { return entryHtml(x.k, x.i, x.e, true); }).join('') + '</ul>' : '<p class="ag-small">' + (search ? 'Nada encontrado.' : tab === 'pending' ? 'Nenhuma pendência.' : tab === 'month' ? 'Nenhuma anotação neste mês.' : 'Nenhum compromisso futuro.') + '</p>';
  }
  function goto(d) { chosen = d; if (d.getMonth() !== month.getMonth() || d.getFullYear() !== month.getFullYear()) month = new Date(d.getFullYear(), d.getMonth(), 1, 12); render(); }
  function moveMonth(n) { month = new Date(month.getFullYear(), month.getMonth() + n, 1, 12); var dim = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(); chosen = new Date(month.getFullYear(), month.getMonth(), Math.min(chosen.getDate(), dim), 12); render(); }
  function today() { chosen = new Date(); month = new Date(chosen.getFullYear(), chosen.getMonth(), 1, 12); render(); }

  /* ---------- aparência (painel tecnológico) ---------- */
  var CSS = '\
#pa-agenda{--c:#37e6ff;--c2:#8ff4ff;--t:#d6f7ff;--mut:#7fb7c4;--bg:#030d14;--pn:#071a25;--pn2:#0a2431;--ln:#37e6ff33;--ln2:#37e6ff77;--fer:#ff6b5e;--fac:#ffb347;--pag:#6ee7a8;--ext:#6fb6ff;--mds:#b48cff;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;--hud:"Bahnschrift","DIN Alternate","Segoe UI",system-ui,sans-serif;\
position:fixed;inset:10px 14px 22px;z-index:80;display:flex;flex-direction:column;overflow:hidden;color:var(--t);font:13px/1.4 var(--hud);background:radial-gradient(ellipse 80% 50% at 50% -10%,#0d3550cc,transparent 70%),linear-gradient(180deg,#041722f2,#02090ff7);border:1px solid var(--ln2);clip-path:polygon(0 14px,14px 0,calc(100% - 14px) 0,100% 14px,100% calc(100% - 14px),calc(100% - 14px) 100%,14px 100%,0 calc(100% - 14px));box-shadow:0 0 0 1px #000,0 0 40px #37e6ff22 inset,0 18px 60px #000a;backdrop-filter:blur(6px)}\
#pa-agenda[hidden]{display:none!important}#pa-agenda *{box-sizing:border-box}#pa-agenda::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;background:repeating-linear-gradient(0deg,#37e6ff08 0 1px,transparent 1px 3px)}\
#pa-agenda>*{position:relative;z-index:1}#pa-agenda>.ag-top{z-index:5}#pa-agenda>.ag-locked,#pa-agenda>.ag-modal{position:absolute}#pa-agenda button,#pa-agenda input,#pa-agenda select{font:inherit;color:inherit}#pa-agenda button{cursor:pointer}\
#pa-agenda button:focus-visible,#pa-agenda input:focus-visible,#pa-agenda select:focus-visible,#pa-agenda .ag-cell:focus-visible,#pa-agenda [data-jump]:focus-visible{outline:2px solid var(--c2);outline-offset:1px}\
.ag-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:9px 14px;border-bottom:1px solid var(--ln);background:linear-gradient(90deg,#37e6ff14,transparent 60%)}\
.ag-title{display:flex;align-items:center;gap:9px;margin-right:auto;font:700 14px var(--hud);letter-spacing:.22em;text-transform:uppercase;color:var(--c2);text-shadow:0 0 12px #37e6ff88}.ag-title small{font:500 10px var(--mono);letter-spacing:.1em;color:var(--mut);text-shadow:none}\
.ag-led{width:10px;height:10px;border-radius:50%;background:#51707a;box-shadow:0 0 0 2px #0006}.ag-led-ok{background:#6ee7a8;box-shadow:0 0 10px #6ee7a8,0 0 0 2px #0006;animation:agp 2.4s ease-in-out infinite}.ag-led-connecting{background:var(--fac);box-shadow:0 0 10px var(--fac);animation:agp .8s ease-in-out infinite}.ag-led-error{background:var(--fer);box-shadow:0 0 10px var(--fer)}@keyframes agp{50%{opacity:.35}}\
.ag-btn,.ag-top select{border:1px solid var(--ln2);background:#0a2634cc;color:var(--t);padding:6px 11px;min-height:34px;border-radius:3px;font:600 12px var(--hud);letter-spacing:.04em}.ag-btn:hover{background:#12425a;border-color:var(--c);box-shadow:0 0 12px #37e6ff44}.ag-btn[aria-pressed="true"],.ag-btn.on{background:#37e6ff26;border-color:var(--c);color:var(--c2)}.ag-top select option{background:#06202c}\
.ag-seg{display:inline-flex}.ag-seg .ag-btn:first-child{border-radius:3px 0 0 3px}.ag-seg .ag-btn:last-child{border-radius:0 3px 3px 0;border-left:0}\
.ag-strip{display:flex;align-items:center;gap:7px;overflow:auto;white-space:nowrap;padding:7px 14px;border-bottom:1px solid var(--ln);font:11px var(--mono);scrollbar-width:thin}.ag-chip{padding:4px 9px;border:1px solid var(--ln);background:#06222f99;color:var(--t);border-radius:2px}.ag-chip[hidden]{display:none}.ag-chip.warn{border-color:var(--fac);color:var(--fac)}.ag-chip.late{border-color:var(--fer);color:#ffb0a8;cursor:pointer}.ag-chip.mds{border-color:var(--mds);color:#d4bcff;text-transform:none}.ag-status{margin-left:auto;color:var(--mut);text-transform:none;border-color:transparent;background:none}.ag-status.ag-bad{color:#ffb0a8}\
.ag-months{display:grid;grid-template-columns:repeat(12,1fr);gap:3px;padding:7px 14px 5px}.ag-months button{border:1px solid var(--ln);background:#06222f88;color:var(--mut);padding:5px 0;border-radius:2px;font:600 10px var(--mono);letter-spacing:.08em;text-transform:uppercase}.ag-months button:hover{border-color:var(--c);color:var(--t)}.ag-months .on{background:#37e6ff2b;border-color:var(--c);color:var(--c2);box-shadow:0 0 10px #37e6ff55 inset}\
.ag-body{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:12px;flex:1;min-height:0;padding:6px 14px 8px}.ag-cal{display:flex;flex-direction:column;min-height:0}\
.ag-mlabel{display:flex;align-items:baseline;gap:10px;padding:2px 2px 6px;font:700 19px var(--hud);letter-spacing:.14em;text-transform:uppercase;color:var(--t)}.ag-mlabel span+span{font:600 13px var(--mono);color:var(--c);letter-spacing:.1em}\
.ag-week,.ag-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.ag-week div{padding:5px 0;text-align:center;font:600 10px var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--c);border-bottom:1px solid var(--ln2)}\
.ag-grid{flex:1;min-height:0;grid-template-rows:repeat(6,minmax(54px,1fr));border-left:1px solid var(--ln);overflow:auto}.ag-grid.wk{grid-template-rows:1fr}\
.ag-cell{position:relative;min-width:0;min-height:54px;padding:4px 5px;overflow:hidden;cursor:pointer;border-right:1px solid var(--ln);border-bottom:1px solid var(--ln);background:#06202c66;transition:background .15s}.ag-cell:hover{background:#0d3a4f99}.ag-cell.out{opacity:.38}.ag-cell.weekend{background:#04141d99}\
.ag-cell.sel{background:#37e6ff1f;box-shadow:inset 0 0 0 1px var(--c),0 0 14px #37e6ff55 inset}.ag-cell.today .ag-n{background:var(--c);color:#02202b;box-shadow:0 0 12px var(--c)}.ag-cell.late::after{content:"";position:absolute;top:5px;right:5px;width:6px;height:6px;border-radius:50%;background:var(--fer);box-shadow:0 0 6px var(--fer)}\
.ag-n{display:inline-block;min-width:21px;padding:1px 4px;border-radius:2px;text-align:center;font:600 12px var(--mono);color:var(--t)}\
.ag-tag{display:block;margin-top:2px;padding:1px 5px;border-radius:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 10px var(--hud);border-left:3px solid}.ag-feriado{background:#ff6b5e2b;border-color:var(--fer);color:#ffc2bb}.ag-facultativo{background:#ffb3472b;border-color:var(--fac);color:#ffd9a3}.ag-pagamento{background:#6ee7a82b;border-color:var(--pag);color:#b8f5d3}.ag-extra{background:#6fb6ff2b;border-color:var(--ext);color:#c3e0ff}.ag-mds{background:#b48cff2b;border-color:var(--mds);color:#dcc9ff}\
.ag-note{display:block;margin-top:2px;padding:1px 5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;border-left:3px solid var(--cat,#7fb7c4);background:#0c3347;border-radius:0 2px 2px 0}.ag-grid.wk .ag-note{white-space:normal;font-size:12px;padding:3px 6px}.ag-note b{font:600 10px var(--mono);color:var(--c2)}.ag-note.done{opacity:.5;text-decoration:line-through}.ag-more{display:block;margin-top:2px;font:10px var(--mono);color:var(--mut)}\
.ag-legend{display:flex;gap:6px;flex-wrap:wrap;padding:7px 0 0}.ag-lg{padding:2px 8px;border-radius:2px;font:600 10px var(--mono);border-left:3px solid;letter-spacing:.04em}\
.ag-side{display:flex;flex-direction:column;gap:10px;min-height:0;overflow:auto;padding:2px 2px 8px 10px;border-left:1px solid var(--ln);scrollbar-width:thin;scrollbar-color:var(--ln2) transparent}\
.ag-add{display:flex;gap:5px}.ag-add input,.ag-search{flex:1;min-width:0;padding:9px 11px;min-height:38px;border:1px solid var(--ln2);background:#04141dcc;border-radius:3px;color:var(--t);font:13px var(--mono)}.ag-add input::placeholder,.ag-search::placeholder{color:#5f8e9b}.ag-add input:focus,.ag-search:focus{border-color:var(--c);box-shadow:0 0 12px #37e6ff55}\
.ag-add button{width:40px;flex:none;border:1px solid var(--c);border-radius:3px;background:#37e6ff2e;color:var(--c2);font-size:18px}.ag-add button:hover{background:#37e6ff55}.ag-add button[hidden]{display:none}\
.ag-hint{margin:6px 2px 6px;font:10.5px var(--mono);color:var(--mut);min-height:15px}.ag-catbar{display:flex;gap:4px;flex-wrap:wrap}.ag-catbar button{border:1px solid var(--cat);background:transparent;color:var(--cat);padding:3px 8px;border-radius:2px;font:600 10px var(--hud);letter-spacing:.05em;text-transform:uppercase}.ag-catbar button:hover{background:color-mix(in srgb,var(--cat) 22%,transparent)}\
.ag-card{padding:10px 11px;border:1px solid var(--ln);background:linear-gradient(180deg,#0a2a3a99,#06202c66);border-radius:3px}.ag-card h3{margin:0 0 6px;font:700 12px var(--hud);letter-spacing:.12em;text-transform:uppercase;color:var(--c2)}\
.ag-mdsbox{margin:6px 0;padding:6px 8px;border-left:3px solid var(--mds);background:#b48cff1c;font-size:12px}.ag-mdsbox small{display:block;margin-top:3px;color:var(--mut);font-size:10.5px}.ag-mdsbox a{color:#cdb5ff}\
.ag-tabs{display:flex;gap:3px;border-bottom:1px solid var(--ln)}.ag-tabs button{flex:1;border:0;border-bottom:2px solid transparent;background:transparent;padding:7px 4px;color:var(--mut);font:600 11px var(--hud);letter-spacing:.07em;text-transform:uppercase}.ag-tabs button.on{color:var(--c2);border-color:var(--c);background:#37e6ff14}\
.ag-small{margin:6px 2px;font:11px var(--mono);color:var(--mut)}.ag-list{list-style:none;margin:0;padding:0}\
.ag-entry{display:grid;grid-template-columns:24px 1fr auto;gap:6px;align-items:start;padding:7px 2px;border-bottom:1px dashed var(--ln)}.ag-entry.done .ag-etext>span{text-decoration:line-through;opacity:.55}\
.ag-chk{position:relative;width:22px;height:22px;display:block;cursor:pointer}.ag-chk input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer}.ag-chk span{position:absolute;inset:2px;border:1px solid var(--c);border-radius:2px;background:#04141d}.ag-chk input:checked+span{background:var(--c);box-shadow:0 0 8px var(--c)}.ag-chk input:checked+span::after{content:"";position:absolute;left:4px;top:0;width:5px;height:10px;border:solid #02202b;border-width:0 2px 2px 0;transform:rotate(45deg)}.ag-chk input:focus-visible+span{outline:2px solid var(--c2)}\
.ag-etext{min-width:0;font-size:12.5px;line-height:1.35;overflow-wrap:anywhere;cursor:pointer}.ag-et{margin-right:6px;font:600 11px var(--mono);color:var(--c2)}.ag-ed{margin-right:6px;font:600 10px var(--mono);font-style:normal;color:var(--fac);text-transform:uppercase}\
.ag-cat{display:inline-block;margin-right:6px;padding:1px 6px;border-radius:2px;background:var(--cat);color:#021b24;font:700 9.5px var(--hud);letter-spacing:.06em;text-transform:uppercase;vertical-align:1px}\
.ag-eact{display:flex;gap:3px}.ag-eact button{min-width:28px;min-height:28px;border:1px solid transparent;background:transparent;color:var(--mut);border-radius:2px;font-size:14px}.ag-eact button:hover{border-color:var(--ln2);color:var(--t)}.ag-eact .ag-danger{padding:2px 7px;border-color:var(--fer);color:#ffb0a8;font:600 10.5px var(--hud);white-space:normal}\
.ag-foot{padding:5px 14px 9px;border-top:1px solid var(--ln);font:10.5px var(--mono);color:var(--mut)}\
.ag-locked,.ag-modal{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:16px;background:#020a10dd;backdrop-filter:blur(4px)}.ag-locked[hidden],.ag-modal[hidden]{display:none}.ag-locked{z-index:4;flex-direction:column;gap:10px;text-align:center;color:var(--mut)}.ag-locked b{font:700 15px var(--hud);letter-spacing:.2em;color:var(--c2)}\
.ag-box{position:relative;width:min(470px,100%);max-height:100%;overflow:auto;padding:18px 18px 16px;border:1px solid var(--c);background:linear-gradient(180deg,#0a2a3af2,#05161ff5);box-shadow:0 0 30px #37e6ff44,0 0 0 1px #000;clip-path:polygon(0 10px,10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%)}.ag-box h3{margin:0 0 6px;font:700 14px var(--hud);letter-spacing:.16em;text-transform:uppercase;color:var(--c2)}.ag-box p{margin:6px 0 10px;font-size:12px;color:var(--mut)}\
.ag-box label{display:block;margin:10px 0 3px;font:600 10px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--c)}.ag-box input[type=text],.ag-box input[type=password]{width:100%;padding:10px;min-height:40px;border:1px solid var(--ln2);background:#03111a;border-radius:3px;color:var(--t);font:13px var(--mono)}.ag-box input[data-pass]{-webkit-text-security:disc;text-security:disc}.ag-box input:focus{border-color:var(--c);box-shadow:0 0 12px #37e6ff55}\
.ag-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.ag-btn.primary{background:#37e6ff33;border-color:var(--c);color:var(--c2)}.ag-st{margin:8px 0 0;font:11px var(--mono)}.ag-st-ok{color:var(--pag)}.ag-st-connecting{color:var(--fac)}.ag-st-error{color:#ffb0a8}.ag-st-off{color:var(--mut)}.ag-msg{min-height:16px;margin:8px 0 0;font:11px var(--mono);color:#ffb0a8}\
.ag-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:8px 0}.ag-kpis div{padding:8px 4px;text-align:center;border:1px solid var(--ln);background:#06222f99}.ag-kpis b{display:block;font:700 20px var(--mono);color:var(--c2)}.ag-kpis span{font:600 9px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}.ag-kpi-late b{color:var(--fer)}\
.ag-bars{display:flex;align-items:flex-end;gap:3px;height:120px;margin:12px 0 4px;padding:0 2px;border-bottom:1px solid var(--ln2)}.ag-bar{flex:1;min-width:0;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center}.ag-bar-col{width:100%;display:flex;flex-direction:column-reverse;min-height:1px}.ag-bar-col i{display:block;min-height:0}.ag-bar span{margin-top:3px;font:8px var(--mono);color:var(--mut)}\
.d{background:var(--c)}.p{background:var(--fac)}.l{background:var(--fer)}.ag-leg{display:flex;gap:12px;margin:16px 0 8px;font:10px var(--mono);color:var(--mut)}.ag-leg i{display:inline-block;width:9px;height:9px;margin-right:4px}\
.ag-hb>div{display:grid;grid-template-columns:90px 1fr 26px;gap:8px;align-items:center;margin:4px 0;font:11px var(--mono)}.ag-hb-t{height:7px;background:#04141d;border:1px solid var(--ln)}.ag-hb-t i{display:block;height:100%}.ag-hb b{text-align:right;color:var(--c2)}\
@media(max-width:860px){.ag-body{grid-template-columns:minmax(0,1fr) 270px}}\
@media(max-width:700px){#pa-agenda{inset:4px}.ag-body{grid-template-columns:1fr;overflow:auto;align-content:start}.ag-cal{min-height:420px}.ag-grid{min-height:330px}.ag-side{border-left:0;border-top:1px solid var(--ln);padding:10px 0 0}.ag-months{grid-template-columns:repeat(6,1fr)}.ag-status{margin-left:0}}\
@media(max-width:560px){#pa-agenda{inset:0;clip-path:none;border:0}.ag-top{gap:5px;padding:7px 8px}.ag-title small{display:none}.ag-btn,.ag-top select{padding:6px 8px}.ag-body{padding:4px 8px}.ag-cell{min-height:46px;padding:2px 3px}.ag-tag,.ag-note{font-size:8.5px}.ag-kpis{grid-template-columns:repeat(3,1fr)}}\
@media(prefers-reduced-motion:reduce){#pa-agenda *{animation:none!important;transition:none!important}}';

  var HTML = '\
<header class="ag-top"><strong class="ag-title"><i class="ag-led" data-led></i>Agenda <small>PAULUS // SINC. ARGO</small></strong>\
<button type="button" class="ag-btn" data-prev aria-label="Mês anterior">‹</button><select data-select aria-label="Mês"></select><button type="button" class="ag-btn" data-next aria-label="Próximo mês">›</button>\
<button type="button" class="ag-btn" data-today>Hoje</button>\
<span class="ag-seg" role="group" aria-label="Visão"><button type="button" class="ag-btn" data-view-month aria-pressed="true">Mês</button><button type="button" class="ag-btn" data-view-week aria-pressed="false">Semana</button></span>\
<button type="button" class="ag-btn" data-done-btn aria-pressed="true" title="Mostrar ou ocultar concluídas no calendário">Concluídas</button>\
<button type="button" class="ag-btn" data-stats>Estatísticas</button><button type="button" class="ag-btn" data-ics title="Baixar feriados, pagamentos e datas do MDS">.ics</button>\
<button type="button" class="ag-btn" data-notify>Avisos</button><button type="button" class="ag-btn" data-connect>⟳ Sincronizar</button><button type="button" class="ag-btn" data-lock>Trancar</button><span class="ag-zoom" role="group" aria-label="Tamanho"><button type="button" class="ag-btn" data-zoom-out aria-label="Diminuir o tamanho" title="Diminuir">A−</button><button type="button" class="ag-btn" data-zoom-val aria-label="Tamanho atual (clique para seguir o aplicativo)">100%</button><button type="button" class="ag-btn" data-zoom-in aria-label="Aumentar o tamanho" title="Aumentar">A+</button></span><button type="button" class="ag-btn" data-close>✕ Fechar</button></header>\
<div class="ag-strip"><span class="ag-chip" data-date-head></span><span class="ag-chip" data-date-kind></span><span class="ag-chip" data-date-notes></span><button type="button" class="ag-chip late" data-late hidden></button><span class="ag-chip mds" data-mds-next hidden></span><span class="ag-chip" data-sync-chip></span><span class="ag-chip ag-status" data-status role="status" aria-live="polite"></span></div>\
<div class="ag-months" data-months></div>\
<div class="ag-body"><section class="ag-cal" aria-label="Calendário"><div class="ag-mlabel"><span data-label></span><span data-year></span></div><div class="ag-week" aria-hidden="true">' + WEEK.map(function (x) { return '<div>' + x + '</div>'; }).join('') + '</div><div class="ag-grid" data-grid role="grid" aria-label="Dias do mês"></div><div class="ag-legend" data-legend></div></section>\
<aside class="ag-side" aria-label="Anotações">\
<div><div class="ag-add"><input data-entry placeholder="Anotar… ex.: amanhã 14h #visita Silva" aria-label="Nova anotação" maxlength="560" autocomplete="off"><button type="button" data-add aria-label="Salvar anotação">＋</button><button type="button" data-cancel-edit hidden aria-label="Cancelar edição">✕</button></div><div class="ag-hint" data-hint></div><div class="ag-catbar" data-catbar></div></div>\
<div class="ag-card" data-day-card></div>\
<div><input class="ag-search" data-search placeholder="Buscar anotações, datas, tipos…" aria-label="Buscar" type="search"><div class="ag-tabs" data-tabs role="tablist"><button type="button" role="tab" data-tab="month">Neste mês</button><button type="button" role="tab" data-tab="pending">Pendências</button><button type="button" role="tab" data-tab="next">Próximos</button></div><div class="ag-small" data-summary></div><div data-events></div></div>\
</aside></div>\
<footer class="ag-foot" data-footer></footer>\
<div class="ag-locked" data-locked hidden><b>AGENDA TRANCADA</b><span>As anotações ficam cifradas. Informe a senha da equipe para abrir.</span><button type="button" class="ag-btn primary" data-unlock-open>Desbloquear</button></div>\
<div class="ag-modal" data-setup hidden role="dialog" aria-modal="true" aria-label="Sincronização da agenda"><div class="ag-box"><h3>Sincronizar com o Argo</h3><p>Usa o mesmo Firebase (<b>agenda-boa-vista</b>) e a mesma cifragem do Argo. Informe o <b>mesmo código</b> e a <b>mesma senha da equipe</b>: o que você anota aqui aparece no Argo e vice-versa. A senha não é salva em disco.</p>\
<label for="ag-code">Código de sincronização</label><input id="ag-code" type="text" data-code placeholder="agenda-xxxxxxxxxx (deixe vazio para só neste aparelho)" autocomplete="off" spellcheck="false">\
<div class="ag-row"><button type="button" class="ag-btn" data-gen>Gerar código novo</button><button type="button" class="ag-btn" data-copy hidden>Copiar código</button></div>\
<label for="ag-pass">Senha da equipe (a mesma do Argo)</label><input id="ag-pass" type="text" name="ag-chave" data-pass autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore data-form-type="other">\
<div class="ag-st" data-setup-state></div><div class="ag-msg" data-setup-msg role="alert"></div>\
<div class="ag-row"><button type="button" class="ag-btn primary" data-unlock>Desbloquear e conectar</button><button type="button" class="ag-btn" data-disconnect>Desconectar da nuvem</button><button type="button" class="ag-btn" data-setup-close>Fechar</button></div></div></div>\
<div class="ag-modal" data-stats-modal hidden role="dialog" aria-modal="true" aria-label="Estatísticas da agenda"><div class="ag-box"><h3 data-stats-title>Estatísticas</h3><div class="ag-seg" data-scope><button type="button" class="ag-btn" data-s="year">Ano</button><button type="button" class="ag-btn" data-s="month">Mês</button></div><div data-stats-body></div><div class="ag-row"><button type="button" class="ag-btn" data-stats-close>Fechar</button></div></div></div>';


  /* ---------- tema claro (segue o aplicativo: body.claro) e tamanho (zoom) ---------- */
  var ZOOMS = [0.85, 1, 1.15, 1.3, 1.5, 1.75], ZKEY = 'paulus.agenda.zoom', TAM_Z = { p: 0.85, m: 1, g: 1.15, gg: 1.3 };
  var THEME_CSS = [
    ':root{--pa-z:1}',
    '#pa-agenda{zoom:var(--pa-z);inset:calc(10px / var(--pa-z)) calc(14px / var(--pa-z)) calc(22px / var(--pa-z))}',
    '@media(max-width:700px){#pa-agenda{inset:calc(4px / var(--pa-z))}}@media(max-width:560px){#pa-agenda{inset:0}}',
    '.pa-ov .pa-box{zoom:var(--pa-z);max-height:calc((100dvh - 28px) / var(--pa-z))}',
    '.ag-zoom{display:inline-flex}.ag-zoom .ag-btn{min-width:34px}.ag-zoom .ag-btn:not(:first-child){border-left:0}.ag-zoom .ag-btn:first-child{border-radius:3px 0 0 3px}.ag-zoom .ag-btn:last-child{border-radius:0 3px 3px 0}.ag-zoom [data-zoom-val]{min-width:52px;font-family:var(--mono)}',
    'body.claro #pa-agenda,body.claro .pa-ov{--c:#0b7a91;--c2:#075a6c;--t:#0e2a33;--mut:#46646e;--bg:#eef5f8;--pn:#fff;--pn2:#e6f1f5;--ln:#0b7a9138;--ln2:#0b7a9180;--fer:#c0392b;--fac:#a85a00;--pag:#17794a;--ext:#1f5fa8;--mds:#6b3fc4}',
    'body.claro #pa-agenda{background:linear-gradient(180deg,#f9fcfd,#e8f1f4);box-shadow:0 0 0 1px #0b7a9155,0 18px 60px #0b2a3555;backdrop-filter:none}',
    'body.claro #pa-agenda::before{display:none}',
    'body.claro .ag-top{background:linear-gradient(90deg,#0b7a9114,transparent 60%)}',
    'body.claro .ag-title{text-shadow:none}',
    'body.claro .ag-led{background:#9bb0b8;box-shadow:0 0 0 2px #0002}body.claro .ag-led-ok{background:#17794a;box-shadow:0 0 8px #17794a88,0 0 0 2px #0002}body.claro .ag-led-connecting{background:var(--fac);box-shadow:0 0 8px var(--fac)}body.claro .ag-led-error{background:var(--fer);box-shadow:0 0 8px var(--fer)}',
    'body.claro .ag-btn,body.claro .ag-top select{background:#fff}body.claro .ag-btn:hover{background:#dff0f5;box-shadow:0 0 0 2px #0b7a9133}body.claro .ag-btn[aria-pressed="true"],body.claro .ag-btn.on,body.claro .ag-btn.primary{background:#0b7a9122;color:var(--c2)}body.claro .ag-top select option{background:#fff;color:#0e2a33}',
    'body.claro .ag-chip{background:#ffffffd0}body.claro .ag-chip.late{color:#a32d20}body.claro .ag-chip.mds{color:#5a2fb0}body.claro .ag-status{background:none}body.claro .ag-status.ag-bad{color:#b3261e}',
    'body.claro .ag-months button{background:#ffffffa8}body.claro .ag-months .on{background:#0b7a9124;box-shadow:none}',
    'body.claro .ag-cell{background:#ffffffb8}body.claro .ag-cell:hover{background:#dff0f5}body.claro .ag-cell.weekend{background:#e4eef2}body.claro .ag-cell.sel{background:#0b7a9126;box-shadow:inset 0 0 0 2px var(--c)}body.claro .ag-cell.today .ag-n{color:#fff;box-shadow:none}body.claro .ag-cell.late::after{box-shadow:none}',
    'body.claro .ag-feriado{background:#c0392b22;color:#8a241a}body.claro .ag-facultativo{background:#a85a0022;color:#7a4200}body.claro .ag-pagamento{background:#17794a22;color:#0f5c37}body.claro .ag-extra{background:#1f5fa822;color:#174a85}body.claro .ag-mds{background:#6b3fc422;color:#4f2c99}',
    'body.claro .ag-note{background:#e1eff3}body.claro .ag-card{background:#fff}body.claro .ag-mdsbox{background:#6b3fc414}body.claro .ag-mdsbox a{color:#4f2c99}body.claro .ag-tabs button.on{background:#0b7a9114}',
    'body.claro .ag-add input,body.claro .ag-search{background:#fff}body.claro .ag-add input::placeholder,body.claro .ag-search::placeholder{color:#7a98a2}body.claro .ag-add input:focus,body.claro .ag-search:focus,body.claro .ag-box input:focus{box-shadow:0 0 0 2px #0b7a9133}',
    'body.claro .ag-add button{background:#0b7a9120}body.claro .ag-add button:hover{background:#0b7a9140}',
    'body.claro .ag-chk span{background:#fff}body.claro .ag-chk input:checked+span{box-shadow:none}body.claro .ag-chk input:checked+span::after{border-color:#fff}body.claro .ag-cat{color:#fff}body.claro .ag-eact .ag-danger{color:#a32d20}',
    'body.claro .ag-locked,body.claro .ag-modal{background:#eef5f8e8}body.claro .ag-box{background:#fff;box-shadow:0 10px 40px #0b2a3533,0 0 0 1px #0b7a9155}body.claro .ag-box input[type=text],body.claro .ag-box input[type=password]{background:#fff}',
    'body.claro .ag-st-error,body.claro .ag-msg{color:#b3261e}body.claro .ag-kpis div{background:#ffffffb8}body.claro .ag-hb-t{background:#e3eef2}',
    'body.claro .pa-ov{background:#0e2a3366}body.claro .pa-box{background:#fff;box-shadow:0 18px 60px #0b2a3555,0 0 0 1px #0b7a9155}body.claro .pa-pill{background:#0b7a9114}body.claro .pa-x,body.claro .pa-day,body.claro .pa-today,body.claro .pa-sync,body.claro .pa-btn,body.claro .pa-box select,body.claro .pa-box input[type=time]{background:#fff}',
    'body.claro .pa-day.is-today{background:#e0f0f5;box-shadow:none}body.claro .pa-n,body.claro .pa-tag{color:#fff}body.claro .pa-n.ok{color:var(--pag)}body.claro .pa-late{color:#a32d20;background:#c0392b14;border-color:#c0392b88}',
    'body.claro .pa-btn.primary{background:#0b7a91;color:#fff;border-color:#0b7a91}body.claro .pa-prog span{background:#0b7a9122}body.claro .pa-box h3,body.claro .pa-title{color:var(--c2)}',
    'body.claro .pa-clock circle:first-of-type{fill:#fff;stroke:#0b7a91}body.claro .pa-clock line:not([data-h]):not([data-m]):not([data-s]){stroke:#0b7a91}body.claro .pa-clock text{fill:#46646e}body.claro .pa-clock [data-h]{stroke:#0e2a33}body.claro .pa-clock [data-m]{stroke:#075a6c}body.claro .pa-clock circle:last-of-type{fill:#0b7a91}',
    'body.claro #pa-toast{background:#fffffff5;color:#0e2a33;border-color:#0b7a91;box-shadow:0 6px 24px #0b2a3544}body.claro #pa-toast b{color:#075a6c}body.claro #pa-toast span{color:#46646e}'
  ].join('\n');
  function injectTheme() {
    if (document.getElementById('pa-theme-css')) return;
    var st = document.createElement('style'); st.id = 'pa-theme-css'; st.textContent = THEME_CSS; document.head.appendChild(st);
  }
  // Tamanho: se a pessoa escolheu A−/A+, vale a escolha; senão acompanha o "tamanho do texto" do aplicativo (html[data-tam]).
  function zoomSaved() { var v = parseFloat(lsGet(ZKEY)); return ZOOMS.indexOf(v) >= 0 ? v : null; }
  function zoomNow() { var s = zoomSaved(); return s != null ? s : (TAM_Z[document.documentElement.getAttribute('data-tam')] || 1); }
  function applyZoom() {
    var z = zoomNow();
    document.documentElement.style.setProperty('--pa-z', String(z));
    if (ui) { var b = q('[data-zoom-val]'); if (b) { b.textContent = Math.round(z * 100) + '%'; b.title = zoomSaved() != null ? 'Voltar ao tamanho do aplicativo' : 'Acompanhando o tamanho do aplicativo'; } }
  }
  function stepZoom(dir) {
    var z = zoomNow(), i = 0, best = 1e9;
    ZOOMS.forEach(function (v, k) { if (Math.abs(v - z) < best) { best = Math.abs(v - z); i = k; } });
    i = Math.max(0, Math.min(ZOOMS.length - 1, i + dir));
    lsSet(ZKEY, String(ZOOMS[i])); applyZoom();
  }

  /* ---------- montagem e eventos ---------- */
  function create() {
    if (ui) return;
    var css = document.createElement('style'); css.textContent = CSS; document.head.appendChild(css); injectTheme();
    ui = document.createElement('section'); ui.id = 'pa-agenda'; ui.hidden = true; ui.setAttribute('aria-label', 'Agenda Paulus'); ui.innerHTML = HTML;
    document.body.appendChild(ui);
    var sel = q('[data-select]'); MONTHS.forEach(function (n, i) { var o = document.createElement('option'); o.value = i; o.textContent = n; sel.appendChild(o); });
    q('[data-catbar]').innerHTML = Object.keys(CATS).map(function (c) { return '<button type="button" data-cat="' + c + '" style="--cat:' + CATS[c].color + '">#' + CATS[c].label + '</button>'; }).join('');
    q('[data-prev]').onclick = function () { moveMonth(-1); }; q('[data-next]').onclick = function () { moveMonth(1); }; q('[data-today]').onclick = today;
    sel.onchange = function () { month = new Date(month.getFullYear(), +this.value, 1, 12); chosen = new Date(month.getFullYear(), month.getMonth(), Math.min(chosen.getDate(), new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()), 12); render(); };
    q('[data-months]').onclick = function (e) { var b = e.target.closest('[data-m]'); if (b) { month = new Date(month.getFullYear(), +b.dataset.m, 1, 12); chosen = new Date(month.getFullYear(), month.getMonth(), 1, 12); render(); } };
    q('[data-view-month]').onclick = function () { view.week = false; saveView(); render(); }; q('[data-view-week]').onclick = function () { view.week = true; saveView(); render(); };
    q('[data-done-btn]').onclick = function () { view.hideDone = !view.hideDone; saveView(); render(); };
    var grid = q('[data-grid]');
    grid.onclick = function (e) { var c = e.target.closest('[data-day]'); if (c) { chosen = day(c.dataset.day); render(); if (!view.week) { var n = q('[data-day="' + c.dataset.day + '"]'); if (n) n.focus({ preventScroll: true }); } } };
    grid.onkeydown = function (e) {
      var c = e.target.closest('[data-day]'); if (!c) return;
      var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (step) { e.preventDefault(); var d = day(c.dataset.day); d.setDate(d.getDate() + step); goto(d); var n = q('[data-day="' + key(d) + '"]'); if (n) n.focus(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); q('[data-entry]').focus(); }
    };
    q('[data-close]').onclick = function () { open(false); };
    q('[data-zoom-out]').onclick = function () { stepZoom(-1); }; q('[data-zoom-in]').onclick = function () { stepZoom(1); };
    q('[data-zoom-val]').onclick = function () { lsSet(ZKEY, null); applyZoom(); };
    applyZoom();
    q('[data-connect]').onclick = showSetup; q('[data-unlock-open]').onclick = showSetup; q('[data-lock]').onclick = lock;
    q('[data-ics]').onclick = exportIcs;
    q('[data-notify]').onclick = openAvisos;
    q('[data-late]').onclick = function () { tab = 'pending'; q('[data-search]').value = ''; render(); if (window.confirm('Mover as atrasadas para hoje? (Cancelar só mostra a lista)')) rescheduleLate(); };
    q('[data-add]').onclick = addEntry; q('[data-cancel-edit]').onclick = cancelEdit;
    var inp = q('[data-entry]'); inp.oninput = hint; inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); addEntry(); } else if (e.key === 'Escape' && editing) { e.stopPropagation(); cancelEdit(); } };
    q('[data-catbar]').onclick = function (e) { var b = e.target.closest('[data-cat]'); if (!b) return; var v = inp.value.replace(/(^|\s)#\p{L}+(?=\s|$)/gu, '$1').trim(); inp.value = (v ? v + ' ' : '') + '#' + b.dataset.cat + ' '; inp.focus(); hint(); };
    q('[data-search]').oninput = renderList;
    q('[data-tabs]').onclick = function (e) { var b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; q('[data-search]').value = ''; renderList(); } };
    function listClick(e) {
      var t;
      if ((t = e.target.closest('[data-arm]'))) { armed = { k: t.dataset.day, i: +t.dataset.arm }; clearTimeout(armTimer); armTimer = setTimeout(function () { armed = null; render(); }, 5000); render(); return; }
      if ((t = e.target.closest('[data-del]'))) { clearTimeout(armTimer); removeEntry(t.dataset.day, +t.dataset.del, t.dataset.scope); return; }
      if ((t = e.target.closest('[data-edit]'))) { startEdit(t.dataset.day, +t.dataset.edit); return; }
      if ((t = e.target.closest('[data-jump]'))) { goto(day(t.dataset.jump)); }
    }
    function listChange(e) { var t = e.target.closest('[data-done]'); if (t) toggleDone(t.dataset.day, +t.dataset.done, t.checked); }
    [q('[data-day-card]'), q('[data-events]')].forEach(function (el) { el.addEventListener('click', listClick); el.addEventListener('change', listChange); });
    q('[data-unlock]').onclick = unlock; q('[data-setup-close]').onclick = hideSetup; q('[data-disconnect]').onclick = disconnect;
    q('[data-gen]').onclick = function () { q('[data-code]').value = genCode(); paintSetup(); q('[data-pass]').focus(); };
    q('[data-code]').oninput = paintSetup;
    q('[data-copy]').onclick = function () { var v = q('[data-code]').value.trim(); (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { setupMsg('Código copiado.'); }, function () { q('[data-code]').select(); setupMsg('Selecionei o código: copie manualmente.'); }); };
    q('[data-pass]').onkeydown = q('[data-code]').onkeydown = function (e) { if (e.key === 'Enter') unlock(); };
    q('[data-stats]').onclick = function () { q('[data-stats-modal]').hidden = false; renderStats(); q('[data-stats-close]').focus(); };
    q('[data-stats-close]').onclick = function () { q('[data-stats-modal]').hidden = true; };
    q('[data-scope]').onclick = function (e) { var b = e.target.closest('[data-s]'); if (b) { statScope = b.dataset.s; renderStats(); } };
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !ui || ui.hidden) return;
      if (!q('[data-stats-modal]').hidden) q('[data-stats-modal]').hidden = true;
      else if (!q('[data-setup]').hidden) hideSetup();
      else if (!editing) open(false);
    });
    hint(); paintSync();
  }
  function open(v) {
    if (!ui) create();
    ui.hidden = !v;
    if (v) {
      chosen = new Date(); month = new Date(chosen.getFullYear(), chosen.getMonth(), 1, 12);
      render();
      if (!state.key) showSetup();
      else if (state.code && !state.unsub && state.sync !== 'connecting') connect(true);
    }
  }
  /* ---------- avisos (notificações do sistema) ---------- */
  var AVISOS = 'paulus.agenda.avisos', ENVIADOS = 'paulus.agenda.enviados', MUDO = 'paulus.agenda.saudacao-mudo', VISTO = 'paulus.agenda.saudacao-visto';
  var prefs = { lead: 0, daily: '', mute: '' }, sent = { d: '', ids: {} };
  function loadPrefs() {
    try { var p = JSON.parse(lsGet(AVISOS) || '{}'); prefs.lead = [0, 5, 15, 30, 60].indexOf(+p.lead) >= 0 ? +p.lead : 0; prefs.daily = /^\d\d:\d\d$/.test(p.daily || '') ? p.daily : ''; prefs.mute = typeof p.mute === 'string' ? p.mute : ''; } catch (_) { /* padrão */ }
    try { var e = JSON.parse(lsGet(ENVIADOS) || '{}'); sent = e && e.d === key(new Date()) ? { d: e.d, ids: e.ids || {} } : { d: key(new Date()), ids: {} }; } catch (_) { sent = { d: key(new Date()), ids: {} }; }
  }
  function savePrefs() { lsSet(AVISOS, JSON.stringify(prefs)); }
  function markSent(id) { var t = key(new Date()); if (sent.d !== t) sent = { d: t, ids: {} }; sent.ids[id] = 1; lsSet(ENVIADOS, JSON.stringify(sent)); }
  function wasSent(id) { return sent.d === key(new Date()) && !!sent.ids[id]; }
  function permState() { return typeof Notification === 'undefined' ? 'sem-suporte' : Notification.permission; }
  function mutedAlerts() { return prefs.mute === key(new Date()); }

  /* ---------- estilo comum das janelas extras ---------- */
  function injectCss() {
    injectTheme(); applyZoom();
    if (document.getElementById('pa-extra-css')) return;
    var c = [
      '.pa-ov{--c:#37e6ff;--c2:#8ff4ff;--t:#d6f7ff;--mut:#7fb7c4;--bg:#030d14;--pn:#071a25;--ln:#37e6ff33;--ln2:#37e6ff77;--fer:#ff6b5e;--fac:#ffb347;--pag:#6ee7a8;--mds:#b48cff;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;--hud:"Bahnschrift","DIN Alternate","Segoe UI",system-ui,sans-serif;position:fixed;inset:0;z-index:120;display:none;align-items:center;justify-content:center;padding:14px;background:#02090fcc;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);font:13px/1.4 var(--hud);color:var(--t)}',
      '.pa-ov.on{display:flex}.pa-ov *{box-sizing:border-box}',
      '.pa-box{position:relative;width:100%;max-width:440px;max-height:calc(100dvh - 28px);overflow-y:auto;overscroll-behavior:contain;background:linear-gradient(180deg,#05202e,#02090f);border:1px solid var(--ln2);box-shadow:0 0 40px #37e6ff22 inset,0 18px 60px #000a;animation:paPop .28s ease-out;clip-path:polygon(0 12px,12px 0,calc(100% - 12px) 0,100% 12px,100% calc(100% - 12px),calc(100% - 12px) 100%,12px 100%,0 calc(100% - 12px))}',
      '@keyframes paPop{from{transform:translateY(14px) scale(.97);opacity:0}to{transform:none;opacity:1}}@media (prefers-reduced-motion:reduce){.pa-box{animation:none}}',
      '.pa-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px 0}',
      '.pa-pill{font:700 10px var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--c);border:1px solid var(--ln2);padding:4px 10px;border-radius:999px;background:#37e6ff14}',
      '.pa-x{width:32px;height:32px;border-radius:50%;border:1px solid var(--ln2);background:#03111a;color:var(--t);cursor:pointer;font-size:13px;touch-action:manipulation}',
      '.pa-in{padding:6px 18px 18px}',
      '.pa-clock{width:min(100%,190px);margin:4px auto 4px;display:block}',
      '.pa-date{margin:0;text-align:center;font:600 11px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--mut)}',
      '.pa-title{margin:6px 0 4px;text-align:center;font-size:19px;font-weight:700;color:var(--c2);letter-spacing:.02em}',
      '.pa-intro{margin:0 0 12px;text-align:center;color:var(--mut);font-size:12.5px}',
      '.pa-wk-head{display:flex;justify-content:space-between;align-items:center;font:700 10px var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--c);margin:4px 0 6px}',
      '.pa-count{color:var(--mut)}',
      '.pa-strip{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:8px}',
      '.pa-day{position:relative;display:flex;flex-direction:column;align-items:center;gap:1px;padding:5px 0 6px;min-height:52px;background:#03111a;border:1px solid var(--ln);color:var(--t);cursor:pointer;border-radius:3px}',
      '.pa-day small{font:600 9px var(--mono);color:var(--mut);text-transform:uppercase}.pa-day b{font-size:15px}',
      '.pa-day.is-today{border-color:var(--c);box-shadow:0 0 10px #37e6ff55;background:#0a2431}.pa-day.is-past{opacity:.6}.pa-day.is-wknd small{color:var(--fac)}',
      '.pa-n{font:700 10px var(--mono);min-width:16px;text-align:center;color:#03111a;background:var(--c);border-radius:8px;padding:0 4px}.pa-n.late{background:var(--fer)}.pa-n.ok{background:transparent;color:var(--pag)}.pa-n.none{background:transparent;color:transparent}',
      '.pa-k{position:absolute;top:3px;right:4px;width:6px;height:6px;border-radius:50%;background:var(--fac)}.pa-k.md{background:var(--mds)}',
      '.pa-today{border:1px solid var(--ln);background:#03111a;padding:8px 10px;margin-bottom:8px;border-radius:3px}',
      '.pa-tag{display:inline-block;font:700 10px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:#03111a;background:var(--c);padding:1px 7px;border-radius:2px;margin-bottom:5px}',
      '.pa-line{display:flex;gap:7px;align-items:baseline;margin:2px 0}.pa-line i{width:7px;height:7px;border-radius:50%;background:var(--cat,var(--c));flex:none;transform:translateY(-1px)}.pa-line time{font:600 11px var(--mono);color:var(--c2);flex:none}.pa-line span{overflow-wrap:anywhere}',
      '.pa-chip{display:inline-block;font:600 10px var(--mono);padding:1px 7px;border:1px solid var(--ln2);border-radius:999px;color:var(--fac);margin:0 4px 4px 0}.pa-chip.md{color:var(--mds)}',
      '.pa-muted{color:var(--mut);font-size:12px}',
      '.pa-prog{display:flex;align-items:center;gap:8px;margin-top:6px;font:600 10px var(--mono);color:var(--mut)}.pa-prog span{flex:1;height:4px;background:#37e6ff22;border-radius:2px;overflow:hidden}.pa-prog i{display:block;height:100%;background:var(--pag)}',
      '.pa-late{display:flex;justify-content:space-between;width:100%;margin:0 0 8px;padding:8px 10px;border:1px solid #ff6b5e88;background:#ff6b5e14;color:#ffb3ab;cursor:pointer;font:inherit;border-radius:3px;text-align:left}',
      '.pa-lbl{font:700 10px var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--mut);margin:8px 0 4px}',
      '.pa-list{list-style:none;margin:0 0 8px;padding:0}.pa-list li{display:flex;gap:8px;padding:5px 0;border-top:1px solid var(--ln)}.pa-list li:first-child{border-top:0}.pa-wd{flex:none;width:76px;font:600 11px var(--mono);color:var(--c2)}',
      '.pa-sync{display:flex;align-items:center;gap:8px;margin:10px 0;padding:8px 10px;border:1px solid var(--ln);background:#03111a;border-radius:3px;font-size:12px}',
      '.pa-sync .d{flex:none;width:9px;height:9px;border-radius:50%;background:var(--mut)}.pa-sync[data-s=ok] .d{background:var(--pag);box-shadow:0 0 8px var(--pag)}.pa-sync[data-s=error] .d,.pa-sync[data-s=slow] .d{background:var(--fer)}.pa-sync[data-s=connecting] .d{background:var(--fac);animation:paPulse 1s infinite}.pa-sync[data-s=locked] .d{background:var(--fac)}',
      '@keyframes paPulse{50%{opacity:.3}}@media (prefers-reduced-motion:reduce){.pa-sync[data-s=connecting] .d{animation:none}}',
      '.pa-sync .tx{flex:1}.pa-retry{display:none;flex:none}.pa-sync[data-s=error] .pa-retry,.pa-sync[data-s=slow] .pa-retry{display:inline-block}',
      '.pa-btn{padding:9px 12px;min-height:40px;border:1px solid var(--ln2);background:#03111a;color:var(--t);font:600 12px var(--hud);cursor:pointer;border-radius:3px;touch-action:manipulation}.pa-btn:hover{border-color:var(--c)}.pa-btn.primary{background:linear-gradient(180deg,#37e6ff,#1fb6d4);color:#03111a;border-color:var(--c);font-weight:700}',
      '.pa-btns{display:grid;gap:8px;margin-top:6px}.pa-pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
      '.pa-mute{display:flex;align-items:center;gap:8px;margin-top:12px;color:var(--mut);font-size:12px;cursor:pointer}.pa-mute input{width:16px;height:16px;accent-color:#37e6ff}',
      '.pa-box label.pa-f{display:block;margin:12px 0 4px;font:700 10px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--c)}',
      '.pa-box select,.pa-box input[type=time]{width:100%;padding:9px;min-height:40px;border:1px solid var(--ln2);background:#03111a;border-radius:3px;color:var(--t);font:13px var(--mono)}',
      '.pa-row{display:flex;gap:8px;align-items:center;margin-top:12px}.pa-row input[type=checkbox]{width:16px;height:16px;accent-color:#37e6ff}',
      '.pa-box h3{margin:0;padding:6px 18px 0;font-size:17px;color:var(--c2)}.pa-box p.pa-note{margin:8px 18px 0;color:var(--mut);font-size:12px}',
      '.pa-ov button:focus-visible,.pa-ov select:focus-visible,.pa-ov input:focus-visible{outline:2px solid var(--c2);outline-offset:1px}',
      '#pa-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:130;max-width:min(92vw,420px);display:flex;flex-direction:column;gap:2px;text-align:left;padding:10px 14px;border:1px solid #37e6ff;background:#031722f5;color:#d6f7ff;font:13px/1.35 "Bahnschrift","Segoe UI",system-ui,sans-serif;cursor:pointer;box-shadow:0 0 24px #37e6ff55;border-radius:4px}#pa-toast[hidden]{display:none}#pa-toast b{color:#8ff4ff}#pa-toast span{white-space:pre-line;color:#9fd3df}'
    ].join('\n');
    var st = document.createElement('style'); st.id = 'pa-extra-css'; st.textContent = c; document.head.appendChild(st);
  }
  function overlay(id, inner, label) {
    injectCss();
    var o = document.getElementById(id);
    if (!o) { o = document.createElement('div'); o.id = id; o.className = 'pa-ov'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); document.body.appendChild(o); }
    o.setAttribute('aria-label', label); o.innerHTML = inner; return o;
  }

  /* ---------- aviso dentro do app (quando o sistema não está liberado) ---------- */
  function toast(title, body) {
    injectCss();
    var t = document.getElementById('pa-toast');
    if (!t) { t = document.createElement('button'); t.type = 'button'; t.id = 'pa-toast'; t.onclick = function () { t.hidden = true; open(true); }; document.body.appendChild(t); }
    t.innerHTML = '<b></b><span></span>'; t.firstChild.textContent = title; t.lastChild.textContent = body; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 9000);
  }
  // Aviso do sistema (pelo service worker, que também funciona no celular). Sem permissão, aparece o cartão dentro do Paulus.
  function notify(title, body, tag) {
    var inApp = function () { toast(title, body); return 'app'; };
    if (permState() !== 'granted') return Promise.resolve(inApp());
    var opts = { body: body, icon: 'icon-192.png', badge: 'icon-192.png', tag: tag || 'paulus-agenda', renotify: true, data: { abrir: 'agenda' } };
    var simples = function () { try { var n = new Notification(title, opts); n.onclick = function () { window.focus(); open(true); }; return 'sistema'; } catch (_) { return inApp(); } };
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.ready) return Promise.resolve(simples());
    return Promise.race([
      navigator.serviceWorker.ready.then(function (reg) { return reg.showNotification(title, opts).then(function () { return 'sistema'; }); }),
      new Promise(function (r) { setTimeout(function () { r('lento'); }, 2500); })
    ]).then(function (r) { return r === 'lento' ? simples() : r; }, function () { return simples(); });
  }

  /* ---------- verificação periódica: anotações com hora e resumo diário ---------- */
  function minutes(hm) { var p = hm.split(':'); return +p[0] * 60 + +p[1]; }
  function dailyText() {
    var s = weekSummary(), td = s.days.filter(function (d) { return d.isToday; })[0], lines = [], parts = [];
    var ord = order(td.open.map(function (e) { return e; }));
    ord.slice(0, 5).forEach(function (i) { var e = td.open[i]; parts.push((cleanTime(e.time) ? e.time + ' ' : '') + e.text); });
    if (td.open.length > 5) parts.push('+' + (td.open.length - 5));
    var off = officialName(td.k);
    if (off) lines.push(off);
    if (parts.length) lines.push('HOJE: ' + parts.join(' · '));
    if (s.late) lines.push('⚠ ' + s.late + (s.late === 1 ? ' anotação atrasada' : ' anotações atrasadas'));
    var next = s.days.filter(function (d) { return !d.isToday && d.k > td.k && (d.open.length || d.o || d.md.length); }).slice(0, 3).map(function (d) { return WEEK[d.d.getDay()] + ' ' + dlabel(d.d) + ' — ' + (d.open[0] ? d.open[0].text : d.o ? officialName(d.k) : mdsText(d.md[0])); });
    if (next.length) lines.push('Próximos: ' + next.join(' · '));
    return { title: 'Agenda Paulus — Hoje: ' + (td.open.length ? td.open.length + (td.open.length === 1 ? ' anotação' : ' anotações') : off || 'nada marcado'), body: lines.join('\n'), empty: !td.open.length && !off && !s.late && !next.length };
  }
  function checkAlerts() {
    if (!state.key || mutedAlerts()) return;
    var now = new Date(), k = key(now), nowMin = now.getHours() * 60 + now.getMinutes(), lead = prefs.lead;
    rows(k).forEach(function (e) {
      var t = cleanTime(e.time); if (!t || e.done) return;
      var id = 'n|' + k + '|' + e.createdAt + '|' + t, at = minutes(t);
      if (wasSent(id) || alerted[id]) return;
      if (nowMin >= at - lead && nowMin <= at + 10) {
        alerted[id] = 1; markSent(id);
        var falta = at - nowMin;
        notify((falta > 0 ? 'Em ' + falta + ' min' : 'Agora') + ' · ' + t, e.text + (cleanCat(e.cat) ? ' (' + CATS[e.cat].label + ')' : ''), id);
        if (ui) status((falta > 0 ? 'Em ' + falta + ' min: ' : 'Agora: ') + e.text, false);
      }
    });
    if (prefs.daily && !wasSent('resumo|' + k) && nowMin >= minutes(prefs.daily) && nowMin <= minutes(prefs.daily) + 360) {
      markSent('resumo|' + k);
      var d = dailyText(); if (!d.empty) notify(d.title, d.body, 'paulus-resumo');
    }
  }

  /* ---------- janela de configuração dos avisos ---------- */
  function openAvisos() {
    var st = permState();
    var stTxt = { granted: 'Avisos do sistema: ativados neste aparelho.', denied: 'Avisos do sistema: bloqueados pelo navegador. Libere nas configurações do site; até lá, os avisos aparecem aqui dentro.', 'default': 'Avisos do sistema: ainda não ativados. Sem isso, os avisos aparecem só dentro do Paulus.', 'sem-suporte': 'Este navegador não oferece avisos do sistema; os avisos aparecem dentro do Paulus.' }[st];
    var opts = [[0, 'No horário'], [5, '5 minutos antes'], [15, '15 minutos antes'], [30, '30 minutos antes'], [60, '1 hora antes']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === prefs.lead ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
    var o = overlay('pa-avisos', '<div class="pa-box"><div class="pa-head"><span class="pa-pill">Avisos</span><button type="button" class="pa-x" data-av-x aria-label="Fechar">✕</button></div>' +
      '<h3>Avisos da agenda</h3><p class="pa-note" data-av-perm>' + esc(stTxt) + '</p>' +
      '<div class="pa-in"><div class="pa-btns"><button type="button" class="pa-btn primary" data-av-perm-btn' + (st === 'granted' || st === 'sem-suporte' || st === 'denied' ? ' hidden' : '') + '>Ativar avisos do sistema</button></div>' +
      '<label class="pa-f" for="pa-av-lead">Anotações com horário</label><select id="pa-av-lead" data-av-lead>' + opts + '</select>' +
      '<div class="pa-row"><input type="checkbox" id="pa-av-d" data-av-daily-on' + (prefs.daily ? ' checked' : '') + '><label for="pa-av-d">Resumo do dia, às</label><input type="time" data-av-daily value="' + esc(prefs.daily || '08:00') + '" style="width:auto"></div>' +
      '<div class="pa-row"><input type="checkbox" id="pa-av-m" data-av-mute' + (mutedAlerts() ? ' checked' : '') + '><label for="pa-av-m">Silenciar os avisos hoje</label></div>' +
      '<p class="pa-muted" style="margin:12px 0 0">Os avisos saem com o Paulus aberto (no celular, também com ele em segundo plano, enquanto o navegador o mantiver ativo). Com o app fechado, nada é enviado.</p>' +
      '<div class="pa-pair" style="margin-top:12px"><button type="button" class="pa-btn" data-av-test>Enviar aviso de teste</button><button type="button" class="pa-btn" data-av-close>Fechar</button></div></div></div>', 'Avisos da agenda');
    var g = function (s) { return o.querySelector(s); };
    var fechar = function () { o.classList.remove('on'); };
    var salvar = function () {
      prefs.lead = +g('[data-av-lead]').value; prefs.daily = g('[data-av-daily-on]').checked && /^\d\d:\d\d$/.test(g('[data-av-daily]').value) ? g('[data-av-daily]').value : '';
      prefs.mute = g('[data-av-mute]').checked ? key(new Date()) : ''; savePrefs();
    };
    g('[data-av-x]').onclick = g('[data-av-close]').onclick = function () { salvar(); fechar(); };
    o.onclick = function (e) { if (e.target === o) { salvar(); fechar(); } };
    o.onkeydown = function (e) { if (e.key === 'Escape') { salvar(); fechar(); } };
    ['[data-av-lead]', '[data-av-daily-on]', '[data-av-daily]', '[data-av-mute]'].forEach(function (s) { g(s).onchange = salvar; });
    var pb = g('[data-av-perm-btn]');
    pb.onclick = function () {
      Notification.requestPermission().then(function (p) {
        g('[data-av-perm]').textContent = p === 'granted' ? 'Avisos do sistema: ativados neste aparelho.' : 'Permissão não concedida; os avisos aparecem dentro do Paulus.';
        pb.hidden = true;
      });
    };
    g('[data-av-test]').onclick = function () { salvar(); notify('Agenda Paulus', 'Aviso de teste: está funcionando.', 'paulus-teste').then(function (r) { g('[data-av-perm]').textContent = r === 'sistema' ? 'Aviso de teste enviado pelo sistema.' : 'Aviso de teste mostrado dentro do Paulus (o sistema não está liberado).'; }); };
    o.classList.add('on'); g('[data-av-x]').focus();
  }

  /* ---------- cartão de abertura (igual ao do Argo: relógio, resumo da semana, estado da sincronização) ---------- */
  var gShownAt = 0, gSlow = 0, gClock = 0, gFocus = null;
  function mutedToday() { return lsGet(MUDO) === key(new Date()); }
  function lateCount() { return lateList().length; }
  function weekSummary() {
    var now = new Date(), tk = key(now);
    var days = weekDates(now).map(function (d) {
      var k = key(d), all = rows(k);
      return { k: k, d: d, o: official(k), md: mds()[k] || [], open: all.filter(function (e) { return !e.done; }), done: all.filter(function (e) { return e.done; }).length, isToday: k === tk, past: k < tk };
    });
    return { tk: tk, days: days, late: lateCount() };
  }
  function nextMilestone(from) {
    for (var i = 1; i <= 120; i++) {
      var d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, 12), k = key(d);
      if (official(k)) return { d: d, days: i, text: officialName(k) };
      var m = mds()[k]; if (m && m.length) return { d: d, days: i, text: 'MDS: ' + mdsText(m[0]) };
    }
    return null;
  }
  function whenWord(n) { return n === 1 ? 'amanhã' : 'em ' + n + ' dias'; }
  function greetWord() { var h = new Date().getHours(); return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }
  function introSeen() { return lsGet(VISTO) === '1'; }
  function headline() {
    var w = greetWord();
    if (!introSeen()) return w + '! Eu sou o Paulus';
    var s = weekSummary(), td = s.days.filter(function (d) { return d.isToday; })[0], off = officialName(td.k);
    if (off) return w + '! Hoje: ' + off;
    if (td.open.length) return w + '! Hoje: ' + td.open.length + (td.open.length === 1 ? ' anotação' : ' anotações');
    if (s.late) return w + '! ' + s.late + (s.late === 1 ? ' pendência atrasada' : ' pendências atrasadas');
    return w + '! Eu sou o Paulus';
  }
  function syncInfo() {
    if (!state.code) return { k: 'none', t: 'Sincronização ainda não configurada neste aparelho.' };
    if (!state.key) return { k: 'locked', t: 'Agenda trancada — desbloqueie com a senha da equipe para ler e sincronizar as anotações.' };
    if (navigator.onLine === false) return { k: 'error', t: 'Você está offline — a sincronização volta assim que a internet voltar.' };
    if (state.sync === 'error') return { k: 'error', t: state.msg || 'Sem conexão com a sincronização. Confira a internet.' };
    if (state.sync === 'ok' && state.lastSync) return { k: 'ok', t: 'Sincronizado às ' + pad(state.lastSync.getHours()) + ':' + pad(state.lastSync.getMinutes()) + ' · anotações em dia' };
    if (Date.now() - gShownAt > 8000) return { k: 'slow', t: 'A sincronização está demorando — verifique a internet.' };
    return { k: 'connecting', t: 'Sincronizando anotações…' };
  }
  function clockSvg() {
    var t = '';
    for (var i = 0; i < 60; i++) { var big = i % 5 === 0, a = i * 6 * Math.PI / 180, r1 = big ? 84 : 89, r2 = 94; t += '<line x1="' + (100 + Math.sin(a) * r1).toFixed(1) + '" y1="' + (100 - Math.cos(a) * r1).toFixed(1) + '" x2="' + (100 + Math.sin(a) * r2).toFixed(1) + '" y2="' + (100 - Math.cos(a) * r2).toFixed(1) + '" stroke="#37e6ff" stroke-opacity="' + (big ? '.9' : '.35') + '" stroke-width="' + (big ? 2 : 1) + '"/>'; }
    return '<svg class="pa-clock" viewBox="0 0 200 200" role="img" aria-label="Relógio"><circle cx="100" cy="100" r="97" fill="#03111a" stroke="#37e6ff" stroke-opacity=".5"/>' + t +
      '<text x="100" y="140" text-anchor="middle" fill="#7fb7c4" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="10" letter-spacing="2">PAULUS</text>' +
      '<line data-h x1="100" y1="100" x2="100" y2="58" stroke="#d6f7ff" stroke-width="5" stroke-linecap="round"/><line data-m x1="100" y1="100" x2="100" y2="38" stroke="#8ff4ff" stroke-width="3.5" stroke-linecap="round"/><line data-s x1="100" y1="112" x2="100" y2="30" stroke="#ff6b5e" stroke-width="1.5" stroke-linecap="round"/><circle cx="100" cy="100" r="4.5" fill="#37e6ff"/></svg>';
  }
  function tickClock(box) {
    var h = box.querySelector('[data-h]'), m = box.querySelector('[data-m]'), s = box.querySelector('[data-s]'); if (!h) return;
    var n = new Date(), sec = n.getSeconds(), min = n.getMinutes() + sec / 60, hr = (n.getHours() % 12) + min / 60;
    h.setAttribute('transform', 'rotate(' + (hr * 30).toFixed(1) + ' 100 100)'); m.setAttribute('transform', 'rotate(' + (min * 6).toFixed(1) + ' 100 100)'); s.setAttribute('transform', 'rotate(' + (sec * 6) + ' 100 100)');
  }
  function weekHtml() {
    var s = weekSummary(), tk = s.tk, total = 0;
    var strip = s.days.map(function (d) {
      var n = d.open.length; total += n;
      var badge = n ? '<span class="pa-n' + (d.past ? ' late' : '') + '">' + n + '</span>' : d.done ? '<span class="pa-n ok" aria-hidden="true">✓</span>' : '<span class="pa-n none" aria-hidden="true">0</span>';
      var lbl = WEEK[d.d.getDay()] + ' ' + d.d.getDate() + (d.o ? ', ' + officialName(d.k) : '') + (n ? ', ' + n + (n === 1 ? ' pendente' : ' pendentes') : d.done ? ', tudo concluído' : ', nada marcado');
      return '<button type="button" class="pa-day' + (d.isToday ? ' is-today' : '') + (d.past ? ' is-past' : '') + (d.d.getDay() === 0 || d.d.getDay() === 6 ? ' is-wknd' : '') + '" data-d="' + d.k + '" aria-label="' + esc(lbl) + '"><small>' + WEEK[d.d.getDay()] + '</small><b>' + d.d.getDate() + '</b>' + badge + (d.o ? '<i class="pa-k"></i>' : d.md.length ? '<i class="pa-k md"></i>' : '') + '</button>';
    }).join('');
    var td = s.days.filter(function (d) { return d.isToday; })[0];
    var h = '<div class="pa-wk-head"><span>Resumo da semana</span>' + (total ? '<span class="pa-count">' + total + (total === 1 ? ' item' : ' itens') + '</span>' : '') + '</div><div class="pa-strip" role="group" aria-label="Dias desta semana">' + strip + '</div>';
    var lines = '';
    if (td.o) lines += '<span class="pa-chip">' + esc(officialName(td.k)) + '</span>';
    td.md.slice(0, 2).forEach(function (it) { lines += '<span class="pa-chip md">' + esc(mdsCat(it) + ': ' + mdsText(it)) + '</span>'; });
    order(td.open).slice(0, 4).forEach(function (i) { var e = td.open[i], c = cleanCat(e.cat); lines += '<div class="pa-line"' + (c ? ' style="--cat:' + CATS[c].color + '"' : '') + '><i></i>' + (cleanTime(e.time) ? '<time>' + esc(e.time) + '</time>' : '') + '<span>' + esc(e.text) + '</span></div>'; });
    if (td.open.length > 4) lines += '<div class="pa-muted">+ ' + (td.open.length - 4) + ' na agenda</div>';
    var all = td.open.length + td.done;
    if (all) lines += '<div class="pa-prog" role="img" aria-label="' + td.done + ' de ' + all + ' concluídas"><span><i style="width:' + Math.round(td.done / all * 100) + '%"></i></span>' + td.done + ' de ' + all + '</div>';
    if (!state.key) lines += '<div class="pa-muted">As anotações estão trancadas; só as datas oficiais aparecem.</div>';
    h += '<div class="pa-today"><span class="pa-tag">Hoje</span>' + (lines || '<div class="pa-muted">nada marcado</div>') + '</div>';
    if (s.late) h += '<button type="button" class="pa-late" data-late><span>⚠ ' + s.late + (s.late === 1 ? ' anotação atrasada' : ' anotações atrasadas') + '</span><span>Ver pendências ›</span></button>';
    var rest = s.days.filter(function (d) { return d.k > tk && (d.open.length || d.o || d.md.length); });
    if (rest.length) {
      h += '<div class="pa-lbl">Próximos dias</div><ul class="pa-list">' + rest.slice(0, 4).map(function (d) {
        var n = Math.round((d.d - day(tk)) / 86400000), c = '';
        if (d.o) c += '<span class="pa-chip">' + esc(officialName(d.k)) + '</span>';
        if (d.md[0]) c += '<span class="pa-chip md">' + esc('MDS: ' + mdsText(d.md[0])) + '</span>';
        if (d.open[0]) c += '<div>' + esc(d.open[0].text) + (d.open.length > 1 ? ' <span class="pa-muted">+' + (d.open.length - 1) + '</span>' : '') + '</div>';
        return '<li><span class="pa-wd">' + (n === 1 ? 'Amanhã' : WEEK[d.d.getDay()] + ' ' + dlabel(d.d)) + '</span><div>' + c + '</div></li>';
      }).join('') + '</ul>';
    } else {
      var nx = nextMilestone(new Date());
      if (nx) h += '<div class="pa-lbl">Próximo marco</div><ul class="pa-list"><li><span class="pa-wd">' + WEEK[nx.d.getDay()] + ' ' + dlabel(nx.d) + '</span><div><span class="pa-chip">' + esc(nx.text) + '</span> <span class="pa-muted">' + whenWord(nx.days) + '</span></div></li></ul>';
      else if (!total) h += '<div class="pa-muted">Nada marcado para esta semana.</div>';
    }
    return h;
  }
  function refreshGreeting() {
    var o = document.getElementById('pa-saudacao'); if (!o || !o.classList.contains('on')) return;
    var w = o.querySelector('[data-g-week]'); if (w) w.innerHTML = weekHtml();
    var si = syncInfo(), row = o.querySelector('[data-g-sync]'); row.dataset.s = si.k; row.querySelector('.tx').textContent = si.t;
    o.querySelector('[data-g-yes]').textContent = !state.key ? 'Desbloquear agenda' : state.code ? 'Ver agenda e sincronização' : 'Configurar sincronização';
  }
  function dismissGreeting() {
    var o = document.getElementById('pa-saudacao'); if (!o) return;
    var c = o.querySelector('[data-g-mute]');
    if (c) lsSet(MUDO, c.checked ? key(new Date()) : null);
    clearTimeout(gSlow); clearInterval(gClock); o.classList.remove('on');
    if (gFocus && gFocus.focus) { try { gFocus.focus(); } catch (_) { /* sem foco */ } }
  }
  function greeting() {
    var first = !introSeen();
    var o = overlay('pa-saudacao', '<div class="pa-box" tabindex="-1"><div class="pa-head"><span class="pa-pill">🔔 Notificação</span><button type="button" class="pa-x" data-g-x aria-label="Fechar notificação">✕</button></div>' +
      '<div class="pa-in">' + clockSvg() + '<p class="pa-date" data-g-date></p><h2 class="pa-title" data-g-title></h2><p class="pa-intro" data-g-intro></p>' +
      '<div data-g-week></div>' +
      '<div class="pa-sync" data-g-sync data-s="none" role="status" aria-live="polite"><span class="d" aria-hidden="true"></span><span class="tx"></span><button type="button" class="pa-btn pa-retry" data-g-retry>Tentar de novo</button></div>' +
      '<div class="pa-btns"><button type="button" class="pa-btn primary" data-g-yes>Ver agenda e sincronização</button>' +
      '<div class="pa-pair"><button type="button" class="pa-btn" data-g-note>＋ Anotar para hoje</button><button type="button" class="pa-btn" data-g-av>Avisos…</button></div>' +
      '<button type="button" class="pa-btn" data-g-no>Agora não</button></div>' +
      '<label class="pa-mute"><input type="checkbox" data-g-mute><span>Não mostrar de novo hoje</span></label></div></div>', 'Notificação de abertura da agenda');
    var g = function (s) { return o.querySelector(s); };
    var d = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    g('[data-g-date]').textContent = d.charAt(0).toUpperCase() + d.slice(1);
    g('[data-g-title]').textContent = headline();
    g('[data-g-intro]').textContent = first ? 'Sou seu painel de apoio: a agenda da semana, as anotações sincronizadas com o Argo e os avisos nos horários que você marcar — tudo cifrado no aparelho.' : 'Aqui está o resumo antes de começar.';
    if (first) lsSet(VISTO, '1');
    gFocus = document.activeElement;
    gShownAt = Date.now(); o.classList.add('on'); refreshGreeting();
    tickClock(o); clearInterval(gClock); gClock = setInterval(function () { tickClock(o); }, 1000);
    // Código salvo e agenda aberta: conecta agora, em segundo plano, para o resumo já sair com as anotações dos outros aparelhos.
    if (state.code && state.key && !state.unsub && state.sync !== 'connecting') connect(false);
    clearTimeout(gSlow); gSlow = setTimeout(refreshGreeting, 8100);
    g('[data-g-x]').onclick = g('[data-g-no]').onclick = dismissGreeting;
    o.onclick = function (e) {
      if (e.target === o) { dismissGreeting(); return; }
      var late = e.target.closest('[data-late]'), dia = e.target.closest('[data-d]');
      if (late) { dismissGreeting(); tab = 'pending'; open(true); }
      else if (dia) { var k = dia.dataset.d; dismissGreeting(); open(true); if (state.key) goto(day(k)); }
    };
    o.onkeydown = function (e) { if (e.key === 'Escape') dismissGreeting(); };
    g('[data-g-yes]').onclick = function () { dismissGreeting(); open(true); if (state.key && !state.code) showSetup(); };
    g('[data-g-note]').onclick = function () { dismissGreeting(); open(true); if (state.key) { var i = q('[data-entry]'); if (i) i.focus(); } };
    g('[data-g-av]').onclick = function () { dismissGreeting(); openAvisos(); };
    g('[data-g-retry]').onclick = function () {
      var b = g('[data-g-retry]'); if (!state.code || !state.key) { dismissGreeting(); open(true); return; }
      b.disabled = true; b.textContent = 'Tentando…'; gShownAt = Date.now(); connect(true); refreshGreeting();
      clearTimeout(gSlow); gSlow = setTimeout(refreshGreeting, 8100);
      setTimeout(function () { b.disabled = false; b.textContent = 'Tentar de novo'; }, 2500);
    };
    g('.pa-box').focus({ preventScroll: true });
  }

  function init() {
    state.code = lsGet(CODE) || ''; loadView(); loadPrefs();
    applyZoom(); try { new MutationObserver(applyZoom).observe(document.documentElement, { attributes: true, attributeFilter: ['data-tam'] }); } catch (_) { /* sem observador */ }
    if (keyRestore()) {
      if (loadLocal()) { if (state.code) connect(false); } else { state.key = null; }
    }
    setInterval(checkAlerts, 15000);
    // Internet de volta: reconecta sozinho se a sincronização tinha caído; o cartão de abertura acompanha.
    window.addEventListener('online', function () { if (state.code && state.key && state.sync === 'error') connect(true); refreshGreeting(); });
    window.addEventListener('offline', refreshGreeting);
    // Toque num aviso do sistema: o service worker pede para abrir a agenda.
    if ('serviceWorker' in navigator) { try { navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.paulusAgenda === 'abrir') open(true); }); } catch (_) { /* sem service worker */ } }
    if (location.hash === '#agenda') { setTimeout(function () { open(true); }, 400); return; }
    // Cartão de abertura (como no Argo), a menos que a pessoa tenha pedido para não mostrar hoje.
    if (!mutedToday()) setTimeout(greeting, 900);
    checkAlerts();
  }
  window.PaulusAgenda = {
    abrir: open, init: init, saudacao: greeting, avisos: openAvisos,
    // Ganchos para teste e para o resto do Paulus (somente leitura).
    _teste: { checkAlerts: checkAlerts, weekSummary: weekSummary, dailyText: dailyText, notify: notify, prefs: function () { return prefs; }, derive: derive, enc: enc, dec: dec, parseQuick: parseQuick, computeYear: computeYear, easter: easter, setKey: function (k) { state.key = k; } },
    pendencias: function (k) { return rows(k || key(new Date())).filter(function (e) { return !e.done; }).map(function (e) { return { texto: e.text, hora: e.time || '', tipo: e.cat || '' }; }); }
  };
})();
