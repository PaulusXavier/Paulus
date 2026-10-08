import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lerDocumento, montarBase } from '../scripts/build-knowledge.mjs';
import { criarIndice, buscar } from '../shared/busca.mjs';

test('conhecimento.json está em dia com knowledge/documentos (rode npm run build:conhecimento)', () => {
  const salvo = JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8'));
  assert.deepEqual(montarBase(), salvo);
});

test('lerDocumento: referência, texto em uma linha, ids em sequência e comentários ignorados', () => {
  const md = '---\ndoc: teste-1\ntitulo: Teste\nnorma: Lei de Teste\nano: 2020\n---\n<!-- nota -->\n## art. 1º\nPrimeira linha\ncontinua aqui.\n\n## art. 2º\nOutro texto.\n';
  const t = lerDocumento(md, 'x.md');
  assert.equal(t.length, 2);
  assert.equal(t[0].id, 'teste-1#1');
  assert.equal(t[0].texto, 'Primeira linha continua aqui.');
  assert.equal(t[1].referencia, 'art. 2º');
  assert.equal(t[1].ano, 2020);
});

test('lerDocumento: avisa o que está errado', () => {
  assert.throws(() => lerDocumento('sem cabeçalho', 'x.md'), /bloco "---"/);
  assert.throws(() => lerDocumento('---\ndoc: a\ntitulo: B\nnorma: C\n---\n## art. 1\ntexto', 'x.md'), /ano/);
  assert.throws(() => lerDocumento('---\ndoc: a\ntitulo: B\nnorma: C\nano: 2020\n---\n## art. 1\n', 'x.md'), /sem texto/);
});

test('busca: acha a norma certa e não inventa para assunto sem relação', () => {
  const base = JSON.parse(readFileSync(new URL('../knowledge/conhecimento.json', import.meta.url), 'utf8'));
  const indice = criarIndice(base);
  assert.ok(buscar(indice, 'Quem gere o Cadastro Único no município?', { k: 3 }).some(a => a.trecho.referencia === 'art. 17, XV'));
  assert.equal(buscar(indice, 'receita de bolo de cenoura').length, 0);
});
