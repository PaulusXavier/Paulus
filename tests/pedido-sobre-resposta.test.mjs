// Leitura do pedido (shared/pedido.mjs): saudação, ajuste, "continue", "por quê?", contestação, seguimento, consulta e matemática.
// Observação: este arquivo tinha sido sobrescrito por uma cópia de shared/pedido.mjs (o Worker deixou de achar pedidoDeMatematica);
// os testes abaixo foram reescritos a partir do comportamento do módulo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ehSaudacao, ehRefinamento, pedidoSobreResposta, ehSeguimento, classificarPedido, partesDaPergunta, consultaDoPedido, pedidoDeDesenho, pedidoDeMatematica, perfilDaIA, trechosParaOPedido } from '../shared/pedido.mjs';

const hist = [{ papel: 'usuario', texto: 'como funciona o BPC?' }, { papel: 'paulus', texto: 'O BPC é um benefício...' }];

test('pedido: saudação só quando TODA a mensagem é cumprimento', () => {
  assert.equal(ehSaudacao('oi, bom dia'), true);
  assert.equal(ehSaudacao('obrigado!'), true);
  assert.equal(ehSaudacao('oi, o que é CRAS?'), false);
  assert.equal(ehSaudacao(''), false);
});

test('pedido: ajuste, continuar, por quê e contestação só valem com resposta anterior', () => {
  assert.equal(ehRefinamento('mais curto', hist), true);
  assert.equal(ehRefinamento('mais curto', []), false);
  assert.equal(pedidoSobreResposta('continue', hist), 'continuar');
  assert.equal(pedidoSobreResposta('por quê?', hist), 'porque');
  assert.equal(pedidoSobreResposta('tem certeza?', hist), 'contestacao');
  assert.equal(pedidoSobreResposta('continue', []), '');
  assert.equal(pedidoSobreResposta('explique o PAIF', hist), '');
});

test('pedido: classificação, seguimento e consulta de pergunta anterior', () => {
  assert.equal(classificarPedido('oi', []), 'saudacao');
  assert.equal(classificarPedido('deixe mais formal', hist), 'refinamento');
  assert.equal(classificarPedido('qual o telefone do CRAS?', [], { temFichas: true }), 'consulta');
  assert.equal(classificarPedido('como funciona o PAIF?', []), 'normal');
  assert.equal(ehSeguimento('e para adolescente?'), true);
  assert.equal(ehSeguimento('como funciona o BPC?'), false);
  assert.match(consultaDoPedido('e para idoso?', hist, 'seguimento'), /BPC/);
  assert.equal(consultaDoPedido('qualquer coisa', hist, 'normal'), 'qualquer coisa');
});

test('pedido: pergunta com várias partes e trechos de norma por modo', () => {
  assert.equal(partesDaPergunta('Posso incluir no BPC? E se a renda mudar? Quando devo renovar?').length, 3);
  assert.deepEqual(partesDaPergunta('O que é o CRAS?'), []);
  assert.equal(trechosParaOPedido('saudacao', 'oi', 4), 0);
  assert.equal(trechosParaOPedido('refinamento', 'mais curto', 4), 3);
});

test('pedido: desenho e matemática', () => {
  assert.equal(pedidoDeDesenho('desenhe um fluxograma do PAIF'), true);
  assert.equal(pedidoDeDesenho('desenho institucional do CRAS'), false);
  assert.equal(pedidoDeMatematica('Seja p(x) = x^3 + bx^2 + cx + d um polinômio com coeficientes reais'), true);
  assert.equal(pedidoDeMatematica('o que é o CRAS?'), false);
});

test('pedido: espaço e temperatura da IA por situação', () => {
  assert.deepEqual(perfilDaIA({ modo: 'saudacao' }), { max_tokens: 160, temperature: 0.5 });
  assert.deepEqual(perfilDaIA({ modo: 'normal', comMatematica: true }), { max_tokens: 4096, temperature: 0.1 });
  assert.equal(perfilDaIA({ modo: 'normal', tema: true, comMatematica: true }).max_tokens, 900);
  assert.equal(perfilDaIA({ modo: 'normal', comDesenho: true }).max_tokens, 3200);
  assert.equal(perfilDaIA({ modo: 'normal' }).max_tokens, 900);
});
