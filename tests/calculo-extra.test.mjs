import test from 'node:test';
import assert from 'node:assert/strict';
import { contasDoPedido, resolverEspecial, linhaDeItem } from '../shared/calculo-mais.mjs';

const r = (t) => { const x = contasDoPedido(t); return x ? x.itens.map(linhaDeItem).join(' | ') : null; };
const casos = [
  ['valor original de um preço de 1518 após aumento de 7,5%', /≈ 1\.412,093/],
  ['antes do desconto de 20% custava quanto se ficou 160', /= 200\b/],
  ['desconto de 10% e depois 5% em 200 reais', /-14,5%.*\|.*= 171/],
  ['inflação acumulada 4,5% e 3,2%', /7,844%/],
  ['aumento de 10% seguido de desconto de 10% em 1000', /-1%.*= 990/],
  ['progressão aritmética primeiro termo 3 razão 4 décimo termo', /= 39$/],
  ['soma dos 20 primeiros termos de uma PA com a1=2 e r=3', /= 610$/],
  ['PG com a1=2 e q=3, quinto termo', /= 162$/],
  ['quantas combinações de 10 escolhe 3', /= 120 maneiras/],
  ['arranjo de 10 tomados 3 a 3', /= 720 maneiras/],
  ['permutações de 5', /= 120 maneiras/],
  ['probabilidade de cara 3 vezes seguidas', /1\/8 = 0,125 = 12,5%/],
  ['probabilidade 3 favoráveis em 12', /1\/4 = 0,25 = 25%/],
  ['probabilidade de tirar um número maior que 4 em um dado', /1\/3/],
  ['sistema x+y=10 e x-y=2', /= 6 \|.* = 4$/],
  ['2x+3y=12 e x-y=1', /= 3 \|.* = 2$/],
  ['moda de 2,3,3,5,7', /= 3 \(aparece 2 vezes\)/],
  ['amplitude de 4, 9, 15, 2', /= 13$/],
  ['preciso de média 7, tirei 6 e 8, quanto preciso na terceira', /= 7$/],
  ['simplifique 18/24', /= 3\/4/],
  ['1/2 + 1/3', /= 5\/6/],
  ['3/8 em decimal', /= 0,375 = 37,5%/],
  ['0,35 em fração', /= 7\/20$/],
  ['razão entre 12 e 30', /2\/5/],
  ['taxa equivalente mensal de 12% ao ano', /0,9489% ao mês/],
  ['valor presente de 1000 daqui a 12 meses a 1% ao mês', /R\$ 887,45/],
  ['prazo para dobrar capital a 2% ao mês', /35 meses/],
  ['3 pessoas dividem 450 em partes proporcionais a 1, 2 e 3', /= 75 \| .* = 150 \| .* = 225/],
  ['quantas vezes 12 cabe em 100', /= 8 \(sobram 4\)/],
  ['diferença em pontos percentuais entre 12% e 15,5%', /3,5 p\.p\./],
  ['notação científica de 45000', /4,5 × 10\^4/],
  ['raiz cúbica de 27', /= 3$/],
];
for (const [texto, esperado] of casos) test('cálculo extra: ' + texto, () => { const x = r(texto); assert.ok(x && esperado.test(x), String(x)); });

test('cálculo extra: percentual inverso com desconto de 100% avisa em vez de dividir por zero', () => {
  assert.match(r('antes do desconto de 100% custava quanto se ficou 50'), /não existe/);
});
test('cálculo extra: C(n,p) enorme não vira número errado', () => {
  assert.match(r('combinações de 1000 escolhe 500'), /passa de 9 quatrilhões/);
});
test('cálculo extra: pedido financeiro com "daqui a N meses" não vira conta de data', () => {
  assert.ok(!/\d{2}\/\d{2}\/\d{4}/.test(r('valor presente de 1000 daqui a 12 meses a 1% ao mês')));
});
test('cálculo extra: perguntas comuns do SUAS não são sequestradas', () => {
  for (const t of ['o que é o PAIF?', 'o BPC exige renda de 1/4 do salário mínimo?', 'a reunião é dia 10/03 ou 12/03?', 'qual a probabilidade de aprovação do recurso?', 'o grupo tem 12 idosos e 3 faltaram']) {
    assert.equal(resolverEspecial(t), null, t);
  }
});
