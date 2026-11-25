import test from 'node:test';
import assert from 'node:assert/strict';
import { resolverMatematicaLocal as R, respostaDeMatematicaLocal as RT } from '../shared/matematica-local.mjs';

test('polinômio: raízes conferidas por substituição', () => {
  assert.match(R('resolva x^3 - 6x^2 + 11x - 6 = 0').resposta, /x ∈ \{1; 2; 3\}/);
  assert.match(R('resolva x^2 - 3x + 1 = 0').resposta, /\(3 \+ √5\)\/2/);
  assert.match(R('resolva x^2 + 2x + 5 = 0').resposta, /−1 \+ 2i/);
  assert.match(R('resolva (x-1)(x-2)(x+3) = 0').resposta, /\{−3; 1; 2\}/);
});
test('sistema: SPD, SPI e SI; equação não linear não vira sistema', () => {
  assert.match(R('x + y = 10; x - y = 2').resposta, /x = 6, y = 4/);
  assert.match(R('x + y + z = 6, 2x - y + z = 3, x + 2y - z = 2').resposta, /x = 1, y = 2, z = 3/);
  assert.match(R('x + y = 2; 2x + 2y = 5').resposta, /impossível/);
  assert.match(R('x + y = 2 e 2x + 2y = 4').resposta, /indeterminado/);
  assert.doesNotMatch(String((R('reta 3x+4y=-15 e parábola y = x^2 + x + 6') || {}).titulo), /Sistema/);
});
test('matriz, complexos, cálculo, trigonometria', () => {
  assert.match(R('determinante de [[1,2],[3,4]]').resposta, /−2/);
  assert.match(R('inversa de [2 1; 1 1]').resposta, /−1/);
  assert.match(R('(2+3i)*(1-i)').resposta, /5 \+ i/);
  assert.match(R('z = (1+i)^8, calcule z').resposta, /z = 16/);
  assert.match(R('derivada de x^3 - 4x + 1').resposta, /3x² − 4/);
  assert.match(R('integral de 0 a 2 de x^2').resposta, /8\/3/);
  assert.match(R('sen 75°').resposta, /\(√6 \+ √2\)\/4/);
  assert.match(R('cos 5π/6').resposta, /−√3\/2/);
});
test('não inventa: f(x)=x² com g(x) e enunciado sem símbolos viram roteiro ou nada', () => {
  assert.equal(R('Seja f(x)=x^2 e g(x)=x+1. Calcule f(g(2))'), null);
  const q = RT('Seja p(x) = x^3 + bx^2 + cx + d. Se todas as raízes são reais, o menor valor de p(0) é?');
  assert.equal(q.resolvida, false);
  assert.match(q.texto, /ARSENAL/);
  assert.equal(RT('o que é o CRAS?'), null);
});
