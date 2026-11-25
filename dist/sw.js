// Service worker do Console do Paulus: guarda a tela para abrir sem internet. Rede primeiro (atualiza sozinho), cache como reserva.
// Só arquivos do próprio site; as perguntas à IA (Worker, outro domínio) nunca passam pelo cache.
var V = 'paulus-console-bc691b4515f3';
var BASE = ['./', 'index.html', 'paulus.v1.js', 'login.js', 'console.js', 'notas.js', 'docs.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(V).then(function (c) { return c.addAll(BASE); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(function (res) {
    if (res && res.ok && res.type === 'basic') { var cp = res.clone(); caches.open(V).then(function (c) { c.put(r, cp); }).catch(function () { /* sem espaço: segue sem guardar */ }); }
    return res;
  }).catch(function () { return caches.match(r).then(function (m) { return m || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()); }); }));
});
