// Prova de matemática (ITA 1ª fase, 12 questões) resolvida NO APARELHO, sem IA: cada resposta confere com a conta feita à parte
// (as respostas esperadas foram achadas por conta independente em Python/numpy e à mão, não copiadas do programa).
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolverProvaLocal, textoDaProvaLocal, pvlAlternativas, pvlValor, pvlDividir } from '../shared/prova-local.mjs';
import { respostaDeMatematicaLocal } from '../shared/matematica-local.mjs';
import { pedidoDeMatematica } from '../shared/pedido.mjs';

const Q = {
  1: 'Questão 1. Seja z = a + 2i um número complexo, em que a ∈ R é positivo. O valor de a para que as representações de 1, z e z² no plano de Argand-Gauss formem um triângulo de área 200 é A ( ) 14. B ( ) 15. C ( ) 16. D ( ) 17. E ( ) 18.',
  2: 'Questão 2. Considere as afirmações: I. Existe um poliedro formado por 3 faces triangulares e as demais faces quadrangulares. II. Existe um poliedro não convexo com 5 vértices, 9 arestas e 6 faces. III. Existe um poliedro convexo com 7 vértices, 16 arestas e 11 faces. Está(ão) correta(s): A ( ) I e II. C ( ) II e III. E ( ) apenas II. B ( ) I e III. D ( ) apenas III.',
  3: 'Questão 3. O termo independente da expansão de (x + 1/x)^6 (x − 2/x)^5 é A ( ) −18. B ( ) −12. C ( ) 0. D ( ) 12. E ( ) 18.',
  4: 'Questão 4. Sejam f(x) e g(x) funções reais definidas para todo x ∈ R. Se para todo x > 0 vale a igualdade g(x²) = f(2x² − x + 1), podemos afirmar que A ( ) f não é sobrejetora. D ( ) g não é injetora. B ( ) f não é injetora. E ( ) f(a) ≠ g(a) para todo a > 0. C ( ) g não é sobrejetora.',
  5: 'Questão 5. Sejam (an) e (bn) duas sequências numéricas tais que Sn = a1 + ... + an = b_{n+1} − b1 para todo n ∈ N. I. Se (bn) é uma PG, então (an) também é PG. II. Se (an) é uma PG, então (bn) também é PG. III. Se (an) é uma PA, então (Sn) também é PA. Está(ão) correta(s): A ( ) I e II. B ( ) II e III. C ( ) I e III. D ( ) apenas I. E ( ) nenhuma.',
  6: 'Questão 6. O conjunto de todos os valores a ∈ R para os quais a equação 9^x − (3a + 4)·3^x + 2a² + 9a − 5 = 0 tem duas soluções reais distintas é A ( ) (6; ∞). B ( ) (1/2; ∞) \\ {6}. C ( ) (3/2; ∞) \\ {6}. D ( ) R \\ {6}. E ( ) R.',
  7: 'Questão 7. Sejam m, n e k números reais. Considere os sistemas abaixo: I: x + y + z = 1, x + 2y − z = 2, 2x + y + 4z = 1; II: x + y + z = 1, x + my + nz = 5, kx + y − z = 3m + 2n. Sabendo-se que os dois sistemas são equivalentes, o valor de k é A ( ) 1/3. B ( ) 1/2. C ( ) 1. D ( ) 2. E ( ) 3.',
  8: 'Questão 8. Considere a função f(x) = √[(2sen(2x) + 2sen(x) − 2cos(x) − 1)/(8(cos(2x) + 1))]. Seja I = (a; b) o intervalo de maior comprimento contido em [−π; 2π] tal que f(x) está definida para todo x ∈ I. O valor de a + b é A ( ) 0. B ( ) π/3. C ( ) 2π/3. D ( ) 5π/6. E ( ) 13π/6.',
  9: 'Questão 9. Duas circunferências C1 e C2 de centros O1 e O2, respectivamente, têm raio igual a 5 cm e se interceptam nos pontos P e Q, determinando uma corda comum PQ de tamanho 6 cm. As interseções de cada circunferência com o segmento O1O2 determinam os pontos R em C1 e S em C2. O volume do sólido de revolução obtido pela rotação do triângulo PO1R em torno da reta O1O2 é, em cm³, igual a A ( ) π. B ( ) 3π. C ( ) 4π. D ( ) 6π. E ( ) 9π.',
  10: 'Questão 10. Uma raiz comum aos polinômios p(x) = x^5 − x^3 + 12x − 18 e q(x) = x^4 − x^3 + 5x − 3 é A ( ) −1 + √2i. B ( ) √2 + √2i. C ( ) √2 + i. D ( ) 1 + √2i. E ( ) −√2 + i.',
  11: 'Questão 11. Seja H uma hipérbole no plano cartesiano cujos focos são comuns aos focos da elipse E: x²/4 + y² = 1. Seja P um ponto de intersecção de E e H no primeiro quadrante e O a origem. Sabendo que OP forma um ângulo θ com o eixo horizontal Ox, com tan(θ) = √3/6, a excentricidade de H é A ( ) 2√3/3. B ( ) √6/2. C ( ) 3√3/4. D ( ) 2√6/3. E ( ) 3√3/2.',
  12: 'Questão 12. Um número m ∈ N, ao ser multiplicado por 16, resulta em um número com 231 divisores inteiros positivos. Considere as afirmações: I. m é um número par. II. m é um quadrado perfeito. III. 16m tem 3 fatores primos distintos. É(São) VERDADEIRA(S): A ( ) apenas I. C ( ) I e II. E ( ) II e III. B ( ) apenas II. D ( ) I e III.',
};
// gabarito conferido por conta independente (numpy/sympy-free, à mão e por varredura)
const GAB = { 1: 'B', 2: 'E', 3: 'C', 4: 'D', 5: 'D', 6: 'B', 7: 'A', 8: 'E', 9: 'E', 10: 'D', 11: 'A', 12: 'C' };

test('prova local: cada uma das 12 questões é resolvida sozinha e cai na alternativa certa', () => {
  for (const n of Object.keys(Q)) {
    const r = resolverProvaLocal(Q[n]);
    assert.ok(r, 'questão ' + n + ' não reconhecida');
    assert.equal(r.resolvidas.length, 1, 'questão ' + n);
    assert.equal(r.resolvidas[0].letra, GAB[n], 'questão ' + n + ': ' + r.resolvidas[0].resposta);
    assert.equal(r.resolvidas[0].confere, true, 'conferência da questão ' + n);
  }
});

test('prova local: a prova inteira de uma vez, na ordem, com o texto para o app', () => {
  const r = resolverProvaLocal(Object.values(Q).join('\n'));
  assert.equal(r.total, 12); assert.equal(r.resolvidas.length, 12); assert.deepEqual(r.naoReconhecidas, []);
  assert.deepEqual(r.resolvidas.map(function (q) { return q.letra; }).join(''), 'BECDDBAEEDAC');
  const t = textoDaProvaLocal(r);
  assert.match(t, /Questão 9 /); assert.match(t, /alternativa E/); assert.match(t, /15π/);
  assert.doesNotMatch(t, /a conferência automática desta questão não fechou/);
});

test('prova local: valores dos passos conferem por conta à parte', () => {
  const um = resolverProvaLocal(Q[1]).resolvidas[0];
  assert.match(um.resposta, /a = 15/);
  assert.match(resolverProvaLocal(Q[3]).resolvidas[0].resposta, /= 0$/);
  assert.match(resolverProvaLocal(Q[7]).resolvidas[0].resposta, /k = 1\/3/);
  assert.match(resolverProvaLocal(Q[10]).resolvidas[0].passos[0], /x² − 2x \+ 3/);
  assert.match(resolverProvaLocal(Q[11]).resolvidas[0].resposta, /1\.1547/);
  assert.match(resolverProvaLocal(Q[8]).resolvidas[0].resposta, /13π\/6/);
  // outros dados na mesma estrutura: triângulo de área 50 com z = a + 1i -> a = 1 + √(2·50/1 − 1) = 1 + √99
  const outra = resolverProvaLocal('Seja z = a + 1i, a > 0. As representações de 1, z e z² formam um triângulo de área 50. O valor de a é A ( ) 10. B ( ) 11.').resolvidas[0];
  assert.match(outra.resposta, /a = 10\.9498/);
  // 231 = 3·7·11 vale para outro número de divisores: 16m com 45 divisores (3·3·5): m par? 2^e2, e2+1 ∈ {5,9,15,45} -> e2 ≥ 4
  assert.ok(resolverProvaLocal('Um número m, ao ser multiplicado por 16, resulta em um número com 45 divisores inteiros positivos. I. m é um número par. II. m é um quadrado perfeito. III. 16m tem 3 fatores primos distintos. A ( ) apenas I. B ( ) apenas II.'));
});

test('prova local: a questão 9 avisa quando a leitura literal não está nas alternativas', () => {
  const q = resolverProvaLocal(Q[9]).resolvidas[0];
  assert.match(q.aviso, /15π/); assert.match(q.aviso, /9π/); assert.equal(q.letra, 'E');
  // se a alternativa literal existir, não há aviso
  const lit = resolverProvaLocal(Q[9].replace('E ( ) 9π.', 'E ( ) 15π.')).resolvidas[0];
  assert.equal(lit.letra, 'E'); assert.equal(lit.aviso, '');
});

test('prova local: PDF em colunas (alternativas fora de ordem) e símbolos trocados pelo PDF (ı = π)', () => {
  const alts = pvlAlternativas('A ( ) apenas I. C ( ) I e II. E ( ) II e III. B ( ) apenas II. D ( ) I e III. 4');
  assert.equal(alts.A, 'apenas I.'); assert.equal(alts.C, 'I e II.'); assert.equal(alts.D, 'I e III.'); assert.equal(alts.E, 'II e III.');
  assert.equal(pvlAlternativas('A ( ) ı. B ( ) 3ı. C ( ) 4ı. D ( ) 6ı. E ( ) 9ı.').E, '9ı.');
  assert.ok(Math.abs(pvlValor('9ı.') - 9 * Math.PI) < 1e-9);
  const q9 = Q[9].replace(/π/g, 'ı');
  assert.equal(resolverProvaLocal(q9).resolvidas[0].letra, 'E');
});

test('prova local: leitor de alternativas numéricas', () => {
  for (const [s, v] of [['14.', 14], ['1/3', 1 / 3], ['2√3/3', 2 * Math.sqrt(3) / 3], ['13π/6', 13 * Math.PI / 6], ['−√3', -Math.sqrt(3)], ['(√3+1)/2', (Math.sqrt(3) + 1) / 2], ['3π.', 3 * Math.PI], ['0', 0]]) assert.ok(Math.abs(pvlValor(s) - v) < 1e-9, s);
  for (const s of ['abc', 'R\\{6}', '', '(1', 'f não é injetora.']) assert.equal(pvlValor(s), null, s);
  assert.equal(pvlDividir('sem número').length, 1);
  assert.deepEqual(pvlDividir('Questão 1. a Questão 2. b').map(function (x) { return x.n; }), [1, 2]);
});

test('prova local: o que não é desta prova não é inventado, e entra no fluxo de matemática sem IA', () => {
  assert.equal(resolverProvaLocal('qual o prazo do recurso do Bolsa Família?'), null);
  assert.equal(resolverProvaLocal('Questão 1. Quanto é 2 + 2? A ( ) 3. B ( ) 4.'), null);
  const r = respostaDeMatematicaLocal(Q[3]);
  assert.ok(r && r.resolvida); assert.match(r.texto, /Questão 3/); assert.match(r.texto, /alternativa C/);
  assert.equal(r.parcial, false);
  // prova com uma questão que o programa não reconhece: o resto sai e a que faltou é avisada
  const misto = respostaDeMatematicaLocal(Q[1] + ' Questão 2. Calcule o limite da sequência definida por recorrência. A ( ) 1. B ( ) 2.');
  assert.ok(misto.resolvida); assert.equal(misto.parcial, true); assert.match(misto.texto, /Sem IA não resolvi a\(s\) questão\(ões\) 2/);
  for (const n of Object.keys(Q)) assert.equal(pedidoDeMatematica(Q[n]), true, 'pedidoDeMatematica ' + n);
});
