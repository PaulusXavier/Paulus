// A base de normas gerada (knowledge/conhecimento.json e catalogo.json) precisa estar em dia com knowledge/documentos/*.md.
// Se este teste falhar logo depois de editar um .md, rode:  npm run build:conhecimento
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { montarBase, montarCatalogo } from '../scripts/build-knowledge.mjs';
import { criarIndice, buscar } from '../shared/busca.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const lerJson = nome => JSON.parse(readFileSync(join(RAIZ, 'knowledge', nome), 'utf8'));

test('conhecimento.json está em dia com knowledge/documentos (rode npm run build:conhecimento)', () => {
  assert.deepEqual(lerJson('conhecimento.json'), montarBase());
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
