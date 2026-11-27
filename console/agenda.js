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
  function setSync(s, msg) { state.sync = s; if (msg !== undefined) { state.msg = msg; status(msg, s === 'error'); } paintSync(); }
  function connect(force) {
    var code = state.code;
    if (!code || !state.key) return Promise.resolve();
    if (!force && state.connecting === code && (state.unsub || state.sync === 'connecting')) return Promise.resolve();
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
    setSync('ok', 'Conectado ao Firebase do Argo' + (unread ? ' · ' + unread + ' dia(s) de outra senha ignorado(s)' : ''));
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
    var pass = q('[data-pass]').value, code = q('[data-code]').value.trim().toLowerCase().replace(/\s+/g, '-');
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
<button type="button" class="ag-btn" data-notify>Avisos</button><button type="button" class="ag-btn" data-connect>⟳ Sincronizar</button><button type="button" class="ag-btn" data-lock>Trancar</button><button type="button" class="ag-btn" data-close>✕ Fechar</button></header>\
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

  /* ---------- montagem e eventos ---------- */
  function create() {
    if (ui) return;
    var css = document.createElement('style'); css.textContent = CSS; document.head.appendChild(css);
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
    q('[data-connect]').onclick = showSetup; q('[data-unlock-open]').onclick = showSetup; q('[data-lock]').onclick = lock;
    q('[data-ics]').onclick = exportIcs;
    q('[data-notify]').onclick = function () {
      if (!('Notification' in window)) { status('Este navegador não oferece avisos do sistema.', true); return; }
      Notification.requestPermission().then(function (p) { status(p === 'granted' ? 'Avisos do sistema ativados.' : 'Permissão negada; o aviso aparece na agenda aberta.', p !== 'granted'); });
    };
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
  function checkAlerts() {
    if (!state.key) return;
    var now = new Date(), k = key(now), hm = pad(now.getHours()) + ':' + pad(now.getMinutes());
    rows(k).forEach(function (e) {
      var id = k + '|' + e.createdAt + '|' + e.time;
      if (e.time === hm && !e.done && !alerted[id]) {
        alerted[id] = 1;
        if ('Notification' in window && Notification.permission === 'granted') { try { new Notification('Agenda Paulus', { body: (e.time ? e.time + ' ' : '') + e.text }); } catch (_) { /* sem permissão */ } }
        if (ui) status('Agora: ' + e.text, false);
      }
    });
  }
  function init() {
    state.code = lsGet(CODE) || ''; loadView();
    if (keyRestore()) {
      if (loadLocal()) { if (state.code) connect(false); } else { state.key = null; }
    }
    setInterval(checkAlerts, 15000);
  }
  window.PaulusAgenda = {
    abrir: open, init: init,
    // Ganchos para teste e para o resto do Paulus (somente leitura).
    _teste: { derive: derive, enc: enc, dec: dec, parseQuick: parseQuick, computeYear: computeYear, easter: easter, setKey: function (k) { state.key = k; } },
    pendencias: function (k) { return rows(k || key(new Date())).filter(function (e) { return !e.done; }).map(function (e) { return { texto: e.text, hora: e.time || '', tipo: e.cat || '' }; }); }
  };
})();
