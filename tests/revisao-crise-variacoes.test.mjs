// Revisão 2026-11: formas de risco que o detector não pegava (plural, ordem, tempo verbal) e agressão em curso no gerúndio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectarCrise } from '../shared/crise.mjs';
test('crise: variações de forma disparam o cartão', () => {
  for (const t of ['todo mundo estaria melhor sem mim', 'todos estariam melhor sem mim', 'queria não acordar nunca mais', 'não vejo motivos para continuar vivendo',
    'não tenho mais razões para viver', 'a vida não vale a pena', 'não vale mais a pena viver', 'quero me machucar', 'ele está me batendo agora', 'meu marido está me batendo', 'ele está me agredindo'])
    assert.ok(detectarCrise(t), t);
});
test('crise: expressões comuns do trabalho e da vida não disparam', () => {
  for (const t of ['o sapato está me machucando', 'a ansiedade está me sufocando', 'esse recurso não vale a pena', 'não vale a pena recorrer do prazo', 'a vida útil do equipamento acabou',
    'não tenho motivos para recusar o benefício', 'não tenho mais razões para contestar a decisão', 'a criança nunca mais vai acordar cedo para a escola', 'estão me batendo na porta do CRAS', 'quero sumir do cadastro'])
    assert.equal(detectarCrise(t), null, t);
});
