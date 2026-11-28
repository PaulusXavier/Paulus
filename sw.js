// Service worker do Console do Paulus: guarda a tela para abrir sem internet. Rede primeiro (atualiza sozinho), cache como reserva.
// Só arquivos do próprio site; as perguntas à IA (Worker, outro domínio) nunca passam pelo cache.
var V = 'paulus-console-v7';
var BASE = ['./', 'index.html', 'paulus.v1.js', 'login.js', 'console.js', 'advanced.js', 'ortografia.js', 'confirmar.js', 'lembretes.js', 'notas.js', 'agenda.js', 'agenda-datas.js', 'agenda-mds.js', 'docs.js', 'relatorios-ui.mjs', 'relatorios-bf.mjs', 'relatorios-abrigos.mjs', 'abrigos-ui.mjs', 'rota-folhas.mjs', 'rota-visita-ui.mjs', 'planilhas-mds.mjs', 'planilhas-mds-ui.mjs', 'agenda-pdf.mjs', 'relatorio-individual-pdf.mjs', 'visitas.mjs', 'mapa-rotas.css', 'mapa-util.js', 'mapa-foco.js', 'mapa-offline.js', 'mapa-folhas.js', 'mapa-nuvem.js', 'mapa-rotas.js', 'mapa-ui.js', 'relatorios-nav.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
// Para funcionar sem internet logo na primeira vez: a base de normas, o editor de PDF e o mapa também ficam guardados na instalação.
// Um a um e sem derrubar a instalação se algum falhar (arquivo pesado, rede lenta, ainda não publicado): o que faltar entra no cache quando for usado.
// A base entra UMA vez, inteira (é o que o console carrega). Os pacotes geral/psicologia são as duas metades dela e só servem aos apps que os copiam.
var EXTRAS = ['spell/pt.aff', 'spell/pt.dic', 'spell/spell-worker.js', 'conhecimento.json', 'pdf-lib.min.js', 'pdf-encrypt.umd.js', 'jspdf.umd.min.js', 'jszip.min.js', 'pdf.min.mjs', 'pdf.worker.min.mjs', 'leaflet.js', 'lugares-boa-vista.json', 'xlsx.bundle.js',
  // OCR da Rota de Visita (folha escaneada): leitor, idioma e núcleo moderno ficam guardados para funcionar em campo sem internet; o núcleo antigo entra se for usado
  'tesseract/tesseract.min.js', 'tesseract/worker.min.js', 'tesseract/lang/por.traineddata.gz', 'tesseract/core/tesseract-core-simd-lstm.wasm.js'];
// Rede ruim (sinal que "existe" mas não anda): depois deste tempo, se já há cópia guardada, ela é usada em vez de esperar a rede. Sem cópia, espera a rede.
var ESPERA_REDE_MS = 4000;
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(V).then(function (c) {
    return c.addAll(BASE).then(function () {
      return Promise.all(EXTRAS.map(function (u) { return c.add(u).catch(function () { /* fica para quando for usado */ }); }));
    });
  }).then(function () { return self.skipWaiting(); }));
});
// O app pode pedir para a versão nova assumir já (ver o registro em console.js).
self.addEventListener('message', function (e) { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  // Cópia guardada: ignora o que vem depois do "?" (ex.: ?v=123), para o endereço com versão achar o arquivo guardado sem ela.
  var guardada = function () {
    return caches.match(r).then(function (m) { return m || caches.match(r, { ignoreSearch: true }); });
  };
  // Só regrava a cópia quando o arquivo mudou (mesmo ETag, ou mesmo Last-Modified se não houver ETag): antes, toda abertura regravava os 13 MB da base
  // mesmo com o servidor respondendo 304. Sem ETag nem Last-Modified, grava como antes.
  var igualAGuardada = function (res, antiga) {
    if (!antiga || !res.headers || !antiga.headers || typeof res.headers.get !== 'function' || typeof antiga.headers.get !== 'function') return false;
    var et = res.headers.get('etag');
    if (et) return et === antiga.headers.get('etag');
    var lm = res.headers.get('last-modified');
    return !!lm && lm === antiga.headers.get('last-modified');
  };
  var daRede = fetch(r).then(function (res) {
    if (res && res.ok && res.type === 'basic') {
      var cp = res.clone();
      guardada().then(function (antiga) {
        if (igualAGuardada(res, antiga)) { try { if (cp.body) cp.body.cancel(); } catch (e) { /* já lido */ } return; }
        return caches.open(V).then(function (c) { return c.put(r, cp); });
      }).catch(function () { /* sem espaço: segue sem guardar */ });
    }
    return res;
  });
  // Rede primeiro (atualiza sozinho). Se a rede falhar OU demorar demais e houver cópia, usa a cópia.
  var comLimite = new Promise(function (resolve, reject) {
    var feito = false;
    var terminar = function (fn, v) { if (!feito) { feito = true; fn(v); } };
    var tempo = setTimeout(function () {
      guardada().then(function (m) { if (m) terminar(resolve, m); }, function () { /* sem cópia: segue esperando a rede */ });
    }, ESPERA_REDE_MS);
    daRede.then(function (res) { clearTimeout(tempo); terminar(resolve, res); }, function (err) { clearTimeout(tempo); terminar(reject, err); });
  });
  e.respondWith(comLimite.catch(function () {
    return guardada().then(function (m) {
      if (m) return m;
      if (r.mode === 'navigate') return caches.match('index.html').then(function (i) { return i || caches.match('./'); }).then(function (i) { return i || Response.error(); });
      return Response.error();
    });
  }));
});

// Toque num aviso da agenda: foca o Paulus aberto (e pede para abrir a agenda) ou abre uma janela nova já na agenda.
// Botões do aviso (Concluir / +10 min): com o Paulus aberto, só avisa a página e NÃO tira a pessoa do que estava fazendo;
// com o Paulus fechado, abre uma janela com #agenda!acao=...&id=... e a página aplica a ação.
self.addEventListener('notificationclick', function (e) {
  var acao = e.action === 'concluir' || e.action === 'adiar' ? e.action : '';
  var id = e.notification && e.notification.data && e.notification.data.id ? String(e.notification.data.id) : '';
  var lemb = e.notification && e.notification.data && e.notification.data.lembrete ? String(e.notification.data.lembrete) : '';
  var minLemb = e.action === 'adiar10' ? 10 : e.action === 'adiar60' ? 60 : 0;
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (lista) {
    // Lembrete adiado pelo botão do aviso: sem abrir a tela quando o app já está aberto.
    if (lemb && minLemb) {
      if (lista.length) { lista.forEach(function (c) { c.postMessage({ paulusLembrete: 'adiar', id: lemb, min: minLemb }); }); return; }
      return self.clients.openWindow('./#lembrete!adiar=' + minLemb + '&id=' + encodeURIComponent(lemb));
    }
    if (acao && id) {
      if (lista.length) { lista.forEach(function (c) { c.postMessage({ paulusAgenda: 'acao', acao: acao, id: id }); }); return; }
      return self.clients.openWindow('./#agenda!acao=' + acao + '&id=' + encodeURIComponent(id));
    }
    for (var i = 0; i < lista.length; i++) {
      if ('focus' in lista[i]) { lista[i].postMessage({ paulusAgenda: 'abrir' }); return lista[i].focus(); }
    }
    return self.clients.openWindow('./#agenda');
  }));
});

// ---------------------------------------------------------------- avisos com o app fechado (Web Push; docs/PUSH.md)
// O Worker manda um bloco CIFRADO com a chave que só existe neste aparelho (IndexedDB "paulus-push"); aqui ele é decifrado e mostrado.
function pushIdb() {
  return new Promise(function (ok, no) {
    var r = indexedDB.open('paulus-push', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
    r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); };
  });
}
function pushLer(k) { return pushIdb().then(function (db) { return new Promise(function (ok, no) { var q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = function () { ok(q.result); }; q.onerror = function () { no(q.error); }; }); }); }
function pushGravar(k, v) { return pushIdb().then(function (db) { return new Promise(function (ok, no) { var t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = function () { ok(); }; t.onerror = function () { no(t.error); }; }); }); }
function pushDeB64u(t) { var s = String(t).replace(/-/g, '+').replace(/_/g, '/'); var b = atob(s + '='.repeat((4 - (s.length % 4)) % 4)), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
function pushDecifrar(chave, blob) {
  var u = pushDeB64u(blob);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, chave, u.slice(12)).then(function (claro) { return JSON.parse(new TextDecoder().decode(claro)); });
}
self.addEventListener('push', function (e) {
  e.waitUntil((async function () {
    var blob = ''; try { blob = e.data ? e.data.text() : ''; } catch (_) { /* sem corpo */ }
    var d = null;
    try { d = await pushDecifrar(await pushLer('aes'), blob); } catch (_) { d = null; }
    var janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Com o Paulus visível, ele mesmo avisa dentro da tela (e o navegador dispensa o aviso do sistema nesse caso).
    if (d && janelas.some(function (c) { return c.visibilityState === 'visible'; })) return;
    if (!d) d = { t: 'Agenda Paulus', b: 'Você tem um aviso na agenda.' };
    var o = { body: d.b || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.i || 'paulus-push', renotify: true, lang: 'pt-BR', timestamp: d.w || Date.now(), data: { abrir: 'agenda' } };
    if (d.v !== 0) o.vibrate = d.s ? [250, 100, 250, 100, 400] : [180, 90, 180];
    if (d.s) o.requireInteraction = true;
    if (d.a && d.i) { o.data.id = d.i; o.actions = [{ action: 'concluir', title: '✓ Concluir' }, { action: 'adiar', title: '⏰ +10 min' }]; }
    if (d.l) { o.data.lembrete = d.l; o.actions = [{ action: 'adiar10', title: '⏰ +10 min' }, { action: 'adiar60', title: '⏰ +1 h' }]; }
    if (d.i) { try { var lista = (await pushLer('entregues')) || []; lista.push(d.i); await pushGravar('entregues', lista.slice(-200)); } catch (_) { /* segue */ } }
    await self.registration.showNotification(d.t || 'Agenda Paulus', o);
  })());
});
