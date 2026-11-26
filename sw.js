// Service worker do Console do Paulus: guarda a tela para abrir sem internet. Rede primeiro (atualiza sozinho), cache como reserva.
// Só arquivos do próprio site; as perguntas à IA (Worker, outro domínio) nunca passam pelo cache.
var V = 'paulus-console-v4';
var BASE = ['./', 'index.html', 'paulus.v1.js', 'login.js', 'console.js', 'advanced.js', 'confirmar.js', 'lembretes.js', 'notas.js', 'docs.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
// Para funcionar sem internet logo na primeira vez: a base de normas, o editor de PDF e o mapa também ficam guardados na instalação.
// Um a um e sem derrubar a instalação se algum falhar (arquivo pesado, rede lenta, ainda não publicado): o que faltar entra no cache quando for usado.
// A base entra UMA vez, inteira (é o que o console carrega). Os pacotes geral/psicologia são as duas metades dela e só servem aos apps que os copiam.
var EXTRAS = ['conhecimento.json', 'pdf-lib.min.js', 'pdf-encrypt.umd.js', 'pdf.min.mjs', 'pdf.worker.min.mjs', 'leaflet.js', 'lugares-boa-vista.json'];
// Rede ruim (sinal que "existe" mas não anda): depois deste tempo, se já há cópia guardada, ela é usada em vez de esperar a rede. Sem cópia, espera a rede.
var ESPERA_REDE_MS = 4000;
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(V).then(function (c) {
    return c.addAll(BASE).then(function () {
      return Promise.all(EXTRAS.map(function (u) { return c.add(u).catch(function () { /* fica para quando for usado */ }); }));
    });
  }).then(function () { return self.skipWaiting(); }));
});
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
