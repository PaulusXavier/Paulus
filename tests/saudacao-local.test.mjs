// Cumprimento, agradecimento, confirmação e despedida sem IA (shared/saudacao-local.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { respostaDeSaudacao } from '../shared/saudacao-local.mjs';
import { ehSaudacao } from '../shared/pedido.mjs';

test('cumprimento devolve a abertura da mesma hora do dia e diz em que pode ajudar', () => {
  assert.match(respostaDeSaudacao('oi', 'pt').texto, /^Oi! .*SUAS/);
  assert.match(respostaDeSaudacao('Bom dia', 'pt').texto, /^Bom dia! /);
  assert.match(respostaDeSaudacao('boa tarde', 'pt').texto, /^Boa tarde! /);
  assert.match(respostaDeSaudacao('boa noite!', 'pt').texto, /^Boa noite! /);
});

test('agradecimento, confirmação e despedida têm resposta própria', () => {
  assert.equal(respostaDeSaudacao('obrigado', 'pt').tipo, 'agradecimento');
  assert.match(respostaDeSaudacao('muito obrigada', 'pt').texto, /^De nada/);
  assert.equal(respostaDeSaudacao('ok', 'pt').tipo, 'confirmacao');
  assert.equal(respostaDeSaudacao('entendi', 'pt').tipo, 'confirmacao');
  assert.equal(respostaDeSaudacao('tchau', 'pt').tipo, 'despedida');
  assert.equal(respostaDeSaudacao('obrigado, tchau', 'pt').tipo, 'despedida');
  assert.equal(respostaDeSaudacao('bom dia, obrigado', 'pt').tipo, 'cumprimento');
});

test('responde em espanhol e em inglês quando o idioma é esse', () => {
  assert.match(respostaDeSaudacao('hola', 'es').texto, /^¡Hola! .*SUAS/);
  assert.match(respostaDeSaudacao('buenos dias', 'es').texto, /^¡Buenos días!/);
  assert.match(respostaDeSaudacao('gracias', 'es').texto, /^¡De nada!/);
  assert.match(respostaDeSaudacao('hello', 'en').texto, /^Hello! /);
  assert.match(respostaDeSaudacao('thanks', 'en').texto, /^You're welcome/);
});

test('não inventa nada: não cita norma, telefone nem unidade', () => {
  for (const q of ['oi', 'obrigado', 'ok', 'tchau']) {
    const t = respostaDeSaudacao(q, 'pt').texto;
    assert.doesNotMatch(t, /\d{4}|art\.|lei |CRAS \w+/i);
  }
});

test('o que não é só cumprimento continua fora (vai para a busca/IA)', () => {
  assert.equal(ehSaudacao('oi, o que é CRAS?'), false);
});
