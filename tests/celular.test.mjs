// Funções pensadas para o celular: receber texto compartilhado de outro app, compartilhar a resposta e dica de instalação no iPhone.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const ler = (c) => readFileSync(new URL('../' + c, import.meta.url), 'utf8');

test('manifest: o app instalado aparece no menu Compartilhar e recebe título, texto e endereço', () => {
  const m = JSON.parse(ler('manifest.webmanifest'));
  assert.equal(m.share_target.method, 'GET');
  assert.equal(m.share_target.action, './');
  assert.deepEqual(m.share_target.params, { title: 'title', text: 'text', url: 'url' });
  assert.equal(m.start_url, './');
});

test('console.js: sintaxe válida, botão Compartilhar só com navigator.share e sem enviar nada sozinho', () => {
  const c = ler('console/console.js');
  assert.doesNotThrow(() => new vm.Script(c));
  assert.match(c, /typeof navigator\.share === 'function'/);
  assert.match(c, /r\.tipo !== 'crise'/, 'resposta de crise não ganha botão de compartilhar');
  // o texto recebido só preenche a caixa de pergunta: nada de enviar(...) nesse trecho
  const i = c.indexOf("['title', 'text', 'url'].map");
  assert.ok(i > 0);
  assert.doesNotMatch(c.slice(i, i + 900), /\benviar\(/);
});
