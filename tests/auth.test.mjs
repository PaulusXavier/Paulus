import test from 'node:test';
import assert from 'node:assert/strict';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';
import { criarHashDeSenha, entrar, criarSessao, verificarSessao, loginLigado, tokenDoPedido, criarFreio, normalizarUsuario } from '../worker/auth.mjs';

const SEGREDO = 'x'.repeat(64);
const hash = await criarHashDeSenha('senha-forte-2026');
const env = (extra) => Object.assign({ AUTH_SEGREDO: SEGREDO, USUARIOS: JSON.stringify({ Paulo: hash }) }, extra || {});

test('auth: sem segredo ou sem contas o login fica desligado', () => {
  assert.equal(loginLigado({}), false);
  assert.equal(loginLigado({ AUTH_SEGREDO: SEGREDO }), false);
  assert.equal(loginLigado({ AUTH_SEGREDO: SEGREDO, USUARIOS: '{}' }), false);
  assert.equal(loginLigado({ AUTH_SEGREDO: SEGREDO, USUARIOS: 'lixo' }), false);
  assert.equal(loginLigado({ AUTH_SEGREDO: 'curto', USUARIOS: JSON.stringify({ a: hash }) }), false);
  assert.equal(loginLigado(env()), true);
});

test('auth: hash é salgado e a senha confere (usuário sem diferença de caixa e espaço)', async () => {
  const h2 = await criarHashDeSenha('senha-forte-2026');
  assert.notEqual(hash, h2);
  assert.match(hash, /^pbkdf2\$100000\$[\w-]+\$[\w-]+$/);
  assert.equal(await entrar(env(), '  PAULO ', 'senha-forte-2026'), 'paulo');
  assert.equal(await entrar(env(), 'paulo', 'errada'), null);
  assert.equal(await entrar(env(), 'ninguem', 'senha-forte-2026'), null);
  assert.equal(await entrar(env(), '__proto__', 'x'), null);
  assert.equal(await entrar(env(), 'paulo', 'x'.repeat(500)), null);
});

test('auth: sessão assinada vale, adulterada/vencida/conta removida não', async () => {
  const s = await criarSessao(env(), 'paulo', { lembrar: false });
  assert.match(s.token, /^[\w.-]+$/);
  assert.ok(s.expira - Date.now() <= 12 * 3600e3 && s.expira - Date.now() > 11 * 3600e3);
  const longa = await criarSessao(env(), 'paulo', { lembrar: true });
  assert.ok(longa.expira - Date.now() > 29 * 24 * 3600e3);
  assert.deepEqual(await verificarSessao(env(), s.token), { usuario: 'paulo', expira: s.expira });
  assert.equal(await verificarSessao(env(), s.token.slice(0, -2) + 'AA'), null);
  assert.equal(await verificarSessao(env(), s.token.split('.')[0] + '.'), null);
  assert.equal(await verificarSessao(env(), ''), null);
  assert.equal(await verificarSessao(env({ AUTH_SEGREDO: 'y'.repeat(64) }), s.token), null, 'segredo trocado derruba');
  assert.equal(await verificarSessao(env({ USUARIOS: JSON.stringify({ outro: hash }) }), s.token), null, 'conta removida derruba');
  const real = Date.now; Date.now = () => real() + 13 * 3600e3;
  try { assert.equal(await verificarSessao(env(), s.token), null); assert.ok(await verificarSessao(env(), longa.token)); } finally { Date.now = real; }
});

test('auth: token do cabeçalho Authorization', () => {
  const r = (v) => new Request('https://x.test/', { headers: v ? { Authorization: v } : {} });
  assert.equal(tokenDoPedido(r('Bearer abc.def-_1')), 'abc.def-_1');
  assert.equal(tokenDoPedido(r('Basic abc')), '');
  assert.equal(tokenDoPedido(r()), '');
});

test('auth: freio bloqueia no 5º erro e dobra, e acertar zera', () => {
  const f = criarFreio();
  for (let i = 0; i < 4; i++) { f.errou('1.1.1.1', 'a'); assert.equal(f.espera('1.1.1.1', 'a'), 0); }
  f.errou('1.1.1.1', 'a');
  const e1 = f.espera('1.1.1.1', 'a'); assert.ok(e1 > 29000 && e1 <= 30000);
  f.errou('1.1.1.1', 'a');
  assert.ok(f.espera('1.1.1.1', 'a') > 59000);
  assert.equal(f.espera('2.2.2.2', 'a'), 0, 'outro IP não é afetado');
  for (let i = 0; i < 30; i++) f.errou('1.1.1.1', 'a');
  assert.ok(f.espera('1.1.1.1', 'a') <= 15 * 60000);
  f.acertou('1.1.1.1', 'a'); assert.equal(f.espera('1.1.1.1', 'a'), 0);
  assert.equal(normalizarUsuario(' Ação '), 'ação');
});

test('auth: o Worker exige login e entrega sessão', async () => {
  const m = criarManipulador({ base: [], apps: APPS });
  const e = env({ ALLOWED_ORIGINS: 'https://a.test', AI: { async run() { return { response: 'ok' }; } } });
  const pedir = (rota, corpo, h) => m(new Request('https://w.test' + rota, { method: 'POST', headers: Object.assign({ Origin: 'https://a.test', 'Content-Type': 'application/json', 'CF-Connecting-IP': '9.9.9.9' }, h || {}), body: JSON.stringify(corpo) }), e);
  assert.equal((await pedir('/', { pergunta: 'oi', app: 'argo' })).status, 401);
  assert.equal((await pedir('/login', { usuario: 'paulo', senha: 'errada' })).status, 401);
  const r = await pedir('/login', { usuario: 'Paulo', senha: 'senha-forte-2026' });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(j.ok && j.token && j.usuario === 'paulo' && j.expira > Date.now());
  const s = await pedir('/sessao', {}, { Authorization: 'Bearer ' + j.token });
  assert.equal(s.status, 200);
  assert.equal((await pedir('/sessao', {}, { Authorization: 'Bearer lixo' })).status, 401);
  assert.notEqual((await pedir('/', { pergunta: 'oi', app: 'argo' }, { Authorization: 'Bearer ' + j.token })).status, 401);
  for (let i = 0; i < 5; i++) await pedir('/login', { usuario: 'paulo', senha: 'errada' + i });
  assert.equal((await pedir('/login', { usuario: 'paulo', senha: 'senha-forte-2026' })).status, 429, 'bloqueado após erros seguidos');
});

test('auth: trocar de usuário a cada tentativa também esbarra no teto por IP', async () => {
  const m = criarManipulador({ base: [], apps: APPS });
  const e = env({ ALLOWED_ORIGINS: 'https://a.test', AI: { async run() { return { response: 'ok' }; } } });
  const tentar = (u) => m(new Request('https://w.test/login', { method: 'POST', headers: { Origin: 'https://a.test', 'CF-Connecting-IP': '7.7.7.7' }, body: JSON.stringify({ usuario: u, senha: 'errada' }) }), e);
  let ultimo = 0;
  for (let i = 0; i < 25; i++) ultimo = (await tentar('conta' + i)).status;
  assert.equal(ultimo, 429);
  const outroIp = await m(new Request('https://w.test/login', { method: 'POST', headers: { Origin: 'https://a.test', 'CF-Connecting-IP': '8.8.8.8' }, body: JSON.stringify({ usuario: 'paulo', senha: 'senha-forte-2026' }) }), e);
  assert.equal(outroIp.status, 200);
});
