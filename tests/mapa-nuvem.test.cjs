/* Ponte das rotas salvas (Firestore REST): codificação dos valores, uid do token e fluxo salvar/listar/apagar com fetch de mentira. */
const assert = require('assert');
const store = {}; globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
globalThis.addEventListener = () => {}; globalThis.dispatchEvent = () => {};
const jwt = 'x.' + Buffer.from(JSON.stringify({ user_id: 'u1' })).toString('base64url') + '.y';
globalThis.PaulusSessao = { firebase: true, token: () => jwt };
const banco = new Map(), chamadas = [];
globalThis.fetch = async (url, o) => {
  chamadas.push(o.method + ' ' + url); assert.strictEqual(o.headers.Authorization, 'Bearer ' + jwt);
  const id = decodeURIComponent(url.split('/rotas/')[1] || '').split('?')[0];
  if (o.method === 'PATCH') { banco.set(id, JSON.parse(o.body).fields); return { ok: true, status: 200, json: async () => ({}) }; }
  if (o.method === 'DELETE') { banco.delete(id); return { ok: true, status: 200, json: async () => ({}) }; }
  return { ok: true, status: 200, json: async () => ({ documents: [...banco].map(([k, f]) => ({ name: 'projects/p/databases/(default)/documents/users/u1/rotas/' + k, fields: f })) }) };
};
const N = require('./_mapa.cjs')('mapa-nuvem.js');
const { cod, dec, uidDoToken } = N._teste;
const o = { nome: 'Terça', n: 3, x: 1.5, ok: true, v: null, l: [{ lat: 2.8, lng: -60.7, rotulo: 'Rua A' }] };
assert.deepStrictEqual(dec(cod(o)), o); assert.strictEqual(uidDoToken(jwt), 'u1');
(async () => {
  await new Promise((r) => setTimeout(r, 4300));            // o vigia detecta o login
  assert.ok(N.logado(), 'logado pelo PaulusSessao');
  const h = N.salvar({ nome: 'A', modo: 'carro', paradas: [], destino: { lat: 1, lng: 2, rotulo: 'd' }, atualizadoEm: 5 }, 'r1');
  await h.pronto; assert.ok(banco.has('r1'), 'gravou no Firestore');
  assert.strictEqual(N.lista().length, 1); assert.strictEqual(N.lista()[0].nome, 'A'); assert.strictEqual(N.lista()[0].destino.lat, 1);
  await N.apagar('r1'); assert.ok(!banco.has('r1')); assert.strictEqual(N.lista().length, 0);
  console.log('mapa-nuvem: ok'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
