// "abrir meus sistemas" abre os 11 sites de trabalho; "abrir sibec e drive" abre só esses.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { juntar } from '../scripts/build.mjs';

const fonte = readFileSync(new URL('../console/console.js', import.meta.url), 'utf8');
const SISTEMAS = vm.runInNewContext('(' + /var SISTEMAS = (\[[\s\S]*?\n    \]);/.exec(fonte)[1] + ')');
const TODOS = /id: 'sis-todos', titulo: [^,]+, rotulos: (\[[^\]]*\])/.exec(fonte);

function montar() {
  const sandbox = { self: {}, fetch: async () => { throw new Error('sem rede'); }, TextDecoder, AbortController, setTimeout, clearTimeout, navigator: { onLine: true } };
  vm.runInNewContext(juntar(), sandbox);
  const P = sandbox.self.Paulus;
  P.init({ app: 'paulus' });
  const abertos = [];
  SISTEMAS.forEach(a => P.registrarAcao({ id: a.id, titulo: a.t, rotulos: a.r, executar: () => abertos.push(a.u) }));
  P.registrarAcao({ id: 'sis-todos', titulo: 'Todos', rotulos: vm.runInNewContext(TODOS[1]), executar: () => SISTEMAS.forEach(a => abertos.push(a.u)) });
  return { P, abertos };
}

test('são 11 sistemas, com endereço http(s) completo e ids únicos', () => {
  assert.equal(SISTEMAS.length, 11);
  assert.equal(new Set(SISTEMAS.map(a => a.id)).size, 11);
  for (const a of SISTEMAS) { assert.match(a.u, /^https?:\/\/[^\s]+$/, a.id); assert.ok(!/senha|password/i.test(a.u), a.id); }
});

test('"abrir meus sistemas" abre os 11', async () => {
  const { P, abertos } = montar();
  const r = await P.perguntar('abrir meus sistemas');
  assert.equal(r.tipo, 'acao');
  assert.deepEqual(abertos, Array.from(SISTEMAS, a => a.u));
});

test('"abrir sibec e drive" abre só esses dois', async () => {
  const { P, abertos } = montar();
  await P.perguntar('abrir o sibec e o drive');
  assert.deepEqual(abertos, [SISTEMAS.find(a => a.id === 'sis-sibec').u, SISTEMAS.find(a => a.id === 'sis-drive').u]);
});

test('"abrir cadunico" não puxa os outros', async () => {
  const { P, abertos } = montar();
  await P.perguntar('abra o cadunico');
  assert.deepEqual(abertos, ['https://cadunico.dataprev.gov.br/portal/']);
});
