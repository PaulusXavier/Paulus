import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularExpressao, respostaDeConta } from '../shared/calculo.mjs';
import { resolverDatas } from '../shared/datas.mjs';
import { contasDoPedido, respostaDoPedido, resolverEspecial, linhaDeItem } from '../shared/calculo-mais.mjs';
import { calculosDiretos, valoresDosCalculos } from '../worker/planejar.mjs';
import { calculosComoTexto } from '../worker/prompt.mjs';

const HOJE = Date.UTC(2026, 10, 21) / 86400000; // 21/11/2026, sábado
const v = (e, o) => { const r = calcularExpressao(e, o); return r.ok ? r.valor : 'ERRO'; };
const resp = (q) => { const r = respostaDoPedido(q, { hoje: HOJE }); return r ? r.texto : null; };

test('motor: estatística, combinatória e trigonometria', () => {
  assert.equal(v('mediana(1;3;2;10)'), 2.5);
  assert.equal(v('desviop(2;4;4;4;5;5;7;9)'), 2);
  assert.equal(v('moda(1;2;2;3;3;3)'), 3);
  assert.equal(v('5!'), 120);
  assert.equal(v('comb(10;3)'), 120);
  assert.equal(v('perm(5;2)'), 20);
  assert.equal(v('mdc(12;18)'), 6);
  assert.equal(v('mmc(4;6;10)'), 60);
  assert.equal(v('seno(30)'), 0.5);
  assert.equal(v('seno(180)'), 0);
  assert.equal(v('log(1000)'), 3);
  assert.equal(v('log(8;2)'), 3);
  assert.equal(v('resto(-7;3)'), 2);
  assert.equal(v('quartil(3;1;2;3;4;5;6;7;8)'), 6.25);
  assert.equal(v('ponderada(8;2;6;3)'), 6.8);
  assert.equal(v('parcela(10000;2%;12)'), 945.59596622951);
});

test('motor: casos de erro não viram número', () => {
  assert.equal(v('tangente(90)'), 'ERRO');
  assert.equal(v('18!'), 'ERRO');
  assert.equal(v('moda(1;2;3)'), 'ERRO');
  assert.equal(v('mmc(0;4)'), 'ERRO');
  assert.equal(v('log(-1)'), 'ERRO');
  assert.equal(v('comb(3;5)'), 'ERRO');
});

test('motor: π sempre, "e" só em conta escrita pela IA', () => {
  assert.equal(v('pi*2^2'), 12.566370614359);
  assert.equal(v('ln(e)'), 'ERRO');
  assert.equal(v('ln(e)', { ponto: 'decimal' }), 1);
});

test('frases: listas, frações e funções em português', () => {
  const t = (q) => (respostaDeConta(q) || {}).texto;
  assert.match(t('mediana de 3, 5 e 9'), /= 5$/);
  assert.match(t('mediana de 10, 20, 30, 40'), /= 25$/);
  assert.match(t('soma de 1500, 800, 1200 e 300'), /= 3\.800$/);
  assert.match(t('média ponderada de 8 (peso 2), 6 (peso 3) e 9 (peso 5)'), /= 7,9$/);
  assert.match(t('mdc de 12 e 18'), /= 6$/);
  assert.match(t('fatorial de 5'), /= 120$/);
  assert.match(t('metade de 800'), /= 400$/);
  assert.match(t('um terço de 900'), /= 300$/);
  assert.match(t('3/4 de 200'), /= 150$/);
  assert.match(t('arredonde 3,14159 para 2 casas'), /= 3,14$/);
});

test('frases: lei, data e número solto não viram conta', () => {
  assert.equal(respostaDeConta('Lei 8.742/1993'), null);
  assert.equal(respostaDeConta('quanto é 10/03/2026'), null);
  assert.equal(respostaDeConta('O CRAS atende 200 famílias em 3 bairros'), null);
});

test('datas: diferença, soma, dia da semana e dias úteis', () => {
  const r = (q) => resolverDatas(q, { hoje: HOJE });
  assert.match(r('quantos dias entre 10/03/2026 e 25/11/2026').itens[0].texto, /^260 dias/);
  assert.match(r('30 dias depois de 10/03/2026').itens[0].texto, /^09\/04\/2026 \(quinta-feira\)/);
  assert.match(r('15 dias úteis a partir de 02/12/2026').itens[0].texto, /^23\/12\/2026/);
  assert.match(r('dias úteis entre 01/12/2026 e 31/12/2026').itens[0].texto, /^21 dias úteis/);
  assert.match(r('que dia da semana é 25/12/2026').itens[0].texto, /sexta-feira \(feriado nacional: Natal\)/);
  assert.match(r('31/01/2026 + 1 mês').itens[0].texto, /^28\/02\/2026/);
  assert.match(r('daqui a 90 dias').itens[0].texto, /^19\/02\/2027/);
  assert.match(r('que dia é hoje').itens[0].texto, /^21\/11\/2026 \(sábado\)/);
});

test('datas: Sexta-feira Santa é feriado e data inválida avisa', () => {
  const r = (q) => resolverDatas(q, { hoje: HOJE });
  assert.match(r('que dia da semana é 03/04/2026').itens[0].texto, /Sexta-feira Santa/);
  assert.equal(r('31/02/2026 + 5 dias').itens[0].erro, true);
});

test('datas: idade é sensível e feriado extra tira o "só conta"', () => {
  const i = resolverDatas('idade de quem nasceu em 15/05/1990', { hoje: HOJE });
  assert.equal(i.sensivel, true);
  assert.match(i.itens[0].texto, /^36 anos completos \(36 anos, 6 meses e 6 dias\)/);
  assert.equal(resolverDatas('prazo de 10 dias úteis a partir de 12/11/2026 (feriado 15 e 20)', { hoje: HOJE }).soConta, false);
  assert.equal(resolverDatas('Lei 8.742/1993', { hoje: HOJE }), null);
});

test('cálculos prontos: porcentagem, regra de três e rateio', () => {
  assert.equal(resp('30 é quantos por cento de 120'), 'porcentagem: 30 ÷ 120 × 100 = 25%');
  assert.match(resp('de 80 para 100, qual a variação percentual'), /\+25% \(aumento\)/);
  assert.match(resp('30 é 15% de quanto'), /= 200$/);
  assert.match(resp('com 20% de desconto custa 80, qual o preço original'), /= 100$/);
  assert.match(resp('regra de três: 3 está para 12 assim como 5 está para x'), /= 20$/);
  assert.match(resp('dividir 900 igualmente entre 4'), /= 225 para cada/);
  assert.match(resp('dividir 1000 proporcionalmente a 2, 3 e 5'), /parte 3: .* = 500/);
});

test('cálculos prontos: renda per capita compara com o limite', () => {
  assert.match(resp('renda per capita de R$ 3.200 para 4 pessoas'), /= R\$ 800$/);
  const t = resp('família de 4 pessoas com renda de 1200, 1500 e 300, limite de R$ 218, qual a renda per capita');
  assert.match(t, /renda total: .* = R\$ 3\.000/);
  assert.match(t, /R\$ 750 ≤ R\$ 218 → NÃO/);
  assert.match(resp('renda familiar 654 para 3 pessoas, meio salário mínimo de 1.621'), /R\$ 810,50.*→ SIM/);
});

test('cálculos prontos: frequência, IMC e taxa', () => {
  assert.match(resp('200 dias letivos e 38 faltas, mínimo de 75%'), /ATINGE o mínimo informado, ainda pode faltar 12/);
  assert.match(resp('frequência: 150 presenças em 200 aulas, mínimo 75%'), /no máximo 50 faltas\); ATINGE/);
  assert.match(resp('imc de 70 kg e 1,75 m'), /22,86 kg\/m² \(peso adequado/);
  assert.match(resp('IMC 85 kg 170 cm'), /sobrepeso/);
  assert.match(resp('taxa de 15 casos em 20.000 habitantes por 100 mil'), /= 75 por 100\.000/);
});

test('cálculos prontos: conversões, geometria e juros', () => {
  assert.match(resp('converter 5 km em metros'), /= 5\.000 m$/);
  assert.match(resp('30 graus celsius em fahrenheit'), /= 86 °F$/);
  assert.match(resp('quantos minutos tem 3 horas'), /= 180 minutos$/);
  assert.match(resp('converter 5 kg em metros'), /grandezas diferentes/);
  assert.match(resp('área de um círculo de raio 5'), /78,5398/);
  assert.match(resp('volume de piscina comprimento 8 largura 4 profundidade 1,5'), /= 48$/);
  assert.match(resp('juros compostos de 1000 a 2% ao mês por 12 meses'), /R\$ 1\.268,24/);
  assert.match(resp('financiar 10000 em 12 parcelas a 2% ao mês'), /R\$ 945,60/);
  assert.match(resp('férias com 1/3 sobre salário 2000'), /R\$ 2\.666,67/);
});

test('cálculos prontos: bases, romanos, equações e estatística', () => {
  assert.match(resp('ff hexadecimal para decimal'), /= 255$/);
  assert.match(resp('MMXXVI em número'), /= 2026$/);
  assert.match(resp('2026 em romano'), /= MMXXVI$/);
  assert.match(resp('fatore 360'), /2\^3 × 3\^2 × 5/);
  assert.match(resp('resolva x^2 - 5x + 6 = 0'), /x₁.* = 3\n.*x₂.* = 2/);
  assert.match(resp('resolva 2x + 3 = 11'), /= 4 /);
  assert.match(resp('escore z: 85, média 100, dp 15'), /escore T.* = 40/);
  assert.match(resp('tamanho de amostra com margem de erro 5% e confiança 95%'), /= 385 pessoas/);
  assert.match(resp('das 8h às 17h30 com intervalo de 1h'), /8h30min/);
});

test('cálculos prontos: pergunta com contexto vai para a IA com a conta pronta', () => {
  const q = 'a família tem 4 pessoas e renda de 1200, posso incluir no BPC?';
  assert.equal(respostaDoPedido(q, { hoje: HOJE }), null);
  const r = contasDoPedido(q, { hoje: HOJE });
  assert.equal(r.origem, 'especial');
  assert.equal(r.soConta, false);
  const calc = calculosDiretos(r);
  assert.match(calculosComoTexto(calc), /renda per capita: 1\.200 ÷ 4 = R\$ 300/);
  assert.ok(valoresDosCalculos(calc, [q]).includes('300'));
});

test('cálculos prontos: texto comum não vira conta', () => {
  for (const q of ['Qual o prazo da Lei 8.742/1993?', 'me explica o que é regra de três', 'qual a idade mínima para o BPC?', 'Quero registrar a visita das 8h às 9h',
    'o paciente tem 12 anos, 1,50 m e 40 kg, como fazer o relatório?', 'tenho 30 dias para responder o ofício 123/2026']) {
    assert.equal(respostaDoPedido(q, { hoje: HOJE }), null, q);
  }
  assert.equal(resolverEspecial('o que é o CRAS?'), null);
});

test('linhaDeItem: rótulo, conta e resultado', () => {
  assert.equal(linhaDeItem({ rotulo: 'x', expressao: '2 + 2', texto: '4' }), 'x: 2 + 2 = 4');
  assert.equal(linhaDeItem({ rotulo: '', expressao: '', texto: 'sexta-feira' }), 'sexta-feira');
});
