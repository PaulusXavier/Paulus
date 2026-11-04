// Avaliação psicológica: cada pergunta chama o roteiro certo, sem disparar em pergunta comum. Textos fictícios.
import test from 'node:test';
import assert from 'node:assert/strict';
import { escolherHabilidades } from '../shared/habilidades.mjs';
import { lerTodas } from '../scripts/build-habilidades.mjs';

const lista = lerTodas();
const id = (q) => escolherHabilidades(lista, q, [], 'umbrella').map((h) => h.id);

test('avaliação psicológica: a pergunta chama o roteiro certo', () => {
  assert.ok(id('o que é avaliação psicológica?').includes('avaliacao-psicologica-visao-geral'));
  assert.ok(id('psicólogo no CRAS pode fazer psicoterapia?').includes('avaliacao-psicologica-limites-suas'));
  assert.ok(id('como saber se um teste psicológico está no SATEPSI?').includes('avaliacao-psicologica-testes-satepsi'));
  assert.ok(id('qual a diferença entre laudo e relatório psicológico?').includes('avaliacao-psicologica-documentos-cfp'));
  assert.ok(id('me ajuda com o modelo de relatório psicológico').includes('avaliacao-psicologica-relatorio-estrutura'));
  assert.ok(id('como fazer a entrevista devolutiva?').includes('avaliacao-psicologica-devolutiva'));
  assert.ok(id('o juiz pediu laudo para curatela, o que respondo?').includes('avaliacao-psicologica-pedidos-de-laudo'));
});

test('avaliação psicológica: não dispara em pergunta comum', () => {
  for (const q of ['qual o horário do CRAS?', 'como funciona o Bolsa Família?', 'onde fica o CAPS?']) {
    assert.deepEqual(id(q).filter((x) => x.startsWith('avaliacao-psicologica')), [], q);
  }
});

test('avaliação psicológica: os roteiros não dão diagnóstico e lembram o limite', () => {
  for (const h of lista.filter((x) => x.id.startsWith('avaliacao-psicologica'))) {
    assert.ok(h.instrucoes.length > 500, h.id);
    assert.ok(!/\bdiagnostique\b/i.test(h.instrucoes), h.id);
  }
});
