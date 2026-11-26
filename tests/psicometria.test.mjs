// Psicometria no aparelho: valores conferidos contra scipy/numpy (mesma base: tests/dados-psicometria.csv, 120 casos).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { juntar } from '../scripts/build.mjs';
import { psiLerTabela, psiRespostaDoPedido, psiShapiro, psiNormInv, psiChiSf, psiTSf2, psiFSf, psiSemBase } from '../shared/psicometria.mjs';

const csv = readFileSync(new URL('./dados-psicometria.csv', import.meta.url), 'utf8');
const tb = psiLerTabela(csv);
const r = (q) => psiRespostaDoPedido(q, tb);
const perto = (a, b, tol = 0.0006) => assert.ok(Math.abs(a - b) <= tol, a + ' ≠ ' + b);

test('distribuições conferem com valores de referência', () => {
  perto(psiNormInv(0.975), 1.959963985, 1e-8);
  perto(psiTSf2(2.0, 10), 0.0733880, 1e-6);
  perto(psiFSf(3.5, 2, 40), 0.0395, 1e-3);
  perto(psiChiSf(5.991, 2), 0.05, 1e-4);
});

test('lê CSV com ponto e vírgula e vírgula decimal, tipos e ausentes', () => {
  assert.equal(tb.n, 120);
  assert.equal(tb.colunas.find(c => c.nome === 'q1').tipo, 'num');
  assert.equal(tb.colunas.find(c => c.nome === 'sexo').tipo, 'cat');
  const t2 = psiLerTabela('nome,idade,nota\nAna,10,5\nBia,11,7\nCia,12,\nDia,13,9\n');
  assert.ok(!t2.colunas.some(c => c.nome === 'nome'), 'coluna de nome é descartada');
  assert.ok(Number.isNaN(t2.colunas.find(c => c.nome === 'nota').valores[2]));
  assert.equal(psiLerTabela('só texto\nsem tabela'), null);
});

test('Shapiro-Wilk, assimetria e curtose (scipy: W=,9916 p=,6873)', () => {
  const x = tb.colunas.find(c => c.nome === 'q1').valores, sw = psiShapiro(x);
  perto(sw.W, 0.99164, 1e-4); perto(sw.p, 0.68729, 2e-3);
  assert.match(r('descritivas de q1').texto, /0,17 \| -0,21 \| W = ,992, p = ,687/);
});

test('alfa de Cronbach (scipy/fórmula: ,7860) e itens', () => {
  const t = r('alfa de cronbach dos itens q1 a q5').texto;
  assert.match(t, /Alfa de Cronbach \(α\) \| ,786/);
  assert.match(t, /α se o item for excluído/);
});

test('correlações Pearson e Spearman', () => {
  assert.match(r('correlação de pearson entre q1 e q6').texto, /r\(118\) = -,03, p = ,713/);
  assert.match(r('spearman entre q1 e q6').texto, /ρ\(118\) = -,01, p = ,915/);
});

test('teste t (Student, Welch, Levene), Mann-Whitney', () => {
  const t = r('teste t de y por sexo').texto;
  assert.match(t, /-0,833 \| 118 \| ,406/);
  assert.match(t, /-0,822 \| 106,5 \| ,413/);
  assert.match(t, /1,671 \| ,199/);
  assert.match(r('mann-whitney de y por sexo').texto, /U = 1627,5.*p = ,399/);
});

test('ANOVA, Kruskal-Wallis, pareado, Wilcoxon, qui-quadrado', () => {
  assert.match(r('anova de y por grupo').texto, /0,212 \| ,809/);
  assert.match(r('kruskal de y por grupo').texto, /H\(2\) = 0,47, p = ,791/);
  assert.match(r('t pareado entre q1 e q2').texto, /t\(119\) = 1,297, p = ,197/);
  assert.match(r('wilcoxon entre q1 e q2').texto, /p = ,117/);
  assert.match(r('qui-quadrado entre grupo e sexo').texto, /χ²\(2\) = 2,61, p = ,271/);
});

test('regressão linear (numpy: B=,3279 e ,0559; R²=,0363)', () => {
  const t = r('regressão de y em função de q2 e q7').texto;
  assert.match(t, /\| q2 \| 0,328 /); assert.match(t, /\| q7 \| 0,056 /); assert.match(t, /R² \| ,036/);
});

test('análise fatorial: KMO ,762, Bartlett 314,6, autovalores 2,703 e 2,563', () => {
  const t = r('análise fatorial com 2 fatores por eixos principais de q1 a q9').texto;
  assert.match(t, /,762 \(mediano\)/); assert.match(t, /χ²\(36\) = 314,6/); assert.match(t, /2,703/); assert.match(t, /2,563/);
  assert.match(t, /Análise paralela de Horn: 2 fator/);
});

test('pergunta conceitual não é interceptada; sem base, explica como anexar; menu', () => {
  assert.equal(r('o que é alfa de cronbach?'), null);
  assert.equal(r('qual a capital de Roraima?'), null);
  assert.match(psiSemBase('faça o alfa de cronbach dos meus dados'), /CSV/);
  assert.equal(psiSemBase('o que é alfa de cronbach?'), null);
  assert.match(r('o que posso fazer com este arquivo?').texto, /Sua base de dados/);
});

test('no cliente: responde sem IA, sem rede e sem entrar no histórico', async () => {
  let chamadas = 0;
  const sandbox = { self: {}, fetch: async () => { chamadas++; throw new Error('sem rede'); }, TextDecoder, AbortController, setTimeout, clearTimeout, navigator: { onLine: true } };
  vm.runInNewContext(juntar(), sandbox);
  const P = sandbox.self.Paulus;
  const res = await P.perguntar('alfa de cronbach dos itens q1 a q5', { documento: { nome: 'dados.csv', texto: csv } });
  assert.equal(res.tipo, 'psicometria');
  assert.match(res.texto, /,786/);
  assert.equal(chamadas, 0);
  assert.equal(res.pergunta, '');
});
