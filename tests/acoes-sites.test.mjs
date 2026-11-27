// Sites comuns (YouTube, Google, Gmail...): abrem só digitando o nome ou com verbo; pergunta que apenas cita o site vai para a IA.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { juntar } from '../scripts/build.mjs';

const fonte = readFileSync(new URL('../console/console.js', import.meta.url), 'utf8');
const SITES = vm.runInNewContext('(' + /var SITES = (\[[\s\S]*?\n    \]);/.exec(fonte)[1] + ')');
const APPS = vm.runInNewContext('(' + /var APPS = (\[[\s\S]*?\n    \]);/.exec(fonte)[1] + ')');
const SISTEMAS = vm.runInNewContext('(' + /var SISTEMAS = (\[[\s\S]*?\n    \]);/.exec(fonte)[1] + ')');

function montar() {
  const sandbox = { self: {}, fetch: async () => { throw new Error('sem rede'); }, TextDecoder, AbortController, setTimeout, clearTimeout, navigator: { onLine: true } };
  vm.runInNewContext(juntar(), sandbox);
  const P = sandbox.self.Paulus;
  P.init({ app: 'paulus' });
  const abertos = [];
  // Mesmo registro do console: sites abrem por nome (menos os n: 0), por pesquisa (q:) e por endereço digitado.
  APPS.concat(SISTEMAS).forEach(a => P.registrarAcao({ id: a.id, titulo: a.t, rotulos: a.r, executar: () => abertos.push(a.u) }));
  SITES.forEach(a => P.registrarAcao({ id: a.id, titulo: a.t, rotulos: a.r, nome: a.n !== 0, executar: () => abertos.push(a.u), abrirBusca: a.q ? (assunto) => abertos.push(a.q + encodeURIComponent(assunto)) : undefined }));
  P.registrarSiteLivre((u) => abertos.push(u));
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

test('catálogo grande: cada site abre pelo nome principal e pelos apelidos', async () => {
  assert.ok(SITES.length >= 100, 'catálogo com pelo menos 100 sites');
  for (const a of SITES) {
    for (const apelido of a.r) {
      const { P, abertos } = montar();
      const frase = a.n === 0 ? 'abrir ' + apelido : apelido;
      const r = await P.perguntar(frase);
      assert.equal(r.tipo, 'acao', a.id + ' / ' + frase);
      assert.deepEqual(abertos, [a.u], a.id + ' / ' + frase);
    }
  }
});

test('apelidos não se repetem entre sites, apps e sistemas (ninguém abre o site errado)', () => {
  const norm = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const dono = new Map();
  for (const a of [].concat(APPS, SISTEMAS, SITES)) {
    for (const r of a.r) {
      const k = norm(r);
      assert.equal(k, r, 'apelido já normalizado (sem acento, minúsculo): ' + r);
      assert.ok(!dono.has(k) || dono.get(k) === a.id, 'apelido repetido: "' + r + '" em ' + dono.get(k) + ' e ' + a.id);
      dono.set(k, a.id);
    }
  }
});

test('mistura de nomes: "netflix e spotify", "g1 roraima e folha bv"', async () => {
  let t = montar();
  await t.P.perguntar('netflix e spotify');
  assert.deepEqual(t.abertos, [url('site-netflix'), url('site-spotify')]);
  t = montar();
  await t.P.perguntar('g1 roraima e folha bv');
  assert.deepEqual(t.abertos, [url('site-g1-roraima'), url('site-folhabv')]);
});

test('siglas de órgãos só abrem com verbo: "inss" sozinho vai para a IA, "abrir o inss" abre', async () => {
  let t = montar();
  await t.P.perguntar('inss').catch(() => null);
  assert.deepEqual(t.abertos, []);
  t = montar();
  await t.P.perguntar('abrir o inss');
  assert.deepEqual(t.abertos, [url('site-inss')]);
});

test('endereço digitado abre direto: globo.com, www.uol.com.br, abrir https://exemplo.org/pagina', async () => {
  for (const [frase, esperado] of [
    ['globo.com', 'https://globo.com'],
    ['www.UOL.com.br', 'https://www.uol.com.br'],
    ['abrir exemplo.org/pagina?x=1', 'https://exemplo.org/pagina?x=1'],
    ['pode abrir https://www.gov.br/mds/pt-br.', 'https://www.gov.br/mds/pt-br'],
    ['http://exemplo.com.br', 'https://exemplo.com.br'],
    ['acesse o site cfp.org.br', 'https://cfp.org.br']
  ]) {
    const { P, abertos } = montar();
    const r = await P.perguntar(frase);
    assert.equal(r.tipo, 'acao', frase);
    assert.deepEqual(abertos, [esperado], frase);
  }
});

test('endereço: o que não é só um endereço de site NÃO abre', async () => {
  for (const frase of ['relatorio.pdf', 'index.html', 'foto.jpg', 'meu arquivo.docx', 'qual o site globo.com para noticias?', 'globo.com e uol.com.br', 'javascript:alert(1)', 'ftp://exemplo.com', 'https://usuario:senha@exemplo.com', 'art.5 da constituição', 'v1.2', 'ex.: casa']) {
    const { P, abertos } = montar();
    await P.perguntar(frase).catch(() => null);
    assert.deepEqual(abertos, [], frase);
  }
});

test('pesquisar no site: "pesquisar ... no youtube/google/mercado livre"', async () => {
  for (const [frase, esperado] of [
    ['pesquisar musica relaxante no youtube', url('site-youtube').replace(/$/, '') + 'results?search_query=musica%20relaxante'],
    ['Buscar oficina de grupo com idosos no Google', 'https://www.google.com/search?q=oficina%20de%20grupo%20com%20idosos'],
    ['pesquise tênis de corrida no mercado livre', 'https://lista.mercadolivre.com.br/t%C3%AAnis%20de%20corrida'],
    ['procure caso no cras no google', 'https://www.google.com/search?q=caso%20no%20cras']
  ]) {
    const { P, abertos } = montar();
    const r = await P.perguntar(frase);
    assert.equal(r.tipo, 'acao', frase);
    assert.deepEqual(abertos, [esperado], frase);
  }
});

test('pesquisar no site: sem assunto ou com site que não pesquisa NÃO abre', async () => {
  for (const frase of ['buscar no youtube', 'pesquisar algo no cras', 'pesquisar tema no inss']) {
    const { P, abertos } = montar();
    await P.perguntar(frase).catch(() => null);
    assert.deepEqual(abertos, [], frase);
  }
});
