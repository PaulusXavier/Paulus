import test from 'node:test';
import assert from 'node:assert/strict';
import { temDadoPessoal } from '../shared/pii.mjs';
import { detectarCrise } from '../shared/crise.mjs';

test('pii: barra documento, e-mail, nome completo, tratamento e endereço', () => {
  for (const t of ['CPF 123.456.789-09', 'escreveu para ana@exemplo.com', 'o nome dela é Maria Souza', 'a dona Maria Souza veio', 'ela mora na Rua das Flores, 123']) {
    assert.equal(temDadoPessoal(t), true, t);
  }
});

test('pii: deixa passar pergunta técnica', () => {
  for (const t of ['Quem gere o Cadastro Único no município?', 'como encaminho uma gestante em situação de rua?', 'qual o prazo do PAIF?']) {
    assert.equal(temDadoPessoal(t), false, t);
  }
});

test('crise: acha os três tipos e devolve telefones', () => {
  assert.equal(detectarCrise('ela falou em suicídio').subtipo, 'suicidio');
  assert.equal(detectarCrise('ele está sendo agredido agora').subtipo, 'violencia');
  assert.equal(detectarCrise('houve uma overdose').subtipo, 'clinica');
  assert.ok(detectarCrise('ela falou em suicídio').telefones.some(t => t.numero === '188'));
  assert.equal(detectarCrise('como funciona o PAIF?'), null);
});
