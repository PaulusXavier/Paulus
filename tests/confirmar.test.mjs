import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function novo() {
  const sandbox = { window: {}, Promise, Date };
  vm.runInNewContext(readFileSync(new URL('../console/confirmar.js', import.meta.url), 'utf8'), sandbox);
  return sandbox.window.PaulusConfirmar;
}

test('pedir: só confirma com true explícito da tela', async () => {
  const C = novo();
  C.init({ pergunta: async () => true });
  assert.equal(await C.pedir('Apagar?'), true);
  C.init({ pergunta: async () => 'sim' });
  assert.equal(await C.pedir('Apagar?'), false);
  C.init({ pergunta: () => { throw new Error('x'); } });
  assert.equal(await C.pedir('Apagar?'), false);
});

test('pedir: sem tela e sem confirm, não apaga', async () => {
  assert.equal(await novo().pedir('Apagar?'), false);
});

test('desfazer roda a restauração uma única vez', async () => {
  const C = novo(); let n = 0;
  const r = C.registrar('Lista apagada', () => { n++; });
  const a = await C.desfazer(r.id), b = await C.desfazer(r.id);
  assert.equal(a.ok, true); assert.match(a.texto, /lista apagada restaurado/);
  assert.equal(b.ok, false); assert.equal(n, 1);
});

test('falha ao restaurar permite tentar de novo', async () => {
  const C = novo(); let tent = 0;
  const r = C.registrar('Itens', () => { if (++tent === 1) throw new Error('sem rede'); });
  const a = await C.desfazer(r.id);
  assert.equal(a.ok, false); assert.match(a.texto, /sem rede/);
  assert.equal((await C.desfazer(r.id)).ok, true);
});

test('recibo vence depois de 10 minutos', async () => {
  const C = novo(); let t = 1000; C.init({ relogio: () => t });
  const r = C.registrar('Itens', () => {});
  t += 10 * 60 * 1000 + 1;
  assert.equal((await C.desfazer(r.id)).ok, false);
  assert.equal(C.pendentes(), 0);
});

test('guarda no máximo 10 recibos e ultimo() devolve o mais novo', () => {
  const C = novo();
  for (let i = 0; i < 12; i++) C.registrar('a' + i, () => {});
  assert.equal(C.pendentes(), 10);
  assert.equal(C.ultimo().rotulo, 'a11');
  assert.equal(C.registrar('x', null), null);
});
