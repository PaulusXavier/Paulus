import test from 'node:test';
import assert from 'node:assert/strict';
import { tratarVoz, vozLigada, textoParaVoz, VOZ_MAX_CHARS } from '../worker/voz.mjs';

const cors = { 'Access-Control-Allow-Origin': 'https://x.github.io' };
const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });
const pedido = (corpo) => new Request('https://w.example/voz', { method: 'POST', body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) });
const env = { VOZ_URL: 'https://voz.example/', VOZ_TOKEN: 'segredo' };
const wav = () => new Response(new Uint8Array([82, 73, 70, 70]), { status: 200, headers: { 'Content-Type': 'audio/wav' } });

test('voz: sem VOZ_URL (ou sem https) a rota responde 404', async () => {
  assert.equal(vozLigada({}), false);
  assert.equal(vozLigada({ VOZ_URL: 'http://voz.example' }), false);
  assert.equal(vozLigada(env), true);
  assert.equal((await tratarVoz(pedido({ texto: 'oi' }), {}, json, cors)).status, 404);
});

test('voz: repassa o texto limpo com o token e devolve o áudio', async () => {
  let visto;
  const f = async (url, o) => { visto = { url, o }; return wav(); };
  const r = await tratarVoz(pedido({ texto: '**Olá**, `tudo` bem?' }), env, json, cors, f);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Type'), 'audio/wav');
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://x.github.io');
  assert.equal(visto.url, 'https://voz.example/sintetizar');
  assert.equal(visto.o.headers.Authorization, 'Bearer segredo');
  assert.equal(JSON.parse(visto.o.body).texto, 'Olá , tudo bem?');
});

test('voz: texto vazio, JSON inválido e corpo grande são recusados', async () => {
  const f = async () => wav();
  assert.equal((await tratarVoz(pedido({ texto: '  ' }), env, json, cors, f)).status, 400);
  assert.equal((await tratarVoz(pedido('{nada'), env, json, cors, f)).status, 400);
  assert.equal((await tratarVoz(pedido({ texto: 'a'.repeat(9000) }), env, json, cors, f)).status, 413);
});

test('voz: servidor fora do ar ou resposta que não é áudio não derruba o Worker', async () => {
  assert.equal((await tratarVoz(pedido({ texto: 'oi' }), env, json, cors, async () => { throw new Error('rede'); })).status, 503);
  assert.equal((await tratarVoz(pedido({ texto: 'oi' }), env, json, cors, async () => new Response('x', { status: 500 }))).status, 503);
  assert.equal((await tratarVoz(pedido({ texto: 'oi' }), env, json, cors, async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }))).status, 502);
});

test('voz: texto longo é cortado no fim de uma frase', () => {
  const t = textoParaVoz('Frase curta. '.repeat(300));
  assert.ok(t.length <= VOZ_MAX_CHARS);
  assert.ok(t.endsWith('.'));
});

// ---- pelo manipulador do Worker: origem, rota /voz e que a rota não cai no fluxo de perguntas
import { readFileSync } from 'node:fs';
import { criarManipulador } from '../worker/handler.mjs';
import { APPS } from '../worker/apps.mjs';

test('voz pelo Worker: rota /voz exige origem permitida, responde 404 sem VOZ_URL e não chama a IA', async () => {
  const base = JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8'));
  const ORIGEM = 'https://paulusxavier.github.io';
  let chamouIA = false;
  const envBase = { ALLOWED_ORIGINS: ORIGEM, AI: { async run() { chamouIA = true; return { response: 'x' }; } } };
  const m = criarManipulador({ base, apps: APPS });
  const req = (origem) => new Request('https://w.example/voz', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origem }, body: JSON.stringify({ texto: 'oi' }) });
  assert.equal((await m(req('https://estranho.com'), envBase)).status, 403);
  assert.equal((await m(req(ORIGEM), envBase)).status, 404);
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/wav' } });
  try {
    const r = await m(req(ORIGEM), Object.assign({}, envBase, { VOZ_URL: 'https://voz.example', VOZ_TOKEN: 't' }));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('Content-Type'), 'audio/wav');
  } finally { globalThis.fetch = original; }
  assert.equal(chamouIA, false);
});
