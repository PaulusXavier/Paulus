// knowledge/conhecimento.json e indice.json são GERADOS (ficam fora do Git; `npm test` os recria antes de rodar).
// catalogo.json é versionado e precisa estar em dia com knowledge/documentos/*.md: se o teste dele falhar
// logo depois de editar um .md, rode:  npm run build:conhecimento
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { montarBase, montarCatalogo } from '../scripts/build-knowledge.mjs';
import { criarIndice, serializarIndice, buscar } from '../shared/busca.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const lerJson = nome => JSON.parse(readFileSync(join(RAIZ, 'knowledge', nome), 'utf8'));

test('conhecimento.json gerado corresponde a knowledge/documentos (rode npm run build:conhecimento)', () => {
  assert.deepEqual(lerJson('conhecimento.json'), montarBase());
});

test('indice.json pré-calculado dá as mesmas respostas que o índice montado na hora', () => {
  const base = montarBase();
  const pre = lerJson('indice.json');
  const novo = criarIndice(base);
  assert.deepEqual(pre, JSON.parse(JSON.stringify(serializarIndice(novo))));
  const pronto = criarIndice(base, pre);
  assert.equal(pronto.N, novo.N);
  for (const q of ['quem gere o Cadastro Único no município?', 'atuação da psicologia no CRAS', 'valor do bolsa família']) {
    const ids = i => buscar(i, q, { k: 4 }).map(r => r.trecho.id + ':' + r.score.toFixed(6));
    assert.deepEqual(ids(pronto), ids(novo));
  }
});

test('índice pré-calculado de outra base é ignorado (recalcula em vez de responder errado)', () => {
  const base = montarBase();
  const pre = lerJson('indice.json');
  assert.equal(criarIndice(base.slice(1), pre).N, base.length - 1);
});

test('catalogo.json está em dia com knowledge/documentos (rode npm run build:conhecimento)', () => {
  assert.deepEqual(lerJson('catalogo.json'), montarCatalogo());
});

test('base: ids únicos, campos obrigatórios e nenhum texto vazio ou com marcação de prompt', () => {
  const base = lerJson('conhecimento.json');
  assert.ok(base.length > 0);
  assert.equal(new Set(base.map(t => t.id)).size, base.length);
  for (const t of base) {
    for (const c of ['id', 'doc', 'titulo', 'norma', 'referencia', 'texto']) assert.ok(t[c], t.id + ': falta ' + c);
    assert.ok(Number.isInteger(t.ano), t.id + ': ano');
    assert.ok(!/<\/?[A-Za-z][^<>]{0,40}>/.test(t.texto), t.id + ': tem marcação <...> no texto');
  }
});

test('base: perguntas-chave acham a norma certa', () => {
  const ind = criarIndice(lerJson('conhecimento.json'));
  assert.ok(buscar(ind, 'quem gere o Cadastro Único no município?').some(a => a.trecho.doc === 'nob-suas-2012'));
  assert.ok(buscar(ind, 'o que é o PAEFI?').some(a => a.trecho.doc === 'loas-1993'));
  assert.equal(buscar(ind, 'receita de bolo de cenoura').length, 0);
});

test('base compacta do Worker: mesmas fontes e mesmos resultados da busca que a base completa', async () => {
  const { compactarBase, expandirBase } = await import('../shared/base-compacta.mjs');
  const { MAX_TEXTO_TRECHO } = await import('../shared/busca.mjs');
  const base = lerJson('conhecimento.json');
  const exp = expandirBase(JSON.parse(JSON.stringify(compactarBase(base))));
  assert.equal(exp.length, base.length);
  exp.forEach((c, i) => {
    const o = base[i];
    assert.deepEqual({ ...c, texto: '' }, { ...o, texto: '' }); // id, doc, titulo, norma, ano, referencia, tipo, pacote
    assert.equal(c.texto, o.texto.slice(0, MAX_TEXTO_TRECHO));
  });
  // índice pronto (gerado da base completa) vale também para a base cortada
  const pre = lerJson('indice.json');
  const cheio = criarIndice(base);
  const cortado = criarIndice(exp, pre);
  for (const q of ['quais as atribuições do psicólogo no CRAS', 'sigilo profissional registro documental', 'bolsa família condicionalidades', 'medidas socioeducativas']) {
    const a = buscar(cheio, q, { k: 4 }).map(r => r.trecho.id);
    const b = buscar(cortado, q, { k: 4 }).map(r => r.trecho.id);
    assert.deepEqual(b, a, q);
  }
});
