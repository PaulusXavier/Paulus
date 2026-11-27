// Amplitude studentizada e post hoc no aparelho: valores conferidos contra scipy 1.18 (studentized_range, tukey_hsd) e cálculo direto.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { juntar } from '../scripts/build.mjs';
import { psiLerTabela } from '../shared/psicometria.mjs';
import { estPTukey, estQTukey } from '../shared/est-nucleo.mjs';
import { estRespostaDoPedido } from '../shared/est-posthoc.mjs';

const CSV = 'grupo;nota\nA;10,0\nA;10,6\nA;9,5\nA;8,2\nA;9,1\nA;8,0\nA;10,1\nA;12,7\nA;9,0\nA;8,8\nA;11,0\nA;10,7\nB;12,8\nB;9,7\nB;12,4\nB;14,6\nB;8,5\nB;11,1\nB;6,8\nB;8,6\nB;7,0\nB;11,8\nB;8,7\nB;13,3\nB;13,0\nB;11,9\nB;4,9\nC;12,3\nC;14,8\nC;15,6\nC;7,3\nC;12,6\nC;10,1\nC;11,0\nC;20,3\nC;11,0';
const tb = psiLerTabela(CSV);
const perto = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, a + ' ≠ ' + b);
const linhaDoPar = (t, par) => t.split('\n').find((l) => l.startsWith('| ' + par));
const ps = (t) => ['A − B', 'A − C', 'B − C'].map((p) => linhaDoPar(t, p).split('|')[5].trim().replace(/[ *]/g, ''));

test('ptukey/qtukey conferem com scipy', () => {
  [[3.5, 3, 20, 0.9441081509182501], [2.0, 4, 10, 0.48103732438762536], [4.5, 5, 60, 0.9810662596080681], [3.0, 6, 5, 0.6007971569553179], [5, 3, 2, 0.8725765973282286], [3.3, 3, 1e6, 0.9486890935818101], [2.5, 3, 1, 0.5249414980486645]]
    .forEach(([q, k, gl, ref]) => perto(estPTukey(q, k, gl), ref, 1e-8));
  perto(estQTukey(0.95, 3, 20), 3.577934725220134, 1e-7);
  perto(estQTukey(0.95, 5, 12), 4.50770991983738, 1e-7);
});

test('Tukey HSD: p e intervalos conferem com scipy.tukey_hsd', () => {
  const r = estRespostaDoPedido('tukey de nota por grupo', tb);
  assert.equal(r.analise, 'posthoc');
  assert.deepEqual(ps(r.texto), [',870', ',048', ',100']);
  assert.match(linhaDoPar(r.texto, 'A − B'), /-3,12 \| 2,05/);
  assert.match(linhaDoPar(r.texto, 'A − C'), /-5,91 \| -0,03/);
  assert.match(r.texto, /Diferenças significativas \(p < ,05\): A − C/);
});

test('Bonferroni e Games-Howell conferem com cálculo de referência', () => {
  assert.deepEqual(ps(estRespostaDoPedido('post hoc bonferroni de nota por grupo', tb).texto), ['1,000', ',056', ',123']);
  assert.deepEqual(ps(estRespostaDoPedido('comparações múltiplas games-howell nota por grupo', tb).texto), [',798', ',109', ',247']);
});

test('não responde ao que não é post hoc e pede o grupo quando falta', () => {
  assert.equal(estRespostaDoPedido('anova de nota por grupo', tb), null);
  assert.equal(estRespostaDoPedido('tukey', null), null);
});

test('módulos entram no bundle do navegador sem colisão de nomes', () => {
  const ctx = { window: {}, self: {}, globalThis: {} }; ctx.window = ctx; vm.createContext(ctx);
  assert.doesNotThrow(() => vm.runInContext(juntar(), ctx));
});
