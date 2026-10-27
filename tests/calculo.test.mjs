import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularExpressao, formatarNumero, arredondarCasas, extrairContas, contasConfiaveis, respostaDeConta, pareceProblemaDeCalculo, numerosDoTexto, temNumeroPorExtenso } from '../shared/calculo.mjs';
import { temDadoPessoal } from '../shared/pii.mjs';

const v = (e, o) => { const r = calcularExpressao(e, o); return r.ok ? (r.bool ? (r.valor ? 'SIM' : 'NAO') : r.valor) : 'ERRO'; };

test('cálculo: precedência, parênteses, potência e sinal', () => {
  assert.equal(v('2+3*4'), 14);
  assert.equal(v('(2+3)*4'), 20);
  assert.equal(v('2^3^2'), 512);
  assert.equal(v('-2^2'), -4);
  assert.equal(v('3 x 164'), 492);
  assert.equal(v('2x(3+4)'), 14);
});

test('cálculo: sem ruído de ponto flutuante', () => {
  assert.equal(v('0.1+0.2'), 0.3);
  assert.equal(v('1/3*3'), 1);
  assert.equal(v('164*3 + 173'), 665);
});

test('cálculo: números do jeito brasileiro e ponto decimal', () => {
  assert.equal(v('1.518,50 + 0,5'), 1519);
  assert.equal(v('1.518'), 1518);
  assert.equal(v('2.5'), 2.5);
  assert.equal(v('0.125'), 0.125);
  assert.equal(v('1.504 * 2', { ponto: 'decimal' }), 3.008);
  assert.equal(v('1.504 * 2'), 3008);
});

test('cálculo: porcentagem como a pessoa lê', () => {
  assert.equal(v('15% * 1200'), 180);
  assert.equal(v('1200 + 15%'), 1380);
  assert.equal(v('1200 - 10%'), 1080);
  assert.equal(v('200 * 10%'), 20);
});

test('cálculo: comparação, funções e resultado de conta anterior', () => {
  assert.equal(v('300 <= 218'), 'NAO');
  assert.equal(v('218 <= 218'), 'SIM');
  assert.equal(v('media(10;20;30)'), 20);
  assert.equal(v('max(3; 5)'), 5);
  assert.equal(v('arred(2.675;2)', { ponto: 'decimal' }), 2.68);
  assert.equal(v('teto(7.2)'), 8);
  assert.equal(v('raiz(81)'), 9);
  assert.equal(v('#1 / 2', { vars: { 1: 10 } }), 5);
  assert.equal(v('#2 / 2', { vars: { 1: 10 } }), 'ERRO');
});

test('cálculo: erro vira erro, não exceção nem travamento nem execução de código', () => {
  for (const e of ['1/0', '2 +', 'raiz(-1)', 'alert(1)', 'constructor', '__proto__', '9^9^9', '2 3', '(1+2', '1 <= 2 <= 3', 'process.exit()', '']) assert.equal(v(e), 'ERRO', e);
  assert.equal(v('('.repeat(500) + '1' + ')'.repeat(500)), 'ERRO');
  assert.equal(v('1+'.repeat(300) + '1'), 'ERRO');
});

test('arredondamento comercial e formatação em português', () => {
  assert.equal(arredondarCasas(1.005, 2), 1.01);
  assert.equal(arredondarCasas(2.5, 0), 3);
  assert.equal(arredondarCasas(-2.5, 0), -3);
  assert.equal(formatarNumero(1234.5), '1.234,5');
  assert.equal(formatarNumero(1234.5, { moeda: true }), 'R$ 1.234,50');
  assert.equal(formatarNumero(800, { moeda: true }), 'R$ 800');
  assert.equal(formatarNumero(21.5072), '21,5072');
  assert.equal(formatarNumero(1 / 3), '≈ 0,3333');
  assert.equal(formatarNumero(-1078), '-1.078');
  assert.equal(formatarNumero(0.00004), '0,00004');
});

test('contas em linguagem natural', () => {
  const casos = [
    ['quanto é 15% de 1200?', '15% de 1.200 = 180'],
    ['(1500 + 800 + 1200) / 4', '(1.500 + 800 + 1.200) ÷ 4 = 875'],
    ['quanto é 1518 - 218 - 164 - 58', '1.518 - 218 - 164 - 58 = 1.078'],
    ['3 x 164', '3 × 164 = 492'],
    ['1200 dividido por 4', '1.200 ÷ 4 = 300'],
    ['soma de 1500, 800 e 1200', '1.500 + 800 + 1.200 = 3.500'],
    ['média de 10, 20 e 30', 'média(10; 20; 30) = 20'],
    ['desconto de 10% em 500', '500 - 10% = 450'],
    ['R$ 1.200 / 4', '1.200 ÷ 4 = R$ 300'],
    ['quanto é 300 > 218?', '300 > 218 → SIM'],
    ['quanto é 2026 - 1990', '2026 - 1990 = 36']
  ];
  for (const [q, esperado] of casos) assert.equal(respostaDeConta(q).texto, esperado, q);
  // reajuste: 143 + 15,04% = 164,5072 (confere com o BRC de R$ 164 do Decreto 13.120/2026)
  assert.equal(respostaDeConta('reajuste de 15,04% sobre 143').itens[0].valor, 164.5072);
});

test('o que NÃO é conta: lei, data, artigo, faixa, horário e pergunta comum', () => {
  for (const q of ['Lei 8.742/1993', '10/05/2026', 'art. 20, § 3º', 'CRAS atende 2 - 3 bairros', 'o que é o BPC?', 'Portaria 1.058/2025, art. 4',
    'crianças de 7 a 12 anos', '10-20', 'CRAS 14 - 18h', 'Decreto nº 12.064/2024']) {
    assert.equal(contasConfiaveis(q), null, q);
    assert.equal(respostaDeConta(q), null, q);
  }
});

test('pergunta com mais assunto não vira resposta direta, mas a conta vai pronta para a IA', () => {
  const q = 'calcule a renda per capita 3200 / 4 da família';
  assert.equal(respostaDeConta(q), null);
  const c = contasConfiaveis(q);
  assert.equal(c.soConta, false);
  assert.equal(c.itens[0].valor, 800);
});

test('detecta pergunta em linguagem natural que pede conta (e só ela)', () => {
  for (const q of ['Quanto recebe uma família de 3 pessoas?', 'renda de três mil reais para quatro pessoas',
    'Família de 4 pessoas com renda R$ 3.200, está dentro do limite de R$ 218?', 'faltou 38 dias de 200']) assert.equal(pareceProblemaDeCalculo(q, []), true, q);
  for (const q of ['o que é CRAS?', 'Qual o valor do BPC em 2026?', 'Quais os prazos do art. 5?', 'como se calcula a renda per capita?']) assert.equal(pareceProblemaDeCalculo(q, []), false, q);
  assert.equal(pareceProblemaDeCalculo('e se forem 5 pessoas?', [{ papel: 'usuario', texto: 'calcule a renda per capita de 3200 para 4' }]), true);
  assert.equal(pareceProblemaDeCalculo('e se forem 5 pessoas?', [{ papel: 'usuario', texto: 'o que é o CRAS?' }]), false);
});

test('números do texto na forma canônica e número por extenso', () => {
  assert.deepEqual([...numerosDoTexto('R$ 1.518,00, 15,04%, 0.500 e 218')].sort(), ['0.5', '15.04', '1518', '218']);
  assert.equal(temNumeroPorExtenso('renda de três mil reais'), true);
  assert.equal(temNumeroPorExtenso('renda de 3000'), false);
});

test('filtro de dados pessoais: conta com operador passa, documento e telefone continuam barrados', () => {
  for (const s of ['quanto é 1518 - 218 - 164 - 58', 'calcule 150 - 50 - 30 - 20 - 10 - 5']) assert.equal(temDadoPessoal(s), false, s);
  for (const s of ['95 - 3623 - 1234', '1518 - 218 - 164 - 58', 'CPF 123.456.789-01 quanto é 1 + 1', 'telefone 95-3623-1234 quanto é',
    'quanto é 12345678901 + 1', 'NIS 12345678901', '123 456 789 01 soma']) assert.equal(temDadoPessoal(s), true, s);
});
