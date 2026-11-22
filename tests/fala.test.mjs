import test from 'node:test';
import assert from 'node:assert/strict';
import { falaTexto, falaDividir, falaResumir } from '../shared/fala.mjs';

const RESPOSTA = `O **CRAS** é a porta de entrada da [Proteção Social Básica](https://www.gov.br/mds).

- Atende famílias do território
- Oferta o PAIF e o SCFV

| Serviço | Sigla |
|---|---|
| Proteção e Atendimento Integral à Família | PAIF |

\`\`\`
const x = 1;
\`\`\`

Fonte: Tipificação Nacional, Resolução CNAS nº 109/2009, art. 6º-C, § 1º
Fonte: LOAS · Lei nº 8.742/1993
Resposta gerada por IA. Confira antes de usar em atendimento.`;

test('fala: tira fontes, aviso de IA, link, código e marcas de Markdown', () => {
  const t = falaTexto(RESPOSTA);
  assert.ok(!/Fonte|gerada por IA|https|const x|\*\*|\||---/.test(t), t);
  assert.ok(t.startsWith('O CRAS é a porta de entrada da Proteção Social Básica.'), t);
  assert.ok(t.includes('Atende famílias do território.'), t);
  assert.ok(t.includes('Serviço, Sigla.') && t.includes('Proteção e Atendimento Integral à Família, PAIF.'), t);
  assert.ok(t.includes('Oferta o PAIF e o ésse cê éfe vê.'), t);
});

test('fala: fontes em lista, tags HTML e emojis não são lidos', () => {
  const t = falaTexto('Resposta curta ✅\n\n<script>alert(1)</script><img src=x onerror=alert(2)>Texto.\n\nFontes:\n- Norma um\n- Norma dois\n\nDepois das fontes.');
  assert.ok(!/script|onerror|alert|Norma|✅/.test(t), t);
  assert.ok(t.startsWith('Resposta curta.'), t);
  assert.ok(t.includes('Depois das fontes.'), t);
});

test('fala: símbolos, números e siglas por extenso', () => {
  const t = falaTexto('Benefício de R$ 1.518,00 e R$ 600,50, 15% do BPC (art. 6º-C, § 1º, nº 109, 3ª edição, p. 88). CPF e NIS.');
  assert.ok(t.startsWith('Benefício de 1.518 reais e 600 reais e 50 centavos,'), t);   // "00" centavos não é falado
  assert.ok(t.includes('15 por cento do bê pê cê'), t);
  assert.ok(t.includes('artigo sexto C, parágrafo primeiro, número 109, terceira edição, página 88'), t);
  assert.ok(t.includes('cê pê éfe e NIS.'), t);
});

test('fala: dinheiro no singular, centavos e valores grandes', () => {
  assert.equal(falaTexto('R$ 1,00'), '1 real.');
  assert.equal(falaTexto('R$ 0,50'), '50 centavos.');
  assert.equal(falaTexto('R$ 2 mil'), '2 mil reais.');
  assert.equal(falaTexto('R$ 1,5 milhão'), '1,5 milhão de reais.');
});

test('fala: datas, horas e siglas sem vogal', () => {
  const t = falaTexto('Atendimento em 01/03/2026 às 14h30, em BV (RR).');
  assert.ok(t.includes('primeiro de março de 2026'), t);
  assert.ok(t.includes('14 horas e 30 minutos'), t);
  assert.ok(t.includes('bê vê (érre érre)'), t);
});

test('fala: CadÚnico, barras e travessões não são lidos como símbolo', () => {
  const t = falaTexto('O CadÚnico — base do Bolsa Família e/ou do BPC — integra CRAS/CREAS. Lei 8.742/1993; leia/escreva → ok.');
  assert.ok(!/[—/→]/.test(t), t);
  assert.ok(t.includes('Cadastro Único, base do Bolsa Família e ou do bê pê cê, integra CRAS e CREAS.'), t);
  assert.ok(t.includes('8.742 de 1993'), t);
  assert.ok(t.includes('leia ou escreva, ok'), t);
});

test('fala: resumo pega as primeiras frases e avisa que o resto está na tela', () => {
  const longo = Array.from({ length: 12 }, (_, i) => 'Esta é a frase número ' + (i + 1) + ' da resposta sobre o território do CRAS.').join(' ');
  const r = falaResumir(longo);
  assert.ok(r.startsWith('Esta é a frase número 1 '), r);
  assert.ok(r.includes('frase número 4 ') && !r.includes('frase número 5 '), r);
  assert.ok(r.endsWith('O restante está na tela.'), r);
  assert.equal(falaResumir('Resposta curta. Só isso.'), 'Resposta curta. Só isso.');
});

test('fala: dividir em trechos curtos cortados no fim da frase', () => {
  const t = 'Primeira frase curta. Segunda frase um pouco maior que a primeira, para encher o trecho. Terceira frase. '.repeat(6).trim();
  const trechos = falaDividir(t, { max: 160, primeiro: 80 });
  assert.ok(trechos.length > 3, String(trechos.length));
  assert.ok(trechos[0].length <= 100, trechos[0]);
  trechos.forEach(function (c) { assert.ok(c.length <= 160, c); assert.ok(/[.!?]$/.test(c), c); });
  assert.equal(trechos.join(' '), t);
});

test('fala: frase gigante sem ponto é quebrada em vírgulas e depois nas palavras', () => {
  const frase = Array.from({ length: 80 }, (_, i) => 'palavra' + i).join(' ') + '.';
  const trechos = falaDividir(frase, { max: 100 });
  assert.ok(trechos.length > 5);
  trechos.forEach(function (c) { assert.ok(c.length <= 100, c); });
  assert.equal(trechos.join(' '), frase);
});

test('fala: entradas estranhas não quebram', () => {
  [null, undefined, '', '   ', 42, {}, '```\nsó código\n```', '| | |\n|-|-|', '\u0000\u0001', 'a'.repeat(50000)].forEach(function (x) {
    assert.equal(typeof falaTexto(x), 'string');
    assert.ok(Array.isArray(falaDividir(falaTexto(x))));
    assert.equal(typeof falaResumir(x), 'string');
  });
  assert.equal(falaTexto('```\nsó código\n```'), '');
  assert.deepEqual(falaDividir(''), []);
});
