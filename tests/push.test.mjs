import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto as wc } from 'node:crypto';
import { emB64u, deB64u, cifrarParaAparelho, cabecalhoVapid, endpointValido, validarAssinatura, validarItens, pushLigado, tratarPush, PaulusPush, LIMITES } from '../worker/push.mjs';

const enc = new TextEncoder(), dec = new TextDecoder();
const junta = (...p) => { const o = new Uint8Array(p.reduce((a, x) => a + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
async function hkdf(sal, ikm, info, n) { const k = await wc.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']); return new Uint8Array(await wc.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sal, info }, k, n * 8)); }

// Lado do aparelho (o que o navegador faz): decifra o corpo aes128gcm com a chave privada do aparelho e o segredo de autenticação.
async function decifrarComoNavegador(corpo, par, auth) {
  const sal = corpo.slice(0, 16), rs = new DataView(corpo.buffer, corpo.byteOffset).getUint32(16), idlen = corpo[20];
  assert.equal(rs, 4096);
  const asPublica = corpo.slice(21, 21 + idlen), cifrado = corpo.slice(21 + idlen);
  const uaPublica = new Uint8Array(await wc.subtle.exportKey('raw', par.publicKey));
  const asChave = await wc.subtle.importKey('raw', asPublica, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const seg = new Uint8Array(await wc.subtle.deriveBits({ name: 'ECDH', public: asChave }, par.privateKey, 256));
  const ikm = await hkdf(auth, seg, junta(enc.encode('WebPush: info\0'), uaPublica, asPublica), 32);
  const cek = await hkdf(sal, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16), nonce = await hkdf(sal, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const claro = new Uint8Array(await wc.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await wc.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), cifrado));
  assert.equal(claro[claro.length - 1], 2);
  return dec.decode(claro.slice(0, -1));
}
async function aparelho() {
  const par = await wc.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const auth = wc.getRandomValues(new Uint8Array(16));
  return { par, auth, p256dh: emB64u(new Uint8Array(await wc.subtle.exportKey('raw', par.publicKey))), authB64: emB64u(auth) };
}
async function vapid() {
  const par = await wc.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { par, env: { VAPID_PUBLICA: emB64u(new Uint8Array(await wc.subtle.exportKey('raw', par.publicKey))), VAPID_PRIVADA: JSON.stringify(await wc.subtle.exportKey('jwk', par.privateKey)), VAPID_CONTATO: 'mailto:t@t.org' } };
}

test('push: a mensagem cifrada (RFC 8291) é decifrada pelo aparelho, com acentos e blocos de texto longos', async () => {
  const a = await aparelho();
  for (const t of ['oi', 'Atendimento às 14:00 — família São José ✓', 'x'.repeat(2000)]) {
    const corpo = await cifrarParaAparelho(t, a.p256dh, a.authB64);
    assert.equal(await decifrarComoNavegador(corpo, a.par, a.auth), t);
  }
  await assert.rejects(() => cifrarParaAparelho('x', 'curta', a.authB64));
  await assert.rejects(() => cifrarParaAparelho('x'.repeat(4100), a.p256dh, a.authB64));
});

test('push: o cabeçalho VAPID é um JWT ES256 válido para o endereço do serviço de push', async () => {
  const v = await vapid();
  const h = await cabecalhoVapid(v.env, 'https://fcm.googleapis.com/fcm/send/abc', 1700000000000);
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(h);
  assert.ok(m); assert.equal(m[4], v.env.VAPID_PUBLICA);
  const carga = JSON.parse(dec.decode(deB64u(m[2])));
  assert.equal(carga.aud, 'https://fcm.googleapis.com'); assert.equal(carga.sub, 'mailto:t@t.org'); assert.equal(carga.exp, 1700000000 + 12 * 3600);
  assert.equal(JSON.parse(dec.decode(deB64u(m[1]))).alg, 'ES256');
  assert.equal(await wc.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, v.par.publicKey, deB64u(m[3]), enc.encode(m[1] + '.' + m[2])), true);
});

test('push: só serviços de push conhecidos e dados no formato certo', async () => {
  for (const u of ['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/x', 'https://wns2-par02p.notify.windows.com/w/?token=x']) assert.equal(endpointValido(u), true, u);
  for (const u of ['http://fcm.googleapis.com/x', 'https://evil.example.com/x', 'https://fcm.googleapis.com.evil.com/x', 'https://u:p@fcm.googleapis.com/x', 'lixo', 'https://169.254.169.254/']) assert.equal(endpointValido(u), false, u);
  const a = await aparelho();
  assert.ok(validarAssinatura({ endpoint: 'https://fcm.googleapis.com/x', p256dh: a.p256dh, auth: a.authB64 }));
  assert.equal(validarAssinatura({ endpoint: 'https://fcm.googleapis.com/x', p256dh: 'AAAA', auth: a.authB64 }), null);
  const agora = Date.now();
  const itens = validarItens([{ id: 'a1', at: agora + 5000, blob: 'AbC-_9' }, { id: 'a1', at: agora + 6000, blob: 'AbC' }, { id: 'a2', at: agora - 999999, blob: 'AbC' }, { id: 'a3', at: agora + 99 * 86400000, blob: 'AbC' }, { id: 'a4', at: agora + 5000, blob: 'tem espaço' }, { id: 'a 5', at: agora + 5000, blob: 'AbC' }], agora);
  assert.deepEqual(itens.map((i) => i.id), ['a1']);
  assert.equal(validarItens('x', agora), null);
});

test('push: rotas exigem usuário e ligação; sem VAPID o recurso fica desligado', async () => {
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200 });
  assert.equal(pushLigado({}), false);
  let r = await tratarPush(new Request('https://x/push/chave', { method: 'POST', body: '{}' }), {}, json, 'paulo', '/push/chave');
  assert.equal((await r.json()).ligado, false);
  const v = await vapid();
  const env = Object.assign({ PUSH: { idFromName: (n) => n, get: () => ({ fetch: async (u, o) => new Response(JSON.stringify({ u, o: JSON.parse(o.body) })) }) } }, v.env);
  r = await tratarPush(new Request('https://x/push/chave', { method: 'POST', body: '{}' }), env, json, 'paulo', '/push/chave');
  assert.deepEqual(await r.json(), { ligado: true, chave: v.env.VAPID_PUBLICA });
  r = await tratarPush(new Request('https://x/push/agendar', { method: 'POST', body: '{}' }), env, json, '', '/push/agendar');
  assert.equal(r.status, 401);
  r = await tratarPush(new Request('https://x/push/agendar', { method: 'POST', body: JSON.stringify({ id: 'abcdefgh12', itens: [{ id: 'k1', at: Date.now() + 9000, blob: 'AAAA' }] }) }), env, json, 'paulo', '/push/agendar');
  const j = await r.json(); assert.equal(j.u, 'https://push.interno/agendar'); assert.equal(j.o.itens.length, 1);
  r = await tratarPush(new Request('https://x/push/assinar', { method: 'POST', body: JSON.stringify({ endpoint: 'https://evil.com/x' }) }), env, json, 'paulo', '/push/assinar');
  assert.equal(r.status, 400);
});

// Durable Object com SQLite de verdade (node:sqlite) e alarme simulado: do agendamento ao envio, com tentativa, assinatura morta e limpeza.
function criarEstado() {
  const { DatabaseSync } = require_sqlite();
  const db = new DatabaseSync(':memory:');
  let alarme = null;
  return {
    alarme: () => alarme,
    storage: {
      sql: { exec(q, ...p) { const st = db.prepare(q); const linhas = /^\s*(SELECT|PRAGMA)/i.test(q) ? st.all(...p) : (st.run(...p), []); return { toArray: () => linhas }; } },
      async setAlarm(t) { alarme = t; }, async deleteAlarm() { alarme = null; }
    }
  };
}
import { createRequire } from 'node:module';
function require_sqlite() { return createRequire(import.meta.url)('node:sqlite'); }

let temSqlite = true; try { require_sqlite(); } catch (e) { temSqlite = false; }
test('push: Durable Object agenda, envia na hora, repete se falhar e apaga assinatura morta', { skip: !temSqlite && 'Node sem node:sqlite' }, async () => {
  const v = await vapid(), a = await aparelho();
  const envios = [];
  let status = 201;
  const buscar0 = globalThis.fetch;
  globalThis.fetch = async (url, o) => { envios.push({ url, o }); return new Response(null, { status }); };
  try {
    const estado = criarEstado();
    const objeto = new PaulusPush(estado, v.env);
    const chamar = async (rota, corpo) => { const r = await objeto.fetch(new Request('https://push.interno' + rota, { method: 'POST', body: JSON.stringify(corpo) })); return { status: r.status, j: await r.json() }; };
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: a.p256dh, auth: a.authB64 };
    const { j: s } = await chamar('/assinar', sub);
    assert.equal(s.ok, true); assert.match(s.id, /^[\w-]{22}$/);
    assert.equal((await chamar('/agendar', { id: 'naoexiste00', itens: [] })).status, 404);
    const agora = Date.now();
    await chamar('/agendar', { id: s.id, itens: [{ id: 'k1', at: agora + 60000, blob: 'Zm9v' }, { id: 'k2', at: agora - 1000, blob: 'YmFy' }] });
    assert.ok(estado.alarme() <= agora + 1000, 'alarme no aviso mais próximo (já devido)');
    status = 500;
    await objeto.alarm();                                   // falha: fica para repetir
    assert.equal(envios.length, 1);
    assert.ok(estado.alarme() >= Date.now() + 25000, 'repete depois de ~30 s');
    status = 201;
    await objeto.alarm();                                   // repetição ainda cedo? o item continua devido: envia
    assert.equal(envios.length, 2);
    const corpoEnviado = new Uint8Array(await new Response(envios[1].o.body).arrayBuffer());
    assert.equal(await decifrarComoNavegador(corpoEnviado, a.par, a.auth), 'YmFy');
    assert.match(envios[1].o.headers.Authorization, /^vapid t=/);
    assert.equal((await chamar('/estado', { id: s.id })).j.pendentes, 1);   // sobrou o k1 (daqui a 1 min)
    assert.ok(estado.alarme() >= agora + 59000);
    // teste não é apagado por um novo agendamento
    await chamar('/agendar', { id: s.id, somar: true, itens: [{ id: 'teste', at: agora + 90000, blob: 'dGVzdGU' }] });
    await chamar('/agendar', { id: s.id, itens: [{ id: 'k3', at: agora + 120000, blob: 'YWJj' }] });
    assert.equal((await chamar('/estado', { id: s.id })).j.pendentes, 2);   // k3 + teste
    // assinatura morta (410): apaga assinatura e avisos
    await chamar('/agendar', { id: s.id, somar: true, itens: [{ id: 'teste2', at: Date.now() - 10, blob: 'YWJj' }] });
    status = 410; await objeto.alarm();
    assert.equal((await chamar('/estado', { id: s.id })).j.ativo, false);
    assert.equal(estado.alarme(), null);
    // máximo de aparelhos
    for (let i = 0; i < LIMITES.assinaturas + 2; i++) await chamar('/assinar', Object.assign({}, sub, { endpoint: 'https://fcm.googleapis.com/fcm/send/n' + i }));
    const estado2 = await chamar('/estado', { id: s.id });
    assert.equal(estado2.j.ativo, false);
  } finally { globalThis.fetch = buscar0; }
});
