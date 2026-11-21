import test from 'node:test';
import assert from 'node:assert/strict';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';
import { firebaseLigado, verificarFirebase, limparCacheFirebase } from '../worker/firebase.mjs';

const PROJETO = 'paulus-teste-123';
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

// Par de chaves de mentira: faz o papel do Google (as chaves públicas vão para o "JWKS" falso).
const par = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const outro = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = Object.assign(await crypto.subtle.exportKey('jwk', par.publicKey), { kid: 'k1', use: 'sig', alg: 'RS256' });

async function assinar(carga, { kid = 'k1', chave = par.privateKey, alg = 'RS256' } = {}) {
  const base = b64({ alg, kid, typ: 'JWT' }) + '.' + b64(carga);
  const ass = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(base))).toString('base64url');
  return base + '.' + ass;
}
const agora = Math.floor(Date.now() / 1000);
const carga = (extra) => Object.assign({ aud: PROJETO, iss: 'https://securetoken.google.com/' + PROJETO, sub: 'uid-1', iat: agora - 10, auth_time: agora - 10, exp: agora + 3600, email: 'Paulo@Exemplo.org', email_verified: true }, extra || {});
const env = (extra) => Object.assign({ FIREBASE_PROJECT_ID: PROJETO }, extra || {});

let buscas = 0;
const falso = async (url) => { buscas++; assert.match(url, /securetoken@system\.gserviceaccount\.com/); return { ok: true, json: async () => ({ keys: [jwk] }) }; };

test('firebase: só liga com um id de projeto válido', () => {
  assert.equal(firebaseLigado({}), false);
  assert.equal(firebaseLigado({ FIREBASE_PROJECT_ID: '' }), false);
  assert.equal(firebaseLigado({ FIREBASE_PROJECT_ID: 'a b' }), false);
  assert.equal(firebaseLigado(env()), true);
});

test('firebase: token do Google para o projeto certo vale e traz o e-mail', async () => {
  limparCacheFirebase();
  const v = await verificarFirebase(env(), await assinar(carga()), { buscar: falso });
  assert.ok(v);
  assert.equal(v.usuario, 'paulo@exemplo.org');
  assert.equal(v.uid, 'uid-1');
  assert.ok(v.expira > Date.now());
});

test('firebase: as chaves públicas ficam em cache (não busca a cada pedido)', async () => {
  limparCacheFirebase(); buscas = 0;
  for (let i = 0; i < 3; i++) assert.ok(await verificarFirebase(env(), await assinar(carga()), { buscar: falso }));
  assert.equal(buscas, 1);
});

test('firebase: assinatura falsa, outro projeto, vencido, algoritmo trocado e lixo são recusados', async () => {
  limparCacheFirebase();
  const ok = (t) => verificarFirebase(env(), t, { buscar: falso });
  assert.equal(await ok(await assinar(carga(), { chave: outro.privateKey })), null, 'assinada por outra chave');
  assert.equal(await ok(await assinar(carga({ aud: 'outro-projeto' }))), null, 'aud errado');
  assert.equal(await ok(await assinar(carga({ iss: 'https://securetoken.google.com/outro-projeto' }))), null, 'iss errado');
  assert.equal(await ok(await assinar(carga({ exp: agora - 5 }))), null, 'vencido');
  assert.equal(await ok(await assinar(carga({ iat: agora + 3600 }))), null, 'emitido no futuro');
  assert.equal(await ok(await assinar(carga({ sub: '' }))), null, 'sem sub');
  assert.equal(await ok(await assinar(carga(), { kid: 'desconhecida' })), null, 'kid desconhecido');
  assert.equal(await ok(await assinar(carga(), { alg: 'none' })), null, 'alg diferente de RS256');
  const t = await assinar(carga());
  assert.equal(await ok(t.slice(0, -4) + 'AAAA'), null, 'assinatura adulterada');
  assert.equal(await ok(t.split('.').slice(0, 2).join('.')), null, 'sem assinatura');
  for (const lixo of ['', 'abc', 'a.b.c', 'x'.repeat(5000), null, undefined, 42]) assert.equal(await ok(lixo), null);
  assert.equal(await verificarFirebase({}, t, { buscar: falso }), null, 'sem FIREBASE_PROJECT_ID');
});

test('firebase: se o Google não responde, ninguém entra (e não derruba)', async () => {
  limparCacheFirebase();
  const t = await assinar(carga());
  assert.equal(await verificarFirebase(env(), t, { buscar: async () => { throw new Error('sem rede'); } }), null);
  limparCacheFirebase();
  assert.equal(await verificarFirebase(env(), t, { buscar: async () => ({ ok: false }) }), null);
});

test('firebase: lista de e-mails e de domínios limita quem entra (e-mail precisa estar verificado)', async () => {
  limparCacheFirebase();
  const t = await assinar(carga());
  const v = (e, c) => verificarFirebase(env(e), c || t, { buscar: falso });
  assert.ok(await v({ FIREBASE_EMAILS: 'paulo@exemplo.org, ana@exemplo.org' }));
  assert.equal(await v({ FIREBASE_EMAILS: 'ana@exemplo.org' }), null);
  assert.ok(await v({ FIREBASE_DOMINIOS: 'exemplo.org' }));
  assert.equal(await v({ FIREBASE_DOMINIOS: 'outra.org' }), null);
  assert.ok(await v({ FIREBASE_EMAILS: 'ana@exemplo.org', FIREBASE_DOMINIOS: 'exemplo.org' }), 'basta uma das listas');
  assert.equal(await v({ FIREBASE_EMAILS: 'paulo@exemplo.org' }, await assinar(carga({ email_verified: false }))), null, 'e-mail não verificado');
  assert.equal(await v({ FIREBASE_EMAILS: 'paulo@exemplo.org' }, await assinar(carga({ email: undefined }))), null, 'sem e-mail');
});

test('firebase: o Worker exige o token, aceita o certo e continua aberto sem FIREBASE_PROJECT_ID', async () => {
  limparCacheFirebase();
  const original = globalThis.fetch;
  globalThis.fetch = falso;
  try {
    const m = criarManipulador({ base: [], apps: APPS });
    const e = env({ ALLOWED_ORIGINS: 'https://a.test', AI: { async run() { return { response: 'ok' }; } } });
    const pedir = (rota, corpo, h, amb) => m(new Request('https://w.test' + rota, { method: 'POST', headers: Object.assign({ Origin: 'https://a.test', 'Content-Type': 'application/json', 'CF-Connecting-IP': '5.5.5.5' }, h || {}), body: JSON.stringify(corpo) }), amb || e);
    const t = await assinar(carga());
    const sem = await pedir('/', { pergunta: 'oi', app: 'argo' });
    assert.equal(sem.status, 401);
    assert.equal((await pedir('/', { pergunta: 'oi', app: 'argo' }, { Authorization: 'Bearer lixo.lixo.lixo' })).status, 401);
    assert.notEqual((await pedir('/', { pergunta: 'oi', app: 'argo' }, { Authorization: 'Bearer ' + t })).status, 401);
    const s = await pedir('/sessao', {}, { Authorization: 'Bearer ' + t });
    assert.equal(s.status, 200);
    assert.equal((await s.json()).usuario, 'paulo@exemplo.org');
    const negada = await pedir('/sessao', {});
    assert.equal(negada.status, 401);
    assert.equal((await negada.json()).metodo, 'firebase');
    const login = await pedir('/login', { usuario: 'x', senha: 'y' });
    assert.equal(login.status, 404, 'login por senha não existe só com Firebase');
    // sem FIREBASE_PROJECT_ID o Worker segue aberto, como antes
    const aberto = { ALLOWED_ORIGINS: 'https://a.test', AI: { async run() { return { response: 'ok' }; } } };
    assert.notEqual((await pedir('/', { pergunta: 'oi', app: 'argo' }, {}, aberto)).status, 401);
    assert.equal((await (await pedir('/sessao', {}, {}, aberto)).json()).login, false);
  } finally { globalThis.fetch = original; }
});

test('firebase: o login por senha continua valendo junto com o Firebase', async () => {
  limparCacheFirebase();
  const { criarHashDeSenha } = await import('../worker/auth.mjs');
  const original = globalThis.fetch;
  globalThis.fetch = falso;
  try {
    const m = criarManipulador({ base: [], apps: APPS });
    const e = env({ AUTH_SEGREDO: 'y'.repeat(64), USUARIOS: JSON.stringify({ paulo: await criarHashDeSenha('senha-forte-2026') }), ALLOWED_ORIGINS: 'https://a.test', AI: { async run() { return { response: 'ok' }; } } });
    const pedir = (rota, corpo, h) => m(new Request('https://w.test' + rota, { method: 'POST', headers: Object.assign({ Origin: 'https://a.test', 'Content-Type': 'application/json', 'CF-Connecting-IP': '6.6.6.6' }, h || {}), body: JSON.stringify(corpo) }), e);
    const r = await (await pedir('/login', { usuario: 'paulo', senha: 'senha-forte-2026' })).json();
    assert.ok(r.token);
    assert.equal((await pedir('/sessao', {}, { Authorization: 'Bearer ' + r.token })).status, 200);
    assert.equal((await pedir('/sessao', {}, { Authorization: 'Bearer ' + await assinar(carga()) })).status, 200);
  } finally { globalThis.fetch = original; }
});

test('firebase: o cliente aceita token assíncrono (SDK do Firebase) e manda no cabeçalho', async () => {
  const { juntar } = await import('../scripts/build.mjs');
  const vm = await import('node:vm');
  const chamadas = [];
  const ctx = { console, setTimeout, clearTimeout, TextEncoder, TextDecoder, URL, AbortController, Promise, navigator: { onLine: true },
    fetch: async (url, init) => { chamadas.push({ url, init }); return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ resposta: 'ok', fontes: [] }), text: async () => JSON.stringify({ resposta: 'ok', fontes: [] }) }; } };
  ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(juntar(), ctx);
  ctx.Paulus.init({ app: 'argo', endpoint: 'https://w.test', token: async () => 'TOKEN-ASSINCRONO', base: [] });
  await ctx.Paulus.perguntar('o que é o CRAS e como funciona o serviço').catch(() => {});
  const c = chamadas.find((x) => x.url === 'https://w.test');
  assert.ok(c, 'chamou o Worker');
  assert.equal(c.init.headers.Authorization, 'Bearer TOKEN-ASSINCRONO');
});
