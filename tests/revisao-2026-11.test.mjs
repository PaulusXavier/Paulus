// Revisão de novembro/2026: regressões dos erros achados na revisão do repositório.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectarCrise } from '../shared/crise.mjs';
import { temDadoPessoal } from '../shared/pii.mjs';
import { lerDocumentoCompleto } from '../scripts/build-knowledge.mjs';
import { lerHabilidade } from '../shared/habilidades.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

test('pastas: knowledge/documentos só tem documentos (doc:) e habilidades/ só tem roteiros (id:)', () => {
  // Dezenove roteiros ficaram em knowledge/documentos e o build inteiro quebrava ("falta doc no começo do arquivo").
  for (const f of readdirSync(join(RAIZ, 'knowledge', 'documentos')).filter(n => n.endsWith('.md') && !n.startsWith('_'))) {
    assert.doesNotThrow(() => lerDocumentoCompleto(readFileSync(join(RAIZ, 'knowledge', 'documentos', f), 'utf8'), f), f);
  }
  for (const f of readdirSync(join(RAIZ, 'habilidades')).filter(n => n.endsWith('.md') && n !== 'LEIA-ME.md')) {
    const h = lerHabilidade(readFileSync(join(RAIZ, 'habilidades', f), 'utf8'), f);
    assert.equal(f, h.id + '.md', f);
  }
});

test('docs: todo link relativo dos .md de docs/ e do README aponta para um arquivo que existe', () => {
  const lista = [join(RAIZ, 'README.md')].concat(readdirSync(join(RAIZ, 'docs')).filter(n => n.endsWith('.md')).map(n => join(RAIZ, 'docs', n)));
  const faltando = [];
  for (const f of lista) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)) {
      if (/^(https?:|mailto:)/.test(m[1])) continue;
      try { readFileSync(join(dirname(f), m[1])); } catch (e) { faltando.push(f.replace(RAIZ, '') + ' -> ' + m[1]); }
    }
  }
  assert.deepEqual(faltando, []);
});

test('crise: "me cortei com/fazendo..." continua fora do cartão (a exceção valia só em uma das duas listas)', () => {
  for (const t of ['me cortei com a faca de cozinha', 'me cortei fazendo comida', 'me cortei na cozinha']) assert.equal(detectarCrise(t), null, t);
  const r = detectarCrise('me cortei');
  assert.ok(r && r.subtipo === 'suicidio' && r.pessoal === true);
});

test('crise: "matar o prazo/relatório" é expressão de trabalho, não ameaça nem intenção de agredir', () => {
  for (const t of ['vou matar o prazo hoje', 'quero matar o relatório até sexta', 'ele vai matar a pauta da reunião']) assert.equal(detectarCrise(t), null, t);
  // as ameaças e intenções de verdade continuam no cartão
  assert.equal(detectarCrise('ele disse que vai matar a mulher').subtipo, 'violencia');
  assert.equal(detectarCrise('estou com vontade de matar meu filho').subtipo, 'agressao');
});

test('pii: "moro na rua X, 123" (primeira pessoa) também é endereço residencial', () => {
  assert.equal(temDadoPessoal('moro na rua das flores 123'), true);
  assert.equal(temDadoPessoal('ela mora na rua das flores 123'), true);
  assert.equal(temDadoPessoal('qual a rua do CRAS?'), false);
});
