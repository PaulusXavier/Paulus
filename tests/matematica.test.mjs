import test from 'node:test';
import assert from 'node:assert/strict';
import { pedidoDeMatematica, perfilDaIA } from '../shared/pedido.mjs';
import { calcularExpressao } from '../shared/calculo.mjs';
import { contasDoPedido, contagemPorOrdem, linhaDeItem } from '../shared/calculo-mais.mjs';
import { montarMensagens, BLOCO_MATEMATICA } from '../worker/prompt.mjs';
import { sanearLeitura } from '../worker/visao.mjs';
import { APPS } from '../worker/apps.mjs';

const v = (e) => { const r = calcularExpressao(e, {}); assert.ok(r.ok, e + ' -> ' + JSON.stringify(r)); return r.valor; };

test('matemática: funções novas do avaliador (graus, arco, distância, área, raízes)', () => {
  assert.equal(v('atan(1)'), 45); assert.equal(v('acos(0.5)'), 60); assert.equal(v('asin(1)'), 90);
  assert.equal(v('cbrt(27)'), 3); assert.equal(v('dist(0;0;3;4)'), 5);
  assert.equal(v('areatri(0;0;4;0;0;3)'), 6);
  assert.equal(v('raizmenor(1;-5;6)'), 2); assert.equal(v('raizmaior(1;-5;6)'), 3);
  assert.equal(v('sec(60)'), 2); assert.equal(v('cotg(45)'), 1);
  assert.equal(calcularExpressao('raizmaior(1;1;5)', {}).ok, false);
});

test('matemática: reconhece questão de prova e não confunde pergunta do SUAS', () => {
  for (const t of ['Seja p(x) = x^3 + bx^2 + cx + d um polinômio com coeficientes reais. Se todas as raízes de p(x) são reais', 'Considere a reta r: 3x+4y=-15 e a parábola P: y = x^2 + x + 6 com vértice V', 'Questão 10. Sejam x, y em ]0, pi/2[ satisfazendo o sistema tan(y) tan(y/2) = cos(2x) sec(y)', 'a quantidade de bijeções F: A -> A que satisfazem F(1) < F(5) < F(3)']) assert.equal(pedidoDeMatematica(t), true, t);
  for (const t of ['o que é o CRAS?', 'qual o ângulo de visão do mapa', 'família de 4 pessoas, renda 3200, está no limite?', 'como funciona a equação de custeio do SUAS?', '']) assert.equal(pedidoDeMatematica(t), false, t);
});

test('matemática: espaço de resposta grande, só para questão de prova', () => {
  assert.equal(perfilDaIA({ modo: 'normal', comMatematica: true }).max_tokens, 4096);
  assert.equal(perfilDaIA({ modo: 'normal', comMatematica: true }).temperature, 0.1);
  assert.equal(perfilDaIA({ modo: 'normal' }).max_tokens, 900);
  assert.equal(perfilDaIA({ modo: 'normal', tema: true, comMatematica: true }).max_tokens, 900);
});

const base = { app: APPS.argo, pagina: '', historico: [], fichas: [], achados: [], suicidio: false };
test('matemática: o roteiro entra com questão de prova (texto ou foto) e nunca em tema de suicídio', () => {
  const q = 'Seja p(x) = x^3 + bx^2 + cx + d. Se todas as raízes são reais, o menor valor de p(0) é?';
  assert.ok(montarMensagens({ ...base, pergunta: q })[0].content.includes('MATEMÁTICA (QUESTÕES DE PROVA'));
  assert.ok(montarMensagens({ ...base, pergunta: 'resolva a questão da foto', imagem: 'Questão 9. Considere a reta r: 3x+4y=-15 e a parábola P: y = x^2 + x + 6' })[0].content.includes('MATEMÁTICA (QUESTÕES DE PROVA'));
  assert.ok(!montarMensagens({ ...base, pergunta: 'o que é o CRAS?' })[0].content.includes('MATEMÁTICA (QUESTÕES DE PROVA'));
  assert.ok(!montarMensagens({ ...base, suicidio: true, pergunta: q })[0].content.includes('MATEMÁTICA (QUESTÕES DE PROVA'));
  assert.match(BLOCO_MATEMATICA, /por cima da que manda evitar assuntos fora do SUAS/);
});

test('matemática: contagem de bijeções com restrições de ordem (força bruta) e atalho n!/(k!...)', () => {
  const t = 'Seja A = {1, 2, 3, 4, 5, 6, 7, 8}. A quantidade de bijeções F: A -> A que satisfazem F(1) < F(5) < F(3) e F(7) < F(2) é';
  assert.match(contasDoPedido(t).itens.map(linhaDeItem).join(), /8! ÷ \(3! × 2!\) = 3\.360 de 40\.320/);
  assert.equal(contagemPorOrdem(t).itens[0].valor, 3360);
  assert.equal(contagemPorOrdem('bijeções F de {1,2,3,4} com F(1) < F(2) e F(2) < F(3)').itens[0].valor, 4);   // cadeias que dividem índice: contagem direta
  assert.equal(contagemPorOrdem('quantas bijeções existem em {1,2,3}'), null);
});

test('matemática: leitura de foto com fórmulas não perde as linhas de conta', () => {
  const leitura = 'TEXTO NA IMAGEM:\nQuestão 9. Considere a reta r: 3x + 4y = -15 e a parábola P: y = x^2 + x + 6\nA ( ) 13/500. B ( ) 25/4. C ( ) 105/8. D ( ) 147/8. E ( ) 126/5.\nQuestão 11. Seja A = {1, 2, 3, 4, 5, 6, 7, 8}.\nA ( ) 3360. B ( ) 4200. C ( ) 5040. D ( ) 5880. E ( ) 6720.';
  const r = sanearLeitura(leitura);
  assert.match(r.texto, /3x \+ 4y = -15/); assert.match(r.texto, /3360\. B \( \) 4200/);
});

// Confere de forma independente que os modelos resolvidos do roteiro estão certos.
test('matemática: modelos resolvidos do roteiro conferem numericamente', () => {
  // 1) p(x) = (x-2)^3 + k(x-2), k <= 0: p(0) = -8 - 2k >= -8
  for (const k of [0, -1, -4, -9]) assert.ok(-8 - 2 * k >= -8);
  // 2) tangente de m=-7 em A(-4,18); B(-1,-3); V(-1/2, 23/4); área 147/8
  assert.equal(v('areatri(-4;18;-1;-3;-0.5;5.75)'), 147 / 8);
  assert.ok(Math.abs(v('atan(abs((-7+0.75)/(1+(-7)*(-0.75))))') - 45) < 1e-6);
  // 3) x = pi/6, y = pi/3 resolvem o sistema; produto pi^2/18
  const x = Math.PI / 6, y = Math.PI / 3;
  assert.ok(Math.abs(Math.tan(y) * Math.tan(y / 2) - Math.cos(2 * x) / Math.cos(y)) < 1e-12);
  assert.ok(Math.abs(Math.sin(y) / Math.cos(x) + Math.cos(x) / Math.sin(y) - 2) < 1e-12);
  assert.ok(Math.abs(x * y - Math.PI ** 2 / 18) < 1e-12);
  // 5) tangência externa: q = (sqrt(m^2+1)+1)^2 / m^2 para vários m
  for (const m of [0.5, 1, 2, 3.7]) {
    const s = Math.sqrt(m * m + 1), q = (s + 1) ** 2 / m ** 2, r1 = q, r2 = q * q;
    const d = Math.hypot(r2 - r1, m * r2 - m * r1);
    assert.ok(Math.abs(d - (r1 + r2)) < 1e-9, 'm=' + m); assert.ok(q > 1);
  }
});
