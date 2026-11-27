// Sites comuns (YouTube, Google, Gmail...): abrem só digitando o nome ou com verbo; pergunta que apenas cita o site vai para a IA.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { juntar } from '../scripts/build.mjs';

const fonte = readFileSync(new URL('../console/console.js', import.meta.url), 'utf8');
const SITES = vm.runInNewContext('(' + /var SITES = (\[[\s\S]*?\n    \]);/.exec(fonte)[1] + ')');

function montar() {
  const sandbox = { self: {}, fetch: async () => { throw new Error('sem rede'); }, TextDecoder, AbortController, setTimeout, clearTimeout, navigator: { onLine: true } };
  vm.runInNewContext(juntar(), sandbox);
  const P = sandbox.self.Paulus;
  P.init({ app: 'paulus' });
  const abertos = [];
  SITES.forEach(a => P.registrarAcao({ id: a.id, titulo: a.t, rotulos: a.r, nome: true, executar: () => abertos.push(a.u) }));
  return { P, abertos };
}
const url = (id) => SITES.find(a => a.id === id).u;

test('sites: ids únicos e endereços https completos, sem senha na URL', () => {
  assert.equal(new Set(SITES.map(a => a.id)).size, SITES.length);
  for (const a of SITES) { assert.match(a.u, /^https:\/\/[^\s]+$/, a.id); assert.ok(!/senha|password|token/i.test(a.u), a.id); }
});

test('só o nome abre: youtube, youtuber, google, gmail', async () => {
  for (const [frase, id] of [['youtube', 'site-youtube'], ['youtuber', 'site-youtube'], ['YouTube', 'site-youtube'], ['google', 'site-google'], ['gmail', 'site-gmail'], ['Gmail!', 'site-gmail'], ['o google', 'site-google']]) {
    const { P, abertos } = montar();
    const r = await P.perguntar(frase);
    assert.equal(r.tipo, 'acao', frase);
    assert.deepEqual(abertos, [url(id)], frase);
  }
});

test('"google maps" abre o Maps e não o Google', async () => {
  const { P, abertos } = montar();
  await P.perguntar('google maps');
  assert.deepEqual(abertos, [url('site-maps')]);
});

test('vários nomes de uma vez: "youtube e gmail"', async () => {
  const { P, abertos } = montar();
  const r = await P.perguntar('youtube e gmail');
  assert.equal(r.tipo, 'acao');
  assert.deepEqual(abertos, [url('site-youtube'), url('site-gmail')]);
});

test('com verbo também abre: "abrir o youtube", "chama o gmail", "acessar google"', async () => {
  for (const [frase, id] of [['abrir o youtube', 'site-youtube'], ['abra o gmail', 'site-gmail'], ['chama o gmail', 'site-gmail'], ['acessar o google', 'site-google']]) {
    const { P, abertos } = montar();
    const r = await P.perguntar(frase);
    assert.equal(r.tipo, 'acao', frase);
    assert.deepEqual(abertos, [url(id)], frase);
  }
});

test('pergunta que só cita o site NÃO abre nada: segue para a IA', async () => {
  for (const frase of ['como criar um email no gmail?', 'o que é o google drive para o CRAS', 'posso usar o youtube para oficina com famílias?', 'qual a diferença entre gmail e google?']) {
    const { P, abertos } = montar();
    await P.perguntar(frase).catch(() => null);
    assert.deepEqual(abertos, [], frase);
  }
});
