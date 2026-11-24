// "abrir meus sistemas" abre os 12 sites de trabalho; "abrir sibec e drive" abre só esses.
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

test('são 12 sistemas, com endereço http(s) completo e ids únicos', () => {
  assert.equal(SISTEMAS.length, 12);
  assert.equal(new Set(SISTEMAS.map(a => a.id)).size, 12);
  for (const a of SISTEMAS) { assert.match(a.u, /^https?:\/\/[^\s]+$/, a.id); assert.ok(!/senha|password/i.test(a.u), a.id); }
});

test('"abrir meus sistemas" abre os 12', async () => {
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

test('Cidade Social abre direto na tela de login e a Carteira da Pessoa Idosa está na lista', async () => {
  assert.equal(SISTEMAS.find(a => a.id === 'sis-cidadesocial').u, 'https://cidadesocial.pmbv.rr.gov.br/auth/login/');
  const { P, abertos } = montar();
  await P.perguntar('abrir a carteira da pessoa idosa');
  assert.deepEqual(abertos, ['https://redesuas.mds.gov.br/carteiradapessoaidosa/']);
});

test('"chama o sibec", "acessar o cadunico" e "entrar no drive" também abrem', async () => {
  for (const [frase, id] of [['chama o sibec', 'sis-sibec'], ['chame o cadunico', 'sis-cadunico'], ['acessar o cadunico', 'sis-cadunico'], ['entrar no drive', 'sis-drive'], ['entre no portal do cidadao', 'sis-portalcidadao'], ['acessa o sigpbf por favor', 'sis-sigpbf']]) {
    const { P, abertos } = montar();
    const r = await P.perguntar(frase);
    assert.equal(r.tipo, 'acao', frase);
    assert.deepEqual(abertos, [SISTEMAS.find(a => a.id === id).u], frase);
  }
});

test('"chama o sibec e o cadunico" abre os dois; "acessar meus sistemas" abre todos', async () => {
  let { P, abertos } = montar();
  await P.perguntar('chama o sibec e o cadunico');
  assert.deepEqual(abertos, [SISTEMAS.find(a => a.id === 'sis-sibec').u, SISTEMAS.find(a => a.id === 'sis-cadunico').u]);
  ({ P, abertos } = montar());
  await P.perguntar('acessar meus sistemas');
  assert.equal(abertos.length, 12);
});

test('verbo solto com mais assunto na frase não abre nada: vai para a IA', async () => {
  for (const frase of ['chamar o cadunico para a familia como faco', 'acessar o sibec para consultar o beneficio de maria', 'entrar em contato com o drive da prefeitura amanha']) {
    const { P, abertos } = montar();
    let r; try { r = await P.perguntar(frase); } catch (e) { r = { tipo: 'erro' }; }
    assert.notEqual(r.tipo, 'acao', frase);
    assert.deepEqual(abertos, [], frase);
  }
});

test('apelidos curtos abrem o site certo', async () => {
  for (const [frase, id] of [['abrir caixa', 'sis-sibec'], ['abrir dataprev', 'sis-cadunico'], ['abrir carteira', 'sis-carteira-idosa'], ['abrir bv', 'sis-bvcidadao'], ['abrir sip', 'sis-sipweb'], ['abrir pasta do drive', 'sis-drive']]) {
    const { P, abertos } = montar();
    await P.perguntar(frase);
    assert.deepEqual(abertos, [SISTEMAS.find(a => a.id === id).u], frase);
  }
});

test('console: botão e painel "Meus sistemas", /sistemas e um atalho por site', () => {
  const html = readFileSync(new URL('../console/index.html', import.meta.url), 'utf8');
  assert.match(html, /<button id="sx"[^>]*aria-label="Meus sistemas"/);
  assert.match(html, /#sxp\{/);
  assert.match(fonte, /c: '\/sistemas'/);
  assert.match(fonte, /'\/' \+ a\.id\.replace\(\/\^sis-\/, ''\)/);
  assert.match(fonte, /var ORDEM = \[[^\]]*'sx'/);
  assert.match(fonte, /l\.target = '_blank'; l\.rel = 'noopener noreferrer'/);
});
